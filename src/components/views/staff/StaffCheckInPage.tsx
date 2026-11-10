import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, LogOut, ShieldCheck, Stethoscope, Briefcase, CalendarDays, Loader2, AlertTriangle, PencilLine, Lock, Plane, UserCheck, BookOpenCheck } from 'lucide-react';
import { TeachingLogPanel } from './TeachingLogPanel';
import { staffAttendanceService, composeTripNote, parseTripNote, STAFF_STATUS_META, longDateLabel, StaffStatus, StaffMember, StaffRecord, attemptOf, attemptsOf, timeSpoken, timeHMS, isProxyRecord } from '../../../services/staffAttendanceService';

/**
 * 📲 TRANG ĐIỂM DANH GIÁO VIÊN – NHÂN VIÊN (/diemdanh)
 * Bước 1: nhập số CCCD + mật khẩu điểm danh → Kiểm tra
 * Bước 2: thấy rõ Thứ, ngày tháng năm (theo máy chủ) → chọn trạng thái → ghi chú → Xác nhận điểm danh
 * Chỉ điểm danh cho NGÀY HÔM NAY. Đã điểm danh rồi → cảnh báo "đã điểm danh lần N lúc…", bấm Sửa mới cho điểm danh lại;
 * mọi lần đều được máy chủ ghi giờ (nhà trường / kế toán thấy "Thực hiện điểm danh lại lần N").
 */
const REMEMBER_KEY = 'lhhp_staff_checkin_remember_cccd';
const LOCK_MESSAGE = 'Hiện tại chức năng điểm danh trong ngày đã được quản trị nhà trường khóa chốt số liệu.';

const OPTIONS: Array<{ id: StaffStatus; icon: React.ReactNode; hint: string }> = [
  { id: 'present', icon: <Briefcase className="w-6 h-6" />, hint: 'Đi làm bình thường' },
  { id: 'business_trip', icon: <Plane className="w-6 h-6" />, hint: 'Ghi rõ nơi công tác và nội dung' },
  { id: 'sick_leave', icon: <Stethoscope className="w-6 h-6" />, hint: 'Có giấy tờ / đã xin phép' },
  { id: 'personal_unpaid', icon: <CalendarDays className="w-6 h-6" />, hint: 'Đã báo nhà trường' },
];


