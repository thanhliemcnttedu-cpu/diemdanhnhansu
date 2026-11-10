import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  UserCheck, RefreshCw, Download, Upload, Users, Link2, Copy, Check, Plus, KeyRound, Lock, Unlock, Trash2, Search, Loader2, ShieldAlert, TrendingUp, TrendingDown, Minus, Pencil, MapPin, CheckCircle2, Info, Eye, EyeOff, BookOpenCheck, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import {
  staffAttendanceService, STAFF_STATUS_META, aggregate, toDateKey, addDays, fromDateKey, shortDateLabel, longDateLabel, weekdayLabel, dateRangeKeys,
  parseStaffSheet, STAFF_TEMPLATE_HEADERS, isLockedFor, StaffDayLock, composeTripNote, randomPin, weekdayShort, attemptOf, attemptsOf, systemNoteOf, timeHMS, StaffMember, StaffRecord, StaffStatus, StaffUpsert, ParsedStaffRow,
} from '../../../services/staffAttendanceService';
import { StaffCheckInQrCard } from './StaffCheckInQr';
import { TeachingReportPanel } from './TeachingReportPanel';
import { appsScriptSetupService, compareVersions, versionLabel } from '../../../services/appsScriptSetupService';
import { openReinitSchoolDb } from '../../modals/ReinitSchoolDbModal';

type Tab = 'summary' | 'roster' | 'teach' | 'link';
type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
type DaysMap = Record<string, Record<string, StaffRecord>>;

const STATUS_ORDER: Array<StaffStatus | 'missing'> = ['present', 'business_trip', 'sick_leave', 'personal_unpaid', 'missing'];

// ---------------------------------------------------------------- small charts (SVG, không cần thư viện)
const Donut: React.FC<{ parts: Array<{ key: string; value: number; color: string; label: string }>; centerTop: string; centerSub: string }> = ({ parts, centerTop, centerSub }) => {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 52, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 140 140" className="w-40 h-40 shrink-0" role="img" aria-label={`${centerTop} ${centerSub}`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="18" />
      {parts.filter(p => p.value > 0).map(p => {
        const len = (p.value / total) * c;
        const el = <circle key={p.key} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"><title>{`${p.label}: ${p.value}`}</title></circle>;
        acc += len;
        return el;
      })}
      <text x="70" y="68" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 24, fontWeight: 900 }}>{centerTop}</text>
      <text x="70" y="88" textAnchor="middle" className="fill-slate-600" style={{ fontSize: 11, fontWeight: 700 }}>{centerSub}</text>
    </svg>
  );
};

