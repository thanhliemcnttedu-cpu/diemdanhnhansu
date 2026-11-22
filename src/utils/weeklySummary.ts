import type { DailyAttendance, PointTransaction, Student } from '../types';

/**
 * Numbers for the Friday "Tổng kết tuần" (weekly review): attendance, class points (xu), progress, recognition, award suggestions.
 * Pure functions so they can be checked against an independent count. A week is Monday–Sunday; attendance only counts
 * days on which the class really took attendance (a day without a sheet is "no data", not "absent").
 */
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const dateKeyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDaysKey = (k: string, n: number) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKeyOf(d); };
export const mondayOf = (k: string) => { const d = parseKey(k); return addDaysKey(k, -((d.getDay() + 6) % 7)); };
export const vnDate = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
export const vnDateFull = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
export const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const presentLike = (st: string) => st === 'present' || st === 'late';

export interface WeekInput {
  students: Student[];
  records: DailyAttendance[];          // already limited to the class
  transactions: PointTransaction[];    // already limited to the class
  weekStart: string;                   // Monday
  subjectName?: string;                // GV bộ môn: only the xu given for this subject
  /** Optional end date: a free range (month, term, custom) instead of one week. The previous period is the same length right before. */
  rangeEnd?: string;
}

export const daysBetween = (from: string, to: string) => Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86400000) + 1;

export interface DayRate { date: string; rate: number | null; present: number; marked: number }
export interface StudentWeek { student: Student; xu: number; prevXu: number; delta: number; recognised: number; present: number; marked: number }
export interface AwardSuggestion { key: string; title: string; reason: string; studentIds: string[]; groupName?: string }

const txInRange = (tx: PointTransaction[], from: string, to: string, subject?: string) =>
  tx.filter(t => {
    const k = dateKeyOf(new Date(t.timestamp));
    return k >= from && k <= to && (!subject || t.subjectName === subject);
  });

const attendanceOf = (records: DailyAttendance[], from: string, to: string) => {
  const days: DayRate[] = [];
  for (let i = 0; i < 400; i++) {
    const date = addDaysKey(from, i);
    if (date > to) break;
    const rec = records.find(r => r.date === date && r.records && Object.keys(r.records).length > 0);
    if (!rec) { days.push({ date, rate: null, present: 0, marked: 0 }); continue; }
    const vals = Object.values(rec.records);
    const present = vals.filter(presentLike).length;
    days.push({ date, rate: vals.length ? Math.round((present / vals.length) * 1000) / 10 : null, present, marked: vals.length });
  }
  const withData = days.filter(d => d.marked > 0);
  const present = withData.reduce((a, d) => a + d.present, 0);
  const marked = withData.reduce((a, d) => a + d.marked, 0);
  return { days, daysCount: withData.length, present, marked, rate: marked > 0 ? Math.round((present / marked) * 1000) / 10 : null };
};

