import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Save, X, CheckCircle2, Lock, History } from 'lucide-react';
import {
  teachingLogService, TEACH_META, TeachKey, TeachProfile, WeekCounts, EMPTY_PROFILE, SUBJECT_PRESETS,
  monthWeeks, monthLabel, addMonths, enabledKeys, HSKT_SUBJECTS, subjectCodesOf, ktOf, MonthWeek, TeachMonthInfo, TEACH_KEYS, SHOWN_KEYS,
  OVERTIME_SUBJECTS, otOf, subjectLabel,
} from '../../../services/teachingLogService';

type GridRow = { id: string; label: string; hint: string; get: (wk: string) => number; set: (wk: string, v: string) => void };
const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;

/** Bảng nhập số tiết: dòng = mục / môn, cột = Tuần 1…5 của tháng (giống mẫu bảng kê của nhà trường) */
const WeekGrid: React.FC<{ title: string; color: string; wks: MonthWeek[]; locked: boolean; rows: GridRow[]; extra?: React.ReactNode; warn?: string; showTotalRow?: boolean }> = ({ title, color, wks, locked, rows, extra, warn, showTotalRow }) => {
  const rowTotal = (r: GridRow) => wks.reduce((a, w) => a + r.get(w.key), 0);
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <p className="text-sm font-black" style={{ color }}>{title}</p>
        {!locked && extra}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-bold text-slate-600 border-b border-slate-200">
              <th className="py-1.5 pl-2 pr-1 lg:pl-4 text-left lg:w-40">Môn / mục</th>
              {wks.map(w => (
                <th key={w.key} className="py-1.5 px-0.5 text-center whitespace-nowrap" title={w.label}>
                  <span className="lg:hidden">T{w.index}</span><span className="max-lg:hidden">Tuần {w.index}</span>
                  <span className="block font-medium text-slate-500">{dm(w.from)}<span className="max-lg:hidden">–{dm(w.to)}</span></span>
                </th>
              ))}
              <th className="py-1.5 px-1 text-center">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-1 lg:py-1.5 pl-2 pr-1 lg:pl-4 font-bold text-slate-900 leading-tight" title={r.hint}>{r.label}</td>
                {wks.map(w => (
                  <td key={w.key} className="py-1 px-0.5 text-center">
                    <input type="text" inputMode="numeric" value={r.get(w.key) ? String(r.get(w.key)) : ''} disabled={locked}
                      onChange={(e) => r.set(w.key, e.target.value)} placeholder="0" aria-label={`${r.hint} – Tuần ${w.index}`}
                      className="w-9 sm:w-10 h-10 lg:w-20 lg:h-11 px-0.5 rounded-lg border border-slate-300 text-center text-base lg:text-lg font-bold tabular-nums disabled:bg-slate-100 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none" />
                  </td>
                ))}
                <td className="py-1 px-1 text-center font-black tabular-nums" style={{ color }}>{rowTotal(r)}</td>
              </tr>
            ))}
            {showTotalRow && rows.length > 1 && (
              <tr className="bg-slate-50 border-t border-slate-200">
                <td className="py-2 pl-2 pr-1 font-black text-slate-900">Tổng</td>
                {wks.map(w => <td key={w.key} className="py-2 px-0.5 text-center font-black tabular-nums text-slate-900">{rows.reduce((a, r) => a + r.get(w.key), 0)}</td>)}
                <td className="py-2 px-1 text-center font-black tabular-nums text-lg" style={{ color }}>{rows.reduce((a, r) => a + rowTotal(r), 0)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {warn && <p className="px-3 py-2 text-xs font-bold text-amber-900 bg-amber-50 border-t border-amber-200">{warn}</p>}
    </div>
  );
};

/**
 * 📚 Kê khai tiết dạy (trang /diemdanh, sau khi giáo viên đăng nhập bằng CCCD + mật khẩu điểm danh).
 * Bước 1: khai báo môn / lớp → Lưu. Bước 2: điền số tiết theo từng tuần trong tháng → Lưu.
 */
const LIST_FIELDS: Array<{ key: 'classesPE' | 'classesDisabled' | 'classesEnglish'; label: string; hint: string }> = [
  { key: 'classesPE', label: 'Lớp dạy Giáo dục thể chất', hint: 'Ví dụ: 3A1, 3A2, 4A1' },
  { key: 'classesDisabled', label: 'Lớp dạy có học sinh khuyết tật', hint: 'Ví dụ: 2A3, 5A1' },
  { key: 'classesEnglish', label: 'Lớp dạy thừa giờ Tiếng Anh', hint: 'Ví dụ: 3A1, 3A2, 4A1, 4A2' },
];
const splitList = (t: string) => t.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);

