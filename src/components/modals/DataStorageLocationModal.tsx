import React, { useState, useEffect, useRef } from 'react';
import {
  X, HardDrive, CheckCircle2, AlertTriangle, FolderOpen, Download, RefreshCw, Usb, Upload,
  ShieldCheck, FileJson, Save, Trash2, Database, Loader2
} from 'lucide-react';
import {
  dataStorageService, StorageConfig, getRoleScopedDataFileName, LOCAL_FOLDER_EVENT, LocalFolderStatus
} from '../../services/dataStorageService';
import { useClassroom } from '../../context/ClassroomContext';
import { localSystemMirrorService, SYSTEM_ONE_FILE_DIR, SYSTEM_ONE_FILE_NAME, SYSTEM_MIRROR_DIR, type LocalMirrorSummary } from '../../services/localSystemMirrorService';
import { driveBackupService } from '../../services/driveBackupService';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';
import { FolderPathNote } from '../common/FolderPathNote';

interface DataStorageLocationModalProps {
  isOpen: boolean;
  /** Render inside a page (no overlay, no header) */
  embedded?: boolean;
  /** Which half to show: 'folder' = autosave folder, 'file' = download / load this account's file, 'all' = both */
  parts?: 'all' | 'folder' | 'file';
  onClose: () => void;
}

/**
 * 💾 NƠI LƯU DỮ LIỆU TRÊN MÁY TÍNH — bố trí 2 cột, vừa một màn hình (không phải cuộn).
 * - Bản web (Vercel): trình duyệt chỉ ghi được vào thư mục người dùng TỰ CHỌN (hộp chọn thư mục) → ghi tệp thật.
 * - Bản có máy chủ / Desktop: ghi theo đường dẫn ổ đĩa (D:\…) qua máy chủ / Electron.
 */
