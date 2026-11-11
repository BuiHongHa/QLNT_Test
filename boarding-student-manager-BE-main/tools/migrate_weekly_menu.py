import sys
from datetime import timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent if BASE_DIR.name == 'tools' else BASE_DIR
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import get_db_connection


def compose_dishes_text(row):
    parts = [
        (row.get('rice') or '').strip(),
        (row.get('main_dish_1') or '').strip(),
        (row.get('main_dish_2') or '').strip(),
        (row.get('side_dish') or '').strip(),
        (row.get('soup') or '').strip(),
        (row.get('dessert') or '').strip(),
    ]
    return ', '.join([p for p in parts if p])


def migrate():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT COUNT(*) AS cnt
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tDetailWeeklyMenu'
        """)
        already_split = (cursor.fetchone() or {}).get('cnt', 0) > 0

        if already_split:
            print("tDetailWeeklyMenu already exists; verifying schema...")
            cursor.execute("SELECT COUNT(*) AS cnt FROM tWeeklyMenu")
            w_cnt = cursor.fetchone()['cnt']
            cursor.execute("SELECT COUNT(*) AS cnt FROM tDetailWeeklyMenu")
            d_cnt = cursor.fetchone()['cnt']
            print(f"  tWeeklyMenu rows: {w_cnt}, tDetailWeeklyMenu rows: {d_cnt}")
            return

        print("1. Backing up existing rows from legacy tWeeklyMenu...")
        cursor.execute("SELECT * FROM tWeeklyMenu ORDER BY menu_date ASC, id ASC")
        legacy_rows = cursor.fetchall()
        print(f"  Found {len(legacy_rows)} legacy meal rows.")

        print("2. Replacing legacy tWeeklyMenu with normalized tWeeklyMenu + tDetailWeeklyMenu...")
        cursor.execute("DROP TABLE IF EXISTS tWeeklyMenu_legacy_tmp")
        cursor.execute("RENAME TABLE tWeeklyMenu TO tWeeklyMenu_legacy_tmp")

        cursor.execute("""
            CREATE TABLE tWeeklyMenu (
                id INT AUTO_INCREMENT PRIMARY KEY,
                start_date DATE NOT NULL,
                note NVARCHAR(255) NULL,
                created_by CHAR(12) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_weekly_start_date (start_date),
                CONSTRAINT fk_weekly_menu_creator FOREIGN KEY (created_by)
                    REFERENCES tAccount(username) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        cursor.execute("""
            CREATE TABLE tDetailWeeklyMenu (
                id INT AUTO_INCREMENT PRIMARY KEY,
                id_weekly_menu INT NOT NULL,
                menu_date DATE NOT NULL,
                meal_time VARCHAR(10) NOT NULL,
                dishes NVARCHAR(500) NOT NULL DEFAULT '',
                rice VARCHAR(150) NOT NULL DEFAULT 'Cơm trắng',
                main_dish_1 VARCHAR(200) NOT NULL DEFAULT '',
                main_dish_2 VARCHAR(200) NOT NULL DEFAULT '',
                side_dish VARCHAR(200) NOT NULL DEFAULT '',
                soup VARCHAR(200) NOT NULL DEFAULT '',
                dessert VARCHAR(150) NULL,
                meal_price DECIMAL(10, 0) NOT NULL DEFAULT 25000,
                nutritional_standard NVARCHAR(255) NULL DEFAULT 'Đủ 5 nhóm chất (~750 kcal)',
                note NVARCHAR(255) NULL,
                UNIQUE KEY uniq_detail_date_meal (id_weekly_menu, menu_date, meal_time),
                INDEX idx_detail_menu_date (menu_date, meal_time),
                CONSTRAINT fk_detail_weekly_menu FOREIGN KEY (id_weekly_menu)
                    REFERENCES tWeeklyMenu(id) ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        print("3. Migrating legacy meal rows into parent tWeeklyMenu and child tDetailWeeklyMenu...")
        weekly_id_by_monday = {}
        for r in legacy_rows:
            m_date = r['menu_date']
            monday = m_date - timedelta(days=m_date.weekday())
            if monday not in weekly_id_by_monday:
                cursor.execute("""
                    INSERT INTO tWeeklyMenu (start_date, note, created_by)
                    VALUES (%s, %s, %s)
                """, (monday, None, r.get('created_by')))
                weekly_id_by_monday[monday] = cursor.lastrowid

            weekly_id = weekly_id_by_monday[monday]
            dishes_text = compose_dishes_text(r)
            cursor.execute("""
                INSERT INTO tDetailWeeklyMenu (
                    id_weekly_menu, menu_date, meal_time, dishes,
                    rice, main_dish_1, main_dish_2, side_dish, soup, dessert,
                    meal_price, nutritional_standard, note
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                weekly_id,
                m_date,
                (r.get('meal_type') or 'LUNCH').upper(),
                dishes_text,
                r.get('rice') or 'Cơm trắng',
                r.get('main_dish_1') or '',
                r.get('main_dish_2') or '',
                r.get('side_dish') or '',
                r.get('soup') or '',
                r.get('dessert') or '',
                25000,
                'Đủ 5 nhóm chất (~750 kcal)',
                r.get('note') or ''
            ))

        cursor.execute("DROP TABLE tWeeklyMenu_legacy_tmp")
        conn.commit()
        print(f"4. Migrated {len(weekly_id_by_monday)} weeks and {len(legacy_rows)} meal details successfully!")
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    migrate()
