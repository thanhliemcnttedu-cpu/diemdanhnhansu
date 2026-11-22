import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Award, CalendarCheck, ChevronLeft, ChevronRight, Download, Eye, EyeOff, Gift, Save, Sparkles, Star, Target, TrendingUp, Users } from 'lucide-react';
import { useClassroom } from '../../context/ClassroomContext';
import { writeReportXlsx } from '../../utils/licensedExport';
import { computeWeek, dateKeyOf, mondayOf, addDaysKey, vnDate, vnDateFull, WEEKDAY_SHORT, parseKey } from '../../utils/weeklySummary';
import type { Student } from '../../types';

/**
 * "Tổng kết tuần" — the Friday class meeting in one screen: attendance, class points (xu), progress, recognition,
 * award suggestions (thiệp chúc mừng PNG, thư khen), goals for next week, and a saved weekly journal.
 * Homeroom teachers see attendance; subject teachers see only the xu given for their subject.
 * "Chế độ chiếu" hides the lists that are for the teacher only (frequent absentees, pupils not yet recognised).
 */
const SIGNS = (n: number) => (n > 0 ? `+${n}` : String(n));

const Delta: React.FC<{ value: number | null; unit?: string }> = ({ value, unit = '' }) => {
  if (value === null || Number.isNaN(value)) return <span className="text-sm font-bold text-slate-600 whitespace-nowrap">chưa có tuần trước để so</span>;
  const tone = value > 0 ? 'text-emerald-800' : value < 0 ? 'text-rose-800' : 'text-slate-700';
  return <span className={`text-sm font-bold whitespace-nowrap ${tone}`}>{value > 0 ? '▲ ' : value < 0 ? '▼ ' : '= '}{SIGNS(value)}{unit} so với tuần trước</span>;
};

const Card: React.FC<{ n: number; title: string; icon: React.ReactNode; children: React.ReactNode; hint?: string }> = ({ n, title, icon, children, hint }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden" aria-label={title}>
    <header className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
      <span className="w-8 h-8 rounded-xl bg-sky-100 text-sky-800 font-black text-sm flex items-center justify-center shrink-0">{n}</span>
      <h2 className="normal-case text-base font-black text-slate-900 flex items-center gap-2">{icon}{title}</h2>
      {hint && <span className="text-sm text-slate-600">{hint}</span>}
    </header>
    <div className="p-4 sm:p-5 space-y-4">{children}</div>
  </section>
);

const Meter: React.FC<{ pct: number; tone: string; label: string }> = ({ pct, tone, label }) => (
  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={label}>
    <div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);

