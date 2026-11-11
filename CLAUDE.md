# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Lớp Học Hạnh Phúc (CSDL LHHP)

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

**Bản web (Vercel) = Google Drive dùng chung + Apps Script** (`scripts/google_apps_script.js`, một nguồn duy nhất, app import bằng `?raw`): 1 thư mục + 1 Apps Script cho cả trường. `csdl_truong.json` = trường + tài khoản (mật khẩu băm tại Apps Script); `gvcn_<lớp>.json` = dữ liệu lớp do máy GVCN ghi; `bc_gvcn_*` = báo cáo rút gọn cho BGH. Đồng bộ luôn GỘP theo id (smart merge), không đẩy đè cả bản. Chi tiết: [docs/claude/drive-va-csdl-truong.md](docs/claude/drive-va-csdl-truong.md).

**Triển khai**: GitHub (kho `lhhp`), Vercel (`vercel.json`, web tĩnh + Supabase + Drive gọi trực tiếp, không có `/api`), Railway (`railway.json`: build `npm run build && npm run build:server`, chạy `node dist-server/server.js`, gắn Volume + `LHHP_DATA_DIR`). Chi tiết: `HUONG_DAN_TRIEN_KHAI.md`.

**Frontend** — React 19 + Tailwind v4 + Vite 8:
- `src/App.tsx`: không dùng router; view hiện tại là state `NavigationMenuId`, chuyển bằng switch `renderCurrentView()`. Danh sách id ở `src/components/layout/Sidebar.tsx`. Có guard theo vai trò (GVBM, admin vĩ mô).
- `src/context/ClassroomContext.tsx` (~4500 dòng): một Provider duy nhất giữ toàn bộ state (auth, lớp, học sinh, điểm, điểm danh, TKB, quiz...), auto-save debounce ~200ms, realtime (Supabase channel + SSE + BroadcastChannel), polling 12s.
- `src/services/databaseService.ts` (~3700 dòng): tầng dữ liệu. Thứ tự **đọc**: Express → Supabase → localStorage. Thứ tự **ghi**: localStorage → Express → Supabase → file theo vai trò → Google Drive. Trên host `vercel.app`/`github.io`/https bỏ qua Express. Dưới `file:` (Electron) dùng `http://127.0.0.1:3000`.
- Các service khác: `dataAdapter` (smart merge, file chuẩn), `dataStorageService` (file JSON theo vai trò, quét USB), `googleDriveService`, `licenseService` (CDKey), `multiTierBackupService`, `aiService`/`aiHierarchySynthesizer`.
- Kiểu dữ liệu: `src/types/index.ts` — `UserRole` (admin | homeroom | subject | bgh | school_admin | guest_admin), `LoginRoleScope`, `UserAccount` (tenantType school/guest/demo, schoolId), `Classroom`, `SchoolBranch`/`SchoolCampus`. `adminquantri` = siêu quản trị.

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
- Bundle: các view (trừ Dashboard) và `AccountManagementModal` được `React.lazy` trong `App.tsx` → gói khởi động ~1.2MB, mỗi màn tải khi mở.
- **Phông chữ: toàn bộ giao diện dùng Be Vietnam Pro** (người dùng yêu cầu 11/2026). `index.html` nạp đủ độ đậm 300–900 + nghiêng; `--font-mono` trong `@theme` cũng là Be Vietnam Pro (chữ số `tabular-nums`) — không dùng phông máy đánh chữ. Không thêm phông khác cho giao diện (kể cả chữ vẽ trên canvas). Ngoại lệ có chủ đích: phông nghệ thuật của Thư khen và tiêu đề có chân của 2 mẫu TKB "Sang trọng Navy", "Trang nhã Pastel".
- **Giao diện chỉ dùng tông sáng** (người dùng yêu cầu, 11/2026): không dùng nền `bg-slate/gray-700…950`, gradient xanh đen hay canvas nền tối. Lớp phủ hộp thoại dùng `bg-sky-900/20 backdrop-blur-xs`. Hiệu ứng nút chung (nổi + viền LED + phóng icon/chữ khi rê chuột) nằm trong `src/index.css` (`@layer base button`, `.btn-3d*` có `--btn-3d-glow`); thêm lớp `no-hover-fx` để tắt cho nút cụ thể.
- **Tương phản chữ/nền** (≥ 3:1, ưu tiên 4.5:1): chữ trắng chỉ đặt trên nền màu mức 600 trở lên (vàng/cam/xanh ngọc/xanh lá: 600–700); trên nền trắng, chữ màu dùng mức 600–700, không dùng `-300/-400`. `--color-slate-400` đã được làm đậm trong `@theme`; `animate-pulse` chỉ mờ còn 85%. Nút `btn-3d-amber` dùng chữ nâu đậm trên nền vàng.
- **Emoji**: KHÔNG dùng emoji Unicode 13+ (vd. 🪙 đồng xu, 🪵 khúc gỗ, dải U+1FA83–U+1FAFF, 🥲…) — phông emoji Windows 10 không có, hiện thành ô vuông. Đồng xu dùng `components/common/CoinIcon.tsx` (SVG, cao 1em); trong chuỗi (thông báo) dùng 💰. Kiểm tra nhanh: quét mã tìm ký tự U+1FA70–U+1FAFF.
- **Phân quyền dữ liệu lớp/học sinh** (`ClassroomContext`): `adminquantri` (isSuperAdmin) **toàn quyền** (không bị `isRestrictedAdminOrBghUser`). Quản trị nhà trường & BGH (`isSchoolAdminOrBgh`) chỉ: thêm/nhập lớp (`addClass`, `bulkAddClasses`), khai báo phân hiệu – điểm trường, gán phân hiệu (`updateClass`/`bulkUpdateClasses` chỉ giữ `branch`/`campus`); bị chặn mọi thay đổi học sinh (`updateStudent`, thêm/xóa, ảnh, chức vụ, xu), điểm danh, xóa lớp. Nút tương ứng ẩn bằng `{...(isSchoolAdminOrBgh ? { style: { display: 'none' } } : {})}` trong `ClassesStudentsView`.
- **Không đặt `z-index` cho khung nội dung** trong `App.tsx` (div bọc TopBar + main): hộp thoại `fixed z-50` trong các màn sẽ bị thanh bên (`z-40`) đè.

