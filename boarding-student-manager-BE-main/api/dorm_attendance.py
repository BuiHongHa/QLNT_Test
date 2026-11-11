from flask import Blueprint, request, jsonify
from config import get_db_connection
from mock_time import get_today, get_now
from datetime import datetime, date
from excel_utils import generate_excel_response

dorm_attendance_bp = Blueprint('dorm_attendance', __name__)

def ensure_dorm_attendance_schema(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tDormAttendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            attendance_date DATE NOT NULL,
            id_dormroom VARCHAR(20) NOT NULL,
            id_student CHAR(12) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'PRESENT',
            note VARCHAR(255) NULL,
            recorded_by CHAR(12) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_attendance (attendance_date, id_student),
            KEY idx_date_room (attendance_date, id_dormroom),
            CONSTRAINT fk_att_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON UPDATE CASCADE ON DELETE RESTRICT,
            CONSTRAINT fk_att_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON UPDATE CASCADE ON DELETE RESTRICT,
            CONSTRAINT fk_att_recorder FOREIGN KEY (recorded_by) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """)

def normalize_role(role_name):
    return (role_name or '').strip().lower()

def teacher_room_clause(room_expr):
    return f"""
        EXISTS (
            SELECT 1
            FROM LIVING l_teacher
            JOIN STUDY st_teacher ON l_teacher.id_student = st_teacher.id_student AND st_teacher.is_active = 1
            JOIN tClass c_teacher ON st_teacher.id_class = c_teacher.id AND c_teacher.is_active = 1
            JOIN MANAGE m_teacher ON c_teacher.id = m_teacher.id_class AND m_teacher.is_active = 1
            WHERE l_teacher.id_dormroom = {room_expr}
              AND l_teacher.is_active = 1
              AND m_teacher.id_teacher = %s
        )
    """

# ── 1. Danh sách phòng kèm trạng thái điểm danh trong ngày ──
@dorm_attendance_bp.route('/rooms', methods=['GET'])
def get_rooms_attendance():
    date_str = request.args.get('date', str(get_today()))
    role = normalize_role(request.args.get('role_name'))
    username = request.args.get('username', '')

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_dorm_attendance_schema(cursor)
        conn.commit()

        # Lấy tất cả phòng KTX còn hoạt động
        sql = """
            SELECT d.id, d.name, d.num_of_bed,
                   COUNT(DISTINCT l.id_student) AS total_students
            FROM tDormroom d
            LEFT JOIN LIVING l ON d.id = l.id_dormroom AND l.is_active = 1
            WHERE d.is_active = 1
        """
        params = []
        if role == 'teacher':
            sql += f" AND {teacher_room_clause('d.id')}"
            params.append(username)

        sql += " GROUP BY d.id, d.name, d.num_of_bed ORDER BY d.id"
        cursor.execute(sql, params)
        rooms = cursor.fetchall()

        # Lấy thống kê điểm danh cho ngày date_str
        cursor.execute("""
            SELECT id_dormroom,
                   COUNT(*) AS checked_count,
                   SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present_count,
                   SUM(CASE WHEN status = 'ABSENT_LEAVE' THEN 1 ELSE 0 END) AS leave_count,
                   SUM(CASE WHEN status = 'ABSENT_UNEXCUSED' THEN 1 ELSE 0 END) AS unexcused_count
            FROM tDormAttendance
            WHERE attendance_date = %s
            GROUP BY id_dormroom
        """, (date_str,))
        att_map = {row['id_dormroom']: row for row in cursor.fetchall()}

        result = []
        for r in rooms:
            rid = r['id']
            att = att_map.get(rid, {})
            tot = r['total_students'] or 0
            chk = att.get('checked_count', 0)
            result.append({
                'id': rid,
                'name': r['name'],
                'num_of_bed': r['num_of_bed'],
                'total_students': tot,
                'checked_count': chk,
                'present_count': att.get('present_count', 0),
                'leave_count': att.get('leave_count', 0),
                'unexcused_count': att.get('unexcused_count', 0),
                'is_checked': chk > 0 and chk >= tot if tot > 0 else (chk > 0)
            })

        cursor.close()
        conn.close()
        return jsonify({"success": True, "date": date_str, "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── 2. Chi tiết điểm danh học sinh của 1 phòng trong ngày ──
@dorm_attendance_bp.route('/room/<room_id>', methods=['GET'])
def get_room_students_attendance(room_id):
    date_str = request.args.get('date', str(get_today()))

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_dorm_attendance_schema(cursor)
        conn.commit()

        # 1. Lấy thông tin phòng
        cursor.execute("SELECT id, name, num_of_bed FROM tDormroom WHERE id = %s AND is_active = 1", (room_id,))
        room = cursor.fetchone()
        if not room:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "error": "Phòng không tồn tại hoặc đã bị vô hiệu"}), 404

        # 2. Lấy danh sách học sinh đang ở phòng
        cursor.execute("""
            SELECT s.id_VNeID, s.name, s.phone_number,
                   c.name AS class_name
            FROM LIVING l
            JOIN tStudent s ON l.id_student = s.id_VNeID AND s.is_active = 1
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            WHERE l.id_dormroom = %s AND l.is_active = 1
            ORDER BY s.name
        """, (room_id,))
        students = cursor.fetchall()

        # 3. Lấy bản ghi điểm danh đã lưu (nếu có)
        cursor.execute("""
            SELECT id_student, status, note, recorded_by, updated_at
            FROM tDormAttendance
            WHERE attendance_date = %s AND id_dormroom = %s
        """, (date_str, room_id))
        saved_att = {row['id_student']: row for row in cursor.fetchall()}

        # 4. Truy vấn đơn nghỉ phép đã duyệt cho ngày này
        student_ids = [s['id_VNeID'] for s in students]
        leaves_map = {}
        if student_ids:
            placeholders = ','.join(['%s'] * len(student_ids))
            query = f"""
                SELECT id, id_student, leave_type, start_time, end_time, reason
                FROM tLeaveRequest
                WHERE id_student IN ({placeholders})
                  AND is_active = 1
                  AND (
                      (leave_type = 'REGULAR_WEEKEND' AND teacher_accept = 'ACCEPTED' AND manager_accept = 'ACCEPTED')
                      OR (leave_type = 'EMERGENCY' AND manager_accept = 'ACCEPTED')
                      OR (leave_type = 'AFTER_SCHOOL' AND dorm_manager_accept = 'ACCEPTED')
                  )
                  AND DATE(start_time) <= %s
                  AND DATE(end_time) >= %s
                ORDER BY id DESC
            """
            cursor.execute(query, student_ids + [date_str, date_str])
            for lv in cursor.fetchall():
                # Chỉ lấy đơn nghỉ mới nhất nếu có nhiều đơn
                if lv['id_student'] not in leaves_map:
                    leaves_map[lv['id_student']] = {
                        'id': lv['id'],
                        'leave_type': lv['leave_type'],
                        'reason': lv['reason'],
                        'start_time': str(lv['start_time']),
                        'end_time': str(lv['end_time'])
                    }

        # 5. Tổng hợp dữ liệu trả về
        result_students = []
        for s in students:
            sid = s['id_VNeID']
            saved = saved_att.get(sid)
            leave_info = leaves_map.get(sid)

            if saved:
                status = saved['status']
                note = saved['note'] or ''
                is_saved = True
            else:
                # Gợi ý thông minh: nếu có đơn nghỉ phép -> ABSENT_LEAVE, ngược lại -> PRESENT
                status = 'ABSENT_LEAVE' if leave_info else 'PRESENT'
                note = f"Nghỉ phép: {leave_info['reason']}" if leave_info else ''
                is_saved = False

            result_students.append({
                'id_student': sid,
                'name': s['name'],
                'phone_number': s['phone_number'],
                'class_name': s['class_name'] or '',
                'status': status,
                'note': note,
                'is_saved': is_saved,
                'has_approved_leave': leave_info is not None,
                'leave_info': leave_info
            })

        cursor.close()
        conn.close()
        return jsonify({
            "success": True,
            "room": room,
            "date": date_str,
            "students": result_students
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── 3. Lưu kết quả điểm danh cho phòng ──
@dorm_attendance_bp.route('/save', methods=['POST'])
def save_room_attendance():
    data = request.get_json() or {}
    date_str = data.get('date') or str(get_today())
    room_id = data.get('id_dormroom')
    raw_recorded_by = (data.get('recorded_by') or '').strip() or None
    records = data.get('records', [])

    if not room_id or not records:
        return jsonify({"success": False, "error": "Thiếu thông tin phòng hoặc danh sách học sinh"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        ensure_dorm_attendance_schema(cursor)
        recorded_by = None
        if raw_recorded_by:
            cursor.execute("SELECT username FROM tAccount WHERE username = %s LIMIT 1", (raw_recorded_by,))
            if cursor.fetchone():
                recorded_by = raw_recorded_by

        upsert_sql = """
            INSERT INTO tDormAttendance (attendance_date, id_dormroom, id_student, status, note, recorded_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                note = VALUES(note),
                recorded_by = VALUES(recorded_by),
                updated_at = NOW()
        """

        for item in records:
            sid = item.get('id_student')
            st = item.get('status', 'PRESENT')
            nt = (item.get('note') or '').strip()
            if not sid:
                continue
            cursor.execute(upsert_sql, (date_str, room_id, sid, st, nt, recorded_by))

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã lưu điểm danh thành công cho {len(records)} học sinh"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── 4. Báo cáo & Thống kê tình hình vắng mặt theo ngày ──
@dorm_attendance_bp.route('/summary', methods=['GET'])
def get_attendance_summary():
    date_str = request.args.get('date', str(get_today()))
    role = normalize_role(request.args.get('role_name'))
    username = request.args.get('username', '')

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_dorm_attendance_schema(cursor)
        conn.commit()

        # Tổng số học sinh KTX
        stu_sql = """
            SELECT COUNT(DISTINCT l.id_student) AS total
            FROM LIVING l
            JOIN tStudent s ON l.id_student = s.id_VNeID AND s.is_active = 1
            JOIN tDormroom d ON l.id_dormroom = d.id AND d.is_active = 1
            WHERE l.is_active = 1
        """
        params = []
        if role == 'teacher':
            stu_sql += f" AND {teacher_room_clause('l.id_dormroom')}"
            params.append(username)
        cursor.execute(stu_sql, params)
        total_boarding = cursor.fetchone()['total'] or 0

        # Thống kê trạng thái điểm danh
        stat_sql = """
            SELECT a.status, COUNT(*) AS count
            FROM tDormAttendance a
            JOIN tDormroom d ON a.id_dormroom = d.id AND d.is_active = 1
            WHERE a.attendance_date = %s
        """
        params_stat = [date_str]
        if role == 'teacher':
            stat_sql += f" AND {teacher_room_clause('a.id_dormroom')}"
            params_stat.append(username)
        stat_sql += " GROUP BY a.status"
        cursor.execute(stat_sql, params_stat)
        stat_rows = cursor.fetchall()

        stats = {'PRESENT': 0, 'ABSENT_LEAVE': 0, 'ABSENT_UNEXCUSED': 0}
        for r in stat_rows:
            stats[r['status']] = r['count']

        # Danh sách học sinh vắng mặt (đặc biệt là không phép)
        absent_sql = """
            SELECT a.id, a.attendance_date, a.id_dormroom, d.name AS room_name,
                   a.id_student, s.name AS student_name, s.phone_number,
                   c.name AS class_name, t.name AS teacher_name,
                   a.status, a.note, a.recorded_by, a.updated_at
            FROM tDormAttendance a
            JOIN tDormroom d ON a.id_dormroom = d.id AND d.is_active = 1
            JOIN tStudent s ON a.id_student = s.id_VNeID
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            LEFT JOIN MANAGE m ON c.id = m.id_class AND m.is_active = 1
            LEFT JOIN tTeacher t ON m.id_teacher = t.id_VNeID
            WHERE a.attendance_date = %s AND a.status IN ('ABSENT_LEAVE', 'ABSENT_UNEXCUSED')
        """
        params_absent = [date_str]
        if role == 'teacher':
            absent_sql += f" AND {teacher_room_clause('a.id_dormroom')}"
            params_absent.append(username)
        absent_sql += " ORDER BY a.status DESC, d.name, s.name"
        cursor.execute(absent_sql, params_absent)
        absent_students = cursor.fetchall()

        for a in absent_students:
            a['attendance_date'] = str(a['attendance_date'])
            if a.get('updated_at'):
                a['updated_at'] = str(a['updated_at'])

        cursor.close()
        conn.close()
        return jsonify({
            "success": True,
            "date": date_str,
            "total_boarding": total_boarding,
            "stats": stats,
            "absent_students": absent_students
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── 5. Xuất báo cáo điểm danh ra file Excel (.xlsx) ──
@dorm_attendance_bp.route('/export', methods=['GET'])
def export_dorm_attendance():
    date_str = request.args.get('date', str(get_today()))
    room_id = request.args.get('room_id', '')
    role = normalize_role(request.args.get('role_name'))
    username = request.args.get('username', '')

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_dorm_attendance_schema(cursor)
        conn.commit()

        sql = """
            SELECT a.attendance_date, d.name AS room_name,
                   a.id_student, s.name AS student_name,
                   c.name AS class_name,
                   a.status, a.note, a.recorded_by
            FROM tDormAttendance a
            JOIN tDormroom d ON a.id_dormroom = d.id
            JOIN tStudent s ON a.id_student = s.id_VNeID
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            WHERE a.attendance_date = %s
        """
        params = [date_str]
        if room_id:
            sql += " AND a.id_dormroom = %s"
            params.append(room_id)
        if role == 'teacher':
            sql += f" AND {teacher_room_clause('a.id_dormroom')}"
            params.append(username)
        sql += " ORDER BY d.name, s.name"
        cursor.execute(sql, params)
        rows = cursor.fetchall()

        status_text_map = {
            'PRESENT': 'Có mặt',
            'ABSENT_LEAVE': 'Vắng có phép',
            'ABSENT_UNEXCUSED': 'Vắng không phép'
        }

        headers = [
            'STT', 'Ngày điểm danh', 'Phòng', 'Mã học sinh',
            'Họ và tên', 'Lớp', 'Trạng thái', 'Ghi chú', 'Người điểm danh'
        ]

        data_rows = []
        for idx, row in enumerate(rows, 1):
            data_rows.append([
                idx,
                str(row['attendance_date']),
                row['room_name'],
                row['id_student'],
                row['student_name'],
                row['class_name'] or '',
                status_text_map.get(row['status'], row['status']),
                row['note'] or '',
                row['recorded_by'] or ''
            ])

        cursor.close()
        conn.close()

        filename = f"diem_danh_ktx_{date_str}.xlsx"
        return generate_excel_response(headers, data_rows, filename, sheet_name="DiemDanhKTX")
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
