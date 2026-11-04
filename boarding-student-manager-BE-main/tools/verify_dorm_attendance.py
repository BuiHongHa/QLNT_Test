import os
import sys
import io
import json
import openpyxl

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from config import get_db_connection
from api.dorm_attendance import ensure_dorm_attendance_schema

def verify_dorm_attendance_module():
    print("=== Testing Dorm Attendance Module ===")

    # 1. Test database schema creation
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    ensure_dorm_attendance_schema(cursor)
    conn.commit()

    cursor.execute("SHOW TABLES LIKE 'tDormAttendance'")
    table = cursor.fetchone()
    assert table is not None, "tDormAttendance table should exist"
    print("  [PASS] tDormAttendance table exists and verified")

    # Get sample room
    cursor.execute("SELECT id, name FROM tDormroom WHERE is_active = 1 LIMIT 1")
    room = cursor.fetchone()
    if not room:
        print("  [SKIP] No dorm room available in DB, skipping room-specific API calls")
        cursor.close()
        conn.close()
        return

    room_id = room['id']
    cursor.close()
    conn.close()

    # 2. Test Flask API Client
    client = app.test_client()

    # 2.1 GET /api/dorm-attendance/rooms
    res = client.get('/api/dorm-attendance/rooms?date=2026-10-15')
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.get_json()
    assert data.get('success') is True, "Expected success: True"
    assert 'data' in data, "Expected data field"
    print("  [PASS] GET /api/dorm-attendance/rooms returned successfully")

    # 2.2 GET /api/dorm-attendance/room/<room_id>
    res = client.get(f'/api/dorm-attendance/room/{room_id}?date=2026-10-15')
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.get_json()
    assert data.get('success') is True, "Expected success: True"
    assert 'students' in data, "Expected students list"
    print(f"  [PASS] GET /api/dorm-attendance/room/{room_id} returned successfully (found {len(data['students'])} students)")

    # 2.3 POST /api/dorm-attendance/save (if students exist)
    students = data.get('students', [])
    if students:
        sample_student = students[0]
        payload = {
            "date": "2026-10-15",
            "id_dormroom": room_id,
            "recorded_by": "test_admin",
            "records": [
                {
                    "id_student": sample_student['id_student'],
                    "status": "PRESENT",
                    "note": "Kiểm tra phòng định kỳ"
                }
            ]
        }
        res = client.post('/api/dorm-attendance/save', json=payload)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        save_data = res.get_json()
        assert save_data.get('success') is True, "Expected save success: True"
        print("  [PASS] POST /api/dorm-attendance/save executed successfully")

    # 2.4 GET /api/dorm-attendance/summary
    res = client.get('/api/dorm-attendance/summary?date=2026-10-15')
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    summary = res.get_json()
    assert summary.get('success') is True, "Expected summary success"
    assert 'stats' in summary, "Expected stats in summary"
    print("  [PASS] GET /api/dorm-attendance/summary executed successfully")

    # 2.5 GET /api/dorm-attendance/export
    res = client.get('/api/dorm-attendance/export?date=2026-10-15')
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    content_type = res.headers.get('Content-Type', '')
    assert 'spreadsheetml' in content_type or 'octet-stream' in content_type, f"Unexpected content-type: {content_type}"
    wb = openpyxl.load_workbook(io.BytesIO(res.data))
    assert 'DiemDanhKTX' in wb.sheetnames, "Expected DiemDanhKTX sheet in workbook"
    sheet = wb['DiemDanhKTX']
    assert sheet.cell(row=1, column=1).value == 'STT', "Expected STT header"
    print("  [PASS] GET /api/dorm-attendance/export produced valid Excel (.xlsx) file")

    print("\nALL DORM ATTENDANCE VERIFICATION TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    verify_dorm_attendance_module()
