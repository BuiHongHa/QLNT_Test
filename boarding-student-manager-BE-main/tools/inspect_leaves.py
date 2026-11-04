import mysql.connector

try:
    conn = mysql.connector.connect(
        host='127.0.0.1',
        user='root',
        password='SonTrau@0202',
        database='boarding_manager'
    )
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT id, id_student, start_time, end_time, teacher_accept, manager_accept 
        FROM tLeaveRequest 
        WHERE is_active = 1 AND leave_type = 'REGULAR_WEEKEND' AND recurring_parent_id IS NULL
    """)
    parents = cursor.fetchall()
    print("--- REGULAR WEEKEND PARENT REQUESTS ---")
    for p in parents:
        print(f"Parent ID: {p['id']}, Student: {p['id_student']}, Start: {p['start_time']}, End: {p['end_time']}, Teacher: {p['teacher_accept']}, Manager: {p['manager_accept']}")
        cursor.execute("""
            SELECT id, start_time, end_time, teacher_accept, manager_accept 
            FROM tLeaveRequest 
            WHERE is_active = 1 AND recurring_parent_id = %s
            ORDER BY start_time ASC
        """, (p['id'],))
        children = cursor.fetchall()
        print(f"  Total weekly instances: {len(children)}")
        # Print a few children around today
        for c in children[:5]:
            print(f"    Child ID: {c['id']}, Start: {c['start_time']}, End: {c['end_time']}, Teacher: {c['teacher_accept']}, Manager: {c['manager_accept']}")
except Exception as e:
    print("Error:", e)
