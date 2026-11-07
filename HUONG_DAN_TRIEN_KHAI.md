# Hướng dẫn triển khai & liên thông Google Drive — Lớp Học Hạnh Phúc

## 1. Quy trình báo cáo chuyên cần & bán trú qua 1 thư mục Google Drive dùng chung

Cả trường làm việc trên **cùng một thư mục Google Drive** (giống nhiều người cùng sửa một thư mục chung).

### Bước A — Quản trị nhà trường (làm 1 lần)
0. Ban đầu hệ thống **trống**, chỉ có tài khoản `adminquantri` (mật khẩu khởi tạo do tác giả cung cấp). Màn hình đăng nhập khóa mọi vai trò khác cho đến khi máy được cấu hình thư mục dùng chung và nhà trường đã khởi tạo CSDL.
1. Tạo 1 thư mục trên Google Drive (ví dụ `DuLieu_LopHocHanhPhuc`) → Chia sẻ → **"Bất kỳ ai có liên kết – Người chỉnh sửa"**.
2. Đăng nhập phần mềm bằng tài khoản Quản trị nhà trường → **Đồng bộ Google Drive** → dán link thư mục → **Xem & Sao chép mã** (mã Apps Script **V4.1**, gốc ở `scripts/google_apps_script.js`).
3. Vào https://script.google.com → Dự án mới → dán mã → **Triển khai → Triển khai mới → Ứng dụng web**: Thực thi dưới dạng **Tôi**, Ai có quyền truy cập **Bất kỳ ai**.
4. Dán URL Web App (đuôi `/exec`) vào ô *URL Cầu nối Apps Script* → **LƯU**.
5. Khung **"GỬI THÔNG TIN KẾT NỐI CHO TOÀN TRƯỜNG"** hiện ra → bấm **SAO CHÉP ĐỂ GỬI** → gửi tin nhắn đó cho BGH và toàn bộ GVCN (Zalo / email).
   - Nếu phần mềm chạy có máy chủ (localhost, Railway, EXE dùng chung máy chủ), cấu hình còn tự áp dụng cho mọi tài khoản khi đăng nhập.

> ⚠️ Đã từng triển khai Apps Script bản cũ → dán lại mã V4.1 và **Triển khai lại** (Manage deployments → Edit → New version).

6. Lần đầu lưu cấu hình, phần mềm tự tạo **cơ sở dữ liệu nhà trường** (`csdl_truong.json`) trên thư mục. Tài khoản Quản trị cao nhất giữ nguyên mật khẩu.
7. Vào **Quản trị tài khoản & CSDL trường học** → Khởi tạo trường → tạo tài khoản BGH, GVCN, GVBM (từng người hoặc nhập Excel) → **Xuất Excel** tên đăng nhập + mật khẩu (xuất ngay trong phiên làm việc đó; mật khẩu chỉ lưu dạng mã hóa trên Drive). Mọi thay đổi tự lưu lên Drive.

### Bước B — BGH và GVCN (mỗi người 1 lần)
Ngay ở **màn hình đăng nhập**: dán nguyên tin nhắn kết nối vào khung vàng "Máy này chưa cấu hình thư mục dùng chung" → **Áp dụng** (chỉ 1 lần trên mỗi máy/trình duyệt) → chọn vai trò + trường (danh sách lấy từ Drive) → đăng nhập bằng tài khoản được cấp (không bắt buộc đổi mật khẩu). Muốn đổi: bấm **ĐỔI MẬT KHẨU** ở thanh bên — Quản trị thấy ngay mật khẩu mới trong bảng quản lý tài khoản.

### Bước C — GVCN báo cáo hằng ngày
- Mục **Điểm danh**: chỉ điểm danh được **hôm nay, hôm qua và hôm kia** (tối đa 2 ngày bổ sung). Ngày cũ hơn bị khóa để tránh báo cáo chậm / sai số liệu.
- Bấm **Xác nhận điểm danh** / **Xác nhận bán trú** → số liệu được đẩy ngay lên thư mục Drive dùng chung (tệp `gvcn_{lop}.json`, luôn là lớp chủ nhiệm).

### Bước D — BGH và Quản trị nhà trường xem tổng hợp
- Trang **Tổng quan** và **Báo cáo → Thời gian thực**: bảng *Chuyên cần & bán trú toàn trường (Google Drive)* — **hôm nay, hôm qua, tuần này, tháng này**, danh sách lớp đã / chưa báo cáo.
- Tự làm mới mỗi 15 giây và ngay sau khi một GVCN bấm xác nhận.
- **Chỉ tổng hợp số liệu của GVCN** (lớp chủ nhiệm). Tệp của giáo viên bộ môn, BGH, Quản trị không được tính → không dôi số lớp, không dôi số học sinh (ví dụ trường 50 lớp, 100 giáo viên → tổng hợp đúng 50 lớp).
- Cách tính: chuyên cần = (có mặt + đi muộn) / sĩ số các lớp đã báo cáo; bán trú = số suất ăn / số học sinh đăng ký bán trú.

## 2. GitHub
- Kho chính duy nhất: `thanhliemcnttedu-cpu/lhhp`. Không đẩy lên `lophochanhphuc`.
- Không commit sản phẩm build (`dist/`, `dist-server/`, `server.js`, `release/` đã có trong `.gitignore`).

## 3. Vercel (web tĩnh)
- Import kho GitHub → Framework **Vite** (đã có `vercel.json`).
- Biến môi trường: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (dữ liệu tài khoản/lớp), `VITE_DRIVE_SCRIPT_URL`, `VITE_DRIVE_FOLDER_ID` (Drive dùng chung).
- Bản Vercel không có máy chủ Express (`/api/*`): phần mềm tự dùng Supabase + gọi thẳng Apps Script.

## 4. Railway (máy chủ Node đầy đủ)
- New Project → Deploy from GitHub repo (đã có `railway.json`).
- Thêm **Volume**, mount vào `/data`.
- Biến môi trường:
  - `LHHP_DATA_DIR=/data` (lần đầu tự chép dữ liệu từ repo vào Volume)
  - `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (bỏ tải Electron khi cài, build nhanh hơn)
  - tùy chọn: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DRIVE_SCRIPT_URL`, `VITE_DRIVE_FOLDER_ID`
- Railway tự cấp `PORT`; kiểm tra sức khỏe qua `/api/database/stats`.

## 5. Bản cài Windows (EXE)
```bash
npm run package:win
```
Kết quả trong thư mục `release/`.
