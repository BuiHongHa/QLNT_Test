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

@trash_bp.route('/<string:item_type>/<string:id>/hard', methods=['DELETE'])
def hard_delete_item(item_type, id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if item_type == 'students':
            # Remove related records in child tables first
            cursor.execute("DELETE FROM taccount WHERE username = %s", (id,))
            cursor.execute("DELETE FROM tinspectionviolation WHERE id_student = %s", (id,))
            cursor.execute("DELETE FROM troomchangerequest WHERE id_student = %s", (id,))
            cursor.execute("DELETE FROM tmealattendance WHERE id_student = %s", (id,))
            cursor.execute("DELETE FROM tleaverequest WHERE id_student = %s", (id,))
            cursor.execute("DELETE FROM living WHERE id_student = %s", (id,))
            cursor.execute("DELETE FROM study WHERE id_student = %s", (id,))
            cursor.execute("DELETE FROM tparent WHERE id_student = %s", (id,))
            # Finally remove from main table
            cursor.execute("DELETE FROM tstudent WHERE id_VNeID = %s", (id,))
            
        elif item_type == 'teachers':
            cursor.execute("DELETE FROM taccount WHERE username = %s", (id,))
            cursor.execute("DELETE FROM troomchangerequest WHERE id_teacher = %s", (id,))
            cursor.execute("DELETE FROM troomadminrequest WHERE id_teacher = %s", (id,))
            cursor.execute("DELETE FROM manage WHERE id_teacher = %s", (id,))
            cursor.execute("DELETE FROM tteacher WHERE id_VNeID = %s", (id,))
            
        elif item_type == 'rooms':
            cursor.execute("UPDATE tcamera SET id_room = NULL WHERE id_room = %s", (id,))
            cursor.execute("DELETE FROM troominspection WHERE id_dormroom = %s", (id,))
            cursor.execute("DELETE FROM troomchangerequest WHERE id_dormroom = %s", (id,))
            cursor.execute("DELETE FROM troomadminrequest WHERE id_dormroom = %s", (id,))
            cursor.execute("DELETE FROM living WHERE id_dormroom = %s", (id,))
            cursor.execute("DELETE FROM tdormroom WHERE id = %s", (id,))
            
        else:
            return jsonify({"success": False, "message": "Loại dữ liệu không hợp lệ"}), 400
            
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Đã xoá vĩnh viễn"})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
