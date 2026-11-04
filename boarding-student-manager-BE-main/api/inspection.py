from flask import Blueprint, request, jsonify, send_file
from config import get_db_connection
from mock_time import get_today, get_now
from datetime import datetime, date, timedelta
import io

inspection_bp = Blueprint('inspection', __name__)

def ensure_tables(cursor):
    cursor.execute("""CREATE TABLE IF NOT EXISTS tRoomInspection (
        id INT AUTO_INCREMENT PRIMARY KEY, id_dormroom VARCHAR(10) NOT NULL,
        inspection_date DATE NOT NULL, inspected_by CHAR(12) NULL,
        note VARCHAR(500) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_room_date (id_dormroom, inspection_date),
        CONSTRAINT fk_insp_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""")
    cursor.execute("""CREATE TABLE IF NOT EXISTS tInspectionViolation (
        id INT AUTO_INCREMENT PRIMARY KEY, inspection_id INT NOT NULL,
        criteria_id INT NOT NULL, penalty_points DECIMAL(4,1) NOT NULL,
        id_student CHAR(12) NULL, note VARCHAR(255) NULL,
        CONSTRAINT fk_viol_insp FOREIGN KEY (inspection_id) REFERENCES tRoomInspection(id) ON DELETE CASCADE,
        CONSTRAINT fk_viol_crit FOREIGN KEY (criteria_id) REFERENCES tInspectionCriteria(id),
        CONSTRAINT fk_viol_stu FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON UPDATE CASCADE ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""")
    cursor.execute("""CREATE TABLE IF NOT EXISTS tWeeklySummary (
        id INT AUTO_INCREMENT PRIMARY KEY, week_start DATE NOT NULL, week_end DATE NOT NULL,
        summary_type VARCHAR(10) NOT NULL, ref_id VARCHAR(30) NOT NULL,
        total_penalty DECIMAL(6,1) NOT NULL DEFAULT 0, total_violations INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_summary (week_start, summary_type, ref_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""")

def week_range(d=None):
    d = d or get_today()
    mon = d - timedelta(days=d.weekday())
    return mon, mon + timedelta(days=6)

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

def teacher_can_view_room(cursor, teacher_id, room_id):
    cursor.execute(f"SELECT 1 WHERE {teacher_room_clause('%s')}", (room_id, teacher_id))
    return cursor.fetchone() is not None

# ── GET inspections list ──
@inspection_bp.route('/', methods=['GET'])
def list_inspections():
    d = request.args.get('date', str(get_today()))
    room = request.args.get('room_id', '')
    role = normalize_role(request.args.get('role_name'))
    username = request.args.get('username', '')
    try:
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        ensure_tables(cursor); conn.commit()
        sql = """SELECT ri.*, d.name AS room_name,
                 (SELECT COUNT(*) FROM tInspectionViolation WHERE inspection_id=ri.id) AS violation_count,
                 (SELECT COALESCE(SUM(penalty_points),0) FROM tInspectionViolation WHERE inspection_id=ri.id) AS total_penalty
                 FROM tRoomInspection ri JOIN tDormroom d ON ri.id_dormroom=d.id WHERE 1=1"""
        params = []
        if d:
            sql += " AND ri.inspection_date=%s"; params.append(d)
        if room:
            sql += " AND ri.id_dormroom=%s"; params.append(room)
        if role == 'teacher':
            sql += f" AND {teacher_room_clause('ri.id_dormroom')}"
            params.append(username)
        sql += " ORDER BY d.id"
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        for r in rows:
            r['inspection_date'] = str(r['inspection_date'])
            r['total_penalty'] = float(r.get('total_penalty') or 0)
            if r.get('created_at'): r['created_at'] = str(r['created_at'])
        cursor.close(); conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── GET single inspection detail ──
