import React, { useState, useEffect } from 'react';
import { 
  KeyRound, X, Clipboard, Check, AlertTriangle, 
  Phone, Copy, ExternalLink, Sparkles, CheckCircle2,
  Crown, QrCode, Eye, EyeOff
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playFanfareSound } from '../../utils/audio';
import { licenseService, MASKED_CDKEY, LicenseDetails } from '../../services/licenseService';
import { APP_AUTHOR_INFO } from '../../data/initialData';
import { useClassroom } from '../../context/ClassroomContext';

interface CDKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CDKeyModal: React.FC<CDKeyModalProps> = ({ isOpen, onClose }) => {
  const { setIsRegistrationModalOpen, currentUser } = useClassroom();
  const [cdkeyInput, setCdkeyInput] = useState('');
  const [licenseState, setLicenseState] = useState<LicenseDetails>(licenseService.getDetails());
  const [showQr, setShowQr] = useState(true);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const unsub = licenseService.subscribe((details) => {
      setLicenseState(details);
      if (details.isActivated) {
        setCdkeyInput(MASKED_CDKEY);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isOpen) {
      const current = licenseService.getDetails();
      setLicenseState(current);
      if (current.isActivated) {
        setCdkeyInput(MASKED_CDKEY);
      } else {
        setCdkeyInput('');
      }
      setMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setCdkeyInput(text.trim());
        setMessage(null);
      }
    } catch (_) {
      setMessage({ type: 'error', text: 'Không thể truy cập Clipboard, vui lòng tự gõ hoặc nhấn Ctrl+V.' });
    }
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleActivate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cdkeyInput.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập mã CDKEY bản quyền.' });
      return;
    }

    const res = licenseService.activate(
      cdkeyInput, 
      currentUser?.fullName || 'Thầy/Cô Giáo Viên',
      currentUser?.schoolName || 'Trường Học Hạnh Phúc'
    );

