import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BookOpenCheck, ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, RefreshCw, Search } from 'lucide-react';
import { StaffMember } from '../../../services/staffAttendanceService';
import {
  teachingLogService, TEACH_KEYS, TEACH_META, TeachKey, TeachLog, TeachProfile, monthWeeks, monthLabel, addMonths, enabledKeys, sumLog,
  HSKT_SUBJECTS, ktOf,
} from '../../../services/teachingLogService';
import { exportTH1, exportTH2, exportTH3, exportOutdoor } from '../../../services/teachingReportExcel';

const ORG_KEY = 'lhhp_teach_report_org';
const readOrg = () => { try { return localStorage.getItem(ORG_KEY) || ''; } catch { return ''; } };

/**
 * 📚 Tổng hợp KÊ KHAI TIẾT DẠY cho BGH / Quản trị (màn Chấm công nhân sự → thẻ "Kê khai tiết dạy").
 * Xem theo tháng: tổng hợp 4 mục, hoặc từng mục theo từng tuần; xuất Excel đúng mẫu TH1 / TH2 / TH3 của nhà trường
 * (teachingReportExcel.ts) hoặc 1 tệp tổng hợp tất cả.
 */
type View = 'all' | TeachKey;
const CLASS_FIELD: Record<TeachKey, keyof TeachProfile> = { outdoor: 'classesPE', pe: 'classesPE', disabled: 'classesDisabled', english: 'classesEnglish' };

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
  const [org, setOrg] = useState(readOrg);
  const saveOrg = (v: string) => { setOrg(v); try { localStorage.setItem(ORG_KEY, v); } catch { /* bỏ qua */ } };

  const load = async () => {
    setLoading(true); setErr('');
    const r = await teachingLogService.report(month, month, auth);
    setLoading(false);
    if (!r?.success) { setErr(r?.message || 'Không tải được số liệu kê khai.'); return; }
    setStaff(r.staff || []);
    setProfiles(r.profiles || {});
    setLogs((r.logs || {})[month] || {});
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
  const listFor = (k: TeachKey) => staff.filter(s => !s.disabled)
    .map(s => ({ s, p: profiles[s.code] || null, log: logs[s.code] || null }))
    .filter(x => enabledKeys(x.p).includes(k) || sumLog(x.log, k) > 0)
    .map(x => ({ name: x.s.name, log: x.log }));
  const header = () => ({ org, school: schoolName || '', month, wks });
  const ktTable = useMemo(() => HSKT_SUBJECTS.map(h => ({
    h, vals: wks.map(w => Object.values(logs).reduce((a, l) => a + ktOf(l?.weeks?.[w.key], h.code), 0)),
  })), [logs, wks]);

  const totals = useMemo(() => {
    const t = { outdoor: 0, pe: 0, disabled: 0, english: 0 } as Record<TeachKey, number>;
    Object.values(logs).forEach(l => TEACH_KEYS.forEach(k => { t[k] += sumLog(l, k); }));
    return t;
  }, [logs]);
  const declared = staff.filter(s => !s.disabled && enabledKeys(profiles[s.code]).length > 0);
  const submitted = declared.filter(s => logs[s.code]?.updatedAt).length;

  const weekVal = (l: TeachLog | null, wk: string, k: TeachKey) => Number(l?.weeks?.[wk]?.[k]) || 0;

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const title = `TỔNG HỢP KÊ KHAI TIẾT DẠY – ${monthLabel(month).toUpperCase()}${schoolName ? ' • ' + schoolName.toUpperCase() : ''}`;
    const all = staff.filter(s => !s.disabled).map(s => ({ s, p: profiles[s.code] || null, log: logs[s.code] || null }))
      .filter(x => enabledKeys(x.p).length || TEACH_KEYS.some(k => sumLog(x.log, k) > 0));
    const s0: any[][] = [[title], [], ['STT', 'Họ và tên', 'Chức vụ', 'Môn dạy', ...TEACH_KEYS.map(k => TEACH_META[k].label), 'Đã kê khai', 'Ghi chú']];
    all.forEach((x, i) => s0.push([i + 1, x.s.name, x.s.position || '', (x.p?.subjects || []).join(', '), ...TEACH_KEYS.map(k => sumLog(x.log, k)), x.log?.updatedAt ? 'Có' : 'Chưa', x.log?.note || '']));
    s0.push(['', 'TỔNG CỘNG', '', '', ...TEACH_KEYS.map(k => totals[k]), '', '']);
    const ws0 = XLSX.utils.aoa_to_sheet(s0);
    ws0['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 16 }, { wch: 28 }, ...TEACH_KEYS.map(() => ({ wch: 16 })), { wch: 11 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws0, 'Tong hop');
    TEACH_KEYS.forEach(k => {
      const list = all.filter(x => enabledKeys(x.p).includes(k) || sumLog(x.log, k) > 0);
      const sh: any[][] = [[`${TEACH_META[k].label.toUpperCase()} – ${monthLabel(month)}`], [],
        ['STT', 'Họ và tên', 'Lớp', ...wks.map(w => w.label), 'Tổng tháng']];
      list.forEach((x, i) => sh.push([i + 1, x.s.name, ((x.p?.[CLASS_FIELD[k]] as string[]) || []).join(', '), ...wks.map(w => weekVal(x.log, w.key, k)), sumLog(x.log, k)]));
      sh.push(['', 'TỔNG CỘNG', '', ...wks.map(w => list.reduce((a, x) => a + weekVal(x.log, w.key, k), 0)), list.reduce((a, x) => a + sumLog(x.log, k), 0)]);
      const ws = XLSX.utils.aoa_to_sheet(sh);
      ws['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 22 }, ...wks.map(() => ({ wch: 20 })), { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, TEACH_META[k].short.replace(/[^A-Za-z0-9À-ỹ ]/g, '').slice(0, 28));
    });
    XLSX.writeFile(wb, `KeKhai_TietDay_${month}.xlsx`);
  };

  return (
    <div className="space-y-3">
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
            <button type="button" onClick={() => setMenu(v => !v)} disabled={loading || !staff.length} aria-expanded={menu} aria-haspopup="menu"
              className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold bg-emerald-700 hover:bg-emerald-800 text-white inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
              <Download className="w-4 h-4" /> Xuất Excel <ChevronDown className="w-4 h-4" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden="true" />
                <div role="menu" className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white border border-slate-200 shadow-xl p-3 space-y-2">
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">Cơ quan chủ quản (dòng 1 của bảng kê)</span>
                    <input value={org} onChange={(e) => saveOrg(e.target.value.slice(0, 80))} placeholder="Ví dụ: UBND XÃ …"
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" />
                  </label>
                  {([
                    ['TH1', 'TH1. Bảng kê dạy lớp có HS khuyết tật', 'Đúng mẫu: trang TonghopKT + mỗi GV 1 trang', () => exportTH1(header(), listFor('disabled')), listFor('disabled').length],
                    ['TH2', 'TH2. Bảng kê dạy Giáo dục thể chất', 'Đúng mẫu: trang TonghopGDTC + mỗi GV 1 trang', () => exportTH2(header(), listFor('pe')), listFor('pe').length],
                    ['TH3', 'TH3. Bảng kê dạy thừa giờ Tiếng Anh', 'Đúng mẫu: trang TongTA + mỗi GV 1 trang', () => exportTH3(header(), listFor('english')), listFor('english').length],
                    ['NT', 'Bảng kê tiết GDTC dạy ngoài trời', 'Khuôn TH2, tiêu đề ngoài trời', () => exportOutdoor(header(), listFor('outdoor')), listFor('outdoor').length],
                  ] as Array<[string, string, string, () => Promise<void>, number]>).map(([code, label, hint, run, n]) => (
                    <button key={code} type="button" role="menuitem" disabled={!n} onClick={() => { setMenu(false); run().catch(e => setErr('Không xuất được tệp Excel: ' + (e?.message || e))); }}
                      className="no-hover-fx w-full text-left rounded-xl border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 px-3 py-2 flex items-start gap-2.5 disabled:opacity-50 disabled:hover:bg-white">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-900">{label}</span>
                        <span className="block text-xs text-slate-600">{n ? hint : 'Chưa có giáo viên khai báo mục này'}</span>
                      </span>
                    </button>
                  ))}
                  <button type="button" role="menuitem" onClick={() => { exportExcel(); setMenu(false); }}
                    className="no-hover-fx w-full text-left rounded-xl border border-slate-200 hover:bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">Tổng hợp tất cả mục (1 tệp)</button>
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
                <th className="py-3 pl-4 pr-2 w-10 text-center">STT</th>
                <th className="py-3 pr-2">Giáo viên</th>
                {view === 'all'
                  ? TEACH_KEYS.map(k => <th key={k} className="py-3 px-2 text-center" title={TEACH_META[k].label} style={{ color: TEACH_META[k].text }}>{TEACH_META[k].short}</th>)
                  : <>
                    <th className="py-3 pr-2">Lớp</th>
                    {wks.map(w => <th key={w.key} className="py-3 px-2 text-center" title={w.label}>Tuần {w.index}</th>)}
                    <th className="py-3 px-2 text-center" style={{ color: TEACH_META[view].text }}>Tổng</th>
                  </>}
                <th className="py-3 px-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={x.s.code} className="border-b border-slate-100 hover:bg-sky-50/50">
                  <td className="py-2.5 pl-4 pr-2 text-center text-slate-500 tabular-nums">{i + 1}</td>
                  <td className="py-2.5 pr-2">
                    <p className="font-bold text-slate-900 whitespace-nowrap">{x.s.name}</p>
                    <p className="text-xs text-slate-600 truncate max-w-[260px]" title={(x.p?.subjects || []).join(', ')}>{(x.p?.subjects || []).join(', ') || x.s.position || '—'}</p>
                  </td>
                  {view === 'all'
                    ? TEACH_KEYS.map(k => <td key={k} className="py-2.5 px-2 text-center font-black tabular-nums" style={{ color: sumLog(x.log, k) ? TEACH_META[k].text : '#94a3b8' }}>{enabledKeys(x.p).includes(k) || sumLog(x.log, k) ? sumLog(x.log, k) : '—'}</td>)
                    : <>
                      <td className="py-2.5 pr-2 text-slate-700 text-xs max-w-[160px] truncate" title={((x.p?.[CLASS_FIELD[view]] as string[]) || []).join(', ')}>{((x.p?.[CLASS_FIELD[view]] as string[]) || []).join(', ') || '—'}</td>
                      {wks.map(w => <td key={w.key} className="py-2.5 px-2 text-center tabular-nums">{weekVal(x.log, w.key, view) || <span className="text-slate-400">0</span>}</td>)}
                      <td className="py-2.5 px-2 text-center font-black tabular-nums" style={{ color: TEACH_META[view].text }}>{sumLog(x.log, view)}</td>
                    </>}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    {x.log?.updatedAt
                      ? <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full" title={`Lưu lúc ${new Date(x.log.updatedAt).toLocaleString('vi-VN')}`}>Đã kê khai</span>
                      : <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">Chưa kê khai</span>}
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
