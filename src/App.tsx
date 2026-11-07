/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ClassroomProvider, useClassroom } from './context/ClassroomContext';
import { TopBar } from './components/layout/TopBar';
import { Sidebar, NavigationMenuId } from './components/layout/Sidebar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';

import { DashboardView } from './components/views/DashboardView';
import { ClassesStudentsView } from './components/views/ClassesStudentsView';
import { PointsAwardView } from './components/views/PointsAwardView';
import { RewardsShopView } from './components/views/RewardsShopView';
import { CertificateView } from './components/views/CertificateView';
import { RandomStudentPickerView } from './components/views/RandomStudentPickerView';
import { LuckyWheelView } from './components/views/LuckyWheelView';
import { FilmReelView } from './components/views/FilmReelView';
import { TimerView } from './components/views/TimerView';
import { NoiseMeterView } from './components/views/NoiseMeterView';
import { SeatingChartView } from './components/views/SeatingChartView';
import { AttendanceView } from './components/views/AttendanceView';
import { ScheduleLinksView } from './components/views/ScheduleLinksView';
import { ReportsDataView } from './components/views/ReportsDataView';
import { InfographicView } from './components/views/InfographicView';
import { AiAssistantView } from './components/views/AiAssistantView';
import { AuthModal } from './components/modals/AuthModal';
import { AccountManagementModal } from './components/modals/AccountManagementModal';
import { RegistrationModal } from './components/modals/RegistrationModal';
import { GoogleDriveSyncModal } from './components/modals/GoogleDriveSyncModal';
import { CDKeyModal } from './components/modals/CDKeyModal';
import { DataStorageLocationModal } from './components/modals/DataStorageLocationModal';
import { DesktopRoleSetupModal } from './components/modals/DesktopRoleSetupModal';
import { ChangePasswordModal } from './components/modals/ChangePasswordModal';
import { schoolDriveDbService } from './services/schoolDriveDbService';

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
          {renderCurrentView()}
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
      <AccountManagementModal
        isOpen={isAccountManagerOpen}
        onClose={() => setIsAccountManagerOpen(false)}
        currentUser={currentUser}
        allUsers={allUsers}
        onRefreshUsers={refreshUsersList}
        onSwitchToUser={switchUserAccount}
      />

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