    if (res.success) {
      setMessage({ type: 'success', text: res.message });
      playFanfareSound();
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch (_) {}
    } else {
      setMessage({ type: 'error', text: res.message });
    }
  };

  const qrImageUrl = `https://img.vietqr.io/image/BIDV-3627058363-compact2.png?amount=0&addInfo=CDKEY%20LOP%20HOC%20HANH%20PHUC&accountName=NGUYEN%20THANH%20LIEM`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header theo thiết kế chuẩn Ảnh 1 & 2 */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-600 text-white px-5 py-3.5 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center shadow-md shrink-0">
              <KeyRound className="w-5 h-5 text-amber-950" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide uppercase flex items-center gap-2">
                BẢN QUYỀN PHẦN MỀM LỚP HỌC HẠNH PHÚC
              </h2>
              <p className="text-[12px] text-white font-medium">
                Xác thực bản quyền chính thức & Mở khóa tính năng không giới hạn
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-white hover:text-white hover:bg-white/10 transition-colors"
            title="Đóng modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-slate-700 text-xs sm:text-sm">
          
          {/* Cảnh báo Chế độ Dùng Thử hoặc Thông báo Đã kích hoạt */}
          {!licenseState.isActivated ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 shadow-xs flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-amber-700 text-white shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="font-black text-amber-900 text-xs uppercase flex items-center gap-1.5">
                  <span>CHẾ ĐỘ DÙNG THỬ (TRIAL MODE)</span>
                  <span className="px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 text-[12px] font-bold">Chưa kích hoạt CDKEY</span>
                </div>
                <p className="text-[12px] leading-relaxed text-amber-900">
                  Phiên bản cài đặt dùng thử được giới hạn ở: <strong className="text-rose-700">Tối đa 01 lớp học</strong> và trong 1 lớp chỉ được chạy thử <strong className="text-rose-700">tối đa 10 học sinh</strong>.
                </p>
                <p className="text-[12px] leading-relaxed text-amber-900 font-medium">
                  👉 Để quản lý nhiều lớp và nhiều hơn 10 học sinh, Quý Thầy/Cô vui lòng dán hoặc điền mã CDKEY Bản Quyền do tác giả cung cấp bên dưới.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 shadow-xs flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-700 text-white shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <div className="font-black text-emerald-900 text-xs sm:text-sm uppercase flex items-center gap-2">
                  <span>ĐÃ KÍCH HOẠT BẢN QUYỀN CHÍNH THỨC</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-[12px] text-emerald-800 font-medium mt-0.5">
                  Phần mềm đã mở khóa vĩnh viễn không giới hạn số lớp và sĩ số học sinh cho cả 3 cấp độ (Quản trị nhà trường, Ban giám hiệu, Giáo viên).
                </p>
              </div>
            </div>
          )}

          {/* Form Nhập hoặc dán mã CDKEY */}
          <form onSubmit={handleActivate} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                <span>Nhập hoặc dán mã CDKEY bản quyền tác giả</span>
              </label>
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors cursor-pointer"
                title="Dán từ Clipboard"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Dán mã từ Clipboard</span>
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                value={cdkeyInput}
                onChange={(e) => {
                  setCdkeyInput(e.target.value);
                  setMessage(null);
                }}
                placeholder="Dán mã CDKEY bản quyền vào đây..."
                className="w-full px-4 py-2.5 rounded-xl border border-indigo-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 font-mono text-sm tracking-wider text-indigo-950 placeholder:text-slate-400 outline-none transition-all"
              />
            </div>

            {/* Thông báo kết quả */}
            {message && (
              <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-rose-50 text-rose-800 border border-rose-300'
              }`}>
                {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{message.text}</span>
              </div>
            )}

            {/* Nút Kích hoạt */}
            <button
              type="submit"
              disabled={!cdkeyInput.trim()}
              className={`w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-sm ${
                cdkeyInput.trim()
                  ? 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-600 hover:from-indigo-800 hover:to-indigo-800 text-white cursor-pointer hover:shadow-md active:scale-[0.99]'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>
                {licenseState.isActivated && cdkeyInput === MASKED_CDKEY
                  ? 'BẢN QUYỀN ĐANG KÍCH HOẠT CHÍNH THỨC'
                  : cdkeyInput.trim()
                  ? 'MỞ KHÓA BẢN QUYỀN CHÍNH THỨC'
                  : 'VUI LÒNG ĐIỀN ĐÚNG MÃ CDKEY ĐỂ MỞ KHÓA'}
              </span>
            </button>
          </form>

          {/* Khối Thông tin Tác giả & Hỗ trợ cấp CDKEY (Ảnh 1 & 2) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                THÔNG TIN TÁC GIẢ & HỖ TRỢ CẤP CDKEY
              </span>
              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="flex items-center gap-1 text-[12px] font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                {showQr ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Ẩn mã QR</span>
                  </>
                ) : (
                  <>
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Xem QR BIDV</span>
                  </>
                )}
              </button>
            </div>

            {/* 2 Cột thông tin tác giả và số điện thoại */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <div className="text-[12px] font-bold text-slate-500 uppercase">TÁC GIẢ PHẦN MỀM:</div>
                <div className="text-xs font-black text-indigo-950 uppercase mt-0.5">{APP_AUTHOR_INFO.name}</div>
                <div className="text-[12px] text-slate-600 font-medium">{APP_AUTHOR_INFO.schoolName}</div>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <div className="text-[12px] font-bold text-slate-500 uppercase">ĐIỆN THOẠI / ZALO HỖ TRỢ:</div>
                <div className="flex items-center justify-between mt-0.5">
                  <a href={APP_AUTHOR_INFO.zaloUrl} title="Bấm để hiện mã QR Zalo" className="text-xs font-mono font-black text-blue-700 underline decoration-dotted underline-offset-2">{APP_AUTHOR_INFO.zalo}</a>
                  <div className="flex items-center gap-1">
                    <a
                      href={`tel:${APP_AUTHOR_INFO.zalo}`}
                      className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold"
                    >
                      Gọi
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyText(APP_AUTHOR_INFO.zalo, 'zalo')}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-bold"
                    >
                      {copySuccess === 'zalo' ? 'Đã chép' : 'Chép'}
                    </button>
                  </div>
                </div>
                <div className="text-[12px] text-slate-400 font-medium mt-0.5">Hỗ trợ kích hoạt và tư vấn 24/7</div>
              </div>
            </div>

            {/* Khối VietQR BIDV */}
            {showQr && (
              <div className="p-3 rounded-xl bg-white border border-indigo-200 flex flex-col sm:flex-row items-center gap-3">
                <div className="w-32 h-32 p-1.5 bg-white rounded-lg border border-slate-200 shrink-0 shadow-2xs">
                  <img 
                    src={qrImageUrl} 
                    alt="VietQR BIDV Nguyen Thanh Liem" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-1.5 text-xs text-slate-700 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-600">Ngân hàng:</span>
                    <strong className="text-indigo-900 font-black">BIDV - PGD Tân Uyên</strong>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Chủ tài khoản:</span>{' '}
                    <strong className="text-slate-900 uppercase">NGUYEN THANH LIEM</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-600">Số tài khoản:</span>
                    <strong className="text-blue-700 font-mono font-black text-sm">3627058363</strong>
                    <button
                      type="button"
                      onClick={() => handleCopyText('3627058363', 'stk')}
                      className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-[12px] font-bold cursor-pointer"
                    >
                      {copySuccess === 'stk' ? 'Đã copy' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[12px] text-slate-500 italic leading-relaxed pt-1 border-t border-slate-100">
                    * Sau khi chuyển khoản phí bản quyền, Quý Thầy/Cô chụp màn hình gửi Zalo số <strong className="text-blue-700">0888.358.363</strong> để nhận ngay CDKEY bản quyền kích hoạt!
                  </p>
                </div>
              </div>
            )}

            {/* Link mở Form Đăng Ký Chi Tiết */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[12px] text-slate-500">Hoặc Quý Thầy/Cô có thể gửi đơn đăng ký trực tuyến:</span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setIsRegistrationModalOpen(true);
                }}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Mở Form Đăng Ký Chi Tiết</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

        {/* Footer Modal */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[12px] text-slate-500 font-medium">
            Phần mềm Quản lý Lớp học Hạnh phúc © 2026
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-800 text-xs font-bold uppercase transition-colors cursor-pointer"
          >
            ĐÓNG
          </button>
        </div>

      </div>
    </div>
  );
};
