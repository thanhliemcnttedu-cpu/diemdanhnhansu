import React, { useState } from 'react';
import { 
  X, CheckCircle2, Phone, MessageSquare, Copy, Check,
  QrCode, School, User, Building2, ShieldCheck, HeartHandshake,
  ZoomIn, Download, AlertTriangle
} from 'lucide-react';
import { databaseService } from '../../services/databaseService';
import schoolDbLogo from '../../assets/school_db_logo.png';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RegistrationModal: React.FC<RegistrationModalProps> = ({
  isOpen,
  onClose
}) => {
  const [fullName, setFullName] = useState('');
  const [roleOrTitle, setRoleOrTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [zaloPhone, setZaloPhone] = useState('');
  const [registrationType, setRegistrationType] = useState<'school' | 'personal'>('school');
  
  const [requestType, setRequestType] = useState('Cấp cho tổ chức nhà trường');
  const [accountRole, setAccountRole] = useState('Quản trị nhà trường');

  React.useEffect(() => {
    if (registrationType === 'school') {
      setRequestType('Cấp cho tổ chức nhà trường');
      setAccountRole('Quản trị nhà trường');
    } else {
      setRequestType('Cấp tài khoản cá nhân');
      setAccountRole('');
    }
  }, [registrationType]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isQrZoomed, setIsQrZoomed] = useState(false);

  if (!isOpen) return null;

  const currentAmount = registrationType === 'school' ? 1000000 : 50000;
  const currentAmountFormatted = registrationType === 'school' ? '1.000.000 VNĐ' : '50.000 VNĐ';
  const currentAmountText = registrationType === 'school' ? '(Một triệu đồng)' : '(Năm mươi nghìn đồng)';
  const currentTransferContent = registrationType === 'school' ? 'MO TAI KHOAN QLHS TRUONG' : 'MO TAI KHOAN CA NHAN';

  // VietQR API dynamic image
  const vietQrUrl = `https://api.vietqr.io/image/970418-3627058363-compact.png?amount=${currentAmount}&addInfo=${encodeURIComponent(currentTransferContent)}&accountName=${encodeURIComponent('NGUYEN THANH LIEM')}`;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !zaloPhone.trim() || !roleOrTitle.trim() || !organization.trim() || !requestType.trim() || !accountRole.trim()) {
      alert('Vui lòng điền đầy đủ tất cả thông tin đăng ký bắt buộc.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        fullName: fullName.trim(),
        roleOrTitle: roleOrTitle.trim(),
        organization: organization.trim(),
        zaloPhone: zaloPhone.trim(),
        requestType: requestType.trim(),
        accountRole: accountRole.trim(),
        registrationType,
        amount: currentAmount,
        transferContent: currentTransferContent
      };

      const res = await databaseService.submitRegistration(payload);
      if (res.success) {
        setSubmitted(true);
      } else {
        alert(res.message || 'Đã có lỗi xảy ra khi gửi thông tin.');
      }
    } catch (err: any) {
      alert(err?.message || 'Có lỗi kết nối máy chủ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: 'linear-gradient(135deg, #7dd3fc 0%, #38bdf8 30%, #60a5fa 65%, #818cf8 100%)' }}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.15) 0%, transparent 50%),
                          radial-gradient(circle at 80% 70%, rgba(255,255,255,0.1) 0%, transparent 50%)`
      }} />

      {/* Main Container */}
      <div 
        className="relative w-full max-w-[1400px] flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─────────── TOP HEADER ─────────── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-1.5 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* Logo */}
            <div className="w-[80px] h-[80px] sm:w-[120px] sm:h-[120px] rounded-full border-[3px] border-white/40 overflow-hidden shadow-2xl bg-white shrink-0 flex items-center justify-center p-1">
              <img 
                src={schoolDbLogo} 
                alt="Logo Hệ Quản Trị CSDL Trường Học" 
                className="w-full h-full object-contain"
              />
            </div>
            {/* Title */}
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base md:text-lg lg:text-xl font-black text-white tracking-tight drop-shadow-lg leading-tight whitespace-nowrap uppercase" style={{
                textShadow: '0 2px 12px rgba(0,0,0,0.4)'
              }}>
                ĐĂNG KÝ SỬ DỤNG ỨNG DỤNG PHẦN MỀM LỚP HỌC HẠNH PHÚC
              </h1>
              <p className="text-[12px] sm:text-xs text-white font-medium mt-0.5 hidden sm:block">
                Cấp tài khoản chính thức • Khởi tạo cơ sở dữ liệu riêng • Hỗ trợ kỹ thuật 24/7
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-110 shrink-0 ml-2"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─────────── 4-COLUMN BODY ─────────── */}
        <div className="flex-1 flex flex-col lg:flex-row gap-3 px-3 sm:px-4 pb-2 overflow-hidden min-h-0">

          {/* ═══════ COLUMN 1: Chọn Vai Trò ═══════ */}
          <div className="lg:w-[24%] shrink-0 flex flex-col rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl bg-white" style={{
            boxShadow: '0 25px 50px rgba(0,0,0,0.15)'
          }}>
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
              <div className="mb-2">
                <h2 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center text-red-600 text-xs font-black shrink-0">1</span>
                  <span>CHỌN VAI TRÒ & ĐỐI TƯỢNG ĐĂNG KÝ SỬ DỤNG</span>
                </h2>
              </div>

              <div className="space-y-2.5">
                {/* Option: Nhà Trường */}
                <button
                  type="button"
                  onClick={() => setRegistrationType('school')}
                  className={`w-full p-3 rounded-2xl border-2 text-left transition-all relative flex flex-col cursor-pointer ${
                    registrationType === 'school'
                      ? 'border-red-500 bg-red-50/60 shadow-lg ring-2 ring-red-400/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  {registrationType === 'school' && (
                    <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md">
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className={`w-5 h-5 ${registrationType === 'school' ? 'text-red-600' : 'text-slate-400'}`} />
                    <span className="text-sm font-black text-slate-900 uppercase">
                      Tổ Chức Nhà Trường
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-600 leading-relaxed">
                    Dành cho Trường Tiểu học, THCS, THPT. Khởi tạo kho dữ liệu tổng hợp riêng cho toàn trường, quản lý không giới hạn lớp học và giáo viên.
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-col justify-between">
                    <span className="text-[12px] font-bold text-slate-500 mb-1">Phí dịch vụ 1 năm:</span>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 line-through">3.000.000 VNĐ</span>
                      <span className="text-lg font-black text-red-600 font-mono">1.000.000 VNĐ</span>
                    </div>
                  </div>
                </button>

                {/* Option: Cá Nhân */}
                <button
                  type="button"
                  onClick={() => setRegistrationType('personal')}
                  className={`w-full p-3 rounded-2xl border-2 text-left transition-all relative flex flex-col cursor-pointer ${
                    registrationType === 'personal'
                      ? 'border-indigo-500 bg-indigo-50/60 shadow-lg ring-2 ring-indigo-400/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  {registrationType === 'personal' && (
                    <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <User className={`w-5 h-5 ${registrationType === 'personal' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="text-sm font-black text-slate-900 uppercase">
                      Cá Nhân Thầy / Cô
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-600 leading-relaxed">
                    Dành cho các Thầy/Cô giáo viên độc lập, giáo viên vãng lai ở các tỉnh thành trên toàn quốc muốn sử dụng phần mềm cho lớp học của mình.
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-baseline justify-between">
                    <span className="text-[12px] font-bold text-slate-500">Phí dịch vụ 1 năm:</span>
                    <span className="text-lg font-black text-indigo-600 font-mono">50.000 VNĐ</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* ═══════ COLUMN 2: Form Thông Tin ═══════ */}
          <div className="lg:flex-1 flex flex-col rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl bg-white" style={{
            boxShadow: '0 25px 50px rgba(0,0,0,0.15)'
          }}>
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
              <div className="mb-2 flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-black shrink-0">2</span>
                <h2 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>ĐIỀN THÔNG TIN THẦY / CÔ ĐĂNG KÝ</span>
                </h2>
              </div>

              {submitted ? (
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                  <h4 className="text-sm font-black text-emerald-900 uppercase">
                    Đã Gửi Thông Tin Đăng Ký Thành Công!
                  </h4>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    Hệ thống đã ghi nhận đơn đăng ký. Vui lòng chuyển khoản phí dịch vụ và liên hệ Zalo hoặc gọi cho Tác giả.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="mt-2 text-xs font-bold text-indigo-600 underline cursor-pointer"
                  >
                    Chỉnh sửa lại thông tin
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Họ và tên Thầy / Cô <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn An"
                      required
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 whitespace-nowrap">
                        Chức vụ công tác <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={roleOrTitle}
                        onChange={(e) => setRoleOrTitle(e.target.value)}
                        placeholder="Ví dụ: GVCN / GV Tin I"
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 whitespace-nowrap">
                        Số điện thoại ZALO <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="tel"
                        value={zaloPhone}
                        onChange={(e) => setZaloPhone(e.target.value)}
                        placeholder="Ví dụ: 0977xxxxxx"
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 whitespace-nowrap">
                        Yêu cầu đề nghị <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={requestType}
                        onChange={(e) => setRequestType(e.target.value)}
                        placeholder="Ví dụ: Cấp tài khoản cá nhân"
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 whitespace-nowrap">
                        Vai trò tài khoản <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={accountRole}
                        onChange={(e) => setAccountRole(e.target.value)}
                        placeholder="Ví dụ: Giáo viên bộ môn"
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Đơn vị trường học / Công tác <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="Ví dụ: Trường Tiểu học Hoa Sen"
                      required
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 rounded-xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      background: 'linear-gradient(135deg, #dc2626 0%, #e11d48 50%, #7c3aed 100%)',
                      color: 'white',
                      boxShadow: '0 8px 24px rgba(220, 38, 38, 0.3)'
                    }}
                  >
                    <HeartHandshake className="w-5 h-5" />
                    <span>{isSubmitting ? 'ĐANG GỬI THÔNG TIN...' : 'GỬI THÔNG TIN ĐĂNG KÝ SỬ DỤNG'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* ═══════ COLUMN 3: QR & Thanh Toán ═══════ */}
          <div className="lg:w-[26%] shrink-0 flex flex-col rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl" style={{
            background: 'linear-gradient(160deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)'
          }}>
            <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-black shrink-0">3</span>
                  <h2 className="text-xs font-black text-white uppercase tracking-wide flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>QUÉT MÃ QR THANH TOÁN</span>
                  </h2>
                </div>
                <span className="px-2 py-1 rounded-full font-black text-[12px] uppercase font-mono" style={{
                  background: 'linear-gradient(135deg, #dc2626, #f97316)',
                  color: 'white'
                }}>
                  {currentAmountFormatted}
                </span>
              </div>

              {/* QR Code Section */}
              <div className="bg-white rounded-2xl p-3 flex flex-col items-center gap-3">
                {/* QR Image */}
                <div 
                  onClick={() => setIsQrZoomed(true)}
                  className="w-full max-w-[180px] aspect-square bg-white p-1.5 rounded-xl border-2 border-indigo-200 shadow-sm cursor-zoom-in group relative overflow-hidden transition-all hover:scale-[1.02] hover:border-indigo-400"
                  title="Nhấp để phóng to mã QR"
                >
                  <img 
                    src={vietQrUrl} 
                    alt="VietQR Chuyển khoản" 
                    className="w-full h-full object-contain transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-white/70 text-slate-800 text-[12px] font-black uppercase text-center py-1 flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                    <ZoomIn className="w-2.5 h-2.5 text-amber-600" />
                    <span>NHẤP PHÓNG TO</span>
                  </div>
                </div>

                {/* Bank Info */}
                <div className="w-full space-y-1.5 text-xs">
                  <div>
                    <span className="text-[12px] text-slate-500 uppercase font-black">Ngân Hàng:</span>
                    <div className="font-bold text-slate-800">BIDV - PGD Tân Uyên</div>
                  </div>
                  <div>
                    <span className="text-[12px] text-slate-500 uppercase font-black">Chủ Tài Khoản:</span>
                    <div className="font-black text-slate-900 uppercase">NGUYEN THANH LIEM</div>
                  </div>
                  <div>
                    <span className="text-[12px] text-slate-500 uppercase font-black">Số Tài Khoản:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-indigo-700">3627058363</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('3627058363', 'stk')}
                        className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[12px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {copiedField === 'stk' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedField === 'stk' ? 'Đã copy' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-[12px] text-slate-500 uppercase font-black">Nội Dung CK:</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono font-bold text-[12px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                        {currentTransferContent}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(currentTransferContent, 'nd')}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {copiedField === 'nd' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedField === 'nd' ? 'Đã copy' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════ COLUMN 4: Lưu Ý & Liên Hệ ═══════ */}
          <div className="lg:w-[22%] shrink-0 flex flex-col rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl" style={{
            background: 'linear-gradient(160deg, #2563eb 0%, #4f46e5 50%, #7c3aed 100%)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
          }}>
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto flex flex-col">
              {/* Warning Note */}
              <div className="flex-1 rounded-xl p-3 md:p-4 text-sm leading-relaxed space-y-3" style={{
                background: 'rgba(251, 191, 36, 0.05)',
                border: '1px solid rgba(251, 191, 36, 0.3)'
              }}>
                <h3 className="font-black text-amber-400 uppercase flex items-start gap-2 text-sm md:text-base leading-tight">
                  <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 shrink-0 mt-0.5 opacity-80" />
                  <span>LƯU Ý QUAN TRỌNG DÀNH CHO QUÝ THẦY / CÔ:</span>
                </h3>
                <p className="italic text-white leading-relaxed font-medium text-justify">
                  "Quý Thầy/Cô thực hiện đăng ký thông tin sử dụng xong, thực hiện chuyển khoản phí sử dụng, chụp ảnh màn hình giao dịch lại và gửi qua ZALO, nhắn tin hoặc gọi điện cho Tác giả để cấp quyền sử dụng, nếu Thầy/Cô đã chuyển khoản thành công và gọi điện mà tác giả chưa bắt máy thì yên tâm có thể tác giả đang bận và sẽ gọi lại ngay cho Thầy/Cô."
                </p>
              </div>

              {/* Contact Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <a
                  href="https://zalo.me/0888358363"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-2 rounded-xl text-white font-bold text-[12px] sm:text-[12px] uppercase flex items-center justify-center gap-1.5 shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ backgroundColor: '#185df1' }}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <div className="flex flex-col items-center leading-tight">
                    <span>Nhắn Zalo</span>
                    <span>Tác Giả</span>
                  </div>
                </a>
                <a
                  href="tel:0888358363"
                  className="py-2.5 px-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[12px] sm:text-[12px] uppercase flex items-center justify-center gap-1.5 shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <div className="flex flex-col items-center leading-tight">
                    <span>Gọi Hotline</span>
                    <span>0888.358.363</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ QR ZOOM LIGHTBOX ═══════ */}
      {isQrZoomed && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-6 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200 select-none"
          onClick={() => setIsQrZoomed(false)}
        >
          <div 
            className="bg-white rounded-3xl p-5 md:p-6 max-w-sm md:max-w-md w-full shadow-2xl border border-slate-200 flex flex-col items-center space-y-4 animate-in zoom-in-95 duration-200 relative text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-xs md:text-sm uppercase text-slate-900 leading-tight">
                    Mã QR Chuyển Khoản Chi Tiết
                  </h4>
                  <span className="text-[12px] text-slate-500 font-bold">
                    Quét nhanh bằng ứng dụng ngân hàng bất kỳ
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQrZoomed(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Đóng cửa sổ phóng to"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full aspect-square max-w-[280px] sm:max-w-[320px] bg-white p-3 rounded-2xl border-2 border-indigo-200 shadow-md flex items-center justify-center">
              <img 
                src={vietQrUrl} 
                alt="VietQR Chuyển khoản phóng to" 
                className="w-full h-full object-contain"
              />
            </div>

            <div className="w-full bg-slate-50 rounded-2xl p-3.5 space-y-2 text-xs border border-slate-200/80">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold uppercase text-[12px]">Ngân hàng:</span>
                <span className="font-black text-slate-900">BIDV - PGD Tân Uyên</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold uppercase text-[12px]">Chủ tài khoản:</span>
                <span className="font-black text-slate-900 uppercase">NGUYEN THANH LIEM</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold uppercase text-[12px]">Số tài khoản:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black text-sm text-indigo-700">3627058363</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('3627058363', 'stk')}
                    className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[12px] font-bold cursor-pointer hover:bg-indigo-200 transition-colors"
                  >
                    {copiedField === 'stk' ? '✓ Đã copy' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold uppercase text-[12px]">Số tiền:</span>
                <span className="font-mono font-black text-sm text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  {currentAmountFormatted}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold uppercase text-[12px]">Nội dung:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[12px] text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {currentTransferContent}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(currentTransferContent, 'nd')}
                    className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[12px] font-bold cursor-pointer hover:bg-slate-300 transition-colors"
                  >
                    {copiedField === 'nd' ? '✓ Đã copy' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <div className="w-full flex items-center justify-between gap-3 pt-1">
              <a
                href={vietQrUrl}
                download="Ma_VietQR_Lop_Hoc_Hanh_Phuc.png"
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs uppercase text-center flex items-center justify-center gap-1.5 border border-indigo-200 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Ảnh Mã QR</span>
              </a>
              <button
                type="button"
                onClick={() => setIsQrZoomed(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-800 font-bold text-xs uppercase text-center transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
