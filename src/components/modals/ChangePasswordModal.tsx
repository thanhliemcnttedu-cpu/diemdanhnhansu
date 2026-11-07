import React, { useEffect, useState } from 'react';
import { KeyRound, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { UserAccount } from '../../types';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';

/**
 * 🔑 Đổi mật khẩu (TÙY CHỌN, sau khi đăng nhập).
 * - Tài khoản BGH / giáo viên do Quản trị cấp không bị bắt đổi ở lần đăng nhập đầu.
 * - Mật khẩu mới được lưu vào CSDL nhà trường trên Google Drive (Apps Script V4.1) và
 *   Quản trị nhà trường thấy ngay mật khẩu mới trong bảng quản lý tài khoản.
 * - Mở bằng sự kiện window 'lhhp:open-change-password' (nút "Đổi mật khẩu" ở thanh bên).
 */
export const OPEN_CHANGE_PASSWORD_EVENT = 'lhhp:open-change-password';

interface Props {
  currentUser: UserAccount | null;
}

export const ChangePasswordModal: React.FC<Props> = ({ currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      setIsOpen(true);
    };
    window.addEventListener(OPEN_CHANGE_PASSWORD_EVENT, open);
    return () => window.removeEventListener(OPEN_CHANGE_PASSWORD_EVENT, open);
  }, []);

  useEffect(() => {
    if (!currentUser) setIsOpen(false);
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

  const inputCls = 'w-full pl-3 pr-10 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => !loading && setIsOpen(false)}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-black text-slate-900">Đổi mật khẩu</h2>
            <p className="text-xs font-semibold text-slate-500">
              Tài khoản <b>{currentUser.username}</b>. Mật khẩu mới được cập nhật tự động cho Quản trị nhà trường.
            </p>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {done ? (
          <>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{done}</span>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black cursor-pointer">
              Đóng
            </button>
          </>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-[11px] font-black text-slate-600 uppercase">Mật khẩu hiện tại</span>
              <input type={show ? 'text' : 'password'} value={oldPassword} onChange={e => setOldPassword(e.target.value)} className={inputCls} required autoComplete="current-password" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-black text-slate-600 uppercase">Mật khẩu mới (ít nhất 6 ký tự)</span>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputCls} required autoComplete="new-password" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-black text-slate-600 uppercase">Nhập lại mật khẩu mới</span>
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
          </>
        )}
      </form>
    </div>
  );
};
