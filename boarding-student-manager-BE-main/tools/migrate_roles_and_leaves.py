import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == 'tools' else BASE_DIR
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import get_db_connection

def migrate():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        print("1. Updating roles in tRole...")
        roles = ['manager', 'teacher', 'student', 'dorm_manager', 'canteen_manager']
        for r in roles:
            cursor.execute("SELECT id FROM tRole WHERE name = %s", (r,))
            if not cursor.fetchone():
                cursor.execute("INSERT INTO tRole (name, is_active) VALUES (%s, 1)", (r,))
                print(f"  [+] Created role: {r}")

        conn.commit()

        cursor.execute("SELECT id FROM tRole WHERE name = 'dorm_manager'")
        dorm_role_id = cursor.fetchone()['id']

        cursor.execute("SELECT id FROM tRole WHERE name IN ('guard', 'guardian')")
        old_guard_roles = cursor.fetchall()
        for old in old_guard_roles:
            old_id = old['id']
            cursor.execute("UPDATE tAccount SET role_id = %s WHERE role_id = %s", (dorm_role_id, old_id))
            print(f"  [+] Reassigned accounts from role {old_id} to {dorm_role_id}")
            cursor.execute("DELETE FROM tRole WHERE id = %s", (old_id,))
            print(f"  [+] Removed old guard role {old_id}")

        conn.commit()

        print("2. Checking tLeaveRequest columns...")
        cursor.execute("""
            SELECT COUNT(*) AS cnt
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tLeaveRequest'
              AND COLUMN_NAME = 'dorm_manager_accept'
        """)
        if cursor.fetchone()['cnt'] == 0:
            cursor.execute("ALTER TABLE tLeaveRequest ADD COLUMN dorm_manager_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING'")
            print("  [+] Added column dorm_manager_accept to tLeaveRequest")

        cursor.execute("""
            UPDATE tLeaveRequest
            SET dorm_manager_accept = manager_accept
            WHERE leave_type = 'AFTER_SCHOOL'
              AND dorm_manager_accept = 'PENDING'
              AND manager_accept IN ('ACCEPTED', 'DENIED')
        """)
        cursor.execute("""
            UPDATE tLeaveRequest
            SET teacher_accept = 'NOT_REQUIRED', manager_accept = 'NOT_REQUIRED'
            WHERE leave_type = 'AFTER_SCHOOL' AND teacher_accept = 'PENDING' AND manager_accept = 'PENDING'
        """)
        cursor.execute("""
            UPDATE tLeaveRequest
            SET teacher_accept = 'NOT_REQUIRED', dorm_manager_accept = 'NOT_REQUIRED'
            WHERE leave_type = 'EMERGENCY' AND teacher_accept = 'PENDING' AND dorm_manager_accept = 'PENDING'
        """)
        cursor.execute("""
            UPDATE tLeaveRequest
            SET dorm_manager_accept = 'NOT_REQUIRED'
            WHERE leave_type = 'REGULAR_WEEKEND' AND dorm_manager_accept = 'PENDING'
        """)
        conn.commit()

        print("3. Verifying tRole table:")
        cursor.execute("SELECT id, name, is_active FROM tRole ORDER BY id")
        for row in cursor.fetchall():
            print(f"  - Role ID {row['id']}: {row['name']} (active={row['is_active']})")

        print("4. Migration complete!")
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    migrate()
