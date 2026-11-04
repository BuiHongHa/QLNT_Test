import os
import sys
import io
import openpyxl
from datetime import datetime, date, time, timedelta

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from excel_utils import generate_excel_response, read_file_rows
from api.meal import leave_cuts_meal

def test_meal_cutting_rules():
    print("=== Testing Meal Cutting Rules ===")

    # 1. Weekend Leave (REGULAR_WEEKEND)
    # Weekend: Friday 2026-09-18 16:00 to Sunday 2026-09-20 23:59:59
    # Saturday is 2026-09-19, Sunday is 2026-09-20
    weekend_start = datetime(2026, 9, 18, 16, 0)
    weekend_end = datetime(2026, 9, 20, 23, 59, 59)

    sat_lunch = datetime(2026, 9, 19, 11, 30)
    sat_dinner = datetime(2026, 9, 19, 18, 0)
    sun_lunch = datetime(2026, 9, 20, 11, 30)
    sun_dinner = datetime(2026, 9, 20, 18, 0)

    # 1.1 Approved before Saturday 12:00 (e.g. Saturday 10:00 AM)
    leave_weekend_before_noon = {
        'id': 1,
        'leave_type': 'REGULAR_WEEKEND',
        'start_time': weekend_start,
        'end_time': weekend_end,
        'teacher_accept': 'ACCEPTED',
        'manager_accept': 'ACCEPTED',
        'decided_at': datetime(2026, 9, 19, 10, 0)
    }

    assert leave_cuts_meal(leave_weekend_before_noon, sat_lunch, 'LUNCH') == False, "Sat lunch should NEVER be cut for weekend leave"
    assert leave_cuts_meal(leave_weekend_before_noon, sat_dinner, 'DINNER') == True, "Sat dinner MUST be cut if approved before Sat 12h"
    assert leave_cuts_meal(leave_weekend_before_noon, sun_lunch, 'LUNCH') == True, "Sun lunch MUST be cut if approved before Sat 12h"
    assert leave_cuts_meal(leave_weekend_before_noon, sun_dinner, 'DINNER') == True, "Sun dinner MUST be cut if approved before Sat 12h"
    print("  [PASS] Weekend leave approved before Saturday 12:00 cuts Sat dinner, Sun lunch, Sun dinner (Sat lunch NOT cut)")

    # 1.2 Approved after Saturday 12:00 (e.g. Saturday 14:00)
    leave_weekend_after_noon = {
        'id': 2,
        'leave_type': 'REGULAR_WEEKEND',
        'start_time': weekend_start,
        'end_time': weekend_end,
        'teacher_accept': 'ACCEPTED',
        'manager_accept': 'ACCEPTED',
        'decided_at': datetime(2026, 9, 19, 14, 0)
    }

    assert leave_cuts_meal(leave_weekend_after_noon, sat_lunch, 'LUNCH') == False, "Sat lunch should NEVER be cut"
    assert leave_cuts_meal(leave_weekend_after_noon, sat_dinner, 'DINNER') == False, "Sat dinner MUST NOT be cut if approved after Sat 12h"
    assert leave_cuts_meal(leave_weekend_after_noon, sun_lunch, 'LUNCH') == True, "Sun lunch MUST be cut if approved after Sat 12h"
    assert leave_cuts_meal(leave_weekend_after_noon, sun_dinner, 'DINNER') == True, "Sun dinner MUST be cut if approved after Sat 12h"
    print("  [PASS] Weekend leave approved after Saturday 12:00 cuts ONLY Sunday lunch and dinner (Sat dinner & lunch NOT cut)")

    # 1.3 Not approved (PENDING or DENIED)
    leave_pending = {
        'id': 3,
        'leave_type': 'REGULAR_WEEKEND',
        'start_time': weekend_start,
        'end_time': weekend_end,
        'teacher_accept': 'PENDING',
        'manager_accept': 'PENDING',
        'decided_at': None
    }
    assert leave_cuts_meal(leave_pending, sun_lunch, 'LUNCH') == False, "Pending leave should NOT cut meals"
    print("  [PASS] Pending weekend leave does not cut meals")

    # 2. Emergency Leave (EMERGENCY)
    # Leave spans Wednesday 2026-09-23 08:00 to Friday 2026-09-25 17:00
    em_start = datetime(2026, 9, 23, 8, 0)
    em_end = datetime(2026, 9, 25, 17, 0)

    wed_lunch = datetime(2026, 9, 23, 11, 30)
    wed_dinner = datetime(2026, 9, 23, 18, 0)
    thu_lunch = datetime(2026, 9, 24, 11, 30)
    thu_dinner = datetime(2026, 9, 24, 18, 0)
    fri_lunch = datetime(2026, 9, 25, 11, 30)
    fri_dinner = datetime(2026, 9, 25, 18, 0) # After em_end

    # 2.1 Approved on Wednesday before 12:00 (e.g. Wednesday 09:30)
    leave_em_before_noon = {
        'id': 4,
        'leave_type': 'EMERGENCY',
        'start_time': em_start,
        'end_time': em_end,
        'teacher_accept': 'ACCEPTED',
        'manager_accept': 'ACCEPTED',
        'decided_at': datetime(2026, 9, 23, 9, 30)
    }

    assert leave_cuts_meal(leave_em_before_noon, wed_lunch, 'LUNCH') == True, "Wed lunch MUST be cut if approved before Wed 12h"
    assert leave_cuts_meal(leave_em_before_noon, wed_dinner, 'DINNER') == True, "Wed dinner MUST be cut"
    assert leave_cuts_meal(leave_em_before_noon, thu_lunch, 'LUNCH') == True, "Thu lunch MUST be cut"
    assert leave_cuts_meal(leave_em_before_noon, thu_dinner, 'DINNER') == True, "Thu dinner MUST be cut"
    assert leave_cuts_meal(leave_em_before_noon, fri_lunch, 'LUNCH') == True, "Fri lunch MUST be cut"
    assert leave_cuts_meal(leave_em_before_noon, fri_dinner, 'DINNER') == False, "Fri dinner is outside leave end_time"
    print("  [PASS] Emergency leave approved before 12:00 cuts from lunch of that day until end of leave")

    # 2.2 Approved on Wednesday after 12:00 (e.g. Wednesday 13:30)
    leave_em_after_noon = {
        'id': 5,
        'leave_type': 'EMERGENCY',
        'start_time': em_start,
        'end_time': em_end,
        'teacher_accept': 'ACCEPTED',
        'manager_accept': 'ACCEPTED',
        'decided_at': datetime(2026, 9, 23, 13, 30)
    }

    assert leave_cuts_meal(leave_em_after_noon, wed_lunch, 'LUNCH') == False, "Wed lunch MUST NOT be cut if approved after Wed 12h"
    assert leave_cuts_meal(leave_em_after_noon, wed_dinner, 'DINNER') == True, "Wed dinner MUST be cut if approved after Wed 12h"
    assert leave_cuts_meal(leave_em_after_noon, thu_lunch, 'LUNCH') == True, "Thu lunch MUST be cut"
    assert leave_cuts_meal(leave_em_after_noon, thu_dinner, 'DINNER') == True, "Thu dinner MUST be cut"
    assert leave_cuts_meal(leave_em_after_noon, fri_lunch, 'LUNCH') == True, "Fri lunch MUST be cut"
    print("  [PASS] Emergency leave approved after 12:00 cuts from dinner of that day until end of leave (lunch NOT cut)")


