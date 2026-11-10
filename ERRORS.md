# ERRORS.md - Nhật ký lỗi & bài học

## [2026-10-15 07:30] - Auto-save của Admin ghi đè dữ liệu cũ lên chỉnh sửa mới của GVCN

- **Type**: Logic
- **Severity**: Critical
- **File**: `src/context/ClassroomContext.tsx` (auto-save effect), `server/database.ts:syncAdminClassroomData`
- **Agent**: meo meo (@orchestrator)
- **Root Cause**: Mỗi khi state của tài khoản `admin`/`adminquantri` thay đổi (kể cả chỉ chọn lớp khác — `activeClassId` nằm trong deps), client gửi **toàn bộ** snapshot lớp + học sinh lên `/api/admin/sync-all`. Server merge snapshot (có thể đã cũ) đè lên dữ liệu của mọi GVCN → ảnh lớp, thông tin lớp, tên/ảnh học sinh, điểm thi đua GVCN vừa sửa bị quay về bản cũ.
- **Error Message**:
  ```
  repro_overwrite.mjs → GVCN student edit survived: false / GVCN class edit survived: false
  ```
- **Fix Applied**: Admin chỉ gửi delta (bản ghi admin thực sự sửa so với baseline nhận từ server). Server chấp nhận delta chỉ có học sinh. Supabase merge theo id thay vì thay cả mảng.
- **Prevention**: Không bao giờ đẩy full snapshot từ tài khoản tổng hợp (read-mostly) xuống dữ liệu nguồn của giáo viên; luôn dùng delta / merge theo id.
- **Status**: Fixed

---

## [2026-10-15 07:30] - Upsert Supabase của GVCN bị timeout 1.5s → không phát sóng realtime

- **Type**: Integration
- **Severity**: High
- **File**: `src/services/databaseService.ts:saveUserData`
- **Agent**: meo meo (@orchestrator)
- **Root Cause**: `Promise.race` với timeout 1.5s; payload có ảnh (base64) thường > 1.5s → coi như lỗi → bỏ qua broadcast `user_data_updated`. Trên Vercel (không có Express SSE) BGH/Quản trị không nhận được thông báo tức thì.
- **Error Message**:
  ```
  (silent) error: Supabase timeout
  ```
- **Fix Applied**: Chờ upsert thật hoàn tất (vẫn chạy nền, không chặn UI) rồi mới broadcast.
- **Prevention**: Không dùng timeout cứng để quyết định thành công/thất bại cho tác vụ nền.
- **Status**: Fixed

## [2026-10-22 13:30] - Lỗi khởi chạy ứng dụng Desktop EXE: spawn C:\Windows\system32\cmd.exe ENOENT

- **Type**: Runtime / Integration
- **Severity**: High
- **File**: `electron/main.cjs:startBackendServer`, `package.json`, `electron-builder.json`
- **Agent**: meo meo (@orchestrator)
- **Root Cause**: Khi đóng gói file `.exe` cài đặt qua electron-builder, ứng dụng không compile `server.ts` sang `server.js` (chỉ chạy `vite build` frontend). Khi app khởi chạy trên máy tính người dùng, Electron không tìm thấy `server.js` nên nhảy vào nhánh dev fallback `spawn('npx', ['tsx', 'server.ts'], { shell: true })`. Trên máy client phổ thông không có Node.js/npx, đồng thời `spawn` không đăng ký sự kiện `serverProcess.on('error')` và Electron thiếu global uncaught exception guard, dẫn đến Uncaught Exception làm văng hộp thoại đỏ `Error: spawn C:\Windows\system32\cmd.exe ENOENT`.
- **Error Message**:
  ```
  A JavaScript error occurred in the main process
  Uncaught Exception:
  Error: spawn C:\Windows\system32\cmd.exe ENOENT
      at ChildProcess._handle.onexit (node:internal/child_process:316:19)
      at onErrorNT (node:internal/child_process:554:16)
      at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
  ```
