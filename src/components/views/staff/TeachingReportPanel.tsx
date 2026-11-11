import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BookOpenCheck, ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, Lock, LockOpen, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { StaffMember } from '../../../services/staffAttendanceService';
import {
  teachingLogService, SHOWN_KEYS as TEACH_KEYS, TEACH_META, TeachKey, TeachLog, TeachProfile, monthWeeks, monthLabel, addMonths, enabledKeys, sumLog,
  HSKT_SUBJECTS, ktOf, TeachLock, isTeachLocked, subjectLabel, schoolYearOf,
} from '../../../services/teachingLogService';
import { exportTH1, exportTH2, exportTH3, exportOvertime, MonthPack, createdLabel, infoLines } from '../../../services/teachingReportExcel';

const ORG_KEY = 'lhhp_teach_report_org';
const readOrg = () => { try { return localStorage.getItem(ORG_KEY) || ''; } catch { return ''; } };

/**
 * 📚 Tổng hợp KÊ KHAI TIẾT DẠY cho BGH / Quản trị (màn Chấm công nhân sự → thẻ "Kê khai tiết dạy").
 * Xem theo tháng: tổng hợp 4 mục, hoặc từng mục theo từng tuần; xuất Excel đúng mẫu TH1 / TH2 / TH3 của nhà trường
 * (teachingReportExcel.ts) hoặc 1 tệp tổng hợp tất cả.
 */
type View = 'all' | TeachKey;
/** Lớp (hoặc môn, với thừa giờ môn khác) giáo viên khai báo cho từng mục */
const classesOf = (p: TeachProfile | null | undefined, k: TeachKey): string[] => {
  if (!p) return [];
  if (k === 'overtime') return (p.overtimeSubjects || []).map(subjectLabel);
  return (k === 'disabled' ? p.classesDisabled : k === 'english' ? p.classesEnglish : p.classesPE) || [];
};

