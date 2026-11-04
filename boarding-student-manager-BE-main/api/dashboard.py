from flask import Blueprint, request, jsonify
from config import get_db_connection
from mock_time import get_today, get_now
from datetime import datetime, date, timedelta
from api.leave import ensure_leave_schema, sync_regular_weekends, leave_status_with_overdue, current_weekend_window

dashboard_bp = Blueprint('dashboard', __name__)


def normalize_role(role_name):
    role = (role_name or '').strip().lower()
    if role in ('guard', 'guardian'):
        return 'dorm_manager'
    return role


def format_approval_status(teacher_accept, manager_accept):
    if teacher_accept == 'DENIED' or manager_accept == 'DENIED':
        return 'Bị từ chối'
    if teacher_accept == 'ACCEPTED' and manager_accept == 'ACCEPTED':
        return 'Được duyệt'
    if teacher_accept == 'PENDING':
        return 'Chờ giáo viên duyệt'
    if teacher_accept == 'ACCEPTED' and manager_accept == 'PENDING':
        return 'Chờ quản lý duyệt'
    return 'Đang chờ duyệt'


def dashboard_leave_detail_select():
    return """
        SELECT
            lr.id,
            lr.id_student,
            s.name AS student_name,
            lr.leave_type,
            lr.start_time,
            lr.end_time,
            lr.reason,
            lr.teacher_accept,
            lr.manager_accept,
            c.name AS class_name,
            d.name AS room_name
        FROM tLeaveRequest lr
        JOIN tStudent s ON lr.id_student = s.id_VNeID
        LEFT JOIN STUDY st ON st.id_student = s.id_VNeID AND st.is_active = 1
        LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
        LEFT JOIN LIVING l ON l.id_student = s.id_VNeID AND l.is_active = 1
        LEFT JOIN tDormroom d ON l.id_dormroom = d.id AND d.is_active = 1
    """


def dashboard_pending_leave_select():
    return """
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
    """


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
                relevant_weekly_approval = row.get('current_week_manager_accept') if role_name == 'manager' else row.get('current_week_teacher_accept')
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


def get_overdue_students(cursor, role_name, username, now):
    role_name = normalize_role(role_name)
    where_clause = ""
    params = [now]

    if role_name == 'teacher':
        where_clause = """
            AND st.id_class IN (
                SELECT c.id
                FROM tClass c
                JOIN MANAGE m ON m.id_class = c.id
                WHERE m.id_teacher = %s
                  AND m.is_active = 1
                  AND c.is_active = 1
            )
        """
        params.append(username)

    sql = f"""
        SELECT DISTINCT 
            s.id_VNeID AS id, 
            s.name, 
            c.name AS class_name, 
            d.name AS room_name, 
            lr.leave_type, 
            lr.end_time, 
            last_out.access_time AS exit_time
        FROM tStudent s
        JOIN (
            SELECT id_student, access_time
            FROM tAccessLog a
            WHERE a.type = 'OUT'
              AND a.id = (
                  SELECT MAX(id)
                  FROM tAccessLog
                  WHERE id_student = a.id_student
                    AND type IN ('IN', 'OUT')
              )
        ) last_out ON s.id_VNeID = last_out.id_student
        JOIN tLeaveRequest lr ON lr.id_student = s.id_VNeID
        LEFT JOIN STUDY st ON st.id_student = s.id_VNeID AND st.is_active = 1
        LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
        LEFT JOIN LIVING l ON l.id_student = s.id_VNeID AND l.is_active = 1
        LEFT JOIN tDormroom d ON l.id_dormroom = d.id AND d.is_active = 1
        WHERE s.is_active = 1
          AND lr.is_active = 1
          AND (
            (lr.leave_type = 'AFTER_SCHOOL' AND lr.dorm_manager_accept = 'ACCEPTED')
            OR (lr.leave_type = 'EMERGENCY' AND lr.manager_accept = 'ACCEPTED')
            OR (lr.leave_type = 'REGULAR_WEEKEND' AND lr.recurring_parent_id IS NOT NULL AND lr.teacher_accept = 'ACCEPTED' AND lr.manager_accept = 'ACCEPTED')
          )
          AND lr.end_time < %s
          AND last_out.access_time >= lr.start_time
          AND last_out.access_time <= lr.end_time
          {where_clause}
        ORDER BY lr.end_time ASC
    """
    cursor.execute(sql, params)
    return cursor.fetchall()


def get_week_range(today=None):
    """Trả về (monday, sunday) của tuần chứa ngày today."""
    today = today or get_today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def dashboard_access_detail_select():
    return """
        SELECT
            a.id,
            a.id_student,
            s.name AS student_name,
            c.name AS class_name,
            d.name AS room_name,
            a.access_time,
            a.type,
            a.note
        FROM tAccessLog a
        JOIN tStudent s ON a.id_student = s.id_VNeID
        LEFT JOIN STUDY st ON st.id_student = s.id_VNeID AND st.is_active = 1
        LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
        LEFT JOIN LIVING l ON l.id_student = s.id_VNeID AND l.is_active = 1
        LEFT JOIN tDormroom d ON l.id_dormroom = d.id AND d.is_active = 1
    """


