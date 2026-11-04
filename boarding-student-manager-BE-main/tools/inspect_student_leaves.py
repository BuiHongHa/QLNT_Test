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
    
    # Get teacher accounts
    cursor.execute("""
        SELECT a.*, r.name AS role_name
        FROM tAccount a
        JOIN tRole r ON a.role_id = r.id
        WHERE a.username = '017177010001' OR a.role_id = 1
    """)
    print("--- TEACHER ACCOUNTS ---")
    for row in cursor.fetchall():
        print(row)
        
    # Get leave requests for Bùi Đức Anh
    cursor.execute("""
        SELECT *
        FROM tLeaveRequest
        WHERE id_student = '037204006345' AND is_active = 1
        ORDER BY id DESC
    """)
    print("--- LEAVE REQUESTS FOR BÙI ĐỨC ANH ---")
    for row in cursor.fetchall():
        print(row)
        
except Exception as e:
    print("Error:", e)
finally:
    cursor.close()
    conn.close()
