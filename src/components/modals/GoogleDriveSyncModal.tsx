import React, { useState, useEffect } from 'react';
import { 
  Cloud, Folder, Link2, Copy, Check, RefreshCw, UploadCloud, 
  DownloadCloud, ShieldAlert, CheckCircle2, AlertTriangle, 
  HelpCircle, ExternalLink, School, Settings, Database, ArrowRight,
  Clock, X, Sparkles, Play, HardDrive, History, CheckCheck, Users,
  Code2, Eye, EyeOff
} from 'lucide-react';
import { googleDriveService } from '../../services/googleDriveService';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';
import { GoogleDriveConfig, DriveFolderHistoryItem, SchoolWideAggregationReport } from '../../types/driveSync';
import { useClassroom } from '../../context/ClassroomContext';
import { dataAdapter } from '../../services/dataAdapter';

interface GoogleDriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleDriveSyncModal: React.FC<GoogleDriveSyncModalProps> = ({ isOpen, onClose }) => {
  const { 
    currentUser, 
    getCurrentUserData, 
    classes, 
    activeClassId, 
    isAdmin, 
    isBgh, 
    isSchoolAdmin,
    teacherRole,
    setAllUserData
  } = useClassroom();

  const [config, setConfig] = useState<GoogleDriveConfig>(googleDriveService.getConfig());
  const [folderUrlInput, setFolderUrlInput] = useState(config.folderUrl || '');
  const [scriptUrlInput, setScriptUrlInput] = useState(config.scriptUrl || '');
  const [desktopPathInput, setDesktopPathInput] = useState(config.desktopPath || 'G:\\My Drive\\DuLieu_LopHocHanhPhuc');
  const [syncMethod, setSyncMethod] = useState<'appscript' | 'desktop'>(config.syncMethod || 'appscript');
  const [autoSync, setAutoSync] = useState(config.autoSyncEnabled);

  // Trạng thái hiển thị & sao chép mã Apps Script (User request)
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [isCopiedCode, setIsCopiedCode] = useState(false);