def test_excel_generation_and_reading():
    print("\n=== Testing Excel Generation and Reading ===")

    headers = ["ID", "Tên", "Lớp", "Điểm"]
    data = [
        ["001205000001", "Nguyễn Văn A", "10A1", 9.5],
        ["001205000002", "Trần Thị B", "10A2", 8.0],
        ["001205000003", "Lê Văn C", "10A1", 10.0]
    ]

    from app import app
    with app.test_request_context():
        resp = generate_excel_response(headers, data, "test_file.xlsx", sheet_name="TestSheet")
        assert resp.status_code == 200
        assert resp.mimetype == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert "attachment; filename=test_file.xlsx" in resp.headers["Content-Disposition"]
        
        # Parse output with openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(resp.get_data()))
        ws = wb["TestSheet"]
        assert ws.cell(row=1, column=1).value == "ID"
        assert ws.cell(row=2, column=2).value == "Nguyễn Văn A"
        assert ws.cell(row=4, column=4).value == 10.0
        print("  [PASS] Excel response generation produced valid .xlsx workbook with correct contents & styles")

        # Test read_file_rows on the generated .xlsx
        class MockFileStorage:
            def __init__(self, data_bytes, filename):
                self.data_bytes = data_bytes
                self.filename = filename
            def read(self):
                return self.data_bytes
            def seek(self, pos):
                pass

        mock_file = MockFileStorage(resp.get_data(), "test_file.xlsx")
        read_headers, read_rows, raw_lists = read_file_rows(mock_file)
        assert read_headers == ["ID", "Tên", "Lớp", "Điểm"]
        assert len(read_rows) == 3
        assert read_rows[0]["ID"] == "001205000001"
        assert read_rows[0]["Tên"] == "Nguyễn Văn A"
        print("  [PASS] read_file_rows successfully parsed .xlsx file")

        # Test read_file_rows on CSV data as backward compatibility
        csv_bytes = "ID,Tên,Lớp\n001,Học Sinh X,11B\n002,Học Sinh Y,11C\n".encode('utf-8-sig')
        mock_csv = MockFileStorage(csv_bytes, "test.csv")
        csv_headers, csv_rows, csv_raw = read_file_rows(mock_csv)
        assert csv_headers == ["ID", "Tên", "Lớp"]
        assert len(csv_rows) == 2
        assert csv_rows[0]["ID"] == "001"
        assert csv_rows[1]["Tên"] == "Học Sinh Y"
        print("  [PASS] read_file_rows backward-compatible with CSV files")


