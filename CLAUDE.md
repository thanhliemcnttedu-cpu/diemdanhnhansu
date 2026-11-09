# CLAUDE.md — Lớp Học Hạnh Phúc (CSDL LHHP)

Phần mềm quản lý lớp học (tích điểm xu, điểm danh, sơ đồ lớp, vòng quay, AI, báo cáo BGH...) cho giáo viên Việt Nam.
Chạy được 3 kiểu: **web localhost** (Express + Vite), **web Vercel** (tĩnh + Supabase), **Desktop EXE** (Electron).
Dự án chuyển từ Antigravity sang; các quy tắc gốc nằm ở `GEMINI.md` và `.agent/rules/` (thư mục `.agent/` bị gitignore, chỉ có ở máy local).

## Ngôn ngữ
- Trao đổi, tài liệu, báo cáo: **tiếng Việt**.
- Code: tên biến/hàm/file **tiếng Anh**; comment ưu tiên tiếng Anh. Chuỗi giao diện người dùng: tiếng Việt.

## Lệnh thường dùng
| Việc | Lệnh |
|---|---|
| Chạy dev (Express + Vite middleware, cổng **3000** cố định) | `npm run dev` (tsx watch) hoặc `npm start` |
| Kiểm tra type (bắt buộc trước khi bàn giao) | `npm run lint` (= `tsc --noEmit`) |
| Build frontend → `dist/` | `npm run build` |
| Bundle server → `dist-server/server.js` + `server.js` | `npm run build:server` |
| Đóng gói EXE Windows → `release/` | `npm run package:win` |
| Electron dev | `npm run electron:dev` |

- Không có test tự động. Kiểm chứng = `npm run lint` + mở `http://localhost:3000` (Claude: dùng preview `lhhp-dev` trong `.claude/launch.json`) và kiểm tra các view.
- Build thử không ghi đè `dist/`: `npx vite build --outDir <thư_mục_tạm> --emptyOutDir`.

## Kiến trúc
**Backend** — `server.ts` (~1800 dòng, ESM):
- Route nhóm theo `/api/ai/*` (proxy Gemini, `GEMINI_API_KEY`), `/api/auth/login`, `/api/users/*`, `/api/user-data/:username`, `/api/admin/*`, `/api/executive/scoped-data`, `/api/database/*`, `/api/supabase/*`, `/api/schools/*`, `/api/github/*`, `/api/drive/*` (Google Apps Script), `/api/storage/*`, `/api/backup/*`, `/api/realtime/{stream,broadcast}` (SSE).
- Prod khi `NODE_ENV=production` / `LHHP_PACKAGED=true` / không có `src/` → serve `dist`; ngược lại chạy Vite middleware.
- Lưu ý: một số route bị khai báo trùng (Express lấy route đăng ký trước) — kiểm tra trước khi sửa route.
- `server/database.ts` — engine JSON DB: file chính `data/classroom_database.json` (cache trong RAM, ghi atomic). Mỗi lần lưu tự sinh bản phân vùng:
  `data/database_ca_nhan/` (GV cá nhân/guest), `database_nha_truong/` (trường chính thức), `database_quan_tri_admin/` (admin, system_settings, audit_logs), backup ở `data/backups/`. `smartMergeDatabase` = merge không phá hủy.
  - **Trường demo đã bị loại bỏ** (11/2026): không còn phân vùng `database_truong_demo`, không tự gắn cờ `isDemo`. Trường `isDemo`/`tenantType 'demo'` trong types vẫn giữ (optional) để dữ liệu cũ đọc được.
- `LHHP_DATA_DIR` (ổ lưu bền vững trên Railway): nếu thư mục trống, lần chạy đầu tự chép `data/classroom_database.json` từ repo.
- `server/supabase.ts` — Supabase phía server (bảng `users`, `user_classroom_data`, `audit_logs`, `system_settings`).
- `server/localSupabaseSim.ts` — giả lập Supabase khi dev (`data/database_local_supabase_sim/`, gitignored).
- `server/gitSync.ts` — **lúc khởi động server tự đặt git user và remote `origin`** (có thể nhúng token từ `systemSettings`), có hàm push/pull GitHub.
- Cổng: `PORT` (mặc định 3000); khi `LHHP_PACKAGED=true` (Electron) luôn là 3000.

