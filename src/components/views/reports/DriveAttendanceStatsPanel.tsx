import { MANAGER_REPORT_MS } from '../../../utils/liveSync';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, RefreshCw, CheckSquare, Utensils, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import { databaseService, FORCE_DATA_REFRESH_EVENT } from '../../../services/databaseService';
import {
  googleDriveService,
  toLocalDateKey,
  DriveRangeAggregate,
  DriveRangeDayTotals
} from '../../../services/googleDriveService';

/**
 * 📊 Thống kê chuyên cần & ăn bán trú toàn trường từ thư mục Google Drive dùng chung.
 * Số liệu do từng GVCN bấm lưu điểm danh / bán trú → tệp gvcn_*.json trên Drive →
 * Apps Script V3 tổng hợp (aggregateRange). Tự làm mới mỗi 15 giây và ngay khi GVCN xác nhận.
 */

const REFRESH_MS = MANAGER_REPORT_MS; // báo cáo số liệu BGH / Quản trị: 15 s (utils/liveSync)
// Drive write by the GVCN takes a few seconds after the realtime "confirmed" event
const AFTER_CONFIRM_DELAY_MS = 4000;

type PeriodKey = 'today' | 'yesterday' | 'week' | 'month';

interface PeriodStats {
  key: PeriodKey;
  label: string;
  from: string;
  to: string;
  days: number;
  attendanceRate: number | null;
  present: number;
  students: number;
  absent: number;
  boardingRate: number | null;
  boardingSchoolRate: number | null;
  boardingActual: number;
  boardingRegistered: number;
}

const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const formatVN = (key: string) => {
  const [y, m, d] = key.split('-');
  return d && m ? `${d}/${m}/${y}` : key;
};

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

// schoolTotal = total enrolment of the whole school. The rate is present / (schoolTotal × days with data),
// so classes that have not reported lower the rate instead of being left out.
const computePeriods = (data: DriveRangeAggregate | null, now: Date, schoolTotal: number): PeriodStats[] => {
  const today = toLocalDateKey(now);
  const yesterday = toLocalDateKey(addDays(now, -1));
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const weekStart = toLocalDateKey(addDays(now, -dow));
  const monthStart = toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), 1));

  const defs: Array<{ key: PeriodKey; label: string; from: string; to: string }> = [
    { key: 'today', label: 'Hôm nay', from: today, to: today },
    { key: 'yesterday', label: 'Hôm qua', from: yesterday, to: yesterday },
    { key: 'week', label: 'Tuần này', from: weekStart, to: today },
    { key: 'month', label: 'Tháng này', from: monthStart, to: today }
  ];

  // Boarding per day, counted only for classes that took attendance that day
  // (a class without an attendance sheet is left out of the boarding totals).
  const boardingByDay: Record<string, { registered: number; actual: number }> = {};
  (data?.classes || []).forEach(c => {
    Object.entries(c.days || {}).forEach(([date, d]) => {
      if (!d?.att || !d?.brd) return;
      const slot = boardingByDay[date] || (boardingByDay[date] = { registered: 0, actual: 0 });
      slot.registered += Number(d.brd.registered) || 0;
      slot.actual += Number(d.brd.actual) || 0;
    });
  });

  return defs.map(def => {
    const acc: DriveRangeDayTotals = {
      attendanceClasses: 0, students: 0, present: 0, late: 0, excused: 0, unexcused: 0,
      boardingClasses: 0, boardingRegistered: 0, boardingActual: 0
    };
    let days = 0;
    Object.entries(data?.days || {}).forEach(([date, t]) => {
      if (date < def.from || date > def.to) return;
      if (t.attendanceClasses > 0) days++;
      acc.students += t.students || 0;
      acc.present += t.present || 0;
      acc.excused += t.excused || 0;
      acc.unexcused += t.unexcused || 0;
    });
    Object.entries(boardingByDay).forEach(([date, b]) => {
      if (date < def.from || date > def.to) return;
      acc.boardingRegistered += b.registered;
      acc.boardingActual += b.actual;
    });
    // Never below the reported headcount (class lists on this machine may lag behind Drive)
    const enrolment = days > 0 ? Math.max(schoolTotal * days, acc.students) : acc.students;
    return {
      ...def,
      days,
      attendanceRate: pct(acc.present, enrolment),
      present: acc.present,
      students: enrolment,
      absent: acc.excused + acc.unexcused,
      // Boarding: meals registered / students actually present; plus the share of the whole school
      boardingRate: pct(acc.boardingActual, acc.present),
      boardingSchoolRate: pct(acc.boardingActual, enrolment),
      boardingActual: acc.boardingActual,
      boardingRegistered: acc.boardingRegistered
    };
  });
};

