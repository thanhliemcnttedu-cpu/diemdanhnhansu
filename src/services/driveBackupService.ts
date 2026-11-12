/**
 * 💾 SAO LƯU / KHÔI PHỤC TOÀN HỆ THỐNG — BẢN WEB (Google Drive dùng chung + Apps Script), 11/2026.
 * Bản web (Vercel) không có máy chủ /api → nút "Tải về tệp database" cũ báo 404. Dịch vụ này đọc thẳng từ Drive qua Apps Script:
 *  - CSDL trường: trường + tài khoản (getSchoolDb, Quản trị → kèm MẬT KHẨU XEM ĐƯỢC để khôi phục giữ nguyên mật khẩu)
 *  - Mọi tệp .json trong thư mục dùng chung (gvcn_*, gvbm_*, phanhieu_truong, dieuchinh_quantri, cấu hình…) trừ tệp báo cáo bc_* (tự sinh lại)
 *  - Nhân sự (getStaffRoster: số CCCD + mật khẩu điểm danh xem được), lịch sử chấm công 400 ngày (chỉ để lưu trữ), bản quyền
 * Khôi phục vào thư mục + Apps Script ĐANG KẾT NỐI (thường là thư mục MỚI của kho / trường khác):
 *  CSDL trường (gộp, giữ mật khẩu) → các tệp → nhân sự → bản quyền. Lịch sử chấm công: Apps Script không cho ghi thẳng → không khôi phục.
 * ⚠️ Tệp sao lưu chứa mật khẩu và số CCCD: chỉ cất ở nơi an toàn.
 */
import { googleDriveService, toLocalDateKey } from './googleDriveService';
import { schoolDriveDbService } from './schoolDriveDbService';
import { staffAttendanceService } from './staffAttendanceService';
import { teachingLogService } from './teachingLogService';
import { compareVersions } from './appsScriptSetupService';

export interface DriveBackup {
  format: 'lhhp_drive_backup';
  version: 1;
  exportedAt: string;
  exportedBy: string;
  source: { folderId: string; schoolNames: string[] };
  schoolDb: { schools: any[]; users: any[] };
  files: Record<string, any>;
  staff?: any[];
  staffAttendance?: { from: string; to: string; days: any; locks?: any };
  /** Kê khai tiết dạy (12 tháng gần nhất): hồ sơ, bảng kê theo tháng, khóa chốt, cài đặt */
  teaching?: { from?: string; to?: string; profiles: any; logs: any; locks?: any; settings?: any };
  license?: any;
  notes: string[];
}

type Progress = (text: string) => void;

/** Result of reading a folder / several files chosen for restore */
export interface AssembledBackup {
  /** null = nothing restorable was recognised */
  backup: DriveBackup | null;
  /** files that will be restored, with a short description */
  used: string[];
  /** files left out, with the reason */
  ignored: string[];
}
const SKIP_FILE = (name: string) => /^bc_/i.test(name) || !/\.json$/i.test(name);

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  return res.json();
}

function scriptBase() {
  const cfg = googleDriveService.getConfig();
  const scriptUrl = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
  return { scriptUrl, folderId: (cfg.folderId || '').trim(), sep: scriptUrl.includes('?') ? '&' : '?' };
}

/** Chạy các việc song song tối đa n cùng lúc (không dồn lệnh vào Apps Script) */
async function pool<T>(items: T[], n: number, fn: (it: T, i: number) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (cursor < items.length) { const i = cursor++; await fn(items[i], i); }
  }));
}

