from flask import Blueprint, request, jsonify, Response
from config import get_db_connection
import csv
import io
import re
import os
import time
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash
from mock_time import get_now, get_today
from excel_utils import generate_excel_response, read_file_rows

def create_student_account(cursor, id_vneid):
    # Kiểm tra tài khoản đã tồn tại chưa
    cursor.execute("SELECT id FROM tAccount WHERE username = %s", (id_vneid,))
    if cursor.fetchone():
        return False
    
    # Tạo tài khoản mặc định (pass: 123456, role: 4 - student, must_change_password: 1)
    hashed_pw = generate_password_hash('123456')
    cursor.execute("""
        INSERT INTO tAccount (username, password, role_id, must_change_password)
        VALUES (%s, %s, %s, 1)
    """, (id_vneid, hashed_pw, 4))
    return True

def parse_gender(val):
    if not val: return None
    v = str(val).strip().lower()
    if v in ['nữ', 'female', '1']: return 1
    if v in ['nam', 'male', '0']: return 0
    return None

def parse_date(val):
    if not val: return None
    v = str(val).strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%d-%m-%y', '%d/%m/%y', '%m-%d-%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(v, fmt).strftime('%Y-%m-%d')
        except (ValueError, TypeError):
            continue
    return None

student_bp = Blueprint('student', __name__)

def handle_student_class(cursor, student_id, class_name):
    if not class_name:
        return
    class_name = class_name.strip().upper()
    now = get_now()
    if now.month >= 7:
        start_year = now.year
    else:
        start_year = now.year - 1
    school_year = f"{start_year}-{start_year+1}"
    class_id = f"{class_name}_{school_year}"
    
    cursor.execute("INSERT IGNORE INTO tClass (id, name, school_year) VALUES (%s, %s, %s)", (class_id, class_name, school_year))
    cursor.execute("INSERT IGNORE INTO STUDY (id_student, id_class) VALUES (%s, %s)", (student_id, class_id))

def get_activity_range(range_name):
    today = get_today()
    if range_name == 'week':
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
    else:
        start = today.replace(day=1)
        if today.month == 12:
            end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
    return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')

@student_bp.route('/template', methods=['GET'])
def get_template():
    headers = [
        "id_VNeID", "name", "sex", "birth", "phone_number",
        "permanent_address", "temp_address", "class",
        "father_name", "father_phone", "mother_name", "mother_phone"
    ]
    examples = [
        [
            "001202012345", "Nguyễn Thị B", "1", "2005-10-25", "0912345678",
            "Hà Nội", "Hà Nội", "10A1",
            "Nguyễn Văn A", "0912345678", "Trần Thị C", "0987654321"
        ],
        [
            "001202012346", "Trần Văn D", "0", "2005-08-12", "0987654321",
            "Đà Nẵng", "Đà Nẵng", "10A1",
            "Trần Văn E", "0987654322", "Lê Thị F", "0987654323"
        ]
    ]
    return generate_excel_response(headers, examples, "student_template.xlsx", sheet_name="Học sinh mẫu")

