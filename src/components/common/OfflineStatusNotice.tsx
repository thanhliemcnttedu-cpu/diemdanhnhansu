/**
 * Desktop build only (needs the offline data folder bridge): a small status area at the bottom-right corner.
 *  - "working offline" / "changes waiting to be pushed" pill
 *  - a reminder for teacher accounts that have not linked a personal Google Drive for their question bank
 * Renders nothing on the web build.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CloudUpload, WifiOff, X } from 'lucide-react';
import type { UserAccount } from '../../types';
import { offlineStoreService } from '../../services/offlineStoreService';
import { googleDriveService } from '../../services/googleDriveService';
import { quizBankStore } from '../../services/quizBankStore';
import { OPEN_QUIZ_STORAGE_EVENT } from '../modals/QuizStorageModal';

const DISMISS_KEY = 'lhhp_personal_drive_reminder_dismissed';

const isTeacherAccount = (u: UserAccount | null | undefined) => Boolean(
  u && !(u.role === 'admin' || u.role === 'school_admin' || u.role === 'bgh' || u.isBgh || u.isSchoolAdmin
    || u.role === 'guest_admin' || u.isGuestAdmin || u.nonTeaching)
);

export const OfflineStatusNotice: React.FC<{ currentUser: UserAccount | null }> = ({ currentUser }) => {
  const available = offlineStoreService.isAvailable();
  const [online, setOnline] = useState<boolean>(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [pending, setPending] = useState(false);
  const [needsPersonalDrive, setNeedsPersonalDrive] = useState(false);
  const [dismissed, setDismissed] = useState<string>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) || ''; } catch { return ''; }
  });
  const username = (currentUser?.username || '').toLowerCase();

  useEffect(() => {
    if (!available) return;
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, [available]);

  // Unpushed changes + personal Drive link are plain storage lookups → a light periodic check is enough
  useEffect(() => {
    if (!available || !username) { setPending(false); setNeedsPersonalDrive(false); return; }
    const check = () => {
      setPending(googleDriveService.isPushPending(username));
      setNeedsPersonalDrive(isTeacherAccount(currentUser) && !quizBankStore.getDriveConfig(username));
    };
    check();
    const timer = setInterval(check, 4000);
    return () => clearInterval(timer);
  }, [available, username, currentUser]);

  if (!available) return null;

  const showReminder = needsPersonalDrive && dismissed !== username;
  const showPill = !online || (pending && !!username);
  if (!showReminder && !showPill) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 right-3 md:right-4 z-30 flex flex-col items-end gap-2 max-w-[calc(100vw-1.5rem)] pointer-events-none">
      {showReminder && (
        <div role="status" className="pointer-events-auto w-80 max-w-full rounded-2xl border border-amber-300 bg-amber-50 shadow-lg p-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-amber-950">Chưa liên kết Google Drive cá nhân</p>
              <p className="text-sm text-amber-950 mt-0.5">Kho câu hỏi của thầy cô hiện chỉ lưu trên máy tính này, chưa có bản sao trực tuyến.</p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_QUIZ_STORAGE_EVENT))}
                  className="no-hover-fx h-9 px-3 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-sm font-black cursor-pointer">
                  Liên kết ngay
                </button>
                <button type="button"
                  onClick={() => { setDismissed(username); try { sessionStorage.setItem(DISMISS_KEY, username); } catch { /* ignore */ } }}
                  className="no-hover-fx h-9 px-3 rounded-lg border border-amber-400 bg-white hover:bg-amber-100 text-amber-950 text-sm font-bold cursor-pointer">
                  Để sau
                </button>
              </div>
            </div>
            <button type="button" aria-label="Đóng nhắc nhở" title="Đóng"
              onClick={() => { setDismissed(username); try { sessionStorage.setItem(DISMISS_KEY, username); } catch { /* ignore */ } }}
              className="no-hover-fx w-8 h-8 -mt-1 -mr-1 rounded-lg hover:bg-amber-100 flex items-center justify-center shrink-0 cursor-pointer">
              <X className="w-4 h-4 text-amber-900" />
            </button>
          </div>
        </div>
      )}
      {showPill && (
        <div role="status" aria-live="polite"
          className={`pointer-events-auto rounded-full border shadow-md px-3.5 py-2 text-sm font-bold flex items-center gap-2 ${
            online ? 'bg-sky-50 border-sky-300 text-sky-950' : 'bg-amber-50 border-amber-300 text-amber-950'}`}>
          {online
            ? <CloudUpload className="w-4 h-4 text-sky-700 shrink-0" aria-hidden="true" />
            : <WifiOff className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />}
          <span>
            {online
              ? 'Đang đẩy thay đổi lên Drive của trường...'
              : pending ? 'Đang ngoại tuyến • thay đổi được lưu trên máy, sẽ tự đẩy khi có mạng' : 'Đang ngoại tuyến • dữ liệu lưu trên máy'}
          </span>
        </div>
      )}
    </div>
  );
};
