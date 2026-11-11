import React, { useState, useRef } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { Student, SchoolEntity } from '../../types';
import { APP_AUTHOR_INFO, DEFAULT_TEACHER } from '../../data/initialData';
import {
  BarChart3, Download, Upload, Trash2,
  RotateCcw, AlertTriangle, UserCheck, Award,
  BookOpen, Check, User, Camera, Sparkles,
  TrendingUp, Star, Filter, Search, ChevronRight, PieChart, ShieldCheck,
  LineChart, FileArchive, Globe, Phone, MessageCircle, Calendar, Hash, X, CheckCircle2,
  Lock, School, Trophy, Coins, Building2, Database, Layers, Eye, RefreshCw,
  HardDrive, KeyRound, Cloud
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playFanfareSound } from '../../utils/audio';
import { TeacherAvatarEditorModal } from '../modals/TeacherAvatarEditorModal';
import { compressImage } from '../../utils/imageCompressor';
import { ZoomIn, Heart } from 'lucide-react';
import { ComprehensiveStatisticsView } from './reports/ComprehensiveStatisticsView';
import { SubjectTeacherReportsView } from './reports/SubjectTeacherReportsView';
import { AdminRealtimeDashboardView } from './reports/AdminRealtimeDashboardView';
import { databaseService } from '../../services/databaseService';
import { multiTierBackupService } from '../../services/multiTierBackupService';
import { GoogleDriveSyncModal } from '../modals/GoogleDriveSyncModal';
import { DataStorageLocationModal } from '../modals/DataStorageLocationModal';
import { AppsScriptSetupWizard } from '../modals/AppsScriptSetupWizard';
import { appsScriptSetupService, DRIVE_CONNECTION_EVENT, type DriveConnection } from '../../services/appsScriptSetupService';
import { Cloud as HubCloud, RefreshCw as HubSync, HardDrive as HubDisk, FileArchive as HubArchive, Calendar as HubYear, Wand2 as HubWand, ChevronDown as HubDown } from 'lucide-react';

// Storage usage + system backup / restore (heavy) — loaded only when the Backup section is opened
const HubAccountData = React.lazy(() => import('../modals/AccountManagementModal').then(m => ({ default: m.AccountManagementModal })));

/** Sections of the unified Data page. Other screens jump to one with DATA_HUB_EVENT (see App.tsx). */
export type DataHubSection = 'backup' | 'newyear';
type HubGroupId = 'backup' | 'drive' | 'stats';
export const DATA_HUB_EVENT = 'lhhp:data-hub-section';
export const DATA_HUB_KEY = 'lhhp_data_hub_section';
const DATA_HUB_SECTIONS: Array<{ id: DataHubSection; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'backup', label: 'Sao lưu & khôi phục', hint: 'Sao lưu, khôi phục, Google Drive của trường, lưu trên máy tính', icon: HubArchive },
  { id: 'newyear', label: 'Năm học mới', hint: 'Làm mới dữ liệu của tài khoản để bắt đầu năm học mới', icon: HubYear },
];

/** One collapsible group of the backup tab: a one-line header, content only rendered when open */
const HubGroup: React.FC<{ id?: string; open: boolean; onToggle: () => void; icon: React.ComponentType<{ className?: string }>; title: string; hint: string; badge?: React.ReactNode; children: React.ReactNode }> = ({ id, open, onToggle, icon: Icon, title, hint, badge, children }) => (
  <section id={id} className={`rounded-2xl border ${open ? 'bg-slate-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
    <button type="button" onClick={onToggle} aria-expanded={open} className="no-hover-fx w-full px-3 py-2.5 flex items-center gap-2.5 text-left cursor-pointer rounded-2xl hover:bg-slate-50">
      <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-black text-slate-900">{title}</span>
        <span className="block text-xs text-slate-600 truncate">{hint}</span>
      </span>
      {badge}
      <HubDown className={`w-5 h-5 text-slate-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="px-3 pb-3 pt-1">{children}</div>}
  </section>
);

interface ReportsDataViewProps {
  defaultTab?: 'stats' | 'data' | 'profile';
}

type ChartType = 'pie' | 'bar' | 'line';
type MetricType = 'tier' | 'group' | 'subjects' | 'top_students';

