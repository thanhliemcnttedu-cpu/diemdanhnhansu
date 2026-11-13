/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { licenseSyncService } from './services/licenseSyncService';
import { LicenseGate } from './components/common/LicenseGate';
import { LICENSE_REQUIRED_EVENT } from './utils/licenseGate';
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ClassroomProvider, useClassroom } from './context/ClassroomContext';
import { TopBar } from './components/layout/TopBar';
import { Sidebar, NavigationMenuId, isNonTeachingAccount, NON_TEACHING_MENU_IDS } from './components/layout/Sidebar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';

import { DashboardView } from './components/views/DashboardView';
import { AuthModal } from './components/modals/AuthModal';
import { RegistrationModal } from './components/modals/RegistrationModal';
import { GoogleDriveSyncModal } from './components/modals/GoogleDriveSyncModal';
import { CDKeyModal } from './components/modals/CDKeyModal';
import { DataStorageLocationModal } from './components/modals/DataStorageLocationModal';
import { DesktopRoleSetupModal } from './components/modals/DesktopRoleSetupModal';
import { ChangePasswordModal } from './components/modals/ChangePasswordModal';
import { ZaloQrModal } from './components/modals/ZaloQrModal';
import { AppsScriptSetupWizard } from './components/modals/AppsScriptSetupWizard';
import { ReinitSchoolDbModal } from './components/modals/ReinitSchoolDbModal';
import { QuizStorageModal } from './components/modals/QuizStorageModal';
import { DesktopUpdateNotice } from './components/common/DesktopUpdate';
import { OfflineSetupWizard } from './components/common/OfflineSetupWizard';
import { OfflineStatusNotice } from './components/common/OfflineStatusNotice';
import { schoolDriveDbService } from './services/schoolDriveDbService';
import { CommandPalette } from './components/layout/CommandPalette';
import { OPEN_CHANGE_PASSWORD_EVENT } from './components/modals/ChangePasswordModal';
import { MonitorX, Maximize, Minimize, Eye, ArrowLeftCircle } from 'lucide-react';

export const TOGGLE_PRESENTATION_EVENT = 'lhhp:toggle-presentation';

// ⚡ Tải chậm (code-split): mỗi màn hình chỉ tải khi giáo viên mở → khởi động nhanh, nhẹ máy
const ClassesStudentsView = lazy(() => import('./components/views/ClassesStudentsView').then(m => ({ default: m.ClassesStudentsView })));
const PointsAwardView = lazy(() => import('./components/views/PointsAwardView').then(m => ({ default: m.PointsAwardView })));
const RewardsShopView = lazy(() => import('./components/views/RewardsShopView').then(m => ({ default: m.RewardsShopView })));
const CertificateView = lazy(() => import('./components/views/CertificateView').then(m => ({ default: m.CertificateView })));
const RandomStudentPickerView = lazy(() => import('./components/views/RandomStudentPickerView').then(m => ({ default: m.RandomStudentPickerView })));
const LuckyWheelView = lazy(() => import('./components/views/LuckyWheelView').then(m => ({ default: m.LuckyWheelView })));
const FilmReelView = lazy(() => import('./components/views/FilmReelView').then(m => ({ default: m.FilmReelView })));
const TimerView = lazy(() => import('./components/views/TimerView').then(m => ({ default: m.TimerView })));
const NoiseMeterView = lazy(() => import('./components/views/NoiseMeterView').then(m => ({ default: m.NoiseMeterView })));
const SeatingChartView = lazy(() => import('./components/views/SeatingChartView').then(m => ({ default: m.SeatingChartView })));
const AttendanceView = lazy(() => import('./components/views/AttendanceView').then(m => ({ default: m.AttendanceView })));
const StaffCheckInPage = lazy(() => import('./components/views/staff/StaffCheckInPage').then(m => ({ default: m.StaffCheckInPage })));
const StaffAttendanceView = lazy(() => import('./components/views/staff/StaffAttendanceView').then(m => ({ default: m.StaffAttendanceView })));
const ScheduleLinksView = lazy(() => import('./components/views/ScheduleLinksView').then(m => ({ default: m.ScheduleLinksView })));
const ReportsDataView = lazy(() => import('./components/views/ReportsDataView').then(m => ({ default: m.ReportsDataView })));
const UserGuideView = lazy(() => import('./components/views/UserGuideView').then(m => ({ default: m.UserGuideView })));
const InfographicView = lazy(() => import('./components/views/InfographicView').then(m => ({ default: m.InfographicView })));
const AiAssistantView = lazy(() => import('./components/views/AiAssistantView').then(m => ({ default: m.AiAssistantView })));
const AccountManagementModal = lazy(() => import('./components/modals/AccountManagementModal').then(m => ({ default: m.AccountManagementModal })));

