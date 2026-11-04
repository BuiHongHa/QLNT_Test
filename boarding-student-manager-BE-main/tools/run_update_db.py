import sys
from pathlib import Path

import mysql.connector

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == 'tools' else BASE_DIR
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import get_db_connection

def column_exists(cursor, db, table, column):
    cursor.execute(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE table_schema = %s AND table_name = %s AND column_name = %s",
        (db, table, column)
    )
    return cursor.fetchone()[0] > 0

def table_exists(cursor, db, table):
    cursor.execute(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
        "WHERE table_schema = %s AND table_name = %s",
        (db, table)
    )
    return cursor.fetchone()[0] > 0

def get_column_type(cursor, db, table, column):
    cursor.execute(
        "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE table_schema = %s AND table_name = %s AND column_name = %s",
        (db, table, column)
    )
    row = cursor.fetchone()
    return row[0].lower() if row else None

def run_migrations(cursor, db):
    # Add image_url to tStudent if not exists
    if not column_exists(cursor, db, 'tStudent', 'image_url'):
        cursor.execute("ALTER TABLE tStudent ADD image_url VARCHAR(255) DEFAULT NULL")
        print("  [+] Added column image_url to tStudent.")

    # Rename tLogin to tAccount if tLogin exists and tAccount does not
    if table_exists(cursor, db, 'tLogin') and not table_exists(cursor, db, 'tAccount'):
        cursor.execute("RENAME TABLE tLogin TO tAccount")
        print("  [+] Renamed tLogin to tAccount.")

    # Change tRole.name from VARCHAR to NVARCHAR if needed
    if get_column_type(cursor, db, 'tRole', 'name') == 'varchar':
        cursor.execute("ALTER TABLE tRole MODIFY COLUMN name NVARCHAR(50) NOT NULL")
        print("  [+] Changed tRole.name to NVARCHAR(50).")

    # Change tClass.name from VARCHAR to NVARCHAR if needed
    if get_column_type(cursor, db, 'tClass', 'name') == 'varchar':
        cursor.execute("ALTER TABLE tClass MODIFY COLUMN name NVARCHAR(5) NOT NULL")
        print("  [+] Changed tClass.name to NVARCHAR(5).")

    # Create tParent if not exists
    if not table_exists(cursor, db, 'tParent'):
        cursor.execute("""
            CREATE TABLE tParent (
                id_student CHAR(12) NOT NULL,
                father_name NVARCHAR(50),
                father_phone CHAR(10),
                mother_name NVARCHAR(50),
                mother_phone CHAR(10),
                is_active INT DEFAULT 1,
                PRIMARY KEY (id_student),
                FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID)
            )
        """)
        print("  [+] Created table tParent.")

def update_db():
    db = 'boarding_manager'
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        print("Running migrations...")
        run_migrations(cursor, db)

        print("Running SQL script...")
        with open(BASE_DIR / 'update_db.sql', 'r', encoding='utf-8') as f:
            sql_script = f.read()

        statements = sql_script.split(';')
        for statement in statements:
            stmt = statement.strip()
            if stmt and not stmt.startswith('--'):
                try:
                    cursor.execute(stmt)
                except mysql.connector.Error as err:
                    # Ignore "table already exists" (1050) and "unknown table" when dropping (1051)
                    if err.errno not in (1050, 1051):
                        print(f"  [!] Error: {err}")
                        print(f"      Statement: {stmt[:80]}...")

        conn.commit()
        print("Database updated successfully.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn.is_connected():
            conn.close()

if __name__ == '__main__':
    update_db()
