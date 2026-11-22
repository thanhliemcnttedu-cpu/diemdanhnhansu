import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Award, CalendarRange, Download, Gift, TrendingUp, Users, BookOpen } from 'lucide-react';
import { useClassroom } from '../../context/ClassroomContext';
import { writeReportXlsx } from '../../utils/licensedExport';
import { computeWeek, dateKeyOf, addDaysKey, mondayOf, vnDate, vnDateFull, daysBetween, parseKey } from '../../utils/weeklySummary';
import type { Student } from '../../types';

/**
 * "Tổng kết kỳ" — month / term / school year / any date range chosen by the homeroom teacher.
 * Same numbers as the weekly review (computeWeek with a free range), compared with the previous period of the same length,
 * plus the weeks already saved in the weekly journal. Rates only count days on which the class really took attendance.
 */
export type Preset = 'month' | 'lastMonth' | 'hk1' | 'hk2' | 'year' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');
const lastDayOf = (y: number, m: number) => new Date(y, m, 0).getDate(); // m = 1..12
const SIGN = (n: number) => (n > 0 ? `+${n}` : String(n));

const Card: React.FC<{ n: number; title: string; icon: React.ReactNode; hint?: string; children: React.ReactNode }> = ({ n, title, icon, hint, children }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden" aria-label={title}>
    <header className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
      <span className="w-8 h-8 rounded-xl bg-sky-100 text-sky-800 font-black text-sm flex items-center justify-center shrink-0">{n}</span>
      <h2 className="normal-case text-base font-black text-slate-900 flex items-center gap-2">{icon}{title}</h2>
      {hint && <span className="text-sm text-slate-600">{hint}</span>}
    </header>
    <div className="p-4 sm:p-5 space-y-4">{children}</div>
  </section>
);

const Delta: React.FC<{ value: number | null; unit?: string }> = ({ value, unit = '' }) => {
  if (value === null || Number.isNaN(value)) return <span className="text-sm font-bold text-slate-600 whitespace-nowrap">chưa có kỳ trước để so</span>;
  const tone = value > 0 ? 'text-emerald-800' : value < 0 ? 'text-rose-800' : 'text-slate-700';
  return <span className={`text-sm font-bold whitespace-nowrap ${tone}`}>{value > 0 ? '▲ ' : value < 0 ? '▼ ' : '= '}{SIGN(value)}{unit} so với kỳ trước</span>;
};

// Award texts come from the weekly calculation: turn "tuần" wording into period wording
const forPeriod = (t: string) => t.replace('của tuần', 'của kỳ').replace('nhất tuần', 'nhất kỳ').replace('tuần trước', 'kỳ trước').replace('trong tuần', 'trong kỳ');