export const driveBackupService = {
  /** Bản web (không có máy chủ /api) đã kết nối Drive dùng chung */
  isDriveMode(): boolean {
    return (window as any).__lhhpApiAvailable !== true && schoolDriveDbService.isConfigured();
  },

  async exportAll(onProgress: Progress = () => {}): Promise<DriveBackup> {
    const auth = schoolDriveDbService.getAdminAuth();
    if (!auth) throw new Error('Cần phiên Quản trị: hãy đăng xuất rồi đăng nhập lại bằng tài khoản Quản trị.');
    const { scriptUrl, folderId, sep } = scriptBase();
    if (!scriptUrl || !folderId) throw new Error('Chưa kết nối thư mục Google Drive dùng chung.');
    const notes: string[] = [];

    onProgress('Đang đọc cơ sở dữ liệu trường & tài khoản…');
    const db = await schoolDriveDbService.callScript({ action: 'getSchoolDb', auth }, 60000);
    if (!db || db.success === false) throw new Error(db?.message || 'Không đọc được cơ sở dữ liệu trường.');
    const users = Array.isArray(db.users) ? db.users : [];
    const noPw = users.filter((u: any) => !u.currentPassword).length;
    if (noPw) notes.push(`${noPw} tài khoản không có mật khẩu xem được (khi khôi phục sẽ dùng mật khẩu chung bạn nhập).`);

    onProgress('Đang liệt kê tệp trong thư mục dùng chung…');
    const list = (await googleDriveService.listClassFilesMeta()) || [];
    const names = list.map(f => String(f.name)).filter(n => !SKIP_FILE(n));
    const files: Record<string, any> = {};
    let done = 0;
    await pool(names, 3, async (name) => {
      try {
        const data = await getJson(`${scriptUrl}${sep}action=getLatest&strict=1&folderId=${encodeURIComponent(folderId)}&fileName=${encodeURIComponent(name)}`);
        if (data && data.success !== false) files[name] = data; else notes.push(`Không đọc được tệp ${name}.`);
      } catch (_) { notes.push(`Không đọc được tệp ${name}.`); }
      done++;
      onProgress(`Đang tải tệp dữ liệu ${done}/${names.length}…`);
    });

    let staff: any[] | undefined;
    let staffAttendance: DriveBackup['staffAttendance'];
    try {
      onProgress('Đang đọc danh sách nhân sự…');
      const r = await schoolDriveDbService.callScript({ action: 'getStaffRoster', auth }, 60000);
      // Bổ sung số CCCD đầy đủ từ bộ nhớ máy Quản trị (nhân sự nhập trước khi Apps Script lưu đủ số)
      if (r && r.success && Array.isArray(r.staff)) staff = staffAttendanceService.withFullCccd({ staff: r.staff }).staff as any[];
      const missing = (staff || []).filter((s: any) => !(s.currentCccd || s.cccd)).length;
      if (missing) notes.push(`${missing} nhân sự chưa có số CCCD đầy đủ (chỉ có 4 số cuối) → không khôi phục được ở thư mục mới; hãy Nhập lại Excel nhân sự ở thư mục mới.`);
      if (staff && staff.length) {
        onProgress('Đang đọc lịch sử chấm công (400 ngày gần nhất)…');
        const to = toLocalDateKey(new Date());
        const fromD = new Date(); fromD.setDate(fromD.getDate() - 399);
        const from = toLocalDateKey(fromD);
        const a = await schoolDriveDbService.callScript({ action: 'staffAttendanceRange', auth, from, to }, 90000);
        if (a && a.success) staffAttendance = { from, to, days: a.days || {}, locks: a.locks || {} };
      }
    } catch (_) { notes.push('Không đọc được dữ liệu nhân sự / chấm công (Apps Script cũ hoặc chưa có).'); }

    // Kê khai tiết dạy: tệp được khóa trên Drive → đọc qua báo cáo của quản trị (tối đa 12 tháng gần nhất)
    let teaching: DriveBackup['teaching'];
    try {
      onProgress('Đang đọc kê khai tiết dạy…');
      const mk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const now = new Date();
      const t = await teachingLogService.report(mk(new Date(now.getFullYear(), now.getMonth() - 11, 1)), mk(now), auth);
      if (t && t.success) teaching = { from: t.from, to: t.to, profiles: t.profiles || {}, logs: t.logs || {}, locks: t.locks || {}, settings: t.settings || undefined };
      else notes.push('Không đọc được kê khai tiết dạy.');
    } catch (_) { notes.push('Không đọc được kê khai tiết dạy.'); }

    let license: any;
    try {
      const l = await getJson(`${scriptUrl}${sep}action=getLicense&folderId=${encodeURIComponent(folderId)}`);
      if (l && l.record) license = l.record;
    } catch (_) { /* ignore */ }

    return {
      format: 'lhhp_drive_backup', version: 1, exportedAt: new Date().toISOString(), exportedBy: auth.username,
      source: { folderId, schoolNames: (db.schools || []).map((s: any) => s?.name).filter(Boolean) },
      schoolDb: { schools: db.schools || [], users },
      files, staff, staffAttendance, teaching, license, notes,
    };
  },

  download(backup: DriveBackup) {
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const school = (backup.source.schoolNames[0] || 'truong').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    a.download = `LHHP_saoluu_toan_he_thong_${school}_${toLocalDateKey(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  },

  /**
   * 📂 Người dùng trỏ vào CẢ THƯ MỤC hoặc chọn NHIỀU TỆP: tự nhận dạng từng tệp và ghép thành một bản sao lưu để khôi phục.
   *  - Có tệp tổng (`lhhp_drive_backup`) → dùng tệp tổng mới nhất, bỏ qua các tệp lẻ (cùng dữ liệu, tránh lẫn).
   *  - Không có tệp tổng → ghép từ tệp lẻ: csdl_truong (trường + tài khoản), nhansu_truong (nhân sự),
   *    gvcn_* / gvbm_* / phanhieu_truong / dieuchinh_quantri / tệp cấu hình (ghi lại đúng tên).
   *  - Chấm công, kê khai tiết dạy, bc_*: chỉ để lưu trữ → liệt kê ở danh sách bỏ qua kèm lý do.
   */
  assembleFromFiles(items: Array<{ name: string; json: any }>): AssembledBackup {
    const used: string[] = [];
    const ignored: string[] = [];
    const short = (n: string) => String(n || '').split(/[\\/]/).pop() || String(n || '');
    const fulls = items.filter(it => this.isBackup(it.json));
    if (fulls.length) {
      fulls.sort((a, b) => String(b.json.exportedAt || '').localeCompare(String(a.json.exportedAt || '')));
      const pick = fulls[0];
      const sm = this.summarize(pick.json);
      used.push(`${short(pick.name)} — tệp tổng toàn hệ thống (${sm.schools} trường, ${sm.users} tài khoản, ${sm.classFiles} tệp lớp, ${sm.staff} nhân sự)`);
      items.forEach(it => { if (it !== pick) ignored.push(`${short(it.name)} — bỏ qua vì đã dùng tệp tổng${this.isBackup(it.json) ? ' mới hơn' : ''}`); });
      return { backup: pick.json as DriveBackup, used, ignored };
    }
    let schoolDb: DriveBackup['schoolDb'] | null = null;
    let staff: any[] | undefined;
    let teaching: DriveBackup['teaching'];
    const attDays: Record<string, any> = {};
    const attLocks: Record<string, any> = {};
    const files: Record<string, any> = {};
    items.forEach(it => {
      const name = short(it.name);
      const low = name.toLowerCase();
      const j = it.json;
      if (!j || typeof j !== 'object' || Array.isArray(j)) { ignored.push(`${name} — không phải tệp dữ liệu của phần mềm`); return; }
      if (j.format === 'lop_hoc_hanh_phuc_backup') { ignored.push(`${name} — bản sao lưu kiểu cũ của một tài khoản (nạp ở phần "Tệp riêng của tài khoản này")`); return; }
      if (/^bc_/.test(low)) { ignored.push(`${name} — tệp báo cáo, Google Drive tự sinh lại`); return; }
      if (/^chamcong_nhansu_/.test(low)) {
        const dd = j.days && typeof j.days === 'object' ? j.days : {};
        Object.keys(dd).forEach(k => { attDays[k] = dd[k]; });
        if (j.locks && typeof j.locks === 'object') Object.keys(j.locks).forEach(k => { attLocks[k] = j.locks[k]; });
        used.push(`${name} — chấm công (${Object.keys(dd).length} ngày)`);
        return;
      }
      if (low === 'kekhai_tietday.json') {
        teaching = { profiles: j.profiles || {}, logs: j.logs || {}, locks: j.locks || {}, settings: j.settings || undefined };
        used.push(`${name} — kê khai tiết dạy (${Object.keys(j.logs || {}).length} tháng)`);
        return;
      }
      if (low === 'csdl_truong.json' || (Array.isArray(j.users) && Array.isArray(j.schools))) {
        schoolDb = { schools: Array.isArray(j.schools) ? j.schools : [], users: Array.isArray(j.users) ? j.users : [] };
        used.push(`${name} — cơ sở dữ liệu trường (${schoolDb.schools.length} trường, ${schoolDb.users.length} tài khoản)`);
        return;
      }
      if (low === 'nhansu_truong.json' || Array.isArray(j.staff)) {
        staff = Array.isArray(j.staff) ? j.staff : [];
        used.push(`${name} — danh sách nhân sự (${(staff || []).length} người)`);
        return;
      }
      files[name] = j;
      used.push(`${name} — ${/^gvcn_/.test(low) ? 'tệp lớp của giáo viên chủ nhiệm' : /^gvbm_/.test(low) ? 'tệp của giáo viên bộ môn' : 'tệp dữ liệu / cấu hình'}`);
    });
    if (!used.length) return { backup: null, used, ignored };
    const db: DriveBackup['schoolDb'] = schoolDb || { schools: [], users: [] };
    return {
      backup: {
        format: 'lhhp_drive_backup', version: 1, exportedAt: new Date().toISOString(), exportedBy: 'ghép từ các tệp đã chọn',
        source: { folderId: '', schoolNames: (db.schools || []).map((x: any) => x?.name).filter(Boolean) },
        schoolDb: db, files, staff, teaching,
        staffAttendance: Object.keys(attDays).length ? { from: Object.keys(attDays).sort()[0], to: Object.keys(attDays).sort().slice(-1)[0], days: attDays, locks: attLocks } : undefined,
        notes: [],
      },
      used, ignored,
    };
  },

  isBackup(json: any): json is DriveBackup {
    return Boolean(json && json.format === 'lhhp_drive_backup' && json.schoolDb && json.files);
  },

  summarize(b: DriveBackup) {
    const fileNames = Object.keys(b.files || {});
    return {
      schools: (b.schoolDb.schools || []).length,
      users: (b.schoolDb.users || []).length,
      usersNoPassword: (b.schoolDb.users || []).filter((u: any) => !u.currentPassword).length,
      classFiles: fileNames.filter(n => /^(gvcn|gvbm)_/i.test(n)).length,
      otherFiles: fileNames.filter(n => !/^(gvcn|gvbm)_/i.test(n)).length,
      staff: (b.staff || []).length,
      attendanceDays: Object.keys(b.staffAttendance?.days || {}).length,
      teachingMonths: Object.keys(b.teaching?.logs || {}).length,
      exportedAt: b.exportedAt,
      schoolNames: b.source.schoolNames,
    };
  },

  /**
   * Khôi phục vào thư mục + Apps Script ĐANG KẾT NỐI.
   * auth: tài khoản Quản trị của thư mục đích (thư mục trống: chính tài khoản này thành Quản trị đầu tiên).
   */
  async restore(b: DriveBackup, opts: { auth: { username: string; password: string }; fallbackPassword: string; overwrite: boolean }, onProgress: Progress = () => {}) {
    const { scriptUrl, folderId } = scriptBase();
    if (!scriptUrl || !folderId) throw new Error('Chưa kết nối thư mục Google Drive dùng chung (đích).');
    const report: string[] = [];

    // Chỉ chọn vài tệp lẻ mà không có csdl_truong → giữ nguyên trường & tài khoản đang có (không ghi đè, không đổi vai trò ai)
    const hasDb = Boolean((b.schoolDb?.users || []).length || (b.schoolDb?.schools || []).length);
    if (hasDb) {
      // 1) Trường + tài khoản (giữ mật khẩu xem được; thiếu thì dùng mật khẩu chung)
      onProgress('Đang khôi phục trường & tài khoản…');
      const actorKey = opts.auth.username.trim().toLowerCase();
      const users = (b.schoolDb.users || []).map((u: any) => {
        const { currentPassword, ...rest } = u || {};
        const isActor = String(rest.username || '').toLowerCase() === actorKey;
        const pw = isActor ? opts.auth.password : (currentPassword || opts.fallbackPassword || '');
        return pw ? { ...rest, password: pw } : rest;
      });
      if (!users.some((u: any) => String(u.username || '').toLowerCase() === actorKey)) {
        users.unshift({ username: actorKey, fullName: 'Quản trị', role: 'admin', password: opts.auth.password });
      }
      const r1 = await schoolDriveDbService.callScript({ action: 'saveSchoolDb', auth: opts.auth, db: { schools: b.schoolDb.schools || [], users } }, 90000);
      if (!r1 || r1.success === false) throw new Error(r1?.message || 'Không ghi được cơ sở dữ liệu trường vào thư mục đích.');
      const skippedUsers = users.filter((u: any) => !u.password).length;
      report.push(`Trường & tài khoản: ${users.length - skippedUsers} tài khoản${skippedUsers ? ` (bỏ qua ${skippedUsers} tài khoản không có mật khẩu)` : ''}.`);
    } else {
      report.push('Trường & tài khoản: không có trong các tệp đã chọn → giữ nguyên dữ liệu đang có.');
    }
    // Đăng nhập lại bằng tài khoản Quản trị đích để các lệnh sau dùng đúng phiên
    try { await schoolDriveDbService.login(opts.auth.username, opts.auth.password); } catch (_) { /* ignore */ }

    // 2) Tệp dữ liệu (lớp, phân hiệu, điều chỉnh, cấu hình…)
    const existing = new Set(((await googleDriveService.listClassFilesMeta()) || []).map(f => String(f.name).toLowerCase()));
    const names = Object.keys(b.files || {});
    let written = 0, skipped = 0, failed = 0, done = 0;
    await pool(names, 2, async (name) => {
      if (!opts.overwrite && existing.has(name.toLowerCase())) { skipped++; }
      else {
        try {
          const res = await fetch(scriptUrl, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'saveClassData', folderId, fileName: name, data: b.files[name] }),
          });
          const d = await res.json().catch(() => null);
          if (d && d.success !== false) written++; else failed++;
        } catch (_) { failed++; }
      }
      done++;
      onProgress(`Đang ghi tệp dữ liệu ${done}/${names.length}…`);
    });
    report.push(`Tệp dữ liệu: ghi ${written}${skipped ? `, giữ nguyên ${skipped} tệp đã có` : ''}${failed ? `, LỖI ${failed}` : ''}.`);

    // 3) Nhân sự (giữ số CCCD + mật khẩu điểm danh)
    if (b.staff && b.staff.length) {
      onProgress('Đang khôi phục danh sách nhân sự…');
      try {
        const staff = b.staff.map((s: any) => ({
          code: s.code, name: s.name, position: s.position, dept: s.dept, gender: s.gender, phone: s.phone,
          order: s.order, disabled: s.disabled, cccd: s.currentCccd || s.cccd || undefined, pin: s.currentPin || undefined,
        }));
        const r3 = await schoolDriveDbService.callScript({ action: 'saveStaffRoster', auth: opts.auth, staff }, 120000);
        if (r3 && r3.success) {
          const errs: string[] = r3.errors || [];
          const noCccd = errs.filter(e => /thiếu số CCCD/i.test(e)).length;
          report.push(`Nhân sự: ${staff.length - errs.length}/${staff.length} người.${noCccd ? ` ${noCccd} người thiếu số CCCD đầy đủ ở dữ liệu gốc → hãy Nhập lại Excel nhân sự (Chấm công → Danh sách nhân sự) ở thư mục mới.` : ''}${errs.length - noCccd > 0 ? ` ${errs.length - noCccd} dòng lỗi khác: ${errs.filter(e => !/thiếu số CCCD/i.test(e)).slice(0, 3).join('; ')}` : ''}`);
        }
        else report.push(`Nhân sự: chưa khôi phục được (${r3?.message || 'Apps Script cũ?'}).`);
      } catch (e: any) { report.push(`Nhân sự: chưa khôi phục được (${e?.message || 'lỗi'}).`); }
    }

    // 4) Bản quyền (bản ghi đã ký, không có mã)
    if (b.license) {
      try {
        const r4 = await schoolDriveDbService.callScript({ action: 'setLicense', auth: opts.auth, record: b.license }, 30000);
        report.push(r4 && r4.success ? 'Bản quyền: đã chuyển.' : 'Bản quyền: chưa chuyển được (cần Apps Script phiên bản 1.1.7 trở lên).');
      } catch (_) { report.push('Bản quyền: chưa chuyển được.'); }
    }
    // 5) Lịch sử chấm công + kê khai tiết dạy (Apps Script 1.1.8 trở lên: lệnh restoreArchive, gộp không phá hủy)
    const attDays = b.staffAttendance?.days || {};
    const attKeys = Object.keys(attDays).sort();
    const hasTeaching = Boolean(b.teaching && (Object.keys(b.teaching.profiles || {}).length || Object.keys(b.teaching.logs || {}).length));
    // ⚠️ Apps Script cũ hơn 1.1.8 KHÔNG biết lệnh restoreArchive và sẽ coi cả gói gửi lên (kèm tài khoản quản trị)
    // là dữ liệu lớp để ghi thành tệp → phải kiểm tra phiên bản TRƯỚC, bản cũ thì tuyệt đối không gửi.
    let archiveReady = false;
    if (attKeys.length || hasTeaching) {
      let ver = '';
      try { const p = await getJson(`${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=ping`); ver = String(p?.version || ''); } catch (_) { ver = ''; }
      if (ver && compareVersions(ver, '1.1.8') >= 0) archiveReady = true;
      else report.push(`Chấm công & kê khai tiết dạy: chưa khôi phục — Apps Script của thư mục đích đang là ${ver ? `phiên bản ${ver}` : 'bản không xác định'}, cần cập nhật lên 1.1.8 (Dữ liệu → Google Drive của trường & Apps Script) rồi khôi phục lại. Các dữ liệu khác đã khôi phục xong.`);
    }
    if (archiveReady) {
      // Apps Script cũ không biết lệnh restoreArchive → trả về dữ liệu chấm công (không có các số đếm)
      const isOld = (r: any) => !r || typeof r.attendanceRecords !== 'number';
      const OLD_MSG = 'Chấm công & kê khai tiết dạy: Apps Script của thư mục đích là bản cũ → hãy cập nhật Apps Script lên phiên bản 1.1.8 rồi khôi phục lại (các dữ liệu khác đã khôi phục xong).';
      let archiveOk = true, records = 0, days = 0, profiles = 0, logs = 0;
      try {
        // chấm công: gửi theo từng tháng để mỗi lệnh gọn, không quá giới hạn thời gian của Apps Script
        const months = Array.from(new Set(attKeys.map(k => k.slice(0, 7))));
        for (let i = 0; i < months.length && archiveOk; i++) {
          const m = months[i];
          onProgress(`Đang khôi phục chấm công tháng ${m.slice(5)}/${m.slice(0, 4)} (${i + 1}/${months.length})…`);
          const part: Record<string, any> = {};
          attKeys.filter(k => k.slice(0, 7) === m).forEach(k => { part[k] = attDays[k]; });
          const locks: Record<string, any> = {};
          const srcLocks: Record<string, any> = b.staffAttendance?.locks || {};
          Object.keys(srcLocks).filter(k => k.slice(0, 7) === m).forEach(k => { locks[k] = srcLocks[k]; });
          const r = await schoolDriveDbService.callScript({ action: 'restoreArchive', auth: opts.auth, overwrite: opts.overwrite, attendance: { days: part, locks } }, 120000);
          if (r && r.success && !isOld(r)) { records += r.attendanceRecords; days += r.attendanceDays || 0; }
          else { archiveOk = false; report.push(r && r.success === false && r.code ? `Chấm công: chưa khôi phục được (${r.message || 'không đủ quyền'}).` : OLD_MSG); }
        }
        if (archiveOk && hasTeaching) {
          onProgress('Đang khôi phục kê khai tiết dạy…');
          const r = await schoolDriveDbService.callScript({ action: 'restoreArchive', auth: opts.auth, overwrite: opts.overwrite, teaching: b.teaching }, 120000);
          if (r && r.success && !isOld(r)) { profiles = r.teachingProfiles || 0; logs = r.teachingLogs || 0; }
          else { archiveOk = false; report.push(r && r.success === false && r.code ? `Kê khai tiết dạy: chưa khôi phục được (${r.message || 'không đủ quyền'}).` : OLD_MSG); }
        }
      } catch (e: any) { archiveOk = false; report.push(`Chấm công / kê khai tiết dạy: chưa khôi phục được (${e?.message || 'lỗi kết nối'}).`); }
      if (archiveOk) {
        if (attKeys.length) report.push(`Chấm công: thêm ${records} lượt trong ${days} ngày${opts.overwrite ? '' : ' (bản ghi đã có được giữ nguyên)'}.`);
        if (hasTeaching) report.push(`Kê khai tiết dạy: thêm ${profiles} hồ sơ, ${logs} bảng kê${opts.overwrite ? '' : ' (bảng đã có được giữ nguyên)'}.`);
      }
    }
    return report;
  },
};