@student_bp.route('/upload', methods=['POST'])
def upload_students():
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
        cursor = conn.cursor()

        sql = """INSERT INTO tStudent (id_VNeID, name, sex, birth, phone_number, permanent_address, temp_address)
                 VALUES (%s, %s, %s, %s, %s, %s, %s)
                 ON DUPLICATE KEY UPDATE 
                 name=VALUES(name), sex=VALUES(sex), birth=VALUES(birth), phone_number=VALUES(phone_number),
                 permanent_address=VALUES(permanent_address), temp_address=VALUES(temp_address)"""

        parent_sql = """INSERT INTO tParent (id_student, father_name, father_phone, mother_name, mother_phone)
                        VALUES (%s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE 
                        father_name=VALUES(father_name), father_phone=VALUES(father_phone),
                        mother_name=VALUES(mother_name), mother_phone=VALUES(mother_phone)"""

        success_count = 0
        errors = []
        duplicates = []

        check_cursor = conn.cursor(dictionary=True)

        for i, row in enumerate(raw_rows, start=2):
            if len(row) >= 2 and row[0].strip():
                try:
                    d_row = dict_rows[i - 2] if i - 2 < len(dict_rows) else {}
                    student_id = (d_row.get('id_VNeID') or d_row.get('Mã VNeID') or row[0]).strip()
                    name = (d_row.get('name') or d_row.get('Họ và tên') or (row[1] if len(row) > 1 else '')).strip()
                    sex_raw = d_row.get('sex') or d_row.get('Giới tính') or (row[2] if len(row) > 2 else '')
                    birth_raw = d_row.get('birth') or d_row.get('Ngày sinh') or (row[3] if len(row) > 3 else '')
                    phone = (d_row.get('phone_number') or d_row.get('Số điện thoại') or (row[4] if len(row) > 4 else '')).strip() or None
                    perm_addr = (d_row.get('permanent_address') or d_row.get('Địa chỉ thường trú') or (row[5] if len(row) > 5 else '')).strip() or None
                    temp_addr = (d_row.get('temp_address') or d_row.get('Địa chỉ tạm trú') or (row[6] if len(row) > 6 else '')).strip() or None
                    class_name = (d_row.get('class') or d_row.get('Lớp') or (row[7] if len(row) > 7 else '')).strip()

                    # Check duplicate
                    check_cursor.execute("SELECT id_VNeID, name FROM tStudent WHERE id_VNeID = %s", (student_id,))
                    existing = check_cursor.fetchone()
                    if existing:
                        duplicates.append({
                            "id_VNeID": student_id,
                            "name": name,
                            "class": class_name or "Chưa xếp lớp"
                        })

                    sex = parse_gender(sex_raw)
                    birth = parse_date(birth_raw)
                    val = (student_id, name, sex, birth, phone, perm_addr, temp_addr)
                    cursor.execute(sql, val)

                    if class_name:
                        handle_student_class(cursor, student_id, class_name)

                    # Tạo tài khoản học sinh
                    create_student_account(cursor, student_id)

                    # Handle parent info (cols 8, 9, 10, 11)
                    f_name = (d_row.get('father_name') or d_row.get('Họ tên Bố') or (row[8] if len(row) > 8 else '')).strip() or None
                    f_phone = (d_row.get('father_phone') or d_row.get('SĐT Bố') or (row[9] if len(row) > 9 else '')).strip() or None
                    m_name = (d_row.get('mother_name') or d_row.get('Họ tên Mẹ') or (row[10] if len(row) > 10 else '')).strip() or None
                    m_phone = (d_row.get('mother_phone') or d_row.get('SĐT Mẹ') or (row[11] if len(row) > 11 else '')).strip() or None

                    if any([f_name, f_phone, m_name, m_phone]):
                        parent_val = (student_id, f_name, f_phone, m_name, m_phone)
                        cursor.execute(parent_sql, parent_val)

                    success_count += 1
                except Exception as row_err:
                    errors.append(f"Dòng {i}: {str(row_err)}")

        check_cursor.close()
        conn.commit()
        cursor.close()
        conn.close()
        msg = f"Nhập thành công {success_count} học sinh."
        if errors:
            msg += f" Có {len(errors)} lỗi: " + "; ".join(errors[:3])
        return jsonify({"success": True, "message": msg, "duplicates": duplicates})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/export', methods=['GET'])
