import sys
sys.path.append('.')
import mysql.connector
from datetime import datetime, date, time
from mock_time import get_today, get_now

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Mocking parts of leave logic
def leave_status_with_overdue(teacher_accept, manager_accept, end_time, now=None):
    # simple mock matching BE logic
    teacher_accept = (teacher_accept or 'PENDING').strip().upper()
    manager_accept = (manager_accept or 'PENDING').strip().upper()
    if teacher_accept == 'DENIED' or manager_accept == 'DENIED':
        return 'DENIED'
    if teacher_accept == 'ACCEPTED' and manager_accept == 'ACCEPTED':
        return 'ACCEPTED'
    if end_time and now > end_time:
        return 'OVERDUE'
    return 'PENDING'

def is_pending_leave_actionable(row, role_name, now=None):
    now = now or get_now()
    if row.get('leave_type') == 'REGULAR_WEEKEND':
        # Check if the parent registration itself is pending approval
        parent_status = leave_status_with_overdue(
            row.get('teacher_accept'),
            row.get('manager_accept'),
            row.get('end_time'),
            now
        )
        if parent_status == 'PENDING':
            relevant_approval = row.get('manager_accept') if role_name == 'manager' else row.get('teacher_accept')
            return (relevant_approval or 'PENDING') == 'PENDING'

        # If parent registration is already approved, check if the current week's instance is pending
        if parent_status == 'ACCEPTED':
            weekly_status = leave_status_with_overdue(
                row.get('current_week_teacher_accept'),
                row.get('current_week_manager_accept'),
                row.get('current_week_end_time') or row.get('end_time'),
                now
            )
            if weekly_status == 'PENDING':
                relevant_weekly_approval = row.get('current_week_manager_accept') if role_name == 'manager' else row.get('teacher_accept')
                return (relevant_weekly_approval or 'PENDING') == 'PENDING'
        return False
    else:
        # Non-recurring: standard checks
        relevant_approval = row.get('manager_accept') if role_name == 'manager' else row.get('teacher_accept')
        if (relevant_approval or 'PENDING') != 'PENDING':
            return False
        return leave_status_with_overdue(
            row.get('teacher_accept'),
            row.get('manager_accept'),
            row.get('end_time'),
            now
        ) == 'PENDING'

try:
    conn = mysql.connector.connect(
        host='127.0.0.1',
        user='root',
        password='SonTrau@0202',
        database='boarding_manager'
    )
    cursor = conn.cursor(dictionary=True)
    
    # Let's mock today/now as in the system
    today = date(2026, 6, 18) # Thursday
    now = datetime(2026, 6, 18, 2, 30, 10)
    
    # Compute current weekend window
    current_start = datetime(2026, 6, 19, 16, 0, 0)
    current_end = datetime(2026, 6, 21, 23, 59, 59)
    
    # Class IDs for teacher 017177010001
    cursor.execute("""
        SELECT c.id FROM tClass c
        JOIN MANAGE m ON m.id_class = c.id
        WHERE m.id_teacher = %s AND m.is_active = 1 AND c.is_active = 1
    """, ('017177010001',))
    class_ids = [row['id'] for row in cursor.fetchall()]
    print("Class IDs:", class_ids)
    
    placeholders = ','.join(['%s'] * len(class_ids))
    
    sql = f"""
        SELECT
            lr.id,
            lr.id_student,
            lr.leave_type,
            lr.start_time,
            lr.end_time,
            lr.reason,
            lr.teacher_accept,
            lr.manager_accept,
            lr.recurring_parent_id,
            s.name AS student_name,
            c.name AS class_name,
            d.name AS room_name,
            week.teacher_accept AS current_week_teacher_accept,
            week.manager_accept AS current_week_manager_accept,
            week.end_time AS current_week_end_time
        FROM tLeaveRequest lr
        JOIN tStudent s ON lr.id_student = s.id_VNeID
        LEFT JOIN STUDY st ON st.id_student = s.id_VNeID AND st.is_active = 1
        LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
        LEFT JOIN LIVING l ON l.id_student = s.id_VNeID AND l.is_active = 1
        LEFT JOIN tDormroom d ON l.id_dormroom = d.id AND d.is_active = 1
        LEFT JOIN tLeaveRequest week
          ON week.recurring_parent_id = lr.id
         AND week.start_time = %s
         AND week.end_time = %s
         AND week.is_active = 1
        WHERE lr.is_active = 1
          AND st.id_class IN ({placeholders})
          AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NULL)
    """
    
    params = [current_start, current_end] + class_ids
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    
    print(f"Total rows fetched: {len(rows)}")
    for r in rows:
        actionable = is_pending_leave_actionable(r, 'teacher', now)
        print(f"ID: {r['id']}, Student: {r['student_name']}, Type: {r['leave_type']}, Teacher Accept: {r['teacher_accept']}, Manager Accept: {r['manager_accept']}, Week Teacher Accept: {r['current_week_teacher_accept']}, Actionable: {actionable}")

except Exception as e:
    print("Error:", e)
