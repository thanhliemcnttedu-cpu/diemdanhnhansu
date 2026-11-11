import React, { useState, useEffect } from 'react';
import { 
  Cloud, Folder, Link2, Copy, Check, RefreshCw, UploadCloud, 
  DownloadCloud, ShieldAlert, CheckCircle2, AlertTriangle, 
  HelpCircle, ExternalLink, School, Settings, Database, ArrowRight,
  Clock, X, Sparkles, Play, HardDrive, History, CheckCheck, Users,
  Code2, Eye, EyeOff, Loader2, Wand2
} from 'lucide-react';
import { googleDriveService } from '../../services/googleDriveService';
import { appsScriptSetupService, versionLabel, DRIVE_CONNECTION_EVENT, type DriveConnection } from '../../services/appsScriptSetupService';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';
import { GoogleDriveConfig, DriveFolderHistoryItem, SchoolWideAggregationReport } from '../../types/driveSync';
import { useClassroom } from '../../context/ClassroomContext';
import { dataAdapter } from '../../services/dataAdapter';

interface GoogleDriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Render inside a page (no overlay, no header); `sections` picks which blocks to show */
  embedded?: boolean;
  sections?: Array<'connect' | 'sync' | 'advanced' | 'report'>;
  /** When set, the "Apps Script wizard" buttons call this instead of opening the dialog */
  onOpenWizard?: (mode?: 'install' | 'update') => void;
}

