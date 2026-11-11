-- =====================================================================
-- SEED DATA MẪU (BẢN FINAL CHUẨN 3NF - 4 PHÂN HỆ): HỆ THỐNG QUẢN LÝ NỘI TRÚ (QLNT)
-- Khớp hoàn toàn với schema.sql và 5 vai trò chính thức
-- =====================================================================

USE boarding_manager;

-- 1. KHỞI TẠO 5 VAI TRÒ CHÍNH THỨC (Đã loại bỏ role Bảo vệ)
INSERT INTO tRole (id, name, description, is_active) VALUES
(1, 'student', 'Học sinh nội trú - Xem thẻ, tạo đơn nghỉ phép, xem lỗi vi phạm và báo cơm', 1),
(2, 'teacher', 'Giáo viên chủ nhiệm - Quản lý lớp học, duyệt đơn nghỉ phép cấp 1, theo dõi KTX và nhà ăn', 1),
(3, 'manager', 'Ban Giám Hiệu - Toàn quyền quản trị hệ thống và phê duyệt tối hậu', 1),
(4, 'dorm_manager', 'Quản lý Ký túc xá - Quản lý phòng ở, điểm danh phòng, chấm điểm nề nếp KTX và duyệt đơn ra ngoài', 1),
(5, 'canteen_manager', 'Quản lý Nhà ăn - Chấm cơm, lập thực đơn tuần và thống kê suất ăn', 1)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  is_active = 1;

-- 2. KHỞI TẠO TÀI KHOẢN MẪU (Mật khẩu mặc định: 123456)
INSERT INTO tAccount (username, password_hash, role_id, must_change_password, is_active) VALUES
('BGH001', 'scrypt:32768:8:1$oIuZf9zaYNibYEPb$8eeda68fa4c6ec80f044fad300af65b828c6abc8e4685d3c0234be4eec11f1768cb89be9fdcafe311d0b0a05187ecaf2e5e40a96c46d181abe4299b6912e03d1', 3, 0, 1),
('GVCN001', 'scrypt:32768:8:1$oIuZf9zaYNibYEPb$8eeda68fa4c6ec80f044fad300af65b828c6abc8e4685d3c0234be4eec11f1768cb89be9fdcafe311d0b0a05187ecaf2e5e40a96c46d181abe4299b6912e03d1', 2, 0, 1),
('KTX001', 'scrypt:32768:8:1$oIuZf9zaYNibYEPb$8eeda68fa4c6ec80f044fad300af65b828c6abc8e4685d3c0234be4eec11f1768cb89be9fdcafe311d0b0a05187ecaf2e5e40a96c46d181abe4299b6912e03d1', 4, 0, 1),
('BEP001', 'scrypt:32768:8:1$oIuZf9zaYNibYEPb$8eeda68fa4c6ec80f044fad300af65b828c6abc8e4685d3c0234be4eec11f1768cb89be9fdcafe311d0b0a05187ecaf2e5e40a96c46d181abe4299b6912e03d1', 5, 0, 1),
('001204000001', 'scrypt:32768:8:1$oIuZf9zaYNibYEPb$8eeda68fa4c6ec80f044fad300af65b828c6abc8e4685d3c0234be4eec11f1768cb89be9fdcafe311d0b0a05187ecaf2e5e40a96c46d181abe4299b6912e03d1', 1, 0, 1),
('001204000002', 'scrypt:32768:8:1$oIuZf9zaYNibYEPb$8eeda68fa4c6ec80f044fad300af65b828c6abc8e4685d3c0234be4eec11f1768cb89be9fdcafe311d0b0a05187ecaf2e5e40a96c46d181abe4299b6912e03d1', 1, 0, 1)
ON DUPLICATE KEY UPDATE is_active = 1;

-- 3. KHỞI TẠO DANH MỤC LỚP HỌC
INSERT INTO tClass (id, name, grade, school_year, is_active) VALUES
('10A1_2026-2027', '10A1', 10, '2026-2027', 1),
('11A1_2026-2027', '11A1', 11, '2026-2027', 1),
('12A1_2026-2027', '12A1', 12, '2026-2027', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 4. KHỞI TẠO HỒ SƠ GIÁO VIÊN & PHÂN CÔNG CHỦ NHIỆM (MANAGE)
INSERT INTO tTeacher (id_VNeID, name, birth, sex, phone_number, email, address, is_active) VALUES
('GVCN001', 'Thầy Nguyễn Văn An', '1985-05-15', 0, '0912345678', 'an.nguyen@truongnoitru.edu.vn', 'Số 12 Phố Giáo Viên, Hà Nội', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO MANAGE (id_teacher, id_class, is_active) VALUES
('GVCN001', '10A1_2026-2027', 1)
ON DUPLICATE KEY UPDATE is_active = 1;

-- 5. KHỞI TẠO HỒ SƠ HỌC SINH, PHÂN LỚP (STUDY) & PHỤ HUYNH (tParent)
INSERT INTO tStudent (id_VNeID, name, birth, sex, phone_number, email, permanent_address, is_active) VALUES
('001204000001', 'Nguyễn Hoàng Nam', '2008-03-20', 0, '0988111222', 'nam.nh2008@gmail.com', 'Huyện Ba Vì, TP. Hà Nội', 1),
('001204000002', 'Trần Thu Trang', '2008-08-12', 1, '0988333444', 'trang.tt2008@gmail.com', 'Huyện Quốc Oai, TP. Hà Nội', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO STUDY (id_student, id_class, is_active) VALUES
('001204000001', '10A1_2026-2027', 1),
('001204000002', '10A1_2026-2027', 1)
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO tParent (id_student, father_name, father_phone, mother_name, mother_phone, is_active) VALUES
('001204000001', 'Nguyễn Văn Thành', '0911222333', 'Lê Thị Mai', '0911222444', 1),
('001204000002', 'Trần Văn Hùng', '0922333444', 'Phạm Thị Lan', '0922333555', 1)
ON DUPLICATE KEY UPDATE father_name = VALUES(father_name);

-- 6. KHỞI TẠO DANH MỤC PHÒNG KÝ TÚC XÁ & XẾP PHÒNG MẪU (LIVING)
INSERT INTO tDormroom (id, name, num_of_bed, is_active) VALUES
('A101', 'Phòng Nam A101', 8, 1),
('A102', 'Phòng Nam A102', 8, 1),
('B101', 'Phòng Nữ B101', 8, 1),
('B102', 'Phòng Nữ B102', 8, 1)
ON DUPLICATE KEY UPDATE num_of_bed = VALUES(num_of_bed);

INSERT INTO LIVING (id_student, id_dormroom, import_date, is_active) VALUES
('001204000001', 'A101', '2026-09-05', 1),
('001204000002', 'B101', '2026-09-05', 1);