export const DataStorageLocationModal: React.FC<DataStorageLocationModalProps> = ({ isOpen: isOpenProp, onClose, embedded = false, parts = 'all' }) => {
  // Whole-system snapshot into the chosen folder (admins on the web build with the shared Drive connected)
  const [mirrorBusy, setMirrorBusy] = useState('');
  const [mirrorLast, setMirrorLast] = useState<LocalMirrorSummary | null>(() => localSystemMirrorService.getLast());
  const [mirrorError, setMirrorError] = useState('');
  const isOpen = isOpenProp || embedded;
  const handleSaveWholeSystem = async () => {
    if (mirrorBusy) return;
    setMirrorError('');
    setMirrorBusy('Đang chuẩn bị…');
    try {
      const r = await localSystemMirrorService.run(setMirrorBusy);
      if (r.success && r.summary) setMirrorLast(r.summary);
      else setMirrorError(r.message);
    } catch (err: any) {
      setMirrorError(err?.message || 'Không lưu được toàn bộ hệ thống vào thư mục.');
    } finally {
      setMirrorBusy('');
    }
  };
  const {
    exportBackupJson, importBackupJson, currentUser, teacherRole, classes, activeClassId,
    isBgh, isSchoolAdmin, isAdmin, getCurrentUserData, canManageAccounts
  } = useClassroom();
  const [config, setConfig] = useState<StorageConfig>(dataStorageService.getConfig());
  const [selectedDrive, setSelectedDrive] = useState(config.selectedDrive);
  const [customPath, setCustomPath] = useState(config.customPath);
  const [autoCopy, setAutoCopy] = useState(config.autoCopyExisting);
  const [isScanning, setIsScanning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSavingDisk, setIsSavingDisk] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [local, setLocal] = useState<LocalFolderStatus>(dataStorageService.getLocalFolderStatus());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const browserMode = dataStorageService.isBrowserFolderMode();
  // Whole-system snapshot: admin session + shared Drive connected (the data is read from Drive)
  const canMirrorSystem = Boolean(canManageAccounts) && driveBackupService.isDriveMode() && schoolDriveDbService.hasAdminSession();
  const pickerSupported = dataStorageService.isFolderPickerSupported();

  const isSuperAdmin = currentUser?.username?.toLowerCase() === 'adminquantri' || (isAdmin && !currentUser?.schoolId && !isSchoolAdmin);
  const activeClass = classes.find(c => c.id === activeClassId) || classes[0];
  const roleFileName = getRoleScopedDataFileName(currentUser, teacherRole, activeClass?.name);
  const roleTitleDisplay = isSuperAdmin ? 'Quản trị cao nhất'
    : isBgh ? 'Ban giám hiệu'
      : isSchoolAdmin ? 'Quản trị nhà trường'
        : teacherRole === 'subject' ? 'Giáo viên bộ môn' : 'Giáo viên chủ nhiệm';

  useEffect(() => {
    const h = (e: Event) => setLocal((e as CustomEvent).detail as LocalFolderStatus);
    window.addEventListener(LOCAL_FOLDER_EVENT, h);
    return () => window.removeEventListener(LOCAL_FOLDER_EVENT, h);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const cfg = dataStorageService.getConfig();
    setConfig(cfg);
    setSelectedDrive(cfg.selectedDrive);
    setCustomPath(cfg.customPath);
    setAutoCopy(cfg.autoCopyExisting);
    setToastMessage(null);
    if (browserMode) dataStorageService.refreshLocalFolderStatus(roleFileName).then(setLocal);
    else checkCurrentStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const notify = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(t => (t && t.text === text ? null : t)), 6000);
  };

  async function checkCurrentStorage() {
    setIsChecking(true);
    if (browserMode) {
      setLocal(await dataStorageService.refreshLocalFolderStatus(roleFileName));
    } else {
      const info = await dataStorageService.checkStorageInfo();
      setConfig(prev => ({ ...prev, customPath: info.currentPath, currentFileSizeKb: info.fileSizeKb, isSafeDrive: info.isSafe }));
    }
    setIsChecking(false);
  }

  /** Ghi tệp dữ liệu của tài khoản vào nơi đã chọn (dùng chung cho cả 2 chế độ) */
  const writeNow = async (pathOverride?: string) => {
    if (!currentUser) { notify('error', 'Hãy đăng nhập trước để phần mềm biết lưu dữ liệu của tài khoản nào.'); return false; }
    setIsSavingDisk(true);
    try {
      const res = await dataStorageService.writeRoleDataToFile(getCurrentUserData(), currentUser, teacherRole, activeClass?.name, pathOverride);
      if (res.success) {
        notify('success', browserMode
          ? `Đã ghi tệp ${res.fileName}${res.sizeKb ? ` (${res.sizeKb} KB)` : ''} vào thư mục đã chọn. Từ giờ phần mềm tự ghi đè tệp này mỗi khi dữ liệu thay đổi.`
          : `Đã lưu nơi lưu trữ và ghi tệp ${res.fileName} tại: ${pathOverride || customPath}`);
        await checkCurrentStorage();
        return true;
      }
      notify('error', res.message || 'Chưa ghi được tệp dữ liệu.');
      return false;
    } finally {
      setIsSavingDisk(false);
    }
  };

  // ── Bản web: chọn thư mục thật bằng hộp chọn của trình duyệt rồi ghi ngay
  const handlePickFolder = async () => {
    const r = await dataStorageService.pickLocalFolder();
    if (!r.ok) { if (r.message) notify('error', r.message); return; }
    setLocal(dataStorageService.getLocalFolderStatus());
    await writeNow();
  };
  const handleGrantPermission = async () => {
    if (await dataStorageService.requestLocalPermission()) await writeNow();
    else notify('error', 'Chưa được phép ghi vào thư mục. Hãy bấm "Cho phép" khi trình duyệt hỏi, hoặc chọn lại thư mục.');
  };
  const handleForgetFolder = async () => {
    await dataStorageService.forgetLocalFolder();
    setLocal(dataStorageService.getLocalFolderStatus());
    notify('success', 'Đã bỏ thư mục lưu trên máy này. Tệp đã ghi trong thư mục vẫn còn nguyên.');
  };

  // ── Bản có máy chủ / Desktop: lưu theo đường dẫn ổ đĩa
  const handleSelectDrive = (drive: string) => {
    setSelectedDrive(drive);
    setCustomPath(`${drive}\\DuLieu_LopHocHanhPhuc`);
  };
  const handleSaveLocation = async () => {
    const trimmedPath = customPath.trim();
    if (!trimmedPath) { notify('error', 'Vui lòng nhập thư mục lưu trữ.'); return; }
    setConfig(dataStorageService.saveConfig({ selectedDrive, customPath: trimmedPath, autoCopyExisting: autoCopy }));
    await writeNow(trimmedPath);
  };
  const handleScanUsb = async () => {
    setIsScanning(true);
    const result = await dataStorageService.scanUsbAndDrives();
    setIsScanning(false);
    if (result.success && result.foundLocations.length > 0) {
      const first = result.foundLocations[0];
      notify('success', `Tìm thấy ${result.foundLocations.length} tệp dữ liệu: ${first.path}\\${first.fileName}. Bấm "Chọn tệp .json" và mở tệp này để nạp.`);
    } else {
      notify('error', result.message || 'Chưa phát hiện USB hoặc tệp dữ liệu cũ. Hãy bấm "Chọn tệp .json".');
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      // Only a single-account data file belongs here. System-wide backups carry accounts / other people's
      // files and would be written into this account's own data.
      if (file.name.toLowerCase().endsWith('.json')) {
        let parsed: any = null;
        try { parsed = JSON.parse(await file.text()); } catch (_) { parsed = null; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { notify('error', 'Tệp JSON không đúng định dạng hoặc bị lỗi.'); return; }
        if (parsed.format === 'lhhp_drive_backup' || parsed.format === 'lop_hoc_hanh_phuc_backup') {
          notify('error', 'Đây là tệp sao lưu hệ thống, không phải tệp dữ liệu của một tài khoản. Hãy dùng nút khôi phục ở thẻ Sao lưu & khôi phục (phần Khôi phục cơ sở dữ liệu).');
          return;
        }
        if (!Array.isArray(parsed.classes) && !Array.isArray(parsed.students)) {
          notify('error', 'Tệp này không chứa dữ liệu lớp học (không có danh sách lớp, học sinh).');
          return;
        }
      }
      if (!window.confirm(`Nạp tệp "${file.name}" sẽ THAY dữ liệu lớp học hiện tại của tài khoản này bằng dữ liệu trong tệp.\n\nNên bấm "Tải tệp về máy" để giữ một bản trước khi nạp. Tiếp tục?`)) return;
      const ok = await importBackupJson(file);
      notify(ok ? 'success' : 'error', ok ? `Đã nạp dữ liệu từ ${file.name}.` : 'Tệp JSON không đúng định dạng hoặc bị lỗi.');
    } catch (_) {
      notify('error', 'Không thể xử lý tệp dữ liệu này.');
    }
  };

  const handleExportRoleJson = () => {
    try {
      const blob = new Blob([JSON.stringify(getCurrentUserData(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = roleFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('success', `Đã tải tệp ${roleFileName} về thư mục Tải xuống của máy.`);
    } catch (_) {
      exportBackupJson();
    }
  };

  const isCurrentSafe = !customPath.toUpperCase().startsWith('C:');
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5';
  const titleCls = 'text-sm font-black text-slate-900 flex items-center gap-2';
  const btnPrimary = 'no-hover-fx h-10 px-4 rounded-xl bg-amber-700 hover:bg-amber-800 disabled:opacity-60 text-white text-sm font-black inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer';
  const btnLight = 'no-hover-fx h-10 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer';

  return (
    <div {...(embedded ? {} : { role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'storage-title' })} className={embedded ? '' : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200'}>
      <div className={embedded ? '' : 'relative w-full max-w-5xl bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh]'}>
        {/* Đầu hộp (gọn 1 dòng) — ẩn khi nhúng trong trang Dữ liệu */}
        <div style={embedded ? { display: 'none' } : undefined} className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0"><HardDrive className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 id="storage-title" className="text-base font-black text-slate-900 truncate">Nơi lưu dữ liệu trên máy tính</h2>
              <p className="text-xs text-slate-600 truncate">
                {roleTitleDisplay} • tệp <strong className="font-mono text-indigo-700">{roleFileName}</strong> — 1 tệp JSON duy nhất, dễ chép sang USB và khôi phục
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer" aria-label="Đóng" title="Đóng">
            <X className="w-5 h-5 text-slate-700" />
          </button>
        </div>

        <div className={embedded ? 'space-y-3 text-sm text-slate-700' : 'p-3 sm:p-4 overflow-y-auto space-y-3 text-sm text-slate-700'}>
          {embedded && parts === 'file' && (
            <h3 className="text-sm font-black uppercase text-slate-900">Tệp riêng của tài khoản này</h3>
          )}
          {embedded && parts !== 'folder' && (
            <p className="text-xs text-slate-600">{roleTitleDisplay} • tệp <strong className="font-mono text-indigo-700">{roleFileName}</strong> — 1 tệp JSON của tài khoản này, dễ chép sang USB và nạp lại.</p>
          )}
          {toastMessage && (
            <div role="status" className={`px-3 py-2 rounded-xl text-sm font-bold flex items-start gap-2 border ${
              toastMessage.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}>
              {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />}
              <span>{toastMessage.text}</span>
            </div>
          )}

          <div className={parts === 'all' ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
            {/* ───────── CỘT TRÁI: nơi lưu ───────── */}
            {parts !== 'file' && (browserMode ? (
              <section className={cardCls}>
                <h3 className={titleCls}><FolderOpen className="w-4 h-4 text-amber-700" /> {parts === 'folder' ? 'Tự lưu vào thư mục trên máy tính này' : '1. Thư mục lưu trên máy tính này'}</h3>

                {!pickerSupported ? (
                  <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-950">
                    Trình duyệt này không cho phần mềm tự ghi tệp vào thư mục máy tính. Hãy mở phần mềm bằng <strong>Chrome</strong> hoặc <strong>Edge</strong> trên máy tính,
                    hoặc dùng nút <strong>Tải tệp về máy</strong> ở cột bên.
                  </p>
                ) : (
                  <>
                    <div className={`rounded-xl border px-3 py-2.5 ${local.picked && !local.needsPermission ? 'bg-emerald-50 border-emerald-300' : local.picked ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                      {local.picked ? (
                        <>
                          <p className="font-black text-slate-900 flex items-center gap-1.5 min-w-0">
                            {local.needsPermission ? <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />}
                            <span className="truncate" title={local.folderName}>Thư mục: {local.folderName}</span>
                          </p>
                          <p className="text-xs text-slate-700 mt-0.5">
                            {local.needsPermission
                              ? 'Trình duyệt đã đóng quyền ghi sau khi mở lại — bấm "Cho phép ghi vào thư mục".'
                              : local.sizeKb != null
                                ? <>Tệp <strong className="font-mono">{roleFileName}</strong> • {local.sizeKb} KB • ghi lúc {local.savedAt}</>
                                : <>Chưa có tệp <strong className="font-mono">{roleFileName}</strong> trong thư mục — bấm "Lưu ngay".</>}
                          </p>
                        </>
                      ) : (
                        <p className="font-bold text-slate-800">Chưa chọn thư mục — phần mềm chưa ghi tệp nào ra ổ đĩa của máy.</p>
                      )}
                    </div>

                    {local.picked && local.folderName && (
                      <FolderPathNote storageKey={`data:${currentUser?.username || 'guest'}`} folderName={local.folderName} />
                    )}

                    <div className="flex flex-wrap gap-2">
                      {local.picked && local.needsPermission && (
                        <button type="button" onClick={handleGrantPermission} disabled={isSavingDisk} className={btnPrimary}>
                          <ShieldCheck className="w-4 h-4" /> Cho phép ghi vào thư mục
                        </button>
                      )}
                      {local.picked && !local.needsPermission && (
                        <button type="button" onClick={() => writeNow()} disabled={isSavingDisk} className={btnPrimary}>
                          <Save className={`w-4 h-4 ${isSavingDisk ? 'animate-bounce' : ''}`} /> {isSavingDisk ? 'Đang ghi tệp…' : 'Lưu ngay'}
                        </button>
                      )}
                      <button type="button" onClick={handlePickFolder} disabled={isSavingDisk} className={local.picked ? btnLight : btnPrimary}>
                        <FolderOpen className="w-4 h-4" /> {local.picked ? 'Đổi thư mục' : 'Chọn thư mục trên máy tính'}
                      </button>
                      {local.picked && (
                        <>
                          <button type="button" onClick={checkCurrentStorage} disabled={isChecking} className={btnLight} title="Đọc lại tệp trong thư mục">
                            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} /> Kiểm tra
                          </button>
                          <button type="button" onClick={handleForgetFolder} className="no-hover-fx w-10 h-10 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 inline-flex items-center justify-center cursor-pointer" title="Bỏ thư mục này (không xóa tệp)" aria-label="Bỏ thư mục này">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>

                    <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                      <li>Bấm <strong>Chọn thư mục</strong>, mở đúng thư mục muốn lưu (nên ở <strong>ổ D hoặc E</strong>, không chọn ổ C chứa Windows) rồi bấm <strong>Chọn thư mục</strong> → <strong>Cho phép</strong>.</li>
                      <li>Bản web không ghi được theo đường dẫn gõ tay; trình duyệt chỉ cho ghi vào thư mục thầy/cô tự chọn.</li>
                      <li>Sau khi chọn, tệp được <strong>tự ghi đè</strong> mỗi khi dữ liệu thay đổi (chỉ trên máy và trình duyệt này).</li>
                    </ul>
                  </>
                )}
              </section>
            ) : (
              <section className={cardCls}>
                <h3 className={titleCls}><HardDrive className="w-4 h-4 text-amber-700" /> 1. Ổ đĩa và thư mục lưu</h3>
                <div className="grid grid-cols-4 gap-2">
                  {(['D:', 'E:', 'F:', 'C:'] as const).map(d => {
                    const active = selectedDrive === d;
                    const unsafe = d === 'C:';
                    return (
                      <button key={d} type="button" onClick={() => handleSelectDrive(d)} aria-pressed={active}
                        className={`no-hover-fx px-2 py-1.5 rounded-xl border text-left cursor-pointer ${active
                          ? (unsafe ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-200' : 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200')
                          : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                        <div className={`text-sm font-black ${unsafe ? 'text-amber-800' : 'text-emerald-800'}`}>{d}\</div>
                        <div className="text-xs text-slate-600 whitespace-nowrap">{unsafe ? 'Ổ Windows' : 'An toàn'}</div>
                      </button>
                    );
                  })}
                </div>
                <label className="block text-xs font-bold text-slate-700">Đường dẫn thư mục
                  <input type="text" value={customPath} onChange={(e) => setCustomPath(e.target.value)} placeholder="Ví dụ: D:\DuLieu_LopHocHanhPhuc"
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 font-mono text-sm bg-white text-slate-800 focus:outline-none focus:border-amber-600" />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={autoCopy} onChange={(e) => setAutoCopy(e.target.checked)} className="w-4 h-4 rounded border-slate-300" />
                  Sao chép dữ liệu hiện có sang thư mục mới
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={handleSaveLocation} disabled={isSavingDisk} className={btnPrimary}>
                    <Save className={`w-4 h-4 ${isSavingDisk ? 'animate-bounce' : ''}`} /> {isSavingDisk ? 'Đang ghi tệp…' : 'Lưu nơi lưu trữ'}
                  </button>
                  <button type="button" onClick={checkCurrentStorage} disabled={isChecking} className={btnLight}>
                    <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} /> Kiểm tra
                  </button>
                </div>
                <p className="text-xs text-slate-600">
                  Đang lưu tại <strong className="font-mono text-slate-800">{config.customPath}</strong>
                  {config.currentFileSizeKb ? <> • {config.currentFileSizeKb} KB</> : null}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded font-bold ${isCurrentSafe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{isCurrentSafe ? 'Ổ an toàn' : 'Ổ C — nên đổi'}</span>
                </p>
              </section>
            ))}

            {/* ───────── TOÀN BỘ HỆ THỐNG VÀO THƯ MỤC NÀY (quản trị, bản web đã kết nối Drive) ───────── */}
            {parts !== 'file' && browserMode && canMirrorSystem && (
              <section className={cardCls}>
                <h3 className={titleCls}><Database className="w-4 h-4 text-indigo-700" /> Lưu toàn bộ hệ thống vào thư mục này</h3>
                <p className="text-slate-700">
                  Tệp <strong className="font-mono">{roleFileName}</strong> ở trên chỉ là dữ liệu của riêng tài khoản này. Bấm nút dưới để ghi thêm vào thư mục đã chọn <strong>2 thư mục con</strong>:
                </p>
                <ul className="space-y-1.5">
                  <li className="rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2">
                    <span className="block font-black text-indigo-950 font-mono text-xs break-all">{SYSTEM_ONE_FILE_DIR} / {SYSTEM_ONE_FILE_NAME}</span>
                    <span className="block text-xs text-slate-700"><strong>1 tệp duy nhất</strong> chứa tất cả: CSDL trường, tài khoản giáo viên, lớp học, học sinh, điểm danh học sinh, chấm công giáo viên, kê khai tiết dạy. Dùng được để khôi phục.</span>
                  </li>
                  <li className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                    <span className="block font-black text-emerald-950 font-mono text-xs break-all">{SYSTEM_MIRROR_DIR}</span>
                    <span className="block text-xs text-slate-700"><strong>Từng tệp riêng</strong>, cùng tên như trong thư mục Google Drive của trường (csdl_truong, gvcn_…, gvbm_…, nhansu_truong, chamcong_nhansu_…, kekhai_tietday…).</span>
                  </li>
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={handleSaveWholeSystem} disabled={Boolean(mirrorBusy) || !local.picked} className={btnPrimary}>
                    {mirrorBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    {mirrorBusy ? 'Đang lưu…' : 'Lưu toàn bộ hệ thống vào thư mục này'}
                  </button>
                  {!local.picked && <span className="text-xs font-bold text-amber-800">Hãy chọn thư mục trên máy tính trước.</span>}
                </div>
                {mirrorBusy && <p role="status" className="text-xs font-bold text-indigo-800">{mirrorBusy}</p>}
                {mirrorError && <p role="alert" className="rounded-xl bg-rose-50 border border-rose-300 px-3 py-2 text-sm font-bold text-rose-900">{mirrorError}</p>}
                {mirrorLast && !mirrorBusy && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-300 px-3 py-2 text-xs text-emerald-950 space-y-0.5">
                    <p className="font-black text-sm">Lần lưu gần nhất: {mirrorLast.savedAt} • thư mục {mirrorLast.folderName}</p>
                    <p>Tệp tổng: <strong>{mirrorLast.oneFileKb >= 1024 ? `${(mirrorLast.oneFileKb / 1024).toFixed(2)} MB` : `${mirrorLast.oneFileKb} KB`}</strong> • {mirrorLast.mirrorFiles} tệp riêng</p>
                    <p>{mirrorLast.schools} trường • {mirrorLast.users} tài khoản • {mirrorLast.classFiles} tệp lớp • {mirrorLast.staff} nhân sự • {mirrorLast.attendanceDays} ngày chấm công • {mirrorLast.teachingMonths} tháng kê khai tiết dạy</p>
                    {mirrorLast.notes.length > 0 && <p className="text-amber-900">Ghi chú: {mirrorLast.notes.join(' ')}</p>}
                  </div>
                )}
                <p className="text-xs text-slate-600">
                  Hai thư mục này <strong>không tự cập nhật</strong>: muốn có bản mới thì bấm lại nút. Các tệp có mật khẩu và số CCCD — chỉ lưu trên máy của quản trị.
                </p>
              </section>
            )}

            {/* ───────── CỘT PHẢI: tải về + khôi phục ───────── */}
            {parts !== 'folder' && (
            <div className={parts === 'file' ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3'}>
              <section className={cardCls}>
                <h3 className={titleCls}><FileJson className="w-4 h-4 text-emerald-700" /> {parts === 'file' ? '' : '2. '}Tải tệp dữ liệu về máy</h3>
                <p className="text-xs text-slate-600">Tải ngay 1 bản <strong className="font-mono">{roleFileName}</strong> vào thư mục Tải xuống — dùng để chép sang USB, gửi Zalo hoặc cất dự phòng.</p>
                <button type="button" onClick={handleExportRoleJson} className="no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2 whitespace-nowrap cursor-pointer">
                  <Download className="w-4 h-4" /> Tải tệp về máy
                </button>
              </section>

              <section className={cardCls}>
                <h3 className={titleCls}><Usb className="w-4 h-4 text-indigo-700" /> {parts === 'file' ? 'Nạp lại tệp khi đổi máy tính' : '3. Khôi phục khi đổi máy tính'}</h3>
                <p className="text-xs text-slate-600">Cắm USB hoặc mở thư mục chứa tệp dữ liệu cũ, rồi chọn tệp <strong>.json</strong> để nạp lại.</p>
                <input type="file" ref={fileInputRef} accept=".json,.zip" className="hidden" onChange={handleRestoreFile} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="no-hover-fx h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center gap-2 whitespace-nowrap cursor-pointer">
                    <Upload className="w-4 h-4" /> Chọn tệp .json
                  </button>
                  {!browserMode && (
                    <button type="button" onClick={handleScanUsb} disabled={isScanning} className={btnLight}>
                      <Usb className={`w-4 h-4 ${isScanning ? 'animate-bounce' : ''}`} /> {isScanning ? 'Đang quét…' : 'Quét ổ đĩa & USB'}
                    </button>
                  )}
                </div>
              </section>
            </div>
            )}
          </div>

          <p style={parts === 'file' ? { display: 'none' } : undefined} className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-950">
            <strong>Nên lưu ở ổ D hoặc E:</strong> khi máy phải cài lại Windows, ổ C thường bị xóa sạch còn ổ D / E vẫn giữ nguyên dữ liệu lớp học.
          </p>
        </div>
      </div>
    </div>
  );
};
