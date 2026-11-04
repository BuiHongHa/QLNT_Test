from flask import Blueprint, request, jsonify
from config import get_db_connection
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import timedelta
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
    set_refresh_cookies,
    unset_jwt_cookies,
)

login_bp = Blueprint('login', __name__)

ROLE_LABELS = {
    'student': 'học sinh',
    'teacher': 'giáo viên',
    'manager': 'Ban Giám Hiệu',
    'dorm_manager': 'quản lý ký túc xá',
    'canteen_manager': 'quản lý nhà ăn',
}

def normalize_role_name(role_name):
    if role_name in ('guardian', 'guard'):
        return 'dorm_manager'
    return role_name

def find_active_user(username):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT a.*, r.name as role_name,
                   COALESCE(t.name, s.name, a.username) AS display_name
            FROM tAccount a
            JOIN tRole r ON a.role_id = r.id
            LEFT JOIN tTeacher t ON a.username = t.id_VNeID AND t.is_active = 1
            LEFT JOIN tStudent s ON a.username = s.id_VNeID AND s.is_active = 1
            WHERE a.username = %s AND a.is_active = 1
        """, (username,))
        return cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

def serialize_user(user):
    user.pop('password', None)
    user['role_name'] = normalize_role_name(user.get('role_name'))
    user['role_label'] = ROLE_LABELS.get(user.get('role_name'), user.get('role_name'))
    return user

@login_bp.route('/', methods=['POST'])
def auth_login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    remember_me = bool(data.get('remember_me'))
    
    try:
        user = find_active_user(username)
        
        if user and check_password_hash(user['password'], password):
            access_token = create_access_token(identity=username)
            refresh_expires = timedelta(days=30 if remember_me else 1)
            refresh_token = create_refresh_token(
                identity=username,
                expires_delta=refresh_expires,
                additional_claims={"remember_me": remember_me},
            )
            response = jsonify({
                "success": True,
                "message": "Login successful",
                "access_token": access_token,
                "data": serialize_user(user),
                "remember_me": remember_me,
            })
            set_refresh_cookies(
                response,
                refresh_token,
                max_age=30 * 24 * 60 * 60 if remember_me else None,
            )
            return response
        else:
            return jsonify({"success": False, "message": "Invalid username/password or account inactive"}), 401
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True, locations=['cookies'])
def refresh_login():
    try:
        username = get_jwt_identity()
        claims = get_jwt()
        user = find_active_user(username)
        if not user:
            return jsonify({"success": False, "message": "Account inactive or not found"}), 401

        access_token = create_access_token(identity=username)
        remember_me = bool(claims.get('remember_me'))
        return jsonify({
            "success": True,
            "access_token": access_token,
            "data": serialize_user(user),
            "remember_me": remember_me,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/logout', methods=['POST'])
def logout():
    response = jsonify({"success": True, "message": "Logout successful"})
    unset_jwt_cookies(response)
    return response

@login_bp.route('/accounts', methods=['GET'])
def get_accounts():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT a.username, a.role_id, r.name AS role_name, a.is_active,
                   COALESCE(t.name, s.name, a.username) AS display_name
            FROM tAccount a
            JOIN tRole r ON a.role_id = r.id
            LEFT JOIN tTeacher t ON a.username = t.id_VNeID AND t.is_active = 1
            LEFT JOIN tStudent s ON a.username = s.id_VNeID AND s.is_active = 1
            WHERE a.is_active = 1
        """)
        accounts = cursor.fetchall()
        for account in accounts:
            account['role_name'] = normalize_role_name(account.get('role_name'))
            account['role_label'] = ROLE_LABELS.get(account.get('role_name'), account.get('role_name'))
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": accounts})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/roles', methods=['GET'])
def get_roles():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            UPDATE tRole SET name = 'dorm_manager'
            WHERE name IN ('guard', 'guardian')
        """)
        for role_name in ('student', 'teacher', 'manager', 'dorm_manager', 'canteen_manager'):
            cursor.execute("""
                INSERT INTO tRole (name)
                SELECT %s WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name = %s)
            """, (role_name, role_name))
        conn.commit()
        cursor.execute("SELECT id, name FROM tRole WHERE is_active = 1 AND name IN ('student','teacher','manager','dorm_manager','canteen_manager') ORDER BY id")
        roles = cursor.fetchall()
        for role in roles:
            role['name'] = normalize_role_name(role.get('name'))
            role['label'] = ROLE_LABELS.get(role.get('name'), role.get('name'))
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": roles})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/accounts/<username>/role', methods=['PUT'])
def update_account_role(username):
    data = request.json or {}
    actor_role = normalize_role_name(data.get('actor_role'))
    role_id = data.get('role_id')
    if actor_role != 'manager':
        return jsonify({"success": False, "message": "Chỉ quản lý được set role"}), 403
    if not role_id:
        return jsonify({"success": False, "message": "Thiếu role_id"}), 400
    if username == 'admin' and str(role_id) != '2':
        return jsonify({"success": False, "message": "Không thể thay đổi vai trò của tài khoản Quản trị tối cao (admin)"}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM tRole WHERE id = %s AND is_active = 1", (role_id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Role không hợp lệ"}), 400

        cursor.execute("""
            UPDATE tAccount SET role_id = %s
            WHERE username = %s AND is_active = 1
        """, (role_id, username))
        affected = cursor.rowcount
        if affected == 0:
            cursor.execute("SELECT username FROM tAccount WHERE username = %s", (username,))
            existing_account = cursor.fetchone()
            if existing_account:
                cursor.execute("""
                    UPDATE tAccount
                    SET role_id = %s, is_active = 1
                    WHERE username = %s
                """, (role_id, username))
            else:
                cursor.execute("""
                    INSERT INTO tAccount (username, password, role_id)
                    VALUES (%s, %s, %s)
                """, (username, generate_password_hash(username), role_id))

        conn.commit()
        affected = 1
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Không tìm thấy account"}), 404
        return jsonify({"success": True, "message": "Cập nhật role thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/accounts', methods=['POST'])
def create_account():
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        hashed_password = generate_password_hash(data['password'])
        sql = """INSERT INTO tAccount (username, password, role_id)
                 VALUES (%s, %s, %s)"""
        val = (data['username'], hashed_password, data['role_id'])
        cursor.execute(sql, val)
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Account created successfully"}), 201
    except KeyError as e:
        return jsonify({"success": False, "error": f"Missing required field: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/accounts/<username>', methods=['PUT'])
def update_account(username):
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        hashed_password = generate_password_hash(data['password'])
        sql = """UPDATE tAccount 
                 SET password=%s, role_id=%s
                 WHERE username=%s AND is_active=1"""
        val = (hashed_password, data['role_id'], username)
        cursor.execute(sql, val)
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Account not found or inactive"}), 404
        return jsonify({"success": True, "message": "Account updated successfully"})
    except KeyError as e:
        return jsonify({"success": False, "error": f"Missing required field: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/accounts/<username>', methods=['DELETE'])
def delete_account(username):
    if username == 'admin':
        return jsonify({"success": False, "message": "Không thể khóa tài khoản Quản trị viên tối cao (admin)"}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE tAccount SET is_active = 0 WHERE username = %s", (username,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Account not found"}), 404
        return jsonify({"success": True, "message": "Account soft deleted (locked) successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/change-password', methods=['PUT'])
def change_password():
    data = request.json or {}
    username = data.get('username')
    old_password = data.get('old_password')
    new_password = data.get('new_password')

    if not all([username, old_password, new_password]):
        return jsonify({"success": False, "message": "Thiếu thông tin mật khẩu"}), 400

    if len(new_password) < 6 or not any(c.isalpha() for c in new_password) or not any(c.isdigit() for c in new_password):
        return jsonify({"success": False, "message": "Mật khẩu mới phải có độ dài từ 6 ký tự trở lên, bao gồm cả chữ cái và chữ số"}), 400

    if old_password == new_password:
        return jsonify({"success": False, "message": "Mật khẩu mới không được trùng với mật khẩu hiện tại"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT password FROM tAccount WHERE username = %s AND is_active = 1", (username,))
        user = cursor.fetchone()

        if not user:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Tài khoản không tồn tại hoặc đã bị khoá"}), 404

        if not check_password_hash(user['password'], old_password):
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Mật khẩu cũ không chính xác"}), 400

        hashed_new_password = generate_password_hash(new_password)
        cursor.execute("UPDATE tAccount SET password = %s, must_change_password = 0 WHERE username = %s", (hashed_new_password, username))
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({"success": True, "message": "Đổi mật khẩu thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/reset-password/<username>', methods=['PUT'])
def reset_password(username):
    data = request.json
    actor_role = data.get('actor_role')
    new_password = data.get('new_password')

    if actor_role != 'manager':
        return jsonify({"success": False, "message": "Chỉ quản lý được reset mật khẩu"}), 403

    if not new_password:
        return jsonify({"success": False, "message": "Thiếu mật khẩu mới"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        hashed_new_password = generate_password_hash(new_password)
        cursor.execute("UPDATE tAccount SET password = %s WHERE username = %s AND is_active = 1", (hashed_new_password, username))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()

        if affected == 0:
            return jsonify({"success": False, "message": "Tài khoản không tồn tại hoặc đã bị khoá"}), 404

        return jsonify({"success": True, "message": "Cấp lại mật khẩu thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from datetime import datetime, timedelta

def send_reset_email(to_email, display_name, username, token):
    mail_server = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    mail_port = int(os.getenv('MAIL_PORT', '587'))
    mail_email = os.getenv('MAIL_EMAIL', 'example@gmail.com')
    mail_password = os.getenv('MAIL_PASSWORD', 'password')
    frontend_url = os.getenv('FRONTEND_URL', 'https://localhost:5174')

    reset_link = f"{frontend_url}/reset-password?token={token}"

    msg = MIMEMultipart()
    msg['From'] = mail_email
    msg['To'] = to_email
    msg['Subject'] = '[Dorm Manager] Yeu cau dat lai mat khau'

    body = f"""Chào {display_name},

Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản {username}.
Vui lòng nhấn vào liên kết bên dưới để thiết lập mật khẩu mới:

{reset_link}

Liên kết này có hiệu lực trong vòng 15 phút. Nếu bạn không gửi yêu cầu này, vui lòng bỏ qua email này.

Trân trọng,
Ban Quản lý Ký túc xá
"""
    msg.attach(MIMEText(body, 'plain', 'utf-8'))

    try:
        server = smtplib.SMTP(mail_server, mail_port)
        server.starttls()
        server.login(mail_email, mail_password)
        text = msg.as_string()
        server.sendmail(mail_email, to_email, text)
        server.quit()
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

@login_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data = request.json or {}
    username = data.get('username', '').strip()
    if not username:
        return jsonify({"success": False, "message": "Vui lòng nhập tên đăng nhập"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Check active account and find email & display name from tTeacher or tStudent
        cursor.execute("""
            SELECT a.username, COALESCE(t.name, s.name, a.username) AS display_name,
                   COALESCE(t.email, s.email) AS email
            FROM tAccount a
            LEFT JOIN tTeacher t ON a.username = t.id_VNeID AND t.is_active = 1
            LEFT JOIN tStudent s ON a.username = s.id_VNeID AND s.is_active = 1
            WHERE a.username = %s AND a.is_active = 1
        """, (username,))
        user = cursor.fetchone()
        
        if not user:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Tài khoản không tồn tại hoặc đã bị khoá"}), 404

        email = user.get('email')
        if not email:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Tài khoản chưa có email liên kết. Vui lòng liên hệ quản lý."}), 400

        # Generate token and save to DB
        token = secrets.token_hex(32)
        expires_at = datetime.now() + timedelta(minutes=15)
        
        cursor.execute("""
            INSERT INTO tPasswordResetToken (username, token, expires_at)
            VALUES (%s, %s, %s)
        """, (username, token, expires_at))
        conn.commit()
        cursor.close()
        conn.close()

        # Send email
        if send_reset_email(email, user['display_name'], username, token):
            return jsonify({"success": True, "message": f"Đã gửi email hướng dẫn đặt lại mật khẩu đến {email}."})
        else:
            return jsonify({"success": False, "message": "Gửi email thất bại. Vui lòng thử lại sau."}), 500

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/reset-password', methods=['POST'])
def reset_password_token():
    data = request.json or {}
    token = data.get('token', '').strip()
    new_password = data.get('new_password', '').strip()

    if not token or not new_password:
        return jsonify({"success": False, "message": "Vui lòng nhập đầy đủ thông tin"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT * FROM tPasswordResetToken
            WHERE token = %s AND used = 0 AND expires_at > NOW()
        """, (token,))
        token_rec = cursor.fetchone()

        if not token_rec:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"}), 400

        username = token_rec['username']
        hashed_password = generate_password_hash(new_password)

        # Update password and set must_change_password to 0
        cursor.execute("""
            UPDATE tAccount
            SET password = %s, must_change_password = 0
            WHERE username = %s AND is_active = 1
        """, (hashed_password, username))
        
        # Mark token as used
        cursor.execute("UPDATE tPasswordResetToken SET used = 1 WHERE id = %s", (token_rec['id'],))
        
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({"success": True, "message": "Đặt lại mật khẩu thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@login_bp.route('/change-password-first', methods=['PUT'])
@jwt_required()
def change_password_first():
    data = request.json or {}
    new_password = data.get('new_password', '').strip()
    username = get_jwt_identity()

    if not new_password:
        return jsonify({"success": False, "message": "Mật khẩu mới không được để trống"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT must_change_password FROM tAccount WHERE username = %s AND is_active = 1", (username,))
        user = cursor.fetchone()

        if not user:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Tài khoản không tồn tại hoặc đã bị khoá"}), 404

        if user['must_change_password'] != 1:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Tài khoản không ở trạng thái yêu cầu đổi mật khẩu lần đầu"}), 400

        hashed_password = generate_password_hash(new_password)
        cursor.execute("""
            UPDATE tAccount
            SET password = %s, must_change_password = 0
            WHERE username = %s
        """, (hashed_password, username))
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({"success": True, "message": "Đổi mật khẩu lần đầu thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