- **Fix Applied**: 
  1. Thêm script `scripts/build_server.js` (`npm run build:server`) sử dụng Vite SSR bundle toàn bộ `server.ts` + các module con thành `server.js` và `dist-server/server.js` độc lập.
  2. Trong `server.ts`: chuyển `vite` sang dynamic import trong dev mode, loại bỏ phụ thuộc vào devDependencies khi chạy production.
  3. Cập nhật `electron-builder.json`: cấu hình `asarUnpack: ["server.js", "data/**/*"]` đảm bảo file server và database JSON được unpack vật lý ra ổ cứng, cho phép đọc ghi dữ liệu cục bộ không bị hạn chế read-only.
  4. Cập nhật `electron/main.cjs`: sử dụng `utilityProcess.fork` (API chính thức của Electron) thay thế spawn shell; bắt toàn bộ sự kiện `error` trên process con; thêm `process.on('uncaughtException')` ngăn chặn mọi hộp thoại popup crash. Tuyệt đối không spawn npx/cmd trong môi trường `app.isPackaged`.
- **Prevention**: Mọi ứng dụng desktop đóng gói phải tự chủ hoàn toàn backend (bundle trước), không bao giờ phụ thuộc vào runtime ngoại lai (Node/npx/cmd) của máy người dùng cuối.
- **Status**: Fixed

## [2026-10-22 13:50] - Lỗi trắng màn hình (White Screen) sau khi khởi chạy ứng dụng Desktop đóng gói

- **Type**: Integration / Build
- **Severity**: High
- **File**: `scripts/build_server.js`, `vite.config.ts`, `electron-builder.json`, `electron/main.cjs`
- **Agent**: meo meo (@orchestrator)
- **Root Cause**:
  1. `server.js` khi được build ban đầu vẫn để `external: true` với `node_modules` (express, @supabase/supabase-js...), trong khi `server.js` được unpack ra ngoài file `app.asar`, dẫn đến khi khởi chạy `server.js` bị crash ngay lập tức do không tìm thấy `node_modules` bên ngoài asar.
  2. Thư mục `dist/` (frontend) bị đóng gói bên trong file nhị phân `app.asar`, trong khi `server.js` chạy ngoài asar không thể nạp file tĩnh từ đường dẫn thông thường, khiến route GET `*` trả về 404/trắng trang.
  3. `vite.config.ts` thiếu `base: './'` khiến các asset trong `index.html` được trỏ tuyệt đối (`/assets/...`), gây hỏng khi nạp qua giao thức `file://` hoặc khi server tĩnh chưa sẵn sàng.
- **Fix Applied**:
  1. Cập nhật `scripts/build_server.js` cấu hình `ssr.noExternal: true` và `inlineDynamicImports: true` để tạo ra một file `server.js` Standalone duy nhất (~3.5MB), tích hợp 100% Express và các dependency, hoàn toàn không phụ thuộc `node_modules`.
  2. Thêm `base: './'` vào `vite.config.ts` để mọi assets trong `index.html` đều dùng đường dẫn tương đối.
  3. Cập nhật `electron-builder.json`: đưa `dist/**/*` và `dist-server/**/*` vào `asarUnpack` để tài nguyên giao diện được giải nén vật lý cạnh `server.js`.
## [2026-10-22 15:00] - Khởi động lâu, mất logo và thiếu dữ liệu trường mẫu khi chạy độc lập

- **Type**: Performance / Integration / Data
- **Severity**: High
- **File**: `electron/main.cjs`, `src/components/modals/AuthModal.tsx`, `src/components/modals/RegistrationModal.tsx`, `src/services/databaseService.ts`, `src/data/initialData.ts`
- **Agent**: meo meo (@orchestrator)
- **Root Cause**:
  1. **Khởi động lâu**: `electron/main.cjs` gọi `await startBackendServer()` trước `createWindow()`. Server poll port 3000 trong 20s, khiến người dùng phải đợi hàng chục giây mới thấy cửa sổ.
  2. **Mất logo**: `<img src="/assets/school_db_logo.png" />` dùng đường dẫn tuyệt đối bắt đầu bằng `/`. Khi chạy qua giao thức `file://` của Desktop, trình duyệt tìm `file:///assets/...` (ổ C:\) dẫn đến lỗi 404 và `onError` ẩn ảnh đi, chỉ còn vòng tròn trắng.
  3. **Không có dữ liệu trường mẫu**: Khi chạy `file://` độc lập không có HTTP `localhost:3000`, các lệnh gọi `fetch('/api/...')` thất bại. Tầng LocalStorage của máy mới cài đặt hoàn toàn trống rỗng, `INITIAL_CLASSES` rỗng, `FALLBACK_SCHOOLS` rỗng, dẫn đến không có dữ liệu trường học hay học sinh nào.
  4. **Thiếu IPC ghi đè file và Google Drive**: Không có cơ chế IPC Node.js để ghi file trực tiếp vào ổ đĩa và gọi Google Apps Script vượt CORS khi không có backend server.
