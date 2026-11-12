import React, { useEffect, useState } from 'react';
import { KeyRound, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, X, Mail } from 'lucide-react';
import { UserAccount } from '../../types';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';
import { passwordRecoveryService } from '../../services/passwordRecoveryService';

/**
 * 🔑 Đổi mật khẩu (TÙY CHỌN, sau khi đăng nhập) + khai báo EMAIL KHÔI PHỤC.
 * - Tài khoản BGH / giáo viên do Quản trị cấp không bị bắt đổi ở lần đăng nhập đầu.
 * - Mật khẩu mới được lưu vào CSDL nhà trường trên Google Drive (Apps Script V4.1) và
 *   Quản trị nhà trường thấy ngay mật khẩu mới trong bảng quản lý tài khoản.
 * - Thẻ "Email khôi phục": khai báo email để khi quên mật khẩu nhận mã 6 số ở màn đăng nhập (Apps Script 1.1.9).
 * - Mở bằng sự kiện window 'lhhp:open-change-password' (nút "Đổi mật khẩu" ở thanh bên).
 */
export const OPEN_CHANGE_PASSWORD_EVENT = 'lhhp:open-change-password';
const EMAIL_HINT_KEY = 'lhhp_recovery_email_hint_';

interface Props {
  currentUser: UserAccount | null;
}

export const ChangePasswordModal: React.FC<Props> = ({ currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'password' | 'email'>('password');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    const open = () => {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setDone('');
      setTab('password');
      setIsOpen(true);
    };
    window.addEventListener(OPEN_CHANGE_PASSWORD_EVENT, open);
    return () => window.removeEventListener(OPEN_CHANGE_PASSWORD_EVENT, open);
  }, []);

  useEffect(() => {
    if (!currentUser) { setIsOpen(false); return; }
    // email đã khai báo: lấy từ hồ sơ tài khoản (nếu có) hoặc bản nhớ trên máy này
    let known = String((currentUser as any).recoveryEmail || '');
    if (!known) { try { known = localStorage.getItem(EMAIL_HINT_KEY + currentUser.username.toLowerCase()) || ''; } catch (_) { known = ''; } }
    setSavedEmail(known);
    setEmail(known);
  }, [currentUser?.username]);

  if (!isOpen || !currentUser) return null;

  const driveReady = schoolDriveDbService.isConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!driveReady) {
      setError('Máy này chưa kết nối thư mục dùng chung của nhà trường nên chưa đổi được mật khẩu.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Hai lần nhập mật khẩu mới chưa khớp.');
      return;
    }
    if (newPassword === oldPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }
    setLoading(true);
    try {
      const res = await schoolDriveDbService.changePassword(currentUser.username, oldPassword, newPassword);
      if (!res.success) {
        setError(res.message);
        return;
      }
      setDone('Đã đổi mật khẩu và lưu lên cơ sở dữ liệu nhà trường. Lần đăng nhập sau dùng mật khẩu mới.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setDone('');
    const value = email.trim().toLowerCase();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) { setError('Địa chỉ email chưa đúng, ví dụ: tenban@gmail.com'); return; }
    if (!oldPassword) { setError('Hãy nhập mật khẩu hiện tại để xác nhận.'); return; }
    setLoading(true);
    try {
      const r = await passwordRecoveryService.setEmail(currentUser.username, oldPassword, value);
      if (!r.success) { setError(r.message); return; }
      setSavedEmail(value);
      try {
        if (value) localStorage.setItem(EMAIL_HINT_KEY + currentUser.username.toLowerCase(), value);
        else localStorage.removeItem(EMAIL_HINT_KEY + currentUser.username.toLowerCase());
      } catch (_) { /* ignore */ }
      setOldPassword('');
      setDone(value
        ? `Đã lưu email khôi phục ${value}. Khi quên mật khẩu, bấm "Quên mật khẩu" ở màn đăng nhập để nhận mã qua email này.`
        : 'Đã xóa email khôi phục của tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full pl-3 pr-10 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400';
  const labelCls = 'text-[12px] font-black text-slate-700 uppercase';
  const switchTab = (t: 'password' | 'email') => { setTab(t); setError(''); setDone(''); setOldPassword(''); };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs" onClick={() => !loading && setIsOpen(false)}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="change-pw-title" className="w-full max-w-md max-h-[94vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-5 space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 id="change-pw-title" className="text-base font-black text-slate-900">Mật khẩu & khôi phục</h2>
            <p className="text-xs font-semibold text-slate-600">
              Tài khoản <b>{currentUser.username}</b>
            </p>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} className="no-hover-fx p-1 rounded-lg text-slate-600 hover:bg-slate-100" title="Đóng" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl" role="tablist" aria-label="Nội dung">
          {([['password', 'Đổi mật khẩu'], ['email', 'Email khôi phục']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => switchTab(id)}
              className={`no-hover-fx flex-1 py-2 rounded-lg text-sm font-black cursor-pointer ${tab === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {done && (
          <div role="status" className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{done}</span>
          </div>
        )}

        {tab === 'password' && (done ? (
          <button type="button" onClick={() => setIsOpen(false)} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black cursor-pointer">
            Đóng
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <p className="text-xs font-semibold text-slate-600">Mật khẩu mới được cập nhật tự động cho Quản trị nhà trường.</p>
            <label className="block space-y-1">
              <span className={labelCls}>Mật khẩu hiện tại</span>
              <input type={show ? 'text' : 'password'} value={oldPassword} onChange={e => setOldPassword(e.target.value)} className={inputCls} required autoComplete="current-password" />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Mật khẩu mới (ít nhất 6 ký tự)</span>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputCls} required autoComplete="new-password" />
                <button type="button" onClick={() => setShow(!show)} className="no-hover-fx absolute right-3 top-1/2 -translate-y-1/2 text-slate-600" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Nhập lại mật khẩu mới</span>
              <input type={show ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputCls} required autoComplete="new-password" />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-black flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? 'Đang lưu lên Google Drive...' : 'Đổi mật khẩu'}
            </button>
            {!savedEmail && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Tài khoản này <strong>chưa có email khôi phục</strong>. Hãy khai báo ở thẻ "Email khôi phục" để lấy lại được mật khẩu khi quên.
              </p>
            )}
          </form>
        ))}

        {tab === 'email' && (
          <form onSubmit={handleSaveEmail} className="space-y-3.5">
            <p className="text-xs font-semibold text-slate-600">
              Khi quên mật khẩu, bấm <strong>Quên mật khẩu</strong> ở màn đăng nhập: phần mềm gửi mã 6 số tới email này để đặt mật khẩu mới.
              {savedEmail ? <> Email đang dùng: <strong className="text-slate-900">{savedEmail}</strong>.</> : ' Hiện chưa khai báo.'}
            </p>
            <label className="block space-y-1">
              <span className={labelCls}>Email khôi phục (để trống = xóa)</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tenban@gmail.com" className={inputCls} autoComplete="email" />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Mật khẩu hiện tại (để xác nhận)</span>
              <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className={inputCls} required autoComplete="current-password" />
            </label>
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-black flex items-center justify-center gap-2 cursor-pointer">
              <Mail className="w-4 h-4" />
              {loading ? 'Đang lưu...' : 'Lưu email khôi phục'}
            </button>
            <p className="text-xs text-slate-600">Nên dùng email cá nhân mà chỉ mình thầy/cô mở được. Thư do tài khoản Google của trường gửi; cần Apps Script phiên bản 1.1.9 trở lên.</p>
          </form>
        )}
      </div>
    </div>
  );
};