@inspection_bp.route('/<int:id>', methods=['GET'])
def get_inspection(id):
    role = normalize_role(request.args.get('role_name'))
    username = request.args.get('username', '')
    try:
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        cursor.execute("""SELECT ri.*, d.name AS room_name FROM tRoomInspection ri
            JOIN tDormroom d ON ri.id_dormroom=d.id WHERE ri.id=%s""", (id,))
        insp = cursor.fetchone()
        if not insp:
            cursor.close(); conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy"}), 404
        if role == 'teacher' and not teacher_can_view_room(cursor, username, insp['id_dormroom']):
            cursor.close(); conn.close()
            return jsonify({"success": False, "message": "KhÃ´ng cÃ³ quyá»n xem biÃªn báº£n nÃ y"}), 403
        insp['inspection_date'] = str(insp['inspection_date'])
        if insp.get('created_at'): insp['created_at'] = str(insp['created_at'])
        cursor.execute("""SELECT v.*, c.name AS criteria_name, s.name AS student_name
            FROM tInspectionViolation v
            JOIN tInspectionCriteria c ON v.criteria_id=c.id
            LEFT JOIN tStudent s ON v.id_student=s.id_VNeID
            WHERE v.inspection_id=%s""", (id,))
        violations = cursor.fetchall()
        for v in violations:
            v['penalty_points'] = float(v['penalty_points'])
        insp['violations'] = violations
        # room students
        cursor.execute("""SELECT s.id_VNeID, s.name, c.name AS class_name
            FROM LIVING l JOIN tStudent s ON l.id_student=s.id_VNeID AND s.is_active=1
            LEFT JOIN STUDY st ON s.id_VNeID=st.id_student AND st.is_active=1
            LEFT JOIN tClass c ON st.id_class=c.id AND c.is_active=1
            WHERE l.id_dormroom=%s AND l.is_active=1
            ORDER BY s.name""", (insp['id_dormroom'],))
        insp['room_students'] = cursor.fetchall()
        insp['total_penalty'] = sum(v['penalty_points'] for v in violations)
        cursor.close(); conn.close()
        return jsonify({"success": True, "data": insp})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── POST create inspection ──
