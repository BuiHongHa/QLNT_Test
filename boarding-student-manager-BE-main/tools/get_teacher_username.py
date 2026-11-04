import sys
sys.path.append('.')
import mysql.connector

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

try:
    conn = mysql.connector.connect(
        host='127.0.0.1',
        user='root',
        password='SonTrau@0202',
        database='boarding_manager'
    )
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("""
        SELECT a.*, r.name AS role_name
        FROM tAccount a
        JOIN tRole r ON a.role_id = r.id
        WHERE a.username = '017177010001'
    """)
    for row in cursor.fetchall():
        print(row)
        
except Exception as e:
    print("Error:", e)
finally:
    cursor.close()
    conn.close()
