from flask import Blueprint, request, jsonify
from config import get_db_connection

class_bp = Blueprint('class', __name__)

@class_bp.route('/', methods=['GET'])
def get_classes():
    teacher_id = request.args.get('teacher_id')
    username = request.args.get('username')
    role_name = (request.args.get('role_name') or '').strip().lower()
    if role_name == 'teacher' and username:
        teacher_id = username
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        if teacher_id:
            cursor.execute("""
                SELECT DISTINCT c.*
                FROM tClass c
                JOIN MANAGE m ON c.id = m.id_class AND m.is_active = 1
                WHERE c.is_active = 1 AND m.id_teacher = %s
            """, (teacher_id,))
        else:
            cursor.execute("SELECT * FROM tClass WHERE is_active = 1")
        classes = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": classes})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@class_bp.route('/<id>', methods=['GET'])
def get_class(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM tClass WHERE id = %s AND is_active = 1", (id,))
        class_obj = cursor.fetchone()
        cursor.close()
        conn.close()
        if class_obj:
            return jsonify({"success": True, "data": class_obj})
        return jsonify({"success": False, "message": "Class not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@class_bp.route('/', methods=['POST'])
def create_class():
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        sql = """INSERT INTO tClass (id, name, school_year)
                 VALUES (%s, %s, %s)"""
        val = (data['id'], data['name'], data.get('school_year'))
        cursor.execute(sql, val)
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Class created successfully"}), 201
    except KeyError as e:
        return jsonify({"success": False, "error": f"Missing required field: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@class_bp.route('/<id>', methods=['PUT'])
def update_class(id):
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        sql = """UPDATE tClass 
                 SET name=%s, school_year=%s
                 WHERE id=%s AND is_active=1"""
        val = (data['name'], data.get('school_year'), id)
        cursor.execute(sql, val)
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Class not found or inactive"}), 404
        return jsonify({"success": True, "message": "Class updated successfully"})
    except KeyError as e:
        return jsonify({"success": False, "error": f"Missing required field: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@class_bp.route('/<id>', methods=['DELETE'])
def delete_class(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE tClass SET is_active = 0 WHERE id = %s", (id,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Class not found"}), 404
        return jsonify({"success": True, "message": "Class soft deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
