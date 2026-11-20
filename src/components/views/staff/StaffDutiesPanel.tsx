import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Loader2, RefreshCw, Save, Search } from 'lucide-react';
import { staffAttendanceService, StaffMember, StaffDuties, StaffDutyKey, STAFF_DUTY_KEYS, STAFF_DUTY_META } from '../../../services/staffAttendanceService';
import { databaseService } from '../../../services/databaseService';
import type { UserAccount } from '../../../types';
import { StaffGroupChips } from '../../common/StaffGroupChips';
import { staffGroupOf, StaffGroupFilter } from '../../../utils/staffGroups';

/**
 * "Phân công nhiệm vụ" (Apps Script 1.1.14): Ban giám hiệu / Quản trị tick which staff member may, after signing in
 * on the check-in page with their own ID number, view + export staff attendance, check in for others, view + export
 * the teaching-log summary, or view + export the boarding meal report. Re-assigning = untick one person, tick another.
 */
const same = (a?: StaffDuties, b?: StaffDuties) => STAFF_DUTY_KEYS.every(k => Boolean(a?.[k]) === Boolean(b?.[k]));
const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Duties that need a software account: the person signs in to the admin side to view / export these reports */
const REPORT_DUTIES: StaffDutyKey[] = ['attendance', 'proxy', 'teach', 'meal'];
const cccdOf = (s: StaffMember) => { const d = String(s.currentCccd || s.cccd || '').replace(/\D/g, ''); return d.length >= 9 && d.length <= 12 ? d : ''; };
const isExecutive = (u: UserAccount) => u.role === 'admin' || u.role === 'school_admin' || u.role === 'bgh' || u.role === 'guest_admin' || u.isBgh || u.isSchoolAdmin;
/** Account of a roster member: linked staff code, or user name equal to the staff code / ID number */
const findUser = (users: UserAccount[], s: StaffMember) => users.find(u => {
  const un = u.username.toLowerCase();
  return (u.staffCode && u.staffCode.toUpperCase() === s.code.toUpperCase()) || un === s.code.toLowerCase() || (!!cccdOf(s) && un === cccdOf(s));
});

