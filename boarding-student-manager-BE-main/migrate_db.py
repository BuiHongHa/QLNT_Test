import mysql.connector
import os
from dotenv import load_dotenv

# Load env variables
load_dotenv()

def migrate():
    print("Starting database migration...")
    conn = mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'boarding_manager')
    )
    cursor = conn.cursor()

    # 1. Add email to tTeacher
    try:
        cursor.execute("ALTER TABLE tTeacher ADD COLUMN email VARCHAR(100) NULL AFTER phone_number")
        print("Added email column to tTeacher successfully.")
    except mysql.connector.Error as err:
        if err.errno == 1060: # Duplicate column name
            print("Column email already exists in tTeacher.")
        else:
            print(f"Error adding email to tTeacher: {err}")

    # 2. Add email to tStudent
    try:
        cursor.execute("ALTER TABLE tStudent ADD COLUMN email VARCHAR(100) NULL AFTER phone_number")
        print("Added email column to tStudent successfully.")
    except mysql.connector.Error as err:
        if err.errno == 1060: # Duplicate column name
            print("Column email already exists in tStudent.")
        else:
            print(f"Error adding email to tStudent: {err}")

    # 3. Add must_change_password to tAccount
    try:
        cursor.execute("ALTER TABLE tAccount ADD COLUMN must_change_password TINYINT NOT NULL DEFAULT 0")
        print("Added must_change_password column to tAccount successfully.")
    except mysql.connector.Error as err:
        if err.errno == 1060: # Duplicate column name
            print("Column must_change_password already exists in tAccount.")
        else:
            print(f"Error adding must_change_password to tAccount: {err}")

    # 4. Create tPasswordResetToken table
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tPasswordResetToken (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username CHAR(12) NOT NULL,
                token CHAR(64) NOT NULL UNIQUE,
                expires_at DATETIME NOT NULL,
                used TINYINT NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_token (token),
                INDEX idx_expires (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)
        print("tPasswordResetToken table created/verified successfully.")
    except mysql.connector.Error as err:
        print(f"Error creating tPasswordResetToken table: {err}")

    conn.commit()
    cursor.close()
    conn.close()
    print("Migration finished.")

if __name__ == "__main__":
    migrate()
