# Chế độ ngoại tuyến của bản cài đặt (11/2026)

Chỉ có trên bản cài đặt có cầu nối thư mục (`window.lhhpDesktop.offline`). Bản web và bộ cài cũ: mọi hàm trả "không có", luồng cũ giữ nguyên. **Cần bộ cài mới** vì cầu nối nằm trong phần vỏ (`desktop-lite/main.cjs`, `preload.cjs`), không cập nhật được bằng gói giao diện.

## Thư mục ngoại tuyến
- Người dùng chọn một thư mục ở màn thiết lập lần đầu (`components/common/OfflineSetupWizard.tsx`, bắt buộc; mở lại bằng sự kiện `OPEN_OFFLINE_SETUP_EVENT` hoặc thẻ trong "Nơi lưu dữ liệu trên máy tính"). Đường dẫn lưu ở `%APPDATA%/…/offline-folder.json`.
- Giao diện chỉ truyền đường dẫn tương đối; phần vỏ giới hạn trong thư mục đã chọn, chỉ nhận `.json` / `.txt`, ghi kiểu tạm rồi đổi tên.
- `services/offlineStoreService.ts` là lớp bọc duy nhất. Dữ liệu tách theo từng kết nối trường (`truong_<folderId>`):
  - `thiet_lap.json` — dấu đã thiết lập.
  - `dang_nhap_ngoai_tuyen.json` — mã kiểm tra mật khẩu (PBKDF2, không có mật khẩu rõ).
  - `du_lieu_tai_khoan/<trường>/<tài khoản>.json` — dữ liệu tài khoản giáo viên (chép sau mỗi lần lưu, gom 2,5 giây).
  - `du_lieu_toan_truong/<trường>/lop_hoc_sinh_diem_danh.json` — tổng hợp lớp, học sinh, điểm danh, bán trú cho Quản trị / BGH.
  - `du_lieu_toan_truong/<trường>/tai_khoan_va_truong.json` — danh sách tài khoản (không mật khẩu) và trường.
  - `du_lieu_toan_truong/<trường>/nhan_su.json`, `cham_cong_<từ>_<đến>.json` — bản xem của chấm công (không có mật khẩu điểm danh).

## Đăng nhập ngoại tuyến (`services/offlineAuthService.ts`)
- Sau mỗi lần đăng nhập CÓ MẠNG thành công: lưu mã kiểm tra + thông tin tài khoản. Khi Apps Script không trả lời: kiểm tra theo mã đó, hiệu lực `OFFLINE_VALID_DAYS` = 30 ngày từ lần có mạng gần nhất. Chấp nhận số CCCD thiếu số 0 đầu.
- Tài khoản quản lý vào ngoại tuyến vẫn được nhớ mật khẩu phiên (`rememberLoginSecrets`) để ký các lệnh ghi khi có mạng lại.
- `AuthModal`: khi chỉ có danh sách trường lưu sẵn (`offline-cache`) và máy có mã kiểm tra thì không khóa vai trò.

## Đồng bộ khi có mạng lại (giáo viên)
- `googleDriveService.pullClassData`: nếu máy còn thay đổi chưa đẩy (`isPushPending`) và bản trên máy đúng là bản chứa thay đổi cuối, chạy thêm `dataAdapter.keepLocalEdits` — bản ghi trên máy thắng; bản ghi chỉ có trên Drive được giữ trừ khi mã của nó từng có trên máy (`lhhp_seen_ids_<user>`), tức là đã xóa ở máy này.
- Vòng đẩy bù gọi `pushAfterMergingRemote` (kéo – gộp – đẩy), báo phần gộp thêm cho giao diện qua `DRIVE_MERGED_EVENT`.
- Bộ xử lý đóng trang phải đọc state qua `currentDataGetterRef` (xem `ERRORS.md` 14/11/2026).

## Quản trị / BGH
- `databaseService.loadDriveClassFilesCached`: đọc Drive được thì chép ảnh chụp vào thư mục (chỉ khi đổi); không đọc được thì dùng ảnh chụp trong thư mục, thử lại Drive sau 15 giây.
- Hàng chờ tài khoản / trường (`lhhp_q:*` trong localStorage, mã hóa nhẹ) không còn nằm ở sessionStorage và không bị xóa khi đăng xuất; tự gửi khi có mạng, sau khi Quản trị đăng nhập, và mỗi phút.
- Điều chỉnh lớp / học sinh chờ ghi: `lhhp_admin_edits_pending:<folderId>`. Phân hiệu chờ ghi: `lhhp_branches_pending:<trường>`.
- Chấm công nhân sự lúc mất mạng: chỉ xem bản đã lưu; điểm danh hộ, khóa sổ, lưu danh sách không xếp hàng chờ.

## Chưa làm
- Bảng thống kê chuyên cần – bán trú theo kỳ (`DriveAttendanceStatsPanel`) và kê khai tiết dạy chưa có bản xem ngoại tuyến.
- Đặt lại mật khẩu tài khoản lúc mất mạng vẫn báo lỗi ngay (dù mục đó đã vào hàng chờ).
- Kho câu hỏi cá nhân chưa có tệp riêng trong thư mục (đi theo dữ liệu tài khoản).
