-- =====================================================================
-- MIGRATION: CHUYỂN ĐỔI HỆ THỐNG SANG BẢN FINAL 4 PHÂN HỆ
-- 1. Loại bỏ hoàn toàn module Quản lý vào ra (tAccessLog, tCamera)
-- 2. Loại bỏ hoàn toàn role Bảo vệ (guard, guardian)
-- 3. Chuẩn hóa 5 vai trò chính thức cho 4 phân hệ:
--    Quản trị hệ thống | Quản lý nghỉ phép | Quản lý nhà ăn | Quản lý ký túc
-- =====================================================================

USE boarding_manager;

-- 1. Xóa bảng quản lý ra vào và camera
DROP TABLE IF EXISTS tAccessLog;
DROP TABLE IF EXISTS tCamera;

-- 2. Đảm bảo đủ 5 vai trò chuẩn và loại bỏ role guard / guardian nếu còn tồn tại
INSERT INTO tRole (name, description, is_active)
SELECT 'student', 'Học sinh nội trú - Xem thẻ, tạo đơn nghỉ phép, xem lỗi vi phạm và báo cơm', 1
WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name = 'student');

INSERT INTO tRole (name, description, is_active)
SELECT 'teacher', 'Giáo viên chủ nhiệm - Quản lý lớp học, duyệt đơn nghỉ phép cấp 1, theo dõi KTX và nhà ăn', 1
WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name = 'teacher');

INSERT INTO tRole (name, description, is_active)
SELECT 'manager', 'Ban Giám Hiệu - Toàn quyền quản trị hệ thống và phê duyệt tối hậu', 1
WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name = 'manager');

INSERT INTO tRole (name, description, is_active)
SELECT 'dorm_manager', 'Quản lý Ký túc xá - Quản lý phòng ở, điểm danh phòng, chấm điểm nề nếp KTX và duyệt đơn ra ngoài', 1
WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name = 'dorm_manager');

INSERT INTO tRole (name, description, is_active)
SELECT 'canteen_manager', 'Quản lý Nhà ăn - Chấm cơm, lập thực đơn tuần và thống kê suất ăn', 1
WHERE NOT EXISTS (SELECT 1 FROM tRole WHERE name = 'canteen_manager');

-- Chuyển tài khoản cũ (nếu còn role guard/guardian) về dorm_manager trước khi xóa role bảo vệ
SET @dorm_role_id = (SELECT id FROM tRole WHERE name = 'dorm_manager' LIMIT 1);
UPDATE tAccount
SET role_id = @dorm_role_id
WHERE role_id IN (SELECT id FROM tRole WHERE name IN ('guard', 'guardian'));

DELETE FROM tRole WHERE name IN ('guard', 'guardian');

-- Cập nhật mô tả chuẩn cho 5 vai trò
UPDATE tRole SET description = 'Học sinh nội trú - Xem thẻ, tạo đơn nghỉ phép, xem lỗi vi phạm và báo cơm', is_active = 1 WHERE name = 'student';
UPDATE tRole SET description = 'Giáo viên chủ nhiệm - Quản lý lớp học, duyệt đơn nghỉ phép cấp 1, theo dõi KTX và nhà ăn', is_active = 1 WHERE name = 'teacher';
UPDATE tRole SET description = 'Ban Giám Hiệu - Toàn quyền quản trị hệ thống và phê duyệt tối hậu', is_active = 1 WHERE name = 'manager';
UPDATE tRole SET description = 'Quản lý Ký túc xá - Quản lý phòng ở, điểm danh phòng, chấm điểm nề nếp KTX và duyệt đơn ra ngoài', is_active = 1 WHERE name = 'dorm_manager';
UPDATE tRole SET description = 'Quản lý Nhà ăn - Chấm cơm, lập thực đơn tuần và thống kê suất ăn', is_active = 1 WHERE name = 'canteen_manager';

-- 3. Dọn dữ liệu cắt cơm cũ từng gắn với lịch sử ra vào (nếu có)
UPDATE tMealAttendance
SET is_cut = 0, note = NULL
WHERE note LIKE '%lịch sử ra vào%' AND reason_leave_id IS NULL;
