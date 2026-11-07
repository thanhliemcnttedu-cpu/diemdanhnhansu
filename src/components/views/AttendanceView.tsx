import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useClassroom } from '../../context/ClassroomContext';
import { AttendanceStatus, BoardingStatus } from '../../types';
import { databaseService } from '../../services/databaseService';
import { googleDriveService } from '../../services/googleDriveService';
import { 
  CheckSquare, Calendar, Check, Clock, 
  Download, Sparkles, AlertCircle, HeartPulse, 
  UserCheck, Search, RotateCcw,
  Utensils, Copy, FileSpreadsheet, TrendingUp, BarChart3,
  ChevronLeft, ChevronRight, AlertTriangle, Users, Building2,
  FileText, CheckCircle2, Lock, ArrowRight, PieChart, History,
  Image as ImageIcon
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AttendanceChartsView } from './attendance/AttendanceChartsView';
import { AttendanceExportModal } from './attendance/AttendanceExportModal';
import { handleAvatarImgError } from '../../utils/avatarConfig';

// 4 Trạng thái điểm danh trọng tâm theo yêu cầu của Bộ GD & người dùng
const STATUS_CONFIG: Record<AttendanceStatus, { label: string; short: string; activeClass: string; inactiveClass: string; badgeClass: string; icon: string }> = {
  present: {
    label: 'CÓ MẶT',
    short: 'CÓ MẶT',
    activeClass: 'bg-emerald-600 text-white font-black shadow-xs ring-2 ring-emerald-600/30',
    inactiveClass: 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: '✓'
  },
  excused: {
    label: 'VẮNG CÓ PHÉP',
    short: 'CÓ PHÉP',
    activeClass: 'bg-blue-600 text-white font-black shadow-xs ring-2 ring-blue-600/30',
    inactiveClass: 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-800',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: '📝'
  },
  unexcused: {
    label: 'VẮNG KHÔNG PHÉP',
    short: 'KHÔNG PHÉP',
    activeClass: 'bg-rose-600 text-white font-black shadow-xs ring-2 ring-rose-600/30',
    inactiveClass: 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-800',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    icon: '✕'
  },
  sick: {
    label: 'NGHỈ ỐM',
    short: 'NGHỈ ỐM',
    activeClass: 'bg-purple-600 text-white font-black shadow-xs ring-2 ring-purple-600/30',
    inactiveClass: 'bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-800',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: '🏥'
  },
  late: {
    label: 'ĐI MUỘN',
    short: 'ĐI MUỘN',
    activeClass: 'bg-amber-500 text-white font-black shadow-xs ring-2 ring-amber-500/30',
    inactiveClass: 'bg-slate-100 text-slate-700 hover:bg-amber-50 hover:text-amber-800',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: '⏰'
  },
  other: {
    label: 'LÝ DO KHÁC',
    short: 'KHÁC',
    activeClass: 'bg-slate-200 text-slate-800 font-black shadow-xs ring-2 ring-slate-200',
    inactiveClass: 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-800',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: '•'
  }
};

const BOARDING_CONFIG: Record<'eating' | 'not_eating', { label: string; activeClass: string; inactiveClass: string; icon: string }> = {
  eating: {
    label: 'Ăn bán trú',
    activeClass: 'bg-emerald-600 text-white font-black shadow-xs ring-2 ring-emerald-600/30',
    inactiveClass: 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700',
    icon: '🍱'
  },
  not_eating: {
    label: 'Không ăn / Về nhà',
    activeClass: 'bg-slate-200 text-slate-800 font-black shadow-xs ring-2 ring-slate-200',
    inactiveClass: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    icon: '🏠'
  }
};