export const TeachingReportPanel: React.FC<{ auth: { username: string; password: string }; schoolName: string; today: string }> = ({ auth, schoolName, today }) => {
  const thisMonth = (today || new Date().toISOString()).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [profiles, setProfiles] = useState<Record<string, TeachProfile>>({});
  const [logs, setLogs] = useState<Record<string, TeachLog>>({});
  const [menu, setMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 16 });
  // Phạm vi xuất: tháng đang xem hoặc tất cả các tháng (từ tháng 8 của năm học tới tháng hiện tại) đã có số liệu
  const [scope, setScope] = useState<'month' | 'all'>('month');
  const [exporting, setExporting] = useState(false);
  // Khóa chốt kê khai theo tháng (Apps Script 4.9)
  const [locks, setLocks] = useState<Record<string, TeachLock>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [lockBusy, setLockBusy] = useState(false);
  const [notice, setNotice] = useState('');
  // Xóa bảng kê để giáo viên kê lại (Apps Script 4.10)
  const [delTarget, setDelTarget] = useState<{ codes: string[]; names: string[] } | null>(null);
  const [delReason, setDelReason] = useState('');
  const [delUnlock, setDelUnlock] = useState(true);
  const [delBusy, setDelBusy] = useState(false);
  // 'log' = chỉ xóa số tiết tháng này; 'all' = xóa cả khai báo phân công (bỏ khỏi bảng tổng hợp)
  const [delMode, setDelMode] = useState<'log' | 'all'>('log');
  const [org, setOrg] = useState(readOrg);
  const saveOrg = (v: string) => { setOrg(v); try { localStorage.setItem(ORG_KEY, v); } catch { /* bỏ qua */ } };

  // Cài đặt kê khai của trường: bật / tắt kê khai cho giáo viên chủ nhiệm (Apps Script 1.1.6; undefined = Apps Script cũ)
  const [homeroomTeach, setHomeroomTeach] = useState<boolean | undefined>(undefined);
  const [settingBusy, setSettingBusy] = useState(false);
  const toggleHomeroomTeach = async () => {
    const next = !(homeroomTeach ?? true);
    if (!next && !confirm('TẮT kê khai tiết dạy cho giáo viên chủ nhiệm?\nTài khoản vai trò GV chủ nhiệm chỉ còn điểm danh hằng ngày; số liệu đã kê vẫn giữ nguyên.')) return;
    setSettingBusy(true);
    const r = await teachingLogService.settings({ homeroomTeach: next }, auth);
    setSettingBusy(false);
    if (!r?.success || !r.settings) { setErr(r?.message || 'Chưa lưu được cài đặt (cần Apps Script phiên bản mới nhất).'); return; }
    setHomeroomTeach(r.settings.homeroomTeach);
    setNotice(r.message || '');
  };

  const load = async () => {
    setLoading(true); setErr('');
    const r = await teachingLogService.report(month, month, auth);
    setLoading(false);
    if (!r?.success) { setErr(r?.message || 'Không tải được số liệu kê khai.'); return; }
    setHomeroomTeach(r.settings ? r.settings.homeroomTeach !== false : undefined);
    setStaff(r.staff || []);
    setProfiles(r.profiles || {});
    setLogs((r.logs || {})[month] || {});
    setLocks(r.locks || {});
    setPicked(new Set());
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month]);

  const wks = useMemo(() => monthWeeks(month), [month]);
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  // Giáo viên liên quan: có khai báo mục cần kê, hoặc đã kê số liệu
  const rows = useMemo(() => staff
    .filter(s => !s.disabled)
    .map(s => ({ s, p: profiles[s.code] || null, log: logs[s.code] || null }))
    .filter(x => {
      const keys = enabledKeys(x.p);
      const has = TEACH_KEYS.some(k => sumLog(x.log, k) > 0);
      if (view === 'all') return keys.length > 0 || has;
      return keys.includes(view) || sumLog(x.log, view) > 0;
    })
    .filter(x => !q || norm(`${x.s.name} ${x.s.position || ''} ${x.s.dept || ''} ${(x.p?.subjects || []).join(' ')}`).includes(norm(q))), [staff, profiles, logs, view, q]);

  // Danh sách theo từng mẫu (thứ tự danh sách nhân sự)
  const listFor = (k: TeachKey, src: Record<string, TeachLog> = logs) => staff.filter(s => !s.disabled)
    .map(s => ({ s, p: profiles[s.code] || null, log: src[s.code] || null }))
    .filter(x => enabledKeys(x.p).includes(k) || sumLog(x.log, k) > 0)
    .map(x => ({ name: x.s.name, log: x.log }));
  const otList = (src: Record<string, TeachLog> = logs) => staff.filter(s => !s.disabled)
    .map(s => ({ s, p: profiles[s.code] || null, log: src[s.code] || null }))
    .filter(x => enabledKeys(x.p).includes('overtime') || sumLog(x.log, 'overtime') > 0)
    .map(x => ({ name: x.s.name, log: x.log, subjects: x.p?.overtimeSubjects || [] }));
  const declaredFor = (k: TeachKey) => staff.filter(s => !s.disabled && enabledKeys(profiles[s.code]).includes(k)).length;

  /** Số liệu cần xuất theo phạm vi: [{ tháng, tuần, số liệu }] — "tất cả" thì tải lại từ Apps Script */
  const loadMonths = async (): Promise<Array<{ month: string; wks: ReturnType<typeof monthWeeks>; logs: Record<string, TeachLog> }>> => {
    if (scope === 'month') return [{ month, wks, logs }];
    const from = `${schoolYearOf(thisMonth).slice(0, 4)}-08`;
    const r = await teachingLogService.report(from, thisMonth, auth);
    if (!r?.success) throw new Error(r?.message || 'Không tải được số liệu các tháng.');
    return Object.keys(r.logs || {})
      .filter(m => Object.keys(r.logs![m] || {}).length > 0)
      .sort()
      .map(m => ({ month: m, wks: monthWeeks(m), logs: r.logs![m] }));
  };
  const runExport = async (make: (months: Awaited<ReturnType<typeof loadMonths>>, created: string) => Promise<void>) => {
    setMenu(false); setErr(''); setExporting(true);
    try {
      const months = await loadMonths();
      if (!months.length) throw new Error('Chưa có tháng nào có số liệu kê khai.');
      await make(months, createdLabel());
    } catch (e: any) {
      setErr('Không xuất được tệp Excel: ' + (e?.message || e));
    } finally { setExporting(false); }
  };
  /** Gói số liệu từng tháng cho 1 mẫu; bỏ tháng không có giáo viên nào của mẫu đó (khi xuất nhiều tháng) */
  const packsOf = <E extends { name: string; log: TeachLog | null }>(months: Awaited<ReturnType<typeof loadMonths>>, pick: (src: Record<string, TeachLog>) => E[]): MonthPack<E>[] => {
    const packs = months.map(m => ({ h: { org, school: schoolName || '', month: m.month, wks: m.wks }, list: pick(m.logs) }));
    const useful = packs.filter(p => p.list.some(x => x.log));
    if (months.length === 1) return packs.filter(p => p.list.length);
    if (!useful.length) throw new Error('Các tháng chưa có số liệu cho mẫu này.');
    return useful;
  };
  const ktTable = useMemo(() => HSKT_SUBJECTS.map(h => ({
    h, vals: wks.map(w => Object.values(logs).reduce((a, l) => a + ktOf(l?.weeks?.[w.key], h.code), 0)),
  })), [logs, wks]);

  const totals = useMemo(() => {
    const t = { outdoor: 0, pe: 0, disabled: 0, english: 0, overtime: 0 } as Record<TeachKey, number>; // outdoor không hiển thị
    Object.values(logs).forEach(l => TEACH_KEYS.forEach(k => { t[k] += sumLog(l, k); }));
    return t;
  }, [logs]);
  const monthLock = locks[month] || null;
  const lockedCount = monthLock && !monthLock.all ? Object.keys(monthLock.codes || {}).length : 0;
  const doLock = async (lock: boolean, target: { all?: boolean; codes?: string[] }) => {
    setLockBusy(true); setErr(''); setNotice('');
    const r = await teachingLogService.lock(month, lock, target, auth);
    setLockBusy(false);
    if (!r?.success) { setErr(r?.message || 'Chưa khóa / mở khóa được.'); return; }
    setLocks(prev => { const n = { ...prev }; if (r.lock) n[month] = r.lock; else delete n[month]; return n; });
    setPicked(new Set());
    const who = target.all ? 'toàn trường' : `${target.codes?.length || 0} giáo viên`;
    setNotice(lock ? `Đã khóa chốt kê khai ${monthLabel(month).toLowerCase()} (${who}).` : `Đã mở khóa kê khai ${monthLabel(month).toLowerCase()} (${who}) — giáo viên tiếp tục kê / sửa được.`);
  };
  const askDelete = (codes: string[]) => {
    const usable = codes.filter(c => logs[c] || profiles[c]);
    if (!usable.length) { setErr('Giáo viên đã chọn chưa có khai báo hay số liệu kê khai.'); return; }
    setErr(''); setDelReason(''); setDelUnlock(true);
    // Không có số tiết tháng này (chỉ khai báo nhầm) → mặc định xóa khỏi bảng tổng hợp
    setDelMode(usable.some(c => logs[c]) ? 'log' : 'all');
    setDelTarget({ codes: usable, names: usable.map(c => staff.find(s => s.code === c)?.name || c) });
  };
  const confirmDelete = async () => {
    if (!delTarget) return;
    setDelBusy(true); setErr(''); setNotice('');
    const removeProfile = delMode === 'all';
    const r = await teachingLogService.deleteLog(month, delTarget.codes, { reason: delReason.trim(), unlock: delUnlock, removeProfile }, auth);
    setDelBusy(false);
    if (!r?.success) { setErr(r?.message || 'Chưa xóa được dữ liệu kê khai.'); setDelTarget(null); return; }
    const removed = r.removed || delTarget.codes;
    setLogs(prev => { const n = { ...prev }; removed.forEach(c => { delete n[c]; }); return n; });
    if (removeProfile) {
      const gone = r.removedProfiles || [];
      if (gone.length) setProfiles(prev => { const n = { ...prev }; gone.forEach(c => { delete n[c]; }); return n; });
      else if (!r.removedProfiles) setErr('Apps Script của trường chưa xóa được khai báo (cần cập nhật Apps Script lên phiên bản mới nhất). Số tiết tháng này đã được xóa.');
    }
    if (delUnlock) setLocks(prev => { const n = { ...prev }; if (r.lock) n[month] = r.lock; else delete n[month]; return n; });
    setPicked(new Set());
    setDelTarget(null);
    setNotice(removed.length
      ? removeProfile
        ? `Đã xóa ${removed.length === 1 ? delTarget.names[0] : removed.length + ' giáo viên'} khỏi bảng tổng hợp (xóa khai báo phân công và số tiết ${monthLabel(month).toLowerCase()}).`
        : `Đã xóa kê khai ${monthLabel(month).toLowerCase()} của ${removed.length === 1 ? delTarget.names[0] : removed.length + ' giáo viên'}.${delUnlock ? ' Đã mở khóa để kê lại.' : ''}`
      : 'Không có dữ liệu kê khai để xóa.');
  };
  const declared = staff.filter(s => !s.disabled && enabledKeys(profiles[s.code]).length > 0);
  const submitted = declared.filter(s => logs[s.code]?.updatedAt).length;

  const weekVal = (l: TeachLog | null, wk: string, k: TeachKey) => Number(l?.weeks?.[wk]?.[k]) || 0;

  const exportExcel = async (months: Awaited<ReturnType<typeof loadMonths>>, created: string) => {
    const wb = XLSX.utils.book_new();
    const multi = months.length > 1;
    months.forEach(m => {
      const title = `TỔNG HỢP KÊ KHAI TIẾT DẠY – ${monthLabel(m.month).toUpperCase()}${schoolName ? ' • ' + schoolName.toUpperCase() : ''}`;
      const all = staff.filter(s => !s.disabled).map(s => ({ s, p: profiles[s.code] || null, log: m.logs[s.code] || null }))
        .filter(x => enabledKeys(x.p).length || TEACH_KEYS.some(k => sumLog(x.log, k) > 0));
      const tot = (k: TeachKey) => all.reduce((a, x) => a + sumLog(x.log, k), 0);
      const s0: any[][] = [[title], ...infoLines(m.month, created).map(l => [l]), [], ['STT', 'Họ và tên', 'Chức vụ', 'Môn dạy', ...TEACH_KEYS.map(k => TEACH_META[k].label), 'Đã kê khai', 'Ghi chú']];
      all.forEach((x, i) => s0.push([i + 1, x.s.name, x.s.position || '', (x.p?.subjects || []).join(', '), ...TEACH_KEYS.map(k => sumLog(x.log, k)), x.log?.updatedAt ? 'Có' : 'Chưa', x.log?.note || '']));
      s0.push(['', 'TỔNG CỘNG', '', '', ...TEACH_KEYS.map(k => tot(k)), '', '']);
      const ws0 = XLSX.utils.aoa_to_sheet(s0);
      ws0['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 16 }, { wch: 28 }, ...TEACH_KEYS.map(() => ({ wch: 16 })), { wch: 11 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws0, multi ? `Tong hop T${Number(m.month.slice(5, 7))}-${m.month.slice(0, 4)}` : 'Tong hop');
    });
    if (multi) { XLSX.writeFile(wb, `KeKhai_TietDay_${months[0].month}_den_${months[months.length - 1].month}.xlsx`); return; }
    const info = infoLines(month, created);
    TEACH_KEYS.forEach(k => {
      const list = staff.filter(s => !s.disabled).map(s => ({ s, p: profiles[s.code] || null, log: logs[s.code] || null }))
        .filter(x => enabledKeys(x.p).includes(k) || sumLog(x.log, k) > 0);
      const sh: any[][] = [[`${TEACH_META[k].label.toUpperCase()} – ${monthLabel(month)}`], ...info.map(l => [l]), [],
        ['STT', 'Họ và tên', 'Lớp', ...wks.map(w => w.label), 'Tổng tháng']];
      list.forEach((x, i) => sh.push([i + 1, x.s.name, classesOf(x.p, k).join(', '), ...wks.map(w => weekVal(x.log, w.key, k)), sumLog(x.log, k)]));
      sh.push(['', 'TỔNG CỘNG', '', ...wks.map(w => list.reduce((a, x) => a + weekVal(x.log, w.key, k), 0)), list.reduce((a, x) => a + sumLog(x.log, k), 0)]);
      const ws = XLSX.utils.aoa_to_sheet(sh);
      ws['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 22 }, ...wks.map(() => ({ wch: 20 })), { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, TEACH_META[k].short.replace(/[^A-Za-z0-9À-ỹ ]/g, '').slice(0, 28));
    });
    XLSX.writeFile(wb, `KeKhai_TietDay_${month}.xlsx`);
  };

  return (
    <div className="space-y-3">
      {delTarget && (
        <div className="fixed inset-0 z-50 bg-sky-900/20 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="del-teach-title">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5" /></div>
              <div className="min-w-0 flex-1">
                <p id="del-teach-title" className="text-base font-black text-slate-900">Xóa kê khai tiết dạy</p>
                <p className="text-sm text-slate-700">
                  {delTarget.names.length === 1 ? <>Giáo viên <strong>{delTarget.names[0]}</strong></> : <><strong>{delTarget.names.length} giáo viên</strong></>}. Dữ liệu đã xóa không khôi phục được.
                </p>
              </div>
              <button type="button" onClick={() => setDelTarget(null)} aria-label="Đóng" className="no-hover-fx w-8 h-8 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {delTarget.names.length > 1 && (
                <p className="text-xs text-slate-600 max-h-20 overflow-y-auto">{delTarget.names.join(', ')}</p>
              )}
              <fieldset className="space-y-2">
                <legend className="sr-only">Mức xóa</legend>
                <label className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer ${delMode === 'log' ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200'}`}>
                  <input type="radio" name="del-mode" checked={delMode === 'log'} onChange={() => setDelMode('log')} className="mt-0.5 w-4 h-4 accent-rose-700" />
                  <span className="text-sm text-slate-800"><strong className="block text-slate-900">Chỉ xóa số tiết {monthLabel(month).toLowerCase()}</strong>Giữ khai báo phân công; giáo viên kê lại số tiết tháng này.</span>
                </label>
                <label className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer ${delMode === 'all' ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200'}`}>
                  <input type="radio" name="del-mode" checked={delMode === 'all'} onChange={() => setDelMode('all')} className="mt-0.5 w-4 h-4 accent-rose-700" />
                  <span className="text-sm text-slate-800"><strong className="block text-slate-900">Xóa khỏi bảng tổng hợp</strong>Dùng khi giáo viên khai báo nhầm: xóa cả khai báo môn / lớp và số tiết tháng này. Giáo viên muốn kê lại phải khai báo từ đầu.</span>
                </label>
              </fieldset>
              <label className="block space-y-1">
                <span className="text-sm font-bold text-slate-800">Lý do (không bắt buộc)</span>
                <input value={delReason} onChange={(e) => setDelReason(e.target.value.slice(0, 200))} placeholder="Ví dụ: số tiết tuần 2 chưa đúng, kê lại"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm" />
              </label>
              <label className={`flex items-center gap-2 text-sm text-slate-800 ${delMode === 'all' ? 'hidden' : ''}`}>
                <input type="checkbox" checked={delUnlock} onChange={(e) => setDelUnlock(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                Mở khóa để giáo viên kê lại ngay
              </label>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button type="button" onClick={() => setDelTarget(null)} className="no-hover-fx h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-800">Hủy</button>
              <button type="button" onClick={confirmDelete} disabled={delBusy} className="no-hover-fx h-10 px-4 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-sm font-black inline-flex items-center gap-1.5 disabled:opacity-50">
                {delBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} {delMode === 'all' ? 'Xóa khỏi bảng' : 'Xóa số tiết'}
              </button>
            </div>
          </div>
        </div>
      )}
      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
          <p className="text-base font-black text-slate-900 inline-flex items-center gap-2 mr-auto whitespace-nowrap"><BookOpenCheck className="w-5 h-5 text-indigo-600" /> Kê khai tiết dạy</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMonth(m => addMonths(m, -1))} aria-label="Tháng trước" className="no-hover-fx w-9 h-9 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
            <span className="text-sm font-black text-slate-900 whitespace-nowrap min-w-[110px] text-center">{monthLabel(month)}</span>
            <button type="button" onClick={() => setMonth(m => addMonths(m, 1))} disabled={month >= thisMonth} aria-label="Tháng sau" className="no-hover-fx w-9 h-9 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <button type="button" onClick={load} disabled={loading} className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Tải lại
          </button>
          <div className="relative">
            <button type="button" onClick={(e) => {
                // The card clips its content (overflow-hidden), so the menu is placed with fixed coordinates under the button
                const r = e.currentTarget.getBoundingClientRect();
                setMenuPos({ top: Math.round(r.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
                setMenu(v => !v);
              }} disabled={loading || !staff.length} aria-expanded={menu} aria-haspopup="menu"
              className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold bg-emerald-700 hover:bg-emerald-800 text-white inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {exporting ? 'Đang tạo tệp…' : 'Xuất Excel'} <ChevronDown className="w-4 h-4" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden="true" />
                <div role="menu" style={{ top: menuPos.top, right: menuPos.right, maxHeight: `calc(100vh - ${menuPos.top + 12}px)` }}
                  className="fixed z-50 w-[680px] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-xl p-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                  <div className="space-y-2">
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">Cơ quan chủ quản (dòng 1 của bảng kê)</span>
                    <input value={org} onChange={(e) => saveOrg(e.target.value.slice(0, 80))} placeholder="Ví dụ: UBND XÃ …"
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" />
                  </label>
                  <fieldset className="rounded-xl bg-slate-50 border border-slate-200 p-2 space-y-1">
                    <legend className="px-1 text-xs font-bold text-slate-700">Phạm vi tải về</legend>
                    {([
                      ['month', `Biểu tổng hợp ${monthLabel(month).toLowerCase()}`, 'Trang tổng hợp + mỗi giáo viên 1 trang'],
                      ['all', 'Biểu tổng hợp tất cả các tháng', `Năm học ${schoolYearOf(thisMonth)}: mỗi tháng có số liệu 1 trang tổng hợp`],
                    ] as const).map(([v, label, hint]) => (
                      <label key={v} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${scope === v ? 'bg-white shadow-xs' : ''}`}>
                        <input type="radio" name="teach-export-scope" checked={scope === v} onChange={() => setScope(v)} className="mt-0.5 w-4 h-4 accent-emerald-700" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-slate-900">{label}</span>
                          <span className="block text-xs text-slate-600">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <p className="text-xs text-slate-600">Chọn phạm vi ở đây, rồi bấm biểu cần tải ở cột bên.</p>
                  </div>
                  <div className="space-y-2">
                  {([
                    ['TH1', 'TH1. Bảng kê dạy lớp có HS khuyết tật', 'Đúng mẫu TonghopKT', () => runExport((ms, c) => exportTH1(packsOf(ms, src => listFor('disabled', src)), c)), listFor('disabled').length || declaredFor('disabled')],
                    ['TH2', 'TH2. Bảng kê dạy GDTC (ngoài trời)', 'Đúng mẫu TonghopGDTC', () => runExport((ms, c) => exportTH2(packsOf(ms, src => listFor('pe', src)), c)), listFor('pe').length || declaredFor('pe')],
                    ['TH3', 'TH3. Bảng kê dạy thừa giờ Tiếng Anh', 'Đúng mẫu TongTA', () => runExport((ms, c) => exportTH3(packsOf(ms, src => listFor('english', src)), c)), listFor('english').length || declaredFor('english')],
                    ['TG', 'Bảng kê dạy thừa giờ các môn khác', 'Khuôn TH3: mỗi môn của GV 1 dòng', () => runExport((ms, c) => exportOvertime(packsOf(ms, src => otList(src)), c)), otList().length || declaredFor('overtime')],
                  ] as Array<[string, string, string, () => Promise<void>, number]>).map(([code, label, hint, run, n]) => (
                    <button key={code} type="button" role="menuitem" disabled={!n || exporting} onClick={() => { run(); }}
                      className="no-hover-fx w-full text-left rounded-xl border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 px-3 py-2 flex items-start gap-2.5 disabled:opacity-50 disabled:hover:bg-white">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-900">{label}</span>
                        <span className="block text-xs text-slate-600">{n ? hint : 'Chưa có giáo viên khai báo mục này'}</span>
                      </span>
                    </button>
                  ))}
                  <button type="button" role="menuitem" disabled={exporting} onClick={() => { runExport(exportExcel); }}
                    className="no-hover-fx w-full text-left rounded-xl border border-slate-200 hover:bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">Tổng hợp tất cả mục (1 tệp)</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {err && <p className="mx-4 mt-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm font-bold text-rose-800">{err}</p>}

        {/* Số liệu toàn trường */}
        <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-bold text-slate-600 uppercase">Đã kê khai</p>
            <p className="text-2xl font-black text-slate-900 tabular-nums">{submitted}<span className="text-base text-slate-500">/{declared.length}</span></p>
            <p className="text-xs text-slate-600">giáo viên có mục cần kê</p>
          </div>
          {TEACH_KEYS.map(k => (
            <div key={k} className="rounded-xl border p-3" style={{ background: TEACH_META[k].soft, borderColor: TEACH_META[k].color + '40' }}>
              <p className="text-xs font-bold uppercase whitespace-nowrap" style={{ color: TEACH_META[k].text }}>{TEACH_META[k].short}</p>
              <p className="text-2xl font-black tabular-nums" style={{ color: TEACH_META[k].text }}>{totals[k]}</p>
              <p className="text-xs text-slate-600">tiết trong tháng</p>
            </div>
          ))}
        </div>

        <div className="mx-4 mb-3 rounded-xl border px-3 py-2.5 flex flex-wrap items-center gap-2"
          style={monthLock?.all ? { background: '#fff1f2', borderColor: '#fecdd3' } : { background: '#f8fafc', borderColor: '#e2e8f0' }}>
          <p className={`text-sm font-bold inline-flex items-center gap-1.5 mr-auto ${monthLock?.all ? 'text-rose-800' : 'text-slate-800'}`}>
            {monthLock?.all ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
            {monthLock?.all
              ? `${monthLabel(month)} đã khóa chốt cho toàn trường — giáo viên chỉ xem, không sửa được.`
              : lockedCount
                ? `${monthLabel(month)}: đang khóa ${lockedCount} giáo viên; những người khác vẫn kê / sửa được.`
                : `${monthLabel(month)}: giáo viên đang kê / sửa được bất cứ lúc nào.`}
          </p>
          {picked.size > 0 && (
            <>
              <span className="text-sm font-bold text-slate-700 whitespace-nowrap">Đã chọn {picked.size}</span>
              <button type="button" disabled={lockBusy} onClick={() => doLock(true, { codes: [...picked] })} className="no-hover-fx h-9 px-3 rounded-lg text-sm font-bold bg-rose-700 hover:bg-rose-800 text-white inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"><Lock className="w-4 h-4" /> Khóa</button>
              <button type="button" disabled={lockBusy} onClick={() => doLock(false, { codes: [...picked] })} className="no-hover-fx h-9 px-3 rounded-lg text-sm font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"><LockOpen className="w-4 h-4" /> Mở khóa</button>
              <button type="button" disabled={lockBusy || delBusy} onClick={() => askDelete([...picked])} className="no-hover-fx h-9 px-3 rounded-lg text-sm font-bold border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"><Trash2 className="w-4 h-4" /> Xóa kê khai</button>
            </>
          )}
          {monthLock?.all || lockedCount
            ? <button type="button" disabled={lockBusy} onClick={() => doLock(false, { all: true })} className="no-hover-fx h-9 px-3 rounded-lg text-sm font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">{lockBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockOpen className="w-4 h-4" />} Mở khóa tất cả</button>
            : null}
          {!monthLock?.all && (
            <button type="button" disabled={lockBusy} onClick={() => doLock(true, { all: true })} className="no-hover-fx h-9 px-3 rounded-lg text-sm font-bold bg-rose-700 hover:bg-rose-800 text-white inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">{lockBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Khóa chốt {monthLabel(month).toLowerCase()}</button>
          )}
        </div>
        {homeroomTeach !== undefined && (
          <div className="mx-4 mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-800 mr-auto">
              <strong>Kê khai tiết dạy của giáo viên chủ nhiệm:</strong>{' '}
              {homeroomTeach
                ? <span className="text-emerald-800 font-bold">Đang BẬT</span>
                : <span className="text-rose-700 font-bold">Đang TẮT</span>}
              <span className="text-slate-600"> — {homeroomTeach ? 'GVCN kê khai như giáo viên khác.' : 'tài khoản vai trò GV chủ nhiệm chỉ điểm danh hằng ngày.'}</span>
            </p>
            <button type="button" role="switch" aria-checked={homeroomTeach} disabled={settingBusy} onClick={toggleHomeroomTeach}
              title={homeroomTeach ? 'Bấm để tắt kê khai cho giáo viên chủ nhiệm' : 'Bấm để bật kê khai cho giáo viên chủ nhiệm'}
              className={`no-hover-fx relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${homeroomTeach ? 'bg-emerald-600' : 'bg-slate-300'}`}>
              <span className="sr-only">Kê khai tiết dạy cho giáo viên chủ nhiệm</span>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${homeroomTeach ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        )}
        {notice && <p className="mx-4 mb-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-900" role="status">{notice}</p>}

        <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar" role="tablist" aria-label="Mục xem">
            {(['all', ...TEACH_KEYS] as View[]).map(v => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`no-hover-fx h-8 px-3 rounded-lg text-sm font-bold whitespace-nowrap ${view === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                {v === 'all' ? 'Tổng hợp' : TEACH_META[v].short}
              </button>
            ))}
          </div>
          <label className="relative ml-auto">
            <span className="sr-only">Tìm giáo viên</span>
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm giáo viên, môn…" className="h-9 w-56 max-w-full pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm" />
          </label>
        </div>

        {view === 'disabled' && (
          <div className="mx-4 mb-3 rounded-xl border border-violet-200 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="text-left px-3 py-2 text-sm font-black text-violet-900 bg-violet-50 border-b border-violet-200">Toàn trường theo môn (mẫu TonghopKT)</caption>
              <thead>
                <tr className="text-xs font-bold uppercase text-slate-600 bg-slate-50 border-b border-slate-200 whitespace-nowrap">
                  <th className="py-2 pl-3 pr-2 text-left">Môn</th>
                  {wks.map(w => <th key={w.key} className="py-2 px-2 text-center" title={w.label}>Tuần {w.index}</th>)}
                  <th className="py-2 px-3 text-center text-violet-900">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {ktTable.map(({ h, vals }) => (
                  <tr key={h.code} className="border-b border-slate-100">
                    <td className="py-1.5 pl-3 pr-2 font-bold text-slate-900 whitespace-nowrap">{h.label}</td>
                    {vals.map((v, i) => <td key={i} className="py-1.5 px-2 text-center tabular-nums">{v || <span className="text-slate-400">0</span>}</td>)}
                    <td className="py-1.5 px-3 text-center font-black tabular-nums text-violet-900">{vals.reduce((a, b) => a + b, 0)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-black">
                  <td className="py-2 pl-3 pr-2 text-slate-900">Tổng</td>
                  {wks.map((w, i) => <td key={w.key} className="py-2 px-2 text-center tabular-nums">{ktTable.reduce((a, r) => a + r.vals[i], 0)}</td>)}
                  <td className="py-2 px-3 text-center tabular-nums text-violet-900">{ktTable.reduce((a, r) => a + r.vals.reduce((x, y) => x + y, 0), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-600 bg-slate-50 border-y border-slate-200 whitespace-nowrap">
                <th className="py-3 pl-4 pr-1 w-8">
                  <input type="checkbox" aria-label="Chọn tất cả giáo viên đang hiện" className="w-4 h-4 accent-indigo-600"
                    checked={rows.length > 0 && rows.every(x => picked.has(x.s.code))}
                    onChange={(e) => setPicked(e.target.checked ? new Set(rows.map(x => x.s.code)) : new Set())} />
                </th>
                <th className="py-3 pr-2 w-10 text-center">STT</th>
                <th className="py-3 pr-2">Giáo viên</th>
                {view === 'all'
                  ? TEACH_KEYS.map(k => <th key={k} className="py-3 px-2 text-center" title={TEACH_META[k].label} style={{ color: TEACH_META[k].text }}>{TEACH_META[k].short}</th>)
                  : <>
                    <th className="py-3 pr-2">{view === 'overtime' ? 'Môn' : 'Lớp'}</th>
                    {wks.map(w => <th key={w.key} className="py-3 px-2 text-center" title={w.label}>Tuần {w.index}</th>)}
                    <th className="py-3 px-2 text-center" style={{ color: TEACH_META[view].text }}>Tổng</th>
                  </>}
                <th className="py-3 px-3 text-center">Trạng thái</th>
                <th className="py-3 pl-2 pr-4 text-center w-20">Khóa / Xóa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={x.s.code} className="border-b border-slate-100 hover:bg-sky-50/50">
                  <td className="py-2.5 pl-4 pr-1">
                    <input type="checkbox" aria-label={`Chọn ${x.s.name}`} className="w-4 h-4 accent-indigo-600" checked={picked.has(x.s.code)}
                      onChange={(e) => setPicked(prev => { const n = new Set(prev); if (e.target.checked) n.add(x.s.code); else n.delete(x.s.code); return n; })} />
                  </td>
                  <td className="py-2.5 pr-2 text-center text-slate-500 tabular-nums">{i + 1}</td>
                  <td className="py-2.5 pr-2">
                    <p className="font-bold text-slate-900 whitespace-nowrap">{x.s.name}</p>
                    <p className="text-xs text-slate-600 truncate max-w-[260px]" title={(x.p?.subjects || []).join(', ')}>{(x.p?.subjects || []).join(', ') || x.s.position || '—'}</p>
                  </td>
                  {view === 'all'
                    ? TEACH_KEYS.map(k => <td key={k} className="py-2.5 px-2 text-center font-black tabular-nums" style={{ color: sumLog(x.log, k) ? TEACH_META[k].text : '#94a3b8' }}>{enabledKeys(x.p).includes(k) || sumLog(x.log, k) ? sumLog(x.log, k) : '—'}</td>)
                    : <>
                      <td className="py-2.5 pr-2 text-slate-700 text-xs max-w-[160px] truncate" title={classesOf(x.p, view).join(', ')}>{classesOf(x.p, view).join(', ') || '—'}</td>
                      {wks.map(w => <td key={w.key} className="py-2.5 px-2 text-center tabular-nums">{weekVal(x.log, w.key, view) || <span className="text-slate-400">0</span>}</td>)}
                      <td className="py-2.5 px-2 text-center font-black tabular-nums" style={{ color: TEACH_META[view].text }}>{sumLog(x.log, view)}</td>
                    </>}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    {x.log?.updatedAt
                      ? <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full" title={`Lưu lúc ${new Date(x.log.updatedAt).toLocaleString('vi-VN')}`}>Đã kê khai</span>
                      : <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">Chưa kê khai</span>}
                  </td>
                  <td className="py-2.5 pl-2 pr-4 text-center whitespace-nowrap">
                    {(() => {
                      const on = isTeachLocked(monthLock, x.s.code);
                      return (
                        <button type="button" disabled={lockBusy} onClick={() => doLock(!on, { codes: [x.s.code] })}
                          title={on ? 'Đã khóa — bấm để mở khóa cho giáo viên này' : 'Đang mở — bấm để khóa giáo viên này'} aria-label={on ? `Mở khóa ${x.s.name}` : `Khóa ${x.s.name}`}
                          className={`no-hover-fx w-8 h-8 rounded-lg inline-flex items-center justify-center disabled:opacity-50 ${on ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'text-slate-500 hover:bg-slate-100'}`}>
                          {on ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                        </button>
                      );
                    })()}
                    <button type="button" disabled={(!x.log && !x.p) || delBusy} onClick={() => askDelete([x.s.code])}
                      title={x.log ? 'Xóa số tiết tháng này / xóa khỏi bảng tổng hợp' : 'Xóa khỏi bảng tổng hợp (khai báo nhầm)'} aria-label={`Xóa kê khai của ${x.s.name}`}
                      className="no-hover-fx w-8 h-8 rounded-lg inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={12} className="py-10 text-center text-slate-600">Chưa có giáo viên khai báo mục này. Giáo viên khai báo tại trang điểm danh → thẻ <strong>Kê khai tiết dạy</strong>.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default TeachingReportPanel;
