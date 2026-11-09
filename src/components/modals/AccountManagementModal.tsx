import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, Users, UserPlus, KeyRound, Trash2, Edit3, ShieldAlert,
  Database, Download, Upload, CheckCircle2, AlertCircle, RefreshCw, 
  School, Laptop, Check, Search, ShieldCheck, FileSpreadsheet,
  FileUp, ArrowDownToLine, AlertTriangle, Sparkles, History, Eye, EyeOff, Copy,
  Activity, Calendar, Clock, Filter, RotateCcw, GitBranch,
  FolderTree, Building2, Plus, Crown, ArrowRightLeft, FileText,
  ArrowUpDown, Layers, ArrowDownAZ, ArrowUpAZ, GraduationCap, SlidersHorizontal, LogIn, MapPin, Lock
} from 'lucide-react';
import { UserAccount, UserRole, SchoolEntity } from '../../types';
import { databaseService, DatabaseStats, AuditLogItem, UserSummaryItem } from '../../services/databaseService';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';
import { useClassroom } from '../../context/ClassroomContext';

interface AccountManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  allUsers: UserAccount[];
  onRefreshUsers: () => void;
  onSwitchToUser: (username: string) => Promise<boolean>;
}

export const AccountManagementModal: React.FC<AccountManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  onRefreshUsers,
  onSwitchToUser
}) => {
  const { setIsGithubModalOpen } = useClassroom();
  const [activeTab, setActiveTab] = useState<'accounts' | 'schools' | 'add' | 'import' | 'real_data' | 'logs' | 'database' | 'registrations'>('accounts');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 🎯 QUYỀN HẠN PHÂN CẤP 3 NHÓM CHÍNH (Yêu cầu e, c, d)
  // Tài khoản tải từ Drive có thể không có id → dùng tên đăng nhập làm khóa
  const uidOf = (u?: { id?: string; username?: string } | null) => (u ? u.id || u.username || '' : '');
  const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.username?.toLowerCase() === 'adminquantri';
  const isSchoolAdmin = currentUser?.role === 'school_admin' || Boolean(currentUser?.isSchoolAdmin) || currentUser?.role === 'bgh' || Boolean(currentUser?.isBgh);
  const isGuestAdmin = !isSuperAdmin && (currentUser?.role === 'guest_admin' || Boolean(currentUser?.isGuestAdmin) || currentUser?.username?.toLowerCase() === 'admin');
  const currentSchoolScope = currentUser?.schoolName || 'TRƯỜNG HỌC HẠNH PHÚC';

  // Lựa chọn nhánh quản trị hiển thị (Nhánh 1: Trường học | Nhánh 2: GV Cá nhân)
  const [selectedAdminBranch, setSelectedAdminBranch] = useState<'branch1' | 'branch2'>('branch1');

  // Quản lý CSDL Trường Học
  const [schoolsList, setSchoolsList] = useState<SchoolEntity[]>([]);
  const [editingSchool, setEditingSchool] = useState<SchoolEntity | null>(null);
  const [schoolModalOpen, setSchoolModalOpen] = useState(false);
  const [schoolFormData, setSchoolFormData] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    adminUsername: '',
    adminPassword: '123456',
    adminFullName: ''
  });
  const [showSchoolPassword, setShowSchoolPassword] = useState(false);
  const [createAdminAccount, setCreateAdminAccount] = useState(false);
  const [provisionedSchoolInfo, setProvisionedSchoolInfo] = useState<{
    schoolName: string;
    code: string;
    username: string;
    password?: string;
    fullName: string;
  } | null>(null);

  // 🏛️ Modal cấp nhanh tài khoản BGH cho trường chưa có tài khoản
  const [provisionModalOpen, setProvisionModalOpen] = useState(false);
  const [provisioningSchool, setProvisioningSchool] = useState<SchoolEntity | null>(null);
  const [provisionFormData, setProvisionFormData] = useState({ adminUsername: '', adminPassword: '123456', adminFullName: '' });
  const [showProvisionPassword, setShowProvisionPassword] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionedResult, setProvisionedResult] = useState<{
    schoolName: string; code: string; username: string; password?: string; fullName: string;
  } | null>(null);

  // Tenant categorization filter: Trường học vs Giáo viên vãng lai vs Demo
  const [tenantFilter, setTenantFilter] = useState<string>('all');

  // 🏷️ Bộ lọc tài khoản mới (Khối & Vai trò)
  const [gradeFilter, setGradeFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5' | 'other'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'homeroom' | 'subject' | 'bgh' | 'admin'>('all');

  // 🔀 Tùy chọn sắp xếp tài khoản (Theo khối, theo lớp, họ tên, ngày tạo)
  const [sortBy, setSortBy] = useState<'grade_class_asc' | 'grade_class_desc' | 'name_asc' | 'name_desc' | 'created_desc'>('grade_class_asc');

  // Academic Year Reset states
  const [schoolResetModalOpen, setSchoolResetModalOpen] = useState(false);
  const [schoolResetMode, setSchoolResetMode] = useState<'keep_teachers' | 'full'>('keep_teachers');
  const [targetResetScope, setTargetResetScope] = useState<'school' | 'guest'>('school');
  const [selectedResetSchoolName, setSelectedResetSchoolName] = useState<string>(currentSchoolScope);
  const [schoolResetConfirmCode, setSchoolResetConfirmCode] = useState('');
  const [isResettingSchool, setIsResettingSchool] = useState(false);
  const [deletingSchoolId, setDeletingSchoolId] = useState<string | null>(null);

  // 🗑️ State cho Modal xác nhận xóa trường học & người dùng (UI cao cấp)
  const [schoolToDelete, setSchoolToDelete] = useState<SchoolEntity | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);

  // 🚀 DI CHUYỂN TOÀN BỘ CSDL GIÁO VIÊN VÃNG LAI VÀO NHÀ TRƯỜNG (SUPER ADMIN)
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [userToTransfer, setUserToTransfer] = useState<UserAccount | null>(null);
  const [targetSchoolName, setTargetSchoolName] = useState<string>('');
  const [customSchoolName, setCustomSchoolName] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Registrations state
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [currentRejectId, setCurrentRejectId] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');

  const [editRegistrationModalOpen, setEditRegistrationModalOpen] = useState(false);
  const [currentEditReg, setCurrentEditReg] = useState<any>(null);
  const [editRegStatus, setEditRegStatus] = useState<'approved' | 'rejected'>('rejected');
  const [editRegNote, setEditRegNote] = useState<string>('');

  // Real data state
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSummaries, setUserSummaries] = useState<UserSummaryItem[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedLogUser, setSelectedLogUser] = useState<string>('ALL');
  const [selectedLogAction, setSelectedLogAction] = useState<string>('ALL');
  const [logSearchTerm, setLogSearchTerm] = useState<string>('');

  // Gán mật khẩu chung cho nhiều tài khoản
  const [bulkPwOpen, setBulkPwOpen] = useState(false);
  const [bulkPwScope, setBulkPwScope] = useState<'selected' | 'all'>('selected');
  const [bulkPw, setBulkPw] = useState('');
  const [bulkPw2, setBulkPw2] = useState('');
  const [bulkPwShow, setBulkPwShow] = useState(false);
  const [bulkPwDone, setBulkPwDone] = useState<{ users: UserAccount[]; password: string } | null>(null);
  // Nhập Excel: dùng 1 mật khẩu chung cho mọi tài khoản trong tệp
  const [importUseCommonPw, setImportUseCommonPw] = useState(false);
  const [importCommonPw, setImportCommonPw] = useState('');

  // Bulk import preview state
  const [importPreviewList, setImportPreviewList] = useState<Array<{
    stt: number;
    username: string;
    password?: string;
    fullName: string;
    role: UserRole;
    assignedClassName?: string;
    subjectName?: string;
    phone?: string;
    email?: string;
    schoolName?: string;
    statusText: string;
    isValid: boolean;
  }>>([]);

  // Form states for creating / editing user
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    role: 'homeroom' as UserRole,
    phone: '',
    email: '',
    assignedClassName: '4A1',
    subjectName: 'Tin học',
    schoolName: 'TRƯỜNG HỌC HẠNH PHÚC',
    tenantType: 'school' as 'school' | 'guest' | 'demo'
  });

  const [localUsage, setLocalUsage] = useState<{ bytes: number; sizeKB: number; formatted: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSchools();
      loadStats();
      onRefreshUsers();
      loadSummaries();
      loadAuditLogs();
      loadRegistrations();
      setLocalUsage(databaseService.getLocalStorageUsage());
    }
  }, [isOpen]);

  const loadSchools = async () => {
    try {
      const list = await databaseService.getSchools();
      if (Array.isArray(list)) {
        setSchoolsList(list);
      }
    } catch (_) {}
  };

  const loadStats = async () => {
    try {
      const s = await databaseService.getDatabaseStats();
      if (s) setStats(s);
    } catch (_) {}
  };

  const loadSummaries = async () => {
    setLoadingSummaries(true);
    try {
      const data = await databaseService.getUserDataSummaries();
      setUserSummaries(data);
    } catch (_) {}
    finally {
      setLoadingSummaries(false);
    }
  };

  const loadAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const logs = await databaseService.getAuditLogs({
        username: selectedLogUser !== 'ALL' ? selectedLogUser : undefined,
        actionType: selectedLogAction !== 'ALL' ? selectedLogAction : undefined,
        limit: 300
      });
      setAuditLogs(logs);
    } catch (_) {}
    finally {
      setLoadingLogs(false);
    }
  };

  const loadRegistrations = async () => {
    setLoadingRegistrations(true);
    try {
      const data = await databaseService.getRegistrations();
      if (Array.isArray(data)) setRegistrations(data);
    } catch (_) {}
    finally {
      setLoadingRegistrations(false);
    }
  };

  const handleApproveRegistration = async (reg: any) => {
    try {
      const res = await databaseService.updateRegistrationStatus(reg.id, 'approved');
      if (res.success) {
        showNotify('success', 'Đã duyệt đơn đăng ký!');
        loadRegistrations();
        
        // Chuyển luôn đến giao diện khởi tạo tài khoản csdl database cho nhà trường
        setActiveTab('schools');
        const schoolNameVal = reg.schoolName || reg.organization || '';
        const slugCode = schoolNameVal
          ? 'TH_' + schoolNameVal.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()
          : '';
        const slugUser = slugCode ? `bgh_${slugCode.slice(3).toLowerCase()}` : '';

        setSchoolFormData({
          name: schoolNameVal,
          code: slugCode,
          address: '',
          phone: reg.phone || '',
          adminUsername: slugUser,
          adminPassword: '123456',
          adminFullName: schoolNameVal ? `Ban Giám Hiệu ${schoolNameVal}` : ''
        });
        setSchoolModalOpen(true);
      } else {
        showNotify('error', res.message || 'Lỗi khi duyệt.');
      }
    } catch (_) {
      showNotify('error', 'Lỗi khi cập nhật trạng thái.');
    }
  };

  const handleOpenRejectModal = (id: string) => {
    setCurrentRejectId(id);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      showNotify('error', 'Vui lòng nhập lý do không duyệt.');
      return;
    }
    setLoadingRegistrations(true);
    try {
      const res = await databaseService.updateRegistrationStatus(currentRejectId, 'rejected', rejectReason);
      if (res.success) {
        showNotify('success', 'Đã từ chối đơn đăng ký.');
        setRejectModalOpen(false);
        loadRegistrations();
      } else {
        showNotify('error', res.message || 'Lỗi khi từ chối.');
      }
    } catch (_) {
      showNotify('error', 'Lỗi khi cập nhật trạng thái.');
    } finally {
      setLoadingRegistrations(false);
    }
  };

  const handleOpenEditRegistrationModal = (reg: any) => {
    setCurrentEditReg(reg);
    setEditRegStatus(reg.status === 'approved' ? 'approved' : 'rejected');
    setEditRegNote(reg.rejectReason || '');
    setEditRegistrationModalOpen(true);
  };

  const handleConfirmEditRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEditReg) return;
    setLoadingRegistrations(true);
    try {
      const res = await databaseService.updateRegistrationStatus(currentEditReg.id, editRegStatus, editRegNote);
      if (res.success) {
        showNotify('success', 'Cập nhật đơn đăng ký thành công.');
        setEditRegistrationModalOpen(false);
        loadRegistrations();
      } else {
        showNotify('error', res.message || 'Lỗi khi cập nhật.');
      }
    } catch (_) {
      showNotify('error', 'Lỗi khi cập nhật.');
    } finally {
      setLoadingRegistrations(false);
    }
  };

  const handleDeleteRegistration = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa đơn đăng ký này?')) return;
    setLoadingRegistrations(true);
    try {
      const res = await databaseService.deleteRegistration(id);
      if (res.success) {
        showNotify('success', 'Đã xóa đơn đăng ký.');
        loadRegistrations();
      } else {
        showNotify('error', res.message || 'Lỗi khi xóa.');
      }
    } catch (_) {
      showNotify('error', 'Lỗi khi xóa.');
    } finally {
      setLoadingRegistrations(false);
    }
  };
  const handleCompactDatabase = async () => {
    setLoading(true);
    try {
      const res = await databaseService.compactDatabase();
      if (res.success) {
        showNotify('success', res.message || 'Đã nén và tối ưu hóa database thành công!');
        if (res.stats) setStats(res.stats);
        setLocalUsage(databaseService.getLocalStorageUsage());
      } else {
        showNotify('error', res.message || 'Lỗi khi tối ưu hóa database.');
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi kết nối.');
    } finally {
      setLoading(false);
    }
  };

  const handleSchoolNameChange = (nameVal: string) => {
    if (editingSchool) {
      setSchoolFormData(prev => ({ ...prev, name: nameVal }));
      return;
    }
    // Gợi ý mã trường từ tên trường
    const slug = nameVal
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .trim();
    const words = slug.split(/\s+/).filter(Boolean);
    const letters = words.map(w => w[0]).join('');
    const suggestedCode = letters ? `TH_${letters}`.slice(0, 10) : '';

    setSchoolFormData(prev => ({
      ...prev,
      name: nameVal,
      code: prev.code ? prev.code : suggestedCode
    }));
  };

  const handleStartCreateSchool = () => {
    setEditingSchool(null);
    setProvisionedSchoolInfo(null);
    setCreateAdminAccount(false);
    setSchoolFormData({
      name: '',
      code: '',
      address: '',
      phone: '',
      adminUsername: '',
      adminPassword: '123456',
      adminFullName: ''
    });
    setSchoolModalOpen(true);
  };

  const handleOpenProvisionModal = (school: SchoolEntity) => {
    setProvisioningSchool(school);
    setProvisionedResult(null);
    const suggestedUser = school.code
      ? `bgh_${school.code.replace('TH_', '').toLowerCase()}`
      : `bgh_${school.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase()}`;
    setProvisionFormData({
      adminUsername: suggestedUser,
      adminPassword: '123456',
      adminFullName: `Ban Giám Hiệu ${school.name}`
    });
    setShowProvisionPassword(false);
    setProvisionModalOpen(true);
  };

  const handleProvisionAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provisioningSchool) return;
    if (!provisionFormData.adminUsername.trim()) {
      showNotify('error', 'Vui lòng nhập tên đăng nhập cho tài khoản BGH.');
      return;
    }
    setIsProvisioning(true);
    try {
      const res = await databaseService.provisionSchoolAdmin(provisioningSchool.id, {
        adminUsername: provisionFormData.adminUsername.trim().toLowerCase(),
        adminPassword: provisionFormData.adminPassword.trim() || '123456',
        adminFullName: provisionFormData.adminFullName.trim() || `Ban Giám Hiệu ${provisioningSchool.name}`
      });
      if (res.success) {
        setProvisionedResult({
          schoolName: provisioningSchool.name,
          code: provisioningSchool.code,
          username: provisionFormData.adminUsername.trim().toLowerCase(),
          password: provisionFormData.adminPassword.trim() || '123456',
          fullName: provisionFormData.adminFullName.trim() || `Ban Giám Hiệu ${provisioningSchool.name}`
        });
        showNotify('success', res.message || 'Đã cấp tài khoản BGH thành công!');
        loadSchools();
        onRefreshUsers();
      } else {
        showNotify('error', res.message || 'Không thể cấp tài khoản BGH.');
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi khi cấp tài khoản BGH.');
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleStartCreateGuestTeacher = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '123',
      fullName: '',
      role: 'homeroom',
      phone: '',
      email: '',
      assignedClassName: 'Lớp Tự Do',
      subjectName: 'Toán, Tiếng Việt',
      schoolName: 'Giáo Viên Cá Nhân',
      tenantType: 'guest'
    });
    setActiveTab('add');
  };

  const handleStartEditSchool = (school: SchoolEntity) => {
    setEditingSchool(school);
    setProvisionedSchoolInfo(null);
    setSchoolFormData({
      name: school.name,
      code: school.code,
      address: school.address || '',
      phone: school.phone || '',
      adminUsername: school.adminUsername || '',
      adminPassword: '',
      adminFullName: school.adminFullName || ''
    });
    setSchoolModalOpen(true);
  };

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolFormData.name.trim()) {
      showNotify('error', 'Vui lòng nhập tên trường học.');
      return;
    }
    if (!schoolFormData.code.trim()) {
      showNotify('error', 'Vui lòng nhập mã trường học.');
      return;
    }
    if (createAdminAccount && !editingSchool) {
      if (!schoolFormData.adminUsername.trim()) {
        showNotify('error', 'Vui lòng nhập tên đăng nhập cho tài khoản Quản trị BGH.');
        return;
      }
    }
    setLoading(true);
    try {
      if (editingSchool) {
        const res = await databaseService.updateSchool(editingSchool.id, schoolFormData);
        if (res.success) {
          showNotify('success', 'Đã cập nhật thông tin CSDL trường thành công!');
          setSchoolModalOpen(false);
          loadSchools();
          onRefreshUsers();
        } else {
          showNotify('error', res.message || 'Không thể cập nhật trường.');
        }
      } else {
        const res = await databaseService.createSchool({ ...schoolFormData, createAccount: createAdminAccount });
        if (res.success) {
          if (createAdminAccount && res.adminAccount) {
            setProvisionedSchoolInfo({
              schoolName: schoolFormData.name,
              code: schoolFormData.code,
              username: res.adminAccount.username,
              password: res.adminAccount.password,
              fullName: res.adminAccount.fullName
            });
            showNotify('success', `Đã khởi tạo CSDL & cấp tài khoản BGH cho trường "${schoolFormData.name}" thành công!`);
          } else {
            showNotify('success', `Đã khởi tạo cơ sở dữ liệu trường "${schoolFormData.name}" thành công! Chưa cấp tài khoản BGH.`);
            setSchoolModalOpen(false);
          }
          loadSchools();
          onRefreshUsers();
        } else {
          showNotify('error', res.message || 'Không thể tạo trường mới.');
        }
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi khi lưu thông tin CSDL trường.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeleteSchool = async () => {
    if (!schoolToDelete) return;
    const school = schoolToDelete;
    setDeletingSchoolId(school.id);
    setLoading(true);

    try {
      // Gọi thuật toán Xóa liên đới có lập trình (Programmatic Cascade Delete)
      const res = await databaseService.deleteSchool(school.id, school.name);
      if (res && res.success) {
        showNotify('success', res.message || `Đã dọn dẹp liên đới và xóa sạch CSDL trường "${school.name}" thành công.`);
        setSchoolToDelete(null);
        await loadSchools();
        await onRefreshUsers();
        await loadStats();
        await loadSummaries();
      } else {
        const errorDetail = res?.message || 'Không thể xóa CSDL trường học.';
        console.error('Lỗi quy trình xóa trường học:', errorDetail);
        showNotify('error', errorDetail);
      }
    } catch (err: any) {
      console.error('Chi tiết lỗi ngoại lệ khi xóa CSDL trường học:', err);
      showNotify('error', err?.message || 'Có lỗi xảy ra trong quá trình dọn dẹp dữ liệu trường học.');
    } finally {
      setDeletingSchoolId(null);
      setLoading(false);
    }
  };

  const handleDeleteSchool = (school: SchoolEntity) => {
    setSchoolToDelete(school);
  };

  const handleExecuteResetSchool = async () => {
    if (schoolResetConfirmCode.trim().toUpperCase() !== 'DONG Y XOA') {
      showNotify('error', 'Vui lòng gõ chính xác cụm từ "DONG Y XOA" để xác nhận.');
      return;
    }

    setIsResettingSchool(true);
    try {
      const scope = isGuestAdmin ? 'guest' : (isSchoolAdmin ? 'school' : targetResetScope);
      const targetSchool = scope === 'school' ? (isSchoolAdmin ? currentSchoolScope : selectedResetSchoolName) : '';
      const res = await databaseService.resetSchoolAcademicYear(targetSchool, schoolResetMode, scope);
      if (res.success) {
        showNotify('success', res.message || 'Đã dọn dẹp dữ liệu năm học thành công!');
        setSchoolResetModalOpen(false);
        setSchoolResetConfirmCode('');
        onRefreshUsers();
        loadStats();
        loadSummaries();
      } else {
        showNotify('error', res.message || 'Không thể dọn dẹp dữ liệu năm học.');
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi kết nối khi dọn dẹp dữ liệu.');
    } finally {
      setIsResettingSchool(false);
    }
  };

  // 🚀 Mở hộp thoại Di chuyển CSDL Giáo viên vào Nhà trường (Super Admin)
  const handleOpenTransferModal = (user: UserAccount) => {
    setUserToTransfer(user);
    const defaultTarget = schoolsList[0]?.name || 'TRƯỜNG HỌC HẠNH PHÚC';
    setTargetSchoolName(defaultTarget);
    setCustomSchoolName('');
    setTransferModalOpen(true);
  };

  // 🚀 Thực thi di chuyển CSDL & phân vùng sang Nhà trường
  const handleConfirmTransfer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userToTransfer) return;
    const finalSchoolName = targetSchoolName === '__custom__' ? customSchoolName.trim() : targetSchoolName.trim();
    if (!finalSchoolName) {
      showNotify('error', 'Vui lòng chọn hoặc nhập tên trường học cần gán.');
      return;
    }

    setIsTransferring(true);
    try {
      const res = await databaseService.transferUserToSchool(userToTransfer.id, finalSchoolName);
      if (res.success) {
        showNotify('success', res.message || `Đã di chuyển thành công cô giáo "${userToTransfer.fullName}" sang trường "${finalSchoolName}"!`);
        setTransferModalOpen(false);
        setUserToTransfer(null);
        onRefreshUsers();
        loadStats();
        loadSummaries();
      } else {
        showNotify('error', res.message || 'Không thể di chuyển tài khoản vào trường.');
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi kết nối khi di chuyển tài khoản.');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleExportScoped = async (scope: 'school' | 'guest' | 'all') => {
    try {
      const targetSchool = scope === 'school' ? currentSchoolScope : '';
      const json = await databaseService.exportScopedData(scope, targetSchool);
      if (!json) {
        showNotify('error', 'Không thể trích xuất dữ liệu.');
        return;
      }
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filenameScope = scope === 'guest' ? 'giao_vien_ca_nhan' : (targetSchool ? targetSchool.replace(/[^a-zA-Z0-9]/g, '_') : 'toan_he_thong');
      link.download = `data_${filenameScope}_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showNotify('success', 'Đã tải về tệp Data JSON thành công!');
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi khi tải file JSON.');
    }
  };

  const handleImportScoped = (e: React.ChangeEvent<HTMLInputElement>, scope: 'school' | 'guest' | 'all') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        setLoading(true);
        const targetSchool = scope === 'school' ? currentSchoolScope : '';
        const res = await databaseService.importScopedData(json, scope, targetSchool);
        if (res.success) {
          showNotify('success', res.message || 'Đã nạp file Data JSON thành công!');
          onRefreshUsers();
          loadStats();
          loadSummaries();
        } else {
          showNotify('error', res.message || 'Lỗi nạp file JSON.');
        }
      } catch (err: any) {
        showNotify('error', 'Tệp tin không đúng định dạng JSON.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử thao tác không?')) return;
    const ok = await databaseService.clearAuditLogs();
    if (ok) {
      setAuditLogs([]);
      showNotify('success', 'Đã xóa toàn bộ lịch sử thao tác hệ thống!');
    } else {
      showNotify('error', 'Không thể xóa lịch sử thao tác.');
    }
  };

  const handleDownloadTeacherData = async (u: UserAccount | UserSummaryItem | any) => {
    try {
      const data = await databaseService.loadUserData(u.username);
      if (!data) {
        showNotify('error', `Tài khoản ${u.username} chưa có dữ liệu riêng.`);
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Du_Lieu_${u.username}_${u.role}_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showNotify('success', `Đã tải xuống file JSON dữ liệu thực tế của ${u.fullName}!`);
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi khi tải dữ liệu.');
    }
  };

  // 🔒 Bản web (CSDL trên Drive): mật khẩu được băm trên Drive, chỉ hiện mật khẩu vừa cấp trong phiên này
  const displayPassword = (u: UserAccount): string =>
    schoolDriveDbService.getIssuedPassword(u.username) || u.password ||
    (schoolDriveDbService.isConfigured()
      ? (schoolDriveDbService.hasAdminSession() ? '•••••• (đang tải...)' : '•••••• (đăng nhập lại để xem)')
      : '••••••');

  // 🏫 Thông báo khi tài khoản / trường được lưu lên CSDL nhà trường trên Google Drive
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = schoolDriveDbService.subscribeSync(s => {
      if (s.status === 'success') {
        setNotification({ type: 'success', message: `☁️ ${s.message || 'Đã lưu lên Google Drive.'}` });
        onRefreshUsers();
      } else if (s.status === 'error') {
        setNotification({ type: 'error', message: `☁️ Chưa lưu được lên Google Drive: ${s.message || ''}` });
      }
    });
    return () => { unsubscribe(); };
  }, [isOpen]);

  // 🔄 Quản trị: tải tài khoản + mật khẩu hiện tại từ CSDL nhà trường trên Drive khi mở bảng và
  // mỗi 30 giây — giáo viên / BGH tự đổi mật khẩu thì bảng hiển thị đúng mật khẩu mới.
  const [, setDrivePasswordTick] = useState(0);
  useEffect(() => {
    if (!isOpen || !schoolDriveDbService.isConfigured() || !schoolDriveDbService.hasAdminSession()) return;
    let cancelled = false;
    const pull = async () => {
      const res = await schoolDriveDbService.pullForAdmin();
      if (!cancelled && res.success) {
        onRefreshUsers();
        setDrivePasswordTick(t => t + 1);
      }
    };
    pull();
    const timer = setInterval(pull, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [isOpen]);

  // Cho phép Quản trị tối cao, Quản trị nhà trường và Ban giám hiệu mở bảng điều khiển
  if (!isOpen) return null;

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleStartCreate = () => {
    setEditingUser(null);
    const defaultSchool = isSchoolAdmin ? currentSchoolScope : (schoolsList[0]?.name || 'TRƯỜNG HỌC HẠNH PHÚC');
    const defaultTenant = isGuestAdmin ? 'guest' : 'school';
    setFormData({
      username: '',
      password: '123456',
      fullName: '',
      role: 'homeroom',
      phone: '',
      email: '',
      assignedClassName: '4A1',
      subjectName: 'Tin học',
      schoolName: isGuestAdmin ? 'Giáo Viên Cá Nhân' : defaultSchool,
      tenantType: defaultTenant
    });
    setActiveTab('add');
  };

  const handleStartEdit = (user: UserAccount) => {
    if (isSchoolAdmin && (user.schoolName !== currentSchoolScope || user.role === 'admin' || user.isGuestAdmin)) {
      showNotify('error', 'Bạn chỉ có quyền chỉnh sửa tài khoản thuộc trường của mình.');
      return;
    }
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      fullName: user.fullName,
      role: user.role,
      phone: user.phone || '',
      email: user.email || '',
      assignedClassName: user.assignedClassName || '4A1',
      subjectName: user.subjectName || 'Tin học',
      schoolName: user.schoolName || (schoolsList[0]?.name || 'TRƯỜNG HỌC HẠNH PHÚC'),
      tenantType: user.tenantType || 'school'
    });
    setActiveTab('add');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim()) {
      showNotify('error', 'Vui lòng nhập họ và tên giáo viên.');
      return;
    }

    const finalSchoolName = isSchoolAdmin ? currentSchoolScope : formData.schoolName;

    setLoading(true);
    try {
      if (editingUser) {
        // Update user
        const res = await databaseService.updateUser(editingUser.id, {
          username: isSuperAdmin && formData.username.trim() ? formData.username.trim() : undefined,
          fullName: formData.fullName.trim(),
          role: formData.role,
          phone: formData.phone,
          email: formData.email,
          assignedClassName: formData.assignedClassName,
          subjectName: formData.subjectName,
          schoolName: finalSchoolName,
          tenantType: isSchoolAdmin ? 'school' : formData.tenantType
        });
        if (res.success) {
          showNotify('success', 'Đã cập nhật thông tin tài khoản thành công!');
          setLoading(false);
          await onRefreshUsers();
          setActiveTab('accounts');
        } else {
          showNotify('error', res.message || 'Không thể cập nhật tài khoản.');
        }
      } else {
        // Create user
        if (!formData.username.trim()) {
          showNotify('error', 'Vui lòng nhập tên đăng nhập.');
          setLoading(false);
          return;
        }
        const res = await databaseService.createUser({
          username: formData.username.trim(),
          password: formData.password || '123456',
          fullName: formData.fullName.trim(),
          role: formData.role,
          phone: formData.phone,
          email: formData.email,
          assignedClassName: formData.assignedClassName,
          subjectName: formData.subjectName,
          schoolName: finalSchoolName,
          tenantType: isSchoolAdmin ? 'school' : formData.tenantType
        });
        if (res.success) {
          showNotify('success', `Đã thêm tài khoản "${formData.username}" thành công!`);
          setLoading(false);
          await onRefreshUsers();
          setTenantFilter('all');
          setSearchTerm('');
          setActiveTab('accounts');
        } else {
          showNotify('error', res.message || 'Không thể tạo tài khoản.');
        }
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi kết nối khi lưu tài khoản.');
    } finally {
      setLoading(false);
      loadStats().catch(() => {});
      loadSummaries().catch(() => {});
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    const user = userToDelete;
    setLoading(true);
    try {
      const res = await databaseService.deleteUser(uidOf(user));
      if (res && res.success) {
        showNotify('success', `Đã xóa tài khoản "${user.username}" khỏi hệ thống.`);
        setUserToDelete(null);
        await onRefreshUsers();
        await loadStats();
        await loadSummaries();
      } else {
        showNotify('error', res?.message || 'Không thể xóa tài khoản.');
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi khi xóa tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllUsers = () => {
    const selectableUsers = filteredUsers.filter(u => !(u.role === 'admin' || u.username.toLowerCase() === 'adminquantri'));
    if (selectedUserIds.length === selectableUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(selectableUsers.map(u => uidOf(u)));
    }
  };

  const handleBulkDeleteUsers = async () => {
    if (selectedUserIds.length === 0) return;
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa ${selectedUserIds.length} tài khoản giáo viên đã chọn khỏi hệ thống? Dữ liệu của các tài khoản này sẽ bị mất.`
    );
    if (!confirmed) return;

    setLoading(true);
    let successCount = 0;
    try {
      for (const id of selectedUserIds) {
        const res = await databaseService.deleteUser(id);
        if (res && res.success) successCount++;
      }
      showNotify('success', `Đã xóa thành công ${successCount}/${selectedUserIds.length} tài khoản.`);
      setSelectedUserIds([]);
      await onRefreshUsers();
      await loadStats();
      await loadSummaries();
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi khi xóa hàng loạt tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = (user: UserAccount) => {
    if (user.role === 'admin' || user.username.toLowerCase() === 'adminquantri') {
      showNotify('error', 'Không được phép xóa tài khoản quản trị tối cao.');
      return;
    }
    if (isSchoolAdmin && (user.schoolName !== currentSchoolScope || user.isGuestAdmin)) {
      showNotify('error', 'Bạn chỉ có quyền xóa tài khoản giáo viên thuộc trường của mình.');
      return;
    }
    setUserToDelete(user);
  };

  const handleResetPassword = async (user: UserAccount) => {
    if (user.role === 'admin' || user.username.toLowerCase() === 'adminquantri') {
      if (!isSuperAdmin) {
        showNotify('error', 'Chỉ Quản trị tối cao mới có thể đặt lại mật khẩu cho tài khoản này.');
        return;
      }
    }
    if (isSchoolAdmin && (user.schoolName !== currentSchoolScope || user.isGuestAdmin)) {
      showNotify('error', 'Bạn chỉ có quyền đổi mật khẩu cho tài khoản thuộc trường của mình.');
      return;
    }

    const newPass = window.prompt(`Nhập mật khẩu mới cho tài khoản "${user.username}":`, '123456');
    if (!newPass) return;

    setLoading(true);
    try {
      const res = await databaseService.resetPassword(uidOf(user), newPass);
      if (res.success) {
        showNotify('success', res.message || `Đã đặt lại mật khẩu cho ${user.username} thành công!`);
      } else {
        showNotify('error', res.message || 'Không thể đặt lại mật khẩu.');
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi khi đặt lại mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  /** Mật khẩu hợp lệ: 6–32 ký tự, không có khoảng trắng */
  const passwordProblem = (pw: string) => (!pw ? 'Chưa nhập mật khẩu.' : pw.length < 6 ? 'Mật khẩu cần ít nhất 6 ký tự.' : pw.length > 32 ? 'Mật khẩu tối đa 32 ký tự.' : /\s/.test(pw) ? 'Mật khẩu không được có khoảng trắng.' : '');

  /** Tài khoản được phép gán mật khẩu (bỏ Quản trị tối cao, chính mình; Quản trị trường chỉ trong trường mình) */
  const canAssignPasswordTo = (u: UserAccount) => {
    if (u.username.toLowerCase() === 'adminquantri') return false;
    if (currentUser?.username && u.username.toLowerCase() === currentUser.username.toLowerCase()) return false;
    if (u.role === 'admin' && !isSuperAdmin) return false;
    if (isSchoolAdmin && !isSuperAdmin && (u.schoolName !== currentSchoolScope || u.isGuestAdmin)) return false;
    return true;
  };

  const openBulkPassword = () => {
    setBulkPwScope(selectedUserIds.length > 0 ? 'selected' : 'all');
    setBulkPw(''); setBulkPw2(''); setBulkPwShow(false); setBulkPwDone(null);
    setBulkPwOpen(true);
  };

  const getBulkPwTargets = () => (bulkPwScope === 'selected' ? filteredUsers.filter(u => selectedUserIds.includes(uidOf(u))) : filteredUsers).filter(canAssignPasswordTo);

  const handleBulkAssignPassword = async () => {
    const problem = passwordProblem(bulkPw) || (bulkPw !== bulkPw2 ? 'Hai lần nhập mật khẩu chưa giống nhau.' : '');
    if (problem) { showNotify('error', problem); return; }
    const targets = getBulkPwTargets();
    if (targets.length === 0) { showNotify('error', 'Không có tài khoản nào được phép gán mật khẩu.'); return; }
    if (!window.confirm(`Gán mật khẩu chung cho ${targets.length} tài khoản? Mật khẩu cũ của các tài khoản này sẽ không dùng được nữa.`)) return;
    setLoading(true);
    try {
      const res = await databaseService.resetPasswordsBulk(targets.map(u => uidOf(u)), bulkPw);
      if (res.success) {
        const failed = new Set(res.failed || []);
        const okUsers = targets.filter(u => !failed.has(uidOf(u)));
        showNotify('success', res.message || `Đã gán mật khẩu chung cho ${okUsers.length} tài khoản.`);
        setBulkPwDone({ users: okUsers, password: bulkPw });
        setSelectedUserIds([]);
        Promise.resolve(onRefreshUsers()).catch(() => {});
      } else {
        showNotify('error', res.message || 'Chưa gán được mật khẩu.');
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi khi gán mật khẩu hàng loạt.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSwitch = async (username: string) => {
    if (isSchoolAdmin) {
      const targetUser = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (targetUser && (targetUser.schoolName !== currentSchoolScope || targetUser.role === 'admin' || targetUser.isGuestAdmin)) {
        showNotify('error', 'Bạn chỉ có thể truy cập không gian của giáo viên thuộc trường của mình.');
        return;
      }
    }

    setLoading(true);
    try {
      await onSwitchToUser(username);
      showNotify('success', `Đã chuyển sang không gian làm việc của: ${username}`);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      showNotify('error', err?.message || 'Không thể chuyển tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportDatabase = () => {
    databaseService.downloadDatabaseExport();
    showNotify('success', 'Đã tải xuống file cơ sở dữ liệu classroom_database.json thành công!');
  };

  const handleImportDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        setLoading(true);
        const res = await databaseService.importDatabase(json);
        if (res.success) {
          showNotify('success', 'Đã nhập cơ sở dữ liệu thành công! Đang tải lại dữ liệu...');
          onRefreshUsers();
          loadStats();
        } else {
          showNotify('error', res.message || 'Lỗi khôi phục cơ sở dữ liệu.');
        }
      } catch (err: any) {
        showNotify('error', 'Tệp tin không đúng định dạng JSON cơ sở dữ liệu.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 1. Chức năng xuất file Excel tài khoản user của giáo viên (User requirement)
  const handleExportUsersToExcel = (usersToExport: UserAccount[], fileNamePrefix: string = 'Danh_sach_tai_khoan_giao_vien') => {
    try {
      if (usersToExport.length === 0) {
        showNotify('error', 'Không có dữ liệu để xuất Excel');
        return;
      }

      const dataRows = usersToExport.map((u, idx) => ({
        'STT': idx + 1,
        'Tên đăng nhập': u.username,
        // Bản web (CSDL trên Drive): mật khẩu chỉ biết được ngay khi vừa cấp trên máy Quản trị này
        'Mật khẩu': schoolDriveDbService.getIssuedPassword(u.username) || u.password
          || (schoolDriveDbService.isConfigured() ? '(đã đổi – dùng Đặt lại mật khẩu để cấp mới)' : '123456'),
        'Họ và tên giáo viên': u.fullName,
        'Vai trò': u.role === 'admin' ? 'Quản trị viên' : u.role === 'homeroom' ? 'GV Chủ nhiệm' : 'GV Bộ môn',
        'Lớp chủ nhiệm / Môn dạy': u.role === 'homeroom' ? (u.assignedClassName || 'Chưa gán') : (u.subjectName || 'Tin học'),
        'Số điện thoại': u.phone || '',
        'Email': u.email || '',
        'Đơn vị trường học': u.schoolName || (schoolsList[0]?.name || 'TRƯỜNG HỌC HẠNH PHÚC'),
        'Trạng thái': u.status === 'locked' ? 'Tạm khóa' : 'Đang hoạt động',
        'Ngày tạo': u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : 'Mặc định'
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 12 },
        { wch: 26 },
        { wch: 18 },
        { wch: 24 },
        { wch: 15 },
        { wch: 26 },
        { wch: 32 },
        { wch: 16 },
        { wch: 16 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'TaiKhoanGiaoVien');

      const fileName = `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      showNotify('success', `Đã xuất thành công danh sách ${usersToExport.length} tài khoản giáo viên ra file Excel!`);
    } catch (err: any) {
      showNotify('error', err?.message || 'Có lỗi xảy ra khi xuất file Excel tài khoản.');
    }
  };

  // 2. Chức năng tải biểu mẫu Excel mẫu để nhập đồng loạt
  const handleDownloadTemplate = () => {
    try {
      const sampleSchool = schoolsList[0]?.name || 'TRƯỜNG HỌC HẠNH PHÚC';
      const templateRows = [
        {
          'STT': 1,
          'Tên đăng nhập': 'gvcn_1a1',
          'Mật khẩu': '123456',
          'Họ và tên giáo viên': 'Cô Nguyễn Văn A',
          'Vai trò (GVCN hoặc GVBM)': 'GV Chủ nhiệm',
          'Lớp chủ nhiệm / Môn giảng dạy': '1A1',
          'Số điện thoại': '0912345671',
          'Email': 'co.lan@truong.edu.vn',
          'Đơn vị trường học': sampleSchool
        },
        {
          'STT': 2,
          'Tên đăng nhập': 'gvcn_2a1',
          'Mật khẩu': '123456',
          'Họ và tên giáo viên': 'Thầy Trần Thị B',
          'Vai trò (GVCN hoặc GVBM)': 'GV Chủ nhiệm',
          'Lớp chủ nhiệm / Môn giảng dạy': '2A1',
          'Số điện thoại': '0912345672',
          'Email': 'thay.bach@truong.edu.vn',
          'Đơn vị trường học': sampleSchool
        },
        {
          'STT': 3,
          'Tên đăng nhập': 'gvbm_anh01',
          'Mật khẩu': '123456',
          'Họ và tên giáo viên': 'Cô Lê Minh Thư',
          'Vai trò (GVCN hoặc GVBM)': 'GV Bộ môn',
          'Lớp chủ nhiệm / Môn giảng dạy': 'Tiếng Anh',
          'Số điện thoại': '0912345673',
          'Email': 'co.thu@truong.edu.vn',
          'Đơn vị trường học': sampleSchool
        },
        {
          'STT': 4,
          'Tên đăng nhập': 'gvbm_nhac01',
          'Mật khẩu': '123456',
          'Họ và tên giáo viên': 'Thầy Phạm Văn D',
          'Vai trò (GVCN hoặc GVBM)': 'GV Bộ môn',
          'Lớp chủ nhiệm / Môn giảng dạy': 'Âm nhạc',
          'Số điện thoại': '0912345674',
          'Email': 'thay.huy@truong.edu.vn',
          'Đơn vị trường học': sampleSchool
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateRows);
      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 12 },
        { wch: 24 },
        { wch: 24 },
        { wch: 28 },
        { wch: 16 },
        { wch: 26 },
        { wch: 32 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Bieu_Mau_Tai_Khoan');
      XLSX.writeFile(workbook, 'Bieu_mau_tao_tai_khoan_giao_vien.xlsx');
      showNotify('success', 'Đã tải biểu mẫu Excel thành công! Mở file và điền danh sách giáo viên.');
    } catch (err: any) {
      showNotify('error', err?.message || 'Có lỗi khi tải biểu mẫu.');
    }
  };

  // 3. Đọc và phân tích file Excel import biểu mẫu
  const handleExcelFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rawRows.length === 0) {
          showNotify('error', 'Tệp Excel không có dòng dữ liệu nào.');
          return;
        }

        const existingUsernames = new Set(allUsers.map(u => u.username.toLowerCase()));
        const batchUsernames = new Set<string>();

        const parsedAccounts = rawRows.map((row, idx) => {
          const getVal = (candidates: string[]) => {
            for (const key of Object.keys(row)) {
              const cleanKey = key.trim().toLowerCase();
              if (candidates.some(c => cleanKey.includes(c.toLowerCase()))) {
                return String(row[key]).trim();
              }
            }
            return '';
          };

          const usernameRaw = getVal(['tên đăng nhập', 'tài khoản', 'username', 'login']);
          const fullName = getVal(['họ và tên', 'họ tên', 'tên giáo viên', 'fullname', 'name']) || usernameRaw;
          const password = getVal(['mật khẩu', 'password', 'pass']) || '123456';
          const roleRaw = getVal(['vai trò', 'chức vụ', 'role']);
          const classOrSubject = getVal(['lớp', 'môn', 'phụ trách', 'bộ môn', 'chủ nhiệm']);
          const phone = getVal(['điện thoại', 'sđt', 'phone', 'mobile']);
          const email = getVal(['email', 'thư điện tử']);
          const parsedSchool = getVal(['trường', 'đơn vị', 'school']);
          const defaultSchool = isSchoolAdmin ? currentSchoolScope : (schoolsList[0]?.name || 'TRƯỜNG HỌC');
          const schoolName = isSchoolAdmin ? currentSchoolScope : (parsedSchool || defaultSchool);

          // Chuẩn hóa username: không dấu, viết thường, không khoảng cách
          const cleanUsername = usernameRaw
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'd')
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .toLowerCase();

          // Chuẩn hóa vai trò
          const roleLower = roleRaw.toLowerCase();
          const isSubject = roleLower.includes('bộ môn') || roleLower.includes('gvbm') || roleLower.includes('subject');
          const role: UserRole = isSubject ? 'subject' : 'homeroom';

          let statusText = 'Hợp lệ';
          let isValid = true;
          if (!cleanUsername || cleanUsername.length < 3) {
            statusText = 'Tên đăng nhập không hợp lệ (< 3 ký tự)';
            isValid = false;
          } else if (existingUsernames.has(cleanUsername)) {
            statusText = 'Trùng tên đăng nhập đã có';
            isValid = false;
          } else if (batchUsernames.has(cleanUsername)) {
            statusText = 'Trùng tên đăng nhập trong file';
            isValid = false;
          } else if (!fullName) {
            statusText = 'Thiếu họ và tên giáo viên';
            isValid = false;
          }

          if (isValid) {
            batchUsernames.add(cleanUsername);
          }

          return {
            stt: idx + 1,
            username: cleanUsername,
            password,
            fullName,
            role,
            assignedClassName: role === 'homeroom' ? (classOrSubject || 'Lớp mới') : undefined,
            subjectName: role === 'subject' ? (classOrSubject || 'Tin học') : undefined,
            phone,
            email,
            schoolName,
            statusText,
            isValid
          };
        });

        setImportPreviewList(parsedAccounts);
        const validCount = parsedAccounts.filter(p => p.isValid).length;
        showNotify('success', `Đã phân tích ${parsedAccounts.length} dòng: ${validCount} hợp lệ sẵn sàng tạo!`);
      } catch (err: any) {
        showNotify('error', 'Lỗi khi đọc file Excel: ' + (err?.message || 'Tệp không đúng định dạng.'));
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // 4. Xác nhận tạo đồng loạt tài khoản từ danh sách hợp lệ
  const handleConfirmBulkCreate = async () => {
    const validItems = importPreviewList.filter(item => item.isValid);
    if (validItems.length === 0) {
      showNotify('error', 'Không có tài khoản hợp lệ nào trong danh sách xem trước.');
      return;
    }

    setLoading(true);
    try {
      if (importUseCommonPw) {
        const problem = passwordProblem(importCommonPw);
        if (problem) { showNotify('error', `Mật khẩu chung: ${problem}`); setLoading(false); return; }
      }
      const payload = validItems.map(item => ({
        username: item.username,
        password: importUseCommonPw ? importCommonPw : (item.password || '123456'),
        fullName: item.fullName,
        role: item.role,
        phone: item.phone,
        email: item.email,
        assignedClassName: item.assignedClassName,
        subjectName: item.subjectName,
        schoolName: isSchoolAdmin ? currentSchoolScope : (item.schoolName || currentSchoolScope),
        tenantType: isSchoolAdmin ? ('school' as const) : ('school' as const)
      }));

      const res = await databaseService.createUsersBulk(payload);
      if (res.success) {
        showNotify('success', `Tạo thành công ${res.count} tài khoản giáo viên mới vào hệ thống!`);
        setImportPreviewList([]);
        setLoading(false);
        await onRefreshUsers();
        setTenantFilter('all');
        setSearchTerm('');
        loadStats().catch(() => {});
        setActiveTab('accounts');
      } else {
        showNotify('error', res.message || 'Lỗi khi tạo tài khoản đồng loạt.');
      }
    } catch (err: any) {
      showNotify('error', err?.message || 'Lỗi kết nối khi gửi dữ liệu tạo tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  // Danh sách giáo viên cá nhân thuộc Nhánh 2 (quản trị trực tiếp bởi @adminquantri)
  const guestUsers = allUsers.filter(u => {
    const isGuest = u.tenantType === 'guest' || 
      (!u.schoolName && !u.isDemo) || 
      (u.schoolName && (u.schoolName.toLowerCase().includes('cá nhân') || u.schoolName.toLowerCase().includes('vãng lai')));
    return isGuest && !u.isDemo && u.role !== 'admin' && u.username.toLowerCase() !== 'adminquantri';
  });

  const normalizeSchoolStr = (name: string) => {
    return (name || '')
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/trường\s+/gi, '')
      .replace(/tiểu học\s+/gi, 'th ')
      .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  };

  const scopedUsers = allUsers.filter(u => {
    if (isSchoolAdmin && !isSuperAdmin) {
      const sTarget = normalizeSchoolStr(currentSchoolScope);
      const uSchool = normalizeSchoolStr(u.schoolName || '');
      const matchSchool = !sTarget || !uSchool ||
                          sTarget === uSchool || 
                          sTarget.includes(uSchool) || 
                          uSchool.includes(sTarget) ||
                          u.tenantType === 'school';
      return matchSchool && u.role !== 'admin' && u.username.toLowerCase() !== 'adminquantri';
    }
    if (isGuestAdmin && !isSuperAdmin) {
      return (u.tenantType === 'guest') && u.role !== 'admin' && !u.isSchoolAdmin && u.username.toLowerCase() !== 'adminquantri';
    }
    return true;
  });

  // 🏫 Helper trích xuất số khối (1, 2, 3, 4, 5) từ thông tin tài khoản giáo viên
  const getUserGrade = (u: UserAccount): number | null => {
    if (u.role === 'homeroom' && u.assignedClassName) {
      const str = u.assignedClassName.trim();
      const m = str.match(/(?:lớp|khối|\s|^)([1-5])(?:[a-zA-Z]|\s|$)/i) || str.match(/([1-5])/);
      if (m && m[1]) return parseInt(m[1], 10);
    }
    return null;
  };

  // 🏫 Helper chuẩn hóa khóa sắp xếp theo Khối & Lớp: 1A1 < 1A2 < 1A10 < 2A1 < ... < 5A15
  const getUserClassSortKey = (u: UserAccount): string => {
    if (u.role === 'homeroom' && u.assignedClassName) {
      const str = u.assignedClassName.trim();
      const m = str.match(/([1-5])\s*([a-zA-Z]+)\s*(\d*)/);
      if (m) {
        const grade = m[1];
        const section = (m[2] || '').toUpperCase();
        const num = m[3] ? m[3].padStart(3, '0') : '000';
        return `GRADE_${grade}_SECTION_${section}_${num}`;
      }
      const numMatch = str.match(/([1-5])/);
      if (numMatch) {
        return `GRADE_${numMatch[1]}_${str.toUpperCase()}`;
      }
      return `GRADE_9_${str.toUpperCase()}`;
    }
    if (u.role === 'subject') return `Z_SUBJECT_${(u.subjectName || '').toUpperCase()}`;
    if (u.role === 'bgh' || u.isBgh) return 'A_BGH';
    if (u.role === 'school_admin' || u.isSchoolAdmin) return 'A_SCHOOL_ADMIN';
    if (u.role === 'admin') return '0_ADMIN';
    return 'Z_OTHER';
  };

  const filteredUsers = scopedUsers.filter(u => {
    const term = searchTerm.trim().toLowerCase();
    const matchSearch = !term ||
      (u.fullName && u.fullName.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term)) ||
      (u.phone && u.phone.includes(term)) ||
      (u.assignedClassName && u.assignedClassName.toLowerCase().includes(term)) ||
      (u.subjectName && u.subjectName.toLowerCase().includes(term)) ||
      (u.schoolName && u.schoolName.toLowerCase().includes(term));
    if (!matchSearch) return false;

    // 2. Lọc theo Khối (Grade Filter)
    if (gradeFilter !== 'all') {
      const g = getUserGrade(u);
      if (gradeFilter === 'other') {
        if (g !== null) return false;
      } else {
        const targetG = parseInt(gradeFilter, 10);
        if (g !== targetG) return false;
      }
    }

    // 3. Lọc theo Vai trò (Role Filter)
    if (roleFilter !== 'all') {
      if (roleFilter === 'bgh') {
        if (!(u.role === 'bgh' || u.isBgh || u.role === 'school_admin' || u.isSchoolAdmin)) return false;
      } else if (roleFilter === 'homeroom') {
        if (u.role !== 'homeroom') return false;
      } else if (roleFilter === 'subject') {
        if (u.role !== 'subject') return false;
      } else if (roleFilter === 'admin') {
        if (u.role !== 'admin' && u.username.toLowerCase() !== 'adminquantri') return false;
      } else if (u.role !== roleFilter) {
        return false;
      }
    }

    if (!isSuperAdmin) return true; // School admin only sees scoped users of their school

    if (tenantFilter === 'admin_super') {
      return u.role === 'admin' || u.username.toLowerCase() === 'adminquantri';
    }
    if (tenantFilter.startsWith('school_')) {
      const schId = tenantFilter.replace('school_', '');
      const sch = schoolsList.find(s => s.id === schId);
      if (sch) {
        if (sch.id === 'school-demo-hp' || sch.name.toUpperCase().includes('DEMO')) {
          return (!!u.isDemo || !!u.schoolName?.toUpperCase().includes('DEMO')) && u.role !== 'admin';
        }
        return (u.schoolName?.trim().toLowerCase() === sch.name.trim().toLowerCase() || u.schoolId === sch.id) && u.role !== 'admin';
      }
      return false;
    }
    if (tenantFilter === 'demo_hp') {
      return (!!u.isDemo || !!u.schoolName?.toUpperCase().includes('DEMO')) && u.role !== 'admin';
    }
    if (tenantFilter === 'guest') {
      const isGuest = u.tenantType === 'guest' || 
        (!u.schoolName && !u.isDemo) || 
        (u.schoolName && (u.schoolName.toLowerCase().includes('cá nhân') || u.schoolName.toLowerCase().includes('vãng lai')));
      return isGuest && !u.isDemo && u.role !== 'admin' && u.username.toLowerCase() !== 'adminquantri';
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'grade_class_asc') {
      const keyA = getUserClassSortKey(a);
      const keyB = getUserClassSortKey(b);
      return keyA.localeCompare(keyB, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (sortBy === 'grade_class_desc') {
      const keyA = getUserClassSortKey(a);
      const keyB = getUserClassSortKey(b);
      return keyB.localeCompare(keyA, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (sortBy === 'name_asc') {
      return (a.fullName || '').localeCompare(b.fullName || '', 'vi');
    }
    if (sortBy === 'name_desc') {
      return (b.fullName || '').localeCompare(a.fullName || '', 'vi');
    }
    if (sortBy === 'created_desc') {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return 0;
  });

  // Dữ liệu lớp & học sinh thực tế theo phân quyền
  const scopedSummaries = userSummaries.filter(u => {
    if (isSuperAdmin) return true;
    const acc = allUsers.find(au => au.username.toLowerCase() === u.username.toLowerCase());
    if (isSchoolAdmin) return (u.schoolName === currentSchoolScope) || (acc?.schoolName === currentSchoolScope);
    if (isGuestAdmin) return (acc?.tenantType === 'guest');
    return true;
  });

  // Thống kê dung lượng database theo phân quyền
  const scopedUserBreakdown = (stats?.userBreakdown || []).filter(item => {
    if (isSuperAdmin) return true;
    const acc = allUsers.find(au => au.username.toLowerCase() === item.username.toLowerCase());
    if (isSchoolAdmin) return (acc?.schoolName === currentSchoolScope);
    if (isGuestAdmin) return (acc?.tenantType === 'guest');
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white shadow-2xl w-full h-full max-w-none max-h-none overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-700 via-indigo-600 to-indigo-600 p-5 md:px-7 md:py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg font-black shrink-0 ${
              isSuperAdmin ? 'bg-amber-400 text-slate-950' : (isSchoolAdmin ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white')
            }`}>
              {isSuperAdmin ? <Crown className="w-6 h-6" /> : (isSchoolAdmin ? <School className="w-6 h-6" /> : <Users className="w-6 h-6" />)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-black uppercase tracking-tight">
                  {isSuperAdmin 
                    ? 'Quản Trị Hệ Thống Cấp Cao (Admin Super)' 
                    : (isSchoolAdmin ? `Quản Trị Nhà Trường: ${currentSchoolScope}` : 'Quản Trị Tài Khoản Cá Nhân')}
                </h2>
                <span className={`text-[12px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider ${
                  isSuperAdmin ? 'bg-rose-600 text-white' : (isSchoolAdmin ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white')
                }`}>
                  {isSuperAdmin ? 'Admin Super' : (isSchoolAdmin ? 'Quản Trị Trường' : 'Quản Trị Cá Nhân')}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {isSuperAdmin 
                  ? 'Quản trị cây thư mục CSDL Trường học & Tài khoản toàn diện' 
                  : (isSchoolAdmin 
                      ? 'Quản lý mô hình lớp, giáo viên, học sinh nhà trường • Tải/Nạp Data JSON • Dọn dẹp năm học' 
                      : 'Quản lý giáo viên tự do các tỉnh thành lẻ • Tải/Nạp Data JSON • Dọn dẹp năm học')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation & quick action */}
        <div className="bg-slate-100/80 border-b border-slate-200 px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            {/* Tab CSDL Trường học dành cho Super Admin (Yêu cầu e) */}
            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('schools')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                  activeTab === 'schools'
                    ? 'bg-rose-600 text-white shadow-xs shadow-rose-600/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>CSDL Trường Học ({schoolsList.length})</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                activeTab === 'accounts'
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isSuperAdmin ? 'Tất Cả Tài Khoản' : (isSchoolAdmin ? 'GV Trong Trường' : (isGuestAdmin ? 'GV Cá Nhân' : 'Tài Khoản'))} ({scopedUsers.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('real_data')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                activeTab === 'real_data'
                  ? 'bg-blue-600 text-white shadow-xs shadow-blue-600/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Mô Hình Lớp & HS</span>
            </button>

            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                  activeTab === 'logs'
                    ? 'bg-violet-600 text-white shadow-xs shadow-violet-600/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Lịch Sử Thao Tác</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('import')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                activeTab === 'import'
                  ? 'bg-emerald-700 text-white shadow-xs shadow-emerald-600/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import Biểu Mẫu</span>
            </button>

            <button
              onClick={handleStartCreate}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                activeTab === 'add' && !editingUser
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Thêm Mới</span>
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                activeTab === 'database'
                  ? 'bg-slate-100 text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Data JSON & Năm Học</span>
            </button>

            {isSuperAdmin && (
              <button
                onClick={() => {
                  setActiveTab('registrations');
                  loadRegistrations();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                  activeTab === 'registrations'
                    ? 'bg-amber-700 text-white shadow-xs shadow-amber-600/20'
                    : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Đơn Đăng Ký ({registrations.length})</span>
              </button>
            )}
          </div>

          {/* Quick Refresh */}
          <button
            onClick={() => {
              onRefreshUsers();
              loadStats();
              loadSummaries();
              loadAuditLogs();
              showNotify('success', 'Đã làm mới dữ liệu người dùng & nhật ký!');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-xs font-black uppercase transition-colors shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
            <span>Làm Mới</span>
          </button>
        </div>

        {/* ☁️ Cảnh báo tài khoản / trường chưa lưu được lên CSDL nhà trường trên Google Drive */}
        {schoolDriveDbService.isConfigured() && schoolDriveDbService.getUnsyncedCount() > 0 && (
          <div className="mx-6 mt-3 p-3 rounded-2xl border border-amber-300 bg-amber-50 text-xs font-bold text-amber-900 flex flex-wrap items-center justify-between gap-2">
            <span>
              ☁️ Còn {schoolDriveDbService.getUnsyncedCount()} thay đổi tài khoản / trường CHƯA lưu lên Google Drive — giáo viên chưa đăng nhập được bằng các tài khoản này.
              {schoolDriveDbService.getLastSyncError() ? ` Lỗi gần nhất: ${schoolDriveDbService.getLastSyncError()}` : ''}
            </span>
            <button
              type="button"
              onClick={async () => {
                const res = await schoolDriveDbService.syncNow();
                showNotify(res.success ? 'success' : 'error', res.success ? `☁️ ${res.message}` : `☁️ ${res.message}`);
                onRefreshUsers();
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-[12px] font-black shrink-0"
            >
              LƯU LÊN DRIVE NGAY
            </button>
          </div>
        )}

        {/* Notification Toast */}
        {notification && (
          <div className={`mx-6 mt-3 p-3 rounded-2xl border text-xs font-black flex items-center justify-between animate-in slide-in-from-top-2 duration-150 ${
            notification.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
              <span>{notification.message}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab 0: Super Admin Tree View & School Database Management (Yêu cầu e) */}
        {activeTab === 'schools' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto p-5 md:p-7 flex flex-col space-y-5">
            {/* Top Bar for School & Guest Management */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border transition-all ${
              selectedAdminBranch === 'branch1'
                ? 'bg-gradient-to-r from-rose-50 to-indigo-50 border-rose-200'
                : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl text-white flex items-center justify-center font-black shrink-0 shadow-xs ${
                  selectedAdminBranch === 'branch1' ? 'bg-rose-600' : 'bg-purple-600'
                }`}>
                  {selectedAdminBranch === 'branch1' ? <Building2 className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">
                    {selectedAdminBranch === 'branch1'
                      ? 'Quản Lý Danh Mục & Cơ Sở Dữ Liệu Trường Học (Nhánh 1)'
                      : 'Quản Lý Cơ Sở Dữ Liệu Giáo Viên Cá Nhân (Nhánh 2)'}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {selectedAdminBranch === 'branch1'
                      ? 'Khởi tạo CSDL mới cho trường, phân bổ tài khoản quản trị trường, sao lưu và đồng bộ'
                      : 'Tài khoản quản trị phụ trách: @adminquantri (Super Admin) • Quản trị toàn diện giáo viên độc lập / vãng lai'}
                  </p>
                </div>
              </div>

              {selectedAdminBranch === 'branch1' ? (
                <button
                  type="button"
                  onClick={handleStartCreateSchool}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Khởi Tạo CSDL Trường Mới</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCreateGuestTeacher}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Thêm GV Cá Nhân Mới</span>
                </button>
              )}
            </div>

            <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-0">
              {/* Left Column: Tree View */}
              <div className="lg:w-1/3 flex flex-col p-4 rounded-2xl bg-white text-slate-800 border border-slate-200 space-y-3 overflow-y-auto">
                <div className="text-xs font-black text-amber-700 uppercase flex items-center gap-2">
                  <FolderTree className="w-4 h-4" />
                  <span>SƠ ĐỒ CÂY QUẢN TRỊ (SUPER ADMIN)</span>
                </div>

                <div className="text-xs font-mono space-y-1.5 pl-2 border-l-2 border-slate-200">
                  <div className="text-rose-600 font-bold flex items-center gap-1.5">
                    <span>👑 [Hệ Thống] (adminquantri)</span>
                  </div>

                  <div className="pl-4 space-y-2 border-l border-slate-200 ml-2 mt-1">
                    {/* Nhánh 1: CSDL Trường học */}
                    <div 
                      onClick={() => setSelectedAdminBranch('branch1')}
                      className={`space-y-1 p-2 rounded-xl cursor-pointer transition-all ${
                        selectedAdminBranch === 'branch1' 
                          ? 'bg-blue-600/80 border border-blue-500/50 text-white shadow-xs' 
                          : 'hover:bg-slate-200'
                      }`}
                    >
                      <div className="text-blue-300 font-bold flex items-center justify-between gap-1.5">
                        <span className="flex items-center gap-1.5">
                          <span>📁 Nhánh 1: Nhà Trường ({schoolsList.length})</span>
                        </span>
                        {selectedAdminBranch === 'branch1' && (
                          <span className="text-[12px] bg-blue-600 text-white px-1.5 py-0.2 rounded-full font-sans font-bold">ĐANG CHỌN</span>
                        )}
                      </div>
                      <div className="pl-4 space-y-1 text-slate-300 text-[12px]">
                        {schoolsList.length === 0 ? (
                          <div className="py-1 text-[12px] text-slate-400 italic">
                            Chưa có trường học nào. Nhấn "+ Khởi tạo CSDL Trường Mới".
                          </div>
                        ) : (
                          schoolsList.map((s) => {
                            const countGV = allUsers.filter(u => u.schoolName === s.name && u.role !== 'admin').length;
                            return (
                              <div key={s.id} className="flex flex-col py-1 hover:text-white border-b border-slate-800/50">
                                <div className="flex items-center gap-1">
                                  <span>├── 🏫</span>
                                  <span className="font-bold text-slate-200 truncate" title={s.name}>{s.name}</span>
                                </div>
                                <div className="pl-5 text-[12px] text-slate-400">
                                  Mã: {s.code} • GV: {countGV}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Nhánh 2: Giáo viên cá nhân */}
                    <div 
                      onClick={() => setSelectedAdminBranch('branch2')}
                      className={`space-y-1 mt-2.5 p-2 rounded-xl cursor-pointer transition-all ${
                        selectedAdminBranch === 'branch2' 
                          ? 'bg-purple-600/80 border border-purple-500/50 text-white shadow-xs' 
                          : 'hover:bg-slate-200'
                      }`}
                    >
                      <div className="text-purple-300 font-bold flex items-center justify-between gap-1.5">
                        <span className="flex items-center gap-1.5">
                          <span>👤 Nhánh 2: GV Cá Nhân ({guestUsers.length})</span>
                        </span>
                        {selectedAdminBranch === 'branch2' && (
                          <span className="text-[12px] bg-purple-600 text-white px-1.5 py-0.2 rounded-full font-sans font-bold">ĐANG CHỌN</span>
                        )}
                      </div>
                      <div className="pl-4 space-y-1 text-slate-300 text-[12px]">
                        <div className="flex flex-col py-1">
                          <span>└── 🛡️ Phụ trách: <span className="text-amber-300 font-bold">@adminquantri</span></span>
                        </div>
                        {guestUsers.length === 0 ? (
                          <div className="py-1 text-[12px] text-slate-400 italic">
                            Chưa có GV cá nhân nào. Nhấn "+ Thêm GV Cá Nhân" để tạo.
                          </div>
                        ) : (
                          guestUsers.map((u) => {
                            return (
                              <div key={u.id} className="flex flex-col py-1 hover:text-white border-b border-slate-800/50">
                                <div className="flex items-center gap-1">
                                  <span>├── 👨‍🏫</span>
                                  <span className="font-bold text-slate-200 truncate" title={u.fullName}>{u.fullName}</span>
                                </div>
                                <div className="pl-5 text-[12px] text-slate-400">
                                  TK: @{u.username} • {u.subjectName || (u.role === 'homeroom' ? `CN ${u.assignedClassName || ''}` : 'GV Bộ môn')}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Branch 1 (School) / Branch 2 (Guest Teacher) Management */}
              <div className="lg:w-2/3 flex-1 flex flex-col space-y-3 min-h-[300px]">
                {/* Branch Switcher Tabs */}
                <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedAdminBranch('branch1')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      selectedAdminBranch === 'branch1'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <School className="w-4 h-4" />
                    <span>📁 Nhánh 1: CSDL Nhà Trường ({schoolsList.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAdminBranch('branch2')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      selectedAdminBranch === 'branch2'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>👤 Nhánh 2: GV Cá Nhân ({guestUsers.length}) [Admin: @adminquantri]</span>
                  </button>
                </div>

                {/* Nội dung tương ứng từng Nhánh */}
                {selectedAdminBranch === 'branch1' ? (
                  // Bảng Trường Học (Nhánh 1)
                  <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white flex flex-col min-h-[250px]">
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[12px] font-black text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                          <tr>
                            <th className="py-2 px-2 text-center w-12">STT</th>
                            <th className="py-2 px-2">Tên Trường Học</th>
                            <th className="py-2 px-2">Mã Trường</th>
                            <th className="py-2 px-2 hidden md:table-cell">Số Điện Thoại</th>
                            <th className="py-2 px-2 text-right">Thao Tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {schoolsList.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-12 px-4 text-center">
                                <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-3">
                                  <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shadow-xs">
                                    <School className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                                      Chưa có CSDL Trường học nào
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                      Hệ thống đang ở trạng thái CSDL trắng hoàn toàn. Hãy khởi tạo trường học đầu tiên để bắt đầu vận hành!
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleStartCreateSchool}
                                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>Khởi Tạo Trường Đầu Tiên</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            schoolsList.map((school, idx) => {
                              const hasAdminAccount = !!(school.adminUsername && allUsers.some(u => u.username?.toLowerCase() === school.adminUsername?.toLowerCase()));
                              return (
                              <tr key={school.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2 px-2 text-center font-bold text-slate-400">{idx + 1}</td>
                                <td className="py-2 px-2">
                                  <div className="font-black text-slate-900 flex items-center gap-1.5">
                                    <School className="w-4 h-4 text-blue-600 shrink-0" />
                                    <span>{school.name}</span>
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                    {hasAdminAccount ? (
                                      <span className="inline-flex items-center gap-1 text-[12px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5">
                                        <CheckCircle2 className="w-3 h-3" />
                                        TK: @{school.adminUsername}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
                                          <AlertCircle className="w-3 h-3" />
                                          Chưa cấp tài khoản BGH
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenProvisionModal(school)}
                                          className="inline-flex items-center gap-0.5 text-[12px] font-black text-white bg-rose-600 hover:bg-rose-700 rounded-md px-1.5 py-0.5 transition-colors shadow-sm cursor-pointer"
                                          title="Cấp tài khoản Quản trị BGH cho trường này"
                                        >
                                          <Plus className="w-3 h-3" />
                                          Cấp tài khoản
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-2 font-mono font-bold text-blue-700">{school.code}</td>
                                <td className="py-2 px-2 text-slate-600 font-mono hidden md:table-cell">{school.phone || '—'}</td>
                                <td className="py-2 px-2 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {!hasAdminAccount && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenProvisionModal(school)}
                                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                                        title="Cấp tài khoản Ban Giám Hiệu"
                                      >
                                        <UserPlus className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTenantFilter(`school_${school.id}`);
                                        setSearchTerm('');
                                        setActiveTab('accounts');
                                      }}
                                      className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors"
                                      title="Quản lý tài khoản thuộc trường"
                                    >
                                      <Users className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditSchool(school)}
                                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors"
                                      title="Chỉnh sửa thông tin trường"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={deletingSchoolId === school.id || loading}
                                      onClick={() => handleDeleteSchool(school)}
                                      className={`p-1.5 rounded-lg border transition-all ${
                                        deletingSchoolId === school.id
                                          ? 'bg-amber-50 text-amber-700 border-amber-300 cursor-not-allowed shadow-none'
                                          : 'text-rose-600 hover:bg-rose-50 border-transparent hover:border-rose-200'
                                      }`}
                                      title={deletingSchoolId === school.id ? "Đang dọn dẹp dữ liệu..." : "Xóa CSDL trường này"}
                                    >
                                      {deletingSchoolId === school.id ? (
                                        <span className="flex items-center gap-1.5 text-[12px] font-bold text-amber-700 px-1.5 py-0.5 animate-pulse">
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                          <span>Đang dọn dẹp...</span>
                                        </span>
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  // Bảng Giáo Viên Cá Nhân (Nhánh 2) - Quản trị bởi @adminquantri
                  <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white flex flex-col min-h-[250px]">
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[12px] font-black text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                          <tr>
                            <th className="py-2 px-2 text-center w-12">STT</th>
                            <th className="py-2 px-2">Họ & Tên Giáo Viên</th>
                            <th className="py-2 px-2">Tên Đăng Nhập</th>
                            <th className="py-2 px-2">Mật Khẩu</th>
                            <th className="py-2 px-2">Môn / Lớp</th>
                            <th className="py-2 px-2 hidden md:table-cell">Số Điện Thoại</th>
                            <th className="py-2 px-2 text-right">Thao Tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {guestUsers.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 px-4 text-center">
                                <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-3">
                                  <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center shadow-xs">
                                    <Users className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                                      Chưa có Giáo Viên Cá Nhân nào (Nhánh 2)
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                      Tài khoản quản trị phụ trách: <strong className="text-amber-700">@adminquantri</strong>. Hãy thêm giáo viên cá nhân đầu tiên để bắt đầu vận hành Nhánh 2!
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleStartCreateGuestTeacher}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <UserPlus className="w-4 h-4" />
                                    <span>Thêm GV Cá Nhân Đầu Tiên</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            guestUsers.map((u, idx) => (
                              <tr key={u.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2 px-2 text-center font-bold text-slate-400">{idx + 1}</td>
                                <td className="py-2 px-2">
                                  <div className="flex items-center gap-2">
                                    <img 
                                      src={u.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.username} 
                                      alt={u.fullName}
                                      className="w-7 h-7 rounded-full border border-slate-200 object-cover bg-slate-50 shrink-0"
                                    />
                                    <div>
                                      <div className="font-black text-slate-900">{u.fullName}</div>
                                      <div className="text-[12px] text-purple-600 font-bold">Nhánh 2: GV Cá nhân</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2 px-2">
                                  <code className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-mono font-bold text-[12px] border border-slate-200">
                                    @{u.username}
                                  </code>
                                </td>
                                <td className="py-2 px-2">
                                  <code className="px-2 py-0.5 rounded-lg bg-red-50 text-red-700 font-mono font-bold text-[12px] border border-red-200">
                                    {displayPassword(u)}
                                  </code>
                                </td>
                                <td className="py-2 px-2 text-slate-700">
                                  {u.subjectName || (u.role === 'homeroom' ? `CN ${u.assignedClassName || ''}` : 'GV Bộ môn')}
                                </td>
                                <td className="py-2 px-2 text-slate-600 font-mono hidden md:table-cell">
                                  {u.phone || '—'}
                                </td>
                                <td className="py-2 px-2 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleQuickSwitch(u.username)}
                                      className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[12px] border border-indigo-200 transition-colors"
                                      title="Đăng nhập trực tiếp vào không gian làm việc của GV"
                                    >
                                      Đăng nhập
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenTransferModal(u)}
                                      className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 border border-transparent hover:border-purple-200 transition-colors"
                                      title="Gán / Chuyển giáo viên này vào một Nhà Trường (Nhánh 1)"
                                    >
                                      <Building2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(u)}
                                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors"
                                      title="Chỉnh sửa thông tin giáo viên"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleResetPassword(u)}
                                      className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors"
                                      title="Đặt lại mật khẩu cho giáo viên"
                                    >
                                      <KeyRound className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteUser(u)}
                                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                                      title="Xóa tài khoản giáo viên này"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Account List */}
        {activeTab === 'accounts' && (
          <div className="flex-1 overflow-y-auto p-5 md:p-7 flex flex-col">
            {/* Search Bar, Action Buttons & Summary Stats */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm tài khoản, họ tên, trường, lớp, môn..."
                    className="w-full h-9 pl-10 pr-9 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                      title="Xóa từ khóa tìm kiếm"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openBulkPassword}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-amber-300 hover:bg-amber-50 text-amber-900 rounded-2xl text-xs font-black uppercase shadow-xs transition-colors shrink-0"
                  title={selectedUserIds.length > 0 ? `Gán 1 mật khẩu chung cho ${selectedUserIds.length} tài khoản đang chọn` : 'Gán 1 mật khẩu chung cho tất cả tài khoản trong danh sách'}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{selectedUserIds.length > 0 ? `MẬT KHẨU CHUNG (${selectedUserIds.length})` : 'MẬT KHẨU CHUNG'}</span>
                </button>
                {selectedUserIds.length > 0 && (
                  <button
                    onClick={handleBulkDeleteUsers}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase shadow-xs transition-all hover-zoom-btn shrink-0"
                    title={`Xóa ${selectedUserIds.length} tài khoản đang chọn`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">XÓA {selectedUserIds.length} TÀI KHOẢN</span>
                  </button>
                )}
              </div>

              {/* Action Buttons: Export to Excel & Import Template (User requirements) */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleExportUsersToExcel(filteredUsers, 'TaiKhoan_TabHienTai')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl text-xs font-black uppercase shadow-xs transition-all hover-zoom-btn"
                  title="Xuất danh sách tài khoản theo Tab hiện tại thành file Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>XUẤT EXCEL TAB NÀY</span>
                </button>

                <button
                  onClick={() => handleExportUsersToExcel(allUsers, 'TaiKhoan_TatCa')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-2xl text-xs font-black uppercase shadow-xs transition-all hover-zoom-btn"
                  title="Xuất danh sách toàn bộ tài khoản thành file Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>XUẤT TẤT CẢ</span>
                </button>

                <button
                  onClick={() => setActiveTab('import')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-2xl text-xs font-black uppercase shadow-2xs transition-all hover-zoom-btn"
                  title="Nhập biểu mẫu Excel để tạo tài khoản đồng loạt"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>IMPORT BIỂU MẪU</span>
                </button>

                <div className="flex items-center gap-1 text-xs font-bold text-slate-500 ml-1">
                  <span className="px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
                    Tổng: <strong className="text-slate-900">{allUsers.length}</strong> TK
                  </span>
                  <span className="px-2.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hidden sm:inline">
                    GVCN: <strong>{allUsers.filter(u => u.role === 'homeroom').length}</strong>
                  </span>
                  <span className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 hidden sm:inline">
                    GVBM: <strong>{allUsers.filter(u => u.role === 'subject').length}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Filter Tabs by Partition / Role (Yêu cầu 2 & 3) - Chỉ hiển thị cho Quản trị tối cao */}
            {isSuperAdmin && (
              <div className="flex flex-wrap items-center gap-2 mb-3 bg-slate-100/70 p-1.5 rounded-2xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => { setTenantFilter('all'); setSearchTerm(''); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    tenantFilter === 'all'
                      ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tất cả ({allUsers.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setTenantFilter('admin_super'); setSearchTerm(''); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    tenantFilter === 'admin_super'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-rose-700'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Quản trị Tối cao ({allUsers.filter(u => u.role === 'admin' || u.username.toLowerCase() === 'adminquantri').length})</span>
                </button>
                {/* 🏫 RENDER ĐỘNG CÁC KHỐI TRƯỜNG HỌC TỪ CƠ SỞ DỮ LIỆU (MULTI-TENANT SAAS) */}
                {schoolsList.map((sch) => {
                  const filterKey = `school_${sch.id}`;
                  const isSelected = tenantFilter === filterKey || (sch.id === 'school-demo-hp' && tenantFilter === 'demo_hp');
                  const isDemo = sch.id === 'school-demo-hp' || sch.name.toUpperCase().includes('DEMO');
                  const count = allUsers.filter(u => {
                    if (isDemo) {
                      return (!!u.isDemo || !!u.schoolName?.toUpperCase().includes('DEMO')) && u.role !== 'admin';
                    }
                    return (u.schoolName?.trim().toLowerCase() === sch.name.trim().toLowerCase() || u.schoolId === sch.id) && u.role !== 'admin';
                  }).length;

                  return (
                    <button
                      key={sch.id}
                      type="button"
                      onClick={() => { setTenantFilter(isSelected ? 'all' : filterKey); setSearchTerm(''); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? isDemo
                            ? 'bg-amber-700 text-white shadow-xs'
                            : 'bg-blue-600 text-white shadow-xs'
                          : isDemo
                            ? 'text-slate-600 hover:text-amber-700'
                            : 'text-slate-600 hover:text-blue-700'
                      }`}
                    >
                      {isDemo ? <Sparkles className="w-3.5 h-3.5" /> : <School className="w-3.5 h-3.5" />}
                      <span>Khối {sch.name} ({count})</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { setTenantFilter('guest'); setSearchTerm(''); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    tenantFilter === 'guest'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-purple-700'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Khối Giáo viên Cá nhân / Vãng lai ({allUsers.filter(u => {
                    const isGuest = u.tenantType === 'guest' || 
                      (!u.schoolName && !u.isDemo) || 
                      (u.schoolName && (u.schoolName.toLowerCase().includes('cá nhân') || u.schoolName.toLowerCase().includes('vãng lai')));
                    return isGuest && !u.isDemo && u.role !== 'admin' && u.username.toLowerCase() !== 'adminquantri';
                  }).length})</span>
                </button>
              </div>
            )}

            {isSchoolAdmin && (
              <div className="flex items-center justify-between gap-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs font-bold text-blue-900 shrink-0">
                <div className="flex items-center gap-2">
                  <School className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Phạm vi quản trị: <strong>{currentSchoolScope}</strong> ({scopedUsers.length} tài khoản) • Bạn có toàn quyền quản lý, sắp xếp và lọc tài khoản giáo viên thuộc trường của mình.
                  </span>
                </div>
                <span className="text-[12px] uppercase font-black px-2 py-0.5 rounded-full bg-blue-200 text-blue-800 shrink-0">
                  Nội Bộ Trường
                </span>
              </div>
            )}

            {/* 🎯 BỘ LỌC TÀI KHOẢN THEO KHỐI, THEO VAI TRÒ & SẮP XẾP THEO LỚP HỌC (Yêu cầu Quản trị tối cao & Quản trị trường) */}
            <div className="mb-3.5 p-3 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col gap-2.5 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* 1. LỌC THEO KHỐI (1 ĐẾN 5) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-black uppercase text-slate-400 flex items-center gap-1 mr-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    Lọc Khối:
                  </span>
                  <button
                    type="button"
                    onClick={() => setGradeFilter('all')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      gradeFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Tất cả khối ({scopedUsers.length})
                  </button>
                  {[1, 2, 3, 4, 5].map((g) => {
                    const countInGrade = scopedUsers.filter(u => getUserGrade(u) === g).length;
                    const isActive = gradeFilter === String(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGradeFilter(isActive ? 'all' : (String(g) as any))}
                        className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                        title={`Lọc danh sách chỉ hiển thị giáo viên phụ trách Khối ${g}`}
                      >
                        <span>Khối {g}</span>
                        <span className={`text-[12px] px-1 py-0.2 rounded-full font-bold ${
                          isActive ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {countInGrade}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setGradeFilter(gradeFilter === 'other' ? 'all' : 'other')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                      gradeFilter === 'other'
                        ? 'bg-slate-200 text-slate-800 shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    title="Lọc tài khoản Giáo viên bộ môn, Ban Giám Hiệu, Quản trị không gán theo khối lớp cụ thể"
                  >
                    <span>Bộ Môn / Khác</span>
                    <span className={`text-[12px] px-1 py-0.2 rounded-full font-bold ${
                      gradeFilter === 'other' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {scopedUsers.filter(u => getUserGrade(u) === null).length}
                    </span>
                  </button>
                </div>

                {/* 2. SẮP XẾP DANH SÁCH (SORT BY) */}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[12px] font-black uppercase text-slate-400 flex items-center gap-1">
                    <ArrowUpDown className="w-3.5 h-3.5 text-emerald-500" />
                    Sắp xếp:
                  </span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="grade_class_asc">🔢 Khối & Lớp: 1A1 ➡️ 5A... (Tăng dần)</option>
                    <option value="grade_class_desc">🔢 Khối & Lớp: 5A... ➡️ 1A1 (Giảm dần)</option>
                    <option value="name_asc">🔤 Họ & Tên Giáo Viên (A ➡️ Z)</option>
                    <option value="name_desc">🔤 Họ & Tên Giáo Viên (Z ➡️ A)</option>
                    <option value="created_desc">⏱️ Tài khoản mới tạo gần nhất</option>
                  </select>
                </div>
              </div>

              {/* 3. LỌC THEO VAI TRÒ (ROLE) & NÚT RESET */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-black uppercase text-slate-400 flex items-center gap-1 mr-1">
                    <Filter className="w-3.5 h-3.5 text-amber-500" />
                    Vai Trò:
                  </span>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('all')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      roleFilter === 'all'
                        ? 'bg-amber-700 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Tất cả vai trò
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter(roleFilter === 'homeroom' ? 'all' : 'homeroom')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                      roleFilter === 'homeroom'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
                    }`}
                  >
                    <School className="w-3.5 h-3.5" />
                    <span>GV Chủ nhiệm ({scopedUsers.filter(u => u.role === 'homeroom').length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter(roleFilter === 'subject' ? 'all' : 'subject')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                      roleFilter === 'subject'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                    }`}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>GV Bộ môn ({scopedUsers.filter(u => u.role === 'subject').length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter(roleFilter === 'bgh' ? 'all' : 'bgh')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                      roleFilter === 'bgh'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>BGH & Quản Trị ({scopedUsers.filter(u => u.role === 'school_admin' || u.isSchoolAdmin || u.role === 'bgh' || u.isBgh).length})</span>
                  </button>
                </div>

                {/* Trạng thái hiển thị số lượng & Nút đặt lại bộ lọc */}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs font-bold text-slate-500">
                    Hiển thị: <strong className="text-indigo-700 font-black">{filteredUsers.length}</strong> / {scopedUsers.length} tài khoản
                  </span>
                  {(gradeFilter !== 'all' || roleFilter !== 'all' || sortBy !== 'grade_class_asc' || searchTerm !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setGradeFilter('all');
                        setRoleFilter('all');
                        setSortBy('grade_class_asc');
                        setSearchTerm('');
                      }}
                      className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs flex items-center gap-1 transition-colors cursor-pointer"
                      title="Xóa tất cả các bộ lọc và đưa về sắp xếp mặc định"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Đặt lại</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Table of Users */}
            <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
              <div className="overflow-x-auto h-full">
                <table className="w-full text-left border-collapse text-sm min-w-[900px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wide sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-3 text-center w-10">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={selectedUserIds.length > 0 && selectedUserIds.length === filteredUsers.filter(u => !(u.role === 'admin' || u.username.toLowerCase() === 'adminquantri')).length}
                          onChange={handleSelectAllUsers}
                          title="Chọn tất cả"
                          aria-label="Chọn tất cả tài khoản"
                        />
                      </th>
                      <th className="py-3 px-2 text-center w-12">STT</th>
                      <th
                        className="py-3 px-2 cursor-pointer hover:text-indigo-700 transition-colors"
                        onClick={() => setSortBy(sortBy === 'name_asc' ? 'name_desc' : 'name_asc')}
                        title="Bấm để sắp xếp theo họ tên"
                      >
                        <span className="inline-flex items-center gap-1">
                          Họ và tên
                          {sortBy === 'name_asc' && <ArrowDownAZ className="w-3.5 h-3.5 text-indigo-600" />}
                          {sortBy === 'name_desc' && <ArrowUpAZ className="w-3.5 h-3.5 text-indigo-600" />}
                        </span>
                      </th>
                      <th className="py-3 px-2">Mật khẩu</th>
                      <th
                        className="py-3 px-2 cursor-pointer hover:text-indigo-700 transition-colors"
                        onClick={() => setSortBy(sortBy === 'grade_class_asc' ? 'grade_class_desc' : 'grade_class_asc')}
                        title="Bấm để đảo chiều sắp xếp theo khối & lớp"
                      >
                        <span className="inline-flex items-center gap-1">
                          Lớp / Môn phụ trách
                          {sortBy === 'grade_class_asc' && <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />}
                          {sortBy === 'grade_class_desc' && <ArrowUpDown className="w-3.5 h-3.5 text-amber-600 rotate-180" />}
                        </span>
                      </th>
                      <th className="py-3 px-2 text-center">Trạng thái TK</th>
                      <th className="py-3 px-3 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((u, idx) => {
                      const isSelf = currentUser ? uidOf(u) === uidOf(currentUser) : false;
                      const isDefaultAdmin = u.username.toLowerCase() === 'admin';
                      const isBghUser = (u.role === 'bgh' || u.isBgh) && u.role !== 'school_admin';
                      const roleInfo = u.role === 'admin' ? { label: 'Quản trị tối cao', cls: 'text-rose-700', level: 'Cấp 1', desc: 'Toàn quyền hệ thống' }
                        : u.role === 'school_admin' ? { label: 'Quản trị nhà trường', cls: 'text-blue-700', level: 'Cấp 2', desc: 'Quản trị trong nhà trường' }
                        : isBghUser ? { label: 'Ban giám hiệu', cls: 'text-purple-700', level: 'Cấp 2', desc: 'Ban giám hiệu (toàn trường)' }
                        : u.role === 'guest_admin' ? { label: 'Quản trị cá nhân', cls: 'text-fuchsia-700', level: 'Cấp 2', desc: 'Quản trị cá nhân' }
                        : u.role === 'subject' ? { label: 'GV bộ môn', cls: 'text-emerald-700', level: 'Cấp 4', desc: 'Giáo viên bộ môn' }
                        : { label: 'GV chủ nhiệm', cls: 'text-indigo-700', level: 'Cấp 3', desc: 'Giáo viên chủ nhiệm' };
                      const uGrade = getUserGrade(u);
                      const scope = u.role === 'homeroom' ? `${uGrade ? `Khối ${uGrade} • ` : ''}${u.assignedClassName || 'Chưa gán lớp'}`
                        : u.role === 'subject' ? `Môn: ${u.subjectName || 'Bộ môn'}`
                        : (u.role === 'school_admin' || u.role === 'bgh' || u.isBgh) ? 'Toàn trường'
                        : u.role === 'admin' ? 'Toàn hệ thống' : 'Chưa gán';
                      const showDetails = () => {
                        const details = [
                          `👤 Tên hiển thị: ${u.fullName || 'Chưa cập nhật'}`,
                          `🔑 Tên đăng nhập: ${u.username}`,
                          `🔒 Mật khẩu: ${displayPassword(u)}`,
                          `🛡️ Vai trò: ${roleInfo.label} (${roleInfo.level})`,
                          `🏢 Thuộc đơn vị/trường: ${u.schoolName || (u.tenantType === 'guest' ? 'Giáo Viên Cá Nhân' : 'Chưa rõ')}`,
                          `📚 Phụ trách: ${scope}`,
                          `⚙️ Chức năng: ${roleInfo.desc}`,
                          `📞 SĐT: ${u.phone || 'Chưa cập nhật'}`,
                          `✉️ Email: ${u.email || 'Chưa cập nhật'}`
                        ].join('\n');
                        window.alert(`THÔNG TIN TÀI KHOẢN\n\n${details}`);
                      };
                      const iconBtn = 'no-hover-fx w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors';

                      return (
                        <tr key={uidOf(u)} className={`transition-colors ${selectedUserIds.includes(uidOf(u)) ? 'bg-amber-50' : 'hover:bg-sky-50/50'}`}>
                          <td className="py-3 px-3 text-center">
                            {!(u.role === 'admin' || u.username.toLowerCase() === 'adminquantri') ? (
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                checked={selectedUserIds.includes(uidOf(u))}
                                onChange={() => toggleSelectUser(uidOf(u))}
                                aria-label={`Chọn ${u.fullName}`}
                              />
                            ) : null}
                          </td>
                          <td className="py-3 px-2 text-center text-slate-500 tabular-nums">{idx + 1}</td>
                          <td className="py-3 px-2">
                            <div className="flex items-start gap-2.5">
                              <img
                                src={u.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.username}
                                alt=""
                                className="w-9 h-9 rounded-full border border-slate-200 object-cover bg-slate-50 shrink-0 mt-0.5"
                              />
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{u.fullName}</span>
                                  {isSelf && <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 rounded border border-indigo-200">Bạn</span>}
                                  {u.isDemo && <span className="text-xs font-bold text-amber-900 bg-amber-100 px-1.5 rounded">Demo</span>}
                                </p>
                                <p className="text-xs text-slate-600 mt-0.5">
                                  <span className="font-mono">{u.username}</span> <span className="text-slate-400">|</span> <span className={`font-semibold ${roleInfo.cls}`}>{roleInfo.label}</span>
                                </p>
                                <p className={`text-xs mt-0.5 inline-flex items-center gap-1 ${u.tenantType === 'guest' ? 'text-fuchsia-700' : 'text-emerald-700'}`}>
                                  <MapPin className="w-3 h-3 shrink-0" />{u.tenantType === 'guest' ? 'Giáo viên cá nhân (vãng lai)' : (u.schoolName || 'Nhà trường')}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <code className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-mono font-bold text-xs border border-rose-200 whitespace-nowrap">
                              {displayPassword(u)}
                            </code>
                          </td>
                          <td className="py-3 px-2">
                            <span className={`inline-flex items-center gap-1.5 font-semibold ${u.role === 'subject' ? 'text-emerald-800' : u.role === 'homeroom' ? 'text-indigo-800' : 'text-slate-700'}`}>
                              {u.role === 'homeroom' ? <GraduationCap className="w-4 h-4 text-indigo-600" /> : u.role === 'subject' ? <Laptop className="w-4 h-4 text-emerald-700" /> : u.role === 'admin' ? <Crown className="w-4 h-4 text-rose-600" /> : <Building2 className="w-4 h-4 text-purple-600" />}
                              {scope}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            {u.status === 'locked'
                              ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200/70 text-slate-700"><Lock className="w-3 h-3" /> Tạm khóa</span>
                              : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800"><CheckCircle2 className="w-3 h-3" /> Hoạt động</span>}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <button onClick={() => handleQuickSwitch(u.username)} className={`${iconBtn} text-indigo-600 hover:bg-indigo-50`} title="Đăng nhập / xem không gian làm việc của tài khoản này" aria-label={`Đăng nhập không gian của ${u.fullName}`}>
                              <LogIn className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleStartEdit(u)} className={`${iconBtn} text-blue-600 hover:bg-blue-50`} title="Sửa thông tin hoặc gán lại quyền (GVCN / GVBM)" aria-label={`Sửa ${u.fullName}`}>
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {isSuperAdmin && !isDefaultAdmin && (u.tenantType === 'guest' || !u.tenantType || u.role !== 'admin') && (
                              <button onClick={() => handleOpenTransferModal(u)} className={`${iconBtn} text-purple-600 hover:bg-purple-50`}
                                title={u.tenantType === 'guest' ? 'Gán vào trường (chuyển toàn bộ dữ liệu cá nhân sang nhà trường)' : 'Chuyển trường (di chuyển toàn bộ dữ liệu)'} aria-label={`Chuyển trường cho ${u.fullName}`}>
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => handleResetPassword(u)} className={`${iconBtn} text-amber-700 hover:bg-amber-50`} title="Đặt lại mật khẩu cho tài khoản này" aria-label={`Đặt lại mật khẩu cho ${u.fullName}`}>
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button onClick={showDetails} className={`${iconBtn} text-slate-600 hover:bg-slate-100`} title={`Xem chi tiết (${roleInfo.level})`} aria-label={`Xem chi tiết ${u.fullName}`}>
                              <FileText className="w-4 h-4" />
                            </button>
                            {!isDefaultAdmin && (
                              <button onClick={() => handleDeleteUser(u)} className={`${iconBtn} text-rose-600 hover:bg-rose-50`} title="Xóa tài khoản này" aria-label={`Xóa ${u.fullName}`}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Create / Edit User Form */}
        {activeTab === 'add' && (
          <div className="flex-1 overflow-y-auto p-5 md:p-8 flex justify-center">
            <form onSubmit={handleSaveUser} className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-base font-black text-slate-900 uppercase">
                  {editingUser ? `Chỉnh Sửa Tài Khoản: ${editingUser.username}` : 'Thêm Mới Tài Khoản Giáo Viên'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Thiết lập quyền hạn độc lập: Giáo viên chủ nhiệm (GVCN) hoặc Giáo viên bộ môn (GVBM)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Username */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1.5 flex items-center justify-between">
                    <span>Tên Đăng Nhập <span className="text-rose-600">*</span></span>
                    {editingUser && isSuperAdmin && (
                      <span className="text-[12px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Admin Super được đổi
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    disabled={editingUser ? !isSuperAdmin : false}
                    placeholder="Ví dụ: gvcn5a2, gvtienganh..."
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                    required
                  />
                  {editingUser && !isSuperAdmin && (
                    <span className="text-[12px] text-slate-400">Chỉ Admin Super mới có thể đổi tên đăng nhập</span>
                  )}
                </div>

                {/* Password (for new user) */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1.5">
                    Mật Khẩu Khởi Tạo
                  </label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingUser ? 'Để trống nếu không đổi' : 'Mặc định: 123456'}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800"
                  />
                </div>

                {/* Full name */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1.5">
                    Họ Và Tên Giáo Viên <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="Ví dụ: Thầy Trần Quang Vinh, Cô Phạm Thu Hà..."
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800"
                    required
                  />
                </div>

                {/* Role selection (Theo quyền phân cấp: Super Admin, School Admin, BGH, GVCN, GVBM) */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-black text-slate-700 uppercase">
                      Gán Vai Trò & Phân Quyền Hoạt Động <span className="text-rose-600">*</span>
                    </label>
                    <span className="text-[12px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      {isSuperAdmin ? 'Admin Super: Toàn quyền tạo cho mọi trường' : 'Phân quyền trong đơn vị'}
                    </span>
                  </div>

                  {/* 🏛️ 4 VAI TRÒ TRỰC THUỘC NHÀ TRƯỜNG */}
                  <div className="mb-3">
                    <div className="text-[12px] font-black text-indigo-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <School className="w-3.5 h-3.5" />
                      <span>Vai Trò Trực Thuộc Nhà Trường</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {/* 1. Quản trị trong nhà trường */}
                      <label className={`p-3 rounded-2xl border-2 cursor-pointer flex flex-col justify-between transition-all ${
                        formData.role === 'school_admin' 
                          ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-600/30' 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                              <span className="font-black text-xs text-slate-900 uppercase">Quản trị trong nhà trường</span>
                            </div>
                            <input
                              type="radio"
                              name="role"
                              checked={formData.role === 'school_admin'}
                              onChange={() => setFormData({ ...formData, role: 'school_admin', tenantType: 'school' })}
                              className="w-4 h-4 text-blue-600 shrink-0"
                            />
                          </div>
                          <p className="text-[12px] text-slate-500 leading-snug">
                            Toàn quyền quản lý CSDL, giáo viên, học sinh và phân hiệu của trường.
                          </p>
                        </div>
                        <span className="text-[12px] font-black text-blue-700 bg-blue-100/80 px-1.5 py-0.5 rounded mt-2 self-start uppercase">
                          Cấp Trường
                        </span>
                      </label>

                      {/* 2. Ban giám hiệu */}
                      <label className={`p-3 rounded-2xl border-2 cursor-pointer flex flex-col justify-between transition-all ${
                        formData.role === 'bgh' 
                          ? 'border-purple-600 bg-purple-50/70 shadow-xs ring-1 ring-purple-600/30' 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <ShieldAlert className="w-4 h-4 text-purple-600 shrink-0" />
                              <span className="font-black text-xs text-slate-900 uppercase">Ban giám hiệu</span>
                            </div>
                            <input
                              type="radio"
                              name="role"
                              checked={formData.role === 'bgh'}
                              onChange={() => setFormData({ ...formData, role: 'bgh', tenantType: 'school' })}
                              className="w-4 h-4 text-purple-600 shrink-0"
                            />
                          </div>
                          <p className="text-[12px] text-slate-500 leading-snug">
                            Quan sát, xem số liệu, báo cáo, đánh giá và thống kê toàn trường.
                          </p>
                        </div>
                        <span className="text-[12px] font-black text-purple-700 bg-purple-100/80 px-1.5 py-0.5 rounded mt-2 self-start uppercase">
                          Ban Giám Hiệu
                        </span>
                      </label>

                      {/* 3. Giáo viên chủ nhiệm */}
                      <label className={`p-3 rounded-2xl border-2 cursor-pointer flex flex-col justify-between transition-all ${
                        formData.role === 'homeroom' 
                          ? 'border-indigo-600 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-600/30' 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <School className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span className="font-black text-xs text-slate-900 uppercase">Giáo viên chủ nhiệm</span>
                            </div>
                            <input
                              type="radio"
                              name="role"
                              checked={formData.role === 'homeroom'}
                              onChange={() => setFormData({ ...formData, role: 'homeroom', tenantType: 'school' })}
                              className="w-4 h-4 text-indigo-600 shrink-0"
                            />
                          </div>
                          <p className="text-[12px] text-slate-500 leading-snug">
                            Quản lý toàn diện lớp chủ nhiệm, học sinh, điểm danh và thi đua.
                          </p>
                        </div>
                        <span className="text-[12px] font-black text-indigo-700 bg-indigo-100/80 px-1.5 py-0.5 rounded mt-2 self-start uppercase">
                          Lớp Chủ Nhiệm
                        </span>
                      </label>

                      {/* 4. Giáo viên bộ môn */}
                      <label className={`p-3 rounded-2xl border-2 cursor-pointer flex flex-col justify-between transition-all ${
                        formData.role === 'subject' 
                          ? 'border-emerald-600 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-600/30' 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <Laptop className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span className="font-black text-xs text-slate-900 uppercase">Giáo viên bộ môn</span>
                            </div>
                            <input
                              type="radio"
                              name="role"
                              checked={formData.role === 'subject'}
                              onChange={() => setFormData({ ...formData, role: 'subject', tenantType: 'school' })}
                              className="w-4 h-4 text-emerald-700 shrink-0"
                            />
                          </div>
                          <p className="text-[12px] text-slate-500 leading-snug">
                            Giảng dạy bộ môn (Tin học, Tiếng Anh...), chấm điểm, đánh giá.
                          </p>
                        </div>
                        <span className="text-[12px] font-black text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded mt-2 self-start uppercase">
                          Bộ Môn
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* 👑 VAI TRÒ HỆ THỐNG (CHỈ SUPER ADMIN THẤY) */}
                  {isSuperAdmin && (
                    <div>
                      <div className="text-[12px] font-black text-rose-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Crown className="w-3.5 h-3.5" />
                        <span>Vai Trò Quản Trị Hệ Thống (Cấp Cao)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className={`p-3 rounded-2xl border-2 cursor-pointer flex items-center justify-between transition-all ${
                          formData.role === 'guest_admin' 
                            ? 'border-fuchsia-600 bg-fuchsia-50/70 shadow-xs' 
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <Users className="w-4 h-4 text-fuchsia-600 shrink-0" />
                            <div>
                              <div className="font-black text-xs text-slate-900 uppercase">Quản trị tài khoản cá nhân</div>
                              <div className="text-[12px] text-slate-500">Quản trị khối giáo viên tự do, vãng lai không thuộc trường</div>
                            </div>
                          </div>
                          <input
                            type="radio"
                            name="role"
                            checked={formData.role === 'guest_admin'}
                            onChange={() => setFormData({ ...formData, role: 'guest_admin', tenantType: 'guest', schoolName: 'Giáo Viên Cá Nhân' })}
                            className="w-4 h-4 text-fuchsia-600 shrink-0"
                          />
                        </label>

                        <label className={`p-3 rounded-2xl border-2 cursor-pointer flex items-center justify-between transition-all ${
                          formData.role === 'admin' 
                            ? 'border-rose-600 bg-rose-50/70 shadow-xs' 
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
                            <div>
                              <div className="font-black text-xs text-slate-900 uppercase">Quản trị tối cao (Super Admin)</div>
                              <div className="text-[12px] text-slate-500">Toàn quyền cây CSDL trường, tất cả tài khoản, hệ thống</div>
                            </div>
                          </div>
                          <input
                            type="radio"
                            name="role"
                            checked={formData.role === 'admin'}
                            onChange={() => setFormData({ ...formData, role: 'admin' })}
                            className="w-4 h-4 text-rose-600 shrink-0"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Phân vùng lưu trữ: Nhà trường vs Giáo viên cá nhân */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-slate-700 uppercase mb-2">
                    Phân Vùng Triển Khai & Quản Lý Dữ Liệu <span className="text-rose-600">*</span>
                  </label>
                  {isSuperAdmin ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className={`p-3 rounded-2xl border-2 cursor-pointer flex items-center justify-between transition-all ${
                        formData.tenantType === 'school'
                          ? 'border-blue-600 bg-blue-50/60 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}>
                        <div className="flex items-center gap-2.5">
                          <School className="w-4 h-4 text-blue-600" />
                          <div>
                            <div className="text-xs font-black text-slate-900 uppercase">Cấp Cho Tổ Chức Nhà Trường</div>
                            <div className="text-[12px] text-slate-500">Lưu trong cơ sở dữ liệu dùng chung của trường</div>
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="tenantType"
                          checked={formData.tenantType === 'school'}
                          onChange={() => setFormData({ ...formData, tenantType: 'school' })}
                          className="w-4 h-4 text-blue-600"
                        />
                      </label>

                      <label className={`p-3 rounded-2xl border-2 cursor-pointer flex items-center justify-between transition-all ${
                        formData.tenantType === 'guest'
                          ? 'border-purple-600 bg-purple-50/60 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}>
                        <div className="flex items-center gap-2.5">
                          <Users className="w-4 h-4 text-purple-600" />
                          <div>
                            <div className="text-xs font-black text-slate-900 uppercase">Cấp Cho Giáo Viên Cá Nhân</div>
                            <div className="text-[12px] text-slate-500">Thuộc quản lý của Quản trị Tài khoản Cá nhân</div>
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="tenantType"
                          checked={formData.tenantType === 'guest'}
                          onChange={() => setFormData({ ...formData, tenantType: 'guest', schoolName: 'Giáo Viên Cá Nhân' })}
                          className="w-4 h-4 text-purple-600"
                        />
                      </label>
                    </div>
                  ) : isSchoolAdmin ? (
                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center gap-3 text-blue-950">
                      <School className="w-5 h-5 text-blue-600 shrink-0" />
                      <div>
                        <div className="text-xs font-black uppercase">Phân Vùng Nhà Trường: {currentSchoolScope}</div>
                        <div className="text-[12px] text-blue-800">Tài khoản này được lưu trong CSDL của nhà trường và chịu sự quản trị của Quản trị Trường</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-2xl flex items-center gap-3 text-purple-950">
                      <Users className="w-5 h-5 text-purple-600 shrink-0" />
                      <div>
                        <div className="text-xs font-black uppercase">Phân Vùng: Khối Giáo Viên Cá Nhân / Vãng Lai</div>
                        <div className="text-[12px] text-purple-800">Tài khoản này thuộc quyền quản lý của Quản trị Tài khoản Cá nhân</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Conditional fields based on role */}
                {formData.role === 'homeroom' && (
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase mb-1.5">
                      Lớp Chủ Nhiệm Phụ Trách
                    </label>
                    <input
                      type="text"
                      value={formData.assignedClassName}
                      onChange={(e) => setFormData({ ...formData, assignedClassName: e.target.value })}
                      placeholder="Ví dụ: 4A1, 5A2..."
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800"
                    />
                  </div>
                )}

                {formData.role === 'subject' && (
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase mb-1.5">
                      Môn Giảng Dạy Bộ Môn
                    </label>
                    <input
                      type="text"
                      value={formData.subjectName}
                      onChange={(e) => setFormData({ ...formData, subjectName: e.target.value })}
                      placeholder="Ví dụ: Tin học, Tiếng Anh, Mĩ thuật, Âm nhạc..."
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1.5">
                    Số Điện Thoại / Zalo
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Ví dụ: 0988 123 456"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1.5">
                    Email Liên Hệ
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="giaovien@lophoc.edu.vn"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1.5">
                    Đơn Vị Trường Học
                  </label>
                  {isSchoolAdmin ? (
                    <input
                      type="text"
                      value={currentSchoolScope}
                      disabled
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-100 text-xs font-bold text-slate-600 cursor-not-allowed"
                    />
                  ) : isGuestAdmin ? (
                    <input
                      type="text"
                      value="Giáo Viên Cá Nhân"
                      disabled
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-100 text-xs font-bold text-slate-600 cursor-not-allowed"
                    />
                  ) : (
                    <select
                      value={formData.schoolName}
                      onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                    >
                      {schoolsList.map(s => (
                        <option key={s.id} value={s.name}>{s.name} ({s.code})</option>
                      ))}
                      <option value="Giáo Viên Cá Nhân">-- Giáo Viên Cá Nhân / Vãng Lai --</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="border-t border-slate-100 pt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('accounts')}
                  className="px-5 py-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs uppercase"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase shadow-md shadow-indigo-600/25 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {loading ? 'Đang lưu...' : editingUser ? 'LƯU THAY ĐỔI' : 'TẠO TÀI KHOẢN MỚI'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab: Import Excel Template to Batch Create Teacher Accounts (User requirement) */}
        {activeTab === 'import' && (
          <div className="flex-1 overflow-y-auto p-5 md:p-8 flex flex-col space-y-6">
            {/* Intro banner */}
            <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-indigo-700 rounded-3xl p-6 text-white shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black">
                  <FileSpreadsheet className="w-7 h-7 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-black uppercase tracking-tight">
                    Tạo Tài Khoản Cho Giáo Viên Đồng Loạt Bằng Cách Import Biểu Mẫu
                  </h3>
                  <p className="text-xs text-white font-medium mt-0.5">
                    Tải biểu mẫu Excel chuẩn, điền danh sách giáo viên chủ nhiệm & bộ môn, sau đó tải lên để hệ thống tự động khởi tạo độc lập
                  </p>
                </div>
              </div>
            </div>

            {/* 2 Step Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Step 1: Download template */}
              <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-black text-sm flex items-center justify-center">
                      1
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase">Tải Biểu Mẫu Excel Chuẩn (.xlsx)</h4>
                      <p className="text-xs text-slate-500">Đã định dạng sẵn các cột thông tin và dữ liệu mẫu minh họa</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Tải về biểu mẫu <code className="bg-slate-100 text-indigo-700 font-mono font-bold px-1.5 py-0.5 rounded">Bieu_mau_tao_tai_khoan_giao_vien.xlsx</code> chứa các trường: STT, Tên đăng nhập, Mật khẩu, Họ và tên giáo viên, Vai trò (GVCN/GVBM), Lớp/Môn, Số điện thoại, Email, Trường học.
                  </p>
                </div>

                <div className="mt-5">
                  <button
                    onClick={handleDownloadTemplate}
                    className="w-full py-2.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 hover-zoom-btn"
                  >
                    <Download className="w-4 h-4" />
                    <span>TẢI BIỂU MẪU MẪU .XLSX</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Upload Excel */}
              <div className="bg-white border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-3xl p-6 shadow-2xs flex flex-col justify-between transition-colors bg-emerald-50/20">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 font-black text-sm flex items-center justify-center">
                      2
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase">Chọn Tệp Excel Đã Điền</h4>
                      <p className="text-xs text-slate-500">Hỗ trợ các định dạng .xlsx, .xls</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Tải tệp bảng tính Excel chứa danh sách các thầy cô giáo viên cần tạo tài khoản lên để hệ thống tự động kiểm tra và hiển thị bản xem trước.
                  </p>
                </div>

                <div className="mt-5">
                  <label className="w-full py-2.5 px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-center hover-zoom-btn">
                    <Upload className="w-4 h-4" />
                    <span>CHỌN TỆP EXCEL ĐỂ PHÂN TÍCH</span>
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={handleExcelFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Step 3: Preview Table & Confirm Bulk Action */}
            {importPreviewList.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>Kết Quả Kiểm Tra Dữ Liệu ({importPreviewList.length} Dòng)</span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Vui lòng đối chiếu danh sách bên dưới trước khi bấm xác nhận tạo đồng loạt tài khoản.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black">
                      Hợp lệ: {importPreviewList.filter(i => i.isValid).length}
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-black">
                      Lỗi/Trùng: {importPreviewList.filter(i => !i.isValid).length}
                    </span>
                  </div>
                </div>

                {/* Mật khẩu chung cho cả danh sách */}
                <div className={`rounded-2xl border p-4 space-y-2 ${importUseCommonPw ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200'}`}>
                  <label className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={importUseCommonPw} onChange={(e) => setImportUseCommonPw(e.target.checked)} />
                    <span><strong>Dùng 1 mật khẩu chung cho tất cả tài khoản</strong> trong danh sách (bỏ qua cột "Mật khẩu" trong tệp). Thầy cô đăng nhập lần đầu bằng mật khẩu này rồi tự đổi.</span>
                  </label>
                  {importUseCommonPw && (
                    <div className="flex flex-wrap items-center gap-2 pl-6">
                      <input type="text" value={importCommonPw} onChange={(e) => setImportCommonPw(e.target.value)} placeholder="Mật khẩu chung (≥ 6 ký tự)" autoComplete="off"
                        className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono w-64 max-w-full" />
                      {importCommonPw && passwordProblem(importCommonPw) && <span className="text-sm font-bold text-rose-700">{passwordProblem(importCommonPw)}</span>}
                    </div>
                  )}
                </div>

                {/* Preview Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[12px] font-black text-slate-500 uppercase sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-12">STT</th>
                        <th className="py-2.5 px-3">Tên Đăng Nhập</th>
                        <th className="py-2.5 px-3">Mật Khẩu</th>
                        <th className="py-2.5 px-3">Họ & Tên Giáo Viên</th>
                        <th className="py-2.5 px-3 text-center">Vai Trò</th>
                        <th className="py-2.5 px-3">Lớp / Môn</th>
                        <th className="py-2.5 px-3">SĐT</th>
                        <th className="py-2.5 px-3 text-right">Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreviewList.map((item) => (
                        <tr key={item.stt} className={item.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/50'}>
                          <td className="py-2 px-3 text-center font-bold text-slate-400">{item.stt}</td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-800">{item.username || '—'}</td>
                          <td className="py-2 px-3 font-mono text-slate-700">{importUseCommonPw ? (importCommonPw || '—') : (item.password || '123456')}</td>
                          <td className="py-2 px-3 font-bold text-slate-900">{item.fullName}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[12px] font-black uppercase ${
                              item.role === 'homeroom'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {item.role === 'homeroom' ? 'GV Chủ nhiệm' : 'GV Bộ môn'}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-700">
                            {item.role === 'homeroom' ? item.assignedClassName : item.subjectName}
                          </td>
                          <td className="py-2 px-3 text-slate-500 font-mono">{item.phone || '—'}</td>
                          <td className="py-2 px-3 text-right">
                            {item.isValid ? (
                              <span className="inline-flex items-center gap-1 text-[12px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                                <Check className="w-3 h-3" /> Hợp lệ
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[12px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                                <AlertTriangle className="w-3 h-3" /> {item.statusText}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Confirm Button */}
                <div className="flex items-center justify-between pt-3">
                  <button
                    onClick={() => setImportPreviewList([])}
                    className="px-4 py-2 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold uppercase"
                  >
                    HỦY DANH SÁCH XEM TRƯỚC
                  </button>

                  <button
                    onClick={handleConfirmBulkCreate}
                    disabled={loading || importPreviewList.filter(i => i.isValid).length === 0 || (importUseCommonPw && Boolean(passwordProblem(importCommonPw)))}
                    className="py-2.5 px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase shadow-md shadow-emerald-600/25 flex items-center gap-2 disabled:opacity-50 hover-zoom-btn"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>XÁC NHẬN TẠO ({importPreviewList.filter(i => i.isValid).length}) TÀI KHOẢN GIÁO VIÊN</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Real Teacher Data Summary */}
        {activeTab === 'real_data' && (
          <div className="flex-1 overflow-y-auto p-5 md:p-7 flex flex-col space-y-5">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4">
              <div>
                <h3 className="text-sm font-black text-blue-950 uppercase flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <span>Dữ Liệu Thực Tế Của Từng Giáo Viên Trên Hệ Thống</span>
                </h3>
                <p className="text-xs text-blue-800/80 mt-0.5">
                  Dữ liệu được lưu trữ độc lập và cập nhật trực tuyến tức thì khi giáo viên thêm/xóa/sửa lớp hay học sinh.
                </p>
              </div>

              <button
                onClick={loadSummaries}
                disabled={loadingSummaries}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-xs shrink-0 self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSummaries ? 'animate-spin' : ''}`} />
                <span>Cập Nhật Số Liệu Thực</span>
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
                <div className="text-[12px] font-black text-slate-400 uppercase tracking-wider">
                  {isSchoolAdmin ? 'GV Thuộc Trường' : (isGuestAdmin ? 'GV Khối Cá Nhân' : 'Tổng Giáo Viên')}
                </div>
                <div className="text-lg font-black text-slate-800 mt-1">{scopedUsers.length} tài khoản</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
                <div className="text-[12px] font-black text-slate-400 uppercase tracking-wider">Tổng Lớp Đang Dạy</div>
                <div className="text-lg font-black text-blue-600 mt-1">
                  {scopedSummaries.reduce((sum, u) => sum + (u.classCount || 0), 0)} lớp
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
                <div className="text-[12px] font-black text-slate-400 uppercase tracking-wider">Tổng Học Sinh Thực Tế</div>
                <div className="text-lg font-black text-emerald-700 mt-1">
                  {scopedSummaries.reduce((sum, u) => sum + (u.studentCount || 0), 0)} học sinh
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
                <div className="text-[12px] font-black text-slate-400 uppercase tracking-wider">Phạm Vi Quản Lý</div>
                <div className="text-xs font-black text-violet-600 mt-2 truncate">
                  {isSchoolAdmin ? currentSchoolScope : (isGuestAdmin ? 'Khối Giáo Viên Cá Nhân' : 'Toàn Bộ Hệ Thống')}
                </div>
              </div>
            </div>

            {/* Table of Real Teacher Data */}
            <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
              <div className="overflow-x-auto h-full">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[12px] font-black text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-2 text-center w-12">STT</th>
                      <th className="py-2 px-2">Giáo Viên & Tài Khoản</th>
                      <th className="py-2 px-2 text-center">Vai Trò</th>
                      <th className="py-2 px-2">Lớp Học Thực Tế & Sĩ Số</th>
                      <th className="py-2 px-2 text-center">Tổng HS</th>
                      <th className="py-2 px-2">Cập Nhật Gần Nhất</th>
                      <th className="py-2 px-2 text-right">Xem & Tải Dữ Liệu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {scopedSummaries.map((u, idx) => {
                      const isCurrent = currentUser?.username.toLowerCase() === u.username.toLowerCase();
                      return (
                        <tr key={u.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-2 text-center font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2.5">
                              <img 
                                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}&backgroundColor=b6e3f4`}
                                alt={u.fullName}
                                className="w-8 h-8 rounded-full border border-slate-200 object-cover bg-slate-50 shrink-0"
                              />
                              <div>
                                <div className="font-black text-slate-900 flex items-center gap-1.5">
                                  <span>{u.fullName}</span>
                                  {isCurrent && (
                                    <span className="text-[12px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200 uppercase">
                                      ĐANG XEM
                                    </span>
                                  )}
                                </div>
                                <div className="text-[12px] text-slate-500 font-mono">@{u.username}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            {u.role === 'admin' ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[12px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200 whitespace-nowrap">
                                Quản trị tối cao
                              </span>
                            ) : u.role === 'school_admin' ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[12px] font-black uppercase bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">
                                Quản trị trong nhà trường
                              </span>
                            ) : (u.role === 'bgh' || (u as any).isBgh) ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[12px] font-black uppercase bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap">
                                Ban Giám Hiệu
                              </span>
                            ) : u.role === 'homeroom' ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[12px] font-black uppercase bg-indigo-100 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                                Giáo viên chủ nhiệm
                              </span>
                            ) : u.role === 'subject' ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[12px] font-black uppercase bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                Giáo viên bộ môn
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[12px] font-black uppercase bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200 whitespace-nowrap">
                                Quản trị cá nhân
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {u.classes && u.classes.length > 0 ? (
                                u.classes.map((c, cIdx) => (
                                  <span 
                                    key={c.id || cIdx} 
                                    className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[12px] font-bold text-slate-700"
                                    title={`Lớp ${c.name} - ${c.studentCount} học sinh`}
                                  >
                                    {c.name} ({c.studentCount} HS)
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 italic text-[12px]">Chưa khởi tạo lớp</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center font-black text-slate-800">
                            {u.studentCount || 0}
                          </td>
                          <td className="py-2 px-2 text-slate-500 text-[12px]">
                            {u.lastUpdated ? new Date(u.lastUpdated).toLocaleString('vi-VN') : 'Mặc định'}
                          </td>
                          <td className="py-2 px-2 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => handleQuickSwitch(u.username)}
                              disabled={loading || isCurrent}
                              className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[12px] font-black uppercase transition-colors inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                              title="Chuyển vào xem trực tiếp toàn bộ dữ liệu, lớp và học sinh của giáo viên này"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Vào Xem</span>
                            </button>
                            <button
                              onClick={() => handleDownloadTeacherData(u)}
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[12px] font-black uppercase transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Tải về file JSON sao lưu dữ liệu của riêng giáo viên này"
                            >
                              <Download className="w-3 h-3" />
                              <span>Tải JSON</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Audit Logs (Lịch sử thao tác của các tài khoản) */}
        {activeTab === 'logs' && (
          <div className="flex-1 overflow-y-auto p-5 md:p-7 flex flex-col space-y-4">
            {/* Filter and search bar */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                {/* User filter */}
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span>Giáo viên:</span>
                  <select
                    value={selectedLogUser}
                    onChange={(e) => setSelectedLogUser(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">Tất cả giáo viên</option>
                    {allUsers.map(u => (
                      <option key={u.id} value={u.username}>
                        {u.fullName} (@{u.username})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Action filter */}
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <span>Hành động:</span>
                  <select
                    value={selectedLogAction}
                    onChange={(e) => setSelectedLogAction(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">Tất cả thao tác</option>
                    <option value="CREATE_CLASS">Mở thêm lớp học</option>
                    <option value="UPDATE_CLASS">Chỉnh sửa lớp học</option>
                    <option value="DELETE_CLASS">Xóa lớp học</option>
                    <option value="ADD_STUDENT">Thêm mới học sinh</option>
                    <option value="UPDATE_STUDENT">Chỉnh sửa học sinh</option>
                    <option value="DELETE_STUDENT">Xóa học sinh</option>
                    <option value="BATCH_STUDENTS">Thêm hàng loạt học sinh</option>
                    <option value="AWARD_POINTS">Cộng/trừ xu thi đua</option>
                    <option value="ATTENDANCE">Điểm danh lớp</option>
                    <option value="RESTORE_DATA">Khôi phục dữ liệu</option>
                    <option value="OTHER">Đăng nhập / Thao tác khác</option>
                  </select>
                </div>

                {/* Search input */}
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={logSearchTerm}
                    onChange={(e) => setLogSearchTerm(e.target.value)}
                    placeholder="Tìm trong nhật ký..."
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={loadAuditLogs}
                  disabled={loadingLogs}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-black uppercase transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin text-indigo-600' : ''}`} />
                  <span>Làm mới</span>
                </button>
                <button
                  onClick={handleClearLogs}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa lịch sử</span>
                </button>
              </div>
            </div>

            {/* Log List */}
            <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
              <div className="overflow-x-auto h-full">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[12px] font-black text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-2 text-center w-12">STT</th>
                      <th className="py-2 px-2 w-40">Thời Gian</th>
                      <th className="py-2 px-2 w-48">Tài Khoản Thao Tác</th>
                      <th className="py-2 px-2 w-36 text-center">Phân Loại</th>
                      <th className="py-2 px-2">Chi Tiết Thao Tác Thực Tế</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {auditLogs
                      .filter(l => 
                        !logSearchTerm.trim() || 
                        l.description.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
                        l.username.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
                        l.userFullName.toLowerCase().includes(logSearchTerm.toLowerCase())
                      )
                      .map((log, idx) => {
                        const actionColor = 
                          log.actionType === 'DELETE_STUDENT' || log.actionType === 'DELETE_CLASS'
                            ? 'bg-rose-100 text-rose-700 border-rose-200'
                            : log.actionType === 'CREATE_CLASS' || log.actionType === 'ADD_STUDENT' || log.actionType === 'BATCH_STUDENTS'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : log.actionType === 'AWARD_POINTS'
                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : log.actionType === 'ATTENDANCE'
                            ? 'bg-blue-100 text-blue-700 border-blue-200'
                            : log.actionType === 'RESTORE_DATA'
                            ? 'bg-purple-100 text-purple-700 border-purple-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200';

                        const actionLabel = 
                          log.actionType === 'CREATE_CLASS' ? 'Mở thêm lớp' :
                          log.actionType === 'UPDATE_CLASS' ? 'Chỉnh sửa lớp' :
                          log.actionType === 'DELETE_CLASS' ? 'Xóa lớp học' :
                          log.actionType === 'ADD_STUDENT' ? 'Thêm học sinh' :
                          log.actionType === 'UPDATE_STUDENT' ? 'Sửa học sinh' :
                          log.actionType === 'DELETE_STUDENT' ? 'Xóa học sinh' :
                          log.actionType === 'BATCH_STUDENTS' ? 'Thêm hàng loạt' :
                          log.actionType === 'AWARD_POINTS' ? 'Cộng/trừ xu' :
                          log.actionType === 'ATTENDANCE' ? 'Điểm danh' :
                          log.actionType === 'RESTORE_DATA' ? 'Khôi phục dữ liệu' : 'Hoạt động';

                        return (
                          <tr key={log.id || idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3.5 text-center font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono text-[12px] text-slate-600 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{new Date(log.timestamp).toLocaleString('vi-VN')}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5">
                              <div className="font-bold text-slate-900 leading-tight">
                                {log.userFullName}
                              </div>
                              <div className="text-[12px] text-slate-400 font-mono">
                                @{log.username} ({log.role === 'admin' ? 'Quản trị' : log.role === 'subject' ? 'GV Bộ môn' : 'GVCN'})
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[12px] font-black uppercase border ${actionColor}`}>
                                {actionLabel}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-800 font-bold leading-relaxed">
                              {log.description}
                            </td>
                          </tr>
                        );
                      })}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                          Chưa có lịch sử thao tác nào được ghi nhận. Các hoạt động như tạo lớp, xóa học sinh, cho điểm... sẽ hiển thị tại đây theo thời gian thực.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Database & GitHub Sync */}
        {activeTab === 'database' && (
          <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6">
            {/* Database Storage & System Quota Stats Card (Yêu cầu 4) */}
            <div className="bg-gradient-to-br from-sky-700 via-indigo-600 to-indigo-600 text-white rounded-3xl p-6 md:p-7 shadow-xl border border-slate-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-700 text-white flex items-center justify-center font-black shadow-lg shadow-emerald-500/20 shrink-0">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base md:text-lg font-black uppercase tracking-tight">
                        Thống Kê Toàn Bộ Dung Lượng Database Hệ Thống
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[12px] font-black uppercase flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-700 animate-pulse" />
                        Trực Tuyến
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-medium mt-0.5">
                      Đo lường dung lượng tệp JSON máy chủ, phân bổ theo từng giáo viên và bộ nhớ cache trình duyệt
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadStats}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-black rounded-xl border border-white/15 transition-all hover-zoom-btn flex items-center gap-1.5 uppercase"
                    title="Làm mới lại thống kê dung lượng database"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Làm Mới</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCompactDatabase}
                    className="px-3.5 py-2 bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 text-white text-xs font-black rounded-xl shadow-md shadow-emerald-600/25 transition-all hover-zoom-btn flex items-center gap-1.5 uppercase"
                    title="Nén và tối ưu hóa tệp dữ liệu database"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Tối Ưu Hóa DB</span>
                  </button>
                </div>
              </div>

              {/* 4 Primary Storage Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {/* Total File Size */}
                <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-colors">
                  <div className="text-[12px] text-slate-400 uppercase font-black flex items-center justify-between">
                    <span>Tổng Tệp Database</span>
                    <span>💾</span>
                  </div>
                  <div className="text-2xl font-black text-amber-400 mt-1 font-mono">
                    {stats?.formattedSize || `${stats?.fileSizeKB || 0} KB`}
                  </div>
                  <div className="text-[12px] text-slate-400 mt-1">
                    {stats?.fileSizeBytes ? `${stats.fileSizeBytes.toLocaleString()} bytes` : 'data/classroom_database.json'}
                  </div>
                </div>

                {/* User Classroom Data Size */}
                <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-colors">
                  <div className="text-[12px] text-slate-400 uppercase font-black flex items-center justify-between">
                    <span>Dữ Liệu Giáo Viên</span>
                    <span>👥</span>
                  </div>
                  <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">
                    {stats?.storageBreakdown?.userData.sizeKB || 0} KB
                  </div>
                  <div className="text-[12px] text-emerald-300 font-bold mt-1">
                    Chiếm {stats?.storageBreakdown?.userData.percent || 0}% dung lượng
                  </div>
                </div>

                {/* Audit Logs Size */}
                <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-colors">
                  <div className="text-[12px] text-slate-400 uppercase font-black flex items-center justify-between">
                    <span>Nhật Ký Thao Tác</span>
                    <span>📜</span>
                  </div>
                  <div className="text-2xl font-black text-violet-400 mt-1 font-mono">
                    {stats?.storageBreakdown?.auditLogs.sizeKB || 0} KB
                  </div>
                  <div className="text-[12px] text-violet-300 font-bold mt-1">
                    {stats?.storageBreakdown?.auditLogs.count || 0} bản ghi thao tác
                  </div>
                </div>

                {/* Browser LocalStorage Cache */}
                <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-colors">
                  <div className="text-[12px] text-slate-400 uppercase font-black flex items-center justify-between">
                    <span>Bộ Nhớ Trình Duyệt</span>
                    <span>⚡</span>
                  </div>
                  <div className="text-2xl font-black text-cyan-400 mt-1 font-mono">
                    {localUsage?.formatted || '0 KB'}
                  </div>
                  <div className="text-[12px] text-cyan-300 font-bold mt-1">
                    Cache offline trình duyệt
                  </div>
                </div>
              </div>

              {/* Visual Storage Meter & Quota Bar */}
              <div className="bg-black/30 rounded-2xl p-4 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-slate-300 uppercase flex items-center gap-1.5">
                    <span>📊</span>
                    <span>Định Mức Sử Dụng Hệ Thống:</span>
                    <strong className="text-amber-400">{stats?.formattedSize || `${stats?.fileSizeKB || 0} KB`}</strong>
                    <span className="text-slate-400">/ Định mức {stats?.storageQuotaMB || 50} MB</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    Đã dùng: {stats?.percentOfQuota || 0.1}%
                  </span>
                </div>

                {/* Multi-segment Progress Bar */}
                <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
                  <div 
                    className="h-full bg-emerald-700 transition-all duration-500" 
                    style={{ width: `${Math.max(stats?.storageBreakdown?.userData.percent || 60, 5)}%` }}
                    title={`Dữ liệu Giáo viên: ${stats?.storageBreakdown?.userData.sizeKB || 0} KB`}
                  />
                  <div 
                    className="h-full bg-violet-600 transition-all duration-500" 
                    style={{ width: `${Math.max(stats?.storageBreakdown?.auditLogs.percent || 25, 5)}%` }}
                    title={`Nhật ký Audit: ${stats?.storageBreakdown?.auditLogs.sizeKB || 0} KB`}
                  />
                  <div 
                    className="h-full bg-amber-700 transition-all duration-500" 
                    style={{ width: `${Math.max(stats?.storageBreakdown?.users.percent || 15, 3)}%` }}
                    title={`Tài khoản người dùng: ${stats?.storageBreakdown?.users.sizeKB || 0} KB`}
                  />
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-between text-[12px] text-slate-400 pt-1">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-700" />
                      <span>Dữ liệu học tập các lớp ({stats?.storageBreakdown?.userData.percent || 0}%)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-violet-600" />
                      <span>Nhật ký Audit Logs ({stats?.storageBreakdown?.auditLogs.percent || 0}%)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-700" />
                      <span>Hồ sơ Tài khoản ({stats?.storageBreakdown?.users.percent || 0}%)</span>
                    </span>
                  </div>

                  <span className="text-[12px] text-slate-400 font-mono">
                    Đồng bộ lần cuối: <strong className="text-slate-200">{stats?.lastSync ? new Date(stats.lastSync).toLocaleString('vi-VN') : 'Vừa xong'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* BẢNG THỐNG KÊ CHI TIẾT DUNG LƯỢNG TỪNG TÀI KHOẢN GIÁO VIÊN (Yêu cầu 4) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-600" />
                    <span>Chi Tiết Dung Lượng Sử Dụng Theo Từng Tài Khoản Giáo Viên</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Thống kê số lượng lớp, số học sinh và dung lượng dữ liệu độc lập của từng giáo viên trong database
                  </p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-indigo-50 text-indigo-700 font-black text-xs border border-indigo-200 uppercase">
                  {scopedUserBreakdown.length} Tài Khoản
                </span>
              </div>

              <div className="flex-1 overflow-x-auto border border-slate-200 rounded-2xl bg-white min-h-[250px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-black uppercase text-[12px] border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-2">Tài Khoản / Họ Tên</th>
                      <th className="py-3 px-3">Vai Trò</th>
                      <th className="py-3 px-3 text-center">Số Lớp</th>
                      <th className="py-3 px-3 text-center">Số Học Sinh</th>
                      <th className="py-3 px-3 text-right">Dung Lượng (KB)</th>
                      <th className="py-3 px-3 text-center">% Chiếm Dụng</th>
                      <th className="py-3 px-3 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {scopedUserBreakdown.length > 0 ? (
                      scopedUserBreakdown.map((item) => (
                        <tr key={item.username} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-2">
                            <div className="font-black text-slate-900">{item.fullName}</div>
                            <div className="text-[12px] font-mono text-indigo-600">@{item.username}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[12px] font-black uppercase inline-block ${
                              item.role === 'admin'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : item.role === 'homeroom'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {item.role === 'admin' ? 'Quản Trị' : item.role === 'homeroom' ? 'Chủ Nhiệm' : 'Bộ Môn'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-700">
                            {item.classesCount} lớp
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-700">
                            {item.studentsCount} HS
                          </td>
                          <td className="py-3 px-3 text-right font-black font-mono text-indigo-900">
                            {item.sizeKB} KB
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-bold font-mono text-[12px]">
                              {item.percentOfTotal}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDownloadTeacherData({ username: item.username, fullName: item.fullName, role: item.role })}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg border border-indigo-200 transition-colors"
                                title="Tải xuống tệp dữ liệu của giáo viên này"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickSwitch(item.username)}
                                className="px-2 py-1 text-[12px] font-black text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors uppercase"
                                title="Chuyển sang tài khoản này"
                              >
                                Xem
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      allUsers.map((u) => (
                        <tr key={uidOf(u)} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-2">
                            <div className="font-black text-slate-900">{u.fullName}</div>
                            <div className="text-[12px] font-mono text-indigo-600">@{u.username}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[12px] font-black uppercase bg-slate-100 text-slate-700">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-700">1 lớp</td>
                          <td className="py-3 px-3 text-center font-bold text-slate-700">30 HS</td>
                          <td className="py-3 px-3 text-right font-black font-mono text-indigo-900">~12 KB</td>
                          <td className="py-3 px-3 text-center font-mono">15%</td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleQuickSwitch(u.username)}
                              className="px-2 py-1 text-[12px] font-black text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors uppercase"
                            >
                              Xem
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Storage & Backup / Restore Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Box 1: Export DB */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase">Xuất Cơ Sở Dữ Liệu (.json)</h4>
                      <p className="text-xs text-slate-500">Tải về toàn bộ tài khoản và cơ sở dữ liệu để lưu trữ dự phòng an toàn</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-2">
                    Tải về tệp <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono">classroom_database.json</code> chứa toàn bộ tài khoản giáo viên, điểm số, học sinh, thời khóa biểu để lưu trữ an toàn trên máy tính hoặc Google Drive.
                  </p>
                </div>
                <div className="mt-5">
                  <button
                    onClick={handleExportDatabase}
                    className="w-full py-2.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>TẢI VỀ TỆP DATABASE (.JSON)</span>
                  </button>
                </div>
              </div>

              {/* Box 2: Import DB */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase">Khôi Phục Cơ Sở Dữ Liệu (.JSON)</h4>
                      <p className="text-xs text-slate-500">Nhập tệp sao lưu database JSON để cập nhật toàn hệ thống</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-2">
                    Tải tệp database JSON đã lưu từ máy tính hoặc Google Drive lên để khôi phục nhanh mọi tài khoản và dữ liệu lớp học mà không mất thông tin.
                  </p>
                </div>
                <div className="mt-5">
                  <label className="w-full py-2.5 px-4 rounded-2xl border-2 border-dashed border-emerald-400 hover:border-emerald-600 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 font-black text-xs uppercase transition-all flex items-center justify-center gap-2 cursor-pointer text-center">
                    <Upload className="w-4 h-4 text-emerald-600" />
                    <span>CHỌN FILE .JSON ĐỂ KHÔI PHỤC</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportDatabase}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* KHU VỰC QUẢN LÝ DỮ LIỆU & CHUẨN BỊ NĂM HỌC MỚI (Yêu cầu c, d, e) */}
            <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-600 border-2 border-indigo-500/30 rounded-3xl p-6 text-white shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400 text-indigo-300 flex items-center justify-center font-black">
                    {isGuestAdmin ? <Users className="w-6 h-6" /> : <School className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm md:text-base font-black uppercase tracking-wide">
                        {isSchoolAdmin 
                          ? `Khởi Động & Chuẩn Bị Cho Năm Học Mới`
                          : isGuestAdmin 
                            ? `Khởi Động & Chuẩn Bị Năm Học Mới (Khối Cá Nhân)`
                            : `Khởi Động & Chuẩn Bị Cho Năm Học Mới`}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[12px] font-black uppercase border border-amber-500/30">
                        {isSchoolAdmin ? 'Cấp Trường' : isGuestAdmin ? 'Khối Cá Nhân' : 'Phân Vùng Hệ Thống'}
                      </span>
                    </div>
                    <p className="text-xs text-white mt-0.5">
                      {isSchoolAdmin 
                        ? `Tải về Data JSON của ${currentSchoolScope}, nạp dữ liệu hoặc dọn dẹp dữ liệu cũ đón năm học mới.`
                        : isGuestAdmin 
                          ? `Tải về Data JSON khối giáo viên cá nhân, nạp dữ liệu hoặc dọn dẹp dữ liệu cũ đón năm học mới.`
                          : `Quản trị Data JSON theo từng trường hoặc khối cá nhân, dọn dẹp và bảo toàn tài khoản đón năm học mới.`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (isGuestAdmin) {
                      setTargetResetScope('guest');
                    } else if (isSchoolAdmin) {
                      setTargetResetScope('school');
                      setSelectedResetSchoolName(currentSchoolScope);
                    }
                    setSchoolResetMode('keep_teachers');
                    setSchoolResetConfirmCode('');
                    setSchoolResetModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-700 hover:from-rose-700 hover:to-amber-800 text-white font-black text-xs uppercase shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 shrink-0 cursor-pointer hover:scale-102"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Dọn Dẹp Dữ Liệu Năm Học Mới</span>
                </button>
              </div>

              {/* Action Buttons: Scoped by Role */}
              {isGuestAdmin ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-black text-white">Xuất Data JSON Khối Cá Nhân</div>
                      <div className="text-[12px] text-slate-300">Tải về toàn bộ thông tin lớp & học sinh của GV cá nhân</div>
                    </div>
                    <button
                      onClick={() => handleExportScoped('guest')}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải Về</span>
                    </button>
                  </div>

                  <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-black text-white">Nhập Data JSON Khối Cá Nhân</div>
                      <div className="text-[12px] text-slate-300">Khôi phục danh sách GV cá nhân từ file đã lưu</div>
                    </div>
                    <label className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase transition-colors flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                      <input type="file" accept=".json" onChange={(e) => handleImportScoped(e, 'guest')} className="hidden" />
                    </label>
                  </div>
                </div>
              ) : isSchoolAdmin ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-black text-white">Xuất Data JSON Nhà Trường</div>
                      <div className="text-[12px] text-slate-300">Tải về toàn bộ thông tin lớp & học sinh của {currentSchoolScope}</div>
                    </div>
                    <button
                      onClick={() => handleExportScoped('school')}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải Về</span>
                    </button>
                  </div>

                  <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-black text-white">Nhập Data JSON Nhà Trường</div>
                      <div className="text-[12px] text-slate-300">Khôi phục danh sách trường từ file backup</div>
                    </div>
                    <label className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase transition-colors flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                      <input type="file" accept=".json" onChange={(e) => handleImportScoped(e, 'school')} className="hidden" />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                      <div>
                        <div className="text-xs font-black text-white">Xuất Data JSON Khối Nhà Trường</div>
                        <div className="text-[12px] text-slate-300">Tải về dữ liệu các trường học đã cấu hình</div>
                      </div>
                      <button
                        onClick={() => handleExportScoped('school')}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải Về</span>
                      </button>
                    </div>

                    <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                      <div>
                        <div className="text-xs font-black text-white">Xuất Data JSON Khối Cá Nhân</div>
                        <div className="text-[12px] text-slate-300">Tải về dữ liệu khối giáo viên vãng lai</div>
                      </div>
                      <button
                        onClick={() => handleExportScoped('guest')}
                        className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải Về</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Architecture note */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 leading-relaxed">
              <span className="font-black">📌 Hướng dẫn vận hành với GitHub Server:</span>
              <ul className="list-disc pl-5 mt-1.5 space-y-1">
                <li>Dữ liệu được lưu trữ tự động trong thư mục <code className="bg-amber-100 px-1 rounded font-mono font-bold">data/classroom_database.json</code> ngay trên máy chủ Node.js/Express.</li>
                <li>Khi bạn đẩy mã nguồn lên GitHub (git commit & git push), file database này được bảo toàn và mang theo đầy đủ thông tin các giáo viên và lớp học.</li>
                <li>Tài khoản giáo viên vãng lai được phân vùng lưu trữ độc lập, không bị ảnh hưởng khi nhà trường dọn dẹp dữ liệu năm học mới.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab: Registrations (Danh sách đơn đăng ký sử dụng bản quyền - Yêu cầu 4) */}
        {activeTab === 'registrations' && (
          <div className="flex-1 overflow-y-auto p-5 md:p-7 flex flex-col space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-700 text-white flex items-center justify-center font-black shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">
                    Danh Sách Đơn Đăng Ký Sử Dụng Phần Mềm
                  </h3>
                  <p className="text-xs text-slate-600">
                    Tổng hợp các yêu cầu đăng ký bản quyền từ Quý Thầy/Cô và các Tổ chức Nhà trường
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadRegistrations}
                  disabled={loadingRegistrations}
                  className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-black uppercase transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-600 ${loadingRegistrations ? 'animate-spin' : ''}`} />
                  <span>Làm Mới</span>
                </button>
                <span className="px-3 py-1.5 rounded-xl bg-amber-700 text-white font-black text-xs uppercase shadow-xs">
                  {registrations.length} Đơn Đăng Ký
                </span>
              </div>
            </div>

            {/* Table of Registrations */}
            <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
              <div className="overflow-x-auto h-full">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-white border-b-2 border-slate-300 text-[12px] font-black text-emerald-700 tracking-wider sticky top-0 z-10">
                    <tr>
                      <th rowSpan={2} className="py-2 px-2 text-center w-12 border-r border-slate-300 border-l border-slate-300 border-t border-slate-300">STT</th>
                      <th rowSpan={2} className="py-2 px-2 border-r border-slate-300 border-t border-slate-300 text-center">Họ và tên Thầy / Cô</th>
                      <th rowSpan={2} className="py-2 px-2 border-r border-slate-300 border-t border-slate-300 text-center">Chức vụ công tác</th>
                      <th rowSpan={2} className="py-2 px-2 border-r border-slate-300 border-t border-slate-300 text-center">Đơn vị trường học / Công tác</th>
                      <th rowSpan={2} className="py-2 px-2 border-r border-slate-300 border-t border-slate-300 text-center">Số điện thoại ZALO</th>
                      <th rowSpan={2} className="py-2 px-2 border-r border-slate-300 border-t border-slate-300 text-center">Yêu cầu đề nghị</th>
                      <th rowSpan={2} className="py-2 px-2 border-r border-slate-300 border-t border-slate-300 text-center">Vai trò tài khoản</th>
                      <th rowSpan={2} className="py-2 px-2 border-r border-slate-300 border-t border-slate-300 text-center">Thời gian gửi yêu cầu</th>
                      <th colSpan={2} className="py-1 px-2 text-center border-b border-slate-300 border-r border-slate-300 border-t border-slate-300">Trạng thái hồ sơ</th>
                      <th rowSpan={2} className="py-2 px-2 text-center border-r border-slate-300 border-t border-slate-300">Ghi chú</th>
                      <th rowSpan={2} className="py-2 px-2 text-center border-r border-slate-300 border-t border-slate-300 w-20">Thao tác</th>
                    </tr>
                    <tr>
                      <th className="py-1 px-2 text-center text-green-700 border-r border-slate-300">Đã giải quyết</th>
                      <th className="py-1 px-2 text-center text-red-600 border-r border-slate-300">Chưa giải quyết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300 font-medium bg-white">
                    {registrations.map((reg, idx) => (
                      <tr key={reg.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-2 text-center text-slate-700 border-r border-slate-300 border-l border-slate-300">{idx + 1}</td>
                        <td className="py-2 px-2 text-slate-700 border-r border-slate-300 text-center">{reg.fullName}</td>
                        <td className="py-2 px-2 text-slate-700 border-r border-slate-300 text-center">{reg.roleTitle || 'Giáo viên'}</td>
                        <td className="py-2 px-2 text-slate-700 border-r border-slate-300 text-center">{reg.schoolName || '—'}</td>
                        <td className="py-2 px-2 text-slate-700 border-r border-slate-300 text-center">{reg.phone}</td>
                        <td className="py-2 px-2 text-slate-700 border-r border-slate-300 text-center">
                          {reg.requestType || (reg.type === 'school' ? 'Cấp cho tổ chức nhà trường' : 'Cấp tài khoản cá nhân')}
                        </td>
                        <td className="py-2 px-2 text-slate-700 border-r border-slate-300 text-center">
                          {reg.accountRole || (reg.type === 'school' ? 'Quản trị nhà trường' : (reg.roleTitle || 'Giáo viên bộ môn'))}
                        </td>
                        <td className="py-2 px-2 text-slate-700 border-r border-slate-300 text-center">
                          {reg.createdAt ? (
                            <>
                              {new Date(reg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} Ngày {new Date(reg.createdAt).toLocaleDateString('vi-VN')}
                            </>
                          ) : 'Mới đây'}
                        </td>
                        <td className="py-2 px-2 text-center border-r border-slate-300">
                          <button
                            onClick={() => { if (reg.status !== 'approved') handleApproveRegistration(reg); }}
                            className={`w-4 h-4 mx-auto rounded-sm flex items-center justify-center transition-colors border ${
                              reg.status === 'approved' ? 'bg-green-700 border-green-500 text-white' : 'bg-white border-slate-400 hover:border-green-500'
                            }`}
                            title="Đánh dấu Đã giải quyết (Duyệt)"
                          >
                            {reg.status === 'approved' && <Check className="w-3 h-3" strokeWidth={3} />}
                          </button>
                        </td>
                        <td className="py-2 px-2 text-center border-r border-slate-300">
                          <button
                            onClick={() => { if (reg.status === 'approved') handleOpenRejectModal(reg.id); }}
                            className={`w-4 h-4 mx-auto rounded-sm flex items-center justify-center transition-colors border ${
                              reg.status !== 'approved' ? 'bg-red-600 border-red-500 text-white' : 'bg-white border-slate-400 hover:border-red-500'
                            }`}
                            title={reg.status !== 'approved' ? "Đang Chưa giải quyết" : "Hủy duyệt / Đánh dấu Chưa giải quyết"}
                          >
                            {reg.status !== 'approved' && <Check className="w-3 h-3" strokeWidth={3} />}
                          </button>
                        </td>
                        <td className="py-2 px-2 text-slate-700 border-r border-slate-300 text-center">
                          {reg.status === 'approved' ? 'Đã khởi tạo' : (reg.rejectReason || '')}
                        </td>
                        <td className="py-2 px-2 text-center border-r border-slate-300">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditRegistrationModal(reg)}
                              className="p-1 hover:bg-slate-100 rounded text-indigo-600 transition-colors"
                              title="Sửa"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteRegistration(reg.id)}
                              className="p-1 hover:bg-slate-100 rounded text-red-600 transition-colors"
                              title="Xóa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {registrations.length === 0 && (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-400 italic">
                          Chưa có đơn đăng ký sử dụng nào được gửi lên.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Xác Nhận Dọn Dẹp / Xóa Dữ Liệu Năm Học Mới (Yêu cầu 3 & c, d, e) */}
      {schoolResetModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-black shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">
                  {isSchoolAdmin 
                    ? `Dọn Dẹp Dữ Liệu Năm Học Mới (${currentSchoolScope})`
                    : isGuestAdmin 
                      ? `Dọn Dẹp Dữ Liệu Năm Học Mới (Khối Cá Nhân)`
                      : `Dọn Dẹp Dữ Liệu Năm Học Mới`}
                </h3>
                <p className="text-xs text-slate-500">
                  {isSchoolAdmin 
                    ? `Làm mới thông tin lớp, học sinh cho trường ${currentSchoolScope}`
                    : isGuestAdmin
                      ? `Làm mới thông tin lớp, học sinh cho khối giáo viên cá nhân`
                      : `Làm mới dữ liệu để chuẩn bị cho năm học tiếp theo`}
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {/* Scope selector for Super Admin */}
              {isSuperAdmin && (
                <div className="p-3 bg-slate-100 rounded-2xl space-y-2">
                  <label className="text-xs font-black text-slate-700 uppercase block">
                    Chọn Phân Vùng Cần Dọn Dẹp:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetResetScope('school')}
                      className={`p-2 rounded-xl text-xs font-black uppercase border transition-all ${
                        targetResetScope === 'school' ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      🏫 Áp Dụng Cho Trường
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetResetScope('guest')}
                      className={`p-2 rounded-xl text-xs font-black uppercase border transition-all ${
                        targetResetScope === 'guest' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      👤 Khối GV Cá Nhân
                    </button>
                  </div>
                  {targetResetScope === 'school' && (
                    <div className="pt-1">
                      <label className="text-[12px] font-bold text-slate-600 block mb-1">Chọn Trường Cần Dọn Dẹp:</label>
                      <select
                        value={selectedResetSchoolName}
                        onChange={(e) => setSelectedResetSchoolName(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                      >
                        {schoolsList.map(s => (
                          <option key={s.id} value={s.name}>{s.name} ({s.code})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <label className="text-xs font-black text-slate-700 uppercase block">
                Chọn phương án dọn dẹp dữ liệu:
              </label>

              {/* Option 1: Keep Teachers */}
              <div 
                onClick={() => setSchoolResetMode('keep_teachers')}
                className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                  schoolResetMode === 'keep_teachers'
                    ? 'border-indigo-600 bg-indigo-50/70'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-indigo-900 uppercase">
                    Phương án 1 (Khuyên Dùng)
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[12px] font-black uppercase">
                    Bảo Toàn User
                  </span>
                </div>
                <div className="text-xs text-slate-700 mt-1 font-bold">
                  Xóa dữ liệu lớp học, học sinh, điểm thi đua để nhập lớp mới.
                </div>
                <div className="text-[12px] text-emerald-700 font-bold mt-0.5">
                  ✓ GIỮ NGUYÊN tài khoản đăng nhập của các giáo viên thuộc phạm vi này.
                </div>
              </div>

              {/* Option 2: Full Wipe */}
              <div 
                onClick={() => setSchoolResetMode('full')}
                className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                  schoolResetMode === 'full'
                    ? 'border-rose-600 bg-rose-50/70'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-rose-900 uppercase">
                    Phương án 2 (Triệt để)
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[12px] font-black uppercase">
                    Xóa Hết
                  </span>
                </div>
                <div className="text-xs text-slate-700 mt-1 font-bold">
                  Xóa toàn bộ thông tin lớp học, học sinh VÀ toàn bộ tài khoản giáo viên thuộc phạm vi này.
                </div>
                <div className="text-[12px] text-slate-500 mt-0.5">
                  (Chỉ giữ lại tài khoản Quản trị Admin và các tài khoản Demo).
                </div>
              </div>

              <div className="pt-2">
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  Nhập chính xác cụm từ <strong className="text-rose-600 font-mono">DONG Y XOA</strong> để xác nhận:
                </label>
                <input
                  type="text"
                  value={schoolResetConfirmCode}
                  onChange={(e) => setSchoolResetConfirmCode(e.target.value)}
                  placeholder="DONG Y XOA"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSchoolResetModalOpen(false)}
                disabled={isResettingSchool}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase transition-colors"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleExecuteResetSchool}
                disabled={isResettingSchool || schoolResetConfirmCode.trim().toUpperCase() !== 'DONG Y XOA'}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-black uppercase shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5"
              >
                {isResettingSchool ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Xác Nhận Dọn Dẹp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm Mới / Sửa CSDL Trường Học (Multi-tenant SaaS: Super Admin) */}
      {schoolModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Nếu vừa khởi tạo thành công -> Hiển thị Phiếu Bàn Giao Tài Khoản BGH */}
            {provisionedSchoolInfo ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-black shadow-md shadow-emerald-600/20 shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase">
                      Khởi Tạo CSDL & Cấp Tài Khoản BGH Thành Công!
                    </h3>
                    <p className="text-xs text-slate-500">
                      Phiếu bàn giao thông tin đăng nhập dành cho Ban Giám Hiệu
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Trường học:</span>
                    <span className="font-black text-slate-900">{provisionedSchoolInfo.schoolName}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Mã trường:</span>
                    <span className="font-mono font-bold text-indigo-700">{provisionedSchoolInfo.code}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Đại diện BGH:</span>
                    <span className="font-bold text-slate-800">{provisionedSchoolInfo.fullName}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Tài khoản BGH:</span>
                    <span className="font-mono font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                      @{provisionedSchoolInfo.username}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">Mật khẩu khởi tạo:</span>
                    <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                      {provisionedSchoolInfo.password || '123456'}
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-[12px] text-blue-900 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Quy trình bàn giao phân cấp SaaS:</strong> Bàn giao tài khoản này cho Ban Giám Hiệu nhà trường. BGH đăng nhập bằng tài khoản trên để tự tạo danh sách GVCN, GVBM. Sau đó các giáo viên đăng nhập tự mở lớp và cập nhật học sinh.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const textToCopy = `THÔNG TIN BÀN GIAO PHẦN MỀM LỚP HỌC HẠNH PHÚC\n- Đơn vị: ${provisionedSchoolInfo.schoolName}\n- Mã trường: ${provisionedSchoolInfo.code}\n- Tài khoản BGH: ${provisionedSchoolInfo.username}\n- Mật khẩu khởi tạo: ${provisionedSchoolInfo.password || '123456'}\n- Cổng đăng nhập: Quản trị Nhà Trường (BGH)\n- Địa chỉ trang web: ${window.location.origin}`;
                      navigator.clipboard.writeText(textToCopy);
                      showNotify('success', 'Đã sao chép thông tin bàn giao vào clipboard!');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao Chép Bàn Giao</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProvisionedSchoolInfo(null);
                      setSchoolModalOpen(false);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-800 text-xs font-bold uppercase transition-colors cursor-pointer"
                  >
                    Hoàn Tất & Đóng
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase">
                        {editingSchool ? 'Chỉnh Sửa Thông Tin CSDL Trường' : 'Khởi Tạo Cơ Sở Dữ Liệu Trường Mới (Nhánh 1)'}
                      </h3>
                      <p className="text-[12px] text-slate-500">
                        Khởi tạo danh mục & cơ sở dữ liệu trường học mới trong hệ thống
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSchoolModalOpen(false)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveSchool} className="space-y-4 pt-2">
                  {/* Thông tin trường học */}
                  <div className="space-y-3">
                    <div className="text-[12px] font-black uppercase text-slate-500 flex items-center gap-1.5">
                      <School className="w-3.5 h-3.5 text-blue-600" />
                      <span>THÔNG TIN CƠ SỞ DỮ LIỆU TRƯỜNG HỌC</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Tên Trường Học <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={schoolFormData.name}
                        onChange={(e) => handleSchoolNameChange(e.target.value)}
                        placeholder="Ví dụ: Trường Tiểu học Hoa Sen"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                          Mã Trường <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={schoolFormData.code}
                          onChange={(e) => setSchoolFormData({ ...schoolFormData, code: e.target.value.toUpperCase() })}
                          placeholder="TH_HOASEN"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                          Số Điện Thoại
                        </label>
                        <input
                          type="text"
                          value={schoolFormData.phone}
                          onChange={(e) => setSchoolFormData({ ...schoolFormData, phone: e.target.value })}
                          placeholder="0888 123 456"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Địa Chỉ Trường
                      </label>
                      <input
                        type="text"
                        value={schoolFormData.address}
                        onChange={(e) => setSchoolFormData({ ...schoolFormData, address: e.target.value })}
                        placeholder="Quận/Huyện, Tỉnh/Thành phố"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                      />
                    </div>
                  </div>

                  {/* ✅ OPTIONAL: Checkbox cấp tài khoản BGH ngay khi tạo trường */}
                  {!editingSchool && (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setCreateAdminAccount(prev => !prev)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                          createAdminAccount
                            ? 'bg-indigo-50 border-b border-indigo-200'
                            : 'bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                          createAdminAccount
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'bg-white border-slate-300'
                        }`}>
                          {createAdminAccount && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-black text-slate-800">Đồng thời khởi tạo tài khoản Quản trị BGH</div>
                          <div className="text-[12px] text-slate-500 mt-0.5">
                            {createAdminAccount
                              ? 'Sẽ tạo tài khoản Ban Giám Hiệu ngay bây giờ'
                              : 'Có thể cấp tài khoản sau tại danh mục trường học'}
                          </div>
                        </div>
                        <span className={`text-[12px] font-black px-2 py-0.5 rounded-full ${
                          createAdminAccount
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200 text-slate-500'
                        }`}>
                          {createAdminAccount ? 'BẬT' : 'TẮT'}
                        </span>
                      </button>

                      {createAdminAccount && (
                        <div className="p-4 space-y-3 bg-indigo-50/50">
                          <div className="text-[12px] font-black uppercase text-indigo-700 flex items-center gap-1.5">
                            <Crown className="w-3.5 h-3.5" />
                            <span>THÔNG TIN TÀI KHOẢN BAN GIÁM HIỆU</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                Tên Đăng Nhập BGH <span className="text-rose-600">*</span>
                              </label>
                              <input
                                type="text"
                                value={schoolFormData.adminUsername}
                                onChange={(e) => setSchoolFormData({ ...schoolFormData, adminUsername: e.target.value.toLowerCase().replace(/\s/g,'') })}
                                placeholder="bgh_hoasen"
                                className="w-full px-3.5 py-2 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                Mật Khẩu Khởi Tạo
                              </label>
                              <div className="relative">
                                <input
                                  type={showSchoolPassword ? 'text' : 'password'}
                                  value={schoolFormData.adminPassword}
                                  onChange={(e) => setSchoolFormData({ ...schoolFormData, adminPassword: e.target.value })}
                                  placeholder="123456"
                                  className="w-full px-3.5 py-2 pr-10 rounded-xl border border-indigo-200 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowSchoolPassword(p => !p)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                  {showSchoolPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                              Họ Tên Đại Diện BGH
                            </label>
                            <input
                              type="text"
                              value={schoolFormData.adminFullName}
                              onChange={(e) => setSchoolFormData({ ...schoolFormData, adminFullName: e.target.value })}
                              placeholder={`Ban Giám Hiệu ${schoolFormData.name || '...'}`}
                              className="w-full px-3.5 py-2 rounded-xl border border-indigo-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setSchoolModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase transition-colors cursor-pointer"
                    >
                      Hủy Bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className={`px-5 py-2 rounded-xl text-white text-xs font-black uppercase shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                        createAdminAccount && !editingSchool
                          ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                          : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {editingSchool
                          ? 'LƯU CSDL TRƯỜNG'
                          : createAdminAccount
                            ? 'TẠO CSDL & CẤP TK BGH'
                            : 'KHỞI TẠO CSDL TRƯỜNG MỚI'}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🚀 MODAL DI CHUYỂN TOÀN BỘ CSDL GIÁO VIÊN VÀO NHÀ TRƯỜNG (SUPER ADMIN) */}
      {transferModalOpen && userToTransfer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/30 border border-purple-300/40 text-white flex items-center justify-center font-black shadow-inner">
                  <Building2 className="w-5 h-5 text-purple-200" />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                    <span>GÁN CSDL GIÁO VIÊN VÀO NHÀ TRƯỜNG</span>
                    <span className="text-[12px] bg-purple-400/30 text-white px-2 py-0.5 rounded-full border border-purple-300/30 font-bold">
                      Bảo Toàn 100%
                    </span>
                  </h4>
                  <p className="text-xs text-white font-medium">
                    Di chuyển tài khoản, lớp học, học sinh từ Vãng Lai sang Nhà Trường trực thuộc
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTransferModalOpen(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleConfirmTransfer} className="p-5 md:p-6 space-y-4 text-xs">
              {/* Card thông tin giáo viên đang chọn */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-start gap-3">
                <img
                  src={userToTransfer.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + userToTransfer.username}
                  alt={userToTransfer.fullName}
                  className="w-11 h-11 rounded-2xl border border-purple-200 bg-white object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-black text-slate-900 text-sm">{userToTransfer.fullName}</div>
                    <code className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-mono font-bold text-[12px] border border-indigo-200">
                      @{userToTransfer.username}
                    </code>
                  </div>
                  <div className="text-slate-500 mt-0.5 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-bold text-slate-700">
                      {userToTransfer.role === 'homeroom' ? `GV Chủ nhiệm (${userToTransfer.assignedClassName || 'Lớp chưa gán'})` : `GV Bộ môn (${userToTransfer.subjectName || 'Môn chưa gán'})`}
                    </span>
                    <span>• SĐT: <strong>{userToTransfer.phone || 'Chưa cập nhật'}</strong></span>
                  </div>

                  {/* Thống kê dữ liệu hiện có từ userSummaries */}
                  {(() => {
                    const summary = userSummaries.find(s => s.username.toLowerCase() === userToTransfer.username.toLowerCase());
                    return (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-purple-100 text-purple-800 font-black text-[12px] border border-purple-200">
                          {userToTransfer.tenantType === 'guest' ? '📍 Đang là: Vãng Lai Tỉnh Lẻ' : `📍 Trường cũ: ${userToTransfer.schoolName || 'Chưa có'}`}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 font-bold text-[12px] border border-emerald-200">
                          📚 {summary ? summary.classCount : 1} Lớp học
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-800 font-bold text-[12px] border border-blue-200">
                          🎒 {summary ? summary.studentCount : 0} Học sinh
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Chọn Trường học đích cần gán */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-800 uppercase flex items-center justify-between">
                  <span>CHỌN ĐƠN VỊ TRƯỜNG HỌC ĐÍCH ĐƯỢC GÁN <span className="text-rose-600">*</span></span>
                  <span className="text-[12px] text-blue-600 font-bold">({schoolsList.length} trường khả dụng)</span>
                </label>
                <select
                  value={targetSchoolName}
                  onChange={(e) => setTargetSchoolName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-black text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                >
                  {schoolsList.map(s => (
                    <option key={s.id} value={s.name}>
                      🏫 {s.name} ({s.code}) - Quản trị: @{s.adminUsername || '—'}
                    </option>
                  ))}
                  <option value="__custom__">➕ Nhập tên trường học mới khác...</option>
                </select>

                {targetSchoolName === '__custom__' && (
                  <div className="pt-1 animate-in fade-in duration-100">
                    <input
                      type="text"
                      value={customSchoolName}
                      onChange={(e) => setCustomSchoolName(e.target.value)}
                      placeholder="Nhập tên trường học mới cần gán (Ví dụ: TIỂU HỌC NGUYỄN DU)..."
                      className="w-full px-3.5 py-2 rounded-xl border border-purple-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Cam kết nghiệp vụ & Bảo toàn dữ liệu (Zero Data Loss Protocol) */}
              <div className="p-3.5 bg-gradient-to-br from-emerald-50/70 to-blue-50/70 border border-emerald-200 rounded-2xl space-y-2">
                <div className="text-[12px] font-black text-emerald-900 uppercase flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>CAM KẾT BẢO TOÀN DỮ LIỆU & PHÂN QUYỀN ĐƠN VỊ (CHUẨN HÓA)</span>
                </div>
                <ul className="space-y-1.5 text-[12px] text-slate-700 font-medium">
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Bảo toàn tài khoản:</strong> Mật khẩu và thông tin đăng nhập của cô giáo giữ nguyên 100%, cô giáo vẫn đăng nhập bình thường.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Bảo toàn cơ sở dữ liệu:</strong> Toàn bộ lớp học, danh sách học sinh, điểm sao thi đua và chuyên cần không bị ảnh hưởng.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Phân quyền cho Nhà trường:</strong> Quản trị trường và Ban Giám Hiệu được gán có toàn quyền xem lớp, xem học sinh, cấp lại mật khẩu và hỗ trợ cô giáo như các giáo viên khác trong đơn vị.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Tự động phân vùng:</strong> Hệ thống tự động chuyển dữ liệu từ thư mục <code>data/database_ca_nhan</code> sang <code>data/database_nha_truong</code>.</span>
                  </li>
                </ul>
              </div>

              {/* Nút thao tác */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransferModalOpen(false)}
                  disabled={isTransferring}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isTransferring}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black uppercase shadow-lg shadow-purple-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isTransferring ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang Di Chuyển CSDL...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>XÁC NHẬN GÁN VÀO NHÀ TRƯỜNG</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Registration Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <X className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 uppercase text-sm">Từ Chối Đăng Ký</h3>
                  <p className="text-xs text-slate-500">Vui lòng nhập lý do để ghi chú lại</p>
                </div>
              </div>
              <button 
                onClick={() => setRejectModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-200/50 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleConfirmReject} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase">Lý Do Từ Chối <span className="text-rose-600">*</span></label>
                <textarea
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do chi tiết..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 resize-none h-24"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  disabled={loadingRegistrations}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase transition-colors"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={loadingRegistrations}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase shadow-lg shadow-red-600/20 transition-colors flex items-center gap-2"
                >
                  {loadingRegistrations ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Xác Nhận Không Duyệt</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Registration Modal */}
      {editRegistrationModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 uppercase text-sm">Chỉnh Sửa Đơn Đăng Ký</h3>
                  <p className="text-xs text-slate-500">Cập nhật trạng thái và ghi chú</p>
                </div>
              </div>
              <button 
                onClick={() => setEditRegistrationModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-200/50 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleConfirmEditRegistration} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase">Trạng Thái Hồ Sơ <span className="text-rose-600">*</span></label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="editStatus" 
                      value="approved" 
                      checked={editRegStatus === 'approved'} 
                      onChange={() => setEditRegStatus('approved')}
                      className="w-4 h-4 text-green-700 focus:ring-green-500" 
                    />
                    <span className="text-sm font-medium text-slate-700">Đã giải quyết</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="editStatus" 
                      value="rejected" 
                      checked={editRegStatus === 'rejected'} 
                      onChange={() => setEditRegStatus('rejected')}
                      className="w-4 h-4 text-red-600 focus:ring-red-500" 
                    />
                    <span className="text-sm font-medium text-slate-700">Chưa giải quyết</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase">Ghi Chú</label>
                <textarea
                  value={editRegNote}
                  onChange={(e) => setEditRegNote(e.target.value)}
                  placeholder="Nhập ghi chú chi tiết..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none h-24"
                ></textarea>
              </div>
              
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditRegistrationModalOpen(false)}
                  disabled={loadingRegistrations}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase transition-colors"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={loadingRegistrations}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase shadow-lg shadow-indigo-600/20 transition-colors flex items-center gap-2"
                >
                  {loadingRegistrations ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Lưu Thay Đổi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🗑️ MODAL XÁC NHẬN XÓA CSDL TRƯỜNG HỌC (CHUẨN GIAO DIỆN PREMIUM NHƯ MODAL XÓA HỌC SINH) */}
      {schoolToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-black text-rose-950 uppercase tracking-tight">
                XÓA CSDL TRƯỜNG HỌC?
              </h3>
              <p className="text-xs text-rose-800 mt-1.5 leading-relaxed font-bold">
                Xác nhận xóa trường: <strong className="text-rose-900 font-black">"{schoolToDelete.name}"</strong>
              </p>
              <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                Hành động này sẽ xóa sạch toàn bộ CSDL về nhà trường, mô hình lớp học, học sinh và các tài khoản thuộc trường.
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setSchoolToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleConfirmDeleteSchool}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/25 hover-zoom-btn transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang Xóa...</span>
                  </>
                ) : (
                  <span>Xóa Ngay</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🗑️ MODAL XÁC NHẬN XÓA TÀI KHOẢN (CHUẨN GIAO DIỆN PREMIUM NHƯ MODAL XÓA HỌC SINH) */}
      {/* Gán mật khẩu chung cho nhiều tài khoản */}
      {bulkPwOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Gán mật khẩu chung">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase inline-flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-700" /> Gán mật khẩu chung</h3>
              <button type="button" onClick={() => setBulkPwOpen(false)} className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center" aria-label="Đóng"><X className="w-4 h-4" /></button>
            </div>
            {bulkPwDone ? (
              <div className="p-5 space-y-4">
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900">
                  Đã gán mật khẩu <strong className="font-mono">{bulkPwDone.password}</strong> cho <strong>{bulkPwDone.users.length}</strong> tài khoản. Hãy thông báo cho thầy cô và nhắc tự đổi mật khẩu riêng (nút ĐỔI MẬT KHẨU ở thanh bên).
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBulkPwOpen(false)} className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-black">Đóng</button>
                  <button type="button" onClick={() => handleExportUsersToExcel(bulkPwDone.users.map(u => ({ ...u, password: bulkPwDone.password })), 'TaiKhoan_MatKhauChung')}
                    className="flex-[2] py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center justify-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Xuất Excel danh sách tài khoản
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <fieldset className="space-y-2">
                  <legend className="text-xs font-black text-slate-700 uppercase mb-1">Áp dụng cho</legend>
                  <label className={`flex items-center gap-2 rounded-2xl border p-3 text-sm ${selectedUserIds.length === 0 ? 'opacity-50' : 'cursor-pointer'} ${bulkPwScope === 'selected' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                    <input type="radio" name="bulk-pw-scope" disabled={selectedUserIds.length === 0} checked={bulkPwScope === 'selected'} onChange={() => setBulkPwScope('selected')} />
                    <span><strong>Các tài khoản đang chọn</strong> ({filteredUsers.filter(u => selectedUserIds.includes(uidOf(u))).filter(canAssignPasswordTo).length}){selectedUserIds.length === 0 ? ' – đánh dấu ô vuông ở danh sách để chọn' : ''}</span>
                  </label>
                  <label className={`flex items-center gap-2 rounded-2xl border p-3 text-sm cursor-pointer ${bulkPwScope === 'all' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                    <input type="radio" name="bulk-pw-scope" checked={bulkPwScope === 'all'} onChange={() => setBulkPwScope('all')} />
                    <span><strong>Tất cả tài khoản trong danh sách đang hiển thị</strong> ({filteredUsers.filter(canAssignPasswordTo).length})</span>
                  </label>
                  <p className="text-xs text-slate-600">Không áp dụng cho tài khoản Quản trị tối cao và tài khoản đang đăng nhập. Muốn gán theo nhóm (một lớp, một vai trò), hãy lọc/tìm danh sách trước.</p>
                </fieldset>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-xs font-black text-slate-700 uppercase">Mật khẩu chung</span>
                    <input type={bulkPwShow ? 'text' : 'password'} value={bulkPw} onChange={(e) => setBulkPw(e.target.value)} autoComplete="new-password" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-black text-slate-700 uppercase">Nhập lại</span>
                    <input type={bulkPwShow ? 'text' : 'password'} value={bulkPw2} onChange={(e) => setBulkPw2(e.target.value)} autoComplete="new-password" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono" />
                  </label>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={bulkPwShow} onChange={(e) => setBulkPwShow(e.target.checked)} /> Hiện mật khẩu</label>
                {(bulkPw || bulkPw2) && (passwordProblem(bulkPw) || (bulkPw2 && bulkPw !== bulkPw2)) && (
                  <p className="text-sm font-bold text-rose-700">{passwordProblem(bulkPw) || 'Hai lần nhập mật khẩu chưa giống nhau.'}</p>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBulkPwOpen(false)} className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-black">Hủy</button>
                  <button type="button" onClick={handleBulkAssignPassword} disabled={loading || getBulkPwTargets().length === 0 || Boolean(passwordProblem(bulkPw)) || bulkPw !== bulkPw2}
                    className="flex-[2] py-2.5 rounded-2xl bg-amber-700 hover:bg-amber-800 text-white text-sm font-black disabled:opacity-50">
                    {loading ? 'Đang gán…' : `Gán cho ${getBulkPwTargets().length} tài khoản`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-black text-rose-950 uppercase tracking-tight">
                XÓA TÀI KHOẢN NGƯỜI DÙNG?
              </h3>
              <p className="text-xs text-rose-800 mt-1.5 leading-relaxed font-bold">
                Xác nhận xóa tài khoản: <strong className="text-rose-900 font-black">@{userToDelete.username}</strong>
              </p>
              <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                Người dùng: {userToDelete.fullName} • Vai trò: {userToDelete.role}. Dữ liệu lớp học của giáo viên này sẽ được dọn dẹp.
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleConfirmDeleteUser}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/25 hover-zoom-btn transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang Xóa...</span>
                  </>
                ) : (
                  <span>Xóa Ngay</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🏛️ MODAL CẤP NHANH TÀI KHOẢN BGH CHO TRƯỜNG CHƯA CÓ TÀI KHOẢN */}
      {provisionModalOpen && provisioningSchool && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 md:p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 animate-in slide-in-from-bottom-4 duration-200 overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-r from-rose-50 to-indigo-50">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Cấp Tài Khoản Ban Giám Hiệu</h3>
                <p className="text-[12px] text-slate-500 mt-0.5 truncate">Trường: <strong className="text-slate-700">{provisioningSchool.name}</strong></p>
              </div>
              <button
                type="button"
                onClick={() => { setProvisionModalOpen(false); setProvisionedResult(null); }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {provisionedResult ? (
                /* Trạng thái đã cấp thành công - hiển thị thông tin bàn giao */
                <div className="space-y-4">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-2xl bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-black text-slate-900">Cấp tài khoản thành công! 🎉</div>
                    <div className="text-[12px] text-slate-500 mt-1">Bàn giao thông tin dưới đây cho Ban Giám Hiệu</div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="text-[12px] font-black uppercase text-slate-500 w-28 shrink-0">Đơn vị</div>
                      <div className="text-xs font-bold text-slate-800">{provisionedResult.schoolName}</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="text-[12px] font-black uppercase text-slate-500 w-28 shrink-0">Mã trường</div>
                      <div className="text-xs font-mono font-bold text-blue-700">{provisionedResult.code}</div>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="flex items-center gap-2.5">
                      <div className="text-[12px] font-black uppercase text-slate-500 w-28 shrink-0">Tài khoản BGH</div>
                      <div className="text-xs font-mono font-black text-indigo-700">@{provisionedResult.username}</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="text-[12px] font-black uppercase text-slate-500 w-28 shrink-0">Mật khẩu</div>
                      <div className="text-xs font-mono font-bold text-rose-700 tracking-widest">{provisionedResult.password || '123456'}</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="text-[12px] font-black uppercase text-slate-500 w-28 shrink-0">Họ tên</div>
                      <div className="text-xs font-bold text-slate-700">{provisionedResult.fullName}</div>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const text = `THÔNG TIN BÀN GIAO - LỚP HỌC HẠNH PHÚC\n- Đơn vị: ${provisionedResult.schoolName}\n- Mã trường: ${provisionedResult.code}\n- Tài khoản BGH: ${provisionedResult.username}\n- Mật khẩu: ${provisionedResult.password || '123456'}\n- Cổng đăng nhập: Quản trị Nhà Trường (BGH)\n- Website: ${window.location.origin}`;
                        navigator.clipboard.writeText(text);
                        showNotify('success', 'Đã sao chép thông tin bàn giao!');
                      }}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao Chép Bàn Giao</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setProvisionModalOpen(false); setProvisionedResult(null); }}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-800 text-xs font-black uppercase transition-colors cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              ) : (
                /* Form nhập thông tin tài khoản BGH */
                <form onSubmit={handleProvisionAdmin} className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-[12px] text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Trường này <strong>chưa có tài khoản BGH</strong>. Điền thông tin bên dưới để cấp tài khoản bàn giao cho Ban Giám Hiệu.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Tên Đăng Nhập BGH <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={provisionFormData.adminUsername}
                      onChange={(e) => setProvisionFormData(p => ({ ...p, adminUsername: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                      placeholder="bgh_hoasen"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                      autoFocus
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Mật Khẩu Khởi Tạo
                    </label>
                    <div className="relative">
                      <input
                        type={showProvisionPassword ? 'text' : 'password'}
                        value={provisionFormData.adminPassword}
                        onChange={(e) => setProvisionFormData(p => ({ ...p, adminPassword: e.target.value }))}
                        placeholder="123456"
                        className="w-full px-3.5 py-2 pr-10 rounded-xl border border-slate-300 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowProvisionPassword(p => !p)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showProvisionPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Họ Tên Đại Diện BGH
                    </label>
                    <input
                      type="text"
                      value={provisionFormData.adminFullName}
                      onChange={(e) => setProvisionFormData(p => ({ ...p, adminFullName: e.target.value }))}
                      placeholder={`Ban Giám Hiệu ${provisioningSchool.name}`}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-[12px] text-blue-800">
                    <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Sau khi cấp, BGH đăng nhập bằng tài khoản trên để tự tạo GVCN, GVBM. Thực hiện <strong>đổi mật khẩu</strong> sau lần đăng nhập đầu tiên.</span>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setProvisionModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase transition-colors cursor-pointer"
                    >
                      Hủy Bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={isProvisioning}
                      className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isProvisioning ? (
                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Đang cấp...</span></>
                      ) : (
                        <><UserPlus className="w-3.5 h-3.5" /><span>Cấp Tài Khoản BGH</span></>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

