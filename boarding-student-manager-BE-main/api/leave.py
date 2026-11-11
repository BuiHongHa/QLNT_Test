from flask import Blueprint, request, jsonify
from config import get_db_connection
from datetime import datetime, date, time, timedelta
from mock_time import get_today, get_now
from excel_utils import generate_excel_response

leave_bp = Blueprint('leave', __name__)

LEAVE_TYPES = {'REGULAR_WEEKEND', 'AFTER_SCHOOL', 'EMERGENCY'}

def normalize_role(role_name):
    return (role_name or '').strip().lower()

def is_staff(role_name):
    return normalize_role(role_name) in {'teacher', 'manager', 'dorm_manager'}

def leave_effective_status(leave_type, teacher_accept, manager_accept, dorm_manager_accept):
    t = (teacher_accept or 'PENDING').strip().upper()
    m = (manager_accept or 'PENDING').strip().upper()
    d = (dorm_manager_accept or 'PENDING').strip().upper()

    if leave_type == 'AFTER_SCHOOL':
        # Đơn ra ngoài: Quản lý KTX duyệt
        if d == 'DENIED':
            return 'DENIED'
        if d == 'ACCEPTED':
            return 'ACCEPTED'
        return 'PENDING'

    elif leave_type == 'EMERGENCY':
        # Đơn đột xuất: BGH duyệt
        if m == 'DENIED':
            return 'DENIED'
        if m == 'ACCEPTED':
            return 'ACCEPTED'
        return 'PENDING'

    elif leave_type == 'REGULAR_WEEKEND':
        # Đơn cuối tuần: GVCN duyệt (Cấp 1) -> BGH duyệt (Cấp 2)
        if t == 'DENIED' or m == 'DENIED':
            return 'DENIED'
        if t == 'ACCEPTED' and m == 'ACCEPTED':
            return 'ACCEPTED'
        return 'PENDING'

    if t == 'DENIED' or m == 'DENIED' or d == 'DENIED':
        return 'DENIED'
    if t == 'ACCEPTED' and m == 'ACCEPTED':
        return 'ACCEPTED'
    return 'PENDING'

def leave_stage_text(leave_type, teacher_accept, manager_accept, dorm_manager_accept):
    t = (teacher_accept or 'PENDING').strip().upper()
    m = (manager_accept or 'PENDING').strip().upper()
    d = (dorm_manager_accept or 'PENDING').strip().upper()

    if leave_type == 'AFTER_SCHOOL':
        if d == 'ACCEPTED':
            return 'QL KTX đã duyệt'
        if d == 'DENIED':
            return 'QL KTX từ chối'
        return 'Chờ QL KTX duyệt'

    elif leave_type == 'EMERGENCY':
        if m == 'ACCEPTED':
            return 'BGH đã duyệt'
        if m == 'DENIED':
            return 'BGH từ chối'
        return 'Chờ BGH duyệt'

    elif leave_type == 'REGULAR_WEEKEND':
        if t == 'DENIED':
            return 'GVCN từ chối'
        if m == 'DENIED':
            return 'BGH từ chối'
        if t == 'ACCEPTED' and m == 'ACCEPTED':
            return 'Đã duyệt 2 cấp'
        if t == 'ACCEPTED' and m == 'PENDING':
            return 'Chờ BGH duyệt (Cấp 2)'
        return 'Chờ GVCN duyệt (Cấp 1)'

    return 'Chờ duyệt'

def leave_status_with_overdue(leave_type, teacher_accept, manager_accept, dorm_manager_accept, end_time, now=None):
    status = leave_effective_status(leave_type, teacher_accept, manager_accept, dorm_manager_accept)
    if status == 'PENDING' and end_time and (now or get_now()) > end_time:
        return 'OVERDUE'
    return status

def approval_column_for_role(role_name, leave_type):
    if role_name == 'dorm_manager':
        return 'dorm_manager_accept' if leave_type == 'AFTER_SCHOOL' else None
    if role_name == 'teacher':
        return 'teacher_accept' if leave_type == 'REGULAR_WEEKEND' else None
    if role_name == 'manager':
        return 'manager_accept'
    return None

def can_view_leave(cursor, role_name, username, leave_row):
    if role_name in {'manager', 'dorm_manager', 'canteen_manager'}:
        return True
    if role_name == 'teacher':
        return teacher_manages_student(cursor, username, leave_row['id_student'])
    if role_name == 'student':
        return leave_row['id_student'] == username
    return False

