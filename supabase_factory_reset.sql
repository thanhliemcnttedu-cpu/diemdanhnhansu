-- ==============================================================================
-- 🚀 LỚP HỌC HẠNH PHÚC v4.0 - FACTORY RESET & SUPABASE CLEAN SLATE SCRIPT
-- ==============================================================================
-- 🎯 Mục đích: Khôi phục cài đặt gốc CSDL Supabase chuẩn bị GO-LIVE.
-- 🛡️ Quy tắc:
--   1. Xóa an toàn theo thứ tự Foreign Key (Học sinh -> Lớp học -> Người dùng -> Trường học).
--   2. CHỈ GIỮ LẠI DUY NHẤT 01 TÀI KHOẢN: 'adminquantri'.
--   3. Xóa sạch 100% dữ liệu lớp học, học sinh, bucket JSON, trường học và tài khoản khác.
--   4. Bảo toàn bảng hệ thống (system_settings, audit_logs cấu trúc, registration_requests).
-- ==============================================================================

BEGIN;

-- 1. XÓA TOÀN BỘ HỌC SINH (Bảng lá chứa khóa ngoại trỏ tới classes và schools)
DELETE FROM public.students;

-- 2. XÓA TOÀN BỘ LỚP HỌC (Bảng chứa khóa ngoại trỏ tới schools)
DELETE FROM public.classes;

-- 3. XÓA DỮ LIỆU LƯU TRỮ LỚP HỌC THEO USER (user_classroom_data)
-- Giữ lại hoặc tạo mới snapshot trống cho adminquantri
DELETE FROM public.user_classroom_data 
WHERE LOWER(username) != 'adminquantri';

-- Khởi tạo bucket dữ liệu sạch cho adminquantri
INSERT INTO public.user_classroom_data (username, data, updated_at)
VALUES (
    'adminquantri', 
    '{"classes": [], "students": [], "attendanceRecords": [], "boardingRecords": [], "transactions": [], "updatedAt": 0}'::jsonb, 
    NOW()
)
ON CONFLICT (username) DO UPDATE SET
    data = '{"classes": [], "students": [], "attendanceRecords": [], "boardingRecords": [], "transactions": [], "updatedAt": 0}'::jsonb,
    updated_at = NOW();

-- 4. XÓA TOÀN BỘ TÀI KHOẢN NGƯỜI DÙNG - NGOẠI TRỪ 'adminquantri'
-- Đầu tiên ngắt liên kết school_id của adminquantri (nếu có) để tránh lỗi Foreign Key khi xóa trường
UPDATE public.users 
SET school_id = NULL, school_name = 'Hệ thống Quản trị Lớp học Hạnh phúc'
WHERE LOWER(username) = 'adminquantri';

-- Xóa tất cả các tài khoản khác
DELETE FROM public.users 
WHERE LOWER(username) != 'adminquantri';

-- Đảm bảo tài khoản adminquantri tồn tại với đầy đủ đặc quyền tối cao
INSERT INTO public.users (
    id, 
    username, 
    password, 
    full_name, 
    role, 
    email, 
    phone, 
    avatar, 
    school_name, 
    school_id,
    status, 
    max_students_allowed
) VALUES (
    'user-adminquantri-supreme',
    'adminquantri',
    'Tanuyen@2026',
    'Quản trị viên Hệ thống Cấp cao',
    'admin',
    'adminquantri@lophochanhphuc.edu.vn',
    '0888358363',
    'https://api.dicebear.com/7.x/bottts/svg?seed=AdminQuanTriBoss&backgroundColor=d1d4f9',
    'Hệ thống Quản trị Lớp học Hạnh phúc',
    NULL,
    'active',
    9999
)
ON CONFLICT (username) DO UPDATE SET
    password = 'Tanuyen@2026',
    role = 'admin',
    status = 'active',
    school_id = NULL,
    updated_at = NOW();

-- 5. XÓA TOÀN BỘ CƠ SỞ DỮ LIỆU TRƯỜNG HỌC (schools)
DELETE FROM public.schools;

-- 6. GHI NHẬT KÝ HOẠT ĐỘNG AUDIT LOG
INSERT INTO public.audit_logs (
    id,
    timestamp,
    username,
    user_full_name,
    role,
    action_type,
    description,
    created_at
) VALUES (
    'log-factory-reset-' || floor(extract(epoch from now()) * 1000)::text,
    floor(extract(epoch from now()) * 1000)::bigint,
    'adminquantri',
    'Quản trị viên Hệ thống Cấp cao',
    'admin',
    'FACTORY_RESET',
    'Khôi phục cài đặt gốc toàn hệ thống: Xóa toàn bộ Trường học, Học sinh, Lớp học và Người dùng. Bảo toàn duy nhất tài khoản adminquantri.',
    NOW()
);

COMMIT;

-- ==============================================================================
-- 7. KIỂM TRA TỔNG QUAN TRẠNG THÁI SAU KHI DỌN DẸP (VERIFICATION QUERY)
-- ==============================================================================
SELECT 
    (SELECT COUNT(*) FROM public.schools) AS tong_so_truong,
    (SELECT COUNT(*) FROM public.classes) AS tong_so_lop,
    (SELECT COUNT(*) FROM public.students) AS tong_so_hoc_sinh,
    (SELECT COUNT(*) FROM public.users) AS tong_so_tai_khoan,
    (SELECT username FROM public.users LIMIT 1) AS tai_khoan_duy_nhat;