def test_api_endpoints():
    print("\n=== Testing API Endpoints for Excel Templates & Exports ===")
    from app import app
    client = app.test_client()

    endpoints_to_test = [
        # Templates
        ("/api/student/template", "student_template.xlsx"),
        ("/api/teacher/template", "teacher_template.xlsx"),
        ("/api/dormroom/template", "dormroom_template.xlsx"),
        ("/api/dormroom/living-template", "dormroom_living_template.xlsx"),
        ("/api/inspection/criteria/template", "criteria_template.xlsx"),
        # Exports
        ("/api/student/export", "danh_sach_hoc_sinh.xlsx"),
        ("/api/teacher/export", "danh_sach_giao_vien.xlsx"),
        ("/api/dormroom/export", "danh_sach_phong_ktx.xlsx"),
        ("/api/inspection/criteria/export", "tieu_chi_cham_diem.xlsx"),
        ("/api/meal/export?role_name=manager", "bao_cao_an_com_"),
        ("/api/leave/export?role_name=manager", "danh_sach_don_nghi_phep.xlsx"),
    ]

    for url, expected_filename_part in endpoints_to_test:
        resp = client.get(url)
        assert resp.status_code == 200, f"Endpoint {url} failed with status {resp.status_code}: {resp.data}"
        assert resp.mimetype == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"Endpoint {url} returned wrong mimetype: {resp.mimetype}"
        assert expected_filename_part in resp.headers.get("Content-Disposition", ""), f"Endpoint {url} expected '{expected_filename_part}' in Content-Disposition"
        
        # Verify valid Excel workbook
        wb = openpyxl.load_workbook(io.BytesIO(resp.data))
        assert len(wb.sheetnames) >= 1
        print(f"  [PASS] {url} -> returns valid Excel ({expected_filename_part})")


if __name__ == '__main__':
    test_meal_cutting_rules()
    test_excel_generation_and_reading()
    test_api_endpoints()
    print("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!")