- **Fix Applied**:
  1. Trong `electron/main.cjs`: Gọi `createWindow()` NGAY LẬP TỨC trong `app.whenReady()` và nạp thẳng file cục bộ `dist/index.html` trong 0.2s - 0.3s; khởi động backend ngầm phía sau mà không block UI.
  2. Trong `AuthModal.tsx` và `RegistrationModal.tsx`: Import logo trực tiếp từ `src/assets/school_db_logo.png` để Vite bundle thành relative hash asset `./assets/school_db_logo-[hash].png` chuẩn 100%.
  3. (Dữ liệu trường mẫu đã được gỡ bỏ khỏi mã nguồn khi đưa vào sử dụng thực tế.)
  4. Thêm helper `getApiBaseUrl()` trỏ tới `http://127.0.0.1:3000` khi chạy `file://`.
  5. Bổ sung các IPC handler trong `electron/main.cjs` và `electron/preload.cjs`: `save-role-file` (ghi đè file ổ đĩa máy tính), `read-role-file`, `proxy-drive-sync` (gửi payload lên Google Apps Script bằng Node.js HTTPS vượt CORS và redirect 302). Tích hợp vào `dataStorageService.ts` và `googleDriveService.ts`.
  6. Đóng gói lại thành công file cài đặt setup `release/CSDL_LHHP.exe` (252.5 MB).
- **Prevention**: Luôn áp dụng kiến trúc Local-First Hybrid: Giao diện nạp tức thì từ file tĩnh, tích hợp sẵn dữ liệu hạt giống gốc, sử dụng IPC Node.js cho các tác vụ file/mạng độc lập với web server.
- **Status**: Fixed

---


---

## [2026-11-06 10:00] - Thống kê Drive cho BGH sai (luôn 100%) và đẩy dữ liệu 5 giây/lần từ mọi tài khoản

- **Type**: Logic / Integration
- **Severity**: High
- **File**: `src/services/googleDriveService.ts` (generateAppsScriptCode, startAutoSyncLoop5s, getConfig), `scripts/google_apps_script.js`
- **Agent**: Claude Code
- **Root Cause**: (1) Mã Apps Script sinh trong app đọc trường `content.stats.presentCount` không tồn tại → chuyên cần luôn 100%, bán trú 0, bỏ qua ngày, đếm cả `bgh.json`. Có 2 bản script khác nhau. (2) Vòng 5 giây đẩy toàn bộ dữ liệu của mọi tài khoản (kể cả BGH/Quản trị) → vượt hạn mức Apps Script. (3) Cấu hình Drive chỉ lưu localStorage từng máy. (4) Ngày báo cáo dùng `toISOString()` (UTC) → trước 7h sáng lấy nhầm hôm qua. (5) Đi muộn bị tính là vắng ở dashboard BGH.
- **Fix Applied**: Script V3 một nguồn duy nhất (app import `?raw`), tệp báo cáo gọn `bc_gvcn_*.json`, action `aggregateRange`; vòng 5 giây chỉ đẩy lại khi lần trước lỗi; cấu hình Drive dùng chung qua `/api/drive/shared-config` + biến `VITE_DRIVE_*`; `toLocalDateKey`; thống nhất late = có mặt.
- **Prevention**: Không duy trì 2 bản mã Apps Script; mọi ngày báo cáo dùng giờ địa phương; không đẩy định kỳ vô điều kiện.
- **Status**: Fixed (chưa kiểm thử trên Apps Script thật — đã kiểm bằng Drive giả lập)

---

## [2026-11-08 14:30] - Bản web (Vercel): Quản trị & BGH thấy 0 lớp, 0 học sinh dù GVCN đã nhập lớp

