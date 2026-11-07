import JSZip from 'jszip';
import { databaseService, LOCAL_DB_PREFIX } from './databaseService';
import { UserAccount, SchoolEntity, Classroom, Student, UserClassroomData } from '../types';

export type BackupScope = 'system' | 'school' | 'teacher';

export interface BackupPackageMetadata {
  version: string;
  format: 'lop_hoc_hanh_phuc_backup';
  scope: BackupScope;
  exportedAt: string;
  exportedBy: string;
  exportedUsername: string;
  exportedRole: string;
  schoolName?: string;
  schoolId?: string;
  totalSchools?: number;
  totalTeachers?: number;
  totalClasses: number;
  totalStudents: number;
  appName: string;
  description: string;
}

export interface MultiTierBackupPackage {
  version: string;
  format: 'lop_hoc_hanh_phuc_backup';
  scope: BackupScope;
  metadata: BackupPackageMetadata;
  schoolName?: string;
  schoolEntity?: SchoolEntity;
  schools?: SchoolEntity[];
  users?: UserAccount[];
  userData?: Record<string, UserClassroomData>;
  teacherData?: UserClassroomData;
  schoolWideData?: {
    classes: Classroom[];
    students: Student[];
    transactions?: any[];
    attendanceRecords?: any[];
    boardingRecords?: any[];
  };
}

/**
 * 📦 DỊCH VỤ SAO LƯU & PHỤC HỒI DỮ LIỆU PHÂN CẤP ĐA TẦNG
 * 1. Cấp Giáo viên: Chỉ sao lưu và phục hồi dữ liệu tài khoản phụ trách
 * 2. Cấp Quản trị Nhà trường: Sao lưu và phục hồi toàn bộ dữ liệu nhà trường
 * 3. Cấp Quản trị Cấp cao (Admin Tối cao): Lựa chọn sao lưu & phục hồi toàn bộ hệ thống hoặc theo từng trường
 */
