import React, { useMemo, useRef, useState } from 'react';
import { Users, Loader2, RefreshCw, KeyRound, CheckCircle2, Link2, Search, FileSpreadsheet, Download, MapPin, X } from 'lucide-react';
import type { UserAccount, UserRole, SchoolBranch } from '../../types';
import { adminEditsService } from '../../services/adminEditsService';
import { parseHomeroomSheet, downloadHomeroomTemplate, resolvePlacements, looseKey, strictKey, HomeroomRow } from '../../utils/homeroomAssignment';
import { staffAttendanceService, StaffMember } from '../../services/staffAttendanceService';
import { databaseService } from '../../services/databaseService';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';

/**
 * 🔗 TẠO TÀI KHOẢN PHẦN MỀM TỪ DANH SÁCH NHÂN SỰ CHẤM CÔNG (tài khoản dùng chung, Apps Script 1.1.4)
 * - Lấy họ tên, số điện thoại, mã GV từ danh sách nhân sự đã nhập (không phải nhập lại).
 * - Quản trị chỉ chọn vai trò (GVCN / GVBM / BGH) và lớp chủ nhiệm / môn dạy.
 * - TÊN ĐĂNG NHẬP = SỐ CCCD (thống nhất với trang điểm danh, không dùng mã GV); tài khoản gắn `staffCode` →
 *   đăng nhập bằng số CCCD + MẬT KHẨU ĐIỂM DANH (hoặc mật khẩu đã cấp) — 1 tài khoản cho cả điểm danh lẫn phần mềm.
 * - Tài khoản đã tạo trước bằng mã GV: nút "Chuyển sang số CCCD" (Apps Script 1.1.5 đổi tên, giữ nguyên mật khẩu).
 */
type RoleChoice = 'homeroom' | 'subject' | 'bgh' | 'skip';
interface RowCfg { pick: boolean; role: RoleChoice; cls: string }
/** Lớp chủ nhiệm gán từ danh sách phân công (theo mã GV) */
interface Assign { className: string; grade: string; branch: string; campus: string }
interface AssignReport {
  file: string; total: number; matched: number;
  unmatched: HomeroomRow[]; ambiguous: HomeroomRow[]; repeated: HomeroomRow[];
  groups: Array<{ branch: string; campuses: Array<{ name: string; count: number }>; count: number }>;
  newPlaces: number;
}

/** Số CCCD đầy đủ của nhân sự (chỉ chữ số, 9–12 số); '' nếu chưa có */
const cccdOf = (s: StaffMember) => { const d = String(s.currentCccd || s.cccd || '').replace(/\D/g, ''); return d.length >= 9 && d.length <= 12 ? d : ''; };
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const SUBJECT_HINTS = ['my thuat', 'am nhac', 'tin hoc', 'tieng anh', 'the duc', 'gdtc', 'giao duc the chat', 'cong nghe', 'ngoai ngu'];

/**
 * Đoán vai trò từ chức vụ / tổ: CHỈ giáo viên được chọn sẵn (tổ bộ môn → GVBM, còn lại → GVCN).
 * Nhân viên (bảo vệ, văn thư, thư viện, thủ quỹ, kế toán…) và cán bộ quản lý → "Không cấp"; muốn cấp thì tích tay.
 */
function guessRole(s: StaffMember): { role: RoleChoice; cls: string } {
  const pos = norm(s.position || '');
  const dept = norm(s.dept || '');
  if (!pos.includes('giao vien')) return { role: 'skip', cls: '' };
  if (SUBJECT_HINTS.some(h => dept.includes(h))) return { role: 'subject', cls: s.dept || '' };
  return { role: 'homeroom', cls: '' };
}

/** Tích tay người đang "Không cấp": cán bộ quản lý / hiệu trưởng → BGH, còn lại → GV bộ môn (sửa được) */
const manualRole = (s: StaffMember): RoleChoice => {
  const pos = norm(`${s.position || ''} ${s.dept || ''}`);
  return pos.includes('can bo quan ly') || pos.includes('hieu truong') ? 'bgh' : 'subject';
};

