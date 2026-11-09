import { 
  LayoutDashboard, School, Users, CheckSquare, 
  Grid3X3, Calendar, Gift, Sparkles, Film, 
  Volume2, Timer, Link, BarChart3, Database, 
  Settings, Brain, ChevronLeft, ChevronRight, BookOpen,
  ShieldCheck, LogIn, UserCheck, X, Award,
  HardDrive, Cloud, KeyRound, Lock
} from 'lucide-react';
import { useClassroom } from '../../context/ClassroomContext';
import { OPEN_CHANGE_PASSWORD_EVENT } from '../modals/ChangePasswordModal';
import { APP_AUTHOR_INFO } from '../../data/initialData';
import { OPEN_ZALO_QR_EVENT } from '../modals/ZaloQrModal';
import { getOfficialDisplayName, getOfficialRoleTitle } from '../../utils/accountIdentity';

export type NavigationMenuId = 
  | 'dashboard'
  | 'classes'
  | 'students'
  | 'attendance'
  | 'seating'
  | 'schedule'
  | 'infographic'
  | 'rewards'
  | 'certificate'
  | 'picker'
  | 'wheel'
  | 'reel'
  | 'noise'
  | 'timer'
  | 'links'
  | 'reports'
  | 'staff_attendance'
  | 'data'
  | 'settings'
  | 'ai';

interface SidebarProps {
  currentView: NavigationMenuId;
  onNavigate: (view: NavigationMenuId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface MenuItem {
  id: NavigationMenuId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeType?: 'hot' | 'new' | 'count' | 'ai';
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  collapsed,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const { 
    currentClassStudents, teacherProfile, teacherRole, setTeacherRole, 
    subjectTeacherConfig, currentUser, allUsers, isAdmin, isBgh, isSchoolAdmin, canManageAccounts,
    setIsAuthModalOpen, setIsAccountManagerOpen, setIsRegistrationModalOpen,
    setIsGoogleDriveModalOpen, setIsDataStorageModalOpen, setIsCdKeyModalOpen, isCdKeyActivated
  } = useClassroom();

  const ALL_MENU_ITEMS: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Trang chủ',
      icon: LayoutDashboard,
    },
    {
      id: 'classes',
      label: 'Lớp học',
      icon: School,
    },
    {
      id: 'students',
      label: 'Học sinh',
      icon: Users,
      badge: currentClassStudents.length.toString(), // sĩ số thật (trước đây hiện cứng '30' khi lớp chưa có học sinh)
      badgeType: 'count'
    },
    {
      id: 'attendance',
      label: 'Điểm danh',
      icon: CheckSquare,
    },
    {
      id: 'seating',
      label: 'Sơ đồ lớp',
      icon: Grid3X3,
    },
    {
      id: 'schedule',
      label: teacherRole === 'subject' ? 'TKB Bộ môn' : 'Thời khóa biểu',
      icon: Calendar,
      badge: teacherRole === 'subject' ? 'BỘ MÔN' : undefined,
      badgeType: 'hot'
    },
    {
      id: 'infographic',
      label: 'Infographic Lớp',
      icon: Sparkles,
      badge: 'A4 PDF',
      badgeType: 'hot'
    },
    {
      id: 'rewards',
      label: 'Đổi quà',
      icon: Gift,
      badge: 'HOT',
      badgeType: 'hot'
    },
    {
      id: 'certificate',
      label: 'Tạo thư khen',
      icon: Award,
      badge: 'NEW',
      badgeType: 'new'
    },
    {
      id: 'picker',
      label: 'Gọi tên học sinh',
      icon: Sparkles,
      badge: '7 GAME',
      badgeType: 'hot'
    },
    {
      id: 'noise',
      label: 'Chống ồn',
      icon: Volume2,
    },
    {
      id: 'timer',
      label: 'Đếm ngược',
      icon: Timer,
    },
    {
      id: 'links',
      label: 'Liên kết',
      icon: Link,
    },
    {
      id: 'reports',
      label: teacherRole === 'subject' ? 'Thống kê Bộ môn' : 'Thống kê',
      icon: BarChart3,
    },
    {
      id: 'staff_attendance',
      label: 'Chấm công nhân sự',
      icon: UserCheck,
      badge: 'NEW',
      badgeType: 'new'
    },
    {
      id: 'data',
      label: 'Dữ liệu',
      icon: Database,
    },
    {
      id: 'ai',
      label: 'Trợ lý AI',
      icon: Brain,
      badge: 'AI',
      badgeType: 'ai'
    }
  ];