**Google Drive dùng chung toàn trường** (`src/services/googleDriveService.ts` + `scripts/google_apps_script.js` V4.1):
- 1 Apps Script + 1 thư mục cho mọi tài khoản. Mã script là **một nguồn duy nhất** `scripts/google_apps_script.js` (app import bằng `?raw`, thay `__FOLDER_ID__`).
- Cấu hình chung: server `/api/drive/shared-config` (lưu `systemSettings.driveSharedConfigs`, Quản trị/BGH bấm Lưu là áp dụng) → biến build `VITE_DRIVE_SCRIPT_URL`/`VITE_DRIVE_FOLDER_ID` → cấu hình riêng máy (localStorage).
- GVCN lưu → `gvcn_{lop}.json`; script tự sinh `bc_gvcn_{lop}.json` (số liệu gọn theo ngày). BGH gọi `aggregateRange` (proxy `/api/drive/range`, hoặc gọi thẳng trên Vercel) → `DriveAttendanceStatsPanel` (Tổng quan + Báo cáo realtime): hôm nay / hôm qua / tuần / tháng, tự làm mới 30s.
- Quy ước tỷ lệ: chuyên cần = (present + late) / sĩ số lớp đã báo cáo; vắng = excused + sick + other + unexcused; bán trú = eating / số HS có bản ghi bán trú. Ngày dùng giờ địa phương (`toLocalDateKey`), không dùng `toISOString()`.
- Vòng 5 giây chỉ đẩy lại khi lần trước lỗi; thay đổi được đẩy ngay khi lưu (debounce 800ms).
- Quy trình báo cáo: GVCN chỉ sửa điểm danh/bán trú trong khung **hôm nay + 2 ngày trước** (`AttendanceView`: `isDateEditable`, setter bọc chặn); bấm Xác nhận → `googleDriveService.requestImmediatePush()` đẩy ngay. GVCN luôn gửi **lớp chủ nhiệm** (`metadata.teacherRole`). BGH chỉ tổng hợp tệp GVCN (`teacherRole !== 'subject'`); các view thống kê của BGH lọc lớp chủ nhiệm.
- Quản trị gửi "thông tin kết nối" (`buildConnectionShareText`), GVCN/BGH dán vào (`parseConnectionText`).

**CSDL nhà trường trên Drive (bản web, Apps Script V4)** — `src/services/schoolDriveDbService.ts`:
- `csdl_truong.json` trong thư mục dùng chung: trường + tài khoản, mật khẩu băm SHA-256 + salt **tại Apps Script**; tệp này không bao giờ trả ra ngoài (`getLatest`/`listFiles` chặn). Actions: `listSchools` (GET, công khai), `login`, `changePassword`, `getSchoolDb`, `saveSchoolDb` (POST, chỉ admin/school_admin, chế độ **gộp** + `deletedUsernames`).
- Khởi tạo từ 0: chỉ có `adminquantri` (mật khẩu mặc định trong `FALLBACK_USERS`, chỉ dùng được khi Drive chưa có CSDL) → Quản trị khai báo thư mục → `syncNow()` tạo CSDL (chỉ gửi mục "dirty" Quản trị vừa tạo/sửa; Drive là nguồn chuẩn). Không bắt buộc đổi mật khẩu; người dùng tự đổi qua `ChangePasswordModal` (nút ĐỔI MẬT KHẨU ở Sidebar). Mật khẩu hiện tại lưu trong Script Properties của Apps Script (không nằm trong thư mục Drive), chỉ trả về cho Quản trị qua `getSchoolDb`.
- `databaseService` được **bọc (adapter)** ở cuối tệp: createUser/createUsersBulk/updateUser/deleteUser/resetPassword/createSchool/provisionSchoolAdmin/updateSchool/deleteSchool chạy như cũ rồi `queueSync` lên Drive. Mật khẩu vừa cấp giữ ở sessionStorage máy Quản trị để xuất Excel.
- `databaseService.login`: Drive trước (khi đã cấu hình); chưa cấu hình → chỉ vai trò Quản trị. Đã bỏ mật khẩu cửa sau `123456`/mật khẩu chung.
- `AuthModal`: chưa cấu hình → khung dán "tin nhắn kết nối", khóa mọi vai trò trừ Quản trị; đã cấu hình → danh sách trường lấy từ Drive.
- Tệp `adminquantri.json`/`quantrinhatruong.json` trên Drive không còn chứa mật khẩu. GVCN/GVBM mới không được sinh học sinh mẫu khi đã cấu hình Drive; khôi phục lớp từ Drive khi đăng nhập máy mới.
- `src/main.tsx`: dò `/api` một lần; bản tĩnh (Vercel) trả 404 tại chỗ, không mở SSE.
- Thử nghiệm không cần Google: Apps Script giả lập chạy chính mã `scripts/google_apps_script.js` trong Node `vm` (Drive ảo trong bộ nhớ).

