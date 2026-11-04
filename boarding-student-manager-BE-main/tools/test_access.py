import sys
sys.path.append('.')
import mysql.connector
from datetime import datetime
from api.access_log import build_access_preview

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

try:
    conn = mysql.connector.connect(
        host='127.0.0.1',
        user='root',
        password='SonTrau@0202',
        database='boarding_manager'
    )
    cursor = conn.cursor(dictionary=True)
    
    # We run preview for student BÙI ĐỨC ANH (037204006345)
    preview = build_access_preview(cursor, '037204006345')
    print("--- ACCESS PREVIEW FOR BÙI ĐỨC ANH ---")
    if preview:
        print(f"Allowed: {preview['allowed']}")
        print(f"Message: {preview['message']}")
        print(f"Leave Details: {preview['data']['leave']}")
        print(f"Presence status: {preview['data']['presence']['status']}, Suggested: {preview['data']['presence']['suggested_action']}")
    else:
        print("No preview returned.")
        
except Exception as e:
    print("Error:", e)