  // Xác định role vĩ mô (quản lý nhà trường) — KHÔNG giảng dạy trực tiếp
  // isAdmin đã bao gồm: admin, bgh, school_admin, guest_admin từ context
  const isMacroAdmin = Boolean(
    currentUser?.role === 'admin' ||
    currentUser?.username?.toLowerCase() === 'adminquantri' ||
    isSchoolAdmin ||
    isBgh
  );

  // Danh sách menu chỉ dành cho tài khoản GVCN / GVBM (tính năng giảng dạy trực tiếp)
  const CLASSROOM_ONLY_IDS: NavigationMenuId[] = [
    'attendance', 'seating', 'schedule', 'infographic',
    'rewards', 'certificate', 'picker', 'wheel', 'reel',
    'noise', 'timer'
  ];

  const MENU_ITEMS = ALL_MENU_ITEMS.filter(item => {
    // Loại bỏ hoàn toàn mục "Cài đặt" với mọi role
    if (item.id === 'settings') return false;

    // Chấm công giáo viên – nhân viên: chỉ Quản trị tối cao, Quản trị trường, BGH
    if (item.id === 'staff_attendance' && !isMacroAdmin) return false;

    // Tài khoản quản lý vĩ mô: chỉ giữ menu quản trị cốt lõi
    if (isMacroAdmin) {
      if (CLASSROOM_ONLY_IDS.includes(item.id)) return false;
      return true;
    }

    // Giáo viên bộ môn: ẩn thêm điểm danh, sơ đồ lớp, infographic
    if (teacherRole === 'subject') {
      if (item.id === 'attendance' || item.id === 'seating' || item.id === 'infographic') {
        return false;
      }
    }
    return true;
  });

  // Nhóm menu: dễ tìm, gọn mắt
  const NAV_GROUPS: Array<{ key: string; label: string; ids: NavigationMenuId[] }> = [
    { key: 'class', label: 'Lớp học', ids: ['dashboard', 'classes', 'students', 'attendance', 'seating', 'schedule'] },
    { key: 'activity', label: 'Hoạt động', ids: ['picker', 'rewards', 'certificate', 'infographic', 'noise', 'timer'] },
    { key: 'manage', label: 'Quản lý & báo cáo', ids: ['reports', 'staff_attendance', 'data', 'links', 'ai'] },
  ];

