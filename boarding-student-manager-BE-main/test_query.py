import mysql.connector

try:
    conn = mysql.connector.connect(
        host='127.0.0.1',  # Chỉ để địa chỉ IP (hoặc 'localhost')
        port=3306,         # Khai báo port riêng (có thể bỏ dòng này vì 3306 là mặc định)
        user='root',
        password='123456', # Đảm bảo đây đúng là mật khẩu của bạn
        database='QLNT'
    )
    cursor = conn.cursor()
    cursor.execute("UPDATE tRoomAdminRequest SET status = 'PENDING' WHERE id = 1")
    conn.commit()
    print("Set tRoomAdminRequest id=1 to PENDING")
except Exception as e:
    print("Error:", e)