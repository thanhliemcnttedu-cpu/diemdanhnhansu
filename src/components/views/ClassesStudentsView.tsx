import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useClassroom } from '../../context/ClassroomContext';
import { Student, Classroom, Subject, getStudentRoleInfo, CLASS_OFFICER_ROLES, getStudentRolesList, SchoolBranch, SchoolCampus } from '../../types';
import { parseBulkStudentInput } from '../../utils/genderGuesser';
import { compressImage } from '../../utils/imageCompressor';
import { AvatarEditorModal } from '../modals/AvatarEditorModal';
import { ClassAvatarEditorModal } from '../modals/ClassAvatarEditorModal';
import { ExportStudentListModal } from '../modals/ExportStudentListModal';
import { AutoAssignAvatarModal } from '../modals/AutoAssignAvatarModal';
import { GroupPhotoAvatarModal } from '../modals/GroupPhotoAvatarModal';
import { InitSubjectClassesModal } from './classes/InitSubjectClassesModal';
import { AvatarSourceType, handleAvatarImgError } from '../../utils/avatarConfig';
import { extractSchoolBranchesFromClasses } from '../../utils/schoolBranchHelper';
import { 
  Users, UserPlus, ClipboardPaste, Camera, Crop, 
  Trash2, Edit3, Search, Check, Plus, Minus,
  Sparkles, School, ArrowRight, RotateCcw,
  Star, Award, CheckCircle2, ChevronRight, X,
  FileSpreadsheet, Download, Upload, Calendar, AlertTriangle, CheckSquare,
  Settings, BookOpen, Calculator, Globe, Atom, Map, Monitor, Palette, Music, Activity, Heart,
  Flame, HelpCircle, Layers, ZoomIn, Crown, Shield, ShieldCheck, SlidersHorizontal, Coins, Wand2,
  Building2, MapPin, ChevronDown, ChevronUp, Filter, Eye, BarChart3, Users2, User,
  ArrowUpDown
} from 'lucide-react';
import { playCoinSound, playDeductSound, playFanfareSound } from '../../utils/audio';
import confetti from 'canvas-confetti';

const CLASS_COLORS = [
  '#3B82F6', // Blue
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6'  // Violet
];

