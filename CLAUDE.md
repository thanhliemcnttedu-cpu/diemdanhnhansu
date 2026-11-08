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

**Electron** — `electron/main.cjs` + `preload.cjs` (`window.electronAPI`): dùng lại server đang chạy ở cổng 3000, nếu không thì fork `server.js` đã bundle (prod) hoặc `tsx server.ts` (dev). Cấu hình đóng gói: `electron-builder.json` (NSIS x64, unpack `dist`, `dist-server`, `data`).

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
- Thanh trên cùng: tiện ích dạng chip (`chipBase` trong `TopBar.tsx`), màn hình < lg gom vào menu ⋯; thanh bên có lưới "Tiện ích" 6 ô. Không đặt `display` cho `.btn-3d > span` trong CSS (sẽ đè lớp `hidden` của Tailwind).
