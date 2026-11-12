/**
 * 🔐 KHÔI PHỤC MẬT KHẨU QUA EMAIL (Apps Script 1.1.9 trở lên) — 11/2026.
 *
 * - Mỗi tài khoản tự khai báo EMAIL KHÔI PHỤC (lưu trong CSDL trường). Quên mật khẩu → ở màn đăng nhập bấm
 *   "Quên mật khẩu" → Apps Script của trường gửi MÃ 6 SỐ (hiệu lực 15 phút) tới email đó → nhập mã + mật khẩu mới.
 * - Thư do chính tài khoản Google của trường (chủ Apps Script) gửi bằng MailApp — không qua dịch vụ ngoài.
 * - Không có SMS: gửi tin nhắn OTP cần dịch vụ trả phí của bên thứ ba.
 *
 * ⚠️ Apps Script cũ không biết lệnh lạ sẽ ghi cả gói gửi lên (có mật khẩu) thành tệp dữ liệu → MỌI lệnh ở đây
 * đều kiểm tra phiên bản bằng `ping` trước, bản cũ thì không gửi.
 */
import { googleDriveService } from './googleDriveService';
import { schoolDriveDbService } from './schoolDriveDbService';
import { compareVersions } from './appsScriptSetupService';

export const PASSWORD_RECOVERY_MIN_VERSION = '1.1.9';
export interface RecoveryResult { success: boolean; message: string; code?: string; maskedEmail?: string; minutes?: number; recoveryEmail?: string }

async function ready(): Promise<RecoveryResult | null> {
  if (!schoolDriveDbService.isConfigured()) {
    return { success: false, code: 'NOT_CONFIGURED', message: 'Máy này chưa kết nối thư mục Google Drive của trường. Hãy dán 2 link kết nối (hoặc nạp tệp kết nối) trước.' };
  }
  const url = googleDriveService.normalizeScriptUrl(googleDriveService.getConfig().scriptUrl);
  let ver = '';
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=ping`);
    ver = String((await res.json())?.version || '');
  } catch (_) {
    return { success: false, code: 'UNREACHABLE', message: 'Không kết nối được Apps Script của trường. Kiểm tra mạng và link kết nối rồi thử lại.' };
  }
  if (!ver || compareVersions(ver, PASSWORD_RECOVERY_MIN_VERSION) < 0) {
    return {
      success: false, code: 'OLD_SCRIPT',
      message: `Apps Script của trường đang là ${ver ? `phiên bản ${ver}` : 'bản cũ'} — chức năng khôi phục mật khẩu qua email cần phiên bản ${PASSWORD_RECOVERY_MIN_VERSION}. Quản trị cập nhật Apps Script (Dữ liệu → Google Drive của trường & Apps Script) rồi thử lại.`,
    };
  }
  return null;
}

async function call(body: Record<string, unknown>, fallback: string): Promise<RecoveryResult> {
  const blocked = await ready();
  if (blocked) return blocked;
  try {
    const d = await schoolDriveDbService.callScript(body, 60000);
    // an toàn thêm một lớp: câu trả lời phải đúng dạng của lệnh khôi phục
    if (!d || typeof d.success !== 'boolean') return { success: false, message: fallback };
    // Apps Script chưa được cấp quyền gửi thư: Google không tự hỏi quyền khi chỉ triển khai lại → hướng dẫn từng bước
    if (d.success === false && d.code === 'MAIL_ERROR') {
      const needAuth = /send_mail|authoriz|permission|quyền/i.test(String(d.message || ''));
      return {
        success: false, code: needAuth ? 'MAIL_NOT_AUTHORIZED' : 'MAIL_ERROR',
        message: needAuth
          ? [
            'Apps Script của trường chưa được cấp quyền gửi email. Người giữ tài khoản Google của trường làm 1 lần:',
            '1. Cập nhật Apps Script lên phiên bản 1.1.10 (Dữ liệu → Google Drive của trường & Apps Script → Cài đặt / cập nhật Apps Script).',
            '2. Trong trình soạn mã Apps Script, ở ô chọn hàm chọn "capQuyenGuiThu" rồi bấm Chạy.',
            '3. Hộp "Cần được cấp quyền" → Xem lại quyền → chọn tài khoản Google của trường → Nâng cao → Đi tới dự án (không an toàn) → tích CHỌN TẤT CẢ các quyền → Cho phép.',
            '4. Nhật ký thực thi ghi "ĐÃ CÓ QUYỀN GỬI EMAIL" là xong. Quay lại đây bấm "Gửi mã về email khôi phục".',
            'Lưu ý: chỉ triển khai lại hoặc chạy hàm khác thì Google không hỏi quyền gửi email.',
          ].join('\n')
          : `Không gửi được email: ${String(d.message || '').slice(0, 200)}`,
      };
    }
    return { success: d.success, message: d.message || (d.success ? 'Đã xong.' : fallback), code: d.code, maskedEmail: d.maskedEmail, minutes: d.minutes, recoveryEmail: d.recoveryEmail };
  } catch (e: any) {
    return { success: false, message: e?.message === 'NOT_CONFIGURED' ? 'Máy này chưa kết nối Google Drive của trường.' : (e?.message || fallback) };
  }
}

export const passwordRecoveryService = {
  /** Người dùng đã đăng nhập khai báo / đổi / xóa (email rỗng) email khôi phục; phải nhập đúng mật khẩu hiện tại */
  setEmail(username: string, password: string, email: string) {
    return call({ action: 'setRecoveryEmail', auth: { username: username.trim().toLowerCase(), password }, email: email.trim() }, 'Không lưu được email khôi phục.');
  },
  /** Màn đăng nhập: gửi mã 6 số tới email khôi phục của tài khoản */
  request(username: string) {
    return call({ action: 'requestPasswordReset', username: username.trim().toLowerCase() }, 'Không gửi được mã khôi phục.');
  },
  /** Nhập mã + mật khẩu mới */
  confirm(username: string, code: string, newPassword: string) {
    return call({ action: 'confirmPasswordReset', username: username.trim().toLowerCase(), code: code.trim(), newPassword }, 'Không đặt lại được mật khẩu.');
  },
};