@dashboard_bp.route('/stats', methods=['GET'])
def get_dashboard_stats():
    username = request.args.get('username', '')
    role_name = normalize_role(request.args.get('role_name', ''))

    if role_name not in ('manager', 'teacher', 'student', 'dorm_manager', 'canteen_manager'):
        return jsonify({"success": False, "message": "Không hỗ trợ role này"}), 403

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_leave_schema(cursor)
        sync_regular_weekends(cursor)
        conn.commit()
        today = get_today()
        now = get_now()
        monday, sunday = get_week_range(today)
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        week_start = datetime.combine(monday, datetime.min.time())
        week_end = datetime.combine(sunday, datetime.max.time())

        result = {}

        if role_name == 'manager':
            # Tổng học sinh đăng ký nội trú
            cursor.execute("SELECT COUNT(*) AS cnt FROM tStudent WHERE is_active = 1")
            result['total_students'] = (cursor.fetchone() or {}).get('cnt', 0)

            # Số học sinh đăng ký nghỉ phép trong tuần
            cursor.execute("""
                SELECT COUNT(*) AS cnt
                FROM tLeaveRequest lr
                WHERE lr.is_active = 1
                  AND lr.start_time <= %s
                  AND lr.end_time >= %s
                  AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NOT NULL)
                  
                  AND lr.manager_accept = 'ACCEPTED'
                  AND lr.teacher_accept = 'ACCEPTED'
            """, (
                datetime.combine(sunday, datetime.max.time()),
                datetime.combine(monday, datetime.min.time())
            ))
            result['leave_requests_this_week'] = (cursor.fetchone() or {}).get('cnt', 0)

            # Số phiếu đã duyệt (manager_accept = ACCEPTED)
            cursor.execute("""
                SELECT COUNT(*) AS cnt
                FROM tLeaveRequest
                WHERE is_active = 1
                  AND manager_accept = 'ACCEPTED'
                  AND (leave_type <> 'REGULAR_WEEKEND' OR recurring_parent_id IS NULL)
            """)
            result['approved_leaves'] = (cursor.fetchone() or {}).get('cnt', 0)

            # Số đăng ký phép thường xuyên trong tuần hiện tại (bản ghi con)
            cursor.execute("""
                SELECT COUNT(*) AS cnt
                FROM tLeaveRequest lr
                WHERE is_active = 1
                  AND leave_type = 'REGULAR_WEEKEND'
                  AND recurring_parent_id IS NOT NULL
                  AND start_time >= %s
                  AND end_time <= %s
                  
                  AND lr.manager_accept = 'ACCEPTED'
                  AND lr.teacher_accept = 'ACCEPTED'
            """, (datetime.combine(monday, datetime.min.time()), datetime.combine(sunday, datetime.max.time())))
            result['regular_leave_requests'] = (cursor.fetchone() or {}).get('cnt', 0)

            # Số phiếu cần duyệt (manager_accept = PENDING)
            current_start, current_end = current_weekend_window(today)
            cursor.execute(f"""
                {dashboard_pending_leave_select()}
                WHERE lr.is_active = 1
                  AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NULL)
                  AND lr.manager_accept = 'PENDING'
            """, (current_start, current_end))
            result['pending_leaves'] = len([row for row in cursor.fetchall() if is_pending_leave_actionable(row, 'manager', now)])

            # Số học sinh ra ngoài trong ngày — theo loại
            cursor.execute("""
                SELECT lr.leave_type, COUNT(DISTINCT lr.id_student) AS cnt
                FROM tLeaveRequest lr
                LEFT JOIN tLeaveRequest week
                  ON week.recurring_parent_id = lr.id
                 AND week.is_active = 1
                 AND week.start_time <= %s AND week.end_time >= %s
                WHERE lr.is_active = 1
                  AND (
                    (lr.leave_type <> 'REGULAR_WEEKEND'
                     AND lr.start_time <= %s AND lr.end_time >= %s
                     AND lr.teacher_accept = 'ACCEPTED' AND lr.manager_accept = 'ACCEPTED')
                    OR
                    (lr.leave_type = 'REGULAR_WEEKEND'
                     AND lr.recurring_parent_id IS NULL
                     AND week.teacher_accept = 'ACCEPTED' AND week.manager_accept = 'ACCEPTED')
                  )
                GROUP BY lr.leave_type
            """, (now, now, now, now))
            outside_by_type = {
                'AFTER_SCHOOL': 0,
                'EMERGENCY': 0,
                'REGULAR_WEEKEND': 0
            }
            for row in cursor.fetchall():
                if row['leave_type'] in outside_by_type:
                    outside_by_type[row['leave_type']] = row['cnt']
            result['students_outside_today'] = outside_by_type
            result['students_outside_total'] = sum(outside_by_type.values())

        elif role_name == 'teacher':
            # Lấy danh sách lớp mà giáo viên quản lý
            cursor.execute("""
                SELECT c.id, c.name
                FROM tClass c
                JOIN MANAGE m ON m.id_class = c.id
                WHERE m.id_teacher = %s AND m.is_active = 1 AND c.is_active = 1
            """, (username,))
            teacher_classes = cursor.fetchall()
            class_ids = [c['id'] for c in teacher_classes]

            if not class_ids:
                result['leave_requests_after_school'] = 0
                result['leave_requests_emergency'] = 0
                result['pending_leaves'] = 0
                result['students_outside_today'] = {'AFTER_SCHOOL': 0, 'EMERGENCY': 0, 'REGULAR_WEEKEND': 0}
                result['students_outside_total'] = 0
            else:
                placeholders = ','.join(['%s'] * len(class_ids))

                # Số học sinh trong lớp đăng ký nghỉ sau giờ học
                cursor.execute(f"""
                    SELECT COUNT(DISTINCT lr.id_student) AS cnt
                    FROM tLeaveRequest lr
                    JOIN STUDY st ON st.id_student = lr.id_student AND st.is_active = 1
                    WHERE lr.is_active = 1
                      AND lr.leave_type = 'AFTER_SCHOOL'
                      AND st.id_class IN ({placeholders})
                      AND lr.start_time <= %s AND lr.end_time >= %s
                """, class_ids + [now, now])
                result['leave_requests_after_school'] = (cursor.fetchone() or {}).get('cnt', 0)

                # Số học sinh trong lớp đăng ký nghỉ đột xuất
                cursor.execute(f"""
                    SELECT COUNT(DISTINCT lr.id_student) AS cnt
                    FROM tLeaveRequest lr
                    JOIN STUDY st ON st.id_student = lr.id_student AND st.is_active = 1
                    WHERE lr.is_active = 1
                      AND lr.leave_type = 'EMERGENCY'
                      AND st.id_class IN ({placeholders})
                      AND lr.start_time <= %s AND lr.end_time >= %s
                """, class_ids + [now, now])
                result['leave_requests_emergency'] = (cursor.fetchone() or {}).get('cnt', 0)

                # Số học sinh trong lớp đăng ký phép thường xuyên trong tuần hiện tại (bản ghi con)
                cursor.execute(f"""
                    SELECT COUNT(DISTINCT lr.id_student) AS cnt
                    FROM tLeaveRequest lr
                    JOIN STUDY st ON st.id_student = lr.id_student AND st.is_active = 1
                    WHERE lr.is_active = 1
                      AND lr.leave_type = 'REGULAR_WEEKEND'
                      AND lr.recurring_parent_id IS NOT NULL
                      AND lr.start_time >= %s
                      AND lr.end_time <= %s
                      AND st.id_class IN ({placeholders})
                      
                      AND lr.manager_accept = 'ACCEPTED'
                      AND lr.teacher_accept = 'ACCEPTED'
                """, [datetime.combine(monday, datetime.min.time()), datetime.combine(sunday, datetime.max.time())] + class_ids)
                result['regular_leave_requests'] = (cursor.fetchone() or {}).get('cnt', 0)

                # Số phiếu cần duyệt (teacher_accept = PENDING)
                current_start, current_end = current_weekend_window(today)
                cursor.execute(f"""
                    {dashboard_pending_leave_select()}
                    WHERE lr.is_active = 1
                      AND st.id_class IN ({placeholders})
                      AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NULL)
                """, [current_start, current_end] + class_ids)
                result['pending_leaves'] = len([row for row in cursor.fetchall() if is_pending_leave_actionable(row, 'teacher', now)])

                # Số học sinh ra ngoài trong ngày — theo loại
                cursor.execute(f"""
                    SELECT lr.leave_type, COUNT(DISTINCT lr.id_student) AS cnt
                    FROM tLeaveRequest lr
                    JOIN STUDY st ON st.id_student = lr.id_student AND st.is_active = 1
                    LEFT JOIN tLeaveRequest week
                      ON week.recurring_parent_id = lr.id
                     AND week.is_active = 1
                     AND week.start_time <= %s AND week.end_time >= %s
                    WHERE lr.is_active = 1
                      AND st.id_class IN ({placeholders})
                      AND (
                        (lr.leave_type <> 'REGULAR_WEEKEND'
                         AND lr.start_time <= %s AND lr.end_time >= %s
                         AND lr.teacher_accept = 'ACCEPTED' AND lr.manager_accept = 'ACCEPTED')
                        OR
                        (lr.leave_type = 'REGULAR_WEEKEND'
                         AND lr.recurring_parent_id IS NULL
                         AND week.teacher_accept = 'ACCEPTED' AND week.manager_accept = 'ACCEPTED')
                      )
                    GROUP BY lr.leave_type
                """, [now, now] + class_ids + [now, now])
                outside_by_type = {'AFTER_SCHOOL': 0, 'EMERGENCY': 0, 'REGULAR_WEEKEND': 0}
                for row in cursor.fetchall():
                    if row['leave_type'] in outside_by_type:
                        outside_by_type[row['leave_type']] = row['cnt']
                result['students_outside_today'] = outside_by_type
                result['students_outside_total'] = sum(outside_by_type.values())


        elif role_name == 'student':
            # Số phiếu đã đăng ký trong tuần
            cursor.execute("""
                SELECT COUNT(*) AS cnt
                FROM tLeaveRequest
                WHERE is_active = 1
                  AND id_student = %s
                  AND start_time <= %s
                  AND end_time >= %s
                  AND (leave_type <> 'REGULAR_WEEKEND' OR recurring_parent_id IS NOT NULL)
            """, (username, datetime.combine(sunday, datetime.max.time()), datetime.combine(monday, datetime.min.time())))
            result['leave_requests_this_week'] = (cursor.fetchone() or {}).get('cnt', 0)

            # Số phiếu đã đăng ký trong ngày
            cursor.execute("""
                SELECT COUNT(*) AS cnt
                FROM tLeaveRequest
                WHERE is_active = 1
                  AND id_student = %s
                  AND start_time <= %s
                  AND end_time >= %s
                  AND (leave_type <> 'REGULAR_WEEKEND' OR recurring_parent_id IS NOT NULL)
            """, (username, today_end, today_start))
            result['leave_requests_today'] = (cursor.fetchone() or {}).get('cnt', 0)

            # Số phiếu chưa duyệt trong tuần
            cursor.execute("""
                SELECT COUNT(*) AS cnt
                FROM tLeaveRequest
                WHERE is_active = 1
                  AND id_student = %s
                  AND start_time <= %s
                  AND end_time >= %s
                  AND (teacher_accept = 'PENDING' OR manager_accept = 'PENDING')
                  AND teacher_accept <> 'DENIED'
                  AND manager_accept <> 'DENIED'
                  AND (leave_type <> 'REGULAR_WEEKEND' OR recurring_parent_id IS NOT NULL)
            """, (username, datetime.combine(sunday, datetime.max.time()), datetime.combine(monday, datetime.min.time())))
            result['pending_leaves_this_week'] = (cursor.fetchone() or {}).get('cnt', 0)

            # Trạng thái đơn ra ngoài sau giờ học (trong ngày)
            cursor.execute("""
                SELECT teacher_accept, manager_accept
                FROM tLeaveRequest
                WHERE is_active = 1
                  AND id_student = %s
                  AND leave_type = 'AFTER_SCHOOL'
                  AND start_time >= %s AND start_time <= %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (username, today_start, today_end))
            after_school_row = cursor.fetchone()
            if after_school_row:
                result['after_school_status'] = format_approval_status(
                    after_school_row.get('teacher_accept'),
                    after_school_row.get('manager_accept'),
                )
            else:
                result['after_school_status'] = None

            # Trạng thái đơn nghỉ đột xuất (trong tuần)
            cursor.execute("""
                SELECT teacher_accept, manager_accept
                FROM tLeaveRequest
                WHERE is_active = 1
                  AND id_student = %s
                  AND leave_type = 'EMERGENCY'
                  AND start_time >= %s AND start_time <= %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (username, week_start, week_end))
            emergency_row = cursor.fetchone()
            if emergency_row:
                result['emergency_status'] = format_approval_status(
                    emergency_row.get('teacher_accept'),
                    emergency_row.get('manager_accept'),
                )
            else:
                result['emergency_status'] = None

            # Trạng thái về phép thường xuyên (nếu học sinh có đăng ký)
            cursor.execute("""
                SELECT id, teacher_accept, manager_accept
                FROM tLeaveRequest
                WHERE is_active = 1
                  AND id_student = %s
                  AND leave_type = 'REGULAR_WEEKEND'
                  AND recurring_parent_id IS NULL
                ORDER BY created_at DESC LIMIT 1
            """, (username,))
            regular_leave = cursor.fetchone()
            if not regular_leave:
                result['regular_leave_status'] = 'Chưa đăng ký'
            else:
                if regular_leave['teacher_accept'] == 'DENIED' or regular_leave['manager_accept'] == 'DENIED':
                    result['regular_leave_status'] = 'Đăng ký bị từ chối'
                elif regular_leave['teacher_accept'] == 'ACCEPTED' and regular_leave['manager_accept'] == 'ACCEPTED':
                    cursor.execute("""
                        SELECT teacher_accept, manager_accept
                        FROM tLeaveRequest
                        WHERE recurring_parent_id = %s
                          AND start_time >= %s AND start_time <= %s
                          AND is_active = 1
                        LIMIT 1
                    """, (regular_leave['id'], datetime.combine(monday, datetime.min.time()), datetime.combine(sunday, datetime.max.time())))
                    week_leave = cursor.fetchone()
                    if week_leave:
                        if week_leave['teacher_accept'] == 'DENIED' or week_leave['manager_accept'] == 'DENIED':
                            result['regular_leave_status'] = 'Bị từ chối tuần này'
                        elif week_leave['teacher_accept'] == 'ACCEPTED' and week_leave['manager_accept'] == 'ACCEPTED':
                            result['regular_leave_status'] = 'Được duyệt tuần này'
                        else:
                            result['regular_leave_status'] = 'Chờ duyệt tuần này'
                    else:
                        result['regular_leave_status'] = 'Chờ duyệt tuần này'
                else:
                    result['regular_leave_status'] = 'Đang chờ duyệt đăng ký'

        elif role_name == 'dorm_manager':
            for access_type, prefix in (('OUT', 'out'), ('IN', 'in')):
                cursor.execute("""
                    SELECT COUNT(*) AS cnt
                    FROM tAccessLog
                    WHERE type = %s AND access_time BETWEEN %s AND %s
                """, (access_type, today_start, today_end))
                result[f'{prefix}_today'] = (cursor.fetchone() or {}).get('cnt', 0)

                cursor.execute("""
                    SELECT COUNT(*) AS cnt
                    FROM tAccessLog
                    WHERE type = %s AND access_time BETWEEN %s AND %s
                """, (access_type, week_start, week_end))
                result[f'{prefix}_week'] = (cursor.fetchone() or {}).get('cnt', 0)

            cursor.execute("""
                SELECT COUNT(*) AS cnt
                FROM tAccessLog
                WHERE type IN ('IN', 'OUT')
                  AND note LIKE %s
                  AND access_time BETWEEN %s AND %s
            """, ('%trái dự đoán%', today_start, today_end))
            result['abnormal_today'] = (cursor.fetchone() or {}).get('cnt', 0)

            cursor.execute("""
                SELECT COUNT(*) AS cnt
                FROM tAccessLog
                WHERE type IN ('IN', 'OUT')
                  AND note LIKE %s
                  AND access_time BETWEEN %s AND %s
            """, ('%trái dự đoán%', week_start, week_end))
            result['abnormal_week'] = (cursor.fetchone() or {}).get('cnt', 0)

            cursor.execute("SELECT COUNT(*) AS cnt FROM tDormroom WHERE is_active = 1")
            result['total_rooms'] = (cursor.fetchone() or {}).get('cnt', 0)
            cursor.execute("SELECT COUNT(DISTINCT id_student) AS cnt FROM LIVING WHERE is_active = 1")
            result['dorm_students'] = (cursor.fetchone() or {}).get('cnt', 0)

            cursor.execute("""
                SELECT COUNT(*) AS cnt FROM tLeaveRequest
                WHERE is_active = 1 AND leave_type = 'AFTER_SCHOOL' AND dorm_manager_accept = 'PENDING'
            """)
            result['pending_after_school'] = (cursor.fetchone() or {}).get('cnt', 0)

        elif role_name == 'canteen_manager':
            cursor.execute("SELECT COUNT(*) AS cnt FROM tStudent WHERE is_active = 1")
            total_students = (cursor.fetchone() or {}).get('cnt', 0)
            result['total_students'] = total_students

            cursor.execute("""
                SELECT COUNT(*) AS cnt FROM tMealAttendance
                WHERE meal_date = %s AND meal_type = 'LUNCH' AND is_cut = 1
            """, (today,))
            lunch_cut = (cursor.fetchone() or {}).get('cnt', 0)
            result['lunch_cut_today'] = lunch_cut
            result['lunch_served_today'] = max(0, total_students - lunch_cut)

            cursor.execute("""
                SELECT COUNT(*) AS cnt FROM tMealAttendance
                WHERE meal_date = %s AND meal_type = 'DINNER' AND is_cut = 1
            """, (today,))
            dinner_cut = (cursor.fetchone() or {}).get('cnt', 0)
            result['dinner_cut_today'] = dinner_cut
            result['dinner_served_today'] = max(0, total_students - dinner_cut)

        if role_name in ('manager', 'teacher', 'dorm_manager'):
            result['overdue_students_count'] = len(get_overdue_students(cursor, role_name, username, now))

        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dashboard_bp.route('/details', methods=['GET'])
