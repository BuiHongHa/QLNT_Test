from flask import Blueprint, request, jsonify
from config import get_db_connection
from datetime import datetime, date, time, timedelta
from mock_time import get_today, get_now
from excel_utils import generate_excel_response

meal_bp = Blueprint('meal', __name__)

def normalize_role(role_name):
    return (role_name or '').strip().lower()

def leave_effective_status(leave_row):
    teacher_accept = (leave_row.get('teacher_accept') or 'PENDING').strip().upper()
    manager_accept = (leave_row.get('manager_accept') or 'PENDING').strip().upper()
    dorm_manager_accept = (leave_row.get('dorm_manager_accept') or 'PENDING').strip().upper()
    leave_type = leave_row.get('leave_type')

    if leave_type == 'AFTER_SCHOOL':
        return 'ACCEPTED' if dorm_manager_accept == 'ACCEPTED' else 'DENIED' if dorm_manager_accept == 'DENIED' else 'PENDING'
    if leave_type == 'EMERGENCY':
        return 'ACCEPTED' if manager_accept == 'ACCEPTED' else 'DENIED' if manager_accept == 'DENIED' else 'PENDING'
    if leave_type == 'REGULAR_WEEKEND':
        if teacher_accept == 'DENIED' or manager_accept == 'DENIED':
            return 'DENIED'
        if teacher_accept == 'ACCEPTED' and manager_accept == 'ACCEPTED':
            return 'ACCEPTED'
        return 'PENDING'
    if teacher_accept == 'DENIED' or manager_accept == 'DENIED' or dorm_manager_accept == 'DENIED':
        return 'DENIED'
    if teacher_accept == 'ACCEPTED' and manager_accept == 'ACCEPTED':
        return 'ACCEPTED'
    return 'PENDING'

