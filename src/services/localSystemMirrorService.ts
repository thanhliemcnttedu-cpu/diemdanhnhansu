/**
 * 💾 LƯU TOÀN BỘ HỆ THỐNG VÀO THƯ MỤC TRÊN MÁY TÍNH (bản web, tài khoản Quản trị) — 11/2026.
 *
 * Thư mục máy do người dùng chọn (dataStorageService, File System Access API) vốn chỉ có 1 tệp của tài khoản
 * đang đăng nhập. Dịch vụ này ghi thêm 2 thư mục con để người quản trị nhìn là hiểu:
 *   1_TOAN_BO_HE_THONG_1_TEP/toan_bo_he_thong.json
 *       → MỘT tệp duy nhất chứa toàn bộ: CSDL trường, tài khoản, các tệp lớp (lớp – học sinh – điểm danh),
 *         nhân sự, chấm công, kê khai tiết dạy. Đúng định dạng `lhhp_drive_backup` nên nạp lại được bằng
 *         nút "Chọn file .json để khôi phục".
 *   2_CAC_TEP_NHU_TREN_GOOGLE_DRIVE/
 *       → từng tệp riêng, cùng tên như trên thư mục Google Drive dùng chung.
 * Chỉ ghi / ghi đè các tệp do chính dịch vụ này tạo; không xóa tệp nào trong thư mục của người dùng.
 * ⚠️ Các tệp chứa mật khẩu và số CCCD (giống tệp sao lưu toàn hệ thống) → chỉ lưu trên máy của quản trị.
 */
import { driveBackupService, type DriveBackup } from './driveBackupService';
import { dataStorageService } from './dataStorageService';

export const SYSTEM_ONE_FILE_DIR = '1_TOAN_BO_HE_THONG_1_TEP';
export const SYSTEM_ONE_FILE_NAME = 'toan_bo_he_thong.json';
export const SYSTEM_MIRROR_DIR = '2_CAC_TEP_NHU_TREN_GOOGLE_DRIVE';
const LAST_KEY = 'lhhp_local_system_mirror_last';

export interface LocalMirrorSummary {
  savedAt: string;
  folderName: string;
  oneFileKb: number;
  mirrorFiles: number;
  schools: number;
  users: number;
  classFiles: number;
  staff: number;
  attendanceDays: number;
  teachingMonths: number;
  notes: string[];
}
export interface LocalMirrorResult { success: boolean; message: string; code?: string; summary?: LocalMirrorSummary }

