import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, School, Award, Users, BookOpen, 
  Check, X, HardDrive, Sparkles, Monitor, Laptop, ArrowRight
} from 'lucide-react';
import { useClassroom } from '../../context/ClassroomContext';

interface DesktopRoleSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export type SupportedRoleType = 'adminquantri' | 'school_admin' | 'bgh' | 'homeroom' | 'subject';

interface RoleOption {
  id: SupportedRoleType;
  title: string;
  badge: string;
  dataFile: string;
  description: string;
  icon: string;
  themeColor: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    id: 'adminquantri',
    title: 'Quản Trị Tối Cao (Super Admin)',
    badge: 'CẤP CAO NHẤT',
    dataFile: 'adminquantri.json',
    description: 'Toàn quyền tối cao quản trị hệ thống, dữ liệu tài khoản, phân quyền máy chủ và giấy phép bản quyền CDKEY.',
    icon: '🛡️',
    themeColor: 'from-purple-600 to-indigo-700'
  },
  {
    id: 'school_admin',
    title: 'Quản Trị Nhà Trường (School Admin)',
    badge: 'CẤP 1 - TOÀN TRƯỜNG',
    dataFile: 'quantrinhatruong.json',
    description: 'Quản lý danh mục lớp học, phân hiệu, điểm trường, cấu hình và tổng hợp toàn diện dữ liệu trường học.',
    icon: '🏫',
    themeColor: 'from-blue-600 to-indigo-700'
  },
  {
    id: 'bgh',
    title: 'Ban Giám Hiệu (BGH)',
    badge: 'CẤP 2 - GIÁM SÁT',
    dataFile: 'bgh.json',
    description: 'Toàn quyền giám sát chuyên cần, sĩ số, nề nếp thi đua và báo cáo học tập của tất cả các lớp trong trường.',
    icon: '🏛️',
    themeColor: 'from-amber-500 to-orange-600'
  },
  {
    id: 'homeroom',
    title: 'Giáo Viên Chủ Nhiệm (GVCN)',
    badge: 'CẤP 3 - THEO LỚP',
    dataFile: 'gvcn_{ten_lop}.json',
    description: 'Phụ trách lớp học: Quản lý học sinh, cộng trừ xu thi đua, điểm danh hằng ngày, sơ đồ 3D và xuất Infographic A4.',
    icon: '👨‍🏫',
    themeColor: 'from-sky-500 to-blue-600'
  },
  {
    id: 'subject',
    title: 'Giáo Viên Bộ Môn Chuyên Ngành (GVBM)',
    badge: 'BỘ MÔN CHUYÊN SÂU',
    dataFile: 'Lưu chung theo lớp',
    description: 'Giảng dạy nhiều lớp học: Quản lý thời khóa biểu bộ môn dùng chung cả kỳ, chấm điểm thi đua theo môn học.',
    icon: '💻',
    themeColor: 'from-emerald-500 to-teal-600'
  }
];

