import React, { useEffect, useState } from 'react';
import { X, DatabaseZap, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';
import { useClassroom } from '../../context/ClassroomContext';

/**
 * 🔁 KHỞI TẠO LẠI CƠ SỞ DỮ LIỆU NHÀ TRƯỜNG (csdl_truong.json) TRÊN GOOGLE DRIVE
 * Dùng khi tệp CSDL bị xóa khỏi thư mục dùng chung: đẩy lại danh sách trường + tài khoản đang có trên máy Quản trị.
 * Mở bằng sự kiện OPEN_REINIT_SCHOOL_DB_EVENT.
 */
export const OPEN_REINIT_SCHOOL_DB_EVENT = 'lhhp:open-reinit-school-db';
export const openReinitSchoolDb = () => window.dispatchEvent(new Event(OPEN_REINIT_SCHOOL_DB_EVENT));

export const ReinitSchoolDbModal: React.FC = () => {
  const { currentUser } = useClassroom();
  const [open, setOpen] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [commonPw, setCommonPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [snap, setSnap] = useState<{ schools: any[]; users: any[] }>({ schools: [], users: [] });

  useEffect(() => {
    const h = () => { setSnap(schoolDriveDbService.localSnapshot()); setAdminPw(''); setCommonPw(''); setMsg(null); setShow(false); setOpen(true); };
    window.addEventListener(OPEN_REINIT_SCHOOL_DB_EVENT, h);
    return () => window.removeEventListener(OPEN_REINIT_SCHOOL_DB_EVENT, h);
  }, []);

  if (!open) return null;
  const adminName = (currentUser?.username || 'adminquantri').toLowerCase();
  const others = snap.users.filter(u => String(u.username).toLowerCase() !== adminName);
  const pwProblem = (pw: string, min: number) => (!pw ? 'Chưa nhập.' : pw.length < min ? `Cần ít nhất ${min} ký tự.` : /\s/.test(pw) ? 'Không có khoảng trắng.' : '');
  const commonProblem = others.length ? pwProblem(commonPw, 6) : '';
  const canSubmit = !busy && !pwProblem(adminPw, 4) && !commonProblem;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (!confirm(`Khởi tạo lại cơ sở dữ liệu nhà trường trên Google Drive với ${snap.schools.length} trường và ${others.length + 1} tài khoản?`)) return;
    setBusy(true); setMsg(null);
    const r = await schoolDriveDbService.reinitializeSchoolDb(adminName, adminPw, commonPw, currentUser?.fullName);
    setBusy(false);
    setMsg({ ok: r.success, text: r.message });
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-start sm:items-center justify-center bg-sky-900/20 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Khởi tạo lại cơ sở dữ liệu nhà trường">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-black text-slate-900 inline-flex items-center gap-2"><DatabaseZap className="w-5 h-5 text-indigo-600" /> Khởi tạo lại CSDL nhà trường</p>
            <p className="text-sm text-slate-600">Tạo lại tệp <code className="font-mono">csdl_truong.json</code> trên thư mục Google Drive, như lần đăng nhập đầu tiên.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center shrink-0" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        {msg?.ok ? (
          <div className="p-5 space-y-4">
            <p className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 flex items-start gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" />{msg.text}</p>
            {others.length > 0 && <p className="text-sm text-slate-700">Các tài khoản khác đăng nhập bằng mật khẩu chung vừa đặt. Vào <strong>Tài khoản &amp; CSDL → Xuất Excel</strong> để có danh sách gửi thầy cô.</p>}
            <button type="button" onClick={() => window.location.reload()} className="no-hover-fx w-full h-11 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black">Tải lại phần mềm</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 space-y-1">
              <p>Dữ liệu trên máy này sẽ được đưa lên: <strong>{snap.schools.length} trường</strong> • <strong>{others.length + 1} tài khoản</strong>.</p>
              {snap.schools.length > 0 && <p className="truncate" title={snap.schools.map(s => s.name).join(', ')}>Trường: {snap.schools.map(s => s.name).join(', ')}</p>}
              {snap.schools.length === 0 && <p className="text-amber-900">Máy này chưa có danh sách trường — sau khi khởi tạo, vào Tài khoản &amp; CSDL để khai báo trường.</p>}
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-black text-slate-800">Mật khẩu cho tài khoản <span className="font-mono">{adminName}</span></span>
              <input type={show ? 'text' : 'password'} value={adminPw} onChange={(e) => setAdminPw(e.target.value)} autoComplete="current-password"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-mono" />
              <span className="block text-xs text-slate-600">Thư mục chưa có CSDL: mật khẩu này trở thành mật khẩu Quản trị. Nếu CSDL vẫn còn: phải nhập đúng mật khẩu hiện tại.</span>
            </label>
            {others.length > 0 && (
              <label className="block space-y-1">
                <span className="text-sm font-black text-slate-800">Mật khẩu chung cho {others.length} tài khoản khác</span>
                <input type={show ? 'text' : 'password'} value={commonPw} onChange={(e) => setCommonPw(e.target.value)} autoComplete="new-password"
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-mono" />
                <span className="block text-xs text-slate-600">Mật khẩu cũ đã mất cùng tệp CSDL. Thầy cô đăng nhập bằng mật khẩu này rồi tự đổi.</span>
                {commonPw && commonProblem && <span className="block text-sm font-bold text-rose-700">{commonProblem}</span>}
              </label>
            )}
            <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} Hiện mật khẩu</label>
            {msg && !msg.ok && <p className="text-sm font-bold text-rose-700 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{msg.text}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="no-hover-fx flex-1 h-11 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-black">Hủy</button>
              <button type="submit" disabled={!canSubmit} className="no-hover-fx flex-[2] h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseZap className="w-4 h-4" />} {busy ? 'Đang khởi tạo…' : 'Khởi tạo lại CSDL trường'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default ReinitSchoolDbModal;