def get_dashboard_details():
    type = request.args.get('type')
    username = request.args.get('username', '')
    role_name = normalize_role(request.args.get('role_name', ''))
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_leave_schema(cursor)
        sync_regular_weekends(cursor)
        conn.commit()
        today = get_today()
        now = get_now()
        monday, sunday = get_week_range(today)
        
        rows = []

        if type == 'total_students' and role_name == 'manager':
            cursor.execute("""
                SELECT
                    tStudent.id_VNeID AS id,
                    tStudent.name,
                    tClass.name AS class_name,
                    tDormroom.name AS room_name
                FROM tStudent
                LEFT JOIN STUDY ON tStudent.id_VNeID = STUDY.id_student AND STUDY.is_active = 1
                LEFT JOIN tClass ON STUDY.id_class = tClass.id AND tClass.is_active = 1
                LEFT JOIN LIVING ON tStudent.id_VNeID = LIVING.id_student AND LIVING.is_active = 1
                LEFT JOIN tDormroom ON LIVING.id_dormroom = tDormroom.id AND tDormroom.is_active = 1
                WHERE tStudent.is_active = 1
                ORDER BY tStudent.name
            """)
            rows = cursor.fetchall()

        elif type == 'leave_requests_this_week' and role_name == 'manager':
            cursor.execute(f"""
                {dashboard_leave_detail_select()}
                WHERE lr.is_active = 1
                  AND lr.start_time <= %s
                  AND lr.end_time >= %s
                  AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NOT NULL)
                  
                  AND lr.manager_accept = 'ACCEPTED'
                  AND lr.teacher_accept = 'ACCEPTED'
                ORDER BY lr.start_time DESC, lr.end_time DESC
            """, (datetime.combine(sunday, datetime.max.time()), datetime.combine(monday, datetime.min.time())))
            rows = cursor.fetchall()

        elif type == 'approved_leaves' and role_name == 'manager':
            cursor.execute(f"""
                {dashboard_leave_detail_select()}
                WHERE lr.is_active = 1
                  AND lr.manager_accept = 'ACCEPTED'
                  AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NULL)
                ORDER BY lr.start_time DESC
            """)
            rows = cursor.fetchall()

        elif type == 'pending_leaves' and role_name == 'manager':
            current_start, current_end = current_weekend_window(today)
            cursor.execute(f"""
                {dashboard_pending_leave_select()}
                WHERE lr.is_active = 1
                  AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NULL)
                ORDER BY lr.created_at DESC
            """, (current_start, current_end))
            rows = [row for row in cursor.fetchall() if is_pending_leave_actionable(row, 'manager', now)]

        elif type == 'regular_leave_requests' and role_name == 'manager':
            cursor.execute(f"""
                {dashboard_leave_detail_select()}
                WHERE lr.is_active = 1
                  AND lr.leave_type = 'REGULAR_WEEKEND'
                  AND lr.recurring_parent_id IS NOT NULL
                  AND lr.start_time >= %s
                  AND lr.end_time <= %s
                  AND lr.manager_accept = 'ACCEPTED'
                  AND lr.teacher_accept = 'ACCEPTED'
                ORDER BY lr.start_time DESC
            """, (datetime.combine(monday, datetime.min.time()), datetime.combine(sunday, datetime.max.time())))
            rows = cursor.fetchall()

        elif type in ('leave_requests_after_school', 'leave_requests_emergency', 'pending_leaves', 'regular_leave_requests') and role_name == 'teacher':
            cursor.execute("""
                SELECT c.id
                FROM tClass c
                JOIN MANAGE m ON m.id_class = c.id
                WHERE m.id_teacher = %s AND m.is_active = 1 AND c.is_active = 1
            """, (username,))
            class_ids = [row['id'] for row in cursor.fetchall()]

            if class_ids:
                placeholders = ','.join(['%s'] * len(class_ids))

                if type == 'leave_requests_after_school':
                    cursor.execute(f"""
                        SELECT
                            lr.id,
                            lr.id_student,
                            s.name AS student_name,
                            lr.leave_type,
                            lr.start_time,
                            lr.end_time,
                            lr.reason,
                            c.name AS class_name,
                            d.name AS room_name
                        FROM tLeaveRequest lr
                        JOIN tStudent s ON lr.id_student = s.id_VNeID
                        JOIN STUDY st ON st.id_student = lr.id_student AND st.is_active = 1
                        JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
                        LEFT JOIN LIVING l ON l.id_student = s.id_VNeID AND l.is_active = 1
                        LEFT JOIN tDormroom d ON l.id_dormroom = d.id AND d.is_active = 1
                        WHERE lr.is_active = 1
                          AND lr.leave_type = 'AFTER_SCHOOL'
                          AND st.id_class IN ({placeholders})
                          AND lr.start_time <= %s AND lr.end_time >= %s
                        ORDER BY lr.start_time DESC
                    """, class_ids + [now, now])
                    rows = cursor.fetchall()

                elif type == 'leave_requests_emergency':
                    cursor.execute(f"""
                        SELECT
                            lr.id,
                            lr.id_student,
                            s.name AS student_name,
                            lr.leave_type,
                            lr.start_time,
                            lr.end_time,
                            lr.reason,
                            c.name AS class_name,
                            d.name AS room_name
                        FROM tLeaveRequest lr
                        JOIN tStudent s ON lr.id_student = s.id_VNeID
                        JOIN STUDY st ON st.id_student = lr.id_student AND st.is_active = 1
                        JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
                        LEFT JOIN LIVING l ON l.id_student = s.id_VNeID AND l.is_active = 1
                        LEFT JOIN tDormroom d ON l.id_dormroom = d.id AND d.is_active = 1
                        WHERE lr.is_active = 1
                          AND lr.leave_type = 'EMERGENCY'
                          AND st.id_class IN ({placeholders})
                          AND lr.start_time <= %s AND lr.end_time >= %s
                        ORDER BY lr.start_time DESC
                    """, class_ids + [now, now])
                    rows = cursor.fetchall()

                elif type == 'regular_leave_requests':
                    cursor.execute(f"""
                        SELECT
                            lr.id,
                            lr.id_student,
                            s.name AS student_name,
                            lr.leave_type,
                            lr.start_time,
                            lr.end_time,
                            lr.reason,
                            c.name AS class_name,
                            d.name AS room_name
                        FROM tLeaveRequest lr
                        JOIN tStudent s ON lr.id_student = s.id_VNeID
                        JOIN STUDY st ON st.id_student = lr.id_student AND st.is_active = 1
                        JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
                        LEFT JOIN LIVING l ON l.id_student = s.id_VNeID AND l.is_active = 1
                        LEFT JOIN tDormroom d ON l.id_dormroom = d.id AND d.is_active = 1
                        WHERE lr.is_active = 1
                          AND lr.leave_type = 'REGULAR_WEEKEND'
                          AND lr.recurring_parent_id IS NOT NULL
                          AND lr.start_time >= %s
                          AND lr.end_time <= %s
                          AND st.id_class IN ({placeholders})
                          
                          AND lr.manager_accept = 'ACCEPTED'
                          AND lr.teacher_accept = 'ACCEPTED'
                        ORDER BY lr.start_time DESC
                    """, [datetime.combine(monday, datetime.min.time()), datetime.combine(sunday, datetime.max.time())] + class_ids)
                    rows = cursor.fetchall()

                elif type == 'pending_leaves':
                    current_start, current_end = current_weekend_window(today)
                    cursor.execute(f"""
                        {dashboard_pending_leave_select()}
                        WHERE lr.is_active = 1
                          AND st.id_class IN ({placeholders})
                          AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NULL)
                        ORDER BY lr.created_at DESC
                    """, [current_start, current_end] + class_ids)
                    rows = [row for row in cursor.fetchall() if is_pending_leave_actionable(row, 'teacher', now)]

        elif type in ('outside_today_after_school', 'outside_today_emergency', 'outside_today_regular_weekend') and role_name in ('manager', 'teacher'):
            leave_type_map = {
                'outside_today_after_school': 'AFTER_SCHOOL',
                'outside_today_emergency': 'EMERGENCY',
                'outside_today_regular_weekend': 'REGULAR_WEEKEND',
            }
            target_leave_type = leave_type_map[type]

            base_sql = f"""
                {dashboard_leave_detail_select()}
                LEFT JOIN tLeaveRequest week
                  ON week.recurring_parent_id = lr.id
                 AND week.is_active = 1
                 AND week.start_time <= %s AND week.end_time >= %s
            """

            if role_name == 'manager':
                cursor.execute(base_sql + """
                    WHERE lr.is_active = 1
                      AND lr.leave_type = %s
                      AND (
                        (lr.leave_type <> 'REGULAR_WEEKEND'
                         AND lr.start_time <= %s AND lr.end_time >= %s
                         AND lr.teacher_accept = 'ACCEPTED' AND lr.manager_accept = 'ACCEPTED')
                        OR
                        (lr.leave_type = 'REGULAR_WEEKEND'
                         AND lr.recurring_parent_id IS NULL
                         AND week.teacher_accept = 'ACCEPTED' AND week.manager_accept = 'ACCEPTED')
                      )
                    ORDER BY s.name
                """, (now, now, target_leave_type, now, now))
                rows = cursor.fetchall()
            else:
                cursor.execute("""
                    SELECT c.id
                    FROM tClass c
                    JOIN MANAGE m ON m.id_class = c.id
                    WHERE m.id_teacher = %s AND m.is_active = 1 AND c.is_active = 1
                """, (username,))
                class_ids = [row['id'] for row in cursor.fetchall()]
                if class_ids:
                    placeholders = ','.join(['%s'] * len(class_ids))
                    cursor.execute(base_sql + f"""
                        WHERE lr.is_active = 1
                          AND lr.leave_type = %s
                          AND st.id_class IN ({placeholders})
                          AND (
                            (lr.leave_type <> 'REGULAR_WEEKEND'
                             AND lr.start_time <= %s AND lr.end_time >= %s
                             AND lr.teacher_accept = 'ACCEPTED' AND lr.manager_accept = 'ACCEPTED')
                            OR
                            (lr.leave_type = 'REGULAR_WEEKEND'
                             AND lr.recurring_parent_id IS NULL
                             AND week.teacher_accept = 'ACCEPTED' AND week.manager_accept = 'ACCEPTED')
                          )
                        ORDER BY s.name
                    """, [now, now, target_leave_type] + class_ids + [now, now])
                    rows = cursor.fetchall()

        elif type == 'inspected_rooms' and role_name == 'manager':
            cursor.execute("""
                SELECT
                    ri.id_dormroom AS room_id,
                    d.name AS room_name,
                    ri.inspection_date,
                    ri.note,
                    COUNT(v.id) AS violation_count,
                    COALESCE(SUM(v.penalty_points), 0) AS total_penalty
                FROM tRoomInspection ri
                JOIN tDormroom d ON ri.id_dormroom = d.id
                LEFT JOIN tInspectionViolation v ON v.inspection_id = ri.id
                WHERE ri.inspection_date = %s
                GROUP BY ri.id, ri.id_dormroom, d.name, ri.inspection_date, ri.note
                ORDER BY ri.id_dormroom
            """, (today,))
            rows = cursor.fetchall()

        elif type == 'not_inspected_rooms' and role_name == 'manager':
            cursor.execute("""
                SELECT DISTINCT
                    d.id AS room_id,
                    d.name AS room_name,
                    NULL AS inspection_date,
                    NULL AS note,
                    NULL AS violation_count,
                    NULL AS total_penalty
                FROM tDormroom d
                JOIN LIVING l ON l.id_dormroom = d.id AND l.is_active = 1
                WHERE d.is_active = 1
                  AND NOT EXISTS (
                      SELECT 1
                      FROM tRoomInspection ri
                      WHERE ri.id_dormroom = d.id AND ri.inspection_date = %s
                  )
                ORDER BY d.id
            """, (today,))
            rows = cursor.fetchall()

        elif type == 'heavy_rooms' and role_name == 'manager':
            cursor.execute("""
                SELECT
                    ri.id_dormroom AS room_id,
                    d.name AS room_name,
                    ri.inspection_date,
                    ri.note,
                    COUNT(v.id) AS violation_count,
                    COALESCE(SUM(v.penalty_points), 0) AS total_penalty
                FROM tRoomInspection ri
                JOIN tDormroom d ON ri.id_dormroom = d.id
                JOIN tInspectionViolation v ON v.inspection_id = ri.id
                WHERE ri.inspection_date = %s
                GROUP BY ri.id, ri.id_dormroom, d.name, ri.inspection_date, ri.note
                HAVING COALESCE(SUM(v.penalty_points), 0) >= 5 OR COUNT(v.id) >= 5
                ORDER BY ri.id_dormroom
            """, (today,))
            rows = cursor.fetchall()

        elif type in (
            'guard_out_today',
            'guard_in_today',
            'guard_out_week',
            'guard_in_week',
            'guard_abnormal_today',
            'guard_abnormal_week',
        ) and role_name in ('dorm_manager', 'manager', 'guard'):
            week_start = datetime.combine(monday, datetime.min.time())
            week_end = datetime.combine(sunday, datetime.max.time())
            is_week = type.endswith('_week')
            start_at = week_start if is_week else datetime.combine(today, datetime.min.time())
            end_at = week_end if is_week else datetime.combine(today, datetime.max.time())
            params = [start_at, end_at]
            extra_filter = ""

            if type.startswith('guard_out'):
                extra_filter = " AND a.type = %s"
                params.append('OUT')
            elif type.startswith('guard_in'):
                extra_filter = " AND a.type = %s"
                params.append('IN')
            else:
                extra_filter = " AND a.type IN ('IN', 'OUT') AND a.note LIKE %s"
                params.append('%trái dự đoán%')

            cursor.execute(f"""
                {dashboard_access_detail_select()}
                WHERE a.access_time BETWEEN %s AND %s
                {extra_filter}
                ORDER BY a.access_time DESC, a.id DESC
            """, params)
            rows = cursor.fetchall()
            
        elif type == 'overdue_students' and role_name in ('manager', 'teacher', 'dorm_manager', 'guard'):
            rows = get_overdue_students(cursor, role_name, username, now)
            
        elif type in ('student_leave_requests_this_week', 'student_leave_requests_today', 'student_pending_leaves_this_week') and role_name == 'student':
            if type == 'student_leave_requests_this_week':
                cursor.execute(f"""
                    {dashboard_leave_detail_select()}
                    WHERE lr.is_active = 1
                      AND lr.id_student = %s
                      AND lr.start_time <= %s
                      AND lr.end_time >= %s
                      AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NOT NULL)
                    ORDER BY lr.start_time DESC
                """, (username, datetime.combine(sunday, datetime.max.time()), datetime.combine(monday, datetime.min.time())))
            elif type == 'student_leave_requests_today':
                cursor.execute(f"""
                    {dashboard_leave_detail_select()}
                    WHERE lr.is_active = 1
                      AND lr.id_student = %s
                      AND lr.start_time <= %s
                      AND lr.end_time >= %s
                      AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NOT NULL)
                    ORDER BY lr.start_time DESC
                """, (username, today_end, today_start))
            else: # student_pending_leaves_this_week
                cursor.execute(f"""
                    {dashboard_leave_detail_select()}
                    WHERE lr.is_active = 1
                      AND lr.id_student = %s
                      AND lr.start_time <= %s
                      AND lr.end_time >= %s
                      AND (lr.teacher_accept = 'PENDING' OR lr.manager_accept = 'PENDING')
                      AND lr.teacher_accept <> 'DENIED'
                      AND lr.manager_accept <> 'DENIED'
                      AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NOT NULL)
                    ORDER BY lr.start_time DESC
                """, (username, datetime.combine(sunday, datetime.max.time()), datetime.combine(monday, datetime.min.time())))
            rows = cursor.fetchall()
            
        for row in rows:
            for k, v in row.items():
                if isinstance(v, (datetime, date)):
                    row[k] = str(v)
            if 'total_penalty' in row and row['total_penalty'] is not None:
                row['total_penalty'] = float(row['total_penalty'])
            if 'violation_count' in row and row['violation_count'] is not None:
                row['violation_count'] = int(row['violation_count'])
                
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