- **Type**: Integration
- **Severity**: High
- **File**: `src/services/databaseService.ts:getExecutiveScopedData`, `src/services/googleDriveService.ts:pullAllClassFilesFromDrive`
- **Agent**: Claude Code
- **Root Cause**: Dữ liệu lớp/học sinh của Quản trị/BGH được gom từ máy chủ Express (`/api/executive/scoped-data`), Supabase (`user_classroom_data`) hoặc localStorage của chính máy đó. Bản Vercel không có Express, trường không dùng Supabase, BGH ở máy khác → cả 3 nguồn rỗng. Riêng thống kê chuyên cần/bán trú vẫn đúng vì đọc thẳng báo cáo `bc_gvcn_*` trên Drive (`aggregateRange`).
- **Error Message**:
  ```
  (không có lỗi) Lớp học: "0 lớp • 0 học sinh"; Thống kê: "Đã báo cáo hôm nay: 1/1 lớp"
  ```
- **Fix Applied**: `getExecutiveScopedData` gộp thêm nguồn Google Drive: đọc mọi tệp `gvcn_*.json` trong thư mục dùng chung (`listClassFiles` + `getLatest`, tải song song 5 tệp), gộp lớp theo id/tên lớp chuẩn hóa, học sinh, điểm danh, bán trú. Có bộ nhớ đệm 60 giây + chống gọi trùng (app làm mới ~12 giây/lần). Không ghi ngược: Quản trị/BGH chỉ ghi tệp riêng (`adminquantri.json`, `bgh.json`), không đụng tệp `gvcn_*`.
- **Prevention**: Mọi tính năng tổng hợp cho Quản trị/BGH phải có nguồn chạy được trên bản tĩnh (Drive) — thử bằng Apps Script giả lập với BGH ở "máy khác" (xóa `lop_hoc_user_db_<gvcn>` khỏi localStorage trước khi đăng nhập BGH).
- **Status**: Fixed

---

## [2026-11-08 15:45] - GVCN đăng nhập với bộ nhớ máy trống → tự đẩy lớp 0 học sinh, đè tệp lớp thật trên Drive

- **Type**: Data
- **Severity**: Critical
- **File**: `src/context/ClassroomContext.tsx` (đường đăng nhập `loginUser` & khôi phục phiên), `src/services/googleDriveService.ts:pushClassData`
- **Agent**: Claude Code
- **Root Cause**: Khi đăng nhập, nếu `localStorage` có bản dữ liệu của GVCN (kể cả bản TRẮNG 0 lớp / 0 học sinh, hoặc bản cũ) thì app dùng luôn, bỏ qua khôi phục từ Drive. Sau đó lớp chủ nhiệm được tạo lại rỗng và tự lưu → `gvcn_<lớp>.json` trên Drive bị ghi đè còn 0 học sinh. Phát hiện khi thử nghiệm trên Drive giả lập.
- **Error Message**:
  ```
  gvcn_1a1.json: students 3 → 0 (exportedAt 07:25, máy có lop_hoc_user_db_<gvcn> = 0 lớp, 0 học sinh)
  ```
- **Fix Applied**: (1) GVCN đăng nhập / khôi phục phiên trên bản Drive luôn GỘP THÊM dữ liệu lớp từ Drive (`mergeDriveClassForTeacher`, gộp cộng thêm không xóa); bản máy 0 lớp coi như không có. (2) `pushClassData` từ chối đẩy tệp lớp 0 học sinh khi tệp trên Drive đang có học sinh (hoặc không kiểm tra được).
- **Prevention**: Mọi luồng tự lưu của GVCN phải coi Drive là nguồn chuẩn khi dữ liệu máy rỗng; không bao giờ để một bản rỗng ghi đè bản có dữ liệu.
- **Status**: Fixed

---

## [2026-11-09 21:00] - Bản web (Drive): đặt lại mật khẩu / xóa tài khoản tác động nhầm vào tài khoản Quản trị đang đăng nhập

- **Type**: Logic
- **Severity**: Critical
- **File**: `src/services/databaseService.ts` (`findLocalUserById` trong adapter Drive), `src/components/modals/AccountManagementModal.tsx`
- **Agent**: Claude
- **Root Cause**: Tài khoản tải từ `csdl_truong.json` không có trường `id`. Màn Quản trị gọi `resetPassword(user.id)` / `deleteUser(user.id)` với `undefined`; `findLocalUserById` so `u.id === id` → `undefined === undefined` khớp **tài khoản đầu tiên** trong `LHHP_USERS` (thường là chính Quản trị). Ô chọn hàng loạt cũng dùng `u.id` nên tích 1 ô = tích tất cả; `isSelf` luôn đúng.
- **Error Message**:
  ```
  Gán mật khẩu cho gvcntest, bghtest → chỉ qttest (Quản trị) đổi mật khẩu; gvcntest/bghtest: "Sai mật khẩu."
  ```