def export_students():
    teacher_id = request.args.get('teacher_id')
    class_name = request.args.get('class_name')
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        where_clause = "WHERE s.is_active = 1"
        params = []
        if teacher_id:
            where_clause += """ AND st.id_class IN (
                SELECT c.id FROM tClass c
                JOIN MANAGE m ON c.id = m.id_class
                WHERE m.id_teacher = %s AND m.is_active = 1 AND c.is_active = 1
            )"""
            params.append(teacher_id)
        if class_name:
            where_clause += " AND c.name = %s"
            params.append(class_name)

        sql = f"""
            SELECT s.*, c.name as class_name,
                   p.father_name, p.father_phone, p.mother_name, p.mother_phone
            FROM tStudent s
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            LEFT JOIN tParent p ON s.id_VNeID = p.id_student AND p.is_active = 1
            {where_clause}
            ORDER BY c.name, s.name
        """
        cursor.execute(sql, params)
        students = cursor.fetchall()
        cursor.close()
        conn.close()

        headers = [
            "STT", "Mã VNeID", "Họ và tên", "Giới tính", "Ngày sinh",
            "Số điện thoại", "Địa chỉ thường trú", "Địa chỉ tạm trú", "Lớp",
            "Họ tên Bố", "SĐT Bố", "Họ tên Mẹ", "SĐT Mẹ"
        ]
        rows = []
        for idx, s in enumerate(students, start=1):
            gender_text = "Nữ" if s['sex'] == 1 else ("Nam" if s['sex'] == 0 else "")
            birth_text = s['birth'].strftime('%d/%m/%Y') if s.get('birth') and hasattr(s['birth'], 'strftime') else str(s.get('birth') or '')
            rows.append([
                idx,
                s.get('id_VNeID') or '',
                s.get('name') or '',
                gender_text,
                birth_text,
                s.get('phone_number') or '',
                s.get('permanent_address') or '',
                s.get('temp_address') or '',
                s.get('class_name') or 'Chưa xếp lớp',
                s.get('father_name') or '',
                s.get('father_phone') or '',
                s.get('mother_name') or '',
                s.get('mother_phone') or ''
            ])

        fname = f"danh_sach_hoc_sinh_{class_name}.xlsx" if class_name else "danh_sach_hoc_sinh.xlsx"
        return generate_excel_response(headers, rows, fname, sheet_name="Danh sách học sinh")
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/', methods=['GET'])
def get_students():
    teacher_id = request.args.get('teacher_id')
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        where_clause = "WHERE s.is_active = 1"
        params = []
        if teacher_id and teacher_id.lower() != 'admin':
            where_clause += """ AND st.id_class IN (
                SELECT c.id FROM tClass c
                JOIN MANAGE m ON c.id = m.id_class
                WHERE m.id_teacher = %s AND m.is_active = 1 AND c.is_active = 1
            )"""
            params.append(teacher_id)

        sql = f"""
            SELECT s.*, c.name as class_name,
                   p.father_name, p.father_phone, p.mother_name, p.mother_phone
            FROM tStudent s
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            LEFT JOIN tParent p ON s.id_VNeID = p.id_student AND p.is_active = 1
            {where_clause}
        """
        cursor.execute(sql, params)
        students = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": students})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/classes', methods=['GET'])
