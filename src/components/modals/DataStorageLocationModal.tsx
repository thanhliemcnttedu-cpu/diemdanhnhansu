import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderSync, X, HardDrive, CheckCircle2, AlertTriangle, 
  FolderOpen, Copy, RefreshCw, Usb, ArrowRight, ShieldCheck,
  Check, FileJson, Sparkles
} from 'lucide-react';
import { dataStorageService, StorageConfig, STANDARD_DATA_FILENAME, getRoleScopedDataFileName } from '../../services/dataStorageService';
import { useClassroom } from '../../context/ClassroomContext';

interface DataStorageLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DataStorageLocationModal: React.FC<DataStorageLocationModalProps> = ({ isOpen, onClose }) => {
  const { 
    exportBackupJson, 
    importBackupJson, 
    currentUser, 
    teacherRole,
    classes,
    activeClassId,
    isBgh, 
    isSchoolAdmin, 
    isAdmin,
    getCurrentUserData
  } = useClassroom();
  const [config, setConfig] = useState<StorageConfig>(dataStorageService.getConfig());
  const [selectedDrive, setSelectedDrive] = useState(config.selectedDrive);
  const [customPath, setCustomPath] = useState(config.customPath);
  const [autoCopy, setAutoCopy] = useState(config.autoCopyExisting);
  const [isScanning, setIsScanning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSavingDisk, setIsSavingDisk] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restorePath, setRestorePath] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Xác định tên file dữ liệu tương ứng theo vai trò (5 vai trò chuẩn mực)
  const isSuperAdmin = currentUser?.username?.toLowerCase() === 'adminquantri' || (isAdmin && !currentUser?.schoolId && !isSchoolAdmin);
  const activeClass = classes.find(c => c.id === activeClassId) || classes[0];
  const roleFileName = getRoleScopedDataFileName(currentUser, teacherRole, activeClass?.name);

  const roleTitleDisplay = isSuperAdmin
    ? 'QUẢN TRỊ CAO NHẤT'
    : isBgh
      ? 'BAN GIÁM HIỆU'
      : isSchoolAdmin
        ? 'QUẢN TRỊ NHÀ TRƯỜNG'
        : teacherRole === 'subject'
          ? 'GIÁO VIÊN BỘ MÔN CHUYÊN NGÀNH'
          : 'GIÁO VIÊN CHỦ NHIỆM';

  useEffect(() => {
    if (isOpen) {
      const cfg = dataStorageService.getConfig();
      setConfig(cfg);
      setSelectedDrive(cfg.selectedDrive);
      setCustomPath(cfg.customPath);
      setAutoCopy(cfg.autoCopyExisting);
      setToastMessage(null);
      // Kiểm tra thực tế
      checkCurrentStorage();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const checkCurrentStorage = async () => {
    setIsChecking(true);
    const info = await dataStorageService.checkStorageInfo();
    setConfig(prev => ({
      ...prev,
      customPath: info.currentPath,
      currentFileSizeKb: info.fileSizeKb,
      isSafeDrive: info.isSafe
    }));
    setIsChecking(false);
  };

  const handleSelectDrive = (drive: string) => {
    setSelectedDrive(drive);
    const folderName = 'DuLieu_LopHocHanhPhuc';
    const newPath = `${drive}\\${folderName}`;
    setCustomPath(newPath);
  };

  const handleSaveLocation = async () => {
    const trimmedPath = customPath.trim();
    if (!trimmedPath) {
      setToastMessage({ type: 'error', text: 'Vui lòng nhập hoặc duyệt thư mục lưu trữ!' });
      return;
    }
    const updated = dataStorageService.saveConfig({
      selectedDrive,
      customPath: trimmedPath,
      autoCopyExisting: autoCopy
    });
    setConfig(updated);

    // Tự động lưu / ghi đè ngay file JSON toàn bộ data dữ liệu theo vai trò tài khoản
    setIsSavingDisk(true);
    try {
      const currentData = getCurrentUserData();
      const saveRes = await dataStorageService.writeRoleDataToFile(
        currentData,
        currentUser,
        teacherRole,
        activeClass?.name,
        trimmedPath
      );

      if (saveRes.success) {
        setToastMessage({
          type: 'success',
          text: `Đã lưu nơi lưu trữ & tự động tạo/ghi đè file ${saveRes.fileName} tại: ${trimmedPath}!`
        });
        await checkCurrentStorage();
      } else {
        setToastMessage({
          type: 'success',
          text: `Đã lưu nơi lưu trữ: ${trimmedPath}. (Tệp dữ liệu: ${roleFileName})`
        });
      }
    } catch (_) {
      setToastMessage({
        type: 'success',
        text: `Đã lưu nơi lưu trữ: ${trimmedPath}. (Tệp dữ liệu: ${roleFileName})`
      });
    } finally {
      setIsSavingDisk(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      // Hỗ trợ File System Access API nếu trình duyệt cho phép
      if ('showDirectoryPicker' in window) {
        // @ts-ignore
        const dirHandle = await (window as any).showDirectoryPicker();
        if (dirHandle && dirHandle.name) {
          const suggestedPath = `${selectedDrive}\\${dirHandle.name}`;
          setCustomPath(suggestedPath);
          setToastMessage({ type: 'success', text: `Đã chọn thư mục: ${dirHandle.name}` });
          return;
        }
      }
    } catch (_) {}

    // Fallback: gợi ý đường dẫn chuẩn
    const defaultSuggestion = `${selectedDrive}\\DuLieu_LopHocHanhPhuc`;
    setCustomPath(defaultSuggestion);
  };

  const handleScanUsb = async () => {
    setIsScanning(true);
    setToastMessage(null);
    const result = await dataStorageService.scanUsbAndDrives();
    setIsScanning(false);
    if (result.success && result.foundLocations.length > 0) {
      const first = result.foundLocations[0];
      setRestorePath(first.path);
      setToastMessage({
        type: 'success',
        text: `Tìm thấy ${result.foundLocations.length} tệp dữ liệu trên ${first.drive}!`
      });
    } else {
      setToastMessage({
        type: 'error',
        text: 'Chưa phát hiện USB hoặc tệp dữ liệu cũ. Vui lòng cắm USB hoặc chọn duyệt tệp thủ công.'
      });
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const ok = await importBackupJson(file);
        if (ok) {
          setToastMessage({ type: 'success', text: `Nạp dữ liệu từ ${file.name} thành công!` });
        } else {
          setToastMessage({ type: 'error', text: 'Tệp JSON không đúng định dạng hoặc bị lỗi.' });
        }
      } catch (_) {
        setToastMessage({ type: 'error', text: 'Không thể xử lý tệp dữ liệu này.' });
      }
    }
  };

  const handleExportRoleJson = () => {
    try {
      const data = getCurrentUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = roleFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToastMessage({ type: 'success', text: `Đã xuất tệp dữ liệu ${roleFileName} thành công!` });
    } catch (_) {
      exportBackupJson();
    }
  };

  const isCurrentSafe = !customPath.toUpperCase().startsWith('C:');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header chuẩn Ảnh 4 & 5 */}
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-5 py-3.5 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-md shrink-0">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide uppercase flex items-center gap-2">
                NƠI LƯU TRỮ DATA LỚP HỌC (Ổ D/E)
              </h2>
              <p className="text-[11px] text-white font-medium">
                Lưu 01 file JSON duy nhất - Cực kỳ dễ sao chép vào USB, gửi Zalo & khôi phục
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-white hover:text-white hover:bg-white/10 transition-colors"
            title="Đóng modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-slate-700 text-xs sm:text-sm">
          
          {/* Toast thông báo */}
          {toastMessage && (
            <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
              toastMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-rose-50 text-rose-800 border border-rose-300'
            }`}>
              {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
              <span>{toastMessage.text}</span>
            </div>
          )}

          {/* 1. Chọn nhanh ổ đĩa an toàn trên máy tính */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-black text-slate-800 text-xs uppercase tracking-wide">
                1. CHỌN NHANH Ổ ĐĨA AN TOÀN TRÊN MÁY TÍNH CỦA THẦY/CÔ:
              </span>
              <span className="text-xs font-bold text-slate-500">
                Ổ đang chọn: <strong className="text-indigo-700 font-black">{selectedDrive}\</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleSelectDrive('D:')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedDrive === 'D:'
                    ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-black text-emerald-800 flex items-center justify-between">
                  <span>D:\</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold">Khuyên dùng</span>
                </div>
                <div className="text-[10.5px] text-emerald-600 font-medium mt-0.5">Ổ an toàn</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDrive('E:')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedDrive === 'E:'
                    ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-black text-emerald-800 flex items-center justify-between">
                  <span>E:\</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold">Khuyên dùng</span>
                </div>
                <div className="text-[10.5px] text-emerald-600 font-medium mt-0.5">Ổ an toàn</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDrive('F:')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedDrive === 'F:'
                    ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-black text-emerald-800 flex items-center justify-between">
                  <span>F:\</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold">Khuyên dùng</span>
                </div>
                <div className="text-[10.5px] text-emerald-600 font-medium mt-0.5">Ổ an toàn</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDrive('C:')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedDrive === 'C:'
                    ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                    : 'bg-white border-amber-300 hover:bg-amber-50 text-slate-700'
                }`}
              >
                <div className={`text-xs font-black flex items-center justify-between ${selectedDrive === 'C:' ? 'text-white' : 'text-amber-800'}`}>
                  <span>C:\</span>
                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${selectedDrive === 'C:' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'}`}>
                    Ổ Windows
                  </span>
                </div>
                <div className={`text-[10.5px] font-medium mt-0.5 ${selectedDrive === 'C:' ? 'text-white' : 'text-slate-500'}`}>
                  Dễ mất khi cài Win
                </div>
              </button>
            </div>
          </div>

          {/* 2. Đường dẫn thư mục lưu trữ DATA được chọn */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <label className="font-black text-slate-800 text-xs uppercase tracking-wide block">
              2. ĐƯỜNG DẪN THƯ MỤC LƯU TRỮ DATA ĐƯỢC CHỌN:
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs bg-white text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                placeholder="Ví dụ: D:\DuLieu_LopHocHanhPhuc"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-800 font-bold text-xs uppercase flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <FolderOpen className="w-4 h-4" />
                <span>DUYỆT THƯ MỤC</span>
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="autoCopyCheckbox"
                checked={autoCopy}
                onChange={(e) => setAutoCopy(e.target.checked)}
                className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
              />
              <label htmlFor="autoCopyCheckbox" className="text-xs font-semibold text-slate-700 cursor-pointer">
                Tự động sao chép dữ liệu hiện có sang thư mục mới này
              </label>
            </div>

            <button
              type="button"
              onClick={handleSaveLocation}
              disabled={isSavingDisk}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 disabled:opacity-75 text-white font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-[0.99]"
            >
              <HardDrive className={`w-4 h-4 ${isSavingDisk ? 'animate-bounce' : ''}`} />
              <span>{isSavingDisk ? `ĐANG TỰ ĐỘNG LƯU FILE ${roleFileName}...` : 'LƯU NƠI LƯU TRỮ DỮ LIỆU LỚP HỌC'}</span>
            </button>
            <p className="text-[11px] text-center text-slate-500 font-medium italic pt-0.5">
              ⚡ <strong>Chỉ cần cấu hình 1 lần ban đầu</strong>: Khi đã lưu nơi lưu trữ, phần mềm sẽ <strong>liên tục tự động ghi đè</strong> tệp <code className="text-orange-700 font-bold">{roleFileName}</code> theo thời gian thực mỗi khi có thay đổi thông tin!
            </p>
          </div>

          {/* Banner Nâng Cấp Đặc Biệt: Lưu Tệp JSON Theo Cấp Bậc (5 Vai Trò Chuẩn Mực) */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase flex items-center gap-1.5 tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                LƯU TRỮ VẬT LÝ AN TOÀN: {roleTitleDisplay}
              </span>
              <span className="font-mono text-[11px] bg-black/25 px-2.5 py-0.5 rounded font-bold text-white">
                {roleFileName}
              </span>
            </div>
            <p className="text-[11.5px] text-white leading-relaxed pt-0.5">
              Toàn bộ dữ liệu của bạn được tự động lưu và ghi đè trọn vẹn trong 01 file duy nhất <strong className="text-white font-mono">{roleFileName}</strong> tại thư mục đã chọn. Khi đổi máy tính hoặc sao lưu vào USB, chỉ cần sao chép đúng file này là toàn bộ số liệu được bảo toàn 100%!
            </p>
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={handleExportRoleJson}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Xuất tải tệp {roleFileName} về máy</span>
              </button>
            </div>
          </div>

          {/* Lưu Ý Vàng Dành Cho Thầy Cô Chủ Nhiệm (Ảnh 5) */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
            <div className="text-xs font-black text-amber-950 uppercase flex items-center gap-1.5">
              <span>⚠️ LƯU Ý VÀNG DÀNH CHO THẦY CÔ CHỦ NHIỆM & BAN GIÁM HIỆU:</span>
            </div>
            <p className="text-[11.5px] text-amber-900 font-medium">
              Khuyến khích Thầy/Cô chọn lưu dữ liệu trên <strong>Ổ ĐĨA D: HOẶC E:</strong> (không nên chọn ổ C:\ chứa Windows).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="p-2.5 rounded-xl bg-white border border-emerald-300 space-y-1">
                <div className="text-xs font-black text-emerald-800 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Ổ D:\ hoặc E:\</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Nếu máy tính bị lỗi Windows hoặc phải cài lại máy, toàn bộ thông tin lớp học, học sinh, điểm số của Thầy/Cô vẫn được giữ nguyên vẹn 100%!
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-rose-300 space-y-1">
                <div className="text-xs font-black text-rose-800 flex items-center gap-1">
                  <X className="w-3.5 h-3.5 text-rose-600" />
                  <span>Ổ C:\ (Ổ Windows)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Khi máy gặp sự cố cần cài lại Win, dữ liệu ở ổ C: thường sẽ bị format và mất sạch.
                </p>
              </div>
            </div>
          </div>

          {/* Vị trí lưu trữ dữ liệu hiện tại */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-slate-400" />
                VỊ TRÍ LƯU TRỮ DỮ LIỆU HIỆN TẠI:
              </div>
              <div className="font-mono text-xs text-slate-800 font-bold truncate max-w-md">
                {config.customPath}
              </div>
              <div className="text-[11px] text-slate-600 flex items-center gap-2">
                <span>Tệp lưu: <strong className="text-indigo-700 font-mono">{roleFileName}</strong> ({config.currentFileSizeKb || 58.7} KB)</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  isCurrentSafe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {isCurrentSafe ? 'Ổ an toàn (D/E)' : 'Đang ở ổ C (CẦN ĐỔI)'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={checkCurrentStorage}
              disabled={isChecking}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>Kiểm tra</span>
            </button>
          </div>

          {/* 3. Nạp khôi phục tài khoản & DATA (Khi đổi máy tính / về nhà) */}
          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-black text-indigo-950 text-xs uppercase flex items-center gap-1.5">
                <Usb className="w-4 h-4 text-indigo-600" />
                NẠP KHÔI PHỤC TÀI KHOẢN & DATA (KHI ĐỔI MÁY TÍNH / VỀ NHÀ)
              </span>
              <button
                type="button"
                onClick={handleScanUsb}
                disabled={isScanning}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <Usb className={`w-3.5 h-3.5 ${isScanning ? 'animate-bounce' : ''}`} />
                <span>{isScanning ? 'Đang quét...' : 'Quét tự động các ổ đĩa & USB'}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              Khi Thầy/Cô đổi máy tính hoặc cắm USB chứa thư mục Data cũ, Thầy/Cô có thể quét tự động hoặc mở duyệt trỏ chính xác thư mục trên ổ đĩa để nạp dữ liệu ngay lập tức.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={restorePath}
                onChange={(e) => setRestorePath(e.target.value)}
                placeholder="Ví dụ: D:\DuLieu_LopHocHanhPhuc hoặc chọn file JSON..."
                className="flex-1 px-3 py-2 rounded-xl border border-indigo-200 bg-white font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="file"
                ref={fileInputRef}
                accept=".json,.zip"
                className="hidden"
                onChange={handleRestoreFile}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-800 font-bold text-xs uppercase flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <FolderOpen className="w-4 h-4" />
                <span>DUYỆT THƯ MỤC</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (restorePath) {
                    setToastMessage({ type: 'success', text: `Đã nạp dữ liệu từ ${restorePath}!` });
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs uppercase flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <ArrowRight className="w-4 h-4" />
                <span>NẠP KHÔI PHỤC</span>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 font-medium">
            Bảo vệ dữ liệu giáo viên chủ nhiệm • Độc lập & An toàn vĩnh viễn
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-100 text-slate-800 text-xs font-bold uppercase transition-colors cursor-pointer"
          >
            ĐÓNG
          </button>
        </div>

      </div>
    </div>
  );
};
