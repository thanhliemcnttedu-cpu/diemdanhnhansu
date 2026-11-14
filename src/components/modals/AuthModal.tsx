import React, { useState, useEffect } from 'react';
import { 
  X, Lock, User, Eye, EyeOff, 
  CheckCircle2, AlertCircle, LogIn, Sparkles,
  School, ShieldCheck, UserCheck, Crown, Users, QrCode,
  ArrowRight, Phone, Globe, ChevronDown, ChevronUp,
  Cloud, HardDrive, KeyRound, RefreshCw, Award,
  Volume2, Dices, CalendarCheck, Check
} from 'lucide-react';
import { Upload as ConnUp } from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { UserAccount, LoginRoleScope, SchoolEntity } from '../../types';
import { useClassroom } from '../../context/ClassroomContext';
import { databaseService } from '../../services/databaseService';
import { googleDriveService } from '../../services/googleDriveService';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';
import { offlineAuthService } from '../../services/offlineAuthService';
import { appsScriptSetupService } from '../../services/appsScriptSetupService';
import { StaffCheckInQrModal } from '../views/staff/StaffCheckInQr';
import { staffAttendanceService } from '../../services/staffAttendanceService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  onLogin: (username: string, password: string, selectedRoleScope?: LoginRoleScope, selectedSchoolName?: string) => Promise<{ success: boolean; message?: string }>;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogin,
  onLogout: _onLogout
}) => {
  const {
    setIsRegistrationModalOpen,
    setIsGoogleDriveModalOpen,
    isGoogleDriveModalOpen,
    setIsDataStorageModalOpen,
    setIsCdKeyModalOpen,
    isCdKeyActivated
  } = useClassroom();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [rightPanelTab, setRightPanelTab] = useState<'roles' | 'features'>('roles');

  // 🎯 5 VAI TRÒ ĐĂNG NHẬP THEO YÊU CẦU
  const [selectedRoleScope, setSelectedRoleScope] = useState<LoginRoleScope>('school_teacher');
  const [schools, setSchools] = useState<SchoolEntity[]>([]);
  const [selectedSchoolName, setSelectedSchoolName] = useState<string>('TRƯỜNG HỌC HẠNH PHÚC');

  const [isPullingDrive, setIsPullingDrive] = useState(false);

  // 🏫 THƯ MỤC DÙNG CHUNG CỦA NHÀ TRƯỜNG (Google Drive) — bắt buộc trước khi đăng nhập vai trò trường
  const [driveConfigured, setDriveConfigured] = useState<boolean>(() => schoolDriveDbService.isConfigured());
  const [isCheckInQrOpen, setIsCheckInQrOpen] = useState(false);
  // Link nút "Điểm danh GV – NV": trên bản web dùng link ĐẦY ĐỦ (kèm kết nối của trường) của chính trang đang mở —
  // giống mã QR và thẻ Link điểm danh. Bản cài đặt (không phải http) giữ đường dẫn nội bộ.
  const checkInHref = (driveConfigured && typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
    ? staffAttendanceService.buildCheckInLink(undefined, window.location.origin)
    : null) || '/diemdanh';
  // Dùng kết quả lần đọc trước (nếu có) để không khóa nhấp nháy các vai trò trong lúc đang tải
  const [driveInitialized, setDriveInitialized] = useState<boolean>(() => {
    try {
      return schoolDriveDbService.isConfigured() && Boolean(JSON.parse(localStorage.getItem('lhhp_drive_schools_cache') || 'null')?.initialized);
    } catch (_) {
      return false;
    }
  });
  const [driveChecking, setDriveChecking] = useState(false);
  const [driveNotice, setDriveNotice] = useState('');
  const [folderLinkInput, setFolderLinkInput] = useState('');
  const [scriptLinkInput, setScriptLinkInput] = useState('');
  const [showDriveForm, setShowDriveForm] = useState(false);
  const onlyAdminAllowed = !driveConfigured || !driveInitialized;

  const refreshDriveSchools = async () => {
    const configured = schoolDriveDbService.isConfigured();
    setDriveConfigured(configured);
    if (!configured) {
      setDriveInitialized(false);
      return;
    }
    setDriveChecking(true);
    const res = await schoolDriveDbService.listSchools();
    setDriveChecking(false);
    if (res.success && res.message === 'offline-cache') {
      setSchools(res.schools);
      if (offlineAuthService.hasRecords()) {
        // Bản cài đặt, mất mạng: tài khoản đã từng đăng nhập trên máy này vẫn đăng nhập được (ngoại tuyến)
        setDriveInitialized(res.initialized);
        setDriveNotice('Đang ngoại tuyến — đăng nhập được bằng tài khoản đã từng đăng nhập trên máy này');
        if (res.schools.length > 0 && !res.schools.some(s => s.name === selectedSchoolName)) {
          setSelectedSchoolName(res.schools[0].name);
        }
      } else {
        // Không gọi được Apps Script: KHÔNG báo "đã kết nối" bằng thông tin lưu trên máy
        setDriveInitialized(false);
        setDriveNotice('Không kết nối được Apps Script — bấm Đổi để kiểm tra link');
      }
    } else if (res.success) {
      setDriveInitialized(res.initialized);
      setDriveNotice(res.initialized ? '' : 'Thư mục dùng chung chưa có cơ sở dữ liệu trường. Quản trị đăng nhập để khởi tạo trường và cấp tài khoản.');
      setSchools(res.schools);
      if (res.schools.length > 0 && !res.schools.some(s => s.name === selectedSchoolName)) {
        setSelectedSchoolName(res.schools[0].name);
      }
    } else {
      setDriveInitialized(false);
      setDriveNotice(res.message === 'NOT_CONFIGURED' ? '' : `Chưa đọc được CSDL trường trên Drive: ${res.message || ''}`);
    }
  };

  // 📄 Cách 2: nạp tệp kết nối do Quản trị gửi → tự điền 2 ô, người dùng bấm Xác thực & kết nối
  const handleConnectionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMessage('');
    setSuccessMessage('');
    let parsed: ReturnType<typeof googleDriveService.parseConnectionFile> = null;
    try { parsed = googleDriveService.parseConnectionFile(await file.text()); } catch (_) { parsed = null; }
    if (!parsed || !parsed.folderUrl || !parsed.scriptUrl) {
      setErrorMessage(`Tệp "${file.name}" không phải tệp kết nối đầy đủ (cần có link thư mục Google Drive và link Apps Script).`);
      return;
    }
    setFolderLinkInput(parsed.folderUrl);
    setScriptLinkInput(parsed.scriptUrl);
    setSuccessMessage(`Đã điền 2 link từ tệp kết nối${parsed.schoolName ? ` của ${parsed.schoolName}` : ''}. Bấm "Xác thực & kết nối" để hoàn tất.`);
  };

  // 🔐 Xác thực 2 ô: (1) link thư mục dùng chung, (2) link mã script — kiểm tra thật rồi mới lưu
  const handleApplyConnection = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    // Cho phép dán cả tin nhắn kết nối vào bất kỳ ô nào: tự tách link thư mục và link script
    const parsed = googleDriveService.parseConnectionText(`${folderLinkInput}\n${scriptLinkInput}`);
    const folderId = parsed.folderId || googleDriveService.extractFolderIdFromUrl(folderLinkInput.trim());
    const scriptUrl = parsed.scriptUrl || googleDriveService.normalizeScriptUrl(scriptLinkInput.trim());
    if (!folderId) {
      setErrorMessage('Ô 1 chưa đúng: hãy dán link thư mục Google Drive dùng chung (https://drive.google.com/drive/folders/...).');
      return;
    }
    const isLocalDev = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    const scriptOk = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(scriptUrl || '')
      || (isLocalDev && /^http:\/\/localhost:\d+\//.test(scriptLinkInput.trim())); // Apps Script giả lập khi phát triển
    if (!scriptOk) {
      setErrorMessage('Ô 2 chưa đúng: hãy dán link mã script (https://script.google.com/macros/s/.../exec).');
      return;
    }

    const previous = googleDriveService.getConfig();
    googleDriveService.saveConfig({
      folderId,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
      scriptUrl,
      syncMethod: 'appscript',
      autoSyncEnabled: true
    });
    setDriveChecking(true);
    const res = await schoolDriveDbService.listSchools();
    setDriveChecking(false);

    if (!res.success || res.message === 'offline-cache') {
      // Sai thông tin / chưa triển khai đúng: khôi phục cấu hình cũ, không lưu
      googleDriveService.saveConfig({
        folderId: previous.folderId || '',
        folderUrl: previous.folderUrl || '',
        scriptUrl: previous.scriptUrl || ''
      });
      const raw = String(res.message || '');
      const reason = /failed to fetch|networkerror|load failed|abort/i.test(raw)
        ? 'không truy cập được link mã script (kiểm tra lại Ô 2 hoặc kết nối mạng)'
        : /không hợp lệ|chưa hỗ trợ/i.test(raw)
          ? 'mã script đang là bản cũ, cần triển khai bản V4'
          : /thư mục/i.test(raw)
            ? 'không mở được thư mục (kiểm tra lại Ô 1 và quyền chia sẻ thư mục)'
            : (raw || 'kiểm tra lại 2 đường link');
      setErrorMessage(`❌ Chưa kết nối được: ${reason}. Apps Script cần triển khai bản V4 với quyền "Bất kỳ ai".`);
      return;
    }

    schoolDriveDbService.ensureCacheOwnership();
    setFolderLinkInput('');
    setScriptLinkInput('');
    setShowDriveForm(false);
    await refreshDriveSchools();
    setSuccessMessage(res.initialized
      ? `✅ Đã kết nối cơ sở dữ liệu nhà trường (${res.schools.length} trường). Chọn vai trò, trường và đăng nhập.`
      : '✅ Đã kết nối thư mục dùng chung. Nhà trường chưa khởi tạo cơ sở dữ liệu — Quản trị đăng nhập để khởi tạo trường và cấp tài khoản.');
  };

  useEffect(() => {
    if (onlyAdminAllowed && selectedRoleScope !== 'admin') {
      setSelectedRoleScope('admin');
    }
    if (!onlyAdminAllowed && selectedRoleScope === 'admin' && !username) {
      setSelectedRoleScope('school_teacher');
    }
  }, [onlyAdminAllowed]);

  const refreshSchoolList = async () => {
    if (schoolDriveDbService.isConfigured()) {
      await refreshDriveSchools();
      return;
    }
    try {
      const list = await databaseService.getSchools();
      if (Array.isArray(list) && list.length > 0) {
        setSchools(list);
        if (!selectedSchoolName || !list.some(s => s.name === selectedSchoolName)) {
          setSelectedSchoolName(list[0].name);
        }
      }
    } catch (_) {}
  };

  const handleQuickPullFromDrive = async () => {
    // Bản web: danh sách trường lấy từ CSDL nhà trường trên Drive (không kéo tệp phân cấp cũ)
    if (schoolDriveDbService.isConfigured()) {
      setIsPullingDrive(true);
      await refreshDriveSchools();
      setIsPullingDrive(false);
      return;
    }
    setIsPullingDrive(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await googleDriveService.pullHierarchyDataFromDrive();
      if (res.success) {
        setSuccessMessage(`✅ ${res.message}`);
        await refreshSchoolList();
      } else {
        setErrorMessage(res.message || 'Chưa tìm thấy dữ liệu trên Google Drive. Thầy/Cô hãy bấm vào mục "Google Drive" ở dưới để dán link Cầu nối!');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi khi kéo dữ liệu từ Google Drive.');
    } finally {
      setIsPullingDrive(false);
    }
  };

  useEffect(() => {
    if (isOpen && !isGoogleDriveModalOpen) {
      refreshSchoolList();
    }
  }, [isOpen, isGoogleDriveModalOpen]);

  // Lắng nghe thay đổi khi modal khác (như GoogleDriveSyncModal) nạp trường mới
  useEffect(() => {
    const handleStorageChange = () => {
      refreshSchoolList();
    };
    window.addEventListener('storage', handleStorageChange);
    // Network came back / went away → re-check the school connection (unlocks or relabels the role choices)
    window.addEventListener('online', handleStorageChange);
    window.addEventListener('offline', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('online', handleStorageChange);
      window.removeEventListener('offline', handleStorageChange);
    };
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }

    if (onlyAdminAllowed && selectedRoleScope !== 'admin') {
      setErrorMessage(!driveConfigured
        ? 'Máy này chưa kết nối thư mục dùng chung của nhà trường. Hãy dán link thư mục (Ô 1) và link mã script (Ô 2) do Quản trị cung cấp rồi bấm Xác thực, hoặc đăng nhập vai trò Quản trị để cấu hình.'
        : 'Nhà trường chưa khởi tạo cơ sở dữ liệu. Hiện chỉ tài khoản Quản trị đăng nhập được.');
      return;
    }

    const isSchoolRole = selectedRoleScope === 'school_teacher' || selectedRoleScope === 'school_admin';
    if (isSchoolRole && !selectedSchoolName.trim()) {
      setErrorMessage('Vui lòng chọn trường học trực thuộc của bạn.');
      return;
    }

    setLoading(true);
    try {
      const res = await onLogin(
        username.trim(), 
        password, 
        selectedRoleScope, 
        isSchoolRole ? selectedSchoolName : undefined
      );
      if (res.success) {
        setSuccessMessage('Đăng nhập thành công!');
        setTimeout(() => {
          onClose();
        }, 150);
      } else {
        setErrorMessage(res.message || 'Bạn đã nhập sai tài khoản mật khẩu.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Có lỗi xảy ra khi đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  const roleOptions: Array<{
    id: LoginRoleScope;
    title: string;
    sub: string;
    icon: React.ReactNode;
    color: string;
    activeBorder: string;
    activeBg: string;
    dotColor: string;
  }> = [
    {
      id: 'personal_teacher',
      title: 'Vai trò Cá Nhân',
      sub: 'Giáo viên tỉnh thành lẻ / tự do, quản lý bởi Quản trị Cá nhân',
      icon: <UserCheck className="w-5 h-5" />,
      color: 'text-emerald-700',
      activeBorder: 'border-emerald-400',
      activeBg: 'bg-emerald-50/80',
      dotColor: 'bg-emerald-500'
    },
    {
      id: 'school_teacher',
      title: 'Vai trò Giáo viên - Nhân viên thuộc Nhà trường',
      sub: 'Giáo viên chủ nhiệm / bộ môn và nhân viên thuộc trường học trên hệ thống',
      icon: <School className="w-5 h-5" />,
      color: 'text-blue-700',
      activeBorder: 'border-blue-400',
      activeBg: 'bg-blue-50/80',
      dotColor: 'bg-blue-500'
    },
    {
      id: 'school_admin',
      title: 'Vai trò Ban giám hiệu - Quản trị Nhà Trường',
      sub: 'Tài khoản Ban giám hiệu và Quản trị CSDL nhà trường (do Quản trị cao nhất cấp)',
      icon: <ShieldCheck className="w-5 h-5" />,
      color: 'text-amber-700',
      activeBorder: 'border-amber-400',
      activeBg: 'bg-amber-50/80',
      dotColor: 'bg-amber-500'
    },
    {
      id: 'guest_admin',
      title: 'Vai Trò Quản trị Tài khoản Cá Nhân',
      sub: 'Quản lý các thầy cô giáo viên cá nhân, tải/nạp JSON & dọn năm học mới',
      icon: <Users className="w-5 h-5" />,
      color: 'text-purple-700',
      activeBorder: 'border-purple-400',
      activeBg: 'bg-purple-50/80',
      dotColor: 'bg-purple-500'
    },
    {
      id: 'admin',
      title: 'Tài khoản quản trị Cao nhất (adminquantri)',
      sub: 'Quyền quản trị tối cao nhất: quản lý cây thư mục CSDL trường & toàn bộ tài khoản',
      icon: <Crown className="w-5 h-5" />,
      color: 'text-rose-700',
      activeBorder: 'border-rose-400',
      activeBg: 'bg-rose-50/80',
      dotColor: 'bg-rose-500'
    }
  ];



  return (
    <div
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-2 sm:p-4 overflow-y-auto md:overflow-hidden login-tech-bg"
    >
      {/* 🌐 Nền công nghệ tông sáng: vầng sáng (aurora) + lưới tọa độ + đường mạch */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="login-aurora login-aurora-1" />
        <div className="login-aurora login-aurora-2" />
        <div className="login-aurora login-aurora-3" />
        <div className="absolute inset-0 login-grid" />
        <svg className="absolute -left-10 top-10 w-[520px] h-[520px] text-indigo-500/25" viewBox="0 0 520 520" fill="none">
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M0 120 H140 L190 170 H330" />
            <path d="M0 220 H90 L140 270 H260 L300 310" />
            <path d="M60 360 H180 L230 410 H360" />
            <path d="M200 40 V100 L240 140" />
          </g>
          <g fill="currentColor">
            <circle cx="330" cy="170" r="6" /><circle cx="300" cy="310" r="6" /><circle cx="360" cy="410" r="6" /><circle cx="240" cy="140" r="5" />
            <circle cx="140" cy="120" r="4" /><circle cx="90" cy="220" r="4" />
          </g>
        </svg>
        <svg className="absolute -right-12 bottom-0 w-[560px] h-[460px] text-sky-500/25" viewBox="0 0 560 460" fill="none">
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M560 90 H400 L350 140 H220" />
            <path d="M560 200 H460 L410 250 H300 L260 290" />
            <path d="M520 340 H380 L330 390 H190" />
            <path d="M360 460 V400 L320 360" />
          </g>
          <g fill="currentColor">
            <circle cx="220" cy="140" r="6" /><circle cx="260" cy="290" r="6" /><circle cx="190" cy="390" r="6" /><circle cx="320" cy="360" r="5" />
            <circle cx="400" cy="90" r="4" /><circle cx="460" cy="200" r="4" />
          </g>
        </svg>
      </div>

      {/* Main container */}
      <div 
        className="relative w-full max-w-6xl flex flex-col md:max-h-[97vh] animate-in fade-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─────────── TOP HEADER BAR ─────────── */}
        <div className="flex items-center justify-between gap-2 px-1 sm:px-4 pb-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            {/* Logo */}
            <img src="/logo.svg" alt="Logo Lớp Học Hạnh Phúc" className="w-10 h-10 sm:w-16 sm:h-16 shrink-0 rounded-[22%] shadow-lg shadow-indigo-500/30 ring-2 sm:ring-4 ring-white" />
            {/* Title */}
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg md:text-xl font-black text-slate-900 tracking-tight leading-tight whitespace-nowrap truncate">
                <span className="sm:hidden">Lớp Học Hạnh Phúc</span>
                <span className="hidden sm:inline">HỆ THỐNG QUẢN TRỊ CSDL LỚP HỌC HẠNH PHÚC</span>
              </h1>
              <p className="text-xs text-indigo-700 font-semibold sm:hidden truncate">Đăng nhập hệ thống quản lý lớp học</p>
              <p className="text-xs text-indigo-700 font-semibold mt-0.5 hidden sm:block">
                SCHOOL DATABASE MANAGEMENT SYSTEM • Phiên bản chuyên nghiệp
              </p>
            </div>
          </div>
          
          {/* Nút Đăng ký & CDKEY (gọn trên cùng hàng tiêu đề để không phải cuộn) */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsRegistrationModalOpen(true)}
              aria-label="Đăng ký tài khoản mới"
              className="w-9 h-9 sm:w-auto sm:h-auto justify-center sm:px-4 sm:py-2 rounded-full font-black text-[12px] uppercase tracking-wide shadow-lg transition-all hover:scale-[1.03] active:scale-[0.98] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg, #dc2626 0%, #e11d48 50%, #b91c1c 100%)', color: 'white', boxShadow: '0 6px 20px rgba(220, 38, 38, 0.35)' }}
              title="Đăng ký mua tài khoản giáo viên mới"
            >
              <Sparkles className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-300" />
              <span className="hidden sm:inline">ĐĂNG KÝ TÀI KHOẢN MỚI</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCdKeyModalOpen(true)}
              aria-label="Kích hoạt CDKEY bản quyền"
              className={`w-9 h-9 sm:w-auto sm:h-auto justify-center sm:px-4 sm:py-2 rounded-full font-black text-[12px] uppercase tracking-wide shadow-lg transition-all hover:scale-[1.03] active:scale-[0.98] flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                isCdKeyActivated
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                  : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950'
              }`}
              title="Kích hoạt CDKEY bản quyền"
            >
              <KeyRound className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{isCdKeyActivated ? 'BẢN QUYỀN VĨNH VIỄN' : 'KÍCH HOẠT CDKEY'}</span>
            </button>
          </div>

          {/* Close button (only when logged in) */}
          {currentUser && (
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/80 hover:bg-white text-slate-700 border border-slate-200 transition-colors"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ─────────── MAIN SPLIT PANEL ─────────── */}
        <div className="flex-1 flex flex-col md:flex-row gap-3 sm:gap-4 px-0 sm:px-4 pb-3 sm:pb-4 md:overflow-hidden min-h-0">
          
          {/* ═══════════ LEFT PANEL - LOGIN FORM & RESCUE ═══════════ */}
          <div className="md:w-[44%] shrink-0 flex flex-col rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl" style={{
            background: 'linear-gradient(160deg, #1d4ed8 0%, #2563eb 50%, #4338ca 100%)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
          }}>
            <div className="flex-1 p-3.5 sm:p-4 flex flex-col md:overflow-y-auto">
              {/* Error & Success Alerts */}
              {errorMessage && (
                <div className="mb-3 p-3 rounded-2xl bg-rose-600/35 border-2 border-rose-400 text-white text-xs sm:text-sm font-black flex items-start gap-2.5 backdrop-blur-md shadow-xl animate-in fade-in slide-in-from-top duration-200">
                  <AlertCircle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-[12px] font-black uppercase tracking-wider text-white mb-0.5">
                      BẢNG THÔNG BÁO HỆ THỐNG
                    </div>
                    <div className="text-white text-xs sm:text-[13px] font-black leading-snug">
                      {errorMessage}
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setErrorMessage('')}
                    className="text-white hover:text-white p-0.5 transition-colors cursor-pointer"
                    title="Đóng thông báo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {successMessage && (
                <div className="mb-3 p-3 rounded-2xl bg-emerald-500/25 border-2 border-emerald-400 text-white text-xs sm:text-sm font-black flex items-center gap-2.5 backdrop-blur-md shadow-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* 🏫 Bước bắt buộc: thư mục dùng chung của nhà trường trên Google Drive */}
                {(!driveConfigured || showDriveForm) ? (
                  <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(245, 158, 11, 0.16)', border: '1px solid rgba(245, 158, 11, 0.45)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[12px] font-black text-white uppercase flex items-center gap-1.5">
                        <Cloud className="w-3.5 h-3.5" />
                        <span>{driveConfigured ? 'Đổi kết nối Drive của trường' : '1. Kết nối Drive của trường'}</span>
                      </div>
                      {driveConfigured && (
                        <button
                          type="button"
                          onClick={() => setShowDriveForm(false)}
                          className="text-[12px] px-2 py-0.5 rounded-md bg-white/15 hover:bg-white/25 text-white font-bold shrink-0 cursor-pointer"
                        >
                          Hủy
                        </button>
                      )}
                    </div>
                    <p className="text-[12px] text-white font-medium leading-snug">
                      Dán 2 đường link do Quản trị nhà trường cung cấp rồi bấm <b>Xác thực</b> (mỗi máy chỉ làm 1 lần).
                    </p>
                    <label className="block space-y-1">
                      <span className="text-[12px] font-black text-white uppercase">Ô 1 · Link thư mục Google Drive</span>
                      <input
                        type="text"
                        value={folderLinkInput}
                        onChange={(e) => setFolderLinkInput(e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="w-full px-3 py-2 rounded-lg text-[12px] font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[12px] font-black text-white uppercase">Ô 2 · Link Apps Script (/exec)</span>
                      <input
                        type="text"
                        value={scriptLinkInput}
                        onChange={(e) => setScriptLinkInput(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="w-full px-3 py-2 rounded-lg text-[12px] font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </label>
                    <label
                      className="w-full py-2 rounded-lg border border-white/50 bg-white/15 hover:bg-white/25 text-white text-[12px] font-black cursor-pointer flex items-center justify-center gap-1.5"
                      title="Cách 2: chọn tệp ket_noi_csdl_truong.json do Quản trị nhà trường gửi — phần mềm tự điền 2 ô trên"
                    >
                      <ConnUp className="w-3.5 h-3.5" />
                      Hoặc nạp tệp kết nối (.json)
                      <input type="file" accept=".json,.txt" onChange={handleConnectionFile} className="hidden" />
                    </label>
                    <button
                      type="button"
                      onClick={handleApplyConnection}
                      disabled={!folderLinkInput.trim() || !scriptLinkInput.trim() || driveChecking}
                      className="w-full py-2 rounded-lg bg-amber-700 hover:bg-amber-800 disabled:opacity-80 text-white text-[12px] font-black uppercase cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {driveChecking ? 'Đang xác thực với Google Drive...' : 'Xác thực & kết nối'}
                    </button>
                    <button
                      type="button"
                      onClick={() => appsScriptSetupService.open('install')}
                      className="w-full py-2 rounded-lg border border-white/50 bg-white/15 hover:bg-white/25 text-white text-[12px] font-black cursor-pointer flex items-center justify-center gap-1.5"
                      title="Cài mới / kiểm tra link Apps Script (/exec): quyền Bất kỳ ai, phiên bản, mở được thư mục"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      Cài đặt / kiểm tra Apps Script
                    </button>
                    {driveConfigured && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`Làm sạch kết nối trên máy này?

Xóa link thư mục, link Apps Script, lịch sử các thư mục cũ, thông tin trường và phiên Quản trị đã nhớ trên trình duyệt này. Dữ liệu trên Google Drive KHÔNG bị ảnh hưởng.

Sau đó dán link thư mục + Apps Script mới để khởi tạo.`)) return;
                          googleDriveService.resetLocalConnection();
                          setFolderLinkInput('');
                          setScriptLinkInput('');
                          setSchools([]);
                          setDriveNotice('');
                          setDriveConfigured(false);
                          setDriveInitialized(false);
                          setShowDriveForm(false);
                          setErrorMessage('');
                          setSuccessMessage('Đã làm sạch kết nối cũ trên máy này. Dán link thư mục + Apps Script mới rồi bấm Xác thực.');
                        }}
                        className="w-full py-1.5 rounded-lg border border-rose-200/70 bg-rose-700/40 hover:bg-rose-700/60 text-white text-[12px] font-black cursor-pointer"
                        title="Khởi tạo hệ thống lần đầu / chuyển sang thư mục mới: xóa các kết nối cũ đã lưu trên máy"
                      >
                        Làm sạch kết nối cũ trên máy này
                      </button>
                    )}
                    {!driveConfigured && (
                      <p className="text-[12px] text-white font-medium leading-snug">
                        Quản trị nhà trường lần đầu: chọn vai trò Quản trị cao nhất và đăng nhập để tạo thư mục, mã script.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-xl flex items-center justify-between gap-2" style={{ background: 'rgba(16, 185, 129, 0.14)', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                    <div className="text-[12px] font-bold text-white flex items-center gap-1.5 min-w-0">
                      <Cloud className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {driveChecking
                          ? 'Đang đọc cơ sở dữ liệu nhà trường trên Drive...'
                          : driveInitialized
                            ? `Đã kết nối thư mục dùng chung • ${schools.length} trường`
                            : (driveNotice || 'Đã kết nối thư mục dùng chung')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDriveForm(true)}
                      className="text-[12px] px-2 py-0.5 rounded-md bg-white/15 hover:bg-white/25 text-white font-bold shrink-0 cursor-pointer"
                    >
                      Đổi
                    </button>
                  </div>
                )}

                {/* 📱 Điện thoại: chọn vai trò ngay trong form (khung vai trò bên phải chỉ hiện trên màn lớn) */}
                <div className="md:hidden">
                  <label htmlFor="login-role-mobile" className="block text-[12px] font-black text-white uppercase mb-1.5 tracking-wider">Vai trò đăng nhập</label>
                  <select
                    id="login-role-mobile"
                    value={selectedRoleScope}
                    onChange={(e) => {
                      const id = e.target.value as LoginRoleScope;
                      if (onlyAdminAllowed && id !== 'admin') {
                        setErrorMessage(!driveConfigured
                          ? '🔒 Cần kết nối Drive của trường trước khi chọn vai trò này.'
                          : '🔒 Nhà trường chưa khởi tạo cơ sở dữ liệu. Chỉ Quản trị đăng nhập được.');
                        return;
                      }
                      setSelectedRoleScope(id);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    {roleOptions.map(opt => (
                      <option key={opt.id} value={opt.id} disabled={onlyAdminAllowed && opt.id !== 'admin'}>
                        {opt.title.replace(/^Vai trò /i, '')}{onlyAdminAllowed && opt.id !== 'admin' ? ' (cần kết nối)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Username Input */}
                <div>
                  <label className="block text-[12px] font-black text-white uppercase mb-1.5 tracking-wider">
                    2. Tên Đăng Nhập
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Tên đăng nhập hoặc số CCCD (tài khoản dùng chung chấm công)"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all"
                      style={{
                        background: '#ffffff',
                        border: '1px solid #bfdbfe'
                      }}
                      required
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-[12px] font-black text-white uppercase mb-1.5 tracking-wider">
                    3. Mật Khẩu
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="w-full pl-10 pr-11 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all"
                      style={{
                        background: '#ffffff',
                        border: '1px solid #bfdbfe'
                      }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="mt-1.5 text-right">
                    <button type="button" onClick={() => setIsForgotOpen(true)} className="no-hover-fx text-[12px] font-black text-white underline underline-offset-2 hover:text-amber-200 cursor-pointer">
                      Quên mật khẩu?
                    </button>
                  </div>
                </div>

                {/* School Selection - for school_teacher and school_admin */}
                {(selectedRoleScope === 'school_teacher' || selectedRoleScope === 'school_admin') && (
                  <div className="p-3 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200" style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.25)'
                  }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[12px] font-black text-white uppercase flex items-center gap-1.5">
                        <School className="w-3.5 h-3.5" />
                        <span>Chọn Tên Trường:</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleQuickPullFromDrive}
                        disabled={isPullingDrive}
                        className="text-[12px] px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-white border border-white/40 font-bold flex items-center gap-1 transition-all cursor-pointer"
                        title="Tự động kéo CSDL trường và tài khoản mới nhất từ Google Drive"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${isPullingDrive ? 'animate-spin' : ''}`} />
                        <span>{isPullingDrive ? 'Đang kéo...' : 'Kéo CSDL từ Drive'}</span>
                      </button>
                    </div>
                    {schools.length > 0 ? (
                      <select
                        value={selectedSchoolName}
                        onChange={(e) => setSelectedSchoolName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-xs"
                        style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}
                      >
                        {schools.map((s) => (
                          <option key={s.id} value={s.name}>
                            🏫 {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={selectedSchoolName}
                          onChange={(e) => setSelectedSchoolName(e.target.value)}
                          placeholder="Nhập tên trường học của bạn..."
                          className="w-full px-3 py-2 rounded-lg border text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-xs"
                          style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}
                        />
                        <div className="text-[12px] text-white font-medium">
                          💡 Nhập tên trường của bạn (hoặc tạo trường trong tài khoản <strong className="text-white">@adminquantri</strong>)
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #047857 55%, #065f46 100%)',
                    color: 'white',
                    boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                  }}
                >
                  <ArrowRight className="w-5 h-5" />
                  <span className="whitespace-nowrap">{loading ? 'Đang đăng nhập…' : 'ĐĂNG NHẬP VÀO HỆ THỐNG'}</span>
                </button>
              </form>

              {/* Điểm danh giáo viên – nhân viên trên máy tính (dùng kết nối Drive sẵn có của máy, không cần đăng nhập) */}
              {driveConfigured && (
                <div className="mt-2.5 flex gap-2">
                  {/* Cùng MỘT link với mã QR và thẻ "Link điểm danh" trong phần mềm (link đầy đủ có kèm kết nối của trường),
                      không dùng "/diemdanh" trần: link trần chỉ mở được trên máy đã kết nối sẵn, chép gửi người khác thì không vào được. */}
                  <a
                    href={checkInHref}
                    className="flex-1 py-2.5 rounded-2xl bg-white/95 hover:bg-white text-emerald-900 font-black text-sm flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
                    title="Giáo viên, nhân viên điểm danh đi làm hôm nay bằng số CCCD + mật khẩu điểm danh"
                  >
                    <UserCheck className="w-4 h-4 text-emerald-700" />
                    ĐIỂM DANH GV – NV
                  </a>
                  <button
                    type="button"
                    onClick={() => setIsCheckInQrOpen(true)}
                    className="px-3.5 py-2.5 rounded-2xl bg-white/95 hover:bg-white text-emerald-900 font-black text-sm flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap"
                    title="Hiện mã QR để giáo viên quét bằng Zalo / camera điện thoại và điểm danh"
                  >
                    <QrCode className="w-4 h-4 text-emerald-700" />
                    MÃ QR
                  </button>
                </div>
              )}
              <StaffCheckInQrModal open={isCheckInQrOpen} onClose={() => setIsCheckInQrOpen(false)} />

              {/* ─────────── CỨU HỘ & KHÔI PHỤC DỮ LIỆU (gọn 1 dòng) ─────────── */}
              <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center gap-2">
                <span className="w-full sm:w-auto text-[12px] font-black uppercase tracking-wide text-amber-300 flex items-center gap-1 shrink-0">
                  <RefreshCw className="w-3 h-3 text-amber-400" />
                  Cứu hộ dữ liệu:
                </span>
                <button
                  type="button"
                  onClick={() => setIsGoogleDriveModalOpen(true)}
                  className="flex-1 px-2 py-2 rounded-lg border border-white/40 bg-white/15 hover:bg-white/25 text-white text-[12px] font-black flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  title="Kéo dữ liệu từ thư mục Google Drive dùng chung"
                >
                  <Cloud className="w-3.5 h-3.5" /> Google Drive
                </button>
                <button
                  type="button"
                  onClick={() => setIsDataStorageModalOpen(true)}
                  className="flex-1 px-2 py-2 rounded-lg border border-emerald-300/60 bg-emerald-700/40 hover:bg-emerald-800/60 text-white text-[12px] font-black flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  title="Chọn tệp JSON an toàn trên ổ D / E hoặc USB"
                >
                  <HardDrive className="w-3.5 h-3.5" /> Ổ D/E, USB
                </button>
              </div>
            </div>

            {/* Author Footer (1 dòng) */}
            <div className="shrink-0 px-3 sm:px-4 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]" style={{
              background: 'linear-gradient(to right, rgba(245,158,11,0.15), rgba(234,179,8,0.1))',
              borderTop: '1px solid rgba(245,158,11,0.2)'
            }}>
              <span className="font-black text-white">Tác giả: NGUYỄN THANH LIÊM</span>
              <span className="font-bold text-white">TH Số 1 Tân Uyên</span>
              <a href="https://zalo.me/0888358363" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-white hover:text-amber-300">
                <Phone className="w-3 h-3" /><span className="text-amber-300 font-mono font-bold">0888.358.363</span>
              </a>
              <a href="https://www.facebook.com/nguyenthanhliemautotech/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-white hover:text-blue-300">
                <Globe className="w-3 h-3" /><span className="font-bold">Facebook</span>
              </a>
            </div>
          </div>

          {/* ═══════════ RIGHT PANEL - ROLE SELECTION & 5 PHÂN HỆ TINH HOA (ẢNH 9) ═══════════ */}
          <div className="hidden md:flex flex-1 flex-col rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl bg-white" style={{
            boxShadow: '0 25px 50px rgba(0,0,0,0.15)'
          }}>
            {/* Tab switch header */}
            <div className="shrink-0 flex border-b border-slate-200 bg-slate-50/80 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setRightPanelTab('roles')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  rightPanelTab === 'roles'
                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>1. Chọn Vai Trò (5 Cấp Bậc)</span>
              </button>

              <button
                type="button"
                onClick={() => setRightPanelTab('features')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  rightPanelTab === 'features'
                    ? 'bg-gradient-to-r from-amber-700 to-rose-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>5 Phân Hệ Tinh Hoa</span>
              </button>
            </div>

            <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
              {rightPanelTab === 'roles' ? (
                <>
                  <div className="mb-2 sm:mb-3">
                    <h2 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-black">1</span>
                      VAI TRÒ TRUY CẬP ĐÃ CHỌN:
                    </h2>
                  </div>

                  {/* Role Cards */}
                  <div className="space-y-1.5 sm:space-y-2">
                    {roleOptions.map((opt) => {
                      const isSelected = selectedRoleScope === opt.id;
                      const isLocked = onlyAdminAllowed && opt.id !== 'admin';
                      return (
                        <div
                          key={opt.id}
                          onClick={() => {
                            if (isLocked) {
                              setErrorMessage(!driveConfigured
                                ? '🔒 Cần cấu hình thư mục dùng chung của nhà trường trước khi chọn vai trò này.'
                                : '🔒 Nhà trường chưa khởi tạo cơ sở dữ liệu. Chỉ Quản trị đăng nhập được.');
                              return;
                            }
                            setSelectedRoleScope(opt.id);
                          }}
                          title={isLocked ? 'Cần cấu hình thư mục dùng chung của nhà trường trước' : undefined}
                          className={`group relative p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-start gap-2.5 sm:gap-3 ${isLocked ? 'opacity-75 grayscale ' : ''}${
                            isSelected 
                              ? `${opt.activeBorder} ${opt.activeBg} shadow-md` 
                              : 'border-slate-200/80 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                          }`}
                          style={isSelected ? {
                            boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
                          } : undefined}
                        >
                          {/* Radio indicator */}
                          <div className="mt-0.5 shrink-0">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected 
                                ? `${opt.activeBorder} border-current` 
                                : 'border-slate-300'
                            }`}>
                              {isSelected && (
                                <div className={`w-2.5 h-2.5 rounded-full ${opt.dotColor} animate-in zoom-in duration-150`} />
                              )}
                            </div>
                          </div>

                          {/* Icon */}
                          <div className={`p-1.5 rounded-xl shrink-0 transition-all ${
                            isSelected 
                              ? `${opt.activeBg} ${opt.color}` 
                              : 'bg-slate-100 text-slate-400 group-hover:text-slate-500'
                          }`}>
                            {opt.icon}
                          </div>

                          {/* Text content */}
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs sm:text-sm font-black transition-colors ${
                              isSelected ? opt.color : 'text-slate-700 group-hover:text-slate-900'
                            }`}>
                              {opt.title}
                            </div>
                            <div className="text-[12px] sm:text-[12px] text-slate-500 leading-tight mt-0.5">
                              {opt.sub}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* 5 PHÂN HỆ TINH HOA (ẢNH 9) */
                <div className="space-y-2.5 animate-in fade-in duration-200">
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200">
                    <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      HỆ SINH THÁI 5 PHÂN HỆ LỚP HỌC HẠNH PHÚC
                    </h3>
                    <p className="text-[12px] text-slate-600">
                      Tích hợp hoàn hảo giữa Quản trị nhà trường, Ban giám hiệu và Giáo viên chủ nhiệm & bộ môn.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                        1
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-black text-blue-900">Điểm Danh & Bán Trú Thông Minh</div>
                        <p className="text-[12px] text-slate-600 mt-0.5">
                          Tự động tổng hợp chuyên cần, thống kê học sinh ăn bán trú, liên thông tức thì lên báo cáo Ban Giám Hiệu.
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-black text-xs shrink-0">
                        2
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-black text-emerald-900">Sơ Đồ Lớp Học & Tích Điểm Khen Thưởng</div>
                        <p className="text-[12px] text-slate-600 mt-0.5">
                          Tùy biến bàn ghế linh hoạt, cộng sao rèn luyện, đổi quà cửa hàng hạnh phúc và in giấy khen vinh danh.
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/50 flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                        3
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-black text-purple-900">Bộ Mini-Games Hào Hứng & Bốc Thăm</div>
                        <p className="text-[12px] text-slate-600 mt-0.5">
                          Vòng quay may mắn, Cuộn thẻ Roulette, Chọn học sinh ngẫu nhiên kèm âm thanh hiệu ứng sinh động.
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/50 flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                        4
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-black text-rose-900">Thước Đo Tiếng Ồn & Đồng Hồ Thi Đua</div>
                        <p className="text-[12px] text-slate-600 mt-0.5">
                          Cảm biến âm thanh Micro đo độ ồn lớp học theo decibel, đồng hồ đếm ngược nhóm và báo chuông thông minh.
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-700 text-white flex items-center justify-center font-black text-xs shrink-0">
                        5
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-black text-amber-900">Đồng Bộ Google Drive & CSDL An Toàn Ổ D/E</div>
                        <p className="text-[12px] text-slate-600 mt-0.5">
                          Dùng chung 1 thư mục Google Drive, lưu file riêng từng lớp (gvcn_*.json), BGH tự động quét và bảo toàn 100% dữ liệu.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom note */}
            <div className="shrink-0 px-4 sm:px-5 py-2.5 border-t border-slate-100 bg-slate-50/50">
              <div className="text-[12px] text-slate-500 leading-relaxed flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-700">💾 Cơ chế phân quyền:</span>{' '}
                  Phân vùng bảo mật giữa Nhà trường và Giáo viên vãng lai.
                </div>
                <div className="text-indigo-600 font-bold shrink-0">
                  Phiên bản 2026 Pro
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ForgotPasswordModal isOpen={isForgotOpen} onClose={() => setIsForgotOpen(false)} initialUsername={username} onDone={(u) => { setUsername(u); setPassword(''); }} />
    </div>
  );
};