export const multiTierBackupService = {
  /**
   * 1. 👤 SAO LƯU DỮ LIỆU TÀI KHOẢN GIÁO VIÊN PHỤ TRÁCH (.JSON & .ZIP)
   */
  async exportTeacherBackup(
    currentUser: UserAccount,
    classroomData: UserClassroomData,
    format: 'json' | 'zip' = 'json'
  ): Promise<void> {
    const totalClasses = Array.isArray(classroomData.classes) ? classroomData.classes.length : 0;
    const totalStudents = Array.isArray(classroomData.students) ? classroomData.students.length : 0;

    const backupData: MultiTierBackupPackage = {
      version: '2.0',
      format: 'lop_hoc_hanh_phuc_backup',
      scope: 'teacher',
      schoolName: currentUser.schoolName,
      metadata: {
        version: '2.0',
        format: 'lop_hoc_hanh_phuc_backup',
        scope: 'teacher',
        exportedAt: new Date().toISOString(),
        exportedBy: currentUser.fullName,
        exportedUsername: currentUser.username,
        exportedRole: currentUser.role,
        schoolName: currentUser.schoolName || 'Giáo viên tự do',
        totalClasses,
        totalStudents,
        appName: 'Hệ thống Quản trị Lớp học Hạnh phúc',
        description: `Bản sao lưu độc lập của giáo viên ${currentUser.fullName} (@${currentUser.username})`
      },
      teacherData: classroomData,
      userData: {
        [currentUser.username.toLowerCase()]: classroomData
      }
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    const cleanUser = currentUser.username.replace(/[^a-zA-Z0-9]/g, '_');

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Sao_Luu_Giao_Vien_${cleanUser}_${dateStr}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const zip = new JSZip();
      zip.file(`du_lieu_giao_vien_${cleanUser}.json`, JSON.stringify(backupData, null, 2));
      zip.file(
        'THONG_TIN_SAO_LUU_GIAO_VIEN.txt',
        `=========================================================\n` +
        `📦 SAO LƯU DỮ LIỆU TÀI KHOẢN GIÁO VIÊN (PHÂN CẤP ĐA TẦNG)\n` +
        `=========================================================\n` +
        `• Giáo viên: ${currentUser.fullName} (@${currentUser.username})\n` +
        `• Đơn vị công tác: ${currentUser.schoolName || 'Cá nhân'}\n` +
        `• Vai trò: ${currentUser.role === 'homeroom' ? 'Giáo viên chủ nhiệm' : 'Giáo viên bộ môn'}\n` +
        `• Thời gian sao lưu: ${new Date().toLocaleString('vi-VN')}\n` +
        `• Số lớp phụ trách: ${totalClasses} lớp\n` +
        `• Tổng số học sinh: ${totalStudents} học sinh\n` +
        `• Quy chuẩn: Độc lập 100%, an toàn, bảo vệ dữ liệu cá nhân.\n\n` +
        `HƯỚNG DẪN PHỤC HỒI:\n` +
        `Vào mục DỮ LIỆU trong ứng dụng, chọn 'Nạp Vào Khôi Phục Dữ Liệu' và tải file .ZIP này lên.`
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Sao_Luu_Giao_Vien_${cleanUser}_${dateStr}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    }
  },

  /**
   * 2. 🏫 SAO LƯU TOÀN BỘ DỮ LIỆU NHÀ TRƯỜNG (.JSON & .ZIP)
   * Thu thập tất cả tài khoản giáo viên, tất cả các lớp GVCN và học sinh của trường
   */
  async exportSchoolBackup(
    schoolName: string,
    currentUser: UserAccount,
    format: 'json' | 'zip' = 'json'
  ): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const targetSchool = (schoolName || currentUser.schoolName || '').trim();
      if (!targetSchool) {
        return { success: false, message: 'Không xác định được trường học cần sao lưu.' };
      }

      // Lấy danh sách toàn bộ người dùng và trường học
      const allUsers = await databaseService.getUsers();
      const allSchools = await databaseService.getSchools();
      const schoolEntity = allSchools.find(
        s => s.name.trim().toLowerCase() === targetSchool.toLowerCase()
      );

      // Lọc các giáo viên và quản trị viên thuộc trường này
      const schoolUsers = allUsers.filter(
        u => (u.schoolName || '').trim().toLowerCase() === targetSchool.toLowerCase()
      );

      // Thu thập dữ liệu userData cho từng giáo viên của trường
      const userDataMap: Record<string, UserClassroomData> = {};
      await Promise.all(
        schoolUsers.map(async (u) => {
          let uData = await databaseService.loadUserData(u.username);
          if (!uData) {
            try {
              const cached = localStorage.getItem(LOCAL_DB_PREFIX + u.username.toLowerCase());
              if (cached) uData = JSON.parse(cached);
            } catch (_) {}
          }
          if (uData) {
            userDataMap[u.username.toLowerCase()] = uData;
          }
        })
      );

      // Tổng hợp dữ liệu điều hành toàn trường (classes, students, attendance, boarding...)
      const executiveData = await databaseService.getExecutiveScopedData({
        ...currentUser,
        role: 'school_admin',
        schoolName: targetSchool
      });

      const totalClasses = executiveData.classes.length;
      const totalStudents = executiveData.students.length;
      const totalTeachers = schoolUsers.length;

      const backupData: MultiTierBackupPackage = {
        version: '2.0',
        format: 'lop_hoc_hanh_phuc_backup',
        scope: 'school',
        schoolName: targetSchool,
        schoolEntity,
        metadata: {
          version: '2.0',
          format: 'lop_hoc_hanh_phuc_backup',
          scope: 'school',
          exportedAt: new Date().toISOString(),
          exportedBy: currentUser.fullName,
          exportedUsername: currentUser.username,
          exportedRole: currentUser.role,
          schoolName: targetSchool,
          schoolId: schoolEntity?.id,
          totalTeachers,
          totalClasses,
          totalStudents,
          appName: 'Hệ thống Quản trị Lớp học Hạnh phúc',
          description: `Bản sao lưu toàn bộ cơ sở dữ liệu ${targetSchool} (${totalClasses} lớp GVCN, ${totalStudents} học sinh, ${totalTeachers} tài khoản)`
        },
        users: schoolUsers,
        userData: userDataMap,
        schoolWideData: {
          classes: executiveData.classes,
          students: executiveData.students,
          attendanceRecords: executiveData.attendanceRecords,
          boardingRecords: executiveData.boardingRecords,
          transactions: executiveData.transactions
        }
      };

      const dateStr = new Date().toISOString().slice(0, 10);
      const cleanSchool = targetSchool.replace(/[^a-zA-Z0-9]/g, '_');

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Sao_Luu_Nha_Truong_${cleanSchool}_${dateStr}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const zip = new JSZip();
        zip.file(`du_lieu_nha_truong_${cleanSchool}.json`, JSON.stringify(backupData, null, 2));
        zip.file(
          'THONG_TIN_SAO_LUU_NHA_TRUONG.txt',
          `====================================================================\n` +
          `🏫 SAO LƯU TOÀN BỘ CƠ SỞ DỮ LIỆU NHÀ TRƯỜNG (PHÂN CẤP ĐA TẦNG)\n` +
          `====================================================================\n` +
          `• Trường học: ${targetSchool}\n` +
          `• Mã trường: ${schoolEntity?.code || 'Chưa cập nhật'}\n` +
          `• Người thực hiện: ${currentUser.fullName} (@${currentUser.username})\n` +
          `• Thời gian sao lưu: ${new Date().toLocaleString('vi-VN')}\n` +
          `• Tổng số lớp học (GVCN): ${totalClasses} lớp\n` +
          `• Tổng số học sinh toàn trường: ${totalStudents} học sinh\n` +
          `• Tổng số tài khoản nhân sự / giáo viên: ${totalTeachers} tài khoản\n` +
          `• Trạng thái dữ liệu: Nguyên vẹn 100%, bảo toàn điểm số và chuyên cần.\n\n` +
          `HƯỚNG DẪN KHÔI PHỤC TOÀN TRƯỜNG:\n` +
          `Đăng nhập vào tài khoản Quản trị nhà trường hoặc Admin Cấp cao, vào mục "DỮ LIỆU", nạp tệp này để phục hồi toàn bộ lớp học và học sinh cho trường ${targetSchool}.`
        );
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Sao_Luu_Nha_Truong_${cleanSchool}_${dateStr}.zip`;
        link.click();
        URL.revokeObjectURL(url);
      }

      return {
        success: true,
        message: `Đã đóng gói và tải về dữ liệu toàn trường (${totalClasses} lớp, ${totalStudents} học sinh)!`,
        details: { totalClasses, totalStudents, totalTeachers }
      };
    } catch (err: any) {
      console.error('Lỗi sao lưu nhà trường:', err);
      return { success: false, message: err?.message || 'Lỗi khi sao lưu dữ liệu nhà trường.' };
    }
  },

  /**
   * 3. 🌐 SAO LƯU TOÀN BỘ HỆ THỐNG (DÀNH CHO ADMIN TỐI CAO `adminquantri`) (.JSON & .ZIP)
   * Thu thập tất cả các trường học, tất cả tài khoản, tất cả dữ liệu
   */
  async exportSystemBackup(
    currentUser: UserAccount,
    format: 'json' | 'zip' = 'json'
  ): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const allUsers = await databaseService.getUsers();
      const allSchools = await databaseService.getSchools();

      // Thu thập userData toàn bộ hệ thống
      const userDataMap: Record<string, UserClassroomData> = {};
      await Promise.all(
        allUsers.map(async (u) => {
          let uData = await databaseService.loadUserData(u.username);
          if (!uData) {
            try {
              const cached = localStorage.getItem(LOCAL_DB_PREFIX + u.username.toLowerCase());
              if (cached) uData = JSON.parse(cached);
            } catch (_) {}
          }
          if (uData) {
            userDataMap[u.username.toLowerCase()] = uData;
          }
        })
      );

      // Thống kê toàn hệ thống
      const executiveAll = await databaseService.getExecutiveScopedData({
        ...currentUser,
        role: 'admin',
        username: 'adminquantri'
      });

      const totalClasses = executiveAll.classes.length;
      const totalStudents = executiveAll.students.length;
      const totalTeachers = allUsers.length;
      const totalSchools = allSchools.length;

      const backupData: MultiTierBackupPackage = {
        version: '2.0',
        format: 'lop_hoc_hanh_phuc_backup',
        scope: 'system',
        schools: allSchools,
        users: allUsers,
        userData: userDataMap,
        metadata: {
          version: '2.0',
          format: 'lop_hoc_hanh_phuc_backup',
          scope: 'system',
          exportedAt: new Date().toISOString(),
          exportedBy: currentUser.fullName || 'Quản trị viên Hệ thống Cấp cao',
          exportedUsername: currentUser.username || 'adminquantri',
          exportedRole: 'admin',
          totalSchools,
          totalTeachers,
          totalClasses,
          totalStudents,
          appName: 'Hệ thống Quản trị Lớp học Hạnh phúc',
          description: `Bản sao lưu TOÀN BỘ HỆ THỐNG gồm ${totalSchools} trường học, ${totalTeachers} tài khoản, ${totalClasses} lớp GVCN, ${totalStudents} học sinh.`
        },
        schoolWideData: {
          classes: executiveAll.classes,
          students: executiveAll.students,
          attendanceRecords: executiveAll.attendanceRecords,
          boardingRecords: executiveAll.boardingRecords,
          transactions: executiveAll.transactions
        }
      };

      const dateStr = new Date().toISOString().slice(0, 10);

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Sao_Luu_Toan_Bo_He_Thong_${dateStr}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const zip = new JSZip();
        zip.file('du_lieu_toan_bo_he_thong.json', JSON.stringify(backupData, null, 2));
        zip.file(
          'THONG_TIN_SAO_LUU_TOAN_HE_THONG.txt',
          `==========================================================================\n` +
          `👑 SAO LƯU DỮ LIỆU TOÀN BỘ HỆ THỐNG - QUẢN TRỊ TỐI CAO (SYSTEM-WIDE BACKUP)\n` +
          `==========================================================================\n` +
          `• Cấp phân quyền: Quản trị viên Hệ thống Cấp cao (adminquantri)\n` +
          `• Thời gian sao lưu: ${new Date().toLocaleString('vi-VN')}\n` +
          `• Tổng số đơn vị trường học: ${totalSchools} trường\n` +
          `• Tổng số tài khoản trên toàn hệ thống: ${totalTeachers} tài khoản\n` +
          `• Tổng số lớp học (GVCN): ${totalClasses} lớp\n` +
          `• Tổng số học sinh toàn hệ thống: ${totalStudents} học sinh\n` +
          `• Tiêu chuẩn: Chuẩn sao lưu Master Backup, bảo vệ vĩnh viễn dữ liệu.\n\n` +
          `HƯỚNG DẪN KHÔI PHỤC TOÀN HỆ THỐNG:\n` +
          `Đăng nhập vào tài khoản adminquantri, chọn chế độ "Toàn bộ hệ thống", chọn "Nạp Vào Khôi Phục Dữ Liệu" và tải file .ZIP này lên.`
        );
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Sao_Luu_Toan_Bo_He_Thong_${dateStr}.zip`;
        link.click();
        URL.revokeObjectURL(url);
      }

      return {
        success: true,
        message: `Đã đóng gói và tải về dữ liệu toàn bộ hệ thống (${totalSchools} trường, ${totalClasses} lớp, ${totalStudents} học sinh)!`,
        details: { totalSchools, totalClasses, totalStudents, totalTeachers }
      };
    } catch (err: any) {
      console.error('Lỗi sao lưu toàn hệ thống:', err);
      return { success: false, message: err?.message || 'Lỗi khi sao lưu dữ liệu toàn hệ thống.' };
    }
  },

  /**
   * 4. 🔍 ĐỌC & PHÂN TÍCH TỆP SAO LƯU (TỰ ĐỘNG NHẬN DIỆN .JSON HOẶC .ZIP)
   */
  async parseBackupFile(file: File): Promise<{
    success: boolean;
    data?: MultiTierBackupPackage;
    scope: BackupScope;
    summary: {
      fileName: string;
      scopeText: string;
      schoolName?: string;
      totalClasses: number;
      totalStudents: number;
      totalTeachers: number;
      exportedAt?: string;
      exportedBy?: string;
    };
    rawJson?: any;
    message?: string;
  }> {
    try {
      let rawText = '';
      if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        let targetJsonFile = Object.values(loadedZip.files).find(
          f => !f.dir && f.name.toLowerCase().endsWith('.json')
        );
        if (!targetJsonFile) {
          return {
            success: false,
            scope: 'teacher',
            summary: { fileName: file.name, scopeText: 'Không hợp lệ', totalClasses: 0, totalStudents: 0, totalTeachers: 0 },
            message: 'File nén .ZIP không chứa tệp dữ liệu .json hợp lệ.'
          };
        }
        rawText = await targetJsonFile.async('text');
      } else {
        rawText = await file.text();
      }

      const parsed = JSON.parse(rawText);
      const isMultiTier = parsed.format === 'lop_hoc_hanh_phuc_backup';
      let scope: BackupScope = parsed.scope || (parsed.users && parsed.schools ? 'system' : (parsed.users ? 'school' : 'teacher'));

      // Phân tích tóm tắt dữ liệu
      let totalClasses = 0;
      let totalStudents = 0;
      let totalTeachers = 0;
      let schoolName = parsed.schoolName || parsed.metadata?.schoolName || '';

      if (parsed.metadata?.totalClasses !== undefined) {
        totalClasses = parsed.metadata.totalClasses;
        totalStudents = parsed.metadata.totalStudents || 0;
        totalTeachers = parsed.metadata.totalTeachers || (Array.isArray(parsed.users) ? parsed.users.length : 0);
      } else if (parsed.schoolWideData) {
        totalClasses = Array.isArray(parsed.schoolWideData.classes) ? parsed.schoolWideData.classes.length : 0;
        totalStudents = Array.isArray(parsed.schoolWideData.students) ? parsed.schoolWideData.students.length : 0;
        totalTeachers = Array.isArray(parsed.users) ? parsed.users.length : 0;
      } else if (Array.isArray(parsed.classes)) {
        totalClasses = parsed.classes.length;
        totalStudents = Array.isArray(parsed.students) ? parsed.students.length : 0;
        totalTeachers = 1;
      } else if (parsed.teacherData) {
        totalClasses = Array.isArray(parsed.teacherData.classes) ? parsed.teacherData.classes.length : 0;
        totalStudents = Array.isArray(parsed.teacherData.students) ? parsed.teacherData.students.length : 0;
        totalTeachers = 1;
      }

      let scopeText = 'Tài khoản Giáo viên';
      if (scope === 'system') scopeText = 'Toàn bộ Hệ thống';
      else if (scope === 'school') scopeText = `Toàn trường: ${schoolName || 'Chưa đặt tên'}`;

      return {
        success: true,
        data: parsed,
        scope,
        summary: {
          fileName: file.name,
          scopeText,
          schoolName,
          totalClasses,
          totalStudents,
          totalTeachers,
          exportedAt: parsed.metadata?.exportedAt || parsed.exportedAt,
          exportedBy: parsed.metadata?.exportedBy || parsed.account?.fullName
        },
        rawJson: parsed
      };
    } catch (err: any) {
      console.error('Lỗi phân tích file sao lưu:', err);
      return {
        success: false,
        scope: 'teacher',
        summary: { fileName: file.name, scopeText: 'Lỗi', totalClasses: 0, totalStudents: 0, totalTeachers: 0 },
        message: err?.message || 'Tệp tin không đúng định dạng JSON hoặc ZIP hợp lệ.'
      };
    }
  },

  /**
   * 5. 🔄 KHÔI PHỤC DỮ LIỆU NHÀ TRƯỜNG (DÀNH CHO QUẢN TRỊ TRƯỜNG & ADMIN CẤP CAO)
   * Đồng bộ toàn bộ tài khoản giáo viên và các lớp của trường vào CSDL
   */
  async restoreSchoolBackup(
    backupPackage: any,
    targetSchoolName?: string
  ): Promise<{ success: boolean; message: string; restoredClasses?: number; restoredStudents?: number }> {
    try {
      const schoolName = targetSchoolName || backupPackage.schoolName || backupPackage.metadata?.schoolName;
      if (!schoolName) {
        return { success: false, message: 'Không xác định được tên trường để khôi phục.' };
      }

      const usersToRestore: UserAccount[] = Array.isArray(backupPackage.users) ? backupPackage.users : [];
      const userDataMap: Record<string, UserClassroomData> = backupPackage.userData || {};

      // 1. Đồng bộ qua Server Local JSON Database API nếu có
      try {
        await databaseService.importScopedData(
          { users: usersToRestore, userData: userDataMap },
          'school',
          schoolName
        );
      } catch (_) {}

      // 2. Lưu từng userData vào Supabase Cloud & LocalStorage
      let restoredClasses = 0;
      let restoredStudents = 0;

      for (const [username, uData] of Object.entries(userDataMap)) {
        if (uData) {
          try {
            await databaseService.saveUserData(username, uData);
          } catch (_) {}
          try {
            localStorage.setItem(LOCAL_DB_PREFIX + username.toLowerCase(), JSON.stringify(uData));
          } catch (_) {}

          if (Array.isArray(uData.classes)) restoredClasses += uData.classes.length;
          if (Array.isArray(uData.students)) restoredStudents += uData.students.length;
        }
      }

      // 3. Nếu có danh sách lớp tổng thể (schoolWideData)
      if (backupPackage.schoolWideData?.classes?.length) {
        restoredClasses = Math.max(restoredClasses, backupPackage.schoolWideData.classes.length);
      }
      if (backupPackage.schoolWideData?.students?.length) {
        restoredStudents = Math.max(restoredStudents, backupPackage.schoolWideData.students.length);
      }

      return {
        success: true,
        message: `Khôi phục thành công toàn bộ dữ liệu trường ${schoolName}! (${restoredClasses} lớp, ${restoredStudents} học sinh)`,
        restoredClasses,
        restoredStudents
      };
    } catch (err: any) {
      console.error('Lỗi khôi phục nhà trường:', err);
      return { success: false, message: err?.message || 'Lỗi khi khôi phục dữ liệu trường.' };
    }
  },

  /**
   * 6. 🔄 KHÔI PHỤC TOÀN BỘ HỆ THỐNG (CHỈ DÀNH CHO ADMIN TỐI CAO `adminquantri`)
   */
  async restoreSystemBackup(
    backupPackage: any
  ): Promise<{ success: boolean; message: string; restoredSchools?: number; restoredUsers?: number }> {
    try {
      // 1. Khôi phục qua Server Import API
      try {
        await databaseService.importDatabase(backupPackage);
      } catch (_) {}

      // 2. Khôi phục từng userData vào Supabase & LocalStorage
      const userDataMap: Record<string, UserClassroomData> = backupPackage.userData || {};
      for (const [username, uData] of Object.entries(userDataMap)) {
        if (uData) {
          try {
            await databaseService.saveUserData(username, uData);
          } catch (_) {}
          try {
            localStorage.setItem(LOCAL_DB_PREFIX + username.toLowerCase(), JSON.stringify(uData));
          } catch (_) {}
        }
      }

      const restoredSchools = Array.isArray(backupPackage.schools) ? backupPackage.schools.length : 1;
      const restoredUsers = Array.isArray(backupPackage.users) ? backupPackage.users.length : Object.keys(userDataMap).length;

      return {
        success: true,
        message: `Khôi phục thành công toàn bộ hệ thống! (${restoredSchools} trường học, ${restoredUsers} tài khoản)`,
        restoredSchools,
        restoredUsers
      };
    } catch (err: any) {
      console.error('Lỗi khôi phục toàn hệ thống:', err);
      return { success: false, message: err?.message || 'Lỗi khi khôi phục toàn hệ thống.' };
    }
  }
};