const ViewLoading = () => (
  <div className="flex items-center justify-center py-24 text-sky-700 text-sm font-bold gap-2">
    <span className="w-5 h-5 rounded-full border-2 border-sky-300 border-t-sky-600 animate-spin" />
    Đang mở…
  </div>
);

function ClassroomApp() {
  const { 
    teacherRole, currentUser, allUsers, loginUser, logoutUser, 
    switchUserAccount, viewAsTeacher, exitViewAs, viewAs, refreshUsersList, isAuthModalOpen, 
    setIsAuthModalOpen, isAccountManagerOpen, setIsAccountManagerOpen,
    isGithubModalOpen, setIsGithubModalOpen,
    isGoogleDriveModalOpen, setIsGoogleDriveModalOpen,
    isCdKeyModalOpen, setIsCdKeyModalOpen,
    isDataStorageModalOpen, setIsDataStorageModalOpen,
    isRegistrationModalOpen, setIsRegistrationModalOpen,
    isBgh, isSchoolAdmin
  } = useClassroom();
  const [currentView, setCurrentView] = useState<NavigationMenuId>('dashboard');

  // Log out / log in with another account → always start at the home page,
  // never on the screen the previous account left open.
  useEffect(() => {
    setCurrentView('dashboard');
    setIsMobileSidebarOpen(false);
  }, [currentUser?.username]);

  // One Data page instead of separate Drive / storage dialogs: any "open Google Drive" or "open storage location"
  // request made while logged in jumps to the matching section. Before login (auth screen) the dialogs still open.
  useEffect(() => {
    if (!currentUser || isAuthModalOpen) return;
    const section = isGoogleDriveModalOpen ? 'connect' : isDataStorageModalOpen ? 'local' : '';
    if (!section) return;
    if (isGoogleDriveModalOpen) setIsGoogleDriveModalOpen(false);
    if (isDataStorageModalOpen) setIsDataStorageModalOpen(false);
    try { sessionStorage.setItem('lhhp_data_hub_section', section); } catch (_) { /* ignore */ }
    setCurrentView('data');
    window.dispatchEvent(new CustomEvent('lhhp:data-hub-section', { detail: section }));
  }, [isGoogleDriveModalOpen, isDataStorageModalOpen, currentUser, isAuthModalOpen]);

  // 🏫 Quản trị đăng nhập mà máy chưa cấu hình thư mục dùng chung → bắt buộc cấu hình ngay
  useEffect(() => {
    if (!currentUser) return;
    const isAdminAccount = currentUser.role === 'admin' || currentUser.role === 'school_admin' || Boolean(currentUser.isSchoolAdmin);
    if (isAdminAccount && !schoolDriveDbService.isConfigured()) {
      setIsGoogleDriveModalOpen(true);
    }
  }, [currentUser?.username]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopRoleModalOpen, setIsDesktopRoleModalOpen] = useState(false);

  // Lắng nghe phím tắt hoặc mở modal cấu hình vai trò máy tính
  useEffect(() => {
    const handleOpenRoleModal = () => setIsDesktopRoleModalOpen(true);
    window.addEventListener('open-desktop-role-modal', handleOpenRoleModal);
    return () => window.removeEventListener('open-desktop-role-modal', handleOpenRoleModal);
  }, []);

  const handleNavigate = (view: NavigationMenuId) => {
    setCurrentView(view);
    setIsMobileSidebarOpen(false);
  };

  // 🎦 CHẾ ĐỘ TRÌNH CHIẾU LỚP HỌC: ẩn khung điều hướng, chữ to hơn, toàn màn hình (máy chiếu / TV)
  const [isPresenting, setIsPresenting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const enterPresentation = () => {
    setIsPresenting(true);
    setIsMobileSidebarOpen(false);
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (_) { /* ignore */ }
  };
  const exitPresentation = () => {
    setIsPresenting(false);
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (_) { /* ignore */ }
  };
  useEffect(() => {
    document.documentElement.style.fontSize = isPresenting ? '115%' : '';
    document.body.classList.toggle('presentation-mode', isPresenting);
    return () => { document.documentElement.style.fontSize = ''; };
  }, [isPresenting]);
  useEffect(() => {
    const onToggle = () => (isPresenting ? exitPresentation() : enterPresentation());
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); onToggle(); }
      // Esc thoát trình chiếu khi không có hộp thoại đang mở (Esc của hộp thoại ưu tiên đóng hộp thoại)
      if (e.key === 'Escape' && isPresenting && !document.querySelector('[role="dialog"]') && !document.fullscreenElement) exitPresentation();
    };
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener(TOGGLE_PRESENTATION_EVENT, onToggle);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener(TOGGLE_PRESENTATION_EVENT, onToggle);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [isPresenting]);

  // Guard: Nếu là GVBM, không cho vào Điểm danh, Sơ đồ, Infographic
  useEffect(() => {
    if (teacherRole === 'subject') {
      if (currentView === 'attendance' || currentView === 'seating' || currentView === 'infographic') {
        setCurrentView('dashboard');
      }
    }
  }, [teacherRole, currentView]);

  // Guard: Tài khoản quản lý vĩ mô (Admin/BGH/SchoolAdmin) không được vào trang lớp học trực tiếp
  const isMacroAdmin = Boolean(
    currentUser?.role === 'admin' ||
    currentUser?.username?.toLowerCase() === 'adminquantri' ||
    isSchoolAdmin ||
    isBgh
  );

  useEffect(() => {
    if (isMacroAdmin) {
      const macroAdminForbidden: NavigationMenuId[] = [
        'attendance', 'seating', 'schedule', 'infographic',
        'rewards', 'certificate', 'picker', 'wheel', 'reel',
        'noise', 'timer', 'settings'
      ];
      if (macroAdminForbidden.includes(currentView)) {
        setCurrentView('dashboard');
      }
    }
  }, [isMacroAdmin, currentView]);

  // Guard: nhân sự không phải giáo viên (kế toán, văn thư…) không có chức năng quản lý lớp học
  // → chỉ dùng Chấm công của tôi, Hướng dẫn và (khi được cấp quyền) báo cáo Chấm công nhân sự
  const isNonTeaching = !isMacroAdmin && isNonTeachingAccount(currentUser);
  const canViewStaffReport = isMacroAdmin || Boolean(currentUser?.staffReportViewer);
  // Các màn tài khoản Nhân viên được dùng (undefined = tài khoản thường, không giới hạn theo danh sách này)
  const staffViewIds = React.useMemo(
    () => (isNonTeaching ? NON_TEACHING_MENU_IDS.filter(id => id !== 'staff_attendance' || canViewStaffReport) : undefined),
    [isNonTeaching, canViewStaffReport]
  );
  // Ctrl+Shift+F không bật trình chiếu lớp học với tài khoản Nhân viên
  useEffect(() => { if (isNonTeaching && isPresenting) exitPresentation(); }, [isNonTeaching, isPresenting]);
  useEffect(() => {
    if (isNonTeaching) {
      const allowed = staffViewIds || [];
      if (!allowed.includes(currentView)) setCurrentView(canViewStaffReport ? 'staff_attendance' : 'my_checkin');
    } else if (currentUser && currentView === 'staff_attendance' && !canViewStaffReport) {
      setCurrentView('dashboard');
    }
  }, [isNonTeaching, canViewStaffReport, currentView, currentUser?.username]);

  // 👁️ "Vào xem" lớp của giáo viên từ màn Quản trị: CHẾ ĐỘ CHỈ XEM (không đăng nhập thay giáo viên)
  const handleSwitchToUser = async (username: string): Promise<boolean> => {
    const target = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (isMacroAdmin && target && (target.role === 'homeroom' || target.role === 'subject')) {
      const ok = await viewAsTeacher(username);
      if (ok) { setCurrentView('dashboard'); setIsAccountManagerOpen(false); }
      return ok;
    }
    return switchUserAccount(username);
  };

  // Chặn MỌI thao tác (bấm, nhập, kéo thả) ngoài thanh điều hướng & dải "Quay lại" khi đang chỉ xem
  const [viewOnlyToast, setViewOnlyToast] = useState(false);
  useEffect(() => {
    if (!viewAs) return;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    const notify = () => {
      setViewOnlyToast(true);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setViewOnlyToast(false), 2200);
    };
    const allowed = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest('[data-viewonly-allow]'));
    const editable = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest('input, textarea, select, [contenteditable="true"]'));
    const block = (e: Event) => {
      if (allowed(e.target)) return;
      if (e.type === 'keydown') {
        const k = (e as KeyboardEvent).key;
        if (!editable(e.target) && !['Enter', ' '].includes(k)) return; // phím cuộn / Tab vẫn dùng được
        if (k === 'Tab' || k === 'Escape') return;
      }
      if (e.type === 'mousedown' || e.type === 'pointerdown') {
        // Không chặn mặc định để vẫn kéo được thanh cuộn; chỉ chặn sự kiện tới các nút của React
        if (editable(e.target)) e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'click' || e.type === 'keydown' || e.type === 'submit') notify();
    };
    const types = ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown', 'submit', 'change', 'input', 'dragstart', 'drop', 'contextmenu'];
    types.forEach(t => document.addEventListener(t, block, true));
    return () => {
      types.forEach(t => document.removeEventListener(t, block, true));
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, [viewAs]);

  // 🔑 Bản quyền dùng chung cả trường: máy kết nối đúng thư mục + Apps Script tự kích hoạt; Quản trị đã kích hoạt thì chia sẻ
  useEffect(() => { licenseSyncService.sync().catch(() => {}); }, [currentUser?.username]);
  // A locked action (export, certificate, staff attendance…) asks for the licence dialog
  useEffect(() => {
    const open = () => setIsCdKeyModalOpen(true);
    window.addEventListener(LICENSE_REQUIRED_EVENT, open);
    return () => window.removeEventListener(LICENSE_REQUIRED_EVENT, open);
  }, [setIsCdKeyModalOpen]);

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <DashboardView 
            onNavigate={handleNavigate} 
            onOpenAddStudent={() => handleNavigate('students')} 
          />
        );
      case 'classes':
        return <ClassesStudentsView mode="classes" onNavigate={handleNavigate} />;
      case 'students':
        return <ClassesStudentsView mode="students" onNavigate={handleNavigate} />;
      case 'attendance':
        return <AttendanceView />;
      case 'seating':
        return <SeatingChartView />;
      case 'schedule':
        return <ScheduleLinksView defaultTab="schedule" onNavigate={handleNavigate} />;
      case 'infographic':
        return <InfographicView />;
      case 'rewards':
        return <RewardsShopView />;
      case 'certificate':
        return <LicenseGate feature="Thư khen"><CertificateView /></LicenseGate>;
      case 'picker':
        return <RandomStudentPickerView initialGame="dashboard" />;
      case 'wheel':
        return <RandomStudentPickerView initialGame="wheel" />;
      case 'reel':
        return <RandomStudentPickerView initialGame="reel" />;
      case 'noise':
        return <NoiseMeterView />;
      case 'timer':
        return <TimerView />;
      case 'links':
        return <ScheduleLinksView defaultTab="links" onNavigate={handleNavigate} />;
      case 'guide':
        return <UserGuideView />;
      case 'reports':
        return <ReportsDataView defaultTab="stats" />;
      case 'data':
        return <ReportsDataView defaultTab="data" />;
      case 'staff_attendance':
        return <LicenseGate feature="Chấm công nhân sự"><StaffAttendanceView /></LicenseGate>;
      case 'my_checkin':
        return <LicenseGate feature="Chấm công và kê khai tiết dạy"><StaffCheckInPage embedded onExit={() => handleNavigate('dashboard')} accountUsername={currentUser?.staffCode ? String(currentUser.username || '') : ''} presetCccd={/^\d{9,12}$/.test(String(currentUser?.username || '')) ? String(currentUser?.username) : ''} /></LicenseGate>;
      case 'ai':
        return <AiAssistantView />;
      default:
        return (
          <DashboardView 
            onNavigate={handleNavigate} 
            onOpenAddStudent={() => handleNavigate('students')} 
          />
        );
    }
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden app-tech-bg font-sans text-slate-800">
      {/* 🌐 Nền công nghệ tông sáng (tĩnh, nhẹ máy): vầng sáng + lưới tọa độ + đường mạch */}
      <div className="absolute inset-0 pointer-events-none z-0" aria-hidden="true">
        <div className="app-glow app-glow-1" />
        <div className="app-glow app-glow-2" />
        <div className="app-glow app-glow-3" />
        <div className="absolute inset-0 app-grid" />
        <svg className="absolute right-0 bottom-0 w-[520px] h-[420px] text-sky-500/15" viewBox="0 0 520 420" fill="none">
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M520 80 H380 L330 130 H210" /><path d="M520 190 H430 L380 240 H280 L240 280" /><path d="M500 320 H360 L310 370 H180" />
          </g>
          <g fill="currentColor"><circle cx="210" cy="130" r="6" /><circle cx="240" cy="280" r="6" /><circle cx="180" cy="370" r="6" /><circle cx="380" cy="80" r="4" /></g>
        </svg>
      </div>
      {/* Exact Sidebar matching PDF navigation with Mobile Drawer support */}
      {!isPresenting && <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />}

      {/* Main Container */}
      {/* Không đặt z-index ở đây: hộp thoại (fixed z-50) bên trong các màn phải nổi trên thanh bên (z-40) */}
      <div className="relative flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {viewAs && (
          <div data-viewonly-allow="" role="status"
            className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-amber-50 border-b-2 border-amber-400 text-amber-950">
            <Eye className="w-5 h-5 shrink-0 text-amber-700" aria-hidden="true" />
            <p className="flex-1 min-w-[16rem] text-sm leading-snug">
              <strong>Chế độ CHỈ XEM</strong> — bạn đang xem giao diện lớp của giáo viên{' '}
              <strong>{viewAs.targetFullName}</strong>
              {viewAs.className ? <> ({viewAs.targetRole === 'subject' ? 'môn' : 'lớp'} <strong>{viewAs.className}</strong>)</> : null}
              {' '}bằng tài khoản quản trị <strong>{viewAs.adminFullName}</strong>. Mọi nút lệnh và chỉnh sửa đều bị khóa.
              {viewAs.note && <span className="block mt-0.5 font-bold text-amber-900">⚠ {viewAs.note}</span>}
            </p>
            <button type="button" onClick={exitViewAs}
              className="no-hover-fx shrink-0 h-9 px-4 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-sm font-black inline-flex items-center gap-2 whitespace-nowrap">
              <ArrowLeftCircle className="w-4 h-4" /> Quay lại tài khoản quản trị
            </button>
          </div>
        )}
        {viewAs && viewOnlyToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-xl bg-white border border-amber-300 shadow-lg text-sm font-bold text-amber-900" role="alert">
            Chế độ chỉ xem: không thao tác được. Bấm "Quay lại tài khoản quản trị" để tiếp tục làm việc.
          </div>
        )}
        {/* Top Header matching PDF with Mobile Hamburger Menu */}
        {!isPresenting && <TopBar
          currentView={currentView}
          onNavigate={handleNavigate}
          onOpenQuickNoise={() => handleNavigate('noise')}
          onOpenProfile={() => handleNavigate('dashboard')}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        />}

        {/* Viewport Content with bottom padding on mobile for MobileBottomNav - Tông màu Xanh tươi sáng công nghệ */}
        <main className={`flex-1 overflow-y-auto bg-transparent ${isPresenting ? 'pb-6' : 'pb-32 sm:pb-24 lg:pb-6'}`}>
          <Suspense fallback={<ViewLoading />}>{renderCurrentView()}</Suspense>
        </main>
      </div>

      {/* Floating Bottom Navigation Bar for Mobile and Tablet */}
      {!isPresenting && <MobileBottomNav
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenMenu={() => setIsMobileSidebarOpen(true)}
      />}

      {/* Thanh nổi khi trình chiếu */}
      {isPresenting && (
        <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-lg p-1.5 opacity-70 hover:opacity-100 transition-opacity">
          <button type="button" onClick={() => { try { isFullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (_) { /* ignore */ } }}
            className="no-hover-fx px-3 py-2 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5" title="Bật/tắt toàn màn hình">
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />} {isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
          </button>
          <button type="button" onClick={exitPresentation}
            className="no-hover-fx px-3 py-2 rounded-xl text-sm font-black bg-slate-900 text-white hover:bg-slate-800 inline-flex items-center gap-1.5" title="Thoát chế độ trình chiếu (Ctrl+Shift+F)">
            <MonitorX className="w-4 h-4" /> Thoát trình chiếu
          </button>
        </div>
      )}

      {/* ⌘ Tìm nhanh chức năng (Ctrl+K) */}
      <CommandPalette
        isMacroAdmin={isMacroAdmin}
        isSubjectTeacher={teacherRole === 'subject'}
        onlyViewIds={staffViewIds}
        onNavigate={handleNavigate}
        onPresentation={enterPresentation}
        onOpenCdKey={() => setIsCdKeyModalOpen(true)}
        onChangePassword={() => window.dispatchEvent(new Event(OPEN_CHANGE_PASSWORD_EVENT))}
      />

      {/* Login & Switch User Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onLogin={loginUser}
        onLogout={logoutUser}
      />

      {/* Admin User Management & Database Sync Modal */}
      {isAccountManagerOpen && (
      <Suspense fallback={null}>
      <AccountManagementModal
        isOpen={isAccountManagerOpen}
        onClose={() => setIsAccountManagerOpen(false)}
        currentUser={currentUser}
        allUsers={allUsers}
        onRefreshUsers={refreshUsersList}
        onSwitchToUser={handleSwitchToUser}
      />
      </Suspense>
      )}

      {/* Đăng Ký Sử Dụng Phần Mềm Modal */}
      <RegistrationModal
        isOpen={isRegistrationModalOpen}
        onClose={() => setIsRegistrationModalOpen(false)}
      />

      {/* Cầu Nối Đồng Bộ Google Drive Modal */}
      <GoogleDriveSyncModal
        isOpen={isGoogleDriveModalOpen}
        onClose={() => setIsGoogleDriveModalOpen(false)}
      />

      {/* Bản Quyền CDKEY Modal */}
      <CDKeyModal
        isOpen={isCdKeyModalOpen}
        onClose={() => setIsCdKeyModalOpen(false)}
      />

      {/* Nơi Lưu Trữ Data Ổ D/E & USB Modal */}
      <DataStorageLocationModal
        isOpen={isDataStorageModalOpen}
        onClose={() => setIsDataStorageModalOpen(false)}
      />

      {/* Đổi mật khẩu tùy chọn sau khi đăng nhập (mở từ nút "Đổi mật khẩu" ở thanh bên) */}
      <ChangePasswordModal currentUser={currentUser} />

      {/* Mã QR Zalo liên hệ tác giả (tự mở khi bấm mọi liên kết Zalo của tác giả) */}
      <ZaloQrModal />
      <AppsScriptSetupWizard />
      <ReinitSchoolDbModal />
      {/* 📚 Nơi lưu câu hỏi cá nhân của giáo viên (mở từ nhóm Hệ thống) */}
      <QuizStorageModal />
      <DesktopUpdateNotice />
      {/* First-run setup of the desktop build (school connection + offline data folder); nothing on the web */}
      <OfflineSetupWizard />
      <OfflineStatusNotice currentUser={currentUser} />

      {/* Cấu Hình & Lựa Chọn Vai Trò Cài Đặt Desktop (CSDL_LHHP.exe) */}
      <DesktopRoleSetupModal
        isOpen={isDesktopRoleModalOpen}
        onClose={() => setIsDesktopRoleModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ClassroomProvider>
      <ClassroomApp />
    </ClassroomProvider>
  );
}
