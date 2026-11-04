import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == 'tools' else BASE_DIR
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import get_db_connection
from werkzeug.security import generate_password_hash

def main():
    print("Starting password migration...")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # Lấy tất cả user
    cursor.execute("SELECT username, password FROM tLogin")
    users = cursor.fetchall()
    
    updated_count = 0
    for user in users:
        username = user['username']
        password = user['password']
        
        # Nếu password đã là dạng hash (thường bắt đầu bằng scrypt: hoặc pbkdf2: hoặc độ dài lớn > 50) thì bỏ qua
        if password.startswith('scrypt:') or password.startswith('pbkdf2:') or len(password) > 50:
            print(f"Skipping user {username}, password already hashed.")
            continue
            
        # Mã hóa password
        hashed_password = generate_password_hash(password)
        
        # Update lại db
        update_cursor = conn.cursor()
        update_cursor.execute(
            "UPDATE tLogin SET password = %s WHERE username = %s",
            (hashed_password, username)
        )
        updated_count += 1
        print(f"Hashed password for user {username}")
        update_cursor.close()
        
    conn.commit()
    cursor.close()
    conn.close()
    print(f"Migration completed. Updated {updated_count} passwords.")

if __name__ == '__main__':
    main()