  // Trạng thái kiểm tra & đồng bộ
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; isAuthError?: boolean } | null>(null);
  const [isAggregating, setIsAggregating] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isEditingFolder, setIsEditingFolder] = useState(!config.folderId);
  const [bghReport, setBghReport] = useState<SchoolWideAggregationReport | null>(null);
  const [connectionTextInput, setConnectionTextInput] = useState('');
  const [isConnectionCopied, setIsConnectionCopied] = useState(false);

  const isExecutive = isAdmin || isBgh || isSchoolAdmin;
  const activeClass = classes.find(c => c.id === activeClassId) || classes[0];
  const classSpecificFileName = currentUser 
    ? googleDriveService.getFileNameForUser(currentUser, activeClass?.name, teacherRole)
    : 'adminquantri.json / quantrinhatruong.json';

  useEffect(() => {
    if (isOpen) {
      const cfg = googleDriveService.getConfig();
      setConfig(cfg);
      setFolderUrlInput(cfg.folderUrl || (cfg.folderId ? `https://drive.google.com/drive/folders/${cfg.folderId}` : ''));
      setScriptUrlInput(cfg.scriptUrl || '');
      setDesktopPathInput(cfg.desktopPath || 'G:\\My Drive\\DuLieu_LopHocHanhPhuc');
      setSyncMethod(cfg.syncMethod || 'appscript');
      setAutoSync(cfg.autoSyncEnabled);
      setActionMessage(null);
      setTestResult(null);
      setIsEditingFolder(!cfg.folderId);

      // Nếu là BGH/Admin, tự động tải báo cáo tổng hợp
      if (isExecutive && cfg.scriptUrl) {
        loadBghSummary();
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const detectedFolderId = googleDriveService.extractFolderIdFromUrl(folderUrlInput);

  // 📣 Quản trị nhà trường sao chép thông tin kết nối gửi toàn trường
  const handleCopyConnectionInfo = async () => {
    const text = googleDriveService.buildConnectionShareText(currentUser?.schoolName);
    try {
      await navigator.clipboard.writeText(text);
      setIsConnectionCopied(true);
      setTimeout(() => setIsConnectionCopied(false), 2500);
      setActionMessage({ type: 'success', text: 'Đã sao chép thông tin kết nối. Gửi tin nhắn này cho BGH và toàn bộ GVCN (Zalo / email).' });
    } catch (_) {
      setActionMessage({ type: 'error', text: 'Không sao chép được tự động. Hãy bôi đen và sao chép thủ công khung thông tin kết nối.' });
    }
  };

  // 📥 GVCN / BGH dán thông tin kết nối nhận từ Quản trị nhà trường
  const handleApplyConnectionText = async () => {
    const parsed = googleDriveService.parseConnectionText(connectionTextInput);
    if (!parsed.scriptUrl && !parsed.folderId) {
      setActionMessage({ type: 'error', text: 'Không tìm thấy link thư mục Google Drive hoặc mã kết nối Apps Script trong nội dung đã dán.' });
      return;
    }
    const updated = googleDriveService.saveConfig({
      ...(parsed.folderId ? { folderId: parsed.folderId, folderUrl: parsed.folderUrl } : {}),
      ...(parsed.scriptUrl ? { scriptUrl: parsed.scriptUrl } : {}),
      syncMethod: 'appscript',
      autoSyncEnabled: true
    });
    setConfig(updated);
    setFolderUrlInput(updated.folderUrl || '');
    setScriptUrlInput(updated.scriptUrl || '');
    setSyncMethod('appscript');
    setAutoSync(true);
    setIsEditingFolder(false);
    setConnectionTextInput('');
    if (!updated.scriptUrl) {
      setActionMessage({ type: 'error', text: 'Đã lưu link thư mục nhưng thiếu Mã kết nối (Apps Script). Hãy xin Quản trị nhà trường gửi đủ tin nhắn kết nối.' });
      return;
    }
    setIsTesting(true);
    const ping = await googleDriveService.testConnection(updated.scriptUrl);
    setIsTesting(false);
    setTestResult(ping);
    setActionMessage({
      type: ping.success ? 'success' : 'error',
      text: ping.success
        ? 'Đã kết nối thư mục Google Drive dùng chung của trường! Số liệu điểm danh sẽ tự động gửi lên khi bấm Xác nhận.'
        : `Đã lưu thông tin kết nối nhưng chưa kiểm tra được: ${ping.message}`
    });
  };

  // 1. Lưu cấu hình
  const handleSaveConfig = () => {
    // Cho phép dán cả tin nhắn kết nối vào ô link thư mục
    const parsedFromFolderInput = googleDriveService.parseConnectionText(folderUrlInput);
    const updated = googleDriveService.saveConfig({
      folderUrl: (parsedFromFolderInput.folderUrl || folderUrlInput || config.folderUrl || '').trim(),
      folderId: parsedFromFolderInput.folderId || detectedFolderId || config.folderId,
      scriptUrl: (scriptUrlInput.trim() || parsedFromFolderInput.scriptUrl || ''),
      desktopPath: desktopPathInput.trim(),
      syncMethod,
      autoSyncEnabled: autoSync
    });
    setConfig(updated);
    setIsEditingFolder(false);
    setActionMessage({ type: 'success', text: 'Đã lưu cấu hình Google Drive thành công!' });

    // 🏫 Quản trị: khởi tạo / cập nhật CSDL nhà trường (trường + tài khoản) trên thư mục dùng chung
    if ((isAdmin || isSchoolAdmin) && updated.scriptUrl && updated.folderId && currentUser) {
      schoolDriveDbService.ensureCacheOwnership();
      schoolDriveDbService.syncNow().then(res => {
        setActionMessage({
          type: res.success ? 'success' : 'error',
          text: res.success
            ? `Đã kết nối thư mục dùng chung. ${res.message}`
            : `Đã lưu cấu hình nhưng chưa ghi được CSDL nhà trường: ${res.message}`
        });
      }).catch(() => {});
    }

    // Quản trị / BGH: áp dụng cùng 1 cấu hình cho toàn trường để mọi tài khoản tự nhận
    if (isExecutive && updated.scriptUrl) {
      googleDriveService.publishSharedConfig(currentUser).then(res => {
        setActionMessage({
          type: 'success',
          text: res.success
            ? 'Đã lưu cấu hình và áp dụng cho toàn trường (GVCN, BGH, Quản trị tự nhận cùng thư mục Drive).'
            : `Đã lưu cấu hình trên máy này. ${res.message}`
        });
      }).catch(() => {});
    }
  };

  // 🧪 Kiểm tra kết nối Cầu nối Apps Script (Ping Test)
  const handleTestConnection = async () => {
    const rawUrl = scriptUrlInput.trim();
    if (!rawUrl) {
      setActionMessage({ type: 'error', text: 'Vui lòng dán URL Web App của Google Apps Script trước khi kiểm tra!' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);

    // Tự động lưu cấu hình trước khi kiểm tra
    const updated = googleDriveService.saveConfig({
      folderUrl: (folderUrlInput || config.folderUrl || '').trim(),
      folderId: detectedFolderId || config.folderId,
      scriptUrl: rawUrl,
      desktopPath: desktopPathInput.trim(),
      syncMethod,
      autoSyncEnabled: autoSync
    });
    setConfig(updated);

    const res = await googleDriveService.testConnection(rawUrl);
    setIsTesting(false);
    setTestResult(res);

    if (res.success) {
      setActionMessage({ type: 'success', text: res.message || 'Kết nối Cầu nối Google Apps Script thành công 100%!' });
    } else {
      setActionMessage({ type: 'error', text: res.message });
    }
  };

  // 2. Chọn lại từ lịch sử thư mục
  const handleSelectHistoryFolder = (item: DriveFolderHistoryItem) => {
    const folderUrl = item.url || `https://drive.google.com/drive/folders/${item.id}`;
    setFolderUrlInput(folderUrl);
    const updated = googleDriveService.saveConfig({
      folderUrl: folderUrl,
      folderId: item.id
    });
    setConfig(updated);
    setIsEditingFolder(false);
    setActionMessage({ type: 'success', text: `Đã chọn thư mục: ${item.id}!` });
  };

  // 3. Đẩy lên Drive thủ công (BGH: bgh.json, Quản trị: quantrinhatruong.json, GVCN: gvcn_*.json)
  const handleManualPush = async () => {
    if (!currentUser) return;
    setIsPushing(true);
    setActionMessage(null);
    setTestResult(null);

    // ⚡ TỰ ĐỘNG LƯU CẤU HÌNH TRƯỚC KHI ĐẨY: Người dùng không cần bấm thêm nút "Lưu" nhỏ
    const updated = googleDriveService.saveConfig({
      folderUrl: (folderUrlInput || config.folderUrl || '').trim(),
      folderId: detectedFolderId || config.folderId,
      scriptUrl: scriptUrlInput.trim(),
      desktopPath: desktopPathInput.trim(),
      syncMethod,
      autoSyncEnabled: autoSync
    });
    setConfig(updated);

    const currentData = getCurrentUserData();
    const res = await googleDriveService.pushClassData(currentData, currentUser, activeClassId, true);

    setIsPushing(false);
    if (res.success) {
      setActionMessage({ type: 'success', text: res.message });
      setConfig(googleDriveService.getConfig());
    } else {
      setActionMessage({ type: 'error', text: res.message });
      if (res.isAuthError) {
        setTestResult({ success: false, message: res.message, isAuthError: true });
      }
    }
  };

  // 4. Kéo từ Drive về thủ công
  const handleManualPull = async (targetFile?: string) => {
    const fileToFetch = targetFile || classSpecificFileName;
    if (!confirm(`Hệ thống sẽ tải dữ liệu mới nhất từ Google Drive (${fileToFetch}) và hợp nhất thông minh (Smart Merge) với dữ liệu trên máy tính. Bạn có muốn tiếp tục?`)) {
      return;
    }
    setIsPulling(true);
    setActionMessage(null);
    setTestResult(null);

    // ⚡ TỰ ĐỘNG LƯU CẤU HÌNH TRƯỚC KHI KÉO
    const updated = googleDriveService.saveConfig({
      folderUrl: (folderUrlInput || config.folderUrl || '').trim(),
      folderId: detectedFolderId || config.folderId,
      scriptUrl: scriptUrlInput.trim(),
      desktopPath: desktopPathInput.trim(),
      syncMethod,
      autoSyncEnabled: autoSync
    });
    setConfig(updated);

    // 🏛️ Nếu người dùng chưa đăng nhập (đang ở màn hình đăng nhập máy mới)
    if (!currentUser) {
      const res = await googleDriveService.pullHierarchyDataFromDrive();
      setIsPulling(false);
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: `✅ ${res.message} Thầy/Cô hãy đóng bảng này để đăng nhập ngay vào tài khoản!`
        });
        setConfig(googleDriveService.getConfig());
      } else {
        setActionMessage({
          type: 'error',
          text: res.message || 'Không tìm thấy dữ liệu CSDL trường hoặc tài khoản trên Google Drive.'
        });
      }
      return;
    }

    const currentData = getCurrentUserData();
    const res = await googleDriveService.pullClassData(currentData, fileToFetch, currentUser);

    setIsPulling(false);
    if (res.success && res.mergedData) {
      setAllUserData(res.mergedData);
      setActionMessage({ type: 'success', text: res.message });
      setConfig(googleDriveService.getConfig());
    } else {
      setActionMessage({ type: 'error', text: res.message });
    }
  };

  // 5. Tải báo cáo tổng hợp BGH từ thư mục dùng chung
  const loadBghSummary = async () => {
    setIsAggregating(true);
    const res = await googleDriveService.fetchBghAggregatedReport();
    setIsAggregating(false);
    if (res.success && res.report) {
      setBghReport(res.report);
    }
  };

  const currentDateStr = new Date().toLocaleDateString('vi-VN');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header chuẩn Ảnh 6 & 7 */}
        <div className="bg-gradient-to-r from-teal-700 via-emerald-600 to-teal-600 text-white px-5 py-3.5 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-md shrink-0">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.2 rounded bg-white text-emerald-900 text-[10px] font-black uppercase tracking-wider">
                  GOOGLE DRIVE CLOUD
                </span>
                <span className="text-[11px] text-white font-medium">
                  {isExecutive ? 'Quản trị / Ban Giám Hiệu' : `Giáo viên: ${currentUser?.fullName || 'Giáo viên Chủ nhiệm'}`}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-black tracking-wide uppercase mt-0.5">
                KẾT NỐI & ĐỒNG BỘ GOOGLE DRIVE {isExecutive ? 'DÙNG CHUNG NHÀ TRƯỜNG' : 'CÁ NHÂN'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono font-bold text-white bg-white/10 px-2.5 py-1 rounded-lg hidden sm:inline">
              {currentDateStr}
            </span>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg text-white hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Đóng modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-slate-700 text-xs sm:text-sm">
          
          {/* Thông báo kết quả */}
          {actionMessage && (
            <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-between ${
              actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-rose-50 text-rose-800 border border-rose-300'
            }`}>
              <div className="flex items-center gap-2">
                {actionMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{actionMessage.text}</span>
              </div>
              <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Banner Lưu trữ tệp trên Google Drive (Ảnh 7 & Bổ sung BGH/Admin) */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase flex items-center gap-1.5 tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                LƯU TRỮ TRÊN THƯ MỤC GOOGLE DRIVE DÙNG CHUNG
              </span>
              <span className="font-mono text-[11px] bg-black/25 px-2.5 py-0.5 rounded font-bold text-white">
                {classSpecificFileName}
              </span>
            </div>
            <p className="text-[11.5px] text-white leading-relaxed pt-0.5">
              {(isSchoolAdmin && currentUser?.role !== 'bgh') ? (
                <>Tài khoản Quản trị Nhà Trường lưu trữ toàn diện vào file <strong className="text-white font-mono">quantrinhatruong.json</strong> trong thư mục dùng chung, liên thông đồng bộ toàn bộ cơ sở dữ liệu trường học.</>
              ) : isBgh ? (
                <>Tài khoản Ban Giám Hiệu lưu dữ liệu riêng vào file <strong className="text-white font-mono">bgh.json</strong> trong thư mục dùng chung và tự động quét tổng hợp tỷ lệ chuyên cần, học sinh bán trú từ toàn bộ các lớp của trường.</>
              ) : (
                <>Cả 3 cấp độ cùng dùng chung <strong>01 Thư mục Google Drive</strong>. Mỗi Giáo viên Chủ nhiệm tự động lưu file riêng theo tên lớp (ví dụ: <strong className="text-white font-mono">{classSpecificFileName}</strong>). Ban Giám Hiệu và Quản Trị Nhà Trường sẽ tự động tổng hợp tỷ lệ chuyên cần và ăn bán trú của toàn bộ các lớp trong thư mục này!</>
              )}
            </p>
          </div>

          {/* 3 BƯỚC KẾT NỐI TỰ ĐỘNG (Ảnh 7) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-black text-slate-800 text-xs uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                3 BƯỚC KẾT NỐI TỰ ĐỘNG - KHÔNG CẦN CÀI ĐẶT PHỨC TẠP
              </span>
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1 hover:underline"
              >
                <span>Mở Google Drive</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Bước 1 */}
              <div className="p-2.5 rounded-xl bg-white border border-emerald-200 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center">
                    1
                  </div>
                  <strong className="text-xs font-black text-slate-800">Tạo thư mục Drive</strong>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Mở Google Drive, tạo thư mục ví dụ: <code className="text-emerald-800 font-bold bg-slate-50 px-1 py-0.2 rounded">DuLieu_LopHocHanhPhuc</code>
                </p>
              </div>

              {/* Bước 2 */}
              <div className="p-2.5 rounded-xl bg-white border border-orange-200 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-orange-600 text-white font-black text-xs flex items-center justify-center">
                    2
                  </div>
                  <strong className="text-xs font-black text-slate-800">Chia sẻ quyền "Can Edit"</strong>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Chuột phải thư mục ➡️ Chia sẻ ➡️ Chọn: "Bất kỳ ai có đường liên kết" ➡️ Chọn vai trò: <strong>Người chỉnh sửa (Can edit)</strong>.
                </p>
              </div>

              {/* Bước 3 */}
              <div className="p-2.5 rounded-xl bg-white border border-pink-200 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-pink-600 text-white font-black text-xs flex items-center justify-center">
                    3
                  </div>
                  <strong className="text-xs font-black text-slate-800">Dán link (Tự động lưu)</strong>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Chỉ cần dán link vào ô bên dưới, hệ thống sẽ tự động lưu và kích hoạt Cầu nối Apps Script (1-Click) luôn!
                </p>
              </div>
            </div>
          </div>

          {/* 📣 QUY TRÌNH 1 THƯ MỤC DÙNG CHUNG: Quản trị gửi thông tin kết nối → BGH & GVCN dán vào */}
          {(isAdmin || isSchoolAdmin) && (
            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-300 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-indigo-950 uppercase flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-700" />
                  GỬI THÔNG TIN KẾT NỐI CHO TOÀN TRƯỜNG (BGH & GVCN)
                </span>
                <button
                  type="button"
                  onClick={handleCopyConnectionInfo}
                  disabled={!config.scriptUrl || !config.folderId}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isConnectionCopied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {isConnectionCopied ? 'ĐÃ SAO CHÉP' : 'SAO CHÉP ĐỂ GỬI'}
                </button>
              </div>
              {config.scriptUrl && config.folderId ? (
                <pre className="whitespace-pre-wrap break-all bg-white p-2.5 rounded-lg border border-indigo-200 font-mono text-[11px] text-slate-700 select-all">
                  {googleDriveService.buildConnectionShareText(currentUser?.schoolName)}
                </pre>
              ) : (
                <p className="text-[11px] font-semibold text-indigo-900">
                  Bước 1: tạo thư mục Drive, chia sẻ "Bất kỳ ai có liên kết – Người chỉnh sửa". Bước 2: triển khai mã Apps Script (mục bên dưới). Bước 3: lưu link thư mục + URL Apps Script → khung tin nhắn gửi toàn trường sẽ hiện ở đây.
                </p>
              )}
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-300 space-y-2">
            <span className="text-xs font-black text-sky-950 uppercase flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-sky-700" />
              DÁN THÔNG TIN KẾT NỐI TỪ QUẢN TRỊ NHÀ TRƯỜNG
            </span>
            <p className="text-[11px] font-semibold text-slate-600">
              BGH và GVCN dán nguyên tin nhắn kết nối (gồm link thư mục dùng chung và mã kết nối Apps Script) rồi bấm Áp dụng. Cả trường cùng làm việc trên một thư mục Google Drive.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                value={connectionTextInput}
                onChange={(e) => setConnectionTextInput(e.target.value)}
                rows={2}
                placeholder="Dán tin nhắn kết nối hoặc link thư mục / link Apps Script vào đây..."
                className="flex-1 px-3 py-2 rounded-xl border border-sky-300 bg-white font-mono text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={handleApplyConnectionText}
                disabled={!connectionTextInput.trim() || isTesting}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold text-xs uppercase cursor-pointer shrink-0"
              >
                {isTesting ? 'ĐANG KIỂM TRA...' : 'ÁP DỤNG'}
              </button>
            </div>
          </div>

          {/* Khối Thư mục Google Drive Đang Kết Nối (Ảnh 7) */}
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-300 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-emerald-950 uppercase flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></span>
                THƯ MỤC GOOGLE DRIVE ĐANG KẾT NỐI:
              </span>
              {config.folderId && (
                <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-mono text-[11px] font-bold">
                  ID: {config.folderId}
                </span>
              )}
            </div>

            {isEditingFolder ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderUrlInput}
                    onChange={(e) => setFolderUrlInput(e.target.value)}
                    placeholder="Dán link thư mục Google Drive (https://drive.google.com/drive/folders/...)"
                    className="flex-1 px-3 py-2 rounded-xl border border-emerald-300 bg-white font-mono text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase transition-colors cursor-pointer"
                  >
                    LƯU
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">URL Cầu nối Apps Script (Tùy chọn nâng cao):</label>
                  <input
                    type="text"
                    value={scriptUrlInput}
                    onChange={(e) => setScriptUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs text-slate-700"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-emerald-200">
                <div className="font-mono text-xs text-slate-800 truncate max-w-md">
                  {config.folderUrl || `https://drive.google.com/drive/folders/${config.folderId}`}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {config.folderUrl && (
                    <a
                      href={config.folderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-xs flex items-center gap-1"
                    >
                      <span>Mở Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsEditingFolder(true)}
                    className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <span>ĐỔI THƯ MỤC KHÁC</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Lịch Sử Các Thư Mục Google Drive Thầy/Cô Đã Từng Dùng (Ảnh 6) */}
          {Array.isArray(config.folderHistory) && config.folderHistory.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[11px] font-black text-slate-700 uppercase flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" />
                LỊCH SỬ CÁC THƯ MỤC GOOGLE DRIVE THẦY/CÔ ĐÃ TỪNG DÙNG:
              </span>
              <div className="space-y-1">
                {config.folderHistory.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="font-mono font-bold text-slate-800">ID: {item.id}</span>
                      <span className="text-[10.5px] text-slate-400">[{item.date}]</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectHistoryFolder(item)}
                      className="px-2.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors cursor-pointer shrink-0"
                    >
                      Chọn lại
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2 NÚT HÀNH ĐỘNG CHÍNH (Ảnh 6) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={handleManualPush}
              disabled={isPushing || !currentUser}
              className={`py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-[0.99] ${
                !currentUser 
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60' 
                  : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white'
              }`}
              title={!currentUser ? 'Vui lòng đăng nhập trước khi đẩy dữ liệu lớp lên Drive' : 'Đồng bộ dữ liệu lớp hiện tại lên Google Drive'}
            >
              <UploadCloud className={`w-4 h-4 ${isPushing ? 'animate-bounce' : ''}`} />
              <span>{isPushing ? 'ĐANG ĐỒNG BỘ...' : (!currentUser ? 'CẦN ĐĂNG NHẬP ĐỂ ĐẨY' : 'ĐỒNG BỘ LÊN GOOGLE DRIVE NGAY')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleManualPull()}
              disabled={isPulling}
              className="py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-800 hover:to-indigo-700 text-white font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer active:scale-[0.99]"
            >
              <DownloadCloud className={`w-4 h-4 ${isPulling ? 'animate-bounce' : ''}`} />
              <span>
                {isPulling ? 'ĐANG TẢI DỮ LIỆU...' : (!currentUser ? 'NẠP CSDL TRƯỜNG & TÀI KHOẢN TỪ DRIVE' : 'NẠP KHÔI PHỤC TỪ GOOGLE DRIVE')}
              </span>
            </button>
          </div>

          {/* Ghi chú Tự Động Đồng Bộ Ngầm 5 Giây Toàn Hệ Thống */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 text-teal-950 text-xs leading-relaxed flex items-start gap-2.5">
            <span className="text-base leading-none">⚡</span>
            <div>
              <strong className="text-teal-800 uppercase font-black tracking-wide block text-[11.5px] pb-0.5">
                Cơ chế ngầm tự động đồng bộ Google Drive mỗi 5 giây (Toàn hệ thống):
              </strong>
              <span>
                Hệ thống <strong>tự động bấm lệnh đồng bộ ngầm sau mỗi 5 giây</strong> để cập nhật dữ liệu mới nhất từ toàn hệ thống áp dụng cho tất cả các tài khoản (Quản trị tối cao, Quản trị nhà trường, Ban giám hiệu, Giáo viên chủ nhiệm & bộ môn). Thầy/Cô chỉ cần cấu hình Cầu nối 1 lần ban đầu, dữ liệu sẽ liên tục được bảo toàn và cập nhật xuyên suốt đa máy tính!
              </span>
            </div>
          </div>

          {/* Tabs Phương Thức Cầu Nối (Ảnh 6) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-black text-slate-800 text-xs uppercase flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-slate-600" />
                PHƯƠNG THỨC CẦU NỐI GOOGLE DRIVE:
              </span>
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSyncMethod('appscript')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    syncMethod === 'appscript' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cầu nối Apps Script (1-Click)
                </button>
                <button
                  type="button"
                  onClick={() => setSyncMethod('desktop')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    syncMethod === 'desktop' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ổ Drive trên máy (Desktop)
                </button>
              </div>
            </div>

            {syncMethod === 'desktop' ? (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Nếu máy tính Thầy/Cô có cài ứng dụng Google Drive cho máy tính (Google Drive for Desktop), hãy nhập đường dẫn thư mục Google Drive tại đây:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={desktopPathInput}
                    onChange={(e) => setDesktopPathInput(e.target.value)}
                    placeholder="Ví dụ: G:\My Drive\DuLieu_LopHocHanhPhuc hoặc D:\Google Drive\DuLieu_LopHocHanhPhuc"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs bg-white text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase cursor-pointer"
                  >
                    LƯU
                  </button>
                </div>
                <div className="text-[10.5px] text-emerald-700 font-medium">
                  ✓ Khi lưu tại đây, Google Drive trên máy tính sẽ tự động đồng bộ thời gian thực 2 chiều lên đám mây 24/7!
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Thanh trạng thái Cầu nối Apps Script (Ảnh 1 & 2) */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Cầu nối Apps Script đã sẵn sàng cho Thư mục ID:</span>
                    <strong className="font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      {config.folderId || 'Chưa nhận diện'}
                    </strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href="https://script.google.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs flex items-center gap-1 border border-teal-200 transition-colors cursor-pointer"
                      title="Mở Google Apps Script để tạo script mới hoặc ủy quyền"
                    >
                      <span>Mở script.google.com</span>
                      <ExternalLink className="w-3 h-3 text-teal-600" />
                    </a>

                    <button
                      type="button"
                      onClick={() => setShowScriptCode(!showScriptCode)}
                      className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center gap-1 border border-amber-300 transition-colors cursor-pointer shadow-2xs"
                    >
                      {showScriptCode ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                          <span>Ẩn mã</span>
                        </>
                      ) : (
                        <>
                          <Code2 className="w-3.5 h-3.5 text-amber-700" />
                          <span>Xem & Sao chép mã</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Hộp thông báo và hướng dẫn quan trọng (Ảnh 1) */}
                <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-1.5">
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-black text-emerald-900 mr-1">💡 Tự động 1-Click:</span>
                    Thầy Cô chỉ cần dán link thư mục Google Drive (đã bật quyền <em>"Người chỉnh sửa"</em>) vào phần mềm. Hệ thống sẽ tự động ghi đè duy nhất 01 tệp dữ liệu mà không cần cài đặt Apps Script phức tạp, không tạo file rác giúp thư mục Drive luôn gọn gàng!
                  </div>
                  <div className="text-[11px] text-slate-500 italic">
                    (Tùy chọn nâng cao: Thầy Cô cũng có thể tự dán URL Web App riêng của mình vào ô bên dưới nếu muốn)
                  </div>
                </div>

                {/* Hộp cảnh báo quan trọng khi triển khai Apps Script */}
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Lưu ý quan trọng khi Triển khai (Deploy) Google Apps Script:</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-900 pl-1 leading-relaxed">
                    <li>Thực thi dưới dạng (Execute as): <strong>Tôi - Tài khoản của bạn (Me)</strong></li>
                    <li>Ai có quyền truy cập (Who has access): <strong className="text-rose-700 underline">Bất kỳ ai (Anyone)</strong> <em>(Không để mặc định "Only myself" vì sẽ bị chặn)</em></li>
                  </ul>
                </div>

                {/* Ô dán URL Web App triển khai (Ảnh 1 & 2) */}
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={scriptUrlInput}
                      onChange={(e) => {
                        setScriptUrlInput(e.target.value);
                        setTestResult(null);
                      }}
                      onBlur={() => {
                        if (scriptUrlInput.trim()) {
                          handleSaveConfig();
                        }
                      }}
                      placeholder="Dán URL Web App triển khai (https://script.google.com/macros/s/AKfycb.../exec)"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs bg-white text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-200"
                    />
                    
                    {/* Nút Kiểm tra kết nối */}
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting || !scriptUrlInput.trim()}
                      className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs uppercase transition-colors cursor-pointer shrink-0 shadow-xs flex items-center gap-1.5"
                      title="Kiểm tra xem Cầu nối Apps Script đã hoạt động và được cấp quyền Anyone chưa"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                      <span>{isTesting ? 'Đang test...' : 'Kiểm tra'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs uppercase transition-colors cursor-pointer shrink-0 shadow-xs"
                    >
                      LƯU
                    </button>
                  </div>

                  {/* Khung hiển thị kết quả kiểm tra Ping Test */}
                  {testResult && (
                    <div className={`p-2.5 rounded-xl text-xs font-medium border animate-in fade-in duration-150 ${
                      testResult.success 
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
                        : 'bg-rose-50 text-rose-950 border-rose-300'
                    }`}>
                      <div className="flex items-start gap-2">
                        {testResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1">
                          <strong className="block font-bold">
                            {testResult.success ? '✅ Kết nối Google Apps Script thành công!' : '⚠️ Kết nối Cầu nối chưa thành công:'}
                          </strong>
                          <p className="text-[11.5px] leading-relaxed">{testResult.message}</p>
                          {testResult.isAuthError && (
                            <div className="mt-1 p-2 rounded-lg bg-white/80 border border-rose-200 text-[11px] text-rose-900 leading-relaxed font-normal">
                              <strong>Cách khắc phục 30 giây:</strong> Mở trang Apps Script ➡️ Bấm nút <strong>Triển khai (Deploy)</strong> ở góc trên bên phải ➡️ Chọn <strong>Quản lý bản triển khai (Manage deployments)</strong> ➡️ Bấm biểu tượng chiếc bút (Edit) ➡️ Đổi mục <strong>"Ai có quyền truy cập"</strong> thành <strong>"Bất kỳ ai (Anyone)"</strong> ➡️ Bấm Triển khai và sao chép lại link!
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Khối hiển thị mã nguồn Google Apps Script (Ảnh 2) */}
                {showScriptCode && (
                  <div className="rounded-xl border border-slate-700 overflow-hidden shadow-md animate-in fade-in duration-200">
                    <div className="bg-white text-slate-700 px-3.5 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-slate-200">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                        <Code2 className="w-4 h-4 text-emerald-600" />
                        <span>Mã nguồn Google Apps Script (Đã tự động điền Folder ID của Thầy Cô)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href="https://script.google.com/"
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-1 transition-colors"
                        >
                          <span>Mở script.google.com</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            const code = googleDriveService.generateAppsScriptCode(config.folderId);
                            navigator.clipboard.writeText(code).then(() => {
                              setIsCopiedCode(true);
                              setTimeout(() => setIsCopiedCode(false), 2500);
                              setActionMessage({ type: 'success', text: 'Đã sao chép toàn bộ mã nguồn Google Apps Script vào clipboard!' });
                            });
                          }}
                          className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                            isCopiedCode ? 'bg-emerald-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                          }`}
                        >
                          {isCopiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopiedCode ? 'Đã sao chép!' : 'Sao chép mã'}</span>
                        </button>
                      </div>
                    </div>
                    <pre className="p-3.5 bg-white text-emerald-600 font-mono text-[11px] leading-relaxed max-h-64 overflow-x-auto overflow-y-auto whitespace-pre select-all border-none">
                      {googleDriveService.generateAppsScriptCode(config.folderId)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Checkbox tự động đồng bộ */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoSyncToggle"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="autoSyncToggle" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Tự động đồng bộ lên Google Drive sau mỗi buổi dạy (khi có thay đổi điểm, điểm danh)
                </label>
              </div>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
              >
                Lưu thiết lập
              </button>
            </div>
          </div>

          {/* Dành Cho Cấp 1 & Cấp 2: Báo Cáo Tổng Hợp BGH & Quản Trị Từ Thư Mục Dùng Chung */}
          {isExecutive && (
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-300 space-y-3">
              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                <div className="flex items-center gap-2">
                  <School className="w-4 h-4 text-amber-700" />
                  <strong className="text-xs font-black text-amber-950 uppercase">
                    LIÊN THÔNG BAN GIÁM HIỆU & QUẢN TRỊ (TỪ THƯ MỤC DÙNG CHUNG)
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={loadBghSummary}
                  disabled={isAggregating}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isAggregating ? 'animate-spin' : ''}`} />
                  <span>{isAggregating ? 'Đang quét...' : 'Cập nhật số liệu'}</span>
                </button>
              </div>

              {bghReport ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-white border border-amber-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Tổng số lớp</div>
                      <div className="text-sm font-black text-indigo-950">{bghReport.summary.totalClasses}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-amber-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Tổng học sinh</div>
                      <div className="text-sm font-black text-indigo-950">{bghReport.summary.totalStudents}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-amber-200">
                      <div className="text-[10px] text-emerald-700 font-bold uppercase">Tỉ lệ chuyên cần</div>
                      <div className="text-sm font-black text-emerald-800">{bghReport.summary.attendanceRate}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-amber-200">
                      <div className="text-[10px] text-orange-700 font-bold uppercase">Tỉ lệ bán trú</div>
                      <div className="text-sm font-black text-orange-800">{bghReport.summary.boardingRate}</div>
                    </div>
                  </div>

                  {/* Chi tiết từng lớp */}
                  {Array.isArray(bghReport.classesDetail) && bghReport.classesDetail.length > 0 && (
                    <div className="overflow-x-auto max-h-44 border border-amber-200 rounded-lg">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-amber-100/70 text-amber-950 font-black uppercase text-[10px]">
                          <tr>
                            <th className="p-1.5">Lớp</th>
                            <th className="p-1.5">Tệp lưu</th>
                            <th className="p-1.5">Sĩ số</th>
                            <th className="p-1.5">Có mặt</th>
                            <th className="p-1.5">Ăn bán trú</th>
                            <th className="p-1.5">Trạng thái</th>
                            <th className="p-1.5 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100 bg-white">
                          {bghReport.classesDetail.map((c, i) => (
                            <tr key={i} className="hover:bg-amber-50/50">
                              <td className="p-1.5 font-bold text-slate-900">{c.className}</td>
                              <td className="p-1.5 font-mono text-[10px] text-slate-500">{c.fileName}</td>
                              <td className="p-1.5">{c.total}</td>
                              <td className="p-1.5 font-medium text-emerald-700">{c.present} ({c.attendanceRate})</td>
                              <td className="p-1.5 font-medium text-orange-700">{c.boardingActual}/{c.boardingRegistered}</td>
                              <td className="p-1.5">
                                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                                  c.status === 'reported' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {c.status === 'reported' ? 'Đã báo cáo' : 'Chưa điểm danh'}
                                </span>
                              </td>
                              <td className="p-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleManualPull(c.fileName)}
                                  className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] border border-indigo-200 transition-colors cursor-pointer"
                                  title={`Tải dữ liệu của ${c.className}`}
                                >
                                  Nạp dữ liệu
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-600">
                  Nhấn "Cập nhật số liệu" để tự động quét toàn bộ các tệp <code className="font-mono text-amber-900 font-bold">gvcn_*.json</code> mà các giáo viên chủ nhiệm đã đẩy lên thư mục Google Drive dùng chung.
                </p>
              )}
            </div>
          )}

        </div>

        {/* Footer chuẩn Ảnh 6 */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 font-medium truncate max-w-sm">
            Google Drive Cloud Sync v2.5 • Tự động kích hoạt Cầu nối Apps Script (1-Click) & Đổi thư mục linh hoạt
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
