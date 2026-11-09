import { UserAccount, SchoolEntity } from '../types';
import { googleDriveService } from './googleDriveService';

/**
 * 🏫 CƠ SỞ DỮ LIỆU NHÀ TRƯỜNG TRÊN GOOGLE DRIVE (Apps Script V4: csdl_truong.json)
 *
 * - Danh sách trường + tài khoản lưu trong thư mục Drive dùng chung, mật khẩu băm tại Apps Script.
 * - Đăng nhập BGH / giáo viên / quản trị trường được kiểm tra tại Apps Script.
 * - Chỉ Quản trị (admin / school_admin) ghi được CSDL; mật khẩu Quản trị của phiên hiện tại được giữ
 *   trong sessionStorage (mất khi đóng tab) để ký các lần ghi.
 * - Mật khẩu vừa cấp cho tài khoản mới chỉ giữ tạm trên máy Quản trị (sessionStorage) để xuất Excel.
 */

const USERS_KEY = 'LHHP_USERS';
const SCHOOLS_KEY = 'lop_hoc_schools_list_v1';
const ADMIN_SECRET_KEY = 'lhhp_admin_session_auth';
const PENDING_PASSWORDS_KEY = 'lhhp_pending_passwords';
const ISSUED_CREDENTIALS_KEY = 'lhhp_issued_credentials';
const DRIVE_SCHOOLS_CACHE_KEY = 'lhhp_drive_schools_cache';
const PENDING_DELETES_KEY = 'lhhp_pending_deletes';
const DIRTY_KEY = 'lhhp_drive_dirty';

export type DriveLoginResult =
  | { status: 'ok'; user: UserAccount; schools: SchoolEntity[] }
  | { status: 'invalid' | 'disabled'; message: string }
  | { status: 'not_initialized' | 'not_configured' | 'unreachable'; message: string };

const readJson = <T,>(storage: Storage | undefined, key: string, fallback: T): T => {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (_) {
    return fallback;
  }
};

const writeJson = (storage: Storage | undefined, key: string, value: unknown) => {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch (_) {}
};

const local = typeof window !== 'undefined' ? window.localStorage : undefined;
const session = typeof window !== 'undefined' ? window.sessionStorage : undefined;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncError = '';
const syncListeners = new Set<(s: { status: 'idle' | 'syncing' | 'success' | 'error'; message?: string }) => void>();

