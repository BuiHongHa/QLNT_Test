USE boarding_manager;

-- Insert roles if not exists
INSERT INTO tRole (name) SELECT 'manager' WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='manager');
INSERT INTO tRole (name) SELECT 'teacher' WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='teacher');
INSERT INTO tRole (name) SELECT 'student' WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='student');
INSERT INTO tRole (name) SELECT 'dorm_manager' WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='dorm_manager');
INSERT INTO tRole (name) SELECT 'canteen_manager' WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name='canteen_manager');
UPDATE tRole SET name = 'dorm_manager' WHERE name IN ('guard', 'guardian');

-- Create tAccessLog if not exists
CREATE TABLE IF NOT EXISTS tAccessLog (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_student CHAR(12) NOT NULL,
  access_time DATETIME NOT NULL,
  type VARCHAR(10) NOT NULL,
  note NVARCHAR(255),
  FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID)
);

-- Create tCamera if not exists
CREATE TABLE IF NOT EXISTS tCamera (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  camera_type VARCHAR(20) NOT NULL DEFAULT 'device',
  stream_url NVARCHAR(255),
  is_active INT DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create tParent if not exists
-- id_student is both PK and FK to tStudent (1-1 relationship)
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

-- Drop old tables if exists
DROP TABLE IF EXISTS tGuardian;

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
  created_by_role VARCHAR(30),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by CHAR(12),
  decided_at DATETIME NULL,
  decision_note NVARCHAR(255),
  recurring_parent_id INT NULL,
  is_active INT DEFAULT 1,
  FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID)
);

SET @has_recurring_parent_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tLeaveRequest'
    AND COLUMN_NAME = 'recurring_parent_id'
);
SET @alter_leave_sql := IF(
  @has_recurring_parent_id = 0,
  'ALTER TABLE tLeaveRequest ADD COLUMN recurring_parent_id INT NULL',
  'SELECT 1'
);
PREPARE alter_leave_stmt FROM @alter_leave_sql;
EXECUTE alter_leave_stmt;
DEALLOCATE PREPARE alter_leave_stmt;

SET @has_teacher_accept := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tLeaveRequest'
    AND COLUMN_NAME = 'teacher_accept'
);
SET @alter_teacher_accept_sql := IF(
  @has_teacher_accept = 0,
  'ALTER TABLE tLeaveRequest ADD COLUMN teacher_accept VARCHAR(20) NOT NULL DEFAULT ''PENDING''',
  'SELECT 1'
);
PREPARE alter_teacher_accept_stmt FROM @alter_teacher_accept_sql;
EXECUTE alter_teacher_accept_stmt;
DEALLOCATE PREPARE alter_teacher_accept_stmt;

SET @has_manager_accept := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tLeaveRequest'
    AND COLUMN_NAME = 'manager_accept'
);
SET @alter_manager_accept_sql := IF(
  @has_manager_accept = 0,
  'ALTER TABLE tLeaveRequest ADD COLUMN manager_accept VARCHAR(20) NOT NULL DEFAULT ''PENDING''',
  'SELECT 1'
);
PREPARE alter_manager_accept_stmt FROM @alter_manager_accept_sql;
EXECUTE alter_manager_accept_stmt;
DEALLOCATE PREPARE alter_manager_accept_stmt;

SET @has_dorm_manager_accept := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tLeaveRequest'
    AND COLUMN_NAME = 'dorm_manager_accept'
);
SET @alter_dorm_manager_accept_sql := IF(
  @has_dorm_manager_accept = 0,
  'ALTER TABLE tLeaveRequest ADD COLUMN dorm_manager_accept VARCHAR(20) NOT NULL DEFAULT ''PENDING''',
  'SELECT 1'
);
PREPARE alter_dorm_manager_accept_stmt FROM @alter_dorm_manager_accept_sql;
EXECUTE alter_dorm_manager_accept_stmt;
DEALLOCATE PREPARE alter_dorm_manager_accept_stmt;

UPDATE tLeaveRequest
SET teacher_accept = 'ACCEPTED', manager_accept = 'ACCEPTED'
WHERE status = 'ACCEPTED'
  AND teacher_accept = 'PENDING'
  AND manager_accept = 'PENDING';

UPDATE tLeaveRequest
SET teacher_accept = 'DENIED', manager_accept = 'DENIED'
WHERE status = 'DENIED'
  AND teacher_accept = 'PENDING'
  AND manager_accept = 'PENDING';

SET @has_status := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tLeaveRequest'
    AND COLUMN_NAME = 'status'
);
SET @drop_status_sql := IF(
  @has_status > 0,
  'ALTER TABLE tLeaveRequest DROP COLUMN status',
  'SELECT 1'
);
PREPARE drop_status_stmt FROM @drop_status_sql;
EXECUTE drop_status_stmt;
DEALLOCATE PREPARE drop_status_stmt;

-- Soft delete toàn bộ nghỉ phép thường xuyên hiện tại
UPDATE tLeaveRequest
SET is_active = 0
WHERE leave_type = 'REGULAR_WEEKEND';

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
