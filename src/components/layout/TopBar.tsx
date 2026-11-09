import React, { useState, useEffect } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { 
  Maximize2, Minimize2, 
  Sparkles, Award, ShieldAlert,
  ChevronDown, School, ShieldCheck, Database, LogIn, LogOut, Users,
  Menu, Monitor, Cloud, HardDrive, KeyRound, MoreHorizontal, RefreshCw
, Search, MonitorPlay, MapPin, CalendarDays
} from 'lucide-react';
import { googleDriveService } from '../../services/googleDriveService';
import { invalidateDriveClassFilesCache, FORCE_DATA_REFRESH_EVENT } from '../../services/databaseService';
import { adminEditsService } from '../../services/adminEditsService';
import { playNoiseAlertSound } from '../../utils/audio';
import { NavigationMenuId } from './Sidebar';
import { getOfficialDisplayName, getOfficialRoleTitle } from '../../utils/accountIdentity';

interface TopBarProps {
  currentView: NavigationMenuId;
  onNavigate: (viewId: NavigationMenuId) => void;
  onOpenQuickNoise?: () => void;
  onOpenProfile?: () => void;
  onToggleMobileSidebar?: () => void;
}

const VIEW_TITLES: Record<NavigationMenuId, { title: string; shortTitle: string; subtitle: string }> = {
  staff_attendance: {
    title: 'CHẤM CÔNG NHÂN SỰ',
    shortTitle: 'CHẤM CÔNG',
    subtitle: 'ĐIỂM DANH GIÁO VIÊN – NHÂN VIÊN TOÀN TRƯỜNG, TỔNG HỢP & XUẤT EXCEL'
  },
  dashboard: {
    title: 'TRANG CHỦ',
    shortTitle: 'TRANG CHỦ',
    subtitle: 'TỔNG QUAN TÌNH HÌNH VÀ HOẠT ĐỘNG HỌC TẬP HÔM NAY'
  },
  certificate: {
    title: 'THƯ KHEN ĐIỆN TỬ',
    shortTitle: 'THƯ KHEN',
    subtitle: 'TẠO VÀ XUẤT THƯ KHEN NHANH CHÓNG'
  },
  classes: {
    title: 'QUẢN LÝ LỚP HỌC',
    shortTitle: 'LỚP HỌC',
    subtitle: 'DANH SÁCH CÁC LỚP HỌC, KHỐI LỚP VÀ THỐNG KÊ SĨ SỐ'
  },
  students: {
    title: 'HỌC SINH & THI ĐUA',
    shortTitle: 'HỌC SINH',
    subtitle: 'QUẢN LÝ THÀNH VIÊN, NỀ NẾP VÀ THƯỞNG XU THI ĐUA TRỰC TIẾP'
  },
  attendance: {
    title: 'ĐIỂM DANH HẰNG NGÀY',
    shortTitle: 'ĐIỂM DANH',
    subtitle: 'THEO DÕI SĨ SỐ, CHUYÊN CẦN VÀ TÌNH HÌNH ĐI HỌC HÀNG NGÀY'
  },
  seating: {
    title: 'SƠ ĐỒ CHỖ NGỒI KHÔNG GIAN 3D',
    shortTitle: 'SƠ ĐỒ LỚP',
    subtitle: 'HIỂN THỊ ĐẦY ĐỦ TẤT CẢ HỌC SINH THEO TỪNG DÃY BÀN VÀ HÀNG LỚP HỌC'
  },
  schedule: {
    title: 'THỜI KHÓA BIỂU',
    shortTitle: 'TKB',
    subtitle: 'THIẾT LẬP LỊCH DẠY SÁNG / CHIỀU VÀ BẤM TRỰC TIẾP VÀO TỪNG Ô ĐỂ XẾP MÔN HỌC'
  },
  rewards: {
    title: 'ĐỔI PHẦN THƯỞNG',
    shortTitle: 'ĐỔI THƯỞNG',
    subtitle: 'CỬA HÀNG PHẦN THƯỞNG ĐỔI XU TÍCH LŨY CHO HỌC SINH'
  },
  picker: {
    title: 'GỌI TÊN HỌC SINH',
    shortTitle: 'GỌI TÊN',
    subtitle: '6 TRÒ CHƠI GỌI TÊN HÀO HỨNG: VÒNG QUAY, CUỘN PHIM, TÀU VŨ TRỤ, HỘP QUÀ, ĐUA VỊT VÀ QUIZ NGHIÊNG ĐẦU'
  },
  wheel: {
    title: 'VÒNG QUAY MAY MẮN',
    shortTitle: 'VÒNG QUAY',
    subtitle: 'QUAY SỐ NGẪU NHIÊN GỌI TÊN HỌC SINH TRẢ LỜI HOẶC NHẬN QUÀ'
  },
  reel: {
    title: 'CUỘN PHIM MAY MẮN',
    shortTitle: 'CUỘN PHIM',
    subtitle: 'CUỘN BĂNG PHIM CHỌN NGẪU NHIÊN HỌC SINH VỚI AVATAR LỚN SINH ĐỘNG'
  },
  noise: {
    title: 'CÔNG CỤ CHỐNG ỒN',
    shortTitle: 'CHỐNG ỒN',
    subtitle: 'CẢNH BÁO TIẾNG ỒN LỚP HỌC – PHÁT HIỆN TỰ ĐỘNG QUA MICRO VÀ BẤM CẢNH BÁO'
  },
  timer: {
    title: 'ĐỒNG HỒ ĐẾM NGƯỢC',
    shortTitle: 'ĐỒNG HỒ',
    subtitle: 'THIẾT LẬP THỜI GIAN ĐẾM NGƯỢC ĐẸP MẮT – CHUÔNG BÁO KHI HẾT GIỜ'
  },
  links: {
    title: 'LIÊN KẾT HỮU ÍCH',
    shortTitle: 'LIÊN KẾT',
    subtitle: 'KHO TÀI LIỆU, TRANG WEB HỌC TẬP VÀ HỌC LIỆU SỐ DÙNG CHUNG'
  },
  reports: {
    title: 'BÁO CÁO & PHÂN TÍCH',
    shortTitle: 'BÁO CÁO',
    subtitle: 'THỐNG KÊ ĐIỂM XU, XẾP HẠNG VÀ LỊCH SỬ TÍCH ĐỔI CHI TIẾT'
  },
  data: {
    title: 'DỮ LIỆU HỆ THỐNG',
    shortTitle: 'DỮ LIỆU',
    subtitle: 'XUẤT FILE SAO LƯU .JSON, XUẤT BÁO CÁO HTML VÀ KHÔI PHỤC DỮ LIỆU'
  },
  settings: {
    title: 'CÀI ĐẶT HỆ THỐNG & HỒ SƠ GIÁO VIÊN',
    shortTitle: 'CÀI ĐẶT',
    subtitle: 'CẬP NHẬT THÔNG TIN CÁ NHÂN GIÁO VIÊN, TÀI KHOẢN ĐẠI DIỆN VÀ QUY CÁCH HIỂN THỊ'
  },
  infographic: {
    title: 'INFOGRAPHIC LỚP HỌC TOÀN DIỆN (A4 PDF)',
    shortTitle: 'INFOGRAPHIC',
    subtitle: 'TỔNG HỢP ĐỒ HỌA THÔNG TIN LỚP, GIÁO VIÊN, HỌC SINH, SƠ ĐỒ CHỖ NGỒI VÀ THỜI KHÓA BIỂU'
  },
  ai: {
    title: 'TRÍ TUỆ NHÂN TẠO AI LỚP HỌC HẠNH PHÚC',
    shortTitle: 'AI TRỢ LÝ',
    subtitle: 'SOẠN LỜI PHÊ, BỘ CÂU HỎI KHỞI ĐỘNG, XẾP CHỖ THÔNG MINH VÀ CỐ VẤN SƯ PHẠM'
  }
};

