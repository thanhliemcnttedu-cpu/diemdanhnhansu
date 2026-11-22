import React, { useState } from 'react';
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { useAttendanceBackfill } from '../../../utils/useAttendanceBackfill';

/**
 * Công tắc của QUẢN TRỊ TỐI CAO: mở / khóa quyền điểm danh ngược cho giáo viên chủ nhiệm.
 * Bật: GVCN điểm danh chuyên cần và bán trú cho mọi ngày, mọi tuần, mọi tháng đã qua (chuẩn hóa số liệu từ đầu năm học).
 * Tắt: quay lại quy định hôm nay + 2 ngày trước.
 */
export const AttendanceBackfillToggle: React.FC = () => {
  const { open, busy, change } = useAttendanceBackfill();
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = async () => {
    const err = await change(!open);
    setMsg(err);
  };

  return (
    <div className={`rounded-2xl border-2 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${open ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start gap-3 min-w-0">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${open ? 'bg-emerald-600' : 'bg-slate-600'}`}>
          {open ? <LockKeyholeOpen className="w-5 h-5" /> : <LockKeyhole className="w-5 h-5" />}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-900 wrap-ok break-words">
            Điểm danh ngược cho GVCN: {open ? 'ĐANG MỞ KHÓA' : 'đang khóa (chỉ hôm nay và 2 ngày trước)'}
          </div>
          <div className="text-xs font-semibold text-slate-600 wrap-ok break-words leading-snug">
            {open
              ? 'Giáo viên chủ nhiệm đang được điểm danh chuyên cần và bán trú cho mọi ngày, tuần, tháng đã qua. Chuẩn hóa xong nhớ tắt khóa.'
              : 'Bật khi trường mới triển khai, cần nhập bổ sung số liệu chuyên cần và ăn bán trú từ tháng 9 đến nay.'}
          </div>
          {msg && <div className="text-xs font-bold text-red-700 mt-1 wrap-ok break-words">{msg}</div>}
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        role="switch"
        aria-checked={open}
        className={`shrink-0 px-4 py-2 rounded-full text-sm font-black text-white shadow-xs cursor-pointer disabled:opacity-60 ${open ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
      >
        {busy ? 'Đang lưu…' : open ? 'Tắt khóa' : 'Mở khóa điểm danh ngược'}
      </button>
    </div>
  );
};

export default AttendanceBackfillToggle;
