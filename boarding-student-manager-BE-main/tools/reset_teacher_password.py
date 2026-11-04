import sys
sys.path.append('.')
import mysql.connector
from werkzeug.security import generate_password_hash

try:
    conn = mysql.connector.connect(
        host='127.0.0.1',
        user='root',
        password='SonTrau@0202',
        database='boarding_manager'
    )
    cursor = conn.cursor()
    hashed = generate_password_hash("123456")
    cursor.execute("""
        UPDATE tAccount
        SET password = %s
        WHERE username = '017177010001'
    """, (hashed,))
    conn.commit()
    print("Teacher password updated successfully to '123456'.")
except Exception as e:
    print("Error:", e)
finally:
    cursor.close()
    conn.close()