export const WeeklySummaryView: React.FC<{ onNavigate?: (id: any) => void; initialWeekStart?: string }> = ({ onNavigate, initialWeekStart }) => {
  const {
    activeClassId, classes, currentClassStudents, attendanceRecords, transactions, teacherRole, subjectTeacherConfig,
    teacherProfile, currentUser, weeklyJournal, saveWeeklyEntry,
  } = useClassroom();
  const cls = classes.find(c => c.id === activeClassId);
  const isSubject = teacherRole === 'subject';
  const subjectName = isSubject ? subjectTeacherConfig?.subjectName : undefined;
  const today = dateKeyOf(new Date());
  const [weekStart, setWeekStart] = useState(() => mondayOf(initialWeekStart || today));
  const [present, setPresent] = useState(false);
  const [showQuiet, setShowQuiet] = useState(false);
  const [goals, setGoals] = useState<string[]>(['', '', '']);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState('');
  const students = currentClassStudents as Student[];

  const week = useMemo(() => computeWeek({
    students,
    records: attendanceRecords.filter(r => r.classId === activeClassId),
    transactions: transactions.filter(t => t.classId === activeClassId),
    weekStart, subjectName,
  }), [students, attendanceRecords, transactions, activeClassId, weekStart, subjectName]);

  const entryId = `${activeClassId}|${weekStart}|${subjectName || '*'}`;
  const saved = weeklyJournal.find(e => e.id === entryId);
  // load the saved review of the chosen week (or suggestions when none)
  useEffect(() => {
    setMsg('');
    if (saved) {
      setGoals([...saved.goals, '', '', ''].slice(0, 3)); setNote(saved.note || '');
      setPicked(Object.fromEntries(saved.awards.map(a => [a.key, a.studentIds])));
    } else {
      setGoals(['', '', '']); setNote('');
      setPicked(Object.fromEntries(week.awards.map(a => [a.key, a.studentIds])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, saved?.updatedAt]);

  const nameOf = (id: string) => students.find(s => s.id === id)?.name || '';
  const isThisWeek = weekStart === mondayOf(today);
  const maxXu = Math.max(1, ...week.ranked.map(p => p.xu));
  const maxGroupAvg = Math.max(1, ...week.byGroup.map(g => g.avg));
  const rateDelta = week.att.rate !== null && week.prevAtt.rate !== null ? Math.round((week.att.rate - week.prevAtt.rate) * 10) / 10 : null;
  const hasXu = week.xu.transactions > 0;

  // goal suggestions from the numbers
  const suggestions = useMemo(() => {
    const out: string[] = [];
    if (!isSubject && week.att.rate !== null && week.att.rate < 95) out.push('Giữ chuyên cần của lớp từ 95% trở lên');
    if (!isSubject && week.frequentAbsent.length) out.push('Nhắc nhở và hỗ trợ các bạn nghỉ nhiều để đi học đầy đủ');
    if (week.unrecognised.length >= 3) out.push('Mỗi bạn đều được ghi nhận ít nhất một lần trong tuần');
    if (week.byGroup.length > 1) out.push('Các tổ cùng cố gắng, giúp nhau tiến bộ');
    out.push('Phát biểu xây dựng bài nhiều hơn');
    return out.slice(0, 5);
  }, [week, isSubject]);

  const changeWeek = (delta: number) => setWeekStart(addDaysKey(weekStart, delta * 7));

  const save = () => {
    const top = week.top[0];
    saveWeeklyEntry({
      id: entryId, classId: activeClassId, weekStart, subjectName,
      goals: goals.map(g => g.trim()).filter(Boolean).slice(0, 3), note: note.trim() || undefined,
      awards: week.awards.filter(a => (picked[a.key] || []).length > 0).map(a => ({ key: a.key, title: a.title, reason: a.reason, studentIds: picked[a.key] })),
      snapshot: { attendanceRate: week.att.rate, attendanceDays: week.att.daysCount, totalXu: week.xu.total, topStudentName: top?.student.name, topGroup: week.byGroup.find(g => g.xu > 0)?.group },
    });
    setMsg('Đã lưu vào sổ tổng kết tuần.');
  };

  // ---- cards (PNG) for the picked pupils
  const cardCanvas = useRef<HTMLCanvasElement | null>(null);
  const drawCard = async (title: string, reason: string, studentName: string) => {
    try { await (document as any).fonts?.load('800 64px "Be Vietnam Pro"'); await (document as any).fonts?.load('500 32px "Be Vietnam Pro"'); } catch { /* fall back to system font */ }
    const c = cardCanvas.current || document.createElement('canvas');
    cardCanvas.current = c; c.width = 1080; c.height = 1080;
    const g = c.getContext('2d'); if (!g) return;
    const bg = g.createLinearGradient(0, 0, 1080, 1080); bg.addColorStop(0, '#e0f2fe'); bg.addColorStop(1, '#ecfdf5');
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
    g.strokeStyle = '#0284c7'; g.lineWidth = 10; g.strokeRect(36, 36, 1008, 1008);
    g.strokeStyle = '#fbbf24'; g.lineWidth = 4; g.strokeRect(58, 58, 964, 964);
    const star = (x: number, y: number, r: number, col: string) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    star(540, 230, 92, '#f59e0b'); star(380, 270, 40, '#fbbf24'); star(700, 270, 40, '#fbbf24'); star(250, 340, 24, '#fde68a'); star(830, 340, 24, '#fde68a');
    g.textAlign = 'center'; g.fillStyle = '#075985'; g.font = '800 56px "Be Vietnam Pro", sans-serif'; g.fillText('THIỆP CHÚC MỪNG', 540, 440);
    g.fillStyle = '#0f172a'; g.font = '800 88px "Be Vietnam Pro", sans-serif';
    let fs = 88; while (g.measureText(studentName).width > 900 && fs > 40) { fs -= 4; g.font = `800 ${fs}px "Be Vietnam Pro", sans-serif`; }
    g.fillText(studentName, 540, 590);
    g.fillStyle = '#047857'; g.font = '700 60px "Be Vietnam Pro", sans-serif'; g.fillText(title, 540, 700);
    g.fillStyle = '#334155'; g.font = '500 36px "Be Vietnam Pro", sans-serif';
    const lines: string[] = []; let line = '';
    reason.split(' ').forEach(w => { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > 820) { lines.push(line); line = w; } else line = t; }); if (line) lines.push(line);
    lines.slice(0, 3).forEach((l, i) => g.fillText(l, 540, 780 + i * 48));
    g.fillStyle = '#475569'; g.font = '600 32px "Be Vietnam Pro", sans-serif';
    g.fillText(`Lớp ${cls?.name || ''} • Tuần ${vnDate(weekStart)} - ${vnDate(week.weekEnd)}`, 540, 960);
    g.fillStyle = '#64748b'; g.font = '500 28px "Be Vietnam Pro", sans-serif';
    g.fillText(currentUser?.schoolName || teacherProfile.schoolName || '', 540, 1000);
    const blob: Blob | null = await new Promise(res => c.toBlob(b => res(b), 'image/png'));
    if (!blob) return;
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `Thiep_chuc_mung_${studentName.replace(/\s+/g, '_')}_${weekStart}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const copyPraise = (title: string, reason: string, names: string[]) => {
    const text = `Chúc mừng ${names.join(', ')} đạt danh hiệu "${title}" tuần ${vnDate(weekStart)} - ${vnDate(week.weekEnd)} lớp ${cls?.name || ''}. ${reason}.`;
    try { navigator.clipboard?.writeText(text); setMsg('Đã chép lời khen, dán vào Zalo hoặc sổ liên lạc.'); } catch { setMsg('Chưa chép được, hãy chọn và sao chép bằng tay.'); }
  };

  // ---- Excel: derived columns are formulas
  const exportExcel = () => {
    const head = 6;
    const aoa: any[][] = [
      [(currentUser?.schoolName || teacherProfile.schoolName || '').toUpperCase()],
      [`TỔNG KẾT TUẦN ${vnDate(weekStart)} - ${vnDate(week.weekEnd)} • LỚP ${cls?.name || ''}${subjectName ? ` • MÔN ${subjectName}` : ''}`],
      [`Giáo viên: ${cls?.teacherName || teacherProfile.name || ''}`], [],
      ['STT', 'Họ và tên', 'Tổ', 'Xu tuần này', 'Xu tuần trước', 'Chênh lệch', 'Lần được ghi nhận', 'Buổi có mặt', 'Buổi điểm danh', 'Chuyên cần (%)'],
    ];
    aoa.splice(4, 0, []);
    week.perStudent.forEach((p, i) => {
      const n = head + i + 1;
      aoa.push([
        i + 1, p.student.name, p.student.group || '', p.xu, p.prevXu,
        { t: 'n', f: `D${n}-E${n}`, v: p.delta }, p.recognised, p.present, p.marked,
        { t: 'n', f: `IF(I${n}=0,0,ROUND(H${n}/I${n}*100,1))`, v: p.marked ? Math.round((p.present / p.marked) * 1000) / 10 : 0 },
      ]);
    });
    const last = head + week.perStudent.length;
    aoa.push([], ['', 'XU CẢ LỚP', '', { t: 'n', f: `SUM(D${head + 1}:D${last})`, v: week.xu.total }, { t: 'n', f: `SUM(E${head + 1}:E${last})`, v: week.xu.prevTotal }, { t: 'n', f: `D${last + 2}-E${last + 2}`, v: week.xu.delta }]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [6, 28, 10, 12, 12, 11, 14, 12, 13, 14].map(wch => ({ wch }));
    ws['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: 9 } }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, `Tuan_${weekStart}`);
    writeReportXlsx(wb, `Tong_ket_tuan_${cls?.name || 'lop'}_${weekStart}.xlsx`);
  };

  const btn = 'no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-2 cursor-pointer';
  const dayLabel = (d: string) => `${WEEKDAY_SHORT[parseKey(d).getDay()]} ${vnDate(d)}`;

  return (
    <div data-report="" className="p-3 sm:p-5 max-w-6xl mx-auto space-y-4">
      {/* header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-wrap items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0"><CalendarCheck className="w-6 h-6" /></span>
        <div className="flex-1 min-w-[220px]">
          <h1 className="normal-case text-lg font-black text-slate-900">Tổng kết tuần • Lớp {cls?.name}{subjectName ? ` • Môn ${subjectName}` : ''}</h1>
          <p className="text-sm text-slate-700">Tuần {vnDateFull(weekStart)} đến {vnDateFull(week.weekEnd)}{isThisWeek ? ' (tuần này)' : ''} • dùng cho tiết sinh hoạt cuối tuần.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => changeWeek(-1)} aria-label="Tuần trước"><ChevronLeft className="w-4 h-4" /> Tuần trước</button>
          <label className="sr-only" htmlFor="ws-date">Chọn một ngày trong tuần</label>
          <input id="ws-date" type="date" value={weekStart} max={today} onChange={e => e.target.value && setWeekStart(mondayOf(e.target.value))} className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900 tabular-nums" />
          <button type="button" className={btn} onClick={() => changeWeek(1)} disabled={weekStart >= mondayOf(today)} aria-label="Tuần sau">Tuần sau <ChevronRight className="w-4 h-4" /></button>
          <button type="button" aria-pressed={present} onClick={() => setPresent(v => !v)} className={`${btn} ${present ? '!bg-slate-900 !text-white !border-slate-900' : ''}`} title="Khi chiếu cho cả lớp: ẩn danh sách chỉ dành cho giáo viên">
            {present ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} Chế độ chiếu
          </button>
        </div>
      </div>

      {/* 1 attendance */}
      {!isSubject && (
        <Card n={1} title="Chuyên cần trong tuần" icon={<Users className="w-5 h-5 text-emerald-700" />} hint={`${week.att.daysCount}/${week.att.days.filter(d => parseKey(d.date).getDay() !== 0 && parseKey(d.date).getDay() !== 6).length} ngày học có điểm danh`}>
          {week.att.rate === null ? (
            <p className="text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-4 text-center">Tuần này lớp chưa có ngày nào điểm danh.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div><p className="text-xs font-black text-slate-700 uppercase">Chuyên cần tuần</p><p className="text-4xl font-black font-mono text-emerald-900 leading-none">{week.att.rate}%</p></div>
                <div className="pb-1"><Delta value={rateDelta} unit=" điểm" /><p className="text-sm text-slate-700 tabular-nums">{week.att.present}/{week.att.marked} lượt có mặt trong {week.att.daysCount} ngày điểm danh</p></div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-7 gap-2" aria-label="Chuyên cần từng ngày">
                {week.att.days.filter(d => d.marked > 0 || (parseKey(d.date).getDay() !== 0 && parseKey(d.date).getDay() !== 6)).map(d => (
                  <div key={d.date} className="rounded-xl border border-slate-200 p-2 text-center">
                    <p className="text-xs font-bold text-slate-700 whitespace-nowrap">{dayLabel(d.date)}</p>
                    <p className="text-lg font-black font-mono text-slate-900">{d.rate === null ? '—' : `${d.rate}%`}</p>
                    <Meter pct={d.rate ?? 0} tone={d.rate === null ? 'bg-slate-300' : d.rate >= 95 ? 'bg-emerald-600' : 'bg-amber-500'} label={`${dayLabel(d.date)}: ${d.rate ?? 'chưa điểm danh'}`} />
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-black text-emerald-900 mb-1.5">Chuyên cần tuyệt đối ({week.perfect.length})</p>
                  {week.perfect.length === 0 ? <p className="text-sm text-slate-600">Chưa có bạn nào đi học đủ các ngày điểm danh.</p> : (
                    <div className="flex flex-wrap gap-1.5">{week.perfect.map(s => <span key={s.id} className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-950 whitespace-nowrap">{s.name}</span>)}</div>
                  )}
                </div>
                {!present && (
                  <div>
                    <p className="text-sm font-black text-rose-900 mb-1.5">Nghỉ từ 2 buổi ({week.frequentAbsent.length}) <span className="font-normal text-slate-600">• chỉ giáo viên thấy</span></p>
                    {week.frequentAbsent.length === 0 ? <p className="text-sm text-slate-600">Không có bạn nào nghỉ từ 2 buổi.</p> : (
                      <div className="flex flex-wrap gap-1.5">{week.frequentAbsent.map(a => <span key={a.student.id} className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-sm font-semibold text-rose-950 whitespace-nowrap">{a.student.name} • {a.absences} buổi</span>)}</div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {/* 2 competition */}
      <Card n={isSubject ? 1 : 2} title={`Thi đua trong tuần${subjectName ? ` • môn ${subjectName}` : ''}`} icon={<Star className="w-5 h-5 text-amber-600" />}>
        {!hasXu ? (
          <p className="text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-4 text-center">Tuần này chưa có lần cộng hoặc trừ xu nào{subjectName ? ` cho môn ${subjectName}` : ''}.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div><p className="text-xs font-black text-slate-700 uppercase">Xu cả lớp trong tuần</p><p className="text-4xl font-black font-mono text-amber-900 leading-none">{week.xu.total}</p></div>
              <div className="pb-1"><Delta value={week.xu.prevTotal || week.xu.total ? week.xu.delta : null} unit=" xu" /><p className="text-sm text-slate-700 tabular-nums">{week.xu.transactions} lần ghi nhận • tuần trước {week.xu.prevTotal} xu</p></div>
            </div>
            <div className="grid lg:grid-cols-2 gap-5">
              <div>
                <p className="text-sm font-black text-slate-900 mb-2">Xếp hạng các tổ <span className="font-normal text-slate-600">(trung bình mỗi bạn)</span></p>
                <ul className="space-y-2.5">
                  {week.byGroup.map((g, i) => (
                    <li key={g.group}>
                      <div className="flex items-center gap-2 text-sm"><span className="w-6 h-6 rounded-full bg-slate-100 text-slate-900 text-xs font-black flex items-center justify-center tabular-nums">{i + 1}</span><span className="font-black text-slate-900 whitespace-nowrap">{g.group}</span><span className="text-slate-700 tabular-nums">{g.xu} xu • {g.members} bạn</span><span className="ml-auto font-black font-mono tabular-nums text-amber-900">{g.avg}</span></div>
                      <div className="mt-1 ml-8"><Meter pct={(g.avg / maxGroupAvg) * 100} tone="bg-amber-500" label={`${g.group}: ${g.avg} xu mỗi bạn`} /></div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 mb-2">Năm bạn nhiều xu nhất</p>
                <ol className="space-y-2.5">
                  {week.top.map((p, i) => (
                    <li key={p.student.id}>
                      <div className="flex items-center gap-2 text-sm"><span className="w-6 h-6 rounded-full bg-amber-100 text-amber-950 text-xs font-black flex items-center justify-center tabular-nums">{i + 1}</span><span className="font-black text-slate-900 whitespace-nowrap">{p.student.name}</span><span className="text-slate-700 whitespace-nowrap">{p.student.group || ''}</span><span className="ml-auto font-black font-mono tabular-nums text-amber-900">{p.xu} xu</span></div>
                      <div className="mt-1 ml-8"><Meter pct={(p.xu / maxXu) * 100} tone="bg-emerald-600" label={`${p.student.name}: ${p.xu} xu`} /></div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* 3 progress and recognition */}
      <Card n={isSubject ? 2 : 3} title="Tiến bộ và ghi nhận" icon={<TrendingUp className="w-5 h-5 text-sky-700" />}>
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-sm font-black text-slate-900 mb-2">Các bạn tiến bộ so với tuần trước</p>
            {week.risers.length === 0 ? <p className="text-sm text-slate-600">Chưa có bạn nào tăng xu so với tuần trước.</p> : (
              <ul className="space-y-1.5">{week.risers.map(p => (
                <li key={p.student.id} className="flex items-center gap-2 text-sm"><span className="font-bold text-slate-900 whitespace-nowrap">{p.student.name}</span><span className="text-slate-700 tabular-nums whitespace-nowrap">{p.prevXu} → {p.xu} xu</span><span className="ml-auto font-black text-emerald-800 tabular-nums whitespace-nowrap">▲ {p.delta}</span></li>
              ))}</ul>
            )}
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 mb-2">Lý do được ghi nhận nhiều nhất</p>
            {week.topReasons.length === 0 ? <p className="text-sm text-slate-600">Chưa có lần ghi nhận nào.</p> : (
              <ul className="space-y-1.5">{week.topReasons.map(r => (
                <li key={r.reason} className="flex items-center gap-2 text-sm"><span className="text-slate-900 font-semibold truncate min-w-0">{r.reason}</span><span className="ml-auto text-slate-700 tabular-nums whitespace-nowrap">{r.count} lần • {r.xu} xu</span></li>
              ))}</ul>
            )}
          </div>
        </div>
        {!present && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <button type="button" onClick={() => setShowQuiet(v => !v)} aria-expanded={showQuiet} className="wrap-ok no-hover-fx min-h-10 text-left text-sm font-bold text-slate-900 cursor-pointer">
              {week.unrecognised.length} bạn chưa được ghi nhận trong tuần — {showQuiet ? 'ẩn tên' : 'xem tên để động viên'} <span className="font-normal text-slate-600">(chỉ giáo viên thấy)</span>
            </button>
            {showQuiet && <div className="mt-1.5 flex flex-wrap gap-1.5">{week.unrecognised.map(s => <span key={s.id} className="px-2.5 py-1 rounded-full bg-white border border-slate-300 text-sm font-semibold text-slate-900 whitespace-nowrap">{s.name}</span>)}</div>}
          </div>
        )}
      </Card>

      {/* 4 awards */}
      <Card n={isSubject ? 3 : 4} title="Khen thưởng và động viên" icon={<Award className="w-5 h-5 text-rose-700" />} hint="Gợi ý theo số liệu, thầy cô tích chọn ai được khen">
        {week.awards.length === 0 ? <p className="text-sm text-slate-600">Chưa đủ số liệu để gợi ý khen thưởng cho tuần này.</p> : (
          <ul className="space-y-4">
            {week.awards.map(a => {
              const ids = picked[a.key] ?? a.studentIds;
              return (
                <li key={a.key} className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-sm font-black text-rose-950 whitespace-nowrap">{a.title}</span>
                    <span className="text-sm text-slate-700">{a.reason}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.studentIds.map(id => {
                      const on = ids.includes(id);
                      return (
                        <label key={id} className={`inline-flex items-center gap-2 min-h-10 px-3 rounded-full border text-sm font-semibold cursor-pointer ${on ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-white border-slate-300 text-slate-700'}`}>
                          <input type="checkbox" className="w-4 h-4 accent-emerald-700" checked={on} onChange={() => setPicked(p => ({ ...p, [a.key]: on ? ids.filter(x => x !== id) : [...ids, id] }))} />
                          <span className="whitespace-nowrap">{nameOf(id)}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btn} onClick={async () => { for (const id of ids.slice(0, 12)) await drawCard(a.title, a.reason, nameOf(id)); }} disabled={ids.length === 0}><Gift className="w-4 h-4" /> Tải thiệp chúc mừng ({Math.min(ids.length, 12)})</button>
                    <button type="button" className={btn} onClick={() => copyPraise(a.title, a.reason, ids.map(nameOf))} disabled={ids.length === 0}>Chép lời khen</button>
                    {onNavigate && <button type="button" className={btn} onClick={() => onNavigate('certificate')}><Award className="w-4 h-4" /> Mở Thư khen</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 5 goals */}
      <Card n={isSubject ? 4 : 5} title="Mục tiêu tuần sau" icon={<Target className="w-5 h-5 text-violet-700" />}>
        <div className="flex flex-wrap gap-1.5" aria-label="Gợi ý mục tiêu">
          {suggestions.map(s => (
            <button key={s} type="button" className="wrap-ok no-hover-fx min-h-10 px-3 py-1.5 rounded-2xl text-left border border-violet-200 bg-violet-50 text-sm font-semibold text-violet-950 hover:bg-violet-100 cursor-pointer"
              onClick={() => setGoals(g => { const i = g.findIndex(x => !x.trim()); if (i < 0 || g.includes(s)) return g; const n = g.slice(); n[i] = s; return n; })}>
              <Sparkles className="w-3.5 h-3.5 inline mr-1" />{s}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {goals.map((g, i) => (
            <div key={i}>
              <label htmlFor={`goal-${i}`} className="sr-only">Mục tiêu {i + 1}</label>
              <input id={`goal-${i}`} value={g} maxLength={140} onChange={e => setGoals(x => { const n = x.slice(); n[i] = e.target.value; return n; })} placeholder={`Mục tiêu ${i + 1}`}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-600" />
            </div>
          ))}
          <label htmlFor="ws-note" className="sr-only">Ghi chú của giáo viên</label>
          <textarea id="ws-note" value={note} maxLength={600} onChange={e => setNote(e.target.value)} rows={3} placeholder="Ghi chú của giáo viên (không bắt buộc)"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-600" />
        </div>
      </Card>

      {/* 6 save + export + journal */}
      <Card n={isSubject ? 5 : 6} title="Lưu vào sổ và xuất" icon={<Save className="w-5 h-5 text-slate-800" />}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} className="no-hover-fx h-11 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer"><Save className="w-4 h-4" /> Lưu tổng kết tuần này</button>
          <button type="button" className={btn} onClick={exportExcel}><Download className="w-4 h-4" /> Xuất Excel</button>
          {saved && <span className="text-sm text-slate-700">Đã lưu lúc {new Date(saved.updatedAt).toLocaleString('vi-VN')}</span>}
        </div>
        {msg && <p role="status" className="text-sm font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{msg}</p>}
        <div>
          <p className="text-sm font-black text-slate-900 mb-1.5">Sổ tổng kết các tuần đã lưu</p>
          {weeklyJournal.filter(e => e.classId === activeClassId && (e.subjectName || '') === (subjectName || '')).length === 0 ? (
            <p className="text-sm text-slate-600">Chưa có tuần nào được lưu. Các tuần đã lưu sẽ là nền cho tổng kết tháng, học kỳ và năm học.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[520px]">
                <thead><tr className="bg-slate-50 text-left text-xs font-black text-slate-800"><th className="px-3 py-2">Tuần</th><th className="px-3 py-2">Chuyên cần</th><th className="px-3 py-2">Xu cả lớp</th><th className="px-3 py-2">Ngôi sao</th><th className="px-3 py-2">Mục tiêu</th><th className="px-3 py-2" /></tr></thead>
                <tbody>
                  {weeklyJournal.filter(e => e.classId === activeClassId && (e.subjectName || '') === (subjectName || '')).slice(0, 10).map(e => (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-bold tabular-nums">{vnDate(e.weekStart)} - {vnDate(addDaysKey(e.weekStart, 6))}</td>
                      <td className="px-3 py-2 tabular-nums">{e.snapshot.attendanceRate === null ? '—' : `${e.snapshot.attendanceRate}%`}</td>
                      <td className="px-3 py-2 tabular-nums">{e.snapshot.totalXu}</td>
                      <td className="px-3 py-2">{e.snapshot.topStudentName || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{e.goals.length}</td>
                      <td className="px-3 py-2"><button type="button" className="no-hover-fx min-h-10 px-2 text-sm font-bold text-sky-800 underline cursor-pointer" onClick={() => setWeekStart(e.weekStart)}>Mở</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default WeeklySummaryView;