@inspection_bp.route('/', methods=['POST'])
def create_inspection():
    d = request.json or {}
    if normalize_role(d.get('role_name')) == 'teacher':
        return jsonify({"success": False, "message": "GiÃ¡o viÃªn chá»‰ Ä‘Æ°á»£c xem danh sÃ¡ch vi pháº¡m"}), 403
    room_id = d.get('id_dormroom')
    insp_date = d.get('inspection_date', str(get_today()))
    if not room_id:
        return jsonify({"success": False, "message": "Thiếu mã phòng"}), 400
    try:
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        ensure_tables(cursor)
        cursor.execute("SELECT id FROM tRoomInspection WHERE id_dormroom=%s AND inspection_date=%s",
                       (room_id, insp_date))
        if cursor.fetchone():
            cursor.close(); conn.close()
            return jsonify({"success": False, "message": f"Phòng {room_id} đã được chấm ngày {insp_date}"}), 409
        cursor.execute("""INSERT INTO tRoomInspection (id_dormroom, inspection_date, inspected_by, note)
            VALUES (%s,%s,%s,%s)""", (room_id, insp_date, d.get('inspected_by'), d.get('note','')))
        insp_id = cursor.lastrowid
        for v in (d.get('violations') or []):
            cursor.execute("""INSERT INTO tInspectionViolation (inspection_id, criteria_id, penalty_points, id_student, note)
                VALUES (%s,%s,%s,%s,%s)""",
                (insp_id, v['criteria_id'], float(v['penalty_points']), v.get('id_student') or None, v.get('note','')))
        try:
            generate_weekly_summary(cursor, datetime.strptime(insp_date, '%Y-%m-%d').date() if isinstance(insp_date, str) else insp_date)
        except Exception:
            pass
        conn.commit(); cursor.close(); conn.close()
        return jsonify({"success": True, "message": "Đã lưu biên bản", "id": insp_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── PUT update inspection ──
@inspection_bp.route('/<int:id>', methods=['PUT'])
def update_inspection(id):
    d = request.json or {}
    if normalize_role(d.get('role_name')) == 'teacher':
        return jsonify({"success": False, "message": "Giáo viên chỉ được xem danh sách vi phạm"}), 403
    try:
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT inspection_date FROM tRoomInspection WHERE id=%s", (id,))
        curr = cursor.fetchone()
        insp_date = curr['inspection_date'] if curr else get_today()

        cursor.execute("UPDATE tRoomInspection SET note=%s, inspected_by=%s WHERE id=%s",
                       (d.get('note',''), d.get('inspected_by'), id))
        cursor.execute("DELETE FROM tInspectionViolation WHERE inspection_id=%s", (id,))
        for v in (d.get('violations') or []):
            cursor.execute("""INSERT INTO tInspectionViolation (inspection_id, criteria_id, penalty_points, id_student, note)
                VALUES (%s,%s,%s,%s,%s)""",
                (id, v['criteria_id'], float(v['penalty_points']), v.get('id_student') or None, v.get('note','')))
        try:
            generate_weekly_summary(cursor, insp_date)
        except Exception:
            pass
        conn.commit(); cursor.close(); conn.close()
        return jsonify({"success": True, "message": "Đã cập nhật"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── DELETE inspection ──
@inspection_bp.route('/<int:id>', methods=['DELETE'])
def delete_inspection(id):
    if normalize_role(request.args.get('role_name')) == 'teacher':
        return jsonify({"success": False, "message": "Giáo viên chỉ được xem danh sách vi phạm"}), 403
    try:
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT inspection_date FROM tRoomInspection WHERE id=%s", (id,))
        curr = cursor.fetchone()
        insp_date = curr['inspection_date'] if curr else get_today()

        cursor.execute("DELETE FROM tRoomInspection WHERE id=%s", (id,))
        affected = cursor.rowcount
        if affected == 0:
            cursor.close(); conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy"}), 404
        try:
            generate_weekly_summary(cursor, insp_date)
        except Exception:
            pass
        conn.commit(); cursor.close(); conn.close()
        return jsonify({"success": True, "message": "Đã xoá biên bản"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── Weekly summary generation ──
def generate_weekly_summary(cursor, target_date=None):
    mon, sun = week_range(target_date)
    now = get_now()
    # Get all inspections in this week
    cursor.execute("""
        SELECT ri.id, ri.id_dormroom, v.id AS vid, v.criteria_id, v.penalty_points, v.id_student
        FROM tRoomInspection ri
        JOIN tInspectionViolation v ON v.inspection_id = ri.id
        WHERE ri.inspection_date >= %s AND ri.inspection_date <= %s
    """, (mon, sun))
    violations = cursor.fetchall()
    room_totals = {}; class_totals = {}
    for v in violations:
        rid = v['id_dormroom']; pts = float(v['penalty_points'])
        room_totals.setdefault(rid, {'penalty': 0, 'count': 0})
        room_totals[rid]['penalty'] += pts; room_totals[rid]['count'] += 1
        # Determine class attribution
        if v['id_student']:
            cursor.execute("""SELECT c.name FROM STUDY st JOIN tClass c ON st.id_class=c.id AND c.is_active=1
                WHERE st.id_student=%s AND st.is_active=1 LIMIT 1""", (v['id_student'],))
            cls = cursor.fetchone()
            if cls:
                cn = cls['name']
                class_totals.setdefault(cn, {'penalty': 0, 'count': 0})
                class_totals[cn]['penalty'] += pts; class_totals[cn]['count'] += 1
        else:
            # Unassigned: distribute to classes in room
            # Get classes in room
            cursor.execute("""SELECT DISTINCT c.name FROM LIVING l
                JOIN STUDY st ON l.id_student=st.id_student AND st.is_active=1
                JOIN tClass c ON st.id_class=c.id AND c.is_active=1
                WHERE l.id_dormroom=%s AND l.is_active=1""", (rid,))
            classes = [r['name'] for r in cursor.fetchall()]
            if classes:
                share = pts / len(classes); share_count = 1.0 / len(classes)
                for cn in classes:
                    class_totals.setdefault(cn, {'penalty': 0, 'count': 0})
                    class_totals[cn]['penalty'] += share; class_totals[cn]['count'] += share_count
    # Write summaries
    cursor.execute("DELETE FROM tWeeklySummary WHERE week_start=%s", (mon,))
    for rid, t in room_totals.items():
        cursor.execute("""INSERT INTO tWeeklySummary (week_start, week_end, summary_type, ref_id, total_penalty, total_violations)
            VALUES (%s,%s,'ROOM',%s,%s,%s)""", (mon, sun, rid, round(t['penalty'],1), t['count']))
    for cn, t in class_totals.items():
        cursor.execute("""INSERT INTO tWeeklySummary (week_start, week_end, summary_type, ref_id, total_penalty, total_violations)
            VALUES (%s,%s,'CLASS',%s,%s,%s)""", (mon, sun, cn, round(t['penalty'],1), int(round(t['count']))))
    return len(room_totals), len(class_totals)

@inspection_bp.route('/summary/generate', methods=['POST'])
def gen_summary():
    d = request.args.get('date', str(get_today()))
    try:
        target = datetime.strptime(d, '%Y-%m-%d').date()
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        ensure_tables(cursor)
        rooms, classes = generate_weekly_summary(cursor, target)
        conn.commit(); cursor.close(); conn.close()
        return jsonify({"success": True, "message": f"Đã tổng hợp {rooms} phòng, {classes} lớp"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@inspection_bp.route('/summary/weekly', methods=['GET'])
def get_weekly_summary():
    d = request.args.get('date', str(get_today()))
    try:
        target = datetime.strptime(d, '%Y-%m-%d').date()
        mon, sun = week_range(target)
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        ensure_tables(cursor); conn.commit()
        # Auto-generate if after Friday 16:00
        now = get_now()
        fri_16 = datetime.combine(mon + timedelta(days=4), datetime.strptime("16:00","%H:%M").time())
        cursor.execute("SELECT COUNT(*) AS cnt FROM tWeeklySummary WHERE week_start=%s", (mon,))
        if (cursor.fetchone() or {}).get('cnt', 0) == 0 and now >= fri_16:
            generate_weekly_summary(cursor, target)
            conn.commit()
        cursor.execute("""SELECT * FROM tWeeklySummary WHERE week_start=%s ORDER BY summary_type, ref_id""", (mon,))
        rows = cursor.fetchall()
        for r in rows:
            r['week_start'] = str(r['week_start']); r['week_end'] = str(r['week_end'])
            r['total_penalty'] = float(r.get('total_penalty') or 0)
            if r.get('created_at'): r['created_at'] = str(r['created_at'])
        cursor.close(); conn.close()
        return jsonify({"success": True, "data": rows, "week_start": str(mon), "week_end": str(sun)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── Export XLSX ──
@inspection_bp.route('/summary/details', methods=['GET'])
def get_weekly_summary_details():
    d = request.args.get('date', str(get_today()))
    summary_type = (request.args.get('summary_type') or '').strip().upper()
    ref_id = (request.args.get('ref_id') or '').strip()

    if summary_type not in ('ROOM', 'CLASS') or not ref_id:
        return jsonify({"success": False, "message": "Thiếu summary_type hoặc ref_id"}), 400

    try:
        target = datetime.strptime(d, '%Y-%m-%d').date()
        mon, sun = week_range(target)
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        ensure_tables(cursor); conn.commit()

        if summary_type == 'ROOM':
            cursor.execute("""
                SELECT
                    ri.id AS inspection_id,
                    ri.inspection_date,
                    ri.id_dormroom,
                    d.name AS room_name,
                    c.name AS criteria_name,
                    v.penalty_points,
                    v.note,
                    s.name AS student_name
                FROM tRoomInspection ri
                JOIN tDormroom d ON ri.id_dormroom = d.id
                JOIN tInspectionViolation v ON v.inspection_id = ri.id
                JOIN tInspectionCriteria c ON v.criteria_id = c.id
                LEFT JOIN tStudent s ON v.id_student = s.id_VNeID
                WHERE ri.inspection_date >= %s
                  AND ri.inspection_date <= %s
                  AND ri.id_dormroom = %s
                ORDER BY ri.inspection_date DESC, ri.id_dormroom, c.name
            """, (mon, sun, ref_id))
        else:
            cursor.execute("""
                SELECT
                    ri.id AS inspection_id,
                    ri.inspection_date,
                    ri.id_dormroom,
                    d.name AS room_name,
                    c.name AS criteria_name,
                    v.penalty_points,
                    v.note,
                    s.name AS student_name
                FROM tRoomInspection ri
                JOIN tDormroom d ON ri.id_dormroom = d.id
                JOIN tInspectionViolation v ON v.inspection_id = ri.id
                JOIN tInspectionCriteria c ON v.criteria_id = c.id
                LEFT JOIN tStudent s ON v.id_student = s.id_VNeID
                LEFT JOIN STUDY st ON s.id_VNeID = st.id_student AND st.is_active = 1
                LEFT JOIN tClass cl ON st.id_class = cl.id AND cl.is_active = 1
                WHERE ri.inspection_date >= %s
                  AND ri.inspection_date <= %s
                  AND (
                      cl.name = %s
                      OR (
                          v.id_student IS NULL
                          AND EXISTS (
                              SELECT 1
                              FROM LIVING l2
                              JOIN STUDY st2 ON l2.id_student = st2.id_student AND st2.is_active = 1
                              JOIN tClass cl2 ON st2.id_class = cl2.id AND cl2.is_active = 1
                              WHERE l2.id_dormroom = ri.id_dormroom
                                AND l2.is_active = 1
                                AND cl2.name = %s
                          )
                      )
                  )
                ORDER BY ri.inspection_date DESC, ri.id_dormroom, c.name
            """, (mon, sun, ref_id, ref_id))

        rows = cursor.fetchall()
        for row in rows:
            row['inspection_date'] = str(row['inspection_date'])
            row['penalty_points'] = float(row.get('penalty_points') or 0)

        cursor.close(); conn.close()
        return jsonify({"success": True, "data": rows, "week_start": str(mon), "week_end": str(sun)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@inspection_bp.route('/room/<room_id>/violations', methods=['GET'])
def get_room_violations(room_id):
    range_name = (request.args.get('range') or 'week').strip().lower()
    d = request.args.get('date', str(get_today()))
    role = normalize_role(request.args.get('role_name'))
    username = request.args.get('username', '')
    try:
        target = datetime.strptime(d, '%Y-%m-%d').date()
        if range_name == 'day':
            start = target
            end = target
        elif range_name == 'month':
            start = target.replace(day=1)
            if target.month == 12:
                end = target.replace(year=target.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                end = target.replace(month=target.month + 1, day=1) - timedelta(days=1)
        else:
            range_name = 'week'
            start, end = week_range(target)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        ensure_tables(cursor)
        conn.commit()

        if role == 'teacher' and not teacher_can_view_room(cursor, username, room_id):
            cursor.close()
            conn.close()
            return jsonify({"success": False, "message": "Khong co quyen xem phong nay"}), 403

        cursor.execute("""
            SELECT ri.inspection_date,
                   ri.id_dormroom,
                   d.name AS room_name,
                   c.name AS criteria_name,
                   v.penalty_points,
                   v.note,
                   v.id_student,
                   s.name AS student_name
            FROM tRoomInspection ri
            JOIN tDormroom d ON ri.id_dormroom = d.id
            JOIN tInspectionViolation v ON v.inspection_id = ri.id
            JOIN tInspectionCriteria c ON v.criteria_id = c.id
            LEFT JOIN tStudent s ON v.id_student = s.id_VNeID
            WHERE ri.id_dormroom = %s
              AND ri.inspection_date >= %s
              AND ri.inspection_date <= %s
            ORDER BY ri.inspection_date DESC, ri.id DESC, v.id DESC
        """, (room_id, start, end))
        rows = cursor.fetchall()
        total_penalty = 0
        for row in rows:
            if row.get('inspection_date'):
                row['inspection_date'] = str(row['inspection_date'])
            row['penalty_points'] = float(row.get('penalty_points') or 0)
            total_penalty += row['penalty_points']

        cursor.close()
        conn.close()
        return jsonify({
            "success": True,
            "data": {
                "violations": rows,
                "total_penalty": total_penalty,
                "total_violations": len(rows),
                "range": range_name,
                "start_date": str(start),
                "end_date": str(end),
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@inspection_bp.route('/summary/export', methods=['GET'])
def export_xlsx():
    d = request.args.get('date', str(get_today()))
    export_type = request.args.get('type', 'summary')  # summary or detail
    room_ids = request.args.get('room_ids', '')  # comma-separated for detail
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment, PatternFill
        target = datetime.strptime(d, '%Y-%m-%d').date()
        mon, sun = week_range(target)
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        wb = Workbook()
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="00206D", end_color="00206D", fill_type="solid")

        if export_type == 'summary':
            # Sheet 1: Room summary
            ws1 = wb.active; ws1.title = "Theo Phòng"
            ws1.append(["Mã phòng", "Tổng điểm trừ", "Số lỗi"])
            for cell in ws1[1]: cell.font = header_font; cell.fill = header_fill
            cursor.execute("SELECT * FROM tWeeklySummary WHERE week_start=%s AND summary_type='ROOM' ORDER BY ref_id", (mon,))
            for r in cursor.fetchall():
                ws1.append([r['ref_id'], float(r['total_penalty']), r['total_violations']])
            # Sheet 2: Class summary
            ws2 = wb.create_sheet("Theo Lớp")
            ws2.append(["Lớp", "Tổng điểm trừ", "Số lỗi"])
            for cell in ws2[1]: cell.font = header_font; cell.fill = header_fill
            cursor.execute("SELECT * FROM tWeeklySummary WHERE week_start=%s AND summary_type='CLASS' ORDER BY ref_id", (mon,))
            for r in cursor.fetchall():
                ws2.append([r['ref_id'], float(r['total_penalty']), r['total_violations']])
        else:
            # Detail export for selected rooms
            ws = wb.active; ws.title = "Chi tiết lỗi"
            ws.append(["Ngày", "Phòng", "Tiêu chí", "Điểm trừ", "Học sinh vi phạm", "Ghi chú"])
            for cell in ws[1]: cell.font = header_font; cell.fill = header_fill
            room_filter = ""
            params = [mon, sun]
            if room_ids:
                ids = [r.strip() for r in room_ids.split(',') if r.strip()]
                if ids:
                    room_filter = " AND ri.id_dormroom IN (" + ",".join(["%s"]*len(ids)) + ")"
                    params += ids
            cursor.execute(f"""SELECT ri.inspection_date, ri.id_dormroom, c.name AS criteria_name,
                v.penalty_points, s.name AS student_name, v.note
                FROM tRoomInspection ri
                JOIN tInspectionViolation v ON v.inspection_id=ri.id
                JOIN tInspectionCriteria c ON v.criteria_id=c.id
                LEFT JOIN tStudent s ON v.id_student=s.id_VNeID
                WHERE ri.inspection_date>=%s AND ri.inspection_date<=%s {room_filter}
                ORDER BY ri.id_dormroom, ri.inspection_date""", params)
            for r in cursor.fetchall():
                ws.append([str(r['inspection_date']), r['id_dormroom'], r['criteria_name'],
                           float(r['penalty_points']), r['student_name'] or 'Cả phòng', r['note'] or ''])
        for ws in wb.worksheets:
            for col in ws.columns:
                ws.column_dimensions[col[0].column_letter].width = 18

        cursor.close(); conn.close()
        buf = io.BytesIO()
        wb.save(buf); buf.seek(0)
        fname = f"cham_diem_{mon}_{sun}.xlsx"
        return send_file(buf, as_attachment=True, download_name=fname,
                         mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except ImportError:
        return jsonify({"success": False, "error": "Cần cài openpyxl: pip install openpyxl"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ── Dashboard stats ──
@inspection_bp.route('/dashboard-stats', methods=['GET'])
def dashboard_stats():
    role = (request.args.get('role_name') or '').strip().lower()
    username = request.args.get('username', '')
    try:
        conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
        ensure_tables(cursor); conn.commit()
        today = get_today()
        mon, sun = week_range(today)
        result = {}
        if role == 'student':
            # Find student's room
            cursor.execute("""SELECT l.id_dormroom FROM LIVING l WHERE l.id_student=%s AND l.is_active=1 LIMIT 1""", (username,))
            room = cursor.fetchone()
            if room:
                rid = room['id_dormroom']
                # Today's penalty
                cursor.execute("""SELECT COALESCE(SUM(v.penalty_points),0) AS pts, COUNT(v.id) AS cnt
                    FROM tRoomInspection ri JOIN tInspectionViolation v ON v.inspection_id=ri.id
                    WHERE ri.id_dormroom=%s AND ri.inspection_date=%s""", (rid, today))
                day = cursor.fetchone() or {}
                result['today_penalty'] = float(day.get('pts') or 0)
                result['today_violations'] = day.get('cnt', 0)
                # Week penalty
                cursor.execute("""SELECT COALESCE(SUM(v.penalty_points),0) AS pts, COUNT(v.id) AS cnt
                    FROM tRoomInspection ri JOIN tInspectionViolation v ON v.inspection_id=ri.id
                    WHERE ri.id_dormroom=%s AND ri.inspection_date>=%s AND ri.inspection_date<=%s""", (rid, mon, sun))
                wk = cursor.fetchone() or {}
                result['week_penalty'] = float(wk.get('pts') or 0)
                result['week_violations'] = wk.get('cnt', 0)
                result['room_id'] = rid
                # Today's violations detail
                cursor.execute("""SELECT c.name AS criteria_name, v.penalty_points, v.note, s.name AS student_name
                    FROM tRoomInspection ri JOIN tInspectionViolation v ON v.inspection_id=ri.id
                    JOIN tInspectionCriteria c ON v.criteria_id=c.id LEFT JOIN tStudent s ON v.id_student=s.id_VNeID
                    WHERE ri.id_dormroom=%s AND ri.inspection_date=%s""", (rid, today))
                result['today_details'] = cursor.fetchall()
                for dd in result['today_details']: dd['penalty_points'] = float(dd['penalty_points'])

                cursor.execute("""SELECT ri.inspection_date, c.name AS criteria_name, v.penalty_points, v.note, s.name AS student_name
                    FROM tRoomInspection ri JOIN tInspectionViolation v ON v.inspection_id=ri.id
                    JOIN tInspectionCriteria c ON v.criteria_id=c.id LEFT JOIN tStudent s ON v.id_student=s.id_VNeID
                    WHERE ri.id_dormroom=%s AND ri.inspection_date>=%s AND ri.inspection_date<=%s
                    ORDER BY ri.inspection_date DESC""", (rid, mon, sun))
                wk_det = cursor.fetchall()
                for dd in wk_det:
                    dd['penalty_points'] = float(dd['penalty_points'])
                    if dd.get('inspection_date'): dd['inspection_date'] = str(dd['inspection_date'])
                result['week_details'] = wk_det
        elif role == 'teacher':
            cursor.execute("""SELECT DISTINCT c.name AS class_name FROM MANAGE m
                JOIN tClass c ON m.id_class=c.id AND c.is_active=1
                WHERE m.id_teacher=%s AND m.is_active=1""", (username,))
            teacher_classes = [r['class_name'] for r in cursor.fetchall()]
            result['today_penalty'] = 0; result['week_penalty'] = 0
            result['today_violations'] = 0; result['week_violations'] = 0
            if teacher_classes:
                placeholders = ','.join(['%s'] * len(teacher_classes))
                cursor.execute(f"""SELECT COALESCE(SUM(v.penalty_points),0) AS pts, COUNT(v.id) AS cnt
                    FROM tRoomInspection ri JOIN tInspectionViolation v ON v.inspection_id=ri.id
                    LEFT JOIN tStudent s ON v.id_student=s.id_VNeID
                    LEFT JOIN STUDY st ON s.id_VNeID=st.id_student AND st.is_active=1
                    LEFT JOIN tClass cl ON st.id_class=cl.id AND cl.is_active=1
                    WHERE ri.inspection_date=%s AND (cl.name IN ({placeholders}) OR v.id_student IS NULL)""",
                    [today] + teacher_classes)
                day = cursor.fetchone() or {}
                result['today_penalty'] = float(day.get('pts') or 0)
                result['today_violations'] = day.get('cnt', 0)
                cursor.execute(f"""SELECT COALESCE(SUM(v.penalty_points),0) AS pts, COUNT(v.id) AS cnt
                    FROM tRoomInspection ri JOIN tInspectionViolation v ON v.inspection_id=ri.id
                    LEFT JOIN tStudent s ON v.id_student=s.id_VNeID
                    LEFT JOIN STUDY st ON s.id_VNeID=st.id_student AND st.is_active=1
                    LEFT JOIN tClass cl ON st.id_class=cl.id AND cl.is_active=1
                    WHERE ri.inspection_date>=%s AND ri.inspection_date<=%s AND (cl.name IN ({placeholders}) OR v.id_student IS NULL)""",
                    [mon, sun] + teacher_classes)
                wk = cursor.fetchone() or {}
                result['week_penalty'] = float(wk.get('pts') or 0)
                result['week_violations'] = wk.get('cnt', 0)
                cursor.execute(f"""SELECT ri.id_dormroom, c.name AS criteria_name, v.penalty_points, v.note, s.name AS student_name
                    FROM tRoomInspection ri JOIN tInspectionViolation v ON v.inspection_id=ri.id
                    JOIN tInspectionCriteria c ON v.criteria_id=c.id LEFT JOIN tStudent s ON v.id_student=s.id_VNeID
                    LEFT JOIN STUDY st ON s.id_VNeID=st.id_student AND st.is_active=1
                    LEFT JOIN tClass cl ON st.id_class=cl.id AND cl.is_active=1
                    WHERE ri.inspection_date=%s AND (cl.name IN ({placeholders}) OR v.id_student IS NULL)
                    ORDER BY ri.id_dormroom""", [today] + teacher_classes)
                result['today_details'] = cursor.fetchall()
                for dd in result['today_details']: dd['penalty_points'] = float(dd['penalty_points'])

                cursor.execute(f"""SELECT ri.id_dormroom, ri.inspection_date, c.name AS criteria_name, v.penalty_points, v.note, s.name AS student_name
                    FROM tRoomInspection ri JOIN tInspectionViolation v ON v.inspection_id=ri.id
                    JOIN tInspectionCriteria c ON v.criteria_id=c.id LEFT JOIN tStudent s ON v.id_student=s.id_VNeID
                    LEFT JOIN STUDY st ON s.id_VNeID=st.id_student AND st.is_active=1
                    LEFT JOIN tClass cl ON st.id_class=cl.id AND cl.is_active=1
                    WHERE ri.inspection_date>=%s AND ri.inspection_date<=%s AND (cl.name IN ({placeholders}) OR v.id_student IS NULL)
                    ORDER BY ri.inspection_date DESC, ri.id_dormroom""", [mon, sun] + teacher_classes)
                wk_det = cursor.fetchall()
                for dd in wk_det:
                    dd['penalty_points'] = float(dd['penalty_points'])
                    if dd.get('inspection_date'): dd['inspection_date'] = str(dd['inspection_date'])
                result['week_details'] = wk_det
        elif role == 'manager':
            # Rooms with students (occupied)
            cursor.execute("""SELECT DISTINCT l.id_dormroom FROM LIVING l
                JOIN tDormroom d ON l.id_dormroom=d.id AND d.is_active=1
                WHERE l.is_active=1""")
            occupied = {r['id_dormroom'] for r in cursor.fetchall()}
            # Inspected today
            cursor.execute("SELECT DISTINCT id_dormroom FROM tRoomInspection WHERE inspection_date=%s", (today,))
            inspected = {r['id_dormroom'] for r in cursor.fetchall()}
            result['total_occupied'] = len(occupied)
            result['inspected_today'] = len(occupied & inspected)
            result['not_inspected_today'] = len(occupied - inspected)
            # Heavy violation rooms (>=5 pts or >=5 violations) today
            cursor.execute("""SELECT ri.id_dormroom, SUM(v.penalty_points) AS pts, COUNT(v.id) AS cnt
                FROM tRoomInspection ri JOIN tInspectionViolation v ON v.inspection_id=ri.id
                WHERE ri.inspection_date=%s GROUP BY ri.id_dormroom
                HAVING pts>=5 OR cnt>=5""", (today,))
            result['heavy_rooms'] = len(cursor.fetchall())
        cursor.close(); conn.close()
        return jsonify({"success": True, "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
