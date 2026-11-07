import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { UserAccountServer, AuditLogItem, DatabaseSchema } from './database';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseClient: SupabaseClient | null = null;
let connectionVerified = false;
let lastConnectionAttempt = 0;
let lastConnectionError: string | null = null;

/**
 * Đã tắt tính năng đẩy Supabase để chuyển sang hệ sinh thái Google Drive
 */
export function isSupabaseConfigured(): boolean {
  return false;
}

/**
 * Khởi tạo hoặc lấy client Supabase dạng singleton
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabaseClient) {
    try {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    } catch (err: any) {
      console.error('[Supabase] Lỗi khởi tạo client:', err?.message || err);
      return null;
    }
  }

  return supabaseClient;
}

/**
 * Kiểm tra kết nối tới Supabase
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY trong file .env'
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Không thể tạo kết nối Supabase client.' };
  }

  try {
    const { data, error } = await client.from('system_settings').select('key').limit(1);
    if (error) {
      lastConnectionError = error.message;
      return {
        success: false,
        message: `Lỗi kết nối Supabase: ${error.message}`,
        error: error.message
      };
    }
    connectionVerified = true;
    lastConnectionError = null;
    return {
      success: true,
      message: 'Kết nối Supabase Cloud thành công!'
    };
  } catch (err: any) {
    lastConnectionError = err?.message || String(err);
    return {
      success: false,
      message: `Ngoại lệ khi kết nối Supabase: ${lastConnectionError}`,
      error: lastConnectionError || undefined
    };
  }
}

// ==========================================
// 1. TÀI KHOẢN NGƯỜI DÙNG (USERS)
// ==========================================

export async function fetchSupabaseUsers(): Promise<UserAccountServer[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('users').select('*');
    if (error) {
      console.warn('[Supabase] Không thể tải danh sách người dùng, chuyển sang dữ liệu nội bộ:', error.message);
      return null;
    }

    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      username: row.username,
      password: row.password || '123456',
      fullName: row.full_name || row.username,
      role: row.role || 'homeroom',
      email: row.email || '',
      phone: row.phone || '',
      avatar: row.avatar || '',
      assignedClassName: row.assigned_class_name || undefined,
      subjectName: row.subject_name || undefined,
      schoolName: row.school_name || undefined,
      status: row.status || 'active',
      createdAt: row.created_at ? Number(row.created_at) : Date.now(),
      lastLoginAt: row.last_login_at ? Number(row.last_login_at) : undefined
    }));
  } catch (err) {
    console.warn('[Supabase] Ngoại lệ khi fetch users, fallback local:', err);
    return null;
  }
}

export async function upsertSupabaseUser(user: UserAccountServer): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const payload = {
      id: user.id,
      username: user.username.toLowerCase(),
      password: user.password,
      full_name: user.fullName,
      role: user.role,
      email: user.email || '',
      phone: user.phone || '',
      avatar: user.avatar || '',
      assigned_class_name: user.assignedClassName || null,
      subject_name: user.subjectName || null,
      school_name: user.schoolName || null,
      status: user.status || 'active',
      created_at: user.createdAt || Date.now(),
      last_login_at: user.lastLoginAt || null
    };

    const { error } = await client.from('users').upsert(payload, { onConflict: 'username' });
    if (error) {
      console.error('[Supabase] Lỗi khi lưu người dùng:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Supabase] Ngoại lệ khi lưu người dùng:', err);
    return false;
  }
}

export async function deleteSupabaseUser(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('users').delete().eq('id', id);
    if (error) {
      console.error('[Supabase] Lỗi khi xóa người dùng:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Supabase] Ngoại lệ khi xóa người dùng:', err);
    return false;
  }
}

// ==========================================
// 2. DỮ LIỆU LỚP HỌC (USER_CLASSROOM_DATA)
// ==========================================

export async function fetchSupabaseUserData(username: string): Promise<any | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const cleanUsername = username.trim().toLowerCase();
    const { data, error } = await client
      .from('user_classroom_data')
      .select('data')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (error) {
      console.warn(`[Supabase] Không thể tải dữ liệu lớp học cho ${cleanUsername}:`, error.message);
      return null;
    }

    return data ? data.data : null;
  } catch (err) {
    console.warn(`[Supabase] Ngoại lệ khi fetch dữ liệu lớp học cho ${username}:`, err);
    return null;
  }
}

export async function fetchAllSupabaseUserData(): Promise<Record<string, any> | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('user_classroom_data').select('username, data');
    if (error) {
      console.warn('[Supabase] Không thể tải toàn bộ dữ liệu lớp học:', error.message);
      return null;
    }

    if (!data) return {};

    const map: Record<string, any> = {};
    for (const item of data) {
      if (item.username && item.data) {
        map[item.username.toLowerCase()] = item.data;
      }
    }
    return map;
  } catch (err) {
    console.warn('[Supabase] Ngoại lệ khi tải toàn bộ dữ liệu lớp học:', err);
    return null;
  }
}

export async function saveSupabaseUserData(username: string, classroomData: any): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const cleanUsername = username.trim().toLowerCase();
    const payload = {
      username: cleanUsername,
      data: classroomData,
      updated_at: new Date().toISOString()
    };

    const { error } = await client.from('user_classroom_data').upsert(payload, { onConflict: 'username' });
    if (error) {
      console.error(`[Supabase] Lỗi khi lưu dữ liệu lớp cho ${cleanUsername}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Supabase] Ngoại lệ khi lưu dữ liệu lớp cho ${username}:`, err);
    return false;
  }
}

export async function deleteSupabaseUserData(username: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const cleanUsername = username.trim().toLowerCase();
    const { error } = await client.from('user_classroom_data').delete().eq('username', cleanUsername);
    if (error) {
      console.error(`[Supabase] Lỗi khi xóa dữ liệu lớp học cho ${cleanUsername}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Supabase] Ngoại lệ khi xóa dữ liệu lớp học cho ${username}:`, err);
    return false;
  }
}

// ==========================================
// 3. NHẬT KÝ HOẠT ĐỘNG (AUDIT LOGS)
// ==========================================

export async function fetchSupabaseAuditLogs(limit = 100): Promise<AuditLogItem[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[Supabase] Không thể lấy audit logs:', error.message);
      return null;
    }

    if (!data) return [];

    return data.map((r: any) => ({
      id: r.id,
      timestamp: Number(r.timestamp),
      username: r.username,
      userFullName: r.user_full_name,
      role: r.role,
      actionType: r.action_type,
      description: r.description,
      details: r.details
    }));
  } catch (err) {
    console.warn('[Supabase] Ngoại lệ khi lấy audit logs:', err);
    return null;
  }
}

export async function insertSupabaseAuditLog(log: AuditLogItem): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const payload = {
      id: log.id,
      timestamp: log.timestamp,
      username: log.username,
      user_full_name: log.userFullName,
      role: log.role,
      action_type: log.actionType,
      description: log.description,
      details: log.details || null
    };

    const { error } = await client.from('audit_logs').insert(payload);
    if (error) {
      console.error('[Supabase] Lỗi khi ghi audit log:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Supabase] Ngoại lệ khi ghi audit log:', err);
    return false;
  }
}

// ==========================================
// 4. DI CHUYỂN DỮ LIỆU TỰ ĐỘNG (MIGRATION)
// ==========================================

export async function migrateLocalDatabaseToSupabase(localDb: DatabaseSchema): Promise<{
  success: boolean;
  message: string;
  usersMigrated: number;
  dataEntriesMigrated: number;
  logsMigrated: number;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Không thể kết nối Supabase client. Vui lòng kiểm tra .env',
      usersMigrated: 0,
      dataEntriesMigrated: 0,
      logsMigrated: 0
    };
  }

  let usersCount = 0;
  let dataCount = 0;
  let logsCount = 0;

  try {
    // 1. Migrate users
    if (Array.isArray(localDb.users) && localDb.users.length > 0) {
      const userPayloads = localDb.users.map(u => ({
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

      const { error: userErr } = await client.from('users').upsert(userPayloads, { onConflict: 'username' });
      if (!userErr) {
        usersCount = userPayloads.length;
      } else {
        console.error('[Migration] Lỗi khi migrate users:', userErr.message);
      }
    }

    // 2. Migrate userData
    if (localDb.userData && typeof localDb.userData === 'object') {
      const dataPayloads = Object.entries(localDb.userData).map(([username, val]) => ({
        username: username.toLowerCase(),
        data: val,
        updated_at: new Date().toISOString()
      }));

      // Upsert in chunks of 5 to avoid HTTP payload size limits
      const chunkSize = 5;
      for (let i = 0; i < dataPayloads.length; i += chunkSize) {
        const chunk = dataPayloads.slice(i, i + chunkSize);
        const { error: dataErr } = await client
          .from('user_classroom_data')
          .upsert(chunk, { onConflict: 'username' });
        if (!dataErr) {
          dataCount += chunk.length;
        } else {
          // Fallback to one-by-one if chunk fails
          for (const item of chunk) {
            const { error: singleErr } = await client
              .from('user_classroom_data')
              .upsert(item, { onConflict: 'username' });
            if (!singleErr) {
              dataCount++;
            } else {
              console.error(`[Migration] Lỗi khi migrate userData cho ${item.username}:`, singleErr.message);
            }
          }
        }
      }
    }

    // 3. Migrate auditLogs
    if (Array.isArray(localDb.auditLogs) && localDb.auditLogs.length > 0) {
      const logPayloads = localDb.auditLogs.slice(-200).map(l => ({
        id: l.id,
        timestamp: l.timestamp,
        username: l.username,
        user_full_name: l.userFullName,
        role: l.role,
        action_type: l.actionType,
        description: l.description,
        details: l.details || null
      }));

      const { error: logErr } = await client.from('audit_logs').upsert(logPayloads, { onConflict: 'id' });
      if (!logErr) {
        logsCount = logPayloads.length;
      } else {
        console.error('[Migration] Lỗi khi migrate auditLogs:', logErr.message);
      }
    }

    // 4. Save system settings
    if (localDb.systemSettings) {
      await client.from('system_settings').upsert({
        key: 'global',
        settings: localDb.systemSettings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
    }

    return {
      success: true,
      message: `Đồng bộ lên Supabase thành công! (${usersCount} tài khoản, ${dataCount} bộ dữ liệu lớp học, ${logsCount} nhật ký)`,
      usersMigrated: usersCount,
      dataEntriesMigrated: dataCount,
      logsMigrated: logsCount
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi trong quá trình di chuyển dữ liệu: ${err?.message || err}`,
      usersMigrated: usersCount,
      dataEntriesMigrated: dataCount,
      logsMigrated: logsCount
    };
  }
}

// ==========================================
// 5. CẤU HÌNH HỆ THỐNG (SYSTEM SETTINGS)
// ==========================================

export async function fetchSupabaseSystemSettings(): Promise<any | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('system_settings')
      .select('settings')
      .eq('key', 'global')
      .maybeSingle();

    if (error) {
      console.warn('[Supabase] Không thể lấy cấu hình hệ thống:', error.message);
      return null;
    }

    return data ? data.settings : null;
  } catch (err) {
    console.warn('[Supabase] Ngoại lệ khi lấy system_settings:', err);
    return null;
  }
}

export async function saveSupabaseSystemSettings(settings: any): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !settings) return false;

  try {
    const { error } = await client.from('system_settings').upsert({
      key: 'global',
      settings,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

    if (error) {
      console.warn('[Supabase] Lỗi khi lưu system_settings:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] Ngoại lệ khi lưu system_settings:', err);
    return false;
  }
}

// ==========================================
// 6. PHÂN VÙNG LƯU TRỮ SUPABASE (PARTITION STORAGE)
// ==========================================

export type PartitionKey = 'ca_nhan' | 'nha_truong' | 'truong_demo' | 'quan_tri_admin';

export async function saveSupabasePartitionData(partition: PartitionKey, partitionData: any): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !partitionData) return false;

  try {
    const key = `partition_${partition}`;
    const payload = {
      key,
      settings: partitionData,
      updated_at: new Date().toISOString()
    };

    const { error } = await client.from('system_settings').upsert(payload, { onConflict: 'key' });
    if (error) {
      console.warn(`[Supabase] Không thể lưu phân vùng ${partition}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[Supabase] Ngoại lệ khi lưu phân vùng ${partition}:`, err);
    return false;
  }
}

export async function fetchSupabasePartitionData(partition: PartitionKey): Promise<any | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const key = `partition_${partition}`;
    const { data, error } = await client
      .from('system_settings')
      .select('settings')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.warn(`[Supabase] Không thể tải phân vùng ${partition}:`, error.message);
      return null;
    }

    return data ? data.settings : null;
  } catch (err) {
    console.warn(`[Supabase] Ngoại lệ khi tải phân vùng ${partition}:`, err);
    return null;
  }
}

export async function syncAllPartitionsToSupabase(partitions: {
  ca_nhan?: any;
  nha_truong?: any;
  truong_demo?: any;
  quan_tri_admin?: any;
}): Promise<{ success: boolean; details: Record<string, boolean> }> {
  const details: Record<string, boolean> = {};
  let allSuccess = true;

  for (const [part, data] of Object.entries(partitions)) {
    if (data) {
      const ok = await saveSupabasePartitionData(part as PartitionKey, data);
      details[part] = ok;
      if (!ok) allSuccess = false;
    }
  }

  return { success: allSuccess, details };
}

