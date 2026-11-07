import { UserClassroomData } from './index';

/**
 * 📂 ĐẶC TẢ DỮ LIỆU ĐỒNG BỘ GOOGLE DRIVE CHUẨN V2.0
 * Quy chuẩn 01 file JSON duy nhất: du_lieu_lop_hoc_hanh_phuc.json
 */

export interface StandardClassMetadata {
  schoolName: string;
  className: string;
  teacherName: string;
  teacherUsername: string;
  academicYear: string;
  totalStudents: number;
  grade?: number | string;
  room?: string;
  branch?: string | null;
  campus?: string | null;
  // 'homeroom' (GVCN) | 'subject' (GVBM) — BGH chỉ tổng hợp tệp của GVCN
  teacherRole?: 'homeroom' | 'subject';
}

export interface StandardClassInfo {
  id: string;
  name: string;
  grade: number | string;
  room?: string;
  schoolName?: string;
  branch?: string | null;
  campus?: string | null;
  academicYear?: string;
  slogan?: string;
}

export interface StandardStudent {
  id: string;
  stt?: number;
  fullName: string;
  gender: 'Nam' | 'Nữ' | 'male' | 'female' | string;
  dob?: string;
  isBoarding?: boolean;
  parentPhone?: string;
  avatar?: string;
  points?: number;
  group?: string;
  role?: string;
  roles?: string[];
  updatedAt?: number | string;
}

export interface StandardDailyAttendanceRecord {
  present: number;
  excused: number;
  unexcused: number;
  late?: number;
  absentStudentIds: string[];
  details?: Record<string, string>; // studentId -> status ('present', 'late', 'excused', ...)
}

export interface StandardDailyBoardingRecord {
  registered: number;
  actual: number;
  canceledStudentIds: string[];
  details?: Record<string, string>; // studentId -> status ('eating', 'not_eating')
}

export interface StandardDailyRecord {
  attendance?: StandardDailyAttendanceRecord;
  boarding?: StandardDailyBoardingRecord;
  notes?: string;
  updatedAt: string;
}

export interface StandardClassroomJson {
  version: string; // "2.0"
  format: 'lop_hoc_hanh_phuc_backup';
  scope: 'google_drive_sync';
  exportedAt: string;
  metadata: StandardClassMetadata;
  classInfo: StandardClassInfo;
  students: StandardStudent[];
  dailyRecords: Record<string, StandardDailyRecord>; // YYYY-MM-DD -> records
  // Bảo toàn trọn vẹn 16 phân hệ khi chuyển máy hoặc khôi phục
  fullClassroomData?: Partial<UserClassroomData>;
  // 🏛️ Dữ liệu phân cấp quản trị & CSDL đa máy tính (Hệ thống trường & Tài khoản)
  hierarchyLevel?: 'master_admin' | 'school_admin' | 'teacher';
  systemSchools?: any[];
  systemUsers?: any[];
  systemClasses?: any[];
}

// ==========================================
// THỐNG KÊ TỔNG HỢP BAN GIÁM HIỆU & ADMIN
// ==========================================

export interface SchoolWideSummary {
  totalClasses: number;
  totalStudents: number;
  totalPresent: number;
  totalExcused: number;
  totalUnexcused: number;
  totalLate: number;
  attendanceRate: string; // e.g. "98.86%"
  totalBoardingRegistered: number;
  totalBoardingActual: number;
  totalBoardingCanceled: number;
  boardingRate: string; // e.g. "99.03%"
}

export interface ClassAggregationDetail {
  classId: string;
  className: string;
  fileName?: string;
  grade?: string | number;
  teacherName: string;
  teacherUsername: string;
  room?: string;
  total: number;
  present: number;
  excused: number;
  unexcused: number;
  late: number;
  attendanceRate: string;
  boardingRegistered: number;
  boardingActual: number;
  boardingCanceled: number;
  boardingRate: string;
  status: 'reported' | 'missing'; // 'reported': Đã gửi điểm danh, 'missing': Chưa điểm danh
  updatedAt?: string;
  absentStudentsSummary?: Array<{ id: string; name: string; status: string }>;
  students?: any[];
}

export interface SchoolWideAggregationReport {
  reportDate: string; // YYYY-MM-DD
  school: string;
  summary: SchoolWideSummary;
  classesDetail: ClassAggregationDetail[];
  missingClasses: string[];
  generatedAt: string;
}

// ==========================================
// CẤU HÌNH LIÊN THÔNG GOOGLE DRIVE
// ==========================================

export interface DriveFolderHistoryItem {
  id: string;
  url?: string;
  date: string;
  name?: string;
}

export interface GoogleDriveConfig {
  folderUrl: string;
  folderId?: string;
  scriptUrl: string;
  bghFolderUrl?: string;
  bghFolderId?: string;
  autoSyncEnabled: boolean;
  debounceMs?: number;
  lastSyncTime?: string;
  syncStatus: 'idle' | 'pending' | 'syncing' | 'success' | 'error';
  lastError?: string;
  syncMethod?: 'appscript' | 'desktop';
  desktopPath?: string;
  folderHistory?: DriveFolderHistoryItem[];
}