export const AttendanceView: React.FC = () => {
  const { 
    currentClassStudents, students, attendanceRecords, setStudentAttendance: setStudentAttendanceRaw,
    batchSetAttendance: batchSetAttendanceRaw, activeClassId, classes, teacherProfile,
    boardingRecords, setStudentBoarding: setStudentBoardingRaw, batchSetBoarding: batchSetBoardingRaw, syncDatabaseNow,
    currentUser
  } = useClassroom();
  
  const activeClass = classes.find(c => c.id === activeClassId);

  // 3 Sub-tabs: 'daily' (Chuyên cần) | 'boarding' (Ăn bán trú) | 'charts' (Thống kê & Biểu đồ)
  const [activeTab, setActiveTab] = useState<'daily' | 'boarding' | 'charts'>('daily');

  // Real Today String
  const realTodayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [selectedDate, setSelectedDateRaw] = useState<string>(realTodayStr);

  // 📅 QUY TRÌNH BÁO CÁO: GVCN chỉ điểm danh chuyên cần & bán trú cho HÔM NAY và tối đa 2 NGÀY TRƯỚC
  // (hôm qua, hôm kia) để tránh báo cáo chậm / sai số liệu. Ngoài khung này chỉ xem, không sửa.
  const ATTENDANCE_EDIT_WINDOW_DAYS = 2;
  const minEditableDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ATTENDANCE_EDIT_WINDOW_DAYS);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const isDateEditable = (dateStr?: string) => {
    const target = dateStr || realTodayStr;
    return target >= minEditableDateStr && target <= realTodayStr;
  };
  const clampToEditableWindow = (dateStr: string) => {
    if (!dateStr) return realTodayStr;
    if (dateStr > realTodayStr) return realTodayStr;
    if (dateStr < minEditableDateStr) return minEditableDateStr;
    return dateStr;
  };
  const setSelectedDate = (dateStr: string) => setSelectedDateRaw(clampToEditableWindow(dateStr));
  const notifyLockedDate = () => {
    setSaveToast(`⛔ Chỉ được điểm danh hôm nay và 2 ngày trước (từ ${minEditableDateStr.split('-').reverse().join('/')}). Ngày này đã khóa số liệu.`);
    setTimeout(() => setSaveToast(null), 4000);
  };
  const setStudentAttendance: typeof setStudentAttendanceRaw = (studentId, status, date) => {
    if (!isDateEditable(date)) { notifyLockedDate(); return; }
    setStudentAttendanceRaw(studentId, status, date);
  };
  const setStudentBoarding: typeof setStudentBoardingRaw = (studentId, status, date) => {
    if (!isDateEditable(date)) { notifyLockedDate(); return; }
    setStudentBoardingRaw(studentId, status, date);
  };
  const batchSetAttendance: typeof batchSetAttendanceRaw = (status, date) => {
    if (!isDateEditable(date)) { notifyLockedDate(); return; }
    batchSetAttendanceRaw(status, date);
  };
  const batchSetBoarding: typeof batchSetBoardingRaw = (status, date) => {
    if (!isDateEditable(date)) { notifyLockedDate(); return; }
    batchSetBoardingRaw(status, date);
  };
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'present' | 'absent' | 'sick' | 'excused' | 'unexcused' | 'late'>('all');
  const [boardingFilterType, setBoardingFilterType] = useState<'all' | 'eating' | 'not_eating'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedReportToast, setCopiedReportToast] = useState(false);
  
  // Highlight flash state when stats jump automatically
  const [statsJustUpdated, setStatsJustUpdated] = useState(false);

  // Multi-select for boarding meal
  const [selectedBoardingStudentIds, setSelectedBoardingStudentIds] = useState<string[]>([]);

  // Export Modal Open State (Single / Multi Class PDF & Excel)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Helper date shortcuts
  const getDateDaysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getLastFridayStr = () => {
    const d = new Date();
    const day = d.getDay(); // 0 is Sun, 5 is Fri
    let diff = day >= 5 ? day - 5 : day + 2;
    if (diff === 0) diff = 7; // If today is Friday, last Friday is 7 days ago
    d.setDate(d.getDate() - diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  };

  // Date Navigation Helpers
  const changeDateByDays = (days: number) => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() + days);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const getDayOfWeekName = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      return days[d.getDay()];
    } catch {
      return '';
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      return `${getDayOfWeekName(dateStr)}, ngày ${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  const isPastDateSelected = selectedDate !== realTodayStr;

  // Current day's attendance record
  const currentRecord = attendanceRecords.find(r => r.date === selectedDate && r.classId === activeClassId);
  const currentStatusMap = currentRecord?.records || {};

  // Current day's boarding meal record
  const currentBoardingRecord = boardingRecords.find(r => r.date === selectedDate && r.classId === activeClassId);
  const currentBoardingMap = currentBoardingRecord?.records || {};

  // Helper check if student is absent on selected date
  const isStudentAbsent = (studentId: string) => {
    const status = currentStatusMap[studentId];
    return status === 'sick' || status === 'excused' || status === 'unexcused' || status === 'other';
  };

  const getStudentAbsentReason = (studentId: string) => {
    const status = currentStatusMap[studentId];
    if (status === 'sick') return 'Nghỉ ốm';
    if (status === 'excused') return 'Vắng có phép';
    if (status === 'unexcused') return 'Vắng không phép';
    if (status === 'other') return 'Vắng lý do khác';
    return null;
  };

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setStudentAttendance(studentId, status, selectedDate);
  };

  const handleBoardingChange = (studentId: string, status: BoardingStatus) => {
    // If student is absent, prevent marking 'eating'
    if (status === 'eating' && isStudentAbsent(studentId)) {
      const reason = getStudentAbsentReason(studentId) || 'Vắng mặt';
      setSaveToast(`⚠️ Học sinh này đã được điểm danh chuyên cần là "${reason}". Không được điểm danh ăn bán trú!`);
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    setStudentBoarding(studentId, status, selectedDate);
  };

  // 1. Điểm danh toàn lớp CÓ MẶT
  const handleSelectAllPresent = () => {
    batchSetAttendance('present', selectedDate);
    confetti({ particleCount: 40, spread: 50 });
    setSaveToast(`Đã ghi nhận toàn bộ ${currentClassStudents.length} học sinh CÓ MẶT ngày ${selectedDate}!`);
    setTimeout(() => setSaveToast(null), 3500);
  };

  // 2. YÊU CẦU CỐT LÕI:
  // "Cho phép điểm danh bổ sung các ngày trước đó, điểm danh xong phải bấm nút Xác nhận điểm danh, 
  // sau đó sẽ tự động nhảy tổng hợp báo cáo cho: HÔM NAY; TUẦN NÀY; TUẦN TRƯỚC; CẢ THÁNG."
  const handleConfirmAndCompleteAttendance = () => {
    if (!isDateEditable(selectedDate)) { notifyLockedDate(); return; }
    // ☁️ Đẩy số liệu lên thư mục Google Drive dùng chung NGAY LẬP TỨC (BGH / Quản trị nhận ngay)
    googleDriveService.requestImmediatePush();
    let newlyPresentCount = 0;
    let absentCount = 0;
    let sickCount = 0;
    let excusedCount = 0;
    let unexcusedCount = 0;

    const finalRecords: Record<string, string> = {};
    currentClassStudents.forEach(student => {
      const currentStatus = currentStatusMap[student.id];
      const isAbsent = currentStatus === 'sick' || currentStatus === 'excused' || currentStatus === 'unexcused' || currentStatus === 'other';

      if (isAbsent) {
        absentCount++;
        if (currentStatus === 'sick') sickCount++;
        else if (currentStatus === 'excused') excusedCount++;
        else if (currentStatus === 'unexcused') unexcusedCount++;
        // Đảm bảo học sinh vắng bị khóa không ăn bán trú
        setStudentBoarding(student.id, 'not_eating', selectedDate);
        finalRecords[student.id] = currentStatus;
      } else {
        // Tự động gán các học sinh còn lại là CÓ MẶT
        setStudentAttendance(student.id, 'present', selectedDate);
        finalRecords[student.id] = 'present';
        newlyPresentCount++;
      }
    });

    // ⚡ Lưu ngay dữ liệu vào CSDL máy chủ để BGH & Quản trị trường tổng hợp số liệu chuẩn xác 100%
    try { syncDatabaseNow(); } catch (_) {}

    // ⚡ Phát sóng realtime tức thì tới BGH / Quản trị nhà trường
    const attendanceRecord = {
      classId: activeClassId,
      date: selectedDate,
      records: finalRecords
    };
    databaseService.broadcastAttendanceConfirmed({
      type: 'ATTENDANCE_CONFIRMED',
      classId: activeClassId,
      className: activeClass?.name,
      date: selectedDate,
      attendanceRecord,
      schoolName: currentUser?.schoolName || teacherProfile.schoolName,
      username: currentUser?.username
    }).catch(() => {});

    // Trigger visual pulse animation on KPI report cards
    setStatsJustUpdated(true);
    setTimeout(() => setStatsJustUpdated(false), 4500);

    confetti({ particleCount: 60, spread: 70 });
    setSaveToast(
      `✓ ĐÃ XÁC NHẬN ĐIỂM DANH ${isPastDateSelected ? `BỔ SUNG NGÀY ${selectedDate}` : 'XONG'}! Hệ thống tự động ghi nhận ${newlyPresentCount} học sinh CÓ MẶT và tự động nhảy tổng hợp báo cáo cho HÔM NAY, TUẦN NÀY, TUẦN TRƯỚC, CẢ THÁNG.`
    );
    setTimeout(() => setSaveToast(null), 5000);
  };

  // 2.1 YÊU CẦU MỚI: XÁC NHẬN ĐIỂM DANH BÁN TRÚ (TỰ ĐỘNG NHẢY BÁO CÁO)
  // Áp dụng cho cả ngày hôm nay và điểm danh bán trú bổ sung của những ngày trước
  const handleConfirmAndCompleteBoarding = () => {
    if (!isDateEditable(selectedDate)) { notifyLockedDate(); return; }
    // ☁️ Đẩy số liệu bán trú lên thư mục Google Drive dùng chung NGAY LẬP TỨC
    googleDriveService.requestImmediatePush();
    let eatingCount = 0;
    let notEatingCount = 0;
    let absentCount = 0;

    const finalBoardingRecords: Record<string, string> = {};
    currentClassStudents.forEach(st => {
      const isAbsent = isStudentAbsent(st.id);
      if (isAbsent) {
        setStudentBoarding(st.id, 'not_eating', selectedDate);
        finalBoardingRecords[st.id] = 'not_eating';
        absentCount++;
      } else {
        const curB = currentBoardingMap[st.id] || 'eating';
        setStudentBoarding(st.id, curB, selectedDate);
        finalBoardingRecords[st.id] = curB;
        if (curB === 'eating') eatingCount++;
        else notEatingCount++;
      }
    });

    // ⚡ Lưu ngay dữ liệu vào CSDL máy chủ để BGH & Quản trị trường tổng hợp số liệu chuẩn xác 100%
    try { syncDatabaseNow(); } catch (_) {}

    // ⚡ Phát sóng realtime tức thì tới BGH / Quản trị nhà trường
    const boardingRecord = {
      classId: activeClassId,
      date: selectedDate,
      records: finalBoardingRecords
    };
    databaseService.broadcastAttendanceConfirmed({
      type: 'BOARDING_CONFIRMED',
      classId: activeClassId,
      className: activeClass?.name,
      date: selectedDate,
      boardingRecord,
      schoolName: currentUser?.schoolName || teacherProfile.schoolName,
      username: currentUser?.username
    }).catch(() => {});

    // Kích hoạt hiệu ứng tự động nhảy số liệu trên 4 thẻ báo cáo
    setStatsJustUpdated(true);
    setTimeout(() => setStatsJustUpdated(false), 4500);

    confetti({ particleCount: 60, spread: 70 });
    setSaveToast(
      `✓ ĐÃ XÁC NHẬN ĐIỂM DANH BÁN TRÚ ${isPastDateSelected ? `BỔ SUNG NGÀY ${selectedDate}` : 'XONG'}! Ghi nhận ${eatingCount} suất ăn bán trú (${notEatingCount} em về nhà, ${absentCount} em vắng chuyên cần). Hệ thống đã tự động nhảy tổng hợp báo cáo cho HÔM NAY, TUẦN NÀY, TUẦN TRƯỚC, CẢ THÁNG.`
    );
    setTimeout(() => setSaveToast(null), 5000);
  };

  // 3. Điểm danh bán trú: Cả lớp ăn bán trú (tự động loại trừ học sinh vắng)
  const handleSelectAllBoarding = () => {
    let eatingCount = 0;
    let absentCount = 0;

    currentClassStudents.forEach(st => {
      if (!isStudentAbsent(st.id)) {
        setStudentBoarding(st.id, 'eating', selectedDate);
        eatingCount++;
      } else {
        setStudentBoarding(st.id, 'not_eating', selectedDate);
        absentCount++;
      }
    });

    confetti({ particleCount: 40, spread: 50 });
    setSaveToast(
      absentCount > 0
        ? `Đã ghi nhận ${eatingCount} học sinh ăn bán trú ngày ${selectedDate} (Đã tự động loại trừ ${absentCount} em vắng chuyên cần)!`
        : `Đã ghi nhận toàn bộ ${eatingCount} học sinh ăn bán trú ngày ${selectedDate}!`
    );
    setTimeout(() => setSaveToast(null), 3500);
  };

  // 3.1 Điểm danh nhanh cả lớp không ăn
  const handleSelectAllNotEating = () => {
    batchSetBoarding('not_eating', selectedDate);
    confetti({ particleCount: 30, spread: 45 });
    setSaveToast(`Đã ghi nhận toàn bộ ${currentClassStudents.length} học sinh KHÔNG ĂN / VỀ NHÀ ngày ${selectedDate}!`);
    setTimeout(() => setSaveToast(null), 3000);
  };

  // 3.2 Tích chọn nhiều học sinh ăn bán trú
  const toggleSelectBoardingStudent = (id: string) => {
    setSelectedBoardingStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllBoardingFiltered = () => {
    if (selectedBoardingStudentIds.length === filteredBoardingStudents.length) {
      setSelectedBoardingStudentIds([]);
    } else {
      setSelectedBoardingStudentIds(filteredBoardingStudents.map(s => s.id));
    }
  };

  const handleBatchSetSelectedBoarding = (status: 'eating' | 'not_eating') => {
    if (selectedBoardingStudentIds.length === 0) return;

    if (status === 'eating') {
      let applied = 0;
      let blocked = 0;
      selectedBoardingStudentIds.forEach(id => {
        if (!isStudentAbsent(id)) {
          setStudentBoarding(id, 'eating', selectedDate);
          applied++;
        } else {
          blocked++;
        }
      });
      const label = BOARDING_CONFIG['eating'].label;
      if (blocked > 0) {
        setSaveToast(`Đã cập nhật "${label}" cho ${applied} em (${blocked} em vắng chuyên cần bị khóa không được ăn bán trú)!`);
      } else {
        setSaveToast(`Đã cập nhật trạng thái "${label}" cho ${applied} học sinh được chọn!`);
      }
    } else {
      selectedBoardingStudentIds.forEach(id => {
        setStudentBoarding(id, 'not_eating', selectedDate);
      });
      setSaveToast(`Đã cập nhật trạng thái "Không ăn / Về nhà" cho ${selectedBoardingStudentIds.length} học sinh được chọn!`);
    }

    setSelectedBoardingStudentIds([]);
    confetti({ particleCount: 40, spread: 60 });
    setTimeout(() => setSaveToast(null), 3000);
  };

  // 4. THỐNG KÊ CHI TIẾT & TỶ LỆ % TỰ ĐỘNG NHẢY CHO:
  // HÔM NAY • TUẦN NÀY • TUẦN TRƯỚC • CẢ THÁNG
  const periodStats = useMemo(() => {
    const totalStudents = currentClassStudents.length;

    // Use REAL current date as reference point for Today, This Week, Last Week, This Month
    const realToday = new Date();
    const currentDay = realToday.getDay();
    const diffToMonday = realToday.getDate() - currentDay + (currentDay === 0 ? -6 : 1);

    const thisWeekMon = new Date(realToday.getFullYear(), realToday.getMonth(), diffToMonday);
    const thisWeekSun = new Date(thisWeekMon.getFullYear(), thisWeekMon.getMonth(), thisWeekMon.getDate() + 6);

    const lastWeekMon = new Date(thisWeekMon.getFullYear(), thisWeekMon.getMonth(), thisWeekMon.getDate() - 7);
    const lastWeekSun = new Date(lastWeekMon.getFullYear(), lastWeekMon.getMonth(), lastWeekMon.getDate() + 6);

    const startOfMonth = new Date(realToday.getFullYear(), realToday.getMonth(), 1);
    const endOfMonth = new Date(realToday.getFullYear(), realToday.getMonth() + 1, 0);

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const calcRange = (fromStr: string, toStr: string, label: string) => {
      const aRecs = attendanceRecords.filter(r => r.classId === activeClassId && r.date >= fromStr && r.date <= toStr);
      const bRecs = boardingRecords.filter(r => r.classId === activeClassId && r.date >= fromStr && r.date <= toStr);

      const sessions = Math.max(1, aRecs.length);
      let present = 0;
      let late = 0;
      let sick = 0;
      let excused = 0;
      let unexcused = 0;

      aRecs.forEach(r => {
        Object.values(r.records).forEach(status => {
          if (status === 'present') present++;
          else if (status === 'late') late++;
          else if (status === 'sick') sick++;
          else if (status === 'excused') excused++;
          else if (status === 'unexcused') unexcused++;
        });
      });

      let boardingEating = 0;
      bRecs.forEach(r => {
        const correspondingAtt = aRecs.find(a => a.date === r.date);
        Object.entries(r.records).forEach(([sId, bStatus]) => {
          const aStatus = correspondingAtt?.records[sId];
          const isAbsent = aStatus === 'sick' || aStatus === 'excused' || aStatus === 'unexcused' || aStatus === 'other';
          if (bStatus === 'eating' && !isAbsent) {
            boardingEating++;
          }
        });
      });

      const totalStudentSlots = aRecs.length > 0 ? aRecs.length * totalStudents : totalStudents;
      const attendanceRate = totalStudentSlots > 0 ? Math.round((present / totalStudentSlots) * 100) : 100;
      const boardingRate = totalStudentSlots > 0 ? Math.round((boardingEating / totalStudentSlots) * 100) : 0;

      return {
        label,
        totalStudents,
        sessions: aRecs.length,
        present,
        late,
        sick,
        excused,
        unexcused,
        totalAbsent: sick + excused + unexcused,
        attendanceRate,
        boardingEating,
        boardingRate
      };
    };

    // Real Today stats
    const todayARec = attendanceRecords.find(r => r.classId === activeClassId && r.date === realTodayStr);
    const todayBRec = boardingRecords.find(r => r.classId === activeClassId && r.date === realTodayStr);
    const todayAMap = todayARec?.records || {};
    const todayBMap = todayBRec?.records || {};

    let todayPresent = 0;
    let todayLate = 0;
    let todaySick = 0;
    let todayExcused = 0;
    let todayUnexcused = 0;
    let todayEating = 0;

    currentClassStudents.forEach(s => {
      const st = todayAMap[s.id] || 'present';
      if (st === 'present') todayPresent++;
      else if (st === 'late') todayLate++;
      else if (st === 'sick') todaySick++;
      else if (st === 'excused') todayExcused++;
      else if (st === 'unexcused') todayUnexcused++;

      const isAbs = st === 'sick' || st === 'excused' || st === 'unexcused' || st === 'other';
      if (!isAbs && (todayBMap[s.id] || 'eating') === 'eating') {
        todayEating++;
      }
    });

    const todayAttRate = totalStudents > 0 ? Math.round((todayPresent / totalStudents) * 100) : 100;
    const todayBRate = totalStudents > 0 ? Math.round((todayEating / totalStudents) * 100) : 0;

    return {
      today: {
        label: realTodayStr,
        totalStudents,
        sessions: 1,
        present: todayPresent,
        late: todayLate,
        sick: todaySick,
        excused: todayExcused,
        unexcused: todayUnexcused,
        totalAbsent: todaySick + todayExcused + todayUnexcused,
        attendanceRate: todayAttRate,
        boardingEating: todayEating,
        boardingRate: todayBRate
      },
      thisWeek: calcRange(fmt(thisWeekMon), fmt(thisWeekSun), 'Tuần này'),
      lastWeek: calcRange(fmt(lastWeekMon), fmt(lastWeekSun), 'Tuần trước'),
      thisMonth: calcRange(fmt(startOfMonth), fmt(endOfMonth), 'Tháng này')
    };
  }, [attendanceRecords, boardingRecords, activeClassId, currentClassStudents, realTodayStr]);

  // Selected date stats (useful when supplementing past days)
  const selectedDateStats = useMemo(() => {
    const totalStudents = currentClassStudents.length;
    let present = 0;
    let late = 0;
    let sick = 0;
    let excused = 0;
    let unexcused = 0;
    let eating = 0;

    currentClassStudents.forEach(s => {
      const st = currentStatusMap[s.id] || 'present';
      if (st === 'present') present++;
      else if (st === 'late') late++;
      else if (st === 'sick') sick++;
      else if (st === 'excused') excused++;
      else if (st === 'unexcused') unexcused++;

      const isAbs = st === 'sick' || st === 'excused' || st === 'unexcused' || st === 'other';
      if (!isAbs && (currentBoardingMap[s.id] || 'eating') === 'eating') {
        eating++;
      }
    });

    const totalAbsent = sick + excused + unexcused;
    const attRate = totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 100;
    const bRate = totalStudents > 0 ? Math.round((eating / totalStudents) * 100) : 0;

    return {
      present,
      late,
      sick,
      excused,
      unexcused,
      totalAbsent,
      eating,
      attRate,
      bRate
    };
  }, [currentClassStudents, currentStatusMap, currentBoardingMap]);

  // Group stats for class
  const groupStats = useMemo(() => {
    const groups = ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'];
    return groups.map(groupName => {
      const gStudents = currentClassStudents.filter(s => (s.group || 'Tổ 1') === groupName);
      const total = gStudents.length;
      const present = gStudents.filter(s => (currentStatusMap[s.id] || 'present') === 'present').length;
      const eating = gStudents.filter(s => !isStudentAbsent(s.id) && (currentBoardingMap[s.id] || 'eating') === 'eating').length;

      const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 100;
      const boardingRate = total > 0 ? Math.round((eating / total) * 100) : 0;

      return {
        groupName,
        total,
        present,
        attendanceRate,
        boardingEating: eating,
        boardingRate
      };
    });
  }, [currentClassStudents, currentStatusMap, currentBoardingMap]);

  // Copy kitchen message
  const handleCopyKitchenReport = () => {
    const eatingStudents = currentClassStudents.filter(s => !isStudentAbsent(s.id) && (currentBoardingMap[s.id] || 'eating') === 'eating');
    const absentStudents = currentClassStudents.filter(s => isStudentAbsent(s.id));
    const notEatingStudents = currentClassStudents.filter(s => !isStudentAbsent(s.id) && currentBoardingMap[s.id] === 'not_eating');

    const msg = `🍱 BÁO CÁO SUẤT ĂN BÁN TRÚ 🍱\n` +
      `📅 Ngày: ${selectedDate} (${getDayOfWeekName(selectedDate)})\n` +
      `🏫 Trường: ${teacherProfile.schoolName || 'Trường học'}\n` +
      `👥 Lớp: ${activeClass?.name || 'Lớp học'} (GVCN: ${teacherProfile.name})\n` +
      `--------------------------------\n` +
      `🍽️ TỔNG SỐ SUẤT ĂN ĐĂNG KÝ: ${eatingStudents.length} suất (Tỷ lệ: ${selectedDateStats.bRate}%)\n` +
      `🏠 Không ăn / Về nhà: ${notEatingStudents.length + absentStudents.length} em\n` +
      (absentStudents.length > 0 
        ? `   ↳ Trong đó có ${absentStudents.length} em vắng chuyên cần không ăn (${absentStudents.map(s => `${s.name} - ${getStudentAbsentReason(s.id)}`).join(', ')})\n` 
        : '') +
      `--------------------------------\n` +
      `Xin cảm ơn bộ phận cấp dưỡng & nhà bếp!`;

    navigator.clipboard.writeText(msg);
    setCopiedReportToast(true);
    setTimeout(() => setCopiedReportToast(false), 3000);
  };

  // Filtered Students for Attendance
  const filteredAttendanceStudents = currentClassStudents.filter(st => {
    const nameMatch = st.name.toLowerCase().includes(searchQuery.toLowerCase()) || st.stt.toString().includes(searchQuery);
    if (!nameMatch) return false;

    const stStatus = currentStatusMap[st.id] || 'present';
    if (filterType === 'present') return stStatus === 'present';
    if (filterType === 'sick') return stStatus === 'sick';
    if (filterType === 'excused') return stStatus === 'excused';
    if (filterType === 'unexcused') return stStatus === 'unexcused';
    if (filterType === 'late') return stStatus === 'late';
    if (filterType === 'absent') return stStatus === 'sick' || stStatus === 'excused' || stStatus === 'unexcused' || stStatus === 'other';
    return true;
  });

  // Filtered Students for Boarding
  const filteredBoardingStudents = currentClassStudents.filter(st => {
    const nameMatch = st.name.toLowerCase().includes(searchQuery.toLowerCase()) || st.stt.toString().includes(searchQuery);
    if (!nameMatch) return false;

    const isAbsent = isStudentAbsent(st.id);
    const bStatus = isAbsent ? 'not_eating' : (currentBoardingMap[st.id] || 'eating');
    if (boardingFilterType !== 'all' && bStatus !== boardingFilterType) return false;
    return true;
  });

  return (
    <div className="p-2.5 sm:p-3.5 md:p-4 max-w-7xl mx-auto space-y-2.5 sm:space-y-3">
      {/* Top Banner & Mode Toggle: Chuyên Cần vs Ăn Bán Trú vs Thống Kê Biểu Đồ */}
      <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover-zoom-card">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/20 shrink-0">
            {activeTab === 'daily' ? <CheckSquare className="w-5 h-5" /> : activeTab === 'boarding' ? <Utensils className="w-5 h-5" /> : <BarChart3 className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight uppercase flex items-center gap-2">
              <span>ĐIỂM DANH & CHUYÊN CẦN LỚP {activeClass?.name}</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black">
                {currentClassStudents.length} học sinh
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
              {formatDateDisplay(selectedDate)} • GVCN: {activeClass?.teacherName || teacherProfile.name}
            </p>
          </div>
        </div>

        {/* 3 Main Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start lg:self-auto">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 hover-zoom-btn uppercase cursor-pointer ${
              activeTab === 'daily' 
                ? 'bg-white text-emerald-800 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>1. ĐIỂM DANH LỚP</span>
          </button>

          <button
            onClick={() => setActiveTab('boarding')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 hover-zoom-btn uppercase cursor-pointer ${
              activeTab === 'boarding' 
                ? 'bg-white text-indigo-700 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Utensils className="w-3.5 h-3.5 text-indigo-600" />
            <span>2. ĂN BÁN TRÚ</span>
          </button>

          <button
            onClick={() => setActiveTab('charts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 hover-zoom-btn uppercase cursor-pointer ${
              activeTab === 'charts' 
                ? 'bg-white text-purple-800 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
            <span>3. THỐNG KÊ & BIỂU ĐỒ</span>
          </button>
        </div>
      </div>

      {saveToast && (
        <div className="bg-emerald-50 border-2 border-emerald-400 text-emerald-950 p-4 rounded-2xl text-xs flex items-center gap-3 shadow-md animate-in fade-in duration-150">
          <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <span className="font-bold leading-relaxed">{saveToast}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HISTORICAL ATTENDANCE TOOLBAR & NOTIFICATION (User Request 1) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-4 md:p-5 shadow-xs space-y-4 hover-zoom-card">
        {/* Date Selector Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700 font-black">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-black text-slate-900 uppercase">
                CHỌN NGÀY ĐIỂM DANH & ĐIỂM DANH BỔ SUNG CÁC NGÀY TRƯỚC:
              </span>
              <p className="text-[11px] text-slate-500 font-medium">
                Cho phép điểm danh lại hoặc bổ sung ngày quá khứ. Bấm <strong>Xác nhận điểm danh</strong> để tự động nhảy số liệu báo cáo 4 kỳ.
              </p>
            </div>
          </div>

          {/* Quick Date Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 self-start lg:self-auto bg-slate-50 p-1.5 rounded-2xl border border-slate-200 text-xs">
            <button
              onClick={() => changeDateByDays(-1)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Lùi 1 ngày"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setSelectedDate(realTodayStr)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${
                selectedDate === realTodayStr 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Hôm Nay
            </button>

            <button
              onClick={() => setSelectedDate(getDateDaysAgo(1))}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${
                selectedDate === getDateDaysAgo(1) 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Hôm Qua
            </button>

            <button
              onClick={() => setSelectedDate(getDateDaysAgo(2))}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer hidden sm:inline-block ${
                selectedDate === getDateDaysAgo(2) 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              2 ngày trước
            </button>

            {isDateEditable(getLastFridayStr()) && <button
              onClick={() => setSelectedDate(getLastFridayStr())}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer hidden md:inline-block ${
                selectedDate === getLastFridayStr() 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Thứ 6 tuần trước
            </button>}

            {/* Custom Date Input */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 font-bold text-slate-800 bg-white rounded-xl border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <input
                type="date"
                value={selectedDate}
                min={minEditableDateStr}
                max={realTodayStr}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent font-black text-slate-900 focus:outline-none cursor-pointer text-xs"
              />
            </div>

            <button
              onClick={() => changeDateByDays(1)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Tiến 1 ngày"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Historical Mode Alert Banner */}
        {isPastDateSelected && (
          <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                <History className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-black text-amber-950 block">
                  {activeTab === 'boarding'
                    ? `🕒 ĐANG Ở CHẾ ĐỘ ĐIỂM DANH BÁN TRÚ BỔ SUNG NGÀY: ${formatDateDisplay(selectedDate)}`
                    : `🕒 ĐANG Ở CHẾ ĐỘ ĐIỂM DANH CHUYÊN CẦN BỔ SUNG NGÀY: ${formatDateDisplay(selectedDate)}`}
                </span>
                <span className="text-[11px] text-amber-800 font-medium">
                  {activeTab === 'boarding'
                    ? 'Kiểm tra danh sách học sinh ăn bán trú, sau đó bấm "XÁC NHẬN ĐIỂM DANH BÁN TRÚ" để hệ thống lưu và tự động nhảy tổng hợp số liệu 4 kỳ.'
                    : 'Đánh dấu các học sinh vắng, sau đó bấm "XÁC NHẬN ĐIỂM DANH" để hệ thống tự động ghi nhận Có mặt cho các em còn lại và tự động nhảy tổng hợp số liệu cho Hôm nay, Tuần này, Tuần trước, Cả tháng.'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedDate(realTodayStr)}
              className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto shrink-0"
            >
              ↩ Quay về Hôm Nay
            </button>
          </div>
        )}

        {/* 4 PERIODS KPI CARDS: HÔM NAY • TUẦN NÀY • TUẦN TRƯỚC • CẢ THÁNG (User Request) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">
              TỔNG HỢP BÁO CÁO 4 KỲ (TỰ ĐỘNG NHẢY KHI XÁC NHẬN ĐIỂM DANH):
            </span>
            {statsJustUpdated && (
              <span className="animate-pulse bg-emerald-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 shadow-xs">
                <Sparkles className="w-3 h-3" />
                <span>✨ Vừa tự động nhảy số liệu mới!</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. HÔM NAY */}
            <div className={`p-4 rounded-2xl border transition-all duration-300 space-y-2 ${
              statsJustUpdated 
                ? 'bg-emerald-100/90 border-emerald-400 ring-4 ring-emerald-400/40 shadow-md scale-[1.01]' 
                : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 hover-zoom-card'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-emerald-800">HÔM NAY</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono font-black text-xs shadow-2xs">
                  {periodStats.today.attendanceRate}%
                </span>
              </div>
              <div>
                <div className="text-2xl font-black font-mono text-emerald-950">
                  {periodStats.today.present} <span className="text-xs font-bold text-emerald-700">/ {currentClassStudents.length} em có mặt</span>
                </div>
                <div className="text-[11px] text-emerald-800 mt-1 font-medium">
                  Vắng: <strong className="text-rose-700">{periodStats.today.totalAbsent} em</strong> ({periodStats.today.sick} ốm, {periodStats.today.excused} phép, {periodStats.today.unexcused} không phép)
                </div>
              </div>
              <div className="pt-2 border-t border-emerald-200 flex items-center justify-between text-xs font-bold text-indigo-900">
                <span>Ăn bán trú:</span>
                <span className="font-mono font-black">{periodStats.today.boardingEating} suất ({periodStats.today.boardingRate}%)</span>
              </div>
            </div>

            {/* 2. TUẦN NÀY */}
            <div className={`p-4 rounded-2xl border transition-all duration-300 space-y-2 ${
              statsJustUpdated 
                ? 'bg-blue-100/90 border-blue-400 ring-4 ring-blue-400/40 shadow-md scale-[1.01]' 
                : 'bg-gradient-to-br from-blue-50 to-sky-50 border-blue-200 hover-zoom-card'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-blue-800">TUẦN NÀY</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-mono font-black text-xs shadow-2xs">
                  {periodStats.thisWeek.attendanceRate}%
                </span>
              </div>
              <div>
                <div className="text-2xl font-black font-mono text-blue-950">
                  {periodStats.thisWeek.attendanceRate}% <span className="text-xs font-bold text-blue-700">chuyên cần</span>
                </div>
                <div className="text-[11px] text-blue-800 mt-1 font-medium">
                  Tổng lượt có mặt: <strong className="text-blue-900">{periodStats.thisWeek.present} lượt</strong> ({periodStats.thisWeek.sessions} buổi)
                </div>
              </div>
              <div className="pt-2 border-t border-blue-200 flex items-center justify-between text-xs font-bold text-indigo-900">
                <span>Ăn bán trú:</span>
                <span className="font-mono font-black">{periodStats.thisWeek.boardingEating} suất ({periodStats.thisWeek.boardingRate}%)</span>
              </div>
            </div>

            {/* 3. TUẦN TRƯỚC */}
            <div className={`p-4 rounded-2xl border transition-all duration-300 space-y-2 ${
              statsJustUpdated 
                ? 'bg-indigo-100/90 border-indigo-400 ring-4 ring-indigo-400/40 shadow-md scale-[1.01]' 
                : 'bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200 hover-zoom-card'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-indigo-800">TUẦN TRƯỚC</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white font-mono font-black text-xs shadow-2xs">
                  {periodStats.lastWeek.attendanceRate}%
                </span>
              </div>
              <div>
                <div className="text-2xl font-black font-mono text-indigo-950">
                  {periodStats.lastWeek.attendanceRate}% <span className="text-xs font-bold text-indigo-700">chuyên cần</span>
                </div>
                <div className="text-[11px] text-indigo-800 mt-1 font-medium">
                  Tổng lượt có mặt: <strong className="text-indigo-900">{periodStats.lastWeek.present} lượt</strong> ({periodStats.lastWeek.sessions} buổi)
                </div>
              </div>
              <div className="pt-2 border-t border-indigo-200 flex items-center justify-between text-xs font-bold text-indigo-900">
                <span>Ăn bán trú:</span>
                <span className="font-mono font-black">{periodStats.lastWeek.boardingEating} suất ({periodStats.lastWeek.boardingRate}%)</span>
              </div>
            </div>

            {/* 4. CẢ THÁNG */}
            <div className={`p-4 rounded-2xl border transition-all duration-300 space-y-2 ${
              statsJustUpdated 
                ? 'bg-purple-100/90 border-purple-400 ring-4 ring-purple-400/40 shadow-md scale-[1.01]' 
                : 'bg-gradient-to-br from-purple-50 to-fuchsia-50 border-purple-200 hover-zoom-card'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-purple-800">CẢ THÁNG</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white font-mono font-black text-xs shadow-2xs">
                  {periodStats.thisMonth.attendanceRate}%
                </span>
              </div>
              <div>
                <div className="text-2xl font-black font-mono text-purple-950">
                  {periodStats.thisMonth.attendanceRate}% <span className="text-xs font-bold text-purple-700">toàn tháng</span>
                </div>
                <div className="text-[11px] text-purple-800 mt-1 font-medium">
                  Tổng lượt có mặt: <strong className="text-purple-900">{periodStats.thisMonth.present} lượt</strong> ({periodStats.thisMonth.sessions} buổi)
                </div>
              </div>
              <div className="pt-2 border-t border-purple-200 flex items-center justify-between text-xs font-bold text-indigo-900">
                <span>Ăn bán trú:</span>
                <span className="font-mono font-black">{periodStats.thisMonth.boardingEating} suất ({periodStats.thisMonth.boardingRate}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. VIEW TAB: ĐIỂM DANH CHUYÊN CẦN */}
      {/* ========================================================================= */}
      {activeTab === 'daily' && (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="bg-white rounded-3xl border border-slate-200/90 p-4 md:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover-zoom-card">
            <div className="space-y-1">
              <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                <span>QUY TRÌNH ĐIỂM DANH THÔNG MINH</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isPastDateSelected 
                  ? `Đang bổ sung điểm danh ngày ${selectedDate}. Điểm danh xong bấm nút bên cạnh để tự động nhảy báo cáo.`
                  : 'Tích chọn các em vắng rồi bấm xác nhận, phần mềm sẽ tự động ghi nhận tất cả học sinh còn lại là CÓ MẶT.'}
              </p>
            </div>

            {/* Main Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* NÚT CỐT LÕI THEO YÊU CẦU: XÁC NHẬN ĐIỂM DANH (TỰ ĐỘNG CÒN LẠI CÓ MẶT & NHẢY BÁO CÁO) */}
              <button
                onClick={handleConfirmAndCompleteAttendance}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-600/30 transition-all hover-zoom-btn uppercase cursor-pointer"
                title="Bấm để xác nhận điểm danh: Tự động ghi nhận Có mặt cho tất cả học sinh chưa đánh dấu vắng và tự động nhảy báo cáo 4 kỳ"
              >
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>⚡ XÁC NHẬN ĐIỂM DANH (TỰ ĐỘNG NHẢY BÁO CÁO)</span>
              </button>

              {/* Nút Cả lớp có mặt */}
              <button
                onClick={handleSelectAllPresent}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black transition-all hover-zoom-btn uppercase cursor-pointer"
              >
                <span>CẢ LỚP CÓ MẶT</span>
              </button>

              {/* Nút Xuất Báo Cáo ẢNH PNG, PDF & Excel */}
              <button
                onClick={() => setIsExportModalOpen(true)}
                className="px-4 py-2.5 bg-gradient-to-r from-teal-50 to-indigo-50 hover:from-teal-100 hover:to-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover-zoom-btn uppercase cursor-pointer shadow-xs"
                title="Xuất ảnh PNG tổng hợp khổ ngang/dọc, file PDF chuẩn in ấn và file Excel"
              >
                <ImageIcon className="w-4 h-4 text-teal-600" />
                <span>XUẤT BÁO CÁO (ẢNH PNG • PDF • EXCEL)</span>
              </button>
            </div>
          </div>

          {/* KPI Summary Strip for Selected Date */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 shadow-2xs hover-zoom-card">
              <span className="text-[10px] font-black uppercase text-emerald-700">Có mặt</span>
              <div className="text-2xl font-black font-mono text-emerald-800 mt-1">
                {selectedDateStats.present} <span className="text-xs font-bold text-emerald-600">/ {currentClassStudents.length}</span>
              </div>
            </div>

            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3.5 shadow-2xs hover-zoom-card">
              <span className="text-[10px] font-black uppercase text-blue-700">Vắng có phép</span>
              <div className="text-2xl font-black font-mono text-blue-800 mt-1">
                {selectedDateStats.excused} <span className="text-xs font-bold text-blue-600">em</span>
              </div>
            </div>

            <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-3.5 shadow-2xs hover-zoom-card">
              <span className="text-[10px] font-black uppercase text-rose-700">Vắng không phép</span>
              <div className="text-2xl font-black font-mono text-rose-800 mt-1">
                {selectedDateStats.unexcused} <span className="text-xs font-bold text-rose-600">em</span>
              </div>
            </div>

            <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-3.5 shadow-2xs hover-zoom-card">
              <span className="text-[10px] font-black uppercase text-purple-700">Nghỉ ốm</span>
              <div className="text-2xl font-black font-mono text-purple-800 mt-1">
                {selectedDateStats.sick} <span className="text-xs font-bold text-purple-600">em</span>
              </div>
            </div>

            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 shadow-2xs hover-zoom-card col-span-2 sm:col-span-1">
              <span className="text-[10px] font-black uppercase text-amber-700">Đi muộn</span>
              <div className="text-2xl font-black font-mono text-amber-800 mt-1">
                {selectedDateStats.late} <span className="text-xs font-bold text-amber-600">em</span>
              </div>
            </div>
          </div>

          {/* Student Attendance List */}
          <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4 hover-zoom-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all hover-zoom-btn cursor-pointer ${
                    filterType === 'all' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Tất cả ({currentClassStudents.length})
                </button>
                <button
                  onClick={() => setFilterType('present')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all hover-zoom-btn cursor-pointer ${
                    filterType === 'present' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Có mặt ({selectedDateStats.present})
                </button>
                <button
                  onClick={() => setFilterType('excused')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all hover-zoom-btn cursor-pointer ${
                    filterType === 'excused' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Có phép ({selectedDateStats.excused})
                </button>
                <button
                  onClick={() => setFilterType('unexcused')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all hover-zoom-btn cursor-pointer ${
                    filterType === 'unexcused' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Không phép ({selectedDateStats.unexcused})
                </button>
                <button
                  onClick={() => setFilterType('sick')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all hover-zoom-btn cursor-pointer ${
                    filterType === 'sick' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Nghỉ ốm ({selectedDateStats.sick})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm học sinh theo tên, STT..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                />
              </div>
            </div>

            {/* List Rows */}
            <div className="space-y-2 pt-1">
              {filteredAttendanceStudents.map((student) => {
                const currentStatus = currentStatusMap[student.id] || 'present';
                const statusCfg = STATUS_CONFIG[currentStatus];

                return (
                  <div
                    key={student.id}
                    className="flex flex-col lg:flex-row lg:items-center justify-between p-3.5 bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-2xl gap-3 transition-colors hover-zoom-interactive"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-7 h-7 rounded-xl bg-slate-200 text-slate-800 flex items-center justify-center text-xs font-mono font-black shrink-0">
                        {student.stt}
                      </span>
                      <img
                        src={student.avatar}
                        alt={student.name}
                        className="w-10 h-10 rounded-xl object-cover object-center bg-white border border-slate-200 shrink-0 shadow-2xs"
                        onError={(e) => handleAvatarImgError(e, student.gender, student.name)}
                      />
                      <div className="truncate">
                        <div className="text-xs md:text-sm font-black text-slate-900 truncate flex items-center gap-2">
                          <span>{student.name}</span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${statusCfg.badgeClass}`}>
                            {statusCfg.label}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5 font-medium">
                          <span>{student.gender}</span>
                          <span>• {student.group || 'Tổ 1'}</span>
                          {student.birthDate && <span>• NS: {student.birthDate}</span>}
                        </div>
                      </div>
                    </div>

                    {/* 4 Primary Required Status Buttons + Late option */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {((['present', 'excused', 'unexcused', 'sick', 'late'] as AttendanceStatus[])).map((statusKey) => {
                        const cfg = STATUS_CONFIG[statusKey];
                        const isSelected = currentStatus === statusKey;

                        return (
                          <button
                            key={statusKey}
                            onClick={() => handleStatusChange(student.id, statusKey)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all hover-zoom-btn cursor-pointer uppercase ${
                              isSelected ? cfg.activeClass : cfg.inactiveClass
                            }`}
                          >
                            <span>{cfg.short}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VIEW TAB: ĐIỂM DANH ĂN BÁN TRÚ */}
      {/* ========================================================================= */}
      {activeTab === 'boarding' && (
        <div className="space-y-4">
          {/* BẢNG ĐIỀU KHIỂN BÁN TRÚ: TIÊU ĐỀ, NÚT LỆNH & THÔNG TIN GỌN GÀNG */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover-zoom-card space-y-3.5">
            {/* Hàng 1: Tiêu đề, Badge ngày & Nút xác nhận cốt lõi */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-xs shrink-0">
                  <Utensils className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm md:text-base font-black uppercase text-slate-900 tracking-wide">
                      ĐIỂM DANH ĂN BÁN TRÚ
                    </h3>
                    {isPastDateSelected ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-700" />
                        <span>Bổ sung ngày {selectedDate}</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Hôm nay • {selectedDate}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Quản lý suất ăn bán trú theo ngày • Tự động đồng bộ và nhảy tổng hợp báo cáo 4 kỳ
                  </p>
                </div>
              </div>

              {/* NÚT LỆNH CỐT LÕI: XÁC NHẬN BÁN TRÚ (TỰ ĐỘNG NHẢY BÁO CÁO) */}
              <button
                onClick={handleConfirmAndCompleteBoarding}
                className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-600/25 transition-all hover-zoom-btn uppercase cursor-pointer shrink-0 self-start md:self-auto"
                title="Bấm để xác nhận điểm danh bán trú: Tự động lưu suất ăn và tự động nhảy tổng hợp báo cáo 4 kỳ"
              >
                <Sparkles className="w-4 h-4 text-emerald-200 shrink-0" />
                <span>⚡ XÁC NHẬN BÁN TRÚ (NHẢY BÁO CÁO)</span>
              </button>
            </div>

            {/* Hàng 2: Các nút lệnh phụ gom nhóm gọn gàng & trực quan */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
              {/* Nhóm thao tác nhanh toàn lớp */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">
                  Thao tác nhanh:
                </span>
                <button
                  onClick={handleSelectAllBoarding}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all hover-zoom-btn flex items-center gap-1.5 cursor-pointer"
                  title="Ghi nhận tất cả học sinh có mặt trong lớp ăn bán trú (tự động loại trừ học sinh vắng)"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>Cả lớp ăn bán trú</span>
                </button>

                <button
                  onClick={handleSelectAllNotEating}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all hover-zoom-btn flex items-center gap-1.5 cursor-pointer"
                  title="Đánh dấu cả lớp không ăn / về nhà ăn trưa"
                >
                  <span>🏠</span>
                  <span>Cả lớp về nhà</span>
                </button>
              </div>

              {/* Nhóm tiện ích: Báo bếp Zalo & Xuất báo cáo */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCopyKitchenReport}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all hover-zoom-btn cursor-pointer"
                  title="Sao chép nội dung báo suất ăn gửi Zalo cho nhà bếp"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>{copiedReportToast ? '✓ Đã sao chép!' : 'Báo bếp Zalo'}</span>
                </button>

                <button
                  onClick={() => setIsExportModalOpen(true)}
                  className="px-3 py-1.5 bg-gradient-to-r from-teal-50 to-indigo-50 hover:from-teal-100 hover:to-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all hover-zoom-btn cursor-pointer"
                  title="Xuất báo cáo ảnh PNG khổ ngang/dọc, PDF & Excel chi tiết"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>Xuất báo cáo (PNG • PDF)</span>
                </button>
              </div>
            </div>
          </div>

          {/* THÔNG TIN TỔNG QUAN: 3 THẺ SỐ LIỆU GỌN GÀNG, CÂN ĐỐI & RÕ RÀNG */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Thẻ 1: Suất ăn bán trú */}
            <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-200 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between gap-3 hover-zoom-card">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">
                    Ăn bán trú tại trường
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-mono font-bold">
                    {selectedDateStats.bRate}%
                  </span>
                </div>
                <div className="text-2xl font-black font-mono text-emerald-950">
                  {selectedDateStats.eating} <span className="text-xs font-bold text-slate-500 font-sans">/ {currentClassStudents.length} học sinh</span>
                </div>
                <p className="text-[11px] text-emerald-700 font-medium truncate">
                  Đã đăng ký ăn bán trú ngày {selectedDate}
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Utensils className="w-4 h-4" />
              </div>
            </div>

            {/* Thẻ 2: Về nhà buổi trưa */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between gap-3 hover-zoom-card">
              <div className="space-y-0.5 min-w-0">
                <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">
                  Không ăn / Về nhà
                </span>
                <div className="text-2xl font-black font-mono text-slate-800">
                  {currentClassStudents.length - selectedDateStats.eating} <span className="text-xs font-bold text-slate-500 font-sans">học sinh</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium truncate">
                  Gia đình đón về ăn trưa hoặc vắng mặt
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-200/80 text-slate-700 flex items-center justify-center text-sm shrink-0">
                🏠
              </div>
            </div>

            {/* Thẻ 3: Vắng chuyên cần (Khóa tự động) */}
            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between gap-3 hover-zoom-card">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider">
                    Vắng chuyên cần
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold">
                    Khóa bán trú
                  </span>
                </div>
                <div className="text-2xl font-black font-mono text-rose-700">
                  {selectedDateStats.totalAbsent} <span className="text-xs font-bold text-slate-500 font-sans">học sinh</span>
                </div>
                <p className="text-[11px] text-rose-600 font-medium truncate">
                  Đã vắng, tự động khóa không báo ăn
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Student Boarding List */}
          <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4 hover-zoom-card">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setBoardingFilterType('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all hover-zoom-btn cursor-pointer ${
                    boardingFilterType === 'all' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Tất cả ({currentClassStudents.length})
                </button>
                <button
                  onClick={() => setBoardingFilterType('eating')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all hover-zoom-btn cursor-pointer ${
                    boardingFilterType === 'eating' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Ăn bán trú ({selectedDateStats.eating})
                </button>
                <button
                  onClick={() => setBoardingFilterType('not_eating')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all hover-zoom-btn cursor-pointer ${
                    boardingFilterType === 'not_eating' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Không ăn / Về nhà ({currentClassStudents.length - selectedDateStats.eating})
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Nút Chọn Tất Cả / Bỏ Chọn */}
                {filteredBoardingStudents.length > 0 && (
                  <button
                    onClick={handleSelectAllBoardingFiltered}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 hover-zoom-btn shrink-0 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{selectedBoardingStudentIds.length === filteredBoardingStudents.length && filteredBoardingStudents.length > 0 ? 'Bỏ chọn' : 'Chọn tất cả'}</span>
                  </button>
                )}

                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Tìm học sinh theo tên..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Batch actions bar */}
            {selectedBoardingStudentIds.length > 0 && (
              <div className="p-3.5 bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50 border-2 border-indigo-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                    {selectedBoardingStudentIds.length}
                  </span>
                  <div>
                    <span className="text-xs font-black text-indigo-950 block">
                      Đang chọn {selectedBoardingStudentIds.length} học sinh
                    </span>
                    <span className="text-[10px] text-indigo-700 font-medium">
                      Đổi nhanh trạng thái bán trú đồng loạt (tự động loại trừ các em vắng chuyên cần):
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleBatchSetSelectedBoarding('eating')}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all hover-zoom-btn cursor-pointer"
                  >
                    <span>🍱</span>
                    <span>Đánh dấu Ăn bán trú</span>
                  </button>

                  <button
                    onClick={() => handleBatchSetSelectedBoarding('not_eating')}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all hover-zoom-btn cursor-pointer"
                  >
                    <span>🏠</span>
                    <span>Đánh dấu Không ăn / Về nhà</span>
                  </button>

                  <button
                    onClick={() => setSelectedBoardingStudentIds([])}
                    className="px-3 py-2 text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Hủy chọn
                  </button>
                </div>
              </div>
            )}

            {/* Boarding rows */}
            <div className="space-y-2 pt-1">
              {filteredBoardingStudents.map((student) => {
                const isAbsent = isStudentAbsent(student.id);
                const absentReason = getStudentAbsentReason(student.id);
                const currentStatus = isAbsent ? 'not_eating' : (currentBoardingMap[student.id] || 'eating');
                const isChecked = selectedBoardingStudentIds.includes(student.id);

                return (
                  <div
                    key={student.id}
                    className={`flex flex-col lg:flex-row lg:items-center justify-between p-3.5 rounded-2xl gap-3 transition-all hover-zoom-interactive border ${
                      isAbsent
                        ? 'bg-rose-50/50 border-rose-200 opacity-90'
                        : isChecked 
                        ? 'bg-indigo-50/60 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs' 
                        : 'bg-slate-50/70 hover:bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectBoardingStudent(student.id)}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0"
                      />

                      <span className="w-7 h-7 rounded-xl bg-slate-200 text-slate-800 flex items-center justify-center text-xs font-mono font-black shrink-0">
                        {student.stt}
                      </span>
                      <img
                        src={student.avatar}
                        alt={student.name}
                        className="w-10 h-10 rounded-xl object-cover object-center bg-white border border-slate-200 shrink-0 shadow-2xs"
                        onError={(e) => handleAvatarImgError(e, student.gender, student.name)}
                      />
                      <div className="truncate">
                        <div className="text-xs md:text-sm font-black text-slate-900 truncate flex items-center gap-2">
                          <span>{student.name}</span>
                          {isAbsent && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 font-extrabold text-[10px] border border-rose-200 flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              <span>Vắng chuyên cần: {absentReason}</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5 font-medium">
                          <span>{student.gender}</span>
                          <span>• {student.group || 'Tổ 1'}</span>
                          {student.birthDate && <span>• NS: {student.birthDate}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pl-7 lg:pl-0">
                      {/* QUY ĐỊNH BẮT BUỘC: Học sinh đã điểm danh vắng KHÔNG ĐƯỢC ĐIỂM DANH ĂN BÁN TRÚ NGÀY HÔM ĐÓ */}
                      {isAbsent ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 text-rose-800 rounded-xl text-xs font-bold border border-rose-200 shadow-2xs">
                          <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>Học sinh {absentReason?.toLowerCase()} - Khóa không được điểm danh ăn bán trú</span>
                        </div>
                      ) : (
                        ((['eating', 'not_eating'] as const)).map((statusKey) => {
                          const cfg = BOARDING_CONFIG[statusKey];
                          const isSelected = currentStatus === statusKey;

                          return (
                            <button
                              key={statusKey}
                              onClick={() => handleBoardingChange(student.id, statusKey)}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover-zoom-btn cursor-pointer ${
                                isSelected ? cfg.activeClass : cfg.inactiveClass
                              }`}
                            >
                              <span>{cfg.icon}</span>
                              <span>{cfg.label}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. VIEW TAB: THỐNG KÊ & BIỂU ĐỒ ĐỐI CHIẾU (User Request) */}
      {/* ========================================================================= */}
      {activeTab === 'charts' && (
        <AttendanceChartsView
          stats={periodStats}
          groupStats={groupStats}
          classes={classes}
          students={students}
          attendanceRecords={attendanceRecords}
          boardingRecords={boardingRecords}
          selectedDate={selectedDate}
          onOpenFullExportModal={() => setIsExportModalOpen(true)}
        />
      )}

      {/* ========================================================================= */}
      {/* EXPORT MODAL: XUẤT BÁO CÁO TỪNG LỚP / NHIỀU LỚP RA PDF VÀ EXCEL */}
      {/* ========================================================================= */}
      <AttendanceExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        selectedDate={selectedDate}
        activeClass={activeClass}
        classes={classes}
        students={students}
        currentClassStudents={currentClassStudents}
        attendanceRecords={attendanceRecords}
        boardingRecords={boardingRecords}
        teacherProfile={teacherProfile}
      />
    </div>
  );
};
