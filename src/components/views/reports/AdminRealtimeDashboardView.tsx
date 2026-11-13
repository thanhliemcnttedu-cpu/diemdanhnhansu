import { CoinIcon } from '../../common/CoinIcon';
import { writeReportXlsx } from '../../../utils/licensedExport';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';
import { databaseService } from '../../../services/databaseService';
import { googleDriveService } from '../../../services/googleDriveService';
import { 
  School, Building2, MapPin, Users, CheckSquare, Utensils, Coins, 
  TrendingUp, RefreshCw, Calendar, Award, Sparkles, Filter, 
  Download, ChevronRight, Wifi, Bell, Volume2, VolumeX, ArrowUpRight,
  ShieldCheck, AlertCircle, PieChart, BarChart3, CheckCircle2, XCircle, Clock,
  ChevronLeft, CalendarDays, CalendarRange, Clock3, Layers, ArrowDownAZ, GraduationCap,
  Cloud
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { playPointClink } from '../../../utils/audio';
import { DriveAttendanceStatsPanel } from './DriveAttendanceStatsPanel';

export type ReportTimeframe = 'day' | 'week' | 'month';

// Helper định dạng ngày chuẩn tiếng Việt DD/MM/YYYY
const formatDateVN = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

// Helper lấy chuỗi YYYY-MM-DD theo giờ địa phương
const toLocalDateString = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const AdminRealtimeDashboardView: React.FC = () => {
  const { 
    classes, students, attendanceRecords, boardingRecords, transactions,
    currentUser, isAdmin, isBgh, isSchoolAdmin, syncDatabaseNow, lastDbSyncTime,
    dbSyncStatus, schoolBranches, setAllUserData
  } = useClassroom();

  // 1. Bộ lọc phân cấp đa tầng (Multi-level Filter)
  // Cấp 1: 'all' (Toàn trường) | Tên Phân hiệu cụ thể
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  // Cấp 2: 'all' (Tất cả điểm trường) | Tên Điểm trường cụ thể
  const [selectedCampus, setSelectedCampus] = useState<string>('all');
  // Cấp 3: 'all' (Tất cả các khối) | 'Khối 1', 'Khối 2'...
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  // Chế độ sắp xếp bảng: 'abc' (Tự động theo thứ tự ABC) | 'coins' (Theo xu thi đua)
  const [classSortBy, setClassSortBy] = useState<'abc' | 'coins'>('abc');

  // =========================================================================
  // 🌟 KHUNG THỜI GIAN BÁO CÁO: THEO NGÀY • THEO TUẦN • THEO THÁNG
  // =========================================================================
  const [timeframe, setTimeframe] = useState<ReportTimeframe>('day');

  // Ngày hiện tại (Local)
  const todayStr = useMemo(() => toLocalDateString(new Date()), []);
  const currentMonthStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);

  // Trạng thái Realtime Engine
  const [lastEventTime, setLastEventTime] = useState<string>('');
  const [isPulseActive, setIsPulseActive] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState<boolean>(false);
  const [driveSyncMessage, setDriveSyncMessage] = useState<string>('');

  // Tính toán khoảng thời gian [startDate, endDate] & nhãn mô tả
  const dateRange = useMemo(() => {
    if (timeframe === 'day') {
      return {
        startDate: selectedDate,
        endDate: selectedDate,
        label: `Ngày ${formatDateVN(selectedDate)}`,
        shortLabel: formatDateVN(selectedDate),
        isCurrent: selectedDate === todayStr
      };
    }

    if (timeframe === 'week') {
      const parts = selectedWeekDate.split('-');
      const targetD = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const dayOfWeek = targetD.getDay(); // 0: Chủ nhật, 1: Thứ hai...
      const diffToMonday = targetD.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      
      const monDate = new Date(targetD.getFullYear(), targetD.getMonth(), diffToMonday);
      const sunDate = new Date(monDate.getFullYear(), monDate.getMonth(), monDate.getDate() + 6);

      const monStr = toLocalDateString(monDate);
      const sunStr = toLocalDateString(sunDate);

      return {
        startDate: monStr,
        endDate: sunStr,
        label: `Tuần từ ${formatDateVN(monStr)} đến ${formatDateVN(sunStr)}`,
        shortLabel: `${formatDateVN(monStr)} - ${formatDateVN(sunStr)}`,
        isCurrent: selectedWeekDate === todayStr
      };
    }

    // timeframe === 'month'
    const [yStr, mStr] = selectedMonth.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const firstDay = `${yStr}-${mStr}-01`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const lastDay = `${yStr}-${mStr}-${String(lastDayOfMonth).padStart(2, '0')}`;

    return {
      startDate: firstDay,
      endDate: lastDay,
      label: `Tháng ${mStr}/${yStr} (${formatDateVN(firstDay)} đến ${formatDateVN(lastDay)})`,
      shortLabel: `Tháng ${mStr}/${yStr}`,
      isCurrent: selectedMonth === currentMonthStr
    };
  }, [timeframe, selectedDate, selectedWeekDate, selectedMonth, todayStr, currentMonthStr]);

  // Điều hướng nhanh mốc thời gian
  const handlePrevDay = () => {
    const parts = selectedDate.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() - 1);
    setSelectedDate(toLocalDateString(d));
  };

  const handleNextDay = () => {
    const parts = selectedDate.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + 1);
    setSelectedDate(toLocalDateString(d));
  };

  const handlePrevWeek = () => {
    const parts = selectedWeekDate.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() - 7);
    setSelectedWeekDate(toLocalDateString(d));
  };

  const handleNextWeek = () => {
    const parts = selectedWeekDate.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + 7);
    setSelectedWeekDate(toLocalDateString(d));
  };

  const handlePrevMonth = () => {
    const [yStr, mStr] = selectedMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [yStr, mStr] = selectedMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };

  // =========================================================================
  // 🌟 THUẬT TOÁN LỌC DỮ LIỆU CỐT LÕI (CORE AGGREGATION FILTER)
  // Chỉ tổng hợp từ các lớp Giáo Viên Chủ Nhiệm (GVCN).
  // TUYỆT ĐỐI LOẠI TRỪ các lớp Giáo Viên Bộ Môn (GVBM) để chống trùng lặp học sinh toàn trường!
  // =========================================================================
  const homeroomClasses = useMemo(() => {
    return classes.filter(cls => {
      if (!cls) return false;
      // 1. Kiểm tra cờ tường minh isHomeroom
      if (cls.isHomeroom === true) return true;
      if (cls.isHomeroom === false) return false;

      // 2. Kiểm tra teacherRole: 'homeroom' | 'GVCN' vs 'subject' | 'GVBM'
      const role = String(cls.teacherRole || '').trim().toLowerCase();
      if (role === 'homeroom' || role === 'gvcn') return true;
      if (role === 'subject' || role === 'gvbm') return false;

      // 3. Kiểm tra tên lớp học (loại trừ các lớp ghép/bộ môn Tin học, Ngoại ngữ, v.v.)
      const lowerName = (cls.name || '').toLowerCase();
      if (
        lowerName.includes('tin học') || 
        lowerName.includes('bộ môn') || 
        lowerName.includes('tiếng anh') || 
        lowerName.includes('mỹ thuật') || 
        lowerName.includes('âm nhạc') ||
        lowerName.includes('thể dục')
      ) {
        return false;
      }

      // 4. Mặc định các lớp chính khóa văn hóa tiêu chuẩn (1A1, 2B, 3C, 4A1...) là lớp chủ nhiệm
      return true;
    });
  }, [classes]);

  const excludedSubjectClassesCount = classes.length - homeroomClasses.length;

  // Total enrolment of the whole school (homeroom classes, no filter) — denominator of the school-wide rate
  const schoolTotalStudents = useMemo(() => {
    const ids = new Set(homeroomClasses.map(c => c.id));
    return students.filter(s => ids.has(s.classId)).length;
  }, [homeroomClasses, students]);

  // Tự động trích xuất danh sách Phân hiệu & Điểm trường (Kết hợp chuẩn từ Cấu hình trường & Thực tế các lớp GVCN)
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(schoolBranches)) {
      schoolBranches.forEach(b => {
        if (b && b.name && b.name.trim()) set.add(b.name.trim());
      });
    }
    homeroomClasses.forEach(c => {
      if (c.branch && c.branch.trim()) {
        set.add(c.branch.trim());
      }
    });
    return Array.from(set).sort();
  }, [homeroomClasses, schoolBranches]);

  const hasUnassignedBranch = useMemo(() => {
    return homeroomClasses.some(c => !c.branch || !c.branch.trim());
  }, [homeroomClasses]);

  // Danh sách Điểm trường chỉ thuộc Phân hiệu đã chọn
  const availableCampuses = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(schoolBranches)) {
      schoolBranches.forEach(b => {
        const bName = (b.name || '').trim();
        if (selectedBranch === 'all' || bName === selectedBranch) {
          if (Array.isArray(b.campuses)) {
            b.campuses.forEach(cp => {
              if (cp && cp.name && cp.name.trim()) set.add(cp.name.trim());
            });
          }
        }
      });
    }
    homeroomClasses.forEach(c => {
      const b = (c.branch || '').trim();
      if (selectedBranch === 'all' || b === selectedBranch) {
        if (c.campus && c.campus.trim()) {
          set.add(c.campus.trim());
        }
      }
    });
    return Array.from(set).sort();
  }, [homeroomClasses, selectedBranch, schoolBranches]);

  const hasUnassignedCampus = useMemo(() => {
    return homeroomClasses.some(c => {
      if (selectedBranch !== 'all' && (c.branch || '').trim() !== selectedBranch) return false;
      return !c.campus || !c.campus.trim();
    });
  }, [homeroomClasses, selectedBranch]);

  // Tự động reset Điểm trường về 'all' khi đổi Phân hiệu nếu điểm trường đó không thuộc phân hiệu mới
  useEffect(() => {
    if (selectedCampus !== 'all' && selectedCampus !== '__unassigned__' && !availableCampuses.includes(selectedCampus)) {
      setSelectedCampus('all');
    }
  }, [selectedBranch, availableCampuses, selectedCampus]);

  // Danh sách Khối học thực tế trích xuất từ các lớp GVCN
  const availableGrades = useMemo(() => {
    const set = new Set<string>();
    homeroomClasses.forEach(c => {
      const g = (c.grade || '').trim();
      if (g) set.add(g);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [homeroomClasses]);

  // Lọc danh sách lớp học theo phân cấp Phân hiệu, Điểm trường & Khối
  const filteredClasses = useMemo(() => {
    let list = homeroomClasses; // Đã cô lập hoàn toàn GVBM
    if (selectedBranch === '__unassigned__') {
      list = list.filter(c => !c.branch || !c.branch.trim());
    } else if (selectedBranch !== 'all') {
      list = list.filter(c => (c.branch || '').trim() === selectedBranch);
    }

    if (selectedCampus === '__unassigned__') {
      list = list.filter(c => !c.campus || !c.campus.trim());
    } else if (selectedCampus !== 'all') {
      list = list.filter(c => (c.campus || '').trim() === selectedCampus);
    }

    if (selectedGrade !== 'all') {
      list = list.filter(c => {
        const g = (c.grade || '').trim();
        if (g === selectedGrade) return true;
        const numFilter = selectedGrade.replace(/\D/g, '');
        const numClass = g.replace(/\D/g, '');
        return Boolean(numFilter && numFilter === numClass);
      });
    }

    return list;
  }, [homeroomClasses, selectedBranch, selectedCampus, selectedGrade]);

  const filteredClassIds = useMemo(() => {
    return new Set(filteredClasses.map(c => c.id));
  }, [filteredClasses]);

  // Lọc học sinh thuộc các lớp đã lọc
  const filteredStudents = useMemo(() => {
    return students.filter(s => filteredClassIds.has(s.classId));
  }, [students, filteredClassIds]);

  // Tổng hợp số liệu Sĩ số
  const totalStudents = filteredStudents.length;
  const totalBoys = filteredStudents.filter(s => s.gender === 'Nam').length;
  const totalGirls = filteredStudents.filter(s => s.gender === 'Nữ').length;

  // "classId|date" of every class-day that has an attendance sheet — boarding is only counted for these
  const attendedClassDays = useMemo(() => {
    const set = new Set<string>();
    attendanceRecords.forEach(r => {
      if (r && r.records && Object.keys(r.records).length > 0) set.add(`${r.classId}|${r.date}`);
    });
    return set;
  }, [attendanceRecords]);

  // =========================================================================
  // 🌟 TỔNG HỢP CHUYÊN CẦN / ĐIỂM DANH THEO KỲ [startDate, endDate]
  // =========================================================================
  const periodAttendance = useMemo(() => {
    const { startDate, endDate } = dateRange;
    const recordsInPeriod = attendanceRecords.filter(r => 
      r.date >= startDate && r.date <= endDate && filteredClassIds.has(r.classId)
    );

    const datesWithData = new Set<string>();
    let present = 0;
    let late = 0;
    let excused = 0;
    let unexcused = 0;
    let sick = 0;

    recordsInPeriod.forEach(record => {
      if (!record.records) return;
      datesWithData.add(record.date);
      Object.entries(record.records).forEach(([_, status]) => {
        // Late students are present; 'other' is treated as an excused absence
        if (status === 'present') present++;
        else if (status === 'late') { late++; present++; }
        else if (status === 'excused' || status === 'other') excused++;
        else if (status === 'unexcused') unexcused++;
        else if (status === 'sick') sick++;
      });
    });

    const absentTotal = excused + unexcused + sick;
    const totalLogged = present + absentTotal;
    const daysCount = datesWithData.size;

    // School-wide rate: students present / total enrolment of the whole school (per day with data).
    // Classes that have not reported count against the rate instead of being left out.
    const enrolmentSlots = totalStudents * daysCount;
    const rate = enrolmentSlots > 0
      ? Math.min(100, Math.round((present / enrolmentSlots) * 1000) / 10)
      : 0;
    const notReported = Math.max(0, enrolmentSlots - totalLogged);

    const avgPresentPerDay = daysCount > 0 ? Math.round(present / daysCount) : 0;
    const avgAbsentPerDay = daysCount > 0 ? Math.round(absentTotal / daysCount) : 0;

    return {
      present,
      late,
      excused,
      unexcused,
      sick,
      absentTotal,
      totalLogged,
      enrolmentSlots,
      notReported,
      rate,
      daysCount,
      avgPresentPerDay,
      avgAbsentPerDay
    };
  }, [attendanceRecords, filteredClassIds, dateRange, totalStudents]);

  // =========================================================================
  // 🌟 TỔNG HỢP ĂN BÁN TRÚ THEO KỲ [startDate, endDate]
  // =========================================================================
  const periodBoarding = useMemo(() => {
    const { startDate, endDate } = dateRange;
    // A class that has not taken attendance on a day is left out of the boarding totals for that day
    const recordsInPeriod = boardingRecords.filter(r =>
      r.date >= startDate && r.date <= endDate && filteredClassIds.has(r.classId) &&
      attendedClassDays.has(`${r.classId}|${r.date}`)
    );

    const datesWithData = new Set<string>();
    let eating = 0;
    let notEating = 0;
    let absentMeal = 0;

    recordsInPeriod.forEach(record => {
      if (!record.records) return;
      datesWithData.add(record.date);
      Object.entries(record.records).forEach(([_, status]) => {
        if (status === 'eating') eating++;
        else if (status === 'not_eating') notEating++;
        else if (status === 'absent_meal') absentMeal++;
      });
    });

    const totalLogged = eating + notEating + absentMeal;
    const daysCount = datesWithData.size;

    // Boarding rate = meals registered / students actually present in the same period.
    // schoolRate = meals registered / total enrolment of the school (per day with boarding data).
    const presentInPeriod = periodAttendance.present;
    const rate = presentInPeriod > 0
      ? Math.round((eating / presentInPeriod) * 1000) / 10
      : 0;
    const enrolmentSlots = totalStudents * daysCount;
    const schoolRate = enrolmentSlots > 0
      ? Math.round((eating / enrolmentSlots) * 1000) / 10
      : 0;

    const avgEatingPerDay = daysCount > 0 ? Math.round(eating / daysCount) : 0;

    return {
      eating,
      notEating,
      absentMeal,
      totalLogged,
      rate,
      schoolRate,
      presentInPeriod,
      enrolmentSlots,
      daysCount,
      avgEatingPerDay
    };
  }, [boardingRecords, filteredClassIds, dateRange, periodAttendance.present, totalStudents, attendedClassDays]);

  // Tổng hợp Xu thi đua & Điểm thưởng
  const totalCoins = useMemo(() => {
    return filteredStudents.reduce((sum, s) => sum + (s.points || 0), 0);
  }, [filteredStudents]);

  const avgCoins = totalStudents > 0 ? (totalCoins / totalStudents).toFixed(1) : '0';

  // =========================================================================
  // 🌟 THỐNG KÊ CHI TIẾT TỪNG LỚP TRONG KỲ [startDate, endDate]
  // =========================================================================
  const perClassStatistics = useMemo(() => {
    const { startDate, endDate } = dateRange;

    return filteredClasses.map(cls => {
      const clsStudents = students.filter(s => s.classId === cls.id);
      const clsCoins = clsStudents.reduce((sum, s) => sum + (s.points || 0), 0);
      const clsAvgCoins = clsStudents.length > 0 ? (clsCoins / clsStudents.length).toFixed(1) : '0';

      // Chuyên cần lớp trong kỳ
      const clsAttRecords = attendanceRecords.filter(r => 
        r.classId === cls.id && r.date >= startDate && r.date <= endDate
      );

      let clsPresent = 0;
      let clsAbsent = 0;
      let hasAttendanceData = false;

      clsAttRecords.forEach(attRecord => {
        if (attRecord && attRecord.records && Object.keys(attRecord.records).length > 0) {
          hasAttendanceData = true;
          Object.values(attRecord.records).forEach(st => {
            if (st === 'present' || st === 'late') clsPresent++;
            else clsAbsent++;
          });
        }
      });

      const clsTotalLogged = clsPresent + clsAbsent;
      const attRate = clsTotalLogged > 0 
        ? Math.round((clsPresent / clsTotalLogged) * 100) 
        : (hasAttendanceData ? 100 : 0);

      // Bán trú lớp trong kỳ
      const clsMealRecords = boardingRecords.filter(r =>
        r.classId === cls.id && r.date >= startDate && r.date <= endDate &&
        attendedClassDays.has(`${r.classId}|${r.date}`)
      );

      let clsEating = 0;
      let clsNotEating = 0;
      let clsAbsentMeal = 0;
      let hasMealData = false;

      clsMealRecords.forEach(mealRecord => {
        if (mealRecord && mealRecord.records && Object.keys(mealRecord.records).length > 0) {
          hasMealData = true;
          Object.values(mealRecord.records).forEach(st => {
            if (st === 'eating') clsEating++;
            else if (st === 'not_eating') clsNotEating++;
            else if (st === 'absent_meal') clsAbsentMeal++;
          });
        }
      });

      const avgEatingPerDay = clsMealRecords.length > 0 
        ? Math.round(clsEating / clsMealRecords.length) 
        : 0;

      return {
        ...cls,
        studentCount: clsStudents.length,
        coins: clsCoins,
        avgCoins: clsAvgCoins,
        present: clsPresent,
        absent: clsAbsent,
        attendanceRate: attRate,
        hasAttendanceData,
        attendanceDaysCount: clsAttRecords.length,
        eatingCount: clsEating,
        notEatingCount: clsNotEating,
        absentMealCount: clsAbsentMeal,
        hasMealData,
        mealDaysCount: clsMealRecords.length,
        avgEatingPerDay
      };
    }).sort((a, b) => {
      // Khi lọc xem, tự động sắp xếp thứ tự các lớp theo ABC
      if (classSortBy === 'abc') {
        return (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true, sensitivity: 'base' });
      }
      // Chế độ xem theo Xu thi đua (Hạng từ cao xuống thấp)
      if (b.coins !== a.coins) {
        return b.coins - a.coins;
      }
      return (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true, sensitivity: 'base' });
    });
  }, [filteredClasses, students, attendanceRecords, boardingRecords, dateRange, classSortBy, attendedClassDays]);

  // =========================================================================
  // 🌟 HÀM ĐIỀU KHIỂN BỘ LỌC KÈM TỰ ĐỘNG SẮP XẾP THEO THỨ TỰ ABC
  // =========================================================================
  const handleFilterAll = () => {
    setSelectedBranch('all');
    setSelectedCampus('all');
    setSelectedGrade('all');
    setClassSortBy('abc'); // Tự động sắp xếp ABC
  };

  const handleSelectBranch = (branch: string) => {
    setSelectedBranch(branch);
    setSelectedCampus('all');
    setClassSortBy('abc'); // Tự động sắp xếp ABC
  };

  const handleSelectCampus = (campus: string) => {
    setSelectedCampus(campus);
    setClassSortBy('abc'); // Tự động sắp xếp ABC
  };

  const handleSelectGrade = (grade: string) => {
    setSelectedGrade(grade);
    setClassSortBy('abc'); // Tự động sắp xếp ABC
  };

  // Động cơ đồng bộ trực tuyến 2 chiều (Two-way Realtime Engine)
  useEffect(() => {
    if (!currentUser) return;

    const username = currentUser.username || 'admin';
    const unsubscribe = databaseService.subscribeRealtimeUpdates(username, (event) => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setLastEventTime(timeStr);
      setIsPulseActive(true);

      if (soundEnabled) {
        try { playPointClink(); } catch (_) {}
      }

      // ⚡ Tự động kích hoạt làm tươi dữ liệu tức thì cho Quản trị tối cao & BGH
      try {
        syncDatabaseNow().catch(() => {});
      } catch (_) {}

      const timer = setTimeout(() => {
        setIsPulseActive(false);
      }, 2500);

      return () => clearTimeout(timer);
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, soundEnabled]);

  // 🔄 TỰ ĐỘNG LÀM MỚI KHI VÀO MÀN HÌNH & CHU KỲ 20S (TỰ ĐỘNG NHẢY BÁO CÁO VỀ PHẦN MỀM)
  useEffect(() => {
    // 1. Quét CSDL máy chủ & các tệp gvcn_*.json ngay khi mở giao diện
    syncDatabaseNow().catch(() => {});

    // 2. Tự động kiểm tra làm mới định kỳ mỗi 20 giây để số liệu tự nhảy về máy quản trị
    const interval = setInterval(() => {
      syncDatabaseNow().catch(() => {});
    }, 20000);

    return () => clearInterval(interval);
  }, [syncDatabaseNow]);

  // Nút đồng bộ tức thì
  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      await syncDatabaseNow();
      const now = new Date();
      setLastEventTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
      setIsPulseActive(true);
      setTimeout(() => setIsPulseActive(false), 2000);
    } finally {
      setIsManualSyncing(false);
    }
  };

  // ☁️ Nút kéo & tổng hợp toàn bộ file lớp học từ Google Drive dùng chung
  const handleDriveSync = async () => {
    setIsDriveSyncing(true);
    setDriveSyncMessage('Đang kết nối Google Drive...');
    try {
      const res = await googleDriveService.pullAllClassFilesFromDrive(currentUser);
      if (res.success && res.pulledCount > 0) {
        setAllUserData({
          classes: res.classes && res.classes.length > 0 ? res.classes : classes,
          students: res.students && res.students.length > 0 ? res.students : students,
          attendanceRecords: res.attendanceRecords || [],
          boardingRecords: res.boardingRecords || [],
          transactions
        } as any);
      }
      await syncDatabaseNow();
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setLastEventTime(timeStr);
      setIsPulseActive(true);
      if (res.success) {
        setDriveSyncMessage(`Đã kéo ${res.pulledCount} lớp thành công! Cập nhật ${res.attendanceRecords?.length || 0} bản ghi chuyên cần.`);
        if (soundEnabled) {
          try { playPointClink(); } catch (_) {}
        }
      } else {
        setDriveSyncMessage(res.message || 'Lỗi đồng bộ Drive');
      }
      setTimeout(() => {
        setIsPulseActive(false);
        setDriveSyncMessage('');
      }, 4000);
    } catch (err: any) {
      setDriveSyncMessage('Lỗi: ' + (err?.message || err));
      setTimeout(() => setDriveSyncMessage(''), 4000);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  // Helper tạo thanh biểu đồ trực quan trong Excel bằng ký tự Unicode
  const generateAsciiBar = (pct: number, maxBlocks = 10) => {
    const p = Math.min(100, Math.max(0, Math.round(pct)));
    const filled = Math.min(maxBlocks, Math.max(0, Math.round((p / 100) * maxBlocks)));
    const empty = maxBlocks - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${p}%`;
  };

  // Xuất file Báo cáo Excel cho BGH theo đúng Khung Thời Gian đã chọn (Đầy đủ tỷ lệ %, bảng tổng hợp và biểu đồ)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const schoolTitle = currentUser?.schoolName || 'TRƯỜNG HỌC';
    const periodLabel = timeframe === 'day' 
      ? `NGÀY HÔM NAY (${dateRange.startDate})` 
      : timeframe === 'week' 
      ? `THEO TUẦN (${dateRange.startDate} đến ${dateRange.endDate})` 
      : timeframe === 'month' 
      ? `THEO THÁNG (${dateRange.startDate} đến ${dateRange.endDate})` 
      : `TÙY CHỈNH (${dateRange.startDate} đến ${dateRange.endDate})`;

    // =========================================================================
    // 📋 SHEET 1: TỔNG HỢP CHUNG VĨ MÔ & THEO KHỐI
    // =========================================================================
    const sheet1Rows: any[][] = [
      [schoolTitle.toUpperCase()],
      ['BÁO CÁO TỔNG HỢP THỜI GIAN THỰC ĐA TẦNG (BGH & QUẢN TRỊ TOÀN TRƯỜNG)'],
      [`Kỳ báo cáo: ${periodLabel} • Thời điểm xuất: ${new Date().toLocaleString('vi-VN')}`],
      [`Phạm vi: Phân hiệu [${selectedBranch === 'all' ? 'Toàn trường' : selectedBranch}] • Điểm trường [${selectedCampus === 'all' ? 'Tất cả' : selectedCampus}] • Khối [${selectedGrade === 'all' ? 'Tất cả khối' : selectedGrade}]`],
      [],
      ['I. BẢNG CHỈ SỐ KPI TỔNG HỢP VĨ MÔ TOÀN TRƯỜNG'],
      ['Chỉ số KPI', 'Số lượng', 'Tỷ lệ & Biểu đồ trực quan', 'Ghi chú chi tiết'],
      ['Tổng số lớp học', filteredClasses.length, `${filteredClasses.length} lớp`, 'Số lớp theo phạm vi lọc'],
      ['Tổng sĩ số học sinh', totalStudents, `${totalStudents} học sinh`, 'Toàn bộ học sinh chính thức'],
      ['Tổng học sinh có mặt', periodAttendance.present, generateAsciiBar(periodAttendance.rate), `Tỷ lệ chuyên cần đạt ${periodAttendance.rate}% (gồm ${periodAttendance.late} lượt đi muộn)`],
      ['Tổng học sinh vắng mặt', periodAttendance.absentTotal, `${periodAttendance.enrolmentSlots > 0 ? Math.round((periodAttendance.absentTotal / periodAttendance.enrolmentSlots) * 1000) / 10 : 0}%`, `Có phép: ${periodAttendance.excused} • Không phép: ${periodAttendance.unexcused} • Ốm: ${periodAttendance.sick}`],
      ['Tổng suất ăn bán trú', periodBoarding.eating, generateAsciiBar(periodBoarding.rate), `Tỷ lệ bán trú đạt ${periodBoarding.rate}% số học sinh đi học, ${periodBoarding.schoolRate}% tổng sĩ số (TB ${periodBoarding.avgEatingPerDay} suất/ngày)`],
      ['Học sinh không ăn bán trú', periodBoarding.notEating, `${periodBoarding.totalLogged > 0 ? Math.round((periodBoarding.notEating / periodBoarding.totalLogged) * 100) : 0}%`, `Vắng ăn: ${periodBoarding.absentMeal} suất`],
      ['Tổng Xu thi đua toàn trường', totalCoins, `${avgCoins} xu / HS`, 'Điểm tích lũy khen thưởng rèn luyện'],
      [],
      ['II. BẢNG THỐNG KÊ TỔNG HỢP & XẾP HẠNG THEO TỪNG KHỐI LỚP (KHỐI 1 - KHỐI 5)'],
      ['STT', 'Khối Lớp', 'Số Lớp', 'Sĩ Số', 'Có Mặt', 'Vắng', '% Chuyên Cần', 'Biểu Đồ Chuyên Cần', 'Suất Bán Trú', '% Bán Trú', 'Biểu Đồ Bán Trú', 'Tổng Xu Thi Đua', 'TB Xu/HS', 'Đánh Giá']
    ];

    // Tính toán dữ liệu theo 5 khối lớp
    const grades = ['Khối 1', 'Khối 2', 'Khối 3', 'Khối 4', 'Khối 5'];
    let sumGradeClasses = 0;
    let sumGradeStudents = 0;
    let sumGradePresent = 0;
    let sumGradeAbsent = 0;
    let sumGradeMeals = 0;
    let sumGradeCoins = 0;

    grades.forEach((grd, idx) => {
      const clsInGrade = perClassStatistics.filter(c => (c.grade || '').trim() === grd || (c.name || '').startsWith(grd.replace('Khối ', '')));
      const gClassesCount = clsInGrade.length;
      const gStudents = clsInGrade.reduce((s, c) => s + (c.studentCount || 0), 0);
      const gPresent = clsInGrade.reduce((s, c) => s + (c.present || 0), 0);
      const gAbsent = clsInGrade.reduce((s, c) => s + (c.absent || 0), 0);
      const gMeals = clsInGrade.reduce((s, c) => s + (c.eatingCount || 0), 0);
      const gCoins = clsInGrade.reduce((s, c) => s + (c.coins || 0), 0);

      const gLogged = gPresent + gAbsent;
      const gAttRate = gLogged > 0 ? Math.round((gPresent / gLogged) * 100) : 0;
      // Boarding rate of the grade = meals registered / students present
      const gMealRate = gPresent > 0 ? Math.round((gMeals / gPresent) * 100) : 0;
      const gAvgCoins = gStudents > 0 ? (gCoins / gStudents).toFixed(1) : '0';

      sumGradeClasses += gClassesCount;
      sumGradeStudents += gStudents;
      sumGradePresent += gPresent;
      sumGradeAbsent += gAbsent;
      sumGradeMeals += gMeals;
      sumGradeCoins += gCoins;

      const evalText = gAttRate >= 95 ? 'Xuất sắc' : gAttRate >= 85 ? 'Tốt' : gAttRate >= 70 ? 'Khá' : 'Cần đôn đốc';

      sheet1Rows.push([
        idx + 1,
        grd,
        gClassesCount,
        gStudents,
        gPresent,
        gAbsent,
        `${gAttRate}%`,
        generateAsciiBar(gAttRate),
        gMeals,
        `${gMealRate}%`,
        generateAsciiBar(gMealRate),
        gCoins,
        gAvgCoins,
        evalText
      ]);
    });

    // Dòng tổng cộng cho Sheet 1
    const totalGradeLogged = sumGradePresent + sumGradeAbsent;
    // Whole-school row: present / total enrolment (same rule as the on-screen card)
    const totalGradeAttRate = totalGradeLogged > 0 ? periodAttendance.rate : 0;
    const totalGradeMealRate = sumGradePresent > 0 ? Math.round((sumGradeMeals / sumGradePresent) * 1000) / 10 : 0;
    const totalGradeAvgCoins = sumGradeStudents > 0 ? (sumGradeCoins / sumGradeStudents).toFixed(1) : '0';

    sheet1Rows.push([
      '--',
      'TỔNG CỘNG TOÀN TRƯỜNG',
      sumGradeClasses || filteredClasses.length,
      sumGradeStudents || totalStudents,
      sumGradePresent || periodAttendance.present,
      sumGradeAbsent || periodAttendance.absentTotal,
      `${totalGradeAttRate || periodAttendance.rate}%`,
      generateAsciiBar(totalGradeAttRate || periodAttendance.rate),
      sumGradeMeals || periodBoarding.eating,
      `${totalGradeMealRate || periodBoarding.rate}%`,
      generateAsciiBar(totalGradeMealRate || periodBoarding.rate),
      sumGradeCoins || totalCoins,
      totalGradeAvgCoins || avgCoins,
      'HOÀN TẤT BÁO CÁO'
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
    ws1['!cols'] = [
      { wch: 6 },  // STT
      { wch: 26 }, // Khối Lớp / Chỉ số
      { wch: 14 }, // Số Lớp / Số lượng
      { wch: 14 }, // Sĩ Số
      { wch: 14 }, // Có Mặt
      { wch: 14 }, // Vắng
      { wch: 16 }, // % Chuyên Cần
      { wch: 22 }, // Biểu Đồ Chuyên Cần
      { wch: 16 }, // Suất Bán Trú
      { wch: 14 }, // % Bán Trú
      { wch: 22 }, // Biểu Đồ Bán Trú
      { wch: 18 }, // Tổng Xu
      { wch: 14 }, // TB Xu/HS
      { wch: 20 }  // Đánh Giá
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Tong_Hop_BGH');

    // =========================================================================
    // 📋 SHEET 2: BẢNG CHI TIẾT TỪNG LỚP HỌC (ĐẦY ĐỦ DÒNG TỔNG CỘNG)
    // =========================================================================
    const sheet2Rows: any[][] = [
      [schoolTitle.toUpperCase()],
      [`BẢNG THEO DÕI THỜI GIAN THỰC TỪNG LỚP HỌC (${filteredClasses.length} LỚP)`],
      [`Kỳ: ${periodLabel} • Xuất lúc: ${new Date().toLocaleString('vi-VN')}`],
      [],
      [
        'STT', 'Lớp Học', 'Khối', 'Phân Hiệu', 'Điểm Trường', 'Giáo Viên Chủ Nhiệm',
        'Sĩ Số', 'Có Mặt', 'Vắng', '% Chuyên Cần', 'Biểu Đồ Chuyên Cần',
        'Suất Ăn Bán Trú', 'TB Ăn/Ngày', '% Bán Trú', 'Biểu Đồ Bán Trú',
        'Tổng Xu Thi Đua', 'Điểm TB Xu', 'Trạng Thái'
      ]
    ];

    let totalClassStudents = 0;
    let totalClassPresent = 0;
    let totalClassAbsent = 0;
    let totalClassEating = 0;
    let totalClassCoins = 0;

    perClassStatistics.forEach((cls, idx) => {
      totalClassStudents += cls.studentCount || 0;
      totalClassPresent += cls.present || 0;
      totalClassAbsent += cls.absent || 0;
      totalClassEating += cls.eatingCount || 0;
      totalClassCoins += cls.coins || 0;

      const cLogged = (cls.present || 0) + (cls.absent || 0);
      const cAttRate = cLogged > 0 ? Math.round(((cls.present || 0) / cLogged) * 100) : (cls.hasAttendanceData ? 100 : 0);
      const cMealRate = (cls.studentCount || 0) > 0 ? Math.round(((cls.eatingCount || 0) / cls.studentCount) * 100) : 0;
      const statusText = !cls.hasAttendanceData ? 'Chưa điểm danh' : cAttRate >= 95 ? 'Tốt' : 'Có học sinh vắng';

      sheet2Rows.push([
        idx + 1,
        cls.name,
        cls.grade,
        cls.branch || 'Trung tâm',
        cls.campus || 'Điểm chính',
        cls.teacherName || 'Chưa cập nhật',
        cls.studentCount,
        cls.present,
        cls.absent,
        `${cAttRate}%`,
        generateAsciiBar(cAttRate),
        cls.eatingCount,
        cls.avgEatingPerDay,
        `${cMealRate}%`,
        generateAsciiBar(cMealRate),
        cls.coins,
        cls.avgCoins,
        statusText
      ]);
    });

    // Dòng tổng cộng cho Sheet 2
    const totalClsLogged = totalClassPresent + totalClassAbsent;
    const finalAttRate = totalClsLogged > 0 ? Math.round((totalClassPresent / totalClsLogged) * 100) : 0;
    const finalMealRate = totalClassStudents > 0 ? Math.round((totalClassEating / totalClassStudents) * 100) : 0;
    const finalAvgCoins = totalClassStudents > 0 ? (totalClassCoins / totalClassStudents).toFixed(1) : '0';

    sheet2Rows.push([
      '--',
      'TỔNG CỘNG TOÀN TRƯỜNG',
      `${filteredClasses.length} lớp`,
      '--',
      '--',
      '--',
      totalClassStudents,
      totalClassPresent,
      totalClassAbsent,
      `${finalAttRate}%`,
      generateAsciiBar(finalAttRate),
      totalClassEating,
      Math.round(totalClassEating / Math.max(1, periodBoarding.daysCount || 1)),
      `${finalMealRate}%`,
      generateAsciiBar(finalMealRate),
      totalClassCoins,
      finalAvgCoins,
      'HOÀN THÀNH'
    ]);

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
    ws2['!cols'] = [
      { wch: 6 },  // STT
      { wch: 14 }, // Lớp
      { wch: 10 }, // Khối
      { wch: 16 }, // Phân hiệu
      { wch: 16 }, // Điểm trường
      { wch: 24 }, // GVCN
      { wch: 10 }, // Sĩ số
      { wch: 10 }, // Có mặt
      { wch: 10 }, // Vắng
      { wch: 14 }, // % Chuyên cần
      { wch: 20 }, // Biểu đồ CC
      { wch: 16 }, // Suất ăn
      { wch: 14 }, // TB ăn
      { wch: 14 }, // % Bán trú
      { wch: 20 }, // Biểu đồ BT
      { wch: 16 }, // Tổng xu
      { wch: 14 }, // TB xu
      { wch: 18 }  // Trạng thái
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Chi_Tiet_Tung_Lop');

    // =========================================================================
    // 📋 SHEET 3: BIỂU ĐỒ & BẢNG XẾP HẠNG THI ĐUA TOP LỚP
    // =========================================================================
    const sortedByAtt = [...perClassStatistics].sort((a, b) => (b.attendanceRate || 0) - (a.attendanceRate || 0)).slice(0, 10);
    const sortedByCoins = [...perClassStatistics].sort((a, b) => (b.coins || 0) - (a.coins || 0)).slice(0, 10);

    const sheet3Rows: any[][] = [
      [schoolTitle.toUpperCase()],
      ['BẢNG XẾP HẠNG THI ĐUA & BIỂU ĐỒ TRỰC QUAN TOP DẪN ĐẦU'],
      [`Kỳ: ${periodLabel}`],
      [],
      ['🏆 TOP 10 LỚP DẪN ĐẦU TỶ LỆ CHUYÊN CẦN TOÀN TRƯỜNG'],
      ['Hạng', 'Lớp Học', 'Khối', 'Giáo Viên Chủ Nhiệm', 'Sĩ Số', 'Có Mặt', '% Chuyên Cần', 'Biểu Đồ Thanh Ngang Trực Quan']
    ];

    sortedByAtt.forEach((cls, i) => {
      sheet3Rows.push([
        `Hạng ${i + 1}`,
        cls.name,
        cls.grade,
        cls.teacherName || 'Chưa cập nhật',
        cls.studentCount,
        cls.present,
        `${cls.attendanceRate}%`,
        generateAsciiBar(cls.attendanceRate, 12)
      ]);
    });

    sheet3Rows.push(
      [],
      ['⭐ TOP 10 LỚP DẪN ĐẦU TÍCH LŨY XU THI ĐUA & KHEN THƯỞNG'],
      ['Hạng', 'Lớp Học', 'Khối', 'Giáo Viên Chủ Nhiệm', 'Sĩ Số', 'Tổng Xu', 'TB Xu/HS', 'Biểu Đồ Thi Đua Xu']
    );

    const maxCoin = Math.max(...sortedByCoins.map(c => c.coins || 1), 1);
    sortedByCoins.forEach((cls, i) => {
      const coinPct = Math.round(((cls.coins || 0) / maxCoin) * 100);
      sheet3Rows.push([
        `Hạng ${i + 1}`,
        cls.name,
        cls.grade,
        cls.teacherName || 'Chưa cập nhật',
        cls.studentCount,
        cls.coins,
        cls.avgCoins,
        generateAsciiBar(coinPct, 12)
      ]);
    });

    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Rows);
    ws3['!cols'] = [
      { wch: 10 },
      { wch: 16 },
      { wch: 12 },
      { wch: 24 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
      { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(wb, ws3, 'BieuDo_XepHang_ThiDua');

    // Lưu file Excel hoàn chỉnh
    const scopeTitle = selectedBranch === 'all' 
      ? 'Toan_Truong' 
      : `${selectedBranch}_${selectedCampus === 'all' ? 'Tat_Ca' : selectedCampus}`.replace(/\s+/g, '_');
    writeReportXlsx(wb, `Bao_Cao_Realtime_BGH_${timeframe.toUpperCase()}_${scopeTitle}_${dateRange.startDate}_den_${dateRange.endDate}.xlsx`);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      {/* 1. THANH CÔNG CỤ GỌN (2 dòng): khung thời gian + ngày • thao tác | bộ lọc phân hiệu – điểm trường – khối • phạm vi.
          Thay cho banner lớn + khung thời gian + bộ lọc 4 cột trước đây để số liệu hiện ngay khi mở trang. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200" role="group" aria-label="Khung thời gian báo cáo">
            {([['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTimeframe(id)}
                aria-pressed={timeframe === id}
                className={`no-hover-fx h-8 px-3 rounded-md text-sm font-bold whitespace-nowrap cursor-pointer ${timeframe === id ? 'bg-white text-indigo-800 shadow-xs border border-slate-200' : 'text-slate-700 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={timeframe === 'day' ? handlePrevDay : timeframe === 'week' ? handlePrevWeek : handlePrevMonth}
              className="no-hover-fx w-8 h-8 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg flex items-center justify-center cursor-pointer"
              title={timeframe === 'day' ? 'Ngày hôm trước' : timeframe === 'week' ? 'Tuần trước' : 'Tháng trước'}
              aria-label={timeframe === 'day' ? 'Ngày hôm trước' : timeframe === 'week' ? 'Tuần trước' : 'Tháng trước'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {timeframe === 'month' ? (
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} aria-label="Tháng báo cáo"
                className="h-8 px-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800" />
            ) : (
              <input type="date" value={timeframe === 'day' ? selectedDate : selectedWeekDate}
                onChange={(e) => (timeframe === 'day' ? setSelectedDate(e.target.value) : setSelectedWeekDate(e.target.value))}
                aria-label={timeframe === 'day' ? 'Ngày báo cáo' : 'Một ngày trong tuần cần xem'}
                title={timeframe === 'week' ? 'Chọn một ngày bất kỳ trong tuần cần xem' : undefined}
                className="h-8 px-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800" />
            )}
            <button
              type="button"
              onClick={timeframe === 'day' ? handleNextDay : timeframe === 'week' ? handleNextWeek : handleNextMonth}
              className="no-hover-fx w-8 h-8 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg flex items-center justify-center cursor-pointer"
              title={timeframe === 'day' ? 'Ngày hôm sau' : timeframe === 'week' ? 'Tuần sau' : 'Tháng sau'}
              aria-label={timeframe === 'day' ? 'Ngày hôm sau' : timeframe === 'week' ? 'Tuần sau' : 'Tháng sau'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {timeframe === 'day' && selectedDate !== todayStr && (
              <button type="button" onClick={() => setSelectedDate(todayStr)} className="no-hover-fx h-8 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold whitespace-nowrap cursor-pointer">Hôm nay</button>
            )}
            {timeframe === 'day' && (
              <button
                type="button"
                onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setSelectedDate(toLocalDateString(d)); }}
                className="no-hover-fx h-8 px-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-sm font-bold whitespace-nowrap cursor-pointer max-sm:hidden"
              >
                Hôm qua
              </button>
            )}
            {timeframe === 'week' && selectedWeekDate !== todayStr && (
              <button type="button" onClick={() => setSelectedWeekDate(todayStr)} className="no-hover-fx h-8 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold whitespace-nowrap cursor-pointer">Tuần này</button>
            )}
            {timeframe === 'month' && selectedMonth !== currentMonthStr && (
              <button type="button" onClick={() => setSelectedMonth(currentMonthStr)} className="no-hover-fx h-8 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold whitespace-nowrap cursor-pointer">Tháng này</button>
            )}
          </div>

          {timeframe !== 'day' && (
            <span className="text-xs font-bold text-indigo-900 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200 whitespace-nowrap" title="Khoảng tính toán">{dateRange.label}</span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-bold border whitespace-nowrap ${isPulseActive ? 'bg-emerald-100 text-emerald-900 border-emerald-400' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}
              title={`Số liệu tự cập nhật khi giáo viên chủ nhiệm gửi báo cáo${lastEventTime ? ` • vừa nhận lúc ${lastEventTime}` : ''}`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-600 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-700" />
              </span>
              <span className="max-md:hidden">Tự cập nhật</span>
              {lastEventTime && <span className="max-lg:hidden">• {lastEventTime}</span>}
            </span>
            <button
              type="button"
              onClick={() => setSoundEnabled(prev => !prev)}
              className={`no-hover-fx w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${soundEnabled ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-white text-slate-500 border-slate-300'}`}
              title={soundEnabled ? 'Đang bật chuông khi có báo cáo mới — bấm để tắt' : 'Đang tắt chuông — bấm để bật'}
              aria-label={soundEnabled ? 'Tắt chuông báo cáo mới' : 'Bật chuông báo cáo mới'}
              aria-pressed={soundEnabled}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isManualSyncing}
              className="no-hover-fx h-8 px-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-sm font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
              title="Làm mới số liệu từ các tệp dữ liệu lớp học"
            >
              <RefreshCw className={`w-4 h-4 ${isManualSyncing ? 'animate-spin' : ''}`} />
              <span className="max-sm:hidden">{isManualSyncing ? 'Đang nạp…' : 'Làm mới'}</span>
            </button>
            <button
              type="button"
              onClick={handleDriveSync}
              disabled={isDriveSyncing}
              className="no-hover-fx h-8 px-2.5 bg-white hover:bg-sky-50 text-sky-800 border border-sky-300 rounded-lg text-sm font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
              title="Kéo số liệu mới nhất của tất cả các lớp từ Google Drive dùng chung"
            >
              <Cloud className={`w-4 h-4 ${isDriveSyncing ? 'animate-bounce' : ''}`} />
              <span className="max-sm:hidden">{isDriveSyncing ? 'Đang kéo…' : 'Đồng bộ Drive'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="no-hover-fx h-8 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              title={`Xuất Excel theo ${timeframe === 'day' ? 'ngày' : timeframe === 'week' ? 'tuần' : 'tháng'} đang xem`}
            >
              <Download className="w-4 h-4" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={selectedBranch} onChange={(e) => handleSelectBranch(e.target.value)} aria-label="Phân hiệu"
            className="h-9 flex-1 min-w-[11rem] px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 cursor-pointer">
            <option value="all">Tất cả phân hiệu</option>
            {availableBranches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
            {hasUnassignedBranch && <option value="__unassigned__">Chưa gán phân hiệu</option>}
          </select>
          <select value={selectedCampus} onChange={(e) => handleSelectCampus(e.target.value)} aria-label="Điểm trường"
            className="h-9 flex-1 min-w-[11rem] px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 cursor-pointer">
            <option value="all">Tất cả điểm trường ({availableCampuses.length})</option>
            {availableCampuses.map(campus => <option key={campus} value={campus}>{campus}</option>)}
            {hasUnassignedCampus && <option value="__unassigned__">Chưa gán điểm trường</option>}
          </select>
          <select value={selectedGrade} onChange={(e) => handleSelectGrade(e.target.value)} aria-label="Khối học"
            className="h-9 flex-1 min-w-[9rem] px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 cursor-pointer">
            <option value="all">Tất cả các khối ({availableGrades.length})</option>
            {availableGrades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
          </select>
          <span
            className="h-9 px-3 inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm font-bold text-indigo-900 whitespace-nowrap"
            title={`Chỉ tính lớp chủ nhiệm (${homeroomClasses.length} lớp)${excludedSubjectClassesCount > 0 ? `, không tính ${excludedSubjectClassesCount} lớp bộ môn` : ''} để không trùng số liệu`}
          >
            <School className="w-4 h-4 text-indigo-700" />
            {filteredClasses.length} lớp • {totalStudents} học sinh
          </span>
          {(selectedBranch !== 'all' || selectedCampus !== 'all' || selectedGrade !== 'all') && (
            <button type="button" onClick={handleFilterAll} className="no-hover-fx h-9 px-3 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-300 rounded-lg text-sm font-bold whitespace-nowrap cursor-pointer" title="Bỏ lọc, xem toàn trường">
              Bỏ lọc
            </button>
          )}
          {driveSyncMessage && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold" role="status">{driveSyncMessage}</span>
          )}
        </div>
      </div>

      {/* 3. Thẻ Chỉ Số Tổng Hợp (Executive KPI Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Tổng Sĩ Số */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-indigo-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black text-slate-600 uppercase">TỔNG SĨ SỐ</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-indigo-950 font-mono">
              {totalStudents}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[12px] font-bold text-slate-600">
              <span className="text-blue-700">👦 {totalBoys} Nam</span>
              <span>•</span>
              <span className="text-pink-600">👧 {totalGirls} Nữ</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[12px] text-slate-500 font-bold flex items-center justify-between">
            <span>{filteredClasses.length} lớp học trực thuộc</span>
            <span className="text-indigo-600 font-black">{selectedBranch === 'all' ? '100% trường' : 'Theo phân hệ'}</span>
          </div>
        </div>

        {/* Card 2: Chuyên Cần & Điểm Danh (Đổi tên & số liệu động theo timeframe) */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-emerald-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black text-emerald-800 uppercase">
              {timeframe === 'day' 
                ? (selectedDate === todayStr ? 'CHUYÊN CẦN HÔM NAY' : `CHUYÊN CẦN (${formatDateVN(selectedDate)})`)
                : timeframe === 'week' 
                ? 'CHUYÊN CẦN TUẦN NÀY' 
                : 'CHUYÊN CẦN THÁNG NÀY'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-950 font-mono">
                {periodAttendance.rate}%
              </span>
              <span className="text-xs font-bold text-emerald-700">
                {timeframe === 'day' 
                  ? `(${periodAttendance.present}/${totalStudents || 0})`
                  : `(${periodAttendance.present} lượt / ${periodAttendance.daysCount} ngày)`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[12px] font-bold text-slate-600">
              {timeframe === 'day' ? (
                <>
                  <span className="text-emerald-700">✓ Có mặt: {periodAttendance.present}</span>
                  <span>•</span>
                  <span className="text-rose-600">✕ Vắng: {periodAttendance.absentTotal}</span>
                </>
              ) : (
                <>
                  <span className="text-emerald-700">✓ TB: {periodAttendance.avgPresentPerDay}/ngày</span>
                  <span>•</span>
                  <span className="text-rose-600">✕ Vắng: {periodAttendance.absentTotal} lượt</span>
                </>
              )}
            </div>
            {periodAttendance.notReported > 0 && (
              <div className="mt-0.5 text-[12px] font-bold text-amber-700 whitespace-nowrap">
                Chưa điểm danh: {periodAttendance.notReported} {timeframe === 'day' ? 'học sinh' : 'lượt'}
              </div>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-emerald-100 text-[12px] text-slate-500 font-bold flex items-center justify-between">
            <span>Phép: {periodAttendance.excused + periodAttendance.sick} • K.Phép: {periodAttendance.unexcused}</span>
            <span className={`font-black ${periodAttendance.rate >= 95 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {periodAttendance.rate >= 95 ? 'Đạt chuẩn' : 'Cần lưu ý'}
            </span>
          </div>
        </div>

        {/* Card 3: Ăn Bán Trú (Đổi tên & số liệu động theo timeframe) */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-amber-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black text-amber-800 uppercase">
              {timeframe === 'day' 
                ? (selectedDate === todayStr ? 'ĂN BÁN TRÚ HÔM NAY' : `ĂN BÁN TRÚ (${formatDateVN(selectedDate)})`)
                : timeframe === 'week' 
                ? 'ĂN BÁN TRÚ TUẦN NÀY' 
                : 'ĂN BÁN TRÚ THÁNG NÀY'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Utensils className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-amber-950 font-mono">
                {periodBoarding.eating}
              </span>
              <span className="text-xs font-bold text-amber-700">
                suất ăn ({periodBoarding.rate}%)
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[12px] font-bold text-slate-600">
              {timeframe === 'day' ? (
                <>
                  <span className="text-amber-700">Ăn trưa: {periodBoarding.eating}</span>
                  <span>•</span>
                  <span className="text-slate-500">Về nhà: {periodBoarding.notEating}</span>
                </>
              ) : (
                <>
                  <span className="text-amber-700">TB: {periodBoarding.avgEatingPerDay} suất/ngày</span>
                  <span>•</span>
                  <span className="text-slate-500">Về nhà: {periodBoarding.notEating} lượt</span>
                </>
              )}
            </div>
            {periodBoarding.eating > 0 && (
              <div className="mt-0.5 text-[12px] font-bold text-slate-600 whitespace-nowrap"
                title={`${periodBoarding.eating} suất ăn / ${periodBoarding.presentInPeriod} học sinh đi học = ${periodBoarding.rate}%  •  ${periodBoarding.eating} suất ăn / ${periodBoarding.enrolmentSlots} tổng sĩ số = ${periodBoarding.schoolRate}%`}>
                {periodBoarding.rate}% HS đi học • {periodBoarding.schoolRate}% sĩ số trường
              </div>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-amber-100 text-[12px] text-slate-500 font-bold flex items-center justify-between">
            <span>Cắt suất: {periodBoarding.absentMeal} lượt</span>
            <span className="text-amber-700 font-black">Nhà bếp đã chốt</span>
          </div>
        </div>

        {/* Card 4: Xu Thi Đua Lớp Học */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-purple-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black text-purple-800 uppercase">THI ĐUA TÍCH ĐIỂM</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-purple-950 font-mono">
              {totalCoins} <span className="text-sm font-bold text-amber-700"><CoinIcon /></span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[12px] font-bold text-purple-700">
              <span>Trung bình:</span>
              <strong className="text-purple-900 font-black">{avgCoins} xu / học sinh</strong>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-purple-100 text-[12px] text-slate-500 font-bold flex items-center justify-between">
            <span>Thi đua hạnh phúc</span>
            <span className="text-purple-600 font-black">Xếp hạng realtime</span>
          </div>
        </div>
      </div>

      {/* 2b. Thống kê toàn trường từ Google Drive dùng chung (hôm nay / hôm qua / tuần / tháng) */}
      <DriveAttendanceStatsPanel schoolTotalStudents={schoolTotalStudents} />

      {/* 4. Biểu Đồ Tròn Trực Quan Sinh Động (Realtime Donut Charts) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Biểu đồ 1: Tỷ lệ Chuyên cần */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h4 className="text-xs sm:text-sm font-black text-indigo-950 uppercase flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-emerald-600" />
              <span>CƠ CẤU CHUYÊN CẦN ({dateRange.shortLabel})</span>
            </h4>
            <span className="text-[12px] font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
              Tỷ lệ: {periodAttendance.rate}%
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-4 pt-1">
            {/* SVG Circular Progress */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#E2E8F0"
                  strokeWidth="12"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#10B981"
                  strokeWidth="12"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * (periodAttendance.rate || 0)) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-slate-800 font-mono">
                  {periodAttendance.rate}%
                </span>
                <span className="text-[12px] font-bold text-slate-500 uppercase">Có mặt</span>
              </div>
            </div>

            {/* Chi tiết các chỉ số */}
            <div className="space-y-2 text-xs w-full sm:w-auto">
              <div className="flex items-center justify-between gap-4 p-2 rounded-xl bg-emerald-50/70 border border-emerald-100">
                <span className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Có mặt đúng giờ:
                </span>
                <strong className="text-emerald-950 font-mono">
                  {periodAttendance.present} {timeframe === 'day' ? 'em' : 'lượt'}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4 p-2 rounded-xl bg-amber-50/70 border border-amber-100">
                <span className="flex items-center gap-1.5 font-bold text-amber-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Nghỉ có phép / Ốm:
                </span>
                <strong className="text-amber-950 font-mono">
                  {periodAttendance.excused + periodAttendance.sick} {timeframe === 'day' ? 'em' : 'lượt'}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4 p-2 rounded-xl bg-rose-50/70 border border-rose-100">
                <span className="flex items-center gap-1.5 font-bold text-rose-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  Nghỉ không phép:
                </span>
                <strong className="text-rose-950 font-mono">
                  {periodAttendance.unexcused} {timeframe === 'day' ? 'em' : 'lượt'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Biểu đồ 2: Cơ cấu Bán trú */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h4 className="text-xs sm:text-sm font-black text-indigo-950 uppercase flex items-center gap-2">
              <Utensils className="w-4 h-4 text-amber-600" />
              <span>CƠ CẤU BÁN TRÚ ({dateRange.shortLabel})</span>
            </h4>
            <span className="text-[12px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
              {periodBoarding.eating} suất ăn ({periodBoarding.rate}%)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-4 pt-1">
            {/* SVG Circular Progress */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#E2E8F0"
                  strokeWidth="12"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#F59E0B"
                  strokeWidth="12"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * Math.min(100, periodBoarding.rate || 0)) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-slate-800 font-mono">
                  {periodBoarding.eating}
                </span>
                <span className="text-[12px] font-bold text-slate-500 uppercase">Suất ăn</span>
              </div>
            </div>

            {/* Chi tiết bán trú */}
            <div className="space-y-2 text-xs w-full sm:w-auto">
              <div className="flex items-center justify-between gap-4 p-2 rounded-xl bg-amber-50/70 border border-amber-100">
                <span className="flex items-center gap-1.5 font-bold text-amber-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Ăn bán trú tại trường:
                </span>
                <strong className="text-amber-950 font-mono">
                  {periodBoarding.eating} {timeframe === 'day' ? 'em' : 'suất'}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4 p-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  Về nhà ăn cơm:
                </span>
                <strong className="text-slate-900 font-mono">
                  {periodBoarding.notEating} {timeframe === 'day' ? 'em' : 'lượt'}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4 p-2 rounded-xl bg-rose-50/70 border border-rose-100">
                <span className="flex items-center gap-1.5 font-bold text-rose-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  Báo cắt suất hôm nay:
                </span>
                <strong className="text-rose-950 font-mono">
                  {periodBoarding.absentMeal} {timeframe === 'day' ? 'em' : 'lượt'}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Bảng Giám Sát Chi Tiết Từng Lớp Trong Phân Hệ (Per-Class Grid) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header chính của bảng */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-blue-50/40 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-indigo-950 uppercase tracking-tight flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <span>BẢNG XẾP HẠNG & THEO DÕI THỜI GIAN THỰC TỪNG LỚP ({filteredClasses.length} LỚP • {dateRange.label.toUpperCase()})</span>
            </h3>
            <p className="text-[12px] text-slate-500">
              Dữ liệu được cập nhật tự động khi bất kỳ GVCN nào điểm danh, báo ăn hoặc cộng điểm
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            {/* Nút chuyển chế độ sắp xếp */}
            <button
              onClick={() => setClassSortBy(prev => prev === 'abc' ? 'coins' : 'abc')}
              className={`px-2.5 py-1.5 rounded-xl text-[12px] font-black flex items-center gap-1.5 transition-all cursor-pointer border shadow-2xs ${
                classSortBy === 'abc'
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-indigo-200'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Click để đổi giữa Sắp xếp ABC (A-Z) và Theo điểm thi đua"
            >
              <ArrowDownAZ className="w-3.5 h-3.5" />
              <span>{classSortBy === 'abc' ? 'Sắp xếp: Tên lớp A-Z (ABC)' : 'Sắp xếp: Điểm thi đua'}</span>
            </button>
          </div>
        </div>

        {/* Thanh công cụ Bộ lọc Trực tiếp ngay tại Bảng (Toàn trường • Phân hiệu • Điểm trường • Khối) */}
        <div className="p-2.5 sm:p-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[12px] font-black text-slate-600 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <span>LỌC XEM:</span>
          </span>

          {/* 1. Nút Toàn trường */}
          <button
            onClick={handleFilterAll}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center gap-1 ${
              selectedBranch === 'all' && selectedCampus === 'all' && selectedGrade === 'all'
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs scale-102'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-indigo-50 hover:text-indigo-800'
            }`}
          >
            <School className="w-3.5 h-3.5" />
            <span>Toàn trường</span>
          </button>

          {/* 2. Dropdown Phân hiệu */}
          <div className="relative inline-flex items-center">
            <select
              value={selectedBranch}
              onChange={(e) => handleSelectBranch(e.target.value)}
              className={`px-2.5 py-1.5 pr-7 bg-white border rounded-xl text-xs font-bold transition-all cursor-pointer appearance-none ${
                selectedBranch !== 'all'
                  ? 'border-purple-400 bg-purple-50 text-purple-900 font-black'
                  : 'border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              <option value="all">🏛️ Phân hiệu: Tất cả</option>
              {availableBranches.map(branch => (
                <option key={branch} value={branch}>🏛️ {branch}</option>
              ))}
              {hasUnassignedBranch && (
                <option value="__unassigned__">⚠️ Chưa có phân hiệu</option>
              )}
            </select>
            <ChevronRight className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none rotate-90" />
          </div>

          {/* 3. Dropdown Điểm trường */}
          <div className="relative inline-flex items-center">
            <select
              value={selectedCampus}
              onChange={(e) => handleSelectCampus(e.target.value)}
              className={`px-2.5 py-1.5 pr-7 bg-white border rounded-xl text-xs font-bold transition-all cursor-pointer appearance-none ${
                selectedCampus !== 'all'
                  ? 'border-sky-400 bg-sky-50 text-sky-900 font-black'
                  : 'border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              <option value="all">📍 Điểm trường: Tất cả</option>
              {availableCampuses.map(campus => (
                <option key={campus} value={campus}>📍 {campus}</option>
              ))}
              {hasUnassignedCampus && (
                <option value="__unassigned__">⚠️ Chưa có điểm trường</option>
              )}
            </select>
            <ChevronRight className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none rotate-90" />
          </div>

          {/* 4. Bộ nút lọc theo Khối */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-300">
            <span className="text-[12px] font-bold text-slate-500 px-1.5 flex items-center gap-1">
              <GraduationCap className="w-3 h-3 text-amber-600" />
              <span>Khối:</span>
            </span>
            <button
              onClick={() => handleSelectGrade('all')}
              className={`px-2 py-0.5 rounded-lg text-[12px] font-black transition-all cursor-pointer ${
                selectedGrade === 'all'
                  ? 'bg-amber-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tất cả
            </button>
            {availableGrades.map(grade => {
              const shortGrade = grade.replace(/Khối\s*/i, 'K');
              const isSelected = selectedGrade === grade;
              return (
                <button
                  key={grade}
                  onClick={() => handleSelectGrade(grade)}
                  className={`px-2 py-0.5 rounded-lg text-[12px] font-black transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={grade}
                >
                  {shortGrade}
                </button>
              );
            })}
          </div>

          {/* Badge thông báo tự động sắp xếp ABC */}
          <span className="ml-auto text-[12px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg flex items-center gap-1">
            <ArrowDownAZ className="w-3 h-3 text-indigo-600" />
            <span>Tự động sắp xếp ABC</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-[12px] font-black text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-14 text-center">{classSortBy === 'abc' ? 'STT' : 'Hạng'}</th>
                <th className="py-2.5 px-3">Lớp & Khối</th>
                <th className="py-2.5 px-3">Phân hiệu / Điểm trường</th>
                <th className="py-2.5 px-3">Giáo viên chủ nhiệm</th>
                <th className="py-2.5 px-3 text-center">Sĩ số</th>
                <th className="py-2.5 px-3 text-center">Chuyên cần</th>
                <th className="py-2.5 px-3 text-center">Bán trú</th>
                <th className="py-2.5 px-3 text-right">Tổng xu thi đua</th>
                <th className="py-2.5 px-3 text-right">Trung bình</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perClassStatistics.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-bold">
                    Không tìm thấy lớp học nào thỏa mãn bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                perClassStatistics.map((cls, idx) => (
                  <tr key={cls.id} className="hover:bg-indigo-50/30 transition-colors">
                    {/* Hạng / STT */}
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black ${
                        classSortBy === 'coins'
                          ? (idx === 0 
                              ? 'bg-amber-700 text-white shadow-xs' 
                              : idx === 1 
                              ? 'bg-slate-300 text-slate-800' 
                              : idx === 2 
                              ? 'bg-amber-700 text-white' 
                              : 'text-slate-500')
                          : 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>

                    {/* Lớp & Khối */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: cls.color || '#6366f1' }}
                        />
                        <div>
                          <strong className="text-indigo-950 font-black text-xs block">
                            Lớp {cls.name}
                          </strong>
                          <span className="text-[12px] text-slate-500 font-bold">{cls.grade}</span>
                        </div>
                      </div>
                    </td>

                    {/* Phân hiệu / Điểm trường */}
                    <td className="py-2.5 px-3">
                      <div className="space-y-0.5">
                        {cls.branch ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                            🏛️ {cls.branch}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            Chưa cấu hình (Null)
                          </span>
                        )}
                        {cls.campus && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 block w-fit">
                            📍 {cls.campus}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* GVCN */}
                    <td className="py-2.5 px-3">
                      <span className="text-slate-800 font-bold">
                        {cls.teacherName || 'Chưa phân công'}
                      </span>
                    </td>

                    {/* Sĩ số */}
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {cls.studentCount}
                    </td>

                    {/* Chuyên cần (Hiển thị chi tiết theo timeframe Ngày / Tuần / Tháng) */}
                    <td className="py-2.5 px-3 text-center">
                      {timeframe === 'day' ? (
                        cls.hasAttendanceData ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-black font-mono ${
                            cls.attendanceRate >= 95 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {cls.attendanceRate}% ({cls.present})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-bold text-slate-400 bg-slate-100">
                            Chưa điểm danh
                          </span>
                        )
                      ) : (
                        cls.hasAttendanceData ? (
                          <div className="space-y-0.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-black font-mono ${
                              cls.attendanceRate >= 95 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {cls.attendanceRate}%
                            </span>
                            <span className="text-[12px] text-slate-500 font-bold block">
                              {cls.present} lượt ({cls.attendanceDaysCount} buổi)
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-bold text-slate-400 bg-slate-100">
                            Chưa có dữ liệu
                          </span>
                        )
                      )}
                    </td>

                    {/* Bán trú (Hiển thị chi tiết theo timeframe Ngày / Tuần / Tháng) */}
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-900">
                      {timeframe === 'day' ? (
                        <span>{cls.eatingCount} suất</span>
                      ) : (
                        <div>
                          <span>{cls.eatingCount} suất</span>
                          {cls.mealDaysCount > 0 && (
                            <span className="text-[12px] text-amber-700/80 font-normal block font-sans">
                              TB {cls.avgEatingPerDay}/ngày ({cls.mealDaysCount} ngày)
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Tổng xu */}
                    <td className="py-2.5 px-3 text-right font-mono font-black text-indigo-950">
                      {cls.coins} <span className="text-amber-700 text-[12px]"><CoinIcon /></span>
                    </td>

                    {/* Điểm TB */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-700">
                      {cls.avgCoins}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
