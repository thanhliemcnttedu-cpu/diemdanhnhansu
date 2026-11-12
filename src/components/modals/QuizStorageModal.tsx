import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, X, HardDrive, Download, Upload, Cloud, CheckCircle2, AlertTriangle, Loader2, Copy, ExternalLink, RefreshCw, Unplug, FolderOpen, ShieldCheck, ArrowRight, FolderCog, Save, Trash2, XCircle, Circle } from 'lucide-react';
import { useClassroom } from '../../context/ClassroomContext';
import { quizBankStore, countCustom, isPersonalQuizAccount, supportsLocalFolder, type DriveDiagnosis } from '../../services/quizBankStore';
import { googleDriveService } from '../../services/googleDriveService';
import { isViewOnly } from '../../utils/viewOnlyMode';
import type { UserAccount } from '../../types';

/** Mở hộp "Nơi lưu câu hỏi": window.dispatchEvent(new Event(OPEN_QUIZ_STORAGE_EVENT)) */
export const OPEN_QUIZ_STORAGE_EVENT = 'lhhp:open-quiz-storage';
const DRAFT_KEY = 'lhhp_quiz_drive_draft:';

/**
 * Gọi khi giáo viên bấm nút THÊM câu hỏi. Chưa cấu hình nơi lưu (thư mục máy tính / Drive cá nhân) → mở hộp
 * "Nơi lưu câu hỏi" ở chế độ bắt buộc, trả về true khi giáo viên đã cấu hình xong. Đã cấu hình → true ngay
 * (và xin lại quyền ghi thư mục nếu trình duyệt đã quên). Tài khoản quản lý / chế độ chỉ xem: không áp dụng.
 */
export function requireQuizStorage(user: UserAccount | null | undefined): Promise<boolean> {
  if (!user || !isPersonalQuizAccount(user) || isViewOnly()) return Promise.resolve(true);
  if (quizBankStore.isConfigured(user.username)) {
    quizBankStore.ensureLocalPermission(user.username).catch(() => {});
    return Promise.resolve(true);
  }
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent(OPEN_QUIZ_STORAGE_EVENT, { detail: { required: true, resolve } }));
  });
}

/**
 * 📚 NƠI LƯU CÂU HỎI CỦA TÔI — bộ câu hỏi trò chơi là dữ liệu CÁ NHÂN của giáo viên, không nằm trong thư mục trường.
 * Trên máy (IndexedDB, luôn bật) · Xuất / Nhập tệp .json · Google Drive cá nhân (tùy chọn, Apps Script cá nhân).
 */