## Tài liệu chi tiết theo phần (đọc khi làm việc với phần đó)
- [docs/claude/drive-va-csdl-truong.md](docs/claude/drive-va-csdl-truong.md) — Drive dùng chung, Apps Script, CSDL trường & tài khoản, đăng nhập & làm sạch kết nối, chu kỳ cập nhật, sao lưu / khôi phục, chế độ chỉ xem, CDKEY / bản quyền, trình cài đặt & quy tắc phiên bản Apps Script.
- [docs/claude/kho-cau-hoi.md](docs/claude/kho-cau-hoi.md) — kho câu hỏi cá nhân, nơi lưu, két cá nhân, trình soạn câu hỏi, chơi thử, trò chơi gọi tên.
- [docs/claude/cham-cong.md](docs/claude/cham-cong.md) — chấm công nhân sự, tài khoản dùng chung chấm công, kê khai tiết dạy, các phiên bản Apps Script V4.2 → 1.1.x.
- [docs/claude/giao-dien.md](docs/claude/giao-dien.md) — khung giao diện, logo, ảnh avatar, mẫu bảng danh sách, tự co chữ, nền đăng nhập.
- [docs/claude/tinh-nang-khac.md](docs/claude/tinh-nang-khac.md) — bản cài đặt Desktop, nhập Excel học sinh, thư khen, xuất ảnh/PDF, thời khóa biểu.
- `ERRORS.md` — lỗi đã gặp và bài học.