- **Fix Applied**: `findLocalUserById` trả null khi id rỗng và chỉ so id khi tài khoản có id; màn Quản trị dùng `uidOf(u) = u.id || u.username` cho xóa, đặt lại mật khẩu, chọn hàng loạt, `isSelf`, key dòng.
- **Prevention**: Không dùng `id` làm khóa cho tài khoản đến từ Drive; khóa chuẩn là `username` (viết thường). Mọi hàm tìm theo khóa phải từ chối khóa rỗng.
- **Status**: Fixed

---

## [2026-11-10 00:30] - Chấm công báo "Failed to fetch / link không trả lời" dù Apps Script mới đã chạy (chip xanh V4.5)

- **Type**: Logic
- **Severity**: High
- **File**: `src/services/staffAttendanceService.ts` (`resolveConnection`)
- **Agent**: Claude
- **Root Cause**: Thứ tự chọn kết nối là link đang mở → **kết nối đã nhớ** (`lhhp_staff_checkin_conn`, ghi khi mở trang /diemdanh bằng link cũ) → cấu hình Drive của máy. Sau khi Quản trị cài lại Apps Script (link mới), màn quản lý chấm công vẫn gọi link cũ đã chết; chip trên thanh trên lại dùng cấu hình máy nên báo xanh → hai nơi mâu thuẫn. Kèm theo: người dùng xóa sạch thư mục Drive làm mất `csdl_truong.json` (Apps Script trả UNAUTHORIZED).
- **Error Message**:
  ```
  Failed to fetch  →  "Không kết nối được Apps Script của nhà trường: link /exec không trả lời…"
  ```
- **Fix Applied**: Cấu hình Drive của máy đứng trước kết nối đã nhớ; kết nối đã nhớ chỉ dùng khi máy chưa cấu hình (điện thoại nhân sự). Thêm `diagnoseFailure` (dead / no_db) và nút "Khởi tạo lại CSDL trường".
- **Prevention**: Mọi màn quản lý phải dùng cùng một nguồn kết nối với phần kiểm tra phiên bản. Hướng dẫn trường: không đặt dự án Apps Script trong thư mục dữ liệu, không xóa `csdl_truong.json`.
- **Status**: Fixed

---

## [2026-11-10 12:45] - Giáo viên không đăng nhập điểm danh được ("Số CCCD hoặc mật khẩu điểm danh không đúng") dù đã cấp mật khẩu, Apps Script đúng phiên bản

- **Type**: Integration
- **Severity**: Critical
- **File**: `scripts/google_apps_script.js` (`findStaffByCccd`, `cccdHash`, `staffPepper`)
- **Agent**: Claude Code
- **Root Cause**: Số CCCD trong `nhansu_truong.json` được lưu dạng băm với "muối" `staff_pepper` nằm trong **Script Properties của dự án Apps Script**. Khi trường cập nhật bằng cách tạo **dự án Apps Script mới** (thay vì dán mã vào dự án cũ), Script Properties trống → `staff_pepper` sinh lại → mọi `cccdHash` cũ không khớp. Bảng nhân sự vẫn hiện đủ số CCCD (đọc `cccdFull` trong tệp) và mật khẩu mới cấp (`spin:`), nhưng đăng nhập luôn báo sai. Cấp lại mật khẩu không sửa được vì chỉ đổi `pinHash`.
- **Error Message**:
  ```
  staffAuth → { success: false, code: "INVALID", message: "Số CCCD hoặc mật khẩu điểm danh không đúng." }
  ```
- **Fix Applied**: Apps Script 1.1.3: `findStaffByCccd` không khớp mã băm thì đối chiếu `cccdFull` rồi băm lại theo khóa hiện tại (ghi lại tệp khi đăng nhập đúng mật khẩu); `healStaffCccdHashes` băm lại toàn bộ khi Quản trị / BGH mở hoặc lưu danh sách nhân sự.
- **Prevention**: Không để dữ liệu trong thư mục Drive phụ thuộc duy nhất vào bí mật nằm trong Script Properties; luôn có đường tự phục hồi. Hồ sơ nhập trước 4.4 (không có `cccdFull`) vẫn cần nhập lại Excel sau khi đổi dự án. Hướng dẫn cập nhật: dán mã vào **dự án cũ** → Quản lý triển khai → Phiên bản mới.
- **Status**: Fixed


