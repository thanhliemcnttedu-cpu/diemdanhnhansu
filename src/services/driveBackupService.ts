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
  license?: any;
  notes: string[];
}

type Progress = (text: string) => void;
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

    let license: any;
    try {
      const l = await getJson(`${scriptUrl}${sep}action=getLicense&folderId=${encodeURIComponent(folderId)}`);
      if (l && l.record) license = l.record;
    } catch (_) { /* ignore */ }

    return {
      format: 'lhhp_drive_backup', version: 1, exportedAt: new Date().toISOString(), exportedBy: auth.username,
      source: { folderId, schoolNames: (db.schools || []).map((s: any) => s?.name).filter(Boolean) },
      schoolDb: { schools: db.schools || [], users },
      files, staff, staffAttendance, license, notes,
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
    if (b.staffAttendance && Object.keys(b.staffAttendance.days || {}).length) {
      report.push(`Lịch sử chấm công (${Object.keys(b.staffAttendance.days).length} ngày): chỉ lưu trong tệp sao lưu, Apps Script không cho ghi lại tự động.`);
    }
    return report;
  },
};
