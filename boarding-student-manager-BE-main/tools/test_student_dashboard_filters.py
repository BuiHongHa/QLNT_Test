import mysql.connector
from datetime import datetime, date, timedelta
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config import get_db_connection
from mock_time import get_today, get_now
from api.dashboard import get_week_range, format_approval_status

def test_queries():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # 1. Find a student
    cursor.execute("SELECT id_VNeID FROM tStudent WHERE is_active = 1 LIMIT 1")
    student = cursor.fetchone()
    if not student:
        print("No active student found in DB")
        return
    username = student['id_VNeID']
    print(f"Testing with student: {username}")
    
    today = get_today()
    now = get_now()
    monday, sunday = get_week_range(today)
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    week_start = datetime.combine(monday, datetime.min.time())
    week_end = datetime.combine(sunday, datetime.max.time())
    
    # Insert temporary AFTER_SCHOOL request for today
    print("\nInserting mock AFTER_SCHOOL for today...")
    cursor.execute("""
        INSERT INTO tLeaveRequest (id_student, leave_type, start_time, end_time, reason, teacher_accept, manager_accept, is_active)
        VALUES (%s, 'AFTER_SCHOOL', %s, %s, 'Test after school today', 'ACCEPTED', 'PENDING', 1)
    """, (username, today_start + timedelta(hours=16), today_start + timedelta(hours=19, minutes=30)))
    after_school_id = cursor.lastrowid
    
    # Insert temporary EMERGENCY request for this week
    print("Inserting mock EMERGENCY for this week...")
    cursor.execute("""
        INSERT INTO tLeaveRequest (id_student, leave_type, start_time, end_time, reason, teacher_accept, manager_accept, is_active)
        VALUES (%s, 'EMERGENCY', %s, %s, 'Test emergency this week', 'PENDING', 'PENDING', 1)
    """, (username, week_start + timedelta(days=2), week_start + timedelta(days=4)))
    emergency_id = cursor.lastrowid
    
    # Insert old EMERGENCY request (outside this week) to verify it's excluded
    print("Inserting mock old EMERGENCY (should be excluded)...")
    cursor.execute("""
        INSERT INTO tLeaveRequest (id_student, leave_type, start_time, end_time, reason, teacher_accept, manager_accept, is_active)
        VALUES (%s, 'EMERGENCY', %s, %s, 'Test old emergency', 'ACCEPTED', 'ACCEPTED', 1)
    """, (username, week_start - timedelta(days=5), week_start - timedelta(days=3)))
    old_emergency_id = cursor.lastrowid

    try:
        # Query AFTER_SCHOOL (trong ngày)
        cursor.execute("""
            SELECT id, leave_type, start_time, end_time, teacher_accept, manager_accept, created_at
            FROM tLeaveRequest
            WHERE is_active = 1
              AND id_student = %s
              AND leave_type = 'AFTER_SCHOOL'
              AND start_time >= %s AND start_time <= %s
            ORDER BY created_at DESC
            LIMIT 1
        """, (username, today_start, today_end))
        after_school_row = cursor.fetchone()
        print("AFTER_SCHOOL row today query result:", after_school_row)
        if after_school_row:
            status = format_approval_status(after_school_row['teacher_accept'], after_school_row['manager_accept'])
            print("Formatted status:", status)
            assert after_school_row['id'] == after_school_id, "Should find the newly inserted today's AFTER_SCHOOL request"
        else:
            print("ERROR: Today's AFTER_SCHOOL request not found!")
            
        # Query EMERGENCY (trong tuần)
        cursor.execute("""
            SELECT id, leave_type, start_time, end_time, teacher_accept, manager_accept, created_at
            FROM tLeaveRequest
            WHERE is_active = 1
              AND id_student = %s
              AND leave_type = 'EMERGENCY'
              AND start_time >= %s AND start_time <= %s
            ORDER BY created_at DESC
            LIMIT 1
        """, (username, week_start, week_end))
        emergency_row = cursor.fetchone()
        print("EMERGENCY row this week query result:", emergency_row)
        if emergency_row:
            status = format_approval_status(emergency_row['teacher_accept'], emergency_row['manager_accept'])
            print("Formatted status:", status)
            assert emergency_row['id'] == emergency_id, "Should find the newly inserted this week's EMERGENCY request"
        else:
            print("ERROR: This week's EMERGENCY request not found!")
            
        # Query EMERGENCY (for an old week - should be None or old one if we change timeframe, but with current filters it must NOT find the one from this week)
        cursor.execute("""
            SELECT id, leave_type, start_time, end_time, teacher_accept, manager_accept, created_at
            FROM tLeaveRequest
            WHERE is_active = 1
              AND id_student = %s
              AND leave_type = 'EMERGENCY'
              AND start_time >= %s AND start_time <= %s
            ORDER BY created_at DESC
            LIMIT 1
        """, (username, week_start - timedelta(days=10), week_start - timedelta(days=1)))
        old_week_emergency_row = cursor.fetchone()
        print("EMERGENCY row old week query result (expected old_emergency_id):", old_week_emergency_row)
        if old_week_emergency_row:
            assert old_week_emergency_row['id'] == old_emergency_id, "Should find old emergency request in its own week timeframe"
        
        print("\nAll assertions passed successfully!")
    finally:
        # Clean up
        print("Cleaning up mock requests...")
        cursor.execute("DELETE FROM tLeaveRequest WHERE id IN (%s, %s, %s)", (after_school_id, emergency_id, old_emergency_id))
        conn.commit()
        cursor.close()
        conn.close()

if __name__ == '__main__':
    test_queries()
