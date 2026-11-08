/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ClassroomProvider, useClassroom } from './context/ClassroomContext';
import { TopBar } from './components/layout/TopBar';
import { Sidebar, NavigationMenuId } from './components/layout/Sidebar';
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
import { schoolDriveDbService } from './services/schoolDriveDbService';

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
const ScheduleLinksView = lazy(() => import('./components/views/ScheduleLinksView').then(m => ({ default: m.ScheduleLinksView })));
const ReportsDataView = lazy(() => import('./components/views/ReportsDataView').then(m => ({ default: m.ReportsDataView })));
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
    switchUserAccount, refreshUsersList, isAuthModalOpen, 
    setIsAuthModalOpen, isAccountManagerOpen, setIsAccountManagerOpen,
    isGithubModalOpen, setIsGithubModalOpen,
    isGoogleDriveModalOpen, setIsGoogleDriveModalOpen,
    isCdKeyModalOpen, setIsCdKeyModalOpen,
    isDataStorageModalOpen, setIsDataStorageModalOpen,
    isRegistrationModalOpen, setIsRegistrationModalOpen,
    isBgh, isSchoolAdmin
  } = useClassroom();
  const [currentView, setCurrentView] = useState<NavigationMenuId>('dashboard');

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
        return <CertificateView />;
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
      case 'reports':
        return <ReportsDataView defaultTab="stats" />;
      case 'data':
        return <ReportsDataView defaultTab="data" />;
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-800">
      {/* Exact Sidebar matching PDF navigation with Mobile Drawer support */}
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header matching PDF with Mobile Hamburger Menu */}
        <TopBar
          currentView={currentView}
          onNavigate={handleNavigate}
          onOpenQuickNoise={() => handleNavigate('noise')}
          onOpenProfile={() => handleNavigate('dashboard')}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        />

        {/* Viewport Content with bottom padding on mobile for MobileBottomNav - Tông màu Xanh tươi sáng công nghệ */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-[#f0f7ff]/90 via-[#f8fbff] to-[#edf5fd]/90 pb-32 sm:pb-24 lg:pb-6">
          <Suspense fallback={<ViewLoading />}>{renderCurrentView()}</Suspense>
        </main>
      </div>

      {/* Floating Bottom Navigation Bar for Mobile and Tablet */}
      <MobileBottomNav
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenMenu={() => setIsMobileSidebarOpen(true)}
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
        onSwitchToUser={switchUserAccount}
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

      {/* Bản Quyền CDKEY Modal (Mã thống nhất: LOP-HOC-HANH-PHUC) */}
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