export const schoolDriveDbService = {
  /**
   * 🧹 Dữ liệu trên trình duyệt chỉ thuộc về MỘT thư mục dùng chung. Lần đầu máy dùng thư mục này
   * (hoặc vừa đổi sang thư mục khác): xóa bộ nhớ đệm lớp học + danh sách tài khoản/trường cũ
   * (từ các phiên bản trước / trường khác) để không bị nạp nhầm rồi đẩy đè lên Drive.
   * Phiên đăng nhập hiện tại và cấu hình Drive được giữ nguyên.
   */
  ensureCacheOwnership(): boolean {
    if (!this.isConfigured() || !local) return false;
    const folderId = (googleDriveService.getConfig().folderId || '').trim();
    const OWNER_KEY = 'lhhp_cache_owner_folder';
    if (local.getItem(OWNER_KEY) === folderId) return false;
    try {
      Object.keys(local).forEach(k => {
        if (k.startsWith('lop_hoc_user_db_') || k === USERS_KEY || k === SCHOOLS_KEY || k === DRIVE_SCHOOLS_CACHE_KEY) {
          local.removeItem(k);
        }
      });
      local.setItem(OWNER_KEY, folderId);
    } catch (_) {}
    return true;
  },

  /** Số tài khoản / trường Quản trị vừa tạo, sửa nhưng CHƯA lưu được lên Drive */
  getUnsyncedCount(): number {
    const d = readJson<{ users: string[]; schools: string[] }>(session, DIRTY_KEY, { users: [], schools: [] });
    const del = readJson<{ users: string[]; schools: string[] }>(session, PENDING_DELETES_KEY, { users: [], schools: [] });
    return d.users.length + d.schools.length + del.users.length + del.schools.length;
  },
  getLastSyncError(): string {
    return lastSyncError;
  },

  /** Đã khai báo thư mục dùng chung + mã kết nối Apps Script trên máy này chưa */
  isConfigured(): boolean {
    const cfg = googleDriveService.getConfig();
    return Boolean(googleDriveService.normalizeScriptUrl(cfg.scriptUrl) && (cfg.folderId || '').trim());
  },

  async callScript(body: Record<string, unknown>, timeoutMs = 25000): Promise<any> {
    const cfg = googleDriveService.getConfig();
    const scriptUrl = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
    if (!scriptUrl) throw new Error('NOT_CONFIGURED');
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // text/plain = "simple request" → Apps Script nhận được mà không cần preflight CORS
      const res = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ folderId: cfg.folderId || '', ...body }),
        signal: controller.signal
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (_) {
        if (/accounts\.google\.com|ServiceLogin/i.test(text)) {
          throw new Error('Apps Script chưa mở quyền "Bất kỳ ai" (Anyone).');
        }
        throw new Error('Apps Script trả về nội dung không hợp lệ.');
      }
    } finally {
      clearTimeout(t);
    }
  },

  /** Danh sách trường (công khai) từ CSDL trên Drive — dùng cho màn hình đăng nhập */
  async listSchools(): Promise<{ success: boolean; initialized: boolean; schools: SchoolEntity[]; message?: string }> {
    const cfg = googleDriveService.getConfig();
    const scriptUrl = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
    if (!scriptUrl) return { success: false, initialized: false, schools: [], message: 'NOT_CONFIGURED' };
    try {
      const res = await fetch(`${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=listSchools&folderId=${encodeURIComponent(cfg.folderId || '')}`);
      const data = JSON.parse(await res.text());
      if (!data?.success) {
        return { success: false, initialized: false, schools: [], message: data?.message || 'Apps Script chưa hỗ trợ CSDL nhà trường (cần mã V4).' };
      }
      const schools: SchoolEntity[] = (data.schools || []).map((s: any) => ({
        id: s.id || `school-${s.name}`,
        name: s.name,
        code: s.code || ''
      })) as SchoolEntity[];
      writeJson(local, DRIVE_SCHOOLS_CACHE_KEY, { schools, initialized: Boolean(data.initialized), at: Date.now() });
      // Đưa danh sách trường vào bộ nhớ máy để các màn hình cũ dùng được
      this.mergeLocalSchools(schools);
      return { success: true, initialized: Boolean(data.initialized), schools };
    } catch (err: any) {
      const cached = readJson<{ schools: SchoolEntity[]; initialized: boolean } | null>(local, DRIVE_SCHOOLS_CACHE_KEY, null);
      if (cached) return { success: true, initialized: cached.initialized, schools: cached.schools, message: 'offline-cache' };
      return { success: false, initialized: false, schools: [], message: err?.message || 'Không kết nối được Apps Script.' };
    }
  },

  async login(username: string, password: string): Promise<DriveLoginResult> {
    if (!this.isConfigured()) return { status: 'not_configured', message: 'Chưa cấu hình thư mục dùng chung.' };
    try {
      const data = await this.callScript({ action: 'login', username, password });
      if (data?.success && data.user) {
        const user: UserAccount = {
          ...data.user,
          id: data.user.id || `user-${String(data.user.username).toLowerCase()}`,
          fullName: data.user.fullName || data.user.username,
          status: data.user.status || 'active',
          createdAt: data.user.createdAt || Date.now()
        };
        this.upsertLocalUsers([user]);
        if (Array.isArray(data.schools)) this.mergeLocalSchools(data.schools);
        if (user.role === 'admin' || user.role === 'school_admin' || user.isSchoolAdmin) {
          this.rememberAdminAuth(user.username, password);
        }
        if (user.role === 'admin' || user.role === 'school_admin' || user.isSchoolAdmin || user.role === 'bgh' || user.isBgh) {
          try { sessionStorage.setItem('lhhp_staff_viewer_auth', JSON.stringify({ username: user.username.trim().toLowerCase(), password })); } catch (_) { /* ignore */ }
        }
        return { status: 'ok', user, schools: data.schools || [] };
      }
      const code = String(data?.code || '');
      if (code === 'NOT_INITIALIZED') return { status: 'not_initialized', message: data.message };
      if (code === 'DISABLED') return { status: 'disabled', message: data.message };
      if (code === 'NOT_FOUND') {
        return { status: 'invalid', message: `Tài khoản "${username}" chưa có trong cơ sở dữ liệu nhà trường trên Google Drive. Quản trị kiểm tra lại tài khoản đã được lưu lên Drive chưa.` };
      }
      if (code === 'INVALID') return { status: 'invalid', message: 'Sai mật khẩu. Hãy nhập đúng mật khẩu Quản trị đã cấp (hoặc mật khẩu bạn đã tự đổi).' };
      // Apps Script cũ (chưa có V4) trả "Hành động không hợp lệ"
      return { status: 'unreachable', message: data?.message || 'Apps Script chưa hỗ trợ đăng nhập (cần mã V4).' };
    } catch (err: any) {
      return { status: 'unreachable', message: err?.message || 'Không kết nối được Google Drive.' };
    }
  },

  async changePassword(username: string, oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const data = await this.callScript({ action: 'changePassword', username, oldPassword, newPassword });
      if (data?.success) {
        const auth = this.getAdminAuth();
        if (auth && auth.username === username.trim().toLowerCase()) this.rememberAdminAuth(username, newPassword);
        this.upsertLocalUsers([{ ...(data.user || {}), username: username.trim().toLowerCase(), mustChangePassword: false } as UserAccount]);
        return { success: true, message: data.message || 'Đã đổi mật khẩu thành công.' };
      }
      return { success: false, message: data?.message || 'Không đổi được mật khẩu.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Không kết nối được Google Drive.' };
    }
  },

  // ---------------- Phiên Quản trị (ký các lần ghi CSDL) ----------------
  rememberAdminAuth(username: string, password: string) {
    writeJson(session, ADMIN_SECRET_KEY, { username: username.trim().toLowerCase(), password });
  },
  getAdminAuth(): { username: string; password: string } | null {
    return readJson(session, ADMIN_SECRET_KEY, null);
  },
  clearSession() {
    try {
      session?.removeItem(ADMIN_SECRET_KEY);
      session?.removeItem(PENDING_PASSWORDS_KEY);
      session?.removeItem(PENDING_DELETES_KEY);
      session?.removeItem(DIRTY_KEY);
    } catch (_) {}
  },

  // ---------------- Mật khẩu vừa cấp (chỉ trên máy Quản trị) ----------------
  /** Đánh dấu tài khoản / trường vừa được Quản trị tạo hoặc sửa — chỉ những mục này được gửi lên Drive */
  markUserDirty(username: string) {
    const d = readJson<{ users: string[]; schools: string[] }>(session, DIRTY_KEY, { users: [], schools: [] });
    const key = String(username || '').trim().toLowerCase();
    if (key && !d.users.includes(key)) d.users.push(key);
    writeJson(session, DIRTY_KEY, d);
  },
  markSchoolDirty(idOrName: string) {
    const d = readJson<{ users: string[]; schools: string[] }>(session, DIRTY_KEY, { users: [], schools: [] });
    const key = String(idOrName || '').trim();
    if (key && !d.schools.includes(key)) d.schools.push(key);
    writeJson(session, DIRTY_KEY, d);
  },

  setPendingPassword(username: string, password: string) {
    const key = username.trim().toLowerCase();
    if (!key || !password) return;
    this.markUserDirty(key);
    const pending = readJson<Record<string, string>>(session, PENDING_PASSWORDS_KEY, {});
    pending[key] = password;
    writeJson(session, PENDING_PASSWORDS_KEY, pending);
    const issued = readJson<Record<string, string>>(session, ISSUED_CREDENTIALS_KEY, {});
    issued[key] = password;
    writeJson(session, ISSUED_CREDENTIALS_KEY, issued);
  },
  markUserDeleted(username: string) {
    const d = readJson<{ users: string[]; schools: string[] }>(session, PENDING_DELETES_KEY, { users: [], schools: [] });
    const key = username.trim().toLowerCase();
    if (key && !d.users.includes(key)) d.users.push(key);
    writeJson(session, PENDING_DELETES_KEY, d);
  },
  markSchoolDeleted(schoolId: string) {
    const d = readJson<{ users: string[]; schools: string[] }>(session, PENDING_DELETES_KEY, { users: [], schools: [] });
    if (schoolId && !d.schools.includes(schoolId)) d.schools.push(schoolId);
    writeJson(session, PENDING_DELETES_KEY, d);
  },
  /** Ghi mật khẩu hiện tại (Quản trị nhận từ Drive) để hiển thị / xuất Excel — không gửi lại lên Drive */
  setIssuedPassword(username: string, password: string) {
    const key = String(username || '').trim().toLowerCase();
    if (!key || !password) return;
    const issued = readJson<Record<string, string>>(session, ISSUED_CREDENTIALS_KEY, {});
    issued[key] = password;
    writeJson(session, ISSUED_CREDENTIALS_KEY, issued);
  },
  /** Có phiên Quản trị (để ký ghi CSDL và xem mật khẩu) trên tab này không */
  hasAdminSession(): boolean {
    return Boolean(this.getAdminAuth());
  },
  /** Mật khẩu đã cấp trong phiên làm việc này (để xuất Excel) */
  getIssuedPassword(username: string): string | undefined {
    const issued = readJson<Record<string, string>>(session, ISSUED_CREDENTIALS_KEY, {});
    return issued[username.trim().toLowerCase()];
  },

  // ---------------- Bộ nhớ máy (tương thích các màn hình cũ) ----------------
  upsertLocalUsers(users: Partial<UserAccount>[]) {
    const list = readJson<any[]>(local, USERS_KEY, []);
    const byName = new Map<string, any>(list.filter(u => u?.username).map(u => [String(u.username).toLowerCase(), u]));
    users.forEach(u => {
      if (!u?.username) return;
      const key = String(u.username).toLowerCase();
      const { password: _omit, ...safe } = u as any;
      byName.set(key, { ...(byName.get(key) || {}), ...safe, username: key });
    });
    writeJson(local, USERS_KEY, Array.from(byName.values()));
  },
  replaceLocalUsers(users: Partial<UserAccount>[]) {
    writeJson(local, USERS_KEY, users.map(u => {
      const { password: _omit, ...safe } = u as any;
      return safe;
    }));
  },
  replaceLocalSchools(schools: Partial<SchoolEntity>[]) {
    writeJson(local, SCHOOLS_KEY, schools.filter(x => x?.name));
  },
  mergeLocalSchools(schools: Partial<SchoolEntity>[]) {
    const list = readJson<any[]>(local, SCHOOLS_KEY, []);
    schools.forEach(s => {
      if (!s?.name) return;
      const idx = list.findIndex(x => (s.id && x.id === s.id) || String(x.name || '').trim().toUpperCase() === String(s.name).trim().toUpperCase());
      if (idx >= 0) list[idx] = { ...list[idx], ...s };
      else list.push({ ...s });
    });
    writeJson(local, SCHOOLS_KEY, list);
  },

  // ---------------- Ghi CSDL lên Drive (Quản trị) ----------------
  subscribeSync(fn: (s: { status: 'idle' | 'syncing' | 'success' | 'error'; message?: string }) => void) {
    syncListeners.add(fn);
    return () => syncListeners.delete(fn);
  },
  notify(s: { status: 'idle' | 'syncing' | 'success' | 'error'; message?: string }) {
    if (s.status === 'error') lastSyncError = s.message || '';
    if (s.status === 'success') lastSyncError = '';
    syncListeners.forEach(fn => { try { fn(s); } catch (_) {} });
  },

  /** Gom các thay đổi tài khoản / trường trong 1,2 giây rồi ghi lên Drive một lần */
  queueSync(currentUser?: UserAccount | null) {
    if (!this.isConfigured()) return;
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'school_admin' || currentUser.isSchoolAdmin);
    if (currentUser && !isAdmin) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { this.syncNow().catch(() => {}); }, 1200);
  },

  async syncNow(): Promise<{ success: boolean; message: string }> {
    const auth = this.getAdminAuth();
    if (!auth) {
      const msg = 'Phiên Quản trị đã hết, hãy đăng nhập lại để lưu tài khoản lên Google Drive.';
      this.notify({ status: 'error', message: msg });
      return { success: false, message: msg };
    }
    const pending = readJson<Record<string, string>>(session, PENDING_PASSWORDS_KEY, {});
    const dirty = readJson<{ users: string[]; schools: string[] }>(session, DIRTY_KEY, { users: [], schools: [] });
    const deletes = readJson<{ users: string[]; schools: string[] }>(session, PENDING_DELETES_KEY, { users: [], schools: [] });
    // Chỉ gửi đúng các tài khoản / trường Quản trị vừa tạo hoặc sửa (không gửi dữ liệu cũ còn trong trình duyệt)
    const users = readJson<any[]>(local, USERS_KEY, [])
      .filter(u => u?.username && dirty.users.includes(String(u.username).toLowerCase()))
      .filter(u => u.tenantType !== 'guest' && u.role !== 'guest_admin')
      .map(u => {
        const key = String(u.username).toLowerCase();
        const { password: _omit, ...safe } = u;
        return pending[key] ? { ...safe, username: key, password: pending[key] } : { ...safe, username: key };
      });
    const schools = readJson<any[]>(local, SCHOOLS_KEY, [])
      .filter(sc => sc?.name && (dirty.schools.includes(String(sc.id || '')) || dirty.schools.includes(String(sc.name).trim())));

    this.notify({ status: 'syncing' });
    try {
      const data = await this.callScript({
        action: 'saveSchoolDb',
        auth,
        db: { mode: 'merge', schools, users, deletedUsernames: deletes.users, deletedSchoolIds: deletes.schools }
      });
      if (data?.success) {
        // Chỉ xóa đánh dấu của những mục đã gửi (mục thêm trong lúc chờ vẫn được gửi lần sau)
        const sentUsers = new Set(users.map(u => u.username));
        const sentSchools = new Set(schools.flatMap(sc => [String(sc.id || ''), String(sc.name).trim()]));
        const nowDirty = readJson<{ users: string[]; schools: string[] }>(session, DIRTY_KEY, { users: [], schools: [] });
        writeJson(session, DIRTY_KEY, {
          users: nowDirty.users.filter(k => !sentUsers.has(k)),
          schools: nowDirty.schools.filter(k => !sentSchools.has(k))
        });
        const nowPending = readJson<Record<string, string>>(session, PENDING_PASSWORDS_KEY, {});
        sentUsers.forEach(k => { delete nowPending[k]; });
        writeJson(session, PENDING_PASSWORDS_KEY, nowPending);
        writeJson(session, PENDING_DELETES_KEY, { users: [], schools: [] });
        // Drive là nguồn chuẩn: thay danh sách trường + tài khoản trên máy bằng bản trên Drive
        this.applyAuthoritative(data.users, data.schools);
        this.notify({ status: 'success', message: data.message });
        return { success: true, message: data.message };
      }
      const msg = data?.message || 'Không lưu được cơ sở dữ liệu nhà trường.';
      this.notify({ status: 'error', message: msg });
      return { success: false, message: msg };
    } catch (err: any) {
      const msg = err?.message || 'Không kết nối được Google Drive.';
      this.notify({ status: 'error', message: msg });
      return { success: false, message: msg };
    }
  },

  /** Thay dữ liệu trên máy bằng CSDL trên Drive (giữ tài khoản cá nhân/vãng lai và mục chưa kịp gửi) */
  applyAuthoritative(driveUsers?: any[], driveSchools?: any[]) {
    if (Array.isArray(driveUsers)) driveUsers = [...driveUsers];
    const dirty = readJson<{ users: string[]; schools: string[] }>(session, DIRTY_KEY, { users: [], schools: [] });
    const localUsers = readJson<any[]>(local, USERS_KEY, []);
    if (Array.isArray(driveUsers)) {
      // Mật khẩu hiện tại (chỉ Quản trị nhận được): giữ trong phiên, không lưu vào danh sách tài khoản
      driveUsers = driveUsers.map(u => {
        if (u && typeof u.currentPassword === 'string') {
          if (u.currentPassword) this.setIssuedPassword(u.username, u.currentPassword);
          const { currentPassword: _cp, ...rest } = u;
          return rest;
        }
        return u;
      });
      const keep = localUsers.filter(u =>
        u?.tenantType === 'guest' || u?.role === 'guest_admin' ||
        dirty.users.includes(String(u?.username || '').toLowerCase())
      );
      const names = new Set(driveUsers.map(u => String(u.username).toLowerCase()));
      this.replaceLocalUsers([...driveUsers, ...keep.filter(u => !names.has(String(u.username).toLowerCase()))]);
    }
    if (Array.isArray(driveSchools)) {
      const localSchools = readJson<any[]>(local, SCHOOLS_KEY, []);
      const keepSchools = localSchools.filter(sc => dirty.schools.includes(String(sc.id || '')) || dirty.schools.includes(String(sc.name || '').trim()));
      const ids = new Set(driveSchools.map(sc => String(sc.id || sc.name)));
      this.replaceLocalSchools([...driveSchools, ...keepSchools.filter(sc => !ids.has(String(sc.id || sc.name)))]);
    }
  },

  /** Quản trị tải CSDL (không mật khẩu) từ Drive về máy — dùng khi đăng nhập trên máy mới */
  async pullForAdmin(): Promise<{ success: boolean; message: string }> {
    const auth = this.getAdminAuth();
    if (!auth) return { success: false, message: 'Chưa có phiên Quản trị.' };
    try {
      const data = await this.callScript({ action: 'getSchoolDb', auth });
      if (data?.success) {
        this.applyAuthoritative(data.users || [], data.schools || []);
        return { success: true, message: `Đã tải ${data.users?.length || 0} tài khoản từ Google Drive.` };
      }
      return { success: false, message: data?.message || 'Không tải được CSDL nhà trường.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Không kết nối được Google Drive.' };
    }
  }
};
