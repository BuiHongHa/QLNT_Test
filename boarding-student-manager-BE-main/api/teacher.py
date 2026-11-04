from flask import Blueprint, request, jsonify, Response
from config import get_db_connection
from werkzeug.security import generate_password_hash
from mock_time import get_today
import csv
import io
from datetime import date, datetime
from excel_utils import generate_excel_response, read_file_rows

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

def clean_text(value):
    return str(value).strip() if value is not None else ''

teacher_bp = Blueprint('teacher', __name__)

def get_current_school_year():
    """Tính năm học hiện tại. Nếu tháng >= 8 thì năm/năm+1, ngược lại năm-1/năm."""
    today = get_today()
    if today.month >= 8:
        return f"{today.year}-{today.year + 1}"
    else:
        return f"{today.year - 1}-{today.year}"

def get_teacher_role_id(cursor):
    """Lấy role_id của role 'teacher'."""
    cursor.execute("SELECT id FROM tRole WHERE name = 'teacher' AND is_active = 1")
    row = cursor.fetchone()
    return row[0] if row else None

@teacher_bp.route('/template', methods=['GET'])
def get_template():
    headers = [
        "id_VNeID", "name", "birth", "sex", "phone_number",
        "address", "is_home_teacher", "homeroom_class_id", "role"
    ]
    examples = [
        ["001202012346", "Nguyễn Thị C", "1980-05-15", "Nữ", "0987654321", "Hà Nội", "1", "10A1", "teacher"],
        ["001202012347", "Trần Văn A", "1975-10-20", "Nam", "0912345678", "Hà Nội", "0", "", "manager"],
        ["001202012348", "Phạm Văn B", "1982-03-12", "Nam", "0909090909", "Hà Nội", "0", "", "dorm_manager"],
        ["001202012349", "Hoàng Thị D", "1985-08-18", "Nữ", "0911223344", "Hà Nội", "0", "", "canteen_manager"]
    ]
    return generate_excel_response(headers, examples, "teacher_template.xlsx", sheet_name="Giáo viên mẫu")

