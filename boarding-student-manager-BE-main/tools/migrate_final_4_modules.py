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


ROLE_DESCRIPTIONS = {
    'student': 'Học sinh nội trú - Xem thẻ, tạo đơn nghỉ phép, xem lỗi vi phạm và báo cơm',
    'teacher': 'Giáo viên chủ nhiệm - Quản lý lớp học, duyệt đơn nghỉ phép cấp 1, theo dõi KTX và nhà ăn',
    'manager': 'Ban Giám Hiệu - Toàn quyền quản trị hệ thống và phê duyệt tối hậu',
    'dorm_manager': 'Quản lý Ký túc xá - Quản lý phòng ở, điểm danh phòng, chấm điểm nề nếp KTX và duyệt đơn ra ngoài',
    'canteen_manager': 'Quản lý Nhà ăn - Chấm cơm, lập thực đơn tuần và thống kê suất ăn',
}


def migrate():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        print("1. Dropping access management tables (tAccessLog, tCamera)...")
        cursor.execute("DROP TABLE IF EXISTS tAccessLog")
        cursor.execute("DROP TABLE IF EXISTS tCamera")
        conn.commit()

        print("2. Normalizing 5 official roles and removing guard/guardian roles...")
        for role_name, desc in ROLE_DESCRIPTIONS.items():
            cursor.execute("SELECT id FROM tRole WHERE name = %s", (role_name,))
            row = cursor.fetchone()
            if not row:
                cursor.execute(
                    "INSERT INTO tRole (name, description, is_active) VALUES (%s, %s, 1)",
                    (role_name, desc),
                )
            else:
                cursor.execute(
                    "UPDATE tRole SET description = %s, is_active = 1 WHERE id = %s",
                    (desc, row['id']),
                )
        conn.commit()

        cursor.execute("SELECT id FROM tRole WHERE name = 'dorm_manager'")
        dorm_role_id = cursor.fetchone()['id']

        cursor.execute("SELECT id, name FROM tRole WHERE name IN ('guard', 'guardian')")
        for old in cursor.fetchall():
            cursor.execute("UPDATE tAccount SET role_id = %s WHERE role_id = %s", (dorm_role_id, old['id']))
            cursor.execute("DELETE FROM tRole WHERE id = %s", (old['id'],))
            print(f"  [-] Removed deprecated role: {old['name']} (id={old['id']})")
        conn.commit()

        print("3. Cleaning legacy access-log meal cut notes if any...")
        cursor.execute("""
            UPDATE tMealAttendance
            SET is_cut = 0, note = NULL
            WHERE note LIKE '%lịch sử ra vào%' AND reason_leave_id IS NULL
        """)
        conn.commit()

        print("4. Verifying current tables and roles:")
        cursor.execute("SHOW TABLES")
        tables = [list(r.values())[0] for r in cursor.fetchall()]
        print("  Tables:", tables)

        cursor.execute("SELECT id, name, description, is_active FROM tRole ORDER BY id")
        for r in cursor.fetchall():
            print(f"  - Role {r['id']}: {r['name']} (active={r['is_active']}) -> {r['description']}")

        print("Migration finished successfully!")
    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    migrate()
