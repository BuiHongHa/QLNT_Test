import sys
import os
from datetime import datetime, date, time, timedelta

# Fix encoding for Windows console
if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config import get_db_connection
from mock_time import get_today
from api.meal import sync_students_meal_attendance

def main():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    print("--- Khoi dong dong bo lich su cham com tu 01/01/2026 ---")
    
    # 1. Lay danh sach tat ca hoc sinh active
    cursor.execute("SELECT id_VNeID, name FROM tStudent WHERE is_active = 1")
    students = cursor.fetchall()
    if not students:
        print("Khong tim thay hoc sinh nao dang hoat dong.")
        return
        
    student_ids = [s['id_VNeID'] for s in students]
    print(f"Tong so hoc sinh can dong bo: {len(student_ids)}")
    
    # Khoang thoi gian dong bo
    start_day = date(2026, 1, 1)
    end_day = get_today()
    
    print(f"Khoang thoi gian dong bo: {start_day} den {end_day}")
    
    # Chay dong bo theo tung dot 30 ngay
    current_start = start_day
    while current_start <= end_day:
        current_end = min(current_start + timedelta(days=30), end_day)
        print(f"Dang dong bo tu {current_start} den {current_end}...")
        sync_students_meal_attendance(cursor, student_ids, current_start, current_end)
        conn.commit()
        current_start = current_end + timedelta(days=1)
        
    print("--- Dong bo lich su thanh cong! ---")
    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()
