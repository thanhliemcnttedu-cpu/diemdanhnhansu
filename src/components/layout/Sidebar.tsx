import { 
  LayoutDashboard, School, Users, CheckSquare, 
  Grid3X3, Calendar, Gift, Sparkles, Film, 
  Volume2, Timer, Link, BarChart3, Database, 
  Settings, Brain, ChevronLeft, ChevronRight, BookOpen,
  ShieldCheck, LogIn, UserCheck, X, Award,
  HardDrive, Cloud, KeyRound, Lock, ChevronDown, Settings2, MessageCircle
} from 'lucide-react';
import { useState } from 'react';
import { appsScriptSetupService } from '../../services/appsScriptSetupService';
import { useClassroom } from '../../context/ClassroomContext';
import { OPEN_CHANGE_PASSWORD_EVENT } from '../modals/ChangePasswordModal';
import { OPEN_QUIZ_STORAGE_EVENT } from '../modals/QuizStorageModal';
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
  | 'guide'
  | 'reports'
  | 'staff_attendance'
  | 'my_checkin'
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
      id: 'guide',
      label: 'Hướng dẫn sử dụng',
      icon: BookOpen,
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
    },
    {
      id: 'my_checkin',
      label: 'Chấm công của tôi',
      icon: UserCheck,
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
    // Giáo viên: tự điểm danh đi làm hằng ngày + kê khai tiết dạy (quản lý dùng màn Chấm công nhân sự)
    if (item.id === 'my_checkin' && isMacroAdmin) return false;

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

  // Nhóm menu: gập / mở được (giống cổng quản lý nhà trường), nhớ trạng thái trên máy
  const NAV_GROUPS: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }>; tone: string; ids: NavigationMenuId[] }> = [
    { key: 'class', label: 'Lớp học', icon: School, tone: 'text-sky-600', ids: ['dashboard', 'classes', 'students', 'attendance', 'seating', 'schedule'] },
    { key: 'activity', label: 'Hoạt động', icon: Sparkles, tone: 'text-violet-600', ids: ['picker', 'rewards', 'certificate', 'infographic', 'noise', 'timer'] },
    { key: 'manage', label: 'Quản lý & báo cáo', icon: BarChart3, tone: 'text-emerald-700', ids: ['reports', 'staff_attendance', 'my_checkin', 'data', 'links', 'guide', 'ai'] },
  ];
  const [closedGroups, setClosedGroups] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('lhhp_nav_closed_groups') || '[]'); } catch (_) { return []; }
  });
  const toggleGroup = (key: string) => setClosedGroups(prev => {
    const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
    try { localStorage.setItem('lhhp_nav_closed_groups', JSON.stringify(next)); } catch (_) { /* ignore */ }
    return next;
  });
  const schoolLabel = currentUser?.schoolName || teacherProfile.schoolName || 'Hệ sinh thái lớp học thông minh';

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
        <div className="h-14 border-b border-slate-200/80 flex items-center px-3 justify-between shrink-0">
          {!isEffectivelyCollapsed ? (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <img src="/logo.svg" alt="Lớp Học Hạnh Phúc" className="w-9 h-9 rounded-[22%] shadow-sm shrink-0" />
              <div className="min-w-0">
                <p className="text-base font-black text-slate-900 tracking-tight leading-tight truncate">Lớp Học Hạnh Phúc</p>
                <p className="text-xs text-slate-500 font-semibold leading-tight truncate" title={schoolLabel}>{schoolLabel}</p>
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

        {/* Điều hướng: nhóm gập/mở (biểu tượng + mũi tên), mục con thụt vào — gọn, dễ dò */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2 scrollbar-thin" aria-label="Điều hướng chính">
          {(() => {
            const systemActions: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string; onClick: () => void }> = [
              { key: 'accounts', label: canManageAccounts ? 'Tài khoản & CSDL' : 'Đăng nhập quản trị', icon: ShieldCheck, onClick: () => (canManageAccounts ? setIsAccountManagerOpen(true) : setIsAuthModalOpen(true)) },
              ...(!isMacroAdmin ? [{ key: 'quiz', label: 'Nơi lưu câu hỏi', icon: BookOpen, onClick: () => window.dispatchEvent(new Event(OPEN_QUIZ_STORAGE_EVENT)) }] : []),
              { key: 'password', label: 'Đổi mật khẩu', icon: Lock, onClick: () => window.dispatchEvent(new Event(OPEN_CHANGE_PASSWORD_EVENT)) },
              { key: 'cdkey', label: isCdKeyActivated ? 'Bản quyền PRO' : 'Kích hoạt CDKEY', icon: KeyRound, onClick: () => setIsCdKeyModalOpen(true) },
              { key: 'register', label: 'Đăng ký sử dụng', icon: Sparkles, onClick: () => setIsRegistrationModalOpen(true) },
              { key: 'zalo', label: 'Hỗ trợ qua Zalo', icon: MessageCircle, onClick: () => window.dispatchEvent(new Event(OPEN_ZALO_QR_EVENT)) },
            ];
            type Row = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string; badgeType?: string; active: boolean; onClick: () => void };
            const groups: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }>; tone: string; rows: Row[] }> = [
              ...NAV_GROUPS.map(g => ({
                key: g.key, label: g.label, icon: g.icon, tone: g.tone,
                rows: MENU_ITEMS.filter(it => g.ids.includes(it.id))
                  .sort((x, y) => g.ids.indexOf(x.id) - g.ids.indexOf(y.id))
                  .map(it => ({
                    key: it.id, label: it.label, icon: it.icon, active: currentView === it.id,
                    badge: it.badge && it.badgeType !== 'hot' ? it.badge : undefined, badgeType: it.badgeType,
                    onClick: () => handleItemClick(it.id),
                  })),
              })),
              {
                key: 'system', label: 'Hệ thống', icon: Settings2, tone: 'text-amber-700',
                rows: systemActions.map(a => ({
                  key: a.key, label: a.label, icon: a.icon, badge: a.badge, badgeType: a.badge ? 'trial' : undefined, active: false,
                  onClick: () => { a.onClick(); if (isMobileDrawer && onCloseMobile) onCloseMobile(); },
                })),
              },
            ];
            return groups.map((group, gi) => {
              if (group.rows.length === 0) return null;
              const GroupIcon = group.icon;
              const hasActive = group.rows.some(r => r.active);
              const open = isEffectivelyCollapsed || hasActive || !closedGroups.includes(group.key);
              return (
                <div key={group.key} className={gi > 0 ? 'mt-1' : ''}>
                  {!isEffectivelyCollapsed ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={open}
                      data-viewonly-allow="" 
                      className="no-hover-fx w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left normal-case text-slate-800 hover:bg-slate-100/80 transition-colors"
                    >
                      <GroupIcon className={`w-[18px] h-[18px] shrink-0 ${group.tone}`} />
                      <span className="flex-1 min-w-0 text-sm font-bold truncate whitespace-nowrap" title={group.label}>{group.label}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  ) : gi > 0 && <div className="mx-2 my-2 border-t border-slate-200" aria-hidden="true" />}
                  {open && (
                    <div className={isEffectivelyCollapsed ? 'space-y-1 flex flex-col items-center' : 'space-y-0.5 pb-1'}>
                      {group.rows.map(row => {
                        const Icon = row.icon;
                        if (isEffectivelyCollapsed) {
                          return (
                            <button
                              key={row.key}
                              type="button"
                              onClick={row.onClick}
                              aria-current={row.active ? 'page' : undefined}
                              data-viewonly-allow={group.key !== 'system' ? '' : undefined}
                              title={row.label}
                              aria-label={row.label}
                              className={`no-hover-fx w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${row.active ? 'bg-sky-100 text-sky-800 ring-1 ring-sky-200' : `${group.tone} hover:bg-slate-100`}`}
                            >
                              <Icon className="w-[18px] h-[18px]" />
                            </button>
                          );
                        }
                        return (
                          <button
                            key={row.key}
                            type="button"
                            onClick={row.onClick}
                            aria-current={row.active ? 'page' : undefined}
                            data-viewonly-allow={group.key !== 'system' ? '' : undefined}
                            className={`no-hover-fx relative w-full flex items-center gap-2 pl-7 pr-2 py-2 rounded-xl text-left normal-case transition-colors ${
                              row.active ? 'bg-sky-50 text-sky-900 ring-1 ring-sky-100' : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-950'
                            }`}
                          >
                            {row.active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-sky-600" aria-hidden="true" />}
                            <Icon className={`w-4 h-4 shrink-0 ${row.active ? 'text-sky-700' : group.tone}`} />
                            <span className={`flex-1 min-w-0 text-sm truncate whitespace-nowrap ${row.active ? 'font-bold' : 'font-medium'}`} title={row.label}>{row.label}</span>
                            {row.badge && (
                              <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold shrink-0 ${
                                row.badgeType === 'count' ? 'bg-slate-100 text-slate-700'
                                  : row.badgeType === 'new' ? 'bg-emerald-50 text-emerald-800'
                                  : row.badgeType === 'trial' ? 'bg-amber-100 text-amber-900'
                                  : 'bg-indigo-600 text-white'
                              }`}>{row.badge}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </nav>

        {/* Tác giả ứng dụng (thông tin cố định, không lấy từ cài đặt) — gọn ở chân thanh bên */}
        {!isEffectivelyCollapsed && (
          <div className={`mx-2.5 pt-2 border-t border-slate-200/80 text-xs text-slate-600 leading-snug shrink-0 ${isMobileDrawer ? 'mb-10' : 'mb-2'}`}>
            <p className="font-bold text-slate-800 truncate" title={APP_AUTHOR_INFO.name}>Tác giả: {APP_AUTHOR_INFO.name}</p>
            <p className="truncate" title={APP_AUTHOR_INFO.schoolName}>{APP_AUTHOR_INFO.schoolName}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 mt-0.5">
              <a href={APP_AUTHOR_INFO.zaloUrl} target="_blank" rel="noreferrer" className="font-bold text-sky-700 hover:underline">Zalo {APP_AUTHOR_INFO.zalo}</a>
              <span aria-hidden="true">•</span>
              <a href={APP_AUTHOR_INFO.facebook} target="_blank" rel="noreferrer" className="font-bold text-blue-700 hover:underline">Facebook</a>
            </p>
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
          collapsed ? 'w-20' : 'w-64'
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
