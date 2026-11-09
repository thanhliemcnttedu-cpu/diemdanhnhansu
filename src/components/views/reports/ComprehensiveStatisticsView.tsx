import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useClassroom } from '../../../context/ClassroomContext';
import { Student, Classroom, DailyAttendance, DailyBoardingMeal, AttendanceStatus } from '../../../types';
import { 
  BarChart3, PieChart, LineChart, TrendingUp, Calendar, 
  Users, School, Download, FileSpreadsheet, Image as ImageIcon, 
  Printer, Check, AlertTriangle, ShieldCheck, Sparkles, 
  ChevronLeft, ChevronRight, UserCheck, Award, Filter, 
  ArrowUpRight, ArrowDownRight, Clock, ShieldAlert, Star,
  Database, RefreshCw, Layers, Search, Eye, EyeOff, Info,
  CheckSquare, Square
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { exportElementToPdf, exportElementToImagePng, exportMultipleElementsToPdf, exportMultipleElementsToImagesPng } from '../../../utils/printHelper';
import { buildFormattedSheet, ExcelColumnDef } from '../../../utils/excelHelper';
import { getOfficialDisplayName, getOfficialRoleTitle } from '../../../utils/accountIdentity';

const LAST_BACKUP_KEY = 'lop_hoc_hanh_phuc_last_backup_timestamp';
const DISMISSED_BACKUP_KEY = 'lop_hoc_hanh_phuc_dismissed_backup_date';

export const ComprehensiveStatisticsView: React.FC = () => {
  const {
    classes: allClasses, students: allStudents, activeClassId, teacherProfile,
    attendanceRecords, boardingRecords, transactions,
    exportBackupJson, currentUser, allUsers, isAdmin, isBgh, isSchoolAdmin
  } = useClassroom();

  // BGH / Quản trị: chỉ tổng hợp LỚP CHỦ NHIỆM (GVCN), loại lớp bộ môn để không dôi số lớp / số học sinh
  const classes = React.useMemo(() => {
    if (!(isAdmin || isBgh || isSchoolAdmin)) return allClasses;
    return allClasses.filter(c => {
      if (!c) return false;
      if (c.id && c.id.startsWith('class-sub-')) return false;
      if (c.isHomeroom === true) return true;
      if (c.isHomeroom === false) return false;
      const role = String(c.teacherRole || '').trim().toLowerCase();
      if (role === 'subject' || role === 'gvbm') return false;
      return true;
    });
  }, [allClasses, isAdmin, isBgh, isSchoolAdmin]);
  const students = React.useMemo(() => {
    if (classes === allClasses) return allStudents;
    const ids = new Set(classes.map(c => c.id));
    return allStudents.filter(st => ids.has(st.classId));
  }, [classes, allClasses, allStudents]);

  const officialReporterName = getOfficialDisplayName(currentUser, allUsers) || teacherProfile.name;
  const officialSchoolName = currentUser?.schoolName || teacherProfile.schoolName || 'TRƯỜNG HỌC';
  const officialRoleTitle = getOfficialRoleTitle(currentUser);

  // 1. Timeframe selection: 'day' | 'week' | 'month' | 'semester'
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'semester'>('day');
  const [selectedSemester, setSelectedSemester] = useState<'hk1' | 'hk2' | 'year'>('hk1');

  // Calendar dates
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const yesterdayOfTodayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Currently inspected date (defaults to today)
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Selected Scope: 'all' (Toàn trường) or specific classId
  const [selectedClassId, setSelectedClassId] = useState<string>('all');

  // Chart configuration: Type & Dataset (Mặc định biểu đồ tròn Donut / Pie theo chuẩn sư phạm)
  const [chartType, setChartType] = useState<'pie' | 'bar' | 'line'>('pie');
  const [chartDataset, setChartDataset] = useState<'attendance' | 'boarding' | 'gender' | 'classes' | 'grades' | 'progress'>('attendance');

  // Multi-item selective visibility ("Cho phép chọn dữ liệu muốn hiển thị")
  // Keys correspond to items inside each dataset
  const [hiddenDataKeys, setHiddenDataKeys] = useState<Record<string, boolean>>({});

  const toggleDataKeyVisibility = (key: string) => {
    setHiddenDataKeys(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const showAllDataKeys = () => {
    setHiddenDataKeys({});
  };

  // Student progress filters
  const [progressSearch, setProgressSearch] = useState<string>('');
  const [progressClassFilter, setProgressClassFilter] = useState<string>('all');
  const [progressBadgeFilter, setProgressBadgeFilter] = useState<string>('all');
  const [progressSortBy, setProgressSortBy] = useState<'delta' | 'coins' | 'attendance'>('delta');
  const [progressDisplayLimit, setProgressDisplayLimit] = useState<number>(15);

  // 30-day Backup Warning State
  const [daysSinceBackup, setDaysSinceBackup] = useState<number>(31);
  const [showBackupAlert, setShowBackupAlert] = useState<boolean>(true);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  // 🤖 AI SMART LAYOUT & AUTO ORIENTATION ENGINE:
  // Tự động phân tích ma trận dữ liệu (10-12 cột bảng và cụm biểu đồ đa chiều) để thiết lập Khổ Ngang Chuẩn A4 (Landscape 297mm x 210mm)
  const exportOrientation: 'landscape' | 'portrait' = 'landscape';
  const [showSafeTransitionModal, setShowSafeTransitionModal] = useState(false);

  const reportContainerRef = useRef<HTMLDivElement>(null);
  const page1Ref = useRef<HTMLDivElement>(null);
  // Bảng III: Bảng tổng hợp sĩ số, nam/nữ, chuyên cần & bán trú các lớp GVCN (ngắt 1, 2 hoặc 3 trang khổ ngang A4)
  const classPage1Ref = useRef<HTMLDivElement>(null);
  const classPage2Ref = useRef<HTMLDivElement>(null);
  const classPage3Ref = useRef<HTMLDivElement>(null);
  // Bảng IV: Bảng theo dõi & so sánh tiến bộ học sinh (ngắt 1 hoặc 2 trang khổ ngang A4)
  const studentPage1Ref = useRef<HTMLDivElement>(null);
  const studentPage2Ref = useRef<HTMLDivElement>(null);

  // Check 30-day backup status
  useEffect(() => {
    try {
      const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
      const dismissed = localStorage.getItem(DISMISSED_BACKUP_KEY);
      const isDismissedToday = dismissed === todayStr;

      if (lastBackup) {
        const lastTime = parseInt(lastBackup, 10);
        const days = Math.floor((Date.now() - lastTime) / (1000 * 60 * 60 * 24));
        setDaysSinceBackup(days);
        setShowBackupAlert(days >= 30 && !isDismissedToday);
      } else {
        // First time or never backed up -> prompt after 30 days
        setDaysSinceBackup(32);
        setShowBackupAlert(!isDismissedToday);
      }
    } catch (e) {
      console.error(e);
    }
  }, [todayStr]);

  const handleDismissBackupAlert = () => {
    try {
      localStorage.setItem(DISMISSED_BACKUP_KEY, todayStr);
      setShowBackupAlert(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBackupJsonClick = () => {
    exportBackupJson();
    try {
      localStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
      setDaysSinceBackup(0);
      setShowBackupAlert(false);
    } catch (e) {
      console.error(e);
    }
    setExportToast('Đã lưu file dự phòng .JSON an toàn! Dữ liệu của bạn đã được bảo vệ 100%.');
    setTimeout(() => setExportToast(null), 3500);
  };

  const changeDateBy = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${day}`);
  };

  // Date ranges for Week and Month
  const currentWeekRange = useMemo(() => {
    const cur = new Date(selectedDate);
    const day = cur.getDay();
    const diffToMonday = cur.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(cur.getFullYear(), cur.getMonth(), diffToMonday);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };

    return { start: fmt(mon), end: fmt(sun), mon, sun };
  }, [selectedDate]);

  const previousWeekRange = useMemo(() => {
    const mon = new Date(currentWeekRange.mon);
    mon.setDate(mon.getDate() - 7);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };

    return { start: fmt(mon), end: fmt(sun) };
  }, [currentWeekRange]);

  const currentMonthRange = useMemo(() => {
    const cur = new Date(selectedDate);
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);

    const fmt = (d: Date) => {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${dt}`;
    };

    return { 
      start: fmt(start), 
      end: fmt(end), 
      monthLabel: `Tháng ${m + 1}/${y}`,
      year: y,
      month: m + 1
    };
  }, [selectedDate]);

  const previousMonthRange = useMemo(() => {
    const cur = new Date(selectedDate);
    const y = cur.getFullYear();
    const m = cur.getMonth() - 1;
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);

    const fmt = (d: Date) => {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${dt}`;
    };

    return { start: fmt(start), end: fmt(end) };
  }, [selectedDate]);

  // Semester Range (Học kì I, Học kì II, Cả năm học)
  const currentSemesterRange = useMemo(() => {
    const cur = new Date(selectedDate);
    const curYear = cur.getFullYear();
    const startYear = cur.getMonth() >= 8 ? curYear : curYear - 1;
    const endYear = startYear + 1;

    if (selectedSemester === 'hk1') {
      return {
        start: `${startYear}-09-05`,
        end: `${endYear}-01-15`,
        label: `Học kì I (${startYear} - ${endYear})`
      };
    } else if (selectedSemester === 'hk2') {
      return {
        start: `${endYear}-01-16`,
        end: `${endYear}-05-31`,
        label: `Học kì II (${startYear} - ${endYear})`
      };
    } else {
      return {
        start: `${startYear}-09-05`,
        end: `${endYear}-05-31`,
        label: `Cả Năm Học (${startYear} - ${endYear})`
      };
    }
  }, [selectedDate, selectedSemester]);

  // Target students based on selectedClassId
  const targetStudents = useMemo(() => {
    if (selectedClassId === 'all') return students;
    return students.filter(s => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  // Total school demographic numbers
  const totalClasses = classes.length;
  const totalStudents = students.length;
  const totalBoys = students.filter(s => s.gender === 'Nam').length;
  const totalGirls = students.filter(s => s.gender === 'Nữ').length;
  const boyPct = totalStudents > 0 ? Math.round((totalBoys / totalStudents) * 100) : 50;
  const girlPct = totalStudents > 0 ? 100 - boyPct : 50;
  const totalCoins = useMemo(() => targetStudents.reduce((acc, s) => acc + (s.points || 0), 0), [targetStudents]);

  // Grade breakdown
  const gradeBreakdown = useMemo(() => {
    const grades = ['Khối 1', 'Khối 2', 'Khối 3', 'Khối 4', 'Khối 5'];
    return grades.map(gradeName => {
      const gradeClasses = classes.filter(c => (c.grade || 'Khối 4') === gradeName);
      const gradeClassIds = gradeClasses.map(c => c.id);
      const gradeStudents = students.filter(s => gradeClassIds.includes(s.classId));
      const boys = gradeStudents.filter(s => s.gender === 'Nam').length;
      const girls = gradeStudents.filter(s => s.gender === 'Nữ').length;

      return {
        gradeName,
        classCount: gradeClasses.length,
        classes: gradeClasses,
        studentCount: gradeStudents.length,
        boys,
        girls
      };
    }).filter(g => g.classCount > 0 || g.studentCount > 0);
  }, [classes, students]);

  const reportClassIds = useMemo(() => new Set(classes.map(c => c.id)), [classes]);

  // Helper to aggregate attendance & boarding over any date range
  const aggregateRangeStats = (fromDate: string, toDate: string, classIdFilter = selectedClassId) => {
    const relevantAtt = attendanceRecords.filter(r => {
      const matchClass = classIdFilter === 'all' ? reportClassIds.has(r.classId) : r.classId === classIdFilter;
      return matchClass && r.date >= fromDate && r.date <= toDate;
    });

    const relevantBoard = boardingRecords.filter(r => {
      const matchClass = classIdFilter === 'all' ? reportClassIds.has(r.classId) : r.classId === classIdFilter;
      return matchClass && r.date >= fromDate && r.date <= toDate;
    });

    let present = 0;
    let excused = 0;
    let unexcused = 0;
    let sick = 0;
    let other = 0;
    let eating = 0;

    relevantAtt.forEach(attRec => {
      Object.values(attRec.records).forEach(status => {
        if (status === 'present' || status === 'late') present++;
        else if (status === 'excused') excused++;
        else if (status === 'unexcused') unexcused++;
        else if (status === 'sick') sick++;
        else if (status === 'other') other++;
      });
    });

    let boardingRegistered = 0;
    relevantBoard.forEach(bRec => {
      const matchingAtt = relevantAtt.find(a => a.date === bRec.date && a.classId === bRec.classId);
      Object.entries(bRec.records).forEach(([sId, bStatus]) => {
        boardingRegistered++;
        const aStatus = matchingAtt?.records[sId];
        const isAbsent = aStatus === 'sick' || aStatus === 'excused' || aStatus === 'unexcused' || aStatus === 'other';
        if (bStatus === 'eating' && !isAbsent) {
          eating++;
        }
      });
    });

    const totalAbsent = excused + unexcused + sick + other;
    const totalSlots = present + totalAbsent;
    const attRate = totalSlots > 0 ? Math.round((present / totalSlots) * 100) : 100;
    const bRate = boardingRegistered > 0 ? Math.round((eating / boardingRegistered) * 100) : 0;

    return {
      sessions: relevantAtt.length,
      present,
      excused,
      unexcused,
      sick,
      other,
      totalAbsent,
      eating,
      attRate,
      bRate
    };
  };

  // Specific Attendance Stats:
  // Today, Yesterday, Selected Custom Day, Week, Month
  const todayStats = useMemo(() => aggregateRangeStats(todayStr, todayStr), [todayStr, selectedClassId, attendanceRecords, boardingRecords]);
  const yesterdayStats = useMemo(() => aggregateRangeStats(yesterdayOfTodayStr, yesterdayOfTodayStr), [yesterdayOfTodayStr, selectedClassId, attendanceRecords, boardingRecords]);
  const selectedDayStats = useMemo(() => aggregateRangeStats(selectedDate, selectedDate), [selectedDate, selectedClassId, attendanceRecords, boardingRecords]);
  const weekStats = useMemo(() => aggregateRangeStats(currentWeekRange.start, currentWeekRange.end), [currentWeekRange, selectedClassId, attendanceRecords, boardingRecords]);
  const monthStats = useMemo(() => aggregateRangeStats(currentMonthRange.start, currentMonthRange.end), [currentMonthRange, selectedClassId, attendanceRecords, boardingRecords]);
  const semesterStats = useMemo(() => aggregateRangeStats(currentSemesterRange.start, currentSemesterRange.end), [currentSemesterRange, selectedClassId, attendanceRecords, boardingRecords]);

  // Current Active Timeframe Stats
  const activeTimeframeStats = useMemo(() => {
    if (timeframe === 'day') return selectedDayStats;
    if (timeframe === 'week') return weekStats;
    if (timeframe === 'month') return monthStats;
    return semesterStats;
  }, [timeframe, selectedDayStats, weekStats, monthStats, semesterStats]);

  // Detailed class comparison table
  const classDetailedRows = useMemo(() => {
    return classes.map((cls, idx) => {
      const clsStudents = students.filter(s => s.classId === cls.id);
      const boys = clsStudents.filter(s => s.gender === 'Nam').length;
      const girls = clsStudents.filter(s => s.gender === 'Nữ').length;

      // Stats in active timeframe for this specific class
      const fromDate = timeframe === 'day' ? selectedDate : timeframe === 'week' ? currentWeekRange.start : timeframe === 'month' ? currentMonthRange.start : currentSemesterRange.start;
      const toDate = timeframe === 'day' ? selectedDate : timeframe === 'week' ? currentWeekRange.end : timeframe === 'month' ? currentMonthRange.end : currentSemesterRange.end;
      const stats = aggregateRangeStats(fromDate, toDate, cls.id);

      // Average coin points
      const totalPoints = clsStudents.reduce((acc, s) => acc + (s.points || 0), 0);
      const avgPoints = clsStudents.length > 0 ? Math.round((totalPoints / clsStudents.length) * 10) / 10 : 0;

      return {
        stt: idx + 1,
        classId: cls.id,
        className: cls.name,
        grade: cls.grade || 'Khối 4',
        teacherName: cls.teacherName || teacherProfile.name,
        totalStudents: clsStudents.length,
        boys,
        girls,
        present: stats.present,
        excused: stats.excused,
        unexcused: stats.unexcused,
        sick: stats.sick,
        other: stats.other,
        totalAbsent: stats.totalAbsent,
        attRate: stats.attRate,
        eating: stats.eating,
        bRate: stats.bRate,
        totalPoints,
        avgPoints
      };
    });
  }, [classes, students, timeframe, selectedDate, currentWeekRange, currentMonthRange, attendanceRecords, boardingRecords, teacherProfile]);

  // Student progress comparison (Tuần này vs Tuần trước hoặc Tháng này vs Tháng trước)
  const studentProgressData = useMemo(() => {
    const curFrom = timeframe === 'month' ? currentMonthRange.start : currentWeekRange.start;
    const curTo = timeframe === 'month' ? currentMonthRange.end : currentWeekRange.end;
    const prevFrom = timeframe === 'month' ? previousMonthRange.start : previousWeekRange.start;
    const prevTo = timeframe === 'month' ? previousMonthRange.end : previousWeekRange.end;

    // Calculate points gained in current vs previous period
    const rawList = targetStudents.map(student => {
      const curTx = transactions.filter(t => {
        if (t.studentId !== student.id) return false;
        const d = new Date(t.timestamp);
        const txDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return txDate >= curFrom && txDate <= curTo;
      });
      const prevTx = transactions.filter(t => {
        if (t.studentId !== student.id) return false;
        const d = new Date(t.timestamp);
        const txDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return txDate >= prevFrom && txDate <= prevTo;
      });

      const curPointsGained = curTx.reduce((acc, t) => acc + (t.amount > 0 ? t.amount : 0), 0);
      const prevPointsGained = prevTx.reduce((acc, t) => acc + (t.amount > 0 ? t.amount : 0), 0);
      const deltaPoints = curPointsGained - prevPointsGained;

      // Attendance rate in current period
      const curAtt = attendanceRecords.filter(r => r.classId === student.classId && r.date >= curFrom && r.date <= curTo);
      const presentCount = curAtt.filter(r => (r.records[student.id] || 'present') === 'present').length;
      const attRate = curAtt.length > 0 ? Math.round((presentCount / curAtt.length) * 100) : 100;

      let progressKey = 'co_gang';
      let progressBadge = '✨ Cố gắng';
      let progressColor = 'text-indigo-800 bg-indigo-50 border-indigo-200';
      
      if (deltaPoints >= 10 || (curPointsGained >= 20 && deltaPoints >= 0)) {
        progressKey = 'vuot_bac';
        progressBadge = '🚀 Vượt bậc';
        progressColor = 'text-amber-800 bg-amber-50 border-amber-300 font-black';
      } else if (deltaPoints > 0) {
        progressKey = 'tien_bo';
        progressBadge = '⭐ Tiến bộ';
        progressColor = 'text-blue-800 bg-blue-50 border-blue-200';
      } else if (deltaPoints === 0) {
        progressKey = 'co_gang';
        progressBadge = '✨ Cố gắng';
        progressColor = 'text-indigo-800 bg-indigo-50 border-indigo-200';
      } else {
        progressKey = 'can_ren_luyen';
        progressBadge = '📉 Cần rèn luyện';
        progressColor = 'text-rose-800 bg-rose-50 border-rose-200';
      }

      return {
        id: student.id,
        name: student.name,
        gender: student.gender,
        group: student.group || 'Tổ 1',
        classId: student.classId,
        className: classes.find(c => c.id === student.classId)?.name || 'Lớp',
        totalPoints: student.points || 0,
        curPointsGained,
        prevPointsGained,
        deltaPoints,
        attRate,
        progressKey,
        progressBadge,
        progressColor
      };
    });

    // Apply Search & Filters
    return rawList.filter(s => {
      const matchSearch = progressSearch.trim() === '' || s.name.toLowerCase().includes(progressSearch.toLowerCase().trim());
      const matchClass = progressClassFilter === 'all' || s.classId === progressClassFilter;
      const matchBadge = progressBadgeFilter === 'all' || s.progressKey === progressBadgeFilter;
      return matchSearch && matchClass && matchBadge;
    }).sort((a, b) => {
      if (progressSortBy === 'delta') return b.deltaPoints - a.deltaPoints;
      if (progressSortBy === 'coins') return b.totalPoints - a.totalPoints;
      if (progressSortBy === 'attendance') return b.attRate - a.attRate;
      return 0;
    });
  }, [targetStudents, timeframe, currentWeekRange, previousWeekRange, currentMonthRange, previousMonthRange, transactions, attendanceRecords, classes, progressSearch, progressClassFilter, progressBadgeFilter, progressSortBy]);

  // BẢNG III: Phân trang chuẩn A4 Khổ Ngang cho Bảng tổng hợp các lớp GVCN (mỗi trang tối đa 22 lớp học)
  // Nếu trường có nhiều lớp (như 66 lớp GVCN), tự động ngắt thành 2 hoặc 3 trang khổ ngang vừa vặn, không bị co rút
  const CLASSES_PER_A4_PAGE = 22;
  const classPage1Rows = useMemo(() => selectedClassId === 'all' ? classDetailedRows.slice(0, CLASSES_PER_A4_PAGE) : [], [classDetailedRows, selectedClassId]);
  const classPage2Rows = useMemo(() => selectedClassId === 'all' ? classDetailedRows.slice(CLASSES_PER_A4_PAGE, CLASSES_PER_A4_PAGE * 2) : [], [classDetailedRows, selectedClassId]);
  const classPage3Rows = useMemo(() => selectedClassId === 'all' ? classDetailedRows.slice(CLASSES_PER_A4_PAGE * 2, CLASSES_PER_A4_PAGE * 3) : [], [classDetailedRows, selectedClassId]);

  const hasClassPage2 = classPage2Rows.length > 0;
  const hasClassPage3 = classPage3Rows.length > 0;
  const classPagesCount = selectedClassId === 'all' ? (1 + (hasClassPage2 ? 1 : 0) + (hasClassPage3 ? 1 : 0)) : 0;

  // BẢNG IV: Phân trang chuẩn A4 Khổ Ngang cho Bảng IV Tiến bộ học sinh (mỗi trang tối đa 35 học sinh rõ nét, vừa vặn không bị tràn)
  const STUDENTS_PER_A4_PAGE = 35;
  const progressPage1Students = useMemo(() => studentProgressData.slice(0, STUDENTS_PER_A4_PAGE), [studentProgressData]);
  const progressPage2Students = useMemo(() => studentProgressData.slice(STUDENTS_PER_A4_PAGE, STUDENTS_PER_A4_PAGE * 2), [studentProgressData]);
  const hasProgressPage2 = progressPage2Students.length > 0;

  // Tổng số trang in ấn / ảnh xuất khổ ngang chuẩn A4
  const totalPrintPages = (selectedClassId === 'all' ? (1 + classPagesCount) : 1) + 1 + (hasProgressPage2 ? 1 : 0);

  // Full Raw Datasets based on selected chartDataset
  const fullChartDatasetItems = useMemo(() => {
    switch (chartDataset) {
      case 'attendance':
        return [
          { key: 'present', label: 'Có mặt', value: activeTimeframeStats.present, color: '#10B981', sub: `${activeTimeframeStats.attRate}%` },
          { key: 'excused', label: 'Có phép', value: activeTimeframeStats.excused, color: '#3B82F6', sub: 'Học sinh' },
          { key: 'unexcused', label: 'Không phép', value: activeTimeframeStats.unexcused, color: '#EF4444', sub: 'Cần nhắc nhở' },
          { key: 'sick', label: 'Nghỉ ốm', value: activeTimeframeStats.sick, color: '#8B5CF6', sub: 'Học sinh' },
          { key: 'other', label: 'Lý do khác', value: activeTimeframeStats.other, color: '#64748B', sub: 'Khác' },
        ];
      case 'boarding':
        return [
          { key: 'eating', label: 'Ăn bán trú tại trường', value: activeTimeframeStats.eating, color: '#6366F1', sub: `${activeTimeframeStats.bRate}%` },
          { key: 'not_eating', label: 'Không ăn / Về nhà', value: Math.max(0, (targetStudents.length * (activeTimeframeStats.sessions || 1)) - activeTimeframeStats.eating), color: '#94A3B8', sub: 'Tự túc' }
        ];
      case 'gender':
        return [
          { key: 'boy', label: 'Học sinh Nam', value: totalBoys, color: '#2563EB', sub: `${boyPct}%` },
          { key: 'girl', label: 'Học sinh Nữ', value: totalGirls, color: '#EC4899', sub: `${girlPct}%` }
        ];
      case 'classes':
        return classDetailedRows.map((c, i) => {
          const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
          return {
            key: `class-${c.classId}`,
            label: c.className,
            value: c.totalStudents,
            color: colors[i % colors.length],
            sub: `${c.attRate}% chuyên cần`
          };
        });
      case 'grades':
        return gradeBreakdown.map((g, i) => {
          const colors = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899'];
          return {
            key: `grade-${g.gradeName}`,
            label: g.gradeName,
            value: g.studentCount,
            color: colors[i % colors.length],
            sub: `${g.classCount} lớp`
          };
        });
      case 'progress':
        const top7 = studentProgressData.slice(0, 7);
        const pColors = ['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];
        return top7.map((s, i) => ({
          key: `student-${s.id}`,
          label: s.name,
          value: Math.max(1, s.curPointsGained),
          color: pColors[i % pColors.length],
          sub: `${s.deltaPoints >= 0 ? '+' : ''}${s.deltaPoints} xu`
        }));
    }
  }, [chartDataset, activeTimeframeStats, totalBoys, totalGirls, boyPct, girlPct, classDetailedRows, gradeBreakdown, studentProgressData, targetStudents]);

  // Filtered dataset according to user's selective visibility ("Cho phép chọn dữ liệu muốn hiển thị")
  const activeChartData = useMemo(() => {
    return fullChartDatasetItems.filter(item => !hiddenDataKeys[item.key]);
  }, [fullChartDatasetItems, hiddenDataKeys]);

  const totalChartVal = activeChartData.reduce((acc, d) => acc + d.value, 0);
  const maxChartVal = Math.max(...activeChartData.map(d => d.value), 1);

  // EXPORT HANDLERS: PDF, EXCEL, PNG with TABLE + CHART + STUDENT PROGRESS (AI SMART A4 LANDSCAPE)
  const handleExportPdf = async () => {
    const printableElements = [
      page1Ref.current,
      selectedClassId === 'all' ? classPage1Ref.current : null,
      selectedClassId === 'all' && hasClassPage2 ? classPage2Ref.current : null,
      selectedClassId === 'all' && hasClassPage3 ? classPage3Ref.current : null,
      studentPage1Ref.current,
      hasProgressPage2 ? studentPage2Ref.current : null,
    ].filter(Boolean) as HTMLElement[];

    if (printableElements.length === 0) return;
    setIsExportingPdf(true);
    try {
      const fileName = `Bao_Cao_Thong_Ke_Tong_Hop_A4_Ngang_${selectedDate}.pdf`;
      const success = await exportMultipleElementsToPdf(
        printableElements,
        fileName,
        'landscape',
        'Báo Cáo Thống Kê Tổng Hợp Toàn Trường Kèm Biểu Đồ Minh Họa & Tiến Bộ Học Sinh'
      );
      if (success) {
        setExportToast(`Đã xuất thành công file PDF Khổ Ngang Chuẩn A4 (${printableElements.length} trang, lề tối thiểu 0.25cm chuẩn in ấn)!`);
        confetti({ particleCount: 35, spread: 60 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExportingPdf(false);
      setTimeout(() => setExportToast(null), 3000);
    }
  };

  const handleExportPng = async () => {
    const printableElements = [
      page1Ref.current,
      selectedClassId === 'all' ? classPage1Ref.current : null,
      selectedClassId === 'all' && hasClassPage2 ? classPage2Ref.current : null,
      selectedClassId === 'all' && hasClassPage3 ? classPage3Ref.current : null,
      studentPage1Ref.current,
      hasProgressPage2 ? studentPage2Ref.current : null,
    ].filter(Boolean) as HTMLElement[];

    if (printableElements.length === 0) return;
    setIsExportingPng(true);
    try {
      const baseFileName = `Anh_Bao_Cao_Thong_Ke_A4_Ngang_${selectedDate}`;
      const exportedCount = await exportMultipleElementsToImagesPng(
        printableElements,
        baseFileName,
        { forceA4Ratio: true, pixelRatio: 2 }
      );
      if (exportedCount > 0) {
        setExportToast(`Đã xuất thành công ${exportedCount} ảnh PNG Khổ Ngang Chuẩn A4 (Bao gồm đầy đủ Biểu đồ tròn, ${classes.length} lớp GVCN ngắt trang & tiến bộ học sinh)!`);
        confetti({ particleCount: 40, spread: 70 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExportingPng(false);
      setTimeout(() => setExportToast(null), 3000);
    }
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Helper for Unicode chart visual in Excel
    const generateAsciiBar = (pct: number, maxBlocks = 8) => {
      const filled = Math.min(maxBlocks, Math.max(0, Math.round((pct / 100) * maxBlocks)));
      const empty = maxBlocks - filled;
      return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${pct}%`;
    };

    // Sheet 1: Bảng tổng hợp chuyên cần & bán trú các chu kỳ (Hôm nay, Hôm qua, Ngày chọn, Tuần, Tháng)
    const attSummaryCols: ExcelColumnDef[] = [
      { header: 'Kỳ Thống Kê', key: 'periodLabel', width: 30 },
      { header: 'Số buổi', key: 'sessions', width: 10, isNumber: true },
      { header: 'Có mặt', key: 'present', width: 12, isNumber: true },
      { header: 'Có phép', key: 'excused', width: 12, isNumber: true },
      { header: 'Không phép', key: 'unexcused', width: 14, isNumber: true },
      { header: 'Nghỉ ốm', key: 'sick', width: 12, isNumber: true },
      { header: 'Lý do khác', key: 'other', width: 12, isNumber: true },
      { header: 'Tổng vắng', key: 'totalAbsent', width: 12, isNumber: true },
      { header: '% Chuyên cần', key: 'attRateStr', width: 14 },
      { header: 'Biểu đồ chuyên cần', key: 'attChartVisual', width: 22 },
      { header: 'Suất ăn bán trú', key: 'eating', width: 16, isNumber: true },
      { header: '% Bán trú', key: 'bRateStr', width: 14 },
      { header: 'Biểu đồ bán trú', key: 'bChartVisual', width: 22 }
    ];

    const attSummaryData = [
      {
        periodLabel: `HÔM NAY (${todayStr})`,
        sessions: todayStats.sessions,
        present: todayStats.present,
        excused: todayStats.excused,
        unexcused: todayStats.unexcused,
        sick: todayStats.sick,
        other: todayStats.other,
        totalAbsent: todayStats.totalAbsent,
        attRateStr: `${todayStats.attRate}%`,
        attChartVisual: generateAsciiBar(todayStats.attRate),
        eating: todayStats.eating,
        bRateStr: `${todayStats.bRate}%`,
        bChartVisual: generateAsciiBar(todayStats.bRate)
      },
      {
        periodLabel: `HÔM QUA (${yesterdayOfTodayStr})`,
        sessions: yesterdayStats.sessions,
        present: yesterdayStats.present,
        excused: yesterdayStats.excused,
        unexcused: yesterdayStats.unexcused,
        sick: yesterdayStats.sick,
        other: yesterdayStats.other,
        totalAbsent: yesterdayStats.totalAbsent,
        attRateStr: `${yesterdayStats.attRate}%`,
        attChartVisual: generateAsciiBar(yesterdayStats.attRate),
        eating: yesterdayStats.eating,
        bRateStr: `${yesterdayStats.bRate}%`,
        bChartVisual: generateAsciiBar(yesterdayStats.bRate)
      },
      ...(selectedDate !== todayStr && selectedDate !== yesterdayOfTodayStr ? [{
        periodLabel: `NGÀY ĐANG CHỌN (${selectedDate})`,
        sessions: selectedDayStats.sessions,
        present: selectedDayStats.present,
        excused: selectedDayStats.excused,
        unexcused: selectedDayStats.unexcused,
        sick: selectedDayStats.sick,
        other: selectedDayStats.other,
        totalAbsent: selectedDayStats.totalAbsent,
        attRateStr: `${selectedDayStats.attRate}%`,
        attChartVisual: generateAsciiBar(selectedDayStats.attRate),
        eating: selectedDayStats.eating,
        bRateStr: `${selectedDayStats.bRate}%`,
        bChartVisual: generateAsciiBar(selectedDayStats.bRate)
      }] : []),
      {
        periodLabel: `THEO TUẦN (${currentWeekRange.start} đến ${currentWeekRange.end})`,
        sessions: weekStats.sessions,
        present: weekStats.present,
        excused: weekStats.excused,
        unexcused: weekStats.unexcused,
        sick: weekStats.sick,
        other: weekStats.other,
        totalAbsent: weekStats.totalAbsent,
        attRateStr: `${weekStats.attRate}%`,
        attChartVisual: generateAsciiBar(weekStats.attRate),
        eating: weekStats.eating,
        bRateStr: `${weekStats.bRate}%`,
        bChartVisual: generateAsciiBar(weekStats.bRate)
      },
      {
        periodLabel: `THEO THÁNG (${currentMonthRange.monthLabel})`,
        sessions: monthStats.sessions,
        present: monthStats.present,
        excused: monthStats.excused,
        unexcused: monthStats.unexcused,
        sick: monthStats.sick,
        other: monthStats.other,
        totalAbsent: monthStats.totalAbsent,
        attRateStr: `${monthStats.attRate}%`,
        attChartVisual: generateAsciiBar(monthStats.attRate),
        eating: monthStats.eating,
        bRateStr: `${monthStats.bRate}%`,
        bChartVisual: generateAsciiBar(monthStats.bRate)
      }
    ];

    const wsAttSummary = buildFormattedSheet(
      {
        schoolName: teacherProfile.schoolName || 'TRƯỜNG HỌC',
        reportTitle: `BẢNG TỔNG HỢP CHUYÊN CẦN & BÁN TRÚ TOÀN DIỆN`,
        reportDate: selectedDate,
        formulaNote: 'Bao gồm chi tiết Hôm nay, Hôm qua, Ngày chọn, Theo tuần và Theo tháng kèm biểu đồ trực quan'
      },
      attSummaryCols,
      attSummaryData
    );
    XLSX.utils.book_append_sheet(wb, wsAttSummary, 'ChuyenCan_BanTru');

    // Sheet 2: Tổng hợp các lớp & các khối
    const classCols: ExcelColumnDef[] = [
      { header: 'STT', key: 'stt', width: 6, isNumber: true },
      { header: 'Khối', key: 'grade', width: 10 },
      { header: 'Lớp học', key: 'className', width: 14 },
      { header: 'Giáo viên CN', key: 'teacherName', width: 22 },
      { header: 'Sĩ số', key: 'totalStudents', width: 10, isNumber: true },
      { header: 'Nam', key: 'boys', width: 8, isNumber: true },
      { header: 'Nữ', key: 'girls', width: 8, isNumber: true },
      { header: 'Có mặt', key: 'present', width: 12, isNumber: true },
      { header: 'Có phép', key: 'excused', width: 12, isNumber: true },
      { header: 'Không phép', key: 'unexcused', width: 14, isNumber: true },
      { header: 'Nghỉ ốm', key: 'sick', width: 10, isNumber: true },
      { header: 'Khác', key: 'other', width: 10, isNumber: true },
      { header: 'Tỷ lệ CC (%)', key: 'attRateStr', width: 14 },
      { header: 'Biểu đồ CC', key: 'attBar', width: 20 },
      { header: 'Suất ăn bán trú', key: 'eating', width: 16, isNumber: true },
      { header: 'Tỷ lệ BT (%)', key: 'bRateStr', width: 14 },
      { header: 'Xu TB', key: 'avgPoints', width: 10, isNumber: true }
    ];

    const classData = classDetailedRows.map(c => ({
      stt: c.stt,
      grade: c.grade,
      className: c.className,
      teacherName: c.teacherName,
      totalStudents: c.totalStudents,
      boys: c.boys,
      girls: c.girls,
      present: c.present,
      excused: c.excused,
      unexcused: c.unexcused,
      sick: c.sick,
      other: c.other,
      attRateStr: `${c.attRate}%`,
      attBar: generateAsciiBar(c.attRate),
      eating: c.eating,
      bRateStr: `${c.bRate}%`,
      avgPoints: c.avgPoints
    }));

    const wsClasses = buildFormattedSheet(
      {
        schoolName: teacherProfile.schoolName || 'TRƯỜNG HỌC',
        reportTitle: `BÁO CÁO THỐNG KÊ TỔNG HỢP CÁC LỚP & CÁC KHỐI (${timeframe === 'day' ? `Ngày ${selectedDate}` : timeframe === 'week' ? `Tuần ${currentWeekRange.start} - ${currentWeekRange.end}` : currentMonthRange.monthLabel})`,
        reportDate: selectedDate,
        formulaNote: 'Dữ liệu được cập nhật tự động từ hệ thống quản lý Lớp Học Hạnh Phúc'
      },
      classCols,
      classData
    );
    XLSX.utils.book_append_sheet(wb, wsClasses, 'ThongKe_CacLop');

    // Sheet 3: Bảng tiến bộ học sinh
    const progCols: ExcelColumnDef[] = [
      { header: 'STT', key: 'stt', width: 6, isNumber: true },
      { header: 'Họ và tên', key: 'name', width: 22 },
      { header: 'Giới tính', key: 'gender', width: 10 },
      { header: 'Lớp', key: 'className', width: 12 },
      { header: 'Tổ', key: 'group', width: 12 },
      { header: 'Tổng xu hiện có', key: 'totalPoints', width: 16, isNumber: true },
      { header: 'Xu kỳ này', key: 'curPointsGained', width: 14, isNumber: true },
      { header: 'Xu kỳ trước', key: 'prevPointsGained', width: 14, isNumber: true },
      { header: 'Tăng trưởng xu', key: 'deltaPoints', width: 14, isNumber: true },
      { header: 'Chuyên cần (%)', key: 'attRate', width: 16 },
      { header: 'Xếp loại tiến bộ', key: 'progressBadge', width: 18 }
    ];

    const progData = studentProgressData.map((s, idx) => ({
      stt: idx + 1,
      name: s.name,
      gender: s.gender,
      className: s.className,
      group: s.group,
      totalPoints: s.totalPoints,
      curPointsGained: s.curPointsGained,
      prevPointsGained: s.prevPointsGained,
      deltaPoints: s.deltaPoints,
      attRate: `${s.attRate}%`,
      progressBadge: s.progressBadge
    }));

    const wsProg = buildFormattedSheet(
      {
        schoolName: officialSchoolName,
        reportTitle: `BẢNG THEO DÕI & SO SÁNH TIẾN BỘ HỌC SINH (${timeframe === 'month' ? 'THEO THÁNG' : 'THEO TUẦN'})`,
        reportDate: selectedDate,
        formulaNote: `Người lập: ${officialReporterName} (${officialRoleTitle}) • Trường: ${officialSchoolName}`
      },
      progCols,
      progData
    );
    XLSX.utils.book_append_sheet(wb, wsProg, 'TienBo_HocSinh');

    // Sheet 4: Dữ liệu phân tích biểu đồ minh họa chi tiết hiện đại
    const chartCols: ExcelColumnDef[] = [
      { header: 'STT', key: 'stt', width: 6, isNumber: true },
      { header: 'Chỉ số phân tích', key: 'label', width: 28 },
      { header: 'Số lượng / Giá trị', key: 'value', width: 16, isNumber: true },
      { header: 'Tỷ lệ (%)', key: 'pctStr', width: 14 },
      { header: 'Biểu đồ thanh trực quan', key: 'chartVisual', width: 24 },
      { header: 'Ghi chú', key: 'sub', width: 22 }
    ];

    const chartData = activeChartData.map((d, idx) => {
      const pct = totalChartVal > 0 ? Math.round((d.value / totalChartVal) * 100) : 0;
      return {
        stt: idx + 1,
        label: d.label,
        value: d.value,
        pctStr: `${pct}%`,
        chartVisual: generateAsciiBar(pct),
        sub: d.sub || ''
      };
    });

    const wsChart = buildFormattedSheet(
      {
        schoolName: officialSchoolName,
        reportTitle: `BẢNG PHÂN TÍCH DỮ LIỆU BIỂU ĐỒ MINH HỌA HIỆN ĐẠI (${chartDataset.toUpperCase()})`,
        reportDate: selectedDate,
        formulaNote: `Người lập: ${officialReporterName} (${officialRoleTitle}) • Dữ liệu biểu đồ minh họa chi tiết hiện đại`
      },
      chartCols,
      chartData
    );
    XLSX.utils.book_append_sheet(wb, wsChart, 'BieuDo_MinhHoa');

    XLSX.writeFile(wb, `Bao_Cao_Thong_Ke_Tong_Hop_${selectedDate}.xlsx`);
    setExportToast('Đã xuất thành công file Excel Thống kê & Biểu đồ đa trang chuẩn đẹp!');
    setTimeout(() => setExportToast(null), 3000);
  };

  const isExporting = isExportingPdf || isExportingPng;

  return (
    <div className="space-y-6">
      {/* 1. 30-DAY BACKUP WARNING BANNER (User Request: Sau 30 ngày hiển thị cảnh báo sao lưu JSON) */}
      {showBackupAlert && (
        <div className="bg-gradient-to-r from-orange-700 via-rose-600 to-orange-700 text-white rounded-3xl p-4 md:p-5 shadow-lg border border-amber-300 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center font-black shrink-0 shadow-inner">
              <ShieldAlert className="w-7 h-7 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-white text-rose-800 text-[12px] font-black uppercase tracking-wider">
                  CẢNH BÁO QUAN TRỌNG
                </span>
                <span className="text-xs font-bold text-white">
                  Đã {daysSinceBackup >= 30 ? `hơn ${daysSinceBackup}` : daysSinceBackup} ngày chưa sao lưu
                </span>
              </div>
              <h3 className="text-sm md:text-base font-black uppercase tracking-wide mt-0.5">
                HÃY SAO LƯU DỮ LIỆU ĐỊNH DẠNG .JSON ĐỂ BẢO VỆ DỮ LIỆU LỚP HỌC
              </h3>
              <p className="text-xs text-white font-medium">
                Hệ thống đề xuất bạn nên tải về file .JSON định kỳ để phòng ngừa sự cố máy tính và bảo vệ toàn bộ điểm số, chuyên cần.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              onClick={handleBackupJsonClick}
              className="px-4 py-2.5 bg-white hover:bg-amber-50 text-rose-800 rounded-xl text-xs font-black shadow-md transition-all hover-zoom-btn uppercase flex items-center gap-1.5 cursor-pointer"
            >
              <Database className="w-4 h-4 text-rose-600" />
              <span>SAO LƯU .JSON NGAY (1 CHẠM)</span>
            </button>
            <button
              onClick={handleDismissBackupAlert}
              className="px-3 py-2.5 bg-white/20 hover:bg-white/30 border border-white/70 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="Tạm ẩn cảnh báo hôm nay"
            >
              Bỏ qua
            </button>
          </div>
        </div>
      )}

      {/* 2. SAFE MONTH TRANSITION POLICY BANNER & PERMANENT BACKUP BUTTON */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-4 md:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover-zoom-card">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black shadow-2xs shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base md:text-lg font-black text-slate-900 uppercase">
                TRANG THỐNG KÊ TRỰC QUAN & PHÂN TÍCH ĐA CHIỀU
              </h2>
              <button
                type="button"
                onClick={() => setShowSafeTransitionModal(true)}
                className="px-2.5 py-0.5 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 text-[12px] font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
                title="Bấm để xem chính sách an toàn bảo toàn 100% dữ liệu khi sang tháng mới"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>Bảo toàn 100% khi sang tháng mới</span>
                <Info className="w-3 h-3 text-emerald-700" />
              </button>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Khi bước sang tháng mới, hệ thống tự động làm mới số liệu thống kê chu kỳ mới mà tuyệt đối không xóa dữ liệu lớp, học sinh hay xu thi đua!
            </p>
          </div>
        </div>

        {/* Permanent Quick Backup .JSON button (Cho phép lưu file .JSON bất cứ lúc nào) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleBackupJsonClick}
            className="px-4 py-2.5 bg-white hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all hover-zoom-btn uppercase cursor-pointer"
            title="Lưu file .JSON dự phòng an toàn bất cứ lúc nào"
          >
            <Database className="w-4 h-4 text-emerald-600" />
            <span>LƯU FILE .JSON BẤT CỨ LÚC NÀO</span>
          </button>
        </div>
      </div>

      {exportToast && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 p-3.5 rounded-2xl text-xs flex items-center gap-2 font-bold animate-in fade-in duration-150 shadow-xs">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{exportToast}</span>
        </div>
      )}

      {/* 3. TOP DEMOGRAPHIC KPI STRIP (Lớp, Học sinh, Nam/Nữ, Chuyên cần, Bán trú) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Tổng số lớp */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs hover-zoom-card space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black uppercase text-slate-500">TỔNG SỐ LỚP</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <School className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {totalClasses} <span className="text-xs font-bold text-slate-500">lớp</span>
          </div>
          <div className="text-[12px] text-slate-500 font-bold uppercase truncate">
            {gradeBreakdown.map(g => `${g.gradeName}: ${g.classCount}`).join(' • ')}
          </div>
        </div>

        {/* Tổng số học sinh */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs hover-zoom-card space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black uppercase text-slate-500">TỔNG SỐ HỌC SINH</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-indigo-950">
            {totalStudents} <span className="text-xs font-bold text-slate-500">học sinh</span>
          </div>
          <div className="text-[12px] text-indigo-700 font-bold uppercase truncate">
            TB: {totalClasses > 0 ? Math.round(totalStudents / totalClasses) : 0} em / lớp
          </div>
        </div>

        {/* Cơ cấu Nam / Nữ */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs hover-zoom-card space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black uppercase text-slate-500">CƠ CẤU GIỚI TÍNH</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <span>🚻</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-black">
            <span className="text-blue-700">Nam: {totalBoys} ({boyPct}%)</span>
            <span className="text-pink-600">Nữ: {totalGirls} ({girlPct}%)</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
            <div className="bg-blue-600 h-full" style={{ width: `${boyPct}%` }} />
            <div className="bg-pink-500 h-full" style={{ width: `${girlPct}%` }} />
          </div>
        </div>

        {/* Chuyên cần */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs hover-zoom-card space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black uppercase text-emerald-700">CHUYÊN CẦN ({timeframe === 'day' ? 'HÔM NAY' : timeframe === 'week' ? 'TUẦN NÀY' : 'CẢ THÁNG'})</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-800">
            {activeTimeframeStats.attRate}%
          </div>
          <div className="text-[12px] text-emerald-700 font-bold truncate">
            {activeTimeframeStats.present} có mặt • {activeTimeframeStats.totalAbsent} vắng
          </div>
        </div>

        {/* Ăn bán trú */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs hover-zoom-card space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-black uppercase text-indigo-700">ĂN BÁN TRÚ ({timeframe === 'day' ? 'HÔM NAY' : timeframe === 'week' ? 'TUẦN NÀY' : 'CẢ THÁNG'})</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
              <span>🍱</span>
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-indigo-900">
            {activeTimeframeStats.bRate}%
          </div>
          <div className="text-[12px] text-indigo-700 font-bold truncate">
            {activeTimeframeStats.eating} suất ăn đăng ký
          </div>
        </div>
      </div>

      {/* 4. CONTROL TOOLBAR: TIMEFRAME (NGÀY / TUẦN / THÁNG) & EXPORT ACTIONS */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-3.5 sm:p-4 md:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 hover-zoom-card">
        {/* Left: View by NGÀY / TUẦN / THÁNG */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
          <div className="grid grid-cols-3 sm:flex items-center gap-1 sm:gap-1.5 bg-slate-100 p-1 sm:p-1.5 rounded-2xl border border-slate-200 w-full sm:w-auto">
            <button
              onClick={() => setTimeframe('day')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer uppercase ${
                timeframe === 'day' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="sm:hidden">1. NGÀY</span>
              <span className="hidden sm:inline">1. XEM THEO NGÀY</span>
            </button>

            <button
              onClick={() => setTimeframe('week')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer uppercase ${
                timeframe === 'week' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="sm:hidden">2. TUẦN</span>
              <span className="hidden sm:inline">2. XEM THEO TUẦN</span>
            </button>

            <button
              onClick={() => setTimeframe('month')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer uppercase ${
                timeframe === 'month' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="sm:hidden">3. THÁNG</span>
              <span className="hidden sm:inline">3. XEM THEO THÁNG</span>
            </button>

            <button
              onClick={() => setTimeframe('semester')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer uppercase ${
                timeframe === 'semester' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="sm:hidden">4. HỌC KÌ</span>
              <span className="hidden sm:inline">4. XEM THEO HỌC KÌ</span>
            </button>
          </div>

          {/* Time Navigation & Switcher */}
          {timeframe === 'day' && (
            <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 bg-slate-50 p-1 sm:p-1.5 rounded-2xl border border-slate-200 text-xs w-full sm:w-auto">
              <button
                onClick={() => changeDateBy(-1)}
                className="p-1 sm:p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg cursor-pointer"
                title="Lùi 1 ngày"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedDate(todayStr)}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-bold cursor-pointer text-xs ${
                  selectedDate === todayStr ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Hôm Nay
              </button>
              <button
                onClick={() => setSelectedDate(yesterdayOfTodayStr)}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-bold cursor-pointer text-xs ${
                  selectedDate === yesterdayOfTodayStr ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Hôm Qua
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-bold focus:outline-none cursor-pointer text-xs"
              />
              <button
                onClick={() => changeDateBy(1)}
                className="p-1 sm:p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg cursor-pointer"
                title="Tiến 1 ngày"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {timeframe === 'week' && (
            <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl text-xs font-black flex items-center gap-2">
              <span>Tuần: {currentWeekRange.start} đến {currentWeekRange.end}</span>
            </div>
          )}

          {timeframe === 'month' && (
            <div className="flex flex-wrap items-center gap-2 bg-purple-50 px-3 py-1.5 rounded-2xl border border-purple-200 text-xs">
              <span className="font-black text-purple-900">{currentMonthRange.monthLabel}</span>
              <span className="text-[12px] text-purple-700 font-bold bg-white px-2 py-0.5 rounded-full border border-purple-200">
                Bảo toàn 100% học sinh & xu
              </span>
            </div>
          )}

          {timeframe === 'semester' && (
            <div className="flex flex-wrap items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-2xl border border-amber-200 text-xs">
              <span className="font-bold text-amber-900">Học kì:</span>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value as any)}
                className="bg-white border border-amber-300 rounded-lg px-2 py-0.5 font-black text-amber-950 text-xs focus:outline-none cursor-pointer"
              >
                <option value="hk1">Học kì I (05/09 - 15/01)</option>
                <option value="hk2">Học kì II (16/01 - 31/05)</option>
                <option value="year">Cả Năm Học (05/09 - 31/05)</option>
              </select>
              <span className="text-[12px] text-amber-800 font-bold bg-amber-100/70 px-2 py-0.5 rounded-full border border-amber-300">
                {currentSemesterRange.start} đến {currentSemesterRange.end}
              </span>
            </div>
          )}

          {/* Scope Selector: Toàn trường vs Lớp cụ thể */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 w-full sm:w-auto">
            <span className="text-[12px] font-bold text-slate-500 uppercase">Phạm vi:</span>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="bg-transparent text-xs font-black text-slate-900 focus:outline-none cursor-pointer flex-1"
            >
              <option value="all">🏫 Toàn trường ({classes.length} lớp)</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>Lớp {c.name} ({c.grade || 'Khối 4'})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Export Reports (PDF A4, EXCEL, PNG with DATA + CHARTS) */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 w-full lg:w-auto shrink-0">
          {/* 🤖 AI BỐ CỤC THÔNG MINH: TỰ ĐỘNG KHỔ NGANG A4 */}
          <div 
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-indigo-200/90 shadow-2xs text-indigo-950 col-span-2 sm:col-span-1"
            title="Trí tuệ nhân tạo AI tự động phân tích ma trận dữ liệu (12 cột bảng & cụm biểu đồ đa chiều) để thiết lập Khổ Ngang Chuẩn A4 (Landscape 297mm x 210mm) hoàn hảo nhất"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse shrink-0" />
            <span className="text-[12px] sm:text-[12px] font-black uppercase tracking-tight whitespace-nowrap">
              AI BỐ CỤC: KHỔ NGANG A4 (12 CỘT & BIỂU ĐỒ)
            </span>
          </div>

          {/* Xuất Ảnh PNG */}
          <button
            onClick={handleExportPng}
            disabled={isExporting}
            className="px-3 sm:px-3.5 py-2 bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all hover-zoom-btn uppercase cursor-pointer"
            title={`Xuất trọn bộ ảnh PNG Khổ Ngang Chuẩn A4 (${totalPrintPages} Ảnh) gồm Biểu đồ tròn, Báo cáo tổng hợp, Bảng ${classes.length} lớp GVCN (ngắt trang) & Tiến bộ học sinh`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-emerald-100" />
            <span>{isExportingPng ? 'Đang tạo...' : `Xuất Ảnh PNG (${totalPrintPages} Ảnh)`}</span>
          </button>

          {/* Xuất PDF A4 */}
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className="px-3 sm:px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all hover-zoom-btn uppercase cursor-pointer"
            title={`Xuất bản PDF A4 Khổ Ngang chuẩn in ấn (${totalPrintPages} Trang, lề tối thiểu 0.25cm) chứa trọn vẹn biểu đồ, các lớp GVCN ngắt trang và tiến bộ học sinh`}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">{isExportingPdf ? 'Đang tạo...' : `Xuất PDF A4 (${totalPrintPages} Trang)`}</span>
          </button>

          {/* Xuất Excel */}
          <button
            onClick={handleExportExcel}
            className="px-3 sm:px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all hover-zoom-btn uppercase cursor-pointer"
            title="Xuất file Excel chuẩn bảng số liệu và tổng hợp đa sheet kèm biểu đồ minh họa"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* 5. TRANG 1: BÁO CÁO THỐNG KÊ TỔNG HỢP & BIỂU ĐỒ MINH HỌA HIỆN ĐẠI (A4 KHỔ NGANG) */}
      <div 
        ref={page1Ref}
        id="report-page-1"
        className="mx-auto bg-white p-4 sm:p-6 md:p-8 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 sm:space-y-5 max-w-7xl"
      >
        {/* Document Header (For Prints, PDF & PNG) */}
        <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-3.5 gap-3">
          <div>
            <div className="font-bold uppercase text-[12px] text-slate-600">
              {officialSchoolName}
            </div>
            <div className="font-black text-sm sm:text-base text-slate-900 uppercase">
              BÁO CÁO THỐNG KÊ TỔNG HỢP {selectedClassId === 'all' ? 'TOÀN TRƯỜNG' : `LỚP ${classes.find(c => c.id === selectedClassId)?.name}`}
            </div>
            <div className="text-[12px] text-slate-500">
              Năm học: {teacherProfile.academicYear || '2026 - 2027'} • Người lập: <strong>{officialReporterName}</strong> <span className="text-[12px] text-indigo-600 font-bold uppercase">({officialRoleTitle})</span>
            </div>
          </div>

          <div className="text-left sm:text-right text-[12px] text-slate-500">
            <div className="font-bold uppercase text-slate-700">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div className="italic text-[12px]">Độc lập - Tự do - Hạnh phúc</div>
            <div className="mt-1 font-semibold">
              Kỳ báo cáo: {timeframe === 'day' ? `Ngày ${selectedDate}` : timeframe === 'week' ? `Tuần (${currentWeekRange.start} - ${currentWeekRange.end})` : timeframe === 'month' ? currentMonthRange.monthLabel : currentSemesterRange.label}
            </div>
          </div>
        </div>

        {/* 4 Quick KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-[12px] font-black text-slate-500 uppercase">SĨ SỐ {selectedClassId === 'all' ? 'TOÀN TRƯỜNG' : 'LỚP'}</div>
              <div className="text-base font-black text-indigo-950 font-mono">{totalStudents} <span className="text-[12px] font-bold text-slate-500 uppercase">HS</span></div>
            </div>
            <div className="text-[12px] text-indigo-600 font-bold uppercase">{selectedClassId === 'all' ? `${classes.length} Lớp GVCN` : '1 Lớp'}</div>
          </div>

          <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between">
            <div>
              <div className="text-[12px] font-black text-emerald-800 uppercase">CHUYÊN CẦN ({todayStr})</div>
              <div className="text-base font-black text-emerald-700 font-mono">{todayStats.attRate}%</div>
            </div>
            <div className="text-[12px] text-emerald-700 font-bold font-mono">{todayStats.present}/{totalStudents} HS</div>
          </div>

          <div className="bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-200 flex items-center justify-between">
            <div>
              <div className="text-[12px] font-black text-indigo-800 uppercase">ĂN BÁN TRÚ HÔM NAY</div>
              <div className="text-base font-black text-indigo-700 font-mono">{todayStats.bRate}%</div>
            </div>
            <div className="text-[12px] text-indigo-600 font-bold font-mono">{todayStats.eating} suất</div>
          </div>

          <div className="bg-amber-50/70 p-2.5 rounded-xl border border-amber-200 flex items-center justify-between">
            <div>
              <div className="text-[12px] font-black text-amber-800 uppercase">TỔNG XU THI ĐUA</div>
              <div className="text-base font-black text-amber-700 font-mono">{totalCoins} <span className="text-[12px] font-bold text-slate-500 uppercase">xu</span></div>
            </div>
            <div className="text-[12px] text-amber-700 font-bold uppercase">{selectedClassId === 'all' ? 'Toàn trường' : 'Cả lớp'}</div>
          </div>
        </div>

        {/* 4 Periods Breakdown Matrix for Attendance & Boarding (Hôm nay, Hôm qua, Tuần, Tháng, Học kì) */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wide flex items-center gap-1.5">
              <span>I. BẢNG CHI TIẾT CHUYÊN CẦN & BÁN TRÚ (HÔM NAY • HÔM QUA • THEO TUẦN • THEO THÁNG • THEO HỌC KÌ)</span>
            </h3>
            <span className="text-[12px] text-slate-500 font-bold uppercase">
              Có mặt • Có phép • Không phép • Nghỉ ốm • Lý do khác • Suất ăn bán trú
            </span>
          </div>

          {/* Gợi ý cuộn ngang trên điện thoại */}
          <div className="sm:hidden flex items-center gap-1.5 text-[12px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-xl font-bold w-fit mb-2">
            <span>⇄ Vuốt ngang để xem đủ 10 cột báo cáo</span>
          </div>

          <div className="overflow-x-auto border border-slate-300 rounded-2xl scrollbar-thin">
            <table className="min-w-[680px] w-full text-[12px] text-center border-collapse">
              <thead className="bg-slate-100 font-black text-slate-800 border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300 text-left whitespace-nowrap">Kỳ Thống Kê</th>
                  <th className="p-2 border-r border-slate-300 whitespace-nowrap">Số buổi</th>
                  <th className="p-2 border-r border-slate-300 text-emerald-700 whitespace-nowrap">Có mặt</th>
                  <th className="p-2 border-r border-slate-300 text-blue-700 whitespace-nowrap">Có phép</th>
                  <th className="p-2 border-r border-slate-300 text-rose-700 whitespace-nowrap">Không phép</th>
                  <th className="p-2 border-r border-slate-300 text-purple-700 whitespace-nowrap">Nghỉ ốm</th>
                  <th className="p-2 border-r border-slate-300 text-slate-700 whitespace-nowrap">Khác</th>
                  <th className="p-2 border-r border-slate-300 bg-emerald-50 text-emerald-900 whitespace-nowrap">% Chuyên cần</th>
                  <th className="p-2 border-r border-slate-300 text-indigo-700 whitespace-nowrap">Suất ăn bán trú</th>
                  <th className="p-2 bg-indigo-50 text-indigo-900">% Bán trú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-semibold">
                {/* 1. HÔM NAY */}
                <tr className={timeframe === 'day' && selectedDate === todayStr ? 'bg-amber-50/70 font-bold' : ''}>
                  <td className="p-2 text-left font-black text-slate-900 border-r border-slate-300 flex items-center justify-between">
                    <span>HÔM NAY ({todayStr})</span>
                    {selectedDate === todayStr && <span className="text-[12px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-bold">Đang xem</span>}
                  </td>
                  <td className="p-2 border-r border-slate-300">{todayStats.sessions}</td>
                  <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{todayStats.present}</td>
                  <td className="p-2 border-r border-slate-300">{todayStats.excused}</td>
                  <td className="p-2 border-r border-slate-300">{todayStats.unexcused}</td>
                  <td className="p-2 border-r border-slate-300">{todayStats.sick}</td>
                  <td className="p-2 border-r border-slate-300">{todayStats.other}</td>
                  <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{todayStats.attRate}%</td>
                  <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{todayStats.eating}</td>
                  <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{todayStats.bRate}%</td>
                </tr>

                {/* 2. HÔM QUA */}
                <tr className={timeframe === 'day' && selectedDate === yesterdayOfTodayStr ? 'bg-amber-50/70 font-bold' : ''}>
                  <td className="p-2 text-left font-black text-slate-900 border-r border-slate-300 flex items-center justify-between">
                    <span>HÔM QUA ({yesterdayOfTodayStr})</span>
                    {selectedDate === yesterdayOfTodayStr && <span className="text-[12px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-bold">Đang xem</span>}
                  </td>
                  <td className="p-2 border-r border-slate-300">{yesterdayStats.sessions}</td>
                  <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{yesterdayStats.present}</td>
                  <td className="p-2 border-r border-slate-300">{yesterdayStats.excused}</td>
                  <td className="p-2 border-r border-slate-300">{yesterdayStats.unexcused}</td>
                  <td className="p-2 border-r border-slate-300">{yesterdayStats.sick}</td>
                  <td className="p-2 border-r border-slate-300">{yesterdayStats.other}</td>
                  <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{yesterdayStats.attRate}%</td>
                  <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{yesterdayStats.eating}</td>
                  <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{yesterdayStats.bRate}%</td>
                </tr>

                {/* 3. NGÀY ĐANG CHỌN (NẾU KHÁC HÔM NAY VÀ HÔM QUA) */}
                {selectedDate !== todayStr && selectedDate !== yesterdayOfTodayStr && (
                  <tr className="bg-amber-50/70 font-bold">
                    <td className="p-2 text-left font-black text-indigo-900 border-r border-slate-300 flex items-center justify-between">
                      <span>NGÀY ĐANG CHỌN ({selectedDate})</span>
                      <span className="text-[12px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-bold">Đang xem</span>
                    </td>
                    <td className="p-2 border-r border-slate-300">{selectedDayStats.sessions}</td>
                    <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{selectedDayStats.present}</td>
                    <td className="p-2 border-r border-slate-300">{selectedDayStats.excused}</td>
                    <td className="p-2 border-r border-slate-300">{selectedDayStats.unexcused}</td>
                    <td className="p-2 border-r border-slate-300">{selectedDayStats.sick}</td>
                    <td className="p-2 border-r border-slate-300">{selectedDayStats.other}</td>
                    <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{selectedDayStats.attRate}%</td>
                    <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{selectedDayStats.eating}</td>
                    <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{selectedDayStats.bRate}%</td>
                  </tr>
                )}

                {/* 4. THEO TUẦN */}
                <tr className={timeframe === 'week' ? 'bg-blue-50/60 font-bold' : ''}>
                  <td className="p-2 text-left font-black text-slate-900 border-r border-slate-300 flex items-center justify-between">
                    <span>THEO TUẦN ({currentWeekRange.start} đến {currentWeekRange.end})</span>
                    {timeframe === 'week' && <span className="text-[12px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-bold">Đang xem</span>}
                  </td>
                  <td className="p-2 border-r border-slate-300">{weekStats.sessions}</td>
                  <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{weekStats.present}</td>
                  <td className="p-2 border-r border-slate-300">{weekStats.excused}</td>
                  <td className="p-2 border-r border-slate-300">{weekStats.unexcused}</td>
                  <td className="p-2 border-r border-slate-300">{weekStats.sick}</td>
                  <td className="p-2 border-r border-slate-300">{weekStats.other}</td>
                  <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{weekStats.attRate}%</td>
                  <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{weekStats.eating}</td>
                  <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{weekStats.bRate}%</td>
                </tr>

                {/* 5. THEO THÁNG */}
                <tr className={timeframe === 'month' ? 'bg-purple-50/60 font-bold' : ''}>
                  <td className="p-2 text-left font-black text-slate-900 border-r border-slate-300 flex items-center justify-between">
                    <span>THEO THÁNG ({currentMonthRange.monthLabel})</span>
                    {timeframe === 'month' && <span className="text-[12px] bg-purple-600 text-white px-1.5 py-0.2 rounded font-bold">Đang xem</span>}
                  </td>
                  <td className="p-2 border-r border-slate-300">{monthStats.sessions}</td>
                  <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{monthStats.present}</td>
                  <td className="p-2 border-r border-slate-300">{monthStats.excused}</td>
                  <td className="p-2 border-r border-slate-300">{monthStats.unexcused}</td>
                  <td className="p-2 border-r border-slate-300">{monthStats.sick}</td>
                  <td className="p-2 border-r border-slate-300">{monthStats.other}</td>
                  <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{monthStats.attRate}%</td>
                  <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{monthStats.eating}</td>
                  <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{monthStats.bRate}%</td>
                </tr>

                {/* 6. THEO HỌC KÌ */}
                <tr className={timeframe === 'semester' ? 'bg-amber-50/70 font-bold' : ''}>
                  <td className="p-2 text-left font-black text-slate-900 border-r border-slate-300 flex items-center justify-between">
                    <span>THEO HỌC KÌ ({currentSemesterRange.label})</span>
                    {timeframe === 'semester' && <span className="text-[12px] bg-amber-700 text-white px-1.5 py-0.2 rounded font-bold">Đang xem</span>}
                  </td>
                  <td className="p-2 border-r border-slate-300">{semesterStats.sessions}</td>
                  <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{semesterStats.present}</td>
                  <td className="p-2 border-r border-slate-300">{semesterStats.excused}</td>
                  <td className="p-2 border-r border-slate-300">{semesterStats.unexcused}</td>
                  <td className="p-2 border-r border-slate-300">{semesterStats.sick}</td>
                  <td className="p-2 border-r border-slate-300">{semesterStats.other}</td>
                  <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{semesterStats.attRate}%</td>
                  <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{semesterStats.eating}</td>
                  <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{semesterStats.bRate}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. INTERACTIVE CHART AREA (TRÒN • CỘT • ĐƯỜNG + TÙY CHỌN DỮ LIỆU MUỐN HIỂN THỊ) */}
        <div className="bg-slate-50/60 border border-slate-200 rounded-3xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>II. BIỂU ĐỒ TRỰC QUAN (TRÒN • CỘT • ĐƯỜNG - TÙY CHỌN DỮ LIỆU HIỂN THỊ)</span>
              </h3>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                Chuyển đổi kiểu biểu đồ và bật/tắt các chỉ số bạn muốn xem trong biểu đồ báo cáo
              </p>
            </div>

            {/* Selectors */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Dataset Selector */}
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                <span className="text-[12px] font-bold text-slate-500">Nhóm:</span>
                <select
                  value={chartDataset}
                  onChange={(e) => {
                    setChartDataset(e.target.value as any);
                    setHiddenDataKeys({}); // Reset hidden filter when switching dataset
                  }}
                  className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                >
                  <option value="attendance">✓ Chuyên cần & Lý do vắng</option>
                  <option value="boarding">🍱 Suất ăn Bán trú</option>
                  <option value="gender">🚻 Cơ cấu Nam / Nữ</option>
                  <option value="classes">🏫 Số học sinh từng Lớp</option>
                  <option value="grades">📚 Số học sinh từng Khối</option>
                  <option value="progress">🚀 Xu hướng Tiến bộ học sinh</option>
                </select>
              </div>

              {/* Chart Type Toggle: TRÒN, CỘT, ĐƯỜNG (User Request) */}
              <div className="flex items-center bg-white p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setChartType('bar')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    chartType === 'bar' ? 'bg-indigo-600 text-white shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Biểu đồ cột"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>CỘT</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChartType('pie')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    chartType === 'pie' ? 'bg-indigo-600 text-white shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Biểu đồ tròn"
                >
                  <PieChart className="w-3.5 h-3.5" />
                  <span>TRÒN</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChartType('line')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    chartType === 'line' ? 'bg-indigo-600 text-white shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Biểu đồ đường"
                >
                  <LineChart className="w-3.5 h-3.5" />
                  <span>ĐƯỜNG</span>
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Checkbox Filter Strip: Cho phép chọn dữ liệu muốn hiển thị */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[12px] font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-slate-400" />
              <span>Hiển thị:</span>
            </span>

            {fullChartDatasetItems.map(item => {
              const isHidden = !!hiddenDataKeys[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleDataKeyVisibility(item.key)}
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                    !isHidden 
                      ? 'bg-white text-slate-800 border-slate-300 shadow-2xs' 
                      : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                  }`}
                  title={`Bấm để ${isHidden ? 'hiện' : 'ẩn'} chỉ số này`}
                >
                  <span 
                    className="w-2.5 h-2.5 rounded-full shrink-0" 
                    style={{ backgroundColor: isHidden ? '#94A3B8' : item.color }} 
                  />
                  <span>{item.label}</span>
                  <span className="font-mono text-[12px] opacity-75">({item.value})</span>
                </button>
              );
            })}

            {Object.keys(hiddenDataKeys).length > 0 && (
              <button
                type="button"
                onClick={showAllDataKeys}
                className="px-2 py-0.5 text-[12px] font-bold text-indigo-700 hover:underline cursor-pointer ml-1"
              >
                Hiện lại tất cả
              </button>
            )}
          </div>

          {/* RENDER ACTUAL CHART GRAPHICS */}
          <div className="min-h-[260px] flex items-center justify-center p-2">
            {activeChartData.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                Bạn đã ẩn tất cả dữ liệu biểu đồ. Hãy bấm vào các nút chỉ số ở trên hoặc bấm &quot;Hiện lại tất cả&quot; để xem biểu đồ!
              </div>
            ) : (
              <>
                {/* 1. BIỂU ĐỒ CỘT (BAR CHART) */}
                {chartType === 'bar' && (
                  <div className="w-full space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3 items-end h-56 pt-6 pb-2 px-2 border-b border-slate-200">
                      {activeChartData.map((item, idx) => {
                        const barHeightPct = maxChartVal > 0 ? Math.max(12, Math.round((item.value / maxChartVal) * 100)) : 10;
                        return (
                          <div key={idx} className="flex flex-col items-center h-full justify-end group">
                            <span className="text-[12px] font-mono font-black text-slate-900 mb-1 group-hover:scale-110 transition-transform">
                              {item.value}
                            </span>
                            <div 
                              className="w-full max-w-[50px] rounded-t-xl transition-all duration-300 shadow-sm"
                              style={{ 
                                height: `${barHeightPct}%`,
                                backgroundColor: item.color 
                              }}
                            />
                            <span className="text-[12px] font-bold text-slate-700 mt-2 truncate w-full text-center" title={item.label}>
                              {item.label}
                            </span>
                            <span className="text-[12px] text-slate-400 font-semibold truncate">
                              {item.sub}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. BIỂU ĐỒ TRÒN (PIE / DONUT CHART) */}
                {chartType === 'pie' && (
                  <div className="w-full flex flex-col md:flex-row items-center justify-center gap-8 py-2">
                    {/* SVG Donut */}
                    <div className="relative w-48 h-48 shrink-0">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        {(() => {
                          let accumulatedAngle = 0;
                          return activeChartData.map((item, idx) => {
                            const slicePct = totalChartVal > 0 ? item.value / totalChartVal : 1 / activeChartData.length;
                            const strokeDasharray = `${slicePct * 251.2} 251.2`;
                            const strokeDashoffset = -accumulatedAngle * 251.2;
                            accumulatedAngle += slicePct;

                            return (
                              <circle
                                key={idx}
                                cx="50"
                                cy="50"
                                r="40"
                                fill="transparent"
                                stroke={item.color}
                                strokeWidth="18"
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                className="transition-all duration-300 hover:opacity-80"
                              />
                            );
                          });
                        })()}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-xl font-black font-mono text-slate-900">{totalChartVal}</span>
                        <span className="text-[12px] font-bold text-slate-500 uppercase">Tổng cộng</span>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs max-w-md">
                      {activeChartData.map((item, idx) => {
                        const pct = totalChartVal > 0 ? Math.round((item.value / totalChartVal) * 100) : 0;
                        return (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                            <span className="w-3.5 h-3.5 rounded-md shrink-0" style={{ backgroundColor: item.color }} />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-800 text-[12px] truncate">{item.label}</div>
                              <div className="text-[12px] text-slate-500 font-semibold">{item.value} ({pct}%) • {item.sub}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. BIỂU ĐỒ ĐƯỜNG (LINE CHART) */}
                {chartType === 'line' && (
                  <div className="w-full h-56 flex flex-col justify-between py-2">
                    <div className="relative w-full h-44">
                      <svg viewBox="0 0 500 150" className="w-full h-full overflow-visible">
                        <defs>
                          <linearGradient id="chartGradient2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Horizontal Grid lines */}
                        <line x1="0" y1="20" x2="500" y2="20" stroke="#E2E8F0" strokeDasharray="3 3" />
                        <line x1="0" y1="75" x2="500" y2="75" stroke="#E2E8F0" strokeDasharray="3 3" />
                        <line x1="0" y1="130" x2="500" y2="130" stroke="#CBD5E1" />

                        {/* Area under curve & Polyline */}
                        {(() => {
                          const count = activeChartData.length;
                          if (count === 0) return null;
                          const step = count > 1 ? 500 / (count - 1) : 250;
                          const points = activeChartData.map((d, i) => {
                            const x = count > 1 ? i * step : 250;
                            const y = 130 - (maxChartVal > 0 ? (d.value / maxChartVal) * 110 : 0);
                            return { x, y, ...d };
                          });

                          const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
                          const areaStr = `0,130 ${pointsStr} 500,130`;

                          return (
                            <>
                              <polygon points={areaStr} fill="url(#chartGradient2)" />
                              <polyline
                                fill="none"
                                stroke="#6366F1"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={pointsStr}
                              />
                              {points.map((p, i) => (
                                <g key={i}>
                                  <circle cx={p.x} cy={p.y} r="5" fill="#FFFFFF" stroke={p.color || '#4F46E5'} strokeWidth="3" />
                                  <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1E293B">
                                    {p.value}
                                  </text>
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    </div>

                    <div className="flex justify-between items-center text-[12px] text-slate-500 font-bold px-1 pt-1">
                      {activeChartData.map((item, i) => (
                        <span key={i} className="truncate max-w-[80px] text-center" title={item.label}>
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* AI Pedagogical Summary Insight */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-3 sm:p-4 rounded-2xl border border-indigo-200/90 flex items-start gap-3 text-xs text-indigo-950 font-medium">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-black text-indigo-900 uppercase text-[12px] block mb-0.5">
                🤖 NHẬN ĐỊNH SƯ PHẠM & ĐÁNH GIÁ CHẤT LƯỢNG GIÁO DỤC (AI):
              </span>
              <span>
                {selectedClassId === 'all' 
                  ? `Toàn trường đạt tỷ lệ chuyên cần ${activeTimeframeStats.attRate}% (${activeTimeframeStats.present}/${totalStudents} học sinh hiện diện), ${activeTimeframeStats.totalAbsent === 0 ? 'không có học sinh vắng' : `tổng số vắng ${activeTimeframeStats.totalAbsent} em`}. Toàn bộ ${classes.length} lớp Giáo viên chủ nhiệm duy trì nền nếp thi đua học tập xuất sắc.`
                  : `Lớp ${classes.find(c => c.id === selectedClassId)?.name} đạt tỷ lệ chuyên cần ${activeTimeframeStats.attRate}%, duy trì kỷ cương và phong trào tích lũy xu thi đua tích cực.`}
              </span>
            </div>
          </div>
        </div>

        {/* Chữ ký xác nhận Trang 1 */}
        <div className="grid grid-cols-2 pt-6 text-center text-xs border-t border-slate-200">
          <div>
            <div className="font-black uppercase text-slate-800">NGƯỜI LẬP BÁO CÁO</div>
            <div className="text-[12px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
            <div className="h-14" />
            <div className="font-black text-slate-900">{officialReporterName}</div>
          </div>
          <div>
            <div className="font-black uppercase text-slate-800">HIỆU TRƯỞNG / BAN GIÁM HIỆU</div>
            <div className="text-[12px] text-slate-500 italic">(Ký tên và đóng dấu)</div>
            <div className="h-14" />
            <div className="font-black text-slate-900">Ban Giám Hiệu</div>
          </div>
        </div>
      </div>

      {/* 6. BẢNG TỔNG HỢP SĨ SỐ, NAM/NỮ, CHUYÊN CẦN & BÁN TRÚ CÁC LỚP HỌC (NGẮT 1, 2 HOẶC 3 TRANG A4 KHỔ NGANG) */}
      {selectedClassId === 'all' && (
        <>
          {/* TRANG LỚP PHẦN 1 (Lớp 1 đến 22) */}
          <div 
            ref={classPage1Ref}
            id="report-page-class-1"
            className="mx-auto bg-white p-4 sm:p-6 md:p-8 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 max-w-7xl mt-6"
          >
            {/* Header Trang Lớp 1 */}
            <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-3 gap-2">
              <div>
                <div className="font-bold uppercase text-[12px] text-slate-600">
                  {officialSchoolName} • BÁO CÁO THỐNG KÊ CHI TIẾT CÁC LỚP HỌC (TRANG 2{classPagesCount > 1 ? ` - PHẦN 1` : ''})
                </div>
                <div className="font-black text-sm text-slate-900 uppercase">
                  BẢNG TỔNG HỢP SĨ SỐ, NAM/NỮ, CHUYÊN CẦN & BÁN TRÚ {classes.length} LỚP GIÁO VIÊN CHỦ NHIỆM {classPagesCount > 1 ? `(PHẦN 1)` : ''}
                </div>
                <div className="text-[12px] text-slate-500">
                  Danh sách từ lớp 1 đến {classPage1Rows.length} (Tổng cộng: {classes.length} lớp GVCN)
                </div>
              </div>
              <div className="text-right text-[12px] text-slate-500 font-semibold">
                Kỳ báo cáo: {timeframe === 'day' ? `Ngày ${selectedDate}` : timeframe === 'week' ? `Tuần (${currentWeekRange.start} - ${currentWeekRange.end})` : timeframe === 'month' ? currentMonthRange.monthLabel : currentSemesterRange.label}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wide flex items-center gap-1.5">
                  <span>III. BẢNG TỔNG HỢP SĨ SỐ, NAM/NỮ & GIÁO VIÊN CHỦ NHIỆM TỪNG LỚP/TỪNG KHỐI</span>
                </h3>
                <span className="text-[12px] text-slate-500 font-bold uppercase">
                  {classPage1Rows.length} Lớp (Phần 1)
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                <table className="w-full text-[12px] text-center border-collapse">
                  <thead className="bg-slate-100 font-black text-slate-800 border-b border-slate-300">
                    <tr>
                      <th className="p-2 border-r border-slate-300 w-10">STT</th>
                      <th className="p-2 border-r border-slate-300">Khối</th>
                      <th className="p-2 border-r border-slate-300 text-left">Lớp học</th>
                      <th className="p-2 border-r border-slate-300 text-left">Giáo viên chủ nhiệm</th>
                      <th className="p-2 border-r border-slate-300">Sĩ số</th>
                      <th className="p-2 border-r border-slate-300 text-blue-700">Nam</th>
                      <th className="p-2 border-r border-slate-300 text-pink-700">Nữ</th>
                      <th className="p-2 border-r border-slate-300 text-emerald-700">Có mặt</th>
                      <th className="p-2 border-r border-slate-300 text-rose-700">Vắng</th>
                      <th className="p-2 border-r border-slate-300 bg-emerald-50 text-emerald-900">% Chuyên cần</th>
                      <th className="p-2 border-r border-slate-300 text-indigo-700">Suất ăn</th>
                      <th className="p-2 bg-indigo-50 text-indigo-900">% Bán trú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold">
                    {classPage1Rows.map(c => (
                      <tr key={c.classId} className="hover:bg-slate-50">
                        <td className="p-1.5 border-r border-slate-300 font-mono">{c.stt}</td>
                        <td className="p-1.5 border-r border-slate-300 text-slate-600">{c.grade}</td>
                        <td className="p-1.5 border-r border-slate-300 text-left font-black text-slate-900">{c.className}</td>
                        <td className="p-1.5 border-r border-slate-300 text-left text-slate-700 font-bold">{c.teacherName}</td>
                        <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-slate-900">{c.totalStudents}</td>
                        <td className="p-1.5 border-r border-slate-300 text-blue-700 font-mono">{c.boys}</td>
                        <td className="p-1.5 border-r border-slate-300 text-pink-600 font-mono">{c.girls}</td>
                        <td className="p-1.5 border-r border-slate-300 text-emerald-700 font-mono">{c.present}</td>
                        <td className="p-1.5 border-r border-slate-300 text-rose-700 font-mono">{c.totalAbsent}</td>
                        <td className="p-1.5 border-r border-slate-300 bg-emerald-50/60 font-black text-emerald-800">{c.attRate}%</td>
                        <td className="p-1.5 border-r border-slate-300 text-indigo-700 font-mono font-bold">{c.eating}</td>
                        <td className="p-1.5 bg-indigo-50/60 font-black text-indigo-800">{c.bRate}%</td>
                      </tr>
                    ))}
                    {!hasClassPage2 && (
                      <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                        <td colSpan={4} className="p-2 border-r border-slate-300 text-center uppercase">
                          TỔNG CỘNG TOÀN TRƯỜNG ({classes.length} LỚP)
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono">{totalStudents}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-blue-800">{totalBoys}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-pink-700">{totalGirls}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-emerald-800">{activeTimeframeStats.present}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-rose-800">{activeTimeframeStats.totalAbsent}</td>
                        <td className="p-2 border-r border-slate-300 bg-emerald-100 text-emerald-950 font-black">{activeTimeframeStats.attRate}%</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-indigo-800">{activeTimeframeStats.eating}</td>
                        <td className="p-2 bg-indigo-100 text-indigo-950 font-black">{activeTimeframeStats.bRate}%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {!hasClassPage2 && (
              <div className="grid grid-cols-2 pt-6 text-center text-xs border-t border-slate-200">
                <div>
                  <div className="font-black uppercase text-slate-800">NGƯỜI LẬP BIỂU</div>
                  <div className="text-[12px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
                  <div className="h-12" />
                  <div className="font-black text-slate-900">{officialReporterName}</div>
                </div>
                <div>
                  <div className="font-black uppercase text-slate-800">BAN GIÁM HIỆU DUYỆT</div>
                  <div className="text-[12px] text-slate-500 italic">(Ký tên và đóng dấu)</div>
                  <div className="h-12" />
                  <div className="font-black text-slate-900">Ban Giám Hiệu</div>
                </div>
              </div>
            )}
          </div>

          {/* TRANG LỚP PHẦN 2 (Lớp 23 đến 44) */}
          {hasClassPage2 && (
            <div 
              ref={classPage2Ref}
              id="report-page-class-2"
              className="mx-auto bg-white p-4 sm:p-6 md:p-8 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 max-w-7xl mt-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-3 gap-2">
                <div>
                  <div className="font-bold uppercase text-[12px] text-slate-600">
                    {officialSchoolName} • BÁO CÁO THỐNG KÊ CHI TIẾT CÁC LỚP HỌC (TRANG 3 - PHẦN 2)
                  </div>
                  <div className="font-black text-sm text-slate-900 uppercase">
                    BẢNG TỔNG HỢP SĨ SỐ, NAM/NỮ, CHUYÊN CẦN & BÁN TRÚ {classes.length} LỚP GIÁO VIÊN CHỦ NHIỆM (PHẦN 2)
                  </div>
                  <div className="text-[12px] text-slate-500">
                    Danh sách từ lớp {CLASSES_PER_A4_PAGE + 1} đến {CLASSES_PER_A4_PAGE + classPage2Rows.length} (Tổng cộng: {classes.length} lớp GVCN)
                  </div>
                </div>
                <div className="text-right text-[12px] text-slate-500 font-semibold">
                  Kỳ báo cáo: {timeframe === 'day' ? `Ngày ${selectedDate}` : timeframe === 'week' ? `Tuần (${currentWeekRange.start} - ${currentWeekRange.end})` : timeframe === 'month' ? currentMonthRange.monthLabel : currentSemesterRange.label}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-black uppercase text-slate-800 tracking-wide flex items-center gap-1.5">
                    <span>III. BẢNG TỔNG HỢP SĨ SỐ, NAM/NỮ & GIÁO VIÊN CHỦ NHIỆM (PHẦN 2)</span>
                  </h3>
                  <span className="text-[12px] text-slate-500 font-bold uppercase">
                    {classPage2Rows.length} Lớp (Phần 2)
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                  <table className="w-full text-[12px] text-center border-collapse">
                    <thead className="bg-slate-100 font-black text-slate-800 border-b border-slate-300">
                      <tr>
                        <th className="p-2 border-r border-slate-300 w-10">STT</th>
                        <th className="p-2 border-r border-slate-300">Khối</th>
                        <th className="p-2 border-r border-slate-300 text-left">Lớp học</th>
                        <th className="p-2 border-r border-slate-300 text-left">Giáo viên chủ nhiệm</th>
                        <th className="p-2 border-r border-slate-300">Sĩ số</th>
                        <th className="p-2 border-r border-slate-300 text-blue-700">Nam</th>
                        <th className="p-2 border-r border-slate-300 text-pink-700">Nữ</th>
                        <th className="p-2 border-r border-slate-300 text-emerald-700">Có mặt</th>
                        <th className="p-2 border-r border-slate-300 text-rose-700">Vắng</th>
                        <th className="p-2 border-r border-slate-300 bg-emerald-50 text-emerald-900">% Chuyên cần</th>
                        <th className="p-2 border-r border-slate-300 text-indigo-700">Suất ăn</th>
                        <th className="p-2 bg-indigo-50 text-indigo-900">% Bán trú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-semibold">
                      {classPage2Rows.map(c => (
                        <tr key={c.classId} className="hover:bg-slate-50">
                          <td className="p-1.5 border-r border-slate-300 font-mono">{c.stt}</td>
                          <td className="p-1.5 border-r border-slate-300 text-slate-600">{c.grade}</td>
                          <td className="p-1.5 border-r border-slate-300 text-left font-black text-slate-900">{c.className}</td>
                          <td className="p-1.5 border-r border-slate-300 text-left text-slate-700 font-bold">{c.teacherName}</td>
                          <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-slate-900">{c.totalStudents}</td>
                          <td className="p-1.5 border-r border-slate-300 text-blue-700 font-mono">{c.boys}</td>
                          <td className="p-1.5 border-r border-slate-300 text-pink-600 font-mono">{c.girls}</td>
                          <td className="p-1.5 border-r border-slate-300 text-emerald-700 font-mono">{c.present}</td>
                          <td className="p-1.5 border-r border-slate-300 text-rose-700 font-mono">{c.totalAbsent}</td>
                          <td className="p-1.5 border-r border-slate-300 bg-emerald-50/60 font-black text-emerald-800">{c.attRate}%</td>
                          <td className="p-1.5 border-r border-slate-300 text-indigo-700 font-mono font-bold">{c.eating}</td>
                          <td className="p-1.5 bg-indigo-50/60 font-black text-indigo-800">{c.bRate}%</td>
                        </tr>
                      ))}
                      {!hasClassPage3 && (
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                          <td colSpan={4} className="p-2 border-r border-slate-300 text-center uppercase">
                            TỔNG CỘNG TOÀN TRƯỜNG ({classes.length} LỚP)
                          </td>
                          <td className="p-2 border-r border-slate-300 font-mono">{totalStudents}</td>
                          <td className="p-2 border-r border-slate-300 font-mono text-blue-800">{totalBoys}</td>
                          <td className="p-2 border-r border-slate-300 font-mono text-pink-700">{totalGirls}</td>
                          <td className="p-2 border-r border-slate-300 font-mono text-emerald-800">{activeTimeframeStats.present}</td>
                          <td className="p-2 border-r border-slate-300 font-mono text-rose-800">{activeTimeframeStats.totalAbsent}</td>
                          <td className="p-2 border-r border-slate-300 bg-emerald-100 text-emerald-950 font-black">{activeTimeframeStats.attRate}%</td>
                          <td className="p-2 border-r border-slate-300 font-mono text-indigo-800">{activeTimeframeStats.eating}</td>
                          <td className="p-2 bg-indigo-100 text-indigo-950 font-black">{activeTimeframeStats.bRate}%</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {!hasClassPage3 && (
                <div className="grid grid-cols-2 pt-6 text-center text-xs border-t border-slate-200">
                  <div>
                    <div className="font-black uppercase text-slate-800">NGƯỜI LẬP BIỂU</div>
                    <div className="text-[12px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
                    <div className="h-12" />
                    <div className="font-black text-slate-900">{officialReporterName}</div>
                  </div>
                  <div>
                    <div className="font-black uppercase text-slate-800">BAN GIÁM HIỆU DUYỆT</div>
                    <div className="text-[12px] text-slate-500 italic">(Ký tên và đóng dấu)</div>
                    <div className="h-12" />
                    <div className="font-black text-slate-900">Ban Giám Hiệu</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TRANG LỚP PHẦN 3 (Lớp 45 đến 66 + Tổng cộng toàn trường + Chữ ký duyệt) */}
          {hasClassPage3 && (
            <div 
              ref={classPage3Ref}
              id="report-page-class-3"
              className="mx-auto bg-white p-4 sm:p-6 md:p-8 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 max-w-7xl mt-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-3 gap-2">
                <div>
                  <div className="font-bold uppercase text-[12px] text-slate-600">
                    {officialSchoolName} • BÁO CÁO THỐNG KÊ CHI TIẾT CÁC LỚP HỌC (TRANG 4 - PHẦN 3)
                  </div>
                  <div className="font-black text-sm text-slate-900 uppercase">
                    BẢNG TỔNG HỢP SĨ SỐ, NAM/NỮ, CHUYÊN CẦN & BÁN TRÚ {classes.length} LỚP GIÁO VIÊN CHỦ NHIỆM (PHẦN 3 & TỔNG CỘNG)
                  </div>
                  <div className="text-[12px] text-slate-500">
                    Danh sách từ lớp {CLASSES_PER_A4_PAGE * 2 + 1} đến {CLASSES_PER_A4_PAGE * 2 + classPage3Rows.length} (Tổng cộng: {classes.length} lớp GVCN)
                  </div>
                </div>
                <div className="text-right text-[12px] text-slate-500 font-semibold">
                  Kỳ báo cáo: {timeframe === 'day' ? `Ngày ${selectedDate}` : timeframe === 'week' ? `Tuần (${currentWeekRange.start} - ${currentWeekRange.end})` : timeframe === 'month' ? currentMonthRange.monthLabel : currentSemesterRange.label}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-black uppercase text-slate-800 tracking-wide flex items-center gap-1.5">
                    <span>III. BẢNG TỔNG HỢP SĨ SỐ, NAM/NỮ & GIÁO VIÊN CHỦ NHIỆM (PHẦN 3 & TỔNG CỘNG)</span>
                  </h3>
                  <span className="text-[12px] text-slate-500 font-bold uppercase">
                    {classPage3Rows.length} Lớp (Phần 3)
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                  <table className="w-full text-[12px] text-center border-collapse">
                    <thead className="bg-slate-100 font-black text-slate-800 border-b border-slate-300">
                      <tr>
                        <th className="p-2 border-r border-slate-300 w-10">STT</th>
                        <th className="p-2 border-r border-slate-300">Khối</th>
                        <th className="p-2 border-r border-slate-300 text-left">Lớp học</th>
                        <th className="p-2 border-r border-slate-300 text-left">Giáo viên chủ nhiệm</th>
                        <th className="p-2 border-r border-slate-300">Sĩ số</th>
                        <th className="p-2 border-r border-slate-300 text-blue-700">Nam</th>
                        <th className="p-2 border-r border-slate-300 text-pink-700">Nữ</th>
                        <th className="p-2 border-r border-slate-300 text-emerald-700">Có mặt</th>
                        <th className="p-2 border-r border-slate-300 text-rose-700">Vắng</th>
                        <th className="p-2 border-r border-slate-300 bg-emerald-50 text-emerald-900">% Chuyên cần</th>
                        <th className="p-2 border-r border-slate-300 text-indigo-700">Suất ăn</th>
                        <th className="p-2 bg-indigo-50 text-indigo-900">% Bán trú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-semibold">
                      {classPage3Rows.map(c => (
                        <tr key={c.classId} className="hover:bg-slate-50">
                          <td className="p-1.5 border-r border-slate-300 font-mono">{c.stt}</td>
                          <td className="p-1.5 border-r border-slate-300 text-slate-600">{c.grade}</td>
                          <td className="p-1.5 border-r border-slate-300 text-left font-black text-slate-900">{c.className}</td>
                          <td className="p-1.5 border-r border-slate-300 text-left text-slate-700 font-bold">{c.teacherName}</td>
                          <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-slate-900">{c.totalStudents}</td>
                          <td className="p-1.5 border-r border-slate-300 text-blue-700 font-mono">{c.boys}</td>
                          <td className="p-1.5 border-r border-slate-300 text-pink-600 font-mono">{c.girls}</td>
                          <td className="p-1.5 border-r border-slate-300 text-emerald-700 font-mono">{c.present}</td>
                          <td className="p-1.5 border-r border-slate-300 text-rose-700 font-mono">{c.totalAbsent}</td>
                          <td className="p-1.5 border-r border-slate-300 bg-emerald-50/60 font-black text-emerald-800">{c.attRate}%</td>
                          <td className="p-1.5 border-r border-slate-300 text-indigo-700 font-mono font-bold">{c.eating}</td>
                          <td className="p-1.5 bg-indigo-50/60 font-black text-indigo-800">{c.bRate}%</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                        <td colSpan={4} className="p-2 border-r border-slate-300 text-center uppercase">
                          TỔNG CỘNG TOÀN TRƯỜNG ({classes.length} LỚP)
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono">{totalStudents}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-blue-800">{totalBoys}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-pink-700">{totalGirls}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-emerald-800">{activeTimeframeStats.present}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-rose-800">{activeTimeframeStats.totalAbsent}</td>
                        <td className="p-2 border-r border-slate-300 bg-emerald-100 text-emerald-950 font-black">{activeTimeframeStats.attRate}%</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-indigo-800">{activeTimeframeStats.eating}</td>
                        <td className="p-2 bg-indigo-100 text-indigo-950 font-black">{activeTimeframeStats.bRate}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 pt-6 text-center text-xs border-t border-slate-200">
                <div>
                  <div className="font-black uppercase text-slate-800">NGƯỜI LẬP BIỂU</div>
                  <div className="text-[12px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
                  <div className="h-12" />
                  <div className="font-black text-slate-900">{officialReporterName}</div>
                </div>
                <div>
                  <div className="font-black uppercase text-slate-800">BAN GIÁM HIỆU DUYỆT</div>
                  <div className="text-[12px] text-slate-500 italic">(Ký tên và đóng dấu)</div>
                  <div className="h-12" />
                  <div className="font-black text-slate-900">Ban Giám Hiệu</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 7. BỘ LỌC TÌM KIẾM TIẾN BỘ HỌC SINH (Tra cứu trên web) */}
      <div className="mx-auto bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm max-w-7xl mt-6 no-print no-export">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wide flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>IV. BẢNG THEO DÕI & SO SÁNH TIẾN BỘ HỌC SINH ({timeframe === 'semester' ? 'THEO HỌC KÌ' : timeframe === 'month' ? 'THEO THÁNG' : 'THEO TUẦN'})</span>
            </h3>
            <p className="text-[12px] text-slate-500 font-medium">
              So sánh mức tăng trưởng điểm xu thi đua, tỷ lệ chuyên cần và danh hiệu tiến bộ giữa kỳ này so với kỳ trước ({studentProgressData.length} học sinh)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm học sinh..."
                value={progressSearch}
                onChange={(e) => setProgressSearch(e.target.value)}
                className="pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            <select
              value={progressBadgeFilter}
              onChange={(e) => setProgressBadgeFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-slate-700 cursor-pointer"
            >
              <option value="all">Tất cả xếp loại</option>
              <option value="vuot_bac">🚀 Vượt bậc</option>
              <option value="tien_bo">⭐ Tiến bộ</option>
              <option value="co_gang">✨ Cố gắng</option>
              <option value="can_ren_luyen">📉 Cần rèn luyện</option>
            </select>

            <select
              value={progressSortBy}
              onChange={(e) => setProgressSortBy(e.target.value as any)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-slate-700 cursor-pointer"
            >
              <option value="delta">Sắp xếp: Tăng trưởng xu</option>
              <option value="coins">Sắp xếp: Tổng xu hiện có</option>
              <option value="attendance">Sắp xếp: Chuyên cần cao</option>
            </select>
          </div>
        </div>
      </div>

      {/* 8. BẢNG THEO DÕI & SO SÁNH TIẾN BỘ HỌC SINH - PHẦN 1 (A4 KHỔ NGANG) */}
      <div 
        ref={studentPage1Ref}
        id="report-page-student-1"
        className="mx-auto bg-white p-4 sm:p-6 md:p-8 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 max-w-7xl mt-6"
      >
        {/* Header Trang Tiến bộ 1 */}
        <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-3 gap-2">
          <div>
            <div className="font-bold uppercase text-[12px] text-slate-600">
              {officialSchoolName} • BÁO CÁO THEO DÕI & SO SÁNH TIẾN BỘ HỌC SINH (TRANG {selectedClassId === 'all' ? (classPagesCount + 2) : 2})
            </div>
            <div className="font-black text-sm text-slate-900 uppercase">
              IV. BẢNG THEO DÕI & SO SÁNH TIẾN BỘ HỌC SINH ({timeframe === 'semester' ? 'THEO HỌC KÌ' : timeframe === 'month' ? 'THEO THÁNG' : 'THEO TUẦN'}) - PHẦN 1
            </div>
            <div className="text-[12px] text-slate-500">
              Danh sách từ STT 1 đến {progressPage1Students.length} (Tổng cộng: {studentProgressData.length} học sinh)
            </div>
          </div>
          <div className="text-right text-[12px] text-slate-500 font-semibold">
            Kỳ báo cáo: {timeframe === 'day' ? `Ngày ${selectedDate}` : timeframe === 'week' ? `Tuần (${currentWeekRange.start} - ${currentWeekRange.end})` : timeframe === 'month' ? currentMonthRange.monthLabel : currentSemesterRange.label}
          </div>
        </div>

        {/* Bảng 11 cột Phần 1 */}
        <div className="overflow-x-auto border border-slate-300 rounded-2xl">
          <table className="w-full text-[12px] text-center border-collapse">
            <thead className="bg-slate-100 font-black text-slate-800 border-b border-slate-300">
              <tr>
                <th className="p-2 border-r border-slate-300 w-10">STT</th>
                <th className="p-2 border-r border-slate-300 text-left">Học sinh</th>
                <th className="p-2 border-r border-slate-300">Phái</th>
                <th className="p-2 border-r border-slate-300 text-left">Lớp</th>
                <th className="p-2 border-r border-slate-300">Tổ</th>
                <th className="p-2 border-r border-slate-300">Xu hiện có</th>
                <th className="p-2 border-r border-slate-300 text-indigo-700">Xu kỳ này</th>
                <th className="p-2 border-r border-slate-300 text-slate-500">Xu kỳ trước</th>
                <th className="p-2 border-r border-slate-300 text-emerald-700">Tăng trưởng</th>
                <th className="p-2 border-r border-slate-300 bg-emerald-50 text-emerald-900">% Chuyên cần</th>
                <th className="p-2 bg-indigo-50 text-indigo-900">Xếp loại tiến bộ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-semibold">
              {progressPage1Students.map((s, idx) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="p-1.5 border-r border-slate-300 font-mono">{idx + 1}</td>
                  <td className="p-1.5 border-r border-slate-300 text-left font-black text-slate-900">{s.name}</td>
                  <td className="p-1.5 border-r border-slate-300 text-slate-600">{s.gender}</td>
                  <td className="p-1.5 border-r border-slate-300 text-left text-slate-700 font-bold">{s.className}</td>
                  <td className="p-1.5 border-r border-slate-300">{s.group}</td>
                  <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-amber-700">{s.totalPoints} xu</td>
                  <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-indigo-700">+{s.curPointsGained}</td>
                  <td className="p-1.5 border-r border-slate-300 font-mono text-slate-500">+{s.prevPointsGained}</td>
                  <td className="p-1.5 border-r border-slate-300 font-mono font-black">
                    {s.deltaPoints > 0 ? (
                      <span className="text-emerald-700 flex items-center justify-center gap-0.5">
                        <ArrowUpRight className="w-3.5 h-3.5" /> +{s.deltaPoints}
                      </span>
                    ) : s.deltaPoints < 0 ? (
                      <span className="text-rose-600 flex items-center justify-center gap-0.5">
                        <ArrowDownRight className="w-3.5 h-3.5" /> {s.deltaPoints}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-emerald-800 bg-emerald-50/60">{s.attRate}%</td>
                  <td className="p-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[12px] border ${s.progressColor}`}>
                      {s.progressBadge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Chữ ký Trang Tiến bộ 1 */}
        <div className="grid grid-cols-2 pt-6 text-center text-xs border-t border-slate-200">
          <div>
            <div className="font-black uppercase text-slate-800">NGƯỜI LẬP BIỂU</div>
            <div className="text-[12px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
            <div className="h-12" />
            <div className="font-black text-slate-900">{officialReporterName}</div>
          </div>
          <div>
            <div className="font-black uppercase text-slate-800">BAN GIÁM HIỆU DUYỆT</div>
            <div className="text-[12px] text-slate-500 italic">(Ký tên và đóng dấu)</div>
            <div className="h-12" />
            <div className="font-black text-slate-900">Ban Giám Hiệu</div>
          </div>
        </div>
      </div>

      {/* 9. BẢNG THEO DÕI & SO SÁNH TIẾN BỘ HỌC SINH - PHẦN 2 (NẾU CÓ > 35 HỌC SINH) (A4 KHỔ NGANG) */}
      {hasProgressPage2 && (
        <div 
          ref={studentPage2Ref}
          id="report-page-student-2"
          className="mx-auto bg-white p-4 sm:p-6 md:p-8 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 max-w-7xl mt-6"
        >
          {/* Header Trang Tiến bộ 2 */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-3 gap-2">
            <div>
              <div className="font-bold uppercase text-[12px] text-slate-600">
                {officialSchoolName} • BÁO CÁO THEO DÕI & SO SÁNH TIẾN BỘ HỌC SINH (TRANG {selectedClassId === 'all' ? (classPagesCount + 3) : 3})
              </div>
              <div className="font-black text-sm text-slate-900 uppercase">
                IV. BẢNG THEO DÕI & SO SÁNH TIẾN BỘ HỌC SINH ({timeframe === 'semester' ? 'THEO HỌC KÌ' : timeframe === 'month' ? 'THEO THÁNG' : 'THEO TUẦN'}) - PHẦN 2 (TIẾP THEO)
              </div>
              <div className="text-[12px] text-slate-500">
                Danh sách từ STT {STUDENTS_PER_A4_PAGE + 1} đến {STUDENTS_PER_A4_PAGE + progressPage2Students.length} (Tổng cộng: {studentProgressData.length} học sinh)
              </div>
            </div>
            <div className="text-right text-[12px] text-slate-500 font-semibold">
              Kỳ báo cáo: {timeframe === 'day' ? `Ngày ${selectedDate}` : timeframe === 'week' ? `Tuần (${currentWeekRange.start} - ${currentWeekRange.end})` : timeframe === 'month' ? currentMonthRange.monthLabel : currentSemesterRange.label}
            </div>
          </div>

          {/* Bảng 11 cột Phần 2 */}
          <div className="overflow-x-auto border border-slate-300 rounded-2xl">
            <table className="w-full text-[12px] text-center border-collapse">
              <thead className="bg-slate-100 font-black text-slate-800 border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300 w-10">STT</th>
                  <th className="p-2 border-r border-slate-300 text-left">Học sinh</th>
                  <th className="p-2 border-r border-slate-300">Phái</th>
                  <th className="p-2 border-r border-slate-300 text-left">Lớp</th>
                  <th className="p-2 border-r border-slate-300">Tổ</th>
                  <th className="p-2 border-r border-slate-300">Xu hiện có</th>
                  <th className="p-2 border-r border-slate-300 text-indigo-700">Xu kỳ này</th>
                  <th className="p-2 border-r border-slate-300 text-slate-500">Xu kỳ trước</th>
                  <th className="p-2 border-r border-slate-300 text-emerald-700">Tăng trưởng</th>
                  <th className="p-2 border-r border-slate-300 bg-emerald-50 text-emerald-900">% Chuyên cần</th>
                  <th className="p-2 bg-indigo-50 text-indigo-900">Xếp loại tiến bộ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-semibold">
                {progressPage2Students.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-1.5 border-r border-slate-300 font-mono">{STUDENTS_PER_A4_PAGE + idx + 1}</td>
                    <td className="p-1.5 border-r border-slate-300 text-left font-black text-slate-900">{s.name}</td>
                    <td className="p-1.5 border-r border-slate-300 text-slate-600">{s.gender}</td>
                    <td className="p-1.5 border-r border-slate-300 text-left text-slate-700 font-bold">{s.className}</td>
                    <td className="p-1.5 border-r border-slate-300">{s.group}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-amber-700">{s.totalPoints} xu</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-indigo-700">+{s.curPointsGained}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono text-slate-500">+{s.prevPointsGained}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono font-black">
                      {s.deltaPoints > 0 ? (
                        <span className="text-emerald-700 flex items-center justify-center gap-0.5">
                          <ArrowUpRight className="w-3.5 h-3.5" /> +{s.deltaPoints}
                        </span>
                      ) : s.deltaPoints < 0 ? (
                        <span className="text-rose-600 flex items-center justify-center gap-0.5">
                          <ArrowDownRight className="w-3.5 h-3.5" /> {s.deltaPoints}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-emerald-800 bg-emerald-50/60">{s.attRate}%</td>
                    <td className="p-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[12px] border ${s.progressColor}`}>
                        {s.progressBadge}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Chữ ký Trang 4 */}
          <div className="grid grid-cols-2 pt-6 text-center text-xs border-t border-slate-200">
            <div>
              <div className="font-black uppercase text-slate-800">NGƯỜI LẬP BIỂU</div>
              <div className="text-[12px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
              <div className="h-12" />
              <div className="font-black text-slate-900">{officialReporterName}</div>
            </div>
            <div>
              <div className="font-black uppercase text-slate-800">BAN GIÁM HIỆU DUYỆT</div>
              <div className="text-[12px] text-slate-500 italic">(Ký tên và đóng dấu)</div>
              <div className="h-12" />
              <div className="font-black text-slate-900">Ban Giám Hiệu</div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHÍNH SÁCH BẢO VỆ DỮ LIỆU KHI CHUYỂN SANG THÁNG MỚI */}
      {showSafeTransitionModal && (
        <div className="fixed inset-0 z-50 bg-sky-900/20 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">
                  BẢO TOÀN DỮ LIỆU KHI SANG THÁNG MỚI
                </h3>
                <p className="text-xs text-slate-500">Chính sách bảo vệ 100% dữ liệu lớp học, học sinh & xu thi đua</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Làm mới chu kỳ thống kê:</strong> Khi bước sang tháng mới, hệ thống tự động lọc số liệu chuyên cần và bán trú cho chu kỳ tháng mới, bắt đầu từ ngày mùng 1 của tháng.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Bảo toàn tuyệt đối lớp học:</strong> Danh sách toàn bộ các lớp học và phân công GVCN giữ nguyên 100%.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Bảo toàn học sinh & xu:</strong> Danh sách học sinh, phân tổ, điểm xu thi đua tích lũy không bao giờ bị xóa.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Tra cứu tháng cũ dễ dàng:</strong> Giáo viên có thể xem lại dữ liệu thống kê của bất kỳ tháng nào trong năm học bằng thanh công cụ thời gian.</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSafeTransitionModal(false)}
                className="px-5 py-2.5 bg-white hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black cursor-pointer uppercase shadow-xs"
              >
                Đã hiểu & Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
