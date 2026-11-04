import mysql.connector

try:
    conn = mysql.connector.connect(
        host='127.0.0.1',
        user='root',
        password='SonTrau@0202',
        database='boarding_manager'
    )
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM tRole")
    rows = cursor.fetchall()
    print("--- ROLES ---")
    for r in rows:
        print(f"ID: {r['id']}, Name: {r['name']}")
except Exception as e:
    print("Error:", e)
