import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, ClipboardList } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import { toLocalDateKey } from '../../../services/googleDriveService';
import { staffAttendanceService } from '../../../services/staffAttendanceService';
import { teachingLogService, enabledKeys, monthLabel } from '../../../services/teachingLogService';
import { isHomeroomClass, ABSENT_STATUSES } from '../reports/SchoolMealReportPanel';

/**
 * "Việc cần xử lý hôm nay" for the school admin / principals: what is still missing today, with the names,
 * and one click to the screen where it is handled. Read-only: it never writes anything.
 * Staff check-in and teaching-log numbers need the manager password already entered on those screens
 * (viewer session); without it the row only links to the screen.
 */
type Item = { key: string; title: string; detail: string; names?: string[]; state: 'done' | 'todo' | 'unknown'; view: string; action: string };

export const ManagerTodayTasks: React.FC<{ onNavigate: (viewId: any) => void }> = ({ onNavigate }) => {
  const { classes, students, attendanceRecords, boardingRecords } = useClassroom();
  const today = toLocalDateKey(new Date());
  const month = today.slice(0, 7);
  const weekend = [0, 6].includes(new Date().getDay());

  const [staff, setStaff] = useState<{ total: number; missing: string[] } | null>(null);
  const [teach, setTeach] = useState<{ total: number; missing: string[] } | null>(null);

  useEffect(() => {
    let alive = true;
    const auth = staffAttendanceService.getViewerAuth();
    if (!auth) return;
    staffAttendanceService.range(today, today, auth).then(r => {
      if (!alive || !r?.success || !Array.isArray(r.staff)) return;
      const day = (r.days || {})[today] || {};
      setStaff({ total: r.staff.length, missing: r.staff.filter((s: any) => !day[s.code]).map((s: any) => s.name) });
    }).catch(() => undefined);
    teachingLogService.report(month, month, auth).then(r => {
      if (!alive || !r?.success) return;
      const logs = (r.logs || {})[month] || {};
      // Only teachers whose declaration has something to log are expected to file a monthly sheet
      const due = (r.staff || []).filter(s => enabledKeys((r.profiles || {})[s.code]).length > 0);
      setTeach({ total: due.length, missing: due.filter(s => !logs[s.code]).map(s => s.name) });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [today, month]);

  const { noAttendance, noMeal, total } = useMemo(() => {
    const list = classes.filter(isHomeroomClass).filter(c => students.some(s => s.classId === c.id))
      .slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true }));
    const noAtt: string[] = []; const noMl: string[] = [];
    list.forEach(cls => {
      const att = attendanceRecords.find(r => r.date === today && r.classId === cls.id);
      const sheet = boardingRecords.find(r => r.date === today && r.classId === cls.id);
      const isAbsent = (id: string) => ABSENT_STATUSES.has(String(att?.records?.[id] || ''));
      if (!att) noAtt.push(cls.name);
      if (!(sheet && (sheet.confirmedAt || Object.keys(sheet.records || {}).some(id => !isAbsent(id))))) noMl.push(cls.name);
    });
    return { noAttendance: noAtt, noMeal: noMl, total: list.length };
  }, [classes, students, attendanceRecords, boardingRecords, today]);

  const items: Item[] = [
    { key: 'att', title: 'Điểm danh học sinh', view: 'reports', action: 'Xem báo cáo',
      state: total === 0 ? 'unknown' : noAttendance.length ? 'todo' : 'done',
      detail: total === 0 ? 'Chưa có lớp chủ nhiệm nào có học sinh' : noAttendance.length ? `${noAttendance.length}/${total} lớp chưa điểm danh` : `Đủ ${total}/${total} lớp đã điểm danh`,
      names: noAttendance },
    { key: 'meal', title: 'Báo ăn bán trú', view: 'reports', action: 'Xem biểu báo ăn',
      state: total === 0 ? 'unknown' : noMeal.length ? 'todo' : 'done',
      detail: total === 0 ? 'Chưa có lớp để tổng hợp' : noMeal.length ? `${noMeal.length}/${total} lớp chưa báo ăn` : `Đủ ${total}/${total} lớp đã báo ăn`,
      names: noMeal },
    { key: 'staff', title: 'Chấm công nhân sự', view: 'staff_attendance', action: 'Mở chấm công',
      state: !staff ? 'unknown' : staff.missing.length ? 'todo' : 'done',
      detail: !staff ? 'Mở màn Chấm công và nhập mật khẩu để xem số liệu hôm nay' : staff.missing.length ? `${staff.missing.length}/${staff.total} người chưa điểm danh` : `Đủ ${staff.total}/${staff.total} người đã điểm danh`,
      names: staff?.missing },
    { key: 'teach', title: `Kê khai tiết dạy ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`, view: 'staff_attendance', action: 'Xem kê khai',
      state: !teach ? 'unknown' : teach.missing.length ? 'todo' : 'done',
      detail: !teach ? 'Mở màn Chấm công để xem ai chưa kê khai' : teach.total === 0 ? 'Chưa có giáo viên nào khai báo phân công' : teach.missing.length ? `${teach.missing.length}/${teach.total} giáo viên chưa kê khai` : `Đủ ${teach.total}/${teach.total} giáo viên đã kê khai`,
      names: teach?.missing },
  ];
  const todo = items.filter(i => i.state === 'todo').length;

  return (
    <section className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden" aria-label="Việc cần xử lý hôm nay">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <h2 className="normal-case text-base font-black text-slate-900 inline-flex items-center gap-2 min-w-0">
          <ClipboardList className="w-5 h-5 text-indigo-600 shrink-0" /> <span className="truncate">Việc cần xử lý hôm nay</span>
        </h2>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${todo ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
          {weekend ? 'Ngày nghỉ' : todo ? `${todo} việc còn thiếu` : 'Không còn việc thiếu'}
        </span>
      </div>
      <ul className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 divide-slate-100">
        {items.map((it, i) => (
          <li key={it.key} className={`lg:border-slate-100 ${i % 2 === 0 ? 'lg:border-r' : ''} ${i < 2 ? 'lg:border-b' : ''}`}>
            <button type="button" onClick={() => onNavigate(it.view)}
              className="no-hover-fx w-full text-left px-4 sm:px-5 py-3 flex items-start gap-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600">
              {it.state === 'done'
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                : <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${it.state === 'todo' ? 'text-amber-600' : 'text-slate-400'}`} aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-900">{it.title}</span>
                <span className={`block text-sm ${it.state === 'todo' ? 'font-bold text-amber-800' : 'text-slate-600'}`}>{it.detail}</span>
                {it.state === 'todo' && it.names && it.names.length > 0 && (
                  <span className="block text-xs text-slate-600 mt-0.5 line-clamp-2" title={it.names.join(', ')}>
                    {it.names.slice(0, 8).join(', ')}{it.names.length > 8 ? ` và ${it.names.length - 8} nữa` : ''}
                  </span>
                )}
              </span>
              <span className="text-xs font-bold text-indigo-700 inline-flex items-center gap-0.5 whitespace-nowrap mt-0.5">{it.action}<ChevronRight className="w-4 h-4" /></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ManagerTodayTasks;
