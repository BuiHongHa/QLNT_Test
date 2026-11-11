import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == 'tools' else BASE_DIR
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import get_db_connection


def has_column(cursor, table, column):
    cursor.execute("""
        SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
    """, (table, column))
    return (cursor.fetchone() or {}).get('cnt', 0) > 0


def has_fk(cursor, table, fk_name):
    cursor.execute("""
        SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
          AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = %s
    """, (table, fk_name))
    return (cursor.fetchone() or {}).get('cnt', 0) > 0


def has_table(cursor, table):
    cursor.execute("""
        SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
    """, (table,))
    return (cursor.fetchone() or {}).get('cnt', 0) > 0


def add_fk_if_missing(cursor, table, fk_name, sql):
    if not has_fk(cursor, table, fk_name):
        cursor.execute(sql)
        print(f"  [+] Added FK {fk_name} on {table}")


def migrate():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        print("1. Normalizing collation across tables to utf8mb4_unicode_ci...")
        for tbl in (
            'tClass', 'tDormAttendance', 'tInspectionCriteria',
            'tInspectionViolation', 'tRoomAdminRequest', 'tRoomChangeRequest',
            'tRoomInspection', 'tWeeklyMenu'
        ):
            if has_table(cursor, tbl):
                cursor.execute(f"ALTER TABLE `{tbl}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        conn.commit()

        print("2. Removing duplicate/redundant/transitive columns (1NF/2NF/3NF)...")
        # 2a. tAccount: keep only password_hash, drop password
        if has_column(cursor, 'tAccount', 'password'):
            cursor.execute("""
                UPDATE tAccount
                SET password_hash = COALESCE(password_hash, password)
                WHERE password_hash IS NULL AND password IS NOT NULL
            """)
            cursor.execute("ALTER TABLE tAccount MODIFY COLUMN password_hash VARCHAR(255) NOT NULL")
            cursor.execute("ALTER TABLE tAccount DROP COLUMN password")
            print("  [-] Dropped redundant tAccount.password (kept password_hash)")

        # 2b. tClass: drop redundant id_teacher (normalized via MANAGE)
        if has_column(cursor, 'tClass', 'id_teacher'):
            cursor.execute("ALTER TABLE tClass DROP COLUMN id_teacher")
            print("  [-] Dropped redundant tClass.id_teacher (normalized via MANAGE)")

        # 2c. tTeacher: drop derived column is_home_teacher (derived from MANAGE)
        if has_column(cursor, 'tTeacher', 'is_home_teacher'):
            cursor.execute("ALTER TABLE tTeacher DROP COLUMN is_home_teacher")
            print("  [-] Dropped derived tTeacher.is_home_teacher (computed from MANAGE)")

        # 2d. tLeaveRequest: drop transitive column created_by_role (derived via created_by -> tAccount -> tRole)
        if has_column(cursor, 'tLeaveRequest', 'created_by_role'):
            cursor.execute("ALTER TABLE tLeaveRequest DROP COLUMN created_by_role")
            print("  [-] Dropped transitive tLeaveRequest.created_by_role (derived via tAccount -> tRole)")

        # 2e. tWeeklyMenu: align created_by to CHAR(12) and nullify orphan usernames
        cursor.execute("""
            UPDATE tWeeklyMenu
            SET created_by = NULL
            WHERE created_by IS NOT NULL
              AND created_by NOT IN (SELECT username FROM tAccount)
        """)
        cursor.execute("ALTER TABLE tWeeklyMenu MODIFY COLUMN created_by CHAR(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL")
        conn.commit()

        print("3. Splitting polymorphic tWeeklySummary into tWeeklyRoomSummary & tWeeklyClassSummary (3NF)...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tWeeklyRoomSummary (
                id INT AUTO_INCREMENT PRIMARY KEY,
                week_start DATE NOT NULL,
                id_dormroom VARCHAR(20) NOT NULL,
                total_penalty DECIMAL(6,1) NOT NULL DEFAULT 0.0,
                total_violations INT NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_week_room (week_start, id_dormroom),
                CONSTRAINT fk_wrs_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON UPDATE CASCADE ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tWeeklyClassSummary (
                id INT AUTO_INCREMENT PRIMARY KEY,
                week_start DATE NOT NULL,
                id_class VARCHAR(50) NOT NULL,
                total_penalty DECIMAL(6,1) NOT NULL DEFAULT 0.0,
                total_violations INT NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_week_class (week_start, id_class),
                CONSTRAINT fk_wcs_class FOREIGN KEY (id_class) REFERENCES tClass(id) ON UPDATE CASCADE ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        if has_table(cursor, 'tWeeklySummary'):
            cursor.execute("""
                INSERT IGNORE INTO tWeeklyRoomSummary (week_start, id_dormroom, total_penalty, total_violations, created_at)
                SELECT ws.week_start, ws.ref_id, ws.total_penalty, ws.total_violations, ws.created_at
                FROM tWeeklySummary ws
                JOIN tDormroom d ON ws.ref_id = d.id
                WHERE ws.summary_type = 'ROOM'
            """)
            cursor.execute("""
                INSERT IGNORE INTO tWeeklyClassSummary (week_start, id_class, total_penalty, total_violations, created_at)
                SELECT ws.week_start, c.id, ws.total_penalty, ws.total_violations, ws.created_at
                FROM tWeeklySummary ws
                JOIN tClass c ON (ws.ref_id = c.id OR ws.ref_id = c.name)
                WHERE ws.summary_type = 'CLASS'
            """)
            cursor.execute("DROP TABLE tWeeklySummary")
            print("  [+] Migrated and dropped polymorphic tWeeklySummary")
        conn.commit()

        print("4. Cleaning any orphan actors before enforcing Foreign Keys...")
        cursor.execute("DELETE FROM tPasswordResetToken WHERE username NOT IN (SELECT username FROM tAccount)")
        cursor.execute("UPDATE tLeaveRequest SET created_by = NULL WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT username FROM tAccount)")
        cursor.execute("UPDATE tLeaveRequest SET decided_by = NULL WHERE decided_by IS NOT NULL AND decided_by NOT IN (SELECT username FROM tAccount)")
        cursor.execute("UPDATE tDormAttendance SET recorded_by = NULL WHERE recorded_by IS NOT NULL AND recorded_by NOT IN (SELECT username FROM tAccount)")
        cursor.execute("UPDATE tRoomInspection SET inspected_by = NULL WHERE inspected_by IS NOT NULL AND inspected_by NOT IN (SELECT username FROM tAccount)")
        conn.commit()

        print("5. Adding missing Foreign Key constraints on all tables...")
        add_fk_if_missing(cursor, 'tPasswordResetToken', 'fk_prt_account',
                          "ALTER TABLE tPasswordResetToken ADD CONSTRAINT fk_prt_account FOREIGN KEY (username) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE CASCADE")
        add_fk_if_missing(cursor, 'tLeaveRequest', 'fk_leave_created_by',
                          "ALTER TABLE tLeaveRequest ADD CONSTRAINT fk_leave_created_by FOREIGN KEY (created_by) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE SET NULL")
        add_fk_if_missing(cursor, 'tLeaveRequest', 'fk_leave_decided_by',
                          "ALTER TABLE tLeaveRequest ADD CONSTRAINT fk_leave_decided_by FOREIGN KEY (decided_by) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE SET NULL")
        add_fk_if_missing(cursor, 'tRoomChangeRequest', 'fk_rcr_teacher',
                          "ALTER TABLE tRoomChangeRequest ADD CONSTRAINT fk_rcr_teacher FOREIGN KEY (id_teacher) REFERENCES tTeacher(id_VNeID) ON UPDATE CASCADE ON DELETE CASCADE")
        add_fk_if_missing(cursor, 'tRoomChangeRequest', 'fk_rcr_student',
                          "ALTER TABLE tRoomChangeRequest ADD CONSTRAINT fk_rcr_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON UPDATE CASCADE ON DELETE CASCADE")
        add_fk_if_missing(cursor, 'tRoomChangeRequest', 'fk_rcr_room',
                          "ALTER TABLE tRoomChangeRequest ADD CONSTRAINT fk_rcr_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON UPDATE CASCADE ON DELETE CASCADE")
        add_fk_if_missing(cursor, 'tRoomAdminRequest', 'fk_rar_teacher',
                          "ALTER TABLE tRoomAdminRequest ADD CONSTRAINT fk_rar_teacher FOREIGN KEY (id_teacher) REFERENCES tTeacher(id_VNeID) ON UPDATE CASCADE ON DELETE CASCADE")
        add_fk_if_missing(cursor, 'tRoomAdminRequest', 'fk_rar_room',
                          "ALTER TABLE tRoomAdminRequest ADD CONSTRAINT fk_rar_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON UPDATE CASCADE ON DELETE CASCADE")
        add_fk_if_missing(cursor, 'tDormAttendance', 'fk_att_room',
                          "ALTER TABLE tDormAttendance ADD CONSTRAINT fk_att_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON UPDATE CASCADE ON DELETE RESTRICT")
        add_fk_if_missing(cursor, 'tDormAttendance', 'fk_att_student',
                          "ALTER TABLE tDormAttendance ADD CONSTRAINT fk_att_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON UPDATE CASCADE ON DELETE RESTRICT")
        add_fk_if_missing(cursor, 'tDormAttendance', 'fk_att_recorder',
                          "ALTER TABLE tDormAttendance ADD CONSTRAINT fk_att_recorder FOREIGN KEY (recorded_by) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE SET NULL")
        add_fk_if_missing(cursor, 'tRoomInspection', 'fk_insp_room',
                          "ALTER TABLE tRoomInspection ADD CONSTRAINT fk_insp_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON UPDATE CASCADE ON DELETE RESTRICT")
        add_fk_if_missing(cursor, 'tRoomInspection', 'fk_insp_user',
                          "ALTER TABLE tRoomInspection ADD CONSTRAINT fk_insp_user FOREIGN KEY (inspected_by) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE SET NULL")
        add_fk_if_missing(cursor, 'tInspectionViolation', 'fk_viol_insp',
                          "ALTER TABLE tInspectionViolation ADD CONSTRAINT fk_viol_insp FOREIGN KEY (inspection_id) REFERENCES tRoomInspection(id) ON DELETE CASCADE")
        add_fk_if_missing(cursor, 'tInspectionViolation', 'fk_viol_crit',
                          "ALTER TABLE tInspectionViolation ADD CONSTRAINT fk_viol_crit FOREIGN KEY (criteria_id) REFERENCES tInspectionCriteria(id) ON DELETE RESTRICT")
        add_fk_if_missing(cursor, 'tInspectionViolation', 'fk_viol_stu',
                          "ALTER TABLE tInspectionViolation ADD CONSTRAINT fk_viol_stu FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON UPDATE CASCADE ON DELETE SET NULL")
        add_fk_if_missing(cursor, 'tWeeklyMenu', 'fk_menu_creator',
                          "ALTER TABLE tWeeklyMenu ADD CONSTRAINT fk_menu_creator FOREIGN KEY (created_by) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE SET NULL")
        conn.commit()

        print("6. Verifying Foreign Key Graph across all tables...")
        cursor.execute("""
            SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY TABLE_NAME, CONSTRAINT_NAME
        """)
        for row in cursor.fetchall():
            print(f"  {row['TABLE_NAME']}.{row['COLUMN_NAME']} -> {row['REFERENCED_TABLE_NAME']}.{row['REFERENCED_COLUMN_NAME']} ({row['CONSTRAINT_NAME']})")

        print("3NF Migration completed successfully!")
    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    migrate()
