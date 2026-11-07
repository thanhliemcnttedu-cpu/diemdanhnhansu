-- ==============================================================================
-- 🚀 LỚP HỌC HẠNH PHÚC v4.0 - SUPABASE SCHEMA & SAAS INITIALIZATION (GO-LIVE)
-- ==============================================================================
-- Hướng dẫn: Mở Supabase Studio -> SQL Editor -> Tạo truy vấn mới -> Paste toàn bộ nội dung này và ấn RUN.
-- Kịch bản này thiết lập đầy đủ các bảng, RLS, chỉ mục, realtime và nạp dữ liệu khởi tạo sạch.

-- 1. BẬT TIỆN ÍCH EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. ĐỊNH NGHĨA CÁC BẢNG DỮ LIỆU CỐT LÕI (CORE TABLES)
-- ==============================================================================

-- 2.1. Bảng quản lý Trường học (Multi-tenant Schools)
CREATE TABLE IF NOT EXISTS public.schools (
    id TEXT PRIMARY KEY DEFAULT ('sch-' || floor(extract(epoch from now()) * 1000)::text),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    tenant_type TEXT DEFAULT 'formal', -- 'formal' | 'demo' | 'trial'
    academic_year TEXT DEFAULT '2025-2026',
    address TEXT,
    principal_name TEXT,
    phone TEXT,
    status TEXT DEFAULT 'active', -- 'active' | 'suspended'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2. Bảng quản lý Người dùng & Phân quyền (Users & IAM)
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY DEFAULT ('user-' || floor(extract(epoch from now()) * 1000)::text),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL, -- 'admin' | 'guest_admin' | 'school_admin' | 'bgh' | 'homeroom' | 'subject'
    email TEXT,
    phone TEXT,
    avatar TEXT,
    school_name TEXT,
    school_id TEXT REFERENCES public.schools(id) ON DELETE SET NULL,
    assigned_class_name TEXT,
    subject_name TEXT,
    max_students_allowed INTEGER DEFAULT 45,
    is_demo BOOLEAN DEFAULT FALSE,
    is_bgh BOOLEAN DEFAULT FALSE,
    is_school_admin BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3. Bảng lưu trữ Dữ liệu Lớp học theo User (JSON Data Bucket)
CREATE TABLE IF NOT EXISTS public.user_classroom_data (
    username TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4. Bảng Lớp học (Classes Relational View)
CREATE TABLE IF NOT EXISTS public.classes (
    id TEXT PRIMARY KEY DEFAULT ('class-' || floor(extract(epoch from now()) * 1000)::text),
    name TEXT NOT NULL,
    grade TEXT,
    academic_year TEXT DEFAULT '2025-2026',
    teacher_name TEXT,
    teacher_username TEXT,
    teacher_id TEXT,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    school_name TEXT,
    color TEXT DEFAULT '#4F46E5',
    slogan TEXT,
    branch TEXT,
    campus TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.5. Bảng Học sinh (Students Relational View)
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY DEFAULT ('hs-' || floor(extract(epoch from now()) * 1000)::text),
    stt INTEGER DEFAULT 1,
    name TEXT NOT NULL,
    gender TEXT DEFAULT 'Nam',
    birth_date TEXT,
    class_id TEXT REFERENCES public.classes(id) ON DELETE CASCADE,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    school_name TEXT,
    teacher_id TEXT,
    points INTEGER DEFAULT 0,
    avatar TEXT,
    group_name TEXT,
    roles JSONB DEFAULT '[]'::jsonb,
    subject_points JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.6. Bảng Cài đặt Hệ thống (System Settings)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.7. Bảng Nhật ký Hoạt động (Audit Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT ('log-' || floor(extract(epoch from now()) * 1000)::text),
    timestamp BIGINT NOT NULL,
    username TEXT NOT NULL,
    user_full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.8. Bảng Yêu cầu Đăng ký SaaS / Trường học (Registration Requests)
CREATE TABLE IF NOT EXISTS public.registration_requests (
    id TEXT PRIMARY KEY DEFAULT ('reg-' || floor(extract(epoch from now()) * 1000)::text),
    school_name TEXT NOT NULL,
    representative_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    package_type TEXT DEFAULT 'standard',
    status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. TẠO INDEXES TỐI ƯU HIỆU NĂNG TRUY VẤN
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_school_id ON public.users(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_username ON public.classes(teacher_username);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);

-- ==============================================================================
-- 4. KÍCH HOẠT ROW LEVEL SECURITY (RLS) & PUBLIC ACCESS POLICIES
-- ==============================================================================
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_classroom_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;

-- Tạo các Policy toàn quyền truy cập cho Anon/Authenticated (Client-side adapter pattern)
DO $$
BEGIN
    -- schools
    DROP POLICY IF EXISTS "Public Full Access Schools" ON public.schools;
    CREATE POLICY "Public Full Access Schools" ON public.schools FOR ALL USING (true) WITH CHECK (true);

    -- users
    DROP POLICY IF EXISTS "Public Full Access Users" ON public.users;
    CREATE POLICY "Public Full Access Users" ON public.users FOR ALL USING (true) WITH CHECK (true);

    -- user_classroom_data
    DROP POLICY IF EXISTS "Public Full Access Classroom Data" ON public.user_classroom_data;
    CREATE POLICY "Public Full Access Classroom Data" ON public.user_classroom_data FOR ALL USING (true) WITH CHECK (true);

    -- classes
    DROP POLICY IF EXISTS "Public Full Access Classes" ON public.classes;
    CREATE POLICY "Public Full Access Classes" ON public.classes FOR ALL USING (true) WITH CHECK (true);

    -- students
    DROP POLICY IF EXISTS "Public Full Access Students" ON public.students;
    CREATE POLICY "Public Full Access Students" ON public.students FOR ALL USING (true) WITH CHECK (true);

    -- system_settings
    DROP POLICY IF EXISTS "Public Full Access System Settings" ON public.system_settings;
    CREATE POLICY "Public Full Access System Settings" ON public.system_settings FOR ALL USING (true) WITH CHECK (true);

    -- audit_logs
    DROP POLICY IF EXISTS "Public Full Access Audit Logs" ON public.audit_logs;
    CREATE POLICY "Public Full Access Audit Logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

    -- registration_requests
    DROP POLICY IF EXISTS "Public Full Access Registration Requests" ON public.registration_requests;
    CREATE POLICY "Public Full Access Registration Requests" ON public.registration_requests FOR ALL USING (true) WITH CHECK (true);
END $$;

-- ==============================================================================
-- 5. KÍCH HOẠT REALTIME REPLICATION (BẮT BUỘC CHO ĐỒNG BỘ THỜI GIAN THỰC)
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'user_classroom_data'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.user_classroom_data;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'users'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'classes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.classes;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'students'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Bỏ qua gán realtime nếu publication chưa được khởi tạo: %', SQLERRM;
END $$;

-- ==============================================================================
-- 6. DỌN SẠCH VÀ NẠP DỮ LIỆU KHỞI TẠO CHUẨN GO-LIVE (SEEDS)
-- ==============================================================================
-- 6.1. Xóa sạch dữ liệu trường cũ tạm thời (bảo toàn cấu trúc)
-- 6.1. Dọn dẹp dữ liệu cũ nếu có
TRUNCATE TABLE public.students CASCADE;
TRUNCATE TABLE public.classes CASCADE;
TRUNCATE TABLE public.users CASCADE;
TRUNCATE TABLE public.schools CASCADE;
TRUNCATE TABLE public.user_classroom_data CASCADE;

-- 6.3. Nạp Tài khoản Quản trị Cấp cao TỐI CAO (adminquantri - Tanuyen@2026)
INSERT INTO public.users (
    id, username, password, full_name, role, email, phone, avatar, school_name, status, max_students_allowed
) VALUES (
    'user-adminquantri-supreme',
    'adminquantri',
    'Tanuyen@2026',
    'Quản trị viên Hệ thống Cấp cao',
    'admin',
    'adminquantri@lophochanhphuc.edu.vn',
    '0900000001',
    'https://api.dicebear.com/7.x/bottts/svg?seed=adminquantri',
    'HỆ THỐNG TRUNG TÂM TOÀN QUỐC',
    'active',
    9999
)
ON CONFLICT (username) DO UPDATE SET
    password = EXCLUDED.password,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    status = 'active',
    updated_at = NOW();

-- 6.4. Nạp Cài đặt Hệ thống Mặc định
INSERT INTO public.system_settings (key, value, description)
VALUES 
    ('system_version', '{"version": "4.0.0", "build": "2026.10", "environment": "production"}'::jsonb, 'Phiên bản hệ thống Lớp Học Hạnh Phúc'),
    ('global_announcement', '{"active": false, "message": "Chào mừng đến với phần mềm Quản lý Lớp Học Hạnh Phúc v4.0!"}'::jsonb, 'Thông báo toàn hệ thống')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

-- Hoàn tất thiết lập
SELECT '🚀 CSDL SUPABASE SẴN SÀNG CHO GO-LIVE V4.0 (SAAS MODE) THÀNH CÔNG!' AS status_message;