export const StaffCheckInPage: React.FC = () => {
  const conn = useMemo(() => staffAttendanceService.resolveConnection(), []);
  const [cccd, setCccd] = useState(() => { try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch (_) { return ''; } });
  const [remember, setRemember] = useState(() => { try { return Boolean(localStorage.getItem(REMEMBER_KEY)); } catch (_) { return false; } });
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [today, setToday] = useState('');
  const [existing, setExisting] = useState<StaffRecord | null>(null);
  const [status, setStatus] = useState<StaffStatus | ''>('');
  const [note, setNote] = useState('');
  // Đi công tác: nơi công tác (bắt buộc) + nội dung công tác
  const [tripPlace, setTripPlace] = useState('');
  const [tripContent, setTripContent] = useState('');
  const [done, setDone] = useState<StaffRecord | null>(null);
  // Sau khi đăng nhập: thẻ Điểm danh / Kê khai tiết dạy
  const [mainTab, setMainTab] = useState<'checkin' | 'teach'>('checkin');
  // Đã điểm danh hôm nay → phải bấm "Sửa điểm danh" mới mở lại phiếu
  const [editing, setEditing] = useState(false);
  // BGH / Quản trị đã khóa chốt số liệu điểm danh hôm nay (Apps Script 4.5)
  const [lockedMsg, setLockedMsg] = useState('');

  const [schoolName, setSchoolName] = useState(conn?.schoolName || '');
  useEffect(() => { document.title = 'Điểm danh giáo viên – nhân viên'; }, []);
  // Link rút gọn không chứa tên trường → hỏi Apps Script một lần rồi nhớ lại
  useEffect(() => {
    if (!conn || conn.schoolName) return;
    let alive = true;
    staffAttendanceService.fetchSchoolName(conn).then(n => { if (alive && n) setSchoolName(n); });
    return () => { alive = false; };
  }, [conn]);

  const reset = () => {
    setStaff(null); setPin(''); setStatus(''); setNote(''); setExisting(null); setDone(null); setError(''); setEditing(false); setLockedMsg(''); setMainTab('checkin');
    if (!remember) setCccd('');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const digits = cccd.replace(/\D/g, '');
    if (digits.length < 9) { setError('Vui lòng nhập đúng số căn cước công dân (12 chữ số).'); return; }
    if (!pin) { setError('Vui lòng nhập mật khẩu điểm danh.'); return; }
    setBusy(true);
    try {
      const r = await staffAttendanceService.staffAuth(digits, pin);
      if (!r?.success) { setError(r?.message || 'Không kiểm tra được thông tin.'); return; }
      try { if (remember) localStorage.setItem(REMEMBER_KEY, digits); else localStorage.removeItem(REMEMBER_KEY); } catch (_) { /* ignore */ }
      setStaff(r.staff); setToday(r.today); setExisting(r.record || null);
      setStatus(r.record?.status || '');
      if (r.record?.status === 'business_trip') { const t = parseTripNote(r.record.note || ''); setTripPlace(t.place); setTripContent(t.content); setNote(t.extra); }
      else { setNote(r.record?.note || ''); setTripPlace(''); setTripContent(''); }
      setLockedMsg(r.locked ? (r.lockMessage || LOCK_MESSAGE) : '');
      setEditing(!r.record && !r.locked);
    } catch (err: any) {
      setError(err?.message || 'Không kết nối được máy chủ.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!status) { setError('Hãy chọn một trạng thái điểm danh.'); return; }
    if (status === 'business_trip' && !tripPlace.trim()) { setError('Đi công tác: hãy ghi rõ nơi công tác.'); return; }
    const finalNote = status === 'business_trip' ? composeTripNote(tripPlace, tripContent, note) : note.trim();
    setError('');
    setBusy(true);
    try {
      const r = await staffAttendanceService.checkIn(cccd.replace(/\D/g, ''), pin, status, finalNote, today);
      if (!r?.success) {
        if (r?.code === 'NOT_TODAY' && r.today) setToday(r.today);
        if (r?.code === 'LOCKED') { setLockedMsg(r.message || LOCK_MESSAGE); setEditing(false); setDone(null); return; }
        setError(status === 'business_trip' && /Trạng thái điểm danh không hợp lệ/i.test(String(r?.message || ''))
          ? 'Hệ thống của trường chưa cập nhật chức năng "Đi công tác" (cần Apps Script phiên bản mới nhất). Vui lòng báo Quản trị nhà trường.'
          : (r?.message || 'Chưa ghi nhận được điểm danh.'));
        return;
      }
      setDone(r.record); setExisting(r.record); setEditing(false);
    } catch (err: any) {
      setError(err?.message || 'Không kết nối được máy chủ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50 flex flex-col items-center px-4 py-6 sm:py-10">
      {/* Điện thoại: khổ hẹp max-w-md. Máy tính (lg): sau khi đăng nhập mở rộng — điểm danh 4xl, kê khai tiết dạy 6xl */}
      <div className={`w-full space-y-4 ${!staff ? 'max-w-md' : mainTab === 'teach' ? 'max-w-md lg:max-w-6xl' : 'max-w-md lg:max-w-4xl'}`}>
        <header className="text-center space-y-1">
          <img src="/logo.svg" alt="Lớp Học Hạnh Phúc" className="mx-auto w-16 h-16 rounded-[22%] shadow-md" />
          <h1 className="font-black text-slate-900 whitespace-nowrap text-[clamp(0.95rem,4.3vw,1.5rem)]">Điểm danh giáo viên – nhân viên</h1>
          {schoolName && <p className="text-sm font-bold text-emerald-800 uppercase">{schoolName}</p>}
        </header>

        {!conn && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            Trang này chưa có kết nối của nhà trường. Hãy mở đúng <strong>link điểm danh</strong> do Quản trị nhà trường gửi
            (link có dạng <code>…/diemdanh#c=…</code>).
          </div>
        )}

        {/* ===== Bước 1: xác thực ===== */}
        {conn && !staff && (
          <form onSubmit={handleAuth} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-black text-slate-800">Số căn cước công dân</span>
              <input
                value={cccd}
                onChange={(e) => setCccd(e.target.value.replace(/[^\d\s]/g, '').slice(0, 15))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="12 chữ số trên thẻ CCCD"
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 focus:border-emerald-600 outline-none text-lg font-bold tracking-wider text-slate-900"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-black text-slate-800">Mật khẩu điểm danh</span>
              <div className="relative">
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  type={showPin ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Do nhà trường cấp"
                  className="w-full px-4 py-3 pr-12 rounded-2xl border-2 border-slate-300 focus:border-emerald-600 outline-none text-lg font-bold text-slate-900"
                />
                <button type="button" onClick={() => setShowPin(v => !v)} className="no-hover-fx absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl text-slate-600 hover:bg-slate-100 flex items-center justify-center" aria-label={showPin ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4" />
              Ghi nhớ số CCCD trên điện thoại này
            </label>
            {error && <p className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
            <button type="submit" disabled={busy} className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-base font-black flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
              Kiểm tra
            </button>
          </form>
        )}

        {/* ===== Sau khi đăng nhập: chọn Điểm danh / Kê khai tiết dạy ===== */}
        {conn && staff && (
          <div className="space-y-2 lg:space-y-0 lg:flex lg:items-center lg:gap-4">
            <div className="flex items-center justify-between gap-2 px-1 lg:flex-1 lg:min-w-0 lg:justify-start lg:gap-4">
              <p className="text-sm lg:text-base text-slate-700 truncate">Xin chào <strong className="text-slate-900">{staff.name}</strong><span className="max-lg:hidden text-slate-500"> • {[staff.position, staff.dept].filter(Boolean).join(' • ')}</span></p>
              <button type="button" onClick={reset} className="shrink-0 text-sm font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"><LogOut className="w-4 h-4" /> Thoát</button>
            </div>
            <div className="flex gap-1 bg-slate-200/70 p-1 rounded-2xl lg:w-[28rem] lg:shrink-0" role="tablist" aria-label="Chức năng">
              <button type="button" role="tab" aria-selected={mainTab === 'checkin'} onClick={() => setMainTab('checkin')}
                className={`no-hover-fx flex-1 h-11 rounded-xl text-sm font-black inline-flex items-center justify-center gap-1.5 ${mainTab === 'checkin' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-700'}`}><UserCheck className="w-4 h-4" /> Điểm danh</button>
              <button type="button" role="tab" aria-selected={mainTab === 'teach'} onClick={() => setMainTab('teach')}
                className={`no-hover-fx flex-1 h-11 rounded-xl text-sm font-black inline-flex items-center justify-center gap-1.5 ${mainTab === 'teach' ? 'bg-white text-indigo-800 shadow-xs' : 'text-slate-700'}`}><BookOpenCheck className="w-4 h-4" /> Kê khai tiết dạy</button>
            </div>
          </div>
        )}

        {conn && staff && mainTab === 'teach' && (
          <TeachingLogPanel cccd={cccd.replace(/\D/g, '')} pin={pin} today={today} />
        )}

        {/* ===== Bước 2: điểm danh hôm nay ===== */}
        {conn && staff && mainTab === 'checkin' && !done && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-700 text-white px-5 py-4 lg:px-7 lg:flex lg:items-end lg:justify-between lg:gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-50">Điểm danh cho ngày hôm nay</p>
                <p className="text-xl lg:text-2xl font-black leading-tight">{longDateLabel(today)}</p>
              </div>
              <p className="max-lg:hidden text-sm text-emerald-50">Ngày lấy theo giờ máy chủ nhà trường</p>
            </div>
            <div className="p-5 lg:p-7 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-black text-slate-900 truncate">{staff.name}</p>
                  <p className="text-sm text-slate-600 truncate">{[staff.code, staff.position, staff.dept].filter(Boolean).join(' • ')}</p>
                </div>
                <button type="button" onClick={reset} className="shrink-0 text-sm font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1">
                  <LogOut className="w-4 h-4" /> Thoát
                </button>
              </div>

              {lockedMsg && (
                <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 space-y-3" role="alert">
                  <div className="flex items-start gap-2.5">
                    <Lock className="w-6 h-6 text-rose-700 shrink-0 mt-0.5" />
                    <div className="text-sm text-rose-950 space-y-1">
                      <p className="font-black text-base">{lockedMsg}</p>
                      {existing
                        ? isProxyRecord(existing)
                          ? <p>Bạn đã được <strong>{existing.by}</strong> điểm danh hộ lúc {timeSpoken(existing.at)}: <strong>{STAFF_STATUS_META[existing.status].label}</strong>{existing.note ? <> — {existing.note}</> : null}.</p>
                          : <p>Bạn đã điểm danh lần {attemptOf(existing)} lúc {timeSpoken(existing.at)}: <strong>{STAFF_STATUS_META[existing.status].label}</strong>{existing.note ? <> — {existing.note}</> : null}.</p>
                        : <p>Bạn <strong>chưa điểm danh</strong> hôm nay. Vui lòng liên hệ Ban giám hiệu / Quản trị nhà trường nếu cần điều chỉnh.</p>}
                    </div>
                  </div>
                  <button type="button" onClick={reset} className="w-full py-3 rounded-2xl bg-white border border-rose-300 hover:bg-rose-100 text-rose-950 font-black text-sm">Đã hiểu, thoát</button>
                </div>
              )}

              {!lockedMsg && existing && !editing && (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3" role="alert">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-950 space-y-1">
                      {isProxyRecord(existing) ? (
                        <>
                          <p className="font-black text-base">
                            Hôm nay bạn đã được <span className="underline decoration-amber-500">{existing.by}</span> điểm danh hộ vào lúc {timeSpoken(existing.at)}, {longDateLabel(today)}.
                          </p>
                          <p>Nội dung: <strong>{STAFF_STATUS_META[existing.status].label}</strong>{existing.note ? <> — {existing.note}</> : null}</p>
                          <p>Nếu thông tin đúng, bạn <strong>không cần điểm danh lại</strong>. Nếu chưa đúng (ví dụ bạn đi công tác, nghỉ ốm…), hãy điểm danh lại: lần tự điểm danh của bạn sẽ được tính, lần điểm danh hộ vẫn được lưu để nhà trường đối chiếu.</p>
                        </>
                      ) : (
                        <>
                          <p className="font-black text-base">
                            Bạn đã thực hiện điểm danh lần {attemptOf(existing)} vào lúc {timeSpoken(existing.at)}, {longDateLabel(today)}.
                          </p>
                          <p>Nội dung: <strong>{STAFF_STATUS_META[existing.status].label}</strong>{existing.note ? <> — {existing.note}</> : null}</p>
                        </>
                      )}
                      {attemptsOf(existing).length > 1 && (
                        <ul className="text-xs text-amber-900 list-disc pl-4">
                          {attemptsOf(existing).map((a, i) => (
                            <li key={i}>Lần {i + 1}: {timeHMS(a.at)} – {STAFF_STATUS_META[a.status]?.short || a.status}{a.note ? ` (${a.note})` : ''}{a.by ? ` — điểm danh hộ bởi ${a.by}` : ' — tự điểm danh'}</li>
                          ))}
                        </ul>
                      )}
                      {!isProxyRecord(existing) && <p className="font-bold">Bạn muốn sửa điểm danh?</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 lg:max-w-xl">
                    <button type="button" onClick={reset} className="flex-1 py-3 rounded-2xl bg-white border border-amber-300 hover:bg-amber-100 text-amber-950 font-black text-sm">{isProxyRecord(existing) ? 'Đúng rồi, thoát' : 'Không, thoát'}</button>
                    <button type="button" onClick={() => { setEditing(true); setError(''); }} className="flex-[2] py-3 rounded-2xl bg-amber-700 hover:bg-amber-800 text-white font-black text-sm inline-flex items-center justify-center gap-1.5">
                      <PencilLine className="w-4 h-4" /> {isProxyRecord(existing) ? 'Tự điểm danh lại' : 'Sửa điểm danh'} (lần {attemptOf(existing) + 1})
                    </button>
                  </div>
                  <p className="text-xs text-amber-900">Mọi lần sửa đều được ghi lại thời gian để nhà trường đối chiếu.</p>
                </div>
              )}

              {!lockedMsg && (!existing || editing) && (<>
              <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3" role="radiogroup" aria-label="Trạng thái điểm danh">
                {OPTIONS.map(o => {
                  const meta = STAFF_STATUS_META[o.id];
                  const on = status === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setStatus(o.id)}
                      className="no-hover-fx w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-colors"
                      style={{ borderColor: on ? meta.color : '#e2e8f0', background: on ? meta.soft : '#ffffff' }}
                    >
                      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: on ? meta.color : '#f1f5f9', color: on ? '#ffffff' : meta.color }}>{o.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-base font-black" style={{ color: meta.text }}>{meta.label}</span>
                        <span className="block text-sm text-slate-600">{o.hint}</span>
                      </span>
                      <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: on ? meta.color : '#94a3b8' }}>
                        {on && <span className="w-3 h-3 rounded-full" style={{ background: meta.color }} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {status === 'business_trip' && (
                <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/60 p-3.5 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-black text-blue-950">Nơi công tác <span className="text-rose-700">*</span></span>
                    <input value={tripPlace} onChange={(e) => setTripPlace(e.target.value.slice(0, 120))} placeholder="Ví dụ: Phòng GD&ĐT huyện, Trường TH số 2…"
                      className="w-full px-4 py-3 rounded-2xl border-2 border-blue-200 focus:border-blue-600 outline-none text-base text-slate-900 bg-white" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-black text-blue-950">Nội dung công tác</span>
                    <input value={tripContent} onChange={(e) => setTripContent(e.target.value.slice(0, 150))} placeholder="Ví dụ: Tập huấn chương trình GDPT 2018…"
                      className="w-full px-4 py-3 rounded-2xl border-2 border-blue-200 focus:border-blue-600 outline-none text-base text-slate-900 bg-white" />
                  </label>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-sm font-black text-slate-800">{status === 'business_trip' ? 'Ghi chú thêm (nếu có)' : 'Ghi chú (nếu có)'}</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 300))}
                  rows={3}
                  placeholder="Ví dụ: có giấy khám bệnh, đã báo tổ trưởng…"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 focus:border-emerald-600 outline-none text-base text-slate-900"
                />
              </label>

              {error && <p className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}

              <button type="button" onClick={handleConfirm} disabled={busy || !status}
                className="w-full lg:w-auto lg:min-w-[22rem] lg:px-8 lg:ml-auto lg:flex py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-lg font-black flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                {existing ? `Xác nhận điểm danh lại (lần ${attemptOf(existing) + 1})` : 'Xác nhận điểm danh'}
              </button>
              </>)}
              <p className="text-xs text-center text-slate-600">Chỉ điểm danh được cho ngày hôm nay. Ngày được lấy theo giờ máy chủ nhà trường.</p>
            </div>
          </div>
        )}

        {/* ===== Hoàn tất ===== */}
        {conn && staff && mainTab === 'checkin' && done && (
          <div className="bg-white rounded-3xl border-2 border-emerald-300 shadow-sm p-6 space-y-3 lg:max-w-2xl lg:mx-auto lg:p-8">
            <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-700" />
            <h2 className="text-xl font-black text-slate-900 text-center">Điểm danh thành công</h2>
            <p className="text-base text-slate-800 leading-relaxed">
              <strong>{staff.name}</strong>, bạn đã thực hiện điểm danh cho <strong>{longDateLabel(today)}</strong> với nội dung điểm danh như sau:
            </p>
            <div className="rounded-2xl px-4 py-3 space-y-1" style={{ background: STAFF_STATUS_META[done.status].soft }}>
              <p className="text-lg font-black" style={{ color: STAFF_STATUS_META[done.status].text }}>{STAFF_STATUS_META[done.status].label}</p>
              {done.note && <p className="text-sm text-slate-700">Ghi chú: {done.note}</p>}
              {attemptOf(done) > 1 && <p className="text-sm font-bold text-amber-800">Thực hiện điểm danh lại lần {attemptOf(done)}</p>}
            </div>
            <p className="text-base text-slate-800">Vào lúc: <strong className="text-slate-950">{timeSpoken(done.at)}</strong></p>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => { setDone(null); setEditing(false); }} className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-sm">Sửa điểm danh</button>
              <button type="button" onClick={reset} className="flex-1 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm">Xong</button>
            </div>
          </div>
        )}

        <p className="text-xs text-center text-slate-600">Lớp Học Hạnh Phúc • Dữ liệu lưu trên Google Drive của nhà trường • <a href="/" className="underline font-bold">Về trang phần mềm</a></p>
      </div>
    </div>
  );
};

export default StaffCheckInPage;