// Presets for Class Avatars
const CLASS_AVATARS = [
  { id: 'ca-1', label: 'Tên Lửa', icon: '🚀', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=RocketClass&backgroundColor=6366f1' },
  { id: 'ca-2', label: 'Cúp Vàng', icon: '🏆', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=ChampionCup&backgroundColor=f59e0b' },
  { id: 'ca-3', label: 'Sách Vở', icon: '📚', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=BookClass&backgroundColor=3b82f6' },
  { id: 'ca-4', label: 'Ngôi Sao', icon: '⭐', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=StarClass&backgroundColor=ec4899' },
  { id: 'ca-5', label: 'Khoa Học', icon: '🔬', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=ScienceClass&backgroundColor=06b6d4' },
  { id: 'ca-6', label: 'Mầm Xanh', icon: '🌱', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=PlantClass&backgroundColor=10b981' },
  { id: 'ca-7', label: 'Trái Đất', icon: '🌍', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=EarthClass&backgroundColor=8b5cf6' },
  { id: 'ca-8', label: 'Họa Sĩ', icon: '🎨', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=ArtClass&backgroundColor=ef4444' }
];

export const OFFICER_ROLE_OPTIONS = [
  { value: 'LỚP TRƯỞNG', label: 'LỚP TRƯỞNG', icon: '👑', badgeBg: 'bg-amber-100', badgeText: 'text-amber-900', badgeBorder: 'border-amber-300' },
  { value: 'LỚP PHÓ HỌC TẬP', label: 'LỚP PHÓ HỌC TẬP', icon: '📘', badgeBg: 'bg-blue-100', badgeText: 'text-blue-900', badgeBorder: 'border-blue-300' },
  { value: 'LỚP PHONG TRÀO', label: 'LỚP PHONG TRÀO', icon: '🚩', badgeBg: 'bg-orange-100', badgeText: 'text-orange-900', badgeBorder: 'border-orange-300' },
  { value: 'TỔ TRƯỞNG TỔ 1', label: 'TỔ TRƯỞNG TỔ 1', icon: '🥇', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-900', badgeBorder: 'border-emerald-300' },
  { value: 'TỔ TRƯỞNG TỔ 2', label: 'TỔ TRƯỞNG TỔ 2', icon: '🥇', badgeBg: 'bg-sky-100', badgeText: 'text-sky-900', badgeBorder: 'border-sky-300' },
  { value: 'TỔ TRƯỞNG TỔ 3', label: 'TỔ TRƯỞNG TỔ 3', icon: '🥇', badgeBg: 'bg-violet-100', badgeText: 'text-violet-900', badgeBorder: 'border-violet-300' },
  { value: 'TỔ TRƯỞNG TỔ 4', label: 'TỔ TRƯỞNG TỔ 4', icon: '🥇', badgeBg: 'bg-rose-100', badgeText: 'text-rose-900', badgeBorder: 'border-rose-300' },
  { value: 'TỔ PHÓ TỔ 1', label: 'TỔ PHÓ TỔ 1', icon: '🥈', badgeBg: 'bg-teal-50', badgeText: 'text-teal-800', badgeBorder: 'border-teal-200' },
  { value: 'TỔ PHÓ TỔ 2', label: 'TỔ PHÓ TỔ 2', icon: '🥈', badgeBg: 'bg-cyan-50', badgeText: 'text-cyan-800', badgeBorder: 'border-cyan-200' },
  { value: 'TỔ PHÓ TỔ 3', label: 'TỔ PHÓ TỔ 3', icon: '🥈', badgeBg: 'bg-fuchsia-50', badgeText: 'text-fuchsia-800', badgeBorder: 'border-fuchsia-200' },
  { value: 'TỔ PHÓ TỔ 4', label: 'TỔ PHÓ TỔ 4', icon: '🥈', badgeBg: 'bg-pink-50', badgeText: 'text-pink-800', badgeBorder: 'border-pink-200' },
];

// --- START COMBOBOX COMPONENT ---
interface SearchableTeacherSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { username: string; fullName: string; schoolName?: string; }[];
  placeholder?: string;
  className?: string;
}

function SearchableTeacherSelect({ value, onChange, options, placeholder = '-- Chọn tài khoản giáo viên --', className = '' }: SearchableTeacherSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.username === value);
  const displayValue = selectedOption 
    ? `${selectedOption.fullName} (${selectedOption.username}) - ${selectedOption.schoolName || 'Nhà trường'}` 
    : '';

  const filteredOptions = options.filter(o => 
    o.fullName.toLowerCase().includes(search.toLowerCase()) || 
    o.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div 
        className={`w-full px-3.5 py-2.5 bg-indigo-50/50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500 cursor-pointer flex justify-between items-center ${className}`}
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setSearch('');
        }}
      >
        <span className="truncate">{displayValue || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-indigo-400" />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                placeholder="Tìm tên hoặc mã giáo viên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div
                  key={opt.username}
                  className={`px-3 py-2 text-xs cursor-pointer hover:bg-indigo-50 flex items-center justify-between ${value === opt.username ? 'bg-indigo-50/50 text-indigo-700 font-bold' : 'text-slate-700'}`}
                  onClick={() => {
                    onChange(opt.username);
                    setIsOpen(false);
                  }}
                >
                  <span className="truncate">
                    {opt.fullName} ({opt.username}) - {opt.schoolName || 'Nhà trường'}
                  </span>
                  {value === opt.username && <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-xs text-center text-slate-500">
                Không tìm thấy giáo viên nào.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// --- END COMBOBOX COMPONENT ---

interface ClassesStudentsViewProps {
  mode?: 'classes' | 'students';
  onNavigate?: (view: any) => void;
}

export const ClassesStudentsView: React.FC<ClassesStudentsViewProps> = ({ 
  mode = 'students',
  onNavigate 
}) => {
  const { 
    classes, activeClassId, setActiveClassId, addClass, bulkAddClasses, updateClass, deleteClass,
    bulkDeleteClasses, bulkUpdateClasses, deleteAllClasses,
    students, currentClassStudents, addStudent, updateStudent, deleteStudent, 
    bulkAddStudents, autoAssignRealAvatarsToClass, autoAssignAvatarsToClass, batchUpdateStudentAvatars, clearClassStudents, resetStudentsCoins,
    awardPoints, deductPoints, subjects, addSubject, updateSubject, deleteSubject,
    toggleSubjectApplied, setAppliedSubjects, resetDefaultSubjects,
    criteria, teacherProfile, updateTeacherProfile, 
    teacherRole, subjectTeacherConfig, seedSample20SubjectClasses,
    isAdmin, allTeachers, allUsers, currentUser, syncDatabaseNow,
    schoolBranches, saveSchoolBranches, reloadSchoolBranches,
    canEvaluateEmulation, canEditStudentAvatar, canResetOrAssignCoins, canCreateClassInfographic, canConfigureCoinSubjects, isSchoolAdminOrBgh,
    canAssignClassOfficer, canEditClassAvatar, canEditClassSlogan, canEditParentCommittee, isRestrictedAdminOrBgh
  } = useClassroom();

  const [activeTabMode, setActiveTabMode] = useState<'classes' | 'students'>(mode);

  React.useEffect(() => {
    if (mode) setActiveTabMode(mode);
  }, [mode]);

  const [classSearchQuery, setClassSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [adminTeacherFilter, setAdminTeacherFilter] = useState<string>('all');
  const [teacherSearchQuery, setTeacherSearchQuery] = useState<string>('');
  const [isTeacherFilterExpanded, setIsTeacherFilterExpanded] = useState<boolean>(false);
  const [teacherGroupTab, setTeacherGroupTab] = useState<'all' | 'school' | 'guest'>('all');
  const [newClassAssignedUsername, setNewClassAssignedUsername] = useState<string>('');

  // 🎯 PHÂN CẤP TÀI KHOẢN & LOGIC GIỚI HẠN TÀI NGUYÊN BẢN DEMO
  const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.username?.toLowerCase() === 'adminquantri';
  const isSchoolScopeAccount = Boolean(
    currentUser?.role === 'school_admin' || 
    currentUser?.isSchoolAdmin || 
    currentUser?.role === 'bgh' || 
    currentUser?.isBgh
  );
  // 🔐 Quản trị nhà trường, Ban giám hiệu và Quản trị hệ thống có quyền quản lý Phân hiệu & Điểm trường
  const canManageSchoolBranches = isSuperAdmin || isSchoolScopeAccount;
  // 🏛️ Quản trị nhà trường, Ban giám hiệu và Quản trị hệ thống có quyền Gán nhiệm vụ Giáo viên chủ nhiệm
  const canAssignHomeroomTeacher = isSuperAdmin || isSchoolScopeAccount || isAdmin;

  // 🌟 BỘ LỌC ĐA TẦNG THEO YÊU CẦU NGƯỜI DÙNG:
  // - Trên Admin Quản trị: Lọc xem các lớp theo Trường (School)
  // - Trên Tài khoản Trường / BGH: Lọc xem các lớp theo Phân hiệu (Branch) hoặc theo Điểm trường (Campus)
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('all');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
  const [selectedCampusFilter, setSelectedCampusFilter] = useState<string>('all');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('all');
  const [classSortBy, setClassSortBy] = useState<'grade' | 'branch' | 'campus' | 'name'>('grade');
  const [classSortOrder, setClassSortOrder] = useState<'asc' | 'desc'>('asc');

  // Demo school retired: no demo class/student limits.
  const isDemoAccount = false;
  const isClassLimitReached = isDemoAccount && classes.length >= 1;
  const isStudentLimitReached = isDemoAccount && currentClassStudents.length >= 10;

  // 🌟 Danh sách trường học hệ thống phục vụ lọc cho Super Admin
  const availableSchools = React.useMemo(() => {
    const schoolSet = new Set<string>();
    // Lấy từ các tài khoản người dùng thuộc các trường (loại trừ tài khoản admin hệ thống và guest)
    allUsers.forEach(u => {
      if (u.schoolName && u.schoolName.trim() && !u.isGuestAdmin && u.tenantType !== 'guest' && u.role !== 'admin' && u.username?.toLowerCase() !== 'adminquantri') {
        const sName = u.schoolName.trim();
        if (!sName.toLowerCase().includes('hệ thống quản trị')) {
          schoolSet.add(sName);
        }
      }
    });
    // Lấy từ các lớp học nếu có trường schoolName
    classes.forEach(c => {
      if (c.schoolName && c.schoolName.trim()) {
        const sName = c.schoolName.trim();
        if (!sName.toLowerCase().includes('hệ thống quản trị')) {
          schoolSet.add(sName);
        }
      }
    });
    return Array.from(schoolSet).sort();
  }, [allUsers, classes]);

  // 🌟 Danh mục Phân hiệu & Điểm trường hiệu dụng (Single Source of Truth)
  // Đảm bảo cả Quản trị nhà trường, Ban giám hiệu và Admin luôn có sẵn danh mục phân hiệu & điểm trường đầy đủ 100%
  const effectiveSchoolBranches = React.useMemo(() => {
    if (schoolBranches && schoolBranches.length > 0) return schoolBranches;
    return extractSchoolBranchesFromClasses(classes);
  }, [schoolBranches, classes]);

  // 🌟 Danh sách Phân hiệu phục vụ lọc cho Tài khoản Trường / BGH
  const availableBranches = React.useMemo(() => {
    const branchSet = new Set<string>();
    classes.forEach(c => {
      if (c.branch && c.branch.trim()) {
        branchSet.add(c.branch.trim());
      }
    });
    return Array.from(branchSet).sort();
  }, [classes]);

  const hasUnassignedBranch = React.useMemo(() => {
    return classes.some(c => !c.branch || !c.branch.trim());
  }, [classes]);

  // 🌟 Danh sách Điểm trường thuộc Phân hiệu đã chọn (hoặc tất cả nếu chọn 'all')
  const availableCampuses = React.useMemo(() => {
    const campusSet = new Set<string>();
    classes.forEach(c => {
      const b = (c.branch || '').trim();
      if (selectedBranchFilter === 'all' || b === selectedBranchFilter) {
        if (c.campus && c.campus.trim()) {
          campusSet.add(c.campus.trim());
        }
      }
    });
    return Array.from(campusSet).sort();
  }, [classes, selectedBranchFilter]);

  const hasUnassignedCampus = React.useMemo(() => {
    return classes.some(c => {
      if (selectedBranchFilter !== 'all' && (c.branch || '').trim() !== selectedBranchFilter) return false;
      return !c.campus || !c.campus.trim();
    });
  }, [classes, selectedBranchFilter]);

  // Tự động reset Điểm trường khi đổi Phân hiệu nếu điểm trường không khớp
  React.useEffect(() => {
    if (selectedCampusFilter !== 'all' && selectedCampusFilter !== '__unassigned__' && !availableCampuses.includes(selectedCampusFilter)) {
      setSelectedCampusFilter('all');
    }
  }, [selectedBranchFilter, availableCampuses, selectedCampusFilter]);

  // 🌟 Hàm bóc tách số khối lớp từ tên hoặc thuộc tính grade (VD: "1A1" -> 1, "Khối 2" -> 2)
  const getClassGradeNumber = React.useCallback((c: Classroom | { name?: string; grade?: string }): number => {
    if (c.grade && typeof c.grade === 'string') {
      const m = c.grade.match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
    if (c.name && typeof c.name === 'string') {
      const m = c.name.match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
    return 99;
  }, []);

  // 🌟 Chuẩn hóa nhãn hiển thị khối lớp (VD: "Khối 1", "Khối 2", "Khối 3", "Khối 4", "Khối 5")
  const getClassGradeLabel = React.useCallback((c: Classroom | { name?: string; grade?: string }): string => {
    if (c.grade && typeof c.grade === 'string' && c.grade.trim()) {
      const trimmed = c.grade.trim();
      if (/^khối\s*\d+/i.test(trimmed)) {
        const m = trimmed.match(/\d+/);
        return `Khối ${m ? m[0] : trimmed}`;
      }
      const num = trimmed.match(/^(\d+)$/);
      if (num) return `Khối ${num[1]}`;
      return trimmed;
    }
    const num = getClassGradeNumber(c);
    if (num && num !== 99) return `Khối ${num}`;
    return 'Khối khác';
  }, [getClassGradeNumber]);

  // 🌟 Danh sách Khối lớp phục vụ lọc cho Quản trị Trường & Quản trị Cao nhất
  const availableGrades = React.useMemo(() => {
    const gradeSet = new Set<string>();
    classes.forEach(c => {
      const g = getClassGradeLabel(c);
      if (g) gradeSet.add(g);
    });
    // Sắp xếp các khối theo thứ tự số: Khối 1, Khối 2, Khối 3, Khối 4, Khối 5...
    return Array.from(gradeSet).sort((a, b) => {
      const numA = (a.match(/\d+/) ? parseInt(a.match(/\d+/)![0], 10) : 99);
      const numB = (b.match(/\d+/) ? parseInt(b.match(/\d+/)![0], 10) : 99);
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b, 'vi');
    });
  }, [classes, getClassGradeLabel]);

  // 🌟 Lọc danh sách giáo viên phụ trách theo phạm vi trường của BGH / Quản trị
  // QUY TẮC CỐT LÕI: Chỉ quản lý và tổng hợp từ GIÁO VIÊN CHỦ NHIỆM (role === 'homeroom')
  const relevantTeachers = React.useMemo(() => {
    if (!currentUser) return allTeachers;
    const isMasterAdmin = currentUser.role === 'admin';
    const isGuestAdmin = currentUser.role === 'guest_admin' || currentUser.isGuestAdmin;
    const mySchool = (currentUser.schoolName || '').trim().toLowerCase();

    return allTeachers.filter(t => {
      if (t.role !== 'homeroom') return false;

      if (isMasterAdmin) return true;
      if (isGuestAdmin) {
        return t.tenantType === 'guest' || 
          (t.schoolName && t.schoolName.toLowerCase().includes('cá nhân')) || 
          (t.schoolName && t.schoolName.toLowerCase().includes('tự do'));
      }
      const tSchool = (t.schoolName || '').trim().toLowerCase();
      if (!mySchool || !tSchool) return false;
      // 🔒 STRICT MATCH: So sánh chính xác tên trường để tránh nhầm trường có tên tương tự
      return tSchool === mySchool;
    });
  }, [allTeachers, currentUser]);

  // 🌟 Danh sách giáo viên có thể gán nhiệm vụ Giáo viên chủ nhiệm cho từng lớp học
  // Cả ở tài khoản Quản trị nhà trường và Ban giám hiệu: Hiển thị đầy đủ giáo viên thuộc trường
  const assignableTeachers = React.useMemo(() => {
    if (!currentUser) return allTeachers;
    const isMasterAdmin = currentUser.role === 'admin' || currentUser.username?.toLowerCase() === 'adminquantri';
    const isGuestAdmin = currentUser.role === 'guest_admin' || currentUser.isGuestAdmin;
    const mySchool = (currentUser.schoolName || '').trim().toLowerCase();

    return allTeachers.filter(t => {
      // Loại trừ các tài khoản quản trị hệ thống
      if (t.role === 'admin' || t.username?.toLowerCase() === 'adminquantri') return false;

      if (isMasterAdmin) {
        if (selectedSchoolFilter !== 'all') {
          return (t.schoolName || '').trim().toLowerCase() === selectedSchoolFilter.trim().toLowerCase();
        }
        return true;
      }
      if (isGuestAdmin) {
        return t.tenantType === 'guest' || 
          (t.schoolName && t.schoolName.toLowerCase().includes('cá nhân')) || 
          (t.schoolName && t.schoolName.toLowerCase().includes('tự do'));
      }
      const tSchool = (t.schoolName || '').trim().toLowerCase();
      if (!mySchool || !tSchool) return false;
      return tSchool === mySchool;
    });
  }, [allTeachers, currentUser, selectedSchoolFilter]);

  // Lọc danh sách lớp học theo tài khoản giáo viên, trường học, phân hiệu, điểm trường & khối lớp
  const displayedClasses = React.useMemo(() => {
    return classes.filter(c => {
      // 1. Lọc theo Giáo viên khi Admin chọn
      if (isAdmin && adminTeacherFilter !== 'all') {
        let matchTeacher = false;
        if (c.teacherUsername) {
          matchTeacher = c.teacherUsername.toLowerCase() === adminTeacherFilter.toLowerCase();
        } else {
          const t = allTeachers.find(u => u.username.toLowerCase() === adminTeacherFilter.toLowerCase());
          matchTeacher = t ? (
            Boolean(c.teacherName && t.fullName && c.teacherName.toLowerCase() === t.fullName.toLowerCase()) ||
            c.teacherRole === t.role
          ) : true;
        }
        if (!matchTeacher) return false;
      }

      // 2. Lọc theo TRƯỜNG HỌC (Dành cho Quản trị viên Cấp cao Super Admin)
      if (isSuperAdmin && selectedSchoolFilter !== 'all') {
        const targetSchoolNorm = selectedSchoolFilter.trim().toLowerCase();
        // Kiểm tra qua schoolName của lớp
        const classSchool = (c.schoolName || '').trim().toLowerCase();
        // Hoặc kiểm tra qua giáo viên phụ trách lớp (chỉ match tài khoản giáo viên, loại trừ tài khoản admin hệ thống)
        const teacherObj = allUsers.find(u => 
          (c.teacherUsername && u.username.toLowerCase() === c.teacherUsername.toLowerCase()) ||
          (u.role !== 'admin' && u.username?.toLowerCase() !== 'adminquantri' && c.teacherName && u.fullName && c.teacherName.toLowerCase() === u.fullName.toLowerCase())
        );
        const teacherSchool = (teacherObj?.schoolName || '').trim().toLowerCase();

        // 🔒 STRICT MATCH: So sánh chính xác tên trường, không dùng includes()
        const matchClassSchool = classSchool === targetSchoolNorm;
        const matchTeacherSchool = teacherSchool === targetSchoolNorm;

        if (!matchClassSchool && !matchTeacherSchool) {
          return false;
        }
      }

      // 3. Lọc theo PHÂN HIỆU (Dành cho Quản trị Trường & BGH)
      if (selectedBranchFilter === '__unassigned__') {
        if (c.branch && c.branch.trim()) return false;
      } else if (selectedBranchFilter !== 'all') {
        const cBranch = (c.branch || '').trim().toLowerCase();
        if (cBranch !== selectedBranchFilter.trim().toLowerCase()) {
          return false;
        }
      }

      // 4. Lọc theo ĐIỂM TRƯỜNG (Dành cho Quản trị Trường & BGH)
      if (selectedCampusFilter === '__unassigned__') {
        if (c.campus && c.campus.trim()) return false;
      } else if (selectedCampusFilter !== 'all') {
        const cCampus = (c.campus || '').trim().toLowerCase();
        if (cCampus !== selectedCampusFilter.trim().toLowerCase()) {
          return false;
        }
      }

      // 5. Lọc theo KHỐI LỚP (Dành cho Quản trị Trường & Quản trị Cao nhất)
      if (selectedGradeFilter !== 'all') {
        const cGradeLabel = getClassGradeLabel(c);
        const targetNum = selectedGradeFilter.match(/\d+/)?.[0];
        const classNum = getClassGradeNumber(c).toString();

        const matchLabel = cGradeLabel.toLowerCase() === selectedGradeFilter.toLowerCase();
        const matchNum = Boolean(targetNum && targetNum === classNum);
        if (!matchLabel && !matchNum) {
          return false;
        }
      }

      // 6. Lọc theo từ khóa tìm kiếm (Tên lớp, Tên GV, Phân hiệu, Điểm trường)
      if (classSearchQuery.trim()) {
        const query = classSearchQuery.trim().toLowerCase();
        const matchName = (c.name || '').toLowerCase().includes(query);
        const matchTeacher = (c.teacherName || '').toLowerCase().includes(query);
        const matchBranch = (c.branch || '').toLowerCase().includes(query);
        const matchCampus = (c.campus || '').toLowerCase().includes(query);
        const matchGrade = (c.grade || '').toLowerCase().includes(query);
        if (!matchName && !matchTeacher && !matchBranch && !matchCampus && !matchGrade) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // 🌟 SẮP XẾP LINH HOẠT THEO YÊU CẦU: Khối lớp, Phân hiệu, Điểm trường, Tên lớp
      const gradeA = getClassGradeNumber(a);
      const gradeB = getClassGradeNumber(b);
      const branchA = (a.branch || '').trim();
      const branchB = (b.branch || '').trim();
      const campusA = (a.campus || '').trim();
      const campusB = (b.campus || '').trim();
      const nameA = (a.name || '').trim();
      const nameB = (b.name || '').trim();

      let cmp = 0;

      if (classSortBy === 'branch') {
        // Sắp xếp theo Phân hiệu: các lớp có phân hiệu xếp trước lớp chưa có
        if (branchA && !branchB) return classSortOrder === 'asc' ? -1 : 1;
        if (!branchA && branchB) return classSortOrder === 'asc' ? 1 : -1;
        cmp = branchA.localeCompare(branchB, 'vi', { sensitivity: 'base' });
        if (cmp === 0) {
          // Cùng phân hiệu -> so sánh theo Điểm trường
          if (campusA && !campusB) return -1;
          if (!campusA && campusB) return 1;
          cmp = campusA.localeCompare(campusB, 'vi', { sensitivity: 'base' });
          if (cmp === 0) {
            // Cùng điểm trường -> so sánh theo Khối lớp
            if (gradeA !== gradeB) return gradeA - gradeB;
            return nameA.localeCompare(nameB, 'vi', { numeric: true });
          }
        }
      } else if (classSortBy === 'campus') {
        // Sắp xếp theo Điểm trường: các lớp có điểm trường xếp trước
        if (campusA && !campusB) return classSortOrder === 'asc' ? -1 : 1;
        if (!campusA && campusB) return classSortOrder === 'asc' ? 1 : -1;
        cmp = campusA.localeCompare(campusB, 'vi', { sensitivity: 'base' });
        if (cmp === 0) {
          // Cùng điểm trường -> so sánh theo Phân hiệu
          if (branchA && !branchB) return -1;
          if (!branchA && branchB) return 1;
          cmp = branchA.localeCompare(branchB, 'vi', { sensitivity: 'base' });
          if (cmp === 0) {
            if (gradeA !== gradeB) return gradeA - gradeB;
            return nameA.localeCompare(nameB, 'vi', { numeric: true });
          }
        }
      } else if (classSortBy === 'name') {
        // Sắp xếp theo Tên lớp
        cmp = nameA.localeCompare(nameB, 'vi', { numeric: true });
      } else {
        // Mặc định: Sắp xếp theo Khối lớp (grade)
        if (gradeA !== gradeB) {
          cmp = gradeA - gradeB;
        } else {
          // Cùng khối -> so sánh theo Phân hiệu -> Điểm trường -> Tên lớp
          if (branchA !== branchB) {
            cmp = branchA.localeCompare(branchB, 'vi', { sensitivity: 'base' });
          } else if (campusA !== campusB) {
            cmp = campusA.localeCompare(campusB, 'vi', { sensitivity: 'base' });
          } else {
            cmp = nameA.localeCompare(nameB, 'vi', { numeric: true });
          }
        }
      }

      return classSortOrder === 'asc' ? cmp : -cmp;
    });
  }, [
    classes, 
    isAdmin, 
    isSuperAdmin, 
    adminTeacherFilter, 
    selectedSchoolFilter, 
    selectedBranchFilter, 
    selectedCampusFilter, 
    selectedGradeFilter,
    classSortBy,
    classSortOrder,
    classSearchQuery,
    allTeachers, 
    allUsers,
    getClassGradeLabel,
    getClassGradeNumber
  ]);
  
  // Selection for bulk student actions
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);
  const [isDeleteAllClassesOpen, setIsDeleteAllClassesOpen] = useState(false);

  // Selection for bulk class actions (all 3 roles: admin, homeroom, subject)
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [isBulkClassDeleteOpen, setIsBulkClassDeleteOpen] = useState(false);
  const [isBulkClassEditOpen, setIsBulkClassEditOpen] = useState(false);

  // Bulk edit form states
  const [bulkEditGrade, setBulkEditGrade] = useState<string>('keep');
  const [bulkEditYear, setBulkEditYear] = useState<string>('keep');
  const [bulkEditTeacher, setBulkEditTeacher] = useState<string>('');
  const [bulkEditColor, setBulkEditColor] = useState<string>('keep');
  const [bulkEditSlogan, setBulkEditSlogan] = useState<string>('');

  // Danh sách môn học được áp dụng cho lớp hiện tại (enabled !== false)
  const appliedSubjects = React.useMemo(() => {
    const list = subjects.filter(s => s.enabled !== false);
    return list.length > 0 ? list : subjects;
  }, [subjects]);

  // Bulk Award Points state (Yêu cầu: Gán xu hàng loạt theo môn học)
  const [isBulkAwardOpen, setIsBulkAwardOpen] = useState(false);
  const [bulkAwardMode, setBulkAwardMode] = useState<'xu' | 'minus' | 'sao'>('xu');
  const [bulkAwardCoins, setBulkAwardCoins] = useState(1);
  const [bulkAwardSubject, setBulkAwardSubject] = useState('GHI CHUNG / NỀ NẾP');
  const [bulkAwardReason, setBulkAwardReason] = useState('');

  // Reset Coins state (Reset xu về 0)
  const [isBulkResetCoinsOpen, setIsBulkResetCoinsOpen] = useState(false);
  const [isClassResetCoinsOpen, setIsClassResetCoinsOpen] = useState(false);

  // Active Subject Selector for Quick Point Evaluation (User Request: Môn mặc định GHI CHUNG / NỀ NẾP hoặc Môn của GVBM)
  const [activeEvalSubject, setActiveEvalSubject] = useState<string>(
    teacherRole === 'subject' ? (subjectTeacherConfig.subjectName || 'TIN HỌC') : 'GHI CHUNG / NỀ NẾP'
  );

  // Đảm bảo activeEvalSubject cập nhật khi đổi vai trò hoặc danh sách môn
  React.useEffect(() => {
    if (teacherRole === 'subject') {
      setActiveEvalSubject(subjectTeacherConfig.subjectName || 'TIN HỌC');
    } else if (appliedSubjects.length > 0 && !appliedSubjects.some(s => s.name === activeEvalSubject)) {
      setActiveEvalSubject(appliedSubjects[0].name);
    }
  }, [appliedSubjects, teacherRole, subjectTeacherConfig.subjectName]);

  // Modals & form states for CLASS MANAGEMENT (User Request 1)
  const [isClassStatsModalOpen, setIsClassStatsModalOpen] = useState(false);
  const [isInitSubjectClassesModalOpen, setIsInitSubjectClassesModalOpen] = useState(false);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('Khối 4');
  const [newClassTeacher, setNewClassTeacher] = useState(teacherProfile.name || currentUser?.fullName || '');
  const [newClassYear, setNewClassYear] = useState(teacherProfile.academicYear || '2026–2027');
  const [newClassColor, setNewClassColor] = useState(CLASS_COLORS[0]);
  const [newClassBranch, setNewClassBranch] = useState('');
  const [newClassCampus, setNewClassCampus] = useState('');
  const [newClassAvatar, setNewClassAvatar] = useState(CLASS_AVATARS[0].url);
  const [newClassOriginalAvatar, setNewClassOriginalAvatar] = useState(CLASS_AVATARS[0].url);
  const [newClassAvatarScale, setNewClassAvatarScale] = useState(1);
  const [newClassAvatarPosition, setNewClassAvatarPosition] = useState({ x: 0, y: 0 });
  const [isNewClassAvatarEditorOpen, setIsNewClassAvatarEditorOpen] = useState(false);
  const [avatarEditingClass, setAvatarEditingClass] = useState<Classroom | null>(null);

  // Parent Committee & Slogan states for New Class (Bỏ trống mặc định)
  const [newClassSlogan, setNewClassSlogan] = useState('');
  const [newParentHeadName, setNewParentHeadName] = useState('');
  const [newParentHeadPhone, setNewParentHeadPhone] = useState('');
  const [newParentDeputyName, setNewParentDeputyName] = useState('');
  const [newParentDeputyPhone, setNewParentDeputyPhone] = useState('');
  const [newParentMember1Name, setNewParentMember1Name] = useState('');
  const [newParentMember1Phone, setNewParentMember1Phone] = useState('');
  const [newParentMember2Name, setNewParentMember2Name] = useState('');
  const [newParentMember2Phone, setNewParentMember2Phone] = useState('');

  // 🌟 MODAL & FORM IMPORT DANH SÁCH LỚP HỌC HÀNG LOẠT (User Request: Bulk Class Import)
  const [isImportClassesModalOpen, setIsImportClassesModalOpen] = useState(false);
  const [excelParsedClasses, setExcelParsedClasses] = useState<Array<Omit<Classroom, 'id'>>>([]);
  const [isClassesPreviewOpen, setIsClassesPreviewOpen] = useState(false);
  const importClassesFileInputRef = useRef<HTMLInputElement>(null);

  // 🏛️ CẤU HÌNH DANH MỤC PHÂN HIỆU & ĐIỂM TRƯỜNG TOÀN TRƯỜNG (User Request)
  const [isSchoolBranchModalOpen, setIsSchoolBranchModalOpen] = useState(false);
  const [tempBranches, setTempBranches] = useState<SchoolBranch[]>([]);
  const [newBranchInputName, setNewBranchInputName] = useState('');
  const [newCampusInputs, setNewCampusInputs] = useState<{ [branchId: string]: string }>({});
  const [isSavingBranches, setIsSavingBranches] = useState(false);

  // Cờ chuyển đổi giữa chọn từ danh mục trường và nhập tự do
  const [isCustomNewBranch, setIsCustomNewBranch] = useState(false);
  const [isCustomNewCampus, setIsCustomNewCampus] = useState(false);
  const [isCustomEditBranch, setIsCustomEditBranch] = useState(false);
  const [isCustomEditCampus, setIsCustomEditCampus] = useState(false);

  const newClassAvatarInputRef = useRef<HTMLInputElement>(null);
  const editClassAvatarInputRef = useRef<HTMLInputElement>(null);

  const handleUploadNewClassAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const highRes = await compressImage(file, 2048, 1536, 0.94);
        setNewClassAvatar(highRes);
        setNewClassOriginalAvatar(highRes);
        setNewClassAvatarScale(1);
        setNewClassAvatarPosition({ x: 0, y: 0 });
        setIsNewClassAvatarEditorOpen(true);
      } catch (err) {
        console.error('Lỗi khi tải ảnh lớp mới, fallback FileReader:', err);
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            const res = ev.target.result as string;
            setNewClassAvatar(res);
            setNewClassOriginalAvatar(res);
            setNewClassAvatarScale(1);
            setNewClassAvatarPosition({ x: 0, y: 0 });
            setIsNewClassAvatarEditorOpen(true);
          }
        };
        reader.readAsDataURL(file);
      } finally {
        e.target.value = '';
      }
    }
  };

  const handleUploadEditClassAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingClass) {
      try {
        const highRes = await compressImage(file, 2048, 1536, 0.94);
        const updated = {
          ...editingClass,
          avatar: highRes,
          originalAvatar: highRes,
          avatarScale: 1,
          avatarPosition: { x: 0, y: 0 }
        };
        setEditingClass(updated);
        // Mở ngay modal căn chỉnh và thu phóng ảnh
        setAvatarEditingClass(updated);
      } catch (err) {
        console.error('Lỗi khi tải ảnh sửa lớp, fallback FileReader:', err);
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            const newUrl = ev.target.result as string;
            const updated = {
              ...editingClass,
              avatar: newUrl,
              originalAvatar: newUrl,
              avatarScale: 1,
              avatarPosition: { x: 0, y: 0 }
            };
            setEditingClass(updated);
            setAvatarEditingClass(updated);
          }
        };
        reader.readAsDataURL(file);
      } finally {
        e.target.value = '';
      }
    }
  };

  // Edit Class Modal
  const [editingClass, setEditingClass] = useState<Classroom | null>(null);
  const [deleteConfirmClass, setDeleteConfirmClass] = useState<Classroom | null>(null);

  // Subject Configuration Modal (User Request 2: "CẤU HÌNH NHẬN XU")
  const [isSubjectConfigOpen, setIsSubjectConfigOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectColor, setNewSubjectColor] = useState('#3B82F6');
  const [newSubjectIcon, setNewSubjectIcon] = useState('BookOpen');

  // Excel Import & Template Modal (User Request 9)
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const [excelParsedStudents, setExcelParsedStudents] = useState<Array<{ name: string; gender: 'Nam' | 'Nữ'; birthDate?: string; group?: string; role?: string }>>([]);
  const [isExcelPreviewOpen, setIsExcelPreviewOpen] = useState(false);
  const [isExportStudentListOpen, setIsExportStudentListOpen] = useState(false);

  // Single Add student modal (Yêu cầu 1: Thêm đầy đủ thông tin kể cả chức vụ - Tối đa 3 chức vụ)
  const [isSingleAddOpen, setIsSingleAddOpen] = useState(false);
  const [singleName, setSingleName] = useState('');
  const [singleBirthDate, setSingleBirthDate] = useState('');
  const [singleGender, setSingleGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [singleGroup, setSingleGroup] = useState('Tổ 1');
  const [singleRoles, setSingleRoles] = useState<string[]>([]);

  // Edit student modal (Tối đa 3 chức vụ)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingRoles, setEditingRoles] = useState<string[]>([]);
  
  // Quick Role modal (Chỉ định tối đa 3 chức vụ cho 1 học sinh)
  const [quickRoleStudent, setQuickRoleStudent] = useState<Student | null>(null);
  const [studentSelectedRoles, setStudentSelectedRoles] = useState<string[]>([]);

  // Bulk Role Modal (Gán chức vụ đồng loạt, tối đa 3 chức vụ)
  const [isBulkRoleModalOpen, setIsBulkRoleModalOpen] = useState(false);
  const [bulkSelectedRoles, setBulkSelectedRoles] = useState<string[]>([]);
  
  // Avatar editor modal
  const [avatarEditingStudent, setAvatarEditingStudent] = useState<Student | null>(null);

  // Auto Assign Avatar Modal states
  const [isAutoAssignAvatarModalOpen, setIsAutoAssignAvatarModalOpen] = useState(false);
  const [autoAssignInitialType, setAutoAssignInitialType] = useState<AvatarSourceType>('default');

  // Group Photo Avatar Cropper Modal state
  const [isGroupPhotoModalOpen, setIsGroupPhotoModalOpen] = useState(false);

  // Quick Award / Tặng Sao / Trừ Xu Modal (User Request 3)
  const [rewardingStudent, setRewardingStudent] = useState<Student | null>(null);
  const [rewardMode, setRewardMode] = useState<'xu' | 'minus' | 'sao'>('xu');
  const [customCoins, setCustomCoins] = useState(1);
  const [selectedSubjectForAward, setSelectedSubjectForAward] = useState('GHI CHUNG / NỀ NẾP');
  const [customReason, setCustomReason] = useState('');

  const activeClass = classes.find(c => c.id === activeClassId) || classes[0];

  // Filtering students (Tìm kiếm theo tên, STT, chức vụ; Lọc theo Tổ và Chức vụ)
  const filteredStudents = currentClassStudents.filter(s => {
    const sRoles = getStudentRolesList(s);
    const rolesCombined = (s.role ? `${s.role} ` : '') + sRoles.join(' ');
    const matchSearch = 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.stt.toString().includes(searchQuery) ||
      rolesCombined.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchSearch) return false;
    if (selectedGroupFilter !== 'all' && (s.group || 'Tổ 1') !== selectedGroupFilter) return false;
    if (selectedRoleFilter !== 'all') {
      if (selectedRoleFilter === 'officers') {
        if (sRoles.length === 0 && (!s.role || !s.role.trim())) return false;
      } else if (selectedRoleFilter === 'monitor') {
        if (!rolesCombined.toLowerCase().includes('lớp trưởng')) return false;
      } else if (selectedRoleFilter === 'academic_deputy') {
        if (!rolesCombined.toLowerCase().includes('học tập')) return false;
      } else if (selectedRoleFilter === 'activity_deputy') {
        if (!rolesCombined.toLowerCase().includes('phong trào')) return false;
      } else if (selectedRoleFilter === 'team_leader') {
        if (!rolesCombined.toLowerCase().includes('tổ trưởng')) return false;
      } else if (selectedRoleFilter === 'team_vice') {
        if (!rolesCombined.toLowerCase().includes('tổ phó')) return false;
      } else {
        const matchSpecific = sRoles.some(r => r.toLowerCase() === selectedRoleFilter.toLowerCase()) ||
          (s.role && s.role.toLowerCase().includes(selectedRoleFilter.toLowerCase()));
        if (!matchSpecific) return false;
      }
    }
    return true;
  });

  // 1. CLASS MANAGEMENT HANDLERS (User Request 1 & 2)
  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (isClassLimitReached) {
      alert('Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!');
      return;
    }
    if (!newClassName.trim()) return;

    const assignedTeacher = canAssignHomeroomTeacher && newClassAssignedUsername
      ? allTeachers.find(t => t.username.toLowerCase() === newClassAssignedUsername.toLowerCase())
      : null;
    const effectiveTeacherUsername = canAssignHomeroomTeacher && newClassAssignedUsername
      ? newClassAssignedUsername
      : (currentUser?.username || '');
    const effectiveRole = canAssignHomeroomTeacher 
      ? 'homeroom' 
      : (currentUser?.role === 'subject' ? 'subject' : 'homeroom');

    addClass({
      name: newClassName.trim(),
      grade: newClassGrade,
      branch: newClassBranch.trim() ? newClassBranch.trim() : null,
      campus: (newClassBranch.trim() && newClassCampus.trim()) ? newClassCampus.trim() : null,
      teacherUsername: effectiveTeacherUsername,
      teacherRole: effectiveRole,
      isHomeroom: effectiveRole === 'homeroom',
      teacherName: canAssignHomeroomTeacher ? (assignedTeacher?.fullName || newClassTeacher.trim()) : (newClassTeacher.trim() || teacherProfile.name || currentUser?.fullName || ''),
      academicYear: newClassYear.trim() || teacherProfile.academicYear || '2026–2027',
      color: newClassColor,
      avatar: canEditClassAvatar ? newClassAvatar : CLASS_AVATARS[0].url,
      originalAvatar: canEditClassAvatar ? newClassOriginalAvatar : CLASS_AVATARS[0].url,
      avatarScale: canEditClassAvatar ? newClassAvatarScale : 1,
      avatarPosition: canEditClassAvatar ? newClassAvatarPosition : { x: 0, y: 0 },
      slogan: canEditClassSlogan ? newClassSlogan.trim() : '',
      parentCommittee: canEditParentCommittee ? {
        head: { name: newParentHeadName.trim(), phone: newParentHeadPhone.trim(), roleTitle: 'Trưởng ban phụ huynh' },
        deputy: { name: newParentDeputyName.trim(), phone: newParentDeputyPhone.trim(), roleTitle: 'Phó ban phụ huynh' },
        member1: { name: newParentMember1Name.trim(), phone: newParentMember1Phone.trim(), roleTitle: 'Ủy viên ban phụ huynh' },
        member2: { name: newParentMember2Name.trim(), phone: newParentMember2Phone.trim(), roleTitle: 'Ủy viên ban phụ huynh' }
      } : undefined
    });
    setNewClassName('');
    setNewClassBranch('');
    setNewClassCampus('');
    setNewClassAvatarScale(1);
    setNewClassAvatarPosition({ x: 0, y: 0 });
    setIsCreateClassOpen(false);
    confetti({ particleCount: 40, spread: 60 });
  };

  // 🌟 TẢI FILE MẪU EXCEL KHỞI TẠO LỚP HỌC HÀNG LOẠT
  const handleDownloadClassExcelTemplate = () => {
    const templateRows = [
      {
        'STT': 1,
        'Tên lớp': '1A1',
        'Khối lớp': 'Khối 1',
        'Năm học': '2026–2027',
        'Tên giáo viên chủ nhiệm': 'Nguyễn Văn A',
        'Tài khoản GVCN': 'gv_lop1a1',
        'Phân hiệu': 'Trung tâm',
        'Điểm trường': 'Điểm Trung tâm',
        'Slogan': 'Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng'
      },
      {
        'STT': 2,
        'Tên lớp': '1A2',
        'Khối lớp': 'Khối 1',
        'Năm học': '2026–2027',
        'Tên giáo viên chủ nhiệm': 'Trần Thị B',
        'Tài khoản GVCN': 'gv_lop1a2',
        'Phân hiệu': 'Trung tâm',
        'Điểm trường': 'Điểm Trung tâm',
        'Slogan': 'Mỗi ngày đến trường là một ngày vui'
      },
      {
        'STT': 3,
        'Tên lớp': '2A1',
        'Khối lớp': 'Khối 2',
        'Năm học': '2026–2027',
        'Tên giáo viên chủ nhiệm': 'Lê Văn C',
        'Tài khoản GVCN': 'gv_lop2a1',
        'Phân hiệu': 'Trung tâm',
        'Điểm trường': 'Điểm Trung tâm',
        'Slogan': 'Đoàn kết, kỷ luật, yêu thương'
      },
      {
        'STT': 4,
        'Tên lớp': '3A1',
        'Khối lớp': 'Khối 3',
        'Năm học': '2026–2027',
        'Tên giáo viên chủ nhiệm': 'Phạm Thị D',
        'Tài khoản GVCN': 'gv_lop3a1',
        'Phân hiệu': 'Phân hiệu 2',
        'Điểm trường': 'Điểm phụ',
        'Slogan': 'Chăm chỉ học tập, rèn đức luyện tài'
      },
      {
        'STT': 5,
        'Tên lớp': '4A1',
        'Khối lớp': 'Khối 4',
        'Năm học': '2026–2027',
        'Tên giáo viên chủ nhiệm': 'Hoàng Văn E',
        'Tài khoản GVCN': 'gv_lop4a1',
        'Phân hiệu': 'Trung tâm',
        'Điểm trường': 'Điểm Trung tâm',
        'Slogan': 'Tự tin tỏa sáng, vươn tầm ước mơ'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [
      { wch: 6 },  // STT
      { wch: 12 }, // Tên lớp
      { wch: 12 }, // Khối lớp
      { wch: 14 }, // Năm học
      { wch: 26 }, // Tên giáo viên chủ nhiệm
      { wch: 20 }, // Tài khoản GVCN
      { wch: 18 }, // Phân hiệu
      { wch: 20 }, // Điểm trường
      { wch: 45 }  // Slogan
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_Sach_Lop_Hoc");
    const schoolNameSlug = (currentUser?.schoolName || 'Nha_Truong').replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(wb, `Mau_Danh_Sach_Lop_Hoc_${schoolNameSlug}.xlsx`);
  };

  // 🌟 ĐỌC FILE EXCEL KHỞI TẠO HÀNG LOẠT LỚP HỌC
  const handleUploadClassExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws);

        const parsed: Array<Omit<Classroom, 'id'>> = [];

        rawData.forEach((row, idx) => {
          const classNameVal = row['Tên lớp'] || row['Tên Lớp'] || row['Lớp'] || row['ClassName'] || row['Class'] || row['name'];
          if (!classNameVal || typeof classNameVal !== 'string' || !classNameVal.trim()) return;

          const gradeVal = row['Khối lớp'] || row['Khối'] || row['Khoi'] || row['grade'] || 'Khối 1';
          const yearVal = row['Năm học'] || row['Năm Học'] || row['Nam hoc'] || row['academicYear'] || '2026–2027';
          const teacherNameVal = row['Tên giáo viên chủ nhiệm'] || row['Tên GVCN'] || row['Giáo viên'] || row['teacherName'] || '';
          let teacherUsernameVal = (row['Tài khoản GVCN'] || row['Tài khoản'] || row['Username'] || row['teacherUsername'] || '').trim().toLowerCase();

          // Tự động đối chiếu tài khoản nếu người dùng chỉ nhập họ tên
          if (!teacherUsernameVal && teacherNameVal) {
            const matchedTeacher = allTeachers.find(t => 
              t.fullName.toLowerCase().trim() === teacherNameVal.toLowerCase().trim() ||
              t.fullName.toLowerCase().includes(teacherNameVal.toLowerCase().trim())
            );
            if (matchedTeacher) {
              teacherUsernameVal = matchedTeacher.username.toLowerCase();
            }
          }

          const branchVal = row['Phân hiệu'] || row['Phan hieu'] || row['branch'] || '';
          const campusVal = row['Điểm trường'] || row['Diem truong'] || row['campus'] || '';
          const sloganVal = row['Slogan'] || row['Khẩu hiệu'] || row['slogan'] || 'Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng';

          const colorPick = CLASS_COLORS[idx % CLASS_COLORS.length];
          const avatarPick = CLASS_AVATARS[idx % CLASS_AVATARS.length].url;

          parsed.push({
            name: String(classNameVal).trim(),
            grade: String(gradeVal).trim(),
            academicYear: String(yearVal).trim(),
            teacherName: String(teacherNameVal).trim() || 'Giáo viên Chủ nhiệm',
            teacherUsername: teacherUsernameVal || (currentUser?.username || ''),
            teacherRole: 'homeroom',
            isHomeroom: true,
            schoolName: currentUser?.schoolName || undefined,
            branch: String(branchVal).trim() || undefined,
            campus: String(campusVal).trim() || undefined,
            slogan: String(sloganVal).trim(),
            color: colorPick,
            avatar: avatarPick,
            originalAvatar: avatarPick,
            avatarScale: 1,
            avatarPosition: { x: 0, y: 0 }
          });
        });

        if (parsed.length > 0) {
          setExcelParsedClasses(parsed);
          setIsClassesPreviewOpen(true);
        } else {
          alert('Không tìm thấy dữ liệu lớp học trong file Excel. Vui lòng kiểm tra các tiêu đề cột: "Tên lớp", "Khối lớp", "Tên giáo viên chủ nhiệm", "Tài khoản GVCN".');
        }
      } catch (err) {
        console.error(err);
        alert('Lỗi đọc file Excel. Vui lòng đảm bảo file có định dạng .xlsx, .xls hoặc .csv hợp lệ.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // 🌟 XÁC NHẬN TẠO HÀNG LOẠT LỚP HỌC TỪ BẢNG XEM TRƯỚC
  const handleConfirmBulkAddClasses = () => {
    if (excelParsedClasses.length === 0) return;
    if (isDemoAccount && (classes.length + excelParsedClasses.length) > 1) {
      alert('Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!');
      return;
    }

    bulkAddClasses(excelParsedClasses);
    setIsClassesPreviewOpen(false);
    setIsImportClassesModalOpen(false);
    setExcelParsedClasses([]);
    confetti({ particleCount: 60, spread: 80 });
  };

  const handleSaveEditClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass || !editingClass.name.trim()) return;

    const trimmedTeacherName = editingClass.teacherName?.trim() || teacherProfile.name || currentUser?.fullName || '';
    const trimmedAcademicYear = editingClass.academicYear?.trim() || teacherProfile.academicYear || '2026–2027';
    const isAssignedBySchoolOrAdmin = canAssignHomeroomTeacher && Boolean(editingClass.teacherUsername);
    const isHome = isAssignedBySchoolOrAdmin 
      ? true 
      : (editingClass.isHomeroom !== undefined 
          ? editingClass.isHomeroom 
          : (editingClass.teacherRole !== 'subject' && editingClass.teacherRole !== 'GVBM'));

    const currentCls = classes.find(c => c.id === editingClass.id);
    updateClass(editingClass.id, {
      name: editingClass.name.trim(),
      grade: editingClass.grade,
      branch: (editingClass.branch || '').trim() ? (editingClass.branch || '').trim() : null,
      campus: ((editingClass.branch || '').trim() && (editingClass.campus || '').trim()) ? (editingClass.campus || '').trim() : null,
      teacherUsername: editingClass.teacherUsername || (canAssignHomeroomTeacher ? '' : (currentUser?.username || '')),
      teacherRole: isAssignedBySchoolOrAdmin ? 'homeroom' : editingClass.teacherRole,
      isHomeroom: isHome,
      teacherName: trimmedTeacherName,
      academicYear: trimmedAcademicYear,
      color: editingClass.color,
      avatar: canEditClassAvatar ? editingClass.avatar : (currentCls?.avatar || editingClass.avatar),
      originalAvatar: canEditClassAvatar ? editingClass.originalAvatar : (currentCls?.originalAvatar || editingClass.originalAvatar),
      avatarScale: canEditClassAvatar ? (editingClass.avatarScale || 1) : (currentCls?.avatarScale || 1),
      avatarPosition: canEditClassAvatar ? (editingClass.avatarPosition || { x: 0, y: 0 }) : (currentCls?.avatarPosition || { x: 0, y: 0 }),
      slogan: canEditClassSlogan ? editingClass.slogan : (currentCls?.slogan || ''),
      parentCommittee: canEditParentCommittee ? editingClass.parentCommittee : currentCls?.parentCommittee
    });

    // Yêu cầu 2: Thông tin giáo viên và ban phụ huynh thông nhau 2 chiều giữa Cài đặt và Quản lý lớp học
    // Cập nhật ngược lại vào hồ sơ giáo viên và thông tin tài khoản nếu là GVCN hoặc đang thao tác lớp chủ nhiệm
    if (teacherRole === 'homeroom' || !isAdmin || editingClass.id === activeClassId) {
      updateTeacherProfile({
        name: trimmedTeacherName,
        academicYear: trimmedAcademicYear
      });
    }

    setEditingClass(null);
  };

  // 🏛️ CÁC HÀM XỬ LÝ CẤU HÌNH PHÂN HIỆU & ĐIỂM TRƯỜNG
  const handleOpenSchoolBranchModal = () => {
    if (!canManageSchoolBranches) {
      alert('Chỉ tài khoản Quản trị nhà trường, Ban giám hiệu và Quản trị hệ thống mới có quyền thêm mới, chỉnh sửa hoặc xóa danh mục phân hiệu và điểm trường.');
      return;
    }
    const branchesToUse = (schoolBranches && schoolBranches.length > 0)
      ? schoolBranches
      : (effectiveSchoolBranches.length > 0 ? effectiveSchoolBranches : []);

    if (branchesToUse.length > 0) {
      setTempBranches(JSON.parse(JSON.stringify(branchesToUse)));
      // Nếu context chưa có thì tự động lưu để đồng bộ liên thông
      if (!schoolBranches || schoolBranches.length === 0) {
        saveSchoolBranches(branchesToUse);
      }
    } else {
      setTempBranches([]);
    }
    setNewBranchInputName('');
    setNewCampusInputs({});
    setIsSchoolBranchModalOpen(true);
  };

  const handleAddTempBranch = () => {
    const trimmed = newBranchInputName.trim();
    if (!trimmed) return;
    const newBranch: SchoolBranch = {
      id: `branch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: trimmed,
      campuses: []
    };
    setTempBranches(prev => [...prev, newBranch]);
    setNewBranchInputName('');
  };

  const handleRemoveTempBranch = (branchId: string) => {
    setTempBranches(prev => prev.filter(b => b.id !== branchId));
  };

  const handleUpdateTempBranchName = (branchId: string, name: string) => {
    setTempBranches(prev => prev.map(b => b.id === branchId ? { ...b, name } : b));
  };

  const handleAddTempCampus = (branchId: string) => {
    const val = (newCampusInputs[branchId] || '').trim();
    if (!val) return;
    setTempBranches(prev => prev.map(b => {
      if (b.id !== branchId) return b;
      const newCampus: SchoolCampus = {
        id: `campus-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: val
      };
      return {
        ...b,
        campuses: [...(b.campuses || []), newCampus]
      };
    }));
    setNewCampusInputs(prev => ({ ...prev, [branchId]: '' }));
  };

  const handleRemoveTempCampus = (branchId: string, campusId: string) => {
    setTempBranches(prev => prev.map(b => {
      if (b.id !== branchId) return b;
      return {
        ...b,
        campuses: (b.campuses || []).filter(c => c.id !== campusId)
      };
    }));
  };

  const handleSaveAllSchoolBranches = async () => {
    if (!canManageSchoolBranches) {
      alert('Chỉ tài khoản Quản trị nhà trường, Ban giám hiệu và Quản trị hệ thống mới có quyền lưu cấu hình phân hiệu và điểm trường.');
      return;
    }
    const targetSchool = (currentUser?.schoolName || (selectedSchoolFilter !== 'all' ? selectedSchoolFilter : '') || '').trim();
    if (!targetSchool) {
      alert('Vui lòng kiểm tra lại thông tin nhà trường trước khi lưu cấu hình.');
      return;
    }
    setIsSavingBranches(true);
    try {
      const ok = await saveSchoolBranches(tempBranches, targetSchool);
      if (ok) {
        confetti({ particleCount: 50, spread: 70 });
        setIsSchoolBranchModalOpen(false);
      } else {
        alert('Đã lưu cấu hình phân hiệu và điểm trường thành công!');
        setIsSchoolBranchModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Không thể lưu cấu hình. Vui lòng thử lại.');
    } finally {
      setIsSavingBranches(false);
    }
  };

  const handleConfirmDeleteClass = () => {
    if (!deleteConfirmClass) return;
    if (isSuperAdmin) {
      const confirmed = window.confirm(
        `⚠️ BẠN ĐANG THỰC THI QUYỀN QUẢN TRỊ TỐI CAO:\n\nBạn có chắc chắn muốn xóa Lớp học "${deleteConfirmClass.name}"? Mọi học sinh trong lớp cũng sẽ bị xóa vĩnh viễn trên toàn hệ thống CSDL Của trường/giáo viên sở hữu.`
      );
      if (!confirmed) return;
    }
    deleteClass(deleteConfirmClass.id);
    setDeleteConfirmClass(null);
  };

  const handleConfirmDeleteAllClasses = () => {
    if (isSuperAdmin) {
      const confirmed = window.confirm(
        `⚠️ BẠN ĐANG THỰC THI QUYỀN QUẢN TRỊ TỐI CAO:\n\nCẢNH BÁO NGUY HIỂM: Thao tác này sẽ xóa sạch TOÀN BỘ ${classes.length} LỚP HỌC và TẤT CẢ HỌC SINH trên toàn bộ hệ thống! Bạn có chắc chắn tuyệt đối muốn thực hiện không?`
      );
      if (!confirmed) return;
    }
    deleteAllClasses();
    setIsDeleteAllClassesOpen(false);
    confetti({ particleCount: 40, spread: 60 });
  };

  // 2. SUBJECT CONFIGURATION HANDLERS (User Request 2: "CẤU HÌNH NHẬN XU")
  const handleAddNewSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    addSubject(newSubjectName.trim(), newSubjectColor, newSubjectIcon);
    setNewSubjectName('');
    confetti({ particleCount: 25, spread: 45 });
  };

  const handleSaveEditSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject || !editingSubject.name.trim()) return;
    updateSubject(editingSubject.id, {
      name: editingSubject.name.trim(),
      color: editingSubject.color,
      icon: editingSubject.icon
    });
    setEditingSubject(null);
  };

  const handleApplyAllSubjects = () => {
    setAppliedSubjects(subjects.map(s => s.id));
    confetti({ particleCount: 25, spread: 40 });
  };

  // Danh sách môn học chuẩn giáo viên chủ nhiệm thường dạy (Toán, Tiếng Việt, Đạo Đức, TN&XH, Lịch sử & Địa lí, Khoa học + Ghi chung/Nề nếp)
  const isHomeroomSubject = (name: string) => {
    const n = name.trim().toLowerCase();
    return [
      'ghi chung / nề nếp',
      'toán',
      'tiếng việt',
      'đạo đức',
      'tn & xã hội',
      'tự nhiên & xã hội',
      'tự nhiên và xã hội',
      'lịch sử & địa lý',
      'lịch sử & địa lí',
      'lịch sử và địa lý',
      'lịch sử và địa lí',
      'khoa học'
    ].includes(n);
  };

  const handleApplyOnlyCoreSubjects = () => {
    const coreIds = subjects
      .filter(s => s.isDefault || isHomeroomSubject(s.name))
      .map(s => s.id);
    setAppliedSubjects(coreIds);
    confetti({ particleCount: 25, spread: 40 });
  };

  const handleResetDefaultSubjects = () => {
    if (confirm('Khôi phục danh sách môn học chuẩn theo hệ thống (bao gồm các môn cốt lõi của GVCN: Toán, Tiếng Việt, Đạo Đức, TN&XH, Lịch sử & Địa lí, Khoa học...)?')) {
      resetDefaultSubjects();
      confetti({ particleCount: 30, spread: 50 });
    }
  };

  // 3. EXCEL TEMPLATE DOWNLOAD (User Request 9 & Yêu cầu 1)
  const handleDownloadExcelTemplate = () => {
    const templateRows = [
      {
        'STT': 1,
        'Họ và tên': 'Nguyễn Văn An',
        'Ngày tháng năm sinh': '12/03/2016',
        'Giới tính': 'Nam',
        'Tổ': 'Tổ 1',
        'Chức vụ': 'LỚP TRƯỞNG • TỔ TRƯỞNG TỔ 1'
      },
      {
        'STT': 2,
        'Họ và tên': 'Trần Thị Ngọc Ánh',
        'Ngày tháng năm sinh': '25/08/2016',
        'Giới tính': 'Nữ',
        'Tổ': 'Tổ 1',
        'Chức vụ': 'LỚP PHÓ HỌC TẬP • TỔ PHÓ TỔ 1'
      },
      {
        'STT': 3,
        'Họ và tên': 'Phạm Minh Châu',
        'Ngày tháng năm sinh': '09/06/2016',
        'Giới tính': 'Nữ',
        'Tổ': 'Tổ 1',
        'Chức vụ': 'LỚP PHONG TRÀO'
      },
      {
        'STT': 4,
        'Họ và tên': 'Hoàng Quốc Cường',
        'Ngày tháng năm sinh': '18/11/2016',
        'Giới tính': 'Nam',
        'Tổ': 'Tổ 1',
        'Chức vụ': 'TỔ TRƯỞNG TỔ 1'
      },
      {
        'STT': 5,
        'Họ và tên': 'Vũ Mai Dung',
        'Ngày tháng năm sinh': '04/04/2016',
        'Giới tính': 'Nữ',
        'Tổ': 'Tổ 1',
        'Chức vụ': 'TỔ PHÓ TỔ 1'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [
      { wch: 8 },  // STT
      { wch: 26 }, // Họ và tên
      { wch: 22 }, // Ngày tháng năm sinh
      { wch: 12 }, // Giới tính
      { wch: 12 }, // Tổ
      { wch: 28 }  // Chức vụ (tối đa 3 chức vụ)
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_Sach_Hoc_Sinh");
    XLSX.writeFile(wb, `Mau_Danh_Sach_Hoc_Sinh_${activeClass?.name || 'Lop'}.xlsx`);
  };

  // 4. EXCEL UPLOAD
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isStudentLimitReached) {
      alert('Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!');
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // Đảm bảo không bị sót dòng trống hoặc thiếu cột (User Request 2)
        const rawData: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const parsed: Array<{ name: string; gender: 'Nam' | 'Nữ'; birthDate?: string; group?: string; role?: string; roles?: string[] }> = [];

        rawData.forEach((row) => {
          const nameVal = row['Họ và tên'] || row['Họ và Tên'] || row['Họ tên'] || row['Tên'] || row['Ho va ten'] || row['Name'] || row['name'];
          if (!nameVal || typeof nameVal !== 'string' || !nameVal.trim()) return;

          let birthVal = row['Ngày tháng năm sinh'] || row['Ngày sinh'] || row['Ngay sinh'] || row['NgayThangNamSinh'] || row['DOB'] || row['birthDate'] || '';
          if (typeof birthVal === 'number') {
            const dateObj = XLSX.SSF.parse_date_code(birthVal);
            if (dateObj) {
              birthVal = `${String(dateObj.d).padStart(2, '0')}/${String(dateObj.m).padStart(2, '0')}/${dateObj.y}`;
            }
          }

          const genderVal = row['Giới tính'] || row['Gioi tinh'] || row['Gender'] || row['Phái'] || '';
          let gender: 'Nam' | 'Nữ' = 'Nam';
          if (typeof genderVal === 'string') {
            const lower = genderVal.toLowerCase().trim();
            if (lower.includes('nữ') || lower.includes('nu') || lower === 'female' || lower === 'f') {
              gender = 'Nữ';
            }
          }

          const groupVal = row['Tổ'] || row['To'] || row['Group'] || row['Nhóm'] || 'Tổ 1';
          const roleVal = row['Chức vụ'] || row['Chức Vụ'] || row['Chuc vu'] || row['ChucVu'] || row['Role'] || row['Nhiệm vụ'] || row['Nhiem vu'] || '';
          const roleParts = String(roleVal).split(/[•,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 3);

          parsed.push({
            name: nameVal.trim(),
            gender,
            birthDate: String(birthVal).trim(),
            group: String(groupVal).trim(),
            role: roleParts.join(' • ') || String(roleVal).trim(),
            roles: roleParts
          });
        });

        if (parsed.length > 0) {
          setExcelParsedStudents(parsed);
          setIsExcelPreviewOpen(true);
        } else {
          alert('Không tìm thấy dữ liệu học sinh trong file Excel. Vui lòng kiểm tra lại định dạng file mẫu.');
        }
      } catch (err) {
        console.error(err);
        alert('Lỗi đọc file Excel. Vui lòng đảm bảo file có định dạng .xlsx, .xls hoặc .csv hợp lệ.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleConfirmExcelImport = () => {
    if (excelParsedStudents.length > 0) {
      let finalStudents = [...excelParsedStudents];
      if (isDemoAccount) {
        if (currentClassStudents.length >= 10) {
          alert('Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!');
          setIsExcelPreviewOpen(false);
          setExcelParsedStudents([]);
          return;
        }
        const allowedToAdd = 10 - currentClassStudents.length;
        if (finalStudents.length > allowedToAdd) {
          alert(`Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp! Hệ thống chỉ thêm ${allowedToAdd} học sinh đầu tiên để trải nghiệm.`);
          finalStudents = finalStudents.slice(0, allowedToAdd);
        }
      }
      bulkAddStudents(finalStudents);
      setIsExcelPreviewOpen(false);
      setExcelParsedStudents([]);
      confetti({ particleCount: 70, spread: 80 });
    }
  };

  // Single Add (Yêu cầu 1 & 2: Thêm đầy đủ thông tin & chức vụ - Tối đa 3 chức vụ)
  const handleSingleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (isStudentLimitReached) {
      alert('Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!');
      return;
    }
    if (!singleName.trim()) return;
    const finalRoles = canAssignClassOfficer ? singleRoles.slice(0, 3) : [];
    addStudent({
      classId: activeClassId,
      name: singleName.trim(),
      birthDate: singleBirthDate.trim(),
      gender: singleGender,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(singleName)}&backgroundColor=b6e3f4`,
      avatarScale: 1,
      avatarPosition: { x: 0, y: 0 },
      group: singleGroup,
      role: finalRoles.join(' • '),
      roles: finalRoles
    });
    setSingleName('');
    setSingleBirthDate('');
    setSingleRoles([]);
    setIsSingleAddOpen(false);
    confetti({ particleCount: 30, spread: 40 });
  };

  // 5. BULK POINTS & REWARD HANDLERS (Yêu cầu 3)
  const handleConfirmBulkAward = () => {
    if (selectedStudentIds.length === 0) return;
    const count = selectedStudentIds.length;
    if (bulkAwardMode === 'minus') {
      const reason = bulkAwardReason.trim() || `Trừ -${bulkAwardCoins} xu nề nếp môn ${bulkAwardSubject} (${count} học sinh)`;
      deductPoints(selectedStudentIds, bulkAwardCoins, reason, bulkAwardSubject);
      playDeductSound();
    } else if (bulkAwardMode === 'sao') {
      const pts = bulkAwardCoins * 5;
      const reason = bulkAwardReason.trim() || `Tặng ${bulkAwardCoins} ⭐ Ngôi sao thi đua môn ${bulkAwardSubject} (+${pts} xu, ${count} học sinh)`;
      awardPoints(selectedStudentIds, pts, reason, bulkAwardSubject);
      playCoinSound();
      confetti({ particleCount: 70, spread: 80 });
    } else {
      const reason = bulkAwardReason.trim() || `Khen thưởng +${bulkAwardCoins} xu môn ${bulkAwardSubject} (${count} học sinh)`;
      awardPoints(selectedStudentIds, bulkAwardCoins, reason, bulkAwardSubject);
      playCoinSound();
      confetti({ particleCount: 60, spread: 70 });
    }
    setIsBulkAwardOpen(false);
    setBulkAwardReason('');
  };

  // 6. BULK ROLE ASSIGNMENT (Yêu cầu 2: Gán chức vụ đồng loạt tối đa 3 chức vụ)
  const handleConfirmBulkRole = () => {
    if (selectedStudentIds.length === 0) return;
    const rolesLimited = bulkSelectedRoles.slice(0, 3);
    const roleStr = rolesLimited.join(' • ');
    selectedStudentIds.forEach(id => {
      updateStudent(id, { 
        roles: rolesLimited,
        role: roleStr 
      });
    });
    setIsBulkRoleModalOpen(false);
    playCoinSound();
    confetti({ particleCount: 40, spread: 55 });
  };

  // 7. RESET COINS HANDLERS (Yêu cầu 3)
  const handleConfirmBulkResetCoins = () => {
    if (selectedStudentIds.length === 0) return;
    resetStudentsCoins(selectedStudentIds, activeClassId);
    setIsBulkResetCoinsOpen(false);
    playCoinSound();
  };

  const handleConfirmClassResetCoins = () => {
    resetStudentsCoins([], activeClassId);
    setIsClassResetCoinsOpen(false);
    playCoinSound();
  };

  const handleSaveStudentRoles = (studentId: string, rolesToSave: string[]) => {
    const limited = rolesToSave.slice(0, 3);
    const roleStr = limited.join(' • ');
    updateStudent(studentId, {
      roles: limited,
      role: roleStr
    });
    if (editingStudent && editingStudent.id === studentId) {
      setEditingStudent({
        ...editingStudent,
        roles: limited,
        role: roleStr
      });
    }
    setQuickRoleStudent(null);
    playCoinSound();
    confetti({ particleCount: 35, spread: 60 });
  };

  // Quick Points Handlers - Opens evaluation modal with subject selector (Yêu cầu 3)
  const handleQuickAdd = (student: Student) => {
    setRewardingStudent(student);
    setRewardMode('xu');
    setCustomCoins(1);
    setSelectedSubjectForAward(activeEvalSubject || subjects[0]?.name || 'Toán');
    setCustomReason('');
  };

  const handleQuickDeduct = (student: Student) => {
    setRewardingStudent(student);
    setRewardMode('minus');
    setCustomCoins(1);
    setSelectedSubjectForAward(activeEvalSubject || subjects[0]?.name || 'Toán');
    setCustomReason('');
  };

  const handleConfirmAward = (pts: number, reason: string) => {
    if (!rewardingStudent) return;
    if (rewardMode === 'minus') {
      const finalReason = reason.trim() || `Trừ -${pts} xu nề nếp môn ${selectedSubjectForAward}`;
      deductPoints([rewardingStudent.id], pts, finalReason, selectedSubjectForAward);
      playDeductSound();
    } else if (rewardMode === 'sao') {
      const finalReason = reason.trim() || `Tặng ${pts} ⭐ Ngôi sao khen ngợi môn ${selectedSubjectForAward}`;
      awardPoints([rewardingStudent.id], pts * 5, finalReason, selectedSubjectForAward);
      playCoinSound();
      confetti({ particleCount: 50, spread: 60 });
    } else {
      const finalReason = reason.trim() || `Khen thưởng +${pts} xu môn ${selectedSubjectForAward}`;
      awardPoints([rewardingStudent.id], pts, finalReason, selectedSubjectForAward);
      playCoinSound();
      confetti({ particleCount: 40, spread: 50 });
    }
    setRewardingStudent(null);
  };

  // Multi-select & Bulk Delete (User Request 9)
  const toggleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === filteredStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredStudents.map(s => s.id));
    }
  };

  const handleBulkDeleteSelected = () => {
    if (isSuperAdmin) {
      const confirmed = window.confirm(
        `⚠️ BẠN ĐANG THỰC THI QUYỀN QUẢN TRỊ TỐI CAO:\n\nXác nhận xóa ${selectedStudentIds.length} học sinh đã chọn khỏi toàn bộ hệ thống? Thao tác này không thể hoàn tác. Bạn có chắc chắn không?`
      );
      if (!confirmed) return;
    }
    selectedStudentIds.forEach(id => deleteStudent(id));
    setSelectedStudentIds([]);
    setIsBulkDeleteConfirmOpen(false);
  };

  const handleConfirmBulkDeleteClasses = () => {
    if (selectedClassIds.length === 0) return;
    if (isSuperAdmin) {
      const confirmed = window.confirm(
        `⚠️ BẠN ĐANG THỰC THI QUYỀN QUẢN TRỊ TỐI CAO:\n\nXác nhận xóa hàng loạt ${selectedClassIds.length} Lớp học đã chọn? Toàn bộ học sinh và dữ liệu liên quan sẽ bị xóa vĩnh viễn trên toàn hệ thống CSDL. Bạn có chắc chắn không?`
      );
      if (!confirmed) return;
    }
    bulkDeleteClasses(selectedClassIds);
    playDeductSound();
    setSelectedClassIds([]);
    setIsBulkClassDeleteOpen(false);
  };

  const handleConfirmBulkEditClasses = () => {
    if (selectedClassIds.length === 0) return;
    const updates: Partial<Classroom> = {};
    if (bulkEditGrade !== 'keep') updates.grade = bulkEditGrade;
    if (bulkEditYear !== 'keep') updates.academicYear = bulkEditYear;
    if (bulkEditTeacher.trim() !== '') updates.teacherName = bulkEditTeacher.trim();
    if (bulkEditColor !== 'keep') updates.color = bulkEditColor;
    if (canEditClassSlogan && bulkEditSlogan.trim() !== '') updates.slogan = bulkEditSlogan.trim();

    bulkUpdateClasses(selectedClassIds, updates);
    playFanfareSound();
    confetti({ particleCount: 50, spread: 60 });
    setSelectedClassIds([]);
    setIsBulkClassEditOpen(false);
  };

  const handleClearAllClassStudents = () => {
    if (isSuperAdmin) {
      const confirmed = window.confirm(
        `⚠️ BẠN ĐANG THỰC THI QUYỀN QUẢN TRỊ TỐI CAO:\n\nXác nhận xóa toàn bộ học sinh của lớp này khỏi hệ thống? Bạn có chắc chắn không?`
      );
      if (!confirmed) return;
    }
    clearClassStudents(activeClassId);
    setSelectedStudentIds([]);
    setIsClearAllConfirmOpen(false);
  };

  // 🌟 Toàn bộ danh sách lớp chủ nhiệm toàn trường (loại bỏ lớp bộ môn/ảo)
  const allSchoolHomeroomClasses = React.useMemo(() => {
    return classes.filter(c => (c.teacherRole === 'homeroom' || !c.teacherRole) && !c.id.startsWith('class-sub-'));
  }, [classes]);

  // 🌟 Tập hợp ID lớp hợp lệ thuộc toàn trường
  const validSchoolClassIdSet = React.useMemo(() => {
    return new Set(allSchoolHomeroomClasses.map(c => c.id));
  }, [allSchoolHomeroomClasses]);

  // 🌟 Tổng số học sinh toàn trường thuộc các lớp hợp lệ (chính xác 103 em: 1A1: 30, 1A2: 45, 1A3: 28)
  const totalSchoolStudentsCount = React.useMemo(() => {
    return students.filter(s => 
      Boolean(s.classId && validSchoolClassIdSet.has(s.classId)) &&
      s.classId !== 'class-1791592764810' &&
      !s.classId.startsWith('class-sub-')
    ).length;
  }, [students, validSchoolClassIdSet]);

  // 🌟 Lọc lấy danh sách Lớp thực tế đang hiển thị theo bộ lọc
  const statsHomeroomClasses = React.useMemo(() => {
    return displayedClasses.filter(c => (c.teacherRole === 'homeroom' || !c.teacherRole) && !c.id.startsWith('class-sub-'));
  }, [displayedClasses]);

  // 🌟 Sĩ số của các lớp đang hiển thị theo bộ lọc
  const statsTotalStudents = React.useMemo(() => {
    return statsHomeroomClasses.reduce((sum, c) => {
      if (c.id === 'class-1791592764810' || c.id.startsWith('class-sub-')) return sum;
      return sum + students.filter(s => s.classId === c.id && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-')).length;
    }, 0);
  }, [statsHomeroomClasses, students]);

  return (
    <div className="p-2.5 sm:p-3.5 md:p-4 max-w-7xl mx-auto space-y-2.5 sm:space-y-3">
      {/* Top Header Switch */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-2.5 px-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover-zoom-card">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black shadow-2xs shrink-0">
            {activeTabMode === 'classes' ? <School className="w-4 h-4" /> : <Users className="w-4 h-4" />}
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-indigo-950 tracking-tight leading-tight">
              {activeTabMode === 'classes' ? 'Quản Lý Lớp Học & Thống Kê Sĩ Số' : `Không Gian Học Sinh Lớp ${activeClass?.name || ''}`}
            </h2>
            <p className="text-[10px] sm:text-[11px] text-indigo-700/80 font-medium leading-none mt-0.5">
              {activeTabMode === 'classes' 
                ? 'Ảnh đại diện lớp học, thống kê số lượng lớp và sĩ số học sinh từng lớp.' 
                : 'Thẻ 3D to rõ nét, đánh giá thi đua theo môn học, nhập Excel và điểm thưởng.'}
            </p>
          </div>
        </div>

        {/* Tab Toggle: Lớp Học vs Học Sinh */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto shrink-0">
          <button
            onClick={() => setActiveTabMode('classes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 hover-zoom-btn uppercase ${
              activeTabMode === 'classes' 
                ? 'bg-white text-indigo-700 shadow-xs' 
                : 'text-indigo-900/70 hover:text-indigo-950'
            }`}
          >
            <School className="w-3.5 h-3.5" />
            <span>LỚP HỌC ({classes.length})</span>
          </button>

          <button
            onClick={() => setActiveTabMode('students')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 hover-zoom-btn uppercase ${
              activeTabMode === 'students' 
                ? 'bg-white text-indigo-700 shadow-xs' 
                : 'text-indigo-900/70 hover:text-indigo-950'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>HỌC SINH ({currentClassStudents.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. VIEW TAB: QUẢN LÝ LỚP HỌC (User Request: Màu sắc tươi sáng, hạn chế chữ màu đen) */}
      {/* ========================================================================= */}
      {activeTabMode === 'classes' && (
        <div className="space-y-3">
          {/* STATS OVERVIEW: Thống kê số lớp đang quản lý, mỗi lớp bao nhiêu học sinh */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
            {/* Card 1: Tổng số lớp đang quản lý */}
            <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 rounded-2xl p-3 sm:p-3.5 text-white shadow-sm shadow-indigo-500/20 hover-zoom-card flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center font-black shadow-xs shrink-0">
                <School className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black text-white uppercase tracking-wider block">TỔNG LỚP ĐANG QUẢN LÝ</span>
                <div className="text-xl sm:text-2xl font-black text-white font-mono mt-0.5">
                  {allSchoolHomeroomClasses.length} <span className="text-xs font-bold text-white uppercase">LỚP HỌC</span>
                </div>
                {statsHomeroomClasses.length !== allSchoolHomeroomClasses.length && (
                  <div className="text-[10px] font-bold text-white mt-0.5 flex items-center gap-1">
                    <span>⚡ Đang hiển thị:</span>
                    <span className="bg-white/20 px-1.5 py-0.2 rounded-md">{statsHomeroomClasses.length} lớp</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Tổng số học sinh toàn trường */}
            <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-green-600 rounded-2xl p-3 sm:p-3.5 text-white shadow-sm shadow-emerald-500/20 hover-zoom-card flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center font-black shadow-xs shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black text-white uppercase tracking-wider block">TỔNG SỐ HỌC SINH CÁC LỚP</span>
                <div className="text-xl sm:text-2xl font-black text-white font-mono mt-0.5">
                  {totalSchoolStudentsCount} <span className="text-xs font-bold text-white uppercase">EM HỌC SINH</span>
                </div>
                {statsHomeroomClasses.length !== allSchoolHomeroomClasses.length && (
                  <div className="text-[10px] font-bold text-white mt-0.5 flex items-center gap-1">
                    <span>⚡ Đang lọc:</span>
                    <span className="bg-white/20 px-1.5 py-0.2 rounded-md">{statsTotalStudents} em</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card 3: Thống kê nhanh sĩ số từng lớp */}
            <div className="bg-gradient-to-br from-amber-600 via-orange-600 to-rose-500 rounded-2xl p-3 sm:p-3.5 text-white shadow-sm shadow-orange-500/20 hover-zoom-card flex flex-col justify-between h-full space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-white uppercase tracking-wider block">CHI TIẾT SĨ SỐ TỪNG LỚP</span>
                <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-md text-white font-black shadow-xs shrink-0">
                  <BarChart3 className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-auto pt-1">
                <div>
                  <div className="text-lg font-black text-white mt-1">Bảng Tổng Hợp</div>
                  <div className="text-[11px] text-white font-semibold">
                    {allSchoolHomeroomClasses.length} lớp học đang hoạt động
                    {statsHomeroomClasses.length !== allSchoolHomeroomClasses.length && ` (Lọc: ${statsHomeroomClasses.length})`}
                  </div>
                </div>
                <button
                  onClick={() => setIsClassStatsModalOpen(true)}
                  className="px-3 py-2 bg-white text-orange-600 hover:bg-orange-50 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition-all hover:-translate-y-0.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  XEM CHI TIẾT
                </button>
              </div>
            </div>
          </div>

          {/* 🏫 BỘ LỌC DÀNH CHO ADMIN QUẢN TRỊ CẤP CAO: LỌC XEM CÁC LỚP THEO TRƯỜNG (CHỈ HIỆN KHI ĐÃ CÓ TRƯỜNG/LỚP) */}
          {isSuperAdmin && availableSchools.length > 0 && (
            <div className="p-3 bg-gradient-to-r from-indigo-50/80 via-purple-50/80 to-pink-50/80 rounded-2xl border border-indigo-200 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg shadow-2xs">
                    <Building2 className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <span className="text-xs font-black text-indigo-950 uppercase tracking-tight">
                      QUẢN TRỊ TỐI CAO • LỌC THEO TRƯỜNG HỌC
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium ml-2 hidden sm:inline">
                      (Phân bổ không gian lớp học theo từng đơn vị trường)
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-indigo-900 font-bold uppercase bg-white/90 px-2.5 py-0.5 rounded-lg border border-indigo-200 shadow-2xs">
                  Hiển thị: <strong className="text-indigo-700">{displayedClasses.length}</strong> / <strong className="text-slate-600">{classes.length} lớp</strong>
                </div>
              </div>

              {/* Danh sách nút trường: cuộn ngang mượt mà khi có nhiều trường, không choán chỗ */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setSelectedSchoolFilter('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                    selectedSchoolFilter === 'all'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200'
                  }`}
                >
                  <span>🌐</span>
                  <span>Tất cả các trường ({classes.length})</span>
                </button>

                {availableSchools.map(schName => {
                  const targetNorm = schName.trim().toLowerCase();
                  const schClassesCount = classes.filter(c => {
                    const cSch = (c.schoolName || '').trim().toLowerCase();
                    const teacher = allUsers.find(u => 
                      (c.teacherUsername && u.username.toLowerCase() === c.teacherUsername.toLowerCase()) ||
                      (u.role !== 'admin' && u.username?.toLowerCase() !== 'adminquantri' && c.teacherName && u.fullName && c.teacherName.toLowerCase() === u.fullName.toLowerCase())
                    );
                    const tSch = (teacher?.schoolName || '').trim().toLowerCase();
                    return cSch === targetNorm || cSch.includes(targetNorm) || tSch === targetNorm || tSch.includes(targetNorm);
                  }).length;

                  return (
                    <button
                      key={schName}
                      type="button"
                      onClick={() => setSelectedSchoolFilter(schName)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                        selectedSchoolFilter === schName
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-xs ring-2 ring-purple-300'
                          : 'bg-white text-slate-700 hover:bg-purple-50 border border-slate-200'
                      }`}
                    >
                      <span>🏫</span>
                      <span>{schName} ({schClassesCount} lớp)</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 🏛️ BỘ LỌC & SẮP XẾP DÀNH CHO QUẢN TRỊ TRƯỜNG & SUPER ADMIN: PHÂN HIỆU • ĐIỂM TRƯỜNG • KHỐI LỚP */}
          {(isSchoolScopeAccount || isSuperAdmin) && (classes.length > 0 || availableBranches.length > 0 || availableCampuses.length > 0) && (
            <div className="p-3.5 sm:p-4 bg-gradient-to-r from-sky-50/90 via-teal-50/90 to-emerald-50/90 rounded-2xl border border-teal-200/90 shadow-2xs space-y-3">
              {/* Tiêu đề & Công cụ đặt lại */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-teal-200/60">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl shadow-xs">
                    <SlidersHorizontal className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-black text-teal-950 uppercase tracking-tight">
                        QUẢN TRỊ TRƯỜNG • BỘ LỌC & SẮP XẾP LỚP HỌC
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-300">
                        {displayedClasses.length} / {classes.length} Lớp
                      </span>
                    </div>
                    <p className="text-[10.5px] text-teal-800 font-semibold">
                      Lọc và sắp xếp các lớp theo Phân hiệu, Điểm trường và Khối lớp
                    </p>
                  </div>
                </div>

                {/* Các nút thao tác reset */}
                {(selectedBranchFilter !== 'all' || selectedCampusFilter !== 'all' || selectedGradeFilter !== 'all' || classSortBy !== 'grade' || classSortOrder !== 'asc') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBranchFilter('all');
                      setSelectedCampusFilter('all');
                      setSelectedGradeFilter('all');
                      setClassSortBy('grade');
                      setClassSortOrder('asc');
                    }}
                    className="text-xs font-bold text-teal-800 hover:text-teal-950 bg-white px-3 py-1 rounded-xl border border-teal-300 shadow-2xs hover:bg-teal-50 transition-all flex items-center gap-1.5"
                    title="Đặt lại toàn bộ các bộ lọc và thứ tự sắp xếp về mặc định"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-teal-600" />
                    <span>Đặt lại bộ lọc & sắp xếp</span>
                  </button>
                )}
              </div>

              {/* KHỐI 1: CÁC TIÊU CHÍ LỌC (PHÂN HIỆU, ĐIỂM TRƯỜNG, KHỐI LỚP) */}
              <div className="space-y-2">
                {/* 1. Lọc theo Phân hiệu */}
                {(availableBranches.length > 0 || hasUnassignedBranch) && (
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin py-0.5">
                    <div className="flex items-center gap-1 min-w-[95px] shrink-0 text-[11px] font-black text-teal-900 uppercase">
                      <span>🏛️</span>
                      <span>Phân hiệu:</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedBranchFilter('all')}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                          selectedBranchFilter === 'all'
                            ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-xs ring-2 ring-teal-300'
                            : 'bg-white text-slate-700 hover:bg-teal-50 border border-slate-200'
                        }`}
                      >
                        Tất cả ({classes.length})
                      </button>
                      {availableBranches.map(br => {
                        const countInBranch = classes.filter(c => (c.branch || '').trim() === br).length;
                        return (
                          <button
                            key={br}
                            type="button"
                            onClick={() => setSelectedBranchFilter(br)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                              selectedBranchFilter === br
                                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-xs ring-2 ring-teal-300'
                                : 'bg-white text-slate-700 hover:bg-teal-50 border border-slate-200'
                            }`}
                          >
                            <span>{br}</span>
                            <span className="ml-1 opacity-80 text-[10.5px]">({countInBranch})</span>
                          </button>
                        );
                      })}
                      {hasUnassignedBranch && (() => {
                        const countUnassigned = classes.filter(c => !c.branch || !c.branch.trim()).length;
                        return (
                          <button
                            type="button"
                            onClick={() => setSelectedBranchFilter('__unassigned__')}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                              selectedBranchFilter === '__unassigned__'
                                ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-300'
                                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                            }`}
                          >
                            <span>⚠️ Chưa gán</span>
                            <span className="ml-1 text-[10.5px]">({countUnassigned})</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* 2. Lọc theo Điểm trường */}
                {(availableCampuses.length > 0 || hasUnassignedCampus) && (
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin py-0.5">
                    <div className="flex items-center gap-1 min-w-[95px] shrink-0 text-[11px] font-black text-sky-900 uppercase">
                      <span>📍</span>
                      <span>Điểm trường:</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedCampusFilter('all')}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                          selectedCampusFilter === 'all'
                            ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-xs ring-2 ring-sky-300'
                            : 'bg-white text-slate-700 hover:bg-sky-50 border border-slate-200'
                        }`}
                      >
                        Tất cả
                      </button>
                      {availableCampuses.map(cp => {
                        const countInCampus = classes.filter(c => {
                          if (selectedBranchFilter !== 'all' && (c.branch || '').trim() !== selectedBranchFilter) return false;
                          return (c.campus || '').trim() === cp;
                        }).length;
                        return (
                          <button
                            key={cp}
                            type="button"
                            onClick={() => setSelectedCampusFilter(cp)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                              selectedCampusFilter === cp
                                ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-xs ring-2 ring-sky-300'
                                : 'bg-white text-slate-700 hover:bg-sky-50 border border-slate-200'
                            }`}
                          >
                            <span>{cp}</span>
                            <span className="ml-1 opacity-80 text-[10.5px]">({countInCampus})</span>
                          </button>
                        );
                      })}
                      {hasUnassignedCampus && (() => {
                        const countUnassignedCp = classes.filter(c => {
                          if (selectedBranchFilter !== 'all' && (c.branch || '').trim() !== selectedBranchFilter) return false;
                          return !c.campus || !c.campus.trim();
                        }).length;
                        return (
                          <button
                            type="button"
                            onClick={() => setSelectedCampusFilter('__unassigned__')}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                              selectedCampusFilter === '__unassigned__'
                                ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-300'
                                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                            }`}
                          >
                            <span>⚠️ Chưa gán</span>
                            <span className="ml-1 text-[10.5px]">({countUnassignedCp})</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* 3. Lọc theo Khối lớp (MỚI THEO YÊU CẦU) */}
                {availableGrades.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin py-0.5">
                    <div className="flex items-center gap-1 min-w-[95px] shrink-0 text-[11px] font-black text-indigo-900 uppercase">
                      <span>🎓</span>
                      <span>Khối lớp:</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedGradeFilter('all')}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                          selectedGradeFilter === 'all'
                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs ring-2 ring-indigo-300'
                            : 'bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200'
                        }`}
                      >
                        Tất cả khối ({classes.length})
                      </button>
                      {availableGrades.map(gr => {
                        const countInGrade = classes.filter(c => {
                          if (selectedBranchFilter === '__unassigned__') {
                            if (c.branch && c.branch.trim()) return false;
                          } else if (selectedBranchFilter !== 'all' && (c.branch || '').trim().toLowerCase() !== selectedBranchFilter.trim().toLowerCase()) {
                            return false;
                          }
                          if (selectedCampusFilter === '__unassigned__') {
                            if (c.campus && c.campus.trim()) return false;
                          } else if (selectedCampusFilter !== 'all' && (c.campus || '').trim().toLowerCase() !== selectedCampusFilter.trim().toLowerCase()) {
                            return false;
                          }
                          return getClassGradeLabel(c) === gr;
                        }).length;

                        return (
                          <button
                            key={gr}
                            type="button"
                            onClick={() => setSelectedGradeFilter(gr)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                              selectedGradeFilter === gr
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs ring-2 ring-indigo-300'
                                : 'bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200'
                            }`}
                          >
                            <span>{gr}</span>
                            <span className="ml-1 opacity-80 text-[10.5px]">({countInGrade})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* KHỐI 2: CÔNG CỤ SẮP XẾP LỚP HỌC (THEO PHÂN HIỆU, ĐIỂM TRƯỜNG, KHỐI LỚP) */}
              <div className="pt-2.5 border-t border-teal-200/60 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 text-[11px] font-black text-teal-950 uppercase shrink-0">
                    <ArrowUpDown className="w-3.5 h-3.5 text-teal-700" />
                    <span>Sắp xếp theo:</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Sắp xếp theo Khối */}
                    <button
                      type="button"
                      onClick={() => {
                        if (classSortBy === 'grade') {
                          setClassSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setClassSortBy('grade');
                          setClassSortOrder('asc');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 shadow-2xs ${
                        classSortBy === 'grade'
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white ring-2 ring-indigo-300 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200'
                      }`}
                      title="Sắp xếp lớp theo Khối (Khối 1 -> 5)"
                    >
                      <span>🎓</span>
                      <span>Khối lớp</span>
                      {classSortBy === 'grade' && (
                        <span className="text-[10px]">{classSortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>

                    {/* Sắp xếp theo Phân hiệu */}
                    <button
                      type="button"
                      onClick={() => {
                        if (classSortBy === 'branch') {
                          setClassSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setClassSortBy('branch');
                          setClassSortOrder('asc');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 shadow-2xs ${
                        classSortBy === 'branch'
                          ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white ring-2 ring-teal-300 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-teal-50 border border-slate-200'
                      }`}
                      title="Sắp xếp lớp theo Phân hiệu"
                    >
                      <span>🏛️</span>
                      <span>Phân hiệu</span>
                      {classSortBy === 'branch' && (
                        <span className="text-[10px]">{classSortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>

                    {/* Sắp xếp theo Điểm trường */}
                    <button
                      type="button"
                      onClick={() => {
                        if (classSortBy === 'campus') {
                          setClassSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setClassSortBy('campus');
                          setClassSortOrder('asc');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 shadow-2xs ${
                        classSortBy === 'campus'
                          ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white ring-2 ring-sky-300 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-sky-50 border border-slate-200'
                      }`}
                      title="Sắp xếp lớp theo Điểm trường"
                    >
                      <span>📍</span>
                      <span>Điểm trường</span>
                      {classSortBy === 'campus' && (
                        <span className="text-[10px]">{classSortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>

                    {/* Sắp xếp theo Tên lớp */}
                    <button
                      type="button"
                      onClick={() => {
                        if (classSortBy === 'name') {
                          setClassSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setClassSortBy('name');
                          setClassSortOrder('asc');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 shadow-2xs ${
                        classSortBy === 'name'
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white ring-2 ring-purple-300 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-purple-50 border border-slate-200'
                      }`}
                      title="Sắp xếp theo Tên lớp (A - Z)"
                    >
                      <span>🔤</span>
                      <span>Tên lớp</span>
                      {classSortBy === 'name' && (
                        <span className="text-[10px]">{classSortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Nút Đảo Chiều Sắp Xếp */}
                <button
                  type="button"
                  onClick={() => setClassSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white text-teal-900 hover:bg-teal-50 border border-teal-300 shadow-2xs transition-all flex items-center gap-1.5 shrink-0"
                  title="Đảo chiều sắp xếp (Tăng dần / Giảm dần)"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-teal-600" />
                  <span>Thứ tự:</span>
                  <strong className="text-teal-700">
                    {classSortOrder === 'asc' ? 'Tăng dần (A ➜ Z / 1 ➜ 5)' : 'Giảm dần (Z ➜ A / 5 ➜ 1)'}
                  </strong>
                </button>
              </div>
            </div>
          )}

          {/* 🛡️ ADMIN UNIFIED TEACHER FILTER BAR - MẶC ĐỊNH THU GỌN HOÀN TOÀN, CHỈ KHI BẤM "XEM CHI TIẾT" MỚI MỞ DANH SÁCH GIÁO VIÊN */}
          {isAdmin && (relevantTeachers.length > 0 || classes.length > 0) && (() => {
            // Lọc danh sách giáo viên theo từ khóa tìm kiếm khi mở chi tiết
            const filteredTeachers = relevantTeachers.filter(t => {
              if (!teacherSearchQuery.trim()) return true;
              const q = teacherSearchQuery.toLowerCase();
              return (t.fullName && t.fullName.toLowerCase().includes(q)) ||
                     (t.username && t.username.toLowerCase().includes(q));
            });

            // Giáo viên đang được chọn (nếu có)
            const activeTeacherObj = relevantTeachers.find(t => t.username === adminTeacherFilter);

            // Các lớp thuộc giáo viên đang chọn (nếu đang lọc theo GV)
            const activeTeacherClasses = adminTeacherFilter === 'all'
              ? allSchoolHomeroomClasses
              : classes.filter(c => 
                  (c.teacherUsername && c.teacherUsername.toLowerCase() === adminTeacherFilter.toLowerCase()) ||
                  (activeTeacherObj && c.teacherName && c.teacherName.toLowerCase() === activeTeacherObj.fullName.toLowerCase())
                );
            const activeTeacherClassIds = new Set(activeTeacherClasses.map(c => c.id));
            const activeTeacherStudentsCount = adminTeacherFilter === 'all'
              ? totalSchoolStudentsCount
              : students.filter(s => Boolean(s.classId && activeTeacherClassIds.has(s.classId))).length;

            return (
              <div className="p-2.5 sm:p-3 bg-gradient-to-r from-amber-50/80 via-indigo-50/70 to-purple-50/80 rounded-2xl border border-indigo-200/90 shadow-2xs space-y-2">
                {/* Thanh điều khiển chính: Cực kỳ gọn gàng */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-2xs">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-indigo-950 uppercase tracking-tight">
                          QUẢN TRỊ VIÊN TOÀN TRƯỜNG • ĐỒNG BỘ DỮ LIỆU GIÁO VIÊN
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                          {relevantTeachers.length} GV
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {adminTeacherFilter === 'all' ? (
                          <>
                            Tổng số: <strong className="text-indigo-700">{allSchoolHomeroomClasses.length} lớp</strong> • <strong className="text-emerald-700">{totalSchoolStudentsCount} học sinh</strong>
                          </>
                        ) : (
                          <>
                            Giáo viên <strong className="text-indigo-900">{activeTeacherObj?.fullName || adminTeacherFilter}</strong>: <strong className="text-indigo-700">{activeTeacherClasses.length} lớp</strong> • <strong className="text-emerald-700">{activeTeacherStudentsCount} học sinh</strong>
                            <span className="ml-2 font-bold text-indigo-900 bg-white/90 px-2 py-0.5 rounded-md border border-indigo-200">
                              Toàn trường: {allSchoolHomeroomClasses.length} lớp • {totalSchoolStudentsCount} HS
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cụm tương tác: Nút chọn Tất cả + Nút Xem chi tiết giáo viên */}
                  <div className="flex items-center gap-2">
                    {/* Nút Xem tất cả lớp học */}
                    {adminTeacherFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setAdminTeacherFilter('all')}
                        className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-xl shadow-2xs transition-all flex items-center gap-1"
                      >
                        <span>🌐</span>
                        <span>Xem tất cả ({allSchoolHomeroomClasses.length} lớp • {totalSchoolStudentsCount} HS)</span>
                      </button>
                    )}

                    {/* Nút Xem chi tiết danh sách giáo viên (Bật/Tắt) */}
                    <button
                      type="button"
                      onClick={() => setIsTeacherFilterExpanded(!isTeacherFilterExpanded)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-all ${
                        isTeacherFilterExpanded
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-300'
                          : 'bg-white text-indigo-900 hover:bg-indigo-50 border border-indigo-300'
                      }`}
                    >
                      {isTeacherFilterExpanded ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>Thu gọn danh sách</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>Xem chi tiết giáo viên ({relevantTeachers.length})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* KHU VỰC CHI TIẾT: CHỈ HIỂN THỊ KHI NGƯỜI DÙNG BẤM "XEM CHI TIẾT GIÁO VIÊN" */}
                {isTeacherFilterExpanded && (() => {
                  // Phân loại giáo viên trường và giáo viên vãng lai
                  const isGuestTeacher = (t: any) => {
                    const sch = (t.schoolName || '').toLowerCase();
                    return t.tenantType === 'guest' || sch.includes('cá nhân') || sch.includes('tự do') || sch.includes('vãng lai');
                  };

                  const schoolTeachers = relevantTeachers.filter(t => !isGuestTeacher(t));
                  const guestTeachers = relevantTeachers.filter(t => isGuestTeacher(t));

                  // Lọc theo Tab đã chọn
                  const tabFiltered = teacherGroupTab === 'school' 
                    ? schoolTeachers 
                    : teacherGroupTab === 'guest' 
                      ? guestTeachers 
                      : relevantTeachers;

                  // Lọc tiếp theo từ khóa tìm kiếm
                  const finalTeachers = tabFiltered.filter(t => {
                    if (!teacherSearchQuery.trim()) return true;
                    const q = teacherSearchQuery.toLowerCase();
                    return (t.fullName && t.fullName.toLowerCase().includes(q)) ||
                           (t.username && t.username.toLowerCase().includes(q));
                  });

                  return (
                    <div className="pt-2 border-t border-indigo-200/60 space-y-2 animate-fadeIn">
                      {/* Hàng Tab phân nhóm & Ô tìm kiếm nhanh */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-white/80 p-2 rounded-xl border border-indigo-100">
                        {/* 3 Tabs phân nhóm */}
                        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setTeacherGroupTab('all')}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                              teacherGroupTab === 'all'
                                ? 'bg-white text-indigo-900 shadow-2xs font-black'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span>👥 Tất cả</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
                              {relevantTeachers.length}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setTeacherGroupTab('school')}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                              teacherGroupTab === 'school'
                                ? 'bg-indigo-600 text-white shadow-2xs font-black'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span>🏫 Thuộc nhà trường</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${teacherGroupTab === 'school' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                              {schoolTeachers.length}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setTeacherGroupTab('guest')}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                              teacherGroupTab === 'guest'
                                ? 'bg-emerald-600 text-white shadow-2xs font-black'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span>🌱 Giáo viên vãng lai</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${teacherGroupTab === 'guest' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                              {guestTeachers.length}
                            </span>
                          </button>
                        </div>

                        {/* Ô tìm kiếm nhanh */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={teacherSearchQuery}
                            onChange={(e) => setTeacherSearchQuery(e.target.value)}
                            placeholder="Tìm theo tên hoặc tài khoản..."
                            className="pl-7 pr-7 py-1 text-xs bg-white rounded-xl border border-indigo-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-400 w-44 sm:w-56 placeholder:text-slate-400 font-medium shadow-2xs"
                          />
                          {teacherSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setTeacherSearchQuery('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Vùng hiển thị toàn bộ giáo viên: khung cuộn trang nhã không làm dài màn hình */}
                      <div className="max-h-56 overflow-y-auto p-2 bg-white/90 rounded-xl border border-indigo-100 flex flex-wrap gap-1.5 scrollbar-thin">
                        {/* Nút Tất cả lớp học */}
                        <button
                          type="button"
                          onClick={() => setAdminTeacherFilter('all')}
                          className={`px-3 py-1 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs ${
                            adminTeacherFilter === 'all'
                              ? 'bg-indigo-600 text-white ring-2 ring-indigo-300'
                              : 'bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200'
                          }`}
                        >
                          <span>🌟</span>
                          <span>Tất cả ({allSchoolHomeroomClasses.length} lớp • {totalSchoolStudentsCount} HS)</span>
                        </button>

                        {/* Danh sách các giáo viên sau khi phân nhóm và tìm kiếm */}
                        {finalTeachers.map(t => {
                          const tClasses = classes.filter(c => 
                            (c.teacherUsername && c.teacherUsername.toLowerCase() === t.username.toLowerCase()) ||
                            (c.teacherName && c.teacherName.toLowerCase() === t.fullName.toLowerCase())
                          );
                          const tClassIds = new Set(tClasses.map(c => c.id));
                          const tStudentsCount = students.filter(s => Boolean(s.classId && tClassIds.has(s.classId))).length;
                          const isSelected = adminTeacherFilter === t.username;
                          const isGuest = isGuestTeacher(t);

                          return (
                            <button
                              key={t.id || t.username}
                              type="button"
                              onClick={() => setAdminTeacherFilter(isSelected ? 'all' : t.username)}
                              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs ${
                                isSelected
                                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 scale-102'
                                  : tClasses.length > 0
                                    ? 'bg-indigo-50/70 text-indigo-950 hover:bg-indigo-100 border border-indigo-200 font-extrabold'
                                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                              }`}
                              title={`Tài khoản: ${t.username} • Đơn vị: ${t.schoolName || 'Chưa rõ'} • Số lớp: ${tClasses.length} • Sĩ số: ${tStudentsCount} học sinh`}
                            >
                              <span className="text-[11px]">{isSelected ? '✓' : isGuest ? '🌱' : '🏫'}</span>
                              <span>{t.fullName}</span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                {tClasses.length} lớp{tStudentsCount > 0 ? ` • ${tStudentsCount} HS` : ''}
                              </span>
                            </button>
                          );
                        })}

                        {finalTeachers.length === 0 && (
                          <div className="text-xs text-slate-500 italic py-2 px-3">
                            Không có giáo viên nào trong danh mục này khớp với "{teacherSearchQuery}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Class List Action Header (Thiết kế thanh thoát, gọn gàng, nút bấm trực quan) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-indigo-50/90 via-sky-50/90 to-purple-50/90 p-3.5 rounded-2xl border border-indigo-200 shadow-2xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-indigo-950 uppercase tracking-tight">
                  DANH SÁCH KHÔNG GIAN LỚP HỌC
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-600 text-white shadow-2xs">
                  {displayedClasses.length} LỚP
                </span>
                {isAdmin && adminTeacherFilter !== 'all' && (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200">
                    Đang lọc theo giáo viên
                  </span>
                )}
              </div>
              <p className="text-[11px] text-indigo-700 font-semibold">
                Năm học 2026–2027 • Mỗi lớp có ảnh đại diện, giáo viên và thời khóa biểu riêng cố định
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {teacherRole === 'subject' && (
                <button
                  type="button"
                  disabled={isClassLimitReached}
                  onClick={() => {
                    if (isClassLimitReached) {
                      alert('Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!');
                      return;
                    }
                    setIsInitSubjectClassesModalOpen(true);
                  }}
                  className={`px-4 py-2.5 rounded-2xl font-black text-xs md:text-sm flex items-center gap-2 transition-all uppercase ${
                    isClassLimitReached
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60 shadow-none'
                      : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 text-white hover-zoom-btn shadow-md shadow-emerald-600/25'
                  }`}
                  title={isClassLimitReached ? 'Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!' : 'Khởi tạo nhanh danh sách các lớp dạy bộ môn, điền thông tin lớp và số lượng học sinh'}
                >
                  <Sparkles className={`w-4 h-4 ${isClassLimitReached ? 'text-slate-400' : 'text-amber-300 animate-pulse'}`} />
                  <span>KHỞI TẠO LỚP DẠY BỘ MÔN</span>
                </button>
              )}

              {classes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsDeleteAllClassesOpen(true)}
                  className="btn-3d btn-3d-sm btn-3d-rose gap-1.5"
                  title="Xóa tất cả các lớp học trong hệ thống"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>XÓA HẾT LỚP</span>
                </button>
              )}

              {/* Input file ẩn cho upload excel lớp học */}
              <input
                type="file"
                ref={importClassesFileInputRef}
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleUploadClassExcel}
              />

              {/* 🏛️ Nút Cấu hình Phân hiệu & Điểm trường */}
              {canManageSchoolBranches && (
                <button
                  type="button"
                  onClick={handleOpenSchoolBranchModal}
                  className="btn-3d btn-3d-sm btn-3d-indigo gap-1.5 shrink-0"
                  title="Khai báo và quản lý danh mục Phân hiệu, Điểm trường trực thuộc nhà trường"
                >
                  <Building2 className="w-3.5 h-3.5 text-sky-200" />
                  <span>PHÂN HIỆU & ĐIỂM TRƯỜNG</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadClassExcelTemplate}
                className="btn-3d btn-3d-sm btn-3d-emerald gap-1.5"
                title="Tải file Excel mẫu danh sách lớp học để điền thông tin và tạo hàng loạt"
              >
                <Download className="w-3.5 h-3.5" />
                <span>MẪU EXCEL LỚP</span>
              </button>

              <button
                type="button"
                disabled={isClassLimitReached}
                onClick={() => {
                  if (isClassLimitReached) {
                    alert('Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!');
                    return;
                  }
                  importClassesFileInputRef.current?.click();
                }}
                className={`btn-3d btn-3d-sm ${
                  isClassLimitReached
                    ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed opacity-60 shadow-none'
                    : 'btn-3d-cyan'
                } gap-1.5`}
                title={isClassLimitReached ? 'Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!' : 'Tải lên file Excel để tạo hàng loạt lớp học'}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>NHẬP LỚP TỪ EXCEL</span>
              </button>

              <button
                type="button"
                disabled={isClassLimitReached}
                onClick={() => {
                  if (isClassLimitReached) {
                    alert('Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!');
                    return;
                  }
                  setIsCreateClassOpen(true);
                }}
                className={`btn-3d btn-3d-sm ${
                  isClassLimitReached
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60 shadow-none'
                    : 'btn-3d-blue'
                } gap-1.5`}
                title={isClassLimitReached ? 'Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!' : 'Thêm lớp học mới'}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>THÊM LỚP HỌC MỚI</span>
              </button>
            </div>
          </div>

          {/* NÚT LỆNH TÍCH CHỌN NHIỀU LỚP & THAO TÁC ĐỒNG LOẠT (CẢ 3 VAI TRÒ) */}
          {displayedClasses.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-3xl border-2 border-indigo-200/90 shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedClassIds.length === displayedClasses.length) {
                      setSelectedClassIds([]);
                    } else {
                      setSelectedClassIds(displayedClasses.map(c => c.id));
                    }
                  }}
                  className={`px-4 py-2.5 rounded-2xl font-black text-xs md:text-sm flex items-center gap-2 transition-all hover-zoom-btn uppercase shadow-xs ${
                    selectedClassIds.length > 0 && selectedClassIds.length === displayedClasses.length
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-2 border-amber-300'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-2 border-indigo-200'
                  }`}
                  title="Tích chọn tất cả các lớp hoặc bỏ chọn"
                >
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                  <span>{selectedClassIds.length === displayedClasses.length ? 'BỎ CHỌN TẤT CẢ' : `TÍCH CHỌN TẤT CẢ (${displayedClasses.length} LỚP)`}</span>
                </button>

                {selectedClassIds.length > 0 && (
                  <span className="px-3.5 py-2 rounded-2xl bg-amber-50 text-amber-900 border-2 border-amber-300 text-xs font-black uppercase flex items-center gap-1.5 shadow-2xs">
                    <span>🎯</span>
                    <span>ĐÃ CHỌN: <strong className="text-amber-950 font-black">{selectedClassIds.length}</strong> / {displayedClasses.length} LỚP</span>
                  </span>
                )}
              </div>

              {selectedClassIds.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkEditGrade('keep');
                      setBulkEditYear('keep');
                      setBulkEditTeacher('');
                      setBulkEditColor('keep');
                      setBulkEditSlogan('');
                      setIsBulkClassEditOpen(true);
                    }}
                    className="px-4 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white rounded-2xl font-black text-xs md:text-sm flex items-center gap-2 transition-all hover-zoom-btn shadow-md shadow-indigo-600/25 uppercase"
                    title="Sửa thông tin các lớp đã chọn cùng lúc (Năm học, Khối, Giáo viên, Màu, Khẩu hiệu)"
                  >
                    <Edit3 className="w-4 h-4 text-cyan-200" />
                    <span>SỬA THÔNG TIN ĐỒNG LOẠT ({selectedClassIds.length} LỚP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsBulkClassDeleteOpen(true)}
                    className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-2xl font-black text-xs md:text-sm flex items-center gap-2 transition-all hover-zoom-btn shadow-md shadow-rose-600/25 uppercase"
                    title="Xóa đồng loạt các lớp đã tích chọn"
                  >
                    <Trash2 className="w-4 h-4 text-rose-100" />
                    <span>XÓA ĐỒNG LOẠT ({selectedClassIds.length} LỚP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedClassIds([])}
                    className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                    title="Hủy chọn"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-500 font-medium italic flex items-center gap-1.5">
                  <span>💡</span>
                  <span>Tích chọn nút trên từng thẻ lớp học để thao tác xóa hoặc sửa thông tin đồng loạt</span>
                </div>
              )}
            </div>
          )}

          {/* TÌM KIẾM NHANH LỚP HỌC & THANH SẮP XẾP NHANH */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="relative flex-1 min-w-[280px] max-w-lg">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={classSearchQuery}
                onChange={(e) => setClassSearchQuery(e.target.value)}
                placeholder="Nhập tên lớp, giáo viên, phân hiệu, điểm trường..."
                className="block w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-shadow"
              />
              {classSearchQuery && (
                <button
                  type="button"
                  onClick={() => setClassSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-600 transition-colors" />
                </button>
              )}
            </div>

            {/* Quick Sort Bar bên cạnh ô tìm kiếm */}
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-indigo-200 shadow-2xs">
              <span className="text-xs font-black text-slate-600 flex items-center gap-1 uppercase">
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
                <span>Sắp xếp:</span>
              </span>
              <select
                value={classSortBy}
                onChange={(e) => setClassSortBy(e.target.value as any)}
                className="text-xs font-bold text-indigo-950 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none cursor-pointer hover:bg-slate-100"
              >
                <option value="grade">🎓 Khối lớp</option>
                <option value="branch">🏛️ Phân hiệu</option>
                <option value="campus">📍 Điểm trường</option>
                <option value="name">🔤 Tên lớp (A-Z)</option>
              </select>
              <button
                type="button"
                onClick={() => setClassSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all border border-indigo-200 flex items-center gap-1"
                title={classSortOrder === 'asc' ? 'Đang tăng dần (A-Z / 1-5). Click đổi sang giảm dần' : 'Đang giảm dần (Z-A / 5-1). Click đổi sang tăng dần'}
              >
                <span>{classSortOrder === 'asc' ? '▲ Tăng dần' : '▼ Giảm dần'}</span>
              </button>
            </div>
          </div>

          {/* Grid Thẻ Lớp Học LỚN, RÕ NÉT kèm Ảnh Đại Diện To Rõ */}
          {displayedClasses.length === 0 ? (
            <div className="bg-gradient-to-b from-white via-indigo-50/30 to-sky-50/30 rounded-2xl border-2 border-dashed border-indigo-200/90 p-8 text-center space-y-3.5 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto shadow-2xs">
                <School className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-indigo-950 uppercase tracking-tight">
                  {classSearchQuery ? 'KHÔNG TÌM THẤY LỚP HỌC HOẶC GIÁO VIÊN PHÙ HỢP' : (isAdmin && adminTeacherFilter !== 'all' ? 'GIÁO VIÊN NÀY CHƯA CÓ LỚP HỌC NÀO' : 'CHƯA CÓ LỚP HỌC NÀO TRONG HỆ THỐNG')}
                </h3>
                <p className="text-xs text-indigo-700 max-w-md mx-auto leading-relaxed font-semibold">
                  {classSearchQuery 
                    ? 'Hãy thử tìm kiếm với từ khóa khác hoặc kiểm tra lại lỗi chính tả.'
                    : (isAdmin && adminTeacherFilter !== 'all'
                      ? 'Bạn có thể bấm nút "Tạo lớp học mới" và phân công cho giáo viên này phụ trách.'
                      : 'Tất cả các lớp học đã được xóa hoặc chưa được tạo. Hãy bấm nút bên dưới để tạo lớp học bắt đầu năm học mới.')}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">

                <button
                  type="button"
                  onClick={handleDownloadClassExcelTemplate}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-black text-xs inline-flex items-center gap-1.5 uppercase transition-all hover-zoom-btn shadow-xs"
                  title="Tải file Excel mẫu danh sách lớp học để điền thông tin và tạo hàng loạt"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  <span>MẪU EXCEL LỚP</span>
                </button>
                <button
                  type="button"
                  disabled={isClassLimitReached}
                  onClick={() => {
                    if (isClassLimitReached) {
                      alert('Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!');
                      return;
                    }
                    importClassesFileInputRef.current?.click();
                  }}
                  className={`px-3.5 py-2 rounded-xl font-black text-xs inline-flex items-center gap-1.5 uppercase transition-all ${
                    isClassLimitReached
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60 shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover-zoom-btn'
                  }`}
                  title={isClassLimitReached ? 'Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!' : 'Tải lên file Excel để tạo hàng loạt lớp học'}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>NHẬP TỪ EXCEL</span>
                </button>
                <button
                  disabled={isClassLimitReached}
                  onClick={() => {
                    if (isClassLimitReached) {
                      alert('Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!');
                      return;
                    }
                    setIsCreateClassOpen(true);
                  }}
                  className={`px-4 py-2 rounded-xl font-black text-xs inline-flex items-center gap-1.5 uppercase transition-all ${
                    isClassLimitReached
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60 shadow-none'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs hover-zoom-btn'
                  }`}
                  title={isClassLimitReached ? 'Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!' : 'Tạo lớp học mới'}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>TẠO LỚP HỌC MỚI</span>
                </button>
              </div>
            </div>
          ) : (
          <div className={displayedClasses.length === 1 ? 'max-w-3xl mx-auto' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 lg:gap-6'}>
            {displayedClasses.map((cls) => {
              const isSelected = cls.id === activeClassId;
              const isClassChecked = selectedClassIds.includes(cls.id);
              const classStudents = students.filter(s => s.classId === cls.id);
              const count = classStudents.length;
              const maleCount = classStudents.filter(s => s.gender === 'Nam').length;
              const femaleCount = classStudents.filter(s => s.gender === 'Nữ').length;
              const trimmedName = cls.name.trim();
              const displayName = /^lớp\s+/i.test(trimmedName) ? trimmedName : `Lớp ${trimmedName}`;

              return (
                <div
                  key={cls.id}
                  className={`bg-white rounded-2xl p-3.5 sm:p-4 border-2 transition-all hover-zoom-card flex flex-col justify-between space-y-3 shadow-2xs hover:shadow-lg ${
                    isClassChecked
                      ? 'border-amber-500 ring-4 ring-amber-400/30 shadow-amber-500/10'
                      : isSelected 
                        ? 'border-indigo-600 ring-4 ring-indigo-500/20 shadow-indigo-500/10' 
                        : 'border-indigo-100 hover:border-indigo-400'
                  }`}
                >
                  {/* Dải màu nhận diện trên đầu thẻ */}
                  <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: cls.color || '#3B82F6' }} />

                  {/* KHUNG ẢNH ĐẠI DIỆN LỚP CÂN ĐỐI CHUẨN TỈ LỆ BANNER 16:7 KHỚP 100% GÓC NHÌN CROP, VỪA VẶN MÀN HÌNH 1366x768 */}
                  <div className="relative w-full aspect-[16/7] min-h-[110px] sm:min-h-[120px] max-h-[150px] rounded-xl md:rounded-2xl overflow-hidden bg-white shadow-xs group/photo border border-indigo-200">
                    {cls.avatar ? (
                      <img
                        src={cls.avatar} onError={(e) => handleAvatarImgError(e, undefined, cls?.name)}
                        alt={displayName}
                        className="w-full h-full object-cover object-center transition-transform duration-300 group-hover/photo:scale-102"
                        style={
                          (cls.avatarScale && cls.avatarScale !== 1) || (cls.avatarPosition && (cls.avatarPosition.x !== 0 || cls.avatarPosition.y !== 0))
                            ? {
                                transform: `translate(${cls.avatarPosition?.x || 0}px, ${cls.avatarPosition?.y || 0}px) scale(${cls.avatarScale || 1})`,
                                transformOrigin: 'center center'
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <div 
                        className="w-full h-full flex flex-col items-center justify-center font-black text-slate-800 text-2xl shadow-xs"
                        style={{ backgroundColor: cls.color || '#6366F1' }}
                      >
                        <span>{cls.name}</span>
                        <span className="text-[10px] font-semibold text-slate-600 mt-0.5 uppercase">CHƯA CÀI ĐẶT ẢNH LỚP</span>
                      </div>
                    )}

                    {/* Gradient overlay for badges */}
                    <div className="absolute inset-0 bg-gradient-to-t from-indigo-600/70 via-transparent to-indigo-600/40 pointer-events-none" />

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1.5">
                      <span 
                        className="px-2 py-0.5 rounded-full text-slate-800 text-[10px] sm:text-[11px] font-black shadow-sm flex items-center gap-1.5 backdrop-blur-md uppercase"
                        style={{ backgroundColor: cls.color ? `${cls.color}ee` : '#6366F1ee' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white ring-2 ring-white/40" />
                        <span>{cls.grade} • {cls.academicYear || '2026–2027'}</span>
                      </span>

                      {isSelected ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-black text-[10px] sm:text-[11px] tracking-wide shadow-sm flex items-center gap-1 backdrop-blur-md uppercase">
                          <Check className="w-3 h-3" />
                          <span>✓ ĐANG CHỌN</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => setActiveClassId(cls.id)}
                          className="px-2 py-0.5 rounded-full bg-white hover:bg-indigo-50 text-indigo-700 font-black text-[10px] sm:text-[11px] transition-all shadow-sm hover-zoom-btn backdrop-blur-md uppercase"
                        >
                          CHỌN LỚP NÀY
                        </button>
                      )}
                    </div>

                    {/* Bottom Floating Actions: Multi-Select Checkbox & Zoom */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClassIds(prev => 
                            prev.includes(cls.id) ? prev.filter(id => id !== cls.id) : [...prev, cls.id]
                          );
                        }}
                        className={`px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-black flex items-center gap-1.5 shadow-md backdrop-blur-md border transition-all hover-zoom-btn uppercase ${
                          isClassChecked
                            ? 'bg-amber-400 text-amber-950 border-amber-300 ring-2 ring-amber-300/60 font-black'
                            : 'bg-indigo-600/85 hover:bg-indigo-900 text-white border-white/25'
                        }`}
                        title="Tích chọn lớp này để thao tác đồng loạt (xóa, sửa)"
                      >
                        <div className={`w-3 h-3 rounded border flex items-center justify-center ${
                          isClassChecked ? 'bg-amber-600 border-amber-600 text-white' : 'border-white/60 bg-white/20'
                        }`}>
                          {isClassChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span>{isClassChecked ? 'ĐÃ CHỌN' : 'TÍCH CHỌN'}</span>
                      </button>
                    </div>

                    {canEditClassAvatar && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                        <button
                          onClick={() => setAvatarEditingClass(cls)}
                          className="px-2 py-1 bg-indigo-600/85 hover:bg-indigo-950 text-white rounded-lg text-[10px] sm:text-[11px] font-black flex items-center gap-1.5 shadow-md backdrop-blur-md border border-white/25 transition-all hover-zoom-btn uppercase"
                          title="Phóng to, thu nhỏ và căn chỉnh vị trí ảnh lớp học"
                        >
                          <ZoomIn className="w-3 h-3 text-amber-300" />
                          <span>CĂN CHỈNH ẢNH</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* THÔNG TIN CHI TIẾT LỚP HỌC (TƯƠI SÁNG, HẠN CHẾ CHỮ MÀU ĐEN) */}
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-lg sm:text-xl font-black text-indigo-950 leading-tight uppercase">
                          {displayName}
                        </h3>
                        <p className="text-[11px] sm:text-xs text-blue-700 font-black mt-0.5 flex items-center gap-1 uppercase">
                          <span>🏫</span>
                          <span>GVCN: <strong className="text-indigo-800 font-black">{cls.teacherName || allUsers.find(u => u.username?.toLowerCase() === cls.teacherUsername?.toLowerCase())?.fullName || teacherProfile.name}</strong></span>
                        </p>
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-[10px] sm:text-[10.5px] font-black text-amber-800 border border-amber-200 shadow-2xs mt-0.5 uppercase">
                          <span>📅</span>
                          <span>NĂM HỌC: <strong className="text-amber-950 font-black">{cls.academicYear || '2026–2027'}</strong></span>
                        </div>
                        {(cls.branch || cls.campus) ? (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {cls.branch && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-[9.5px] font-black text-purple-800 border border-purple-200 shadow-2xs uppercase">
                                🏛️ {cls.branch}
                              </span>
                            )}
                            {cls.campus && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-[9.5px] font-black text-sky-800 border border-sky-200 shadow-2xs uppercase">
                                📍 {cls.campus}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-[9px] font-bold text-slate-400 border border-slate-200">
                              🏛️ Chưa gán phân hiệu (Null)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Quick Edit/Delete buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setEditingClass(cls)}
                          className={`p-1.5 rounded-lg transition-colors hover-zoom-btn border ${
                            isSuperAdmin
                              ? 'text-indigo-800 bg-indigo-100 hover:bg-indigo-200 border-indigo-300 ring-1 ring-indigo-300 font-bold'
                              : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
                          }`}
                          title={isSuperAdmin ? "Quyền Quản Trị Tối Cao: Sửa thông tin lớp học này" : "Sửa thông tin lớp học"}
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>

                        <button
                          onClick={() => setDeleteConfirmClass(cls)}
                          className={`p-1.5 rounded-lg transition-colors hover-zoom-btn border ${
                            isSuperAdmin
                              ? 'text-rose-700 bg-rose-100 hover:bg-rose-200 border-rose-300 ring-1 ring-rose-300 font-bold shadow-xs'
                              : 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                          }`}
                          title={isSuperAdmin ? "Quyền Quản Trị Tối Cao: Xóa lớp học này trên toàn hệ thống" : "Xóa lớp học này"}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Sĩ số & Phân loại học sinh */}
                    <div className="grid grid-cols-2 gap-1.5 p-2 bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-purple-50/80 rounded-xl border border-indigo-200">
                      <div>
                        <span className="text-[9.5px] font-black text-indigo-600 uppercase tracking-wider block">SĨ SỐ HỌC SINH</span>
                        <span className="text-xs sm:text-sm font-black text-indigo-900 font-mono">
                          👥 {count} EM HỌC SINH
                        </span>
                      </div>
                      <div>
                        <span className="text-[9.5px] font-black text-indigo-600 uppercase tracking-wider block">CƠ CẤU GIỚI TÍNH</span>
                        <span className="text-[10px] sm:text-[11px] font-black text-blue-800 uppercase">
                          ♂ {maleCount} NAM • ♀ {femaleCount} NỮ
                        </span>
                      </div>
                    </div>

                    {cls.slogan && (
                      <div className="text-[10px] sm:text-[10.5px] text-amber-800 font-bold italic bg-amber-50/80 p-1.5 rounded-lg border border-amber-200/80">
                        ⭐ « {cls.slogan} »
                      </div>
                    )}
                  </div>

                  {/* 2 NÚT THAO TÁC CHÍNH: THỜI KHÓA BIỂU RIÊNG & VÀO LỚP HỌC - 3D HIỆN ĐẠI CÔNG NGHỆ */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => {
                        setActiveClassId(cls.id);
                        if (onNavigate) onNavigate('schedule');
                      }}
                      className="btn-3d btn-3d-cyan py-2 px-2 text-[11px] sm:text-xs gap-1.5"
                      title={`Thiết lập thời khóa biểu riêng cho lớp ${cls.name}`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>THỜI KHÓA BIỂU RIÊNG</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveClassId(cls.id);
                        setActiveTabMode('students');
                      }}
                      className={`btn-3d py-2 px-2.5 text-xs gap-1.5 ${
                        isSelected ? 'btn-3d-blue ring-2 ring-sky-300' : 'btn-3d-blue'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>VÀO LỚP HỌC</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VIEW TAB: QUẢN LÝ HỌC SINH & CẤU HÌNH NHẬN XU (User Request 2 & 9) */}
      {/* ========================================================================= */}
      {activeTabMode === 'students' && (
        <div className="space-y-2.5 sm:space-y-3">
          {/* ACTIVE SUBJECT EVALUATION BAR: MÀU SẮC TƯƠI MỚI HIỆN ĐẠI (User Request 2) */}
          <div className="bg-gradient-to-r from-teal-50 via-emerald-50 to-indigo-50/70 rounded-2xl border border-emerald-200/70 p-2.5 px-3.5 shadow-2xs space-y-1.5 hover-zoom-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-600 to-yellow-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-[11px] font-black text-emerald-950 uppercase tracking-wider inline-block mr-1.5">
                    MÔN HỌC ĐÁNH GIÁ NHẬN XU:
                  </span>
                  <span className="text-[10.5px] text-emerald-800 font-semibold">
                    Đang chấm cho: <strong className="text-indigo-800 font-black">{activeEvalSubject}</strong>
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-xs shadow-xs shadow-indigo-500/25">
                  {activeEvalSubject}
                </span>
                <span className="text-[10px] font-bold text-emerald-800 bg-white/90 px-2 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                  ✓ Áp dụng {appliedSubjects.length}/{subjects.length} môn
                </span>
              </div>

              {/* NÚT CẤU HÌNH NHẬN XU (User Request) */}
              {canConfigureCoinSubjects && (
                <button
                  onClick={() => setIsSubjectConfigOpen(true)}
                  className="px-3 py-1 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-amber-950 border border-amber-300 rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow-xs transition-all hover-zoom-btn self-start sm:self-auto uppercase tracking-wide cursor-pointer"
                  title="Mở bảng cấu hình nhận xu: Thêm, sửa, xóa và thiết lập danh sách môn học áp dụng"
                >
                  <Settings className="w-3.5 h-3.5 text-amber-950" />
                  <span>⚙️ CẤU HÌNH NHẬN XU</span>
                </button>
              )}
            </div>

            {/* Danh sách môn học đang áp dụng: Sắp xếp tự động thành 2 dòng khi nhiều môn, không cuộn ngang */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 pb-0.5">
              {appliedSubjects.map((sub) => {
                const isSelected = activeEvalSubject === sub.name;
                const isCore = sub.isDefault || isHomeroomSubject(sub.name);
                return (
                  <button
                    key={sub.id}
                    onClick={() => setActiveEvalSubject(sub.name)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 hover-zoom-btn uppercase cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-600/30 scale-102 font-black ring-2 ring-indigo-400'
                        : 'bg-white text-indigo-900 border border-indigo-100 hover:bg-indigo-50 hover:border-indigo-300 font-bold'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full ring-2 ring-white/60 shrink-0" style={{ backgroundColor: sub.color || '#3B82F6' }} />
                    <span className="whitespace-nowrap">{sub.name}</span>
                    {isCore && <span className="text-[9px] text-amber-300 font-black">★</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Bar: Search, Excel, Add, Bulk Delete (Sắp xếp gọn gàng vừa khít khung, không tràn viền) */}
          <div className="bg-white rounded-2xl border border-indigo-100/90 p-2.5 px-3.5 shadow-2xs space-y-2 hover-zoom-card">
            {/* Hàng 1: Tìm kiếm & Các bộ lọc nhanh */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 w-full">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-indigo-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm học sinh theo tên, STT hoặc chức vụ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-indigo-50/40 border border-indigo-200/80 rounded-lg text-xs font-bold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <select
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-indigo-50/50 border border-indigo-200/80 rounded-lg text-xs font-black text-indigo-900 focus:outline-none hover-zoom-btn uppercase"
                >
                  <option value="all">TẤT CẢ CÁC TỔ</option>
                  <option value="Tổ 1">TỔ 1</option>
                  <option value="Tổ 2">TỔ 2</option>
                  <option value="Tổ 3">TỔ 3</option>
                  <option value="Tổ 4">TỔ 4</option>
                </select>

                <select
                  value={selectedRoleFilter}
                  onChange={(e) => setSelectedRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-indigo-50/50 border border-indigo-200/80 rounded-lg text-xs font-black text-indigo-900 focus:outline-none hover-zoom-btn uppercase"
                >
                  <option value="all">TẤT CẢ CHỨC VỤ</option>
                  <option value="officers">⭐ TẤT CẢ CÁN BỘ LỚP</option>
                  <option value="monitor">👑 LỚP TRƯỞNG</option>
                  <option value="academic_deputy">📘 LỚP PHÓ HỌC TẬP</option>
                  <option value="activity_deputy">🚩 LỚP PHONG TRÀO</option>
                  <option value="team_leader">🥇 TỔ TRƯỞNG (TẤT CẢ)</option>
                  <option value="team_vice">🥈 TỔ PHÓ (TẤT CẢ)</option>
                  {OFFICER_ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.icon} {opt.label}
                    </option>
                  ))}
                </select>

                {filteredStudents.length > 0 && (
                  <button
                    onClick={handleSelectAllStudents}
                    className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-lg text-xs font-black flex items-center gap-1 hover-zoom-btn border border-indigo-200/60 uppercase"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{selectedStudentIds.length === filteredStudents.length ? 'BỎ CHỌN' : 'CHỌN TẤT CẢ'}</span>
                  </button>
                )}

                <span className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold font-mono">
                  {filteredStudents.length} / {currentClassStudents.length} em
                </span>
              </div>
            </div>

            {/* Hàng 2: Nhóm nút lệnh thao tác 3D công nghệ - Xếp gọn gàng trên màn hình không bị tràn, tông màu Xanh tươi sáng */}
            <div className="pt-2 border-t border-sky-100 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 w-full">
              {/* CỤM 1: THÊM & DỮ LIỆU EXCEL (Tông Xanh Dương 3D Công Nghệ) */}
              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 p-1 bg-sky-50/80 rounded-xl border border-sky-200/70 shadow-2xs">
                <button
                  disabled={isStudentLimitReached}
                  onClick={() => {
                    if (isStudentLimitReached) {
                      alert('Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!');
                      return;
                    }
                    setIsSingleAddOpen(true);
                    setSingleRoles([]);
                  }}
                  className={`btn-3d btn-3d-sm ${
                    isStudentLimitReached
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60 shadow-none'
                      : 'btn-3d-blue'
                  } gap-1 shrink-0`}
                  title={isStudentLimitReached ? 'Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!' : 'Thêm học sinh mới'}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>THÊM HỌC SINH</span>
                </button>

                <input
                  type="file"
                  ref={excelFileInputRef}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleExcelUpload}
                />
                <button
                  disabled={isStudentLimitReached}
                  onClick={() => {
                    if (isStudentLimitReached) {
                      alert('Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!');
                      return;
                    }
                    excelFileInputRef.current?.click();
                  }}
                  className={`btn-3d btn-3d-sm ${
                    isStudentLimitReached
                      ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed opacity-60 shadow-none'
                      : 'btn-3d-light'
                  } gap-1 shrink-0`}
                  title={isStudentLimitReached ? 'Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!' : 'Nhập danh sách học sinh từ file Excel'}
                >
                  <Upload className={`w-3.5 h-3.5 ${isStudentLimitReached ? 'text-slate-400' : 'text-blue-600'}`} />
                  <span>NHẬP EXCEL</span>
                </button>

                <button
                  onClick={handleDownloadExcelTemplate}
                  className="btn-3d btn-3d-sm btn-3d-emerald gap-1 shrink-0"
                  title="Tải file mẫu Excel danh sách học sinh: Họ và tên, Ngày sinh, Giới tính, Tổ, Chức vụ"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>FILE MẪU (.XLSX)</span>
                </button>
              </div>

              {/* CỤM 2: ẢNH ĐẠI DIỆN & AVATAR HỌC SINH (Tông Xanh Cyan / Sky 3D) */}
              {canEditStudentAvatar && (
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 p-1 bg-cyan-50/80 rounded-xl border border-cyan-200/70 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoAssignInitialType('default');
                      setIsAutoAssignAvatarModalOpen(true);
                    }}
                    className="btn-3d btn-3d-sm btn-3d-cyan gap-1 shrink-0"
                    title="Tự động chèn Avatar mặc định hoạt hình phân loại Nam/Nữ cho học sinh"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
                    <span>AVATAR MẪU</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAutoAssignInitialType('real_demo');
                      setIsAutoAssignAvatarModalOpen(true);
                    }}
                    className="btn-3d btn-3d-sm btn-3d-sky gap-1 shrink-0"
                    title="Tự động chèn Avatar ảnh thẻ thật demo từ kho thư mục máy tính cho học sinh"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>ẢNH THẺ THẬT</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsGroupPhotoModalOpen(true)}
                    className="btn-3d btn-3d-sm btn-3d-blue gap-1 shrink-0"
                    title="Tải lên ảnh chụp tập thể cả lớp, khoanh chọn từng khuôn mặt và ghép với học sinh trong danh sách"
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>CẮT TẬP THỂ</span>
                  </button>
                </div>
              )}

              {/* CỤM 3: TIỆN ÍCH, CẤU HÌNH & XUẤT BẢN (Tông Xanh Ngọc / Vàng Công Nghệ 3D) */}
              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 p-1 bg-emerald-50/80 rounded-xl border border-emerald-200/70 shadow-2xs">
                {canConfigureCoinSubjects && (
                  <button
                    onClick={() => setIsSubjectConfigOpen(true)}
                    className="btn-3d btn-3d-sm btn-3d-amber gap-1 shrink-0"
                    title="Cấu hình nhận xu: Thêm, sửa, xóa môn học và thiết lập danh sách áp dụng"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>⚙️ CẤU HÌNH XU</span>
                  </button>
                )}

                <button
                  onClick={() => setIsExportStudentListOpen(true)}
                  className="btn-3d btn-3d-sm btn-3d-emerald gap-1 shrink-0"
                  title="Xuất danh sách học sinh ra file Excel hoặc in ấn bản A4"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>XUẤT EXCEL</span>
                </button>

                {onNavigate && teacherRole !== 'subject' && canCreateClassInfographic && (
                  <button
                    onClick={() => onNavigate('infographic')}
                    className="btn-3d btn-3d-sm btn-3d-indigo gap-1 shrink-0"
                    title="Tạo bản Infographic khổ dọc A4 xuất PDF cho lớp"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                    <span>INFOGRAPHIC A4</span>
                  </button>
                )}
              </div>

              {/* CỤM 4: THAO TÁC HỆ THỐNG & DỌN DẸP */}
              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 p-1 bg-slate-50/90 rounded-xl border border-slate-200/90 shadow-2xs">
                {currentClassStudents.length > 0 && canResetOrAssignCoins && (
                  <button
                    onClick={() => setIsClassResetCoinsOpen(true)}
                    className="btn-3d btn-3d-sm btn-3d-light text-amber-900 border-amber-300 gap-1 shrink-0"
                    title="Đặt lại toàn bộ số xu của tất cả học sinh trong lớp về mức 0"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    <span>RESET XU</span>
                  </button>
                )}

                {currentClassStudents.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedStudentIds.length > 0) {
                        setIsBulkDeleteConfirmOpen(true);
                      } else {
                        setIsClearAllConfirmOpen(true);
                      }
                    }}
                    className="btn-3d btn-3d-sm btn-3d-rose gap-1 shrink-0"
                    title="Xóa danh sách học sinh đồng loạt"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {selectedStudentIds.length > 0 ? `XÓA ${selectedStudentIds.length} EM` : 'XÓA DANH SÁCH'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Floating Bulk Action Bar when Students are selected (Yêu cầu 3 & 4) */}
          {selectedStudentIds.length > 0 && (
            <div className="sticky top-20 z-30 bg-gradient-to-r from-indigo-500 via-indigo-500 to-violet-500 text-white rounded-3xl p-3 md:p-4 shadow-2xl border-2 border-indigo-400/40 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-400 text-indigo-950 flex items-center justify-center font-black shadow-md">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs md:text-sm font-black text-amber-300 uppercase tracking-wide block">
                    ĐÃ CHỌN {selectedStudentIds.length} HỌC SINH
                  </span>
                  <span className="text-[11px] text-white font-medium">
                    Chọn các thao tác nhanh hàng loạt bên cạnh:
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canResetOrAssignCoins && canEvaluateEmulation && (
                  <button
                    onClick={() => {
                      setBulkAwardMode('xu');
                      setBulkAwardCoins(1);
                      setBulkAwardSubject(activeEvalSubject || subjects[0]?.name || 'Toán');
                      setBulkAwardReason('');
                      setIsBulkAwardOpen(true);
                    }}
                    className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-500/25 transition-all hover-zoom-btn uppercase"
                    title="Gán xu hoặc trừ xu đồng loạt cho các học sinh đã chọn"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>GÁN XU HÀNG LOẠT</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    if (onNavigate) onNavigate('certificate');
                  }}
                  className="px-3.5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-500/25 transition-all hover-zoom-btn uppercase"
                  title="Tạo Thư Khen điện tử cho các học sinh đã chọn"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>TẠO THƯ KHEN</span>
                </button>

                {canAssignClassOfficer && (
                  <button
                    onClick={() => {
                      setBulkSelectedRoles([]);
                      setIsBulkRoleModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-amber-950 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-amber-500/25 transition-all hover-zoom-btn uppercase"
                    title="Chỉ định chức vụ cán bộ lớp đồng loạt (Tối đa 3 chức vụ)"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>👑 GÁN CHỨC VỤ</span>
                  </button>
                )}

                {canResetOrAssignCoins && (
                  <button
                    onClick={() => setIsBulkResetCoinsOpen(true)}
                    className="px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white border border-white/25 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover-zoom-btn uppercase"
                    title="Đặt lại số xu của các em đã chọn về 0"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
                    <span>🔄 ĐẶT VỀ 0 XU</span>
                  </button>
                )}

                <button
                  onClick={() => setIsBulkDeleteConfirmOpen(true)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-rose-600/25 transition-all hover-zoom-btn uppercase"
                  title="Xóa các học sinh đã chọn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>XÓA ĐÃ CHỌN</span>
                </button>

                <button
                  onClick={() => setSelectedStudentIds([])}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all hover-zoom-btn uppercase"
                >
                  ✕ BỎ CHỌN
                </button>
              </div>
            </div>
          )}

          {/* Student Grid: BIG, 3D MODERN STYLE, LARGE CRISP AVATARS (User Request 9) */}
          {filteredStudents.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4">
              <Users className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-700">Chưa có học sinh nào phù hợp</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Bấm "Nhập Từ File Excel" để nạp nhanh danh sách hoặc "Tải File Mẫu (.xlsx)" để chuẩn bị danh sách học sinh.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">

                <button
                  onClick={handleDownloadExcelTemplate}
                  className="px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black hover-zoom-btn uppercase"
                >
                  TẢI FILE MẪU EXCEL
                </button>
                <button
                  disabled={isStudentLimitReached}
                  onClick={() => {
                    if (isStudentLimitReached) {
                      alert('Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!');
                      return;
                    }
                    setIsSingleAddOpen(true);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${
                    isStudentLimitReached
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
                      : 'bg-indigo-600 text-white hover-zoom-btn'
                  }`}
                  title={isStudentLimitReached ? 'Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!' : 'Thêm thủ công'}
                >
                  THÊM THỦ CÔNG
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 gap-4 lg:gap-5">
              {filteredStudents.map((student) => {
                const isChecked = selectedStudentIds.includes(student.id);

                const groupStyles: Record<string, string> = {
                  'Tổ 1': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  'Tổ 2': 'bg-sky-50 text-sky-700 border-sky-200',
                  'Tổ 3': 'bg-violet-50 text-violet-700 border-violet-200',
                  'Tổ 4': 'bg-amber-50 text-amber-800 border-amber-200',
                };
                const groupClass = groupStyles[student.group || 'Tổ 1'] || 'bg-slate-100 text-slate-700 border-slate-200';
                const studentRoles = getStudentRolesList(student);

                return (
                  <div
                    key={student.id}
                    className={`bg-gradient-to-b from-white via-white to-slate-50/70 rounded-2xl border transition-all duration-200 hover-zoom-card flex flex-col justify-between group relative overflow-hidden shadow-xs hover:shadow-md ${
                      isChecked 
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-md bg-indigo-50/30' 
                        : 'border-slate-200/90 hover:border-indigo-300'
                    }`}
                  >
                    {/* Top Row: STT Badge, Checkbox, Group, Gender & Role */}
                    <div className="p-3 pb-1.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectStudent(student.id)}
                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-700 to-violet-700 text-amber-300 font-black text-xs shadow-xs ring-1 ring-indigo-500 shrink-0 flex items-center gap-1">
                            <span className="text-[9.5px] text-white font-bold uppercase tracking-tight">STT</span>
                            <span className="font-mono">{student.stt}</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded-full border font-black text-[9.5px] ${groupClass}`}>
                            {student.group || 'Tổ 1'}
                          </span>
                        </div>

                        {/* Gender Badge */}
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-black shadow-2xs border ${
                          student.gender === 'Nam' 
                            ? 'bg-blue-50 text-blue-700 border-blue-200' 
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {student.gender === 'Nam' ? '♂ Nam' : '♀ Nữ'}
                        </span>
                      </div>

                      {/* Official Role Badges (Học sinh có thể đảm nhiệm tối đa 3 chức vụ) */}
                      <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5 min-h-[24px]">
                        {studentRoles.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1 flex-1">
                            {studentRoles.map((rName, rIdx) => {
                              const rDef = getStudentRoleInfo(rName);
                              return canAssignClassOfficer ? (
                                <button
                                  key={rIdx}
                                  type="button"
                                  onClick={() => {
                                    setQuickRoleStudent(student);
                                    setStudentSelectedRoles(studentRoles);
                                  }}
                                  className={`px-2 py-0.5 rounded-lg text-[9.5px] md:text-[10px] font-black shadow-2xs border flex items-center gap-0.5 transition-all hover-zoom-btn ${rDef?.badgeBg || 'bg-amber-100'} ${rDef?.badgeText || 'text-amber-900'} ${rDef?.badgeBorder || 'border-amber-300'}`}
                                  title={`Chức vụ: ${rName} (Bấm để chỉnh sửa tối đa 3 chức vụ)`}
                                >
                                  <span className="text-[11px]">{rDef?.icon || '👑'}</span>
                                  <span className="uppercase tracking-tight font-black">{rName}</span>
                                </button>
                              ) : (
                                <div
                                  key={rIdx}
                                  className={`px-2 py-0.5 rounded-lg text-[9.5px] md:text-[10px] font-black shadow-2xs border flex items-center gap-0.5 cursor-default ${rDef?.badgeBg || 'bg-amber-100'} ${rDef?.badgeText || 'text-amber-900'} ${rDef?.badgeBorder || 'border-amber-300'}`}
                                  title={`Chức vụ: ${rName}`}
                                >
                                  <span className="text-[11px]">{rDef?.icon || '👑'}</span>
                                  <span className="uppercase tracking-tight font-black">{rName}</span>
                                </div>
                              );
                            })}
                            {canAssignClassOfficer && studentRoles.length < 3 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setQuickRoleStudent(student);
                                  setStudentSelectedRoles(studentRoles);
                                }}
                                className="px-1.5 py-0.5 rounded-lg text-[9.5px] font-black text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 border border-dashed border-indigo-400 transition-colors flex items-center gap-0.5 hover-zoom-btn shadow-2xs"
                                title={`Đã gán ${studentRoles.length}/3 chức vụ. Bấm để thêm chức vụ.`}
                              >
                                <Plus className="w-2.5 h-2.5 text-indigo-600" />
                                <span>+ THÊM ({studentRoles.length}/3)</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          canAssignClassOfficer ? (
                            <button
                              type="button"
                              onClick={() => {
                                setQuickRoleStudent(student);
                                setStudentSelectedRoles([]);
                              }}
                              className="px-2 py-0.5 rounded-lg text-[9.5px] md:text-[10px] font-black text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 border border-dashed border-indigo-400 transition-colors flex items-center gap-1 hover-zoom-btn shadow-2xs"
                              title="Bấm để gán chức vụ cán bộ lớp (Tối đa 3 chức vụ)"
                            >
                              <Crown className="w-3 h-3 text-amber-500" />
                              <span>+ GÁN CHỨC VỤ (0/3)</span>
                            </button>
                          ) : null
                        )}
                      </div>
                    </div>

                    {/* Middle Section: TO, RÕ NÉT, 3D AVATAR & STUDENT INFO */}
                    <div className="px-3 py-1.5 flex items-center gap-2.5">
                      {/* LARGE 3D CRISP AVATAR (Ảnh nạp gốc, đã crop chuẩn canvas, không bị lẹm viền) */}
                      <div className="relative shrink-0 group/avatar">
                        <div 
                          onClick={() => {
                            if (canEditStudentAvatar) {
                              setAvatarEditingStudent(student);
                            }
                          }}
                          className={`w-[66px] h-[66px] sm:w-[72px] sm:h-[72px] rounded-2xl overflow-hidden border-2 border-indigo-200/90 bg-gradient-to-tr from-indigo-50 via-white to-sky-50 shadow-md relative ring-2 ring-indigo-50 transition-all ${
                            canEditStudentAvatar ? 'group-hover/avatar:border-indigo-500 cursor-pointer hover-zoom-btn' : 'cursor-default'
                          }`}
                          title={canEditStudentAvatar ? "Bấm để thu phóng & căn chỉnh ảnh đại diện học sinh" : "Ảnh đại diện học sinh (Chỉ GVCN có quyền thay đổi)"}
                        >
                          <img
                            src={student.avatar}
                            alt={student.name}
                            className={`w-full h-full object-cover transition-transform ${canEditStudentAvatar ? 'group-hover/avatar:scale-105' : ''}`}
                            referrerPolicy="no-referrer"
                            onError={(e) => handleAvatarImgError(e, student.gender, student.name)}
                          />

                          {canEditStudentAvatar && (
                            <>
                              <div className="absolute inset-0 bg-indigo-600/65 text-white text-[9px] font-black flex flex-col items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                <Camera className="w-3.5 h-3.5 mb-0.5 text-amber-300" />
                                <span>CHỈNH ẢNH</span>
                              </div>

                              <div className="absolute bottom-1 right-1 w-4.5 h-4.5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs border border-white">
                                <Camera className="w-2.5 h-2.5" />
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div 
                        onClick={() => {
                          setEditingStudent(student);
                          setEditingRoles(getStudentRolesList(student));
                        }}
                        className="flex-1 min-w-0 space-y-0.5 cursor-pointer group/info"
                        title="Chạm để xem & chỉnh sửa thông tin học sinh"
                      >
                        <h4 
                          className="text-sm font-black text-indigo-950 leading-snug tracking-tight group-hover/info:text-indigo-600 transition-colors line-clamp-2 break-words" 
                          title={student.name}
                        >
                          {student.name}
                        </h4>

                        <div className="flex items-center gap-1 text-[11px] text-indigo-600 font-medium">
                          <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span className="font-bold text-indigo-700">{student.birthDate ? student.birthDate : 'Chưa có ngày sinh'}</span>
                        </div>

                        <div className="pt-0.5 space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 text-amber-950 font-black text-[11px] rounded-lg shadow-xs shadow-amber-400/25 border border-amber-300 shrink-0">
                            <Coins className="w-3.5 h-3.5 text-amber-950 fill-amber-500 shrink-0" />
                            <span>{student.points} xu thi đua</span>
                          </span>

                          {/* Dữ liệu xu theo môn học (User Requirement: Lưu theo học sinh và theo môn) */}
                          {student.subjectPoints && Object.entries(student.subjectPoints).some(([_, pts]) => pts > 0) && (
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {Object.entries(student.subjectPoints)
                                .filter(([_, pts]) => pts > 0)
                                .slice(0, 3)
                                .map(([subName, pts]) => {
                                  const subObj = subjects.find(s => s.name === subName);
                                  return (
                                    <span
                                      key={subName}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-indigo-50/90 text-[9.5px] font-bold text-indigo-900 border border-indigo-100"
                                      title={`Môn ${subName}: ${pts} xu`}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: subObj?.color || '#3B82F6' }} />
                                      <span className="truncate max-w-[60px]">{subName}:</span>
                                      <strong className="text-amber-700 font-black">+{pts}</strong>
                                    </span>
                                  );
                                })}
                              {Object.entries(student.subjectPoints).filter(([_, pts]) => pts > 0).length > 3 && (
                                <span 
                                  className="px-1.5 py-0.2 rounded-md bg-slate-100 text-[9.5px] font-bold text-slate-600 cursor-help"
                                  title={Object.entries(student.subjectPoints).filter(([_, pts]) => pts > 0).map(([k, v]) => `${k}: ${v} xu`).join('\n')}
                                >
                                  +{Object.entries(student.subjectPoints).filter(([_, pts]) => pts > 0).length - 3} môn
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Buttons: Fast in-class actions with active subject */}
                    <div className="p-2 mx-2.5 mb-2.5 mt-1 bg-gradient-to-r from-indigo-50/50 via-sky-50/40 to-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        {canEvaluateEmulation && (
                          <>
                            <button
                              onClick={() => handleQuickAdd(student)}
                              className="w-7.5 h-7.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs flex items-center justify-center shadow-xs shadow-emerald-500/25 transition-all hover-zoom-btn shrink-0"
                              title={`Cộng xu khen thưởng cho học sinh theo môn ${activeEvalSubject}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleQuickDeduct(student)}
                              className="w-7.5 h-7.5 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-black text-xs flex items-center justify-center shadow-xs shadow-rose-500/25 transition-all hover-zoom-btn shrink-0"
                              title={`Trừ xu nề nếp cho học sinh theo môn ${activeEvalSubject}`}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            {/* NÚT TẶNG SAO / KHEN THƯỞNG THEO MÔN (Yêu cầu 3) */}
                            <button
                              onClick={() => {
                                setRewardingStudent(student);
                                setRewardMode('sao');
                                setCustomCoins(1);
                                setSelectedSubjectForAward(activeEvalSubject || appliedSubjects[0]?.name || 'GHI CHUNG / NỀ NẾP');
                              }}
                              className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-black text-xs sm:text-sm flex items-center justify-center shadow-xs shadow-amber-500/30 transition-all hover-zoom-btn shrink-0"
                              title="Tặng sao thi đua cho học sinh theo môn học"
                            >
                              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white text-white" />
                            </button>
                          </>
                        )}

                        {/* NÚT GÁN CHỨC VỤ NHANH (Yêu cầu 2: Tối đa 3 chức vụ) */}
                        {canAssignClassOfficer && (
                          <button
                            onClick={() => {
                              setQuickRoleStudent(student);
                              setStudentSelectedRoles(getStudentRolesList(student));
                            }}
                            className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black text-xs sm:text-sm flex items-center justify-center border border-indigo-200 transition-all hover-zoom-btn shrink-0"
                            title="Chỉ định chức vụ cán bộ lớp (Tối đa 3 chức vụ)"
                          >
                            <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1 sm:gap-1.5">
                        <button
                          onClick={() => {
                            setEditingStudent(student);
                            setEditingRoles(getStudentRolesList(student));
                          }}
                          className={`w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl flex items-center justify-center transition-all hover-zoom-btn border shadow-2xs shrink-0 ${
                            isSuperAdmin
                              ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-300 ring-1 ring-indigo-300'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80'
                          }`}
                          title={isSuperAdmin ? "Quyền Quản Trị Tối Cao: Sửa thông tin học sinh này" : "Sửa thông tin học sinh"}
                          aria-label={`Sửa thông tin học sinh ${student.name}`}
                        >
                          <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                        </button>

                        <button
                          onClick={() => {
                            const canEditOrDeleteStudent = isSuperAdmin || ((student as any).teacher_id === currentUser?.id) || ((student as any).teacherUsername === currentUser?.username) || (!isAdmin && !isSuperAdmin); // GVCN luôn sửa được data trong context của mình
                            if (!canEditOrDeleteStudent) {
                              alert("Bạn không có quyền thao tác trên học sinh này!");
                              return;
                            }
                            const confirmMsg = isSuperAdmin
                              ? `⚠️ BẠN ĐANG THỰC THI QUYỀN QUẢN TRỊ TỐI CAO:\n\nXác nhận xóa học sinh "${student.name}" khỏi toàn bộ hệ thống? Thao tác này sẽ xóa vĩnh viễn trên toàn bộ CSDL và không thể hoàn tác. Bạn có chắc chắn không?`
                              : `Bạn có chắc muốn xóa học sinh "${student.name}" khỏi lớp?`;
                            if (window.confirm(confirmMsg)) {
                              deleteStudent(student.id);
                            }
                          }}
                          className={`w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl flex items-center justify-center transition-all hover-zoom-btn border shrink-0 ${
                            isSuperAdmin
                              ? 'bg-rose-100 hover:bg-rose-200 text-rose-700 border-rose-300 ring-1 ring-rose-300 font-bold shadow-xs'
                              : 'bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/70'
                          }`}
                          title={isSuperAdmin ? "Quyền Quản Trị Tối Cao: Xóa học sinh này trên toàn hệ thống" : "Xóa học sinh"}
                          aria-label={`Xóa học sinh ${student.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CẤU HÌNH NHẬN XU & MÔN HỌC ĐÁNH GIÁ (User Request: "CẤU HÌNH NHẬN XU") */}
      {/* ========================================================================= */}
      {isSubjectConfigOpen && canConfigureCoinSubjects && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 max-w-4xl lg:max-w-5xl w-full p-5 sm:p-6 space-y-4 max-h-[94vh] flex flex-col justify-between overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 text-amber-950 flex items-center justify-center font-black shadow-md shadow-amber-500/25">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-indigo-950 uppercase tracking-tight">
                    Cấu Hình Nhận Xu & Môn Học Đánh Giá
                  </h3>
                  <p className="text-xs text-indigo-700 font-medium">
                    Thêm, sửa, xóa & thiết lập danh sách môn học áp dụng cho lớp <strong>{activeClass?.name || '4A1'}</strong> (GV: {teacherProfile.name || 'chủ nhiệm'})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsSubjectConfigOpen(false);
                  setEditingSubject(null);
                }}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* BỐ CỤC 2 CỘT GỌN GÀNG - HẠN CHẾ PHẢI CUỘN CHUỘT (User Request) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              {/* CỘT TRÁI (md:col-span-5): MÔN MẶC ĐỊNH GVCN, THIẾT LẬP NHANH & THÊM MỚI */}
              <div className="md:col-span-5 space-y-3">
                {/* 1. MÔN MẶC ĐỊNH GIÁO VIÊN CHỦ NHIỆM */}
                <div className="p-3 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 rounded-2xl border-2 border-amber-300 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">👑</span>
                      <span className="text-[11px] font-black text-amber-950 uppercase tracking-wide">
                        MÔN MẶC ĐỊNH GVCN THƯỜNG DẠY:
                      </span>
                    </div>
                    <span className="text-[9px] font-black text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-full border border-amber-300">
                      Cốt lõi tiểu học
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-800 font-semibold leading-tight">
                    Mặc định: Toán, Tiếng Việt, Đạo Đức, TN&XH, Lịch sử & Địa lí, Khoa học & Ghi chung / Nề nếp.
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[
                      { name: 'GHI CHUNG / NỀ NẾP', color: '#F59E0B' },
                      { name: 'TOÁN', color: '#3B82F6' },
                      { name: 'TIẾNG VIỆT', color: '#EF4444' },
                      { name: 'ĐẠO ĐỨC', color: '#E11D48' },
                      { name: 'TN & XÃ HỘI', color: '#10B981' },
                      { name: 'LỊCH SỬ & ĐỊA LÝ', color: '#F97316' },
                      { name: 'KHOA HỌC', color: '#06B6D4' }
                    ].map(c => (
                      <span
                        key={c.name}
                        className="px-2 py-0.5 rounded-lg bg-white/90 border border-amber-200 text-[10px] font-bold text-slate-800 flex items-center gap-1 shadow-2xs"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                        <span>{c.name}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* 2. THIẾT LẬP NHANH MÔN ÁP DỤNG CHO LỚP */}
                <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-100 space-y-2">
                  <span className="text-[11px] font-black text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>THIẾT LẬP NHANH ÁP DỤNG CHO LỚP:</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={handleApplyAllSubjects}
                      className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black transition-all hover-zoom-btn uppercase shadow-xs cursor-pointer text-center"
                      title="Áp dụng tất cả các môn có trong hệ thống"
                    >
                      ✓ Tất Cả ({subjects.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyOnlyCoreSubjects}
                      className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black transition-all hover-zoom-btn uppercase shadow-xs cursor-pointer text-center"
                      title="Chỉ áp dụng các môn GVCN thường dạy (Toán, TV, Đạo đức, TNXH, LS&ĐL, Khoa học...)"
                    >
                      ⚡ Mặc Định GVCN
                    </button>
                    <button
                      type="button"
                      onClick={handleResetDefaultSubjects}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[10px] font-bold transition-all hover-zoom-btn uppercase cursor-pointer text-center"
                      title="Khôi phục danh sách môn chuẩn hệ thống"
                    >
                      🔄 Danh Mục Gốc
                    </button>
                  </div>
                </div>

                {/* 3. FORM THÊM MÔN HỌC MỚI */}
                <form onSubmit={handleAddNewSubject} className="p-3 bg-indigo-50/40 rounded-2xl border border-indigo-100/90 space-y-2">
                  <span className="text-[11px] font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>+ THÊM MÔN HỌC MỚI VÀO HỆ THỐNG:</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Tên môn mới (VD: Tiếng Anh, Tin học...)"
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      required
                    />
                    <input
                      type="color"
                      value={newSubjectColor}
                      onChange={(e) => setNewSubjectColor(e.target.value)}
                      className="w-8 h-8 rounded-xl border border-indigo-200 cursor-pointer p-0.5 bg-white shrink-0"
                      title="Chọn màu sắc nhận diện"
                    />
                    <button
                      type="submit"
                      className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs hover-zoom-btn uppercase cursor-pointer shrink-0"
                    >
                      + Thêm
                    </button>
                  </div>

                  {/* Bảng màu gợi ý */}
                  <div className="flex items-center gap-1 pt-0.5">
                    <span className="text-[10px] font-bold text-slate-500">Màu gợi ý:</span>
                    {['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewSubjectColor(c)}
                        className={`w-4 h-4 rounded-full border transition-transform hover:scale-125 ${newSubjectColor === c ? 'ring-2 ring-indigo-500 scale-110' : 'border-white'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </form>

                {/* 4. FORM SỬA MÔN HỌC (NẾU CÓ CHỌN) */}
                {editingSubject && (
                  <form onSubmit={handleSaveEditSubject} className="p-3 bg-amber-50/90 border-2 border-amber-300 rounded-2xl space-y-2 animate-in fade-in">
                    <span className="text-[11px] font-black text-amber-950 uppercase tracking-wide block">
                      ✏️ Chỉnh Sửa Môn: {editingSubject.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingSubject.name}
                        onChange={(e) => setEditingSubject({ ...editingSubject, name: e.target.value })}
                        className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="Tên môn học"
                        required
                      />
                      <input
                        type="color"
                        value={editingSubject.color || '#3B82F6'}
                        onChange={(e) => setEditingSubject({ ...editingSubject, color: e.target.value })}
                        className="w-8 h-8 rounded-xl border border-amber-300 cursor-pointer p-0.5 bg-white shrink-0"
                        title="Màu sắc"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs hover-zoom-btn uppercase cursor-pointer shrink-0"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSubject(null)}
                        className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer shrink-0"
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* CỘT PHẢI (md:col-span-7): DANH SÁCH MÔN HỌC & BẬT/TẮT ÁP DỤNG */}
              <div className="md:col-span-7 space-y-2 bg-slate-50/60 p-3.5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block">
                    Danh Sách Môn Học ({subjects.length} môn) • Tick chọn áp dụng:
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {appliedSubjects.length} môn đang kích hoạt
                  </span>
                </div>

                <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                  {subjects.map((sub) => {
                    const isEnabled = sub.enabled !== false;
                    const isCore = sub.isDefault || isHomeroomSubject(sub.name);
                    return (
                      <div
                        key={sub.id}
                        className={`flex items-center justify-between p-2 sm:p-2.5 rounded-xl border transition-all ${
                          isEnabled
                            ? 'bg-white border-indigo-100 shadow-2xs hover-zoom-interactive'
                            : 'bg-slate-50 border-slate-200 opacity-60'
                        }`}
                      >
                        {/* Checkbox bật/tắt áp dụng cho lớp */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <label className="flex items-center gap-2 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => toggleSubjectApplied(sub.id)}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                            />
                            <span className="w-3 h-3 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: sub.color || '#3B82F6' }} />
                            <span className={`text-xs font-black truncate ${isEnabled ? 'text-indigo-950' : 'text-slate-500 line-through'}`}>
                              {sub.name}
                            </span>
                          </label>

                          {isCore && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black shrink-0">
                              👑 GVCN
                            </span>
                          )}

                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 hidden sm:inline-block ${
                            isEnabled ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {isEnabled ? 'Áp dụng' : 'Tạm tắt'}
                          </span>
                        </div>

                        {/* Action buttons: Sửa, Xóa */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingSubject(sub)}
                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Chỉnh sửa tên và màu sắc môn học"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (isCore) {
                                if (confirm(`Môn "${sub.name}" là một trong các môn mặc định GVCN. Bạn có chắc chắn muốn xóa không? (Bạn vẫn có thể khôi phục lại bất kỳ lúc nào)`)) {
                                  deleteSubject(sub.id);
                                }
                              } else {
                                if (confirm(`Xóa vĩnh viễn môn học "${sub.name}"?`)) {
                                  deleteSubject(sub.id);
                                }
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Xóa môn học khỏi hệ thống"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-indigo-100">
              <span className="text-xs text-indigo-700 font-semibold">
                Lớp {activeClass?.name}: <strong>{appliedSubjects.length}</strong> môn sẵn sàng chấm điểm
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsSubjectConfigOpen(false);
                  setEditingSubject(null);
                }}
                className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black text-xs rounded-xl shadow-md shadow-indigo-600/25 hover-zoom-btn uppercase cursor-pointer"
              >
                Xong & Áp Dụng Cho Lớp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ĐÁNH GIÁ THI ĐUA - CỘNG XU, TRỪ XU HOẶC TẶNG SAO THEO MÔN HỌC (Yêu cầu 3) */}
      {/* ========================================================================= */}
      {rewardingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 max-w-xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
                  rewardMode === 'minus' 
                    ? 'bg-rose-100 text-rose-700' 
                    : rewardMode === 'sao' 
                    ? 'bg-amber-100 text-amber-700' 
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {rewardMode === 'minus' ? <Minus className="w-5 h-5" /> : rewardMode === 'sao' ? <Star className="w-5 h-5 fill-amber-500" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-black text-indigo-950">
                    {rewardMode === 'minus' ? 'Trừ Xu Nề Nếp Theo Môn Học' : rewardMode === 'sao' ? 'Tặng Sao Thi Đua Theo Môn Học' : 'Cộng Xu Khen Thưởng Theo Môn Học'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chọn môn học cụ thể được {rewardMode === 'minus' ? 'trừ xu' : rewardMode === 'sao' ? 'tặng sao' : 'cộng xu'} cho học sinh
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setRewardingStudent(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Student Preview */}
            <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 rounded-2xl border border-indigo-100">
              <div className="flex items-center gap-3">
                <img
                  src={rewardingStudent.avatar}
                  alt={rewardingStudent.name}
                  className="w-12 h-12 rounded-xl object-cover object-center bg-white ring-2 ring-indigo-200"
                  onError={(e) => handleAvatarImgError(e, rewardingStudent.gender, rewardingStudent.name)}
                />
                <div>
                  <div className="text-sm font-black text-indigo-950">STT {rewardingStudent.stt} · {rewardingStudent.name}</div>
                  <div className="text-xs text-indigo-700 font-semibold">{activeClass?.name} · {rewardingStudent.gender} · {rewardingStudent.group || 'Tổ 1'}</div>
                </div>
              </div>

              <div className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-xl text-xs font-black shadow-2xs flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-900 fill-amber-500 shrink-0" />
                <span>Hiện có: {rewardingStudent.points} xu</span>
              </div>
            </div>

            {/* 3 HÌNH THỨC: CỘNG XU, TRỪ XU HOẶC TẶNG SAO (Yêu cầu 3) */}
            <div>
              <label className="block text-xs font-black text-indigo-900 mb-1.5 uppercase tracking-wider">
                1. HÌNH THỨC ĐÁNH GIÁ THI ĐUA:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRewardMode('xu');
                    setCustomCoins(1);
                  }}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn ${
                    rewardMode === 'xu' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 scale-102' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Cộng Xu</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRewardMode('minus');
                    setCustomCoins(1);
                  }}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn ${
                    rewardMode === 'minus' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25 scale-102' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Minus className="w-4 h-4" />
                  <span>- Trừ Xu</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRewardMode('sao');
                    setCustomCoins(1);
                  }}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn ${
                    rewardMode === 'sao' ? 'bg-amber-600 text-white shadow-md shadow-amber-500/25 scale-102' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Star className="w-4 h-4 fill-current" />
                  <span>⭐ Tặng Sao</span>
                </button>
              </div>
            </div>

            {/* LỰA CHỌN MÔN HỌC CỤ THỂ (Bắt buộc chọn - Yêu cầu 3) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-indigo-900 flex items-center gap-1.5 uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  <span>2. CHỌN MÔN HỌC CỤ THỂ ({selectedSubjectForAward}):</span>
                </label>
                <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                  Đang chọn: {selectedSubjectForAward}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-200">
                {appliedSubjects.map((sub) => {
                  const isChosen = selectedSubjectForAward === sub.name;
                  const isCore = sub.isDefault || ['ghi chung / nề nếp', 'toán', 'tiếng việt'].includes(sub.name.trim().toLowerCase());
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSelectedSubjectForAward(sub.name)}
                      className={`px-2 py-2 rounded-xl text-[11px] sm:text-xs font-bold text-left transition-all hover-zoom-btn flex items-center gap-1.5 cursor-pointer min-h-[38px] ${
                        isChosen
                          ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-600/40 font-black'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-indigo-50/50 hover:border-indigo-300'
                      }`}
                      title={sub.name}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/60" style={{ backgroundColor: sub.color || '#3B82F6' }} />
                      <span className="truncate flex-1 leading-tight">{sub.name}</span>
                      {isCore && <span className="text-[10px] text-amber-400 shrink-0">★</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* MỨC ĐIỂM / MỨC SAO */}
            <div>
              <label className="block text-xs font-black text-indigo-900 mb-1.5 uppercase tracking-wider">
                3. {rewardMode === 'sao' ? 'SỐ SAO TẶNG (1 ⭐ = 5 xu):' : rewardMode === 'minus' ? 'SỐ XU TRỪ:' : 'SỐ XU CỘNG:'}
              </label>
              {rewardMode === 'sao' ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCustomCoins(num)}
                      className={`py-2.5 rounded-2xl text-xs font-black transition-all hover-zoom-btn ${
                        customCoins === num 
                          ? 'bg-amber-600 text-white shadow-md shadow-amber-500/25' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {num === 1 ? '⭐ 1 Sao (+5 xu)' : num === 2 ? '⭐⭐ 2 Sao (+10 xu)' : '⭐⭐⭐ 3 Sao (+15 xu)'}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCustomCoins(num)}
                      className={`flex-1 py-2.5 rounded-2xl text-xs font-black transition-all hover-zoom-btn ${
                        customCoins === num 
                          ? rewardMode === 'minus'
                            ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25'
                            : 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {rewardMode === 'minus' ? `-${num}` : `+${num}`} xu
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lý do khen thưởng / nhắc nhở */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Lý do / Lời nhận xét:
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(rewardMode === 'minus' ? [
                  'Mất trật tự trong giờ',
                  'Quên sách vở / đồ dùng',
                  'Chưa hoàn thành bài tập',
                  'Nói chuyện riêng'
                ] : rewardMode === 'sao' ? [
                  'Học sinh xuất sắc trong tuần',
                  'Ngôi sao sáng tạo',
                  'Đạt điểm 10 bài kiểm tra',
                  'Việc tốt giúp đỡ bạn'
                ] : [
                  'Phát biểu hăng hái',
                  'Làm bài tập đầy đủ, sạch đẹp',
                  'Hiểu bài nhanh, tích cực',
                  'Đạt điểm 9, 10'
                ]).map((reason, rIdx) => (
                  <button
                    key={rIdx}
                    type="button"
                    onClick={() => setCustomReason(reason)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl text-[11px] font-bold text-slate-600 transition-colors"
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder={
                  rewardMode === 'minus'
                    ? `Lý do trừ điểm môn ${selectedSubjectForAward}...`
                    : `Lời khen ngợi môn ${selectedSubjectForAward}...`
                }
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRewardingStudent(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => handleConfirmAward(customCoins, customReason)}
                className={`px-5 py-2.5 text-white text-xs font-black rounded-xl shadow-md transition-all hover-zoom-btn flex items-center gap-1.5 ${
                  rewardMode === 'minus'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                    : rewardMode === 'sao'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/25'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                }`}
              >
                {rewardMode === 'minus' ? <Minus className="w-4 h-4" /> : rewardMode === 'sao' ? <Star className="w-4 h-4 fill-white" /> : <Plus className="w-4 h-4" />}
                <span>
                  {rewardMode === 'minus' 
                    ? `Xác Nhận Trừ -${customCoins} Xu Môn ${selectedSubjectForAward}` 
                    : rewardMode === 'sao'
                    ? `Xác Nhận Tặng +${customCoins} ⭐ Môn ${selectedSubjectForAward} (+${customCoins * 5} xu)`
                    : `Xác Nhận Cộng +${customCoins} Xu Môn ${selectedSubjectForAward}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TẠO LỚP HỌC MỚI CÓ ẢNH ĐẠI DIỆN LỚP (User Request 1) */}
      {/* ========================================================================= */}
      {isCreateClassOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[95vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100 shrink-0">
              <div>
                <h3 className="text-lg font-black text-indigo-950">Tạo Lớp Học Mới</h3>
                <p className="text-xs font-semibold text-indigo-600 mt-0.5">Vui lòng điền đầy đủ các thông tin tổ chức của lớp học</p>
              </div>
              <button 
                type="button"
                onClick={() => setIsCreateClassOpen(false)}
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="flex-1 overflow-y-auto pr-2 pb-2 space-y-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
                
                {/* --- CỘT 1: THÔNG TIN CƠ BẢN --- */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                    <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <School className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Thông tin cơ bản</span>
                  </div>

              {/* Chọn Ảnh đại diện của lớp & Tải từ máy tính (User Request 1) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Ảnh đại diện của lớp (To, rõ nét)</label>
                  {!canEditClassAvatar && (
                    <span className="text-[10.5px] text-indigo-700 italic font-semibold">(Chỉ GVCN có quyền đổi ảnh lớp)</span>
                  )}
                </div>
                
                <div className="flex items-center gap-3.5 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="relative shrink-0">
                    <img 
                      src={newClassAvatar} 
                      alt="Xem trước ảnh lớp" 
                      className="w-16 h-16 rounded-2xl object-cover border-2 shadow-md bg-white"
                      style={{ borderColor: newClassColor }}
                    />
                    <span 
                      className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full ring-2 ring-white"
                      style={{ backgroundColor: newClassColor }}
                    />
                  </div>

                  {canEditClassAvatar ? (
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <span className="text-[11px] font-bold text-slate-600 block">
                        Tải ảnh đại diện lớp từ máy tính lên:
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => newClassAvatarInputRef.current?.click()}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all hover-zoom-btn"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Chọn ảnh từ máy tính...</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsNewClassAvatarEditorOpen(true)}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all hover-zoom-btn"
                          title="Thu phóng và căn chỉnh góc nhìn ảnh lớp"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>Phóng to & Căn chỉnh ảnh</span>
                        </button>
                      </div>
                      <input
                        type="file"
                        ref={newClassAvatarInputRef}
                        accept="image/*"
                        onChange={handleUploadNewClassAvatar}
                        className="hidden"
                      />
                      <span className="text-[10px] text-slate-400 block">
                        Hoặc chọn nhanh từ các mẫu hoạt hình dưới đây:
                      </span>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0 space-y-1">
                      <span className="text-xs font-bold text-slate-700 block">Ảnh đại diện mặc định của lớp</span>
                      <p className="text-[11px] text-slate-500">Tài khoản Quản trị / Ban giám hiệu không có quyền tùy biến hoặc thay đổi ảnh đại diện lớp.</p>
                    </div>
                  )}
                </div>

                {canEditClassAvatar && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                    {CLASS_AVATARS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => setNewClassAvatar(av.url)}
                        className={`w-11 h-11 rounded-2xl overflow-hidden border-2 transition-transform shrink-0 ${
                          newClassAvatar === av.url ? 'scale-110 ring-2 ring-indigo-500 border-indigo-500' : 'border-slate-200'
                        }`}
                      >
                        <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên lớp học *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 3/1, 3/2, 4/1..."
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🏛️</span>
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Gán Nhiệm Vụ Giáo Viên Chủ Nhiệm *
                    </label>
                  </div>
                  {canAssignHomeroomTeacher && (
                    <span className="text-[10px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                      {currentUser?.role === 'bgh' || currentUser?.isBgh ? 'Ban Giám Hiệu' : (currentUser?.role === 'school_admin' || currentUser?.isSchoolAdmin ? 'Quản Trị Nhà Trường' : 'Quản Trị Viên')}
                    </span>
                  )}
                </div>

                {canAssignHomeroomTeacher && assignableTeachers.length > 0 ? (
                  <div className="p-3 bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-amber-50/90 border border-amber-300 rounded-2xl space-y-2.5 shadow-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-amber-950">Chọn tài khoản giáo viên nhận lớp:</span>
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-200/70 px-1.5 py-0.5 rounded">
                          {assignableTeachers.length} GV trong trường
                        </span>
                      </div>
                      <SearchableTeacherSelect
                        value={newClassAssignedUsername}
                        onChange={(uVal) => {
                          setNewClassAssignedUsername(uVal);
                          const foundTeacher = allTeachers.find(t => t.username.toLowerCase() === uVal.toLowerCase());
                          if (foundTeacher) {
                            setNewClassTeacher(foundTeacher.fullName);
                          }
                        }}
                        options={assignableTeachers}
                        placeholder="-- Chọn tài khoản giáo viên chủ nhiệm nhận lớp --"
                        className="bg-white border-amber-300 text-slate-800 focus:ring-amber-500 font-bold"
                      />
                    </div>

                    <div>
                      <span className="block text-[11px] font-bold text-amber-950 mb-1">Tên giáo viên hiển thị trên lớp:</span>
                      <input
                        type="text"
                        placeholder="Ví dụ: Thầy/Cô Nguyễn Văn A..."
                        value={newClassTeacher}
                        onChange={(e) => setNewClassTeacher(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500"
                        required
                      />
                    </div>
                    <p className="text-[10px] text-amber-850 font-medium italic">
                      ✨ Tài khoản được chọn sẽ chính thức là GVCN quản lý học sinh và dữ liệu lớp.
                    </p>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Ví dụ: Thầy/Cô Nguyễn Văn A"
                    value={newClassTeacher}
                    onChange={(e) => setNewClassTeacher(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                )}
              </div>

              </div> {/* END CỘT 1 */}

                {/* --- CỘT 2: TỔ CHỨC & BAN PHỤ HUYNH --- */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                    <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <Users2 className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Tổ chức & Ban phụ huynh</span>
                  </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Khối lớp</label>
                  <select
                    value={newClassGrade}
                    onChange={(e) => setNewClassGrade(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    {['Khối 1', 'Khối 2', 'Khối 3', 'Khối 4', 'Khối 5', 'Khối 6', 'Khối 7', 'Khối 8', 'Khối 9'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Năm học</label>
                  <input
                    type="text"
                    value={newClassYear}
                    onChange={(e) => setNewClassYear(e.target.value)}
                    placeholder="2026 - 2027"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Phân hiệu & Điểm trường (Đồng nhất dữ liệu chuẩn từ Quản trị nhà trường - Không mặc định Khu chính, Null nếu chưa cấu hình) */}
              <div className="space-y-2">
                {effectiveSchoolBranches.length === 0 && !canManageSchoolBranches && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Nhà trường chưa khai báo danh mục Phân hiệu & Điểm trường. Lớp sẽ được lưu trạng thái chưa cấu hình (Null). Vui lòng báo Ban giám hiệu khai báo.</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {/* Phân hiệu */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        🏛️ Phân hiệu
                      </label>
                      {canManageSchoolBranches && effectiveSchoolBranches.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsCustomNewBranch(!isCustomNewBranch)}
                          className="text-[10px] text-indigo-600 hover:underline font-bold"
                        >
                          {isCustomNewBranch ? '📋 Danh mục' : '✏️ Tự nhập'}
                        </button>
                      )}
                    </div>
                    {canManageSchoolBranches && isCustomNewBranch ? (
                      <input
                        type="text"
                        value={newClassBranch}
                        onChange={(e) => setNewClassBranch(e.target.value)}
                        placeholder="Ví dụ: Phân hiệu 1, Cơ sở A..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <select
                        value={newClassBranch}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewClassBranch(val);
                          // 🛡️ BẢO TOÀN DỮ LIỆU: Reset điểm trường về rỗng, TUYỆT ĐỐI KHÔNG tự động gán điểm trường đầu tiên!
                          setNewClassCampus('');
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Chưa cấu hình phân hiệu (Null) --</option>
                        {effectiveSchoolBranches.map(b => (
                          <option key={b.id || b.name} value={b.name}>
                            🏛️ {b.name} ({b.campuses?.length || 0} điểm trường)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Điểm trường */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        📍 Điểm trường
                      </label>
                      {canManageSchoolBranches && (
                        <button
                          type="button"
                          onClick={() => setIsCustomNewCampus(!isCustomNewCampus)}
                          className="text-[10px] text-indigo-600 hover:underline font-bold"
                        >
                          {isCustomNewCampus ? '📋 Danh mục' : '✏️ Tự nhập'}
                        </button>
                      )}
                    </div>
                    {canManageSchoolBranches && isCustomNewCampus ? (
                      <input
                        type="text"
                        value={newClassCampus}
                        onChange={(e) => setNewClassCampus(e.target.value)}
                        placeholder="Ví dụ: Điểm Trung tâm, Điểm phụ..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (() => {
                      const matchedBranch = effectiveSchoolBranches.find(b => b.name === newClassBranch);
                      const campusesList = matchedBranch?.campuses || [];
                      if (!newClassBranch) {
                        return (
                          <select
                            disabled
                            value=""
                            className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-400 cursor-not-allowed"
                          >
                            <option value="">-- Chọn Phân hiệu trước --</option>
                          </select>
                        );
                      }
                      return (
                        <select
                          value={newClassCampus}
                          onChange={(e) => setNewClassCampus(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">-- Chưa cấu hình điểm trường (Null) --</option>
                          {campusesList.map(c => (
                            <option key={c.id || c.name} value={c.name}>
                              📍 {c.name}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Slogan của lớp học (User request) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    ⭐ Slogan của lớp học
                  </label>
                  {!canEditClassSlogan && (
                    <span className="text-[10.5px] text-amber-700 italic font-semibold">(Chỉ GVCN có quyền cấu hình)</span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder={canEditClassSlogan ? "Ví dụ: Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng" : "Chỉ GVCN có quyền cấu hình Slogan"}
                  value={newClassSlogan}
                  disabled={!canEditClassSlogan}
                  onChange={(e) => setNewClassSlogan(e.target.value)}
                  className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-bold ${
                    canEditClassSlogan
                      ? 'bg-slate-50 border-slate-200 text-amber-900 focus:ring-2 focus:ring-indigo-500'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                />
              </div>

              {/* Thông tin Ban Phụ Huynh Lớp Học (User request) */}
              {canEditParentCommittee ? (
                <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-3">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                      Ban Đại Diện Cha Mẹ Học Sinh (Ban Phụ Huynh)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {/* Trưởng ban */}
                    <div className="space-y-1 p-2 rounded-xl bg-white border border-indigo-100">
                      <label className="block font-bold text-indigo-700 text-[11px]">Trưởng ban phụ huynh:</label>
                      <input
                        type="text"
                        placeholder="Họ và tên..."
                        value={newParentHeadName}
                        onChange={(e) => setNewParentHeadName(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                      />
                      <input
                        type="text"
                        placeholder="Số điện thoại..."
                        value={newParentHeadPhone}
                        onChange={(e) => setNewParentHeadPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>

                    {/* Phó ban */}
                    <div className="space-y-1 p-2 rounded-xl bg-white border border-indigo-100">
                      <label className="block font-bold text-indigo-700 text-[11px]">Phó ban phụ huynh:</label>
                      <input
                        type="text"
                        placeholder="Họ và tên..."
                        value={newParentDeputyName}
                        onChange={(e) => setNewParentDeputyName(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                      />
                      <input
                        type="text"
                        placeholder="Số điện thoại..."
                        value={newParentDeputyPhone}
                        onChange={(e) => setNewParentDeputyPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>

                    {/* Ủy viên 1 */}
                    <div className="space-y-1 p-2 rounded-xl bg-white border border-indigo-100">
                      <label className="block font-bold text-slate-700 text-[11px]">Ủy viên phụ huynh 1:</label>
                      <input
                        type="text"
                        placeholder="Họ và tên..."
                        value={newParentMember1Name}
                        onChange={(e) => setNewParentMember1Name(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Số điện thoại..."
                        value={newParentMember1Phone}
                        onChange={(e) => setNewParentMember1Phone(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>

                    {/* Ủy viên 2 */}
                    <div className="space-y-1 p-2 rounded-xl bg-white border border-indigo-100">
                      <label className="block font-bold text-slate-700 text-[11px]">Ủy viên phụ huynh 2:</label>
                      <input
                        type="text"
                        placeholder="Họ và tên..."
                        value={newParentMember2Name}
                        onChange={(e) => setNewParentMember2Name(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Số điện thoại..."
                        value={newParentMember2Phone}
                        onChange={(e) => setNewParentMember2Phone(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600">
                    <Heart className="w-4 h-4 text-slate-400" />
                    <span>Ban Đại Diện Cha Mẹ Học Sinh</span>
                  </div>
                  <p className="text-[11px] text-slate-400 italic">Chỉ Giáo viên chủ nhiệm lớp mới có quyền cấu hình Ban đại diện cha mẹ học sinh.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Màu sắc nhận diện</label>
                <div className="flex items-center gap-2">
                  {CLASS_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewClassColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        newClassColor === c ? 'scale-125 ring-2 ring-indigo-500 ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              </div> {/* END CỘT 2 */}
              </div> {/* END GRID */}

              <div className="flex items-center justify-end gap-2 pt-4 mt-6 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreateClassOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-600/20 hover-zoom-btn"
                >
                  Tạo Lớp Học
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: XEM TRƯỚC VÀ XÁC NHẬN IMPORT HÀNG LOẠT LỚP HỌC TỪ EXCEL (User Request) */}
      {/* ========================================================================= */}
      {isClassesPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-xs">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase">
                    Xác nhận nhập {excelParsedClasses.length} lớp học từ file Excel
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Hệ thống sẽ tự động gán lớp cho giáo viên chủ nhiệm tương ứng và liên thông toàn diện CSDL
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsClassesPreviewOpen(false);
                  setExcelParsedClasses([]);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bảng xem trước danh sách lớp học */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-slate-50/50">
              <table className="w-full text-left text-xs">
                <thead className="bg-indigo-50/80 text-indigo-950 font-black uppercase text-[11px] sticky top-0 border-b border-indigo-100 z-10">
                  <tr>
                    <th className="px-3 py-2.5 w-12 text-center">STT</th>
                    <th className="px-3 py-2.5">Tên lớp</th>
                    <th className="px-3 py-2.5">Khối</th>
                    <th className="px-3 py-2.5">Năm học</th>
                    <th className="px-3 py-2.5">Giáo viên chủ nhiệm</th>
                    <th className="px-3 py-2.5">Tài khoản GVCN</th>
                    <th className="px-3 py-2.5">Phân hiệu / Điểm trường</th>
                    <th className="px-3 py-2.5">Khẩu hiệu / Slogan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {excelParsedClasses.map((item, idx) => {
                    const matchedTeacher = allTeachers.find(t => 
                      t.username.toLowerCase() === item.teacherUsername?.toLowerCase()
                    );
                    return (
                      <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-3 py-2 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-2 font-black text-indigo-900">{item.name}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{item.grade}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{item.academicYear}</td>
                        <td className="px-3 py-2 font-bold text-slate-800">{item.teacherName}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {item.teacherUsername ? (
                            <span className={`px-2 py-0.5 rounded-md font-bold ${matchedTeacher ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                              {item.teacherUsername} {matchedTeacher ? '✓' : '(tự do)'}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Chưa gán</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {item.branch || item.campus ? `${item.branch || ''} ${item.campus ? `(${item.campus})` : ''}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-500 italic max-w-xs truncate" title={item.slogan}>
                          {item.slogan || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 shrink-0">
              <div className="text-xs text-slate-500 font-bold">
                Tổng cộng: <span className="text-indigo-600 font-black">{excelParsedClasses.length} lớp học</span> sẵn sàng tạo.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsClassesPreviewOpen(false);
                    setExcelParsedClasses([]);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkAddClasses}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-md shadow-emerald-600/20 hover-zoom-btn uppercase flex items-center gap-1.5"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>Xác nhận tạo hàng loạt ngay</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CẤU HÌNH PHÂN HIỆU & ĐIỂM TRƯỜNG THUỘC PHÂN HIỆU (User Request) */}
      {/* ========================================================================= */}
      {isSchoolBranchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center border border-purple-200 shadow-xs">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase flex items-center gap-2">
                    <span>Cấu hình Phân hiệu & Điểm trường</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                      {currentUser?.schoolName || 'Nhà trường'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Khai báo danh mục chuẩn để giáo viên chủ nhiệm lựa chọn khi tạo lớp, đảm bảo thống nhất dữ liệu 100%
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSchoolBranchModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ô thêm phân hiệu mới */}
            <div className="p-3 bg-gradient-to-r from-purple-50 via-indigo-50 to-sky-50 rounded-2xl border border-purple-200/80 flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={newBranchInputName}
                onChange={(e) => setNewBranchInputName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTempBranch();
                  }
                }}
                placeholder="Nhập tên phân hiệu mới (Ví dụ: Phân hiệu 1, Cơ sở A, Điểm Trung tâm...)"
                className="flex-1 px-3.5 py-2 bg-white border border-purple-300 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={handleAddTempBranch}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-sm shadow-purple-600/20 hover-zoom-btn flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Phân Hiệu</span>
              </button>
            </div>

            {/* Danh sách các Phân hiệu và Điểm trường */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {tempBranches.length === 0 ? (
                <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl space-y-2">
                  <Building2 className="w-8 h-8 mx-auto opacity-50" />
                  <p className="text-xs font-medium">Chưa có phân hiệu nào được khai báo. Hãy nhập tên và bấm "Thêm Phân Hiệu".</p>
                </div>
              ) : (
                tempBranches.map((branch, bIdx) => (
                  <div
                    key={branch.id || bIdx}
                    className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 hover:border-purple-300 transition-all space-y-3"
                  >
                    {/* Header Phân hiệu */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="w-6 h-6 rounded-lg bg-purple-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">
                          {bIdx + 1}
                        </span>
                        <input
                          type="text"
                          value={branch.name}
                          onChange={(e) => handleUpdateTempBranchName(branch.id, e.target.value)}
                          placeholder="Tên phân hiệu..."
                          className="font-black text-sm text-purple-950 bg-white px-2.5 py-1 rounded-lg border border-slate-200 focus:border-purple-500 flex-1 max-w-sm"
                        />
                        <span className="text-[11px] text-slate-500 font-bold">
                          ({branch.campuses?.length || 0} điểm trường)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTempBranch(branch.id)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Xóa phân hiệu này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Danh sách Điểm trường trực thuộc phân hiệu này */}
                    <div className="pl-8 space-y-2">
                      <div className="text-[11px] font-bold text-slate-600 uppercase flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-sky-600" />
                        <span>Các điểm trường thuộc phân hiệu này:</span>
                      </div>

                      {/* Chips điểm trường */}
                      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                        {(!branch.campuses || branch.campuses.length === 0) ? (
                          <span className="text-xs text-slate-400 italic">Chưa có điểm trường trực thuộc</span>
                        ) : (
                          branch.campuses.map(cp => (
                            <span
                              key={cp.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-100 text-sky-900 border border-sky-300 text-xs font-bold shadow-2xs"
                            >
                              <span>📍 {cp.name}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTempCampus(branch.id, cp.id)}
                                className="text-sky-700 hover:text-rose-600 ml-0.5 rounded-full"
                                title="Xóa điểm trường này"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      {/* Ô thêm điểm trường mới vào phân hiệu */}
                      <div className="flex items-center gap-2 pt-1 max-w-md">
                        <input
                          type="text"
                          value={newCampusInputs[branch.id] || ''}
                          onChange={(e) => setNewCampusInputs({ ...newCampusInputs, [branch.id]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTempCampus(branch.id);
                            }
                          }}
                          placeholder="Thêm điểm trường (Ví dụ: Điểm Trung tâm, Điểm phụ...)"
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddTempCampus(branch.id)}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-black shadow-2xs hover-zoom-btn flex items-center gap-1 whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Thêm Điểm</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer Modal */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
              <div className="text-xs text-slate-500 font-bold">
                Tổng cộng: <strong className="text-purple-700 font-black">{tempBranches.length} phân hiệu</strong>,{' '}
                <strong className="text-sky-700 font-black">
                  {tempBranches.reduce((acc, b) => acc + (b.campuses?.length || 0), 0)} điểm trường
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSchoolBranchModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={isSavingBranches}
                  onClick={handleSaveAllSchoolBranches}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black rounded-xl shadow-md shadow-purple-600/25 hover-zoom-btn flex items-center gap-1.5 uppercase"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingBranches ? 'Đang lưu...' : 'Lưu Cấu Hình & Liên Thông'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SỬA LỚP HỌC CÓ ẢNH ĐẠI DIỆN LỚP (User Request 1) */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* MODAL: SỬA LỚP HỌC - THIẾT KẾ THEO HƯỚNG NGANG GỌN GÀNG KHÔNG CUỘN (User Request) */}
      {/* ========================================================================= */}
      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl lg:max-w-5xl w-full p-5 sm:p-6 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 max-h-[95vh] overflow-y-auto">
            {/* Header modal */}
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs"
                  style={{ backgroundColor: editingClass.color || '#6366F1' }}
                >
                  <School className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-indigo-950">Sửa Thông Tin Lớp Học</h3>
                    <span 
                      className="px-2 py-0.5 rounded-lg text-[10px] font-black text-white"
                      style={{ backgroundColor: editingClass.color || '#6366F1' }}
                    >
                      LỚP {editingClass.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-700">
                    Bố cục ngang toàn diện: Thông tin lớp, giáo viên, ban phụ huynh & ảnh đại diện
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditingClass(null)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditClass} className="space-y-3.5">
              {/* Bố cục 2 cột ngang thông minh (lg:grid-cols-12) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
                
                {/* CỘT TRÁI (5 phần 12): THÔNG TIN LỚP HỌC & GIÁO VIÊN & ẢNH ĐẠI DIỆN */}
                <div className="lg:col-span-5 space-y-3">
                  {/* Khối 1: Ảnh đại diện lớp học */}
                  <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Ảnh đại diện lớp học:
                      </label>
                      {!canEditClassAvatar && (
                        <span className="text-[10px] text-indigo-700 italic font-semibold">(Chỉ GVCN có quyền đổi ảnh lớp)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <img 
                          src={editingClass.avatar || CLASS_AVATARS[0].url} onError={(e) => handleAvatarImgError(e, undefined, editingClass?.name)} 
                          alt="Xem trước ảnh lớp" 
                          className="w-14 h-14 rounded-2xl object-cover object-center border-2 shadow-xs bg-white"
                          style={{ borderColor: editingClass.color || '#6366F1' }}
                        />
                        <span 
                          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white"
                          style={{ backgroundColor: editingClass.color || '#6366F1' }}
                        />
                      </div>

                      {canEditClassAvatar ? (
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => editClassAvatarInputRef.current?.click()}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xs transition-all hover-zoom-btn"
                            >
                              <Upload className="w-3 h-3" />
                              <span>Tải từ máy tính</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setAvatarEditingClass(editingClass)}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xs transition-all hover-zoom-btn"
                              title="Thu phóng và căn chỉnh góc nhìn ảnh lớp"
                            >
                              <ZoomIn className="w-3 h-3" />
                              <span>Căn chỉnh ảnh</span>
                            </button>
                          </div>
                          <input
                            type="file"
                            ref={editClassAvatarInputRef}
                            accept="image/*"
                            onChange={handleUploadEditClassAvatar}
                            className="hidden"
                          />
                          <span className="text-[9.5px] text-slate-400 block truncate">
                            Hoặc bấm chọn nhanh mẫu hoạt hình bên dưới:
                          </span>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <span className="text-xs font-bold text-slate-700 block">Ảnh đại diện hiện tại</span>
                          <p className="text-[10.5px] text-slate-500">Tài khoản Quản trị / Ban giám hiệu không có quyền thay đổi ảnh đại diện lớp.</p>
                        </div>
                      )}
                    </div>

                    {canEditClassAvatar && (
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5">
                        {CLASS_AVATARS.map((av) => (
                          <button
                            key={av.id}
                            type="button"
                            onClick={() => setEditingClass({ ...editingClass, avatar: av.url })}
                            className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-transform shrink-0 ${
                              editingClass.avatar === av.url ? 'scale-110 ring-2 ring-indigo-500 border-indigo-500' : 'border-slate-200 hover:border-slate-300'
                            }`}
                            title={av.label}
                          >
                            <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Khối 2: Tên lớp, Khối, Năm học (3 cột trên 1 hàng ngang) */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Tên lớp *</label>
                      <input
                        type="text"
                        value={editingClass.name}
                        onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                        placeholder="4A1"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Khối lớp</label>
                      <select
                        value={editingClass.grade}
                        onChange={(e) => setEditingClass({ ...editingClass, grade: e.target.value })}
                        className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      >
                        {['Khối 1', 'Khối 2', 'Khối 3', 'Khối 4', 'Khối 5', 'Khối 6', 'Khối 7', 'Khối 8', 'Khối 9'].map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Năm học</label>
                      <input
                        type="text"
                        value={editingClass.academicYear || ''}
                        onChange={(e) => setEditingClass({ ...editingClass, academicYear: e.target.value })}
                        placeholder="2026–2027"
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  {/* Khối 2.1: Phân hiệu & Điểm trường (Đồng nhất dữ liệu chuẩn - Không mặc định Khu chính, Null nếu chưa cấu hình) */}
                  <div className="space-y-1.5">
                    {effectiveSchoolBranches.length === 0 && !canManageSchoolBranches && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Nhà trường chưa cấu hình danh mục Phân hiệu & Điểm trường. Lớp sẽ được lưu trạng thái chưa cấu hình (Null).</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {/* Phân hiệu */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold text-slate-700">🏛️ Phân hiệu</label>
                          {canManageSchoolBranches && effectiveSchoolBranches.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setIsCustomEditBranch(!isCustomEditBranch)}
                              className="text-[9.5px] text-indigo-600 hover:underline font-bold"
                            >
                              {isCustomEditBranch ? '📋 Danh mục' : '✏️ Tự nhập'}
                            </button>
                          )}
                        </div>
                        {canManageSchoolBranches && isCustomEditBranch ? (
                          <input
                            type="text"
                            value={editingClass.branch || ''}
                            onChange={(e) => setEditingClass({ ...editingClass, branch: e.target.value })}
                            placeholder="VD: Phân hiệu 1, Cơ sở A"
                            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                          />
                        ) : (
                          <select
                            value={editingClass.branch || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditingClass({
                                ...editingClass,
                                branch: val || null,
                                // 🛡️ BẢO TOÀN DỮ LIỆU: Reset điểm trường về null/rỗng khi đổi phân hiệu, KHÔNG gán điểm trường đầu tiên!
                                campus: null
                              });
                            }}
                            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">-- Chưa cấu hình phân hiệu (Null) --</option>
                            {effectiveSchoolBranches.map(b => (
                              <option key={b.id || b.name} value={b.name}>
                                🏛️ {b.name} ({b.campuses?.length || 0} điểm)
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Điểm trường */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold text-slate-700">📍 Điểm trường</label>
                          {canManageSchoolBranches && (
                            <button
                              type="button"
                              onClick={() => setIsCustomEditCampus(!isCustomEditCampus)}
                              className="text-[9.5px] text-indigo-600 hover:underline font-bold"
                            >
                              {isCustomEditCampus ? '📋 Danh mục' : '✏️ Tự nhập'}
                            </button>
                          )}
                        </div>
                        {canManageSchoolBranches && isCustomEditCampus ? (
                          <input
                            type="text"
                            value={editingClass.campus || ''}
                            onChange={(e) => setEditingClass({ ...editingClass, campus: e.target.value })}
                            placeholder="VD: Điểm Trung tâm, Điểm phụ"
                            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                          />
                        ) : (() => {
                          const matchedBranch = effectiveSchoolBranches.find(b => b.name === (editingClass.branch || ''));
                          const campusesList = matchedBranch?.campuses || [];
                          if (!editingClass.branch) {
                            return (
                              <select
                                disabled
                                value=""
                                className="w-full px-2.5 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-400 cursor-not-allowed"
                              >
                                <option value="">-- Chọn Phân hiệu trước --</option>
                              </select>
                            );
                          }
                          return (
                            <select
                              value={editingClass.campus || ''}
                              onChange={(e) => setEditingClass({ ...editingClass, campus: e.target.value || null })}
                              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Chưa cấu hình điểm trường (Null) --</option>
                              {campusesList.map(c => (
                                <option key={c.id || c.name} value={c.name}>
                                  📍 {c.name}
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Khối 3: Tên giáo viên chủ nhiệm */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Tên giáo viên chủ nhiệm / phụ trách:
                      </label>
                      <span className="text-[9.5px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                        Đồng bộ Hồ sơ GV
                      </span>
                    </div>
                    <input
                      type="text"
                      value={editingClass.teacherName || ''}
                      onChange={(e) => setEditingClass({ ...editingClass, teacherName: e.target.value })}
                      placeholder="Ví dụ: Thầy/Cô Nguyễn Văn A"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Khối 4: Gán nhiệm vụ Giáo viên chủ nhiệm cho lớp học (Quản trị nhà trường, Ban Giám Hiệu & Quản trị viên) */}
                  {canAssignHomeroomTeacher && (
                    <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/95 border border-amber-300 shadow-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🏛️</span>
                          <label className="block text-[11px] font-black text-amber-950 uppercase tracking-wide">
                            Gán Nhiệm Vụ Giáo Viên Chủ Nhiệm:
                          </label>
                        </div>
                        <span className="text-[9.5px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-black border border-amber-300">
                          {currentUser?.role === 'bgh' || currentUser?.isBgh ? 'Ban Giám Hiệu' : (currentUser?.role === 'school_admin' || currentUser?.isSchoolAdmin ? 'Quản Trị Nhà Trường' : 'Quản Trị Viên')}
                        </span>
                      </div>
                      {(() => {
                        const isCurrentInList = editingClass.teacherUsername && assignableTeachers.some(t => t.username.toLowerCase() === editingClass.teacherUsername?.toLowerCase());
                        const matchedExisting = editingClass.teacherUsername ? allTeachers.find(t => t.username.toLowerCase() === editingClass.teacherUsername?.toLowerCase()) : null;
                        const finalOptions = (matchedExisting && !isCurrentInList) ? [matchedExisting, ...assignableTeachers] : assignableTeachers;
                        return (
                          <SearchableTeacherSelect
                            value={editingClass.teacherUsername || ''}
                            onChange={(selectedU) => {
                              const teacher = allTeachers.find(t => t.username.toLowerCase() === selectedU.toLowerCase());
                              setEditingClass({
                                ...editingClass,
                                teacherUsername: selectedU,
                                teacherRole: 'homeroom',
                                isHomeroom: true,
                                teacherName: teacher?.fullName || editingClass.teacherName || ''
                              });
                            }}
                            options={finalOptions}
                            placeholder="-- Chọn tài khoản giáo viên chủ nhiệm nhận lớp --"
                            className="bg-white border-amber-300 text-slate-800 focus:ring-amber-500 font-bold"
                          />
                        );
                      })()}
                      <p className="text-[10px] text-amber-850 font-medium italic flex items-center gap-1">
                        <span>ℹ️</span>
                        <span>Tài khoản giáo viên được gán sẽ là GVCN chính thức, toàn quyền quản lý học sinh và các chức năng của lớp học này.</span>
                      </p>
                    </div>
                  )}

                  {/* Khối 5: Màu sắc nhận diện lớp */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                      Màu sắc nhận diện lớp:
                    </label>
                    <div className="flex items-center gap-2">
                      {CLASS_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditingClass({ ...editingClass, color: c })}
                          className={`w-6 h-6 rounded-full transition-transform ${
                            editingClass.color === c ? 'scale-125 ring-2 ring-indigo-500 ring-offset-2' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* CỘT PHẢI (7 phần 12): KHẨU HIỆU & BAN ĐẠI DIỆN CHA MẸ HỌC SINH */}
                <div className="lg:col-span-7 space-y-3">
                  {/* Slogan của lớp học */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Slogan / Khẩu hiệu lớp học (Hiển thị trên Infographic):</span>
                      </label>
                      {!canEditClassSlogan && (
                        <span className="text-[10px] text-amber-700 italic font-semibold">(Chỉ GVCN có quyền sửa Slogan)</span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder={canEditClassSlogan ? "Ví dụ: Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng" : "Chỉ GVCN có quyền sửa Slogan"}
                      value={editingClass.slogan || ''}
                      disabled={!canEditClassSlogan}
                      onChange={(e) => setEditingClass({ ...editingClass, slogan: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-xl text-xs font-bold ${
                        canEditClassSlogan
                          ? 'bg-slate-50 border-slate-200 text-amber-900 focus:ring-2 focus:ring-indigo-500'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    />
                  </div>

                  {/* Ban Phụ Huynh Lớp Học (Lưới 2x2 gọn gàng, đồng bộ) */}
                  {canEditParentCommittee ? (
                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-purple-50/50 border border-indigo-100 space-y-2.5">
                    <div className="flex items-center justify-between pb-1 border-b border-indigo-100/70">
                      <div className="flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                        <span className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                          Ban Đại Diện Cha Mẹ Học Sinh (4 Vị Trí)
                        </span>
                      </div>
                      <span className="text-[9.5px] text-indigo-700 font-bold bg-white px-2 py-0.5 rounded-full border border-indigo-200/80 shadow-2xs">
                        ⚡ Đồng bộ 2 chiều với Cài đặt
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      {/* 1. Trưởng ban */}
                      <div className="space-y-1 p-2 rounded-xl bg-white border border-indigo-100 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <label className="block font-black text-indigo-800 text-[11px]">
                            1. Trưởng ban phụ huynh:
                          </label>
                          <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1 rounded font-bold">Trưởng ban</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Họ và tên..."
                          value={editingClass.parentCommittee?.head?.name || ''}
                          onChange={(e) => setEditingClass({
                            ...editingClass,
                            parentCommittee: {
                              head: { name: e.target.value, phone: editingClass.parentCommittee?.head?.phone || '', roleTitle: 'Trưởng ban phụ huynh' },
                              deputy: editingClass.parentCommittee?.deputy || { name: '', phone: '' },
                              member1: editingClass.parentCommittee?.member1 || { name: '', phone: '' },
                              member2: editingClass.parentCommittee?.member2 || { name: '', phone: '' }
                            }
                          })}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                        />
                        <input
                          type="text"
                          placeholder="Số điện thoại liên hệ..."
                          value={editingClass.parentCommittee?.head?.phone || ''}
                          onChange={(e) => setEditingClass({
                            ...editingClass,
                            parentCommittee: {
                              head: { name: editingClass.parentCommittee?.head?.name || '', phone: e.target.value, roleTitle: 'Trưởng ban phụ huynh' },
                              deputy: editingClass.parentCommittee?.deputy || { name: '', phone: '' },
                              member1: editingClass.parentCommittee?.member1 || { name: '', phone: '' },
                              member2: editingClass.parentCommittee?.member2 || { name: '', phone: '' }
                            }
                          })}
                          className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono"
                        />
                      </div>

                      {/* 2. Phó ban */}
                      <div className="space-y-1 p-2 rounded-xl bg-white border border-indigo-100 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <label className="block font-black text-indigo-800 text-[11px]">
                            2. Phó ban phụ huynh:
                          </label>
                          <span className="text-[9px] bg-purple-50 text-purple-600 px-1 rounded font-bold">Phó ban</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Họ và tên..."
                          value={editingClass.parentCommittee?.deputy?.name || ''}
                          onChange={(e) => setEditingClass({
                            ...editingClass,
                            parentCommittee: {
                              head: editingClass.parentCommittee?.head || { name: '', phone: '' },
                              deputy: { name: e.target.value, phone: editingClass.parentCommittee?.deputy?.phone || '', roleTitle: 'Phó ban phụ huynh' },
                              member1: editingClass.parentCommittee?.member1 || { name: '', phone: '' },
                              member2: editingClass.parentCommittee?.member2 || { name: '', phone: '' }
                            }
                          })}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                        />
                        <input
                          type="text"
                          placeholder="Số điện thoại liên hệ..."
                          value={editingClass.parentCommittee?.deputy?.phone || ''}
                          onChange={(e) => setEditingClass({
                            ...editingClass,
                            parentCommittee: {
                              head: editingClass.parentCommittee?.head || { name: '', phone: '' },
                              deputy: { name: editingClass.parentCommittee?.deputy?.name || '', phone: e.target.value, roleTitle: 'Phó ban phụ huynh' },
                              member1: editingClass.parentCommittee?.member1 || { name: '', phone: '' },
                              member2: editingClass.parentCommittee?.member2 || { name: '', phone: '' }
                            }
                          })}
                          className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono"
                        />
                      </div>

                      {/* 3. Ủy viên 1 */}
                      <div className="space-y-1 p-2 rounded-xl bg-white border border-indigo-100 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <label className="block font-bold text-slate-700 text-[11px]">
                            3. Ủy viên phụ huynh 1:
                          </label>
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded font-medium">Ủy viên</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Họ và tên..."
                          value={editingClass.parentCommittee?.member1?.name || ''}
                          onChange={(e) => setEditingClass({
                            ...editingClass,
                            parentCommittee: {
                              head: editingClass.parentCommittee?.head || { name: '', phone: '' },
                              deputy: editingClass.parentCommittee?.deputy || { name: '', phone: '' },
                              member1: { name: e.target.value, phone: editingClass.parentCommittee?.member1?.phone || '', roleTitle: 'Ủy viên ban phụ huynh' },
                              member2: editingClass.parentCommittee?.member2 || { name: '', phone: '' }
                            }
                          })}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Số điện thoại liên hệ..."
                          value={editingClass.parentCommittee?.member1?.phone || ''}
                          onChange={(e) => setEditingClass({
                            ...editingClass,
                            parentCommittee: {
                              head: editingClass.parentCommittee?.head || { name: '', phone: '' },
                              deputy: editingClass.parentCommittee?.deputy || { name: '', phone: '' },
                              member1: { name: editingClass.parentCommittee?.member1?.name || '', phone: e.target.value, roleTitle: 'Ủy viên ban phụ huynh' },
                              member2: editingClass.parentCommittee?.member2 || { name: '', phone: '' }
                            }
                          })}
                          className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono"
                        />
                      </div>

                      {/* 4. Ủy viên 2 */}
                      <div className="space-y-1 p-2 rounded-xl bg-white border border-indigo-100 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <label className="block font-bold text-slate-700 text-[11px]">
                            4. Ủy viên phụ huynh 2:
                          </label>
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded font-medium">Ủy viên</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Họ và tên..."
                          value={editingClass.parentCommittee?.member2?.name || ''}
                          onChange={(e) => setEditingClass({
                            ...editingClass,
                            parentCommittee: {
                              head: editingClass.parentCommittee?.head || { name: '', phone: '' },
                              deputy: editingClass.parentCommittee?.deputy || { name: '', phone: '' },
                              member1: editingClass.parentCommittee?.member1 || { name: '', phone: '' },
                              member2: { name: e.target.value, phone: editingClass.parentCommittee?.member2?.phone || '', roleTitle: 'Ủy viên ban phụ huynh' }
                            }
                          })}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Số điện thoại liên hệ..."
                          value={editingClass.parentCommittee?.member2?.phone || ''}
                          onChange={(e) => setEditingClass({
                            ...editingClass,
                            parentCommittee: {
                              head: editingClass.parentCommittee?.head || { name: '', phone: '' },
                              deputy: editingClass.parentCommittee?.deputy || { name: '', phone: '' },
                              member1: editingClass.parentCommittee?.member1 || { name: '', phone: '' },
                              member2: { name: editingClass.parentCommittee?.member2?.name || '', phone: e.target.value, roleTitle: 'Ủy viên ban phụ huynh' }
                            }
                          })}
                          className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono"
                        />
                      </div>
                    </div>
                  </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1.5">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700">
                        <Heart className="w-4 h-4 text-slate-400" />
                        <span>Ban Đại Diện Cha Mẹ Học Sinh (4 Vị Trí)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 italic">Chỉ Giáo viên chủ nhiệm lớp mới có quyền cấu hình thông tin Ban đại diện cha mẹ học sinh.</p>
                      {editingClass.parentCommittee?.head?.name && (
                        <div className="pt-2 text-left text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                          <div><strong>Trưởng ban:</strong> {editingClass.parentCommittee.head.name} {editingClass.parentCommittee.head.phone && `(${editingClass.parentCommittee.head.phone})`}</div>
                          {editingClass.parentCommittee.deputy?.name && <div><strong>Phó ban:</strong> {editingClass.parentCommittee.deputy.name} {editingClass.parentCommittee.deputy.phone && `(${editingClass.parentCommittee.deputy.phone})`}</div>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer action buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingClass(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-800 hover:to-indigo-800 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-600/25 hover-zoom-btn flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Lưu Toàn Bộ Thông Tin</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: XÓA LỚP */}
      {deleteConfirmClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-black text-rose-950">Xóa Lớp {deleteConfirmClass.name}?</h3>
              {isSuperAdmin && (
                <div className="mt-2.5 p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-[11px] font-bold text-left leading-relaxed">
                  👑 <strong>QUYỀN QUẢN TRỊ TỐI CAO:</strong> Bạn đang thực thi xóa Lớp học này trên toàn bộ hệ thống CSDL. Mọi học sinh và dữ liệu thuộc lớp này sẽ bị xóa vĩnh viễn khỏi toàn bộ tài khoản giáo viên/nhà trường.
                </div>
              )}
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Toàn bộ dữ liệu học sinh, điểm thi đua và sơ đồ của lớp này sẽ bị xóa.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmClass(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmDeleteClass}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/20 hover-zoom-btn"
              >
                Xóa Lớp Này
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XÓA HẾT TẤT CẢ CÁC LỚP HỌC (Yêu cầu 4) */}
      {isDeleteAllClassesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-rose-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <AlertTriangle className="w-8 h-8 text-rose-600" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-rose-900">
                Xóa Hết Tất Cả Các Lớp Học?
              </h3>
              <p className="text-xs text-rose-700 leading-relaxed">
                Hành động này sẽ xóa vĩnh viễn toàn bộ <strong>{classes.length} lớp học</strong> hiện có cùng tất cả học sinh của các lớp này.
              </p>
            </div>

            <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-800 space-y-1.5">
              <span className="font-black text-rose-950 block">Các lớp sẽ bị xóa:</span>
              <div className="flex flex-wrap gap-1.5">
                {classes.map(c => (
                  <span key={c.id} className="px-2.5 py-1 bg-white border border-rose-200 text-rose-900 rounded-xl font-bold text-[11px] shadow-2xs">
                    Lớp {c.name} ({c.grade})
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteAllClassesOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAllClasses}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/20 hover-zoom-btn flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xác Nhận Xóa Hết</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXCEL PREVIEW */}
      {isExcelPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-indigo-950">
                      Xem Trước Dữ Liệu Excel ({excelParsedStudents.length} học sinh)
                    </h3>
                    <p className="text-xs text-indigo-700">Đã nhận diện: Họ và tên, Ngày sinh, Giới tính, Tổ</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsExcelPreviewOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 border border-indigo-100 rounded-2xl overflow-hidden max-h-[45vh] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-indigo-50/80 text-indigo-950 font-black sticky top-0 border-b border-indigo-100">
                    <tr>
                      <th className="p-2.5 text-center w-12">STT</th>
                      <th className="p-2.5">Họ và tên</th>
                      <th className="p-2.5">Ngày sinh</th>
                      <th className="p-2.5 text-center">Giới tính</th>
                      <th className="p-2.5 text-center">Tổ</th>
                      <th className="p-2.5 text-center">Chức vụ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-50">
                    {excelParsedStudents.map((st, idx) => (
                      <tr key={idx} className="hover:bg-indigo-50/40 font-medium">
                        <td className="p-2.5 text-center font-mono text-indigo-600 font-bold">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-indigo-950">{st.name}</td>
                        <td className="p-2.5 text-indigo-700 font-medium">{st.birthDate || '—'}</td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            st.gender === 'Nam' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
                          }`}>
                            {st.gender}
                          </span>
                        </td>
                        <td className="p-2.5 text-center text-indigo-900 font-bold">{st.group || 'Tổ 1'}</td>
                        <td className="p-2.5 text-center">
                          {st.role ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-black text-[10px]">
                              {st.role}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Thành viên</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsExcelPreviewOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmExcelImport}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md shadow-emerald-600/20 hover-zoom-btn flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Nạp {excelParsedStudents.length} Học Sinh Vào Lớp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XÓA CẢ DANH SÁCH LỚP */}
      {isClearAllConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-black text-rose-950">
                Xóa Danh Sách Học Sinh Lớp {activeClass?.name}?
              </h3>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed font-medium">
                Toàn bộ <strong className="text-rose-600 font-black">{currentClassStudents.length} học sinh</strong> trong lớp này sẽ bị xóa.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setIsClearAllConfirmOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-indigo-900 font-bold text-xs rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleClearAllClassStudents}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/20 hover-zoom-btn"
              >
                Xóa Toàn Bộ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XÓA CÁC HỌC SINH ĐÃ CHỌN */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-black text-rose-950">
                Xóa {selectedStudentIds.length} Học Sinh Đã Chọn?
              </h3>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed font-medium">
                Hành động này sẽ xóa các học sinh đã được tích chọn khỏi lớp.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-indigo-900 font-bold text-xs rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleBulkDeleteSelected}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/20 hover-zoom-btn"
              >
                Xóa Ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XÓA ĐỒNG LOẠT CÁC LỚP ĐÃ CHỌN (Yêu cầu 1) */}
      {isBulkClassDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-rose-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-rose-950 uppercase">
                Xóa Đồng Loạt {selectedClassIds.length} Lớp Học?
              </h3>
              <p className="text-xs text-rose-800 leading-relaxed font-semibold">
                Bạn đang chuẩn bị xóa {selectedClassIds.length} lớp học đã tích chọn:
              </p>
              <div className="max-h-36 overflow-y-auto p-3 bg-rose-50/80 rounded-2xl border border-rose-200 text-left space-y-1">
                {classes.filter(c => selectedClassIds.includes(c.id)).map(c => {
                  const studentCount = students.filter(s => s.classId === c.id).length;
                  return (
                    <div key={c.id} className="text-xs font-bold text-rose-900 flex items-center justify-between">
                      <span>• Lớp {c.name} ({c.grade})</span>
                      <span className="text-[11px] font-mono text-rose-700">{studentCount} học sinh</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 font-bold">
                ⚠️ Dữ liệu học sinh và các tiết dạy tương ứng trong thời khóa biểu sẽ tự động được dọn dẹp và đồng bộ trực tuyến.
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkClassDeleteOpen(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-2xl uppercase transition-all"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDeleteClasses}
                className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-black text-xs rounded-2xl shadow-md shadow-rose-600/25 hover-zoom-btn uppercase transition-all flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xác Nhận Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SỬA THÔNG TIN ĐỒNG LOẠT CÁC LỚP ĐÃ CHỌN (Yêu cầu 1) */}
      {isBulkClassEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-indigo-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-indigo-950 uppercase">
                    Sửa Thông Tin Đồng Loạt ({selectedClassIds.length} Lớp)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Áp dụng thay đổi cho tất cả các lớp đang được tích chọn
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkClassEditOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selected Classes Preview Pill list */}
            <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-200">
              <span className="text-[11px] font-black text-indigo-700 uppercase block mb-1.5">
                Các lớp đang được chọn:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {classes.filter(c => selectedClassIds.includes(c.id)).map(c => (
                  <span key={c.id} className="px-2.5 py-1 bg-white rounded-xl text-xs font-black text-indigo-900 border border-indigo-200 shadow-2xs">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3.5 text-xs font-bold text-slate-700">
              {/* Khối Lớp */}
              <div>
                <label className="block text-[11px] font-black uppercase text-indigo-900 mb-1">
                  1. Cập nhật Khối Lớp:
                </label>
                <select
                  value={bulkEditGrade}
                  onChange={(e) => setBulkEditGrade(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 focus:border-indigo-600 font-bold bg-white text-slate-800"
                >
                  <option value="keep">— Giữ nguyên khối lớp của từng lớp —</option>
                  <option value="Khối 1">Khối 1</option>
                  <option value="Khối 2">Khối 2</option>
                  <option value="Khối 3">Khối 3</option>
                  <option value="Khối 4">Khối 4</option>
                  <option value="Khối 5">Khối 5</option>
                </select>
              </div>

              {/* Năm học */}
              <div>
                <label className="block text-[11px] font-black uppercase text-indigo-900 mb-1">
                  2. Cập nhật Năm Học:
                </label>
                <select
                  value={bulkEditYear}
                  onChange={(e) => setBulkEditYear(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 focus:border-indigo-600 font-bold bg-white text-slate-800"
                >
                  <option value="keep">— Giữ nguyên năm học hiện tại —</option>
                  <option value="2026–2027">Năm học 2026–2027</option>
                  <option value="2025–2026">Năm học 2025–2026</option>
                  <option value="2027–2028">Năm học 2027–2028</option>
                </select>
              </div>

              {/* Tên Giáo viên */}
              <div>
                <label className="block text-[11px] font-black uppercase text-indigo-900 mb-1">
                  3. Giáo viên Phụ trách / Chủ nhiệm (Để trống nếu giữ nguyên):
                </label>
                <input
                  type="text"
                  value={bulkEditTeacher}
                  onChange={(e) => setBulkEditTeacher(e.target.value)}
                  placeholder="Nhập tên giáo viên mới để gán cho các lớp đã chọn..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 focus:border-indigo-600 font-bold"
                />
              </div>

              {/* Màu Nhận Diện */}
              <div>
                <label className="block text-[11px] font-black uppercase text-indigo-900 mb-1">
                  4. Màu sắc nhận diện:
                </label>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setBulkEditColor('keep')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase border transition-all ${
                      bulkEditColor === 'keep' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                  >
                    Giữ nguyên màu
                  </button>
                  {CLASS_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBulkEditColor(c)}
                      className={`w-7 h-7 rounded-xl border-2 transition-all ${
                        bulkEditColor === c ? 'ring-2 ring-indigo-600 scale-110 border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Khẩu hiệu lớp */}
              {canEditClassSlogan && (
                <div>
                  <label className="block text-[11px] font-black uppercase text-indigo-900 mb-1">
                    5. Khẩu hiệu chung của lớp (Để trống nếu giữ nguyên):
                  </label>
                  <input
                    type="text"
                    value={bulkEditSlogan}
                    onChange={(e) => setBulkEditSlogan(e.target.value)}
                    placeholder="Ví dụ: Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 focus:border-indigo-600 font-bold"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkClassEditOpen(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-2xl uppercase transition-all"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkEditClasses}
                className="flex-1 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-black text-xs rounded-2xl shadow-md shadow-indigo-600/25 hover-zoom-btn uppercase transition-all flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Lưu Thay Đổi Đồng Loạt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: THÊM HỌC SINH */}
      {isSingleAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
              <div>
                <h3 className="text-base font-black text-indigo-950">Thêm Học Sinh Mới</h3>
                <p className="text-xs text-indigo-700 mt-0.5">Họ tên, ngày sinh, giới tính và tổ sinh hoạt</p>
              </div>
              <button 
                onClick={() => setIsSingleAddOpen(false)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSingleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên học sinh *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn An"
                  value={singleName}
                  onChange={(e) => setSingleName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Ngày tháng năm sinh</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: 15/09/2016"
                  value={singleBirthDate}
                  onChange={(e) => setSingleBirthDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Giới tính</label>
                  <select
                    value={singleGender}
                    onChange={(e) => setSingleGender(e.target.value as 'Nam' | 'Nữ')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tổ</label>
                  <select
                    value={singleGroup}
                    onChange={(e) => setSingleGroup(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="Tổ 1">Tổ 1</option>
                    <option value="Tổ 2">Tổ 2</option>
                    <option value="Tổ 3">Tổ 3</option>
                    <option value="Tổ 4">Tổ 4</option>
                  </select>
                </div>
              </div>

              {/* Chức vụ cán bộ lớp (Tối đa 3 chức vụ) */}
              {canAssignClassOfficer && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                      <span>Chức vụ cán bộ lớp (Tối đa 3)</span>
                    </label>
                    <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                      Đã chọn: {singleRoles.length}/3
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 p-2 bg-slate-50 rounded-2xl border border-slate-200 max-h-36 overflow-y-auto">
                    {OFFICER_ROLE_OPTIONS.map((opt) => {
                      const isSelected = singleRoles.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSingleRoles(prev => prev.filter(r => r !== opt.value));
                            } else {
                              if (singleRoles.length >= 3) {
                                alert('Mỗi học sinh chỉ được đảm nhiệm tối đa 3 chức vụ!');
                                return;
                              }
                              setSingleRoles(prev => [...prev, opt.value]);
                            }
                          }}
                          className={`p-2 rounded-xl text-[11px] font-bold text-left transition-all flex items-center justify-between truncate ${
                            isSelected
                              ? 'bg-indigo-600 text-white font-black shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-indigo-50/50'
                          }`}
                        >
                          <span className="truncate">{opt.icon} {opt.label}</span>
                          {isSelected && <span className="text-xs ml-1 font-black">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSingleAddOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-600/20 hover-zoom-btn"
                >
                  Thêm Học Sinh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SỬA HỌC SINH (Layout 2 cột ngang hiển thị đầy đủ trên màn hình, không phải cuộn chuột) */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 max-w-3xl lg:max-w-4xl w-full p-5 sm:p-6 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 max-h-[95vh] flex flex-col justify-between overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-indigo-100">
              <div>
                <h3 className="text-base font-black text-indigo-950 flex items-center gap-2">
                  <span>✏️ Sửa Thông Tin Học Sinh</span>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    STT {editingStudent.stt || '–'}
                  </span>
                </h3>
                <p className="text-xs text-indigo-700 mt-0.5 font-medium">Chỉnh sửa họ tên, ngày sinh, giới tính, số xu và chức vụ cán bộ lớp</p>
              </div>
              <button 
                onClick={() => setEditingStudent(null)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingStudent.name.trim()) return;
                const limited = canAssignClassOfficer ? editingRoles.slice(0, 3) : getStudentRolesList(editingStudent);
                const roleStr = canAssignClassOfficer ? limited.join(' • ') : (editingStudent.role || '');
                updateStudent(editingStudent.id, {
                  name: editingStudent.name.trim(),
                  classId: editingStudent.classId,
                  birthDate: editingStudent.birthDate?.trim() || '',
                  gender: editingStudent.gender,
                  group: editingStudent.group,
                  points: editingStudent.points,
                  role: roleStr,
                  roles: limited,
                  avatar: editingStudent.avatar,
                  originalAvatar: editingStudent.originalAvatar,
                  avatarScale: editingStudent.avatarScale,
                  avatarPosition: editingStudent.avatarPosition
                });
                setEditingStudent(null);
                playCoinSound();
                // syncDatabaseNow() removed to avoid saving stale React state
              }}
              className="space-y-3.5"
            >
              {/* BỐ CỤC 2 CỘT NGANG: HIỂN THỊ ĐẦY ĐỦ TRÊN MÀN HÌNH KHÔNG PHẢI CUỘN CHUỘT */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                {/* CỘT TRÁI (md:col-span-6): THÔNG TIN CƠ BẢN & ẢNH ĐẠI DIỆN */}
                <div className="md:col-span-6 space-y-2.5">
                  {/* Khối Ảnh đại diện học sinh */}
                  <div className="flex items-center gap-3 p-2.5 bg-gradient-to-r from-indigo-50/80 to-purple-50/50 border border-indigo-100 rounded-2xl">
                    <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-indigo-200 bg-white shrink-0 shadow-xs relative">
                      <img
                        src={editingStudent.avatar}
                        alt={editingStudent.name}
                        className="w-full h-full object-cover object-center"
                        referrerPolicy="no-referrer"
                        onError={(e) => handleAvatarImgError(e, editingStudent.gender, editingStudent.name)}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-black text-indigo-950 truncate">Ảnh đại diện học sinh</div>
                      <p className="text-[10.5px] text-indigo-600">Đổi ảnh thật hoặc căn chỉnh khung hình</p>
                      {canEditStudentAvatar ? (
                        <button
                          type="button"
                          onClick={() => setAvatarEditingStudent(editingStudent)}
                          className="mt-1 px-2.5 py-1 bg-white hover:bg-indigo-50 border border-indigo-300 rounded-lg text-[11px] font-bold text-indigo-700 flex items-center gap-1 transition-colors shadow-2xs hover-zoom-btn cursor-pointer"
                        >
                          <Camera className="w-3 h-3 text-indigo-600" />
                          <span>Thu phóng & Cắt ảnh</span>
                        </button>
                      ) : (
                        <span className="inline-block mt-1 text-[10px] text-slate-500 font-semibold italic">
                          (Chỉ GVCN có quyền đổi ảnh)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Lớp học */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                      Lớp học ({classes.length} lớp):
                    </label>
                    <select
                      value={editingStudent.classId}
                      onChange={(e) => setEditingStudent({ ...editingStudent, classId: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    >
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.grade}) {c.teacherName ? `• ${c.teacherName}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Họ và tên */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Họ và tên học sinh *</label>
                    <input
                      type="text"
                      value={editingStudent.name}
                      onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                      placeholder="Nhập họ và tên học sinh..."
                      required
                    />
                  </div>

                  {/* Ngày sinh & Giới tính xếp cùng 1 hàng */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-indigo-600" />
                        <span>Ngày sinh</span>
                      </label>
                      <input
                        type="text"
                        placeholder="VD: 15/09/2016"
                        value={editingStudent.birthDate || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, birthDate: e.target.value })}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Giới tính</label>
                      <select
                        value={editingStudent.gender}
                        onChange={(e) => setEditingStudent({ ...editingStudent, gender: e.target.value as 'Nam' | 'Nữ' })}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      >
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                      </select>
                    </div>
                  </div>

                  {/* Tổ & Số xu thi đua xếp cùng 1 hàng */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Tổ</label>
                      <select
                        value={editingStudent.group || 'Tổ 1'}
                        onChange={(e) => setEditingStudent({ ...editingStudent, group: e.target.value })}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      >
                        {['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Số xu thi đua</label>
                      <input
                        type="number"
                        disabled={!canResetOrAssignCoins}
                        value={editingStudent.points}
                        onChange={(e) => setEditingStudent({ ...editingStudent, points: parseInt(e.target.value) || 0 })}
                        className={`w-full px-3 py-1.5 border rounded-xl text-xs font-bold ${
                          canResetOrAssignCoins 
                            ? 'bg-slate-50 border-slate-200 text-amber-900' 
                            : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                        }`}
                        title={!canResetOrAssignCoins ? 'Chỉ GVCN mới có quyền chỉnh sửa số xu' : undefined}
                      />
                    </div>
                  </div>
                </div>

                {/* CỘT PHẢI (md:col-span-6): CHỨC VỤ CÁN BỘ LỚP */}
                <div className="md:col-span-6 flex flex-col justify-between bg-slate-50/80 p-3 rounded-2xl border border-slate-200">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-black text-slate-800 flex items-center gap-1.5 uppercase">
                        <Crown className="w-3.5 h-3.5 text-amber-500" />
                        <span>Chức vụ cán bộ lớp (Tối đa 3)</span>
                      </label>
                      {canAssignClassOfficer ? (
                        <span className="text-[10px] font-black text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-full border border-indigo-200">
                          Đã chọn: {editingRoles.length}/3
                        </span>
                      ) : (
                        <span className="text-[9.5px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          Chỉ đọc
                        </span>
                      )}
                    </div>

                    {canAssignClassOfficer ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        {OFFICER_ROLE_OPTIONS.map((opt) => {
                          const isSelected = editingRoles.includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setEditingRoles(prev => prev.filter(r => r !== opt.value));
                                } else {
                                  if (editingRoles.length >= 3) {
                                    alert('Mỗi học sinh chỉ được đảm nhiệm tối đa 3 chức vụ!');
                                    return;
                                  }
                                  setEditingRoles(prev => [...prev, opt.value]);
                                }
                              }}
                              className={`p-2 rounded-xl text-[11px] font-bold text-left transition-all flex items-center justify-between truncate cursor-pointer ${
                                isSelected
                                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black shadow-xs ring-1 ring-indigo-400'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-indigo-50/60'
                              }`}
                            >
                              <span className="truncate">{opt.icon} {opt.label}</span>
                              {isSelected && <span className="text-xs ml-1 font-black shrink-0">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-2 p-3 bg-white rounded-xl border border-slate-200">
                        <p className="text-[11px] font-bold text-slate-600">Chức vụ hiện tại của học sinh:</p>
                        {getStudentRolesList(editingStudent).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {getStudentRolesList(editingStudent).map((r, idx) => {
                              const rDef = getStudentRoleInfo(r);
                              return (
                                <span
                                  key={idx}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-black border flex items-center gap-1 ${rDef?.badgeBg || 'bg-amber-100'} ${rDef?.badgeText || 'text-amber-900'} ${rDef?.badgeBorder || 'border-amber-300'}`}
                                >
                                  <span>{rDef?.icon || '👑'}</span>
                                  <span>{r}</span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">Chưa gán chức vụ nào</p>
                        )}
                        <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-100">
                          (Chỉ Giáo viên chủ nhiệm mới có quyền thay đổi chức vụ cán bộ lớp)
                        </p>
                      </div>
                    )}
                  </div>

                  {canAssignClassOfficer && (
                    <p className="text-[10px] text-slate-500 mt-2 font-medium italic">
                      * Bấm chọn để gán chức vụ cho học sinh (Ví dụ: Lớp trưởng, Tổ trưởng tổ 1, Ban văn nghệ...).
                    </p>
                  )}
                </div>
              </div>

              {/* FOOTER ACTIONS */}
              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-600/20 hover-zoom-btn cursor-pointer uppercase"
                >
                  Lưu Thông Tin Học Sinh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHỈ ĐỊNH CHỨC VỤ CHO 1 HỌC SINH (TỐI ĐA 3 CHỨC VỤ) */}
      {/* ========================================================================= */}
      {quickRoleStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 max-w-lg w-full p-6 space-y-4 max-h-[90vh] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                    <Crown className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-indigo-950">Chỉ Định Chức Vụ Cán Bộ</h3>
                    <p className="text-xs text-indigo-700">Học sinh: <strong className="text-indigo-950">STT {quickRoleStudent.stt} · {quickRoleStudent.name}</strong> • Tổ {quickRoleStudent.group || '1'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setQuickRoleStudent(null)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Thanh hiển thị các chức vụ đã chọn */}
              <div className="mt-3 p-3 bg-gradient-to-r from-amber-50/80 via-indigo-50/60 to-sky-50/80 rounded-2xl border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                    Chức vụ đảm nhiệm:
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
                    studentSelectedRoles.length === 3 
                      ? 'bg-amber-100 text-amber-900 border-amber-300' 
                      : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                  }`}>
                    {studentSelectedRoles.length} / 3 chức vụ (tối đa)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
                  {studentSelectedRoles.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">
                      Chưa gán chức vụ nào (Học sinh là thành viên lớp)
                    </span>
                  ) : (
                    studentSelectedRoles.map((r, idx) => {
                      const rDef = getStudentRoleInfo(r);
                      return (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black border shadow-2xs ${
                            rDef?.badgeBg || 'bg-amber-100'
                          } ${rDef?.badgeText || 'text-amber-900'} ${rDef?.badgeBorder || 'border-amber-300'}`}
                        >
                          <span>{rDef?.icon || '👑'}</span>
                          <span>{r}</span>
                          <button
                            type="button"
                            onClick={() => setStudentSelectedRoles(prev => prev.filter(item => item !== r))}
                            className="ml-1 hover:opacity-70 text-slate-500 hover:text-rose-600"
                            title="Bỏ chức vụ này"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Danh sách 11 chức vụ */}
              <div className="mt-3 space-y-1.5">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                  Bấm để chọn / bỏ chọn (Tối đa 3 chức vụ):
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                  {OFFICER_ROLE_OPTIONS.map((opt) => {
                    const isSelected = studentSelectedRoles.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setStudentSelectedRoles(prev => prev.filter(r => r !== opt.value));
                          } else {
                            if (studentSelectedRoles.length >= 3) {
                              alert('Mỗi học sinh chỉ được đảm nhiệm tối đa 3 chức vụ! Hãy bỏ bớt 1 chức vụ đã chọn nếu muốn thay đổi.');
                              return;
                            }
                            setStudentSelectedRoles(prev => [...prev, opt.value]);
                          }
                        }}
                        className={`p-2.5 rounded-2xl text-xs font-bold flex items-center justify-between transition-all hover-zoom-btn border text-left ${
                          isSelected
                            ? 'border-indigo-600 ring-2 ring-indigo-400 bg-indigo-50/90 text-indigo-950 shadow-xs'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{opt.icon}</span>
                          <span className="truncate font-black">{opt.label}</span>
                        </div>
                        <div className="shrink-0 ml-1">
                          {isSelected ? (
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black shadow-2xs">
                              ✓
                            </span>
                          ) : (
                            <span className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center text-[10px] text-transparent hover:text-slate-400">
                              +
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStudentSelectedRoles([])}
                className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors"
              >
                Về Thành Viên
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickRoleStudent(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveStudentRoles(quickRoleStudent.id, studentSelectedRoles)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-600/25 hover-zoom-btn flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Lưu Chức Vụ ({studentSelectedRoles.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: GÁN XU HÀNG LOẠT CHO NHIỀU HỌC SINH (Yêu cầu 3) */}
      {/* ========================================================================= */}
      {isBulkAwardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
                  bulkAwardMode === 'minus' ? 'bg-rose-100 text-rose-700' : bulkAwardMode === 'sao' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {bulkAwardMode === 'minus' ? <Minus className="w-5 h-5" /> : bulkAwardMode === 'sao' ? <Star className="w-5 h-5 fill-amber-500" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-black text-indigo-950">
                    Gán Xu Hàng Loạt ({selectedStudentIds.length} Học Sinh)
                  </h3>
                  <p className="text-xs text-indigo-700 font-medium">
                    Thực hiện {bulkAwardMode === 'minus' ? 'trừ xu' : bulkAwardMode === 'sao' ? 'tặng sao' : 'cộng xu'} đồng loạt cho các học sinh đang chọn
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkAwardOpen(false)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of selected students badges */}
            <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-1.5">
              <span className="text-xs font-black text-indigo-950 uppercase tracking-wide block">
                Danh sách {selectedStudentIds.length} học sinh được áp dụng:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {currentClassStudents
                  .filter(s => selectedStudentIds.includes(s.id))
                  .map(s => (
                    <span key={s.id} className="px-2.5 py-1 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-indigo-950 shadow-2xs">
                      STT {s.stt} · {s.name}
                    </span>
                  ))}
              </div>
            </div>

            {/* 3 Forms: Cộng xu, Trừ xu, Tặng sao */}
            <div>
              <label className="block text-xs font-black text-indigo-950 mb-1.5 uppercase tracking-wider">
                1. HÌNH THỨC GÁN ĐIỂM:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBulkAwardMode('xu');
                    setBulkAwardCoins(1);
                  }}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn ${
                    bulkAwardMode === 'xu' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 scale-102' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Cộng Xu</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkAwardMode('minus');
                    setBulkAwardCoins(1);
                  }}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn ${
                    bulkAwardMode === 'minus' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25 scale-102' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Minus className="w-4 h-4" />
                  <span>- Trừ Xu</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkAwardMode('sao');
                    setBulkAwardCoins(1);
                  }}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn ${
                    bulkAwardMode === 'sao' ? 'bg-amber-600 text-white shadow-md shadow-amber-500/25 scale-102' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Star className="w-4 h-4 fill-current" />
                  <span>⭐ Tặng Sao</span>
                </button>
              </div>
            </div>

            {/* Choose Subject */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-indigo-950 flex items-center gap-1.5 uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  <span>2. CHỌN MÔN HỌC ĐÁNH GIÁ:</span>
                </label>
                <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                  Đang chọn: {bulkAwardSubject}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-200">
                {appliedSubjects.map((sub) => {
                  const isChosen = bulkAwardSubject === sub.name;
                  const isCore = sub.isDefault || ['ghi chung / nề nếp', 'toán', 'tiếng việt'].includes(sub.name.trim().toLowerCase());
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setBulkAwardSubject(sub.name)}
                      className={`p-2 rounded-xl text-xs font-bold text-left transition-all truncate hover-zoom-btn flex items-center gap-2 cursor-pointer ${
                        isChosen
                          ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-600/40 font-black'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-indigo-50/50'
                      }`}
                      title={sub.name}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sub.color || '#3B82F6' }} />
                      <span className="truncate">{sub.name}</span>
                      {isCore && <span className="text-[10px] text-amber-400 shrink-0">★</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Choose Amount */}
            <div>
              <label className="block text-xs font-black text-indigo-950 mb-1.5 uppercase tracking-wider">
                3. {bulkAwardMode === 'sao' ? 'SỐ SAO TẶNG (1 ⭐ = 5 xu):' : bulkAwardMode === 'minus' ? 'SỐ XU TRỪ:' : 'SỐ XU CỘNG:'}
              </label>
              {bulkAwardMode === 'sao' ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setBulkAwardCoins(num)}
                      className={`py-2.5 rounded-2xl text-xs font-black transition-all hover-zoom-btn ${
                        bulkAwardCoins === num ? 'bg-amber-600 text-white shadow-md shadow-amber-500/25' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {num === 1 ? '⭐ 1 Sao (+5 xu)' : num === 2 ? '⭐⭐ 2 Sao (+10 xu)' : '⭐⭐⭐ 3 Sao (+15 xu)'}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setBulkAwardCoins(num)}
                      className={`flex-1 py-2.5 rounded-2xl text-xs font-black transition-all hover-zoom-btn ${
                        bulkAwardCoins === num 
                          ? bulkAwardMode === 'minus' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25' : 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {bulkAwardMode === 'minus' ? `-${num}` : `+${num}`} xu
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Lý do / Lời nhận xét:
              </label>
              <input
                type="text"
                placeholder={bulkAwardMode === 'minus' ? 'Lý do trừ xu đồng loạt...' : 'Lời khen ngợi đồng loạt...'}
                value={bulkAwardReason}
                onChange={(e) => setBulkAwardReason(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkAwardOpen(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkAward}
                className={`px-5 py-2.5 text-white text-xs font-black rounded-xl shadow-md transition-all hover-zoom-btn flex items-center gap-1.5 ${
                  bulkAwardMode === 'minus' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20' : bulkAwardMode === 'sao' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/25' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                }`}
              >
                {bulkAwardMode === 'minus' ? <Minus className="w-4 h-4" /> : bulkAwardMode === 'sao' ? <Star className="w-4 h-4 fill-white" /> : <Plus className="w-4 h-4" />}
                <span>
                  {bulkAwardMode === 'minus'
                    ? `Xác Nhận Trừ -${bulkAwardCoins} Xu Môn ${bulkAwardSubject} (${selectedStudentIds.length} Em)`
                    : bulkAwardMode === 'sao'
                    ? `Xác Nhận Tặng +${bulkAwardCoins} ⭐ Môn ${bulkAwardSubject} (+${bulkAwardCoins * 5} xu, ${selectedStudentIds.length} Em)`
                    : `Xác Nhận Cộng +${bulkAwardCoins} Xu Môn ${bulkAwardSubject} (${selectedStudentIds.length} Em)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHỈ ĐỊNH CHỨC VỤ HÀNG LOẠT (Tối đa 3 chức vụ) */}
      {/* ========================================================================= */}
      {isBulkRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  <Crown className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-indigo-950">
                    Gán Chức Vụ Đồng Loạt ({selectedStudentIds.length} Học Sinh)
                  </h3>
                  <p className="text-xs text-indigo-700">Mỗi học sinh có thể đảm nhiệm tối đa 3 chức vụ trọng trách</p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkRoleModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thanh preview các chức vụ đã chọn cho nhóm */}
            <div className="p-3 bg-gradient-to-r from-amber-50/80 via-indigo-50/60 to-sky-50/80 rounded-2xl border border-indigo-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                  Chức vụ áp dụng:
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
                  bulkSelectedRoles.length === 3 
                    ? 'bg-amber-100 text-amber-900 border-amber-300' 
                    : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                }`}>
                  {bulkSelectedRoles.length} / 3 chức vụ (tối đa)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 min-h-[30px]">
                {bulkSelectedRoles.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">
                    Chưa chọn chức vụ nào (Sẽ chuyển các em thành Thành viên lớp nếu bấm Lưu)
                  </span>
                ) : (
                  bulkSelectedRoles.map((r, idx) => {
                    const rDef = getStudentRoleInfo(r);
                    return (
                      <span
                        key={idx}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black border shadow-2xs ${
                          rDef?.badgeBg || 'bg-amber-100'
                        } ${rDef?.badgeText || 'text-amber-900'} ${rDef?.badgeBorder || 'border-amber-300'}`}
                      >
                        <span>{rDef?.icon || '👑'}</span>
                        <span>{r}</span>
                        <button
                          type="button"
                          onClick={() => setBulkSelectedRoles(prev => prev.filter(item => item !== r))}
                          className="ml-1 hover:opacity-70 text-slate-500 hover:text-rose-600"
                          title="Bỏ chức vụ này"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wide block">
                Bấm để chọn / bỏ chọn (Tối đa 3 chức vụ):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                {OFFICER_ROLE_OPTIONS.map((opt) => {
                  const isSelected = bulkSelectedRoles.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setBulkSelectedRoles(prev => prev.filter(r => r !== opt.value));
                        } else {
                          if (bulkSelectedRoles.length >= 3) {
                            alert('Mỗi học sinh chỉ được đảm nhiệm tối đa 3 chức vụ!');
                            return;
                          }
                          setBulkSelectedRoles(prev => [...prev, opt.value]);
                        }
                      }}
                      className={`p-2.5 rounded-2xl text-xs font-bold flex items-center justify-between transition-all hover-zoom-btn border text-left ${
                        isSelected
                          ? 'border-indigo-600 ring-2 ring-indigo-400 bg-indigo-50/90 text-indigo-950 shadow-xs font-black'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{opt.icon}</span>
                        <span className="truncate font-black">{opt.label}</span>
                      </div>
                      <div className="shrink-0 ml-1">
                        {isSelected ? (
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                            ✓
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center text-[10px] text-transparent hover:text-slate-400">
                            +
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBulkSelectedRoles([])}
                className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors"
                title="Xóa hết chức vụ, đưa các em về thành viên lớp"
              >
                Về Thành Viên
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkRoleModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkRole}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-600/25 transition-all hover-zoom-btn flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Áp Dụng Cho {selectedStudentIds.length} Em</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ĐẶT VỀ 0 XU CHO CÁC HỌC SINH ĐÃ CHỌN (Yêu cầu 3) */}
      {/* ========================================================================= */}
      {isBulkResetCoinsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-amber-200 max-w-sm w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
              <RotateCcw className="w-6 h-6 text-amber-600" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-amber-950">
                Đặt Về 0 Xu ({selectedStudentIds.length} Học Sinh)?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Số xu thi đua của <strong className="text-amber-800 font-black">{selectedStudentIds.length} học sinh đã chọn</strong> sẽ được đặt lại về 0 xu.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkResetCoinsOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkResetCoins}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md shadow-amber-500/20 hover-zoom-btn flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Đặt Về 0 Xu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RESET TOÀN BỘ XU CẢ LỚP VỀ 0 (Yêu cầu 3) */}
      {/* ========================================================================= */}
      {isClassResetCoinsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-amber-200 max-w-sm w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
              <RotateCcw className="w-6 h-6 text-amber-600" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-amber-950">
                Reset Xu Cả Lớp {activeClass?.name} Về 0?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Toàn bộ số xu thi đua của <strong className="text-amber-800 font-black">{currentClassStudents.length} học sinh</strong> trong lớp sẽ được đặt lại về 0 xu.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsClassResetCoinsOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmClassResetCoins}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md shadow-amber-500/20 hover-zoom-btn flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Cả Lớp Về 0</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STUDENT AVATAR EDITOR (Yêu cầu 5: Khắc phục triệt để lỗi crop ảnh & Lật ảnh) */}
      {avatarEditingStudent && (
        <AvatarEditorModal
          isOpen={!!avatarEditingStudent}
          studentName={avatarEditingStudent.name}
          currentAvatar={avatarEditingStudent.avatar}
          originalAvatar={avatarEditingStudent.originalAvatar || avatarEditingStudent.avatar}
          currentScale={avatarEditingStudent.avatarScale || 1}
          currentPosition={avatarEditingStudent.avatarPosition || { x: 0, y: 0 }}
          currentFlipX={avatarEditingStudent.flipX || false}
          onOpenGroupPhoto={() => setIsGroupPhotoModalOpen(true)}
          onClose={() => setAvatarEditingStudent(null)}
          onSave={(croppedUrl, originalUrl, scale, position, flipX) => {
            const avatarData = {
              avatar: croppedUrl,
              originalAvatar: originalUrl,
              avatarScale: scale,
              avatarPosition: position,
              flipX: flipX ?? false
            };
            updateStudent(avatarEditingStudent.id, avatarData);
            if (editingStudent && editingStudent.id === avatarEditingStudent.id) {
              setEditingStudent({
                ...editingStudent,
                ...avatarData
              });
            }
            setAvatarEditingStudent(null);
            // syncDatabaseNow() removed to avoid saving stale React state
          }}
        />
      )}

      {/* MODAL: CLASS AVATAR EDITOR WITH ZOOM & PAN (User Request) */}
      {avatarEditingClass && (
        <ClassAvatarEditorModal
          isOpen={!!avatarEditingClass}
          classNameTitle={avatarEditingClass.name}
          currentAvatar={avatarEditingClass.avatar || CLASS_AVATARS[0].url}
          originalAvatar={avatarEditingClass.originalAvatar}
          currentScale={avatarEditingClass.avatarScale || 1}
          currentPosition={avatarEditingClass.avatarPosition || { x: 0, y: 0 }}
          colorTheme={avatarEditingClass.color || '#6366F1'}
          onClose={() => setAvatarEditingClass(null)}
          onSave={(avatarUrl, scale, position, originalUrl) => {
            const finalOriginal = originalUrl || avatarEditingClass.originalAvatar || avatarUrl;
            updateClass(avatarEditingClass.id, {
              avatar: avatarUrl,
              originalAvatar: finalOriginal,
              avatarScale: scale,
              avatarPosition: position
            });
            if (editingClass && editingClass.id === avatarEditingClass.id) {
              setEditingClass({
                ...editingClass,
                avatar: avatarUrl,
                originalAvatar: finalOriginal,
                avatarScale: scale,
                avatarPosition: position
              });
            }
            setAvatarEditingClass(null);
            confetti({ particleCount: 35, spread: 60 });
          }}
        />
      )}

      {/* MODAL: EXPORT STUDENT LIST */}
      {isExportStudentListOpen && activeClass && (
        <ExportStudentListModal
          isOpen={isExportStudentListOpen}
          onClose={() => setIsExportStudentListOpen(false)}
          classroom={activeClass}
          students={currentClassStudents}
          teacherProfile={teacherProfile}
        />
      )}

      {/* MODAL: NEW CLASS AVATAR EDITOR WITH ZOOM & PAN */}
      {isNewClassAvatarEditorOpen && (
        <ClassAvatarEditorModal
          isOpen={isNewClassAvatarEditorOpen}
          classNameTitle={newClassName || 'Lớp mới'}
          currentAvatar={newClassAvatar}
          originalAvatar={newClassOriginalAvatar}
          currentScale={newClassAvatarScale}
          currentPosition={newClassAvatarPosition}
          colorTheme={newClassColor}
          onClose={() => setIsNewClassAvatarEditorOpen(false)}
          onSave={(avatarUrl, scale, position, originalUrl) => {
            const finalOrig = originalUrl || newClassOriginalAvatar || avatarUrl;
            setNewClassAvatar(avatarUrl);
            setNewClassOriginalAvatar(finalOrig);
            setNewClassAvatarScale(scale);
            setNewClassAvatarPosition(position);
            setIsNewClassAvatarEditorOpen(false);
            confetti({ particleCount: 30, spread: 50 });
          }}
        />
      )}

      {/* MODAL: KHỞI TẠO LỚP DẠY BỘ MÔN (User Request) */}
      <InitSubjectClassesModal
        isOpen={isInitSubjectClassesModalOpen}
        onClose={() => setIsInitSubjectClassesModalOpen(false)}
      />

      {/* MODAL: TỰ ĐỘNG GÁN AVATAR (DEFAULT & REAL DEMO) */}
      {isAutoAssignAvatarModalOpen && activeClass && (
        <AutoAssignAvatarModal
          isOpen={isAutoAssignAvatarModalOpen}
          onClose={() => setIsAutoAssignAvatarModalOpen(false)}
          classNameTitle={activeClass.name}
          classId={activeClassId}
          totalStudents={currentClassStudents.length}
          studentsWithoutAvatarCount={
            currentClassStudents.filter(
              s => !s.avatar || !s.avatar.trim() || s.avatar.includes('api.dicebear.com/7.x/bottts/svg?seed=student-')
            ).length
          }
          defaultType={autoAssignInitialType}
          onConfirm={(type, overwrite) => {
            const res = autoAssignAvatarsToClass(activeClassId, type, overwrite);
            alert(`Đã hoàn tất tự động gán ảnh đại diện (${type === 'default' ? 'Mặc định' : 'Ảnh thật demo'}) cho ${res.updatedCount} học sinh lớp ${activeClass.name}!`);
          }}
        />
      )}

      {/* MODAL: CẮT & GHÉP ẢNH ĐẠI DIỆN TỪ ẢNH TẬP THỂ CẢ LỚP */}
      {isGroupPhotoModalOpen && activeClass && (
        <GroupPhotoAvatarModal
          isOpen={isGroupPhotoModalOpen}
          onClose={() => setIsGroupPhotoModalOpen(false)}
          students={currentClassStudents}
          classNameTitle={activeClass.name}
          classImage={activeClass.originalAvatar || activeClass.avatar}
          onSave={async (assignments) => {
            if (batchUpdateStudentAvatars) {
              batchUpdateStudentAvatars(assignments);
            } else {
              assignments.forEach(item => {
                updateStudent(item.studentId, {
                  avatar: item.avatar,
                  originalAvatar: item.avatar,
                  avatarScale: 1,
                  avatarPosition: { x: 0, y: 0 },
                  flipX: false
                });
              });
            }
          }}
        />
      )}

      {/* MODAL: Bảng Tổng Hợp Chi Tiết Sĩ Số Từng Lớp */}
      {isClassStatsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 text-white flex items-center justify-center shadow-sm">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Bảng Tổng Hợp Sĩ Số Lớp Học</h3>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">Chi tiết phân bổ học sinh theo từng lớp thực tế</p>
                </div>
              </div>
              <button 
                onClick={() => setIsClassStatsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto mt-4 pr-1 scrollbar-thin">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4 font-black text-slate-600 text-xs uppercase tracking-wider rounded-tl-xl rounded-bl-xl border-b border-slate-200">STT</th>
                    <th className="py-3 px-4 font-black text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">Tên Lớp Học</th>
                    <th className="py-3 px-4 font-black text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">Giáo Viên Chủ Nhiệm</th>
                    <th className="py-3 px-4 font-black text-slate-600 text-xs uppercase tracking-wider text-right rounded-tr-xl rounded-br-xl border-b border-slate-200">Sĩ Số</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statsHomeroomClasses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 font-medium italic text-sm">
                        Chưa có dữ liệu lớp học chủ nhiệm.
                      </td>
                    </tr>
                  ) : (
                    statsHomeroomClasses.map((c, idx) => {
                      const num = students.filter(s => s.classId === c.id).length;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 text-slate-500 font-bold text-xs">
                            {(idx + 1).toString().padStart(2, '0')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shadow-xs" style={{ backgroundColor: c.color || '#3B82F6' }} />
                              <span className="font-bold text-indigo-700">Lớp {c.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <User className="w-3 h-3" />
                              </div>
                              <span className="font-semibold text-slate-700">{c.teacherName || 'Chưa phân công'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-black text-xs">
                              {num} Học Sinh
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="pt-4 pb-2 mt-2 border-t border-slate-100 flex flex-wrap justify-between items-center gap-2 shrink-0">
              <div className="text-xs font-bold text-slate-500">
                Tổng số lớp: <span className="text-indigo-600">{statsHomeroomClasses.length}</span>
                {statsHomeroomClasses.length !== allSchoolHomeroomClasses.length && (
                  <span className="text-slate-400 font-normal"> / {allSchoolHomeroomClasses.length} toàn trường</span>
                )}
              </div>
              <div className="text-sm font-black text-slate-800">
                {statsHomeroomClasses.length !== allSchoolHomeroomClasses.length ? (
                  <>
                    Đang hiển thị: <span className="text-indigo-600">{statsTotalStudents} Em</span> • Toàn trường: <span className="text-emerald-600">{totalSchoolStudentsCount} Em</span>
                  </>
                ) : (
                  <>
                    Tổng số học sinh toàn trường: <span className="text-emerald-600">{totalSchoolStudentsCount} Em</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