  const renderSidebarContent = (isMobileDrawer = false) => {
    const isEffectivelyCollapsed = isMobileDrawer ? false : collapsed;
    const handleItemClick = (id: NavigationMenuId) => {
      onNavigate(id);
      if (isMobileDrawer && onCloseMobile) {
        onCloseMobile();
      }
    };

    return (
      <div className="flex flex-col h-full overflow-hidden select-none">
        {/* Brand Header: LỚP HỌC HẠNH PHÚC (Yêu cầu 6) */}
        <div className="h-13 border-b border-slate-200/80 flex items-center px-3 justify-between shrink-0">
          {!isEffectivelyCollapsed ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <img src="/logo.svg" alt="Lớp Học Hạnh Phúc" className="w-9 h-9 rounded-[22%] shadow-sm shrink-0" />
              <div className="truncate">
                <h1 className="text-[12px] font-black text-indigo-900 tracking-tight leading-tight truncate flex items-center gap-1 uppercase">
                  LỚP HỌC HẠNH PHÚC
                </h1>
                <p className="text-[12px] text-indigo-600 font-semibold leading-none mt-0.5">
                  Hệ sinh thái thông minh
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <img src="/logo.svg" alt="Lớp Học Hạnh Phúc" className="w-9 h-9 rounded-[22%] shadow-sm shrink-0" />
            </div>
          )}

          {isMobileDrawer ? (
            <button
              onClick={onCloseMobile}
              className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-auto hover-zoom-btn"
              title="Đóng menu"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-auto hover-zoom-btn"
              title={collapsed ? 'Mở rộng bảng điều khiển' : 'Thu gọn bảng điều khiển'}
            >
              {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Role Selection Switcher (Chỉ hiển thị với GVCN & GVBM, không dành cho Quản trị nhà trường) */}
        {!isMacroAdmin && (
          !isEffectivelyCollapsed ? (
            <div className="px-2.5 pt-2 pb-0.5 shrink-0">
              <div className="p-0.5 bg-slate-100/90 rounded-xl border border-slate-200/80 flex items-center gap-1">
                <button
                  onClick={() => setTeacherRole('homeroom')}
                  className={`flex-1 py-1 px-1.5 rounded-lg text-[12px] font-black tracking-tight transition-all flex items-center justify-center gap-1 uppercase ${
                    teacherRole === 'homeroom'
                      ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                  title="Chế độ Giáo viên chủ nhiệm: Đầy đủ điểm danh, sơ đồ lớp 3D, infographic"
                >
                  <span>🏫</span>
                  <span>GVCN</span>
                </button>
                <button
                  onClick={() => {
                    setTeacherRole('subject');
                    if (currentView === 'attendance' || currentView === 'seating' || currentView === 'infographic') {
                      onNavigate('dashboard');
                    }
                  }}
                  className={`flex-1 py-1 px-1.5 rounded-lg text-[12px] font-black tracking-tight transition-all flex items-center justify-center gap-1 uppercase ${
                    teacherRole === 'subject'
                      ? 'bg-emerald-700 text-white shadow-xs shadow-emerald-600/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                  title="Chế độ Giáo viên bộ môn: Quản lý lớp dạy bộ môn, TKB bộ môn theo mẫu, chấm sao thi đua"
                >
                  <span>💻</span>
                  <span>GV BỘ MÔN</span>
                </button>
              </div>
              {teacherRole === 'subject' && (
                <div className="mt-0.5 text-center">
                  <span className="inline-block px-1.5 py-0.2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black uppercase tracking-wider">
                    Môn: {subjectTeacherConfig.subjectName}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-1.5 flex justify-center shrink-0">
              <button
                onClick={() => {
                  const nextRole = teacherRole === 'homeroom' ? 'subject' : 'homeroom';
                  setTeacherRole(nextRole);
                  if (nextRole === 'subject' && (currentView === 'attendance' || currentView === 'seating' || currentView === 'infographic')) {
                    onNavigate('dashboard');
                  }
                }}
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-black shadow-2xs hover-zoom-btn ${
                  teacherRole === 'subject' ? 'bg-emerald-700 text-white' : 'bg-indigo-600 text-white'
                }`}
                title={`Đang là ${teacherRole === 'subject' ? 'GV Bộ môn' : 'GV Chủ nhiệm'}. Nhấn để đổi vai trò.`}
              >
                {teacherRole === 'subject' ? 'BM' : 'CN'}
              </button>
            </div>
          )
        )}

        {/* Navigation Items — chia nhóm cho dễ tìm */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2 scrollbar-thin" aria-label="Điều hướng chính">
          {NAV_GROUPS.map((group, gi) => {
            const items = MENU_ITEMS.filter(it => group.ids.includes(it.id))
              .sort((x, y) => group.ids.indexOf(x.id) - group.ids.indexOf(y.id));
            if (items.length === 0) return null;
            return (
              <div key={group.key} className={gi > 0 ? 'mt-3' : ''}>
                {!isEffectivelyCollapsed
                  ? <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{group.label}</p>
                  : gi > 0 && <div className="mx-2 mb-2 border-t border-slate-200" aria-hidden="true" />}
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;
                    const showBadge = item.badge && item.badgeType !== 'hot';
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`no-hover-fx relative w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left normal-case group select-none transition-colors duration-150 ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200'
                            : 'text-slate-700 hover:bg-white hover:text-slate-950'
                        }`}
                        title={isEffectivelyCollapsed ? item.label : undefined}
                      >
                        {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-indigo-600" aria-hidden="true" />}
                        <span className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center transition-colors ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                            : item.badgeType === 'ai'
                            ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white'
                            : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        {!isEffectivelyCollapsed && (
                          <span className="truncate flex-1 flex items-center justify-between gap-1.5">
                            <span className={`text-sm truncate leading-tight ${isActive ? 'font-bold' : 'font-semibold'}`}>{item.label}</span>
                            {showBadge && (
                              <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold shrink-0 ${
                                item.badgeType === 'count' ? 'bg-slate-100 text-slate-700'
                                  : item.badgeType === 'new' ? 'bg-emerald-50 text-emerald-800'
                                  : 'bg-indigo-600 text-white'
                              }`}>{item.badge}</span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Admin Quick Action Button: Quản trị viên nhà trường / Quản trị tối cao / BGH */}
        {!isEffectivelyCollapsed && (
          <div className="px-2 mb-1.5 shrink-0">
            <button
              onClick={() => {
                if (canManageAccounts) {
                  setIsAccountManagerOpen(true);
                } else {
                  setIsAuthModalOpen(true);
                }
                if (isMobileDrawer && onCloseMobile) onCloseMobile();
              }}
              className="w-full flex items-center justify-between p-1.5 rounded-xl bg-gradient-to-r from-rose-50 to-indigo-50 hover:from-rose-100 hover:to-indigo-100 border border-rose-200 text-rose-800 transition-colors shadow-2xs group cursor-pointer"
              title="Quản trị tài khoản & Cơ sở dữ liệu trường học"
            >
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black shadow-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-200" />
                </div>
                <div className="text-left">
                  <div className="text-[12px] font-black uppercase tracking-tight leading-tight text-indigo-950">QUẢN TRỊ ADMIN</div>
                  <div className="text-[12px] text-rose-700 font-bold leading-tight">Tài khoản & DB Nhà trường</div>
                </div>
              </div>
              <span className="text-[11px] font-black uppercase bg-indigo-600 text-white px-1.5 py-0.5 rounded shadow-2xs">ADMIN</span>
            </button>
          </div>
        )}

        {/* User Account Card */}
        {!isEffectivelyCollapsed && (
          <div className="px-2 mb-1.5 shrink-0">
            <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <img 
                  src={currentUser?.avatar || teacherProfile.avatar} 
                  alt={getOfficialDisplayName(currentUser, allUsers) || teacherProfile.name}
                  className="w-6 h-6 rounded-full border border-slate-200 object-cover bg-white shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-black text-slate-800 truncate leading-tight">
                    {getOfficialDisplayName(currentUser, allUsers) || teacherProfile.name}
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 truncate leading-tight">
                    {getOfficialRoleTitle(currentUser)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAuthModalOpen(true);
                  if (isMobileDrawer && onCloseMobile) onCloseMobile();
                }}
                className="p-1 rounded-lg hover:bg-white text-indigo-600 border border-transparent hover:border-slate-200 transition-colors shrink-0"
                title="Đổi tài khoản đăng nhập"
              >
                <LogIn className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Tiện ích nhanh: lưới ô gọn, hiện đại (Nơi lưu, Drive, CDKEY, Đổi mật khẩu, Đăng ký, Zalo) */}
        {(() => {
          const runTool = (fn: () => void) => () => { fn(); if (isMobileDrawer && onCloseMobile) onCloseMobile(); };
          const tools = [
            { key: 'storage', label: 'Nơi lưu', title: 'Nơi lưu trữ data an toàn (Ổ D/E) - File JSON', icon: <HardDrive className="w-4 h-4" />, cls: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100', onClick: () => setIsDataStorageModalOpen(true) },
            { key: 'drive', label: 'Drive', title: 'Đồng bộ Google Drive liên thông', icon: <Cloud className="w-4 h-4" />, cls: 'bg-cyan-50 text-cyan-800 border-cyan-200 hover:bg-cyan-100', onClick: () => setIsGoogleDriveModalOpen(true) },
            { key: 'cdkey', label: isCdKeyActivated ? 'Bản PRO' : 'CDKEY', title: 'Kích hoạt mã CDKEY bản quyền phần mềm', icon: <KeyRound className="w-4 h-4" />, cls: isCdKeyActivated ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200', onClick: () => setIsCdKeyModalOpen(true) },
            { key: 'password', label: 'Mật khẩu', title: 'Đổi mật khẩu đăng nhập của tài khoản này', icon: <Lock className="w-4 h-4" />, cls: 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100', onClick: () => window.dispatchEvent(new Event(OPEN_CHANGE_PASSWORD_EVENT)) },
            { key: 'register', label: 'Đăng ký', title: 'Đăng ký sử dụng bản quyền phần mềm Lớp Học Hạnh Phúc', icon: <Sparkles className="w-4 h-4" />, cls: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100', onClick: () => setIsRegistrationModalOpen(true) },
            { key: 'zalo', label: 'Zalo QR', title: 'Mã QR Zalo liên hệ tác giả', icon: <span className="text-[12px] font-black leading-none">Zalo</span>, cls: 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100', onClick: () => window.dispatchEvent(new Event(OPEN_ZALO_QR_EVENT)) }
          ];
          return !isEffectivelyCollapsed ? (
            <div className="px-2 mb-1.5 shrink-0">
              <div className="text-[12px] font-black text-slate-500 uppercase tracking-wider px-0.5 mb-1">Tiện ích</div>
              <div className="grid grid-cols-3 gap-1.5">
                {tools.map(t => (
                  <button
                    key={t.key}
                    onClick={runTool(t.onClick)}
                    title={t.title}
                    className={`h-12 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[12px] font-bold transition-colors ${t.cls}`}
                  >
                    {t.icon}
                    <span className="truncate max-w-full px-0.5">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-2 mb-1.5 space-y-1.5 shrink-0 flex flex-col items-center">
              {tools.map(t => (
                <button
                  key={t.key}
                  onClick={runTool(t.onClick)}
                  title={t.title}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${t.cls}`}
                >
                  {t.icon}
                </button>
              ))}
            </div>
          );
        })()}

        {/* Author Footer: CỐ ĐỊNH THEO YÊU CẦU 6 - KHÔNG LẤY TỪ CÀI ĐẶT */}
        {!isEffectivelyCollapsed && (
          <div className={`p-1.5 mx-2 rounded-xl bg-gradient-to-br from-indigo-50/90 via-sky-50/80 to-blue-50/80 border border-indigo-200/80 text-left hover-zoom-interactive shadow-xs shrink-0 ${
            isMobileDrawer ? 'mb-10' : 'mb-1.5'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-indigo-700 uppercase tracking-wider">
                TÁC GIẢ ỨNG DỤNG
              </span>
              <span className="px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 text-[11px] font-black uppercase">
                CỐ ĐỊNH
              </span>
            </div>
            <div className="text-[12px] font-black text-indigo-950 mt-0.5 uppercase leading-tight truncate">
              {APP_AUTHOR_INFO.name}
            </div>
            <div className="text-[12px] text-slate-700 font-bold uppercase leading-tight truncate">
              {APP_AUTHOR_INFO.schoolName}
            </div>
            <div className="text-[12px] text-blue-700 font-bold mt-1 flex items-center justify-between pt-0.5 border-t border-indigo-100/90">
              <span className="text-slate-600 font-bold uppercase text-[11px]">ZALO HỖ TRỢ:</span>
              <a 
                href={APP_AUTHOR_INFO.zaloUrl} 
                target="_blank" 
                rel="noreferrer"
                className="font-mono bg-white hover:bg-blue-50 px-1.5 py-0.2 rounded text-blue-700 font-black shadow-2xs border border-blue-200 transition-colors text-[12px]"
              >
                {APP_AUTHOR_INFO.zalo}
              </a>
            </div>
            <div className="text-[12px] text-blue-700 font-bold mt-0.5 flex items-center justify-between">
              <span className="text-slate-600 font-bold uppercase text-[11px] flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-black">f</span>
                <span>FACEBOOK:</span>
              </span>
              <a 
                href={APP_AUTHOR_INFO.facebook} 
                target="_blank" 
                rel="noreferrer" 
                className="bg-white hover:bg-blue-50 px-1.5 py-0.2 rounded text-blue-700 font-black shadow-2xs border border-blue-200 transition-colors text-[11px] uppercase font-bold"
              >
                XEM TRANG
              </a>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside 
        className={`hidden lg:flex h-full max-h-screen overflow-hidden bg-white/70 backdrop-blur-xl border-r border-white/80 shadow-[4px_0_24px_-12px_rgba(37,99,235,0.18)] flex-col transition-all duration-300 z-40 relative select-none shrink-0 ${
          collapsed ? 'w-20' : 'w-60'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile & Tablet Slide-over Drawer */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div 
            className="fixed inset-0 bg-sky-900/20 backdrop-blur-xs transition-opacity animate-in fade-in duration-200" 
            onClick={onCloseMobile} 
          />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-left duration-250 select-none">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