export function computeWeek(input: WeekInput) {
  const { students, records, transactions, weekStart, subjectName } = input;
  const weekEnd = input.rangeEnd || addDaysKey(weekStart, 6);
  const span = daysBetween(weekStart, weekEnd);
  const prevStart = addDaysKey(weekStart, -span);
  const prevEnd = addDaysKey(weekStart, -1);

  const att = attendanceOf(records, weekStart, weekEnd);
  const prevAtt = attendanceOf(records, prevStart, prevEnd);

  const cur = txInRange(transactions, weekStart, weekEnd, subjectName);
  const prev = txInRange(transactions, prevStart, prevEnd, subjectName);
  const sum = (list: PointTransaction[], id: string) => list.filter(t => t.studentId === id).reduce((a, t) => a + (t.amount || 0), 0);

  const perStudent: StudentWeek[] = students.map(s => {
    let present = 0, marked = 0;
    att.days.forEach(d => {
      const rec = records.find(r => r.date === d.date && r.records && Object.keys(r.records).length > 0);
      const st = rec?.records?.[s.id];
      if (st) { marked++; if (presentLike(st)) present++; }
    });
    const xu = sum(cur, s.id), prevXu = sum(prev, s.id);
    return { student: s, xu, prevXu, delta: xu - prevXu, recognised: cur.filter(t => t.studentId === s.id && t.amount > 0).length, present, marked };
  });

  const totalXu = perStudent.reduce((a, p) => a + p.xu, 0);
  const prevTotalXu = perStudent.reduce((a, p) => a + p.prevXu, 0);

  const groups = new Map<string, { group: string; xu: number; members: number }>();
  perStudent.forEach(p => {
    const g = p.student.group || 'Chưa chia tổ';
    const e = groups.get(g) || { group: g, xu: 0, members: 0 };
    e.xu += p.xu; e.members++; groups.set(g, e);
  });
  const byGroup = [...groups.values()]
    .map(g => ({ ...g, avg: g.members ? Math.round((g.xu / g.members) * 10) / 10 : 0 }))
    .sort((a, b) => b.avg - a.avg || a.group.localeCompare(b.group, 'vi', { numeric: true }));

  const reasons = new Map<string, { reason: string; count: number; xu: number }>();
  cur.filter(t => t.amount > 0).forEach(t => {
    const key = (t.reason || 'Khác').trim() || 'Khác';
    const e = reasons.get(key) || { reason: key, count: 0, xu: 0 };
    e.count++; e.xu += t.amount; reasons.set(key, e);
  });
  const topReasons = [...reasons.values()].sort((a, b) => b.count - a.count || b.xu - a.xu).slice(0, 6);

  const ranked = perStudent.slice().sort((a, b) => b.xu - a.xu || a.student.name.localeCompare(b.student.name, 'vi'));
  const top = ranked.filter(p => p.xu > 0).slice(0, 5);
  const risers = perStudent.filter(p => p.delta > 0).sort((a, b) => b.delta - a.delta || b.xu - a.xu).slice(0, 5);
  const unrecognised = perStudent.filter(p => p.recognised === 0).map(p => p.student);

  // attendance lists (only meaningful when at least one day was recorded)
  const perfect = att.daysCount >= 1 ? perStudent.filter(p => p.marked === att.daysCount && p.present === p.marked).map(p => p.student) : [];
  const frequentAbsent = perStudent.filter(p => p.marked - p.present >= 2).map(p => ({ student: p.student, absences: p.marked - p.present }))
    .sort((a, b) => b.absences - a.absences);

  // award suggestions (teacher can untick or edit)
  const awards: AwardSuggestion[] = [];
  if (top[0]) awards.push({ key: 'star', title: 'Ngôi sao của tuần', reason: `Đạt ${top[0].xu} xu, nhiều nhất lớp`, studentIds: [top[0].student.id] });
  const bestGroup = byGroup.find(g => g.xu > 0 && g.group !== 'Chưa chia tổ');
  if (bestGroup) awards.push({ key: 'group', title: 'Tổ xuất sắc', reason: `${bestGroup.group}: trung bình ${bestGroup.avg} xu mỗi bạn`, studentIds: perStudent.filter(p => (p.student.group || '') === bestGroup.group).map(p => p.student.id), groupName: bestGroup.group });
  if (att.daysCount >= 3 && perfect.length) awards.push({ key: 'attendance', title: 'Chuyên cần tuyệt đối', reason: `Có mặt đủ ${att.daysCount}/${att.daysCount} ngày điểm danh`, studentIds: perfect.map(s => s.id) });
  if (risers[0]) awards.push({ key: 'progress', title: 'Bạn tiến bộ nhất tuần', reason: `Tăng ${risers[0].delta} xu so với tuần trước (${risers[0].prevXu} → ${risers[0].xu})`, studentIds: [risers[0].student.id] });
  const active = perStudent.slice().sort((a, b) => b.recognised - a.recognised)[0];
  if (active && active.recognised >= 3) awards.push({ key: 'active', title: 'Hăng hái xây dựng bài', reason: `Được ghi nhận ${active.recognised} lần trong tuần`, studentIds: [active.student.id] });

  return {
    weekStart, weekEnd, prevStart, prevEnd, att, prevAtt,
    xu: { total: totalXu, prevTotal: prevTotalXu, delta: totalXu - prevTotalXu, transactions: cur.length },
    perStudent, ranked, top, risers, byGroup, topReasons, unrecognised, perfect, frequentAbsent, awards,
  };
}

export type WeekSummary = ReturnType<typeof computeWeek>;