export const PeriodSummaryView: React.FC<{ preset?: Preset; hideChips?: boolean; onPresetChange?: (p: Preset) => void; onOpenWeek?: (weekStart: string) => void }> = ({ preset: presetProp, hideChips, onPresetChange, onOpenWeek }) => {
  const { activeClassId, classes, currentClassStudents, attendanceRecords, transactions, teacherRole, subjectTeacherConfig, weeklyJournal } = useClassroom();
  const cls = classes.find(c => c.id === activeClassId);
  const isSubject = teacherRole === 'subject';
  const subjectName = isSubject ? subjectTeacherConfig?.subjectName : undefined;
  const now = new Date();
  const today = dateKeyOf(now);
  const schoolYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1; // Aug onwards = new school year
  const students = currentClassStudents as Student[];

  const rangeOf = (p: Preset): [string, string] => {
    const y = now.getFullYear(), m = now.getMonth() + 1;
    if (p === 'month') return [`${y}-${pad(m)}-01`, today];
    if (p === 'lastMonth') { const d = new Date(y, m - 2, 1); const yy = d.getFullYear(), mm = d.getMonth() + 1; return [`${yy}-${pad(mm)}-01`, `${yy}-${pad(mm)}-${pad(lastDayOf(yy, mm))}`]; }
    if (p === 'hk1') return [`${schoolYear}-09-01`, `${schoolYear + 1}-01-31`];
    if (p === 'hk2') return [`${schoolYear + 1}-02-01`, `${schoolYear + 1}-05-31`];
    if (p === 'year') return [`${schoolYear}-09-01`, `${schoolYear + 1}-05-31`];
    return [`${y}-${pad(m)}-01`, today];
  };
  const [preset, setPreset] = useState<Preset>(presetProp || 'month');
  const [[from, to], setRange] = useState<[string, string]>(() => rangeOf(presetProp || 'month'));
  const pick = (p: Preset) => { setPreset(p); onPresetChange?.(p); if (p !== 'custom') setRange(rangeOf(p)); };
  // The hub's chip bar drives the preset when the chips here are hidden
  useEffect(() => { if (presetProp && presetProp !== preset) { setPreset(presetProp); if (presetProp !== 'custom') setRange(rangeOf(presetProp)); } }, [presetProp]);
  const setFrom = (v: string) => { if (!v) return; setPreset('custom'); onPresetChange?.('custom'); setRange([v, v > to ? v : to]); };
  const setTo = (v: string) => { if (!v) return; setPreset('custom'); onPresetChange?.('custom'); setRange([v < from ? v : from, v]); };

  // Never count the future: the effective end is today at most
  const effTo = to > today ? today : to;
  const valid = from <= effTo;
  const span = valid ? daysBetween(from, effTo) : 0;
  const tooLong = span > 400;

  const data = useMemo(() => (valid && !tooLong ? computeWeek({
    students,
    records: attendanceRecords.filter(r => r.classId === activeClassId),
    transactions: transactions.filter(t => t.classId === activeClassId),
    weekStart: from, rangeEnd: effTo, subjectName,
  }) : null), [students, attendanceRecords, transactions, activeClassId, from, effTo, subjectName, valid, tooLong]);

  // attendance rate per calendar week inside the range (only weeks with at least one attendance day)
  const weekBars = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { present: number; marked: number }>();
    data.att.days.forEach(d => { if (d.marked > 0) { const k = mondayOf(d.date); const e = m.get(k) || { present: 0, marked: 0 }; e.present += d.present; e.marked += d.marked; m.set(k, e); } });
    return [...m.entries()].sort().map(([k, v]) => ({ week: k, rate: Math.round((v.present / v.marked) * 1000) / 10 }));
  }, [data]);

  const journal = useMemo(() => weeklyJournal
    .filter(e => e.classId === activeClassId && (e.subjectName || '') === (subjectName || '') && e.weekStart >= mondayOf(from) && e.weekStart <= effTo)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart)), [weeklyJournal, activeClassId, subjectName, from, effTo]);

  const label = `${vnDateFull(from)} – ${vnDateFull(effTo)}`;
  const rateDelta = data && data.att.rate !== null && data.prevAtt.rate !== null ? Math.round((data.att.rate - data.prevAtt.rate) * 10) / 10 : null;
  const [msg, setMsg] = useState('');
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  const copyPraise = (title: string, names: string[], reason: string) => {
    const text = `Chúc mừng ${names.join(', ')} đạt danh hiệu "${title}" giai đoạn ${label} lớp ${cls?.name || ''}. ${reason}.`;
    navigator.clipboard?.writeText(text).then(() => flash('Đã chép lời khen, dán vào Zalo hoặc Thư khen.'), () => flash('Không chép được, hãy tự bôi đen và sao chép.'));
  };

  const exportXlsx = () => {
    if (!data) return;
    const rows: (string | number)[][] = [
      [`TỔNG KẾT ${label} • LỚP ${cls?.name || ''}${subjectName ? ` • MÔN ${subjectName}` : ''}`],
      [`Kỳ trước để so sánh: ${vnDateFull(data.prevStart)} – ${vnDateFull(data.prevEnd)}`],
      [],
      ['STT', 'Họ và tên', 'Tổ', 'Xu kỳ này', 'Xu kỳ trước', 'Chênh lệch', 'Số buổi có mặt', 'Số buổi điểm danh', 'Tỷ lệ chuyên cần'],
    ];
    data.perStudent.forEach((p, i) => {
      const r = rows.length + 1;
      rows.push([p.student.stt ?? i + 1, p.student.name, p.student.group || '', p.xu, p.prevXu, { f: `D${r}-E${r}` } as any, p.present, p.marked, { f: `IF(H${r}=0,"",G${r}/H${r})` } as any]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Tong_ket_ky');
    writeReportXlsx(wb, `Tong_ket_ky_${cls?.name || 'lop'}_${from}_${effTo}.xlsx`);
  };

  const chip = (p: Preset, text: string) => (
    <button key={p} type="button" onClick={() => pick(p)} aria-pressed={preset === p}
      className={`no-hover-fx min-h-10 px-3 rounded-xl text-sm font-bold whitespace-nowrap cursor-pointer border ${preset === p ? 'bg-sky-700 text-white border-sky-700' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}>{text}</button>
  );
  const dateCls = 'h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900 tabular-nums';
  const th = 'px-3 py-2 text-left text-xs font-black uppercase text-slate-700 bg-slate-50 whitespace-nowrap';
  const td = 'px-3 py-2 text-sm text-slate-900 border-t border-slate-100';

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-5 space-y-4" data-report>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <CalendarRange className="w-6 h-6 text-sky-700" />
          <h1 className="normal-case text-xl font-black text-slate-900">Tổng kết theo tháng, học kỳ, năm học hoặc khoảng ngày tự chọn</h1>
        </div>
        {!hideChips && <div className="flex flex-wrap gap-2">
          {chip('month', 'Tháng này')}{chip('lastMonth', 'Tháng trước')}{chip('hk1', 'Học kỳ 1')}{chip('hk2', 'Học kỳ 2')}{chip('year', 'Cả năm học')}{chip('custom', 'Tự chọn')}
        </div>}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-bold text-slate-800 flex items-center gap-2 whitespace-nowrap">Từ ngày <input type="date" className={dateCls} value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="text-sm font-bold text-slate-800 flex items-center gap-2 whitespace-nowrap">Đến ngày <input type="date" className={dateCls} value={to} onChange={e => setTo(e.target.value)} /></label>
          <button type="button" onClick={exportXlsx} disabled={!data} className="no-hover-fx min-h-10 px-3 rounded-xl bg-emerald-700 text-white text-sm font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"><Download className="w-4 h-4" />Xuất Excel</button>
        </div>
        <p className="text-sm text-slate-700">Khoảng {label} ({span} ngày). Học kỳ 1 tính từ 01/09 đến 31/01, học kỳ 2 từ 01/02 đến 31/05; sửa ngày bên trên nếu trường bạn chia khác.{to > today ? ' Ngày chưa đến không được tính.' : ''}</p>
        {msg && <p role="status" className="text-sm font-bold text-emerald-800">{msg}</p>}
      </div>

      {!valid && <p className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-bold text-amber-900">Ngày bắt đầu phải trước hoặc bằng hôm nay và không sau ngày kết thúc.</p>}
      {tooLong && <p className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-bold text-amber-900">Khoảng chọn dài quá 400 ngày, hãy chọn ngắn hơn.</p>}

      {data && (<>
        {!isSubject && (
          <Card n={1} title="Chuyên cần" icon={<Users className="w-5 h-5 text-emerald-700" />} hint={`${data.att.daysCount} ngày có điểm danh`}>
            {data.att.rate === null ? <p className="text-sm font-bold text-slate-700">Chưa có ngày nào điểm danh trong khoảng này.</p> : (
              <>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
                  <p className="text-4xl font-black text-emerald-800 tabular-nums whitespace-nowrap">{data.att.rate}%</p>
                  <div><Delta value={rateDelta} unit=" điểm" /><p className="text-sm text-slate-700 tabular-nums">{data.att.present}/{data.att.marked} lượt có mặt trong {data.att.daysCount} ngày điểm danh</p></div>
                </div>
                {weekBars.length > 0 && (
                  <div className="space-y-1.5" aria-label="Chuyên cần từng tuần">
                    {weekBars.map(w => (
                      <div key={w.week} className="grid grid-cols-[96px_1fr_56px] items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap">{vnDate(w.week)}–{vnDate(addDaysKey(w.week, 6))}</span>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${w.rate}%` }} /></div>
                        <span className="text-xs font-black text-slate-900 tabular-nums text-right whitespace-nowrap">{w.rate}%</span>
                      </div>
                    ))}
                  </div>
                )}
                {(() => {
                  const absent = data.perStudent.filter(p => p.marked - p.present > 0).sort((a, b) => (b.marked - b.present) - (a.marked - a.present)).slice(0, 10);
                  const perfect = data.att.daysCount >= 5 ? data.perStudent.filter(p => p.marked === data.att.daysCount && p.present === p.marked) : [];
                  return (
                    <div className="grid md:grid-cols-2 gap-4">
                      <div><h3 className="text-sm font-black text-slate-900 mb-1">Nghỉ nhiều nhất (tối đa 10 bạn)</h3>
                        {absent.length === 0 ? <p className="text-sm text-slate-700">Không có bạn nào vắng.</p> :
                          <ul className="text-sm text-slate-900 space-y-0.5">{absent.map(p => <li key={p.student.id} className="flex justify-between gap-2"><span>{p.student.name}</span><span className="font-black tabular-nums whitespace-nowrap">{p.marked - p.present} buổi</span></li>)}</ul>}
                      </div>
                      <div><h3 className="text-sm font-black text-slate-900 mb-1">Chuyên cần tuyệt đối ({perfect.length} bạn)</h3>
                        {perfect.length === 0 ? <p className="text-sm text-slate-700">Chưa có bạn nào đủ mặt mọi ngày điểm danh.</p> :
                          <p className="text-sm text-slate-900">{perfect.map(p => p.student.name).join(', ')}</p>}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </Card>
        )}

        <Card n={isSubject ? 1 : 2} title="Thi đua" icon={<TrendingUp className="w-5 h-5 text-amber-700" />} hint={`${data.xu.transactions} lượt cộng trừ xu`}>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
            <p className="text-4xl font-black text-amber-800 tabular-nums whitespace-nowrap">{data.xu.total} xu</p>
            <Delta value={data.xu.prevTotal || data.xu.total ? data.xu.delta : null} unit=" xu" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Tổ</th><th className={th}>Tổng xu</th><th className={th}>Trung bình/bạn</th></tr></thead>
              <tbody>{data.byGroup.map(g => <tr key={g.group}><td className={td}>{g.group}</td><td className={`${td} tabular-nums`}>{g.xu}</td><td className={`${td} tabular-nums font-black`}>{g.avg}</td></tr>)}</tbody></table></div>
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Hạng</th><th className={th}>Họ và tên</th><th className={th}>Xu</th></tr></thead>
              <tbody>{data.ranked.filter(p => p.xu > 0).slice(0, 10).map((p, i) => <tr key={p.student.id}><td className={`${td} tabular-nums`}>{i + 1}</td><td className={td}>{p.student.name}</td><td className={`${td} tabular-nums font-black`}>{p.xu}</td></tr>)}</tbody></table></div>
          </div>
          {data.topReasons.length > 0 && <p className="text-sm text-slate-900"><strong>Lý do được ghi nhận nhiều nhất:</strong> {data.topReasons.map(r => `${r.reason} (${r.count} lần)`).join('; ')}.</p>}
        </Card>

        <Card n={isSubject ? 2 : 3} title="Tiến bộ và ghi nhận" icon={<Award className="w-5 h-5 text-violet-700" />}>
          <div className="grid md:grid-cols-2 gap-4">
            <div><h3 className="text-sm font-black text-slate-900 mb-1">Tăng xu nhiều nhất so với kỳ trước</h3>
              {data.risers.length === 0 ? <p className="text-sm text-slate-700">Chưa có bạn nào tăng so với kỳ trước.</p> :
                <ul className="text-sm text-slate-900 space-y-0.5">{data.risers.map(p => <li key={p.student.id} className="flex justify-between gap-2"><span>{p.student.name}</span><span className="font-black tabular-nums whitespace-nowrap">{p.prevXu} → {p.xu} ({SIGN(p.delta)})</span></li>)}</ul>}</div>
            <div><h3 className="text-sm font-black text-slate-900 mb-1">Chưa được ghi nhận lần nào ({data.unrecognised.length} bạn)</h3>
              <p className="text-sm text-slate-900">{data.unrecognised.length === 0 ? 'Cả lớp đều được ghi nhận.' : data.unrecognised.map(s => s.name).join(', ')}</p></div>
          </div>
        </Card>

        <Card n={isSubject ? 3 : 4} title="Khen thưởng gợi ý" icon={<Gift className="w-5 h-5 text-rose-700" />}>
          {data.awards.length === 0 ? <p className="text-sm text-slate-700">Chưa đủ số liệu để gợi ý danh hiệu.</p> : (
            <ul className="space-y-2">
              {data.awards.map(a => {
                const names = a.studentIds.map(id => students.find(s => s.id === id)?.name).filter(Boolean) as string[];
                return (
                  <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="min-w-0"><p className="text-sm font-black text-slate-900">{forPeriod(a.title)}</p><p className="text-sm text-slate-800">{names.length > 4 ? `${names.slice(0, 4).join(', ')} và ${names.length - 4} bạn khác` : names.join(', ')} — {forPeriod(a.reason)}</p></div>
                    <button type="button" onClick={() => copyPraise(forPeriod(a.title), names, forPeriod(a.reason))} className="no-hover-fx min-h-10 px-3 rounded-xl bg-sky-700 text-white text-sm font-bold whitespace-nowrap cursor-pointer">Chép lời khen</button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card n={isSubject ? 4 : 5} title="Các tuần đã lưu trong sổ" icon={<BookOpen className="w-5 h-5 text-sky-700" />} hint={`${journal.length} tuần trong khoảng`}>
          {journal.length === 0 ? <p className="text-sm text-slate-700">Chưa lưu tuần nào trong khoảng này. Vào "Tổng kết tuần" và bấm lưu mỗi tuần để sổ này đầy dần.</p> : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Tuần</th><th className={th}>Chuyên cần</th><th className={th}>Xu</th><th className={th}>Ngôi sao</th><th className={th}>Mục tiêu đã đặt</th>{onOpenWeek && <th className={th}>Xem</th>}</tr></thead>
              <tbody>{journal.map(e => (
                <tr key={e.id}><td className={`${td} tabular-nums whitespace-nowrap`}>{vnDate(e.weekStart)}–{vnDate(addDaysKey(e.weekStart, 6))}</td>
                  <td className={`${td} tabular-nums whitespace-nowrap`}>{e.snapshot.attendanceRate === null ? '—' : `${e.snapshot.attendanceRate}%`}</td>
                  <td className={`${td} tabular-nums`}>{e.snapshot.totalXu}</td><td className={td}>{e.snapshot.topStudentName || '—'}</td>
                  <td className={`${td} wrap-ok`}>{e.goals.filter(Boolean).join('; ') || '—'}</td>{onOpenWeek && <td className={td}><button type="button" className="no-hover-fx min-h-10 px-2 text-sm font-bold text-sky-800 underline cursor-pointer" onClick={() => onOpenWeek(e.weekStart)}>Mở tuần</button></td>}</tr>))}</tbody></table></div>
          )}
        </Card>
      </>)}
    </div>
  );
};

export default PeriodSummaryView;