def get_all_classes():
    teacher_id = request.args.get('teacher_id')
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        sql = "SELECT DISTINCT name FROM tClass WHERE is_active = 1"
        params = []
        if teacher_id and teacher_id.lower() != 'admin':
            sql = """SELECT DISTINCT c.name FROM tClass c
                     JOIN MANAGE m ON c.id = m.id_class
                     WHERE c.is_active = 1 AND m.id_teacher = %s AND m.is_active = 1"""
            params.append(teacher_id)
            
        cursor.execute(sql, params)
        classes = cursor.fetchall()
        cursor.close()
        conn.close()
        
        # Nhóm theo khối
        result = {}
        for c in classes:
            name = c['name']
            match = re.match(r'^(\d+)', name)
            grade = match.group(1) if match else "Khác"
            if grade not in result:
                result[grade] = []
            result[grade].append(name)
            
        # Sắp xếp
        sorted_result = []
        for g in sorted(result.keys(), key=lambda x: int(x) if x.isdigit() else 99):
            sorted_result.append({
                "grade": g,
                "classes": sorted(result[g])
            })
            
        return jsonify({"success": True, "data": sorted_result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/<id_vneid>', methods=['GET'])
def get_student(id_vneid):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT s.*, p.father_name, p.father_phone, p.mother_name, p.mother_phone
            FROM tStudent s
            LEFT JOIN tParent p ON s.id_VNeID = p.id_student AND p.is_active = 1
            WHERE s.id_VNeID = %s AND s.is_active = 1
        """, (id_vneid,))
        student = cursor.fetchone()
        cursor.close()
        conn.close()
        if student:
            return jsonify({"success": True, "data": student})
        return jsonify({"success": False, "message": "Student not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/<id_vneid>/activity', methods=['GET'])
def get_student_activity(id_vneid):
    range_name = (request.args.get('range') or 'month').strip().lower()
    if range_name not in ('week', 'month'):
        range_name = 'month'
    start_date, end_date = get_activity_range(range_name)
    access_limit = min(max(int(request.args.get('access_limit', 20)), 1), 100)

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT id, id_student, access_time, type, note
            FROM tAccessLog
            WHERE id_student = %s
            ORDER BY access_time DESC, id DESC
            LIMIT %s
        """, (id_vneid, access_limit))
        access_logs = cursor.fetchall()
        for row in access_logs:
            if row.get('access_time'):
                row['access_time'] = row['access_time'].strftime('%Y-%m-%d %H:%M:%S')

        cursor.execute("""
            SELECT ri.inspection_date,
                   ri.id_dormroom,
                   d.name AS room_name,
                   c.name AS criteria_name,
                   v.penalty_points,
                   v.note
            FROM tInspectionViolation v
            JOIN tRoomInspection ri ON v.inspection_id = ri.id
            JOIN tInspectionCriteria c ON v.criteria_id = c.id
            JOIN tDormroom d ON ri.id_dormroom = d.id
            WHERE v.id_student = %s
              AND ri.inspection_date >= %s
              AND ri.inspection_date <= %s
            ORDER BY ri.inspection_date DESC, ri.id DESC, v.id DESC
        """, (id_vneid, start_date, end_date))
        violations = cursor.fetchall()
        total_penalty = 0
        for row in violations:
            if row.get('inspection_date'):
                row['inspection_date'] = str(row['inspection_date'])
            row['penalty_points'] = float(row.get('penalty_points') or 0)
            total_penalty += row['penalty_points']

        cursor.close()
        conn.close()
        return jsonify({
            "success": True,
            "data": {
                "access_logs": access_logs,
                "violations": violations,
                "total_penalty": total_penalty,
                "total_violations": len(violations),
                "range": range_name,
                "start_date": start_date,
                "end_date": end_date,
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/card/<id_vneid>', methods=['GET'])
def get_student_card(id_vneid):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        sql = """
            SELECT s.id_VNeID, s.name, s.image_url, c.name as class_name 
            FROM tStudent s
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            WHERE s.id_VNeID = %s AND s.is_active = 1
        """
        cursor.execute(sql, (id_vneid,))
        student_card = cursor.fetchone()
        cursor.close()
        conn.close()
        if student_card:
            return jsonify({"success": True, "data": student_card})
        return jsonify({"success": False, "message": "Student not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/', methods=['POST'])
def create_student():
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        sql = """INSERT INTO tStudent (id_VNeID, name, sex, birth, phone_number, email, permanent_address, temp_address, image_url)
                 VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"""
        birth = parse_date(data['birth'])
        val = (data['id_VNeID'], data['name'], data['sex'], birth, 
               data.get('phone_number'), data.get('email'), data.get('permanent_address'), data.get('temp_address'), data.get('image_url'))
        cursor.execute(sql, val)
        
        # Handle parent info
        if 'parent' in data:
            p = data['parent']
            cursor.execute("""
                INSERT INTO tParent (id_student, father_name, father_phone, mother_name, mother_phone)
                VALUES (%s, %s, %s, %s, %s)
            """, (data['id_VNeID'], p.get('father_name'), p.get('father_phone'), 
                  p.get('mother_name'), p.get('mother_phone')))
            
        if data.get('class_name'):
            handle_student_class(cursor, data['id_VNeID'], data.get('class_name'))
            
        create_student_account(cursor, data['id_VNeID'])

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Student created successfully"}), 201
    except KeyError as e:
        return jsonify({"success": False, "error": f"Missing required field: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/<id_vneid>', methods=['PUT'])
def update_student(id_vneid):
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Check if student exists first
        cursor.execute("SELECT 1 FROM tStudent WHERE id_VNeID=%s AND is_active=1", (id_vneid,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Student not found or inactive"}), 404

        sql = """UPDATE tStudent 
                 SET name=%s, sex=%s, birth=%s, phone_number=%s, email=%s, permanent_address=%s, temp_address=%s, image_url=%s
                 WHERE id_VNeID=%s AND is_active=1"""
        birth = parse_date(data['birth'])
        val = (data['name'], data['sex'], birth, 
               data.get('phone_number'), data.get('email'), data.get('permanent_address'), data.get('temp_address'), data.get('image_url'), id_vneid)
        cursor.execute(sql, val)
        
        # Update parent info
        if 'parent' in data:
            p = data['parent']
            cursor.execute("""
                INSERT INTO tParent (id_student, father_name, father_phone, mother_name, mother_phone)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                father_name=VALUES(father_name), father_phone=VALUES(father_phone),
                mother_name=VALUES(mother_name), mother_phone=VALUES(mother_phone)
            """, (id_vneid, p.get('father_name'), p.get('father_phone'), 
                  p.get('mother_name'), p.get('mother_phone')))
            
        if data.get('class_name'):
            handle_student_class(cursor, id_vneid, data.get('class_name'))
            
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Student updated successfully"})
    except KeyError as e:
        return jsonify({"success": False, "error": f"Missing required field: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

def safe_delete_records(cursor, table, col, ids):
    if not ids:
        return
    placeholders = ','.join(['%s'] * len(ids))
    try:
        cursor.execute(f"DELETE FROM {table} WHERE {col} IN ({placeholders})", ids)
    except Exception as err:
        err_msg = str(err).lower()
        if getattr(err, 'errno', None) == 1146 or '1146' in err_msg or "doesn't exist" in err_msg:
            return
        raise

@student_bp.route('/bulk-delete', methods=['POST'])
def bulk_delete_students():
    try:
        data = request.get_json() or {}
        ids = data.get('ids', [])
        hard_delete = data.get('hard_delete', False)

        if not ids:
            return jsonify({"success": False, "message": "Không có học sinh nào được chọn"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        placeholders = ','.join(['%s'] * len(ids))

        if hard_delete:
            # Xóa cứng - Xóa hoàn toàn khỏi database MySQL
            for table, col in [
                ('taccount', 'username'),
                ('tinspectionviolation', 'id_student'),
                ('troomchangerequest', 'id_student'),
                ('tmealattendance', 'id_student'),
                ('tleaverequest', 'id_student'),
                ('living', 'id_student'),
                ('study', 'id_student'),
                ('tparent', 'id_student'),
                ('tstudent', 'id_VNeID')
            ]:
                safe_delete_records(cursor, table, col, ids)

            conn.commit()
            cursor.close()
            conn.close()
            return jsonify({"success": True, "message": f"Đã xoá vĩnh viễn {len(ids)} học sinh khỏi cơ sở dữ liệu MySQL"})
        else:
            # Xóa mềm - Vô hiệu hóa (is_active = 0) và đưa vào Thùng rác
            cursor.execute(f"UPDATE tStudent SET is_active = 0 WHERE id_VNeID IN ({placeholders})", ids)
            cursor.execute(f"UPDATE tAccount SET is_active = 0 WHERE username IN ({placeholders})", ids)
            cursor.execute(f"UPDATE STUDY SET is_active = 0 WHERE id_student IN ({placeholders})", ids)
            cursor.execute(f"UPDATE LIVING SET is_active = 0 WHERE id_student IN ({placeholders})", ids)
            conn.commit()
            cursor.close()
            conn.close()
            return jsonify({"success": True, "message": f"Đã vô hiệu hoá {len(ids)} học sinh thành công (đã chuyển vào Thùng rác)"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/<id_vneid>', methods=['DELETE'])
def delete_student(id_vneid):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE tStudent SET is_active = 0 WHERE id_VNeID = %s", (id_vneid,))
        cursor.execute("UPDATE tAccount SET is_active = 0 WHERE username = %s", (id_vneid,))
        cursor.execute("UPDATE STUDY SET is_active = 0 WHERE id_student = %s", (id_vneid,))
        cursor.execute("UPDATE LIVING SET is_active = 0 WHERE id_student = %s", (id_vneid,))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Student soft deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/classes-without-accounts', methods=['GET'])
def get_classes_without_accounts():
    """Trả về danh sách lớp có học sinh chưa được cấp tài khoản, kèm số lượng."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT c.name AS class_name, COUNT(s.id_VNeID) AS student_count
            FROM tStudent s
            JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            WHERE s.is_active = 1
              AND s.id_VNeID NOT IN (SELECT username FROM tAccount WHERE is_active = 1)
            GROUP BY c.name
            ORDER BY c.name
        """)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/create-accounts', methods=['POST'])
def bulk_create_accounts():
    data = request.json or {}
    class_names = data.get('class_names')  # None = tất cả, [] = không cấp ai
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if class_names is not None:
            # Cấp tài khoản cho học sinh thuộc các lớp được chọn
            if not class_names:
                return jsonify({"success": True, "message": "Không có lớp nào được chọn."})
            placeholders = ','.join(['%s'] * len(class_names))
            cursor.execute(f"""
                SELECT DISTINCT s.id_VNeID
                FROM tStudent s
                JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
                JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
                WHERE s.is_active = 1
                  AND s.id_VNeID NOT IN (SELECT username FROM tAccount WHERE is_active = 1)
                  AND c.name IN ({placeholders})
            """, class_names)
        else:
            # Cấp tất cả học sinh chưa có tài khoản
            cursor.execute("""
                SELECT id_VNeID FROM tStudent 
                WHERE id_VNeID NOT IN (SELECT username FROM tAccount) AND is_active = 1
            """)

        students = cursor.fetchall()
        count = 0
        for s in students:
            if create_student_account(cursor, s['id_VNeID']):
                count += 1

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã tạo {count} tài khoản cho học sinh."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/promote', methods=['POST'])
def promote_students():
    try:
        data = request.get_json() or {}
        exceptions = data.get('exceptions', []) # Danh sách id_VNeID ở lại lớp
        demotions = data.get('demotions', []) # Danh sách id_VNeID xuống lớp
        
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # 1. Tìm năm học hiện tại hoạt động nhiều nhất (hoặc lấy từ lớp hiện tại)
        cursor.execute("""
            SELECT school_year 
            FROM tClass 
            WHERE is_active = 1 
            GROUP BY school_year 
            ORDER BY count(*) DESC 
            LIMIT 1
        """)
        current_year_row = cursor.fetchone()
        
        if current_year_row and current_year_row['school_year']:
            current_school_year = current_year_row['school_year']
        else:
            # Nếu chưa có lớp nào, tự tính toán
            now = get_now()
            if now.month >= 7:
                start_yr = now.year
            else:
                start_yr = now.year - 1
            current_school_year = f"{start_yr}-{start_yr+1}"
            
        # Tính toán năm học tiếp theo
        try:
            start_yr = int(current_school_year.split('-')[0])
            next_school_year = f"{start_yr+1}-{start_yr+2}"
        except:
            now = get_now()
            if now.month >= 7:
                curr_start = now.year
            else:
                curr_start = now.year - 1
            next_school_year = f"{curr_start+1}-{curr_start+2}"

        # 2. Truy vấn tất cả học sinh đang học ở các lớp hoạt động của năm học hiện tại
        cursor.execute("""
            SELECT s.id_VNeID, s.name, c.id AS class_id, c.name AS class_name
            FROM tStudent s
            JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
            WHERE s.is_active = 1 AND c.school_year = %s
        """, (current_school_year,))
        active_students = cursor.fetchall()
        
        promoted_count = 0
        retained_count = 0
        demoted_count = 0
        graduated_count = 0
        
        import re
        
        for student in active_students:
            student_id = student['id_VNeID']
            class_name = student['class_name'] # ví dụ: "10A1"
            class_id = student['class_id']
            
            # Tắt hoạt động của bản ghi STUDY cũ của học sinh trong năm học này
            cursor.execute("""
                UPDATE STUDY 
                SET is_active = 0 
                WHERE id_student = %s AND id_class = %s
            """, (student_id, class_id))
            
            if student_id in exceptions:
                # Học sinh ở lại lớp: giữ nguyên tên lớp, đổi sang năm học mới
                new_class_name = class_name
                new_class_id = f"{new_class_name}_{next_school_year}"
                
                # Tạo lớp mới nếu chưa có
                cursor.execute("""
                    INSERT IGNORE INTO tClass (id, name, school_year, is_active)
                    VALUES (%s, %s, %s, 1)
                """, (new_class_id, new_class_name, next_school_year))
                
                # Liên kết STUDY mới
                cursor.execute("""
                    INSERT INTO STUDY (id_student, id_class, is_active)
                    VALUES (%s, %s, 1)
                    ON DUPLICATE KEY UPDATE is_active = 1
                """, (student_id, new_class_id))
                retained_count += 1
            elif student_id in demotions:
                # Học sinh xuống lớp: giảm số khối ở đầu lớp đi 1
                match = re.match(r'^(\d+)(.*)$', class_name)
                if match:
                    grade = int(match.group(1))
                    suffix = match.group(2)
                    new_grade = max(10, grade - 1) # Không giảm dưới 10
                    new_class_name = f"{new_grade}{suffix}"
                else:
                    new_class_name = class_name
                
                new_class_id = f"{new_class_name}_{next_school_year}"
                
                # Tạo lớp mới nếu chưa có
                cursor.execute("""
                    INSERT IGNORE INTO tClass (id, name, school_year, is_active)
                    VALUES (%s, %s, %s, 1)
                """, (new_class_id, new_class_name, next_school_year))
                
                # Liên kết STUDY mới
                cursor.execute("""
                    INSERT INTO STUDY (id_student, id_class, is_active)
                    VALUES (%s, %s, 1)
                    ON DUPLICATE KEY UPDATE is_active = 1
                """, (student_id, new_class_id))
                demoted_count += 1
            else:
                # Học sinh lên lớp: Tăng số khối ở đầu lớp lên 1
                # Sử dụng Regex để tìm số khối ở đầu (ví dụ: "10", "11", "12")
                match = re.match(r'^(\d+)(.*)$', class_name)
                if match:
                    grade = int(match.group(1))
                    suffix = match.group(2)
                    
                    if grade >= 12:
                        # Học sinh lớp 12 tốt nghiệp
                        cursor.execute("""
                            UPDATE tStudent 
                            SET is_active = 0 
                            WHERE id_VNeID = %s
                        """, (student_id,))
                        # Đồng thời vô hiệu hóa tài khoản của học sinh này
                        cursor.execute("""
                            UPDATE tAccount 
                            SET is_active = 0 
                            WHERE username = %s
                        """, (student_id,))
                        graduated_count += 1
                    else:
                        new_grade = grade + 1
                        new_class_name = f"{new_grade}{suffix}"
                        new_class_id = f"{new_class_name}_{next_school_year}"
                        
                        # Tạo lớp mới nếu chưa có
                        cursor.execute("""
                            INSERT IGNORE INTO tClass (id, name, school_year, is_active)
                            VALUES (%s, %s, %s, 1)
                        """, (new_class_id, new_class_name, next_school_year))
                        
                        # Liên kết STUDY mới
                        cursor.execute("""
                            INSERT INTO STUDY (id_student, id_class, is_active)
                            VALUES (%s, %s, 1)
                            ON DUPLICATE KEY UPDATE is_active = 1
                        """, (student_id, new_class_id))
                        promoted_count += 1
                else:
                    # Nếu tên lớp không chứa số ở đầu (ví dụ "A1"), không tự lên lớp được, giữ nguyên lớp
                    new_class_name = class_name
                    new_class_id = f"{new_class_name}_{next_school_year}"
                    
                    cursor.execute("""
                        INSERT IGNORE INTO tClass (id, name, school_year, is_active)
                        VALUES (%s, %s, %s, 1)
                    """, (new_class_id, new_class_name, next_school_year))
                    
                    cursor.execute("""
                        INSERT INTO STUDY (id_student, id_class, is_active)
                        VALUES (%s, %s, 1)
                        ON DUPLICATE KEY UPDATE is_active = 1
                    """, (student_id, new_class_id))
                    retained_count += 1
        
        conn.commit()
        cursor.close()
        conn.close()
        
        msg = f"Lên lớp thành công: {promoted_count} học sinh lên lớp, {retained_count} học sinh ở lại lớp, {demoted_count} học sinh xuống lớp, {graduated_count} học sinh lớp 12 đã tốt nghiệp."
        return jsonify({"success": True, "message": msg})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'boarding-student-manager-DB'))
IMAGE_UPLOAD_DIR = os.path.join(DB_DIR, 'student_images')

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

def verify_role_can_edit_student(cursor, username):
    if not username:
        return False
    cursor.execute("""
        SELECT r.name AS role_name
        FROM tAccount a
        JOIN tRole r ON a.role_id = r.id
        WHERE a.username = %s AND a.is_active = 1 AND r.is_active = 1
    """, (username,))
    account = cursor.fetchone()
    if not account:
        return False
    role = (account.get('role_name') or '').strip().lower()
    return role in {'teacher', 'manager'}

@student_bp.route('/<id_vneid>/upload_image', methods=['POST'])
def upload_student_image(id_vneid):
    username = request.form.get('username')
    if not username:
        return jsonify({"success": False, "message": "Yêu cầu cung cấp tên tài khoản thực hiện"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        if not verify_role_can_edit_student(cursor, username):
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Chỉ có giáo viên và quản lý mới được thay đổi ảnh đại diện của học sinh"}), 403

        if 'image' not in request.files:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy file ảnh"}), 400
        
        file = request.files['image']
        if file.filename == '':
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không có ảnh nào được chọn"}), 400
        
        if file and allowed_file(file.filename):
            ext = file.filename.rsplit('.', 1)[1].lower()
            secure_name = f"{id_vneid}.{ext}"
            
            # Ensure folder exists
            os.makedirs(IMAGE_UPLOAD_DIR, exist_ok=True)
            
            # Remove any existing images for this student to avoid duplicates
            for existing_file in os.listdir(IMAGE_UPLOAD_DIR):
                if existing_file.startswith(f"{id_vneid}."):
                    try:
                        os.remove(os.path.join(IMAGE_UPLOAD_DIR, existing_file))
                    except Exception as delete_err:
                        print(f"Error deleting old avatar: {delete_err}")
            
            filepath = os.path.join(IMAGE_UPLOAD_DIR, secure_name)
            file.save(filepath)
            
            # Relative path to serve
            image_url = f"/api/student/image/{secure_name}"
            
            cursor.execute("UPDATE tStudent SET image_url = %s WHERE id_VNeID = %s", (image_url, id_vneid))
            conn.commit()
            
            cursor.close()
            conn.close()
            return jsonify({"success": True, "image_url": image_url, "message": "Tải ảnh lên thành công"})
        else:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Định dạng file không được hỗ trợ (chỉ chấp nhận png, jpg, jpeg, gif, webp)"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@student_bp.route('/image/<filename>', methods=['GET'])
def get_student_image(filename):
    from flask import send_from_directory
    os.makedirs(IMAGE_UPLOAD_DIR, exist_ok=True)
    return send_from_directory(IMAGE_UPLOAD_DIR, filename)

