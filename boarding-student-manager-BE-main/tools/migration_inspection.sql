-- ============================================================
-- Migration: Chấm điểm phòng ở nội trú
-- ============================================================

-- 1) Bảng tiêu chí chấm điểm
CREATE TABLE IF NOT EXISTS tInspectionCriteria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  min_penalty DECIMAL(4,1) NOT NULL DEFAULT 0,
  max_penalty DECIMAL(4,1) NOT NULL DEFAULT 5,
  is_active INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2) Bảng biên bản chấm điểm phòng (1 bản ghi / phòng / ngày)
CREATE TABLE IF NOT EXISTS tRoomInspection (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_dormroom VARCHAR(10) NOT NULL,
  inspection_date DATE NOT NULL,
  inspected_by CHAR(12) NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_room_date (id_dormroom, inspection_date),
  KEY idx_inspection_date (inspection_date),
  CONSTRAINT fk_inspection_room
    FOREIGN KEY (id_dormroom) REFERENCES tDormroom(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3) Bảng chi tiết vi phạm
CREATE TABLE IF NOT EXISTS tInspectionViolation (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id INT NOT NULL,
  criteria_id INT NOT NULL,
  penalty_points DECIMAL(4,1) NOT NULL,
  id_student CHAR(12) NULL,
  note VARCHAR(255) NULL,
  CONSTRAINT fk_violation_inspection
    FOREIGN KEY (inspection_id) REFERENCES tRoomInspection(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_violation_criteria
    FOREIGN KEY (criteria_id) REFERENCES tInspectionCriteria(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_violation_student
    FOREIGN KEY (id_student) REFERENCES tStudent(id_VNeID)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4) Bảng tổng hợp tuần
CREATE TABLE IF NOT EXISTS tWeeklySummary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  summary_type VARCHAR(10) NOT NULL,
  ref_id VARCHAR(30) NOT NULL,
  total_penalty DECIMAL(6,1) NOT NULL DEFAULT 0,
  total_violations INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_summary (week_start, summary_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