---

## [2026-11-10 17:20] - "Xóa đã chọn" học sinh chỉ xóa được 1 em (chọn 25 em, lớp vẫn còn 25)

- **Type**: Logic
- **Severity**: High
- **File**: `src/components/views/ClassesStudentsView.tsx` (`handleBulkDeleteSelected`), `src/context/ClassroomContext.tsx` (`deleteStudent`, `bulkDeleteStudents`)
- **Agent**: Claude Code
- **Root Cause**: Nút gọi `selectedStudentIds.forEach(id => deleteStudent(id))`. `deleteStudent` lọc trên state `students` của lần render hiện tại (chưa cập nhật giữa các lần gọi trong cùng vòng lặp) → mỗi lần gọi đều tính từ danh sách ban đầu, lần cuối thắng → chỉ em cuối bị xóa. Context đã có sẵn `bulkDeleteStudents` nhưng màn không dùng.
- **Fix Applied**: Nút gọi `bulkDeleteStudents([...selectedStudentIds])` (xóa một lần, lưu một lần). `deleteStudent` / `bulkDeleteStudents` đọc danh sách mới nhất từ `studentsRef` (như `updateStudent`).
- **Prevention**: Thao tác hàng loạt dùng hàm bulk của context; hàm sửa state có thể bị gọi liên tiếp phải đọc `studentsRef.current`, không đọc state trong closure. Lưu ý tương tự: `bulkAddStudents` vẫn đọc state `students` → gọi nó TRƯỚC các `updateStudent` trong cùng thao tác.
- **Status**: Fixed

---

## [2026-11-10 18:05] - Trang chủ: React báo "change in the order of Hooks" khi đổi vai trò GVCN ↔ GV bộ môn

- **Type**: Logic
- **Severity**: Medium
- **File**: `src/components/views/DashboardView.tsx`
- **Agent**: Claude Code
- **Root Cause**: `DashboardView` gọi `useClassroom()` rồi `return <SubjectTeacherDashboard/>` sớm khi `teacherRole === 'subject'`, trước các `useState`/`useEffect` của trang chủ GVCN → số hook thay đổi giữa 2 lần render khi vai trò đổi (đăng nhập, bấm GVCN / GV BỘ MÔN).
- **Error Message**:
  ```
  React has detected a change in the order of Hooks called by DashboardView … 2. undefined → useState
  ```
- **Fix Applied**: `DashboardView` chỉ chọn thành phần theo vai trò; thân trang chủ GVCN tách thành `HomeroomDashboard`.
- **Prevention**: Không `return` sớm trước hook trong thành phần; rẽ nhánh theo vai trò bằng cách trả về thành phần con khác nhau.
- **Status**: Fixed

---

## [2026-11-10 22:20] - Xem lớp GV bộ môn chưa từng đăng nhập vẫn thấy lớp 3A1 với 20 học sinh

- **Type**: Data
- **Severity**: High
- **File**: `src/context/ClassroomContext.tsx` (`buildDefaultDataForUser`, `switchUserAccount`, `initSubjectClasses`, `viewAsTeacher`)
- **Agent**: Claude Code
- **Root Cause**: Dữ liệu mặc định của GVBM tự sinh lớp mẫu `class-sub-3a1` + 20 học sinh mẫu (có xu). Nút "Vào xem" bản cũ đăng nhập hẳn thành giáo viên rồi `saveUserData(defaultData)` → lớp mẫu được đẩy lên Drive thành `gvbm_<tên>.json`. Chế độ chỉ xem mới đọc lại đúng tệp đó nên hiện 20 học sinh giả dù giáo viên chưa đăng nhập.
- **Fix Applied**: `utils/sampleData.ts` (`stripSampleData`) lọc học sinh / lớp mẫu khi nạp dữ liệu (bản Drive) và ở chế độ chỉ xem; `initSubjectClasses` và `switchUserAccount` không sinh/lưu học sinh mẫu khi đã kết nối Drive; dải chỉ xem ghi chú khi giáo viên chưa có dữ liệu.
- **Prevention**: Bản web dùng chung Drive không bao giờ sinh dữ liệu mẫu; mọi luồng "xem thay" phải chỉ đọc (xem `utils/viewOnlyMode.ts`).
- **Status**: Fixed