def teacher_manages_student(cursor, teacher_id, student_id):
    cursor.execute("""
        SELECT 1
        FROM STUDY st
        JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
        JOIN MANAGE m ON m.id_class = c.id
        WHERE st.id_student = %s
          AND st.is_active = 1
          AND m.id_teacher = %s
          AND m.is_active = 1
        LIMIT 1
    """, (student_id, teacher_id))
    return cursor.fetchone() is not None

def parse_dt(value):
    if not value:
        return None
    value = str(value).strip()
    for fmt in ('%Y-%m-%dT%H:%M', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            parsed = datetime.strptime(value, fmt)
            return datetime.combine(parsed.date(), time.min) if fmt == '%Y-%m-%d' else parsed
        except ValueError:
            continue
    raise ValueError(f"Thời gian không hợp lệ: {value}")

def ensure_leave_schema(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tLeaveRequest (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_student CHAR(12) NOT NULL,
            leave_type VARCHAR(30) NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            reason NVARCHAR(255),
            teacher_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            manager_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            dorm_manager_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            created_by CHAR(12),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            decided_by CHAR(12),
            decided_at DATETIME NULL,
            decision_note NVARCHAR(255),
            recurring_parent_id INT NULL,
            is_active INT DEFAULT 1,
            FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID),
            FOREIGN KEY (created_by) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE SET NULL,
            FOREIGN KEY (decided_by) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    try:
        cursor.execute("ALTER TABLE tLeaveRequest ADD COLUMN recurring_parent_id INT NULL")
    except Exception:
        pass
    for column in ('teacher_accept', 'manager_accept', 'dorm_manager_accept'):
        try:
            cursor.execute(f"ALTER TABLE tLeaveRequest ADD COLUMN {column} VARCHAR(20) NOT NULL DEFAULT 'PENDING'")
        except Exception:
            pass
    try:
        cursor.execute("""
            SELECT COUNT(*) AS cnt
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tLeaveRequest'
              AND COLUMN_NAME = 'status'
        """)
        has_status = bool((cursor.fetchone() or {}).get('cnt'))
    except Exception:
        has_status = False
    if has_status:
        cursor.execute("""
            UPDATE tLeaveRequest
            SET teacher_accept = 'ACCEPTED', manager_accept = 'ACCEPTED'
            WHERE status = 'ACCEPTED'
              AND teacher_accept = 'PENDING'
              AND manager_accept = 'PENDING'
        """)
        cursor.execute("""
            UPDATE tLeaveRequest
            SET teacher_accept = 'DENIED', manager_accept = 'DENIED'
            WHERE status = 'DENIED'
              AND teacher_accept = 'PENDING'
              AND manager_accept = 'PENDING'
        """)
    try:
        cursor.execute("""
            SELECT COUNT(*) AS cnt
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tLeaveRequest'
              AND COLUMN_NAME = 'status'
        """)
        if (cursor.fetchone() or {}).get('cnt'):
            cursor.execute("ALTER TABLE tLeaveRequest DROP COLUMN status")
    except Exception:
        pass

def school_year_end(today=None):
    today = today or get_today()
    end = date(today.year, 5, 30)
    if today > end:
        end = date(today.year + 1, 5, 30)
    return end

def friday_of_week(day):
    return day - timedelta(days=day.weekday()) + timedelta(days=4)


def weekend_window(friday):
    return datetime.combine(friday, time(16, 0)), datetime.combine(friday + timedelta(days=2), time(23, 59, 59))

def current_weekend_window(today=None):
    return weekend_window(friday_of_week(today or get_today()))

def normalize_leave_window(leave_type, data):
    if leave_type == 'REGULAR_WEEKEND':
        start_day = parse_dt(data.get('start_time') or data.get('leave_date')).date() if (data.get('start_time') or data.get('leave_date')) else get_today()
        return datetime.combine(start_day, time.min), datetime.combine(school_year_end(start_day), time(23, 59, 59))

    if leave_type == 'AFTER_SCHOOL':
        day_value = data.get('leave_date') or data.get('start_time')
        day = parse_dt(day_value).date() if day_value else get_today()
        return datetime.combine(day, time(16, 0)), datetime.combine(day, time(19, 30))

    start_time = parse_dt(data.get('start_time'))
    end_time = parse_dt(data.get('end_time'))
    if not start_time or not end_time:
        raise ValueError("Về phép đột xuất cần có thời gian bắt đầu và kết thúc")
    if end_time <= start_time:
        raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu")
    return start_time, end_time

def serialize_leave(row):
    for key in ('start_time', 'end_time', 'created_at', 'decided_at'):
        if row.get(key):
            row[key] = row[key].strftime('%Y-%m-%d %H:%M:%S')
    leave_type = row.get('leave_type')
    row['teacher_accept'] = row.get('teacher_accept') or 'PENDING'
    row['manager_accept'] = row.get('manager_accept') or 'PENDING'
    row['dorm_manager_accept'] = row.get('dorm_manager_accept') or 'PENDING'
    row['status'] = leave_effective_status(leave_type, row['teacher_accept'], row['manager_accept'], row['dorm_manager_accept'])
    row['stage_text'] = leave_stage_text(leave_type, row['teacher_accept'], row['manager_accept'], row['dorm_manager_accept'])
    if leave_type == 'REGULAR_WEEKEND':
        row['current_week_teacher_accept'] = row.get('current_week_teacher_accept') or 'PENDING'
        row['current_week_manager_accept'] = row.get('current_week_manager_accept') or 'PENDING'
        row['current_week_status'] = leave_effective_status(
            leave_type,
            row['current_week_teacher_accept'],
            row['current_week_manager_accept'],
            'NOT_REQUIRED'
        )
        row['weekly_status_text'] = 'Được duyệt trong tuần này' if row.get('current_week_status') == 'ACCEPTED' else 'Không được duyệt trong tuần này' if row.get('current_week_status') == 'DENIED' else 'Chờ duyệt trong tuần này'
    return row

def serialize_leave_with_overdue(row):
    now = get_now()
    end_time = row.get('end_time')
    current_week_end_time = row.get('current_week_end_time') or end_time
    leave_type = row.get('leave_type')

    row['teacher_accept'] = row.get('teacher_accept') or 'PENDING'
    row['manager_accept'] = row.get('manager_accept') or 'PENDING'
    row['dorm_manager_accept'] = row.get('dorm_manager_accept') or 'PENDING'
    row['registration_status'] = leave_status_with_overdue(
        leave_type,
        row['teacher_accept'],
        row['manager_accept'],
        row['dorm_manager_accept'],
        current_week_end_time if leave_type == 'REGULAR_WEEKEND' else end_time,
        now
    )
    row['status'] = row['registration_status']
    row['stage_text'] = leave_stage_text(leave_type, row['teacher_accept'], row['manager_accept'], row['dorm_manager_accept'])

    if leave_type == 'REGULAR_WEEKEND':
        row['current_week_teacher_accept'] = row.get('current_week_teacher_accept') or 'PENDING'
        row['current_week_manager_accept'] = row.get('current_week_manager_accept') or 'PENDING'
        row['current_week_status'] = leave_status_with_overdue(
            leave_type,
            row['current_week_teacher_accept'],
            row['current_week_manager_accept'],
            'NOT_REQUIRED',
            current_week_end_time,
            now
        )
        row['status'] = row['current_week_status'] if row['registration_status'] == 'ACCEPTED' else row['registration_status']
        if row['current_week_status'] == 'ACCEPTED':
            row['weekly_status_text'] = 'Được duyệt trong tuần này'
        elif row['current_week_status'] == 'DENIED':
            row['weekly_status_text'] = 'Không được duyệt trong tuần này'
        elif row['current_week_status'] == 'OVERDUE':
            row['weekly_status_text'] = 'Quá hạn trong tuần này'
        else:
            row['weekly_status_text'] = 'Chờ duyệt trong tuần này'

    for key in ('start_time', 'end_time', 'created_at', 'decided_at', 'current_week_start_time', 'current_week_end_time'):
        if row.get(key):
            row[key] = row[key].strftime('%Y-%m-%d %H:%M:%S')
    return row

def ensure_regular_week_instances(cursor, parent_row):
    parent_id = parent_row['id']
    student_id = parent_row['id_student']
    cursor.execute("""
        SELECT start_time FROM tLeaveRequest
        WHERE recurring_parent_id = %s AND is_active = 1
    """, (parent_id,))
    existing = {row['start_time'].date() for row in cursor.fetchall()}

    friday = friday_of_week(parent_row['start_time'].date())
    end_day = parent_row['end_time'].date()
    created = 0

    teacher_acc = parent_row.get('teacher_accept', 'PENDING')
    manager_acc = parent_row.get('manager_accept', 'PENDING')
    decided_by = parent_row.get('decided_by')

    while friday <= end_day:
        start_time, end_time = weekend_window(friday)
        if start_time.date() not in existing:
            parent_decided = parent_row.get('decided_at') or get_now()
            cursor.execute("""
                INSERT INTO tLeaveRequest
                (id_student, leave_type, start_time, end_time, reason, teacher_accept, manager_accept, dorm_manager_accept,
                 created_by, decided_by, decided_at, recurring_parent_id)
                VALUES (%s, 'REGULAR_WEEKEND', %s, %s, %s, %s, %s, 'NOT_REQUIRED',
                        %s, %s, CASE WHEN %s = 'ACCEPTED' OR %s = 'ACCEPTED' THEN %s ELSE NULL END, %s)
            """, (
                student_id, start_time, end_time, parent_row.get('reason'),
                teacher_acc, manager_acc,
                parent_row.get('created_by'),
                decided_by, teacher_acc, manager_acc, parent_decided, parent_id
            ))
            created += 1
        friday += timedelta(days=7)
    return created

def sync_regular_weekends(cursor):
    cursor.execute("""
        SELECT * FROM tLeaveRequest
        WHERE leave_type = 'REGULAR_WEEKEND'
          AND recurring_parent_id IS NULL
          AND is_active = 1
    """)
    parents = cursor.fetchall()
    total = 0
    for parent in parents:
        total += ensure_regular_week_instances(cursor, parent)
    return total

@leave_bp.route('/', methods=['GET'])
def get_leave_requests():
    username = request.args.get('username')
    role_name = normalize_role(request.args.get('role_name'))
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_leave_schema(cursor)
        sync_regular_weekends(cursor)
        conn.commit()

        current_start, current_end = current_weekend_window()
        where = "WHERE lr.is_active = 1 AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NULL)"
        params = []
        if role_name == 'student':
            where += " AND lr.id_student = %s"
            params.append(username)
        elif role_name == 'teacher':
            where += """
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
        elif role_name not in {'teacher', 'manager', 'dorm_manager', 'canteen_manager'}:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không có quyền truy cập"}), 403

        cursor.execute(f"""
            SELECT lr.*, s.name AS student_name, c.name AS class_name,
                   COALESCE(cb_student.name, cb_teacher.name) AS created_by_name,
                   cb_role.name AS created_by_role,
                   COALESCE(db_teacher.name, lr.decided_by) AS decided_by_name,
                   week.teacher_accept AS current_week_teacher_accept,
                   week.manager_accept AS current_week_manager_accept,
                   week.start_time AS current_week_start_time,
                   week.end_time AS current_week_end_time,
                   week.id AS current_week_id
            FROM tLeaveRequest lr
            JOIN tStudent s ON lr.id_student = s.id_VNeID
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            LEFT JOIN tAccount cb_acc ON lr.created_by = cb_acc.username
            LEFT JOIN tRole cb_role ON cb_acc.role_id = cb_role.id
            LEFT JOIN tStudent cb_student ON lr.created_by = cb_student.id_VNeID AND cb_student.is_active = 1
            LEFT JOIN tTeacher cb_teacher ON lr.created_by = cb_teacher.id_VNeID AND cb_teacher.is_active = 1
            LEFT JOIN tTeacher db_teacher ON lr.decided_by = db_teacher.id_VNeID AND db_teacher.is_active = 1
            LEFT JOIN tLeaveRequest week
              ON week.recurring_parent_id = lr.id
             AND week.start_time = %s
             AND week.end_time = %s
             AND week.is_active = 1
            {where}
            ORDER BY COALESCE(week.start_time, lr.created_at) DESC, lr.id DESC
        """, [current_start, current_end] + params)
        rows = [serialize_leave_with_overdue(row) for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@leave_bp.route('/', methods=['POST'])
def create_leave_request():
    data = request.json or {}
    role_name = normalize_role(data.get('created_by_role'))
    leave_type = (data.get('leave_type') or '').strip().upper()
    student_id = (data.get('id_student') or data.get('created_by') or '').strip()

    if leave_type not in LEAVE_TYPES:
        return jsonify({"success": False, "message": "Loại nghỉ phép không hợp lệ"}), 400
    if not student_id:
        return jsonify({"success": False, "message": "Thiếu mã học sinh"}), 400

    try:
        start_time, end_time = normalize_leave_window(leave_type, data)
        if start_time.date() < get_today():
            return jsonify({"success": False, "message": "Không thể tạo đơn nghỉ phép trước ngày hiện tại"}), 400
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_leave_schema(cursor)
        cursor.execute("SELECT id_VNeID FROM tStudent WHERE id_VNeID = %s AND is_active = 1", (student_id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy học sinh"}), 404

        if leave_type == 'AFTER_SCHOOL':
            teacher_accept = 'NOT_REQUIRED'
            manager_accept = 'NOT_REQUIRED'
            dorm_manager_accept = 'ACCEPTED' if role_name in {'dorm_manager', 'manager'} else 'PENDING'
        elif leave_type == 'EMERGENCY':
            teacher_accept = 'NOT_REQUIRED'
            manager_accept = 'ACCEPTED' if role_name == 'manager' else 'PENDING'
            dorm_manager_accept = 'NOT_REQUIRED'
        elif leave_type == 'REGULAR_WEEKEND':
            teacher_accept = 'ACCEPTED' if role_name == 'teacher' else 'PENDING'
            manager_accept = 'ACCEPTED' if role_name == 'manager' else 'PENDING'
            dorm_manager_accept = 'NOT_REQUIRED'
        else:
            teacher_accept = 'PENDING'
            manager_accept = 'PENDING'
            dorm_manager_accept = 'PENDING'

        status = leave_effective_status(leave_type, teacher_accept, manager_accept, dorm_manager_accept)
        raw_created_by = (data.get('created_by') or '').strip() or None
        if raw_created_by:
            cursor.execute("SELECT username FROM tAccount WHERE username = %s", (raw_created_by,))
            if not cursor.fetchone():
                raw_created_by = None
        decided_by = raw_created_by if role_name in {'teacher', 'manager', 'dorm_manager'} else None
        now = get_now()
        cursor.execute("""
            INSERT INTO tLeaveRequest
            (id_student, leave_type, start_time, end_time, reason,
             teacher_accept, manager_accept, dorm_manager_accept,
             created_by, decided_by, decided_at, recurring_parent_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    CASE WHEN %s='ACCEPTED' THEN %s ELSE NULL END, NULL)
        """, (
            student_id, leave_type, start_time, end_time, data.get('reason'),
            teacher_accept, manager_accept, dorm_manager_accept,
            raw_created_by, decided_by, status, now
        ))
        parent_id = cursor.lastrowid
        if leave_type == 'REGULAR_WEEKEND':
            cursor.execute("SELECT * FROM tLeaveRequest WHERE id = %s", (parent_id,))
            ensure_regular_week_instances(cursor, cursor.fetchone())

        if status == 'ACCEPTED':
            try:
                from api.meal import sync_students_meal_attendance
                sync_students_meal_attendance(cursor, [student_id], start_time.date(), min(end_time.date(), start_time.date() + timedelta(days=31)))
            except Exception:
                pass

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Tạo phiếu nghỉ phép thành công", "status": status}), 201
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@leave_bp.route('/<int:leave_id>/status', methods=['PUT'])
def update_leave_status(leave_id):
    data = request.json or {}
    role_name = normalize_role(data.get('role_name'))
    status = (data.get('status') or '').strip().upper()
    if not is_staff(role_name):
        return jsonify({"success": False, "message": "Bạn không có quyền duyệt đơn nghỉ phép"}), 403
    if status not in {'ACCEPTED', 'DENIED'}:
        return jsonify({"success": False, "message": "Trạng thái không hợp lệ"}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_leave_schema(cursor)
        cursor.execute("SELECT id, id_student, leave_type, start_time, end_time, teacher_accept, manager_accept, dorm_manager_accept FROM tLeaveRequest WHERE id = %s AND is_active = 1", (leave_id,))
        leave = cursor.fetchone()
        if not leave:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy đơn nghỉ phép"}), 404

        leave_type = leave['leave_type']
        if leave_type == 'AFTER_SCHOOL':
            if role_name not in {'dorm_manager', 'manager'}:
                cursor.close()
                conn.close()
                return jsonify({"success": False, "message": "Chỉ Quản lý Ký túc xá mới có quyền duyệt đơn ra ngoài"}), 403
            approval_column = 'dorm_manager_accept'
        elif leave_type == 'REGULAR_WEEKEND':
            if role_name == 'teacher':
                if not teacher_manages_student(cursor, data.get('username'), leave['id_student']):
                    cursor.close()
                    conn.close()
                    return jsonify({"success": False, "message": "Không có quyền cập nhật đơn ngoài lớp quản lý"}), 403
                approval_column = 'teacher_accept'
            elif role_name == 'manager':
                approval_column = 'manager_accept'
            else:
                cursor.close()
                conn.close()
                return jsonify({"success": False, "message": "Chỉ GVCN (cấp 1) hoặc BGH (cấp 2) mới có quyền duyệt đơn cuối tuần"}), 403
        elif leave_type == 'EMERGENCY':
            if role_name != 'manager':
                cursor.close()
                conn.close()
                return jsonify({"success": False, "message": "Chỉ Ban Giám Hiệu mới có quyền duyệt đơn đột xuất"}), 403
            approval_column = 'manager_accept'
        else:
            approval_column = approval_column_for_role(role_name, leave_type)

        if not approval_column:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không có quyền duyệt loại đơn này"}), 403

        decision_note = (data.get('decision_note') or data.get('reason') or '').strip()
        if status == 'DENIED' and not decision_note:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Vui lòng nhập lý do từ chối đơn nghỉ phép"}), 400

        now = get_now()
        cursor.execute(f"""
            UPDATE tLeaveRequest
            SET {approval_column} = %s, decided_by = %s, decided_at = %s, decision_note = %s
            WHERE id = %s AND is_active = 1
        """, (status, data.get('username'), now, decision_note or None, leave_id))
        conn.commit()
        affected = cursor.rowcount

        # Update all child requests with the same approval status
        cursor.execute(f"""
            UPDATE tLeaveRequest
            SET {approval_column} = %s, decided_by = %s, decided_at = %s, decision_note = %s
            WHERE recurring_parent_id = %s AND is_active = 1
        """, (status, data.get('username'), now, decision_note or None, leave_id))
        conn.commit()

        # Sync meal attendance immediately
        try:
            from api.meal import sync_students_meal_attendance
            sync_start = leave['start_time'].date()
            sync_end = leave['end_time'].date()
            today = get_today()
            if (sync_end - sync_start).days > 31:
                sync_start = date(today.year, today.month, 1)
                sync_end = sync_start + timedelta(days=31)
            sync_students_meal_attendance(cursor, [leave['id_student']], sync_start, sync_end)
            conn.commit()
        except Exception:
            pass

        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Không tìm thấy đơn nghỉ phép"}), 404
        return jsonify({"success": True, "message": "Cập nhật trạng thái thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@leave_bp.route('/<int:leave_id>', methods=['DELETE'])
def delete_leave_request(leave_id):
    data = request.json or {}
    role_name = normalize_role(data.get('role_name'))
    username = data.get('username')
    if role_name not in {'teacher', 'manager', 'dorm_manager', 'student'}:
        return jsonify({"success": False, "message": "Không có quyền xoá"}), 403
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_leave_schema(cursor)
        cursor.execute("SELECT * FROM tLeaveRequest WHERE id = %s AND is_active = 1", (leave_id,))
        leave = cursor.fetchone()
        if not leave:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy đơn nghỉ phép"}), 404
        if not can_view_leave(cursor, role_name, username, leave):
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không có quyền xoá đơn này"}), 403

        if leave['leave_type'] == 'REGULAR_WEEKEND' and leave.get('recurring_parent_id') is None:
            cursor.execute("""
                UPDATE tLeaveRequest
                SET is_active = 0
                WHERE (id = %s OR recurring_parent_id = %s)
                  AND is_active = 1
            """, (leave_id, leave_id))
        else:
            cursor.execute("""
                UPDATE tLeaveRequest
                SET is_active = 0
                WHERE id = %s AND is_active = 1
            """, (leave_id,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Không tìm thấy đơn nghỉ phép"}), 404
        return jsonify({"success": True, "message": "Đã xoá đơn nghỉ phép"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@leave_bp.route('/bulk-delete', methods=['POST'])
def bulk_delete_leave_requests():
    data = request.json or {}
    role_name = normalize_role(data.get('role_name'))
    username = data.get('username')
    raw_ids = data.get('ids') or []
    if role_name not in {'teacher', 'manager', 'dorm_manager', 'student'}:
        return jsonify({"success": False, "message": "Không có quyền xoá"}), 403

    try:
        ids = []
        for value in raw_ids:
            try:
                ids.append(int(value))
            except (TypeError, ValueError):
                continue
        ids = sorted(set(ids))
        if not ids:
            return jsonify({"success": False, "message": "Thiếu danh sách đơn cần xoá"}), 400

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_leave_schema(cursor)

        placeholders = ','.join(['%s'] * len(ids))
        cursor.execute(f"SELECT * FROM tLeaveRequest WHERE id IN ({placeholders}) AND is_active = 1", ids)
        leaves = cursor.fetchall()
        if not leaves:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy đơn nghỉ phép"}), 404

        for leave in leaves:
            if not can_view_leave(cursor, role_name, username, leave):
                cursor.close()
                conn.close()
                return jsonify({"success": False, "message": "Không có quyền xoá một hoặc nhiều đơn đã chọn"}), 403

        delete_ids = {leave['id'] for leave in leaves}
        parent_ids = [leave['id'] for leave in leaves if leave['leave_type'] == 'REGULAR_WEEKEND' and leave.get('recurring_parent_id') is None]
        for parent_id in parent_ids:
            cursor.execute("""
                SELECT id
                FROM tLeaveRequest
                WHERE recurring_parent_id = %s
                  AND is_active = 1
            """, (parent_id,))
            delete_ids.update(row['id'] for row in cursor.fetchall())

        delete_ids = sorted(delete_ids)
        delete_placeholders = ','.join(['%s'] * len(delete_ids))
        cursor.execute(f"""
            UPDATE tLeaveRequest
            SET is_active = 0
            WHERE id IN ({delete_placeholders})
              AND is_active = 1
        """, delete_ids)
        affected = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã xoá mềm {affected} đơn nghỉ phép"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@leave_bp.route('/regular-weekends/clear', methods=['POST'])
def clear_regular_weekends():
    data = request.json or {}
    role_name = normalize_role(data.get('role_name'))
    if role_name != 'manager':
        return jsonify({"success": False, "message": "Chỉ quản lý mới được thao tác"}), 403
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE tLeaveRequest
            SET is_active = 0
            WHERE leave_type = 'REGULAR_WEEKEND'
              AND is_active = 1
        """)
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã vô hiệu hoá {affected} đơn nghỉ phép thường xuyên"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@leave_bp.route('/<int:leave_id>/current-week-status', methods=['PUT'])
def update_current_week_status(leave_id):
    data = request.json or {}
    role_name = normalize_role(data.get('role_name'))
    username = data.get('username')
    status = (data.get('status') or '').strip().upper()
    if role_name not in {'student', 'teacher', 'manager'}:
        return jsonify({"success": False, "message": "Không có quyền cập nhật"}), 403
    if status not in {'ACCEPTED', 'DENIED'}:
        return jsonify({"success": False, "message": "Trạng thái không hợp lệ"}), 400
    if role_name == 'student' and status != 'DENIED':
        return jsonify({"success": False, "message": "Học sinh chỉ được từ chối phép thường xuyên của tuần này"}), 403
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_leave_schema(cursor)
        sync_regular_weekends(cursor)
        cursor.execute("SELECT * FROM tLeaveRequest WHERE id = %s AND is_active = 1", (leave_id,))
        parent = cursor.fetchone()
        if not parent or parent['leave_type'] != 'REGULAR_WEEKEND' or parent['recurring_parent_id'] is not None:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy đăng ký phép thường xuyên"}), 404
        if role_name == 'student' and parent['id_student'] != username:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không có quyền cập nhật đơn này"}), 403

        if role_name == 'teacher' and not teacher_manages_student(cursor, username, parent['id_student']):
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "KhÃ´ng cÃ³ quyá»n cáº­p nháº­t Ä‘Æ¡n ngoÃ i lá»›p quáº£n lÃ½"}), 403

        start_time, end_time = current_weekend_window()
        cursor.execute("""
            SELECT id, teacher_accept, manager_accept
            FROM tLeaveRequest
            WHERE recurring_parent_id = %s AND start_time = %s AND end_time = %s AND is_active = 1
        """, (leave_id, start_time, end_time))
        week = cursor.fetchone()
        if not week:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "ChÆ°a cÃ³ Ä‘Æ¡n phÃ©p tuáº§n nÃ y"}), 404

        decision_note = (data.get('decision_note') or data.get('reason') or '').strip()
        if status == 'DENIED' and role_name != 'student' and not decision_note:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Vui lòng nhập lý do từ chối đơn nghỉ phép"}), 400

        now = get_now()
        if role_name == 'student':
            cursor.execute("""
                UPDATE tLeaveRequest
                SET teacher_accept = 'DENIED', manager_accept = 'DENIED', decided_by = %s, decided_at = %s, decision_note = %s
                WHERE id = %s AND is_active = 1
            """, (username, now, decision_note or 'Học sinh chủ động hủy/từ chối tuần này', week['id']))
        else:
            approval_column = approval_column_for_role(role_name, 'REGULAR_WEEKEND')
            cursor.execute(f"""
                UPDATE tLeaveRequest
                SET {approval_column} = %s, decided_by = %s, decided_at = %s, decision_note = %s
                WHERE id = %s AND is_active = 1
            """, (status, username, now, decision_note or None, week['id']))
        conn.commit()
        affected = cursor.rowcount

        try:
            from api.meal import sync_students_meal_attendance
            sync_students_meal_attendance(cursor, [parent['id_student']], start_time.date(), end_time.date())
            conn.commit()
        except Exception:
            pass

        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Chưa có đơn phép tuần này"}), 404
        return jsonify({"success": True, "message": "Cập nhật trạng thái phép tuần này thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@leave_bp.route('/export', methods=['GET'])
def export_leave_requests():
    username = request.args.get('username')
    role_name = normalize_role(request.args.get('role_name'))

    if role_name not in {'student', 'teacher', 'manager', 'dorm_manager', 'canteen_manager'}:
        return jsonify({"success": False, "message": "Không có quyền truy cập"}), 403

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_leave_schema(cursor)
        sync_regular_weekends(cursor)
        conn.commit()

        current_start, current_end = current_weekend_window()
        where = "WHERE lr.is_active = 1 AND (lr.leave_type <> 'REGULAR_WEEKEND' OR lr.recurring_parent_id IS NULL)"
        params = []
        if role_name == 'student':
            where += " AND lr.id_student = %s"
            params.append(username)
        elif role_name == 'teacher':
            where += """
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

        cursor.execute(f"""
            SELECT lr.*, s.name AS student_name, c.name AS class_name,
                   COALESCE(cb_student.name, cb_teacher.name) AS created_by_name,
                   cb_role.name AS created_by_role,
                   COALESCE(db_teacher.name, lr.decided_by) AS decided_by_name,
                   week.teacher_accept AS current_week_teacher_accept,
                   week.manager_accept AS current_week_manager_accept,
                   week.start_time AS current_week_start_time,
                   week.end_time AS current_week_end_time,
                   week.id AS current_week_id
            FROM tLeaveRequest lr
            JOIN tStudent s ON lr.id_student = s.id_VNeID
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            LEFT JOIN tAccount cb_acc ON lr.created_by = cb_acc.username
            LEFT JOIN tRole cb_role ON cb_acc.role_id = cb_role.id
            LEFT JOIN tStudent cb_student ON lr.created_by = cb_student.id_VNeID AND cb_student.is_active = 1
            LEFT JOIN tTeacher cb_teacher ON lr.created_by = cb_teacher.id_VNeID AND cb_teacher.is_active = 1
            LEFT JOIN tTeacher db_teacher ON lr.decided_by = db_teacher.id_VNeID AND db_teacher.is_active = 1
            LEFT JOIN tLeaveRequest week
              ON week.recurring_parent_id = lr.id
             AND week.start_time = %s
             AND week.end_time = %s
             AND week.is_active = 1
            {where}
            ORDER BY COALESCE(week.start_time, lr.created_at) DESC, lr.id DESC
        """, [current_start, current_end] + params)
        rows = [serialize_leave_with_overdue(row) for row in cursor.fetchall()]
        cursor.close()
        conn.close()

        headers = [
            "STT", "Mã định danh (VNeID)", "Họ và tên", "Lớp",
            "Loại đơn", "Thời gian bắt đầu", "Thời gian kết thúc",
            "Lý do", "Trạng thái GV", "Trạng thái QL", "Trạng thái chung",
            "Người tạo", "Người duyệt", "Ngày tạo"
        ]

        type_map = {
            'REGULAR_WEEKEND': 'Về phép cuối tuần',
            'EMERGENCY': 'Về phép đột xuất',
            'AFTER_SCHOOL': 'Ra ngoài sau giờ học'
        }
        status_map = {
            'ACCEPTED': 'Đã duyệt',
            'DENIED': 'Từ chối',
            'PENDING': 'Chờ duyệt',
            'OVERDUE': 'Quá hạn'
        }

        data_rows = []
        for idx, r in enumerate(rows, 1):
            data_rows.append([
                idx,
                r.get('id_student', ''),
                r.get('student_name', ''),
                r.get('class_name', ''),
                type_map.get(r.get('leave_type'), r.get('leave_type', '')),
                r.get('start_time', ''),
                r.get('end_time', ''),
                r.get('reason', ''),
                status_map.get(r.get('teacher_accept'), r.get('teacher_accept', '')),
                status_map.get(r.get('manager_accept'), r.get('manager_accept', '')),
                status_map.get(r.get('status'), r.get('status', '')),
                r.get('created_by_name') or r.get('created_by', ''),
                r.get('decided_by_name') or r.get('decided_by', ''),
                r.get('created_at', '')
            ])

        return generate_excel_response(headers, data_rows, "danh_sach_don_nghi_phep.xlsx", sheet_name="Đơn nghỉ phép")
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