const StackedBars: React.FC<{ daily: ReturnType<typeof aggregate>['daily'] }> = ({ daily }) => {
  if (daily.length === 0) return <p className="text-sm text-slate-600 py-8 text-center">Chưa có ngày làm việc trong khoảng đã chọn.</p>;
  const W = Math.max(560, daily.length * 34), H = 220, padL = 34, padB = 34, padT = 12;
  const max = Math.max(1, ...daily.map(d => d.total));
  const bw = Math.min(26, (W - padL - 10) / daily.length - 6);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }} role="img" aria-label="Biểu đồ điểm danh theo ngày">
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" />
            <text x={padL - 6} y={y(max * t) + 4} textAnchor="end" style={{ fontSize: 10 }} className="fill-slate-500">{Math.round(max * t)}</text>
          </g>
        ))}
        {daily.map((d, i) => {
          const x = padL + 6 + i * ((W - padL - 10) / daily.length);
          let top = H - padB;
          return (
            <g key={d.date}>
              {STATUS_ORDER.map(k => {
                const v = d[k];
                if (!v) return null;
                const h = (H - padT - padB) * (v / max);
                top -= h;
                return <rect key={k} x={x} y={top} width={bw} height={h} rx={k === 'missing' ? 3 : 0} fill={STAFF_STATUS_META[k].color} opacity={k === 'missing' ? 0.35 : 1}><title>{`${shortDateLabel(d.date)} • ${STAFF_STATUS_META[k].label}: ${v}`}</title></rect>;
              })}
              <text x={x + bw / 2} y={H - padB + 14} textAnchor="middle" style={{ fontSize: 10 }} className="fill-slate-600">{shortDateLabel(d.date)}</text>
              <text x={x + bw / 2} y={H - padB + 26} textAnchor="middle" style={{ fontSize: 9 }} className="fill-slate-500">{weekdayShort(d.date)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const Legend = () => (
  <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-700">
    {STATUS_ORDER.map(k => (
      <span key={k} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: STAFF_STATUS_META[k].color, opacity: k === 'missing' ? 0.35 : 1 }} />{STAFF_STATUS_META[k].label}</span>
    ))}
  </div>
);

// ---------------------------------------------------------------- main view
export const StaffAttendanceView: React.FC = () => {
  const { currentUser, isBgh, isSchoolAdmin } = useClassroom();
  const canManage = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'school_admin' || isSchoolAdmin));
  const schoolName = currentUser?.schoolName || '';

  const [tab, setTab] = useState<Tab>('summary');
  // Phiên đã nhớ phải đúng tài khoản đang đăng nhập phần mềm
  const [auth, setAuth] = useState(() => {
    const a = staffAttendanceService.getViewerAuth();
    return a && (!currentUser?.username || a.username === currentUser.username.trim().toLowerCase()) ? a : null;
  });
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [today, setToday] = useState(() => toDateKey(new Date()));
  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState(() => addDays(toDateKey(new Date()), -6));
  const [customTo, setCustomTo] = useState(() => toDateKey(new Date()));
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [days, setDays] = useState<DaysMap>({});
  const [locks, setLocks] = useState<Record<string, StaffDayLock>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Loại lỗi để hiện nút xử lý phù hợp: 'dead' (link Apps Script không trả lời) / 'no_db' (mất csdl_truong.json)
  const [errorKind, setErrorKind] = useState<'dead' | 'no_db' | ''>('');
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [loadedRange, setLoadedRange] = useState<{ from: string; to: string } | null>(null);
  // Bảng chi tiết: ngày đang xem ('' = hôm nay). Quản trị / BGH chọn ngày đã qua để điểm danh bù cho nhân sự
  const [detailDate, setDetailDate] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  const range = useMemo(() => {
    const d = fromDateKey(today);
    if (period === 'today') return { from: today, to: today, label: 'Hôm nay' };
    if (period === 'yesterday') { const y = addDays(today, -1); return { from: y, to: y, label: 'Hôm qua' }; }
    if (period === 'week') { const dow = (d.getDay() + 6) % 7; const from = addDays(today, -dow); return { from, to: addDays(from, 6), label: 'Tuần này' }; }
    if (period === 'month') { const from = toDateKey(new Date(d.getFullYear(), d.getMonth(), 1)); const to = toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)); return { from, to, label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` }; }
    const from = customFrom <= customTo ? customFrom : customTo, to = customFrom <= customTo ? customTo : customFrom;
    return { from, to, label: `${shortDateLabel(from)}/${from.slice(0, 4)} – ${shortDateLabel(to)}/${to.slice(0, 4)}` };
  }, [period, today, customFrom, customTo]);

  // luôn tải kèm 7 ngày trước để so sánh với ngày làm việc gần nhất
  const fetchFrom = useMemo(() => (range.from < addDays(today, -7) ? range.from : addDays(today, -7)), [range.from, today]);
  const fetchTo = useMemo(() => (range.to > today ? range.to : today), [range.to, today]);

  const load = useCallback(async (silent = false) => {
    if (!auth) return;
    if (!silent) setLoading(true);
    setError(''); setErrorKind('');
    try {
      const r = await staffAttendanceService.range(fetchFrom, fetchTo, auth);
      if (!r?.success) {
        if (r?.code === 'UNAUTHORIZED') {
          const d = await staffAttendanceService.diagnoseFailure();
          if (d.kind === 'no_db' || d.kind === 'dead') { setError(d.message); setErrorKind(d.kind); return; }
          staffAttendanceService.clearViewerAuth(); setAuth(null);
        }
        setError(r?.message || 'Không tải được dữ liệu chấm công.');
        return;
      }
      setStaff(r.staff || []);
      setDays(r.days || {});
      setLocks(r.locks || {});
      if (r.today) setToday(r.today);
      setLoadedRange({ from: fetchFrom, to: fetchTo });
      setLastLoaded(new Date());
    } catch (e: any) {
      const d = e?.code === 'NETWORK' ? await staffAttendanceService.diagnoseFailure() : null;
      if (d && (d.kind === 'dead' || d.kind === 'no_db')) { setError(d.message); setErrorKind(d.kind); }
      else setError(e?.message || 'Không kết nối được Apps Script.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [auth, fetchFrom, fetchTo]);

  useEffect(() => { if (tab === 'summary') load(); }, [load, tab]);
  // tự làm mới mỗi 60 giây khi đang xem số liệu có hôm nay
  useEffect(() => {
    if (tab !== 'summary' || range.to < today) return;
    const t = setInterval(() => { if (!document.hidden) load(true); }, 60000);
    return () => clearInterval(t);
  }, [tab, range.to, today, load]);

  const dd = detailDate && detailDate < today ? detailDate : today;
  useEffect(() => {
    if (!auth || tab !== 'summary' || !loadedRange || (dd >= loadedRange.from && dd <= loadedRange.to)) return;
    let alive = true;
    setDetailLoading(true);
    staffAttendanceService.range(dd, dd, auth)
      .then(r => {
        if (!alive || !r?.success) return;
        setDays(prev => ({ ...prev, [dd]: (r.days || {})[dd] || {} }));
        setLocks(prev => { const next = { ...prev }; const L = (r.locks || {})[dd]; if (L) next[dd] = L; else delete next[dd]; return next; });
      })
      .catch(() => { /* lỗi mạng: giữ nguyên, người dùng bấm Tải lại */ })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [dd, auth, tab, loadedRange]);

  const stats = useMemo(() => aggregate(staff, days, range.from, range.to, today), [staff, days, range, today]);
  const todayStats = useMemo(() => aggregate(staff, days, today, today, today).daily[0], [staff, days, today]);
  // Ngày làm việc gần nhất trước hôm nay (Thứ Hai so với Thứ Sáu tuần trước)
  const prevDay = useMemo(() => {
    for (let i = 1; i <= 7; i++) {
      const k = addDays(today, -i);
      const dow = fromDateKey(k).getDay();
      if ((dow >= 1 && dow <= 5) || Object.keys(days[k] || {}).length > 0) return k;
    }
    return addDays(today, -1);
  }, [today, days]);
  const yStats = useMemo(() => aggregate(staff, days, prevDay, prevDay, today).daily[0], [staff, days, prevDay, today]);
  const prevLabel = `${weekdayLabel(prevDay)} ${shortDateLabel(prevDay)}`;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.username || !authPassword) return;
    const a = { username: currentUser.username, password: authPassword };
    setAuthError('');
    try {
      const r = await staffAttendanceService.range(today, today, a);
      if (!r?.success) {
        const d = r?.code === 'UNAUTHORIZED' ? await staffAttendanceService.diagnoseFailure() : null;
        setAuthError(d && d.kind !== 'ok' && d.kind !== 'unknown' ? d.message : (r?.message || 'Sai mật khẩu.'));
        return;
      }
      staffAttendanceService.rememberViewerAuth(a.username, a.password, canManage);
      setAuth(a); setAuthPassword('');
    } catch (err: any) {
      const d = err?.code === 'NETWORK' ? await staffAttendanceService.diagnoseFailure() : null;
      setAuthError(d && d.kind !== 'ok' && d.kind !== 'unknown' ? d.message : (err?.message || 'Không kết nối được Apps Script.'));
    }
  };

  // ---------------------------------------------------------------- Excel export
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const title = `BẢNG TỔNG HỢP CHẤM CÔNG GIÁO VIÊN – NHÂN VIÊN${schoolName ? ' • ' + schoolName.toUpperCase() : ''}`;
    const sub = `Thời gian: ${range.label} (${range.from} → ${range.to}) • Số ngày làm việc: ${stats.workingDays.length} • Nhân sự đang làm việc: ${stats.activeCount}`;

    // 1. Tổng hợp theo ngày
    const s1: any[][] = [[title], [sub], [],
      ['Ngày', 'Thứ', 'Tổng nhân sự', 'Có mặt', 'Đi công tác', 'Nghỉ ốm có phép', 'Nghỉ việc riêng KHL', 'Chưa điểm danh', 'Tỷ lệ đi làm (%)', 'Tỷ lệ đã điểm danh (%)']];
    stats.daily.forEach(d => s1.push([d.date.split('-').reverse().join('/'), weekdayLabel(d.date), d.total, d.present, d.business_trip, d.sick_leave, d.personal_unpaid, d.missing, d.workRate, d.markRate]));
    s1.push(['TỔNG CỘNG', '', stats.totals.slots, stats.totals.present, stats.totals.business_trip, stats.totals.sick_leave, stats.totals.personal_unpaid, stats.totals.missing, stats.totals.workRate, stats.totals.markRate]);
    const ws1 = XLSX.utils.aoa_to_sheet(s1);
    ws1['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 13 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 19 }, { wch: 15 }, { wch: 16 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Tong hop theo ngay');

    // 2. Tổng hợp theo nhân sự
    const s2: any[][] = [[title], [sub], [],
      ['STT', 'Mã GV', 'Họ và tên', 'Chức vụ', 'Tổ / bộ phận', 'Số ngày làm việc', 'Có mặt', 'Đi công tác', 'Nghỉ ốm có phép', 'Nghỉ việc riêng KHL', 'Chưa điểm danh', 'Tỷ lệ đi làm (%)', 'Số ngày có điểm danh lại']];
    stats.people.forEach((p, i) => s2.push([i + 1, p.staff.code, p.staff.name, p.staff.position || '', p.staff.dept || '', p.workDays, p.present, p.business_trip, p.sick_leave, p.personal_unpaid, p.missing, p.workRate,
      stats.workingDays.filter(d => attemptOf((days[d] || {})[p.staff.code]) > 1).length]));
    const ws2 = XLSX.utils.aoa_to_sheet(s2);
    ws2['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 9 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 15 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Tong hop theo nhan su');

    // 3. Bảng chấm công chi tiết (người × ngày)
    const code = (r?: StaffRecord) => (!r ? '–' : r.status === 'present' ? 'X' : r.status === 'business_trip' ? 'CT' : r.status === 'sick_leave' ? 'Ô' : 'R');
    const s3: any[][] = [[title], [sub, '', '', 'Ký hiệu: X = có mặt, CT = đi công tác, Ô = nghỉ ốm có phép, R = nghỉ việc riêng không hưởng lương, – = chưa điểm danh'], [],
      ['STT', 'Mã GV', 'Họ và tên', ...stats.workingDays.map(d => `${shortDateLabel(d)} ${weekdayShort(d)}`), 'X', 'CT', 'Ô', 'R', '–']];
    stats.people.forEach((p, i) => s3.push([i + 1, p.staff.code, p.staff.name, ...stats.workingDays.map(d => code((days[d] || {})[p.staff.code])), p.present, p.business_trip, p.sick_leave, p.personal_unpaid, p.missing]));
    const ws3 = XLSX.utils.aoa_to_sheet(s3);
    ws3['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 26 }, ...stats.workingDays.map(() => ({ wch: 8 })), { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Cham cong chi tiet');

    // 4. Nhật ký điểm danh: MỖI LẦN điểm danh một dòng (lần 1, lần 2…) – giờ đầy đủ & ghi chú
    const s4: any[][] = [[title], [sub], [], ['Ngày', 'Mã GV', 'Họ và tên', 'Lần', 'Trạng thái', 'Giờ điểm danh', 'Ghi chú của người điểm danh', 'Ghi chú hệ thống', 'Kết quả cuối cùng trong ngày']];
    const byCode = new Map(staff.map(s => [s.code, s]));
    stats.workingDays.forEach(d => Object.entries(days[d] || {}).forEach(([c, r]) => {
      const list = attemptsOf(r);
      list.forEach((at, i) => {
        s4.push([d.split('-').reverse().join('/'), c, byCode.get(c)?.name || '', i + 1, STAFF_STATUS_META[at.status]?.label || at.status, timeHMS(at.at), at.note || '',
          [i > 0 ? `Thực hiện điểm danh lại lần ${i + 1}` : '', at.by ? `Điểm danh hộ bởi ${at.by}` : (list.slice(0, i).some(x => x.by) ? 'Nhân sự tự điểm danh' : '')].filter(Boolean).join(' • '),
          i === list.length - 1 ? 'Có (được tính)' : 'Không (đã sửa)']);
      });
    }));
    const ws4 = XLSX.utils.aoa_to_sheet(s4);
    ws4['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 6 }, { wch: 32 }, { wch: 13 }, { wch: 36 }, { wch: 30 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Nhat ky diem danh');

    XLSX.writeFile(wb, `ChamCong_NhanSu_${range.from}_den_${range.to}.xlsx`);
  };

  // ---------------------------------------------------------------- UI pieces
  const delta = (a: number, b: number) => {
    const d = Math.round((a - b) * 10) / 10;
    if (d === 0) return <span className="inline-flex items-center gap-0.5 text-slate-600"><Minus className="w-3.5 h-3.5" />0</span>;
    return d > 0
      ? <span className="inline-flex items-center gap-0.5 text-emerald-800"><TrendingUp className="w-3.5 h-3.5" />+{d}</span>
      : <span className="inline-flex items-center gap-0.5 text-rose-700"><TrendingDown className="w-3.5 h-3.5" />{d}</span>;
  };

  if (!auth) {
    return (
      <div className="p-4 sm:p-6 max-w-xl mx-auto">
        <form onSubmit={handleUnlock} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center"><Lock className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Xác nhận để xem chấm công nhân sự</h2>
              <p className="text-sm text-slate-600">Dữ liệu nhân sự được bảo vệ. Nhập mật khẩu tài khoản <strong>{currentUser?.username}</strong> một lần — phần mềm nhớ trên máy này cho tới khi Đăng xuất.</p>
            </div>
          </div>
          <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} autoComplete="current-password" placeholder="Mật khẩu đăng nhập"
            className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 focus:border-indigo-600 outline-none text-base" />
          {authError && <p className="text-sm font-bold text-rose-700">{authError}</p>}
          <button type="submit" className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black">Mở dữ liệu chấm công</button>
        </form>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3">
        {/* Thanh thẻ xuống dòng riêng tới 2xl: cùng hàng tiêu đề chỉ khi đủ rộng (tránh tràn khi có 4 thẻ) */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-emerald-700 text-white flex items-center justify-center"><UserCheck className="w-6 h-6" /></div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 whitespace-nowrap truncate">
              <span className="sm:hidden">Chấm công nhân sự</span><span className="hidden sm:inline">Chấm công giáo viên – nhân viên</span>
            </h1>
            <p className="text-sm text-slate-600 truncate" title={`${longDateLabel(today)}${schoolName ? ` • ${schoolName}` : ''}`}>{longDateLabel(today)}{schoolName ? ` • ${schoolName}` : ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 sm:flex gap-1 sm:gap-1.5 bg-slate-100 p-1 rounded-2xl overflow-x-auto no-scrollbar max-w-full self-stretch sm:self-start 2xl:self-auto 2xl:shrink-0" role="tablist">
          {([['summary', 'Tổng hợp', 'Tổng hợp', <TrendingUp key="i" className="w-4 h-4" />], ['roster', 'Danh sách nhân sự', 'Nhân sự', <Users key="i" className="w-4 h-4" />], ['teach', 'Kê khai tiết dạy', 'Tiết dạy', <BookOpenCheck key="i" className="w-4 h-4" />], ['link', 'Link điểm danh', 'Link', <Link2 key="i" className="w-4 h-4" />]] as const).map(([id, label, shortLabel, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`min-w-0 sm:flex-none justify-center px-1 sm:px-3.5 py-2 rounded-xl text-sm font-black inline-flex items-center gap-1.5 whitespace-nowrap sm:shrink-0 ${tab === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
              <span className="hidden sm:inline-flex">{icon}</span><span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'summary' && (
        <>
          {/* Period picker */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
            {([['today', 'Hôm nay'], ['yesterday', 'Hôm qua'], ['week', 'Tuần này'], ['month', 'Tháng này'], ['custom', 'Tùy chọn']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setPeriod(id)}
                className={`px-3 py-1.5 rounded-xl text-sm font-black border ${period === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{label}</button>
            ))}
            {period === 'custom' && (
              <div className="flex items-center gap-2 text-sm">
                <input type="date" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1.5 rounded-xl border border-slate-300" aria-label="Từ ngày" />
                <span className="text-slate-600">đến</span>
                <input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1.5 rounded-xl border border-slate-300" aria-label="Đến ngày" />
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {lastLoaded && <span className="text-xs text-slate-600">Cập nhật {lastLoaded.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>}
              <button type="button" onClick={() => load()} disabled={loading} className="px-3 py-1.5 rounded-xl text-sm font-bold border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Làm mới
              </button>
              <button type="button" onClick={exportExcel} disabled={!loadedRange || staff.length === 0} className="px-3.5 py-1.5 rounded-xl text-sm font-black bg-emerald-700 hover:bg-emerald-800 text-white inline-flex items-center gap-1.5 disabled:opacity-50">
                <Download className="w-4 h-4" /> Xuất Excel
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 text-sm px-4 py-3 space-y-2" role="alert">
              <p className="font-bold flex items-start gap-2"><ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>
              {(errorKind === 'dead' || errorKind === 'no_db') && (
                <div className="flex flex-wrap gap-2 pl-6">
                  {errorKind === 'no_db' && canManage && (
                    <button type="button" onClick={openReinitSchoolDb} className="no-hover-fx h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold whitespace-nowrap">Khởi tạo lại CSDL trường</button>
                  )}
                  {errorKind === 'dead' && canManage && (
                    <button type="button" onClick={() => appsScriptSetupService.open('install')} className="no-hover-fx h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold whitespace-nowrap">Mở Cài đặt Apps Script</button>
                  )}
                  <a href="https://drive.google.com/drive/trash" target="_blank" rel="noreferrer" className="no-hover-fx h-9 px-3.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-100 text-rose-900 text-sm font-bold inline-flex items-center whitespace-nowrap">Mở Thùng rác Google Drive</a>
                  <button type="button" onClick={() => load()} className="no-hover-fx h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold whitespace-nowrap">Thử lại</button>
                </div>
              )}
            </div>
          )}
          {!error && staff.length === 0 && !loading && (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-700">
              Chưa có danh sách nhân sự. {canManage ? 'Vào thẻ "Danh sách nhân sự" để nhập từ Excel.' : 'Quản trị nhà trường cần nhập danh sách nhân sự trước.'}
            </div>
          )}

          {staff.length > 0 && todayStats && (
            <>
              {/* KPI hôm nay + so sánh hôm qua */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                  <p className="text-xs font-black uppercase text-slate-600">Tổng nhân sự</p>
                  <p className="text-3xl font-black text-slate-900">{todayStats.total}</p>
                  <p className="text-xs text-slate-600">Đã điểm danh hôm nay: {todayStats.marked} ({todayStats.markRate}%)</p>
                </div>
                {STATUS_ORDER.map(k => (
                  <div key={k} className="rounded-2xl border p-4" style={{ background: STAFF_STATUS_META[k].soft, borderColor: STAFF_STATUS_META[k].color + '40' }}>
                    <p className="text-xs font-black uppercase" style={{ color: STAFF_STATUS_META[k].text }}>{STAFF_STATUS_META[k].label}</p>
                    <p className="text-3xl font-black" style={{ color: STAFF_STATUS_META[k].text }}>{todayStats[k]}
                      <span className="text-base font-bold ml-1.5">({todayStats.total ? Math.round(todayStats[k] / todayStats.total * 1000) / 10 : 0}%)</span></p>
                    <p className="text-xs font-bold">So với {prevLabel}: {yStats ? delta(todayStats[k], yStats[k]) : '—'}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Hôm nay */}
                <div className="rounded-3xl bg-white border border-slate-200 p-4 space-y-3">
                  <h3 className="text-sm font-black uppercase text-slate-800">Hôm nay • {shortDateLabel(today)}</h3>
                  <div className="flex items-center gap-4">
                    <Donut centerTop={`${todayStats.workRate}%`} centerSub="đi làm" parts={STATUS_ORDER.map(k => ({ key: k, value: todayStats[k], color: STAFF_STATUS_META[k].color, label: STAFF_STATUS_META[k].label }))} />
                    <div className="space-y-1.5 text-sm">
                      <p className="font-bold text-slate-800">{prevLabel}: <span className="text-slate-900">{yStats ? `${yStats.workRate}%` : '—'}</span> đi làm</p>
                      <p className="font-bold text-slate-800">Chênh lệch: {yStats ? delta(todayStats.workRate, yStats.workRate) : '—'} điểm %</p>
                      <p className="text-slate-600">Tự làm mới mỗi phút.</p>
                    </div>
                  </div>
                </div>
                {/* Khoảng đã chọn */}
                <div className="rounded-3xl bg-white border border-slate-200 p-4 space-y-3 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-black uppercase text-slate-800">{range.label} • {stats.workingDays.length} ngày làm việc</h3>
                    <p className="text-sm font-bold text-slate-700">Tỷ lệ đi làm: <span className="text-emerald-800">{stats.totals.workRate}%</span> • Đã điểm danh: {stats.totals.markRate}%</p>
                  </div>
                  <StackedBars daily={stats.daily} />
                  <Legend />
                </div>
              </div>

              {/* Bảng theo ngày */}
              <div className="rounded-3xl bg-white border border-slate-200 overflow-hidden">
                <h3 className="px-4 pt-4 text-sm font-black uppercase text-slate-800">Tổng hợp theo ngày</h3>
                <div className="overflow-x-auto p-4">
                  <table className="w-full text-sm min-w-[680px] whitespace-nowrap">
                    <thead><tr className="text-left text-xs uppercase text-slate-600 border-b border-slate-200">
                      <th className="py-2 pr-2">Ngày</th><th className="py-2 pr-2 text-right">Tổng</th>
                      {STATUS_ORDER.map(k => <th key={k} className="py-2 pr-2 text-right">{STAFF_STATUS_META[k].short}</th>)}
                      <th className="py-2 text-right">Tỷ lệ đi làm</th>
                    </tr></thead>
                    <tbody>
                      {stats.daily.slice().reverse().map(d => (
                        <tr key={d.date} className="border-b border-slate-100">
                          <td className="py-2 pr-2 font-bold text-slate-900">{weekdayLabel(d.date)}, {shortDateLabel(d.date)}</td>
                          <td className="py-2 pr-2 text-right">{d.total}</td>
                          {STATUS_ORDER.map(k => <td key={k} className="py-2 pr-2 text-right font-bold" style={{ color: STAFF_STATUS_META[k].text }}>{d[k]}</td>)}
                          <td className="py-2 text-right">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-20 h-2 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-emerald-700" style={{ width: `${d.workRate}%` }} /></span>
                              <span className="font-black w-12 text-right">{d.workRate}%</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Hôm nay: chi tiết từng người */}
              <TodayDetail staff={staff} records={days[dd] || {}} today={today} date={dd} dayLock={locks[dd] || null} auth={auth}
                loadingDate={detailLoading} onDateChange={(d) => setDetailDate(d >= today ? '' : d)}
                onRecordsChanged={(date, recs) => setDays(prev => ({ ...prev, [date]: { ...(prev[date] || {}), ...recs } }))}
                onLockChanged={(L) => setLocks(prev => { const next = { ...prev }; if (L) next[dd] = L; else delete next[dd]; return next; })} />
            </>
          )}
        </>
      )}

      {tab === 'roster' && <RosterPanel canManage={canManage} auth={auth} schoolName={schoolName} />}
      {tab === 'teach' && auth && <TeachingReportPanel auth={auth} schoolName={schoolName} today={today} />}
      {tab === 'link' && <LinkPanel schoolName={schoolName} isBghOnly={Boolean(isBgh && !canManage)} />}
    </div>
  );
};

// ---------------------------------------------------------------- hôm nay: ai đã / chưa điểm danh
const TodayDetail: React.FC<{
  staff: StaffMember[]; records: Record<string, StaffRecord>; today: string; dayLock: StaffDayLock | null;
  /** Ngày đang xem (hôm nay hoặc ngày đã qua — Quản trị / BGH điểm danh bù) */
  date: string; loadingDate?: boolean; onDateChange: (d: string) => void;
  auth: { username: string; password: string } | null; onLockChanged: (L: StaffDayLock | null) => void;
  onRecordsChanged: (date: string, recs: Record<string, StaffRecord>) => void;
}> = ({ staff, records, today, date, loadingDate, onDateChange, dayLock, auth, onLockChanged, onRecordsChanged }) => {
  const isPast = date < today;
  /** "hôm nay" hoặc "ngày 05/11" — dùng trong mọi câu thông báo của bảng */
  const dayText = isPast ? `ngày ${shortDateLabel(date)}/${date.slice(0, 4)}` : 'hôm nay';
  // 📞 Điểm danh hộ (nhân sự báo qua điện thoại…) — BGH, Quản trị nhà trường, Quản trị tối cao (Apps Script 4.7)
  const [proxyCodes, setProxyCodes] = useState<string[] | null>(null);
  const [pStatus, setPStatus] = useState<StaffStatus>('present');
  const [pPlace, setPPlace] = useState('');
  const [pContent, setPContent] = useState('');
  const [pNote, setPNote] = useState('');
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState('');
  const openProxy = (codes: string[]) => { setProxyCodes(codes); setPStatus('present'); setPPlace(''); setPContent(''); setPNote(''); setPErr(''); };
  const submitProxy = async () => {
    if (!proxyCodes?.length) return;
    if (pStatus === 'business_trip' && !pPlace.trim()) { setPErr('Đi công tác: hãy ghi rõ nơi công tác.'); return; }
    const note = pStatus === 'business_trip' ? composeTripNote(pPlace, pContent, pNote) : pNote.trim();
    setPBusy(true); setPErr('');
    try {
      const r = await staffAttendanceService.proxyCheckIn({ codes: proxyCodes, status: pStatus, note, date }, auth);
      if (!r?.success) { setPErr(r?.message || 'Chưa điểm danh hộ được.'); return; }
      onRecordsChanged(r.date || date, r.records || {});
      setLockMsg({ type: 'ok', text: `${isPast ? `Đã điểm danh bù ${dayText} cho ${r.count || proxyCodes.length} người.` : (r.message || 'Đã điểm danh hộ.')}${r.errors?.length ? ` (${r.errors.length} lỗi: ${r.errors.slice(0, 3).join('; ')})` : ''}` });
      setProxyCodes(null); setPicked([]);
    } catch (e: any) {
      setPErr(/Hành động không hợp lệ|chưa được cập nhật lên phiên bản/.test(String(e?.message || ''))
        ? 'Apps Script của trường chưa có chức năng điểm danh hộ: cần cập nhật lên phiên bản mới nhất (Hệ thống → Cài đặt Apps Script → Cập nhật).'
        : (e?.message || 'Lỗi kết nối.'));
    } finally { setPBusy(false); }
  };
  // Khóa chốt số liệu: chọn 1 / nhiều / tất cả rồi Khóa hoặc Mở khóa (BGH, Quản trị nhà trường, Quản trị tối cao)
  const [picked, setPicked] = useState<string[]>([]);
  const [lockBusy, setLockBusy] = useState(false);
  const [lockMsg, setLockMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const applyLock = async (lock: boolean, all: boolean, codes: string[] = []) => {
    const who = all ? 'TẤT CẢ nhân sự' : `${codes.length} nhân sự đã chọn`;
    if (!confirm(lock
      ? `Khóa điểm danh ${dayText} của ${who}?
Người bị khóa sẽ không điểm danh / sửa điểm danh được và nhận thông báo đã khóa chốt số liệu.`
      : `Mở lại điểm danh ${dayText} cho ${who}?`)) return;
    setLockBusy(true); setLockMsg(null);
    try {
      const r = await staffAttendanceService.lockStaff({ date, lock, all, codes }, auth);
      if (!r?.success) {
        setLockMsg({ type: 'err', text: /Hành động không hợp lệ|4\.2/.test(String(r?.message || '')) ? 'Apps Script chưa có chức năng khóa điểm danh: cần cập nhật lên V4.5 (dán mã mới → Triển khai → Phiên bản mới).' : (r?.message || 'Chưa khóa được.') });
        return;
      }
      onLockChanged(r.lock || null);
      setPicked([]);
      setLockMsg({ type: 'ok', text: lock ? `Đã khóa điểm danh ${dayText} của ${who}.` : `Đã mở lại điểm danh ${dayText} cho ${who}.` });
    } catch (e: any) {
      setLockMsg({ type: 'err', text: /Hành động không hợp lệ|4\.2/.test(String(e?.message || '')) ? 'Apps Script chưa có chức năng khóa điểm danh: cần cập nhật lên V4.5 (dán mã mới → Triển khai → Phiên bản mới).' : (e?.message || 'Lỗi kết nối.') });
    } finally { setLockBusy(false); }
  };
  const lockedCount = staff.filter(s => !s.disabled && isLockedFor(dayLock, s.code)).length;
  const [filter, setFilter] = useState<StaffStatus | 'missing' | 'all'>('all');
  const [q, setQ] = useState('');
  // Mặc định hiện đầy đủ số CCCD (bấm con mắt ở đầu cột để che khi cần)
  const [showCccd, setShowCccd] = useState(true);
  const [revealed, setRevealed] = useState<string[]>([]);
  const hasFullCccd = staff.some(s => s.currentCccd);
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const rows = staff.filter(s => !s.disabled).map(s => ({ s, r: records[s.code] }))
    .filter(x => filter === 'all' || (filter === 'missing' ? !x.r : x.r?.status === filter))
    .filter(x => !q || norm(`${x.s.name} ${x.s.code} ${x.s.position || ''} ${x.s.dept || ''} ${x.s.currentCccd || x.s.cccdLast4 || ''}`).includes(norm(q)));
  return (
    <div className="rounded-3xl bg-white border border-slate-200 overflow-hidden">
      <div className="px-4 pt-4 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-black uppercase text-slate-800">{isPast ? 'Chi tiết ngày' : 'Chi tiết hôm nay'}</h3>
        <div className="flex items-center gap-1 mr-auto" role="group" aria-label="Chọn ngày điểm danh">
          <button type="button" onClick={() => onDateChange(addDays(date, -1))} aria-label="Ngày trước"
            className="no-hover-fx w-8 h-8 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && onDateChange(e.target.value)} aria-label="Ngày đang xem"
            className={`h-8 px-2 rounded-lg border text-sm font-bold ${isPast ? 'border-amber-400 bg-amber-50 text-amber-950' : 'border-slate-300 text-slate-800'}`} />
          <button type="button" onClick={() => onDateChange(addDays(date, 1))} disabled={!isPast} aria-label="Ngày sau"
            className="no-hover-fx w-8 h-8 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          {isPast && <button type="button" onClick={() => onDateChange(today)} className="no-hover-fx h-8 px-2.5 rounded-lg text-xs font-black border border-slate-300 hover:bg-slate-50 text-slate-800 whitespace-nowrap">Về hôm nay</button>}
          {loadingDate && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên, mã, tổ, CCCD…" aria-label="Tìm nhân sự" className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-sm" />
        </div>
        {(['all', ...STATUS_ORDER] as const).map(k => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`px-2.5 py-1 rounded-lg text-xs font-black border whitespace-nowrap ${filter === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}>
            {k === 'all' ? 'Tất cả' : STAFF_STATUS_META[k].short}
          </button>
        ))}
      </div>
      {isPast && (
        <p className="mx-4 mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950" role="status">
          <strong>Đang xem {weekdayLabel(date)}, {dayText}.</strong> Nhân sự chỉ tự điểm danh được cho ngày hôm nay; với ngày đã qua, Quản trị / BGH chọn nhân sự rồi bấm <strong>Điểm danh hộ</strong> để điểm danh bù — số liệu được tính vào biểu tổng hợp của tháng.
        </p>
      )}
      {/* 🔒 Khóa chốt số liệu điểm danh hôm nay */}
      <div className={`mx-4 mt-3 rounded-2xl border px-3 py-2.5 flex flex-wrap items-center gap-2 ${dayLock?.all ? 'bg-rose-50 border-rose-200' : lockedCount ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
        <Lock className={`w-4 h-4 shrink-0 ${dayLock?.all ? 'text-rose-700' : lockedCount ? 'text-amber-700' : 'text-slate-500'}`} />
        <span className="text-sm font-bold text-slate-800 mr-auto">
          {dayLock?.all ? `Đã khóa điểm danh ${dayText} của tất cả nhân sự` : lockedCount ? `Đã khóa điểm danh ${dayText} của ${lockedCount} người` : isPast ? `${dayText[0].toUpperCase()}${dayText.slice(1)}: nhân sự không tự điểm danh được — chỉ điểm danh bù` : 'Điểm danh hôm nay đang mở'}
          {dayLock?.at && (dayLock.all || lockedCount) ? <span className="font-normal text-slate-600"> • lúc {timeHMS(dayLock.at)}{dayLock.by ? ` bởi ${dayLock.by}` : ''}</span> : null}
        </span>
        {picked.length > 0 && <>
          <span className="text-sm font-bold text-slate-700">Đã chọn {picked.length}:</span>
          <button type="button" onClick={() => openProxy(picked)} className="no-hover-fx h-8 px-3 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-1.5 whitespace-nowrap"><UserCheck className="w-4 h-4" /> {isPast ? 'Điểm danh bù' : 'Điểm danh hộ'} ({picked.length})</button>
          <button type="button" disabled={lockBusy} onClick={() => applyLock(true, false, picked)} className="no-hover-fx h-8 px-3 rounded-lg text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"><Lock className="w-4 h-4" /> Khóa ({picked.length})</button>
          <button type="button" disabled={lockBusy} onClick={() => applyLock(false, false, picked)} className="no-hover-fx h-8 px-3 rounded-lg text-sm font-bold bg-emerald-700 hover:bg-emerald-800 text-white inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"><Unlock className="w-4 h-4" /> Mở khóa ({picked.length})</button>
          <button type="button" onClick={() => setPicked([])} className="no-hover-fx h-8 px-2.5 rounded-lg text-sm font-bold text-slate-700 hover:bg-white whitespace-nowrap">Bỏ chọn</button>
          <span className="w-px h-6 bg-slate-300 mx-0.5" aria-hidden="true" />
        </>}
        <button type="button" disabled={lockBusy || Boolean(dayLock?.all)} onClick={() => applyLock(true, true)} className="no-hover-fx h-8 px-3 rounded-lg text-sm font-bold border border-rose-300 bg-white hover:bg-rose-50 text-rose-800 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
          {lockBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Khóa tất cả
        </button>
        <button type="button" disabled={lockBusy || (!dayLock?.all && !lockedCount)} onClick={() => applyLock(false, true)} className="no-hover-fx h-8 px-3 rounded-lg text-sm font-bold border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
          <Unlock className="w-4 h-4" /> Mở khóa tất cả
        </button>
      </div>
      {lockMsg && <p className={`mx-4 mt-2 text-sm font-bold ${lockMsg.type === 'ok' ? 'text-emerald-800' : 'text-rose-700'}`}>{lockMsg.text}</p>}

      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm table-fixed min-w-[700px]">
          <colgroup>
            <col className="w-8" /><col className="w-[28%]" /><col className="w-[140px]" /><col className="w-[170px]" /><col className="w-[100px]" /><col /><col className="w-[44px]" />
          </colgroup>
          <thead><tr className="text-left text-xs uppercase text-slate-600 border-b border-slate-200 whitespace-nowrap">
            <th className="py-2 pr-2">
              <input type="checkbox" className="w-4 h-4 rounded border-slate-300 cursor-pointer align-middle"
                checked={rows.length > 0 && rows.every(x => picked.includes(x.s.code))}
                ref={el => { if (el) el.indeterminate = rows.some(x => picked.includes(x.s.code)) && !rows.every(x => picked.includes(x.s.code)); }}
                onChange={() => setPicked(prev => rows.every(x => prev.includes(x.s.code)) ? prev.filter(c => !rows.some(x => x.s.code === c)) : Array.from(new Set([...prev, ...rows.map(x => x.s.code)])))}
                aria-label="Chọn tất cả nhân sự đang hiển thị" title="Chọn tất cả (theo bộ lọc đang hiển thị)" />
            </th>
            <th className="py-2 pr-2">Họ và tên</th>
            <th className="py-2 pr-2">
              <span className="inline-flex items-center gap-1">
                Số CCCD
                {hasFullCccd && (
                  <button type="button" onClick={() => { setShowCccd(v => !v); setRevealed([]); }}
                    className="no-hover-fx w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-200"
                    title={showCccd ? 'Ẩn số CCCD' : 'Hiện đầy đủ số CCCD của tất cả'} aria-label={showCccd ? 'Ẩn số CCCD' : 'Hiện đầy đủ số CCCD của tất cả'}>
                    {showCccd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </span>
            </th>
            <th className="py-2 pr-2">Trạng thái</th><th className="py-2 pr-2">Giờ / lần</th><th className="py-2 pr-2">Ghi chú</th><th className="py-2 text-center" aria-label="Thao tác"></th>
          </tr></thead>
          <tbody>
            {rows.map(({ s, r }) => {
              const meta = STAFF_STATUS_META[r ? r.status : 'missing'];
              const n = attemptOf(r);
              const locked = isLockedFor(dayLock, s.code);
              const sub = [s.position, s.dept].filter(Boolean).join(' • ');
              const noteText = [r?.note || '', systemNoteOf(r)].filter(Boolean).join(' • ');
              return (
                <tr key={s.code} className={`border-b border-slate-100 align-top ${picked.includes(s.code) ? 'bg-amber-50' : ''}`}>
                  <td className="py-2 pr-2">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 cursor-pointer align-middle mt-1" checked={picked.includes(s.code)}
                      onChange={() => setPicked(prev => prev.includes(s.code) ? prev.filter(c => c !== s.code) : [...prev, s.code])} aria-label={`Chọn ${s.name}`} />
                  </td>
                  <td className="py-2 pr-2 min-w-0">
                    <p className="font-bold text-slate-900 truncate" title={s.name}>{s.name}</p>
                    <p className="text-xs text-slate-600 truncate" title={sub}>{sub}</p>
                  </td>
                  <td className="py-2 pr-2 font-mono text-slate-700 whitespace-nowrap">
                    {(() => {
                      const open = Boolean(s.currentCccd) && (showCccd || revealed.includes(s.code));
                      return (
                        <span className="inline-flex items-center gap-1">
                          <span className={open ? 'text-slate-900 font-semibold' : ''}>{open ? s.currentCccd : s.cccdLast4 ? `••••••••${s.cccdLast4}` : '—'}</span>
                          {s.currentCccd && !showCccd && (
                            <button type="button" onClick={() => setRevealed(prev => prev.includes(s.code) ? prev.filter(c => c !== s.code) : [...prev, s.code])}
                              className="no-hover-fx w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                              title={open ? 'Ẩn số CCCD' : 'Xem đầy đủ số CCCD'} aria-label={`${open ? 'Ẩn' : 'Xem'} số CCCD của ${s.name}`}>
                              {open ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2 pr-2">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <span className="px-2 py-0.5 rounded-full text-xs font-black whitespace-nowrap" style={{ background: meta.soft, color: meta.text }} title={meta.label}>{r ? meta.short : meta.label}</span>
                      {locked
                        ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-black bg-rose-50 text-rose-800 whitespace-nowrap" title={`Đã khóa điểm danh ${dayText}`}><Lock className="w-3 h-3" /> Khóa</span>
                        : null}
                    </span>
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap" title={r ? attemptsOf(r).map((a, i) => `Lần ${i + 1}: ${timeHMS(a.at)} – ${STAFF_STATUS_META[a.status]?.short}`).join('\n') : ''}>
                    {r ? <>
                      <span className="font-mono text-xs text-slate-700">{timeHMS(r.at)}</span>
                      {n > 1 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-black bg-amber-50 text-amber-900 border border-amber-200">L{n}</span>}
                    </> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="py-2 pr-2 text-slate-700 min-w-0" title={noteText}>
                    <p className="truncate">
                      {r?.note || ''}
                      {r?.note && systemNoteOf(r) ? <span className="text-slate-400"> • </span> : null}
                      {systemNoteOf(r) && <span className="text-xs font-bold text-amber-800">{systemNoteOf(r)}</span>}
                    </p>
                  </td>
                  <td className="py-1.5 text-center">
                    <button type="button" onClick={() => openProxy([s.code])} title={`${isPast ? 'Điểm danh bù' : 'Điểm danh hộ'} ${s.name}`} aria-label={`${isPast ? 'Điểm danh bù' : 'Điểm danh hộ'} ${s.name}`}
                      className="no-hover-fx w-8 h-8 inline-flex items-center justify-center rounded-lg text-indigo-700 hover:bg-indigo-50"><UserCheck className="w-4 h-4" /></button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-600">Không có nhân sự phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>

      {proxyCodes && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-sky-900/20 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Điểm danh hộ">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-black text-slate-900 inline-flex items-center gap-2"><UserCheck className="w-5 h-5 text-indigo-600" /> {isPast ? 'Điểm danh bù' : 'Điểm danh hộ'} — <span className={isPast ? 'text-amber-800' : ''}>{longDateLabel(date)}</span></p>
                <p className="text-sm text-slate-600 truncate" title={proxyCodes.map(c => staff.find(s => s.code === c)?.name || c).join(', ')}>
                  {proxyCodes.length === 1 ? (staff.find(s => s.code === proxyCodes[0])?.name || proxyCodes[0]) : `${proxyCodes.length} nhân sự: ${proxyCodes.slice(0, 4).map(c => staff.find(s => s.code === c)?.name || c).join(', ')}${proxyCodes.length > 4 ? '…' : ''}`}
                </p>
              </div>
              <button type="button" onClick={() => setProxyCodes(null)} className="text-sm font-bold text-slate-600 shrink-0">Đóng</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Trạng thái điểm danh">
                {(['present', 'business_trip', 'sick_leave', 'personal_unpaid'] as StaffStatus[]).map(k => {
                  const m = STAFF_STATUS_META[k];
                  const on = pStatus === k;
                  return (
                    <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setPStatus(k)}
                      className="no-hover-fx px-3 py-2.5 rounded-xl border-2 text-sm font-black text-left"
                      style={{ borderColor: on ? m.color : '#e2e8f0', background: on ? m.soft : '#fff', color: m.text }}>{m.label}</button>
                  );
                })}
              </div>
              {pStatus === 'business_trip' && (
                <div className="grid grid-cols-1 gap-2">
                  <input value={pPlace} onChange={(e) => setPPlace(e.target.value.slice(0, 120))} placeholder="Nơi công tác *" aria-label="Nơi công tác"
                    className="w-full h-10 px-3 rounded-xl border border-blue-300 text-sm" />
                  <input value={pContent} onChange={(e) => setPContent(e.target.value.slice(0, 150))} placeholder="Nội dung công tác" aria-label="Nội dung công tác"
                    className="w-full h-10 px-3 rounded-xl border border-blue-300 text-sm" />
                </div>
              )}
              <textarea value={pNote} onChange={(e) => setPNote(e.target.value.slice(0, 300))} rows={2} aria-label="Ghi chú"
                placeholder="Ghi chú (ví dụ: báo qua điện thoại lúc 7h15)" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
              <p className="text-xs text-slate-600">Bản ghi được đánh dấu "Điểm danh hộ bởi {auth?.username}" và ghi vào <strong>{longDateLabel(date)}</strong>. Điểm danh hộ vẫn thực hiện được khi ngày đó đã khóa.</p>
              {pErr && <p className="text-sm font-bold text-rose-700">{pErr}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setProxyCodes(null)} className="no-hover-fx flex-1 h-11 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-black">Hủy</button>
                <button type="button" onClick={submitProxy} disabled={pBusy} className="no-hover-fx flex-[2] h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-50">
                  {pBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />} {pBusy ? 'Đang lưu…' : `${isPast ? 'Điểm danh bù' : 'Điểm danh hộ'}${proxyCodes.length > 1 ? ` ${proxyCodes.length} người` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- danh sách nhân sự
/** Lỗi quyền / mạng → chẩn đoán (link chết, mất CSDL trường) để báo cách xử lý cụ thể */
const explainFailure = async (code: string | undefined, fallback: string) => {
  if (code !== 'UNAUTHORIZED' && code !== 'NETWORK') return fallback;
  const d = await staffAttendanceService.diagnoseFailure();
  return d.kind === 'dead' || d.kind === 'no_db' ? d.message : fallback;
};

const RosterPanel: React.FC<{ canManage: boolean; auth: { username: string; password: string }; schoolName: string }> = ({ canManage, auth, schoolName }) => {
  const [list, setList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<ParsedStaffRow[] | null>(null);
  const [pinMode, setPinMode] = useState<'random' | 'birth' | 'custom'>('random');
  const [customPin, setCustomPin] = useState('');
  const [resetExistingPins, setResetExistingPins] = useState(false);
  const [editing, setEditing] = useState<(StaffUpsert & { isNew?: boolean }) | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'locked'>('all');
  const [posFilter, setPosFilter] = useState('');
  // Chọn nhiều nhân sự (theo mã GV) để xóa / đổi mật khẩu hàng loạt
  const [selected, setSelected] = useState<string[]>([]);
  // Hiện số CCCD đầy đủ (chỉ Quản trị; Apps Script 4.3 trở lên)
  const [showAllCccd, setShowAllCccd] = useState(true);
  const [scriptVersion, setScriptVersion] = useState('');
  useEffect(() => { staffAttendanceService.getScriptVersion().then(setScriptVersion); }, []);
  const [revealedCccd, setRevealedCccd] = useState<string[]>([]);
  const [bulkPinOpen, setBulkPinOpen] = useState(false);
  const [bulkPinMode, setBulkPinMode] = useState<'random' | 'common'>('random');
  const [bulkPin, setBulkPin] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await staffAttendanceService.getRoster(auth);
      if (r?.success) setList(r.staff || []); else setMsg({ type: 'err', text: await explainFailure(r?.code, r?.message || 'Không tải được danh sách.') });
    } catch (e: any) { setMsg({ type: 'err', text: await explainFailure(e?.code, e?.message || 'Lỗi kết nối.') }); }
    finally { setLoading(false); }
  }, [auth]);
  useEffect(() => { load(); }, [load]);

  const save = async (items: StaffUpsert[], deleted: string[] = [], okText = 'Đã lưu danh sách nhân sự lên Google Drive.') => {
    setLoading(true); setMsg(null);
    try {
      const r = await staffAttendanceService.saveRoster(items, deleted, auth);
      if (!r?.success) { setMsg({ type: 'err', text: await explainFailure(r?.code, r?.message || 'Chưa lưu được.') }); return false; }
      setList(r.staff || []);
      setMsg(r.errors?.length ? { type: 'err', text: `Đã lưu, nhưng có ${r.errors.length} dòng lỗi: ${r.errors.slice(0, 5).join('; ')}${r.errors.length > 5 ? '…' : ''}` } : { type: 'ok', text: okText });
      return true;
    } catch (e: any) { setMsg({ type: 'err', text: await explainFailure(e?.code, e?.message || 'Lỗi kết nối.') }); return false; }
    finally { setLoading(false); }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        // Biểu mẫu CSDL ngành: bảng nhân sự là trang đầu (Sheet1); bỏ qua trang MA_LOI
        const sheetName = wb.SheetNames.find(n => n.toUpperCase() !== 'MA_LOI') || wb.SheetNames[0];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: true, blankrows: false });
        const result = parseStaffSheet(aoa);
        if (!result.ok) {
          const more = result.errors.length > 6 ? ` … và ${result.errors.length - 6} lỗi khác` : '';
          setMsg({ type: 'err', text: `Tệp "${f.name}" không đúng biểu mẫu nhập nhân sự (68 cột theo CSDL ngành). ${result.errors.slice(0, 6).join('; ')}${more}. Bấm "Tải tệp mẫu" để lấy đúng biểu mẫu.` });
          return;
        }
        if (result.rows.length === 0) { setMsg({ type: 'err', text: 'Tệp đúng biểu mẫu nhưng chưa có dòng nhân sự nào.' }); return; }
        setMsg(null);
        setPreview(result.rows);
      } catch (_) { setMsg({ type: 'err', text: 'Tệp Excel không đọc được.' }); }
    };
    reader.readAsArrayBuffer(f);
  };

  const birthPin = (b?: string) => {
    const m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(b || '');
    return m ? `${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}${m[3]}` : '';
  };

  const customPinProblem = pinMode !== 'custom' ? ''
    : !customPin ? 'Nhập mật khẩu muốn gán.' : customPin.length < 4 ? 'Mật khẩu điểm danh cần ít nhất 4 ký tự.' : /\s/.test(customPin) ? 'Mật khẩu không được có khoảng trắng.' : '';
  const confirmImport = async () => {
    if (!preview || customPinProblem) return;
    if (resetExistingPins && list.length > 0 && !confirm('Đặt lại mật khẩu cho cả những người ĐÃ có mật khẩu trong danh sách? Mật khẩu cũ của họ sẽ không dùng được nữa.')) return;
    const existing = new Set(list.map(s => s.code));
    const ok = preview.filter(p => p.issues.length === 0);
    const items: StaffUpsert[] = ok.map(p => {
      const { issues, inactiveReason, birthDate, ...rest } = p;
      const needPin = resetExistingPins || !existing.has(p.code) || !list.find(s => s.code === p.code)?.hasPin;
      const pin = pinMode === 'custom' ? customPin : pinMode === 'birth' ? birthPin(birthDate) || randomPin() : randomPin();
      return { ...rest, pin: needPin ? pin : undefined };
    });
    const done = await save(items, [], `Đã nhập ${items.length} nhân sự (bỏ qua ${preview.length - ok.length} dòng lỗi).`);
    if (done) setPreview(null);
  };

  const exportPins = () => {
    const rows: any[][] = [[`DANH SÁCH MẬT KHẨU ĐIỂM DANH${schoolName ? ' • ' + schoolName.toUpperCase() : ''}`], ['Lưu ý: tài liệu mật, cắt theo dòng phát riêng cho từng người.'], [],
      ['STT', 'Mã GV', 'Họ và tên', 'Chức vụ', 'CCCD (4 số cuối)', 'Mật khẩu điểm danh', 'Trạng thái']];
    list.forEach((s, i) => rows.push([i + 1, s.code, s.name, s.position || '', s.cccdLast4 ? `…${s.cccdLast4}` : '', s.currentPin || '(chưa có – cấp lại)', s.disabled ? 'Đã khóa' : 'Hoạt động']));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 26 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 11 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mat khau diem danh');
    XLSX.writeFile(wb, 'MatKhau_DiemDanh_NhanSu.xlsx');
  };

  const downloadTemplate = () => {
    // Đúng biểu mẫu CSDL ngành: 68 cột A → BP, cùng tên và thứ tự; 1 dòng ví dụ (dữ liệu giả)
    const sample: Record<string, string> = {
      'STT': '1', 'Mã định danh Bộ GD&ĐT': '0000000001', 'Họ tên': 'Nguyễn Văn A', 'Giới tính': 'Nam', 'Ngày sinh': '01/01/1990',
      'Trạng thái CB': 'Đang làm việc', 'Số CMTND/TCC': '000000000000', 'Điện thoại': '0900000000', 'Vị trí việc làm': 'Giáo viên', 'Môn dạy': 'Toán',
    };
    const ws = XLSX.utils.aoa_to_sheet([STAFF_TEMPLATE_HEADERS, STAFF_TEMPLATE_HEADERS.map(h => sample[h] || '')]);
    ws['!cols'] = STAFF_TEMPLATE_HEADERS.map(h => ({ wch: Math.min(28, Math.max(10, h.replace(/\s+/g, ' ').length + 2)) }));
    // Giữ dạng chữ cho mã, CCCD, điện thoại (không mất số 0 đầu)
    ['B', 'G', 'I'].forEach(col => { const c = ws[`${col}2`]; if (c) { c.t = 's'; c.z = '@'; } });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, 'Mau_Nhap_NhanSu_CSDL_nganh.xlsx');
  };

  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const positions = Array.from(new Set(list.map(s => s.position || '').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
  const shown = list
    .filter(s => !q || norm(`${s.name} ${s.code} ${s.position || ''} ${s.dept || ''}`).includes(norm(q)))
    .filter(s => statusFilter === 'all' || (statusFilter === 'locked' ? s.disabled : !s.disabled))
    .filter(s => !posFilter || (s.position || '') === posFilter)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'vi'));
  const iconBtn = 'no-hover-fx w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors';
  const selectedSet = new Set(selected.filter(c => list.some(s => s.code === c)));
  const selectedPeople = list.filter(s => selectedSet.has(s.code));
  const allShownSelected = shown.length > 0 && shown.every(s => selectedSet.has(s.code));
  const someShownSelected = shown.some(s => selectedSet.has(s.code));
  const toggleOne = (code: string) => setSelected(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]));
  const toggleAllShown = () => setSelected(prev => (allShownSelected
    ? prev.filter(c => !shown.some(s => s.code === c))
    : Array.from(new Set([...prev, ...shown.map(s => s.code)]))));

  const bulkDelete = async () => {
    if (selectedPeople.length === 0) return;
    const names = selectedPeople.slice(0, 5).map(s => s.name).join(', ') + (selectedPeople.length > 5 ? `… (+${selectedPeople.length - 5})` : '');
    if (!confirm(`Xóa ${selectedPeople.length} nhân sự khỏi danh sách điểm danh?\n${names}\n\nDữ liệu điểm danh cũ vẫn giữ trên Drive.`)) return;
    const ok = await save([], selectedPeople.map(s => s.code), `Đã xóa ${selectedPeople.length} nhân sự khỏi danh sách.`);
    if (ok) setSelected([]);
  };

  const bulkPinProblem = bulkPinMode === 'common'
    ? (!bulkPin ? 'Nhập mật khẩu chung.' : bulkPin.length < 4 ? 'Mật khẩu điểm danh cần ít nhất 4 ký tự.' : /\s/.test(bulkPin) ? 'Mật khẩu không được có khoảng trắng.' : '')
    : '';
  const bulkChangePin = async () => {
    if (selectedPeople.length === 0 || bulkPinProblem) return;
    if (!confirm(`Đổi mật khẩu điểm danh cho ${selectedPeople.length} nhân sự? Mật khẩu cũ sẽ không dùng được nữa.`)) return;
    const items = selectedPeople.map(s => ({ code: s.code, pin: bulkPinMode === 'common' ? bulkPin : randomPin() }));
    const ok = await save(items, [], bulkPinMode === 'common'
      ? `Đã đặt mật khẩu chung "${bulkPin}" cho ${items.length} nhân sự. Bấm "Xuất mật khẩu" để in danh sách.`
      : `Đã cấp mật khẩu ngẫu nhiên mới cho ${items.length} nhân sự. Bấm "Xuất mật khẩu" để in danh sách phát cho từng người.`);
    if (ok) { setBulkPinOpen(false); setBulkPin(''); setSelected([]); }
  };

  return (
    <div className="space-y-3">
      {msg && <div className={`rounded-2xl px-4 py-3 text-sm font-bold border ${msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{msg.text}</div>}

      {/* Thẻ danh sách: tiêu đề + số người + nút thao tác → bộ lọc → bảng */}
      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden" aria-label="Danh sách cán bộ, giáo viên, nhân viên">
        <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0 mr-auto">
            <Users className="w-5 h-5 text-indigo-600 shrink-0" />
            <p className="text-base font-black text-slate-900 whitespace-nowrap truncate"><span className="sm:hidden">Danh sách nhân sự</span><span className="hidden sm:inline">Danh sách cán bộ, giáo viên, nhân viên</span></p>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 text-xs font-bold tabular-nums whitespace-nowrap shrink-0">{list.length} người</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && <>
              <button type="button" onClick={() => setEditing({ code: '', name: '', isNew: true, pin: randomPin() })} className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Thêm mới</button>
              <span className="w-px h-6 bg-slate-200 mx-0.5 hidden sm:block" aria-hidden="true" />
              <button type="button" onClick={downloadTemplate} className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold bg-emerald-700 hover:bg-emerald-800 text-white inline-flex items-center gap-1.5"><Download className="w-4 h-4" /> Tải mẫu</button>
              <button type="button" onClick={() => fileRef.current?.click()} className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center gap-1.5"><Upload className="w-4 h-4" /> Nhập Excel</button>
              <button type="button" onClick={exportPins} disabled={list.length === 0} className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white inline-flex items-center gap-1.5 disabled:opacity-50"><KeyRound className="w-4 h-4" /> Xuất mật khẩu</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
            </>}
            <button type="button" onClick={load} disabled={loading} className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 inline-flex items-center gap-1.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Tải lại
            </button>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60">
          <label className="relative">
            <span className="sr-only">Tìm kiếm nhân sự</span>
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm nhanh…" className="h-9 w-64 max-w-full pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm" />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} aria-label="Lọc theo trạng thái" className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm">
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Đã khóa</option>
          </select>
          <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} aria-label="Lọc theo chức vụ" className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm max-w-[220px]">
            <option value="">Tất cả chức vụ</option>
            {positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-600 items-center gap-1 hidden sm:inline-flex"><Info className="w-3.5 h-3.5" />
            {shown.length === list.length ? `${list.length} người` : `Hiển thị ${shown.length}/${list.length} người`}{canManage ? ' • Bấm biểu tượng bút để sửa' : ''}
          </span>
        </div>

        {canManage && list.length > 0 && !list.some(s => s.currentCccd) && (
          <p className="px-4 pt-3 text-sm text-slate-700 inline-flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 text-sky-700 shrink-0" />
            <span>
              Chưa có số CCCD đầy đủ. Bấm <strong>Nhập Excel</strong> lại tệp danh sách để lưu số đầy đủ (mật khẩu đã cấp được giữ nguyên).
              {scriptVersion && compareVersions(scriptVersion, '4.4') < 0 && <> Apps Script đang chạy là <strong>{versionLabel(scriptVersion)}</strong> — để mọi máy đều thấy đủ số, dán mã mới rồi chọn <strong>Triển khai → Quản lý triển khai → sửa (bút chì) → Phiên bản: Phiên bản mới → Triển khai</strong> (không tạo triển khai mới).</>}
            </span>
          </p>
        )}
        {!canManage && <p className="px-4 pt-3 text-sm text-slate-600">Ban giám hiệu chỉ xem danh sách. Thêm, sửa, cấp mật khẩu do tài khoản Quản trị nhà trường thực hiện.</p>}

        {canManage && selectedPeople.length > 0 && (
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 bg-amber-50 border-b border-amber-200" role="region" aria-label="Thao tác với nhân sự đã chọn">
            <span className="text-sm font-bold text-amber-950 mr-1">Đã chọn {selectedPeople.length} người</span>
            <button type="button" onClick={() => { setBulkPinMode('random'); setBulkPin(''); setBulkPinOpen(true); }} disabled={loading}
              className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center gap-1.5 disabled:opacity-50">
              <KeyRound className="w-4 h-4" /> Đổi mật khẩu ({selectedPeople.length})
            </button>
            <button type="button" onClick={bulkDelete} disabled={loading}
              className="no-hover-fx h-9 px-3.5 rounded-lg text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white inline-flex items-center gap-1.5 disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> Xóa ({selectedPeople.length})
            </button>
            <button type="button" onClick={() => setSelected([])} className="no-hover-fx h-9 px-3 rounded-lg text-sm font-bold text-amber-950 hover:bg-amber-100">Bỏ chọn</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-600 bg-slate-50 border-b border-slate-200 whitespace-nowrap">
                {canManage && (
                  <th className="py-3 pl-4 pr-1 w-10 text-center">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 cursor-pointer align-middle"
                      checked={allShownSelected}
                      ref={el => { if (el) el.indeterminate = !allShownSelected && someShownSelected; }}
                      onChange={toggleAllShown}
                      disabled={shown.length === 0}
                      title={allShownSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả (theo bộ lọc đang hiển thị)'}
                      aria-label="Chọn tất cả nhân sự đang hiển thị" />
                  </th>
                )}
                <th className={`py-3 ${canManage ? 'pl-1' : 'pl-4'} pr-2 w-12 text-center`}>STT</th>
                <th className="py-3 pr-2">Họ và tên</th>
                <th className="py-3 pr-2">Tổ / Môn dạy</th>
                <th className="py-3 pr-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    CCCD
                    {canManage && list.some(s => s.currentCccd) && (
                      <button type="button" onClick={() => { setShowAllCccd(v => !v); setRevealedCccd([]); }}
                        className="no-hover-fx w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-200 normal-case"
                        title={showAllCccd ? 'Ẩn số CCCD' : 'Hiện đầy đủ số CCCD của tất cả'} aria-label={showAllCccd ? 'Ẩn số CCCD' : 'Hiện đầy đủ số CCCD của tất cả'}>
                        {showAllCccd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </span>
                </th>
                {canManage && <th className="py-3 pr-2">Mật khẩu ĐD</th>}
                <th className="py-3 pr-2 text-center">Trạng thái</th>
                {canManage && <th className="py-3 pr-4 text-center">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((s, i) => (
                <tr key={s.code} className={`border-b border-slate-100 transition-colors ${selectedSet.has(s.code) ? 'bg-amber-50' : s.disabled ? 'bg-slate-50/70 hover:bg-sky-50/50' : 'hover:bg-sky-50/50'}`}>
                  {canManage && (
                    <td className="py-3 pl-4 pr-1 text-center">
                      <input type="checkbox" className="w-4 h-4 rounded border-slate-300 cursor-pointer align-middle"
                        checked={selectedSet.has(s.code)} onChange={() => toggleOne(s.code)} aria-label={`Chọn ${s.name}`} />
                    </td>
                  )}
                  <td className={`py-3 ${canManage ? 'pl-1' : 'pl-4'} pr-2 text-center text-slate-500 tabular-nums`}>{i + 1}</td>
                  <td className="py-3 pr-2">
                    <p className={`font-bold whitespace-nowrap ${s.disabled ? 'text-slate-500' : 'text-slate-900'}`}>{s.name}</p>
                    <p className="text-xs text-slate-600 mt-0.5 whitespace-nowrap"><span className="font-mono">{s.code}</span>{s.position ? <> <span className="text-slate-400">|</span> {s.position}</> : null}</p>
                    {schoolName && <p className="text-xs text-emerald-700 mt-0.5 flex items-center gap-1 whitespace-nowrap max-w-[280px]" title={schoolName}><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{schoolName}</span></p>}
                  </td>
                  <td className="py-3 pr-2 text-indigo-800">{s.dept ? s.dept.split(/[,;]\s*/).map((d, k) => <p key={k} className="leading-snug whitespace-nowrap">{d}</p>) : <span className="text-slate-400">—</span>}</td>
                  <td className="py-3 pr-2 font-mono text-slate-700 whitespace-nowrap">
                    {(() => {
                      const open = Boolean(s.currentCccd) && (showAllCccd || revealedCccd.includes(s.code));
                      const text = open ? s.currentCccd : s.cccdLast4 ? `••••••••${s.cccdLast4}` : '—';
                      return (
                        <span className="inline-flex items-center gap-1">
                          <span className={open ? 'text-slate-900 font-semibold tracking-wide' : ''}>{text}</span>
                          {canManage && s.currentCccd && !showAllCccd && (
                            <button type="button" onClick={() => setRevealedCccd(prev => prev.includes(s.code) ? prev.filter(c => c !== s.code) : [...prev, s.code])}
                              className="no-hover-fx w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                              title={open ? 'Ẩn số CCCD' : 'Xem đầy đủ số CCCD'} aria-label={`${open ? 'Ẩn' : 'Xem'} số CCCD của ${s.name}`}>
                              {open ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {canManage && !s.currentCccd && s.cccdLast4 && (
                            <span className="text-slate-400 cursor-help" title="Chưa lưu số CCCD đầy đủ: cập nhật Apps Script lên phiên bản mới nhất rồi nhập lại tệp Excel (hoặc sửa CCCD) để xem được đủ số.">
                              <Info className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  {canManage && <td className="py-3 pr-2 font-mono text-slate-800">{s.currentPin || <span className="text-rose-700 font-sans font-bold">Chưa có</span>}</td>}
                  <td className="py-3 pr-2 text-center">
                    {s.disabled
                      ? <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-slate-200/70 px-2.5 py-1 rounded-full whitespace-nowrap"><Lock className="w-3 h-3" /> Đã khóa</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full whitespace-nowrap"><CheckCircle2 className="w-3 h-3" /> Hoạt động</span>}
                  </td>
                  {canManage && (
                    <td className="py-3 pr-4 text-center whitespace-nowrap">
                      <button type="button" title="Sửa thông tin" aria-label={`Sửa ${s.name}`} onClick={() => setEditing({ code: s.code, name: s.name, position: s.position, dept: s.dept, gender: s.gender, phone: s.phone })} className={`${iconBtn} text-blue-600 hover:bg-blue-50`}><Pencil className="w-4 h-4" /></button>
                      <button type="button" title="Cấp lại mật khẩu điểm danh" aria-label={`Cấp lại mật khẩu cho ${s.name}`} onClick={() => { const pin = randomPin(); if (confirm(`Cấp mật khẩu điểm danh mới cho ${s.name}: ${pin}?`)) save([{ code: s.code, pin }], [], `Đã cấp mật khẩu mới cho ${s.name}: ${pin}`); }} className={`${iconBtn} text-amber-700 hover:bg-amber-50`}><KeyRound className="w-4 h-4" /></button>
                      <button type="button" title={s.disabled ? 'Mở khóa' : 'Khóa'} aria-label={`${s.disabled ? 'Mở khóa' : 'Khóa'} ${s.name}`} onClick={() => save([{ code: s.code, disabled: !s.disabled }], [], s.disabled ? `Đã mở khóa ${s.name}.` : `Đã khóa ${s.name}.`)} className={`${iconBtn} text-orange-600 hover:bg-orange-50`}>{s.disabled ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}</button>
                      <button type="button" title="Xóa khỏi danh sách" aria-label={`Xóa ${s.name}`} onClick={() => { if (confirm(`Xóa ${s.name} khỏi danh sách điểm danh? (Dữ liệu điểm danh cũ vẫn giữ trên Drive)`)) save([], [s.code], `Đã xóa ${s.name}.`); }} className={`${iconBtn} text-rose-600 hover:bg-rose-50`}><Trash2 className="w-4 h-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-slate-600">{loading ? 'Đang tải…' : list.length ? 'Không có người phù hợp bộ lọc.' : 'Chưa có nhân sự. Bấm "Tải mẫu" rồi "Nhập Excel" để thêm danh sách.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Đổi mật khẩu điểm danh hàng loạt */}
      {bulkPinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Đổi mật khẩu điểm danh hàng loạt">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <p className="text-base font-black text-slate-900 inline-flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-700" /> Đổi mật khẩu cho {selectedPeople.length} nhân sự</p>
              <button type="button" onClick={() => setBulkPinOpen(false)} className="text-sm font-bold text-slate-600">Đóng</button>
            </div>
            <div className="p-5 space-y-3">
              <label className={`flex items-start gap-2 rounded-2xl border p-3 text-sm cursor-pointer ${bulkPinMode === 'random' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                <input type="radio" name="bulk-pin-mode" className="mt-0.5" checked={bulkPinMode === 'random'} onChange={() => setBulkPinMode('random')} />
                <span><strong>Mỗi người một mật khẩu ngẫu nhiên 6 số</strong> (an toàn). Sau khi đổi, bấm "Xuất mật khẩu" để in phát cho từng người.</span>
              </label>
              <label className={`flex items-start gap-2 rounded-2xl border p-3 text-sm cursor-pointer ${bulkPinMode === 'common' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                <input type="radio" name="bulk-pin-mode" className="mt-0.5" checked={bulkPinMode === 'common'} onChange={() => setBulkPinMode('common')} />
                <span><strong>Một mật khẩu chung cho tất cả</strong> người đã chọn (dễ thông báo, nên nhắc mọi người dùng đúng số CCCD của mình).</span>
              </label>
              {bulkPinMode === 'common' && (
                <div className="pl-6 space-y-1">
                  <input value={bulkPin} onChange={(e) => setBulkPin(e.target.value)} placeholder="Mật khẩu chung (ít nhất 4 ký tự)" autoComplete="off"
                    className="w-64 max-w-full h-9 px-3 rounded-lg border border-slate-300 text-sm font-mono" aria-label="Mật khẩu chung" />
                  {bulkPin && bulkPinProblem && <p className="text-sm font-bold text-rose-700">{bulkPinProblem}</p>}
                </div>
              )}
              <p className="text-xs text-slate-600">Áp dụng cho: {selectedPeople.slice(0, 6).map(s => s.name).join(', ')}{selectedPeople.length > 6 ? ` và ${selectedPeople.length - 6} người khác` : ''}.</p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setBulkPinOpen(false)} className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-black">Hủy</button>
                <button type="button" onClick={bulkChangePin} disabled={loading || Boolean(bulkPinProblem) || selectedPeople.length === 0}
                  className="flex-[2] py-2.5 rounded-2xl bg-amber-700 hover:bg-amber-800 text-white text-sm font-black disabled:opacity-50">
                  {loading ? 'Đang lưu…' : `Đổi mật khẩu cho ${selectedPeople.length} người`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Xem trước nhập Excel */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Xem trước danh sách nhân sự">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Xem trước: {preview.length} nhân sự • {preview.filter(p => p.issues.length).length} dòng lỗi (bỏ qua)</h3>
              <button type="button" onClick={() => setPreview(null)} className="text-sm font-bold text-slate-600">Đóng</button>
            </div>
            <div className="overflow-auto flex-1 px-5">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white"><tr className="text-left text-xs uppercase text-slate-600 border-b border-slate-200">
                  <th className="py-2 pr-2">Dòng</th><th className="py-2 pr-2">Mã</th><th className="py-2 pr-2">Họ tên</th><th className="py-2 pr-2">Chức vụ</th><th className="py-2 pr-2">Tổ/Môn</th><th className="py-2 pr-2">CCCD</th><th className="py-2">Ghi chú</th>
                </tr></thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i} className={`border-b border-slate-100 ${p.issues.length ? 'bg-rose-50' : ''}`}>
                      <td className="py-1.5 pr-2 text-xs text-slate-600 tabular-nums">{p.excelRow}</td>
                      <td className="py-1.5 pr-2 font-mono text-xs">{p.code}</td>
                      <td className="py-1.5 pr-2 font-bold">{p.name}</td>
                      <td className="py-1.5 pr-2">{p.position}</td>
                      <td className="py-1.5 pr-2">{p.dept}</td>
                      <td className="py-1.5 pr-2 font-mono">{p.cccd ? `••••${p.cccd.slice(-4)}` : '—'}</td>
                      <td className="py-1.5 text-xs">{p.issues.length ? <span className="text-rose-700 font-bold">{p.issues.join(', ')} – bỏ qua</span> : p.disabled ? <span className="text-slate-700">Khóa ({p.inactiveReason})</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 space-y-3">
              <p className="text-xs text-slate-600">Chỉ đưa lên Drive: mã, họ tên, chức vụ, tổ/môn, giới tính, điện thoại; số CCCD được băm (chỉ giữ 4 số cuối để đối chiếu). Không đưa các thông tin cá nhân khác trong tệp.</p>
              <fieldset className="space-y-2 text-sm">
                <legend className="font-black text-slate-800 mb-1">Mật khẩu điểm danh gán khi nhập:</legend>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="radio" name="import-pin-mode" checked={pinMode === 'random'} onChange={() => setPinMode('random')} /> Ngẫu nhiên 6 số (an toàn)</label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="radio" name="import-pin-mode" checked={pinMode === 'birth'} onChange={() => setPinMode('birth')} /> Theo ngày sinh (ddmmyyyy)</label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="radio" name="import-pin-mode" checked={pinMode === 'custom'} onChange={() => setPinMode('custom')} /> Tự nhập 1 mật khẩu chung</label>
                </div>
                {pinMode === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <input value={customPin} onChange={(e) => setCustomPin(e.target.value)} placeholder="Mật khẩu chung (ít nhất 4 ký tự)" autoComplete="off" autoFocus
                      aria-label="Mật khẩu chung gán cho nhân sự" className="w-64 max-w-full h-9 px-3 rounded-lg border border-slate-300 text-sm font-mono" />
                    {customPin && customPinProblem && <span className="text-sm font-bold text-rose-700">{customPinProblem}</span>}
                  </div>
                )}
                <label className="flex items-start gap-1.5 cursor-pointer text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={resetExistingPins} onChange={(e) => setResetExistingPins(e.target.checked)} />
                  <span>Áp dụng cả cho người <strong>đã có</strong> mật khẩu trong danh sách (mặc định chỉ gán cho người mới hoặc chưa có mật khẩu).</span>
                </label>
              </fieldset>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPreview(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-black">Hủy</button>
                <button type="button" onClick={confirmImport} disabled={loading || Boolean(customPinProblem)} className="flex-[2] py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-50">
                  {loading ? 'Đang lưu…' : `Lưu ${preview.filter(p => !p.issues.length).length} nhân sự lên Drive`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thêm / sửa 1 người */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Thông tin nhân sự">
          <form onSubmit={async (e) => {
            e.preventDefault();
            const { isNew, ...item } = editing;
            if (!item.code || !item.name) return;
            if (isNew && (!item.cccd || !item.pin)) { alert('Nhân sự mới cần số CCCD và mật khẩu điểm danh.'); return; }
            const ok = await save([{ ...item, cccd: item.cccd || undefined, pin: item.pin || undefined }], [], isNew ? `Đã thêm ${item.name}${item.pin ? ` (mật khẩu: ${item.pin})` : ''}.` : `Đã cập nhật ${item.name}.`);
            if (ok) setEditing(null);
          }} className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-5 space-y-3">
            <h3 className="text-base font-black text-slate-900">{editing.isNew ? 'Thêm nhân sự' : `Sửa: ${editing.name}`}</h3>
            <div className="grid grid-cols-2 gap-3">
              {([['code', 'Mã giáo viên *'], ['name', 'Họ và tên *'], ['position', 'Chức vụ'], ['dept', 'Tổ / môn'], ['gender', 'Giới tính'], ['phone', 'Điện thoại']] as const).map(([k, label]) => (
                <label key={k} className="space-y-1">
                  <span className="text-xs font-black text-slate-700 uppercase">{label}</span>
                  <input value={(editing as any)[k] || ''} disabled={k === 'code' && !editing.isNew} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-100" />
                </label>
              ))}
              <label className="space-y-1">
                <span className="text-xs font-black text-slate-700 uppercase">Số CCCD {editing.isNew ? '*' : '(để trống = giữ nguyên)'}</span>
                <input value={editing.cccd || ''} inputMode="numeric" onChange={(e) => setEditing({ ...editing, cccd: e.target.value.replace(/\D/g, '').slice(0, 12) })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-black text-slate-700 uppercase">Mật khẩu ĐD {editing.isNew ? '*' : '(để trống = giữ)'}</span>
                <input value={editing.pin || ''} onChange={(e) => setEditing({ ...editing, pin: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono" />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-black">Hủy</button>
              <button type="submit" disabled={loading} className="flex-[2] py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black">Lưu</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- link điểm danh
const LinkPanel: React.FC<{ schoolName: string; isBghOnly: boolean }> = ({ schoolName }) => {
  const [baseUrl, setBaseUrl] = useState(() => staffAttendanceService.getWebBaseUrl());
  const link = /^https?:\/\/[^/]+/i.test(baseUrl) ? staffAttendanceService.buildCheckInLink(schoolName, baseUrl) : null;
  const [copied, setCopied] = useState(false);
  const shareText = link ? `📋 ĐIỂM DANH GIÁO VIÊN – NHÂN VIÊN${schoolName ? ' ' + schoolName.toUpperCase() : ''}\nMỗi ngày làm việc, thầy cô mở link dưới đây, nhập số CCCD + mật khẩu điểm danh do nhà trường cấp:\n${link}\n(Chỉ điểm danh được cho ngày hôm nay.)` : '';
  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-white border border-slate-200 p-4 space-y-1.5">
        <label className="block text-sm font-black text-slate-800" htmlFor="school-web-url">Địa chỉ trang web của trường</label>
        <input id="school-web-url" value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); staffAttendanceService.setWebBaseUrl(e.target.value); }}
          placeholder="https://tentruong.vercel.app" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono" />
        <p className="text-xs text-slate-600">Bản web tự điền. Trên bản cài đặt máy tính, hãy nhập địa chỉ web Vercel của trường để tạo link điểm danh.</p>
      </div>
      {!link ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {staffAttendanceService.buildCheckInLink(schoolName, 'https://x') ? 'Hãy nhập địa chỉ trang web của trường (bắt đầu bằng https://) để tạo link điểm danh.' : 'Máy này chưa kết nối thư mục Drive dùng chung, chưa tạo được link điểm danh.'}
        </div>
      ) : (
        <div className="rounded-3xl bg-white border-2 border-emerald-200 p-5 space-y-3">
          <h3 className="text-base font-black text-slate-900">Mã QR điểm danh (quét bằng Zalo / camera điện thoại)</h3>
          <StaffCheckInQrCard link={link} schoolName={schoolName} />
        </div>
      )}
      {link && (
        <div className="rounded-3xl bg-white border border-slate-200 p-5 space-y-3">
          <h3 className="text-base font-black text-slate-900">Link điểm danh gửi cho giáo viên, nhân viên</h3>
          <p className="text-sm text-slate-700">Gửi vào nhóm Zalo của trường. Link chỉ chứa địa chỉ kết nối (không có mật khẩu); mỗi người vẫn phải nhập đúng số CCCD và mật khẩu điểm danh của mình.</p>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 font-mono text-sm break-all text-slate-800">{link}</div>
          {/#/.test(link) && (
            <p className="text-xs text-slate-600">Muốn link gọn nhất (chỉ còn <span className="font-mono">{link.split('#')[0]}</span>): trong dự án Vercel của trường, thêm 2 biến môi trường <span className="font-mono">VITE_DRIVE_SCRIPT_URL</span> (link Apps Script) và <span className="font-mono">VITE_DRIVE_FOLDER_ID</span> (mã thư mục Drive) rồi bấm Redeploy.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (_) { /* ignore */ } }}
              className="px-4 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-1.5">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Đã sao chép' : 'Sao chép tin nhắn gửi Zalo'}
            </button>
            <a href={link} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-sm font-bold">Mở thử trang điểm danh</a>
          </div>
          <p className="text-xs text-slate-600">Máy tính cài phần mềm: giáo viên cũng có thể mở trang này trong trình duyệt bằng link trên.</p>
        </div>
      )}
      <div className="rounded-3xl bg-white border border-slate-200 p-5 text-sm text-slate-700 space-y-1.5">
        <h4 className="font-black text-slate-900">Quy định điểm danh</h4>
        <p>• Mỗi người điểm danh 1 lần/ngày, có thể sửa lại trong cùng ngày.</p>
        <p>• Chỉ điểm danh cho ngày hôm nay theo giờ máy chủ nhà trường; không điểm danh bù ngày trước hoặc ngày chưa tới.</p>
        <p>• Ba trạng thái: Có mặt đi làm • Nghỉ ốm có phép • Nghỉ việc riêng không hưởng lương; kèm ô ghi chú.</p>
        <p>• Số liệu đồng bộ ngay về tài khoản BGH, Quản trị nhà trường và Quản trị tối cao (mục Chấm công nhân sự).</p>
      </div>
    </div>
  );
};

export default StaffAttendanceView;