export const StaffDutiesPanel: React.FC<{ auth: { username: string; password: string } | null; schoolName?: string }> = ({ auth, schoolName }) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [groupFilter, setGroupFilter] = useState<StaffGroupFilter>('all');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [saved, setSaved] = useState<Record<string, StaffDuties>>({});
  const [draft, setDraft] = useState<Record<string, StaffDuties>>({});
  const [log, setLog] = useState<Array<{ at: string; by: string; code: string; duties: StaffDuties }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState('');

  const apply = (r: any) => {
    setStaff((r.staff || []).filter((s: StaffMember) => !s.disabled));
    setSaved(r.duties || {}); setDraft(r.duties || {}); setLog(r.log || []);
  };
  const load = async () => {
    setLoading(true); setMsg(null);
    const r = await staffAttendanceService.duties(null, auth);
    setLoading(false);
    if (!r?.success) {
      setMsg({ ok: false, text: /Hành động không hợp lệ|staffAttendanceRange|Chỉ Quản trị \/ BGH hoặc tài khoản/i.test(String(r?.message || '')) || !r?.duties
        ? (r?.code === 'UNAUTHORIZED' && /phân công/i.test(String(r?.message || '')) ? r.message : 'Chức năng phân công nhiệm vụ cần Apps Script của trường từ phiên bản 1.1.14. Vui lòng cập nhật Apps Script rồi mở lại.')
        : (r?.message || 'Không tải được bảng phân công.') });
      return;
    }
    apply(r);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { databaseService.getUsers().then(setUsers).catch(() => { /* no account list: filter falls back to position text */ }); }, []);

  /**
   * Whoever is given a report duty must be able to sign in to the admin side and read it. Create the missing account
   * (non-teaching staff account that may view the attendance reports, same sign-in as the check-in page) or switch the
   * report permission on for an existing teacher / staff account. Leaders (Ban giám hiệu, admins) already see everything.
   */
  const ensureAccounts = async (codes: string[]): Promise<string> => {
    const want = codes.filter(c => REPORT_DUTIES.some(k => draft[c]?.[k]));
    if (!want.length) return '';
    let list = users;
    try { list = await databaseService.getUsers(); } catch { /* use the list we have */ }
    let full: StaffMember[] = staff;
    try { const rr = await staffAttendanceService.getRoster(); if (rr?.success && rr.staff?.length) full = rr.staff; } catch { /* roster without ID numbers */ }
    const create: Parameters<typeof databaseService.createUsersBulk>[0] = [];
    const missing: string[] = [];
    const notCccd: string[] = [];
    let granted = 0;
    for (const code of want) {
      const s = full.find(x => x.code === code) || staff.find(x => x.code === code);
      if (!s) continue;
      const u = findUser(list, s);
      if (u) {
        if (isExecutive(u)) continue;
        // Proxy / duty requests are authorised by ID number: an account named after the staff code must be switched first
        if (cccdOf(s) && u.username.toLowerCase() !== cccdOf(s)) notCccd.push(s.name);
        if (u.staffReportViewer && !(u.nonTeaching && u.role !== 'bgh')) continue;
        // Non-teaching staff also get the school-wide dashboard + statistics (read-only): Ban giám hiệu role, limited menu
        const r = await databaseService.updateUser(u.username, u.nonTeaching ? { role: 'bgh', staffReportViewer: true } : { staffReportViewer: true });
        if (r?.success) granted++;
        continue;
      }
      const cccd = cccdOf(s);
      if (!cccd || !s.currentPin) { missing.push(s.name); continue; }
      create.push({
        username: cccd, password: s.currentPin, fullName: s.name, role: 'bgh', nonTeaching: true, staffReportViewer: true,
        phone: s.phone || '', schoolName: schoolName || '', tenantType: 'school', staffCode: s.code,
      });
    }
    let created = 0;
    if (create.length) {
      const r = await databaseService.createUsersBulk(create);
      if (r?.success) created = r.count || create.length;
    }
    try { setUsers(await databaseService.getUsers()); } catch { /* keep the old list */ }
    const parts: string[] = [];
    if (created) parts.push(`đã tự tạo ${created} tài khoản xem số liệu (thống kê, chấm công; chỉ xem; đăng nhập bằng số căn cước + mật khẩu điểm danh)`);
    if (granted) parts.push(`đã cấp quyền xem báo cáo cho ${granted} tài khoản có sẵn`);
    if (missing.length) parts.push(`chưa tạo được tài khoản cho ${missing.join(', ')} vì thiếu số căn cước đầy đủ hoặc mật khẩu điểm danh`);
    if (notCccd.length) parts.push(`${notCccd.join(', ')} đang đăng nhập bằng tên khác số căn cước — vào Tài khoản & CSDL, bấm "Chuyển sang số CCCD" để nhiệm vụ hoạt động trong phần mềm`);
    return parts.length ? ` Tài khoản: ${parts.join('; ')}.` : '';
  };

  const changed = useMemo(() => staff.filter(s => !same(saved[s.code], draft[s.code])).map(s => s.code), [staff, saved, draft]);
  const toggle = (code: string, k: StaffDutyKey) => setDraft(d => ({ ...d, [code]: { ...(d[code] || {}), [k]: !d[code]?.[k] } }));
  const save = async () => {
    setBusy(true); setMsg(null);
    const set: Record<string, StaffDuties> = {};
    changed.forEach(c => { set[c] = draft[c] || {}; });
    const r = await staffAttendanceService.duties(set, auth);
    setBusy(false);
    if (!r?.success) { setMsg({ ok: false, text: r?.message || 'Chưa lưu được phân công.' }); return; }
    apply(r);
    let accountNote = '';
    try { accountNote = await ensureAccounts(changed); } catch { accountNote = ' Chưa kiểm tra được tài khoản phần mềm của những người vừa được giao.'; }
    setMsg({ ok: true, text: `Đã lưu phân công cho ${changed.length} người. Có hiệu lực ở lần đăng nhập kế tiếp của họ trên trang Điểm danh.${accountNote}` });
  };

  const groupOfStaff = (s: StaffMember) => staffGroupOf(s, findUser(users, s));
  const groupCounts: Record<string, number> = {};
  staff.forEach(s => { const g = groupOfStaff(s); groupCounts[g] = (groupCounts[g] || 0) + 1; });
  const shown = staff.filter(s => (!query.trim() || norm(`${s.name} ${s.position || ''} ${s.dept || ''}`).includes(norm(query.trim())))
    && (groupFilter === 'all' || groupOfStaff(s) === groupFilter))
    .slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'vi'));
  const nameOf = (code: string) => staff.find(s => s.code === code)?.name || code;
  const dutyText = (d: StaffDuties) => STAFF_DUTY_KEYS.filter(k => d?.[k]).map(k => STAFF_DUTY_META[k].short).join(', ') || 'không còn nhiệm vụ';

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden" aria-labelledby="duties-title">
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><ClipboardCheck className="w-5 h-5" aria-hidden="true" /></span>
        <div className="flex-1 min-w-[220px]">
          <h2 id="duties-title" className="normal-case text-base font-bold text-slate-900">Phân công nhiệm vụ</h2>
          <p className="text-sm text-slate-600">Người được giao đăng nhập trang Điểm danh bằng số căn cước công dân của mình sẽ thấy thêm thẻ tương ứng. Đổi người: bỏ tích người cũ, tích người mới.</p>
        </div>
        <button type="button" onClick={load} disabled={loading || busy} className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Tải lại
        </button>
        <button type="button" onClick={save} disabled={busy || changed.length === 0}
          className="no-hover-fx h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu phân công{changed.length ? ` (${changed.length})` : ''}
        </button>
      </div>

      {msg && <p role="status" className={`mx-4 sm:mx-5 mt-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-800'}`}>{msg.text}</p>}

      <div className="px-4 sm:px-5 pt-3">
        <StaffGroupChips value={groupFilter} onChange={setGroupFilter} counts={groupCounts} total={staff.length} />
      </div>
      <div className="px-4 sm:px-5 py-3">
        <label className="relative block max-w-md">
          <span className="sr-only">Tìm nhân sự</span>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo tên, chức vụ"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
      </div>

      <div className="overflow-x-auto border-t border-slate-200">
        <table className="w-full text-sm min-w-[720px]" data-duties-table>
          <thead>
            <tr className="bg-slate-50 text-slate-800">
              <th scope="col" className="normal-case px-4 py-2.5 text-left font-bold">Nhân sự</th>
              {STAFF_DUTY_KEYS.map(k => (
                <th key={k} scope="col" className="normal-case px-2 py-2.5 text-center font-bold align-bottom" title={STAFF_DUTY_META[k].hint}>
                  {STAFF_DUTY_META[k].label}
                  <span className="block text-xs font-normal text-slate-600">{STAFF_DUTY_META[k].hint}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-600">{loading ? 'Đang tải…' : 'Chưa có nhân sự phù hợp.'}</td></tr>}
            {shown.map(s => {
              const dirty = !same(saved[s.code], draft[s.code]);
              return (
                <tr key={s.code} className={`border-t border-slate-100 ${dirty ? 'bg-blue-50/60' : ''}`}>
                  <td className="px-4 py-2">
                    <span className="block font-semibold text-slate-900">{s.name}</span>
                    <span className="block text-xs text-slate-600">{[s.position, s.dept].filter(Boolean).join(' · ') || s.code}</span>
                  </td>
                  {STAFF_DUTY_KEYS.map(k => (
                    <td key={k} className="px-2 py-2 text-center">
                      <label className="inline-flex items-center justify-center w-11 h-11 cursor-pointer">
                        <span className="sr-only">{STAFF_DUTY_META[k].label} – {s.name}</span>
                        <input type="checkbox" checked={Boolean(draft[s.code]?.[k])} onChange={() => toggle(s.code, k)} disabled={busy}
                          className="w-5 h-5 rounded border-slate-400 text-blue-600 focus:ring-2 focus:ring-blue-600 cursor-pointer" />
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {log.length > 0 && (
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200">
          <h3 className="normal-case text-sm font-bold text-slate-900 mb-1.5">Lần thay đổi gần đây</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {log.slice(0, 8).map((l, i) => (
              <li key={`${l.at}-${i}`}><span className="tabular-nums text-slate-500">{new Date(l.at).toLocaleString('vi-VN')}</span> · <strong className="text-slate-900">{nameOf(l.code)}</strong>: {dutyText(l.duties)} <span className="text-slate-500">(bởi {l.by})</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default StaffDutiesPanel;