export const TopBar: React.FC<TopBarProps> = ({ 
  currentView, 
  onNavigate, 
  onOpenProfile,
  onToggleMobileSidebar
}) => {
  const { 
    classes, activeClassId, setActiveClassId, teacherProfile, currentClassStudents,
    teacherRole, setTeacherRole, subjectTeacherConfig,
    currentUser, allUsers, switchUserAccount, logoutUser, 
    setIsAuthModalOpen, setIsAccountManagerOpen, isGithubModalOpen, setIsGithubModalOpen,
    isGoogleDriveModalOpen, setIsGoogleDriveModalOpen,
    isCdKeyModalOpen, setIsCdKeyModalOpen,
    isDataStorageModalOpen, setIsDataStorageModalOpen,
    isCdKeyActivated,
    dbSyncStatus, lastDbSyncTime, syncDatabaseNow, isAdmin, isSchoolAdmin,
    isDemo, isBgh, canManageAccounts, setIsRegistrationModalOpen, demoWarningMessage
  } = useClassroom();
  const isManagerUser = Boolean(currentUser?.role === 'admin' || currentUser?.role === 'school_admin' || currentUser?.isSchoolAdmin || currentUser?.role === 'bgh' || currentUser?.isBgh);
  const [trialBannerHidden, setTrialBannerHidden] = React.useState(() => { try { return sessionStorage.getItem('lhhp_trial_banner_hidden') === '1'; } catch (_) { return false; } });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  // Kiểu "chip" hiện đại cho các tiện ích ở thanh trên cùng
  const chipBase = 'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-[12px] font-bold border transition-colors shrink-0 cursor-pointer';
  const [currentTimeStr, setCurrentTimeStr] = useState('13:13');
  const [driveSyncState, setDriveSyncState] = useState<{ status: string; lastSyncTime?: string }>({ 
    status: googleDriveService.getConfig().syncStatus || 'idle',
    lastSyncTime: googleDriveService.getConfig().lastSyncTime
  });

  useEffect(() => {
    const unsub = googleDriveService.subscribeStatus((st) => {
      setDriveSyncState({ status: st.status, lastSyncTime: st.lastSyncTime });
    });
    return () => unsub();
  }, []);

  const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.username?.toLowerCase() === 'adminquantri';
  const isSchoolAdminAccount = Boolean(
    currentUser?.role === 'school_admin' || 
    currentUser?.isSchoolAdmin || 
    isSchoolAdmin ||
    currentUser?.role === 'bgh' || 
    currentUser?.isBgh ||
    isBgh
  );
  const isManagementAdmin = isSuperAdmin || isSchoolAdminAccount;

  // 🔄 Quản trị tối cao / Quản trị nhà trường / BGH: cập nhật ngay dữ liệu mới nhất của mọi GVCN
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [lastRefreshAllAt, setLastRefreshAllAt] = useState<string>('');
  const handleRefreshAllData = async () => {
    if (isRefreshingAll) return;
    setIsRefreshingAll(true);
    try {
      invalidateDriveClassFilesCache();   // đọc lại tệp lớp gvcn_*.json trên Drive
      adminEditsService.invalidateCache(); // đọc lại điều chỉnh của Quản trị
      await syncDatabaseNow();             // tổng hợp lại lớp, học sinh, điểm danh, bán trú
      window.dispatchEvent(new Event(FORCE_DATA_REFRESH_EVENT)); // bảng thống kê tải lại
      const now = new Date();
      setLastRefreshAllAt(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    } catch (err) {
      console.warn('Cập nhật dữ liệu lỗi:', err);
      alert('Chưa cập nhật được dữ liệu. Vui lòng kiểm tra kết nối Internet / Google Drive rồi thử lại.');
    } finally {
      setIsRefreshingAll(false);
    }
  };

  // Đảm bảo không áp dụng CSS zoom gây lỗi khoảng trắng
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.style.zoom = '';
      document.documentElement.removeAttribute('data-zoom-manual');
      localStorage.removeItem('classroom_display_zoom');
    }
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      setCurrentTimeStr(`${h}:${m}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const activeClass = classes.find(c => c.id === activeClassId) || classes[0];
  let viewInfo = VIEW_TITLES[currentView] || VIEW_TITLES.dashboard;

  if (teacherRole === 'subject') {
    if (currentView === 'dashboard') {
      viewInfo = {
        title: `TRANG CHỦ – GV BỘ MÔN: ${subjectTeacherConfig.subjectName}`,
        shortTitle: 'TRANG CHỦ',
        subtitle: 'THỜI KHÓA BIỂU GIẢNG DẠY CÁC LỚP HÔM NAY VÀ THỐNG KÊ THI ĐUA BỘ MÔN'
      };
    } else if (currentView === 'schedule') {
      viewInfo = {
        title: `THỜI KHÓA BIỂU GIẢNG DẠY (${subjectTeacherConfig.subjectName})`,
        shortTitle: 'TKB BỘ MÔN',
        subtitle: 'SẮP THỜI KHÓA BIỂU NHIỀU LỚP DÙNG CHUNG CẢ HỌC KỲ HOẶC THEO THỜI ĐIỂM (LÊN TỚI 20 LỚP)'
      };
    } else if (currentView === 'reports') {
      viewInfo = {
        title: `BÁO CÁO & THỐNG KÊ BỘ MÔN (${subjectTeacherConfig.subjectName})`,
        shortTitle: 'BÁO CÁO',
        subtitle: 'TỔNG HỢP CHI TIẾT SỐ SAO, ĐIỂM XU TÍCH LŨY CỦA TẤT CẢ CÁC LỚP PHỤ TRÁCH'
      };
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const handleQuickAlarm = () => {
    playNoiseAlertSound();
  };

  const handleSwitchRole = (role: 'homeroom' | 'subject') => {
    setTeacherRole(role);
    if (role === 'subject') {
      if (currentView === 'attendance' || currentView === 'seating' || currentView === 'infographic') {
        onNavigate('dashboard');
      }
    }
  };


  const driveLabel =
    driveSyncState.status === 'syncing' ? 'Đang đẩy Drive…' :
    driveSyncState.status === 'pending' ? 'Chờ đẩy Drive' :
    driveSyncState.status === 'success' ? `Drive (${driveSyncState.lastSyncTime || 'OK'})` :
    driveSyncState.status === 'error' ? 'Lỗi Drive' : 'Google Drive';
  const driveChipClass =
    driveSyncState.status === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' :
    (driveSyncState.status === 'syncing' || driveSyncState.status === 'pending') ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' :
    'bg-cyan-50 text-cyan-800 border-cyan-200 hover:bg-cyan-100';
  const adminLabel = isSuperAdmin ? 'Quản trị hệ thống' : (isSchoolAdminAccount ? 'Quản trị trường' : 'Quản trị Admin');
  const openAdmin = () => {
    if (canManageAccounts) setIsAccountManagerOpen(true);
    else setIsAuthModalOpen(true);
  };

  return (
    <>
      {demoWarningMessage && (
        <div className="bg-gradient-to-r from-amber-700 via-orange-700 to-rose-600 text-white text-[12px] md:text-xs font-black py-1 px-3.5 flex items-center justify-between shadow-xs sticky top-0 z-31 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2 truncate">
            <span>⚠️</span>
            <span className="truncate">{demoWarningMessage}</span>
          </div>
          <button
            onClick={() => setIsRegistrationModalOpen(true)}
            className="px-2.5 py-0.5 rounded-full bg-white text-slate-900 hover:bg-amber-100 font-black text-[12px] md:text-[12px] uppercase shrink-0 transition-transform active:scale-95 shadow-2xs ml-2 cursor-pointer"
          >
            ĐĂNG KÝ BẢN FULL
          </button>
        </div>
      )}

      {/* ⚠️ Bản dùng thử: dải mỏng, tông sáng, tắt được trong phiên (nút CDKEY vẫn ở thanh trên) */}
      {!isCdKeyActivated && !trialBannerHidden && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-950 text-xs font-semibold py-1 px-3 flex items-center gap-2" role="status">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" aria-hidden="true" />
          <span className="truncate flex-1">Bản dùng thử: tối đa 01 lớp, 10 học sinh/lớp.</span>
          <button onClick={() => setIsCdKeyModalOpen(true)} className="no-hover-fx px-2.5 py-0.5 rounded-md bg-amber-700 hover:bg-amber-800 text-white font-bold shrink-0">Nhập CDKEY</button>
          <button onClick={() => { setTrialBannerHidden(true); try { sessionStorage.setItem('lhhp_trial_banner_hidden', '1'); } catch (_) { /* ignore */ } }}
            className="no-hover-fx w-6 h-6 rounded-md text-amber-900 hover:bg-amber-100 flex items-center justify-center shrink-0" aria-label="Ẩn thông báo bản dùng thử">✕</button>
        </div>
      )}

      <header className="h-14 bg-white/80 backdrop-blur-xl border-b border-slate-200/70 px-3 sm:px-4 md:px-5 flex items-center justify-between gap-2 sticky top-0 z-30">
      {/* Zone 1: Current Page Title & Subtitle Breadcrumb matching PDF with Mobile Menu Button */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 pr-1 sm:pr-2.5">
        {/* Mobile/Tablet Menu Hamburger Button */}
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-1.5 -ml-1 text-slate-700 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0 focus:outline-hidden"
          title="Mở menu điều hướng chức năng"
          aria-label="Mở menu điều hướng"
        >
          <Menu className="w-5 h-5 text-slate-700" />
        </button>

        <div className="flex items-center gap-2.5 min-w-[96px] flex-1" title={viewInfo.subtitle}>
          <h2 className="text-sm md:text-base font-black text-slate-900 tracking-tight leading-tight truncate shrink-0 max-w-full">
            <span className="sm:hidden">{viewInfo.shortTitle || viewInfo.title}</span>
            <span className="hidden sm:inline">{viewInfo.title}</span>
            {currentView !== 'dashboard' && currentView !== 'classes' && (
              isManagementAdmin ? (
                <span className="text-indigo-600 font-extrabold ml-1.5 hidden md:inline-block uppercase">
                  {isSuperAdmin && currentView === 'data' ? 'HỆ THỐNG & NHÀ TRƯỜNG' : 'TOÀN TRƯỜNG'}
                </span>
              ) : activeClass ? (
                <span className="text-indigo-600 font-extrabold ml-1.5 hidden md:inline-block">
                  {activeClass.name.trim().toLowerCase().startsWith('lớp') ? activeClass.name.trim() : `Lớp ${activeClass.name.trim()}`}
                </span>
              ) : null
            )}
          </h2>
          {/* Ngữ cảnh đang làm việc: trường (quản lý) */}
          {isManagerUser && (currentUser?.schoolName || teacherProfile.schoolName) && (
            <span className="hidden 2xl:inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-sm font-semibold max-w-[320px] min-w-0">
              <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
              <span className="truncate">Trường: <strong className="font-bold">{currentUser?.schoolName || teacherProfile.schoolName}</strong></span>
            </span>
          )}
        </div>
      </div>

      {/* Zone 2: tiện ích dạng "chip" gọn gàng (máy tính) + menu ⋯ (màn hình nhỏ), chọn lớp, tài khoản */}
      <div className="flex items-center gap-1.5 shrink-0 max-w-full">
        {/* ⌘ Tìm nhanh + 🎦 Trình chiếu */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('lhhp:open-command-palette'))}
          className={`${chipBase} hidden lg:inline-flex bg-slate-50 text-slate-600 border-slate-200 hover:bg-white hover:text-slate-900 min-w-[170px] justify-between`}
          title="Tìm nhanh chức năng (Ctrl + K)"
        >
          <span className="inline-flex items-center gap-1.5"><Search className="w-3.5 h-3.5" />Tìm nhanh…</span>
          <kbd className="text-[12px] font-bold text-slate-500 border border-slate-200 rounded px-1">Ctrl K</kbd>
        </button>
        {!isManagerUser && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('lhhp:toggle-presentation'))}
            className={`${chipBase} bg-slate-900 text-white border-slate-900 hover:bg-slate-800`}
            title="Chế độ trình chiếu lớp học: ẩn khung điều hướng, chữ to, toàn màn hình (Ctrl + Shift + F)"
          >
            <MonitorPlay className="w-3.5 h-3.5" /><span className="hidden xl:inline">Trình chiếu</span>
          </button>
        )}
        {/* ☁️ Trạng thái Google Drive (các tiện ích khác nằm ở nhóm "Hệ thống" của thanh bên) */}
        <button
          onClick={() => setIsGoogleDriveModalOpen(true)}
          className={`${chipBase} hidden lg:inline-flex ${driveChipClass}`}
          title={`Google Drive: ${driveLabel}`}
          aria-label={`Google Drive: ${driveLabel}`}
        >
          <Cloud className={`w-4 h-4 ${driveSyncState.status === 'syncing' ? 'animate-pulse' : ''}`} />
          <span className="hidden 2xl:inline">{driveLabel}</span>
        </button>

        {/* 🔄 Cập nhật dữ liệu mới nhất của tất cả giáo viên (Quản trị tối cao / Quản trị trường / BGH) */}
        {isManagementAdmin && (
          <button
            onClick={handleRefreshAllData}
            disabled={isRefreshingAll}
            className={`${chipBase} bg-emerald-700 text-white border-emerald-600 hover:bg-emerald-800 disabled:opacity-80 disabled:cursor-wait`}
            title={`Cập nhật ngay dữ liệu mới nhất từ tất cả tài khoản giáo viên (lớp, học sinh, điểm danh, bán trú)${lastRefreshAllAt ? ` • Lần cuối: ${lastRefreshAllAt}` : ''}`}
            aria-label="Cập nhật dữ liệu mới nhất từ tất cả giáo viên"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshingAll ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">
              {isRefreshingAll ? 'Đang cập nhật…' : (lastRefreshAllAt ? `Đã cập nhật ${lastRefreshAllAt}` : 'Cập nhật dữ liệu')}
            </span>
          </button>
        )}

          {/* Class Selector Dropdown */}
          {!isManagementAdmin && (
            <div className="relative shrink-0">
              <button
                onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                className="btn-3d btn-3d-sm btn-3d-blue flex items-center gap-1 shrink-0"
              >
                <div className="w-3.5 h-3.5 rounded bg-white/20 flex items-center justify-center font-black">
                  <School className="w-3 h-3 text-white" />
                </div>
                <span>{activeClass?.name}</span>
                <span className="text-[12px] text-white font-bold hidden 2xl:inline uppercase">
                  {activeClass?.grade} • {currentClassStudents.length} HS
                </span>
                <ChevronDown className="w-3 h-3 text-sky-200" />
              </button>

              {isClassDropdownOpen && (
                <div 
                  className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                  onMouseLeave={() => setIsClassDropdownOpen(false)}
                >
                  <div className="px-3.5 py-1 text-[12px] font-black text-slate-400 uppercase tracking-wider">
                    CHỌN LỚP HỌC
                  </div>
                  {classes.map(cls => (
                    <button
                      key={cls.id}
                      onClick={() => {
                        setActiveClassId(cls.id);
                        setIsClassDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-xs md:text-sm text-left hover:bg-slate-50 transition-colors uppercase ${
                        cls.id === activeClassId ? 'bg-sky-50 text-sky-700 font-black' : 'text-slate-700 font-bold'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: cls.color }}
                        />
                        <span className="font-black">{cls.name}</span>
                        <span className="text-xs text-slate-400 font-normal">· {cls.grade}</span>
                      </div>
                      {cls.id === activeClassId && (
                        <span className="text-[12px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full uppercase">
                          ĐANG CHỌN
                        </span>
                      )}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 mt-1.5 pt-1.5 px-2">
                    <button
                      onClick={() => {
                        setIsClassDropdownOpen(false);
                        onNavigate('classes');
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-sky-700 hover:bg-sky-50 font-black rounded-xl transition-colors uppercase"
                    >
                      + QUẢN LÝ HOẶC TẠO LỚP MỚI
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}


        {/* Năm học */}
        {(teacherProfile.academicYear || activeClass?.academicYear) && (
          <span className={`${chipBase} hidden md:inline-flex bg-white text-slate-700 border-slate-200 cursor-default`} title="Năm học">
            <CalendarDays className="w-4 h-4 text-slate-500" />
            {teacherProfile.academicYear || activeClass?.academicYear}
          </span>
        )}

        {/* Chuông trật tự (chỉ giáo viên, dùng trong lớp) */}
        {!isManagerUser && <button
          onClick={handleQuickAlarm}
          className="w-8 h-8 rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shrink-0 shadow-sm"
          title="Phát chuông ổn định trật tự lớp học ngay lập tức"
        >
          <ShieldAlert className="w-4 h-4" />
        </button>}

        {/* Toàn màn hình */}
        <button
          onClick={toggleFullscreen}
          className="hidden lg:flex w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 items-center justify-center shrink-0"
          title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình giảng dạy'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* ⋯ Menu tiện ích cho màn hình nhỏ (điện thoại / máy tính bảng) */}
        <div className="relative lg:hidden shrink-0">
          <button
            onClick={() => setIsMoreMenuOpen(v => !v)}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center"
            title="Tiện ích: Google Drive, Ổ D/E, CDKEY, Đăng ký, Quản trị, Trợ lý AI"
            aria-label="Mở menu tiện ích"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {isMoreMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsMoreMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                {[
                  { icon: <Cloud className="w-4 h-4" />, label: driveLabel, cls: 'text-cyan-800 bg-cyan-50', onClick: () => setIsGoogleDriveModalOpen(true) },
                  { icon: <HardDrive className="w-4 h-4" />, label: 'Nơi lưu dữ liệu (Ổ D / E, USB)', cls: 'text-blue-800 bg-blue-50', onClick: () => setIsDataStorageModalOpen(true) },
                  { icon: <KeyRound className="w-4 h-4" />, label: isCdKeyActivated ? 'Bản quyền PRO' : 'Kích hoạt CDKEY', cls: 'text-amber-900 bg-amber-50', onClick: () => setIsCdKeyModalOpen(true) },
                  { icon: <Sparkles className="w-4 h-4" />, label: 'Đăng ký sử dụng', cls: 'text-rose-700 bg-rose-50', onClick: () => setIsRegistrationModalOpen(true) },
                  { icon: <ShieldCheck className="w-4 h-4" />, label: adminLabel, cls: 'text-indigo-700 bg-indigo-50', onClick: openAdmin },
                  { icon: <Sparkles className="w-4 h-4" />, label: 'Trợ lý AI', cls: 'text-violet-700 bg-violet-50', onClick: () => onNavigate('ai') },
                  { icon: isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />, label: isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình', cls: 'text-slate-700 bg-slate-100', onClick: toggleFullscreen }
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => { setIsMoreMenuOpen(false); item.onClick(); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-slate-50 text-left text-xs font-bold text-slate-800"
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.cls}`}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Teacher / User Account Pill with Dropdown - Cố định an toàn không bao giờ bị đè tràn */}
        <div className="relative shrink-0 pl-1">
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="no-hover-fx flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-slate-100 transition-colors shrink-0 group"
            title="Nhấn để đổi tài khoản hoặc xem thông tin người dùng"
          >
            <img 
              src={currentUser?.avatar || teacherProfile.avatar} 
              alt={getOfficialDisplayName(currentUser, allUsers) || teacherProfile.name}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-sky-100 bg-slate-100 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="hidden md:block text-left">
              <div className="text-sm font-bold text-slate-800 leading-tight flex items-center gap-1">
                <span className="truncate max-w-[140px]">{getOfficialDisplayName(currentUser, allUsers) || teacherProfile.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-800 shrink-0" />
              </div>
              <div className="text-xs text-slate-500 font-semibold leading-tight truncate max-w-[140px]">
                {getOfficialRoleTitle(currentUser)}
              </div>
            </div>
          </button>

          {isUserMenuOpen && (
            <div 
              className="absolute right-0 top-full mt-2 w-72 bg-white rounded-3xl shadow-2xl border border-slate-200 py-3 px-3 z-50 animate-in fade-in zoom-in-95 duration-100"
              onMouseLeave={() => setIsUserMenuOpen(false)}
            >
              {/* Current user card */}
              <div className="p-3 bg-gradient-to-r from-indigo-50 to-slate-50 rounded-2xl border border-indigo-100 mb-2.5">
                <div className="flex items-center gap-2.5">
                  <img 
                    src={currentUser?.avatar || teacherProfile.avatar} 
                    alt={getOfficialDisplayName(currentUser, allUsers) || teacherProfile.name}
                    className="w-10 h-10 rounded-full border border-indigo-200 object-cover bg-white shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900 truncate">
                      {getOfficialDisplayName(currentUser, allUsers) || teacherProfile.name}
                    </div>
                    <div className="text-[12px] font-mono text-slate-500 font-bold truncate">
                      @{currentUser?.username}
                    </div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[12px] font-black uppercase ${
                      currentUser?.role === 'admin' 
                        ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                        : (currentUser?.role === 'bgh' || currentUser?.isBgh)
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : (currentUser?.role === 'school_admin' || currentUser?.isSchoolAdmin)
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : (currentUser?.role === 'guest_admin' || currentUser?.isGuestAdmin)
                        ? 'bg-purple-100 text-purple-700 border border-purple-200'
                        : currentUser?.role === 'homeroom'
                        ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                        : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}>
                      {getOfficialRoleTitle(currentUser)}
                    </span>
                  </div>
                </div>
              </div>

              {/* For ADMIN: Removed account switcher per user request */}

              {/* For TEACHERS: Notice that account is locked by role and requires explicit logout */}
              {!isAdmin && (
                <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-2xl mb-2 text-[12px] text-amber-900 leading-snug">
                  <div className="font-bold flex items-center gap-1.5 text-amber-950 mb-1">
                    <span>🔒</span>
                    <span>VAI TRÒ CỐ ĐỊNH THEO TÀI KHOẢN</span>
                  </div>
                  <span>
                    Giáo viên chủ nhiệm và Giáo viên bộ môn không thể chuyển đổi qua lại. Để dùng tài khoản khác, vui lòng <strong>Đăng xuất</strong> và đăng nhập bằng tài khoản được phân công.
                  </span>
                </div>
              )}

              {/* Action items */}
              <div className="border-t border-slate-100 pt-1.5 space-y-1">
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    if (canManageAccounts) {
                      setIsAccountManagerOpen(true);
                    } else {
                      setIsAuthModalOpen(true);
                    }
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black text-rose-700 hover:bg-rose-50 transition-colors uppercase"
                  title="Mở bảng điều khiển Quản trị tài khoản nhà trường & Cơ sở dữ liệu"
                >
                  <ShieldCheck className="w-4 h-4 text-rose-600" />
                  <span>Quản trị tài khoản & DB</span>
                </button>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    window.dispatchEvent(new CustomEvent('open-desktop-role-modal'));
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black text-sky-700 hover:bg-sky-50 transition-colors uppercase"
                  title="Xem và thay đổi vai trò sử dụng của máy tính này (CSDL_LHHP.exe)"
                >
                  <Monitor className="w-4 h-4 text-sky-600" />
                  <span>Vai trò cài đặt máy tính</span>
                </button>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logoutUser();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 transition-colors uppercase shadow-sm shadow-rose-600/20"
                >
                  <LogOut className="w-4 h-4" />
                  <span>ĐĂNG XUẤT</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  </>
  );
};