export const DesktopRoleSetupModal: React.FC<DesktopRoleSetupModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, switchUserAccount, allUsers, setTeacherRole, setIsAccountManagerOpen } = useClassroom();
  const [selectedRole, setSelectedRole] = useState<SupportedRoleType>('homeroom');
  const [autoOpenAdmin, setAutoOpenAdmin] = useState(true);
  const [installedInfo, setInstalledInfo] = useState<{ role: string; roleTitle: string; installedAt?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/system/installed-role')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.installedRole) {
            setInstalledInfo(data.installedRole);
            if (data.installedRole.role) {
              setSelectedRole(data.installedRole.role as SupportedRoleType);
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApplyRole = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const opt = ROLE_OPTIONS.find(r => r.id === selectedRole);
      await fetch('/api/system/installed-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: selectedRole,
          roleTitle: opt ? opt.title : selectedRole
        })
      });

      // Nếu người dùng chọn các vai trò quản trị, tự động chuyển tài khoản tương ứng
      let switched = false;
      if (selectedRole === 'adminquantri') {
        const u = allUsers.find(x => x.username?.toLowerCase() === 'adminquantri' || x.role === 'admin');
        if (u) {
          switched = await switchUserAccount(u.username);
        }
      } else if (selectedRole === 'school_admin') {
        const u = allUsers.find(x => x.role === 'school_admin' || x.isSchoolAdmin) ||
                  allUsers.find(x => x.username?.toLowerCase().startsWith('quantri') || x.username?.toLowerCase().startsWith('adminth'));
        if (u) {
          switched = await switchUserAccount(u.username);
        } else {
        }
      } else if (selectedRole === 'bgh') {
        const u = allUsers.find(x => x.role === 'bgh' || x.isBgh) ||
                  allUsers.find(x => x.username?.toLowerCase().startsWith('bgh'));
        if (u) {
          switched = await switchUserAccount(u.username);
        } else {
        }
      } else if (selectedRole === 'subject') {
        setTeacherRole('subject');
      } else if (selectedRole === 'homeroom') {
        setTeacherRole('homeroom');
      }

      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
        // Nếu chọn vai trò Quản trị và bật tùy chọn tự động mở Quản trị admin
        if ((selectedRole === 'school_admin' || selectedRole === 'adminquantri' || selectedRole === 'bgh') && autoOpenAdmin) {
          setTimeout(() => {
            setIsAccountManagerOpen(true);
          }, 300);
        }
      }, 700);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border-2 border-sky-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header 3D Công nghệ */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-700 text-white flex items-center justify-between border-b border-white/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-inner border border-white/30 text-xl">
              💻
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight leading-tight uppercase">
                  LỰA CHỌN VAI TRÒ SỬ DỤNG
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-400 text-slate-900 text-[12px] font-black uppercase shadow-xs">
                  CSDL_LHHP.exe
                </span>
              </div>
              <p className="text-xs text-white font-medium mt-0.5">
                Cấu hình phân quyền và định danh file dữ liệu cho máy tính này
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/90 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung danh sách 5 vai trò */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-2.5">
          {installedInfo && (
            <div className="p-3 bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl border border-sky-200 flex items-center justify-between text-xs font-bold text-sky-950">
              <div className="flex items-center gap-2">
                <span>⚙️ Vai trò đã chọn khi cài đặt:</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-black text-[12px] uppercase">
                  {installedInfo.roleTitle || installedInfo.role}
                </span>
              </div>
              {installedInfo.installedAt && (
                <span className="text-[12px] text-slate-500 font-mono">
                  {installedInfo.installedAt}
                </span>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            {ROLE_OPTIONS.map((opt) => {
              const isSelected = selectedRole === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setSelectedRole(opt.id)}
                  className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 relative ${
                    isSelected
                      ? 'border-blue-500 bg-gradient-to-r from-blue-50/90 via-sky-50/70 to-indigo-50/90 shadow-md ring-2 ring-blue-400/30'
                      : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/30'
                  }`}
                >
                  <div className="text-2xl sm:text-3xl shrink-0 p-1 bg-white rounded-xl shadow-xs border border-slate-100">
                    {opt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-black text-xs sm:text-sm text-slate-900 uppercase">
                        {opt.title}
                      </span>
                      <span className="px-2 py-0.2 rounded-md bg-slate-100 text-slate-700 text-[12px] font-black uppercase border border-slate-200">
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[12px] sm:text-xs text-slate-600 font-medium leading-relaxed mb-1.5">
                      {opt.description}
                    </p>
                    <div className="flex items-center gap-1.5 text-[12px] sm:text-[12px] font-mono text-blue-700 font-bold">
                      <HardDrive className="w-3.5 h-3.5 text-blue-600" />
                      <span>Tệp lưu trữ:</span>
                      <strong className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-900 border border-blue-200">
                        {opt.dataFile}
                      </strong>
                    </div>
                  </div>

                  <div className="shrink-0 self-center">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer 3D Action */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {(selectedRole === 'school_admin' || selectedRole === 'adminquantri' || selectedRole === 'bgh') && (
              <label className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 cursor-pointer select-none bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-200">
                <input
                  type="checkbox"
                  checked={autoOpenAdmin}
                  onChange={(e) => setAutoOpenAdmin(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Mở ngay bảng Quản trị Admin sau khi áp dụng</span>
              </label>
            )}
            <div className="text-xs text-slate-500 font-medium hidden md:block">
              💡 Có thể thay đổi lại vai trò máy tính này bất cứ lúc nào.
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="btn-3d btn-3d-sm btn-3d-light text-slate-700"
            >
              ĐÓNG
            </button>
            <button
              type="button"
              onClick={handleApplyRole}
              disabled={isSaving}
              className="btn-3d btn-3d-sm btn-3d-blue gap-1.5"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>ĐÃ THIẾT LẬP THÀNH CÔNG!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                  <span>{isSaving ? 'ĐANG LƯU...' : 'ÁP DỤNG VAI TRÒ NÀY'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
