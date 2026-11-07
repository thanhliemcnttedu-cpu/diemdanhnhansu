import { getSupabaseClient } from '../server/supabase';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function run() {
  const client = getSupabaseClient();
  if (!client) {
    console.error('Khong the ket noi Supabase client. Vui long kiem tra .env');
    process.exit(1);
  }

  // 1. Dọn sạch keys rác trong data/classroom_database.json
  const dbPath = path.join(ROOT_DIR, 'data', 'classroom_database.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const validUsernames = new Set(db.users.map((u: any) => u.username.toLowerCase()));
  
  const staleUserDataKeys = Object.keys(db.userData || {}).filter(k => !validUsernames.has(k.toLowerCase()));
  console.log('Phat hien va loai bo cac keys rac trong local userData:', staleUserDataKeys);
  for (const k of staleUserDataKeys) {
    delete db.userData[k];
  }
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  console.log('Da lam sach data/classroom_database.json tren Localhost!');

  // 2. Xóa trắng dữ liệu cũ trên Supabase
  console.log('Dang lam sach toan bo cac bang tren Supabase Cloud...');
  
  // Xóa user_classroom_data
  const { error: err1 } = await client.from('user_classroom_data').delete().neq('username', '___DUMMY_NEVER_MATCH___');
  if (err1) console.error('Loi xoa user_classroom_data:', err1.message);
  else console.log('✓ Da xoa sach toan bo user_classroom_data tren Supabase.');

  // Xóa users
  const { error: err2 } = await client.from('users').delete().neq('username', '___DUMMY_NEVER_MATCH___');
  if (err2) console.error('Loi xoa users:', err2.message);
  else console.log('✓ Da xoa sach toan bo users tren Supabase.');

  // Xóa audit_logs
  const { error: err3 } = await client.from('audit_logs').delete().neq('id', '___DUMMY_NEVER_MATCH___');
  if (err3) console.error('Loi xoa audit_logs:', err3.message);
  else console.log('✓ Da xoa sach toan bo audit_logs tren Supabase.');

  // 3. Nạp lại 100% dữ liệu chuẩn từ Localhost lên Supabase
  console.log('Bat dau dua toan bo du lieu chuan tu Localhost len Supabase...');

  // 3.1 Users
  const userPayloads = db.users.map((u: any) => ({
    id: u.id,
    username: u.username.toLowerCase(),
    password: u.password || '123456',
    full_name: u.fullName,
    role: u.role,
    email: u.email || '',
    phone: u.phone || '',
    avatar: u.avatar || '',
    assigned_class_name: u.assignedClassName || null,
    subject_name: u.subjectName || null,
    school_name: u.schoolName || null,
    status: u.status || 'active',
    created_at: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString()
  }));

  const { error: uErr } = await client.from('users').upsert(userPayloads);
  if (uErr) {
    console.error('Loi nap users:', uErr.message);
  } else {
    console.log(`✓ Da nap thanh cong ${userPayloads.length} users chuan len Supabase!`);
  }

  // 3.2 User Classroom Data (theo từng chunk 5 để chống tràn payload)
  const dataPayloads = Object.entries(db.userData).map(([username, val]) => ({
    username: username.toLowerCase(),
    data: val,
    updated_at: new Date().toISOString()
  }));

  let successCount = 0;
  for (let i = 0; i < dataPayloads.length; i += 5) {
    const chunk = dataPayloads.slice(i, i + 5);
    const { error: dErr } = await client.from('user_classroom_data').upsert(chunk);
    if (!dErr) {
      successCount += chunk.length;
    } else {
      for (const item of chunk) {
        const { error: sErr } = await client.from('user_classroom_data').upsert(item);
        if (!sErr) successCount++;
        else console.error(`Loi nap userData ${item.username}:`, sErr.message);
      }
    }
  }
  console.log(`✓ Da nap thanh cong ${successCount}/${dataPayloads.length} bo du lieu lop hoc len Supabase!`);

  // 3.3 Audit logs
  if (Array.isArray(db.auditLogs) && db.auditLogs.length > 0) {
    const logPayloads = db.auditLogs.slice(-200).map((l: any) => ({
      id: l.id,
      timestamp: l.timestamp,
      username: l.username,
      user_full_name: l.userFullName,
      role: l.role,
      action_type: l.actionType,
      description: l.description,
      details: l.details || null
    }));
    await client.from('audit_logs').upsert(logPayloads);
    console.log(`✓ Da nap thanh cong ${logPayloads.length} nhat ky hoat dong len Supabase!`);
  }

  // 3.4 System settings
  if (db.systemSettings) {
    await client.from('system_settings').upsert({
      key: 'global',
      settings: db.systemSettings,
      updated_at: new Date().toISOString()
    });
    console.log('✓ Da nap system_settings len Supabase!');
  }

  // 4. Kiểm tra lại dữ liệu cuối cùng trên Supabase
  const { data: finalUsers } = await client.from('users').select('username');
  const { data: finalData } = await client.from('user_classroom_data').select('username');
  console.log('==============================================');
  console.log('=== KIEM DINH KET QUA CUOI CUNG TREN SUPABASE ===');
  console.log('==============================================');
  console.log(`- Tong so Users tren Supabase: ${finalUsers?.length} (Localhost: ${db.users.length})`);
  console.log(`- Tong so User Classroom Data: ${finalData?.length} (Localhost: ${Object.keys(db.userData).length})`);
  const isMatch = finalUsers?.length === db.users.length && finalData?.length === Object.keys(db.userData).length;
  console.log(`- Khop 100% tuyet doi: ${isMatch ? 'DUNG' : 'SAI'}`);
}

run().catch(console.error);
