-- =====================================================================
-- DATABASE SCHEMA (BẢN FINAL CHUẨN 3NF - 4 PHÂN HỆ): HỆ THỐNG QUẢN LÝ NỘI TRÚ (QLNT)
-- Target RDBMS: MySQL 8.0+
-- Charset: utf8mb4 / Collation: utf8mb4_unicode_ci
-- Chuẩn hóa 3NF:
--   - Loại bỏ toàn bộ cột dư thừa / phụ thuộc bắc cầu:
--     * tAccount.password (chỉ giữ password_hash)
--     * tClass.id_teacher (quan hệ GVCN - Lớp nằm ở bảng MANAGE)
--     * tTeacher.is_home_teacher (suy diễn từ bảng MANAGE)
--     * tLeaveRequest.created_by_role (suy diễn bắc cầu qua tAccount -> tRole)
--     * Tách bảng đa hình tWeeklySummary -> tWeeklyRoomSummary & tWeeklyClassSummary có FK tường minh, bỏ week_end dư thừa
--   - Đầy đủ Khóa ngoại (Foreign Keys) cho toàn bộ 22/22 bảng (không còn bảng trơ chọi)
--   - Đã loại bỏ hoàn toàn module Quản lý vào ra (tAccessLog, tCamera) và role Bảo vệ (guard)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS boarding_manager
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE boarding_manager;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. BẢNG VAI TRÒ (tRole)
DROP TABLE IF EXISTS tRole;
CREATE TABLE tRole (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description NVARCHAR(255),
  is_active TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BẢNG TÀI KHOẢN (tAccount)
DROP TABLE IF EXISTS tAccount;
CREATE TABLE tAccount (
  username CHAR(12) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  must_change_password TINYINT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_account_role FOREIGN KEY (role_id) REFERENCES tRole(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BẢNG TOKEN ĐẶT LẠI MẬT KHẨU (tPasswordResetToken)
DROP TABLE IF EXISTS tPasswordResetToken;
CREATE TABLE tPasswordResetToken (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username CHAR(12) NOT NULL,
  token CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token (token),
  INDEX idx_expires (expires_at),
  CONSTRAINT fk_prt_account FOREIGN KEY (username) REFERENCES tAccount(username) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. BẢNG LỚP HỌC (tClass)
DROP TABLE IF EXISTS tClass;
CREATE TABLE tClass (
  id VARCHAR(50) PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  grade INT NOT NULL DEFAULT 10,
  school_year VARCHAR(20) NOT NULL,
  is_active TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BẢNG GIÁO VIÊN / CÁN BỘ (tTeacher)
DROP TABLE IF EXISTS tTeacher;
CREATE TABLE tTeacher (
  id_VNeID CHAR(12) PRIMARY KEY,
  name NVARCHAR(50) NOT NULL,
  birth DATE NULL,
  sex TINYINT NULL,
  phone_number CHAR(10) NULL,
  email VARCHAR(100) NULL,
  address NVARCHAR(255) NULL,
  is_active INT NOT NULL DEFAULT 1,
  INDEX idx_teacher_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. BẢNG PHÂN CÔNG CHỦ NHIỆM (MANAGE)
DROP TABLE IF EXISTS MANAGE;
CREATE TABLE MANAGE (
  id_teacher CHAR(12) NOT NULL,
  id_class VARCHAR(30) NOT NULL,
  is_active INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id_teacher, id_class),
  INDEX idx_manage_class_active (id_class, is_active),
  CONSTRAINT fk_manage_class FOREIGN KEY (id_class) REFERENCES tClass(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_manage_teacher FOREIGN KEY (id_teacher) REFERENCES tTeacher(id_VNeID) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. BẢNG HỌC SINH (tStudent)
DROP TABLE IF EXISTS tStudent;
CREATE TABLE tStudent (
  id_VNeID CHAR(12) PRIMARY KEY,
  name NVARCHAR(50) NOT NULL,
  sex TINYINT NULL,
  birth DATE NULL,
  phone_number CHAR(10) NULL,
  email VARCHAR(100) NULL,
  permanent_address NVARCHAR(255) NULL,
  temp_address NVARCHAR(255) NULL,
  image_url VARCHAR(255) NULL,
  is_active INT NOT NULL DEFAULT 1,
  INDEX idx_student_active (is_active),
  INDEX idx_student_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. BẢNG PHÂN LỚP HỌC SINH (STUDY)
DROP TABLE IF EXISTS STUDY;
CREATE TABLE STUDY (
  id_student CHAR(12) NOT NULL,
  id_class VARCHAR(30) NOT NULL,
  is_active INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id_student, id_class),
  INDEX idx_study_class_active (id_class, is_active),
  CONSTRAINT fk_study_class FOREIGN KEY (id_class) REFERENCES tClass(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_study_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. BẢNG PHỤ HUYNH (tParent)
DROP TABLE IF EXISTS tParent;
CREATE TABLE tParent (
  id_student CHAR(12) PRIMARY KEY,
  father_name NVARCHAR(50) NULL,
  father_phone CHAR(10) NULL,
  mother_name NVARCHAR(50) NULL,
  mother_phone CHAR(10) NULL,
  is_active INT NOT NULL DEFAULT 1,
  INDEX idx_parent_active (is_active),
  CONSTRAINT fk_parent_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. BẢNG NGHỈ PHÉP (tLeaveRequest)
DROP TABLE IF EXISTS tLeaveRequest;
CREATE TABLE tLeaveRequest (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_student CHAR(12) NOT NULL,
  leave_type VARCHAR(30) NOT NULL, -- REGULAR_WEEKEND, EMERGENCY, AFTER_SCHOOL
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  reason NVARCHAR(255) NULL,
  teacher_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  manager_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  dorm_manager_accept VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_by CHAR(12) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by CHAR(12) NULL,
  decided_at DATETIME NULL,
  decision_note NVARCHAR(255) NULL,
  recurring_parent_id INT NULL,
  is_active INT NOT NULL DEFAULT 1,
  INDEX idx_leave_student_active (id_student, is_active),
  INDEX idx_leave_type_active (leave_type, is_active),
  INDEX idx_leave_recurring (recurring_parent_id, start_time, end_time),
  CONSTRAINT fk_leave_parent FOREIGN KEY (recurring_parent_id) REFERENCES tLeaveRequest(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_leave_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_leave_created_by FOREIGN KEY (created_by) REFERENCES tAccount(username) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_leave_decided_by FOREIGN KEY (decided_by) REFERENCES tAccount(username) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. BẢNG PHÒNG KÝ TÚC XÁ (tDormroom)
DROP TABLE IF EXISTS tDormroom;
CREATE TABLE tDormroom (
  id VARCHAR(20) PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  num_of_bed INT NULL,
  is_active INT NOT NULL DEFAULT 1,
  INDEX idx_dormroom_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. BẢNG LƯU TRÚ KTX (LIVING)
DROP TABLE IF EXISTS LIVING;
CREATE TABLE LIVING (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_student CHAR(12) NOT NULL,
  id_dormroom VARCHAR(20) NOT NULL,
  import_date DATE NULL,
  note INT DEFAULT 0,
  is_active INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_living_student_active (id_student, is_active),
  INDEX idx_living_room_active (id_dormroom, is_active),
  CONSTRAINT fk_living_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_living_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. BẢNG YÊU CẦU CHUYỂN PHÒNG (tRoomChangeRequest)
DROP TABLE IF EXISTS tRoomChangeRequest;
CREATE TABLE tRoomChangeRequest (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_teacher CHAR(12) NOT NULL,
  id_student CHAR(12) NOT NULL,
  id_dormroom VARCHAR(20) NOT NULL,
  action VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  CONSTRAINT fk_rcr_teacher FOREIGN KEY (id_teacher) REFERENCES tTeacher(id_VNeID) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rcr_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rcr_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. BẢNG YÊU CẦU SỬA/XÓA PHÒNG KTX (tRoomAdminRequest)
DROP TABLE IF EXISTS tRoomAdminRequest;
CREATE TABLE tRoomAdminRequest (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_teacher CHAR(12) NOT NULL,
  id_dormroom VARCHAR(20) NOT NULL,
  action VARCHAR(20) NOT NULL,
  requested_name NVARCHAR(100) NULL,
  requested_num_of_bed INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  INDEX idx_room_admin_request_teacher (id_teacher),
  INDEX idx_room_admin_request_status (status),
  CONSTRAINT fk_rar_teacher FOREIGN KEY (id_teacher) REFERENCES tTeacher(id_VNeID) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rar_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. BẢNG ĐIỂM DANH KTX (tDormAttendance)
DROP TABLE IF EXISTS tDormAttendance;
CREATE TABLE tDormAttendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attendance_date DATE NOT NULL,
  id_dormroom VARCHAR(20) NOT NULL,
  id_student CHAR(12) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PRESENT', -- PRESENT, ABSENT_LEAVE, ABSENT_UNEXCUSED
  note NVARCHAR(255) NULL,
  recorded_by CHAR(12) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_attendance (attendance_date, id_student),
  INDEX idx_date_room (attendance_date, id_dormroom),
  CONSTRAINT fk_att_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_att_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_att_recorder FOREIGN KEY (recorded_by) REFERENCES tAccount(username) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. BẢNG TIÊU CHÍ CHẤM ĐIỂM PHÒNG KTX (tInspectionCriteria)
DROP TABLE IF EXISTS tInspectionCriteria;
CREATE TABLE tInspectionCriteria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  description NVARCHAR(255) NULL,
  min_penalty DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  max_penalty DECIMAL(4,1) NOT NULL DEFAULT 5.0,
  is_active INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. BẢNG BIÊN BẢN CHẤM ĐIỂM PHÒNG (tRoomInspection)
DROP TABLE IF EXISTS tRoomInspection;
CREATE TABLE tRoomInspection (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_dormroom VARCHAR(20) NOT NULL,
  inspection_date DATE NOT NULL,
  inspected_by CHAR(12) NULL,
  note NVARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_room_date (id_dormroom, inspection_date),
  CONSTRAINT fk_insp_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_insp_user FOREIGN KEY (inspected_by) REFERENCES tAccount(username) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. BẢNG CHI TIẾT LỖI VI PHẠM KTX (tInspectionViolation)
DROP TABLE IF EXISTS tInspectionViolation;
CREATE TABLE tInspectionViolation (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id INT NOT NULL,
  criteria_id INT NOT NULL,
  penalty_points DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  id_student CHAR(12) NULL,
  note NVARCHAR(255) NULL,
  CONSTRAINT fk_viol_insp FOREIGN KEY (inspection_id) REFERENCES tRoomInspection(id) ON DELETE CASCADE,
  CONSTRAINT fk_viol_crit FOREIGN KEY (criteria_id) REFERENCES tInspectionCriteria(id) ON DELETE RESTRICT,
  CONSTRAINT fk_viol_stu FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. BẢNG TỔNG HỢP THI ĐUA KTX THEO PHÒNG (tWeeklyRoomSummary)
DROP TABLE IF EXISTS tWeeklyRoomSummary;
CREATE TABLE tWeeklyRoomSummary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_start DATE NOT NULL,
  id_dormroom VARCHAR(20) NOT NULL,
  total_penalty DECIMAL(6,1) NOT NULL DEFAULT 0.0,
  total_violations INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_week_room (week_start, id_dormroom),
  CONSTRAINT fk_wrs_room FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. BẢNG TỔNG HỢP THI ĐUA KTX THEO LỚP (tWeeklyClassSummary)
DROP TABLE IF EXISTS tWeeklyClassSummary;
CREATE TABLE tWeeklyClassSummary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_start DATE NOT NULL,
  id_class VARCHAR(50) NOT NULL,
  total_penalty DECIMAL(6,1) NOT NULL DEFAULT 0.0,
  total_violations INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_week_class (week_start, id_class),
  CONSTRAINT fk_wcs_class FOREIGN KEY (id_class) REFERENCES tClass(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. BẢNG SUẤT ĂN VÀ CHẤM CƠM (tMealAttendance)
DROP TABLE IF EXISTS tMealAttendance;
CREATE TABLE tMealAttendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  meal_date DATE NOT NULL,
  meal_type VARCHAR(10) NOT NULL, -- LUNCH, DINNER
  id_student CHAR(12) NOT NULL,
  is_cut INT NOT NULL DEFAULT 0,
  reason_leave_id INT NULL,
  note NVARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_meal_student (meal_date, meal_type, id_student),
  INDEX idx_meal_student_date (id_student, meal_date),
  INDEX idx_meal_date (meal_date),
  CONSTRAINT fk_meal_leave FOREIGN KEY (reason_leave_id) REFERENCES tLeaveRequest(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_meal_student FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. BẢNG THỰC ĐƠN TUẦN NHÀ ĂN (tWeeklyMenu - Master)
DROP TABLE IF EXISTS tWeeklyMenu;
CREATE TABLE tWeeklyMenu (
  id INT AUTO_INCREMENT PRIMARY KEY,
  start_date DATE NOT NULL,
  note NVARCHAR(255) NULL,
  created_by CHAR(12) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_weekly_start_date (start_date),
  CONSTRAINT fk_weekly_menu_creator FOREIGN KEY (created_by) REFERENCES tAccount(username) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. BẢNG CHI TIẾT THỰC ĐƠN TUẦN (tDetailWeeklyMenu - Composition)
DROP TABLE IF EXISTS tDetailWeeklyMenu;
CREATE TABLE tDetailWeeklyMenu (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_weekly_menu INT NOT NULL,
  menu_date DATE NOT NULL,
  meal_time VARCHAR(10) NOT NULL, -- LUNCH, DINNER, BREAKFAST
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
  CONSTRAINT fk_detail_weekly_menu FOREIGN KEY (id_weekly_menu) REFERENCES tWeeklyMenu(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- TRIGGER KIỂM TRA CHẶN XẾP PHÒNG QUÁ SỨC CHỨA
-- =====================================================================
DELIMITER $$

DROP TRIGGER IF EXISTS trg_check_dorm_capacity$$
CREATE TRIGGER trg_check_dorm_capacity
BEFORE INSERT ON LIVING
FOR EACH ROW
BEGIN
    DECLARE v_capacity INT DEFAULT 0;
    DECLARE v_current_occupied INT DEFAULT 0;

    SELECT COALESCE(num_of_bed, 0) INTO v_capacity
    FROM tDormroom
    WHERE id = NEW.id_dormroom AND is_active = 1;

    SELECT COUNT(*) INTO v_current_occupied
    FROM LIVING
    WHERE id_dormroom = NEW.id_dormroom
      AND is_active = 1;

    IF v_capacity > 0 AND v_current_occupied >= v_capacity THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'LỖI: Phòng KTX đã đạt giới hạn sức chứa tối đa. Không thể xếp thêm học sinh!';
    END IF;
END$$

DELIMITER ;