**Triển khai**: GitHub (kho `lhhp`), Vercel (`vercel.json`, web tĩnh + Supabase + Drive gọi trực tiếp, không có `/api`), Railway (`railway.json`: build `npm run build && npm run build:server`, chạy `node dist-server/server.js`, gắn Volume + `LHHP_DATA_DIR`). Chi tiết: `HUONG_DAN_TRIEN_KHAI.md`.

**Frontend** — React 19 + Tailwind v4 + Vite 8:
- `src/App.tsx`: không dùng router; view hiện tại là state `NavigationMenuId`, chuyển bằng switch `renderCurrentView()`. Danh sách id ở `src/components/layout/Sidebar.tsx`. Có guard theo vai trò (GVBM, admin vĩ mô).
- `src/context/ClassroomContext.tsx` (~4500 dòng): một Provider duy nhất giữ toàn bộ state (auth, lớp, học sinh, điểm, điểm danh, TKB, quiz...), auto-save debounce ~200ms, realtime (Supabase channel + SSE + BroadcastChannel), polling 12s.
- `src/services/databaseService.ts` (~3700 dòng): tầng dữ liệu. Thứ tự **đọc**: Express → Supabase → localStorage. Thứ tự **ghi**: localStorage → Express → Supabase → file theo vai trò → Google Drive. Trên host `vercel.app`/`github.io`/https bỏ qua Express. Dưới `file:` (Electron) dùng `http://127.0.0.1:3000`.
- Các service khác: `dataAdapter` (smart merge, file chuẩn), `dataStorageService` (file JSON theo vai trò, quét USB), `googleDriveService`, `licenseService` (CDKey), `multiTierBackupService`, `aiService`/`aiHierarchySynthesizer`.
- Kiểu dữ liệu: `src/types/index.ts` — `UserRole` (admin | homeroom | subject | bgh | school_admin | guest_admin), `LoginRoleScope`, `UserAccount` (tenantType school/guest/demo, schoolId), `Classroom`, `SchoolBranch`/`SchoolCampus`. `adminquantri` = siêu quản trị.

**Bản cài đặt gọn (khuyên dùng, 11/2026)** — `npm run package:win:lite` → `release-lite/LopHocHanhPhuc_Setup_<ver>.exe`. `desktop-lite/main.cjs` mở `dist/` qua giao thức `app://lhhp/` (không Express, không node_modules; `/api/*` trả 404 → chạy đúng luồng bản web/Vercel: Apps Script + Drive dùng chung, dữ liệu trình duyệt ở `%APPDATA%/LopHocHanhPhuc`). `scripts/build-desktop-lite.cjs` gom `desktop-lite/app/` (package.json không dependencies), `electron-builder.lite.json` dùng `electronDist` có sẵn (không tải lại Electron), chỉ giữ ngôn ngữ vi/en-US, `afterPack` bỏ `dxcompiler.dll`. appId/thư mục cài khác bản cũ để không gỡ nhầm dữ liệu bản cũ. Mẫu nền thư khen đã chuyển PNG → JPG (12,7 → 1,9 MB).

