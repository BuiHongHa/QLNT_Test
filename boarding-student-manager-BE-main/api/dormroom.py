from flask import Blueprint, request, jsonify, Response
from config import get_db_connection
import csv
import io
from datetime import datetime
from mock_time import get_today
from excel_utils import generate_excel_response, read_file_rows

dormroom_bp = Blueprint('dormroom', __name__)

def clean_cell(value):
    return str(value).strip() if value is not None else ''

def read_csv_file(file):
    raw = file.stream.read()
    for enc in ('utf-8-sig', 'utf-8', 'cp1258', 'cp1252', 'latin-1'):
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return None

def parse_int(value, default=None):
    value = clean_cell(value)
    if value == '':
        return default
    return int(value)

def parse_date(value):
    value = clean_cell(value)
    if value == '':
        return get_today().strftime('%Y-%m-%d')
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            return datetime.strptime(value, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return value

def split_room_code(room_id):
    text = str(room_id or '')
    letters = ''.join(ch for ch in text if not ch.isdigit()).lower()
    digits = ''.join(ch for ch in text if ch.isdigit())
    return letters, int(digits) if digits else 0, text.lower()

def count_active_students(cursor, room_id):
    cursor.execute(
        "SELECT COUNT(*) AS total FROM LIVING WHERE id_dormroom = %s AND is_active = 1",
        (room_id,)
    )
    return cursor.fetchone()['total']

def get_room_capacity(cursor, room_id):
    cursor.execute("SELECT num_of_bed FROM tDormroom WHERE id = %s AND is_active = 1", (room_id,))
    room = cursor.fetchone()
    if room is None:
        raise ValueError(f"Phòng {room_id} không tồn tại hoặc đã bị vô hiệu")
    return room['num_of_bed']

def ensure_room_admin_request_schema(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tRoomAdminRequest (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_teacher CHAR(12) NOT NULL,
            id_dormroom VARCHAR(20) NOT NULL,
            action VARCHAR(20) NOT NULL,
            requested_name VARCHAR(100) NULL,
            requested_num_of_bed INT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME NULL,
            KEY idx_room_admin_request_teacher (id_teacher),
            KEY idx_room_admin_request_status (status),
            CONSTRAINT fk_room_admin_teacher FOREIGN KEY (id_teacher) REFERENCES tTeacher(id_VNeID) ON UPDATE CASCADE ON DELETE CASCADE,
            CONSTRAINT fk_room_admin_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON UPDATE CASCADE ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

def validate_students_exist(cursor, student_ids):
    if not student_ids:
        return
    placeholders = ','.join(['%s'] * len(student_ids))
    cursor.execute(
        f"SELECT id_VNeID FROM tStudent WHERE id_VNeID IN ({placeholders}) AND is_active = 1",
        student_ids
    )
    found_ids = {row['id_VNeID'] for row in cursor.fetchall()}
    missing_ids = [student_id for student_id in student_ids if student_id not in found_ids]
    if missing_ids:
        raise ValueError("Có học sinh không tồn tại hoặc đã bị vô hiệu: " + ", ".join(missing_ids))

def assign_student_to_room(cursor, student_id, room_id, import_date=None, note=0):
    cursor.execute(
        "UPDATE LIVING SET is_active = 0 WHERE id_student = %s AND is_active = 1",
        (student_id,)
    )
    cursor.execute("""
        INSERT INTO LIVING (id_student, id_dormroom, import_date, note, is_active)
        VALUES (%s, %s, %s, %s, 1)
    """, (student_id, room_id, import_date or get_today().strftime('%Y-%m-%d'), note))

@dormroom_bp.route('/', methods=['GET'])
def get_dormrooms():
    teacher_id = request.args.get('teacher_id')
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        where_clause = "WHERE d.is_active = 1"
        params = []
        if teacher_id:
            where_clause += """
              AND EXISTS (
                  SELECT 1
                  FROM LIVING tl
                  JOIN STUDY st ON tl.id_student = st.id_student AND st.is_active = 1
                  JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
                  JOIN MANAGE m ON c.id = m.id_class AND m.is_active = 1
                  WHERE tl.id_dormroom = d.id
                    AND tl.is_active = 1
                    AND m.id_teacher = %s
              )
            """
            params.append(teacher_id)

        cursor.execute(f"""
            SELECT d.*,
                   COUNT(CASE WHEN l.is_active = 1 THEN 1 END) AS current_students
            FROM tDormroom d
            LEFT JOIN LIVING l ON d.id = l.id_dormroom
            {where_clause}
            GROUP BY d.id, d.name, d.num_of_bed, d.is_active
        """, params)
        dormrooms = sorted(cursor.fetchall(), key=lambda room: split_room_code(room['id']))
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": dormrooms})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/template', methods=['GET'])
def get_dormroom_template():
    headers = ["id", "name", "num_of_bed"]
    examples = [
        ["P101", "Phòng 101", 8],
        ["P102", "Phòng 102", 8]
    ]
    return generate_excel_response(headers, examples, "dormroom_template.xlsx", sheet_name="Mẫu phòng")

@dormroom_bp.route('/living-template', methods=['GET'])
def get_living_template():
    headers = ["id_student", "id_dormroom", "import_date", "note"]
    examples = [
        ["001202012345", "P101", "2026-05-19", "0"]
    ]
    return generate_excel_response(headers, examples, "dormroom_living_template.xlsx", sheet_name="Mẫu xếp phòng")

@dormroom_bp.route('/upload', methods=['POST'])
def upload_dormrooms():
    if 'file' not in request.files:
        return jsonify({"success": False, "message": "Không tìm thấy file tải lên"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "message": "Chưa chọn file"}), 400

    filename_lower = file.filename.lower()
    if not (filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls') or filename_lower.endswith('.csv')):
        return jsonify({"success": False, "message": "Định dạng file không hợp lệ (hỗ trợ .xlsx, .xls, .csv)"}), 400

    headers, dict_rows, raw_rows = read_file_rows(file)
    if headers is None:
        return jsonify({"success": False, "message": "Không thể đọc nội dung file"}), 400

    if not raw_rows:
        return jsonify({"success": False, "message": "File không có dữ liệu"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        success_count = 0
        errors = []
        duplicates = []

        check_cursor = conn.cursor(dictionary=True)

        for row_num, row in enumerate(raw_rows, start=2):
            try:
                d_row = dict_rows[row_num - 2] if row_num - 2 < len(dict_rows) else {}
                room_id = clean_cell(d_row.get('id') or d_row.get('Mã phòng') or (row[0] if len(row) > 0 else ''))
                name = clean_cell(d_row.get('name') or d_row.get('Tên phòng') or (row[1] if len(row) > 1 else ''))
                num_beds_raw = d_row.get('num_of_bed') or d_row.get('Số giường') or (row[2] if len(row) > 2 else None)
                if not room_id or not name:
                    raise ValueError("Thiếu mã phòng hoặc tên phòng")

                # Check duplicate
                check_cursor.execute("SELECT id, name FROM tDormroom WHERE id = %s", (room_id,))
                existing = check_cursor.fetchone()
                if existing:
                    letters, _, _ = split_room_code(room_id)
                    duplicates.append({
                        "id": room_id,
                        "name": name,
                        "block": letters.upper() if letters else "Khác"
                    })

                cursor.execute("""
                    INSERT INTO tDormroom (id, name, num_of_bed, is_active)
                    VALUES (%s, %s, %s, 1)
                    ON DUPLICATE KEY UPDATE
                    name=VALUES(name), num_of_bed=VALUES(num_of_bed), is_active=1
                """, (room_id, name, parse_int(num_beds_raw, None)))
                success_count += 1
            except Exception as row_err:
                errors.append(f"Dòng {row_num}: {str(row_err)}")

        check_cursor.close()
        conn.commit()
        cursor.close()
        conn.close()
        message = f"Nhập thành công {success_count} phòng."
        if errors:
            message += f" Có {len(errors)} lỗi: " + "; ".join(errors[:3])
        return jsonify({"success": True, "message": message, "errors": errors, "duplicates": duplicates})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/upload-living', methods=['POST'])
def upload_living():
    if 'file' not in request.files:
        return jsonify({"success": False, "message": "Không tìm thấy file tải lên"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "message": "Chưa chọn file"}), 400

    filename_lower = file.filename.lower()
    if not (filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls') or filename_lower.endswith('.csv')):
        return jsonify({"success": False, "message": "Định dạng file không hợp lệ (hỗ trợ .xlsx, .xls, .csv)"}), 400

    headers, dict_rows, raw_rows = read_file_rows(file)
    if headers is None:
        return jsonify({"success": False, "message": "Không thể đọc nội dung file"}), 400

    if not raw_rows:
        return jsonify({"success": False, "message": "File không có dữ liệu"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        success_count = 0
        errors = []

        for row_num, row in enumerate(raw_rows, start=2):
            try:
                d_row = dict_rows[row_num - 2] if row_num - 2 < len(dict_rows) else {}
                student_id = clean_cell(d_row.get('id_student') or d_row.get('Mã học sinh') or (row[0] if len(row) > 0 else ''))
                room_id = clean_cell(d_row.get('id_dormroom') or d_row.get('Mã phòng') or (row[1] if len(row) > 1 else ''))
                import_date_raw = d_row.get('import_date') or d_row.get('Ngày vào') or (row[2] if len(row) > 2 else '')
                note_raw = d_row.get('note') or d_row.get('Ghi chú') or (row[3] if len(row) > 3 else 0)

                if not student_id or not room_id:
                    raise ValueError("Thiếu mã học sinh hoặc mã phòng")
                validate_students_exist(cursor, [student_id])

                capacity = get_room_capacity(cursor, room_id)

                cursor.execute(
                    "SELECT id_dormroom FROM LIVING WHERE id_student = %s AND is_active = 1",
                    (student_id,)
                )
                current = cursor.fetchone()
                already_in_room = current and current['id_dormroom'] == room_id
                if capacity is not None and not already_in_room and count_active_students(cursor, room_id) >= capacity:
                    raise ValueError(f"Phòng {room_id} đã đủ số giường")

                assign_student_to_room(
                    cursor,
                    student_id,
                    room_id,
                    parse_date(import_date_raw),
                    parse_int(note_raw, 0)
                )
                success_count += 1
            except Exception as row_err:
                errors.append(f"Dòng {row_num}: {str(row_err)}")

        conn.commit()
        cursor.close()
        conn.close()
        message = f"Xếp phòng thành công {success_count} học sinh."
        if errors:
            message += f" Có {len(errors)} lỗi: " + "; ".join(errors[:3])
        return jsonify({"success": True, "message": message, "errors": errors})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/export', methods=['GET'])
def export_dormrooms():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT r.id as room_id, r.name as room_name, r.num_of_bed,
                   s.id_VNeID as student_id, s.name as student_name,
                   c.name as class_name, l.import_date
            FROM tDormroom r
            LEFT JOIN LIVING l ON r.id = l.id_dormroom AND l.is_active = 1
            LEFT JOIN tStudent s ON l.id_student = s.id_VNeID AND s.is_active = 1
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            WHERE r.is_active = 1
            ORDER BY r.id, s.name
        """)
        rows_db = cursor.fetchall()
        cursor.close()
        conn.close()

        headers = [
            "STT", "Mã phòng", "Tên phòng", "Số giường",
            "Mã học sinh", "Họ tên học sinh", "Lớp", "Ngày xếp vào phòng"
        ]
        rows = []
        for idx, r in enumerate(rows_db, start=1):
            import_date_str = r['import_date'].strftime('%d/%m/%Y') if r.get('import_date') and hasattr(r['import_date'], 'strftime') else str(r.get('import_date') or '')
            rows.append([
                idx,
                r.get('room_id') or '',
                r.get('room_name') or '',
                r.get('num_of_bed') if r.get('num_of_bed') is not None else 'Không giới hạn',
                r.get('student_id') or '(Trống)',
                r.get('student_name') or '',
                r.get('class_name') or '',
                import_date_str
            ])

        return generate_excel_response(headers, rows, "danh_sach_phong_ktx.xlsx", sheet_name="Phòng KTX")
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/students-overview', methods=['GET'])
def get_students_overview():
    teacher_id = request.args.get('teacher_id')
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        where_clause = "WHERE s.is_active = 1"
        params = []
        if teacher_id:
            where_clause += """
              AND st.id_class IN (
                  SELECT c.id
                  FROM tClass c
                  JOIN MANAGE m ON c.id = m.id_class
                  WHERE m.id_teacher = %s
                    AND m.is_active = 1
                    AND c.is_active = 1
              )
            """
            params.append(teacher_id)

        cursor.execute(f"""
            SELECT s.id_VNeID,
                   s.name,
                   s.sex,
                   s.birth,
                   c.name AS class_name,
                   d.id AS current_room_id,
                   d.name AS current_room_name
            FROM tStudent s
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            LEFT JOIN LIVING l ON s.id_VNeID = l.id_student AND l.is_active = 1
            LEFT JOIN tDormroom d ON l.id_dormroom = d.id AND d.is_active = 1
            {where_clause}
        """, params)
        students = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": students})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/<id>/students', methods=['GET'])
def get_room_students(id):
    teacher_id = request.args.get('teacher_id')
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        room_sql = "SELECT * FROM tDormroom WHERE id = %s AND is_active = 1"
        room_params = [id]
        if teacher_id:
            room_sql += """
              AND EXISTS (
                  SELECT 1
                  FROM LIVING tl
                  JOIN STUDY st ON tl.id_student = st.id_student AND st.is_active = 1
                  JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
                  JOIN MANAGE m ON c.id = m.id_class AND m.is_active = 1
                  WHERE tl.id_dormroom = tDormroom.id
                    AND tl.is_active = 1
                    AND m.id_teacher = %s
              )
            """
            room_params.append(teacher_id)
        cursor.execute(room_sql, room_params)
        room = cursor.fetchone()
        if not room:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy phòng"}), 404

        student_where = "WHERE l.id_dormroom = %s AND l.is_active = 1"
        student_params = [id]
        if teacher_id:
            student_where += """
              AND st.id_class IN (
                  SELECT c.id
                  FROM tClass c
                  JOIN MANAGE m ON c.id = m.id_class
                  WHERE m.id_teacher = %s
                    AND m.is_active = 1
                    AND c.is_active = 1
              )
            """
            student_params.append(teacher_id)

        cursor.execute(f"""
            SELECT s.id_VNeID, s.name, s.sex, s.birth, c.name AS class_name, l.import_date
            FROM LIVING l
            JOIN tStudent s ON l.id_student = s.id_VNeID AND s.is_active = 1
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            {student_where}
            ORDER BY c.name, s.name
        """, student_params)
        students = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": {"room": room, "students": students}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/<id>/students', methods=['POST'])
def add_students_to_room(id):
    data = request.json or {}
    student_ids = data.get('student_ids') or []
    if not isinstance(student_ids, list) or not student_ids:
        return jsonify({"success": False, "message": "Vui lòng chọn ít nhất một học sinh"}), 400

    student_ids = list(dict.fromkeys([clean_cell(student_id) for student_id in student_ids if clean_cell(student_id)]))
    if not student_ids:
        return jsonify({"success": False, "message": "Danh sách học sinh không hợp lệ"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        validate_students_exist(cursor, student_ids)
        try:
            capacity = get_room_capacity(cursor, id)
        except ValueError:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy phòng"}), 404

        placeholders = ','.join(['%s'] * len(student_ids))
        cursor.execute(
            f"""
            SELECT id_student
            FROM LIVING
            WHERE id_student IN ({placeholders}) AND id_dormroom = %s AND is_active = 1
            """,
            student_ids + [id]
        )
        already_in_room = {row['id_student'] for row in cursor.fetchall()}
        new_student_ids = [student_id for student_id in student_ids if student_id not in already_in_room]

        if capacity is not None and count_active_students(cursor, id) + len(new_student_ids) > capacity:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Số học sinh được chọn vượt quá số giường còn trống"}), 400

        assigned_count = 0
        for student_id in student_ids:
            if student_id in already_in_room:
                continue
            assign_student_to_room(cursor, student_id, id)
            assigned_count += 1

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã thêm {assigned_count} học sinh vào phòng."})
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/<id>/students', methods=['DELETE'])
def clear_room_students(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE LIVING SET is_active = 0 WHERE id_dormroom = %s AND is_active = 1", (id,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã xoá {affected} học sinh khỏi phòng"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/<id>/students/<student_id>', methods=['DELETE'])
def remove_single_student(id, student_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE LIVING SET is_active = 0 WHERE id_dormroom = %s AND id_student = %s AND is_active = 1", (id, student_id))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Học sinh không có trong phòng này"}), 404
        return jsonify({"success": True, "message": "Đã xoá học sinh khỏi phòng"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/<id>', methods=['GET'])
def get_dormroom(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM tDormroom WHERE id = %s AND is_active = 1", (id,))
        dormroom = cursor.fetchone()
        cursor.close()
        conn.close()
        if dormroom:
            return jsonify({"success": True, "data": dormroom})
        return jsonify({"success": False, "message": "Dormroom not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/', methods=['POST'])
def create_dormroom():
    data = request.json or {}
    room_id = (data.get('id') or '').strip()
    name = (data.get('name') or '').strip()
    num_of_bed = data.get('num_of_bed')

    if not room_id or not name:
        return jsonify({"success": False, "message": "Mã phòng và tên phòng không được để trống"}), 400

    if num_of_bed is not None:
        try:
            num_of_bed = int(num_of_bed)
            if num_of_bed <= 0:
                return jsonify({"success": False, "message": "Số giường phải lớn hơn 0"}), 400
        except ValueError:
            return jsonify({"success": False, "message": "Số giường không hợp lệ"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, is_active FROM tDormroom WHERE id = %s", (room_id,))
        existing = cursor.fetchone()
        if existing:
            if existing['is_active'] == 1:
                cursor.close(); conn.close()
                return jsonify({"success": False, "message": f"Mã phòng {room_id} đã tồn tại trong hệ thống"}), 409
            else:
                cursor.execute("UPDATE tDormroom SET name=%s, num_of_bed=%s, is_active=1 WHERE id=%s", (name, num_of_bed, room_id))
                conn.commit()
                cursor.close(); conn.close()
                return jsonify({"success": True, "message": f"Đã kích hoạt lại phòng {room_id} thành công"}), 201

        sql = """INSERT INTO tDormroom (id, name, num_of_bed, is_active) VALUES (%s, %s, %s, 1)"""
        val = (room_id, name, num_of_bed)
        cursor.execute(sql, val)
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Tạo phòng KTX thành công"}), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/<id>', methods=['PUT'])
def update_dormroom(id):
    data = request.json or {}
    name = (data.get('name') or '').strip()
    num_of_bed = data.get('num_of_bed')

    if not name:
        return jsonify({"success": False, "message": "Tên phòng không được để trống"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM tDormroom WHERE id = %s AND is_active = 1", (id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy phòng hoặc phòng đã bị vô hiệu"}), 404

        if num_of_bed is not None:
            num_of_bed = int(num_of_bed)
            if num_of_bed <= 0:
                cursor.close(); conn.close()
                return jsonify({"success": False, "message": "Số giường phải lớn hơn 0"}), 400
            current_occ = count_active_students(cursor, id)
            if num_of_bed < current_occ:
                cursor.close(); conn.close()
                return jsonify({"success": False, "message": f"Không thể giảm số giường ({num_of_bed}) nhỏ hơn số học sinh đang ở thực tế ({current_occ})"}), 400

        sql = """UPDATE tDormroom
                 SET name=%s, num_of_bed=%s
                 WHERE id=%s AND is_active=1"""
        val = (name, num_of_bed, id)
        cursor.execute(sql, val)
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Cập nhật phòng thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/<id>', methods=['DELETE'])
def delete_dormroom(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM tDormroom WHERE id = %s AND is_active = 1", (id,))
        if not cursor.fetchone():
            cursor.close(); conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy phòng"}), 404

        current_occ = count_active_students(cursor, id)
        if current_occ > 0:
            cursor.close(); conn.close()
            return jsonify({"success": False, "message": f"Không thể xóa phòng đang có {current_occ} học sinh cư trú. Vui lòng chuyển học sinh trước."}), 400

        cursor.execute("UPDATE tDormroom SET is_active = 0 WHERE id = %s", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Đã xóa phòng KTX thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/transfer', methods=['POST'])
def transfer_student():
    data = request.json or {}
    student_id = data.get('id_student') or data.get('student_id')
    to_room = data.get('to_room') or data.get('target_room_id')
    swap_student_id = data.get('swap_student_id')

    if not student_id or not to_room:
        return jsonify({"success": False, "message": "Thiếu mã học sinh hoặc mã phòng chuyển đến"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        validate_students_exist(cursor, [student_id])
        capacity = get_room_capacity(cursor, to_room)

        cursor.execute("SELECT id_dormroom FROM LIVING WHERE id_student = %s AND is_active = 1", (student_id,))
        curr = cursor.fetchone()
        from_room = curr['id_dormroom'] if curr else None

        if from_room == to_room:
            cursor.close(); conn.close()
            return jsonify({"success": False, "message": "Học sinh hiện đã ở phòng này"}), 400

        today_str = get_today().strftime('%Y-%m-%d')
        if swap_student_id:
            # Luồng 21.2b: Hoán đổi chéo 2 học sinh
            validate_students_exist(cursor, [swap_student_id])
            cursor.execute("SELECT id_dormroom FROM LIVING WHERE id_student = %s AND is_active = 1", (swap_student_id,))
            swap_curr = cursor.fetchone()
            if not swap_curr or swap_curr['id_dormroom'] != to_room:
                cursor.close(); conn.close()
                return jsonify({"success": False, "message": f"Học sinh hoán đổi {swap_student_id} không ở phòng {to_room}"}), 400

            cursor.execute("UPDATE LIVING SET is_active = 0 WHERE id_student = %s AND is_active = 1", (student_id,))
            cursor.execute("UPDATE LIVING SET is_active = 0 WHERE id_student = %s AND is_active = 1", (swap_student_id,))
            cursor.execute("INSERT INTO LIVING (id_student, id_dormroom, import_date, is_active) VALUES (%s, %s, %s, 1)", (student_id, to_room, today_str))
            cursor.execute("INSERT INTO LIVING (id_student, id_dormroom, import_date, is_active) VALUES (%s, %s, %s, 1)", (swap_student_id, from_room, today_str))
            conn.commit()
            cursor.close(); conn.close()
            return jsonify({"success": True, "message": "Đã hoán đổi vị trí phòng giữa 2 học sinh thành công."})
        else:
            # Luồng 21.2: Chuyển phòng đơn lẻ
            current_occ = count_active_students(cursor, to_room)
            if capacity is not None and current_occ >= capacity:
                cursor.close(); conn.close()
                return jsonify({"success": False, "message": f"Phòng {to_room} đã đầy ({current_occ}/{capacity} giường), không còn chỗ trống"}), 400

            assign_student_to_room(cursor, student_id, to_room, import_date=today_str)
            conn.commit()
            cursor.close(); conn.close()
            return jsonify({"success": True, "message": f"Đã chuyển học sinh sang phòng {to_room} thành công."})
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── ROOM CHANGE REQUESTS ──

@dormroom_bp.route('/requests', methods=['GET'])
def get_room_change_requests():
    teacher_id = request.args.get('teacher_id')
    status = request.args.get('status')
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_room_admin_request_schema(cursor)
        conn.commit()
        sql = """SELECT r.*, t.name AS teacher_name, s.name AS student_name, c.name AS class_name, d.name AS room_name
                 FROM tRoomChangeRequest r
                 LEFT JOIN tTeacher t ON r.id_teacher = t.id_VNeID
                 LEFT JOIN tStudent s ON r.id_student = s.id_VNeID
                 LEFT JOIN tDormroom d ON r.id_dormroom = d.id
                 LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
                 LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
                 WHERE 1=1"""
        params = []
        if teacher_id:
            sql += " AND r.id_teacher = %s"
            params.append(teacher_id)
        if status:
            sql += " AND r.status = %s"
            params.append(status)
        sql += " ORDER BY r.created_at DESC"
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        for r in rows:
            if r.get('created_at'): r['created_at'] = str(r['created_at'])
            r['request_type'] = 'STUDENT_ROOM'

        room_sql = """SELECT rr.*, t.name AS teacher_name, d.name AS room_name
                      FROM tRoomAdminRequest rr
                      LEFT JOIN tTeacher t ON rr.id_teacher = t.id_VNeID
                      LEFT JOIN tDormroom d ON rr.id_dormroom = d.id
                      WHERE 1=1"""
        room_params = []
        if teacher_id:
            room_sql += " AND rr.id_teacher = %s"
            room_params.append(teacher_id)
        if status:
            room_sql += " AND rr.status = %s"
            room_params.append(status)
        room_sql += " ORDER BY rr.created_at DESC"
        cursor.execute(room_sql, room_params)
        room_rows = cursor.fetchall()
        for r in room_rows:
            if r.get('created_at'): r['created_at'] = str(r['created_at'])
            if r.get('processed_at'): r['processed_at'] = str(r['processed_at'])
            r['request_type'] = 'ROOM_ADMIN'
            r['id_student'] = None
            r['student_name'] = None
            r['class_name'] = None

        rows.extend(room_rows)
        rows.sort(key=lambda r: r.get('created_at') or '', reverse=True)
        cursor.close(); conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/requests', methods=['POST'])
def create_room_change_request():
    data = request.json or {}
    try:
        conn = get_db_connection(); cursor = conn.cursor()
        action = (data.get('action') or '').strip().upper()
        if action in ('EDIT_ROOM', 'DELETE_ROOM', 'CLEAR_STUDENTS'):
            ensure_room_admin_request_schema(cursor)
            cursor.execute("SELECT id FROM tDormroom WHERE id = %s AND is_active = 1", (data['id_dormroom'],))
            if not cursor.fetchone():
                cursor.close(); conn.close()
                return jsonify({"success": False, "message": "Khong tim thay phong"}), 404
            cursor.execute("""
                INSERT INTO tRoomAdminRequest (id_teacher, id_dormroom, action, requested_name, requested_num_of_bed)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                data['id_teacher'],
                data['id_dormroom'],
                action,
                data.get('name'),
                data.get('num_of_bed')
            ))
        else:
            sql = """INSERT INTO tRoomChangeRequest (id_teacher, id_student, id_dormroom, action)
                     VALUES (%s, %s, %s, %s)"""
            cursor.execute(sql, (data['id_teacher'], data['id_student'], data['id_dormroom'], action))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"success": True, "message": "Đã gửi yêu cầu"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dormroom_bp.route('/requests/<int:id>', methods=['PUT'])
def update_room_change_request(id):
    data = request.json or {}
    new_status = data.get('status')
    if new_status not in ['APPROVED', 'REJECTED']:
        return jsonify({"success": False, "message": "Invalid status"}), 400
    try:
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        if data.get('request_type') == 'ROOM_ADMIN':
            ensure_room_admin_request_schema(cursor)
            cursor.execute("SELECT * FROM tRoomAdminRequest WHERE id = %s", (id,))
            req = cursor.fetchone()
            if not req:
                cursor.close(); conn.close()
                return jsonify({"success": False, "message": "Request not found"}), 404
            if req['status'] == new_status:
                cursor.close(); conn.close()
                return jsonify({"success": True, "message": f"Yêu cầu đã ở trạng thái {new_status}"})
            if req['status'] != 'PENDING':
                cursor.close(); conn.close()
                return jsonify({"success": False, "message": "Yêu cầu đã được xử lý trước đó"}), 400

            cursor.execute(
                "UPDATE tRoomAdminRequest SET status = %s, processed_at = NOW() WHERE id = %s",
                (new_status, id)
            )
            if new_status == 'APPROVED':
                if req['action'] == 'EDIT_ROOM':
                    cursor.execute("""
                        UPDATE tDormroom
                        SET name = %s, num_of_bed = %s
                        WHERE id = %s AND is_active = 1
                    """, (req['requested_name'], req['requested_num_of_bed'], req['id_dormroom']))
                elif req['action'] == 'DELETE_ROOM':
                    cursor.execute("UPDATE tDormroom SET is_active = 0 WHERE id = %s", (req['id_dormroom'],))
                elif req['action'] == 'CLEAR_STUDENTS':
                    cursor.execute("UPDATE LIVING SET is_active = 0 WHERE id_dormroom = %s AND is_active = 1", (req['id_dormroom'],))
            conn.commit(); cursor.close(); conn.close()
            return jsonify({"success": True, "message": f"Đã cập nhật thành {new_status}"})

        cursor.execute("SELECT * FROM tRoomChangeRequest WHERE id = %s", (id,))
        req = cursor.fetchone()
        if not req:
            return jsonify({"success": False, "message": "Request not found"}), 404
        if req['status'] == new_status:
            cursor.close(); conn.close()
            return jsonify({"success": True, "message": f"Yêu cầu đã ở trạng thái {new_status}"})
        if req['status'] != 'PENDING':
            cursor.close(); conn.close()
            return jsonify({"success": False, "message": "Yêu cầu đã được xử lý trước đó"}), 400

        # Update request status
        cursor.execute("UPDATE tRoomChangeRequest SET status = %s WHERE id = %s", (new_status, id))

        if new_status == 'APPROVED':
            # Apply the action
            student_id = req['id_student']
            room_id = req['id_dormroom']
            action = req['action']
            if action == 'ADD':
                assign_student_to_room(cursor, student_id, room_id)
            elif action == 'REMOVE':
                cursor.execute("UPDATE LIVING SET is_active = 0 WHERE id_student = %s AND id_dormroom = %s AND is_active = 1", (student_id, room_id))
        
        conn.commit(); cursor.close(); conn.close()
        return jsonify({"success": True, "message": f"Đã cập nhật thành {new_status}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
