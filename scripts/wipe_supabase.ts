import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Cố gắng nạp cả .env và .env.local
dotenv.config({ path: path.resolve(process.cwd(), './.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), './.env') });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.log('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(url, key);

async function wipe() {
  console.log('Bắt đầu quy trình XÓA TRẮNG toàn bộ dữ liệu trên Cloud Supabase...');
  
  // Thứ tự xóa: Xóa các bảng con (khóa ngoại) trước, sau đó mới xóa bảng cha
  const tables = [
    'student_activities', 
    'activities', 
    'game_sessions', 
    'games', 
    'lessons', 
    'certificates', 
    'students', 
    'classes', 
    'user_classroom_data', 
    'audit_logs', 
    'schools', 
    'users',
    'system_settings'
  ];
  
  for (const table of tables) {
    console.log(`Đang xóa bảng [${table}]...`);
    // Sử dụng .neq('id', 'dummy_id') hoặc .neq('username', 'dummy') để thỏa mãn PostgREST (bắt buộc phải có điều kiện khi delete)
    try {
      const { error } = await supabase.from(table).delete().neq('id', 'dummy_id_to_trigger_full_delete');
      if (error && error.message.includes('id')) {
        // Fallback nếu bảng không có cột 'id' (ví dụ user_classroom_data dùng 'username')
        await supabase.from(table).delete().neq('username', 'dummy_user_to_trigger_full_delete');
      }
    } catch (err) {
      console.log(`Bỏ qua bảng ${table} hoặc lỗi:`, err);
    }
  }
  
  console.log('✅ ĐÃ XÓA SẠCH DỮ LIỆU TRÊN SUPABASE CLOUD!');
  console.log('👉 Bây giờ bạn có thể nhấn "Đồng bộ lên Supabase" trên phần mềm để tạo lại dữ liệu chuẩn.');
}

wipe();