export const GoogleDriveSyncModal: React.FC<GoogleDriveSyncModalProps> = ({ isOpen: isOpenProp, onClose, embedded = false, sections, onOpenWizard }) => {
  const isOpen = isOpenProp || embedded;
  const openWizard = (m?: 'install' | 'update') => (onOpenWizard ? onOpenWizard(m) : appsScriptSetupService.open(m));
  // "Ổ Drive trên máy" only exists with the Express server or the Desktop build
  const hasDesktopDrive = typeof window !== 'undefined' && ((window as any).__lhhpApiAvailable === true || Boolean((window as any).electronAPI));
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
  // Bố cục 2 cột + thẻ (vừa một màn hình, không phải cuộn)
  const [tab, setTab] = useState<'connect' | 'sync' | 'advanced' | 'report'>('connect');
  const show = (id: 'connect' | 'sync' | 'advanced' | 'report') => (embedded && sections ? sections.includes(id) : tab === id);
  // 🔌 Trạng thái kết nối CSDL nhà trường + phiên bản Apps Script (kiểm tra mỗi lần mở hộp)
  const [conn, setConn] = useState<DriveConnection | null>(appsScriptSetupService.getLastConnection());
  useEffect(() => {
    const h = (e: Event) => setConn((e as CustomEvent).detail as DriveConnection);
    window.addEventListener(DRIVE_CONNECTION_EVENT, h);
    return () => window.removeEventListener(DRIVE_CONNECTION_EVENT, h);
  }, []);
  const recheckConnection = () => { appsScriptSetupService.checkConnection(true).then(setConn).catch(() => { /* ignore */ }); };

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
      setTab('connect');
      recheckConnection();

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

  const isSetupAdmin = isAdmin || isSchoolAdmin;
  // Lưu / kiểm tra / dán thông tin kết nối xong → kiểm tra lại trạng thái kết nối ngay
  const saveAndRecheck = () => { handleSaveConfig(); setTimeout(recheckConnection, 300); };
  const testAndRecheck = async () => { await handleTestConnection(); recheckConnection(); };
  const applyTextAndRecheck = async () => { await handleApplyConnectionText(); recheckConnection(); };

  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-3 space-y-2';
  const titleCls = 'text-sm font-black text-slate-900 flex items-center gap-2';
  const inputCls = 'w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-mono text-sm text-slate-800 focus:outline-none focus:border-emerald-600';
  const btnGreen = 'no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-black inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer';
  const btnIndigo = 'no-hover-fx h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-black inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer';
  const btnLight = 'no-hover-fx h-10 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer';

  const connState = conn?.state || 'none';
  const connTone = connState === 'connected' ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
    : connState === 'unreachable' ? 'bg-rose-50 border-rose-300 text-rose-950'
      : connState === 'no_db' ? 'bg-amber-50 border-amber-300 text-amber-950'
        : 'bg-slate-100 border-slate-200 text-slate-800';
  const oldFolders = Array.isArray(config.folderHistory) ? config.folderHistory.filter(h => h.id !== config.folderId) : [];
  const tabs: Array<{ id: 'connect' | 'sync' | 'advanced' | 'report'; label: string }> = [
    { id: 'connect', label: 'Kết nối' },
    { id: 'sync', label: 'Đồng bộ dữ liệu' },
    { id: 'advanced', label: 'Nâng cao' },
    ...(isExecutive ? [{ id: 'report' as const, label: 'Tổng hợp toàn trường' }] : []),
  ];

  return (
    <div {...(embedded ? {} : { role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'drive-modal-title' })} className={embedded ? '' : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200'}>
      <div className={embedded ? '' : 'relative w-full max-w-6xl bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh]'}>
        {/* Đầu hộp: tên + thẻ + đóng (1 dòng) — ẩn khi nhúng trong trang Dữ liệu */}
        <div style={embedded ? { display: 'none' } : undefined} className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0"><Cloud className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 id="drive-modal-title" className="text-base font-black text-slate-900 truncate">Google Drive của nhà trường</h2>
              <p className="text-xs text-slate-600 truncate">
                {isExecutive ? 'Quản trị / Ban giám hiệu' : (currentUser?.fullName || 'Chưa đăng nhập')} • tệp <strong className="font-mono text-indigo-700">{classSpecificFileName}</strong>
              </p>
            </div>
          </div>
          <div className="flex gap-1 bg-slate-200/70 p-1 rounded-xl order-3 w-full lg:order-none lg:w-auto overflow-x-auto" role="tablist" aria-label="Nội dung">
            {tabs.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`no-hover-fx flex-1 px-3.5 py-1.5 rounded-lg text-sm font-black whitespace-nowrap cursor-pointer ${tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>{t.label}</button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer" aria-label="Đóng" title="Đóng">
            <X className="w-5 h-5 text-slate-700" />
          </button>
        </div>

        <div className={embedded ? 'space-y-3 text-sm text-slate-700' : 'p-3 sm:p-4 overflow-y-auto space-y-3 text-sm text-slate-700'}>
          {/* 🔌 TRẠNG THÁI KẾT NỐI + PHIÊN BẢN (luôn hiện, tự kiểm tra mỗi lần mở) */}
          {/* Inside the Data page the banner lives on the Connect tab; other tabs only show it when something is wrong */}
          <div style={embedded && !show('connect') && (connState === 'connected' || connState === 'checking') ? { display: 'none' } : undefined} className={`rounded-2xl border px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 ${connTone}`} role="status" aria-live="polite">
            <span className="shrink-0">
              {connState === 'checking' ? <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
                : connState === 'connected' ? <CheckCircle2 className="w-6 h-6 text-emerald-700" />
                  : connState === 'none' ? <Cloud className="w-6 h-6 text-slate-500" />
                    : <AlertTriangle className={`w-6 h-6 ${connState === 'unreachable' ? 'text-rose-700' : 'text-amber-700'}`} />}
            </span>
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-black">
                {connState === 'checking' ? 'Đang kiểm tra kết nối với Google Drive…'
                  : connState === 'connected' ? 'Cơ sở dữ liệu của nhà trường đã được kết nối với thư mục Google Drive'
                    : connState === 'no_db' ? 'Đã mở được thư mục Google Drive nhưng chưa có cơ sở dữ liệu nhà trường'
                      : connState === 'unreachable' ? 'Chưa kết nối được với thư mục Google Drive của trường'
                        : 'Máy này chưa kết nối thư mục Google Drive của trường'}
              </p>
              {connState !== 'checking' && connState !== 'connected' && <p className="text-xs mt-0.5">{conn?.detail || 'Dán link thư mục và link Apps Script ở thẻ Kết nối rồi bấm Lưu kết nối.'}</p>}
            </div>
            {conn?.version && connState !== 'checking' && (
              <span className={`px-2.5 py-1 rounded-full border text-xs font-black whitespace-nowrap ${conn.outdated ? 'bg-amber-100 border-amber-300 text-amber-950' : 'bg-white border-emerald-300 text-emerald-900'}`}>
                {versionLabel(conn.version)}{conn.outdated ? ` • cần cập nhật lên ${conn.latest}` : ' • mới nhất'}
              </span>
            )}
            {connState === 'connected' && <span className="px-2.5 py-1 rounded-full bg-white border border-emerald-300 text-xs font-black text-emerald-900 whitespace-nowrap">{conn?.schools || 0} trường</span>}
            {conn?.outdated && isSetupAdmin && (
              <button type="button" onClick={() => openWizard('update')} className="no-hover-fx h-9 px-3 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-sm font-black inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer">
                <Wand2 className="w-4 h-4" /> Cập nhật Apps Script
              </button>
            )}
            <button type="button" onClick={recheckConnection} disabled={connState === 'checking'} className="no-hover-fx h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60">
              <RefreshCw className={`w-4 h-4 ${connState === 'checking' ? 'animate-spin' : ''}`} /> Kiểm tra lại
            </button>
          </div>

          {actionMessage && (
            <div className={`px-3 py-2 rounded-xl text-sm font-bold flex items-start justify-between gap-2 border ${
              actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}>
              <div className="flex items-start gap-2">
                {actionMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />}
                <span>{actionMessage.text}</span>
              </div>
              <button type="button" onClick={() => setActionMessage(null)} className="no-hover-fx text-slate-500 hover:text-slate-800 shrink-0 cursor-pointer" aria-label="Ẩn thông báo"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* ───────────────── THẺ: KẾT NỐI ───────────────── */}
          {show('connect') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              <section className={cardCls}>
                <h3 className={titleCls}><Folder className="w-4 h-4 text-emerald-700" /> Thư mục và Apps Script đang dùng</h3>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700">Link thư mục Google Drive dùng chung</span>
                    {!isEditingFolder && config.folderId && (
                      <span className="flex items-center gap-1.5">
                        <a href={config.folderUrl || `https://drive.google.com/drive/folders/${config.folderId}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-800 hover:underline inline-flex items-center gap-1">Mở Drive <ExternalLink className="w-3 h-3" /></a>
                        <button type="button" onClick={() => setIsEditingFolder(true)} className="no-hover-fx text-xs font-bold text-indigo-700 hover:underline cursor-pointer">Đổi thư mục</button>
                      </span>
                    )}
                  </div>
                  {isEditingFolder || !config.folderId ? (
                    <input type="text" value={folderUrlInput} onChange={(e) => setFolderUrlInput(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" aria-label="Link thư mục Google Drive" className={`mt-1 ${inputCls}`} />
                  ) : (
                    <p className="mt-1 h-10 px-3 rounded-xl border border-emerald-200 bg-emerald-50/50 font-mono text-sm text-slate-800 flex items-center truncate" title={config.folderUrl || config.folderId}>
                      <span className="truncate">{config.folderUrl || `https://drive.google.com/drive/folders/${config.folderId}`}</span>
                    </p>
                  )}
                </div>
                <label className="block text-xs font-bold text-slate-700">Link Apps Script (đuôi /exec)
                  <input type="text" value={scriptUrlInput} onChange={(e) => { setScriptUrlInput(e.target.value); setTestResult(null); }} placeholder="https://script.google.com/macros/s/…/exec" className={`mt-1 ${inputCls}`} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={saveAndRecheck} className={btnGreen}><Check className="w-4 h-4" /> Lưu kết nối</button>
                  <button type="button" onClick={testAndRecheck} disabled={isTesting || !scriptUrlInput.trim()} className={btnIndigo}>
                    <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} /> {isTesting ? 'Đang kiểm tra…' : 'Kiểm tra link'}
                  </button>
                  {isSetupAdmin && !embedded && (
                    <button type="button" onClick={() => openWizard()} className={btnLight} title="Hướng dẫn từng bước cài / cập nhật Apps Script, tự kiểm tra link /exec">
                      <Wand2 className="w-4 h-4 text-indigo-600" /> Trình cài đặt Apps Script
                    </button>
                  )}
                </div>
                {testResult && (
                  <div className={`px-3 py-2 rounded-xl text-xs border ${testResult.success ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-rose-50 text-rose-950 border-rose-300'}`}>
                    <strong className="block">{testResult.success ? 'Link Apps Script hoạt động.' : 'Link Apps Script chưa dùng được:'}</strong>
                    <span>{testResult.message}</span>
                    {testResult.isAuthError && (
                      <span className="block mt-1">Cách sửa: mở dự án Apps Script → <strong>Triển khai</strong> → <strong>Quản lý các tùy chọn triển khai</strong> → bút chì → "Người có quyền truy cập" chọn <strong>Bất kỳ ai</strong> → Triển khai.</span>
                    )}
                  </div>
                )}
              </section>

              <div className="space-y-3">
                {isSetupAdmin && config.scriptUrl && config.folderId && (
                  <section className={cardCls}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className={titleCls}><Users className="w-4 h-4 text-indigo-700" /> Gửi thông tin kết nối cho toàn trường</h3>
                      <button type="button" onClick={handleCopyConnectionInfo} className={btnIndigo}>
                        {isConnectionCopied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {isConnectionCopied ? 'Đã sao chép' : 'Sao chép để gửi'}
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap break-all bg-slate-50 px-2.5 py-2 rounded-xl border border-slate-200 font-mono text-xs text-slate-700 select-all max-h-24 overflow-y-auto">
                      {googleDriveService.buildConnectionShareText(currentUser?.schoolName)}
                    </pre>
                    <p className="text-xs text-slate-600">Gửi tin nhắn này qua Zalo / email. BGH và giáo viên dán vào màn đăng nhập là kết nối xong.</p>
                  </section>
                )}
                {(!isSetupAdmin || !config.scriptUrl || !config.folderId) && (
                  <section className={cardCls}>
                    <h3 className={titleCls}><Link2 className="w-4 h-4 text-sky-700" /> Dán thông tin kết nối nhận từ Quản trị</h3>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <textarea value={connectionTextInput} onChange={(e) => setConnectionTextInput(e.target.value)} rows={2}
                        placeholder="Dán nguyên tin nhắn kết nối (link thư mục + link Apps Script)…" aria-label="Tin nhắn kết nối"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-sm text-slate-800 focus:outline-none focus:border-sky-600" />
                      <button type="button" onClick={applyTextAndRecheck} disabled={!connectionTextInput.trim() || isTesting} className="no-hover-fx h-10 px-4 rounded-xl bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white text-sm font-black whitespace-nowrap cursor-pointer self-start">
                        {isTesting ? 'Đang kiểm tra…' : 'Áp dụng'}
                      </button>
                    </div>
                    {isSetupAdmin && <p className="text-xs text-slate-600">Quản trị cài lần đầu: bấm <strong>Trình cài đặt Apps Script</strong> ở khung bên để được hướng dẫn 5 bước.</p>}
                  </section>
                )}
                {oldFolders.length > 0 && (
                  <section className={cardCls}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className={titleCls}><History className="w-4 h-4 text-slate-500" /> Thư mục đã từng dùng trên máy này</h3>
                      <button type="button"
                        onClick={() => { setConfig(googleDriveService.clearFolderHistory()); setActionMessage({ type: 'success', text: 'Đã xóa lịch sử các thư mục cũ trên máy này.' }); }}
                        className="no-hover-fx h-8 px-2.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs whitespace-nowrap cursor-pointer"
                        title="Xóa mọi thư mục cũ khỏi danh sách (giữ thư mục đang kết nối)">Xóa lịch sử</button>
                    </div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {oldFolders.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                          <Folder className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="font-mono font-bold text-slate-800 truncate flex-1" title={item.id}>ID: {item.id}</span>
                          <span className="text-slate-500 whitespace-nowrap max-sm:hidden">{item.date}</span>
                          <button type="button" onClick={() => { handleSelectHistoryFolder(item); setTimeout(recheckConnection, 300); }} className="no-hover-fx px-2 py-0.5 rounded-md bg-white hover:bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 whitespace-nowrap cursor-pointer">Chọn lại</button>
                          <button type="button" onClick={() => setConfig(googleDriveService.removeFolderHistory(item.id))} className="no-hover-fx w-6 h-6 rounded-md text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer shrink-0" title="Xóa thư mục này khỏi lịch sử" aria-label="Xóa thư mục này khỏi lịch sử"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}

          {/* ───────────────── THẺ: ĐỒNG BỘ ───────────────── */}
          {show('sync') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              <section className={cardCls}>
                <h3 className={titleCls}><UploadCloud className="w-4 h-4 text-emerald-700" /> Đồng bộ thủ công</h3>
                <p className="text-xs text-slate-600">
                  Tệp của tài khoản này trên thư mục dùng chung: <strong className="font-mono text-slate-800">{classSpecificFileName}</strong>
                  {config.lastSyncTime ? <> • đồng bộ gần nhất: <strong>{config.lastSyncTime}</strong></> : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleManualPush} disabled={isPushing || !currentUser} className={btnGreen}
                    title={!currentUser ? 'Đăng nhập trước khi đẩy dữ liệu lên Drive' : 'Gửi dữ liệu hiện tại lên Google Drive'}>
                    <UploadCloud className={`w-4 h-4 ${isPushing ? 'animate-bounce' : ''}`} /> {isPushing ? 'Đang gửi…' : (!currentUser ? 'Cần đăng nhập để gửi' : 'Gửi lên Google Drive ngay')}
                  </button>
                  <button type="button" onClick={() => handleManualPull()} disabled={isPulling} className={btnIndigo}>
                    <DownloadCloud className={`w-4 h-4 ${isPulling ? 'animate-bounce' : ''}`} /> {isPulling ? 'Đang tải…' : (!currentUser ? 'Nạp CSDL trường & tài khoản từ Drive' : 'Nạp lại từ Google Drive')}
                  </button>
                </div>
                <p className="text-xs text-slate-600">Nạp lại = gộp thông minh với dữ liệu trên máy (không xóa dữ liệu đang có).</p>
              </section>
              <section className={cardCls}>
                <h3 className={titleCls}><Clock className="w-4 h-4 text-teal-700" /> Tự động đồng bộ</h3>
                <label className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
                  <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300" />
                  <span>Tự gửi lên Google Drive khi dữ liệu thay đổi (điểm, điểm danh, bán trú…)</span>
                </label>
                <button type="button" onClick={handleSaveConfig} className={btnLight}><Check className="w-4 h-4" /> Lưu thiết lập</button>
                <ul className="text-xs text-slate-600 list-disc pl-4 space-y-0.5">
                  <li>Thay đổi được gom khoảng 15 giây rồi gửi một lần; bấm <strong>Xác nhận</strong> điểm danh / bán trú thì gửi ngay.</li>
                  <li>Máy khác của cùng tài khoản và màn tổng hợp của BGH tự nhận dữ liệu mới trong khoảng 1 phút.</li>
                </ul>
              </section>
            </div>
          )}

          {/* ───────────────── THẺ: NÂNG CAO ───────────────── */}
          {show('advanced') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              <section className={cardCls}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className={titleCls}><Settings className="w-4 h-4 text-slate-600" /> Cách kết nối</h3>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    {([['appscript', 'Apps Script'], ['desktop', 'Ổ Drive trên máy']] as const).filter(([id]) => id === 'appscript' || hasDesktopDrive).map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setSyncMethod(id)} aria-pressed={syncMethod === id}
                        className={`no-hover-fx px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap cursor-pointer ${syncMethod === id ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:text-slate-900'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                {syncMethod === 'desktop' ? (
                  <>
                    <p className="text-xs text-slate-600">Máy có cài Google Drive cho máy tính: nhập đường dẫn thư mục Drive trên máy (chỉ dùng với bản cài trên máy tính).</p>
                    <div className="flex gap-2">
                      <input type="text" value={desktopPathInput} onChange={(e) => setDesktopPathInput(e.target.value)} placeholder="G:\My Drive\DuLieu_LopHocHanhPhuc" aria-label="Đường dẫn thư mục Drive trên máy" className={inputCls} />
                      <button type="button" onClick={handleSaveConfig} className={btnGreen}>Lưu</button>
                    </div>
                  </>
                ) : (
                  <ul className="text-xs text-slate-700 list-disc pl-4 space-y-1">
                    <li>Cả trường dùng chung <strong>1 thư mục</strong> + <strong>1 Apps Script</strong>; mỗi tài khoản một tệp riêng.</li>
                    <li>Khi triển khai Apps Script: Thực thi với tư cách <strong>Tôi</strong>, Người có quyền truy cập <strong>Bất kỳ ai</strong>.</li>
                    <li>Sửa mã xong phải <strong>Triển khai → Quản lý các tùy chọn triển khai → Phiên bản mới</strong> (giữ nguyên link).</li>
                  </ul>
                )}
                <button type="button" onClick={handleSaveConfig} className={btnLight}><Check className="w-4 h-4" /> Lưu thiết lập</button>
              </section>
              <section className={cardCls} style={embedded ? { display: 'none' } : undefined}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className={titleCls}><Code2 className="w-4 h-4 text-amber-700" /> Mã Apps Script ({versionLabel(conn?.latest || appsScriptSetupService.getBundledVersion()).toLowerCase()})</h3>
                  <div className="flex items-center gap-2">
                    <a href="https://script.google.com/" target="_blank" rel="noreferrer" className={btnLight}>Mở script.google.com <ExternalLink className="w-3.5 h-3.5" /></a>
                    <button type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(googleDriveService.generateAppsScriptCode(config.folderId)).then(() => {
                          setIsCopiedCode(true);
                          setTimeout(() => setIsCopiedCode(false), 2500);
                          setActionMessage({ type: 'success', text: 'Đã sao chép toàn bộ mã Apps Script (đã điền sẵn mã thư mục).' });
                        }).catch(() => setActionMessage({ type: 'error', text: 'Trình duyệt không cho sao chép tự động. Bấm "Xem mã" rồi bôi đen để sao chép.' }));
                      }}
                      className={btnIndigo}>
                      {isCopiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {isCopiedCode ? 'Đã sao chép' : 'Sao chép mã'}
                    </button>
                  </div>
                </div>
                <button type="button" onClick={() => setShowScriptCode(!showScriptCode)} className="no-hover-fx text-xs font-bold text-indigo-700 hover:underline inline-flex items-center gap-1 cursor-pointer">
                  {showScriptCode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {showScriptCode ? 'Ẩn mã' : 'Xem mã'}
                </button>
                {showScriptCode && (
                  <pre className="p-2.5 bg-slate-50 text-slate-800 font-mono text-xs leading-relaxed max-h-44 overflow-auto whitespace-pre select-all rounded-xl border border-slate-200">
                    {googleDriveService.generateAppsScriptCode(config.folderId)}
                  </pre>
                )}
              </section>
            </div>
          )}

          {/* ───────────────── THẺ: TỔNG HỢP TOÀN TRƯỜNG (Quản trị / BGH) ───────────────── */}
          {show('report') && isExecutive && (
            <section className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={titleCls}><School className="w-4 h-4 text-amber-700" /> Số liệu các lớp trong thư mục dùng chung</h3>
                <button type="button" onClick={loadBghSummary} disabled={isAggregating} className={btnLight}>
                  <RefreshCw className={`w-4 h-4 ${isAggregating ? 'animate-spin' : ''}`} /> {isAggregating ? 'Đang quét…' : 'Cập nhật số liệu'}
                </button>
              </div>
              {bghReport ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    {([
                      ['Tổng số lớp', bghReport.summary.totalClasses, 'text-indigo-950'],
                      ['Tổng học sinh', bghReport.summary.totalStudents, 'text-indigo-950'],
                      ['Tỉ lệ chuyên cần', bghReport.summary.attendanceRate, 'text-emerald-800'],
                      ['Tỉ lệ bán trú', bghReport.summary.boardingRate, 'text-orange-800'],
                    ] as const).map(([label, value, cls]) => (
                      <div key={label} className="px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="text-xs text-slate-600 font-bold">{label}</div>
                        <div className={`text-base font-black ${cls}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {Array.isArray(bghReport.classesDetail) && bghReport.classesDetail.length > 0 && (
                    <div className="overflow-auto max-h-52 border border-slate-200 rounded-xl">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-700 font-black uppercase sticky top-0">
                          <tr>
                            <th className="px-2 py-1.5 whitespace-nowrap">Lớp</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Tệp lưu</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Sĩ số</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Có mặt</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Bán trú</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Trạng thái</th>
                            <th className="px-2 py-1.5 whitespace-nowrap text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {bghReport.classesDetail.map((c, i) => (
                            <tr key={i}>
                              <td className="px-2 py-1.5 font-bold text-slate-900 whitespace-nowrap">{c.className}</td>
                              <td className="px-2 py-1.5 font-mono text-slate-600 whitespace-nowrap">{c.fileName}</td>
                              <td className="px-2 py-1.5">{c.total}</td>
                              <td className="px-2 py-1.5 font-medium text-emerald-700 whitespace-nowrap">{c.present} ({c.attendanceRate})</td>
                              <td className="px-2 py-1.5 font-medium text-orange-700 whitespace-nowrap">{c.boardingActual}/{c.boardingRegistered}</td>
                              <td className="px-2 py-1.5">
                                <span className={`px-1.5 py-0.5 rounded font-bold whitespace-nowrap ${c.status === 'reported' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                                  {c.status === 'reported' ? 'Đã báo cáo' : 'Chưa điểm danh'}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button type="button" onClick={() => handleManualPull(c.fileName)} className="no-hover-fx px-2 py-0.5 rounded bg-white hover:bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 whitespace-nowrap cursor-pointer" title={`Tải dữ liệu của ${c.className}`}>Nạp dữ liệu</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-600">
                  Bấm "Cập nhật số liệu" để quét các tệp <code className="font-mono font-bold text-amber-900">gvcn_*.json</code> giáo viên chủ nhiệm đã lưu trong thư mục dùng chung.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
