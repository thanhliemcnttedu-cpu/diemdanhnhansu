import { useCallback, useEffect, useState } from 'react';
import { attendanceBackfillFlag } from '../services/adminEditsService';

/**
 * Công tắc "điểm danh ngược" do quản trị tối cao bật/tắt.
 * Đọc lại mỗi 60 giây (nhẹ: 1 tệp nhỏ trên Drive, có đệm 20 giây), khi quay lại tab và khi chính máy này vừa bật/tắt.
 */
export function useAttendanceBackfill() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setOpen(await attendanceBackfillFlag.load()); } catch { /* giữ giá trị cũ */ }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    const onLocal = (e: Event) => setOpen(Boolean((e as CustomEvent).detail));
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('lhhp-attendance-backfill', onLocal);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('lhhp-attendance-backfill', onLocal);
    };
  }, [refresh]);

  /** Chỉ quản trị gọi. Trả về thông báo lỗi (nếu có). */
  const change = useCallback(async (next: boolean): Promise<string | null> => {
    setBusy(true);
    try {
      const ok = await attendanceBackfillFlag.save(next);
      if (!ok) return 'Chỉ tài khoản quản trị mới bật/tắt được.';
      setOpen(next);
      return null;
    } catch (e: any) {
      return e?.message || 'Không lưu được công tắc.';
    } finally {
      setBusy(false);
    }
  }, []);

  return { open, busy, change, refresh };
}