def ensure_meal_schema(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tMealAttendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            meal_date DATE NOT NULL,
            meal_type VARCHAR(10) NOT NULL,
            id_student CHAR(12) NOT NULL,
            is_cut INT NOT NULL DEFAULT 0,
            reason_leave_id INT NULL,
            note NVARCHAR(255),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_meal_student (meal_date, meal_type, id_student),
            FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tWeeklyMenu (
            id INT AUTO_INCREMENT PRIMARY KEY,
            menu_date DATE NOT NULL,
            meal_type VARCHAR(10) NOT NULL,
            rice VARCHAR(150) NOT NULL DEFAULT 'Cơm trắng',
            main_dish_1 VARCHAR(200) NOT NULL,
            main_dish_2 VARCHAR(200) NOT NULL,
            side_dish VARCHAR(200) NOT NULL,
            soup VARCHAR(200) NOT NULL,
            dessert VARCHAR(150) NULL,
            note VARCHAR(255) NULL,
            created_by VARCHAR(50) NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_menu_date_meal (menu_date, meal_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    for column_sql in (
        "ALTER TABLE tLeaveRequest ADD COLUMN teacher_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING'",
        "ALTER TABLE tLeaveRequest ADD COLUMN manager_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING'",
        "ALTER TABLE tLeaveRequest ADD COLUMN dorm_manager_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING'",
        "ALTER TABLE tLeaveRequest ADD COLUMN is_active INT DEFAULT 1",
    ):
        try:
            cursor.execute(column_sql)
        except Exception:
            pass

def parse_date(value):
    if not value:
        return get_today()
    return datetime.strptime(value, '%Y-%m-%d').date()

def parse_month(value):
    if not value:
        today = get_today()
        return today.year, today.month
    parsed = datetime.strptime(value, '%Y-%m')
    return parsed.year, parsed.month

def month_bounds(year, month):
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end

def meal_datetime(meal_date, meal_type):
    return datetime.combine(meal_date, time(11, 30) if meal_type == 'LUNCH' else time(18, 0))

def load_students(cursor, role_name, username, class_name=None):
    where = "WHERE s.is_active = 1"
    params = []
    if role_name == 'student':
        where += " AND s.id_VNeID = %s"
        params.append(username)
    elif role_name == 'teacher':
        where += """
          AND EXISTS (
              SELECT 1
              FROM MANAGE m
              JOIN tClass managed_class ON m.id_class = managed_class.id AND managed_class.is_active = 1
              WHERE m.id_teacher = %s
                AND m.is_active = 1
                AND managed_class.id = st.id_class
          )
        """
        params.append(username)
        if class_name:
            where += " AND c.name = %s"
            params.append(class_name)
    elif class_name:
        where += " AND c.name = %s"
        params.append(class_name)

    cursor.execute(f"""
        SELECT s.id_VNeID, s.name, c.name AS class_name
        FROM tStudent s
        LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
        LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
        {where}
        ORDER BY c.name, s.name
    """, params)
    return cursor.fetchall()

def load_leaves(cursor, student_ids, start_day, end_day):
    if not student_ids:
        return []
    placeholders = ','.join(['%s'] * len(student_ids))
    cursor.execute(f"""
        SELECT c.*, p.decided_at AS parent_decided_at
        FROM tLeaveRequest c
        LEFT JOIN tLeaveRequest p ON c.recurring_parent_id = p.id
        WHERE c.id_student IN ({placeholders})
          AND c.is_active = 1
          AND (c.leave_type <> 'REGULAR_WEEKEND' OR c.recurring_parent_id IS NOT NULL)
          AND c.start_time <= %s
          AND c.end_time >= %s
    """, student_ids + [
        datetime.combine(end_day, time(23, 59, 59)),
        datetime.combine(start_day, time.min)
    ])
    return cursor.fetchall()

def leave_cuts_meal(leave_row, meal_dt, meal_type=None):
    status = leave_effective_status(leave_row)
    if status != 'ACCEPTED':
        return False

    start_time = leave_row['start_time']
    end_time = leave_row['end_time']
    leave_type = leave_row.get('leave_type')

    if leave_type == 'AFTER_SCHOOL':
        # Đơn ra ngoài sau giờ học: Không cắt cơm
        return False

    # Bữa ăn phải nằm trong khoảng thời gian nghỉ phép của đơn
    if not (start_time <= meal_dt <= end_time):
        return False

    approval_time = leave_row.get('decided_at') or leave_row.get('parent_decided_at') or leave_row.get('created_at')
    if not approval_time:
        approval_time = leave_row.get('created_at')

    approval_date = approval_time.date()
    approval_t = approval_time.time()

    # Quy tắc giờ cắt cơm tự động:
    # 1. Nếu duyệt đơn trước 10h sáng (< 10:00): Cắt cơm từ bữa trưa ngày hôm đó trở đi
    # 2. Nếu duyệt đơn trước 15h (< 15:00): Cắt cơm từ bữa tối ngày hôm đó trở đi (bữa trưa ngày hôm đó KHÔNG bị cắt)
    # 3. Còn sau khung giờ trên (>= 15:00): Cắt từ bữa trưa của ngày hôm sau trở đi
    if approval_t < time(10, 0):
        cut_start = datetime.combine(approval_date, time(11, 30))
    elif approval_t < time(15, 0):
        cut_start = datetime.combine(approval_date, time(18, 0))
    else:
        cut_start = datetime.combine(approval_date + timedelta(days=1), time(11, 30))

    return meal_dt >= cut_start

def get_meal_cut_state(leaves, meal_dt, meal_type=None):
    for leave in leaves:
        if leave_cuts_meal(leave, meal_dt, meal_type):
            return True, leave['id']
    return False, None

def sync_students_meal_attendance(cursor, student_ids, start_day, end_day):
    if not student_ids:
        return

    # 1. Load leaves (cắt cơm tự động dựa trên đơn nghỉ phép đã duyệt)
    leaves = load_leaves(cursor, student_ids, start_day, end_day)
    leaves_by_student = {student_id: [] for student_id in student_ids}
    for leave in leaves:
        leaves_by_student.setdefault(leave['id_student'], []).append(leave)

    # 2. Process day-by-day and meal-by-meal
    days = []
    current = start_day
    while current <= end_day:
        days.append(current)
        current += timedelta(days=1)

    for day in days:
        for student_id in student_ids:
            student_leaves = leaves_by_student.get(student_id, [])

            for meal_type in ('LUNCH', 'DINNER'):
                meal_dt = meal_datetime(day, meal_type)
                is_cut, reason_leave_id = get_meal_cut_state(student_leaves, meal_dt, meal_type)
                note = "Cắt cơm theo đơn nghỉ phép" if is_cut else None

                cursor.execute("""
                    INSERT INTO tMealAttendance (meal_date, meal_type, id_student, is_cut, reason_leave_id, note)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        is_cut = IF(note LIKE 'Cập nhật bởi %%', is_cut, VALUES(is_cut)),
                        reason_leave_id = IF(note LIKE 'Cập nhật bởi %%', reason_leave_id, VALUES(reason_leave_id)),
                        note = IF(note LIKE 'Cập nhật bởi %%', note, VALUES(note))
                """, (day, meal_type, student_id, int(is_cut), reason_leave_id, note))

def sync_meal_attendance(cursor, start_day, end_day, role_name, username, class_name=None):
    if end_day < start_day:
        return [], []

    students = load_students(cursor, role_name, username, class_name)
    student_ids = [student['id_VNeID'] for student in students]

    sync_students_meal_attendance(cursor, student_ids, start_day, end_day)

    days = []
    current = start_day
    while current <= end_day:
        days.append(current)
        current += timedelta(days=1)

    return students, days

@meal_bp.route('/attendance', methods=['GET'])
def get_meal_attendance():
    username = request.args.get('username')
    role_name = normalize_role(request.args.get('role_name'))
    meal_date = parse_date(request.args.get('date'))

    if role_name not in {'student', 'teacher', 'manager', 'canteen_manager'}:
        return jsonify({"success": False, "message": "Không có quyền truy cập"}), 403

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_meal_schema(cursor)

        students = load_students(cursor, role_name, username)
        student_ids = [student['id_VNeID'] for student in students]

        sync_students_meal_attendance(cursor, student_ids, meal_date, meal_date)
        conn.commit()

        if not student_ids:
            rows = []
        else:
            placeholders = ','.join(['%s'] * len(student_ids))
            cursor.execute(f"""
            SELECT s.id_VNeID, s.name, c.name AS class_name,
                   lunch.is_cut AS lunch_cut, lunch.note AS lunch_note, lunch.reason_leave_id AS lunch_reason_leave_id,
                   dinner.is_cut AS dinner_cut, dinner.note AS dinner_note, dinner.reason_leave_id AS dinner_reason_leave_id
            FROM tStudent s
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            LEFT JOIN tMealAttendance lunch
              ON lunch.id_student = s.id_VNeID AND lunch.meal_date = %s AND lunch.meal_type = 'LUNCH'
            LEFT JOIN tMealAttendance dinner
              ON dinner.id_student = s.id_VNeID AND dinner.meal_date = %s AND dinner.meal_type = 'DINNER'
            WHERE s.is_active = 1 AND s.id_VNeID IN ({placeholders})
            ORDER BY c.name, s.name
        """, [meal_date, meal_date] + student_ids)
            rows = cursor.fetchall()

            for r in rows:
                r['lunch_cut'] = bool(r['lunch_cut'])
                r['dinner_cut'] = bool(r['dinner_cut'])

        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@meal_bp.route('/monthly', methods=['GET'])
def get_monthly_meal_attendance():
    username = request.args.get('username')
    role_name = normalize_role(request.args.get('role_name'))
    class_name = request.args.get('class_name')
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    if role_name not in {'student', 'teacher', 'manager', 'canteen_manager'}:
        return jsonify({"success": False, "message": "Không có quyền truy cập"}), 403

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_meal_schema(cursor)

        if start_date_str and end_date_str:
            start_day = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_day = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        else:
            year, month = parse_month(request.args.get('month'))
            start_day, end_day = month_bounds(year, month)

        students, synced_days = sync_meal_attendance(cursor, start_day, end_day, role_name, username, class_name)
        conn.commit()

        days = []
        current = start_day
        while current <= end_day:
            days.append(current.strftime('%Y-%m-%d'))
            current += timedelta(days=1)

        student_ids = [student['id_VNeID'] for student in students]
        attendance = {student_id: {} for student_id in student_ids}
        if student_ids:
            placeholders = ','.join(['%s'] * len(student_ids))
            cursor.execute(f"""
                SELECT meal_date, meal_type, id_student, is_cut, note
                FROM tMealAttendance
                WHERE id_student IN ({placeholders})
                  AND meal_date BETWEEN %s AND %s
            """, student_ids + [start_day, end_day])
            for row in cursor.fetchall():
                day_data = attendance.setdefault(row['id_student'], {}).setdefault(
                    row['meal_date'].strftime('%Y-%m-%d'),
                    {
                        'lunch_cut': False, 'lunch_note': None,
                        'dinner_cut': False, 'dinner_note': None
                    }
                )
                day_data[f"{row['meal_type'].lower()}_cut"] = bool(row['is_cut'])
                day_data[f"{row['meal_type'].lower()}_note"] = row['note']

        rows = []
        for student in students:
            meals = {}
            for day_text in days:
                meals[day_text] = attendance.get(student['id_VNeID'], {}).get(day_text, {
                    'lunch_cut': False, 'lunch_note': None,
                    'dinner_cut': False, 'dinner_note': None
                })
            rows.append({**student, "meals": meals})

        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": {"days": days, "students": rows}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@meal_bp.route('/update', methods=['POST'])
def update_meal_attendance():
    data = request.json or {}
    role_name = normalize_role(data.get('role_name'))
    username = (data.get('username') or '').strip()

    student_id = data.get('student_id')
    meal_date_str = data.get('meal_date')
    meal_type = data.get('meal_type')
    is_cut_val = data.get('is_cut')  # boolean (True: cắt cơm, False: có ăn cơm)

    if not meal_date_str or not meal_type or is_cut_val is None:
        return jsonify({"success": False, "message": "Thiếu thông tin bắt buộc"}), 400

    if meal_type not in {'LUNCH', 'DINNER'}:
        return jsonify({"success": False, "message": "Loại bữa ăn không hợp lệ"}), 400

    try:
        meal_date = datetime.strptime(meal_date_str, '%Y-%m-%d').date()
    except Exception:
        return jsonify({"success": False, "message": "Định dạng ngày không hợp lệ (YYYY-MM-DD)"}), 400

    if role_name not in {'student', 'teacher', 'manager', 'canteen_manager'}:
        return jsonify({"success": False, "message": "Không có quyền thực hiện hành động này"}), 403

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Xác định student_id theo quyền hạn
        if role_name == 'student':
            student_id = username
        else:
            if not student_id:
                cursor.close()
                conn.close()
                return jsonify({"success": False, "message": "Thiếu mã học sinh"}), 400

            if role_name == 'teacher':
                cursor.execute("""
                    SELECT 1
                    FROM STUDY st
                    JOIN MANAGE m ON st.id_class = m.id_class
                    WHERE st.id_student = %s AND m.id_teacher = %s AND st.is_active = 1 AND m.is_active = 1
                """, (student_id, username))
                if not cursor.fetchone():
                    cursor.close()
                    conn.close()
                    return jsonify({"success": False, "message": "Bạn không quản lý học sinh này"}), 403

        # Kiểm tra thời hạn: Học sinh bị ràng buộc quy tắc 2 ngày trước; Cán bộ (canteen_manager, manager, teacher) có thể điều chỉnh linh hoạt
        now = get_now()
        if role_name == 'student':
            meal_dt = meal_datetime(meal_date, meal_type)
            deadline = meal_dt - timedelta(days=2)
            if now > deadline:
                cursor.close()
                conn.close()
                return jsonify({
                    "success": False, 
                    "message": f"Học sinh chỉ được báo cơm trước ít nhất 2 ngày. Hạn chót là trước {deadline.strftime('%d/%m/%Y %H:%M')}"
                }), 400

        # Cập nhật trạng thái
        note = f"Cập nhật bởi {role_name} ({username}) lúc {now.strftime('%d/%m/%Y %H:%M:%S')}"
        cursor.execute("""
            INSERT INTO tMealAttendance (meal_date, meal_type, id_student, is_cut, reason_leave_id, note)
            VALUES (%s, %s, %s, %s, NULL, %s)
            ON DUPLICATE KEY UPDATE
                is_cut = VALUES(is_cut),
                reason_leave_id = NULL,
                note = VALUES(note)
        """, (meal_date, meal_type, student_id, int(is_cut_val), note))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({
            "success": True, 
            "message": "Đã cập nhật trạng thái báo cơm thành công", 
            "data": {
                "student_id": student_id,
                "meal_date": meal_date_str,
                "meal_type": meal_type,
                "is_cut": bool(is_cut_val)
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@meal_bp.route('/export', methods=['GET'])
def export_meal_report():
    username = request.args.get('username')
    role_name = normalize_role(request.args.get('role_name'))
    class_name = request.args.get('class_name')
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    if role_name not in {'student', 'teacher', 'manager', 'canteen_manager'}:
        return jsonify({"success": False, "message": "Không có quyền truy cập"}), 403

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_meal_schema(cursor)

        if start_date_str and end_date_str:
            start_day = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_day = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        else:
            year, month = parse_month(request.args.get('month'))
            start_day, end_day = month_bounds(year, month)

        students, synced_days = sync_meal_attendance(cursor, start_day, end_day, role_name, username, class_name)
        conn.commit()

        student_ids = [student['id_VNeID'] for student in students]
        attendance = {student_id: {} for student_id in student_ids}
        if student_ids:
            placeholders = ','.join(['%s'] * len(student_ids))
            cursor.execute(f"""
                SELECT meal_date, meal_type, id_student, is_cut, note
                FROM tMealAttendance
                WHERE id_student IN ({placeholders})
                  AND meal_date BETWEEN %s AND %s
            """, student_ids + [start_day, end_day])
            for row in cursor.fetchall():
                day_data = attendance.setdefault(row['id_student'], {}).setdefault(
                    row['meal_date'].strftime('%Y-%m-%d'),
                    {'lunch_cut': False, 'dinner_cut': False}
                )
                day_data[f"{row['meal_type'].lower()}_cut"] = bool(row['is_cut'])

        cursor.close()
        conn.close()

        headers = [
            "STT", "Mã định danh (VNeID)", "Họ và tên", "Lớp",
            "Số bữa cắt trưa", "Số bữa cắt tối", "Tổng bữa cắt", "Chi tiết ngày cắt cơm"
        ]

        data_rows = []
        for idx, student in enumerate(students, 1):
            s_id = student['id_VNeID']
            s_att = attendance.get(s_id, {})
            lunch_cuts = 0
            dinner_cuts = 0
            cut_details = []

            curr = start_day
            while curr <= end_day:
                d_str = curr.strftime('%Y-%m-%d')
                day_info = s_att.get(d_str, {'lunch_cut': False, 'dinner_cut': False})
                cuts_today = []
                if day_info.get('lunch_cut'):
                    lunch_cuts += 1
                    cuts_today.append("Trưa")
                if day_info.get('dinner_cut'):
                    dinner_cuts += 1
                    cuts_today.append("Tối")
                if cuts_today:
                    cut_details.append(f"{curr.strftime('%d/%m')}: {', '.join(cuts_today)}")
                curr += timedelta(days=1)

            total_cuts = lunch_cuts + dinner_cuts
            data_rows.append([
                idx,
                s_id,
                student.get('name', ''),
                student.get('class_name', ''),
                lunch_cuts,
                dinner_cuts,
                total_cuts,
                "; ".join(cut_details) if cut_details else "Không có"
            ])

        filename = f"bao_cao_an_com_{start_day.strftime('%Y%m%d')}_{end_day.strftime('%Y%m%d')}.xlsx"
        return generate_excel_response(headers, data_rows, filename, sheet_name="Báo cáo ăn cơm")
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật']

@meal_bp.route('/menu/week', methods=['GET'])
def get_weekly_menu():
    date_str = request.args.get('date')
    target_date = parse_date(date_str) if date_str else get_today()

    start_monday = target_date - timedelta(days=target_date.weekday())
    end_sunday = start_monday + timedelta(days=6)

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_meal_schema(cursor)

        cursor.execute("""
            SELECT *
            FROM tWeeklyMenu
            WHERE menu_date BETWEEN %s AND %s
            ORDER BY menu_date ASC, meal_type DESC
        """, (start_monday, end_sunday))
        rows = cursor.fetchall()

        menus_by_day = {}
        for r in rows:
            d_str = r['menu_date'].strftime('%Y-%m-%d')
            m_type = r['meal_type'].upper()
            if d_str not in menus_by_day:
                menus_by_day[d_str] = {}
            menus_by_day[d_str][m_type] = {
                "id": r['id'],
                "rice": r.get('rice') or 'Cơm trắng',
                "main_dish_1": r.get('main_dish_1') or '',
                "main_dish_2": r.get('main_dish_2') or '',
                "side_dish": r.get('side_dish') or '',
                "soup": r.get('soup') or '',
                "dessert": r.get('dessert') or '',
                "note": r.get('note') or ''
            }

        days = []
        curr = start_monday
        today_date = get_today()
        while curr <= end_sunday:
            d_str = curr.strftime('%Y-%m-%d')
            weekday_idx = curr.weekday()
            day_menus = menus_by_day.get(d_str, {})
            days.append({
                "date": d_str,
                "day_name": DAY_NAMES[weekday_idx],
                "is_today": (curr == today_date),
                "lunch": day_menus.get('LUNCH', {
                    "rice": "Cơm trắng",
                    "main_dish_1": "",
                    "main_dish_2": "",
                    "side_dish": "",
                    "soup": "",
                    "dessert": "",
                    "note": ""
                }),
                "dinner": day_menus.get('DINNER', {
                    "rice": "Cơm trắng",
                    "main_dish_1": "",
                    "main_dish_2": "",
                    "side_dish": "",
                    "soup": "",
                    "dessert": "",
                    "note": ""
                })
            })
            curr += timedelta(days=1)

        cursor.close()
        conn.close()
        return jsonify({
            "success": True,
            "data": {
                "week_start": start_monday.strftime('%Y-%m-%d'),
                "week_end": end_sunday.strftime('%Y-%m-%d'),
                "days": days
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

def resolve_account_username(cursor, username):
    val = (username or '').strip()
    if not val:
        return None
    cursor.execute("SELECT username FROM tAccount WHERE username = %s LIMIT 1", (val,))
    return val if cursor.fetchone() else None

@meal_bp.route('/menu/save', methods=['POST'])
def save_weekly_menu():
    data = request.json or {}
    role_name = normalize_role(data.get('role_name'))
    raw_username = data.get('username')

    if role_name not in {'canteen_manager', 'manager', 'admin'}:
        return jsonify({"success": False, "message": "Chỉ Quản lý nhà ăn hoặc Ban giám hiệu mới có quyền sửa thực đơn"}), 403

    days = data.get('days') or []
    if not days:
        return jsonify({"success": False, "message": "Không có dữ liệu thực đơn để lưu"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        ensure_meal_schema(cursor)
        username = resolve_account_username(cursor, raw_username)

        for d in days:
            date_str = d.get('date')
            if not date_str:
                continue
            for meal_type in ('LUNCH', 'DINNER'):
                m = d.get(meal_type.lower()) or {}
                # Kiểm tra có nhập món hay không
                if not (m.get('main_dish_1') or m.get('main_dish_2') or m.get('side_dish') or m.get('soup')):
                    continue
                cursor.execute("""
                    INSERT INTO tWeeklyMenu (menu_date, meal_type, rice, main_dish_1, main_dish_2, side_dish, soup, dessert, note, created_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        rice = VALUES(rice),
                        main_dish_1 = VALUES(main_dish_1),
                        main_dish_2 = VALUES(main_dish_2),
                        side_dish = VALUES(side_dish),
                        soup = VALUES(soup),
                        dessert = VALUES(dessert),
                        note = VALUES(note),
                        created_by = VALUES(created_by)
                """, (
                    date_str,
                    meal_type,
                    m.get('rice') or 'Cơm trắng',
                    m.get('main_dish_1') or '',
                    m.get('main_dish_2') or '',
                    m.get('side_dish') or '',
                    m.get('soup') or '',
                    m.get('dessert') or '',
                    m.get('note') or '',
                    username
                ))

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Đã lưu thực đơn thành công!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@meal_bp.route('/menu/copy-previous-week', methods=['POST'])
def copy_previous_week_menu():
    data = request.json or {}
    role_name = normalize_role(data.get('role_name'))
    raw_username = data.get('username')

    if role_name not in {'canteen_manager', 'manager', 'admin'}:
        return jsonify({"success": False, "message": "Không có quyền thực hiện"}), 403

    current_start_str = data.get('week_start')
    if not current_start_str:
        return jsonify({"success": False, "message": "Thiếu thông tin ngày đầu tuần"}), 400

    try:
        curr_monday = datetime.strptime(current_start_str, '%Y-%m-%d').date()
        prev_monday = curr_monday - timedelta(days=7)
        prev_sunday = prev_monday + timedelta(days=6)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_meal_schema(cursor)
        username = resolve_account_username(cursor, raw_username)

        cursor.execute("""
            SELECT *
            FROM tWeeklyMenu
            WHERE menu_date BETWEEN %s AND %s
        """, (prev_monday, prev_sunday))
        prev_menus = cursor.fetchall()

        if not prev_menus:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Tuần trước chưa có thực đơn để sao chép"}), 400

        for m in prev_menus:
            diff_days = (m['menu_date'] - prev_monday).days
            target_date = curr_monday + timedelta(days=diff_days)
            cursor.execute("""
                INSERT INTO tWeeklyMenu (menu_date, meal_type, rice, main_dish_1, main_dish_2, side_dish, soup, dessert, note, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    rice = VALUES(rice),
                    main_dish_1 = VALUES(main_dish_1),
                    main_dish_2 = VALUES(main_dish_2),
                    side_dish = VALUES(side_dish),
                    soup = VALUES(soup),
                    dessert = VALUES(dessert),
                    note = VALUES(note),
                    created_by = VALUES(created_by)
            """, (
                target_date,
                m['meal_type'],
                m['rice'],
                m['main_dish_1'],
                m['main_dish_2'],
                m['side_dish'],
                m['soup'],
                m['dessert'],
                m['note'],
                username
            ))

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã sao chép thành công {len(prev_menus)} bữa ăn từ thực đơn tuần trước!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@meal_bp.route('/statistics', methods=['GET'])
def get_meal_statistics():
    role_name = normalize_role(request.args.get('role_name'))
    username = request.args.get('username')
    stat_type = request.args.get('type') or 'day'  # 'day' hoặc 'week'
    date_str = request.args.get('date')
    class_filter = request.args.get('class_name')

    if role_name not in {'manager', 'admin', 'canteen_manager'}:
        return jsonify({"success": False, "message": "Chỉ Quản lý nhà ăn và Ban giám hiệu mới có quyền xem thống kê"}), 403

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_meal_schema(cursor)

        target_date = parse_date(date_str) if date_str else get_today()

        if stat_type == 'day':
            start_date = target_date
            end_date = target_date
        else:
            start_monday = target_date - timedelta(days=target_date.weekday())
            end_sunday = start_monday + timedelta(days=6)
            start_date = start_monday
            end_date = end_sunday

        students = load_students(cursor, role_name, username)
        student_ids = [s['id_VNeID'] for s in students]
        sync_students_meal_attendance(cursor, student_ids, start_date, end_date)
        conn.commit()

        classes_set = set()
        students_by_class = {}
        for s in students:
            c_name = s.get('class_name') or 'Chưa phân lớp'
            classes_set.add(c_name)
            students_by_class.setdefault(c_name, []).append(s['id_VNeID'])

        sorted_classes = sorted(list(classes_set), key=lambda x: (x == 'Chưa phân lớp', x))
        if class_filter and class_filter in classes_set:
            sorted_classes = [class_filter]

        if student_ids:
            placeholders = ','.join(['%s'] * len(student_ids))
            cursor.execute(f"""
                SELECT meal_date, meal_type, id_student, is_cut
                FROM tMealAttendance
                WHERE id_student IN ({placeholders})
                  AND meal_date BETWEEN %s AND %s
            """, student_ids + [start_date, end_date])
            att_rows = cursor.fetchall()
        else:
            att_rows = []

        att_map = {}
        for r in att_rows:
            d_s = r['meal_date'].strftime('%Y-%m-%d')
            m_t = r['meal_type'].upper()
            att_map[(r['id_student'], d_s, m_t)] = bool(r['is_cut'])

        if stat_type == 'day':
            cur_date_str = target_date.strftime('%Y-%m-%d')
            by_class_data = []

            school_total_students = 0
            school_lunch_eating = 0
            school_lunch_cut = 0
            school_dinner_eating = 0
            school_dinner_cut = 0

            for c_name in sorted_classes:
                c_students = students_by_class.get(c_name, [])
                c_count = len(c_students)
                l_eating, l_cut, d_eating, d_cut = 0, 0, 0, 0
                for s_id in c_students:
                    if att_map.get((s_id, cur_date_str, 'LUNCH'), False):
                        l_cut += 1
                    else:
                        l_eating += 1
                    if att_map.get((s_id, cur_date_str, 'DINNER'), False):
                        d_cut += 1
                    else:
                        d_eating += 1

                school_total_students += c_count
                school_lunch_eating += l_eating
                school_lunch_cut += l_cut
                school_dinner_eating += d_eating
                school_dinner_cut += d_cut

                by_class_data.append({
                    "class_name": c_name,
                    "student_count": c_count,
                    "lunch_eating": l_eating,
                    "lunch_cut": l_cut,
                    "dinner_eating": d_eating,
                    "dinner_cut": d_cut,
                    "total_eating": l_eating + d_eating,
                    "total_cut": l_cut + d_cut
                })

            cursor.close()
            conn.close()
            return jsonify({
                "success": True,
                "data": {
                    "type": "day",
                    "date": cur_date_str,
                    "day_name": DAY_NAMES[target_date.weekday()],
                    "school_summary": {
                        "total_students": school_total_students,
                        "lunch_eating": school_lunch_eating,
                        "lunch_cut": school_lunch_cut,
                        "dinner_eating": school_dinner_eating,
                        "dinner_cut": school_dinner_cut,
                        "total_eating": school_lunch_eating + school_dinner_eating,
                        "total_cut": school_lunch_cut + school_dinner_cut
                    },
                    "by_class": by_class_data,
                    "classes": sorted(list(classes_set))
                }
            })
        else:
            week_days = []
            curr = start_date
            while curr <= end_date:
                week_days.append(curr)
                curr += timedelta(days=1)

            daily_summaries = []
            for d in week_days:
                d_s = d.strftime('%Y-%m-%d')
                l_e, l_c, d_e, d_c = 0, 0, 0, 0
                for s_id in student_ids:
                    if att_map.get((s_id, d_s, 'LUNCH'), False):
                        l_c += 1
                    else:
                        l_e += 1
                    if att_map.get((s_id, d_s, 'DINNER'), False):
                        d_c += 1
                    else:
                        d_e += 1
                daily_summaries.append({
                    "date": d_s,
                    "day_name": DAY_NAMES[d.weekday()],
                    "lunch_eating": l_e,
                    "lunch_cut": l_c,
                    "dinner_eating": d_e,
                    "dinner_cut": d_c,
                    "total_eating": l_e + d_e,
                    "total_cut": l_c + d_c
                })

            class_matrix = []
            for c_name in sorted_classes:
                c_students = students_by_class.get(c_name, [])
                c_count = len(c_students)
                day_breakdown = {}
                c_total_l_eating = 0
                c_total_d_eating = 0
                c_total_l_cut = 0
                c_total_d_cut = 0

                for d in week_days:
                    d_s = d.strftime('%Y-%m-%d')
                    dl_e, dl_c, dd_e, dd_c = 0, 0, 0, 0
                    for s_id in c_students:
                        if att_map.get((s_id, d_s, 'LUNCH'), False):
                            dl_c += 1
                        else:
                            dl_e += 1
                        if att_map.get((s_id, d_s, 'DINNER'), False):
                            dd_c += 1
                        else:
                            dd_e += 1
                    day_breakdown[d_s] = {
                        "lunch_eating": dl_e,
                        "lunch_cut": dl_c,
                        "dinner_eating": dd_e,
                        "dinner_cut": dd_c,
                        "total_eating": dl_e + dd_e,
                        "total_cut": dl_c + dd_c
                    }
                    c_total_l_eating += dl_e
                    c_total_l_cut += dl_c
                    c_total_d_eating += dd_e
                    c_total_d_cut += dd_c

                class_matrix.append({
                    "class_name": c_name,
                    "student_count": c_count,
                    "days": day_breakdown,
                    "total_lunch_eating": c_total_l_eating,
                    "total_dinner_eating": c_total_d_eating,
                    "total_eating": c_total_l_eating + c_total_d_eating,
                    "total_cut": c_total_l_cut + c_total_d_cut
                })

            grand_total_eating = sum(d['total_eating'] for d in daily_summaries)
            grand_total_cut = sum(d['total_cut'] for d in daily_summaries)

            cursor.close()
            conn.close()
            return jsonify({
                "success": True,
                "data": {
                    "type": "week",
                    "week_start": start_date.strftime('%Y-%m-%d'),
                    "week_end": end_date.strftime('%Y-%m-%d'),
                    "days": [d.strftime('%Y-%m-%d') for d in week_days],
                    "day_names": [DAY_NAMES[d.weekday()] for d in week_days],
                    "daily_summaries": daily_summaries,
                    "by_class": class_matrix,
                    "classes": sorted(list(classes_set)),
                    "grand_total": {
                        "total_students": len(student_ids),
                        "total_eating": grand_total_eating,
                        "total_cut": grand_total_cut
                    }
                }
            })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

