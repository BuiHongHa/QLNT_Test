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
    
    # Check student Bùi Đức Anh
    cursor.execute("""
        SELECT s.*, c.name AS class_name, c.id AS class_id
        FROM tStudent s
        LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
        LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
        WHERE s.id_VNeID = '037204006345'
    """)
    student = cursor.fetchone()
    print("--- STUDENT INFO ---")
    print(student)
    
    if student and student['class_id']:
        # Check managing teachers for this class
        cursor.execute("""
            SELECT t.*
            FROM tTeacher t
            JOIN MANAGE m ON t.id_VNeID = m.id_teacher AND m.is_active = 1
            WHERE m.id_class = %s
        """, (student['class_id'],))
        teachers = cursor.fetchall()
        print("--- MANAGING TEACHERS ---")
        for t in teachers:
            print(t)
            
except Exception as e:
    print("Error:", e)
finally:
    cursor.close()
    conn.close()