export const DriveAttendanceStatsPanel: React.FC<{ schoolTotalStudents?: number }> = ({ schoolTotalStudents = 0 }) => {
  const { currentUser, setIsGoogleDriveModalOpen } = useClassroom();
  const [data, setData] = useState<DriveRangeAggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string>('');
  const [isConfigured, setIsConfigured] = useState(() => Boolean(googleDriveService.getConfig().scriptUrl));

  const load = useCallback(async () => {
    const cfg = googleDriveService.getConfig();
    if (!cfg.scriptUrl) {
      setIsConfigured(false);
      return;
    }
    setIsConfigured(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = addDays(now, -((now.getDay() + 6) % 7));
    const yesterday = addDays(now, -1);
    const earliest = [monthStart, weekStart, yesterday].reduce((a, b) => (a < b ? a : b));

    setLoading(true);
    const res = await googleDriveService.fetchAttendanceRangeStats(toLocalDateKey(earliest), toLocalDateKey(now));
    setLoading(false);
    if (res.success && res.data) {
      setData(res.data);
      setError(null);
      setLastLoadedAt(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } else {
      setError(res.message);
    }
  }, []);

  useEffect(() => {
    // Shared config may arrive just after login — load once now and keep polling
    load();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      load();
    }, REFRESH_MS);
    // GVCN bấm "Xác nhận điểm danh / bán trú" → tải lại ngay sau khi tệp Drive được ghi
    let pending: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;
    if (currentUser?.username) {
      try {
        unsubscribe = databaseService.subscribeRealtimeUpdates(currentUser.username, (event) => {
          const t = String(event?.type || '');
          if (t === 'ATTENDANCE_CONFIRMED' || t === 'BOARDING_CONFIRMED' || t === 'ATTENDANCE_UPDATED' || t === 'BOARDING_UPDATED') {
            if (pending) clearTimeout(pending);
            pending = setTimeout(load, AFTER_CONFIRM_DELAY_MS);
          }
        });
      } catch (_) {}
    }
    // Quản trị/BGH bấm "Cập nhật dữ liệu" ở thanh trên cùng → tải lại ngay
    const onForceRefresh = () => load();
    window.addEventListener(FORCE_DATA_REFRESH_EVENT, onForceRefresh);
    return () => {
      clearInterval(timer);
      if (pending) clearTimeout(pending);
      if (unsubscribe) unsubscribe();
      window.removeEventListener(FORCE_DATA_REFRESH_EVENT, onForceRefresh);
    };
  }, [load, currentUser?.username]);

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  // Whole-school enrolment: the larger of the class lists held by this account and the class files on Drive
  const schoolTotal = useMemo(() => {
    const onDrive = (data?.classes || []).reduce((sum, c) => sum + (Number(c.totalStudents) || 0), 0);
    return Math.max(schoolTotalStudents, onDrive);
  }, [data, schoolTotalStudents]);
  const periods = useMemo(() => computePeriods(data, now, schoolTotal), [data, todayKey, schoolTotal]);

  const classRows = useMemo(() => {
    if (!data) return [];
    return [...data.classes]
      .map(c => {
        const d = c.days?.[todayKey];
        return {
          ...c,
          att: d?.att,
          brd: d?.brd
        };
      })
      .sort((a, b) => (a.className || '').localeCompare(b.className || '', 'vi', { numeric: true, sensitivity: 'base' }));
  }, [data, todayKey]);

  const reportedToday = classRows.filter(r => r.att).length;
  // Chưa lớp nào gửi số liệu trong cả 4 kỳ → 1 dòng thông báo gọn thay vì 8 ô "chưa có số liệu"
  const hasAnyData = periods.some(p => p.students > 0 || p.boardingRegistered > 0);

  if (!isConfigured) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-sky-100 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-black text-sky-900">Thống kê toàn trường qua Google Drive</p>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              Chưa cấu hình thư mục Google Drive dùng chung. Quản trị nhà trường cấu hình 1 lần, mọi tài khoản tự nhận.
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsGoogleDriveModalOpen(true)}
          className="px-3 py-2 rounded-xl bg-sky-700 text-white text-xs font-black hover:bg-sky-800 shrink-0"
        >
          Cấu hình Google Drive
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-sky-100 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-black text-sky-900">Chuyên cần & bán trú toàn trường</p>
            <p className="text-xs text-slate-600">
              {data
                ? <>Hôm nay <strong className="text-slate-800">{reportedToday}/{data.totalClasses}</strong> lớp đã báo cáo · cập nhật {lastLoadedAt}</>
                : 'Đang tải số liệu từ các lớp…'}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-200 text-sky-700 text-xs font-black hover:bg-sky-50 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[12px] font-bold text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {data && !hasAnyData && !error ? (
        <p className="rounded-xl bg-slate-50 border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-600">
          Chưa có lớp nào gửi số liệu chuyên cần, bán trú trong tháng này. Số liệu tự hiện khi giáo viên chủ nhiệm điểm danh và bấm <strong>Xác nhận</strong>.
        </p>
      ) : (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {periods.map(p => (
          <div key={p.key} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-black text-slate-700 uppercase">{p.label}</span>
              <span className="text-[12px] font-bold text-slate-400">
                {p.from === p.to ? formatVN(p.from) : `${formatVN(p.from).slice(0, 5)}–${formatVN(p.to).slice(0, 5)}`}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[12px] font-bold text-slate-500">Chuyên cần</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-black font-mono ${p.attendanceRate === null ? 'text-slate-500' : p.attendanceRate >= 95 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {p.attendanceRate === null ? '—' : `${p.attendanceRate}%`}
              </span>
              <span className="text-[12px] font-bold text-slate-500">
                {p.students > 0 ? `${p.present}/${p.students}${p.days > 1 ? ` lượt • ${p.days} ngày` : ''}` : 'chưa có số liệu'}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-[12px] font-bold text-slate-500">Ăn bán trú</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-black font-mono ${p.boardingRate === null ? 'text-slate-500' : 'text-orange-700'}`}>
                {p.boardingRate === null ? '—' : `${p.boardingRate}%`}
              </span>
              <span className="text-[12px] font-bold text-slate-500">
                {p.boardingRegistered > 0
                  ? (p.present > 0 ? `${p.boardingActual}/${p.present} HS đi học` : `${p.boardingActual} suất`)
                  : 'chưa có số liệu'}
              </span>
            </div>
            {p.boardingRegistered > 0 && p.boardingSchoolRate !== null && (
              <p className="text-[12px] font-bold text-slate-500 whitespace-nowrap">
                {p.boardingSchoolRate}% sĩ số trường ({p.boardingActual}/{p.students})
              </p>
            )}
          </div>
        ))}
      </div>
      )}

      {classRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-2.5 py-2 font-black">Lớp</th>
                <th className="text-left px-2.5 py-2 font-black hidden sm:table-cell">GVCN</th>
                <th className="text-right px-2.5 py-2 font-black">Sĩ số</th>
                <th className="text-right px-2.5 py-2 font-black">Có mặt</th>
                <th className="text-right px-2.5 py-2 font-black">Vắng P/K</th>
                <th className="text-right px-2.5 py-2 font-black">Chuyên cần</th>
                <th className="text-right px-2.5 py-2 font-black">Bán trú</th>
                <th className="text-center px-2.5 py-2 font-black">Hôm nay</th>
              </tr>
            </thead>
            <tbody>
              {classRows.map(r => {
                const rate = r.att && r.totalStudents > 0 ? Math.round((r.att.present / r.totalStudents) * 1000) / 10 : null;
                return (
                  <tr key={r.fileName} className="border-t border-slate-100">
                    <td className="px-2.5 py-1.5 font-black text-slate-800">{r.className}</td>
                    <td className="px-2.5 py-1.5 font-semibold text-slate-600 hidden sm:table-cell">{r.teacherName || '—'}</td>
                    <td className="px-2.5 py-1.5 text-right font-mono">{r.totalStudents}</td>
                    <td className="px-2.5 py-1.5 text-right font-mono">{r.att ? r.att.present : '—'}</td>
                    <td className="px-2.5 py-1.5 text-right font-mono">{r.att ? `${r.att.excused}/${r.att.unexcused}` : '—'}</td>
                    <td className="px-2.5 py-1.5 text-right font-mono font-black">{rate === null ? '—' : `${rate}%`}</td>
                    <td className="px-2.5 py-1.5 text-right font-mono">{r.att && r.brd ? `${r.brd.actual}/${r.brd.registered}` : '—'}</td>
                    <td className="px-2.5 py-1.5 text-center">
                      {r.att ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-black"><CheckCircle2 className="w-3.5 h-3.5" />Đã báo cáo</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-black"><Clock className="w-3.5 h-3.5" />Chưa</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
