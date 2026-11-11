/**
 * ⏱️ CHU KỲ CẬP NHẬT DỮ LIỆU THEO VAI TRÒ (11/2026) — tính cho ~60 tài khoản mở cùng lúc trên 1 Apps Script của trường.
 *
 * Giới hạn Google (tài khoản Gmail thường): ~30 lệnh Apps Script xử lý CÙNG LÚC; Script Properties 50 000 lượt đọc / ngày
 * (danh sách tài khoản đọc mật khẩu xem được, chấm công đọc số CCCD — mỗi lần làm mới đọc 60–120 lượt).
 *
 *  Việc                                         Chu kỳ   Ghi chú
 *  Máy → Drive (giáo viên lưu)                  15 s     gom thay đổi (DRIVE_PUSH_BATCH_MS); xác nhận điểm danh / bán trú đẩy NGAY
 *  Báo cáo số liệu BGH / Quản trị (thống kê)    15 s     1 lệnh aggregateRange (đọc tệp báo cáo gọn bc_gvcn_*)
 *  Dữ liệu chi tiết lớp cho BGH / Quản trị      60 s     1 lệnh liệt kê + chỉ tải tệp lớp ĐÃ ĐỔI
 *  Giáo viên kéo dữ liệu lớp mình (máy khác)    60 s     1 lệnh liệt kê; bỏ qua khi đang sửa / còn thay đổi chưa đẩy
 *  Điều chỉnh của Quản trị → giáo viên          60 s
 *  Kho câu hỏi cá nhân (Drive CÁ NHÂN)          60 s     không tính vào Apps Script của trường
 *  Danh sách tài khoản (Quản trị)               90 s     đọc mật khẩu xem được từ Script Properties
 *  Chấm công nhân sự (Quản trị / BGH)           90 s     đọc số CCCD từ Script Properties
 *
 * Ước tính 55 giáo viên + 5 quản lý mở cùng lúc: ~150 lệnh / phút lúc bình thường, cao điểm điểm danh buổi sáng ~400 lệnh / phút,
 * trung bình 3–6 lệnh xử lý cùng lúc (< 30). Tab ẩn thì tạm nghỉ; mỗi máy lệch giờ ngẫu nhiên ±15% để không dồn cùng giây.
 */
export const MANAGER_REPORT_MS = 15000;
export const MANAGER_DATA_MS = 60000;
export const TEACHER_SYNC_MS = 60000;
export const ADMIN_EDITS_MS = 60000;
export const PERSONAL_QUIZ_MS = 60000;
export const ACCOUNT_LIST_MS = 90000;
export const STAFF_SYNC_MS = 90000;
/** Bộ nhớ đệm đọc Drive: ngắn hơn chu kỳ một chút để mỗi vòng lấy bản mới */
export const cacheFor = (cycleMs: number) => Math.max(5000, cycleMs - 5000);
/** Có chỉnh sửa trên máy trong khoảng này → bỏ qua vòng kéo dữ liệu của giáo viên */
export const LOCAL_EDIT_QUIET_MS = 20000;
/** Lệch giờ ngẫu nhiên ±15% (tránh 60 máy cùng gọi một giây) */
export const withJitter = (ms: number) => Math.round(ms * (0.85 + Math.random() * 0.3));

/** setInterval có lệch giờ ngẫu nhiên + nghỉ khi tab ẩn. Trả về hàm dừng. */
export function startJitteredLoop(run: () => void | Promise<void>, cycleMs: number): () => void {
  let stopped = false;
  let t: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (stopped) return;
    try { if (typeof document === 'undefined' || !document.hidden) await run(); } catch (_) { /* ignore */ }
    if (!stopped) t = setTimeout(tick, withJitter(cycleMs));
  };
  t = setTimeout(tick, withJitter(cycleMs));
  return () => { stopped = true; if (t) clearTimeout(t); };
}

// Giữ tên cũ cho các nơi đã dùng
export const LIVE_SYNC_MS = MANAGER_REPORT_MS;
export const LIVE_CACHE_MS = cacheFor(MANAGER_DATA_MS);
