-- =====================================================================
-- UPDATE DB SCRIPT (FINAL 4 PHÂN HỆ)
-- Chú ý: Nếu nâng cấp từ bản cũ có module vào ra / bảo vệ, hãy chạy
-- tools/migrate_final_4_modules.py hoặc tools/migrate_final_4_modules.sql
-- =====================================================================

USE boarding_manager;

-- Đảm bảo 5 vai trò chuẩn
INSERT INTO tRole (name, is_active) SELECT 'student', 1 WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='student');
INSERT INTO tRole (name, is_active) SELECT 'teacher', 1 WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='teacher');
INSERT INTO tRole (name, is_active) SELECT 'manager', 1 WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='manager');
INSERT INTO tRole (name, is_active) SELECT 'dorm_manager', 1 WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='dorm_manager');
INSERT INTO tRole (name, is_active) SELECT 'canteen_manager', 1 WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='canteen_manager');

-- Loại bỏ bảng & vai trò cũ nếu còn sót
DROP TABLE IF EXISTS tAccessLog;
DROP TABLE IF EXISTS tCamera;
DROP TABLE IF EXISTS tGuardian;
DELETE FROM tRole WHERE name IN ('guard', 'guardian');

CREATE TABLE IF NOT EXISTS tParent (
  id_student CHAR(12) NOT NULL,
  father_name NVARCHAR(50),
  father_phone CHAR(10),
  mother_name NVARCHAR(50),
  mother_phone CHAR(10),
  is_active INT DEFAULT 1,
  PRIMARY KEY (id_student),
  FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID)
);

CREATE TABLE IF NOT EXISTS tLeaveRequest (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_student CHAR(12) NOT NULL,
  leave_type VARCHAR(30) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  reason NVARCHAR(255),
  teacher_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  manager_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  dorm_manager_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_by CHAR(12),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by CHAR(12),
  decided_at DATETIME NULL,
  decision_note NVARCHAR(255),
  recurring_parent_id INT NULL,
  is_active INT DEFAULT 1,
  FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID),
  FOREIGN KEY (created_by) REFERENCES tAccount(username) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES tAccount(username) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS tMealAttendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  meal_date DATE NOT NULL,
  meal_type VARCHAR(10) NOT NULL,
  id_student CHAR(12) NOT NULL,
  is_cut INT NOT NULL DEFAULT 0,
  reason_leave_id INT NULL,
  note NVARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_meal_student (meal_date, meal_type, id_student),
  FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID)
);
