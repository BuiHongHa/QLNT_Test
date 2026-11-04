import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == 'tools' else BASE_DIR
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import get_db_connection

conn = get_db_connection()
cursor = conn.cursor(dictionary=True)
cursor.execute("SELECT id_teacher, id_class FROM MANAGE WHERE id_class NOT LIKE '%\\_%'")
rows = cursor.fetchall()
for r in rows:
    new_id = f"{r['id_class']}_2025-2026"
    cursor.execute('UPDATE MANAGE SET id_class = %s WHERE id_teacher = %s AND id_class = %s', (new_id, r['id_teacher'], r['id_class']))

conn.commit()
print(f"Updated {len(rows)} records")
cursor.close()
conn.close()
