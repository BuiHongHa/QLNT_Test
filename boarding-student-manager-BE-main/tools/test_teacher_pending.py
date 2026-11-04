import sys
sys.path.append('.')
import mysql.connector
from datetime import datetime, date
from api.dashboard import dashboard_pending_leave_select, is_pending_leave_actionable, current_weekend_window, get_today, get_now

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
    
    today = get_today()
    now = get_now()
    current_start, current_end = current_weekend_window(today)
    
    # Class IDs for teacher 017177010001
    cursor.execute("""
        SELECT c.id
        FROM tClass c
        JOIN MANAGE m ON m.id_class = c.id
        WHERE m.id_teacher = %s AND m.is_active = 1 AND c.is_active = 1
    """, ('017177010001',))
    class_ids = [row['id'] for row in cursor.fetchall()]
    print("Class IDs managed by teacher:", class_ids)
    
    if class_ids:
        placeholders = ','.join(['%s'] * len(class_ids))
        cursor.execute(f"""
            {dashboard_pending_leave_select()}
            WHERE lr.is_active = 1
              AND st.id_class IN ({placeholders})
              AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NULL)
        """, [current_start, current_end] + class_ids)
        
        all_rows = cursor.fetchall()
        print("Total rows returned from query:", len(all_rows))
        for row in all_rows:
            is_act = is_pending_leave_actionable(row, 'teacher', now)
            print(f"Row ID: {row['id']}, leave_type: {row['leave_type']}, Student: {row['student_name']}, Actionable for teacher: {is_act}")
            print(f"  teacher_accept: {row['teacher_accept']}, manager_accept: {row['manager_accept']}")
            print(f"  current_week_teacher_accept: {row.get('current_week_teacher_accept')}, current_week_manager_accept: {row.get('current_week_manager_accept')}")
            
except Exception as e:
    print("Error:", e)
finally:
    cursor.close()
    conn.close()
