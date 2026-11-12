import React, { useEffect, useState } from 'react';
import { KeyRound, Mail, ShieldCheck, AlertCircle, CheckCircle2, X, Loader2, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { passwordRecoveryService } from '../../services/passwordRecoveryService';

/**
 * 🔐 QUÊN MẬT KHẨU (màn đăng nhập)
 * Bước 1: nhập tên đăng nhập → Apps Script của trường gửi mã 6 số tới email khôi phục đã khai báo.
 * Bước 2: nhập mã + mật khẩu mới.
 * Kèm hướng dẫn cho trường hợp chưa khai báo email (quản trị trường cấp lại / chủ tài khoản Google đặt lại).
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialUsername?: string;
  /** Đặt lại xong: điền sẵn tên đăng nhập ở màn đăng nhập */
  onDone?: (username: string) => void;
}

export const ForgotPasswordModal: React.FC<Props> = ({ isOpen, onClose, initialUsername = '', onDone }) => {
  const [step, setStep] = useState<'ask' | 'code' | 'done'>('ask');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep('ask'); setUsername(initialUsername.trim()); setCode(''); setPw1(''); setPw2(''); setShow(false);
    setBusy(false); setError(''); setInfo(''); setHelpOpen(false);
  }, [isOpen, initialUsername]);

  if (!isOpen) return null;

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!username.trim()) { setError('Hãy nhập tên đăng nhập.'); return; }
    setBusy(true); setError(''); setInfo('');
    const r = await passwordRecoveryService.request(username);
    setBusy(false);
    if (!r.success) {
      setError(r.message);
      setHelpOpen(r.code === 'NO_EMAIL' || r.code === 'OLD_SCRIPT');
      return;
    }
    setInfo(`Đã gửi mã 6 số tới ${r.maskedEmail || 'email khôi phục'}. Mã có hiệu lực ${r.minutes || 15} phút. Nếu chưa thấy, hãy xem cả mục Thư rác.`);
    setStep('code');
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) { setError('Mã gồm đúng 6 chữ số.'); return; }
    if (pw1.length < 6) { setError('Mật khẩu mới phải có ít nhất 6 ký tự.'); return; }
    if (pw1 !== pw2) { setError('Hai lần nhập mật khẩu mới chưa khớp.'); return; }
    setBusy(true); setError('');
    const r = await passwordRecoveryService.confirm(username, code, pw1);
    setBusy(false);
    if (!r.success) { setError(r.message); return; }
    setInfo(r.message || 'Đã đặt lại mật khẩu.');
    setStep('done');
  };

  const inputCls = 'w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400';
  const labelCls = 'block text-xs font-black text-slate-700 uppercase';

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 bg-sky-900/20 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
      <div className="w-full max-w-md max-h-[94vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0"><KeyRound className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <h2 id="forgot-title" className="text-base font-black text-slate-900">Quên mật khẩu</h2>
            <p className="text-xs font-semibold text-slate-600">Nhận mã qua email khôi phục để đặt mật khẩu mới. Dữ liệu của tài khoản được giữ nguyên.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="no-hover-fx p-1.5 rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Đóng"><X className="w-4 h-4" /></button>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-sm font-bold text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span className="min-w-0 break-words whitespace-pre-line">{error}</span>
          </div>
        )}
        {info && (
          <div role="status" className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-bold text-emerald-900">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><span>{info}</span>
          </div>
        )}

        {step === 'ask' && (
          <form onSubmit={sendCode} className="space-y-3">
            <label className="block space-y-1">
              <span className={labelCls}>Tên đăng nhập</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="Ví dụ: adminquantri" autoComplete="username" autoFocus />
            </label>
            <button type="submit" disabled={busy} className="no-hover-fx w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} {busy ? 'Đang gửi mã…' : 'Gửi mã về email khôi phục'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={confirm} className="space-y-3">
            <label className="block space-y-1">
              <span className={labelCls}>Mã 6 số trong email</span>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
                className={`${inputCls} tracking-[0.4em] text-center text-lg`} placeholder="••••••" autoFocus />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Mật khẩu mới (ít nhất 6 ký tự)</span>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={pw1} onChange={(e) => setPw1(e.target.value)} className={`${inputCls} pr-11`} autoComplete="new-password" />
                <button type="button" onClick={() => setShow(!show)} className="no-hover-fx absolute right-3 top-1/2 -translate-y-1/2 text-slate-600" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Nhập lại mật khẩu mới</span>
              <input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} autoComplete="new-password" />
            </label>
            <button type="submit" disabled={busy} className="no-hover-fx w-full h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {busy ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
            </button>
            <button type="button" onClick={() => sendCode()} disabled={busy} className="no-hover-fx w-full h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold cursor-pointer disabled:opacity-60">
              Gửi lại mã (sau 1 phút)
            </button>
          </form>
        )}

        {step === 'done' && (
          <button type="button" onClick={() => { onDone?.(username.trim()); onClose(); }} className="no-hover-fx w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black cursor-pointer">
            Về màn đăng nhập
          </button>
        )}

        {step !== 'done' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50">
            <button type="button" onClick={() => setHelpOpen(!helpOpen)} aria-expanded={helpOpen} className="no-hover-fx w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-sm font-black text-slate-800 cursor-pointer">
              Chưa khai báo email khôi phục thì làm thế nào?
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
            </button>
            {helpOpen && (
              <ul className="px-3 pb-3 text-xs text-slate-700 list-disc pl-7 space-y-1.5">
                <li><strong>Giáo viên, BGH:</strong> báo quản trị nhà trường. Quản trị xem và đặt lại mật khẩu trong mục Tài khoản &amp; CSDL.</li>
                <li><strong>Quản trị (kể cả adminquantri):</strong> người giữ tài khoản Google của trường (chủ Apps Script) mở dự án Apps Script → <strong>Cài đặt dự án</strong> → <strong>Thuộc tính tập lệnh</strong>, dòng <span className="font-mono">pw:tên_đăng_nhập</span> là mật khẩu hiện tại.</li>
                <li>Hoặc trong trình soạn mã Apps Script, chọn hàm <span className="font-mono">datLaiMatKhauQuanTri</span> rồi bấm <strong>Chạy</strong>: mật khẩu tạm hiện ở <strong>Nhật ký thực thi</strong>. Đăng nhập bằng mật khẩu tạm rồi đổi ngay.</li>
                <li>Sau khi vào được, hãy khai báo email khôi phục ở mục <strong>Đổi mật khẩu</strong> để lần sau tự lấy lại được.</li>
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