export const localSystemMirrorService = {
  /** Kết quả lần lưu gần nhất trên máy này (để hiện lại sau khi tải lại trang) */
  getLast(): LocalMirrorSummary | null {
    try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (_) { return null; }
  },

  /** Phải gọi từ thao tác bấm nút (trình duyệt có thể hỏi lại quyền ghi thư mục). */
  async run(onProgress: (text: string) => void = () => {}): Promise<LocalMirrorResult> {
    // 1) Quyền ghi thư mục: hỏi NGAY khi còn trong thao tác bấm nút, trước khi tải dữ liệu (mất vài chục giây)
    const perm = await dataStorageService.ensureLocalWritePermission();
    if (!perm.ok) return { success: false, code: perm.code, message: perm.message };

    // 2) Đọc toàn bộ hệ thống từ Google Drive (cùng cơ chế với nút "Tải về tệp database")
    let backup: DriveBackup;
    try { backup = await driveBackupService.exportAll(onProgress); }
    catch (err: any) { return { success: false, code: 'EXPORT_ERROR', message: err?.message || 'Không đọc được dữ liệu từ Google Drive.' }; }

    // 3) Kê khai tiết dạy đã nằm sẵn trong bản sao lưu (driveBackupService.exportAll)
    const teaching: any = backup.teaching || null;

    // 4) Danh sách tệp cần ghi
    const one = backup;
    const entries: Array<{ dir: string; name: string; data?: any; text?: string }> = [
      { dir: SYSTEM_ONE_FILE_DIR, name: SYSTEM_ONE_FILE_NAME, data: one },
      { dir: SYSTEM_MIRROR_DIR, name: 'csdl_truong.json', data: backup.schoolDb },
    ];
    Object.keys(backup.files || {}).sort().forEach(name => entries.push({ dir: SYSTEM_MIRROR_DIR, name, data: backup.files[name] }));
    if (backup.staff && backup.staff.length) entries.push({ dir: SYSTEM_MIRROR_DIR, name: 'nhansu_truong.json', data: { staff: backup.staff } });
    const days = backup.staffAttendance?.days || {};
    const byMonth: Record<string, Record<string, any>> = {};
    Object.keys(days).forEach(d => { const m = d.slice(0, 7); (byMonth[m] = byMonth[m] || {})[d] = days[d]; });
    Object.keys(byMonth).sort().forEach(m => entries.push({ dir: SYSTEM_MIRROR_DIR, name: `chamcong_nhansu_${m}.json`, data: { month: m, days: byMonth[m] } }));
    if (teaching) entries.push({ dir: SYSTEM_MIRROR_DIR, name: 'kekhai_tietday.json', data: teaching });

    const sm = driveBackupService.summarize(backup);
    const savedAt = new Date().toLocaleString('vi-VN');
    entries.push({
      dir: '', name: 'DOC_TRUOC.txt', text: [
        'LỚP HỌC HẠNH PHÚC — DỮ LIỆU TOÀN HỆ THỐNG LƯU TRÊN MÁY TÍNH',
        `Lưu lúc: ${savedAt} • Trường: ${sm.schoolNames.join(', ') || '(chưa đặt tên)'}`,
        '',
        `1) ${SYSTEM_ONE_FILE_DIR}\\${SYSTEM_ONE_FILE_NAME}`,
        '   MỘT tệp duy nhất chứa toàn bộ: cơ sở dữ liệu trường, tài khoản giáo viên, lớp học, học sinh,',
        '   điểm danh học sinh, nhân sự, chấm công giáo viên – nhân viên, kê khai tiết dạy.',
        '   Dùng để khôi phục: phần mềm → Dữ liệu → Sao lưu & khôi phục → "Chọn file .json để khôi phục".',
        '',
        `2) ${SYSTEM_MIRROR_DIR}`,
        '   Từng tệp riêng, cùng tên như trong thư mục Google Drive dùng chung của trường',
        '   (csdl_truong.json, gvcn_<lớp>.json, gvbm_<giáo viên>.json, nhansu_truong.json, chamcong_nhansu_<tháng>.json, kekhai_tietday.json…).',
        '   Tệp báo cáo bc_gvcn_* không lưu vì Google Drive tự sinh lại.',
        '',
        'Tệp <tài khoản>.json ở ngay thư mục này là dữ liệu riêng của tài khoản đang đăng nhập, phần mềm tự ghi mỗi khi có thay đổi.',
        'Hai thư mục trên KHÔNG tự cập nhật: mỗi lần muốn có bản mới, bấm lại nút "Lưu toàn bộ hệ thống vào thư mục này".',
        '',
        'CẢNH BÁO: các tệp có mật khẩu tài khoản và số CCCD. Chỉ lưu trên máy của quản trị, không gửi cho người khác.',
        `Số liệu lần lưu này: ${sm.schools} trường, ${sm.users} tài khoản, ${sm.classFiles} tệp lớp, ${sm.staff} nhân sự, ${sm.attendanceDays} ngày chấm công.`,
        ...(backup.notes.length ? ['', 'Ghi chú:', ...backup.notes.map(n => ` - ${n}`)] : []),
      ].join('\r\n'),
    });

    // 5) Ghi vào thư mục máy
    onProgress(`Đang ghi ${entries.length} tệp vào thư mục máy tính…`);
    const w = await dataStorageService.writeFilesToLocalFolder(entries, (i, n) => onProgress(`Đang ghi tệp ${i}/${n} vào thư mục máy tính…`));
    if (!w.success) return { success: false, code: w.code, message: w.message };

    const summary: LocalMirrorSummary = {
      savedAt, folderName: w.folderName || '', oneFileKb: w.sizes?.[`${SYSTEM_ONE_FILE_DIR}/${SYSTEM_ONE_FILE_NAME}`] || 0,
      mirrorFiles: entries.filter(e => e.dir === SYSTEM_MIRROR_DIR).length,
      schools: sm.schools, users: sm.users, classFiles: sm.classFiles, staff: sm.staff, attendanceDays: sm.attendanceDays,
      teachingMonths: teaching ? Object.keys(teaching.logs || {}).length : 0, notes: backup.notes,
    };
    try { localStorage.setItem(LAST_KEY, JSON.stringify(summary)); } catch (_) { /* ignore */ }
    return { success: true, message: `Đã lưu toàn bộ hệ thống vào thư mục "${summary.folderName}".`, summary };
  },
};