export const QuizStorageModal: React.FC = () => {
  const { currentUser, quizBank, updateQuizBank, quizVaultStatus, unlockQuizVault, refreshQuizVault, syncPersonalQuiz } = useClassroom();
  const [vaultPw, setVaultPw] = useState('');
  const [vaultMsg, setVaultMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  // Kết quả "Kiểm tra & kết nối": từng bước Đạt / Không đạt + việc cần làm tiếp
  const [driveNote, setDriveNote] = useState('');
  // Phản hồi nút Sao chép mã / Mở script.new (bước 2)
  const [codeNote, setCodeNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [flash, setFlash] = useState<'' | 'copy' | 'open'>('');
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashBtn = (k: 'copy' | 'open') => {
    setFlash(k);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(''), 2500);
  };
  const [check, setCheck] = useState<(DriveDiagnosis & { sync?: { ok: boolean; text: string } }) | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [folderUrl, setFolderUrl] = useState('');
  const [scriptUrl, setScriptUrl] = useState('');
  const [, force] = useState(0);
  const [required, setRequired] = useState(false);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const username = currentUser?.username || '';

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail as { required?: boolean; resolve?: (ok: boolean) => void } | undefined;
      if (resolverRef.current) resolverRef.current(false);
      resolverRef.current = d?.resolve || null;
      setRequired(Boolean(d?.required));
      setOpen(true); setMsg(null); setCheck(null); setDriveNote(''); setCodeNote(null); setFlash('');
    };
    window.addEventListener(OPEN_QUIZ_STORAGE_EVENT, onOpen);
    const unsub = quizBankStore.subscribe(() => force(n => n + 1));
    return () => { window.removeEventListener(OPEN_QUIZ_STORAGE_EVENT, onOpen); unsub(); };
  }, []);

  const cfg = username ? quizBankStore.getDriveConfig(username) : null;
  useEffect(() => {
    if (!open) return;
    // Link đã kết nối, nếu chưa thì link đã bấm Lưu (nháp)
    let draft: { folderUrl?: string; scriptUrl?: string } = {};
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY + username.toLowerCase()) || '{}') || {}; } catch (_) { draft = {}; }
    setFolderUrl(cfg?.folderUrl || draft.folderUrl || '');
    setScriptUrl(cfg?.scriptUrl || draft.scriptUrl || '');
    setVaultPw(''); setVaultMsg(null);
    // Máy này chưa có link → xem tài khoản đã lưu link từ máy khác chưa (tải lại dữ liệu tài khoản trên Drive trường)
    if (!cfg && username) refreshQuizVault().catch(() => {});
    // Đã kết nối Drive cá nhân → đồng bộ GỘP hai chiều mỗi lần mở hộp (máy này có câu mới → đưa lên; Drive có câu từ máy khác → lấy về)
    if (cfg && username) syncPersonalQuiz().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const custom = useMemo(() => countCustom(quizBank), [quizBank]);
  const sizeKB = useMemo(() => Math.round(new Blob([JSON.stringify(quizBank.filter(q => q))]).size / 1024), [quizBank]);

  if (!open || !username) return null;
  const configured = quizBankStore.isConfigured(username);
  const local = quizBankStore.getLocalInfo(username);
  const canFolder = supportsLocalFolder();
  const close = () => {
    setOpen(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(quizBankStore.isConfigured(username));
  };
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setMsg(null); try { await fn(); } finally { setBusy(''); } };

  const onExport = () => run('export', async () => {
    const n = await quizBankStore.exportFile(username, quizBank, currentUser?.fullName);
    setMsg({ type: 'ok', text: `Đã xuất bộ câu hỏi (${n} câu tự soạn / đã sửa; câu mẫu của phần mềm luôn có sẵn). Hãy lưu tệp vào thư mục máy tính hoặc USB.` });
  });
  const onImport = (file: File) => run('import', async () => {
    try {
      const text = await file.text();
      const imported = quizBankStore.parseImport(text);
      quizBankStore.mergeCatalogFromText(username, text);
      if (!imported.length) { setMsg({ type: 'err', text: 'Tệp không có câu hỏi nào.' }); return; }
      const r = quizBankStore.mergeImport(quizBank, imported);
      updateQuizBank(r.questions);
      setMsg({ type: 'ok', text: `Đã nhập: thêm ${r.added} câu mới, cập nhật ${r.replaced} câu cùng mã. Các câu đang có được giữ nguyên.` });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'Không đọc được tệp bộ câu hỏi.' });
    }
  });
  const onCopyCode = async () => {
    const raw = folderUrl.trim();
    const fid = googleDriveService.extractFolderIdFromUrl(raw) || (/^[\w-]{10,}$/.test(raw) ? raw : '');
    if (!fid) { setCodeNote({ type: 'err', text: 'Chưa sao chép: hãy dán link thư mục Google Drive CÁ NHÂN ở bước 1 trước (để mã điền sẵn mã thư mục).' }); return; }
    const code = googleDriveService.generateAppsScriptCode(fid);
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (_) {
      // Dự phòng khi trình duyệt chặn Clipboard API
      try {
        const ta = document.createElement('textarea');
        ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (_) { ok = false; }
    }
    if (ok) {
      flashBtn('copy');
      setCodeNote({ type: 'ok', text: `Đã sao chép mã Apps Script vào bộ nhớ tạm (Clipboard) — ${code.split(String.fromCharCode(10)).length} dòng, đã điền sẵn mã thư mục. Mở script.new, xóa mã mẫu rồi dán (Ctrl+V).` });
    } else {
      setCodeNote({ type: 'err', text: 'Trình duyệt chặn sao chép. Hãy bấm lại nút Sao chép mã.' });
    }
  };
  const onOpenScript = () => {
    flashBtn('open');
    setCodeNote({ type: 'ok', text: 'Đã mở script.new ở thẻ mới. Đăng nhập đúng tài khoản Google CÁ NHÂN, xóa mã mẫu, dán mã (Ctrl+V) rồi bấm Lưu.' });
  };
  const saveDraft = (f: string, sUrl: string) => {
    try {
      if (f.trim() || sUrl.trim()) localStorage.setItem(DRAFT_KEY + username.toLowerCase(), JSON.stringify({ folderUrl: f.trim(), scriptUrl: sUrl.trim() }));
      else localStorage.removeItem(DRAFT_KEY + username.toLowerCase());
    } catch (_) { /* ignore */ }
  };
  const onConnect = () => run('connect', async () => {
    setCheck(null); setDriveNote('');
    saveDraft(folderUrl, scriptUrl);
    const d = await quizBankStore.diagnoseDrive(scriptUrl, folderUrl);
    if (!d.ok || !d.cfg) { setCheck(d); return; }
    quizBankStore.setDriveConfig(username, d.cfg);
    saveDraft('', '');
    // Kết nối xong là tự đồng bộ: Drive có bản mới hơn → lấy về; chưa có tệp / máy mới hơn → đẩy lên
    let sync: { ok: boolean; text: string };
    const remote = await quizBankStore.pullDrive(username);
    if (remote) { updateQuizBank(remote); sync = { ok: true, text: 'Đã lấy bộ câu hỏi từ Drive cá nhân về máy.' }; }
    else {
      const p = await quizBankStore.pushDrive(username);
      sync = p.ok ? { ok: true, text: `Đã lưu bộ câu hỏi vào tệp ${quizBankStore.remoteFileName(username)}.` } : { ok: false, text: p.message };
    }
    setCheck({ ...d, sync });
  });
  // 📄 Tệp cấu hình kho câu hỏi cá nhân: chỉ gồm link thư mục Drive cá nhân + link Apps Script cá nhân,
  // để giáo viên mang sang máy tính khác (không chứa câu hỏi, không chứa mật khẩu).
  const downloadCfgFile = () => {
    const f0 = (cfg?.folderUrl || folderUrl).trim();
    const s0 = (cfg?.scriptUrl || scriptUrl).trim();
    if (!f0 || !s0) { setDriveNote('Chưa có đủ link thư mục và link Apps Script để tạo tệp cấu hình.'); return; }
    const data = {
      format: 'lhhp_quiz_storage', version: 1, username, folderUrl: f0, scriptUrl: s0, createdAt: new Date().toISOString(),
      note: 'Tệp cấu hình kho câu hỏi cá nhân — Lớp Học Hạnh Phúc. Ở máy khác: Nơi lưu câu hỏi → Nạp tệp cấu hình → Kiểm tra & kết nối.',
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `cau_hinh_kho_cau_hoi_${username.toLowerCase() || 'ca_nhan'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    setDriveNote('Đã tải tệp cấu hình kho câu hỏi. Cất tệp này để dùng khi sang máy tính khác.');
  };
  const loadCfgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let j: any = null;
    try { j = JSON.parse(await file.text()); } catch (_) { j = null; }
    const f0 = String(j?.folderUrl || '').trim();
    const s0 = String(j?.scriptUrl || '').trim();
    if (!j || !f0 || !s0) { setCheck(null); setDriveNote(`Tệp "${file.name}" không phải tệp cấu hình kho câu hỏi (thiếu link thư mục hoặc link Apps Script).`); return; }
    if (j.format === 'lhhp_connection') { setCheck(null); setDriveNote('Đây là tệp kết nối CSDL của NHÀ TRƯỜNG, không dùng cho kho câu hỏi cá nhân. Hãy nạp tệp này ở màn đăng nhập hoặc mục Dữ liệu.'); return; }
    setFolderUrl(f0); setScriptUrl(s0); saveDraft(f0, s0); setCheck(null);
    setDriveNote('Đã điền 2 link từ tệp cấu hình. Bấm "Kiểm tra & kết nối" để hoàn tất.');
  };
  const clearField = (which: 'folder' | 'script') => {
    if (which === 'folder') { setFolderUrl(''); saveDraft('', scriptUrl); } else { setScriptUrl(''); saveDraft(folderUrl, ''); }
    setCheck(null);
    setDriveNote(which === 'folder' ? 'Đã xóa link thư mục.' : 'Đã xóa link Apps Script.');
  };
  const saveField = (which: 'folder' | 'script') => {
    saveDraft(folderUrl, scriptUrl);
    setDriveNote(which === 'folder' ? 'Đã lưu link thư mục. Mở lại hộp này link vẫn còn.' : 'Đã lưu link Apps Script. Mở lại hộp này link vẫn còn.');
  };

  const onPickFolder = () => run('folder', async () => {
    const r = await quizBankStore.pickLocalFolder(username);
    if (!r.ok) { if (r.message) setMsg({ type: 'err', text: r.message }); return; }
    if (r.existing && r.existing.length) {
      const m = quizBankStore.mergeImport(quizBank, r.existing);
      updateQuizBank(m.questions);
      setMsg({ type: 'ok', text: `${r.message} Thư mục đã có tệp câu hỏi: thêm ${m.added} câu, cập nhật ${m.replaced} câu.` });
    } else {
      setMsg({ type: 'ok', text: r.message });
    }
  });
  const onGrantFolder = () => run('grant', async () => {
    const w = await quizBankStore.writeLocalFolder(username, true);
    setMsg({ type: w.ok ? 'ok' : 'err', text: w.ok ? 'Đã cho phép ghi thư mục. ' + w.message : w.message });
  });
  const onReadFolder = () => run('readFolder', async () => {
    const list = await quizBankStore.readLocalFolder(username, true);
    if (!list) { setMsg({ type: 'err', text: 'Chưa đọc được tệp câu hỏi trong thư mục (chưa có tệp hoặc chưa cho phép).' }); return; }
    const m = quizBankStore.mergeImport(quizBank, list);
    updateQuizBank(m.questions);
    setMsg({ type: 'ok', text: `Đã đọc tệp trong thư mục: thêm ${m.added} câu, cập nhật ${m.replaced} câu.` });
  });
  const onClearLocal = () => run('clearLocal', async () => {
    if (!confirm('Bỏ chọn nơi lưu trên máy tính? Tệp trong thư mục và câu hỏi trên máy vẫn được giữ.')) return;
    await quizBankStore.clearLocal(username);
    setMsg({ type: 'ok', text: 'Đã bỏ chọn thư mục. Bộ câu hỏi vẫn còn trên máy này.' });
  });
  const onBrowserOnly = () => {
    quizBankStore.useBrowserOnly(username);
    setMsg({ type: 'ok', text: 'Đã chọn lưu trong bộ nhớ phần mềm trên máy này. Nhớ Xuất bộ câu hỏi định kỳ để sao lưu.' });
  };

  const onDisconnect = () => {
    if (!confirm('Ngắt kết nối Google Drive cá nhân? Bộ câu hỏi vẫn còn trên máy này và tệp trên Drive cá nhân không bị xóa.')) return;
    quizBankStore.setDriveConfig(username, null);
    // Ngắt hẳn: bỏ link đã nhớ theo tài khoản (máy khác không tự kết nối lại nữa)
    window.dispatchEvent(new CustomEvent('lhhp:quiz-drive-disconnected', { detail: { username } }));
    setMsg({ type: 'ok', text: 'Đã ngắt kết nối. Bộ câu hỏi tiếp tục lưu trên máy này.' });
  };

  const btn = 'no-hover-fx h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-storage-title">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <h3 id="quiz-storage-title" className="text-base font-black text-slate-900">Nơi lưu câu hỏi của tôi</h3>
            <p className="text-sm text-slate-600 mt-0.5">Bộ câu hỏi trò chơi là dữ liệu <strong>riêng của bạn</strong>, không lưu vào thư mục chung của nhà trường.</p>
          </div>
          <button type="button" onClick={close} aria-label="Đóng" className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {required && (
            configured ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 flex flex-wrap items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                <p className="text-sm font-bold text-emerald-900 flex-1 min-w-[200px]">Đã cấu hình nơi lưu bộ câu hỏi. Bạn có thể thêm câu hỏi.</p>
                <button type="button" onClick={close} className="no-hover-fx h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white whitespace-nowrap">
                  Tiếp tục thêm câu hỏi <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-950"><strong>Cần cấu hình nơi lưu bộ câu hỏi trước khi thêm câu hỏi.</strong> Chọn <strong>một thư mục trên máy tính</strong> hoặc kết nối <strong>Google Drive cá nhân</strong> bên dưới. Chỉ cần làm một lần trên máy này.</p>
              </div>
            )
          )}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Câu tự soạn / đã sửa', value: String(custom), tone: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
              { label: 'Tổng câu dùng được', value: String(quizBank.length), tone: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
              { label: 'Dung lượng (ước tính)', value: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`, tone: 'bg-amber-50 border-amber-200 text-amber-800' },
            ].map(t => (
              <div key={t.label} className={`rounded-2xl border p-3 ${t.tone}`}>
                <div className="text-xs font-bold uppercase tracking-wide">{t.label}</div>
                <div className="text-xl font-black text-slate-900 tabular-nums mt-0.5">{t.value}</div>
              </div>
            ))}
          </div>

          {msg && (
            <p role="status" className={`rounded-xl border px-3 py-2 text-sm font-bold flex items-start gap-2 ${msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
              {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />} {msg.text}
            </p>
          )}

          <section className={`rounded-2xl border p-4 space-y-2 ${local ? 'border-emerald-200' : required ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 mr-auto"><FolderOpen className="w-4 h-4 text-indigo-700" /> Thư mục trên máy tính</h4>
              {local?.mode === 'folder' && <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Đang lưu vào "{local.folderName}"{local.lastWriteAt ? ` • ${new Date(local.lastWriteAt).toLocaleString('vi-VN')}` : ''}</span>}
              {local?.mode === 'browser' && <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Bộ nhớ phần mềm trên máy này</span>}
            </div>
            <p className="text-sm text-slate-600">
              Chọn một thư mục (ví dụ <em>Tài liệu › Câu hỏi lớp học</em>, hoặc thư mục OneDrive / USB). Mỗi lần lưu, phần mềm tự ghi tệp <code>{quizBankStore.remoteFileName(username)}</code> vào thư mục đó; trên máy mới, chọn lại đúng thư mục là có lại bộ câu hỏi.
            </p>
            {local?.lastError && <p className="text-sm text-rose-700 font-bold">⚠ {local.lastError}</p>}
            {local?.mode === 'folder' && local.needsPermission && <p className="text-sm text-amber-800 font-bold">Trình duyệt cần bạn cho phép lại quyền ghi vào thư mục (sau khi mở lại trình duyệt).</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {canFolder ? (
                <button type="button" onClick={onPickFolder} disabled={!!busy} className={`${btn} ${local?.mode === 'folder' ? 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-800' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                  {busy === 'folder' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />} {local?.mode === 'folder' ? 'Đổi thư mục' : 'Chọn thư mục lưu'}
                </button>
              ) : (
                <>
                  <p className="text-sm text-amber-800 w-full">Trình duyệt này không cho chọn thư mục (hãy dùng Chrome hoặc Edge). Bạn có thể lưu trong bộ nhớ phần mềm trên máy này, hoặc dùng Google Drive cá nhân.</p>
                  {local?.mode !== 'browser' && (
                    <button type="button" onClick={onBrowserOnly} disabled={!!busy} className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white`}>
                      <HardDrive className="w-4 h-4" /> Lưu trong bộ nhớ máy này
                    </button>
                  )}
                </>
              )}
              {local?.mode === 'folder' && (
                <>
                  {local.needsPermission && (
                    <button type="button" onClick={onGrantFolder} disabled={!!busy} className={`${btn} bg-amber-600 hover:bg-amber-700 text-white`}>
                      {busy === 'grant' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Cho phép ghi thư mục
                    </button>
                  )}
                  <button type="button" onClick={onReadFolder} disabled={!!busy} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50 text-slate-800`}>
                    {busy === 'readFolder' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Đọc lại từ thư mục
                  </button>
                </>
              )}
              {local && (
                <button type="button" onClick={onClearLocal} disabled={!!busy} className={`${btn} border border-rose-200 bg-white hover:bg-rose-50 text-rose-700`}>
                  <Unplug className="w-4 h-4" /> Bỏ chọn
                </button>
              )}
            </div>
            <p className="text-xs text-slate-600 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" /> Ngoài ra phần mềm luôn giữ một bản trong bộ nhớ riêng của trình duyệt trên máy này (ảnh câu hỏi được nén gọn).</p>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4 space-y-2">
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2"><Download className="w-4 h-4 text-emerald-700" /> Tệp trên máy tính / USB</h4>
            <p className="text-sm text-slate-600">Xuất bộ câu hỏi thành tệp <code>.json</code> để cất vào thư mục máy tính, USB, chuyển sang máy khác hoặc chia sẻ đồng nghiệp. Nhập tệp: câu mới được thêm, câu cùng mã được cập nhật, câu đang có giữ nguyên.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={onExport} disabled={!!busy} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>
                {busy === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Xuất bộ câu hỏi (.json)
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50 text-slate-800`}>
                {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Nhập bộ câu hỏi
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 mr-auto"><Cloud className="w-4 h-4 text-sky-700" /> Google Drive cá nhân <span className="text-xs font-bold text-slate-600">(tùy chọn — dùng chung trên nhiều máy)</span></h4>
              {cfg && <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Đã kết nối{cfg.lastSyncAt ? ` • đồng bộ ${new Date(cfg.lastSyncAt).toLocaleString('vi-VN')}` : ''}</span>}
            </div>
            {cfg?.lastError && <p className="text-sm text-rose-700 font-bold">⚠ {cfg.lastError}</p>}
            {/* Ghi nhớ link theo TÀI KHOẢN (két mã hóa bằng mật khẩu) → máy / trình duyệt khác tự kết nối */}
            {(() => {
              const remembered = quizVaultStatus.hasVault && quizVaultStatus.keyReady && !quizVaultStatus.stale && !!cfg;
              const needUnlock = quizVaultStatus.hasVault && !cfg && !quizVaultStatus.keyReady;
              const needRemember = !!cfg && (!quizVaultStatus.keyReady || quizVaultStatus.stale || !quizVaultStatus.hasVault);
              if (remembered) return (
                <p className="text-sm font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> Đã ghi nhớ theo tài khoản: đăng nhập tài khoản này ở máy / trình duyệt khác là tự kết nối Drive cá nhân (link được mã hóa bằng mật khẩu của bạn).
                </p>
              );
              if (!needUnlock && !needRemember) return null;
              const submit = async () => {
                setVaultBusy(true); setVaultMsg(null);
                try {
                  const r = await unlockQuizVault(vaultPw);
                  setVaultMsg({ type: r.ok ? 'ok' : 'err', text: r.message });
                  if (r.ok) {
                    setVaultPw('');
                    // Chờ link được mở & đặt cấu hình (tối đa ~8 giây) rồi đồng bộ câu hỏi ngay
                    for (let k = 0; k < 16 && !quizBankStore.getDriveConfig(username); k++) await new Promise(res => setTimeout(res, 500));
                    if (quizBankStore.getDriveConfig(username)) {
                      await syncPersonalQuiz().catch(() => false);
                      setVaultMsg({ type: 'ok', text: `${r.message} Đã đồng bộ bộ câu hỏi với Google Drive cá nhân.` });
                    }
                  }
                } finally { setVaultBusy(false); }
              };
              return (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
                  <p className="text-sm text-amber-950">
                    {needUnlock
                      ? <><strong>Tài khoản của bạn đã có link Drive cá nhân lưu từ máy khác.</strong> Nhập mật khẩu tài khoản để dùng trên máy này.</>
                      : <><strong>Chưa ghi nhớ link theo tài khoản</strong> (máy / trình duyệt khác sẽ chưa tự kết nối). Nhập mật khẩu đăng nhập phần mềm để ghi nhớ.</>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input type="password" value={vaultPw} onChange={(e) => setVaultPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && vaultPw) submit(); }}
                      placeholder="Mật khẩu đăng nhập phần mềm" autoComplete="current-password" aria-label="Mật khẩu tài khoản"
                      className="flex-1 min-w-[180px] h-10 px-3 rounded-xl border border-amber-300 bg-white text-sm" />
                    <button type="button" onClick={submit} disabled={vaultBusy || !vaultPw} className={`${btn} bg-amber-700 hover:bg-amber-800 text-white`}>
                      {vaultBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {needUnlock ? 'Mở link đã lưu' : 'Ghi nhớ theo tài khoản'}
                    </button>
                  </div>
                  {vaultMsg && <p role="status" className={`text-sm font-bold ${vaultMsg.type === 'ok' ? 'text-emerald-800' : 'text-rose-700'}`}>{vaultMsg.text}</p>}
                </div>
              );
            })()}
            <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
              <li>
                Trên <strong>tài khoản Google của bạn</strong> (không dùng thư mục của trường), tạo một thư mục, ví dụ "Câu hỏi lớp học", rồi dán link thư mục:
                <div className="mt-1 flex items-center gap-1.5">
                  <input value={folderUrl} onChange={(e) => { setFolderUrl(e.target.value); setCheck(null); }} placeholder="https://drive.google.com/drive/folders/..."
                    className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-slate-300 text-sm" aria-label="Link thư mục Google Drive cá nhân" />
                  <button type="button" onClick={() => saveField('folder')} disabled={!folderUrl.trim()} title="Lưu link thư mục" aria-label="Lưu link thư mục"
                    className="no-hover-fx w-10 h-10 shrink-0 rounded-xl border border-sky-300 bg-white text-sky-700 hover:bg-sky-50 inline-flex items-center justify-center disabled:opacity-40">
                    <Save className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => clearField('folder')} disabled={!folderUrl} title="Xóa link thư mục" aria-label="Xóa link thư mục"
                    className="no-hover-fx w-10 h-10 shrink-0 rounded-xl border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center disabled:opacity-40">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
              <li className="space-y-1">
                <span>Sao chép mã Apps Script (đã điền sẵn thư mục), mở <strong>script.new</strong>, xóa mã mẫu, dán mã rồi bấm Lưu.</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onCopyCode}
                    className={`${btn} h-9 border transition-all duration-150 active:scale-95 ${flash === 'copy' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-50 hover:border-sky-400 text-slate-800'}`}>
                    {flash === 'copy' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {flash === 'copy' ? 'Đã sao chép!' : 'Sao chép mã'}
                  </button>
                  <a href="https://script.new" target="_blank" rel="noreferrer" onClick={onOpenScript}
                    className={`${btn} h-9 border transition-all duration-150 active:scale-95 ${flash === 'open' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-50 hover:border-sky-400 text-slate-800'}`}>
                    {flash === 'open' ? <CheckCircle2 className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />} {flash === 'open' ? 'Đã mở thẻ mới' : 'Mở script.new'}
                  </a>
                </div>
                {codeNote && (
                  <p role="status" aria-live="polite" className={`text-sm font-bold rounded-xl px-3 py-2 flex items-start gap-2 border ${codeNote.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                    {codeNote.type === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />} {codeNote.text}
                  </p>
                )}
              </li>
              <li>Bấm <strong>Triển khai → Tùy chọn triển khai mới → Ứng dụng web</strong>, "Người có quyền truy cập": <strong>Bất kỳ ai</strong> → Triển khai → cho phép quyền → sao chép link kết thúc bằng <code>/exec</code>.</li>
              <li>
                Dán link Apps Script cá nhân:
                <div className="mt-1 flex items-center gap-1.5">
                  <input value={scriptUrl} onChange={(e) => { setScriptUrl(e.target.value); setCheck(null); }} placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-slate-300 text-sm" aria-label="Link Apps Script cá nhân" />
                  <button type="button" onClick={() => saveField('script')} disabled={!scriptUrl.trim()} title="Lưu link Apps Script" aria-label="Lưu link Apps Script"
                    className="no-hover-fx w-10 h-10 shrink-0 rounded-xl border border-sky-300 bg-white text-sky-700 hover:bg-sky-50 inline-flex items-center justify-center disabled:opacity-40">
                    <Save className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => clearField('script')} disabled={!scriptUrl} title="Xóa link Apps Script" aria-label="Xóa link Apps Script"
                    className="no-hover-fx w-10 h-10 shrink-0 rounded-xl border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center disabled:opacity-40">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            </ol>
            {driveNote && <p role="status" className="text-sm font-bold text-sky-900 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> {driveNote}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onConnect} disabled={!!busy || !folderUrl.trim() || !scriptUrl.trim()} className={`${btn} bg-sky-700 hover:bg-sky-800 text-white`}>
                {busy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Kiểm tra & kết nối
              </button>
              <label className={`${btn} border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer`} title="Chọn tệp cấu hình kho câu hỏi đã tải về trước đó để tự điền 2 link">
                <Upload className="w-4 h-4" /> Nạp tệp cấu hình
                <input type="file" accept=".json" onChange={loadCfgFile} className="hidden" />
              </label>
              <button type="button" onClick={downloadCfgFile} disabled={!((cfg?.folderUrl || folderUrl).trim() && (cfg?.scriptUrl || scriptUrl).trim())} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50 text-slate-800`} title="Tải tệp chứa link thư mục và link Apps Script cá nhân để dùng ở máy tính khác">
                <Download className="w-4 h-4" /> Tải tệp cấu hình
              </button>
              {cfg && (
                <>
                  <button type="button" onClick={onDisconnect} disabled={!!busy} className={`${btn} border border-rose-200 bg-white hover:bg-rose-50 text-rose-700`}>
                    <Unplug className="w-4 h-4" /> Ngắt kết nối
                  </button>
                </>
              )}
            </div>
            {check && (
              <div role="status" className={`rounded-2xl border p-3 space-y-2 ${check.ok && check.sync?.ok !== false ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
                <div className="flex items-center gap-2">
                  {check.ok && check.sync?.ok !== false ? <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-700 shrink-0" />}
                  <span className={`text-sm font-black ${check.ok && check.sync?.ok !== false ? 'text-emerald-900' : 'text-rose-800'}`}>
                    {check.ok ? (check.sync?.ok === false ? 'ĐẠT — đã kết nối, nhưng chưa đồng bộ được' : 'ĐẠT — Đã kết nối và đồng bộ Google Drive cá nhân') : 'KHÔNG ĐẠT — Chưa kết nối được'}
                  </span>
                </div>
                <ul className="space-y-1">
                  {check.steps.map(st => (
                    <li key={st.key} className="flex items-start gap-2 text-sm">
                      {st.status === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> : st.status === 'fail' ? <XCircle className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" /> : <Circle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />}
                      <span className={st.status === 'skip' ? 'text-slate-500' : 'text-slate-800'}>
                        <strong className="font-bold">{st.label}</strong>
                        {st.status === 'ok' && <span className="text-emerald-800"> — Đạt{st.detail ? ` (${st.detail})` : ''}</span>}
                        {st.status === 'fail' && <span className="text-rose-700"> — Không đạt: {st.detail}</span>}
                        {st.status === 'skip' && <span> — chưa kiểm tra</span>}
                      </span>
                    </li>
                  ))}
                  {check.sync && (
                    <li className="flex items-start gap-2 text-sm">
                      {check.sync.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" />}
                      <span className="text-slate-800"><strong className="font-bold">Đồng bộ bộ câu hỏi</strong> <span className={check.sync.ok ? 'text-emerald-800' : 'text-rose-700'}>— {check.sync.text}</span></span>
                    </li>
                  )}
                </ul>
                <p className={`text-sm rounded-xl px-3 py-2 bg-white/70 ${check.ok ? 'text-emerald-900' : 'text-rose-900'}`}>
                  <strong>Cần làm tiếp: </strong>
                  {check.ok
                    ? (check.sync?.ok === false ? 'Kiểm tra mạng; phần mềm sẽ tự thử đồng bộ lại ở lần lưu câu hỏi sau.' : 'Không cần làm gì thêm. Từ giờ mỗi lần sửa câu hỏi, phần mềm tự đồng bộ lên Drive cá nhân; máy khác đăng nhập là tự lấy về.')
                    : check.next}
                </p>
              </div>
            )}
            <p className="text-xs text-slate-600">Khi đã kết nối: phần mềm TỰ ĐỒNG BỘ — mỗi lần sửa câu hỏi tự đẩy lên Drive cá nhân sau ~10 giây; mở phần mềm trên máy khác là tự lấy bản mới hơn.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

/** Nhãn ngắn nơi lưu câu hỏi hiện tại của giáo viên */
export function quizStorageLabel(username: string): string {
  if (!username) return '';
  const local = quizBankStore.getLocalInfo(username);
  const drive = quizBankStore.getDriveConfig(username);
  const parts: string[] = [];
  if (local?.mode === 'folder') parts.push(`Thư mục "${local.folderName || 'đã chọn'}"`);
  if (local?.mode === 'browser') parts.push('Bộ nhớ máy này');
  if (drive) parts.push('Drive cá nhân');
  return parts.length ? parts.join(' + ') : 'Chưa cấu hình';
}

/** Nút "Nơi lưu câu hỏi" (chỉ tài khoản giáo viên): mở hộp cấu hình — đổi thư mục, Drive cá nhân, xuất / nhập, đọc lại thư mục */
export const QuizStorageButton: React.FC<{ className?: string; compact?: boolean; variant?: 'default' | 'tab' }> = ({ className = '', compact, variant = 'default' }) => {
  const { currentUser } = useClassroom();
  const [, bump] = useState(0);
  useEffect(() => quizBankStore.subscribe(() => bump(n => n + 1)), []);
  if (!isPersonalQuizAccount(currentUser)) return null;
  const label = quizStorageLabel(currentUser?.username || '');
  const missing = label === 'Chưa cấu hình';
  if (variant === 'tab') {
    // Dạng thẻ trên thanh trò chơi của màn Gọi tên học sinh
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_QUIZ_STORAGE_EVENT))}
        className={`px-3 py-2 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5 uppercase cursor-pointer whitespace-nowrap border ${
          missing ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100' : 'bg-white border-indigo-200 text-indigo-800 hover:bg-indigo-50'
        } ${className}`}
        title={`Nơi lưu câu hỏi của tôi: ${label} — đổi thư mục, kết nối Drive cá nhân, xuất / nhập bộ câu hỏi`}
      >
        <FolderCog className="w-4 h-4 shrink-0" />
        <span>Nơi lưu câu hỏi của tôi</span>
        {missing && <span className="px-1.5 rounded-md bg-amber-600 text-white text-[12px] font-black normal-case">Chưa cấu hình</span>}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_QUIZ_STORAGE_EVENT))}
      className={`no-hover-fx px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer border whitespace-nowrap ${
        missing ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
      } ${className}`}
      title={`Nơi lưu câu hỏi cá nhân: ${label} — đổi thư mục, kết nối Drive cá nhân, xuất / nhập bộ câu hỏi`}
    >
      <FolderCog className="w-4 h-4 text-indigo-700 shrink-0" />
      <span>{compact ? 'Nơi lưu câu hỏi' : 'Cấu hình nơi lưu câu hỏi'}</span>
      <span className={`hidden md:inline max-w-[200px] truncate font-semibold ${missing ? 'text-amber-800' : 'text-slate-600'}`}>· {label}</span>
    </button>
  );
};

export default QuizStorageModal;
