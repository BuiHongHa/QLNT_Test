import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == 'tools' else BASE_DIR
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import get_db_connection
from werkzeug.security import generate_password_hash

ACCOUNT_BY_ROLE = {
    'student': 'student',
    'teacher': 'teacher',
    'manager': 'manager',
    'dorm_manager': 'dorm_manager',
    'canteen_manager': 'canteen_manager',
}

conn = get_db_connection()
cursor = conn.cursor(dictionary=True)

try:
    for role_name in ACCOUNT_BY_ROLE.keys():
        cursor.execute("SELECT id FROM tRole WHERE name = %s AND is_active = 1", (role_name,))
        role = cursor.fetchone()
        if not role:
            cursor.execute("INSERT INTO tRole (name, is_active) VALUES (%s, 1)", (role_name,))
            conn.commit()
            cursor.execute("SELECT id FROM tRole WHERE name = %s AND is_active = 1", (role_name,))
            role = cursor.fetchone()

        username = ACCOUNT_BY_ROLE[role_name]
        cursor.execute("SELECT username FROM tAccount WHERE username = %s", (username,))
        account = cursor.fetchone()
        if account:
            cursor.execute(
                "UPDATE tAccount SET password = %s, role_id = %s, is_active = 1 WHERE username = %s",
                (generate_password_hash(username), role['id'], username),
            )
            print(f"UPDATED {username} / {role_name}")
        else:
            cursor.execute(
                "INSERT INTO tAccount (username, password, role_id, is_active) VALUES (%s, %s, %s, 1)",
                (username, generate_password_hash(username), role['id']),
            )
            print(f"CREATED {username} / {role_name}")

    conn.commit()
    cursor.execute("SELECT a.username, r.name AS role_name FROM tAccount a JOIN tRole r ON a.role_id = r.id WHERE a.username IN ('student','teacher','manager','dorm_manager','canteen_manager') ORDER BY r.id")
    rows = cursor.fetchall()
    print("---")
    for row in rows:
        print(f"{row['username']} / {row['role_name']}")
finally:
    cursor.close()
    conn.close()
