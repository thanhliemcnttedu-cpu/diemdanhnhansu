/**
 * First-run setup of the desktop build: (1) school database connection, (2) the offline data folder, (3) summary.
 *
 * Renders nothing on the web build and on an installed shell without the offline-folder bridge
 * (see services/offlineStoreService.ts). Opens by itself while no usable offline folder is set — the folder is
 * mandatory, so in that case the dialog cannot be dismissed. It can be reopened later to change the folder by
 * dispatching OPEN_OFFLINE_SETUP_EVENT.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Cloud, FileUp, FolderOpen, HardDrive, Loader2,
  ShieldCheck, WifiOff, X,
} from 'lucide-react';
import { googleDriveService } from '../../services/googleDriveService';
import { schoolDriveDbService } from '../../services/schoolDriveDbService';
import { offlineStoreService, OfflineFolderInfo } from '../../services/offlineStoreService';

export const OPEN_OFFLINE_SETUP_EVENT = 'lhhp:open-offline-setup';
/** Marker written into the folder when setup finishes (also proves the folder really accepts our files) */
const SETUP_MARKER_FILE = 'thiet_lap.json';

const STEPS = [
  { title: 'Kết nối trường', hint: 'Cơ sở dữ liệu của nhà trường', icon: Cloud },
  { title: 'Thư mục ngoại tuyến', hint: 'Nơi lưu dữ liệu trên máy này', icon: HardDrive },
  { title: 'Hoàn tất', hint: 'Kiểm tra lại và bắt đầu', icon: ShieldCheck },
] as const;

const btnPrimary = 'no-hover-fx h-11 px-5 rounded-xl bg-sky-700 hover:bg-sky-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-black inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700';
const btnLight = 'no-hover-fx h-11 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed text-slate-800 text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700';
const inputCls = 'w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-sky-600';

const folderReady = (info: OfflineFolderInfo | null) => !!info && !!info.dir && info.exists && info.writable;

const folderErrorText = (code?: string): string => {
  switch (code) {
    case 'CANCELED': return '';
    case 'NOT_WRITABLE': return 'Phần mềm không ghi được vào thư mục này. Hãy chọn thư mục khác (ví dụ trong Tài liệu hoặc ổ D).';
    case 'UNAVAILABLE': return 'Bản cài đặt này chưa hỗ trợ thư mục ngoại tuyến. Hãy cài bộ cài đặt mới nhất.';
    default: return 'Chưa chọn được thư mục. Hãy thử lại hoặc chọn thư mục khác.';
  }
};