export const TeachingLogPanel: React.FC<{ cccd: string; pin: string; today: string }> = ({ cccd, pin, today }) => {
  const thisMonth = (today || new Date().toISOString()).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [profile, setProfile] = useState<TeachProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TeachProfile>(EMPTY_PROFILE);
  const [listText, setListText] = useState<Record<string, string>>({});
  const [otherSubject, setOtherSubject] = useState('');
  const [weeks, setWeeks] = useState<Record<string, WeekCounts>>({});
  const [note, setNote] = useState('');
  const [savedAt, setSavedAt] = useState('');
  // Khóa chốt của tháng đang xem (BGH / Quản trị bấm khóa) + danh sách các tháng đã kê (Apps Script 4.9)
  const [locked, setLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [months, setMonths] = useState<TeachMonthInfo[]>([]);
  const logRef = React.useRef<HTMLElement | null>(null);

  const load = async (m: string) => {
    setLoading(true); setMsg(null);
    const r = await teachingLogService.get(cccd, pin, m);
    setLoading(false);
    if (!r?.success) { setMsg({ ok: false, text: r?.message || 'Không tải được dữ liệu kê khai.' }); return; }
    setProfile(r.profile || null);
    setWeeks(r.log?.weeks || {});
    setNote(r.log?.note || '');
    setSavedAt(r.log?.updatedAt || '');
    setLocked(!!r.locked);
    setLockMessage(r.lockMessage || '');
    if (Array.isArray(r.months)) setMonths(r.months);
    if (!r.profile) startEdit(null);
  };
  useEffect(() => { load(month); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month]);

  const startEdit = (p: TeachProfile | null) => {
    const base = p || EMPTY_PROFILE;
    setDraft({ ...base, overtimeSubjects: base.overtimeSubjects || [] });
    setListText({ classesPE: base.classesPE.join(', '), classesDisabled: base.classesDisabled.join(', '), classesEnglish: base.classesEnglish.join(', ') });
    setOtherSubject('');
    setEditing(true);
  };

  const toggleSubject = (s: string) => setDraft(d => ({ ...d, subjects: d.subjects.includes(s) ? d.subjects.filter(x => x !== s) : [...d.subjects, s] }));

  const saveProfile = async () => {
    const p: TeachProfile = {
      subjects: draft.subjects,
      classesPE: splitList(listText.classesPE || ''),
      classesDisabled: splitList(listText.classesDisabled || ''),
      classesEnglish: splitList(listText.classesEnglish || ''),
      overtimeSubjects: draft.overtimeSubjects || [],
    };
    if (!p.subjects.length) { setMsg({ ok: false, text: 'Hãy chọn ít nhất 1 môn dạy được phân công.' }); return; }
    setBusy(true); setMsg(null);
    const r = await teachingLogService.saveProfile(cccd, pin, p);
    setBusy(false);
    if (!r?.success) { setMsg({ ok: false, text: r?.message || 'Chưa lưu được khai báo.' }); return; }
    setProfile(r.profile); setEditing(false);
    setMsg({ ok: true, text: 'Đã lưu khai báo. Tiếp theo điền số tiết theo từng tuần bên dưới.' });
  };

  const keys = useMemo(() => enabledKeys(profile), [profile]);
  const wks = useMemo(() => monthWeeks(month), [month]);
  const setCell = (wk: string, k: TeachKey, v: string) => {
    const n = Math.max(0, Math.min(80, Math.round(Number(v.replace(/\D/g, '')) || 0)));
    // Tiết GDTC = tiết dạy ngoài trời: lưu kèm outdoor bằng đúng số GDTC
    setWeeks(prev => ({ ...prev, [wk]: { ...(prev[wk] || {}), [k]: n, ...(k === 'pe' ? { outdoor: n } : {}) } }));
  };
  const [allSubjects, setAllSubjects] = useState(false);
  const ktCodes = useMemo(() => {
    const mine = subjectCodesOf(profile?.subjects);
    // Môn đã có số liệu trong tháng luôn hiện, kể cả khi đã bỏ khỏi khai báo
    const used = new Set(Object.values(weeks).flatMap(w => Object.keys(w?.kt || {})));
    if (allSubjects || !mine.length) return HSKT_SUBJECTS.map(h => h.code);
    return HSKT_SUBJECTS.map(h => h.code).filter(c => mine.includes(c) || used.has(c));
  }, [profile, weeks, allSubjects]);
  const otCodes = useMemo(() => {
    const mine = profile?.overtimeSubjects || [];
    const used = new Set(Object.values(weeks).flatMap(w => Object.keys(w?.ot || {})));
    return OVERTIME_SUBJECTS.map(h => h.code).filter(c => mine.includes(c) || used.has(c));
  }, [profile, weeks]);
  const setOt = (wk: string, code: string, v: string) => {
    const n = Math.max(0, Math.min(80, Math.round(Number(v.replace(/\D/g, '')) || 0)));
    setWeeks(prev => {
      const ot: Record<string, number> = { ...(prev[wk]?.ot || {}), [code]: n };
      if (!n) delete ot[code];
      const sum = Object.values(ot).reduce((a, x) => a + (Number(x) || 0), 0);
      return { ...prev, [wk]: { ...(prev[wk] || {}), ot, overtime: sum } };
    });
  };
  const setKt = (wk: string, code: string, v: string) => {
    const n = Math.max(0, Math.min(80, Math.round(Number(v.replace(/\D/g, '')) || 0)));
    setWeeks(prev => {
      const kt: Record<string, number> = { ...(prev[wk]?.kt || {}), [code]: n };
      if (!n) delete kt[code];
      const sum = Object.values(kt).reduce((a, x) => a + (Number(x) || 0), 0);
      return { ...prev, [wk]: { ...(prev[wk] || {}), kt, disabled: sum } };
    });
  };

  const saveLog = async () => {
    setBusy(true); setMsg(null);
    const payload: Record<string, WeekCounts> = {};
    wks.forEach(w => { if (weeks[w.key]) payload[w.key] = weeks[w.key]; });
    const r = await teachingLogService.saveLog(cccd, pin, month, payload, note);
    setBusy(false);
    if (!r?.success) {
      if (r?.code === 'LOCKED') { setLocked(true); setLockMessage(r.message || ''); }
      setMsg({ ok: false, text: r?.message || 'Chưa lưu được kê khai.' });
      return;
    }
    setSavedAt(r.log?.updatedAt || new Date().toISOString());
    setMsg({ ok: true, text: `Đã lưu kê khai ${monthLabel(month)}.` });
    // Cập nhật danh sách tháng đã kê
    const t = { outdoor: 0, pe: 0, disabled: 0, english: 0, overtime: 0 } as TeachMonthInfo['totals'];
    Object.values(r.log?.weeks || payload).forEach((w: any) => TEACH_KEYS.forEach(k => { t[k] += Number(w?.[k]) || 0; }));
    setMonths(prev => [{ month, updatedAt: r.log?.updatedAt || new Date().toISOString(), totals: t, locked: false }, ...prev.filter(x => x.month !== month)]
      .sort((a, b) => (a.month < b.month ? 1 : -1)));
  };

  if (loading && !profile && !editing) {
    return <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-600"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:gap-5 lg:items-start">
      {msg && (
        <p className={`lg:col-span-2 rounded-2xl px-4 py-3 text-sm font-bold border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'}`} role="status">{msg.text}</p>
      )}

      {/* Máy tính: cột trái = khai báo + các tháng đã kê; cột phải = bảng kê số tiết */}
      <div className={`max-lg:contents lg:space-y-4 ${editing || !profile ? 'lg:col-span-2' : 'lg:col-start-1'}`}>
        {/* Bước 1: khai báo */}
        <section className={`max-lg:order-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden`}>
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
            <p className="text-base font-black text-slate-900 inline-flex items-center gap-2"><BookOpenCheck className="w-5 h-5 text-indigo-600" /> 1. Khai báo phân công</p>
            {!editing && profile && (
              <button type="button" onClick={() => startEdit(profile)} className="no-hover-fx h-9 px-3 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"><Pencil className="w-4 h-4" /> Sửa</button>
            )}
          </div>
          {editing ? (
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-black text-slate-800">Môn dạy được phân công</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...SUBJECT_PRESETS, ...draft.subjects.filter(s => !SUBJECT_PRESETS.includes(s))].map(s => {
                    const on = draft.subjects.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => toggleSubject(s)} aria-pressed={on}
                        className={`no-hover-fx px-3 py-1.5 rounded-full text-sm font-bold border whitespace-nowrap ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                        {on && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}{s}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input value={otherSubject} onChange={(e) => setOtherSubject(e.target.value.slice(0, 40))} placeholder="Môn khác…" aria-label="Thêm môn khác"
                    className="flex-1 h-10 px-3 rounded-xl border border-slate-300 text-sm" />
                  <button type="button" disabled={!otherSubject.trim()} onClick={() => { const s = otherSubject.trim(); if (s && !draft.subjects.includes(s)) setDraft(d => ({ ...d, subjects: [...d.subjects, s] })); setOtherSubject(''); }}
                    className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"><Plus className="w-4 h-4" /> Thêm</button>
                </div>
              </div>
              {LIST_FIELDS.map(f => (
                <label key={f.key} className="block space-y-1.5">
                  <span className="text-sm font-black text-slate-800">{f.label}</span>
                  <input value={listText[f.key] || ''} onChange={(e) => setListText(t => ({ ...t, [f.key]: e.target.value }))} placeholder={f.hint}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-base" />
                  <span className="block text-xs text-slate-600">Ghi tên lớp, cách nhau bằng dấu phẩy. Để trống nếu không dạy.</span>
                </label>
              ))}
              <div className="space-y-2">
                <p className="text-sm font-black text-slate-800">Dạy thừa giờ các môn khác (ngoài Tiếng Anh)</p>
                <div className="flex flex-wrap gap-1.5">
                  {OVERTIME_SUBJECTS.map(h => {
                    const on = (draft.overtimeSubjects || []).includes(h.code);
                    return (
                      <button key={h.code} type="button" aria-pressed={on}
                        onClick={() => setDraft(d => ({ ...d, overtimeSubjects: on ? (d.overtimeSubjects || []).filter(x => x !== h.code) : [...(d.overtimeSubjects || []), h.code] }))}
                        className={`no-hover-fx px-3 py-1.5 rounded-full text-sm font-bold border whitespace-nowrap ${on ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                        {on && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}{h.label}
                      </button>
                    );
                  })}
                </div>
                <span className="block text-xs text-slate-600">Chọn các môn có dạy thừa giờ. Không dạy thừa giờ thì để trống. Thừa giờ Tiếng Anh khai ở ô lớp Tiếng Anh phía trên.</span>
              </div>
              <div className="flex gap-2">
                {profile && <button type="button" onClick={() => setEditing(false)} className="no-hover-fx flex-1 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-black inline-flex items-center justify-center gap-1.5"><X className="w-4 h-4" /> Hủy</button>}
                <button type="button" onClick={saveProfile} disabled={busy} className="no-hover-fx flex-[2] h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-black inline-flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Lưu khai báo
                </button>
              </div>
            </div>
          ) : profile ? (
            <dl className="p-5 grid grid-cols-1 gap-2 text-sm">
              <div><dt className="font-black text-slate-700">Môn dạy</dt><dd className="text-slate-900">{profile.subjects.join(', ') || '—'}</dd></div>
              {LIST_FIELDS.map(f => (
                <div key={f.key}><dt className="font-black text-slate-700">{f.label}</dt><dd className="text-slate-900">{profile[f.key].join(', ') || '—'}</dd></div>
              ))}
              <div><dt className="font-black text-slate-700">Dạy thừa giờ các môn khác</dt><dd className="text-slate-900">{(profile.overtimeSubjects || []).map(subjectLabel).join(', ') || '—'}</dd></div>
            </dl>
          ) : null}
        </section>
        {/* Bước 3: các tháng đã kê khai — xem lại, sửa khi chưa khóa */}
        {profile && !editing && months.length > 0 && (
          <section className="max-lg:order-3 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <p className="text-base font-black text-slate-900 inline-flex items-center gap-2"><History className="w-5 h-5 text-indigo-600" /> 3. Các tháng đã kê khai</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {months.map(m => {
                const sum = keys.length ? keys : SHOWN_KEYS.filter(k => (m.totals[k] || 0) > 0);
                const current = m.month === month;
                return (
                  <li key={m.month} className={`px-4 py-3 flex items-center gap-3 ${current ? 'bg-indigo-50/60' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-900 flex items-center gap-2 flex-wrap">
                        {monthLabel(m.month)}
                        {m.locked
                          ? <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full whitespace-nowrap"><Lock className="w-3 h-3" /> Đã khóa</span>
                          : <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">Sửa được</span>}
                      </p>
                      <p className="text-xs text-slate-600 truncate">
                        {sum.map(k => `${TEACH_META[k].short}: ${m.totals[k] || 0}`).join(' • ') || '—'}
                      </p>
                    </div>
                    <button type="button" disabled={current}
                      onClick={() => { setMonth(m.month); setTimeout(() => logRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }}
                      className="no-hover-fx h-9 px-3 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60">
                      {current ? 'Đang xem' : m.locked ? 'Xem' : <><Pencil className="w-4 h-4" /> Xem / sửa</>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Bước 2: kê khai theo tuần */}
      {profile && !editing && (
        <section ref={logRef} className="max-lg:order-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4 lg:col-start-2">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
            <p className="text-base font-black text-slate-900">2. Kê khai số tiết</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setMonth(m => addMonths(m, -1))} aria-label="Tháng trước" className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 inline-flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
              <span className="text-sm font-black text-slate-900 whitespace-nowrap min-w-[110px] text-center">{monthLabel(month)}</span>
              <button type="button" onClick={() => setMonth(m => addMonths(m, 1))} disabled={month >= thisMonth} aria-label="Tháng sau" className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 inline-flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>
          {keys.length === 0 ? (
            <p className="p-5 text-sm text-slate-700">Khai báo hiện tại không có mục cần kê (GDTC, lớp có HS khuyết tật, thừa giờ Tiếng Anh / các môn khác). Bấm <strong>Sửa</strong> ở phần khai báo nếu cần.</p>
          ) : (
            <div className="p-3 sm:p-5 space-y-3">
              {locked ? (
                <p className="rounded-2xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm font-bold text-rose-800 inline-flex items-start gap-2" role="status">
                  <Lock className="w-4 h-4 mt-0.5 shrink-0" /> {lockMessage || 'Bảng kê tháng này đã được khóa chốt số liệu.'}
                </p>
              ) : (
                <p className="text-xs lg:text-sm text-slate-600"><span className="lg:hidden">T1…T{wks.length}: các tuần trong tháng (ngày ghi dưới là ngày đầu tuần). </span>Kê hoặc sửa được bất cứ lúc nào cho tới khi nhà trường khóa chốt.</p>
              )}
              {keys.includes('pe') && (
                <WeekGrid title="Giáo dục thể chất (dạy ngoài trời)" color={TEACH_META.pe.text} wks={wks} locked={locked}
                  rows={[
                    { id: 'pe', label: 'Tiết GDTC', hint: 'Số tiết GDTC (dạy ngoài trời)', get: (wk) => Number(weeks[wk]?.pe) || 0, set: (wk, v) => setCell(wk, 'pe', v) },
                  ]}
                  />
              )}
              {keys.includes('disabled') && (
                <WeekGrid title="Lớp có HS khuyết tật (theo môn)" color={TEACH_META.disabled.text} wks={wks} locked={locked} showTotalRow
                  rows={ktCodes.map(code => {
                    const h = HSKT_SUBJECTS.find(x => x.code === code)!;
                    return { id: code, label: h.label, hint: `Tiết ${h.label} dạy ở lớp có HS khuyết tật`, get: (wk: string) => ktOf(weeks[wk], code), set: (wk: string, v: string) => setKt(wk, code, v) };
                  })}
                  extra={(
                    <button type="button" onClick={() => setAllSubjects(v => !v)} aria-pressed={allSubjects} className="no-hover-fx h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50 whitespace-nowrap">{allSubjects ? 'Môn đã khai báo' : 'Đủ 14 môn'}</button>
                  )} />
              )}
              {keys.includes('english') && (
                <WeekGrid title="Tiếng Anh" color={TEACH_META.english.text} wks={wks} locked={locked}
                  rows={[{ id: 'english', label: 'Thừa giờ', hint: TEACH_META.english.label, get: (wk) => Number(weeks[wk]?.english) || 0, set: (wk, v) => setCell(wk, 'english', v) }]} />
              )}
              {(keys.includes('overtime') || otCodes.length > 0) && (
                <WeekGrid title="Thừa giờ các môn khác" color={TEACH_META.overtime.text} wks={wks} locked={locked} showTotalRow
                  rows={otCodes.map(code => ({ id: 'ot-' + code, label: subjectLabel(code), hint: `Tiết dạy thừa giờ môn ${subjectLabel(code)}`, get: (wk: string) => otOf(weeks[wk], code), set: (wk: string, v: string) => setOt(wk, code, v) }))} />
              )}
              <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder="Ghi chú (nếu có)" aria-label="Ghi chú kê khai" disabled={locked}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-base disabled:bg-slate-100" />
              {!locked && <button type="button" onClick={saveLog} disabled={busy} className="no-hover-fx w-full h-12 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-base font-black inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Lưu kê khai {monthLabel(month).toLowerCase()}
              </button>}
              {savedAt && <p className="text-xs text-center text-slate-600">Lưu lần cuối: {new Date(savedAt).toLocaleString('vi-VN')}</p>}
            </div>
          )}
        </section>
      )}

    </div>
  );
};

export default TeachingLogPanel;