**Electron (bản cũ, có máy chủ)** — `electron/main.cjs` + `preload.cjs` (`window.electronAPI`): dùng lại server đang chạy ở cổng 3000, nếu không thì fork `server.js` đã bundle (prod) hoặc `tsx server.ts` (dev). Cấu hình đóng gói: `electron-builder.json` (NSIS x64, unpack `dist`, `dist-server`, `data`).

**Biến môi trường** (`.env`, không commit; mẫu ở `.env.example`): `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `LHHP_DATA_DIR`, `LHHP_INSTALLED_ROLE`, `LHHP_PACKAGED`, `DISABLE_HMR`.

## Quy tắc bất khả xâm phạm (kế thừa từ Antigravity)
1. **Không phá chức năng cũ**: không đổi tên/tham số/kiểu trả về của hàm public trong services, context, helpers đang được view dùng. Trường mới trong `types/index.ts` phải optional hoặc có giá trị mặc định.
2. **Fallback 3 lớp luôn hoạt động**: Supabase → Local JSON server → localStorage. App phải chạy khi offline hoặc thiếu API key; Supabase không được thành điểm hỏng duy nhất.
3. **Không viết lại UI** khi chỉ thay tầng lưu trữ; ưu tiên Adapter/Provider pattern. Tính năng mới nên có cờ bật/tắt.
4. **Bảo toàn dữ liệu tuyệt đối**: các file trong `data/` là dữ liệu thật của giáo viên và được git track. Không xóa/ghi đè/reset; đồng bộ dữ liệu phải dùng smart merge (theo id), không đẩy full snapshot từ tài khoản tổng hợp (xem `ERRORS.md`). Khi đồng bộ code lên GitHub chỉ nâng cấp code, không đè dữ liệu trên GitHub.
5. **Git**: không tự commit/push. Làm xong trên localhost → báo người dùng kiểm tra → chỉ push khi có lệnh rõ ràng. Kho duy nhất: `thanhliemcnttedu-cpu/lhhp`. **Cấm** đẩy lên `thanhliemcnttedu-cpu/lophochanhphuc`.
6. Kết thúc mỗi việc trên localhost, hỏi: *"Mọi nội dung đã được điều chỉnh xong trên localhost, hãy test kiểm tra. Bạn có muốn thực hiện đồng bộ lên web GitHub hay không?"*
7. Lỗi đáng chú ý và bài học: ghi vào `ERRORS.md` theo mẫu có sẵn.

## Lưu ý khi làm việc
- File rất lớn (`ClassesStudentsView.tsx` ~7500 dòng, `AccountManagementModal.tsx` ~5400, `ClassroomContext.tsx`, `databaseService.ts`): dùng Grep tìm đúng vị trí rồi đọc theo đoạn, sửa cục bộ.
- Vite watcher bỏ qua `data/**` và `**/*.json` để việc lưu DB không reload trang.
- Sản phẩm build (`dist/`, `dist-server/`, `server.js`, `release/`) không phải mã nguồn — không sửa tay.
- Ảnh avatar mẫu (`public/avatars/default|real_demo/boys|girls`) đã chuẩn hóa: vuông 1:1, 512×512, JPG. Thêm ảnh mới → chạy `python scripts/normalize_avatars.py public/avatars public/avatars avatar_check.png` (cắt theo khuôn mặt cho ảnh thật, giữ trọn nhân vật hoạt hình) rồi cập nhật danh sách tĩnh trong `src/utils/avatarConfig.ts`. Đường dẫn cũ `.jfif/.png` tự chuyển sang `.jpg` (`handleAvatarImgError`; `installGlobalAvatarFallback()` trong `main.tsx` bắt lỗi ảnh avatar toàn app).
- Cắt ảnh tập thể (`GroupPhotoAvatarModal`): nút "Tự dò khuôn mặt" dùng `src/utils/groupFaceDetector.ts` (MediaPipe FaceDetector tải từ CDN jsdelivr/googleapis khi bấm; dò theo mảnh vuông nhiều cỡ vì BlazeFace chỉ thấy mặt ≥ ~1/4 khung). "Gán nhanh" = bấm mặt → gán cho HS chưa có ảnh kế tiếp theo STT; "Tự lưu" = gọi `onSave` ngay mỗi lần gán. Ảnh xuất 320×320 JPEG ~15–20KB. Mất mạng → vẫn khoanh tay được.
- Bundle: các view (trừ Dashboard) và `AccountManagementModal` được `React.lazy` trong `App.tsx` → gói khởi động ~1.2MB, mỗi màn tải khi mở.
- **Giao diện chỉ dùng tông sáng** (người dùng yêu cầu, 11/2026): không dùng nền `bg-slate/gray-700…950`, gradient xanh đen hay canvas nền tối. Lớp phủ hộp thoại dùng `bg-sky-900/20 backdrop-blur-xs`. Hiệu ứng nút chung (nổi + viền LED + phóng icon/chữ khi rê chuột) nằm trong `src/index.css` (`@layer base button`, `.btn-3d*` có `--btn-3d-glow`); thêm lớp `no-hover-fx` để tắt cho nút cụ thể.
- **Tương phản chữ/nền** (≥ 3:1, ưu tiên 4.5:1): chữ trắng chỉ đặt trên nền màu mức 600 trở lên (vàng/cam/xanh ngọc/xanh lá: 600–700); trên nền trắng, chữ màu dùng mức 600–700, không dùng `-300/-400`. `--color-slate-400` đã được làm đậm trong `@theme`; `animate-pulse` chỉ mờ còn 85%. Nút `btn-3d-amber` dùng chữ nâu đậm trên nền vàng.
- **Liên hệ Zalo tác giả**: `ZaloQrModal` (gắn trong `App.tsx`) tự chặn mọi liên kết `zalo.me/<số tác giả>` và hiện ảnh `public/zalo_qr.png`; mở thủ công bằng `window.dispatchEvent(new Event(OPEN_ZALO_QR_EVENT))`. Liên kết Zalo phụ huynh không bị chặn.
- **Phân quyền dữ liệu lớp/học sinh** (`ClassroomContext`): `adminquantri` (isSuperAdmin) **toàn quyền** (không bị `isRestrictedAdminOrBghUser`). Quản trị nhà trường & BGH (`isSchoolAdminOrBgh`) chỉ: thêm/nhập lớp (`addClass`, `bulkAddClasses`), khai báo phân hiệu – điểm trường, gán phân hiệu (`updateClass`/`bulkUpdateClasses` chỉ giữ `branch`/`campus`); bị chặn mọi thay đổi học sinh (`updateStudent`, thêm/xóa, ảnh, chức vụ, xu), điểm danh, xóa lớp. Nút tương ứng ẩn bằng `{...(isSchoolAdminOrBgh ? { style: { display: 'none' } } : {})}` trong `ClassesStudentsView`.
- **Điều chỉnh của Quản trị trên bản web (Drive)** — `src/services/adminEditsService.ts`: `updateAdminClass`/`updateAdminStudent` ghi phần thay đổi (diff; thêm mới/chuyển lớp thì đủ dữ liệu) vào tệp `dieuchinh_quantri.json` (không ghi đè `gvcn_*`). Màn tổng hợp áp điều chỉnh chưa được GVCN nhận; máy GVCN nhận mỗi 60s (effect trong context) → tự lưu → `metadata.appliedAdminEdits` (lưu ở `adminEditsStore.ts`). Chỉ chạy khi không có máy chủ Express (`__lhhpApiAvailable !== true`). Không cần sửa Apps Script.
- Nút **"Cập nhật dữ liệu"** (TopBar, chỉ Quản trị tối cao / Quản trị trường / BGH): `invalidateDriveClassFilesCache()` + `adminEditsService.invalidateCache()` → `syncDatabaseNow()` → phát `FORCE_DATA_REFRESH_EVENT` (`DriveAttendanceStatsPanel` tải lại). Không bấm thì dữ liệu tự làm mới trong ~1 phút.
- **Tệp trong thư mục Drive dùng chung** (bản web): `csdl_truong.json` (CSDL trường + tài khoản, mật khẩu băm, Apps Script khóa) · `gvcn_<lớp>.json` (dữ liệu đầy đủ của lớp, do máy GVCN ghi) · `bc_gvcn_<lớp>.json` (báo cáo rút gọn, Apps Script tự sinh) · `dieuchinh_quantri.json` (điều chỉnh của Quản trị/BGH; tự dọn mục GVCN đã nhận, tối đa 5 phút/lần) · `phanhieu_truong.json` (danh mục phân hiệu – điểm trường, `schoolBranchesDrive`) · `adminquantri.json` / `quantrinhatruong.json` / `bgh.json` (CHỈ cấu hình riêng của tài khoản: `pushClassData` xóa lớp/học sinh/điểm danh khỏi bản đẩy, `scope: management_settings_only`). Đã bỏ tệp kiểu cũ `csdl_truong_<mã>.json` (không còn sinh; tệp cũ xóa được).
- **Thiết kế (đánh giá 11/2026, `.impeccable/critique/`)**: chữ tối thiểu 12px (`--text-xs: max(12px,0.75rem)`, `--text-sm: max(14px,…)`, không dùng `text-[<12px]` trừ mẫu in Certificate/Infographic); chữ trắng trên nền màu mức 700 (vàng/cam/ngọc/lá) hoặc 600 (xanh/tím/hồng) — tương phản 4.5:1. **LED/nổi/phóng chữ chỉ cho nút chính** `.btn-3d` màu đặc (mỗi màn 1 nút); nút phụ dùng `btn-3d-light` hoặc nút thường (rê chuột chỉ đổi màu). `hover-zoom-*` không phóng to. Điểm danh/bán trú: nút xác nhận ở thanh `sticky` đáy danh sách; không hiện tỷ lệ khi chưa có buổi/học sinh ("—").
- **Bảo vệ dữ liệu GVCN**: đăng nhập luôn gộp lớp từ Drive (`mergeDriveClassForTeacher`); `pushClassData` không đẩy lớp 0 học sinh đè tệp Drive đang có học sinh.
- **Trò chơi gọi tên**: mọi màn chúc mừng học sinh được gọi dùng chung `src/components/views/picker/CalledStudentModal.tsx` (mẫu Ống kính: khung polaroid, nút +2/+3/+5 xu, nút phụ tùy chọn). Ống kính không chọn trước: vòng cam nhảy ngẫu nhiên, chỉ bốc người trúng ở pha khóa (`LOCK_PROGRESS`). Chế độ câu hỏi của Cuộn phim/Tàu vũ trụ/Hộp quà vẫn giữ thẻ câu hỏi dưới khu chơi.
- **Thư khen** (`CertificateView`): bố cục do `src/utils/certificateLayout.ts` tính theo ảnh nền (lưới vùng bận 128 cột → vùng trống lớn nhất, chân trang đặt vào chỗ trống thấp nhất hai bên, màu lấy từ ảnh nền và chỉnh đủ tương phản; khung cao 1080, rộng theo tỉ lệ ảnh nền). Xuất ảnh/hàng loạt vẽ bằng canvas (`certificateRenderer.ts`) để giữ phông Google — html-to-image không nhúng được phông khác nguồn (nhúng tay thì treo); html-to-image chỉ còn là dự phòng. Hàng loạt: 1 tệp ZIP (JPG) hoặc PDF, giữ nguyên vị trí, tên dài tự thu nhỏ (`maxFontSize`).
- **Xuất ảnh/PDF bằng html-to-image**: thẻ `<link>` phông Google trong `index.html` PHẢI có `crossorigin="anonymous"` — thiếu thì thư viện không đọc được CSS phông, ảnh/PDF rơi về phông khác rộng hơn → chữ xuống dòng, chồng nhau (lỗi PDF Infographic 11/2026). Khi thử trong khung trình duyệt bị ẩn, `requestAnimationFrame` không chạy nên html-to-image treo (không phải lỗi thật).
- **Thời khóa biểu**: 5 mẫu hiện đại dùng chung `schedule/ModernTimetableTemplates.tsx` (Màu theo môn, Sang trọng Navy, Trang nhã Pastel, Tối giản, Thẻ theo ngày) — màu/biểu tượng môn từ `PRIMARY_SUBJECT_PRESETS`, ô trống không in chữ. **Infographic**: khối TKB lấy số tiết từ `timetableConfig` và giờ từ `lop_hoc_tkb_settings_<lớp>`; bảng "Dữ liệu tự động" báo mục còn thiếu; hộp "Thông tin lớp" lưu Ban phụ huynh/khẩu hiệu vào lớp (`updateClass`), SĐT GVCN ở localStorage.
- **CDKEY / bản dùng thử** (`licenseService.ts`): chưa kích hoạt → tối đa 01 lớp, 10 học sinh/lớp, kiểm tra ở MỌI đường thêm (`addStudent`, `bulkAddStudents` – nhập Excel, `addClass`, `bulkAddClasses`, `initSubjectClasses`) và nút ở `ClassesStudentsView` (`isDemoAccount = !isCdKeyActivated`). Mã CDKEY KHÔNG được ghi dạng chữ ở bất kỳ đâu (mã nguồn, chú thích giao diện, tài liệu): chỉ lưu mã băm `VALID_KEY_HASHES`; bản ghi kích hoạt có chữ ký (`h` + `sig`), sửa tay localStorage không mở khóa. Đổi/thêm mã: tính `cyrb53('LHHP|' + mã viết hoa bỏ ký tự khác chữ/số)` rồi thêm vào `VALID_KEY_HASHES`.
- **Chấm công giáo viên – nhân viên** (11/2026, Apps Script **V4.2** — trường phải dán lại mã & triển khai *phiên bản mới*, giữ URL): `nhansu_truong.json` (CCCD băm với "muối" trong Script Properties `staff_pepper` + 4 số cuối; mật khẩu điểm danh băm + salt, bản xem cho Quản trị ở Script Properties `spin:<mã>`) và `chamcong_nhansu_YYYY-MM.json`; cả hai thuộc `isProtectedFile` (không getLatest/listFiles/ghi trực tiếp). Actions POST: `staffAuth`, `staffCheckIn` (ngày = giờ máy chủ GMT+7, từ chối ngày khác), `getStaffRoster`, `saveStaffRoster` (chỉ admin/school_admin, gộp theo mã GV), `staffAttendanceRange` (admin/BGH). Client: `staffAttendanceService.ts` (nhập Excel CSDL ngành Bộ GD&ĐT: cột "Mã định danh", "Họ tên", "Số CMTND/TCC", "Vị trí việc làm", "Nhóm chức vụ", "Môn dạy", "Trạng thái CB" — chỉ đưa lên Drive các trường cần thiết), trang `/diemdanh#c=<kết nối>` (`staff/StaffCheckInPage`, render riêng trong `main.tsx`), màn `staff_attendance` (`staff/StaffAttendanceView`: Tổng hợp/biểu đồ SVG/Excel 4 trang, Danh sách nhân sự, Link điểm danh). Mỗi lần điểm danh trong ngày lưu vào `history` (bản ghi có `attempt`); trang điểm danh hiện cảnh báo "đã điểm danh lần N lúc…" và chỉ mở phiếu khi bấm "Sửa điểm danh"; báo cáo/Excel ghi "Thực hiện điểm danh lại lần N" (tiện ích `attemptOf`/`systemNoteOf`/`timeSpoken`). Mã QR điểm danh (`staff/StaffCheckInQr.tsx`, thư viện `qrcode-generator` tạo offline, không gửi link ra dịch vụ ngoài): ở thẻ "Link điểm danh" và nút "MÃ QR" trên màn đăng nhập; tải ảnh QR gửi Zalo, tải/in poster A4 (vẽ canvas). Màn đăng nhập có nút "Điểm danh giáo viên – nhân viên" (`/diemdanh`, dùng kết nối Drive sẵn có của máy). Xác thực BGH/Quản trị lưu ở sessionStorage `lhhp_staff_viewer_auth` khi đăng nhập Drive (mất khi đóng trình duyệt → màn hình hỏi lại mật khẩu).
- Thanh trên cùng: tiện ích dạng chip (`chipBase` trong `TopBar.tsx`), màn hình < lg gom vào menu ⋯; thanh bên có lưới "Tiện ích" 6 ô. Không đặt `display` cho `.btn-3d > span` trong CSS (sẽ đè lớp `hidden` của Tailwind).