export const OfflineSetupWizard: React.FC = () => {
  const [open, setOpen] = useState(false);
  /** true = reopened by the user to change the folder (dismissible); false = mandatory first-run setup */
  const [manageMode, setManageMode] = useState(false);
  const [step, setStep] = useState(0);
  const [folder, setFolder] = useState<OfflineFolderInfo | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState('');

  const [connected, setConnected] = useState<boolean>(() => schoolDriveDbService.isConfigured());
  const [connectionChanged, setConnectionChanged] = useState(false);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [folderLink, setFolderLink] = useState('');
  const [scriptLink, setScriptLink] = useState('');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [connectNote, setConnectNote] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const refreshFolder = useCallback(async () => {
    const info = await offlineStoreService.getFolder();
    setFolder(info);
    return info;
  }, []);

  // First run: open when the desktop shell has the bridge but no usable folder yet
  useEffect(() => {
    if (!offlineStoreService.isAvailable()) return;
    let cancelled = false;
    refreshFolder().then(info => {
      if (cancelled || folderReady(info)) return;
      setManageMode(false);
      // A folder was chosen before but is gone now (USB removed, folder deleted) → go straight to the folder step
      setStep(info.dir && schoolDriveDbService.isConfigured() ? 1 : 0);
      setOpen(true);
    });
    return () => { cancelled = true; };
  }, [refreshFolder]);

  // Reopened from the settings screen
  useEffect(() => {
    const onOpen = () => {
      if (!offlineStoreService.isAvailable()) return;
      refreshFolder().then(info => {
        const isConnected = schoolDriveDbService.isConfigured();
        setConnected(isConnected);
        setManageMode(folderReady(info));
        setStep(isConnected ? 1 : 0);
        setFolderError('');
        setFinishError('');
        setOpen(true);
      });
    };
    window.addEventListener(OPEN_OFFLINE_SETUP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_OFFLINE_SETUP_EVENT, onOpen);
  }, [refreshFolder]);

  // Move keyboard / screen-reader focus to the new step's heading
  useEffect(() => { if (open) headingRef.current?.focus(); }, [open, step]);

  if (!open) return null;

  const cfg = googleDriveService.getConfig();
  const ready = folderReady(folder);
  const folderMissing = !!folder?.dir && !ready;

  const handleConnectionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setConnectError('');
    setConnectNote('');
    let parsed: ReturnType<typeof googleDriveService.parseConnectionFile> = null;
    try { parsed = googleDriveService.parseConnectionFile(await file.text()); } catch (_) { parsed = null; }
    if (!parsed || !parsed.folderUrl || !parsed.scriptUrl) {
      setConnectError(`Tệp "${file.name}" không phải tệp kết nối đầy đủ (cần có link thư mục Google Drive và link Apps Script).`);
      return;
    }
    setFolderLink(parsed.folderUrl);
    setScriptLink(parsed.scriptUrl);
    setConnectNote(`Đã điền 2 link từ tệp kết nối${parsed.schoolName ? ` của ${parsed.schoolName}` : ''}. Bấm "Xác thực và kết nối".`);
  };

  // Same checks as the login screen: verify against the real Apps Script before keeping the links
  const handleConnect = async () => {
    setConnectError('');
    setConnectNote('');
    const parsed = googleDriveService.parseConnectionText(`${folderLink}\n${scriptLink}`);
    const folderId = parsed.folderId || googleDriveService.extractFolderIdFromUrl(folderLink.trim());
    const scriptUrl = parsed.scriptUrl || googleDriveService.normalizeScriptUrl(scriptLink.trim());
    if (!folderId) {
      setConnectError('Ô 1 chưa đúng: hãy dán link thư mục Google Drive dùng chung của trường (https://drive.google.com/drive/folders/...).');
      return;
    }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(scriptUrl || '')) {
      setConnectError('Ô 2 chưa đúng: hãy dán link mã script (https://script.google.com/macros/s/.../exec).');
      return;
    }
    const previous = googleDriveService.getConfig();
    googleDriveService.saveConfig({
      folderId,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
      scriptUrl,
      syncMethod: 'appscript',
      autoSyncEnabled: true,
    });
    setConnectBusy(true);
    const res = await schoolDriveDbService.listSchools();
    setConnectBusy(false);
    if (!res.success || res.message === 'offline-cache') {
      googleDriveService.saveConfig({
        folderId: previous.folderId || '',
        folderUrl: previous.folderUrl || '',
        scriptUrl: previous.scriptUrl || '',
      });
      const raw = String(res.message || '');
      const reason = /failed to fetch|networkerror|load failed|abort|offline-cache/i.test(raw)
        ? 'không truy cập được link mã script (kiểm tra lại Ô 2 hoặc kết nối mạng)'
        : /thư mục/i.test(raw)
          ? 'không mở được thư mục (kiểm tra lại Ô 1 và quyền chia sẻ thư mục)'
          : (raw || 'kiểm tra lại 2 đường link');
      setConnectError(`Chưa kết nối được: ${reason}.`);
      return;
    }
    schoolDriveDbService.ensureCacheOwnership();
    setConnected(true);
    setConnectionChanged(true);
    setShowConnectForm(false);
    setFolderLink('');
    setScriptLink('');
    setConnectNote(res.initialized
      ? `Đã kết nối cơ sở dữ liệu nhà trường (${res.schools.length} trường).`
      : 'Đã kết nối thư mục dùng chung. Nhà trường chưa khởi tạo cơ sở dữ liệu — Quản trị đăng nhập để khởi tạo.');
  };

  const pickFolder = async (mode: 'suggested' | 'choose') => {
    setFolderError('');
    setFolderBusy(true);
    const res = mode === 'suggested' ? await offlineStoreService.useSuggestedFolder() : await offlineStoreService.chooseFolder();
    setFolderBusy(false);
    if (res.ok && res.info) setFolder(res.info);
    else setFolderError(folderErrorText(res.error));
  };

  const finish = async () => {
    setFinishError('');
    setFinishing(true);
    const latest = googleDriveService.getConfig();
    const res = await offlineStoreService.writeJson(SETUP_MARKER_FILE, {
      app: 'lhhp',
      version: 1,
      schoolFolderId: latest.folderId || '',
      setupAt: new Date().toISOString(),
    });
    setFinishing(false);
    if (!res.ok) {
      setFinishError('Không ghi được vào thư mục ngoại tuyến. Hãy quay lại bước 2 và chọn thư mục khác.');
      return;
    }
    setOpen(false);
    // The login screen read the connection when it was mounted → reload so it sees the new one
    if (connectionChanged) window.location.reload();
  };

  const showForm = !connected || showConnectForm;
  const canNext = step === 0 ? connected : step === 1 ? ready : true;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="offline-setup-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-sky-900/20 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl max-h-[96vh] bg-white rounded-3xl shadow-2xl border border-sky-100 overflow-hidden flex flex-col md:flex-row">

        {/* Step rail */}
        <aside className="md:w-72 shrink-0 bg-gradient-to-b from-sky-50 via-white to-indigo-50 border-b md:border-b-0 md:border-r border-sky-100 p-4 md:p-6">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-sky-700 text-white flex items-center justify-center shadow-lg shadow-sky-700/20 shrink-0">
              <HardDrive className="w-5 h-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-800">Lớp Học Hạnh Phúc</p>
              <p className="text-sm font-black text-slate-900">Thiết lập bản cài đặt</p>
            </div>
          </div>
          <ol className="mt-4 md:mt-8 flex md:flex-col gap-2 md:gap-1" aria-label="Các bước thiết lập">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={s.title} aria-current={active ? 'step' : undefined}
                  className={`flex-1 md:flex-none flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors ${active ? 'bg-white shadow-sm border border-sky-200' : 'border border-transparent'}`}>
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black tabular-nums shrink-0 ${
                    done ? 'bg-emerald-600 text-white' : active ? 'bg-sky-700 text-white' : 'bg-white text-slate-600 border border-slate-300'}`}>
                    {done ? <Check className="w-4 h-4" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className="min-w-0 hidden sm:block">
                    <span className={`block text-sm font-black leading-tight ${active ? 'text-slate-900' : 'text-slate-700'}`}>{s.title}</span>
                    <span className="hidden md:block text-xs text-slate-600 truncate">{s.hint}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="hidden md:flex mt-8 items-start gap-2 text-xs text-slate-600 leading-relaxed">
            <WifiOff className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" aria-hidden="true" />
            <span>Thiết lập một lần. Sau đó phần mềm làm việc được cả khi mất mạng và tự đẩy dữ liệu lên khi có mạng trở lại.</span>
          </p>
        </aside>

        {/* Step content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3 px-5 sm:px-7 pt-5 sm:pt-6">
            <div className="min-w-0">
              <p className="text-xs font-bold text-sky-800 tabular-nums">Bước {step + 1} / {STEPS.length}</p>
              <h2 id="offline-setup-title" ref={headingRef} tabIndex={-1} className="text-xl sm:text-2xl font-black text-slate-900 outline-none">
                {step === 0 ? 'Kết nối cơ sở dữ liệu của trường' : step === 1 ? 'Chọn thư mục lưu dữ liệu ngoại tuyến' : 'Sẵn sàng sử dụng'}
              </h2>
            </div>
            {manageMode && (
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng" title="Đóng"
                className="no-hover-fx w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer">
                <X className="w-5 h-5 text-slate-700" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-4 space-y-4 text-sm text-slate-700">
            {step === 0 && (
              <>
                <p>Phần mềm lấy dữ liệu từ thư mục Google Drive dùng chung của nhà trường. Hai đường link này do Quản trị nhà trường cung cấp.</p>
                {connected && (
                  <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-emerald-950">Máy này đã kết nối với cơ sở dữ liệu của trường</p>
                      <p className="text-xs text-emerald-900 truncate" title={cfg.folderUrl}>Thư mục: {cfg.folderId}</p>
                    </div>
                    {!showConnectForm && (
                      <button type="button" className={`${btnLight} h-9 px-3`} onClick={() => setShowConnectForm(true)}>Đổi kết nối</button>
                    )}
                  </div>
                )}
                {showForm && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <div>
                      <label htmlFor="offline-setup-folder" className="block text-sm font-bold text-slate-900 mb-1">1. Link thư mục Google Drive dùng chung</label>
                      <input id="offline-setup-folder" className={inputCls} value={folderLink} onChange={e => setFolderLink(e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/..." autoComplete="off" spellCheck={false} />
                    </div>
                    <div>
                      <label htmlFor="offline-setup-script" className="block text-sm font-bold text-slate-900 mb-1">2. Link mã script (Apps Script)</label>
                      <input id="offline-setup-script" className={inputCls} value={scriptLink} onChange={e => setScriptLink(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec" autoComplete="off" spellCheck={false} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={btnPrimary} onClick={handleConnect} disabled={connectBusy || !folderLink.trim()}>
                        {connectBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Cloud className="w-4 h-4" aria-hidden="true" />}
                        {connectBusy ? 'Đang xác thực...' : 'Xác thực và kết nối'}
                      </button>
                      <label className={btnLight}>
                        <FileUp className="w-4 h-4" aria-hidden="true" /> Nạp tệp kết nối
                        <input type="file" accept=".json,.txt" onChange={handleConnectionFile} className="hidden" />
                      </label>
                      {connected && showConnectForm && (
                        <button type="button" className={btnLight} onClick={() => { setShowConnectForm(false); setConnectError(''); }}>Giữ kết nối cũ</button>
                      )}
                    </div>
                  </div>
                )}
                {connectError && (
                  <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-rose-900 font-bold flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" /><span>{connectError}</span>
                  </p>
                )}
                {connectNote && (
                  <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950 font-bold">{connectNote}</p>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <p>
                  Đây là nơi phần mềm giữ một bản dữ liệu ngay trên máy tính này để làm việc khi <strong>không có mạng</strong>.
                  Bước này là bắt buộc.
                </p>
                <div className={`rounded-2xl border px-4 py-3 ${ready ? 'border-emerald-300 bg-emerald-50' : folderMissing ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                  {ready ? (
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-black text-emerald-950">Đã chọn thư mục</p>
                        <p className="text-sm text-emerald-950 break-all">{folder!.dir}</p>
                      </div>
                    </div>
                  ) : folderMissing ? (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-black text-amber-950">Không mở được thư mục đã chọn trước đây</p>
                        <p className="text-sm text-amber-950 break-all">{folder!.dir}</p>
                        <p className="text-xs text-amber-900 mt-1">Nếu thư mục nằm trên USB hoặc ổ rời, hãy cắm lại rồi bấm "Kiểm tra lại"; hoặc chọn thư mục khác.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-800">Chưa chọn thư mục. Thư mục đề xuất: <strong className="break-all">{folder?.suggested || 'Tài liệu\\LopHocHanhPhuc_DuLieu'}</strong></p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!ready && (
                    <button type="button" className={btnPrimary} onClick={() => pickFolder('suggested')} disabled={folderBusy}>
                      {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                      Dùng thư mục đề xuất
                    </button>
                  )}
                  <button type="button" className={btnLight} onClick={() => pickFolder('choose')} disabled={folderBusy}>
                    <FolderOpen className="w-4 h-4" aria-hidden="true" /> {ready ? 'Đổi thư mục...' : 'Chọn thư mục khác...'}
                  </button>
                  {folderMissing && (
                    <button type="button" className={btnLight} onClick={() => { setFolderError(''); refreshFolder(); }} disabled={folderBusy}>Kiểm tra lại</button>
                  )}
                  {ready && (
                    <button type="button" className={btnLight} onClick={() => offlineStoreService.openFolder()}>Mở thư mục</button>
                  )}
                </div>
                {folderError && (
                  <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-rose-900 font-bold flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" /><span>{folderError}</span>
                  </p>
                )}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 p-3.5">
                    <p className="font-black text-slate-900">Tài khoản giáo viên</p>
                    <p className="text-sm text-slate-700 mt-1">Thông tin tài khoản, lớp học, học sinh và kho câu hỏi cá nhân của thầy cô.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3.5">
                    <p className="font-black text-slate-900">Tài khoản quản trị, Ban giám hiệu</p>
                    <p className="text-sm text-slate-700 mt-1">Dữ liệu toàn trường: thông tin nhà trường, giáo viên, tài khoản nhân sự, lớp học, học sinh.</p>
                  </div>
                </div>
                <ul className="text-xs text-slate-600 space-y-1 list-disc pl-5">
                  <li>Nên chọn thư mục trên ổ cứng của máy (Tài liệu hoặc ổ D), không chọn USB.</li>
                  <li>Thư mục chứa dữ liệu của nhà trường — không chia sẻ thư mục này cho người khác.</li>
                  {manageMode && <li>Khi đổi thư mục, dữ liệu ở thư mục cũ không tự chuyển sang; phần mềm sẽ lưu lại vào thư mục mới ở lần đồng bộ kế tiếp.</li>}
                </ul>
              </>
            )}

            {step === 2 && (
              <>
                <p>Kiểm tra lại hai thông tin dưới đây rồi bấm <strong>Hoàn tất</strong>.</p>
                <dl className="rounded-2xl border border-slate-200 divide-y divide-slate-200">
                  <div className="px-4 py-3 flex items-start gap-3">
                    <Cloud className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="font-black text-slate-900">Cơ sở dữ liệu của trường</dt>
                      <dd className="text-sm text-slate-700 break-all">{connected ? `Đã kết nối • thư mục ${cfg.folderId}` : 'Chưa kết nối'}</dd>
                    </div>
                  </div>
                  <div className="px-4 py-3 flex items-start gap-3">
                    <HardDrive className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="font-black text-slate-900">Thư mục ngoại tuyến trên máy này</dt>
                      <dd className="text-sm text-slate-700 break-all">{folder?.dir}</dd>
                    </div>
                  </div>
                </dl>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950">
                  <p className="font-black">Bước tiếp theo</p>
                  <p className="text-sm mt-1">Đăng nhập một lần khi máy đang có mạng để phần mềm ghi nhớ tài khoản và tải dữ liệu về thư mục này.</p>
                </div>
                {finishError && (
                  <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-rose-900 font-bold flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" /><span>{finishError}</span>
                  </p>
                )}
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-5 sm:px-7 py-3.5 flex items-center justify-between gap-3">
            <button type="button" className={btnLight} onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0 || finishing}
              style={step === 0 ? { visibility: 'hidden' } : undefined}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Quay lại
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" className={btnPrimary} onClick={() => setStep(s => s + 1)} disabled={!canNext}
                title={canNext ? undefined : step === 0 ? 'Cần kết nối cơ sở dữ liệu của trường trước' : 'Cần chọn thư mục ngoại tuyến trước'}>
                Tiếp tục <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className={btnPrimary} onClick={finish} disabled={finishing || !ready}>
                {finishing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                Hoàn tất
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Compact card for the settings screen: shows the offline folder and lets the user change it. Nothing on the web build. */
export const OfflineFolderCard: React.FC = () => {
  const [info, setInfo] = useState<OfflineFolderInfo | null>(null);
  const available = offlineStoreService.isAvailable();

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    const load = () => offlineStoreService.getFolder().then(i => { if (!cancelled) setInfo(i); });
    load();
    window.addEventListener('focus', load);
    return () => { cancelled = true; window.removeEventListener('focus', load); };
  }, [available]);

  if (!available) return null;
  const ready = folderReady(info);

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-3.5 flex flex-wrap items-center gap-3">
      <span className="w-10 h-10 rounded-xl bg-sky-700 text-white flex items-center justify-center shrink-0">
        <WifiOff className="w-5 h-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <h3 className="text-sm font-black text-slate-900">Thư mục dữ liệu ngoại tuyến</h3>
        <p className={`text-sm break-all ${ready ? 'text-slate-700' : 'text-amber-900 font-bold'}`}>
          {ready ? info!.dir : info?.dir ? `Không mở được: ${info.dir}` : 'Chưa chọn thư mục'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ready && <button type="button" className={`${btnLight} h-10`} onClick={() => offlineStoreService.openFolder()}>Mở thư mục</button>}
        <button type="button" className={`${btnPrimary} h-10`} onClick={() => window.dispatchEvent(new Event(OPEN_OFFLINE_SETUP_EVENT))}>
          <FolderOpen className="w-4 h-4" aria-hidden="true" /> {ready ? 'Đổi thư mục' : 'Chọn thư mục'}
        </button>
      </div>
    </section>
  );
};