export const StaffToAccountsPanel: React.FC<{
  allUsers: UserAccount[];
  schoolName: string;
  /** Quản trị tối cao: danh sách trường để chọn (tài khoản tạo ra thuộc trường này) */
  schoolOptions?: string[];
  onCreated: () => void | Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
}> = ({ allUsers, schoolName: defaultSchool, schoolOptions, onCreated, notify }) => {
  const [schoolPick, setSchoolPick] = useState('');
  const schoolName = (schoolOptions && schoolOptions.includes(schoolPick) ? schoolPick : '') || defaultSchool;
  const fileRef = useRef<HTMLInputElement>(null);
  const [assign, setAssign] = useState<Record<string, Assign>>({});
  const [report, setReport] = useState<AssignReport | null>(null);
  const [pendingBranches, setPendingBranches] = useState<SchoolBranch[] | null>(null);
  const [applyingOld, setApplyingOld] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [cfg, setCfg] = useState<Record<string, RowCfg>>({});
  const [q, setQ] = useState('');
  const [pwMode, setPwMode] = useState<'pin' | 'common'>('pin');
  const [commonPw, setCommonPw] = useState('');

  /** Nhân sự đã có tài khoản: gắn mã GV, hoặc tên đăng nhập trùng số CCCD / mã GV */
  const linkedUser = (s: StaffMember) => allUsers.find(u => {
    const un = u.username.toLowerCase();
    return (u.staffCode && u.staffCode.toUpperCase() === s.code.toUpperCase()) || un === s.code.toLowerCase() || (!!cccdOf(s) && un === cccdOf(s));
  });
  /** Tài khoản đã tạo nhưng tên đăng nhập chưa phải số CCCD (vd. mã GV) → cần chuyển */
  const [migrating, setMigrating] = useState(false);
  const toMigrate = staff
    .map(s => ({ s, u: linkedUser(s), cccd: cccdOf(s) }))
    .filter(x => x.u && x.cccd && x.u.username.toLowerCase() !== x.cccd && x.u.role !== 'admin' && x.u.username.toLowerCase() !== 'adminquantri')
    .filter(x => !allUsers.some(o => o !== x.u && o.username.toLowerCase() === x.cccd));
  const migrate = async () => {
    if (!toMigrate.length) return;
    if (!confirm(`Chuyển tên đăng nhập của ${toMigrate.length} tài khoản sang SỐ CCCD?\nMật khẩu giữ nguyên. Giáo viên đăng nhập bằng số CCCD từ nay.`)) return;
    setMigrating(true);
    try {
      const r = await schoolDriveDbService.renameUsers(toMigrate.map(x => ({ from: x.u!.username, to: x.cccd })));
      if (!r.success) { notify('error', r.message); return; }
      notify('success', `Đã chuyển ${r.renamed} tài khoản sang đăng nhập bằng số CCCD (mật khẩu giữ nguyên).`);
      await onCreated();
    } finally { setMigrating(false); }
  };

  const load = async (): Promise<StaffMember[] | null> => {
    setLoading(true);
    try {
      const r = await staffAttendanceService.getRoster();
      if (!r?.success) { notify('error', r?.message || 'Không tải được danh sách nhân sự.'); return null; }
      const list: StaffMember[] = (r.staff || []).filter((s: StaffMember) => !s.disabled && s.code);
      setStaff(list);
      const next: Record<string, RowCfg> = {};
      // Chọn sẵn GIÁO VIÊN chưa có tài khoản; nhân viên / cán bộ quản lý để trống — muốn cấp thì tích tay
      list.forEach(s => { const g = guessRole(s); next[s.code] = { pick: g.role !== 'skip' && !linkedUser(s), role: g.role, cls: g.cls }; });
      setCfg(next);
      setAssign({}); setReport(null); setPendingBranches(null);
      setOpen(true);
      return list;
    } catch (e: any) {
      notify('error', e?.message || 'Không kết nối được Apps Script.');
      return null;
    } finally { setLoading(false); }
  };

  /** 📋 Nạp danh sách phân công chủ nhiệm: khớp tên GVCN với nhân sự → GV chủ nhiệm + lớp + phân hiệu / điểm trường */
  const importAssignments = async (file: File) => {
    let list = staff;
    if (!open || !list.length) { const l = await load(); if (!l) return; list = l; }
    let parsed: { rows: HomeroomRow[]; errors: string[] };
    try { parsed = parseHomeroomSheet(await file.arrayBuffer()); }
    catch { notify('error', 'Không đọc được tệp Excel. Hãy lưu lại dạng .xlsx hoặc .xls rồi thử lại.'); return; }
    if (!parsed.rows.length) { notify('error', parsed.errors[0] || 'Tệp không có dòng lớp nào.'); return; }
    let catalog: SchoolBranch[] = [];
    try { catalog = await databaseService.getSchoolBranches(schoolName); } catch { /* chưa có danh mục */ }
    const { placements, branches } = resolvePlacements(parsed.rows, catalog);

    // Khớp tên: không dấu trước; trùng nhiều người thì thử khớp có dấu
    const byLoose = new Map<string, StaffMember[]>();
    list.forEach(s => { const k = looseKey(s.name); byLoose.set(k, [...(byLoose.get(k) || []), s]); });
    const nextAssign: Record<string, Assign> = {};
    const unmatched: HomeroomRow[] = [], ambiguous: HomeroomRow[] = [], repeated: HomeroomRow[] = [];
    parsed.rows.forEach((r, i) => {
      let cands = byLoose.get(looseKey(r.teacherName)) || [];
      if (cands.length > 1) { const exact = cands.filter(s => strictKey(s.name) === strictKey(r.teacherName)); if (exact.length) cands = exact; }
      if (!cands.length) { unmatched.push(r); return; }
      if (cands.length > 1) { ambiguous.push(r); return; }
      const s = cands[0];
      if (nextAssign[s.code]) { repeated.push(r); return; }
      nextAssign[s.code] = { className: r.className, grade: r.grade, branch: placements[i].branch, campus: placements[i].campus };
    });
    setAssign(nextAssign);
    setCfg(prev => {
      const n = { ...prev };
      Object.entries(nextAssign).forEach(([code, a]) => {
        const s = list.find(x => x.code === code);
        const isNew = s && !linkedUser(s) && !!cccdOf(s);
        n[code] = { ...(n[code] || { pick: false, role: 'homeroom', cls: '' }), role: 'homeroom', cls: a.className, pick: isNew ? true : (n[code]?.pick ?? false) };
      });
      return n;
    });
    // Luôn lưu bản đã gộp (chỉ bổ sung) để danh mục trên Drive chắc chắn có đủ phân hiệu / điểm trường trong tệp
    setPendingBranches(branches.length ? branches : null);
    // Tóm tắt theo phân hiệu → điểm trường
    const gmap = new Map<string, Map<string, number>>();
    Object.values(nextAssign).forEach(a => {
      const b = a.branch || '(chưa rõ phân hiệu)';
      const m = gmap.get(b) || new Map<string, number>();
      m.set(a.campus || '—', (m.get(a.campus || '—') || 0) + 1);
      gmap.set(b, m);
    });
    const groups = [...gmap.entries()].map(([branch, m]) => ({ branch, campuses: [...m.entries()].map(([name, count]) => ({ name, count })), count: [...m.values()].reduce((x, y) => x + y, 0) }));
    const before = new Set(catalog.flatMap(b => [looseKey(b.name), ...(b.campuses || []).map(c => looseKey(c.name))]));
    const newPlaces = branches.flatMap(b => [b.name, ...b.campuses.map(c => c.name)]).filter(n => !before.has(looseKey(n))).length;
    setReport({ file: file.name, total: parsed.rows.length, matched: Object.keys(nextAssign).length, unmatched, ambiguous, repeated, groups, newPlaces });
    notify('success', `Đã khớp ${Object.keys(nextAssign).length}/${parsed.rows.length} lớp với giáo viên trong danh sách nhân sự.`);
  };

  /** Lưu danh mục phân hiệu (chỉ bổ sung) + ghi lớp chủ nhiệm kèm phân hiệu / điểm trường cho màn tổng hợp và máy GVCN */
  const publishClasses = async (list: Array<{ username: string; teacherName: string; a: Assign }>) => {
    if (pendingBranches) {
      try { await databaseService.saveSchoolBranches(schoolName, pendingBranches); setPendingBranches(null); }
      catch { notify('error', 'Chưa lưu được danh mục phân hiệu – điểm trường.'); }
    }
    for (const { username, teacherName, a } of list) {
      const cls: Record<string, any> = {
        id: `class-${a.className.toLowerCase().replace(/\s+/g, '')}`,
        name: a.className,
        teacherName, teacherUsername: username, teacherRole: 'homeroom',
        branch: a.branch || null, campus: a.campus || null,
      };
      if (a.grade) cls.grade = `Khối ${a.grade}`;
      try {
        if (adminEditsService.isActive()) adminEditsService.record('class', cls);
        else await databaseService.updateAdminClass(cls, username);
      } catch { /* bỏ qua lớp lỗi, tài khoản vẫn có phân hiệu / điểm trường */ }
    }
  };

  /** Tài khoản GVCN đã có: gán lại lớp + phân hiệu / điểm trường theo danh sách phân công */
  const oldToAssign = staff
    .map(s => ({ s, u: linkedUser(s), a: assign[s.code] }))
    .filter(x => x.u && x.a && x.u.role === 'homeroom' && (
      (x.u.assignedClassName || '').toUpperCase() !== x.a.className || (x.u.assignedBranch || '') !== x.a.branch || (x.u.assignedCampus || '') !== x.a.campus));
  const applyToExisting = async () => {
    if (!oldToAssign.length) return;
    if (!confirm(`Gán lớp chủ nhiệm, phân hiệu, điểm trường cho ${oldToAssign.length} tài khoản GVCN đã có theo danh sách phân công?`)) return;
    setApplyingOld(true);
    try {
      let ok = 0;
      for (const x of oldToAssign) {
        const r = await databaseService.updateUser(x.u!.username, { assignedClassName: x.a!.className, assignedBranch: x.a!.branch || undefined, assignedCampus: x.a!.campus || undefined });
        if (r?.success) ok++;
      }
      await publishClasses(oldToAssign.map(x => ({ username: x.u!.username, teacherName: x.u!.fullName || x.s.name, a: x.a! })));
      notify('success', `Đã gán lớp chủ nhiệm cho ${ok} tài khoản đã có.`);
      await onCreated();
    } finally { setApplyingOld(false); }
  };

  const rows = useMemo(() => staff.filter(s => !q || norm(`${s.name} ${s.code} ${s.position || ''} ${s.dept || ''}`).includes(norm(q))), [staff, q]);
  // Dòng được "chọn tất cả" tác động: giáo viên (vai trò khác "Không cấp") chưa có tài khoản
  const selectable = rows.filter(s => !linkedUser(s) && !!cccdOf(s) && cfg[s.code]?.role !== 'skip');
  const picked = staff.filter(s => cfg[s.code]?.pick && cfg[s.code]?.role !== 'skip' && !linkedUser(s) && !!cccdOf(s));
  const setRow = (code: string, patch: Partial<RowCfg>) => setCfg(prev => ({ ...prev, [code]: { ...prev[code], ...patch } }));

  const create = async () => {
    if (!picked.length) { notify('error', 'Chưa chọn nhân sự nào để tạo tài khoản.'); return; }
    if (pwMode === 'common' && commonPw.trim().length < 6) { notify('error', 'Mật khẩu chung cần ít nhất 6 ký tự.'); return; }
    const noPin = picked.filter(s => !s.currentPin);
    if (pwMode === 'pin' && noPin.length && commonPw.trim().length < 6) {
      notify('error', `${noPin.length} người chưa có mật khẩu điểm danh — nhập mật khẩu chung (≥ 6 ký tự) để dùng thay cho họ.`);
      return;
    }
    setBusy(true);
    try {
      const items = picked.map(s => {
        const c = cfg[s.code];
        const password = pwMode === 'pin' && s.currentPin ? s.currentPin : commonPw.trim();
        const a = c.role === 'homeroom' && assign[s.code] && assign[s.code].className === c.cls.trim().toUpperCase() ? assign[s.code] : null;
        return {
          username: cccdOf(s),
          password,
          fullName: s.name,
          role: c.role as UserRole,
          phone: s.phone || '',
          assignedClassName: c.role === 'homeroom' ? (c.cls.trim().toUpperCase() || undefined) : undefined,
          subjectName: c.role === 'subject' ? (c.cls.trim() || undefined) : undefined,
          schoolName,
          tenantType: 'school' as const,
          staffCode: s.code,
          assignedBranch: a?.branch || undefined,
          assignedCampus: a?.campus || undefined,
        };
      });
      const res = await databaseService.createUsersBulk(items);
      if (!res?.success) { notify('error', res?.message || 'Chưa tạo được tài khoản.'); return; }
      const withClass = items.filter(it => it.role === 'homeroom' && it.assignedClassName && (it.assignedBranch || it.assignedCampus || assign[it.staffCode]));
      if (withClass.length) {
        await publishClasses(withClass.map(it => ({
          username: it.username, teacherName: it.fullName,
          a: { className: it.assignedClassName!, grade: assign[it.staffCode]?.className === it.assignedClassName ? assign[it.staffCode].grade : (it.assignedClassName!.match(/^\d+/)?.[0] || ''), branch: it.assignedBranch || '', campus: it.assignedCampus || '' },
        })));
      }
      notify('success', `Đã tạo ${res.count} tài khoản dùng chung với điểm danh. Tên đăng nhập là số CCCD, mật khẩu là mật khẩu điểm danh.`);
      await onCreated();
      setCfg(prev => { const n = { ...prev }; picked.forEach(s => { n[s.code] = { ...n[s.code], pick: false }; }); return n; });
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white border border-indigo-200 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-black text-sm flex items-center justify-center shrink-0">3</div>
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase">Tạo từ danh sách nhân sự (chấm công)</h4>
            <p className="text-xs text-slate-600 mt-0.5 max-w-3xl">
              Dùng lại 1 tài khoản cho cả điểm danh và phần mềm: họ tên, số điện thoại lấy từ danh sách nhân sự; chỉ cần chọn vai trò và lớp / môn.
              <strong>Tên đăng nhập là số CCCD</strong> (giống trang điểm danh), mật khẩu là mật khẩu điểm danh.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => { load(); }} disabled={loading}
          className="no-hover-fx shrink-0 h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center gap-2 disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : open ? <RefreshCw className="w-4 h-4" /> : <Users className="w-4 h-4" />}
          {open ? 'Tải lại danh sách' : 'Lấy danh sách nhân sự'}
        </button>
      </div>

      {/* Danh sách phân công chủ nhiệm (Excel) → tự gán lớp, phân hiệu, điểm trường */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
        <p className="text-sm text-slate-700 flex-1 min-w-[16rem]">
          <strong className="text-slate-900">Danh sách phân công chủ nhiệm</strong> (Khối học, Tên lớp, Điểm trường, Giáo viên chủ nhiệm…): phần mềm tự khớp tên giáo viên, chọn vai trò GV chủ nhiệm, điền lớp và gán phân hiệu – điểm trường.
        </p>
        {schoolOptions && schoolOptions.length > 1 && (
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-slate-600 whitespace-nowrap">Trường</span>
            <select value={schoolName} onChange={(e) => setSchoolPick(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-sm max-w-[14rem]">
              {schoolOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={downloadHomeroomTemplate}
          className="no-hover-fx h-9 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap">
          <Download className="w-4 h-4" /> Tải mẫu phân công
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={loading}
          className="no-hover-fx h-9 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60">
          <FileSpreadsheet className="w-4 h-4" /> Nạp danh sách phân công
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importAssignments(f); }} />
      </div>

      {report && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-slate-800">
              <strong>{report.file}</strong>: khớp <strong className="text-emerald-800">{report.matched}/{report.total}</strong> lớp với giáo viên.
              {report.newPlaces > 0 && <> Sẽ bổ sung <strong>{report.newPlaces}</strong> phân hiệu / điểm trường mới vào danh mục khi tạo tài khoản (sắp xếp lại được ở Mô hình lớp &amp; HS).</>}
            </p>
            <button type="button" onClick={() => setReport(null)} aria-label="Đóng tóm tắt" className="no-hover-fx w-7 h-7 rounded-lg hover:bg-emerald-100 inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {report.groups.map(g => (
              <span key={g.branch} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-xs text-slate-800">
                <MapPin className="w-3.5 h-3.5 text-emerald-700" /><strong>{g.branch}</strong> · {g.count} lớp
                {g.campuses.filter(c => c.name !== '—').length > 0 && <span className="text-slate-600">({g.campuses.filter(c => c.name !== '—').map(c => `${c.name} ${c.count}`).join(', ')})</span>}
              </span>
            ))}
          </div>
          {report.unmatched.length > 0 && (
            <p className="text-rose-800"><strong>Không tìm thấy trong danh sách nhân sự ({report.unmatched.length}):</strong> {report.unmatched.map(r => `${r.teacherName} (${r.className})`).join(', ')} — kiểm tra lại họ tên hoặc nhập lớp bằng tay.</p>
          )}
          {report.ambiguous.length > 0 && (
            <p className="text-amber-900"><strong>Trùng họ tên, cần chọn tay ({report.ambiguous.length}):</strong> {report.ambiguous.map(r => `${r.teacherName} (${r.className})`).join(', ')}</p>
          )}
          {report.repeated.length > 0 && (
            <p className="text-amber-900"><strong>Một giáo viên chủ nhiệm nhiều lớp – chỉ gán lớp đầu ({report.repeated.length}):</strong> {report.repeated.map(r => `${r.teacherName} (${r.className})`).join(', ')}</p>
          )}
          {oldToAssign.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <p className="text-slate-800 flex-1 min-w-[14rem]"><strong>{oldToAssign.length}</strong> tài khoản GVCN đã có sẽ được gán lại lớp, phân hiệu, điểm trường theo danh sách.</p>
              <button type="button" onClick={applyToExisting} disabled={applyingOld}
                className="no-hover-fx h-9 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap">
                {applyingOld ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Gán cho tài khoản đã có
              </button>
            </div>
          )}
        </div>
      )}

      {open && toMigrate.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-amber-950 flex-1 min-w-[16rem]">
            <strong>{toMigrate.length} tài khoản</strong> đang dùng mã GV hoặc tên khác làm tên đăng nhập. Thống nhất: chuyển sang <strong>số CCCD</strong> (mật khẩu giữ nguyên).
          </p>
          <button type="button" onClick={migrate} disabled={migrating}
            className="no-hover-fx h-10 px-4 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-sm font-black inline-flex items-center gap-2 disabled:opacity-60 whitespace-nowrap">
            {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Chuyển sang số CCCD
          </button>
        </div>
      )}

      {open && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative">
              <span className="sr-only">Tìm nhân sự</span>
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên, mã GV, tổ…" className="h-9 w-64 max-w-full pl-9 pr-3 rounded-lg border border-slate-300 text-sm" />
            </label>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-sm" role="radiogroup" aria-label="Mật khẩu tài khoản">
              <button type="button" role="radio" aria-checked={pwMode === 'pin'} onClick={() => setPwMode('pin')}
                className={`no-hover-fx h-8 px-3 rounded-lg font-bold whitespace-nowrap ${pwMode === 'pin' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}>Dùng mật khẩu điểm danh</button>
              <button type="button" role="radio" aria-checked={pwMode === 'common'} onClick={() => setPwMode('common')}
                className={`no-hover-fx h-8 px-3 rounded-lg font-bold whitespace-nowrap ${pwMode === 'common' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}>Mật khẩu chung</button>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <KeyRound className="w-4 h-4 text-amber-700" />
              <input value={commonPw} onChange={(e) => setCommonPw(e.target.value.slice(0, 40))}
                placeholder={pwMode === 'pin' ? 'Mật khẩu cho người chưa có MK điểm danh' : 'Mật khẩu chung (≥ 6 ký tự)'}
                className="h-9 w-72 max-w-full px-3 rounded-lg border border-slate-300 text-sm" />
            </label>
            <span className="ml-auto text-sm text-slate-600">Đã chọn <strong className="text-slate-900">{picked.length}</strong> / {staff.length} nhân sự</span>
          </div>

          <div className="overflow-auto max-h-[28rem] rounded-2xl border border-slate-200">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-left text-xs text-slate-600 border-b border-slate-200">
                  <th className="py-2 pl-3 pr-1 w-8">
                    <input type="checkbox" aria-label="Chọn tất cả giáo viên đang hiện" title="Chọn / bỏ chọn tất cả giáo viên (không gồm nhân viên, cán bộ quản lý)" className="w-4 h-4 accent-indigo-600"
                      checked={selectable.length > 0 && selectable.every(s => cfg[s.code]?.pick)}
                      onChange={(e) => setCfg(prev => { const n = { ...prev }; selectable.forEach(s => { n[s.code] = { ...n[s.code], pick: e.target.checked }; }); return n; })} />
                  </th>
                  <th className="py-2 pr-2">Nhân sự</th>
                  <th className="py-2 pr-2 w-40">Vai trò</th>
                  <th className="py-2 pr-2 w-44">Lớp chủ nhiệm / môn</th>
                  <th className="py-2 pr-2 w-36">Mật khẩu</th>
                  <th className="py-2 pr-3 w-44">Tài khoản</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(s => {
                  const c = cfg[s.code] || { pick: false, role: 'skip' as RoleChoice, cls: '' };
                  const linked = linkedUser(s);
                  return (
                    <tr key={s.code} className={`border-b border-slate-100 ${c.pick && !linked ? 'bg-indigo-50/40' : ''}`}>
                      <td className="py-2 pl-3 pr-1">
                        <input type="checkbox" disabled={!!linked || !cccdOf(s)} checked={!linked && !!cccdOf(s) && c.pick} aria-label={`Chọn ${s.name}`} className="w-4 h-4 accent-indigo-600"
                          onChange={(e) => setRow(s.code, { pick: e.target.checked, role: c.role === 'skip' && e.target.checked ? manualRole(s) : c.role })} />
                      </td>
                      <td className="py-2 pr-2 min-w-0">
                        <p className="font-bold text-slate-900 truncate">{s.name}</p>
                        <p className="text-xs text-slate-600 truncate">{[s.code, s.position, s.dept].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="py-2 pr-2">
                        <select value={c.role} disabled={!!linked} aria-label={`Vai trò của ${s.name}`}
                          onChange={(e) => { const role = e.target.value as RoleChoice; setRow(s.code, { role, pick: role !== 'skip', cls: role === 'subject' && !c.cls ? (s.dept || '') : role === 'homeroom' && c.role === 'subject' ? '' : c.cls }); }}
                          className="h-9 w-full px-2 rounded-lg border border-slate-300 text-sm bg-white disabled:bg-slate-100">
                          <option value="homeroom">GV chủ nhiệm</option>
                          <option value="subject">GV bộ môn</option>
                          <option value="bgh">Ban giám hiệu</option>
                          <option value="skip">Không cấp</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        {c.role === 'homeroom' || c.role === 'subject'
                          ? <input value={c.cls} disabled={!!linked} onChange={(e) => setRow(s.code, { cls: c.role === 'homeroom' ? e.target.value.toUpperCase() : e.target.value })}
                              placeholder={c.role === 'homeroom' ? 'VD: 3A1' : 'VD: Tin học'} aria-label={`Lớp / môn của ${s.name}`}
                              className="h-9 w-full px-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100" />
                          : <span className="text-slate-400">—</span>}
                        {c.role === 'homeroom' && assign[s.code] && assign[s.code].className === c.cls.trim().toUpperCase() && (assign[s.code].branch || assign[s.code].campus) && (
                          <p className="mt-0.5 text-xs text-emerald-800 truncate" title={[assign[s.code].campus, assign[s.code].branch].filter(Boolean).join(' · ')}>
                            <MapPin className="w-3 h-3 inline -mt-0.5" /> {[assign[s.code].campus, assign[s.code].branch].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-xs">
                        {pwMode === 'pin'
                          ? s.currentPin ? <span className="text-emerald-800 font-bold">MK điểm danh</span> : <span className="text-amber-800 font-bold">Chưa có → MK chung</span>
                          : <span className="text-slate-700">MK chung</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {linked
                          ? linked.username.toLowerCase() === cccdOf(s)
                            ? <span className="inline-flex items-center gap-1 font-bold text-emerald-800"><CheckCircle2 className="w-3.5 h-3.5" /> Đã có: {linked.username}{linked.staffCode ? <Link2 className="w-3.5 h-3.5" aria-label="Đã gắn nhân sự" /> : null}</span>
                            : !cccdOf(s)
                            ? <span className="font-bold text-rose-700" title="Nhập đủ số CCCD cho nhân sự ở Danh sách nhân sự để chuyển tên đăng nhập sang CCCD">Đã có: {linked.username} · thiếu số CCCD</span>
                            : <span className="font-bold text-amber-800" title="Tên đăng nhập chưa phải số CCCD — bấm Chuyển sang số CCCD">Đã có: {linked.username} → cần chuyển sang CCCD</span>
                          : cccdOf(s)
                            ? <span className="text-slate-600">Sẽ tạo: <strong className="text-slate-900">{cccdOf(s)}</strong></span>
                            : <span className="font-bold text-rose-700" title="Nhập đủ số CCCD cho nhân sự ở Danh sách nhân sự trước">Thiếu số CCCD đầy đủ</span>}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-600">Không có nhân sự phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Người đã có tài khoản được bỏ qua để không tạo trùng; người thiếu số CCCD đầy đủ không tạo được. Lớp chủ nhiệm tự viết hoa. Cần Apps Script phiên bản mới nhất.
            </p>
            <button type="button" onClick={create} disabled={busy || picked.length === 0}
              className="no-hover-fx shrink-0 h-11 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Tạo {picked.length} tài khoản
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default StaffToAccountsPanel;
