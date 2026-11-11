from flask import Blueprint, jsonify, request
from config import get_db_connection

trash_bp = Blueprint('trash', __name__)

@trash_bp.route('/<string:item_type>', methods=['GET'])
def get_trashed_items(item_type):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        if item_type == 'students':
            cursor.execute("SELECT id_VNeID as id, name, sex, birth as dob, permanent_address as address FROM tstudent WHERE is_active = 0")
        elif item_type == 'teachers':
            cursor.execute("SELECT id_VNeID as id, name, sex, birth as dob, phone_number as phone FROM tteacher WHERE is_active = 0")
        elif item_type == 'rooms':
            cursor.execute("SELECT id, name, num_of_bed FROM tdormroom WHERE is_active = 0")
        else:
            return jsonify({"success": False, "message": "Loại dữ liệu không hợp lệ"}), 400
            
        items = cursor.fetchall()
        for item in items:
            if 'dob' in item and item['dob']:
                item['dob'] = str(item['dob'])
                
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": items})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@trash_bp.route('/<string:item_type>/<string:id>/restore', methods=['PUT'])
def restore_item(item_type, id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if item_type == 'students':
            cursor.execute("UPDATE tstudent SET is_active = 1 WHERE id_VNeID = %s", (id,))
        elif item_type == 'teachers':
            cursor.execute("UPDATE tteacher SET is_active = 1 WHERE id_VNeID = %s", (id,))
        elif item_type == 'rooms':
            cursor.execute("UPDATE tdormroom SET is_active = 1 WHERE id = %s", (id,))
        else:
            return jsonify({"success": False, "message": "Loại dữ liệu không hợp lệ"}), 400
            
        if cursor.rowcount == 0:
            cursor.close(); conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy dữ liệu để khôi phục"}), 404
            
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Khôi phục thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

def safe_delete_one(cursor, table, col, val):
    try:
        cursor.execute(f"DELETE FROM {table} WHERE {col} = %s", (val,))
    except Exception as err:
        err_msg = str(err).lower()
        if getattr(err, 'errno', None) == 1146 or '1146' in err_msg or "doesn't exist" in err_msg:
            return
        raise

def safe_delete_bulk(cursor, table, col, ids):
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

@trash_bp.route('/<string:item_type>/<string:id>/hard', methods=['DELETE'])
def hard_delete_item(item_type, id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if item_type == 'students':
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
                safe_delete_one(cursor, table, col, id)
            
        elif item_type == 'teachers':
            for table, col in [
                ('taccount', 'username'),
                ('troomchangerequest', 'id_teacher'),
                ('troomadminrequest', 'id_teacher'),
                ('manage', 'id_teacher'),
                ('tteacher', 'id_VNeID')
            ]:
                safe_delete_one(cursor, table, col, id)
            
        elif item_type == 'rooms':
            for table, col in [
                ('troominspection', 'id_dormroom'),
                ('troomchangerequest', 'id_dormroom'),
                ('troomadminrequest', 'id_dormroom'),
                ('living', 'id_dormroom'),
                ('tdormroom', 'id')
            ]:
                safe_delete_one(cursor, table, col, id)
            
        else:
            return jsonify({"success": False, "message": "Loại dữ liệu không hợp lệ"}), 400
            
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Đã xoá vĩnh viễn"})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@trash_bp.route('/<string:item_type>/bulk-restore', methods=['POST'])
def bulk_restore_items(item_type):
    try:
        data = request.get_json() or {}
        ids = data.get('ids', [])
        if not ids:
            return jsonify({"success": False, "message": "Không có mục nào được chọn"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        placeholders = ','.join(['%s'] * len(ids))

        if item_type == 'students':
            cursor.execute(f"UPDATE tstudent SET is_active = 1 WHERE id_VNeID IN ({placeholders})", ids)
            cursor.execute(f"UPDATE taccount SET is_active = 1 WHERE username IN ({placeholders})", ids)
            cursor.execute(f"UPDATE study SET is_active = 1 WHERE id_student IN ({placeholders})", ids)
        elif item_type == 'teachers':
            cursor.execute(f"UPDATE tteacher SET is_active = 1 WHERE id_VNeID IN ({placeholders})", ids)
            cursor.execute(f"UPDATE taccount SET is_active = 1 WHERE username IN ({placeholders})", ids)
        elif item_type == 'rooms':
            cursor.execute(f"UPDATE tdormroom SET is_active = 1 WHERE id IN ({placeholders})", ids)
        else:
            return jsonify({"success": False, "message": "Loại dữ liệu không hợp lệ"}), 400

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã khôi phục {len(ids)} mục thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@trash_bp.route('/<string:item_type>/bulk-hard', methods=['POST'])
def bulk_hard_delete_items(item_type):
    try:
        data = request.get_json() or {}
        ids = data.get('ids', [])
        if not ids:
            return jsonify({"success": False, "message": "Không có mục nào được chọn"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        placeholders = ','.join(['%s'] * len(ids))

        if item_type == 'students':
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
                safe_delete_bulk(cursor, table, col, ids)
        elif item_type == 'teachers':
            for table, col in [
                ('taccount', 'username'),
                ('troomchangerequest', 'id_teacher'),
                ('troomadminrequest', 'id_teacher'),
                ('manage', 'id_teacher'),
                ('tteacher', 'id_VNeID')
            ]:
                safe_delete_bulk(cursor, table, col, ids)
        elif item_type == 'rooms':
            for table, col in [
                ('troominspection', 'id_dormroom'),
                ('troomchangerequest', 'id_dormroom'),
                ('troomadminrequest', 'id_dormroom'),
                ('living', 'id_dormroom'),
                ('tdormroom', 'id')
            ]:
                safe_delete_bulk(cursor, table, col, ids)
        else:
            return jsonify({"success": False, "message": "Loại dữ liệu không hợp lệ"}), 400

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"Đã xoá vĩnh viễn {len(ids)} mục khỏi cơ sở dữ liệu MySQL"})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
