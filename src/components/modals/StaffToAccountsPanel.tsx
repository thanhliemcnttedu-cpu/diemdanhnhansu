import React, { useMemo, useState } from 'react';
import { Users, Loader2, RefreshCw, KeyRound, CheckCircle2, Link2, Search } from 'lucide-react';
import type { UserAccount, UserRole } from '../../types';
import { staffAttendanceService, StaffMember } from '../../services/staffAttendanceService';
import { databaseService } from '../../services/databaseService';

/**
 * 🔗 TẠO TÀI KHOẢN PHẦN MỀM TỪ DANH SÁCH NHÂN SỰ CHẤM CÔNG (tài khoản dùng chung, Apps Script 1.1.4)
 * - Lấy họ tên, số điện thoại, mã GV từ danh sách nhân sự đã nhập (không phải nhập lại).
 * - Quản trị chỉ chọn vai trò (GVCN / GVBM / BGH) và lớp chủ nhiệm / môn dạy.
 * - Tên đăng nhập = mã GV; tài khoản gắn `staffCode` → giáo viên đăng nhập phần mềm bằng
 *   SỐ CCCD (hoặc mã GV) + MẬT KHẨU ĐIỂM DANH — chỉ 1 tài khoản, 1 mật khẩu cho cả điểm danh lẫn phần mềm.
 */
type RoleChoice = 'homeroom' | 'subject' | 'bgh' | 'skip';
interface RowCfg { pick: boolean; role: RoleChoice; cls: string }

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const SUBJECT_HINTS = ['my thuat', 'am nhac', 'tin hoc', 'tieng anh', 'the duc', 'gdtc', 'giao duc the chat', 'cong nghe', 'ngoai ngu'];

/** Đoán vai trò từ chức vụ / tổ: hiệu trưởng → BGH; giáo viên tổ bộ môn → GVBM; giáo viên khác → GVCN; nhân viên → bỏ qua */
function guessRole(s: StaffMember): { role: RoleChoice; cls: string } {
  const pos = norm(s.position || '');
  const dept = norm(s.dept || '');
  if (pos.includes('hieu truong')) return { role: 'bgh', cls: '' };
  if (!pos.includes('giao vien')) return { role: 'skip', cls: '' };
  if (SUBJECT_HINTS.some(h => dept.includes(h))) return { role: 'subject', cls: s.dept || '' };
  return { role: 'homeroom', cls: '' };
}

export const StaffToAccountsPanel: React.FC<{
  allUsers: UserAccount[];
  schoolName: string;
  onCreated: () => void | Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
}> = ({ allUsers, schoolName, onCreated, notify }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [cfg, setCfg] = useState<Record<string, RowCfg>>({});
  const [q, setQ] = useState('');
  const [pwMode, setPwMode] = useState<'pin' | 'common'>('pin');
  const [commonPw, setCommonPw] = useState('');

  /** Nhân sự đã có tài khoản: gắn mã GV hoặc tên đăng nhập trùng mã GV */
  const linkedUser = (s: StaffMember) => allUsers.find(u =>
    (u.staffCode && u.staffCode.toUpperCase() === s.code.toUpperCase()) || u.username.toLowerCase() === s.code.toLowerCase());

  const load = async () => {
    setLoading(true);
    try {
      const r = await staffAttendanceService.getRoster();
      if (!r?.success) { notify('error', r?.message || 'Không tải được danh sách nhân sự.'); return; }
      const list: StaffMember[] = (r.staff || []).filter((s: StaffMember) => !s.disabled && s.code);
      setStaff(list);
      const next: Record<string, RowCfg> = {};
      // Không chọn sẵn ai: Quản trị tự tích người cần cấp (tránh tạo nhầm hàng loạt); vai trò được đoán sẵn để đỡ thao tác
      list.forEach(s => { const g = guessRole(s); next[s.code] = { pick: false, role: g.role, cls: g.cls }; });
      setCfg(next);
      setOpen(true);
    } catch (e: any) {
      notify('error', e?.message || 'Không kết nối được Apps Script.');
    } finally { setLoading(false); }
  };

  const rows = useMemo(() => staff.filter(s => !q || norm(`${s.name} ${s.code} ${s.position || ''} ${s.dept || ''}`).includes(norm(q))), [staff, q]);
  const picked = staff.filter(s => cfg[s.code]?.pick && cfg[s.code]?.role !== 'skip' && !linkedUser(s));
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
        return {
          username: s.code.toLowerCase(),
          password,
          fullName: s.name,
          role: c.role as UserRole,
          phone: s.phone || '',
          assignedClassName: c.role === 'homeroom' ? (c.cls.trim().toUpperCase() || undefined) : undefined,
          subjectName: c.role === 'subject' ? (c.cls.trim() || undefined) : undefined,
          schoolName,
          tenantType: 'school' as const,
          staffCode: s.code,
        };
      });
      const res = await databaseService.createUsersBulk(items);
      if (!res?.success) { notify('error', res?.message || 'Chưa tạo được tài khoản.'); return; }
      notify('success', `Đã tạo ${res.count} tài khoản dùng chung với điểm danh. Giáo viên đăng nhập bằng số CCCD (hoặc mã GV) + mật khẩu điểm danh.`);
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
              Tên đăng nhập là mã GV. Giáo viên đăng nhập bằng <strong>số CCCD (hoặc mã GV) + mật khẩu điểm danh</strong>.
            </p>
          </div>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="no-hover-fx shrink-0 h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center gap-2 disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : open ? <RefreshCw className="w-4 h-4" /> : <Users className="w-4 h-4" />}
          {open ? 'Tải lại danh sách' : 'Lấy danh sách nhân sự'}
        </button>
      </div>

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
                    <input type="checkbox" aria-label="Chọn tất cả nhân sự đang hiện" className="w-4 h-4 accent-indigo-600"
                      checked={rows.length > 0 && rows.filter(s => !linkedUser(s)).every(s => cfg[s.code]?.pick)}
                      onChange={(e) => setCfg(prev => { const n = { ...prev }; rows.forEach(s => { if (!linkedUser(s)) n[s.code] = { ...n[s.code], pick: e.target.checked, role: n[s.code].role === 'skip' && e.target.checked ? 'homeroom' : n[s.code].role }; }); return n; })} />
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
                        <input type="checkbox" disabled={!!linked} checked={!linked && c.pick} aria-label={`Chọn ${s.name}`} className="w-4 h-4 accent-indigo-600"
                          onChange={(e) => setRow(s.code, { pick: e.target.checked, role: c.role === 'skip' && e.target.checked ? 'homeroom' : c.role })} />
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
                      </td>
                      <td className="py-2 pr-2 text-xs">
                        {pwMode === 'pin'
                          ? s.currentPin ? <span className="text-emerald-800 font-bold">MK điểm danh</span> : <span className="text-amber-800 font-bold">Chưa có → MK chung</span>
                          : <span className="text-slate-700">MK chung</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {linked
                          ? <span className="inline-flex items-center gap-1 font-bold text-emerald-800"><CheckCircle2 className="w-3.5 h-3.5" /> Đã có: {linked.username}{linked.staffCode ? <Link2 className="w-3.5 h-3.5" aria-label="Đã gắn nhân sự" /> : null}</span>
                          : <span className="text-slate-600">Sẽ tạo: <strong className="text-slate-900">{s.code.toLowerCase()}</strong></span>}
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
              Người đã có tài khoản (cùng mã GV) được bỏ qua để không tạo trùng. Lớp chủ nhiệm tự viết hoa. Cần Apps Script phiên bản mới nhất để đăng nhập bằng CCCD.
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
