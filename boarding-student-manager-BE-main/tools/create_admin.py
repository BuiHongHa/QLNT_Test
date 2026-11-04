import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == 'tools' else BASE_DIR
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import get_db_connection
from werkzeug.security import generate_password_hash

def main():
    print("Creating admin account...")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # Check if admin exists
    cursor.execute("SELECT * FROM tAccount WHERE username = 'admin'")
    admin = cursor.fetchone()
    
    if admin:
        print("Admin account already exists.")
    else:
        # role_id = 2 is manager
        hashed_password = generate_password_hash("admin")
        cursor.execute(
            "INSERT INTO tAccount (username, password, role_id) VALUES (%s, %s, %s)",
            ("admin", hashed_password, 2)
        )
        conn.commit()
        print("Admin account created successfully with username 'admin' and password 'admin'.")
        
    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()