@teacher_bp.route('/upload', methods=['POST'])
def upload_teachers():
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

        cursor.execute("SELECT id, name FROM tRole WHERE is_active = 1")
        roles_map = {row[1].strip().lower(): row[0] for row in cursor.fetchall()}
        default_role_id = roles_map.get('teacher', 1)

        teacher_sql = """INSERT INTO tTeacher (id_VNeID, name, birth, sex, phone_number, address, is_home_teacher)
                 VALUES (%s, %s, %s, %s, %s, %s, %s)
                 ON DUPLICATE KEY UPDATE 
                 name=VALUES(name), birth=VALUES(birth), sex=VALUES(sex), phone_number=VALUES(phone_number),
                 address=VALUES(address), is_home_teacher=VALUES(is_home_teacher)"""

        account_sql = """INSERT INTO tAccount (username, password, role_id, must_change_password, is_active)
                         VALUES (%s, %s, %s, 1, 1)
                         ON DUPLICATE KEY UPDATE 
                             password = IF(is_active = 0, VALUES(password), password),
                             must_change_password = IF(is_active = 0, 1, must_change_password),
                             role_id = VALUES(role_id),
                             is_active = 1"""

        manage_sql = """INSERT INTO MANAGE (id_teacher, id_class)
                        VALUES (%s, %s)
                        ON DUPLICATE KEY UPDATE is_active = 1"""

        success_count = 0
        errors = []
        duplicates = []

        check_cursor = conn.cursor(dictionary=True)

        for i, row in enumerate(raw_rows, start=2):
            if len(row) >= 2 and row[0].strip():
                try:
                    d_row = dict_rows[i - 2] if i - 2 < len(dict_rows) else {}
                    id_vneid = (d_row.get('id_VNeID') or d_row.get('Số CCCD') or row[0]).strip()
                    name = (d_row.get('name') or d_row.get('Họ và tên') or (row[1] if len(row) > 1 else '')).strip()
                    birth_raw = d_row.get('birth') or d_row.get('Ngày sinh') or (row[2] if len(row) > 2 else '')
                    sex_raw = d_row.get('sex') or d_row.get('Giới tính') or (row[3] if len(row) > 3 else '')
                    phone = (d_row.get('phone_number') or d_row.get('Số điện thoại') or (row[4] if len(row) > 4 else '')).strip() or None
                    address = (d_row.get('address') or d_row.get('Địa chỉ') or (row[5] if len(row) > 5 else '')).strip() or None
                    is_home_raw = d_row.get('is_home_teacher') or d_row.get('Chủ nhiệm') or (row[6] if len(row) > 6 else '0')
                    homeroom_class = (d_row.get('homeroom_class_id') or d_row.get('Lớp CN') or (row[7] if len(row) > 7 else '')).strip()
                    csv_role = (d_row.get('role') or d_row.get('Vai trò') or (row[8] if len(row) > 8 else 'teacher')).strip().lower()

                    # Check duplicate
                    check_cursor.execute("SELECT id_VNeID, name FROM tTeacher WHERE id_VNeID = %s", (id_vneid,))
                    existing = check_cursor.fetchone()
                    if existing:
                        duplicates.append({
                            "id_VNeID": id_vneid,
                            "name": name,
                            "homeroom_class": homeroom_class or "Không chủ nhiệm"
                        })

                    birth = parse_date(birth_raw)
                    sex = parse_gender(sex_raw)
                    is_home = 1 if str(is_home_raw).strip() in ['1', 'true', 'True', 'Có', 'có'] else 0

                    val = (id_vneid, name, birth, sex, phone, address, is_home)
                    cursor.execute(teacher_sql, val)

                    # Tạo account nếu chưa có, password mặc định = 123456
                    import_role_id = roles_map.get(csv_role, default_role_id)
                    if import_role_id:
                        cursor.execute(account_sql, (id_vneid, generate_password_hash('123456'), import_role_id))

                    # Xử lý lớp chủ nhiệm
                    if homeroom_class:
                        cursor.execute("SELECT id FROM tClass WHERE id = %s OR name = %s", (homeroom_class, homeroom_class))
                        class_row = cursor.fetchone()
                        if not class_row:
                            if '_' in homeroom_class:
                                class_name = homeroom_class.split('_')[0]
                                school_year = homeroom_class.split('_', 1)[1]
                                class_id = homeroom_class
                            else:
                                class_name = homeroom_class
                                school_year = get_current_school_year()
                                class_id = f"{homeroom_class}_{school_year}"
                            cursor.execute(
                                "INSERT IGNORE INTO tClass (id, name, school_year) VALUES (%s, %s, %s)",
                                (class_id, class_name, school_year)
                            )
                        else:
                            class_id = class_row[0]
                        cursor.execute("UPDATE MANAGE SET is_active = 0 WHERE id_teacher = %s", (id_vneid,))
                        cursor.execute(manage_sql, (id_vneid, class_id))

                    success_count += 1
                except Exception as row_err:
                    errors.append(f"Dòng {i}: {str(row_err)}")

        check_cursor.close()
        conn.commit()
        cursor.close()
        conn.close()
        msg = f"Đã nhập thành công {success_count} giáo viên"
        if errors:
            msg += f". Cảnh báo: {'; '.join(errors[:3])}"
        return jsonify({"success": True, "message": msg, "duplicates": duplicates})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/export', methods=['GET'])