const TEACHER_PRESET_AVATARS = [
  { id: 't-1', label: 'Cô giáo tươi vui', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=TeacherHoa&backgroundColor=ffd5dc' },
  { id: 't-2', label: 'Cô giáo kính cận', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=TeacherMai&backgroundColor=c0aede' },
  { id: 't-3', label: 'Cô giáo tóc dài', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=TeacherLan&backgroundColor=ffdfbf' },
  { id: 't-4', label: 'Thầy giáo thanh lịch', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=TeacherMinh&backgroundColor=b6e3f4' },
  { id: 't-5', label: 'Thầy giáo tri thức', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=TeacherHung&backgroundColor=d1d4f9' },
  { id: 't-6', label: 'Biểu tượng lớp học', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=TeacherCrown&backgroundColor=6366f1' }
];

export const ReportsDataView: React.FC<ReportsDataViewProps> = ({ defaultTab = 'stats' }) => {
  const {
    currentClassStudents, transactions, subjects,
    activeClassId, classes, updateClass, exportBackupJson, importBackupJson,
    exportBackupZip, importBackupZip,
    clearAllData, teacherProfile, updateTeacherProfile,
    teacherRole, setTeacherRole, subjectTeacherConfig, updateSubjectTeacherConfig,
    currentUser, allUsers, getCurrentUserData, students,
    canEditParentCommittee, canEditClassSlogan,
    setIsGoogleDriveModalOpen, setIsDataStorageModalOpen, setIsCdKeyModalOpen, isCdKeyActivated,
    canManageAccounts, refreshUsersList, switchUserAccount, viewAsTeacher
  } = useClassroom();

  // Unified Data page: current section (other screens can jump straight to one)
  // Legacy targets sent by other screens (App.tsx): 'connect' / 'sync' → Drive group, 'local' → backup group (holds the local folder)
  const hubTargetToGroup = (v: string | null): HubGroupId | null =>
    v === 'connect' || v === 'sync' ? 'drive' : v === 'local' || v === 'backup' ? 'backup' : null;
  const [hubInitial] = useState<{ tab: DataHubSection; group: HubGroupId | null }>(() => {
    let v: string | null = null;
    try { v = sessionStorage.getItem(DATA_HUB_KEY); if (v) sessionStorage.removeItem(DATA_HUB_KEY); } catch (_) { /* ignore */ }
    return { tab: v === 'newyear' ? 'newyear' : 'backup', group: hubTargetToGroup(v) };
  });
  const [dataHub, setDataHub] = useState<DataHubSection>(hubInitial.tab);
  const [hubOpen, setHubOpen] = useState<Record<HubGroupId, boolean>>({
    backup: !hubInitial.group || hubInitial.group === 'backup',
    drive: hubInitial.group === 'drive',
    stats: false,
  });
  const toggleHub = (id: HubGroupId) => setHubOpen(prev => ({ ...prev, [id]: !prev[id] }));
  // Drive connection chip on the collapsed group header
  const [hubDriveConn, setHubDriveConn] = useState<DriveConnection | null>(appsScriptSetupService.getLastConnection());
  React.useEffect(() => {
    const h = (e: Event) => setHubDriveConn((e as CustomEvent).detail as DriveConnection);
    window.addEventListener(DRIVE_CONNECTION_EVENT, h);
    return () => window.removeEventListener(DRIVE_CONNECTION_EVENT, h);
  }, []);
  const hubDriveBadge = !hubDriveConn || hubDriveConn.state === 'checking' ? null : (
    <span className={`shrink-0 px-2.5 py-1 rounded-full border text-xs font-black whitespace-nowrap ${
      hubDriveConn.state === 'connected' ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
        : hubDriveConn.state === 'none' ? 'bg-slate-100 border-slate-300 text-slate-700'
          : 'bg-rose-50 border-rose-300 text-rose-800'
    }`}>
      {hubDriveConn.state === 'connected' ? `Đã kết nối${hubDriveConn.version ? ` • ${hubDriveConn.version}` : ''}`
        : hubDriveConn.state === 'none' ? 'Chưa kết nối'
          : hubDriveConn.state === 'no_db' ? 'Chưa có CSDL trường' : 'Mất kết nối'}
    </span>
  );
  const [showHubWizard, setShowHubWizard] = useState(false);
  // "Ổ Drive trên máy" (and its settings card) only exists with the Express server or the Desktop build
  const hubHasDesktopDrive = typeof window !== 'undefined' && ((window as any).__lhhpApiAvailable === true || Boolean((window as any).electronAPI));
  const hubWizardRef = useRef<HTMLElement | null>(null);
  const openHubWizard = () => {
    setDataHub('backup');
    setHubOpen(prev => ({ ...prev, drive: true }));
    setShowHubWizard(true);
    setTimeout(() => hubWizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  // "Xem" a teacher from the storage table: view-only for teacher accounts, as in the account manager
  const hubSwitchToUser = async (username: string): Promise<boolean> => {
    const target = (allUsers || []).find(u => u.username.toLowerCase() === username.toLowerCase());
    if (target && (target.role === 'homeroom' || target.role === 'subject')) return viewAsTeacher(username);
    return switchUserAccount(username);
  };

  const isCurrentUserSuperAdmin = currentUser?.username?.toLowerCase() === 'adminquantri' || currentUser?.role === 'admin';
  const isSchoolAdminAccount = !isCurrentUserSuperAdmin && Boolean(
    currentUser?.role === 'school_admin' || 
    currentUser?.role === 'bgh' || 
    currentUser?.isBgh || 
    currentUser?.isSchoolAdmin
  );

  const isSubjectTeacher = teacherRole === 'subject' || currentUser?.role === 'subject';
  const isAdminAccount = Boolean(
    currentUser?.role === 'admin' || 
    currentUser?.role === 'school_admin' || 
    currentUser?.role === 'bgh' || 
    currentUser?.isBgh || 
    currentUser?.isSchoolAdmin ||
    currentUser?.username?.toLowerCase() === 'adminquantri'
  );

  const [activeTab, setActiveTab] = useState<'stats' | 'data' | 'profile'>(defaultTab);
  const [statsSubMode, setStatsSubMode] = useState<'realtime_admin' | 'subject_reports' | 'comprehensive' | 'coins'>(
    isAdminAccount
      ? 'realtime_admin'
      : (teacherRole === 'subject' ? 'subject_reports' : 'comprehensive')
  );

  React.useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab);
  }, [defaultTab]);
  React.useEffect(() => {
    const onHub = (e: Event) => {
      const sec = String((e as CustomEvent).detail || '');
      try { sessionStorage.removeItem(DATA_HUB_KEY); } catch (_) { /* ignore */ }
      setActiveTab('data');
      if (sec === 'newyear') { setDataHub('newyear'); return; }
      setDataHub('backup');
      const g = hubTargetToGroup(sec);
      if (g) {
        setHubOpen(prev => ({ ...prev, [g]: true }));
        setTimeout(() => document.getElementById(`hub-group-${g}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      }
    };
    window.addEventListener(DATA_HUB_EVENT, onHub);
    return () => window.removeEventListener(DATA_HUB_EVENT, onHub);
  }, []);

  // Multi-tier backup & restore states
  const [schoolsList, setSchoolsList] = useState<SchoolEntity[]>([]);
  const [selectedAdminScope, setSelectedAdminScope] = useState<'system' | 'school'>('system');
  const [selectedAdminSchool, setSelectedAdminSchool] = useState<string>('');
  const [isExportingData, setIsExportingData] = useState(false);
  const [dataExportToast, setDataExportToast] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<{
    file: File;
    scope: 'system' | 'school' | 'teacher';
    summary: {
      fileName: string;
      scopeText: string;
      schoolName?: string;
      totalClasses: number;
      totalStudents: number;
      totalTeachers: number;
      exportedAt?: string;
      exportedBy?: string;
    };
    rawJson: any;
  } | null>(null);
  const [isRestoringData, setIsRestoringData] = useState(false);

  React.useEffect(() => {
    const fetchSchools = async () => {
      try {
        const list = await databaseService.getSchools();
        if (Array.isArray(list) && list.length > 0) {
          setSchoolsList(list);
          if (!selectedAdminSchool) {
            setSelectedAdminSchool(list[0].name);
          }
        } else {
          setSchoolsList([]); // không tự chèn trường mẫu — danh sách trường chỉ lấy từ CSDL nhà trường
        }
      } catch (_) {
        setSchoolsList([]); // không tự chèn trường mẫu — danh sách trường chỉ lấy từ CSDL nhà trường
      }
    };
    fetchSchools();
  }, []);

  // Chart configuration
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [metricType, setMetricType] = useState<MetricType>('tier');
  const [hoveredDataIndex, setHoveredDataIndex] = useState<number | null>(null);

  // Table filters
  const [filterTier, setFilterTier] = useState<'all' | 'excellent' | 'good' | 'average' | 'needs_help'>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [searchStudent, setSearchStudent] = useState<string>('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImportLoading, setIsImportLoading] = useState(false);

  // In-app Modals for Reset and Clear Data (Replaces window.confirm)
  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);

  // Teacher Profile form state
  const defaultInitialName = teacherProfile.name || (isCurrentUserSuperAdmin ? 'Tài khoản quản trị Cao nhất' : (currentUser?.fullName || ''));
  const defaultInitialRole = teacherProfile.role || (isCurrentUserSuperAdmin ? 'TÀI KHOẢN QUẢN TRỊ CAO NHẤT' : 'GIÁO VIÊN CHỦ NHIỆM');
  const defaultInitialSchool = teacherProfile.schoolName || (isCurrentUserSuperAdmin ? 'Hệ thống Quản trị Lớp học Hạnh phúc' : (currentUser?.schoolName || ''));

  const [profileName, setProfileName] = useState(defaultInitialName);
  const [profileBirthDate, setProfileBirthDate] = useState(teacherProfile.birthDate || '');
  const [profileRole, setProfileRole] = useState(defaultInitialRole);
  const [profileSchool, setProfileSchool] = useState(defaultInitialSchool);
  const [profileAvatar, setProfileAvatar] = useState(teacherProfile.avatar || DEFAULT_TEACHER.avatar);
  const [profileOriginalAvatar, setProfileOriginalAvatar] = useState(teacherProfile.originalAvatar || teacherProfile.avatar || DEFAULT_TEACHER.avatar);
  const [profileAvatarScale, setProfileAvatarScale] = useState(teacherProfile.avatarScale || 1);
  const [profileAvatarPosition, setProfileAvatarPosition] = useState(teacherProfile.avatarPosition || { x: 0, y: 0 });
  const [pendingOriginalAvatar, setPendingOriginalAvatar] = useState<string | null>(null);
  const [profileAcademicYear, setProfileAcademicYear] = useState(teacherProfile.academicYear || '2026–2027');
  const [profilePhone, setProfilePhone] = useState(teacherProfile.phone || (currentUser?.phone || ''));
  const [profileZalo, setProfileZalo] = useState(teacherProfile.zalo || '');
  const [profileFacebook, setProfileFacebook] = useState(teacherProfile.facebook || (isCurrentUserSuperAdmin ? 'https://www.facebook.com/nguyenthanhliemautotech/' : ''));
  const [profileSocialLink, setProfileSocialLink] = useState(teacherProfile.socialLink || '');
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [isTeacherAvatarEditorOpen, setIsTeacherAvatarEditorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);

  // Selected class for Slogan and Parent Committee settings
  const [selectedSettingsClassId, setSelectedSettingsClassId] = useState<string>(activeClassId || (classes[0]?.id || ''));

  React.useEffect(() => {
    if (activeClassId && !selectedSettingsClassId) {
      setSelectedSettingsClassId(activeClassId);
    }
  }, [activeClassId]);

  const activeClass = classes.find(c => c.id === activeClassId);
  const currentSettingsClass = classes.find(c => c.id === selectedSettingsClassId) || activeClass || classes[0];

  // Parent committee & slogan states for selected class (Bỏ trống mặc định theo yêu cầu)
  const [classSlogan, setClassSlogan] = useState(currentSettingsClass?.slogan || '');
  const [parentHeadName, setParentHeadName] = useState(currentSettingsClass?.parentCommittee?.head?.name || '');
  const [parentHeadPhone, setParentHeadPhone] = useState(currentSettingsClass?.parentCommittee?.head?.phone || '');
  const [parentDeputyName, setParentDeputyName] = useState(currentSettingsClass?.parentCommittee?.deputy?.name || '');
  const [parentDeputyPhone, setParentDeputyPhone] = useState(currentSettingsClass?.parentCommittee?.deputy?.phone || '');
  const [parentMember1Name, setParentMember1Name] = useState(currentSettingsClass?.parentCommittee?.member1?.name || '');
  const [parentMember1Phone, setParentMember1Phone] = useState(currentSettingsClass?.parentCommittee?.member1?.phone || '');
  const [parentMember2Name, setParentMember2Name] = useState(currentSettingsClass?.parentCommittee?.member2?.name || '');
  const [parentMember2Phone, setParentMember2Phone] = useState(currentSettingsClass?.parentCommittee?.member2?.phone || '');
  const [parentSavedToast, setParentSavedToast] = useState(false);
  const [allSettingsSavedToast, setAllSettingsSavedToast] = useState(false);

  React.useEffect(() => {
    if (currentSettingsClass) {
      setClassSlogan(currentSettingsClass.slogan || '');
      setParentHeadName(currentSettingsClass.parentCommittee?.head?.name || '');
      setParentHeadPhone(currentSettingsClass.parentCommittee?.head?.phone || '');
      setParentDeputyName(currentSettingsClass.parentCommittee?.deputy?.name || '');
      setParentDeputyPhone(currentSettingsClass.parentCommittee?.deputy?.phone || '');
      setParentMember1Name(currentSettingsClass.parentCommittee?.member1?.name || '');
      setParentMember1Phone(currentSettingsClass.parentCommittee?.member1?.phone || '');
      setParentMember2Name(currentSettingsClass.parentCommittee?.member2?.name || '');
      setParentMember2Phone(currentSettingsClass.parentCommittee?.member2?.phone || '');

      // Tự động đồng bộ tên giáo viên và năm học nếu lớp học có thông tin mới (CHỈ DÀNH CHO GIÁO VIÊN, KHÔNG ĐÈ TÊN ADMIN)
      if (!isCurrentUserSuperAdmin && currentSettingsClass.teacherName && !isSubjectTeacher && currentSettingsClass.teacherName !== profileName) {
        setProfileName(currentSettingsClass.teacherName);
      }
      if (!isCurrentUserSuperAdmin && currentSettingsClass.academicYear && currentSettingsClass.academicYear !== profileAcademicYear) {
        setProfileAcademicYear(currentSettingsClass.academicYear);
      }
    }
  }, [selectedSettingsClassId, currentSettingsClass, classes, isCurrentUserSuperAdmin]);

  // Keep profile inputs in sync if teacherProfile from context changes
  React.useEffect(() => {
    if (teacherProfile) {
      const isSuper = currentUser?.username?.toLowerCase() === 'adminquantri' || currentUser?.role === 'admin';
      setProfileName(teacherProfile.name || (isSuper ? 'Tài khoản quản trị Cao nhất' : (currentUser?.fullName || '')));
      setProfileBirthDate(teacherProfile.birthDate || '');
      setProfileRole(teacherProfile.role || (isSuper ? 'TÀI KHOẢN QUẢN TRỊ CAO NHẤT' : 'GIÁO VIÊN CHỦ NHIỆM'));
      setProfileSchool(teacherProfile.schoolName || (isSuper ? 'Hệ thống Quản trị Lớp học Hạnh phúc' : (currentUser?.schoolName || '')));
      setProfileAvatar(teacherProfile.avatar || DEFAULT_TEACHER.avatar);
      setProfileOriginalAvatar(teacherProfile.originalAvatar || teacherProfile.avatar || DEFAULT_TEACHER.avatar);
      setProfileAvatarScale(teacherProfile.avatarScale || 1);
      setProfileAvatarPosition(teacherProfile.avatarPosition || { x: 0, y: 0 });
      setProfileAcademicYear(teacherProfile.academicYear || '2026–2027');
      setProfilePhone(teacherProfile.phone || (currentUser?.phone || ''));
      setProfileZalo(teacherProfile.zalo || '');
      setProfileFacebook(teacherProfile.facebook || (isSuper ? 'https://www.facebook.com/nguyenthanhliemautotech/' : ''));
      setProfileSocialLink(teacherProfile.socialLink || '');
    }
  }, [teacherProfile, currentUser]);

  // Save 1: Chỉ lưu Hồ sơ giáo viên
  const handleSaveProfile = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateTeacherProfile({
      name: profileName.trim(),
      birthDate: profileBirthDate.trim(),
      role: profileRole.trim(),
      schoolName: profileSchool.trim(),
      avatar: profileAvatar,
      originalAvatar: profileOriginalAvatar || profileAvatar,
      avatarScale: profileAvatarScale,
      avatarPosition: profileAvatarPosition,
      academicYear: profileAcademicYear.trim(),
      phone: profilePhone.trim(),
      zalo: profileZalo.trim(),
      facebook: profileFacebook.trim(),
      socialLink: profileSocialLink.trim()
    });

    // Thông tin đồng bộ sang lớp chủ nhiệm (chỉ cần nhập 1 lần là thông nhau)
    if (!isSubjectTeacher) {
      const targetCls = classes.find(c => c.id === selectedSettingsClassId) || activeClass || classes[0];
      if (targetCls) {
        updateClass(targetCls.id, {
          teacherName: profileName.trim(),
          academicYear: profileAcademicYear.trim()
        });
      }
    }

    setProfileSavedToast(true);
    confetti({ particleCount: 35, spread: 50 });
    setTimeout(() => setProfileSavedToast(false), 3000);
  };

  // Save 2: Chỉ lưu Khẩu hiệu & Ban đại diện cha mẹ học sinh
  const handleSaveParentCommittee = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEditParentCommittee || !canEditClassSlogan) {
      alert('Chỉ Giáo viên chủ nhiệm mới có quyền cấu hình Khẩu hiệu và Ban đại diện cha mẹ học sinh!');
      return;
    }
    const targetCls = classes.find(c => c.id === selectedSettingsClassId) || activeClass || classes[0];
    if (!targetCls) return;
    updateClass(targetCls.id, {
      slogan: classSlogan.trim(),
      parentCommittee: {
        head: { name: parentHeadName.trim(), phone: parentHeadPhone.trim(), roleTitle: 'Trưởng ban phụ huynh' },
        deputy: { name: parentDeputyName.trim(), phone: parentDeputyPhone.trim(), roleTitle: 'Phó ban phụ huynh' },
        member1: { name: parentMember1Name.trim(), phone: parentMember1Phone.trim(), roleTitle: 'Ủy viên ban phụ huynh 1' },
        member2: { name: parentMember2Name.trim(), phone: parentMember2Phone.trim(), roleTitle: 'Ủy viên ban phụ huynh 2' }
      }
    });
    setParentSavedToast(true);
    confetti({ particleCount: 35, spread: 50 });
    setTimeout(() => setParentSavedToast(false), 3000);
  };

  // Save 3: Lưu toàn bộ cài đặt một lần thuận tiện
  const handleSaveAllSettings = () => {
    // Lưu hồ sơ giáo viên
    updateTeacherProfile({
      name: profileName.trim(),
      birthDate: profileBirthDate.trim(),
      role: profileRole.trim(),
      schoolName: profileSchool.trim(),
      avatar: profileAvatar,
      originalAvatar: profileOriginalAvatar || profileAvatar,
      avatarScale: profileAvatarScale,
      avatarPosition: profileAvatarPosition,
      academicYear: profileAcademicYear.trim(),
      phone: profilePhone.trim(),
      zalo: profileZalo.trim(),
      facebook: profileFacebook.trim(),
      socialLink: profileSocialLink.trim()
    });

    // Lưu ban phụ huynh & slogan & tên GV (Chỉ áp dụng với Giáo viên chủ nhiệm có quyền)
    if (!isSubjectTeacher && canEditParentCommittee && canEditClassSlogan) {
      const targetCls = classes.find(c => c.id === selectedSettingsClassId) || activeClass || classes[0];
      if (targetCls) {
        updateClass(targetCls.id, {
          teacherName: profileName.trim(),
          academicYear: profileAcademicYear.trim(),
          slogan: classSlogan.trim(),
          parentCommittee: {
            head: { name: parentHeadName.trim(), phone: parentHeadPhone.trim(), roleTitle: 'Trưởng ban phụ huynh' },
            deputy: { name: parentDeputyName.trim(), phone: parentDeputyPhone.trim(), roleTitle: 'Phó ban phụ huynh' },
            member1: { name: parentMember1Name.trim(), phone: parentMember1Phone.trim(), roleTitle: 'Ủy viên ban phụ huynh 1' },
            member2: { name: parentMember2Name.trim(), phone: parentMember2Phone.trim(), roleTitle: 'Ủy viên ban phụ huynh 2' }
          }
        });
      }
      setParentSavedToast(true);
    }

    setAllSettingsSavedToast(true);
    setProfileSavedToast(true);
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => {
      setAllSettingsSavedToast(false);
      setProfileSavedToast(false);
      setParentSavedToast(false);
    }, 3500);
  };

  // Làm mới trắng để nhập thông tin mới
  const handleLoadDefaultSampleData = () => {
    if (isCurrentUserSuperAdmin) {
      setProfileName('Tài khoản quản trị Cao nhất');
      setProfileBirthDate('');
      setProfileRole('TÀI KHOẢN QUẢN TRỊ CAO NHẤT');
      setProfileSchool('Hệ thống Quản trị Lớp học Hạnh phúc');
      setProfileAvatar('https://api.dicebear.com/7.x/bottts/svg?seed=AdminQuanTriBoss&backgroundColor=d1d4f9');
      setProfileOriginalAvatar('https://api.dicebear.com/7.x/bottts/svg?seed=AdminQuanTriBoss&backgroundColor=d1d4f9');
      setProfileAvatarScale(1);
      setProfileAvatarPosition({ x: 0, y: 0 });
      setProfileAcademicYear('2026–2027');
      setProfilePhone('0888358363');
      setProfileZalo('0888358363');
      setProfileFacebook('https://www.facebook.com/nguyenthanhliemautotech/');
      setProfileSocialLink('https://zalo.me/0888358363');
      confetti({ particleCount: 20, spread: 40 });
      return;
    }

    setProfileName(currentUser?.fullName || '');
    setProfileBirthDate('');
    setProfileRole('GIÁO VIÊN CHỦ NHIỆM');
    setProfileSchool(currentUser?.schoolName || '');
    setProfileAvatar(DEFAULT_TEACHER.avatar);
    setProfileOriginalAvatar(DEFAULT_TEACHER.avatar);
    setProfileAvatarScale(1);
    setProfileAvatarPosition({ x: 0, y: 0 });
    setProfileAcademicYear('2026–2027');
    setProfilePhone(currentUser?.phone || '');
    setProfileZalo('');
    setProfileFacebook('');
    setProfileSocialLink('');

    setClassSlogan('');
    setParentHeadName('');
    setParentHeadPhone('');
    setParentDeputyName('');
    setParentDeputyPhone('');
    setParentMember1Name('');
    setParentMember1Phone('');
    setParentMember2Name('');
    setParentMember2Phone('');

    confetti({ particleCount: 30, spread: 50 });
  };

    // Calculations for stats
    const totalCoins = currentClassStudents.reduce((acc, s) => acc + s.points, 0);
    const avgCoins = currentClassStudents.length > 0 ? (totalCoins / currentClassStudents.length).toFixed(1) : '0';

    // Tier breakdown
    const excellentStudents = currentClassStudents.filter(s => s.points >= 30);
    const goodStudents = currentClassStudents.filter(s => s.points >= 15 && s.points < 30);
    const averageStudents = currentClassStudents.filter(s => s.points > 0 && s.points < 15);
    const lowCoinStudents = currentClassStudents.filter(s => s.points <= 0);

    // Group breakdown
    const groupsList = ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'];
    const groupStats = groupsList.map(g => {
      const mems = currentClassStudents.filter(s => (s.group || 'Tổ 1') === g);
      const sumPoints = mems.reduce((a, b) => a + b.points, 0);
      const avg = mems.length > 0 ? Math.round((sumPoints / mems.length) * 10) / 10 : 0;
      return { name: g, count: mems.length, total: sumPoints, avg };
    });

    // Subject breakdown
    const classTransactions = transactions.filter(t => t.classId === activeClassId);
    const subjectPointsMap: Record<string, { positive: number; negative: number; count: number }> = {};
    subjects.forEach(sub => {
      subjectPointsMap[sub.name] = { positive: 0, negative: 0, count: 0 };
    });
    classTransactions.forEach(tx => {
      const sName = tx.subjectName || 'Chung';
      if (!subjectPointsMap[sName]) {
        subjectPointsMap[sName] = { positive: 0, negative: 0, count: 0 };
      }
      subjectPointsMap[sName].count += 1;
      if (tx.amount > 0) {
        subjectPointsMap[sName].positive += tx.amount;
      } else {
        subjectPointsMap[sName].negative += Math.abs(tx.amount);
      }
    });

    const subjectData = Object.entries(subjectPointsMap)
      .map(([name, data]) => ({ name, value: data.positive, count: data.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);

    // Top 10 students
    const top10Students = [...currentClassStudents]
      .sort((a, b) => b.points - a.points)
      .slice(0, 10)
      .map(s => ({ name: s.name, value: s.points, stt: s.stt }));

    // Dynamic Chart Datasets based on selected metric
    const getChartData = () => {
      switch (metricType) {
        case 'tier':
          return [
            { label: 'Xuất sắc (≥30 xu)', value: excellentStudents.length, color: '#F59E0B', sub: `${excellentStudents.length} em` },
            { label: 'Tích cực (15-29 xu)', value: goodStudents.length, color: '#10B981', sub: `${goodStudents.length} em` },
            { label: 'Cần phát huy (1-14 xu)', value: averageStudents.length, color: '#3B82F6', sub: `${averageStudents.length} em` },
            { label: 'Cần rèn luyện (≤0 xu)', value: lowCoinStudents.length, color: '#EF4444', sub: `${lowCoinStudents.length} em` },
          ];
        case 'group':
          return groupStats.map((g, idx) => {
            const colors = ['#6366F1', '#EC4899', '#06B6D4', '#F59E0B'];
            return { label: g.name, value: g.total, color: colors[idx % colors.length], sub: `TB: ${g.avg} xu (${g.count} em)` };
          });
        case 'subjects':
          const subColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];
          return subjectData.map((s, idx) => ({
            label: s.name,
            value: s.value,
            color: subColors[idx % subColors.length],
            sub: `${s.count} lượt khen`
          }));
        case 'top_students':
          const topColors = ['#F59E0B', '#EAB308', '#F97316', '#6366F1', '#3B82F6', '#06B6D4', '#10B981', '#14B8A6', '#8B5CF6', '#A855F7'];
          return top10Students.map((s, idx) => ({
            label: `#${s.stt} ${s.name}`,
            value: s.value,
            color: topColors[idx % topColors.length],
            sub: `${s.value} xu thi đua`
          }));
      }
    };

    const chartData = getChartData();
    const totalChartValue = chartData.reduce((a, b) => a + b.value, 0);
    const maxChartValue = Math.max(...chartData.map(d => d.value), 1);

    // Filtered students for Leaderboard
    const filteredStudents = currentClassStudents
      .filter(s => {
        const matchSearch = s.name.toLowerCase().includes(searchStudent.toLowerCase()) || s.stt.toString().includes(searchStudent);
        if (!matchSearch) return false;
        if (filterGroup !== 'all' && (s.group || 'Tổ 1') !== filterGroup) return false;
        if (filterTier === 'excellent') return s.points >= 30;
        if (filterTier === 'good') return s.points >= 15 && s.points < 30;
        if (filterTier === 'average') return s.points > 0 && s.points < 15;
        if (filterTier === 'needs_help') return s.points <= 0;
        return true;
      })
      .sort((a, b) => b.points - a.points);

    // Export full report CSV for Zalo/Parents
    const handleExportReportCSV = () => {
      let csv = '\uFEFF'; // UTF-8 BOM for Excel
      csv += 'STT,Họ và tên,Ngày sinh,Giới tính,Tổ,Số xu thi đua,Xếp loại thi đua,Khuyến nghị giáo viên\n';

      currentClassStudents.forEach(st => {
        const evaluation = st.points >= 30 ? 'Xuất sắc' : st.points >= 15 ? 'Tích cực' : st.points > 0 ? 'Cần phát huy' : 'Cần rèn luyện thêm';
        const advice = st.points >= 30
          ? 'Phát huy tinh thần gương mẫu dẫn đầu'
          : st.points >= 15
            ? 'Hăng hái, chăm ngoan'
            : st.points > 0
              ? 'Cần tự tin phát biểu nhiều hơn'
              : 'Cần giáo viên và gia đình khích lệ tích cực';

        csv += `${st.stt},"${st.name}","${st.birthDate || ''}","${st.gender}","${st.group || 'Chưa chia'}","${st.points}","${evaluation}","${advice}"\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bao_Cao_Thi_Dua_${activeClass?.name || 'Lop'}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const handleExportMultiTier = async (format: 'json' | 'zip') => {
      setIsExportingData(true);
      try {
        if (isCurrentUserSuperAdmin) {
          if (selectedAdminScope === 'system') {
            const res = await multiTierBackupService.exportSystemBackup(currentUser!, format);
            if (res.success) {
              confetti({ particleCount: 35, spread: 60 });
              setDataExportToast('Đã tải về sao lưu toàn bộ hệ thống (.json / .zip) an toàn!');
            } else {
              setDataExportToast(res.message);
            }
          } else {
            const res = await multiTierBackupService.exportSchoolBackup(selectedAdminSchool, currentUser!, format);
            if (res.success) {
              confetti({ particleCount: 35, spread: 60 });
              setDataExportToast(`Đã tải về sao lưu trường ${selectedAdminSchool} an toàn!`);
            } else {
              setDataExportToast(res.message);
            }
          }
        } else if (isSchoolAdminAccount) {
          const schoolName = currentUser?.schoolName || 'TRƯỜNG HỌC';
          const res = await multiTierBackupService.exportSchoolBackup(schoolName, currentUser!, format);
          if (res.success) {
            confetti({ particleCount: 35, spread: 60 });
            setDataExportToast(`Đã tải về sao lưu toàn bộ cơ sở dữ liệu ${schoolName} an toàn!`);
          } else {
            setDataExportToast(res.message);
          }
        } else {
          // Giáo viên phụ trách
          await multiTierBackupService.exportTeacherBackup(currentUser!, getCurrentUserData(), format);
          confetti({ particleCount: 25, spread: 45 });
          setDataExportToast('Đã tải về sao lưu dữ liệu tài khoản cá nhân thành công!');
        }
      } catch (err: any) {
        setDataExportToast('Lỗi khi xuất sao lưu: ' + err?.message);
      } finally {
        setIsExportingData(false);
        setTimeout(() => setDataExportToast(null), 4000);
      }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setIsImportLoading(true);
        try {
          const parsed = await multiTierBackupService.parseBackupFile(file);
          if (!parsed.success || !parsed.rawJson) {
            setImportStatus(parsed.message || 'Lỗi: Tệp tin không hợp lệ.');
            setTimeout(() => setImportStatus(null), 4000);
            setIsImportLoading(false);
            e.target.value = '';
            return;
          }
          // Mở modal xem trước kiểm tra phân quyền & số lượng trước khi khôi phục
          setRestorePreview({
            file,
            scope: parsed.scope,
            summary: parsed.summary,
            rawJson: parsed.rawJson
          });
        } catch (err: any) {
          setImportStatus('Lỗi khi đọc file sao lưu: ' + err?.message);
          setTimeout(() => setImportStatus(null), 4000);
        } finally {
          setIsImportLoading(false);
          e.target.value = '';
        }
      }
    };

    const handleConfirmRestore = async () => {
      if (!restorePreview) return;
      setIsRestoringData(true);
      try {
        const { scope, rawJson, summary } = restorePreview;

        if (isCurrentUserSuperAdmin && (scope === 'system' || selectedAdminScope === 'system')) {
          // 1. Phục hồi toàn bộ hệ thống
          const res = await multiTierBackupService.restoreSystemBackup(rawJson);
          if (res.success) {
            confetti({ particleCount: 70, spread: 80 });
            setImportStatus(res.message);
            setTimeout(() => window.location.reload(), 1500);
          } else {
            setImportStatus('Lỗi: ' + res.message);
          }
        } else if (isSchoolAdminAccount || (isCurrentUserSuperAdmin && selectedAdminScope === 'school')) {
          // 2. Phục hồi toàn bộ dữ liệu nhà trường
          const targetSchool = isCurrentUserSuperAdmin ? selectedAdminSchool : (currentUser?.schoolName || summary.schoolName || 'TRƯỜNG HỌC');
          const res = await multiTierBackupService.restoreSchoolBackup(rawJson, targetSchool);
          if (res.success) {
            confetti({ particleCount: 70, spread: 80 });
            setImportStatus(res.message);
            setTimeout(() => window.location.reload(), 1500);
          } else {
            setImportStatus('Lỗi: ' + res.message);
          }
        } else {
          // 3. Phục hồi tài khoản giáo viên
          const ok = await importBackupJson(restorePreview.file);
          if (ok) {
            confetti({ particleCount: 50, spread: 60 });
            setImportStatus(`Khôi phục thành công dữ liệu tài khoản ${currentUser?.fullName}!`);
          } else {
            setImportStatus('Không thể khôi phục dữ liệu tài khoản.');
          }
        }
      } catch (err: any) {
        setImportStatus('Lỗi trong quá trình khôi phục: ' + err?.message);
      } finally {
        setIsRestoringData(false);
        setRestorePreview(null);
        setTimeout(() => setImportStatus(null), 4500);
      }
    };

    const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          // Đọc toàn bộ ảnh gốc từ máy tính (giữ trọn vẹn 100% tỷ lệ, KHÔNG tự động cắt xén trước)
          const fullUncroppedBase64 = await compressImage(file, 1600, 1600, 0.92);
          if (fullUncroppedBase64) {
            setPendingOriginalAvatar(fullUncroppedBase64);
            // Mở modal thu phóng để giáo viên căn chỉnh trực tiếp. Chỉ khi bấm xác nhận mới thực hiện crop
            setIsTeacherAvatarEditorOpen(true);
          }
        } catch (err) {
          console.error('Lỗi khi đọc ảnh giáo viên:', err);
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (ev.target?.result) {
              setPendingOriginalAvatar(ev.target.result as string);
              setIsTeacherAvatarEditorOpen(true);
            }
          };
          reader.readAsDataURL(file);
        } finally {
          e.target.value = '';
        }
      }
    };

    return (
      <div className="p-3 md:p-4 max-w-7xl mx-auto space-y-4">
        {/* Thanh đầu trang gọn (1 dòng): thẻ Thống kê hiện luôn bộ chọn loại báo cáo, số liệu nằm ngay bên dưới */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 px-3 py-2 shadow-xs flex flex-wrap items-center justify-between gap-2">
          {activeTab === 'stats' ? (
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200" role="tablist" aria-label="Loại báo cáo">
              {([
                ['realtime_admin', 'Báo cáo toàn trường', ShieldCheck],
                ...(teacherRole === 'subject' ? [['subject_reports', `Báo cáo bộ môn (${classes.length} lớp)`, Trophy]] : []),
                ['comprehensive', 'Thống kê trực quan', BarChart3],
                ['coins', 'Thi đua & xu', Award],
              ] as Array<[typeof statsSubMode, string, React.ComponentType<{ className?: string }>]>).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={statsSubMode === id}
                  onClick={() => setStatsSubMode(id)}
                  className={`no-hover-fx h-9 px-3 rounded-lg text-sm font-bold whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${statsSubMode === id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-700 hover:text-slate-900'}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black shadow-2xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black text-slate-900 tracking-tight">
                {activeTab === 'data' && `Dữ Liệu${isSchoolAdminAccount && currentUser?.schoolName ? ` • ${currentUser.schoolName}` : ''}`}
                {activeTab === 'profile' && 'Cài Đặt Hồ Sơ Giáo Viên & Thông Tin Hệ Thống'}
              </h2>
              <p className="text-xs text-slate-500">
                {activeTab === 'data' && 'Sao lưu, khôi phục, Google Drive của trường, lưu trên máy tính và năm học mới — tất cả ở một trang.'}
                {activeTab === 'profile' && 'Cập nhật tên giáo viên, đơn vị công tác, năm học, số điện thoại và Zalo hỗ trợ.'}
              </p>
            </div>
          </div>
          )}

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200" role="tablist" aria-label="Nội dung">
            {([
              ['stats', 'Thống kê', BarChart3],
              ['data', 'Dữ liệu', Download],
              ['profile', 'Cài đặt', User],
            ] as Array<[typeof activeTab, string, React.ComponentType<{ className?: string }>]>).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`no-hover-fx h-9 px-3 rounded-lg text-sm font-bold whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${activeTab === id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-700 hover:text-slate-900'}`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {importStatus && (
          <div className={`p-4 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in duration-150 shadow-xs border ${importStatus.includes('Lỗi')
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}>
            {importStatus.includes('Lỗi') ? <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" /> : <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
            <span className="font-bold">{importStatus}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: THỐNG KÊ (User request 6 & New Comprehensive Dashboard) */}
        {/* ========================================================================= */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            {statsSubMode === 'realtime_admin' ? (
              <AdminRealtimeDashboardView />
            ) : statsSubMode === 'subject_reports' ? (
              <SubjectTeacherReportsView />
            ) : statsSubMode === 'comprehensive' ? (
              <ComprehensiveStatisticsView />
            ) : (
              <>
                {/* 4 Quick KPI Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover-zoom-card relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">TỔNG XU TÍCH LŨY</span>
                      <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shadow-2xs">
                        <Award className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-3xl font-black font-mono text-amber-700 mt-2">
                      {totalCoins} <span className="text-xs font-bold text-slate-400 uppercase">xu</span>
                    </div>
                    <div className="text-[12px] text-slate-500 mt-1 flex items-center gap-1 font-bold uppercase">
                      <span className="text-emerald-700 font-bold">● {classTransactions.length}</span> LƯỢT KHEN THƯỞNG & RÈN LUYỆN
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover-zoom-card relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">ĐIỂM TRUNG BÌNH</span>
                      <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-3xl font-black font-mono text-blue-600 mt-2">
                      {avgCoins} <span className="text-xs font-bold text-slate-400 uppercase">xu/em</span>
                    </div>
                    <div className="text-[12px] text-slate-500 mt-1 uppercase font-bold">
                      SĨ SỐ LỚP: <strong className="text-slate-800 font-black">{currentClassStudents.length} HỌC SINH</strong>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover-zoom-card relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">HỌC SINH XUẤT SẮC</span>
                      <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shadow-2xs">
                        <Star className="w-4 h-4 text-emerald-600 fill-emerald-500" />
                      </div>
                    </div>
                    <div className="text-3xl font-black font-mono text-emerald-700 mt-2">
                      {excellentStudents.length} <span className="text-xs font-bold text-slate-400 uppercase">em (≥30 xu)</span>
                    </div>
                    <div className="text-[12px] text-slate-500 mt-1 uppercase font-bold">
                      TỶ LỆ: <strong className="text-emerald-700 font-black">{currentClassStudents.length > 0 ? Math.round((excellentStudents.length / currentClassStudents.length) * 100) : 0}%</strong> SĨ SỐ CẢ LỚP
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover-zoom-card relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">CẦN KHÍCH LỆ THÊM</span>
                      <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-2xs">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-3xl font-black font-mono text-rose-600 mt-2">
                      {lowCoinStudents.length} <span className="text-xs font-bold text-slate-400 uppercase">em (≤0 xu)</span>
                    </div>
                    <div className="text-[12px] text-rose-600 mt-1 font-black uppercase">
                      CẦN GIÁO VIÊN TẠO CƠ HỘI PHÁT BIỂU
                    </div>
                  </div>
                </div>

                {/* MAIN DYNAMIC CHART CARD WITH VIEW SELECTORS (User Request 6) */}
                <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs space-y-6 hover-zoom-card">
                  {/* Chart Toolbar: Metric Selector & Chart Type Selector */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <h3 className="text-sm md:text-base font-black text-slate-900 uppercase">
                          BIỂU ĐỒ TỔNG QUAN & PHÂN TÍCH ĐA CHIỀU LỚP {activeClass?.name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500">
                        Lựa chọn thông tin phân tích và chuyển đổi linh hoạt giữa biểu đồ tròn, biểu đồ cột hoặc biểu đồ đường.
                      </p>
                    </div>

                    {/* Selectors */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* 1. Metric Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">Thông tin:</span>
                        <select
                          value={metricType}
                          onChange={(e) => setMetricType(e.target.value as MetricType)}
                          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 hover-zoom-btn"
                        >
                          <option value="tier">🏆 Phân bố Xếp loại Thi đua</option>
                          <option value="group">👥 Điểm tích lũy theo từng Tổ</option>
                          <option value="subjects">📚 Khen thưởng theo Môn học</option>
                          <option value="top_students">⭐ Top 10 Học sinh dẫn đầu</option>
                        </select>
                      </div>

                      {/* 2. Chart Type Selector (Bar, Pie/Donut, Line) */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button
                          onClick={() => setChartType('bar')}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover-zoom-btn ${chartType === 'bar' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          title="Biểu đồ cột hiện đại"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>Cột</span>
                        </button>

                        <button
                          onClick={() => setChartType('pie')}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover-zoom-btn ${chartType === 'pie' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          title="Biểu đồ tròn / Donut sinh động"
                        >
                          <PieChart className="w-3.5 h-3.5" />
                          <span>Tròn</span>
                        </button>

                        <button
                          onClick={() => setChartType('line')}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover-zoom-btn ${chartType === 'line' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          title="Biểu đồ đường xu hướng"
                        >
                          <LineChart className="w-3.5 h-3.5" />
                          <span>Đường</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CHART DISPLAY AREA */}
                  <div className="min-h-[300px] flex flex-col justify-center">
                    {/* --- MODE 1: BAR CHART --- */}
                    {chartType === 'bar' && (
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {chartData.map((item, idx) => {
                            const percent = totalChartValue > 0 ? Math.round((item.value / totalChartValue) * 100) : 0;
                            const barPercent = Math.max(8, Math.round((item.value / maxChartValue) * 100));
                            const isHovered = hoveredDataIndex === idx;

                            return (
                              <div
                                key={idx}
                                onMouseEnter={() => setHoveredDataIndex(idx)}
                                onMouseLeave={() => setHoveredDataIndex(null)}
                                className={`p-4 rounded-2xl border transition-all duration-200 hover-zoom-interactive ${isHovered
                                    ? 'bg-slate-50 border-indigo-300 shadow-sm scale-102'
                                    : 'bg-white border-slate-100'
                                  }`}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    <span className="text-xs font-bold text-slate-800 truncate">
                                      {item.label}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-sm font-black text-slate-900 font-mono">
                                      {item.value}
                                    </span>
                                    <span className="text-[12px] text-slate-400 font-bold ml-1">
                                      ({percent}%)
                                    </span>
                                  </div>
                                </div>

                                {/* Bar Graphic with 3D gradient look */}
                                <div className="h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 shadow-inner">
                                  <div
                                    className="h-full rounded-full transition-all duration-500 shadow-xs"
                                    style={{
                                      width: `${barPercent}%`,
                                      backgroundColor: item.color
                                    }}
                                  />
                                </div>

                                <div className="flex items-center justify-between text-[12px] text-slate-500 mt-1.5 font-medium">
                                  <span>{item.sub}</span>
                                  <span className="font-semibold text-slate-600">{percent}% tổng thể</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* --- MODE 2: PIE / DONUT CHART --- */}
                    {chartType === 'pie' && (
                      <div className="flex flex-col md:flex-row items-center justify-center gap-8 py-4">
                        {/* SVG Donut Chart */}
                        <div className="relative w-64 h-64 shrink-0 flex items-center justify-center hover-zoom-interactive">
                          <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                            {chartData.map((item, idx) => {
                              let accumulated = 0;
                              for (let i = 0; i < idx; i++) {
                                accumulated += chartData[i].value;
                              }
                              const startRatio = totalChartValue > 0 ? accumulated / totalChartValue : 0;
                              const valueRatio = totalChartValue > 0 ? item.value / totalChartValue : 0;
                              const strokeDasharray = `${valueRatio * 283} ${283 - valueRatio * 283}`;
                              const strokeDashoffset = `${-startRatio * 283}`;

                              return (
                                <circle
                                  key={idx}
                                  cx="50"
                                  cy="50"
                                  r="42"
                                  fill="transparent"
                                  stroke={item.color}
                                  strokeWidth={hoveredDataIndex === idx ? "15" : "12"}
                                  strokeDasharray={strokeDasharray}
                                  strokeDashoffset={strokeDashoffset}
                                  className="transition-all duration-300 cursor-pointer"
                                  onMouseEnter={() => setHoveredDataIndex(idx)}
                                  onMouseLeave={() => setHoveredDataIndex(null)}
                                />
                              );
                            })}
                          </svg>

                          {/* Donut Center Display */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            {hoveredDataIndex !== null && chartData[hoveredDataIndex] ? (
                              <>
                                <div className="text-[12px] font-black uppercase text-slate-400">
                                  {chartData[hoveredDataIndex].label}
                                </div>
                                <div className="text-2xl font-black text-slate-900 font-mono">
                                  {chartData[hoveredDataIndex].value}
                                </div>
                                <div className="text-[12px] font-bold text-indigo-600">
                                  {totalChartValue > 0 ? Math.round((chartData[hoveredDataIndex].value / totalChartValue) * 100) : 0}%
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="text-[12px] font-black uppercase text-slate-400 tracking-wider">
                                  TỔNG CỘNG
                                </div>
                                <div className="text-3xl font-black text-slate-900 font-mono">
                                  {totalChartValue}
                                </div>
                                <div className="text-[12px] font-semibold text-slate-500">
                                  {currentClassStudents.length} học sinh
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Legend List */}
                        <div className="flex-1 max-w-md space-y-2.5">
                          {chartData.map((item, idx) => {
                            const percent = totalChartValue > 0 ? Math.round((item.value / totalChartValue) * 100) : 0;
                            const isHovered = hoveredDataIndex === idx;

                            return (
                              <div
                                key={idx}
                                onMouseEnter={() => setHoveredDataIndex(idx)}
                                onMouseLeave={() => setHoveredDataIndex(null)}
                                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer hover-zoom-btn ${isHovered
                                    ? 'bg-slate-50 border-indigo-300 shadow-xs'
                                    : 'bg-white border-slate-100 hover:border-slate-200'
                                  }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span
                                    className="w-3.5 h-3.5 rounded-md shrink-0 shadow-2xs"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  <div className="truncate">
                                    <span className="text-xs font-bold text-slate-800 truncate block">
                                      {item.label}
                                    </span>
                                    <span className="text-[12px] text-slate-400 font-medium">
                                      {item.sub}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0 ml-3">
                                  <span className="text-xs font-black text-slate-900 font-mono">
                                    {item.value}
                                  </span>
                                  <span className="text-[12px] text-slate-500 font-bold ml-1">
                                    ({percent}%)
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* --- MODE 3: LINE / AREA CHART --- */}
                    {chartType === 'line' && (
                      <div className="py-4 space-y-4">
                        <div className="h-64 relative bg-slate-50/60 rounded-2xl p-4 border border-slate-100 flex flex-col justify-end">
                          {/* SVG Curve */}
                          <svg viewBox="0 0 500 200" className="w-full h-48 overflow-visible">
                            <defs>
                              <linearGradient id="lineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#6366F1" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Grid Lines */}
                            <line x1="0" y1="50" x2="500" y2="50" stroke="#E2E8F0" strokeDasharray="3 3" />
                            <line x1="0" y1="100" x2="500" y2="100" stroke="#E2E8F0" strokeDasharray="3 3" />
                            <line x1="0" y1="150" x2="500" y2="150" stroke="#E2E8F0" strokeDasharray="3 3" />

                            {/* Line Points calculation */}
                            {(() => {
                              const stepX = 500 / Math.max(chartData.length - 1, 1);
                              const points = chartData.map((d, i) => {
                                const x = i * stepX;
                                const y = 180 - (d.value / maxChartValue) * 140;
                                return { x, y, ...d };
                              });

                              const pathD = points.reduce((acc, p, i) => {
                                return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                              }, '');

                              const areaD = `${pathD} L ${points[points.length - 1].x} 190 L 0 190 Z`;

                              return (
                                <>
                                  <path d={areaD} fill="url(#lineGrad)" />
                                  <path d={pathD} fill="none" stroke="#6366F1" strokeWidth="3.5" strokeLinecap="round" />
                                  {points.map((p, i) => (
                                    <g
                                      key={i}
                                      className="cursor-pointer group"
                                      onMouseEnter={() => setHoveredDataIndex(i)}
                                      onMouseLeave={() => setHoveredDataIndex(null)}
                                    >
                                      <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r={hoveredDataIndex === i ? "7" : "5"}
                                        fill="#FFFFFF"
                                        stroke={p.color}
                                        strokeWidth="3"
                                        className="transition-all duration-200"
                                      />
                                      <text
                                        x={p.x}
                                        y={p.y - 12}
                                        textAnchor="middle"
                                        className="text-[12px] font-mono font-bold fill-slate-700"
                                      >
                                        {p.value}
                                      </text>
                                    </g>
                                  ))}
                                </>
                              );
                            })()}
                          </svg>

                          {/* X-axis labels */}
                          <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-[12px] font-bold text-slate-500 overflow-x-auto">
                            {chartData.map((d, i) => (
                              <div key={i} className="text-center truncate px-1">
                                <span className={hoveredDataIndex === i ? 'text-indigo-600 font-extrabold' : ''}>
                                  {d.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Table Leaderboard & Export CSV */}
                <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4 hover-zoom-card">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-800 uppercase">BẢNG XẾP HẠNG THI ĐUA & BÁO CÁO HỌC SINH</h3>
                      <p className="text-xs text-slate-500 mt-0.5 uppercase">TÌM KIẾM THEO TÊN, LỌC THEO TỔ HOẶC MỨC THI ĐUA</p>
                    </div>

                    <button
                      onClick={handleExportReportCSV}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-2xl transition-all hover-zoom-btn shrink-0 uppercase"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>XUẤT FILE BÁO CÁO EXCEL/CSV</span>
                    </button>
                  </div>

                  {/* Filter controls */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Tìm học sinh theo tên hoặc STT..."
                        value={searchStudent}
                        onChange={(e) => setSearchStudent(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <select
                      value={filterGroup}
                      onChange={(e) => setFilterGroup(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="all">Tất cả các Tổ</option>
                      <option value="Tổ 1">Tổ 1</option>
                      <option value="Tổ 2">Tổ 2</option>
                      <option value="Tổ 3">Tổ 3</option>
                      <option value="Tổ 4">Tổ 4</option>
                    </select>

                    <select
                      value={filterTier}
                      onChange={(e) => setFilterTier(e.target.value as any)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="all">Tất cả xếp loại</option>
                      <option value="excellent">Xuất sắc (≥30 xu)</option>
                      <option value="good">Tích cực (15-29 xu)</option>
                      <option value="average">Cần phát huy (1-14 xu)</option>
                      <option value="needs_help">Cần rèn luyện (≤0 xu)</option>
                    </select>
                  </div>

                  {/* Student List Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                    {filteredStudents.map((st, idx) => (
                      <div
                        key={st.id}
                        className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl flex items-center justify-between hover-zoom-interactive"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black shrink-0 ${idx === 0 ? 'bg-amber-400 text-amber-950 shadow-xs' :
                              idx === 1 ? 'bg-slate-300 text-slate-900 shadow-xs' :
                                idx === 2 ? 'bg-amber-700 text-white shadow-xs' :
                                  'bg-slate-200 text-slate-700'
                            }`}>
                            {idx + 1}
                          </span>
                          <img
                            src={st.avatar}
                            alt={st.name}
                            className="w-9 h-9 rounded-xl object-cover bg-white border border-slate-200 shrink-0"
                          />
                          <div className="truncate">
                            <div className="text-xs font-black text-slate-900 truncate">{st.name}</div>
                            <div className="text-[12px] text-slate-500 font-medium">STT {st.stt} · {st.group || 'Tổ 1'}</div>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-mono font-black text-xs rounded-lg shrink-0 ml-2 inline-flex items-center gap-1">
                          <Coins className="w-3 h-3 text-amber-900 fill-amber-500 shrink-0" />
                          <span>{st.points} xu</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DỮ LIỆU PHÂN CẤP ĐA TẦNG (GIÁO VIÊN • NHÀ TRƯỜNG • TOÀN HỆ THỐNG) */}
        {/* ========================================================================= */}
        {activeTab === 'data' && (
          <div className="space-y-3">
            {/* THÔNG BÁO TOAST KHI SAO LƯU HOẶC KHÔI PHỤC THÀNH CÔNG / THẤT BẠI */}
            {dataExportToast && (
              <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900 font-bold text-xs flex items-center justify-between shadow-md animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{dataExportToast}</span>
                </div>
                <button
                  onClick={() => setDataExportToast(null)}
                  className="text-emerald-700 hover:text-emerald-900 font-black text-xs uppercase px-2 py-1"
                >
                  ✕ Đóng
                </button>
              </div>
            )}

            {importStatus && (
              <div className={`p-4 rounded-2xl border-2 font-bold text-xs flex items-center justify-between shadow-md animate-fadeIn ${
                importStatus.includes('thành công')
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}>
                <div className="flex items-center gap-2">
                  {importStatus.includes('thành công') ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  )}
                  <span>{importStatus}</span>
                </div>
                <button
                  onClick={() => setImportStatus(null)}
                  className="font-black text-xs uppercase px-2 py-1 hover:opacity-80"
                >
                  ✕ Đóng
                </button>
              </div>
            )}

            {/* Banner Trial Mode trên View Dữ Liệu (Ảnh 3 & 8) */}
            {!isCdKeyActivated && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-700 via-orange-700 to-amber-700 text-white flex items-center justify-between shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2.5 text-xs font-bold truncate">
                  <span className="text-lg">⚠️</span>
                  <span className="truncate">
                    Bản Dùng Thử: Giới hạn tối đa 01 lớp và 10 học sinh/lớp. Vui lòng nhập CDKEY bản quyền để mở khóa Full!
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCdKeyModalOpen(true)}
                  className="px-3.5 py-1 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-amber-950 font-black text-xs uppercase shadow-xs shrink-0 cursor-pointer ml-3 transition-transform active:scale-95"
                >
                  NHẬP CDKEY BẢN FULL
                </button>
              </div>
            )}

            {/* TRANG DỮ LIỆU: 2 thẻ. Thẻ "Sao lưu & khôi phục" gom cả Google Drive, lưu trên máy, dung lượng — mỗi nhóm một dòng, bấm để mở */}
            <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex gap-1 overflow-x-auto" role="tablist" aria-label="Các phần của trang Dữ liệu">
              {DATA_HUB_SECTIONS.map(sec => {
                const Icon = sec.icon;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    role="tab"
                    aria-selected={dataHub === sec.id}
                    onClick={() => setDataHub(sec.id)}
                    title={sec.hint}
                    className={`no-hover-fx flex-1 min-w-fit px-3 py-2 rounded-xl text-sm font-black whitespace-nowrap inline-flex items-center justify-center gap-1.5 cursor-pointer ${dataHub === sec.id ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{sec.label}</span>
                  </button>
                );
              })}
            </div>

            {dataHub === 'backup' && (
              <div className="space-y-3">
                <HubGroup
                  id="hub-group-backup"
                  open={hubOpen.backup}
                  onToggle={() => toggleHub('backup')}
                  icon={HubArchive}
                  title="Sao lưu, khôi phục & lưu trên máy tính"
                  hint={canManageAccounts ? 'Tải bản sao lưu toàn hệ thống, khôi phục từ tệp, tệp riêng của tài khoản, thư mục tự lưu trên máy' : 'Tải bản sao lưu của tài khoản, khôi phục từ tệp, thư mục tự lưu trên máy'}
                >
                  {canManageAccounts ? (
                    <React.Suspense fallback={<p className="text-sm font-semibold text-slate-600 px-1">Đang mở phần sao lưu…</p>}>
                      <HubAccountData
                        embeddedDatabase
                        embeddedPart="backup"
                        isOpen
                        onClose={() => {}}
                        currentUser={currentUser}
                        allUsers={allUsers}
                        onRefreshUsers={refreshUsersList}
                        onSwitchToUser={hubSwitchToUser}
                        embeddedExtra={<DataStorageLocationModal embedded parts="file" isOpen onClose={() => {}} />}
                      />
                    </React.Suspense>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                    {/* Card 1: Backup Download (.JSON & .ZIP) theo phân cấp */}
                    <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-6 shadow-xs flex flex-col justify-between space-y-4 sm:space-y-5 hover-zoom-card">
                      <div className="space-y-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                          <Download className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                          {isCurrentUserSuperAdmin
                            ? (selectedAdminScope === 'system' ? 'TẢI SAO LƯU TOÀN HỆ THỐNG' : `TẢI SAO LƯU TRƯỜNG: ${selectedAdminSchool}`)
                            : (isSchoolAdminAccount ? 'TẢI SAO LƯU TOÀN BỘ NHÀ TRƯỜNG' : 'TẢI VỀ SAO LƯU TÀI KHOẢN')
                          }
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {isCurrentUserSuperAdmin
                            ? (selectedAdminScope === 'system'
                                ? 'Đóng gói toàn bộ cơ sở dữ liệu hệ thống (tất cả các trường, tài khoản người dùng, lớp học, điểm số) về máy an toàn.'
                                : `Đóng gói toàn bộ cơ sở dữ liệu của ${selectedAdminSchool} (các lớp GVCN, học sinh, điểm số và tài khoản trường).`
                              )
                            : (isSchoolAdminAccount
                                ? `Đóng gói toàn bộ cơ sở dữ liệu của nhà trường (66 lớp GVCN, 103 học sinh, điểm số, chuyên cần và tài khoản giáo viên).`
                                : 'Đóng gói cơ sở dữ liệu học sinh, danh sách lớp, điểm số và thời khóa biểu của tài khoản bạn đang phụ trách.'
                              )
                          }
                        </p>
                      </div>

                      <div className="space-y-2 sm:space-y-2.5">
                        {/* Option 1: .JSON */}
                        <button
                          onClick={() => handleExportMultiTier('json')}
                          disabled={isExportingData}
                          className="w-full py-2.5 sm:py-3 px-4 rounded-2xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all hover-zoom-btn flex items-center justify-center gap-2 uppercase disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          <span>{isExportingData ? 'ĐANG ĐÓNG GÓI...' : 'TẢI FILE .JSON'}</span>
                        </button>

                        {/* Option 2: .ZIP */}
                        <button
                          onClick={() => handleExportMultiTier('zip')}
                          disabled={isExportingData}
                          className="w-full py-2.5 sm:py-3 px-4 rounded-2xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all hover-zoom-btn flex items-center justify-center gap-2 uppercase disabled:opacity-50"
                        >
                          <FileArchive className="w-4 h-4 text-indigo-600" />
                          <span>TẢI FILE NÉN .ZIP</span>
                        </button>
                      </div>
                    </div>
                    {/* Card 2: Restore Upload (.JSON & .ZIP) với Modal Xem Trước Khôi Phục */}
                    <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-6 shadow-xs flex flex-col justify-between space-y-4 sm:space-y-5 hover-zoom-card">
                      <div className="space-y-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shadow-2xs">
                          <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                          {isCurrentUserSuperAdmin
                            ? (selectedAdminScope === 'system' ? 'KHÔI PHỤC TOÀN HỆ THỐNG' : `KHÔI PHỤC TRƯỜNG: ${selectedAdminSchool}`)
                            : (isSchoolAdminAccount ? 'KHÔI PHỤC TOÀN BỘ NHÀ TRƯỜNG' : 'NẠP KHÔI PHỤC TÀI KHOẢN')
                          }
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Hỗ trợ tải lên file dạng <strong className="text-emerald-700">.JSON</strong> hoặc FILE nén <strong className="text-emerald-700">.ZIP</strong>. Hệ thống tự động phân tích cấu trúc và kiểm tra phân quyền trước khi nạp.
                        </p>
                      </div>

                      <div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept=".json,.zip"
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isImportLoading}
                          className="w-full py-3 sm:py-3.5 px-3 sm:px-4 rounded-2xl text-xs font-black text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-2 border-dashed border-emerald-300 transition-all hover-zoom-btn flex flex-col items-center justify-center gap-1.5 uppercase disabled:opacity-50"
                        >
                          <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 animate-bounce" />
                          <span>{isImportLoading ? 'ĐANG PHÂN TÍCH TỆP...' : 'CHỌN FILE .JSON / .ZIP'}</span>
                          <span className="text-[12px] text-emerald-700 font-medium">BẤM ĐỂ DUYỆT TỆP</span>
                        </button>
                      </div>
                    </div>
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    <DataStorageLocationModal embedded parts="folder" isOpen onClose={() => {}} />
                  </div>
                </HubGroup>

                <HubGroup
                  id="hub-group-drive"
                  open={hubOpen.drive}
                  onToggle={() => toggleHub('drive')}
                  icon={HubCloud}
                  title="Google Drive của trường & Apps Script"
                  hint="Kết nối thư mục dùng chung, gửi lên / nạp lại dữ liệu, tự động đồng bộ, trình cài đặt Apps Script"
                  badge={hubDriveBadge}
                >
                  <div className="space-y-3">
                    <GoogleDriveSyncModal embedded isOpen onClose={() => {}} sections={hubHasDesktopDrive ? ['connect', 'sync', 'advanced'] : ['connect', 'sync']} onOpenWizard={openHubWizard} />
                    {canManageAccounts && (
                      <section ref={hubWizardRef} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowHubWizard(v => !v)}
                          aria-expanded={showHubWizard}
                          className="no-hover-fx w-full px-3 py-2.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-left flex items-center gap-2 cursor-pointer"
                        >
                          <HubWand className="w-5 h-5 text-indigo-600 shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-black text-slate-900">Cài đặt / cập nhật Apps Script</span>
                            <span className="block text-xs text-slate-600">Hướng dẫn 5 bước, bước cuối phần mềm tự kiểm tra link /exec. Chỉ quản trị cần làm.</span>
                          </span>
                          <HubDown className={`w-5 h-5 text-slate-600 shrink-0 transition-transform ${showHubWizard ? 'rotate-180' : ''}`} />
                        </button>
                        {showHubWizard && <AppsScriptSetupWizard embedded />}
                      </section>
                    )}
                  </div>
                </HubGroup>

                {canManageAccounts && (
                  <HubGroup
                    id="hub-group-stats"
                    open={hubOpen.stats}
                    onToggle={() => toggleHub('stats')}
                    icon={HubDisk}
                    title="Số liệu các lớp & dung lượng dữ liệu"
                    hint="Số liệu các lớp trong thư mục dùng chung; dung lượng đang dùng theo từng giáo viên, tải tệp dữ liệu từng giáo viên"
                  >
                    <div className="mb-3">
                      <GoogleDriveSyncModal embedded isOpen onClose={() => {}} sections={['report']} onOpenWizard={openHubWizard} />
                    </div>
                    <React.Suspense fallback={<p className="text-sm font-semibold text-slate-600 px-1">Đang mở…</p>}>
                      <HubAccountData
                        embeddedDatabase
                        embeddedPart="stats"
                        isOpen
                        onClose={() => {}}
                        currentUser={currentUser}
                        allUsers={allUsers}
                        onRefreshUsers={refreshUsersList}
                        onSwitchToUser={hubSwitchToUser}
                      />
                    </React.Suspense>
                  </HubGroup>
                )}
              </div>
            )}

            {dataHub === 'newyear' && (
              <div className="max-w-xl">
              {/* Card 4: Làm Mới Năm Học / Xóa Sạch */}
              <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-6 shadow-xs flex flex-col justify-between space-y-4 sm:space-y-5 hover-zoom-card">
                <div className="space-y-2">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-2xs">
                    <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                    LÀM MỚI NĂM HỌC (DỮ LIỆU CỦA TÀI KHOẢN NÀY)
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Xóa danh sách lớp, học sinh, điểm và điểm danh đang lưu dưới <strong>tài khoản đang đăng nhập</strong> để bắt đầu năm học mới.
                    Không xóa tài khoản và không đụng tới dữ liệu của giáo viên khác. Nên tải một bản sao lưu ở thẻ Sao lưu & khôi phục trước.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsClearDataModalOpen(true)}
                  className="w-full py-2.5 sm:py-3 px-4 rounded-2xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 transition-all hover-zoom-btn flex items-center justify-center gap-2 uppercase"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>LÀM MỚI NĂM HỌC</span>
                </button>
              </div>
              </div>
            )}

            {/* 3. MODAL XEM TRƯỚC & KIỂM TRA PHÂN QUYỀN KHI KHÔI PHỤC DỮ LIỆU */}
            {restorePreview && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs animate-fadeIn">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 sm:p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase">
                          XÁC NHẬN KHÔI PHỤC DỮ LIỆU PHÂN CẤP
                        </h3>
                        <p className="text-[12px] text-slate-500 font-medium">
                          Kiểm tra thông tin chi tiết tệp sao lưu trước khi tiến hành nạp
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setRestorePreview(null)}
                      className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* THÔNG TIN TÓM TẮT FILE SAO LƯU */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold">Tên tệp tin:</span>
                      <span className="font-mono font-black text-slate-900 truncate max-w-[240px]">
                        {restorePreview.summary.fileName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold">Phân cấp sao lưu:</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-black uppercase text-[12px]">
                        {restorePreview.summary.scopeText}
                      </span>
                    </div>

                    {restorePreview.summary.schoolName && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-bold">Trường học:</span>
                        <span className="font-black text-indigo-950">
                          {restorePreview.summary.schoolName}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                      <div className="text-center p-2 rounded-xl bg-white border border-slate-200">
                        <div className="text-[12px] text-slate-500 font-bold uppercase">Số lớp</div>
                        <div className="text-sm font-black text-indigo-700 font-mono">
                          {restorePreview.summary.totalClasses} Lớp
                        </div>
                      </div>

                      <div className="text-center p-2 rounded-xl bg-white border border-slate-200">
                        <div className="text-[12px] text-slate-500 font-bold uppercase">Học sinh</div>
                        <div className="text-sm font-black text-emerald-700 font-mono">
                          {restorePreview.summary.totalStudents} HS
                        </div>
                      </div>

                      <div className="text-center p-2 rounded-xl bg-white border border-slate-200">
                        <div className="text-[12px] text-slate-500 font-bold uppercase">Tài khoản</div>
                        <div className="text-sm font-black text-amber-700 font-mono">
                          {restorePreview.summary.totalTeachers} Users
                        </div>
                      </div>
                    </div>

                    {restorePreview.summary.exportedAt && (
                      <div className="text-[12px] text-slate-500 pt-1">
                        ⏱️ Xuất ngày: {new Date(restorePreview.summary.exportedAt).toLocaleString('vi-VN')}
                        {restorePreview.summary.exportedBy ? ` bởi ${restorePreview.summary.exportedBy}` : ''}
                      </div>
                    )}
                  </div>

                  {/* CẢNH BÁO AN TOÀN */}
                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      Cơ chế <strong>Non-Destructive Smart Merge</strong> sẽ bảo toàn an toàn các dữ liệu hiện có và cập nhật đồng bộ các lớp học, học sinh vào cơ sở dữ liệu.
                    </span>
                  </div>

                  {/* NÚT BẤM HÀNH ĐỘNG */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setRestorePreview(null)}
                      disabled={isRestoringData}
                      className="px-4 py-2.5 rounded-2xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-all uppercase"
                    >
                      HỦY BỎ
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmRestore}
                      disabled={isRestoringData}
                      className="px-5 py-2.5 rounded-2xl text-xs font-black text-white bg-emerald-700 hover:bg-emerald-800 shadow-md shadow-emerald-600/20 transition-all hover-zoom-btn flex items-center gap-2 uppercase disabled:opacity-50"
                    >
                      {isRestoringData ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>ĐANG KHÔI PHỤC...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>XÁC NHẬN KHÔI PHỤC DỮ LIỆU</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CÀI ĐẶT HỒ SƠ & THÔNG TIN HỆ THỐNG */}
        {/* ========================================================================= */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* THÔNG TIN TÁC GIẢ ỨNG DỤNG - BẢN QUYỀN CỐ ĐỊNH KHÔNG THỂ SỬA */}
            <div className="p-5 md:p-6 rounded-3xl bg-gradient-to-br from-indigo-50 via-sky-50 to-blue-50 border-2 border-indigo-200/90 shadow-xs space-y-3.5 hover-zoom-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs md:text-sm font-black text-indigo-950 uppercase tracking-tight">
                      THÔNG TIN TÁC GIẢ ỨNG DỤNG (BẢN QUYỀN PHẦN MỀM)
                    </span>
                    <p className="text-[12px] text-indigo-800 font-medium">
                      Thông tin bản quyền của tác giả phần mềm được quy định cố định, hiển thị rõ ràng trên hệ thống.
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-[12px] font-black border border-indigo-700 shadow-2xs uppercase flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>CỐ ĐỊNH - KHÔNG THỂ SỬA</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pt-1">
                <div className="p-3.5 bg-white/80 rounded-2xl border border-indigo-100 space-y-1">
                  <span className="text-slate-500 font-bold block text-[12px] uppercase tracking-wider">TÁC GIẢ PHẦN MỀM:</span>
                  <span className="text-sm font-black text-indigo-950 uppercase">{APP_AUTHOR_INFO.name}</span>
                  <div className="text-[12px] text-indigo-700 font-bold uppercase">BẢN QUYỀN CỐ ĐỊNH</div>
                </div>

                <div className="p-3.5 bg-white/80 rounded-2xl border border-indigo-100 space-y-1">
                  <span className="text-slate-500 font-bold block text-[12px] uppercase tracking-wider">ĐƠN VỊ CÔNG TÁC:</span>
                  <span className="text-xs font-black text-indigo-900 uppercase block">{APP_AUTHOR_INFO.schoolName}</span>
                  <div className="text-[12px] text-slate-500 font-medium uppercase">PHÒNG GIÁO DỤC VÀ ĐÀO TẠO</div>
                </div>

                <div className="p-3.5 bg-white/80 rounded-2xl border border-indigo-100 space-y-1">
                  <span className="text-slate-500 font-bold block text-[12px] uppercase tracking-wider">ZALO HỖ TRỢ KỸ THUẬT:</span>
                  <a
                    href={APP_AUTHOR_INFO.zaloUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-black text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-mono uppercase"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                    <span>{APP_AUTHOR_INFO.zalo}</span>
                  </a>
                  <div className="text-[12px] text-slate-400 font-medium">BẤM ĐỂ MỞ ZALO HỖ TRỢ</div>
                </div>

                <div className="p-3.5 bg-white/80 rounded-2xl border border-indigo-100 space-y-1">
                  <span className="text-slate-500 font-bold block text-[12px] uppercase tracking-wider">LIÊN KẾT FACEBOOK:</span>
                  <a
                    href={APP_AUTHOR_INFO.facebook}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-black text-blue-700 hover:text-blue-900 hover:underline truncate block"
                  >
                    Facebook Tác giả
                  </a>
                  <div className="text-[12px] text-slate-400 font-medium truncate">{APP_AUTHOR_INFO.facebook}</div>
                </div>
              </div>
            </div>

              {/* ========================================================================= */}
              {/* PHẦN 1: CÀI ĐẶT HỒ SƠ GIÁO VIÊN & ẢNH ĐẠI DIỆN */}
              {/* ========================================================================= */}
              <div className="bg-white rounded-3xl border border-slate-200/90 p-6 md:p-8 shadow-xs space-y-6 hover-zoom-card">
                {/* Header of Section 1 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black">
                        <User className="w-4 h-4" />
                      </div>
                      <h3 className="text-base font-black text-slate-900 uppercase">
                        {isCurrentUserSuperAdmin
                          ? '1. CÀI ĐẶT HỒ SƠ QUẢN TRỊ VIÊN & THÔNG TIN HỆ THỐNG'
                          : '1. CÀI ĐẶT HỒ SƠ GIÁO VIÊN & ẢNH ĐẠI DIỆN'}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {isCurrentUserSuperAdmin
                        ? 'Quản lý thông tin đại diện tài khoản Quản trị Cao nhất, ảnh đại diện và thông tin liên hệ hệ thống.'
                        : 'Quản lý ảnh đại diện sư phạm (chọn ảnh, thu phóng, căn chỉnh góc nhìn trực tiếp) và 9 mục thông tin cá nhân.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {profileSavedToast && (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-xl flex items-center gap-1 uppercase animate-in fade-in">
                        <Check className="w-3.5 h-3.5" />
                        <span>ĐÃ LƯU!</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      className="px-5 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-md shadow-indigo-600/20 transition-all hover-zoom-btn flex items-center gap-1.5 uppercase"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isCurrentUserSuperAdmin ? 'LƯU HỒ SƠ QUẢN TRỊ' : 'LƯU HỒ SƠ GIÁO VIÊN'}</span>
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-6">
                  {/* Avatar Management Card: Tải ảnh từ máy, thu phóng & căn chỉnh trực tiếp */}
                  <div className="p-5 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                      {/* Avatar Preview Box */}
                      <div className="relative shrink-0 flex flex-col items-center">
                        <div className="relative w-28 h-28 rounded-3xl overflow-hidden border-4 border-white bg-white shadow-lg ring-4 ring-indigo-100 hover-zoom-interactive">
                          <img
                            src={profileAvatar}
                            alt="Teacher Avatar"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/bottts/svg?seed=TeacherHoa&backgroundColor=ffd5dc';
                            }}
                          />
                        </div>
                        <span className="mt-2 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[12px] font-black uppercase tracking-wider">
                          {profileRole || 'GIÁO VIÊN'}
                        </span>
                      </div>

                      {/* Controls & Description */}
                      <div className="space-y-3 flex-1 text-center md:text-left">
                        <div>
                          <div className="text-sm font-black text-slate-900 uppercase">
                            QUẢN LÝ ẢNH ĐẠI DIỆN GIÁO VIÊN
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">
                            Hỗ trợ tính năng chọn ảnh chân dung từ máy tính, thu phóng tỷ lệ (50% – 300%) và kéo rê căn chỉnh góc nhìn trực tiếp để có bức ảnh sư phạm đẹp nhất.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                          <button
                            type="button"
                            onClick={() => profileAvatarInputRef.current?.click()}
                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-xs transition-all hover-zoom-btn uppercase"
                          >
                            <Camera className="w-4 h-4" />
                            <span>CHỌN ẢNH TỪ MÁY TÍNH</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setIsTeacherAvatarEditorOpen(true)}
                            className="px-4 py-2.5 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black flex items-center gap-2 shadow-xs transition-all hover-zoom-btn uppercase"
                          >
                            <ZoomIn className="w-4 h-4" />
                            <span>THU PHÓNG & CĂN CHỈNH GÓC NHÌN TRỰC TIẾP</span>
                          </button>

                          <input
                            type="file"
                            ref={profileAvatarInputRef}
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarFile}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Presets Grid */}
                    <div className="pt-3 border-t border-slate-200/70">
                      <div className="text-[12px] font-black text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>HOẶC CHỌN NHANH ẢNH ĐẠI DIỆN SƯ PHẠM MẪU:</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                        {TEACHER_PRESET_AVATARS.map((preset) => {
                          const isSelected = profileAvatar === preset.url;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setProfileAvatar(preset.url);
                                setProfileOriginalAvatar(preset.url);
                                setProfileAvatarScale(1);
                                setProfileAvatarPosition({ x: 0, y: 0 });
                                updateTeacherProfile({
                                  avatar: preset.url,
                                  originalAvatar: preset.url,
                                  avatarScale: 1,
                                  avatarPosition: { x: 0, y: 0 }
                                });
                              }}
                              className={`p-2 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 hover-zoom-btn ${isSelected
                                  ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-400 shadow-xs'
                                  : 'bg-white border-slate-200 hover:border-indigo-300'
                                }`}
                            >
                              <img
                                src={preset.url}
                                alt={preset.label}
                                className="w-10 h-10 rounded-xl object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <span className="text-[12px] font-bold text-slate-700 truncate w-full text-center">
                                {preset.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 9 Personal Information Fields in 2-Column Responsive Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 1. Họ và tên người dùng / quản trị viên */}
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5 uppercase">
                        <User className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{isCurrentUserSuperAdmin ? 'HỌ VÀ TÊN / DANH XƯNG QUẢN TRỊ VIÊN:' : 'HỌ VÀ TÊN GIÁO VIÊN:'}</span>
                      </label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder={isCurrentUserSuperAdmin ? 'Tài khoản quản trị Cao nhất' : 'Ví dụ: Thầy/Cô Nguyễn Văn A'}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-slate-900"
                        required
                      />
                    </div>

                    {/* 2. Ngày tháng năm sinh */}
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5 uppercase">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        <span>NGÀY THÁNG NĂM SINH:</span>
                      </label>
                      <input
                        type="text"
                        value={profileBirthDate}
                        onChange={(e) => setProfileBirthDate(e.target.value)}
                        placeholder="Ví dụ: 15/08/1988"
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-indigo-700"
                      />
                    </div>

                    {/* 3. Đơn vị công tác / Trường */}
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5 uppercase">
                        <School className="w-3.5 h-3.5 text-indigo-600" />
                        <span>ĐƠN VỊ CÔNG TÁC / TRƯỜNG:</span>
                      </label>
                      <input
                        type="text"
                        value={profileSchool}
                        onChange={(e) => setProfileSchool(e.target.value)}
                        placeholder="Ví dụ: Trường Tiểu học..."
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-slate-800"
                      />
                    </div>

                    {/* 4. Vai trò sử dụng phần mềm & Chức vụ */}
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5 uppercase">
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                        <span>VAI TRÒ SỬ DỤNG PHẦN MỀM:</span>
                      </label>
                      {isAdminAccount ? (
                        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center gap-2">
                          <span className="text-base">🛡️</span>
                          <div>
                            <div className="text-xs font-black uppercase">
                              {currentUser?.role === 'admin' || currentUser?.username?.toLowerCase() === 'adminquantri' ? 'QUẢN TRỊ VIÊN TỐI CAO' : 'QUẢN TRỊ VIÊN NHÀ TRƯỜNG'}
                            </div>
                            <div className="text-[12px] text-indigo-700 font-semibold">
                              Quản trị và tổng hợp số liệu toàn bộ các lớp Giáo viên chủ nhiệm
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTeacherRole('homeroom');
                              setProfileRole('GIÁO VIÊN CHỦ NHIỆM');
                            }}
                            className={`px-2 py-2.5 rounded-xl border text-[12px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 transition-all ${teacherRole === 'homeroom'
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                          >
                            <span className="shrink-0">🏫</span>
                            <span className="truncate">GV CHỦ NHIỆM</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTeacherRole('subject');
                              setProfileRole(`GIÁO VIÊN BỘ MÔN ${subjectTeacherConfig.subjectName || 'TIN HỌC'}`);
                            }}
                            className={`px-2 py-2.5 rounded-xl border text-[12px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 transition-all ${teacherRole === 'subject'
                                ? 'bg-emerald-700 text-white border-emerald-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                          >
                            <span className="shrink-0">💻</span>
                            <span className="truncate">GV BỘ MÔN</span>
                          </button>
                        </div>
                      )}
                      {!isAdminAccount && teacherRole === 'subject' && (
                        <div className="pt-1.5 space-y-1">
                          <label className="text-[12px] font-black text-emerald-900 uppercase">
                            Môn Giảng Dạy Bộ Môn (ví dụ: Tin học, Tiếng Anh, Âm nhạc...):
                          </label>
                          <input
                            type="text"
                            value={subjectTeacherConfig.subjectName}
                            onChange={(e) => updateSubjectTeacherConfig({ subjectName: e.target.value.toUpperCase() })}
                            className="w-full px-3 py-1.5 border border-emerald-300 rounded-xl text-xs font-black uppercase text-emerald-800 bg-emerald-50/50"
                          />
                        </div>
                      )}
                    </div>

                    {/* 5. Năm học hiện tại */}
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5 uppercase">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        <span>NĂM HỌC HIỆN TẠI:</span>
                      </label>
                      <input
                        type="text"
                        value={profileAcademicYear}
                        onChange={(e) => setProfileAcademicYear(e.target.value)}
                        placeholder="Ví dụ: 2026–2027"
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-black text-slate-800"
                        required
                      />
                    </div>

                    {/* 6. Số điện thoại giáo viên */}
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5 uppercase">
                        <Phone className="w-3.5 h-3.5 text-indigo-600" />
                        <span>SỐ ĐIỆN THOẠI GIÁO VIÊN:</span>
                      </label>
                      <input
                        type="text"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="Ví dụ: 0988 123 456"
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono font-bold text-slate-900"
                      />
                    </div>

                    {/* 7. Zalo giáo viên */}
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5 uppercase">
                        <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                        <span>ZALO GIÁO VIÊN:</span>
                      </label>
                      <input
                        type="text"
                        value={profileZalo}
                        onChange={(e) => setProfileZalo(e.target.value)}
                        placeholder="Ví dụ: 0988 123 456"
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono font-bold text-blue-900"
                      />
                    </div>

                    {/* 8. Địa chỉ liên kết mạng xã hội Facebook */}
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5 uppercase">
                        <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[12px] font-black shrink-0">f</span>
                        <span>ĐỊA CHỈ LIÊN KẾT MẠNG XÃ HỘI FACEBOOK:</span>
                      </label>
                      <input
                        type="text"
                        value={profileFacebook}
                        onChange={(e) => setProfileFacebook(e.target.value)}
                        placeholder="Ví dụ: https://www.facebook.com/..."
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-blue-700"
                      />
                    </div>

                    {/* 9. Địa chỉ liên kết mạng xã hội khác */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5 uppercase">
                        <Globe className="w-3.5 h-3.5 text-indigo-600" />
                        <span>ĐỊA CHỈ LIÊN KẾT MẠNG XÃ HỘI KHÁC (ZALO / WEBSITE / TRANG CÁ NHÂN):</span>
                      </label>
                      <input
                        type="text"
                        value={profileSocialLink}
                        onChange={(e) => setProfileSocialLink(e.target.value)}
                        placeholder="Ví dụ: https://zalo.me/..."
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-indigo-900"
                      />
                    </div>
                  </div>

                  {/* Bottom Save Action for Section 1 */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        if (isCurrentUserSuperAdmin) {
                          setProfileName('Tài khoản quản trị Cao nhất');
                          setProfileBirthDate('');
                          setProfileRole('TÀI KHOẢN QUẢN TRỊ CAO NHẤT');
                          setProfileSchool('Hệ thống Quản trị Lớp học Hạnh phúc');
                          setProfileAvatar('https://api.dicebear.com/7.x/bottts/svg?seed=AdminQuanTriBoss&backgroundColor=d1d4f9');
                          setProfileOriginalAvatar('https://api.dicebear.com/7.x/bottts/svg?seed=AdminQuanTriBoss&backgroundColor=d1d4f9');
                          setProfileAcademicYear('2026–2027');
                          setProfilePhone('0888358363');
                          setProfileZalo('0888358363');
                          setProfileFacebook('https://www.facebook.com/nguyenthanhliemautotech/');
                          setProfileSocialLink('https://zalo.me/0888358363');
                        } else {
                          setProfileName(currentUser?.fullName || '');
                          setProfileBirthDate('');
                          setProfileRole('GIÁO VIÊN CHỦ NHIỆM');
                          setProfileSchool(currentUser?.schoolName || '');
                          setProfileAcademicYear('2026–2027');
                          setProfilePhone(currentUser?.phone || '');
                          setProfileZalo('');
                          setProfileFacebook('');
                          setProfileSocialLink('');
                        }
                        confetti({ particleCount: 20, spread: 40 });
                      }}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-2xl transition-colors uppercase"
                    >
                      ↺ {isCurrentUserSuperAdmin ? 'Khôi phục mẫu quản trị' : 'Làm mới thông tin'}
                    </button>

                    <button
                      type="submit"
                      className="px-6 py-3 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-md shadow-indigo-600/20 transition-all hover-zoom-btn flex items-center gap-2 uppercase"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isCurrentUserSuperAdmin ? 'LƯU HỒ SƠ QUẢN TRỊ VIÊN' : 'LƯU CÀI ĐẶT HỒ SƠ GIÁO VIÊN'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* ========================================================================= */}
              {/* PHẦN 2: CÀI ĐẶT KHẨU HIỆU & BAN ĐẠI DIỆN CHA MẸ HỌC SINH (LỚP HỌC) */}
              {/* CHỈ DÀNH CHO GIÁO VIÊN CHỦ NHIỆM HOẶC KHI CÓ LỚP HỌC CỤ THỂ */}
              {/* ========================================================================= */}
              {!isSubjectTeacher && canEditParentCommittee && canEditClassSlogan && classes.length > 0 && (
                <div className="bg-white rounded-3xl border border-slate-200/90 p-6 md:p-8 shadow-xs space-y-6 hover-zoom-card">
                  {/* Header of Section 2 with Class Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-pink-100 text-pink-700 flex items-center justify-center font-bold">
                          <Heart className="w-4 h-4 fill-pink-500" />
                        </div>
                        <h3 className="text-base font-black text-slate-900 uppercase">
                          2. CÀI ĐẶT KHẨU HIỆU & BAN ĐẠI DIỆN CHA MẸ HỌC SINH
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">
                        Khẩu hiệu / Slogan lớp học (hiển thị trên Infographic) và danh sách liên hệ 4 vị trí Ban đại diện cha mẹ học sinh.
                      </p>
                    </div>

                    {/* Class Selector pill if multiple classes exist */}
                    <div className="flex items-center gap-2">
                      {classes.length > 1 && (
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                          <span className="text-[12px] font-bold text-slate-500 pl-2 uppercase">Lớp:</span>
                          <select
                            value={selectedSettingsClassId}
                            onChange={(e) => setSelectedSettingsClassId(e.target.value)}
                            className="px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-xs font-black text-indigo-700 focus:outline-none"
                          >
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>
                                Lớp {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {parentSavedToast && (
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-xl flex items-center gap-1 uppercase animate-in fade-in">
                          <Check className="w-3.5 h-3.5" />
                          <span>ĐÃ LƯU!</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={handleSaveParentCommittee}
                        className="px-5 py-2.5 text-xs font-black text-white bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 rounded-2xl shadow-md shadow-emerald-600/20 transition-all hover-zoom-btn flex items-center gap-1.5 uppercase"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>LƯU KHẨU HIỆU & BAN PHỤ HUYNH</span>
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleSaveParentCommittee} className="space-y-6">
                    {/* Slogan Lớp Học */}
                    <div className="p-5 bg-gradient-to-r from-amber-50/60 via-yellow-50/40 to-amber-50/60 rounded-2xl border border-amber-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-black text-amber-950 flex items-center gap-1.5 uppercase">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <span>KHẨU HIỆU / SLOGAN CỦA LỚP HỌC (HIỂN THỊ TRÊN INFOGRAPHIC):</span>
                        </label>
                        <span className="text-[12px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full uppercase">
                          LỚP {currentSettingsClass?.name || 'HỌC'}
                        </span>
                      </div>

                      <input
                        type="text"
                        value={classSlogan}
                        onChange={(e) => setClassSlogan(e.target.value)}
                        placeholder="Ví dụ: Chăm ngoan, sáng tạo, tự tin tỏa sáng..."
                        className="w-full px-4 py-3 bg-white border border-amber-300 rounded-2xl text-xs md:text-sm font-bold text-amber-950 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-xs"
                      />

                      {/* Slogan Quick Suggestion Chips */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[12px] font-bold text-slate-500 uppercase">Gợi ý nhanh:</span>
                        <button
                          type="button"
                          onClick={() => setClassSlogan('Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng')}
                          className="px-3 py-1 bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-xl text-[12px] font-bold transition-colors hover-zoom-btn"
                        >
                          “Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng”
                        </button>
                        <button
                          type="button"
                          onClick={() => setClassSlogan('Đoàn kết - Chăm ngoan - Tự tin - Tỏa sáng')}
                          className="px-3 py-1 bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-xl text-[12px] font-bold transition-colors hover-zoom-btn"
                        >
                          “Đoàn kết - Chăm ngoan - Tự tin - Tỏa sáng”
                        </button>
                        <button
                          type="button"
                          onClick={() => setClassSlogan('Mỗi ngày đến trường là một ngày vui')}
                          className="px-3 py-1 bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-xl text-[12px] font-bold transition-colors hover-zoom-btn"
                        >
                          “Mỗi ngày đến trường là một ngày vui”
                        </button>
                      </div>
                    </div>

                    {/* 4 Thành viên Ban Phụ Huynh: 2x2 Grid with Full Contact Affordances */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-black text-slate-900 uppercase flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-emerald-600" />
                          <span>DANH SÁCH BAN ĐẠI DIỆN CHA MẸ HỌC SINH (4 VỊ TRÍ):</span>
                        </div>
                        <span className="text-[12px] text-slate-500 font-bold uppercase">
                          ĐẦY ĐỦ HỌ TÊN VÀ SỐ ĐIỆN THOẠI LIÊN HỆ
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 1. Trưởng ban phụ huynh */}
                        <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3 hover-zoom-interactive">
                          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                            <span className="text-xs font-black text-indigo-700 uppercase flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[12px] font-black">1</span>
                              <span>TRƯỞNG BAN PHỤ HUYNH</span>
                            </span>
                            {parentHeadPhone && (
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`tel:${parentHeadPhone.replace(/\s+/g, '')}`}
                                  className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[12px] font-bold transition-colors flex items-center gap-1"
                                  title="Gọi điện"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>Gọi</span>
                                </a>
                                <a
                                  href={`https://zalo.me/${parentHeadPhone.replace(/\s+/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg text-[12px] font-bold transition-colors flex items-center gap-1"
                                  title="Nhắn Zalo"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>Zalo</span>
                                </a>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div>
                              <label className="block text-[12px] font-black text-slate-500 uppercase mb-1">
                                HỌ VÀ TÊN TRƯỞNG BAN:
                              </label>
                              <input
                                type="text"
                                value={parentHeadName}
                                onChange={(e) => setParentHeadName(e.target.value)}
                                placeholder="Ví dụ: Nguyễn Văn A"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[12px] font-black text-slate-500 uppercase mb-1">
                                SỐ ĐIỆN THOẠI LIÊN HỆ:
                              </label>
                              <input
                                type="text"
                                value={parentHeadPhone}
                                onChange={(e) => setParentHeadPhone(e.target.value)}
                                placeholder="Ví dụ: 0988 123 456"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 2. Phó ban phụ huynh */}
                        <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3 hover-zoom-interactive">
                          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                            <span className="text-xs font-black text-indigo-700 uppercase flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[12px] font-black">2</span>
                              <span>PHÓ BAN PHỤ HUYNH</span>
                            </span>
                            {parentDeputyPhone && (
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`tel:${parentDeputyPhone.replace(/\s+/g, '')}`}
                                  className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[12px] font-bold transition-colors flex items-center gap-1"
                                  title="Gọi điện"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>Gọi</span>
                                </a>
                                <a
                                  href={`https://zalo.me/${parentDeputyPhone.replace(/\s+/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg text-[12px] font-bold transition-colors flex items-center gap-1"
                                  title="Nhắn Zalo"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>Zalo</span>
                                </a>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div>
                              <label className="block text-[12px] font-black text-slate-500 uppercase mb-1">
                                HỌ VÀ TÊN PHÓ BAN:
                              </label>
                              <input
                                type="text"
                                value={parentDeputyName}
                                onChange={(e) => setParentDeputyName(e.target.value)}
                                placeholder="Ví dụ: Trần Thị B"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[12px] font-black text-slate-500 uppercase mb-1">
                                SỐ ĐIỆN THOẠI LIÊN HỆ:
                              </label>
                              <input
                                type="text"
                                value={parentDeputyPhone}
                                onChange={(e) => setParentDeputyPhone(e.target.value)}
                                placeholder="Ví dụ: 0977 654 321"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 3. Ủy viên 1 */}
                        <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3 hover-zoom-interactive">
                          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                            <span className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-slate-600 text-white flex items-center justify-center text-[12px] font-black">3</span>
                              <span>ỦY VIÊN BAN PHỤ HUYNH 1</span>
                            </span>
                            {parentMember1Phone && (
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`tel:${parentMember1Phone.replace(/\s+/g, '')}`}
                                  className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[12px] font-bold transition-colors flex items-center gap-1"
                                  title="Gọi điện"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>Gọi</span>
                                </a>
                                <a
                                  href={`https://zalo.me/${parentMember1Phone.replace(/\s+/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg text-[12px] font-bold transition-colors flex items-center gap-1"
                                  title="Nhắn Zalo"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>Zalo</span>
                                </a>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div>
                              <label className="block text-[12px] font-black text-slate-500 uppercase mb-1">
                                HỌ VÀ TÊN ỦY VIÊN 1:
                              </label>
                              <input
                                type="text"
                                value={parentMember1Name}
                                onChange={(e) => setParentMember1Name(e.target.value)}
                                placeholder="Ví dụ: Lê Văn C"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[12px] font-black text-slate-500 uppercase mb-1">
                                SỐ ĐIỆN THOẠI LIÊN HỆ:
                              </label>
                              <input
                                type="text"
                                value={parentMember1Phone}
                                onChange={(e) => setParentMember1Phone(e.target.value)}
                                placeholder="Ví dụ: 0912 345 678"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 4. Ủy viên 2 */}
                        <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3 hover-zoom-interactive">
                          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                            <span className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-slate-600 text-white flex items-center justify-center text-[12px] font-black">4</span>
                              <span>ỦY VIÊN BAN PHỤ HUYNH 2</span>
                            </span>
                            {parentMember2Phone && (
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`tel:${parentMember2Phone.replace(/\s+/g, '')}`}
                                  className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[12px] font-bold transition-colors flex items-center gap-1"
                                  title="Gọi điện"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>Gọi</span>
                                </a>
                                <a
                                  href={`https://zalo.me/${parentMember2Phone.replace(/\s+/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg text-[12px] font-bold transition-colors flex items-center gap-1"
                                  title="Nhắn Zalo"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>Zalo</span>
                                </a>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div>
                              <label className="block text-[12px] font-black text-slate-500 uppercase mb-1">
                                HỌ VÀ TÊN ỦY VIÊN 2:
                              </label>
                              <input
                                type="text"
                                value={parentMember2Name}
                                onChange={(e) => setParentMember2Name(e.target.value)}
                                placeholder="Ví dụ: Phạm Thị D"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[12px] font-black text-slate-500 uppercase mb-1">
                                SỐ ĐIỆN THOẠI LIÊN HỆ:
                              </label>
                              <input
                                type="text"
                                value={parentMember2Phone}
                                onChange={(e) => setParentMember2Phone(e.target.value)}
                                placeholder="Ví dụ: 0903 890 123"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Save Action for Section 2 */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setClassSlogan('');
                          setParentHeadName('');
                          setParentHeadPhone('');
                          setParentDeputyName('');
                          setParentDeputyPhone('');
                          setParentMember1Name('');
                          setParentMember1Phone('');
                          setParentMember2Name('');
                          setParentMember2Phone('');
                          confetti({ particleCount: 20, spread: 40 });
                        }}
                        className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-2xl transition-colors uppercase"
                      >
                        ↺ Xóa trắng ban phụ huynh
                      </button>

                      <button
                        type="submit"
                        className="px-6 py-3 text-xs font-black text-white bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 rounded-2xl shadow-md shadow-emerald-600/20 transition-all hover-zoom-btn flex items-center gap-2 uppercase"
                      >
                        <Check className="w-4 h-4" />
                        <span>LƯU KHẨU HIỆU & BAN PHỤ HUYNH</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Master Bottom Action Card */}
              <div className="p-4 bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-500 font-medium">
                  💡 Bạn có thể lưu từng phần riêng biệt ở trên hoặc bấm nút bên phải để lưu toàn bộ cài đặt cùng một lúc.
                </div>

                <button
                  type="button"
                  onClick={handleSaveAllSettings}
                  className="w-full sm:w-auto px-6 py-3 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-md shadow-indigo-600/25 transition-all hover-zoom-btn flex items-center justify-center gap-2 uppercase shrink-0"
                >
                  <Check className="w-4 h-4" />
                  <span>LƯU TẤT CẢ CÀI ĐẶT HỆ THỐNG</span>
                </button>
              </div>
            </div>
      )}



            {/* Modal 2: XÁC NHẬN XÓA SẠCH DỮ LIỆU ĐỂ LÀM MỚI */}
            {isClearDataModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 bg-gradient-to-br from-rose-50 via-amber-50 to-orange-50 border-b border-rose-100 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/30">
                        <Trash2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900">
                          Xóa Sạch Danh Sách & Điểm Số?
                        </h3>
                        <p className="text-xs text-rose-700 font-semibold mt-0.5">
                          Chuẩn bị bắt đầu năm học mới
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsClearDataModalOpen(false)}
                      className="w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors shadow-2xs"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2 text-xs text-amber-900">
                      <div className="font-bold flex items-center gap-1.5 text-amber-800">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Cơ chế làm mới năm học an toàn:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-slate-700 text-[12px]">
                        <li>Hệ thống tự động khởi tạo lại khung lớp học cho năm học mới.</li>
                        <li>Danh sách học sinh, điểm số thi đua, nhật ký khen thưởng và thời khóa biểu cũ sẽ được xóa sạch về 0.</li>
                        <li>Giúp thầy cô sẵn sàng nhập danh sách học sinh mới ngay lập tức.</li>
                      </ul>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsClearDataModalOpen(false)}
                        className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        Hủy Bỏ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearAllData();
                          confetti({ particleCount: 30, spread: 50 });
                          setImportStatus('✨ Đã làm mới năm học thành công: Dữ liệu học sinh và điểm số đã được làm sạch!');
                          setIsClearDataModalOpen(false);
                          setTimeout(() => setImportStatus(null), 4000);
                        }}
                        className="px-5 py-2.5 rounded-2xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/30 transition-all hover-zoom-btn flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Xác Nhận Làm Mới Năm Học</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Teacher Avatar Zoom & Crop Modal */}
            <TeacherAvatarEditorModal
              isOpen={isTeacherAvatarEditorOpen}
              teacherName={profileName}
              currentAvatar={profileAvatar}
              originalAvatar={pendingOriginalAvatar || profileOriginalAvatar || profileAvatar}
              currentScale={pendingOriginalAvatar ? 1 : (profileAvatarScale || 1)}
              currentPosition={pendingOriginalAvatar ? { x: 0, y: 0 } : (profileAvatarPosition || { x: 0, y: 0 })}
              onClose={() => {
                setIsTeacherAvatarEditorOpen(false);
                setPendingOriginalAvatar(null);
              }}
              onSave={(croppedUrl, originalUrl, scale, pos) => {
                // Chỉ cắt và cập nhật khi giáo viên bấm nút Xác Nhận Thu Phóng & Cắt Ảnh
                setProfileAvatar(croppedUrl);
                setProfileOriginalAvatar(originalUrl);
                setProfileAvatarScale(scale);
                setProfileAvatarPosition(pos);
                setPendingOriginalAvatar(null);
                updateTeacherProfile({
                  avatar: croppedUrl,
                  originalAvatar: originalUrl,
                  avatarScale: scale,
                  avatarPosition: pos
                });
              }}
            />
          </div>
        );
};
