from flask import Blueprint, request, jsonify, Response
from config import get_db_connection
from datetime import datetime
from mock_time import get_now
import time

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None

try:
    from pyzbar.pyzbar import decode
except (ImportError, OSError):
    decode = None

access_log_bp = Blueprint('access_log', __name__)

def ensure_camera_schema(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tCamera (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name NVARCHAR(100) NOT NULL,
            camera_type VARCHAR(20) NOT NULL DEFAULT 'DEVICE',
            device_id VARCHAR(255),
            stream_url VARCHAR(255),
            is_active INT DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    try:
        cursor.execute("ALTER TABLE tCamera ADD COLUMN device_id VARCHAR(255) NULL AFTER camera_type")
    except Exception:
        pass

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

def normalize_student_code(raw_code):
    student_id = (raw_code or '').strip()
    if '|' in student_id:
        student_id = student_id.split('|')[0].strip()
    return student_id

def get_current_presence(cursor, student_id):
    cursor.execute("""
        SELECT type, access_time
        FROM tAccessLog
        WHERE id_student = %s
          AND type IN ('IN', 'OUT')
        ORDER BY access_time DESC, id DESC
        LIMIT 1
    """, (student_id,))
    last_log = cursor.fetchone()
    if last_log and (last_log.get('type') or '').upper() == 'OUT':
        return {
            "status": "OUTSIDE",
            "status_text": "Đang ở ngoài trường",
            "suggested_action": "IN",
            "last_access": last_log
        }
    return {
        "status": "INSIDE",
        "status_text": "Đang ở trong trường",
        "suggested_action": "OUT",
        "last_access": last_log
    }

def get_active_leave(cursor, student_id, now):
    from datetime import timedelta, time as dtime
    # For REGULAR_WEEKEND: compute current weekend window (Fri 16:00 -> Sun 23:59:59)
    today = now.date()
    days_to_friday = (4 - today.weekday()) % 7
    friday = today + timedelta(days=days_to_friday)
    # If today is past Sunday of this week's window, look at next week's window
    weekend_end = datetime.combine(friday + timedelta(days=2), dtime(23, 59, 59))
    weekend_start = datetime.combine(friday, dtime(16, 0))

    # Check REGULAR_WEEKEND: must match the current week's child record
    cursor.execute("""
        SELECT *
        FROM tLeaveRequest
        WHERE id_student = %s
          AND is_active = 1
          AND leave_type = 'REGULAR_WEEKEND'
          AND recurring_parent_id IS NOT NULL
          AND start_time <= %s
          AND end_time >= %s
        ORDER BY end_time DESC
    """, (student_id, now, now))
    for row in cursor.fetchall():
        if leave_effective_status(row) == 'ACCEPTED':
            return row

    # Check non-REGULAR_WEEKEND leaves (AFTER_SCHOOL, EMERGENCY, etc.)
    cursor.execute("""
        SELECT *
        FROM tLeaveRequest
        WHERE id_student = %s
          AND is_active = 1
          AND leave_type != 'REGULAR_WEEKEND'
          AND start_time <= %s
          AND end_time >= %s
        ORDER BY end_time DESC
    """, (student_id, now, now))
    for row in cursor.fetchall():
        if leave_effective_status(row) == 'ACCEPTED':
            return row

    return None

def format_dt(value):
    return value.strftime('%Y-%m-%d %H:%M:%S') if value else None

def normalize_role(role_name):
    return (role_name or '').strip().lower()

def get_actor_role(cursor, username=None, role_name=None):
    role_name = normalize_role(role_name)
    if username:
        cursor.execute("""
            SELECT r.name AS role_name
            FROM tAccount a
            JOIN tRole r ON a.role_id = r.id
            WHERE a.username = %s AND a.is_active = 1 AND r.is_active = 1
        """, (username,))
        account = cursor.fetchone()
        if account:
            return normalize_role(account.get('role_name'))
    return role_name

def teacher_manages_student_clause(student_alias='s'):
    return f"""
        EXISTS (
            SELECT 1
            FROM STUDY st_teacher
            JOIN tClass c_teacher ON st_teacher.id_class = c_teacher.id AND c_teacher.is_active = 1
            JOIN MANAGE m_teacher ON c_teacher.id = m_teacher.id_class AND m_teacher.is_active = 1
            WHERE st_teacher.id_student = {student_alias}.id_VNeID
              AND st_teacher.is_active = 1
              AND m_teacher.id_teacher = %s
        )
    """

def serialize_leave_for_access(leave):
    if not leave:
        return None
    for key in ['start_time', 'end_time', 'created_at']:
        if leave.get(key):
            leave[key] = format_dt(leave[key])
    return leave

def build_access_preview(cursor, student_id):
    cursor.execute("SELECT id_VNeID, name, image_url FROM tStudent WHERE id_VNeID = %s AND is_active = 1", (student_id,))
    student = cursor.fetchone()
    if not student:
        return None

    now = get_now()
    leave = get_active_leave(cursor, student_id, now)
    presence = get_current_presence(cursor, student_id)
    last_access = presence.get("last_access")
    if last_access and last_access.get("access_time"):
        last_access["access_time"] = format_dt(last_access["access_time"])

    suggested_action = presence["suggested_action"]
    allowed = suggested_action == 'IN' or leave is not None
    if suggested_action == 'OUT':
        message = "Hệ thống dự đoán hành động: RA. Học sinh có đơn phép hợp lệ." if allowed else "Hệ thống dự đoán hành động: RA. Chưa có đơn phép hợp lệ tại thời điểm này."
    else:
        message = "Hệ thống dự đoán hành động: VÀO."

    return {
        "success": True,
        "allowed": allowed,
        "message": message,
        "data": {
            "student": student,
            "leave": serialize_leave_for_access(leave),
            "presence": {
                "status": presence["status"],
                "status_text": presence["status_text"],
                "suggested_action": suggested_action,
                "last_access": last_access,
            }
        }
    }

def preview_student_access(raw_code):
    student_id = normalize_student_code(raw_code)
    if not student_id:
        return jsonify({"success": False, "message": "Thiếu mã học sinh"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        preview = build_access_preview(cursor, student_id)
        cursor.close()
        conn.close()

        if not preview:
            return jsonify({"success": False, "allowed": False, "message": "Không tìm thấy học sinh"}), 404
        return jsonify(preview)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@access_log_bp.route('/', methods=['GET'])
def get_access_logs():
    try:
        # Query params
        filter_date = request.args.get('date', '')       # YYYY-MM-DD single date
        filter_date_from = request.args.get('date_from', '').strip()
        filter_date_to = request.args.get('date_to', '').strip()
        class_name = request.args.get('class_name', '')
        teacher_id = request.args.get('teacher_id', '').strip()
        username = request.args.get('username', '').strip()
        role_name = request.args.get('role_name', '').strip()
        search = request.args.get('search', '').strip()
        page = max(int(request.args.get('page', 1)), 1)
        per_page = min(max(int(request.args.get('per_page', 15)), 1), 100)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        if get_actor_role(cursor, username, role_name) == 'teacher':
            teacher_id = username

        # Base query with JOIN to get student name and class
        base = """
            FROM tAccessLog a
            JOIN tStudent s ON a.id_student = s.id_VNeID
            LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
            LEFT JOIN tClass c ON st.id_class = c.id AND c.is_active = 1
        """
        where_clauses = ["a.type IN ('IN', 'OUT')"]
        params = []

        # Date filtering: range takes priority over single date
        if filter_date_from or filter_date_to:
            if filter_date_from:
                where_clauses.append("DATE(a.access_time) >= %s")
                params.append(filter_date_from)
            if filter_date_to:
                where_clauses.append("DATE(a.access_time) <= %s")
                params.append(filter_date_to)
        else:
            # Default to today if no date specified
            if not filter_date:
                from mock_time import get_today
                filter_date = get_today().strftime('%Y-%m-%d')
            where_clauses.append("DATE(a.access_time) = %s")
            params.append(filter_date)

        if class_name:
            where_clauses.append("c.name = %s")
            params.append(class_name)

        if teacher_id:
            where_clauses.append(teacher_manages_student_clause('s'))
            params.append(teacher_id)

        if search:
            where_clauses.append("(s.name LIKE %s OR a.id_student LIKE %s)")
            like_val = f"%{search}%"
            params.extend([like_val, like_val])

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        # Count total
        cursor.execute(f"SELECT COUNT(*) AS total {base} {where_sql}", params)
        total = (cursor.fetchone() or {}).get('total', 0)
        total_pages = max(1, (total + per_page - 1) // per_page)

        # Fetch page
        offset = (page - 1) * per_page
        cursor.execute(f"""
            SELECT a.id, a.id_student, s.name AS student_name, c.name AS class_name,
                   a.access_time, a.type, a.note
            {base}
            {where_sql}
            ORDER BY a.access_time DESC, a.id DESC
            LIMIT %s OFFSET %s
        """, params + [per_page, offset])
        logs = cursor.fetchall()

        cursor.close()
        conn.close()

        # Format datetime
        for log in logs:
            if log.get('access_time'):
                log['access_time'] = log['access_time'].strftime('%Y-%m-%d %H:%M:%S')

        return jsonify({
            "success": True,
            "data": logs,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": total_pages
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@access_log_bp.route('/', methods=['POST'])
def create_access_log():
    data = request.json or {}
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        if get_actor_role(cursor, data.get('username'), data.get('role_name')) == 'teacher':
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Giáo viên không được check ra/vào"}), 403

        sql = """INSERT INTO tAccessLog (id_student, access_time, type, note)
                 VALUES (%s, %s, %s, %s)"""
        val = (data['id_student'], data['access_time'], data['type'], data.get('note'))
        cursor.execute(sql, val)
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Đã tạo lịch sử ra/vào"}), 201
    except KeyError as e:
        return jsonify({"success": False, "error": f"Thiếu trường bắt buộc: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@access_log_bp.route('/check', methods=['POST'])
def check_student_permission():
    data = request.json or {}
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        if get_actor_role(cursor, data.get('username'), data.get('role_name')) == 'teacher':
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Giáo viên không được check ra/vào"}), 403
        cursor.close()
        conn.close()
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    return preview_student_access(data.get('id_student') or data.get('code'))

@access_log_bp.route('/barcode', methods=['POST'])
def check_barcode():
    return check_student_permission()

@access_log_bp.route('/action', methods=['POST'])
def record_access_action():
    data = request.json or {}
    student_id = normalize_student_code(data.get('id_student') or data.get('code'))
    action = (data.get('action') or '').strip().upper()
    username = (data.get('username') or '').strip()
    confirmed = bool(data.get('confirmed'))

    if not student_id:
        return jsonify({"success": False, "message": "Thiếu mã học sinh"}), 400
    if action not in {'IN', 'OUT', 'SKIP'}:
        return jsonify({"success": False, "message": "Hành động không hợp lệ"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        if get_actor_role(cursor, username, data.get('role_name')) == 'teacher':
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Giáo viên không được check ra/vào"}), 403

        preview = build_access_preview(cursor, student_id)
        if not preview:
            cursor.close()
            conn.close()
            return jsonify({"success": False, "allowed": False, "message": "Không tìm thấy học sinh"}), 404

        presence = preview["data"]["presence"]
        suggested_action = presence["suggested_action"]
        needs_confirmation = action == 'SKIP' or action != suggested_action or (action == 'OUT' and not preview["allowed"])
        if needs_confirmation and not confirmed:
            cursor.close()
            conn.close()
            return jsonify({
                "success": False,
                "needs_confirmation": True,
                "message": "Hành động cần xác nhận",
                "data": {
                    "student": preview["data"]["student"],
                    "presence": presence,
                    "requested_action": action,
                    "suggested_action": suggested_action,
                    "allowed": preview["allowed"],
                }
            }), 409

        now = get_now()
        action_text = {'IN': 'Vào trường', 'OUT': 'Ra khỏi trường', 'SKIP': 'Bỏ qua lượt quét'}[action]
        note_parts = [action_text]
        if action != suggested_action:
            note_parts.append(f"trái dự đoán {suggested_action}")
        if action == 'OUT' and not preview["allowed"]:
            note_parts.append("không có đơn phép hợp lệ")
        if confirmed:
            note_parts.append("đã xác nhận")
        if username:
            note_parts.append(f"thực hiện bởi {username}")

        cursor.execute("""
            INSERT INTO tAccessLog (id_student, access_time, type, note)
            VALUES (%s, %s, %s, %s)
        """, (student_id, now.strftime('%Y-%m-%d %H:%M:%S'), action, "; ".join(note_parts)))
        conn.commit()
        log_id = cursor.lastrowid

        preview_after = build_access_preview(cursor, student_id)
        cursor.close()
        conn.close()

        return jsonify({
            "success": True,
            "allowed": action != 'OUT' or preview["allowed"] or confirmed,
            "message": f"Đã ghi nhận: {action_text}",
            "data": {
                "log_id": log_id,
                "student": preview["data"]["student"],
                "presence": preview_after["data"]["presence"] if preview_after else presence,
                "action": action,
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@access_log_bp.route('/cameras', methods=['GET'])
def get_cameras():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_camera_schema(cursor)
        cursor.execute("SELECT * FROM tCamera WHERE is_active = 1 ORDER BY id DESC")
        cameras = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "data": cameras})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@access_log_bp.route('/cameras', methods=['POST'])
def create_camera():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    camera_type = (data.get('camera_type') or 'DEVICE').strip().upper()
    device_id = (data.get('device_id') or '').strip() or None
    stream_url = (data.get('stream_url') or '').strip() or None
    if not name:
        return jsonify({"success": False, "message": "Thiếu tên camera"}), 400
    if camera_type not in {'DEVICE', 'RTSP'}:
        return jsonify({"success": False, "message": "Loại camera không hợp lệ"}), 400
    if camera_type == 'RTSP' and not stream_url:
        return jsonify({"success": False, "message": "Camera RTSP cần URL"}), 400
    if camera_type == 'DEVICE':
        stream_url = None
    else:
        device_id = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        ensure_camera_schema(cursor)
        cursor.execute("""
            INSERT INTO tCamera (name, camera_type, device_id, stream_url)
            VALUES (%s, %s, %s, %s)
        """, (name, camera_type, device_id, stream_url))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Thêm camera thành công"}), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@access_log_bp.route('/cameras/<int:id>', methods=['PUT'])
def update_camera(id):
    data = request.json or {}
    name = (data.get('name') or '').strip()
    camera_type = (data.get('camera_type') or 'DEVICE').strip().upper()
    device_id = (data.get('device_id') or '').strip() or None
    stream_url = (data.get('stream_url') or '').strip() or None
    if not name:
        return jsonify({"success": False, "message": "Thiếu tên camera"}), 400
    if camera_type not in {'DEVICE', 'RTSP'}:
        return jsonify({"success": False, "message": "Loại camera không hợp lệ"}), 400
    if camera_type == 'RTSP' and not stream_url:
        return jsonify({"success": False, "message": "Camera RTSP cần URL"}), 400
    if camera_type == 'DEVICE':
        stream_url = None
    else:
        device_id = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        ensure_camera_schema(cursor)
        cursor.execute("SELECT id FROM tCamera WHERE id = %s AND is_active = 1", (id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy camera"}), 404
        cursor.execute("""
            UPDATE tCamera
            SET name = %s, camera_type = %s, device_id = %s, stream_url = %s
            WHERE id = %s AND is_active = 1
        """, (name, camera_type, device_id, stream_url, id))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "Cập nhật camera thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@access_log_bp.route('/cameras/<int:id>', methods=['DELETE'])
def delete_camera(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        ensure_camera_schema(cursor)
        cursor.execute("UPDATE tCamera SET is_active = 0 WHERE id = %s", (id,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Không tìm thấy camera"}), 404
        return jsonify({"success": True, "message": "Xóa camera thành công"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

LAST_RTSP_SCAN = {}
RTSP_COOLDOWN = {}

def process_backend_scan(student_id):
    global LAST_RTSP_SCAN
    student_id = normalize_student_code(student_id)
    if not student_id:
        return

    now_ts = time.time()
    # 4 second cooldown for the exact same student to prevent duplicate scan prompts.
    if student_id in RTSP_COOLDOWN and (now_ts - RTSP_COOLDOWN[student_id] < 4.0):
        return

    RTSP_COOLDOWN[student_id] = now_ts

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        preview = build_access_preview(cursor, student_id)
        cursor.close()
        conn.close()

        if not preview:
            LAST_RTSP_SCAN = {
                "success": False,
                "allowed": False,
                "message": f"Không tìm thấy học sinh: {student_id}",
                "student_id": student_id,
                "timestamp": now_ts
            }
            return

        LAST_RTSP_SCAN = {
            **preview,
            "student_id": student_id,
            "timestamp": now_ts
        }
    except Exception as e:
        print(f"Error processing RTSP scan: {e}")
@access_log_bp.route('/last_scan', methods=['GET'])
def get_last_scan():
    global LAST_RTSP_SCAN
    now_ts = time.time()
    if LAST_RTSP_SCAN and (now_ts - LAST_RTSP_SCAN.get("timestamp", 0) < 3.0):
        # Return and clear immediately to avoid multiple client-side beeps
        res = LAST_RTSP_SCAN.copy()
        LAST_RTSP_SCAN = {}
        return jsonify({"success": True, "has_scan": True, "scan": res})
    return jsonify({"success": True, "has_scan": False})

def generate_mjpeg_stream(stream_url):
    if cv2 is None or np is None:
        raise RuntimeError("Backend chưa cài opencv-python hoặc numpy để đọc RTSP")

    capture = None
    try:
        capture = cv2.VideoCapture(stream_url)
        if not capture.isOpened():
            # Create a premium black error card
            frame = np.zeros((360, 640, 3), dtype=np.uint8)
            cv2.putText(frame, "CAMERA MAT KET NOI / QUA HAN", (80, 170), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2, cv2.LINE_AA)
            cv2.putText(frame, "Kiem tra ket noi hoac URL RTSP", (100, 210), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1, cv2.LINE_AA)
            ok, buffer = cv2.imencode('.jpg', frame)
            if ok:
                yield (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n\r\n' +
                    buffer.tobytes() +
                    b'\r\n'
                )
            return

        # Initialize backend detectors
        qr_detector = cv2.QRCodeDetector()
        barcode_detector = cv2.barcode.BarcodeDetector()
        frame_counter = 0
        consecutive_failures = 0

        while True:
            ok, frame = capture.read()
            if not ok:
                consecutive_failures += 1
                if consecutive_failures > 15: # ~3 seconds
                    frame = np.zeros((360, 640, 3), dtype=np.uint8)
                    cv2.putText(frame, "LUONG CAMERA BI NGAT", (170, 190), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2, cv2.LINE_AA)
                    ok, buffer = cv2.imencode('.jpg', frame)
                    if ok:
                        yield (
                            b'--frame\r\n'
                            b'Content-Type: image/jpeg\r\n\r\n' +
                            buffer.tobytes() +
                            b'\r\n'
                        )
                    break
                time.sleep(0.2)
                continue

            consecutive_failures = 0

            # Scan for barcodes and QRs every 4 frames (highly efficient, about 2-3 times per second)
            frame_counter += 1
            if frame_counter % 4 == 0:
                try:
                    if decode is not None:
                        # 1. High-reliability pyzbar scan (decodes both 1D barcodes and QR codes)
                        barcodes = decode(frame)
                        for barcode in barcodes:
                            val = barcode.data.decode('utf-8', errors='ignore').strip()
                            if val:
                                process_backend_scan(val)
                                break  # Process first detected code per frame
                    else:
                        # Fallback: standard OpenCV detectors if pyzbar is missing
                        val, points, straight_qrcode = qr_detector.detectAndDecode(frame)
                        if val:
                            process_backend_scan(val)
                        else:
                            # 2. 1D Barcode check
                            ok_bar, decoded_info, decoded_type, corners = barcode_detector.detectAndDecode(frame)
                            if ok_bar:
                                for item in decoded_info:
                                    if item:
                                        process_backend_scan(item)
                                        break
                except Exception as detect_err:
                    print(f"RTSP barcode detection error: {detect_err}")

            ok, buffer = cv2.imencode('.jpg', frame)
            if not ok:
                continue

            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' +
                buffer.tobytes() +
                b'\r\n'
            )
    except Exception as e:
        print(f"Error streaming camera: {e}")
        try:
            frame = np.zeros((360, 640, 3), dtype=np.uint8)
            cv2.putText(frame, "LOI LUONG CAMERA", (210, 190), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2, cv2.LINE_AA)
            ok, buffer = cv2.imencode('.jpg', frame)
            if ok:
                yield (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n\r\n' +
                    buffer.tobytes() +
                    b'\r\n'
                )
        except:
            pass
    finally:
        if capture is not None:
            capture.release()


@access_log_bp.route('/cameras/<int:id>/stream', methods=['GET'])
def stream_camera(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_camera_schema(cursor)
        cursor.execute("""
            SELECT id, camera_type, stream_url
            FROM tCamera
            WHERE id = %s
              AND is_active = 1
        """, (id,))
        camera = cursor.fetchone()
        cursor.close()
        conn.close()

        if not camera:
            return jsonify({"success": False, "message": "Không tìm thấy camera"}), 404
        if (camera.get('camera_type') or '').upper() != 'RTSP':
            return jsonify({"success": False, "message": "Camera này không phải RTSP"}), 400
        if not camera.get('stream_url'):
            return jsonify({"success": False, "message": "Camera chưa có URL stream"}), 400
        if cv2 is None:
            return jsonify({"success": False, "message": "Backend chưa cài opencv-python để đọc RTSP"}), 500

        return Response(
            generate_mjpeg_stream(camera['stream_url']),
            mimetype='multipart/x-mixed-replace; boundary=frame',
            headers={'Cache-Control': 'no-cache'}
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@access_log_bp.route('/<int:id>', methods=['DELETE'])
def delete_access_log(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tAccessLog WHERE id = %s", (id,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({"success": False, "message": "Không tìm thấy lịch sử ra/vào"}), 404
        return jsonify({"success": True, "message": "Đã xóa lịch sử ra/vào"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