def export_teachers():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        sql = """
            SELECT t.id_VNeID, t.name, t.birth, t.sex, t.phone_number, t.email, t.address,
                   t.is_home_teacher, c.name as homeroom_class_name,
                   r.name as role_name
            FROM tTeacher t
            LEFT JOIN MANAGE m ON t.id_VNeID = m.id_teacher AND m.is_active = 1
            LEFT JOIN tClass c ON m.id_class = c.id AND c.is_active = 1
            LEFT JOIN tAccount a ON t.id_VNeID = a.username AND a.is_active = 1
            LEFT JOIN tRole r ON a.role_id = r.id
            WHERE t.is_active = 1
            ORDER BY t.name
        """
        cursor.execute(sql)
        teachers = cursor.fetchall()
        cursor.close()
        conn.close()

        headers = [
            "STT", "Số CCCD/VNeID", "Họ và tên", "Ngày sinh", "Giới tính",
            "Số điện thoại", "Email", "Địa chỉ", "Chủ nhiệm", "Lớp chủ nhiệm", "Vai trò"
        ]
        rows = []
        for idx, t in enumerate(teachers, start=1):
            gender_text = "Nữ" if t['sex'] == 1 else ("Nam" if t['sex'] == 0 else "")
            birth_text = t['birth'].strftime('%d/%m/%Y') if t.get('birth') and hasattr(t['birth'], 'strftime') else str(t.get('birth') or '')
            is_home_text = "Có" if t.get('is_home_teacher') == 1 else "Không"
            rows.append([
                idx,
                t.get('id_VNeID') or '',
                t.get('name') or '',
                birth_text,
                gender_text,
                t.get('phone_number') or '',
                t.get('email') or '',
                t.get('address') or '',
                is_home_text,
                t.get('homeroom_class_name') or '',
                t.get('role_name') or 'teacher'
            ])

        return generate_excel_response(headers, rows, "danh_sach_giao_vien.xlsx", sheet_name="Giáo viên")
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/', methods=['GET'])
def get_teachers():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT t.*, 
                   GROUP_CONCAT(m.id_class SEPARATOR ', ') AS homeroom_classes,
                   MAX(a.role_id) AS role_id,
                   MAX(r.name) AS role_name
            FROM tTeacher t
            LEFT JOIN MANAGE m ON t.id_VNeID = m.id_teacher AND m.is_active = 1
            LEFT JOIN tAccount a ON t.id_VNeID = a.username AND a.is_active = 1
            LEFT JOIN tRole r ON a.role_id = r.id
            WHERE t.is_active = 1
            GROUP BY t.id_VNeID
        """)
        teachers = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": teachers})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/<id_vneid>', methods=['GET'])
def get_teacher(id_vneid):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT t.*,
                   GROUP_CONCAT(m.id_class SEPARATOR ', ') AS homeroom_classes,
                   a.role_id,
                   r.name AS role_name
            FROM tTeacher t
            LEFT JOIN MANAGE m ON t.id_VNeID = m.id_teacher AND m.is_active = 1
            LEFT JOIN tAccount a ON t.id_VNeID = a.username AND a.is_active = 1
            LEFT JOIN tRole r ON a.role_id = r.id
            WHERE t.id_VNeID = %s AND t.is_active = 1
            GROUP BY t.id_VNeID
        """, (id_vneid,))
        teacher = cursor.fetchone()
        cursor.close()
        conn.close()
        if teacher:
            return jsonify({"success": True, "data": teacher})
        return jsonify({"success": False, "message": "Teacher not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/', methods=['POST'])
def create_teacher():
    data = request.json
    try:
        id_vneid        = clean_text(data['id_VNeID'])
        name            = clean_text(data['name'])
        birth           = data.get('birth') or None
        sex             = data.get('sex')
        sex             = int(sex) if clean_text(sex) != '' else None
        phone_number    = clean_text(data.get('phone_number')) or None
        email           = clean_text(data.get('email')) or None
        address         = clean_text(data.get('address')) or None
        homeroom_class  = clean_text(data.get('homeroom_class_id')) or None

        if not id_vneid or not name:
            return jsonify({"success": False, "error": "Số CCCD và họ tên là bắt buộc"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO tTeacher (id_VNeID, name, birth, sex, phone_number, email, address, is_home_teacher)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 0)
        """, (id_vneid, name, birth, sex, phone_number, email, address))

        # --- 2. Tạo account, password mặc định = số CCCD ---
        role_id = get_teacher_role_id(cursor)
        cursor.execute("""
            INSERT INTO tAccount (username, password, role_id, must_change_password, is_active)
            VALUES (%s, %s, %s, 1, 1)
            ON DUPLICATE KEY UPDATE 
                password = IF(is_active = 0, VALUES(password), password),
                must_change_password = IF(is_active = 0, 1, must_change_password),
                role_id = VALUES(role_id),
                is_active = 1
        """, (id_vneid, generate_password_hash(id_vneid), role_id))

        # --- 3. Xử lý lớp chủ nhiệm (nếu có) ---
        if homeroom_class:
            cursor.execute("SELECT id FROM tClass WHERE id = %s OR name = %s", (homeroom_class, homeroom_class))
            class_row = cursor.fetchone()
            if not class_row:
                conn.rollback()
                cursor.close()
                conn.close()
                return jsonify({"success": False, "error": f"Lớp '{homeroom_class}' không tồn tại trong hệ thống."}), 400
            
            class_id = class_row[0]

            # Gán giáo viên làm chủ nhiệm (xóa chủ nhiệm cũ nếu có, rồi thêm mới)
            cursor.execute("""
                INSERT INTO MANAGE (id_teacher, id_class)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE is_active = 1
            """, (id_vneid, class_id))

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Teacher created successfully"}), 201

    except KeyError as e:
        return jsonify({"success": False, "error": f"Missing required field: {str(e)}"}), 400
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/<id_vneid>', methods=['PUT'])
def update_teacher(id_vneid):
    data = request.json or {}
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        name = clean_text(data.get('name'))
        birth = data.get('birth') or None
        sex = data.get('sex')
        sex = int(sex) if clean_text(sex) != '' else None
        phone_number = clean_text(data.get('phone_number')) or None
        email = clean_text(data.get('email')) or None
        address = clean_text(data.get('address')) or None
        is_home_teacher = int(data.get('is_home_teacher') or 0)
        homeroom_class = clean_text(data.get('homeroom_class_id')) or None

        if not name:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "error": "Họ tên là bắt buộc"}), 400

        sql = """UPDATE tTeacher 
                 SET name=%s, birth=%s, sex=%s, phone_number=%s, email=%s, address=%s, is_home_teacher=%s
                 WHERE id_VNeID=%s AND is_active=1"""
        val = (name, birth, sex, phone_number, email, address, is_home_teacher, id_vneid)
        cursor.execute(sql, val)
        affected = cursor.rowcount

        if homeroom_class:
            cursor.execute("SELECT id FROM tClass WHERE id = %s OR name = %s", (homeroom_class, homeroom_class))
            class_row = cursor.fetchone()
            if not class_row:
                cursor.close()
                conn.close()
                return jsonify({"success": False, "error": f"Lớp '{homeroom_class}' không tồn tại trong hệ thống."}), 400
            
            class_id = class_row[0]
            cursor.execute("UPDATE MANAGE SET is_active = 0 WHERE id_teacher = %s", (id_vneid,))
            cursor.execute("""
                INSERT INTO MANAGE (id_teacher, id_class)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE is_active = 1
            """, (id_vneid, class_id))

        conn.commit()
        cursor.execute("SELECT id_VNeID FROM tTeacher WHERE id_VNeID = %s AND is_active = 1", (id_vneid,))
        exists = cursor.fetchone()
        cursor.close()
        conn.close()
        if affected == 0 and not exists:
            return jsonify({"success": False, "message": "Teacher not found or inactive"}), 404
        return jsonify({"success": True, "message": "Teacher updated successfully"})
    except KeyError as e:
        return jsonify({"success": False, "error": f"Missing required field: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/<id_vneid>', methods=['DELETE'])
def delete_teacher(id_vneid):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE tTeacher SET is_active = 0 WHERE id_VNeID = %s", (id_vneid,))
        affected = cursor.rowcount
        # Khoá account luôn
        cursor.execute("UPDATE tAccount SET is_active = 0 WHERE username = %s", (id_vneid,))
        conn.commit()
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Teacher not found"}), 404
        return jsonify({"success": True, "message": "Teacher soft deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/fix-homeroom-classes', methods=['PUT'])
def fix_homeroom_classes():
    """Cập nhật các lớp chủ nhiệm thiếu năm học bằng năm học hiện tại."""
    data = request.json or {}
    actor_role = data.get('actor_role')
    if actor_role != 'manager':
        return jsonify({"success": False, "message": "Chỉ quản lý được thực hiện sửa lớp"}), 403
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Lấy các bản ghi MANAGE có id_class không chứa '_' (không có năm học)
        cursor.execute("SELECT id_teacher, id_class FROM MANAGE WHERE is_active = 1 AND id_class NOT LIKE %s", ('%\\_%',))
        rows = cursor.fetchall()
        current_year = get_current_school_year()
        for teacher_id, class_id in rows:
            new_class_id = f"{class_id}_{current_year}"
            # Đảm bảo lớp mới tồn tại trong tClass
            cursor.execute("SELECT id FROM tClass WHERE id = %s", (new_class_id,))
            if not cursor.fetchone():
                class_name = class_id.split('_')[0] if '_' in class_id else class_id
                cursor.execute("INSERT INTO tClass (id, name, school_year) VALUES (%s, %s, %s)", (new_class_id, class_name, current_year))
            # Cập nhật MANAGE
            cursor.execute("UPDATE MANAGE SET id_class = %s WHERE id_teacher = %s AND id_class = %s", (new_class_id, teacher_id, class_id))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Cập nhật {len(rows)} bản ghi thành công"}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/<id_vneid>/provision-account', methods=['POST'])
def provision_account(id_vneid):
    """Cấp/kích hoạt tài khoản thủ công cho giáo viên và đặt lại mật khẩu mặc định (CCCD)."""
    data = request.json or {}
    actor_role = data.get('actor_role')
    if actor_role != 'manager':
        return jsonify({"success": False, "message": "Chỉ quản lý được thực hiện cấp tài khoản"}), 403

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Kiểm tra giáo viên có tồn tại và đang hoạt động không
        cursor.execute("SELECT id_VNeID, name FROM tTeacher WHERE id_VNeID = %s AND is_active = 1", (id_vneid,))
        teacher = cursor.fetchone()
        if not teacher:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Giáo viên không tồn tại hoặc đã bị vô hiệu hoá"}), 404

        role_id = get_teacher_role_id(cursor)
        if not role_id:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy vai trò giáo viên trong hệ thống"}), 500

        hashed_password = generate_password_hash(id_vneid)
        
        # Cập nhật hoặc thêm mới account
        cursor.execute("SELECT username FROM tAccount WHERE username = %s", (id_vneid,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("""
                UPDATE tAccount
                SET password = %s, role_id = %s, is_active = 1, must_change_password = 1
                WHERE username = %s
            """, (hashed_password, role_id, id_vneid))
        else:
            cursor.execute("""
                INSERT INTO tAccount (username, password, role_id, must_change_password, is_active)
                VALUES (%s, %s, %s, 1, 1)
            """, (id_vneid, hashed_password, role_id))

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Cấp tài khoản thành công cho giáo viên {teacher['name']}!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/without-accounts', methods=['GET'])
def get_teachers_without_accounts():
    """Trả về danh sách giáo viên chưa được cấp tài khoản."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT id_VNeID, name
            FROM tTeacher
            WHERE is_active = 1
              AND id_VNeID NOT IN (SELECT username FROM tAccount WHERE is_active = 1)
            ORDER BY name
        """)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@teacher_bp.route('/create-accounts', methods=['POST'])
def bulk_create_accounts():
    data = request.json or {}
    actor_role = data.get('actor_role')
    if actor_role != 'manager':
        return jsonify({"success": False, "message": "Chỉ quản lý được thực hiện cấp tài khoản"}), 403

    id_vneids = data.get('id_vneids')  # Danh sách CCCD cần cấp. Nếu None, cấp toàn bộ.
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Lấy role_id của 'teacher' làm mặc định
        role_id = get_teacher_role_id(cursor)
        if not role_id:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy vai trò giáo viên trong hệ thống"}), 500

        if id_vneids is not None:
            if not id_vneids:
                cursor.close()
                conn.close()
                return jsonify({"success": True, "message": "Không có giáo viên nào được chọn."})
            placeholders = ','.join(['%s'] * len(id_vneids))
            cursor.execute(f"""
                SELECT id_VNeID, name FROM tTeacher
                WHERE is_active = 1
                  AND id_VNeID NOT IN (SELECT username FROM tAccount WHERE is_active = 1)
                  AND id_VNeID IN ({placeholders})
            """, id_vneids)
        else:
            cursor.execute("""
                SELECT id_VNeID, name FROM tTeacher
                WHERE is_active = 1
                  AND id_VNeID NOT IN (SELECT username FROM tAccount WHERE is_active = 1)
            """)

        teachers = cursor.fetchall()
        count = 0
        for t in teachers:
            id_vneid = t['id_VNeID']
            hashed_password = generate_password_hash(id_vneid)
            # Cập nhật hoặc thêm mới account
            cursor.execute("SELECT username FROM tAccount WHERE username = %s", (id_vneid,))
            existing = cursor.fetchone()
            if existing:
                cursor.execute("""
                    UPDATE tAccount
                    SET password = %s, role_id = %s, is_active = 1, must_change_password = 1
                    WHERE username = %s
                """, (hashed_password, role_id, id_vneid))
            else:
                cursor.execute("""
                    INSERT INTO tAccount (username, password, role_id, must_change_password, is_active)
                    VALUES (%s, %s, %s, 1, 1)
                """, (id_vneid, hashed_password, role_id))
            count += 1

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã cấp tài khoản thành công cho {count} giáo viên."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

