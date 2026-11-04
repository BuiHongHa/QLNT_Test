from flask import Blueprint, request, jsonify, Response
from config import get_db_connection
import csv, io
from excel_utils import generate_excel_response, read_file_rows

criteria_bp = Blueprint('criteria', __name__)

def ensure_criteria_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tInspectionCriteria (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description VARCHAR(255) NULL,
            min_penalty DECIMAL(4,1) NOT NULL DEFAULT 0,
            max_penalty DECIMAL(4,1) NOT NULL DEFAULT 5,
            is_active INT NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

@criteria_bp.route('/', methods=['GET'])
def get_criteria():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_criteria_table(cursor)
        cursor.execute("SELECT * FROM tInspectionCriteria WHERE is_active = 1 ORDER BY name")
        data = cursor.fetchall()
        for row in data:
            for k in ('min_penalty','max_penalty'):
                if row.get(k) is not None:
                    row[k] = float(row[k])
        cursor.close(); conn.close()
        return jsonify({"success": True, "data": data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@criteria_bp.route('/', methods=['POST'])
def create_criteria():
    d = request.json or {}
    if not d.get('name'):
        return jsonify({"success": False, "message": "Tên tiêu chí là bắt buộc"}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        ensure_criteria_table(cursor)
        cursor.execute("""
            INSERT INTO tInspectionCriteria (name, description, min_penalty, max_penalty)
            VALUES (%s, %s, %s, %s)
        """, (d['name'], d.get('description',''), float(d.get('min_penalty',0)), float(d.get('max_penalty',5))))
        conn.commit(); cursor.close(); conn.close()
        return jsonify({"success": True, "message": "Đã thêm tiêu chí"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@criteria_bp.route('/<int:id>', methods=['PUT'])
def update_criteria(id):
    d = request.json or {}
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE tInspectionCriteria SET name=%s, description=%s, min_penalty=%s, max_penalty=%s
            WHERE id=%s AND is_active=1
        """, (d.get('name',''), d.get('description',''), float(d.get('min_penalty',0)), float(d.get('max_penalty',5)), id))
        conn.commit()
        affected = cursor.rowcount
        cursor.close(); conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Không tìm thấy tiêu chí"}), 404
        return jsonify({"success": True, "message": "Đã cập nhật"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@criteria_bp.route('/<int:id>', methods=['DELETE'])
def delete_criteria(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tInspectionCriteria WHERE id=%s", (id,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close(); conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Không tìm thấy"}), 404
        return jsonify({"success": True, "message": "Đã xoá tiêu chí"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@criteria_bp.route('/template', methods=['GET'])
def criteria_template():
    headers = ["name", "description", "min_penalty", "max_penalty"]
    examples = [
        ["Vệ sinh chung", "Phòng bẩn hoặc có rác", 0, 5],
        ["Xếp đồ", "Đồ dùng không ngăn nắp", 0, 3]
    ]
    return generate_excel_response(headers, examples, "criteria_template.xlsx", sheet_name="Tiêu chí mẫu")

@criteria_bp.route('/upload', methods=['POST'])
def upload_criteria():
    if 'file' not in request.files:
        return jsonify({"success": False, "message": "Không tìm thấy file"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "message": "Chưa chọn file"}), 400

    filename_lower = file.filename.lower()
    if not (filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls') or filename_lower.endswith('.csv')):
        return jsonify({"success": False, "message": "Định dạng file không hợp lệ (hỗ trợ .xlsx, .xls, .csv)"}), 400

    headers, dict_rows, raw_rows = read_file_rows(file)
    if headers is None:
        return jsonify({"success": False, "message": "Không đọc được file"}), 400

    if not raw_rows:
        return jsonify({"success": False, "message": "File không có dữ liệu"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        ensure_criteria_table(cursor)
        count = 0
        errors = []

        for i, row in enumerate(raw_rows, start=2):
            try:
                d_row = dict_rows[i - 2] if i - 2 < len(dict_rows) else {}
                name = (d_row.get('name') or d_row.get('Tên tiêu chí') or (row[0] if len(row) > 0 else '')).strip()
                desc = (d_row.get('description') or d_row.get('Mô tả') or (row[1] if len(row) > 1 else '')).strip()
                min_p_raw = d_row.get('min_penalty') or d_row.get('Điểm trừ tối thiểu') or (row[2] if len(row) > 2 else 0)
                max_p_raw = d_row.get('max_penalty') or d_row.get('Điểm trừ tối đa') or (row[3] if len(row) > 3 else 5)

                if not name:
                    raise ValueError("Thiếu tên tiêu chí")

                min_p = float(min_p_raw or 0)
                max_p = float(max_p_raw or 5)

                cursor.execute("""
                    INSERT INTO tInspectionCriteria (name, description, min_penalty, max_penalty)
                    VALUES (%s, %s, %s, %s)
                """, (name, desc, min_p, max_p))
                count += 1
            except Exception as e:
                errors.append(f"Dòng {i}: {e}")

        conn.commit()
        cursor.close()
        conn.close()
        msg = f"Đã nhập thành công {count} tiêu chí."
        if errors:
            msg += f" Có {len(errors)} lỗi: " + "; ".join(errors[:3])
        return jsonify({"success": True, "message": msg})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@criteria_bp.route('/export', methods=['GET'])
def export_criteria():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_criteria_table(cursor)
        cursor.execute("SELECT * FROM tInspectionCriteria WHERE is_active = 1 ORDER BY name")
        items = cursor.fetchall()
        cursor.close()
        conn.close()

        headers = ["STT", "Tên tiêu chí", "Mô tả vi phạm", "Điểm trừ tối thiểu", "Điểm trừ tối đa"]
        rows = []
        for idx, item in enumerate(items, start=1):
            rows.append([
                idx,
                item.get('name') or '',
                item.get('description') or '',
                float(item.get('min_penalty') or 0),
                float(item.get('max_penalty') or 5)
            ])

        return generate_excel_response(headers, rows, "tieu_chi_cham_diem.xlsx", sheet_name="Tiêu chí vi phạm")
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
