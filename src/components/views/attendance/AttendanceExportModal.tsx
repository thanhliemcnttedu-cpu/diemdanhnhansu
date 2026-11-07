import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, Download, FileSpreadsheet, FileText, Printer, 
  Check, Building2, Users, Calendar, AlertCircle, ShieldAlert,
  Image as ImageIcon, Sparkles, ChevronDown
} from 'lucide-react';
import { Classroom, Student, DailyAttendance, DailyBoardingMeal, TeacherProfile } from '../../../types';
import { exportElementToPdf, exportElementToImagePng } from '../../../utils/printHelper';
import { buildFormattedSheet, ExcelColumnDef } from '../../../utils/excelHelper';

interface AttendanceExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  activeClass: Classroom | undefined;
  classes: Classroom[];
  students: Student[];
  currentClassStudents: Student[];
  attendanceRecords: DailyAttendance[];
  boardingRecords: DailyBoardingMeal[];
  teacherProfile: TeacherProfile;
}

export const AttendanceExportModal: React.FC<AttendanceExportModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  activeClass,
  classes,
  students,
  currentClassStudents,
  attendanceRecords,
  boardingRecords,
  teacherProfile,
}) => {
  const [exportScope, setExportScope] = useState<'single' | 'multi'>('single');
  const [pdfOrientation, setPdfOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [showAllStudentsPreview, setShowAllStudentsPreview] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const printSingleRef = useRef<HTMLDivElement>(null);
  const printMultiRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Format date display
  const formatDateVN = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      return `ngày ${d} tháng ${m} năm ${y}`;
    } catch {
      return dateStr;
    }
  };

  const shortDateVN = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  // Helper: calculate period statistics for any given class
  const getPeriodStatsForClass = (classId: string, classStudentsList: Student[]) => {
    const totalStudents = classStudentsList.length;
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

    const calcRange = (fromStr: string, toStr: string) => {
      const aRecs = attendanceRecords.filter(r => r.classId === classId && r.date >= fromStr && r.date <= toStr);
      const bRecs = boardingRecords.filter(r => r.classId === classId && r.date >= fromStr && r.date <= toStr);
      
      let sessions = aRecs.length;
      let present = 0;
      let excused = 0;
      let unexcused = 0;
      let sick = 0;

      aRecs.forEach(r => {
        Object.values(r.records).forEach(status => {
          if (status === 'present') present++;
          else if (status === 'excused') excused++;
          else if (status === 'unexcused') unexcused++;
          else if (status === 'sick') sick++;
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

      const totalSlots = sessions * totalStudents;
      const attRate = totalSlots > 0 ? Math.round((present / totalSlots) * 100) : 100;
      const bRate = totalSlots > 0 ? Math.round((boardingEating / totalSlots) * 100) : 0;

      return {
        sessions,
        present,
        excused,
        unexcused,
        sick,
        boardingEating,
        attRate,
        bRate
      };
    };

    // Today record
    const todayARec = attendanceRecords.find(r => r.classId === classId && r.date === selectedDate);
    const todayBRec = boardingRecords.find(r => r.classId === classId && r.date === selectedDate);
    const todayAttMap = todayARec?.records || {};
    const todayBMap = todayBRec?.records || {};

    let todayPresent = 0;
    let todayExcused = 0;
    let todayUnexcused = 0;
    let todaySick = 0;
    let todayEating = 0;

    classStudentsList.forEach(st => {
      const stAtt = todayAttMap[st.id] || 'present';
      if (stAtt === 'present') todayPresent++;
      else if (stAtt === 'excused') todayExcused++;
      else if (stAtt === 'unexcused') todayUnexcused++;
      else if (stAtt === 'sick') todaySick++;

      const isAbsent = stAtt === 'sick' || stAtt === 'excused' || stAtt === 'unexcused' || stAtt === 'other';
      if (!isAbsent && (todayBMap[st.id] || 'eating') === 'eating') {
        todayEating++;
      }
    });

    const todayAttRate = totalStudents > 0 ? Math.round((todayPresent / totalStudents) * 100) : 100;
    const todayBRate = totalStudents > 0 ? Math.round((todayEating / totalStudents) * 100) : 0;

    return {
      today: {
        present: todayPresent,
        excused: todayExcused,
        unexcused: todayUnexcused,
        sick: todaySick,
        totalAbsent: todayExcused + todayUnexcused + todaySick,
        attRate: todayAttRate,
        boardingEating: todayEating,
        bRate: todayBRate
      },
      thisWeek: calcRange(fmt(thisWeekMon), fmt(thisWeekSun)),
      lastWeek: calcRange(fmt(lastWeekMon), fmt(lastWeekSun)),
      thisMonth: calcRange(fmt(startOfMonth), fmt(endOfMonth))
    };
  };

  const singleClassStats = getPeriodStatsForClass(activeClass?.id || '', currentClassStudents);

  // Multi-class stats across all classes in the school
  const multiClassData = classes.map((cls, idx) => {
    const clsStudents = students.filter(s => s.classId === cls.id);
    const stats = getPeriodStatsForClass(cls.id, clsStudents);
    return {
      stt: idx + 1,
      classId: cls.id,
      className: cls.name,
      grade: cls.grade || 'Khối 4',
      teacherName: cls.teacherName || teacherProfile.name,
      totalStudents: clsStudents.length,
      stats
    };
  });

  const totalSchoolStudents = multiClassData.reduce((acc, c) => acc + c.totalStudents, 0);
  const totalSchoolPresentToday = multiClassData.reduce((acc, c) => acc + c.stats.today.present, 0);
  const totalSchoolAbsentToday = multiClassData.reduce((acc, c) => acc + c.stats.today.totalAbsent, 0);
  const totalSchoolEatingToday = multiClassData.reduce((acc, c) => acc + c.stats.today.boardingEating, 0);
  const schoolAttRateToday = totalSchoolStudents > 0 ? Math.round((totalSchoolPresentToday / totalSchoolStudents) * 100) : 100;
  const schoolBRateToday = totalSchoolStudents > 0 ? Math.round((totalSchoolEatingToday / totalSchoolStudents) * 100) : 0;

  // 1. Export Excel: Single Class with scientific formatting
  const handleExportSingleClassExcel = () => {
    const totalRecords = attendanceRecords.filter(r => r.classId === activeClass?.id);

    const studentCols: ExcelColumnDef[] = [
      { header: 'STT', key: 'stt', width: 6, isNumber: true },
      { header: 'Họ và tên học sinh', key: 'name', width: 24 },
      { header: 'Giới tính', key: 'gender', width: 10 },
      { header: 'Tổ', key: 'group', width: 12 },
      { header: 'Điểm danh hôm nay', key: 'todayStatus', width: 18 },
      { header: 'Bán trú hôm nay', key: 'todayBStatus', width: 20 },
      { header: 'Tổng buổi đã học', key: 'totalLogged', width: 16, isNumber: true },
      { header: 'Số buổi có mặt', key: 'presentDays', width: 15, isNumber: true },
      { header: 'Nghỉ ốm', key: 'sickDays', width: 12, isNumber: true },
      { header: 'Vắng có phép', key: 'excusedDays', width: 14, isNumber: true },
      { header: 'Vắng không phép', key: 'unexcusedDays', width: 15, isNumber: true },
      { header: 'Tỷ lệ chuyên cần (%)', key: 'rate', width: 18 },
      { header: 'Xếp loại', key: 'rating', width: 16 }
    ];

    const studentRows = currentClassStudents.map((st, idx) => {
      let presentDays = 0;
      let lateDays = 0;
      let sickDays = 0;
      let excusedDays = 0;
      let unexcusedDays = 0;

      totalRecords.forEach(rec => {
        const s = rec.records[st.id] || 'present';
        if (s === 'present') presentDays++;
        else if (s === 'late') lateDays++;
        else if (s === 'sick') sickDays++;
        else if (s === 'excused') excusedDays++;
        else if (s === 'unexcused') unexcusedDays++;
      });

      const todayAttRecord = attendanceRecords.find(r => r.classId === activeClass?.id && r.date === selectedDate);
      const todayStatus = todayAttRecord?.records[st.id] || 'present';
      const todayStatusLabel = todayStatus === 'present' ? 'Có mặt'
        : todayStatus === 'sick' ? 'Nghỉ ốm'
        : todayStatus === 'excused' ? 'Vắng có phép'
        : todayStatus === 'unexcused' ? 'Vắng không phép'
        : 'Khác';

      const todayBRecord = boardingRecords.find(r => r.classId === activeClass?.id && r.date === selectedDate);
      const isAbsent = todayStatus === 'sick' || todayStatus === 'excused' || todayStatus === 'unexcused' || todayStatus === 'other';
      const todayBStatus = isAbsent ? 'Không ăn (Vắng)' : (todayBRecord?.records[st.id] || 'eating') === 'eating' ? 'Ăn bán trú' : 'Không ăn';

      const totalLogged = totalRecords.length;
      const rate = totalLogged > 0 ? Math.round((presentDays / totalLogged) * 100) : 100;

      return {
        stt: idx + 1,
        name: st.name,
        gender: st.gender,
        group: st.group || 'Tổ 1',
        todayStatus: todayStatusLabel,
        todayBStatus: todayBStatus,
        totalLogged: totalLogged,
        presentDays: presentDays,
        sickDays: sickDays,
        excusedDays: excusedDays,
        unexcusedDays: unexcusedDays,
        rate: `${rate}%`,
        rating: rate >= 95 ? 'Tốt' : rate >= 85 ? 'Khá' : 'Cần rèn luyện'
      };
    });

    const wb = XLSX.utils.book_new();

    const wsStudents = buildFormattedSheet(
      {
        schoolName: teacherProfile.schoolName || 'TRƯỜNG HỌC',
        className: activeClass?.name || 'Lớp',
        teacherName: teacherProfile.name,
        reportTitle: `BÁO CÁO THEO DÕI CHUYÊN CẦN & BÁN TRÚ LỚP ${activeClass?.name || ''}`,
        reportDate: shortDateVN(selectedDate),
        formulaNote: 'Công thức tính: Tỷ lệ (%) = (Số học sinh có mặt / Tổng số học sinh) × 100%'
      },
      studentCols,
      studentRows
    );
    XLSX.utils.book_append_sheet(wb, wsStudents, `HocSinh_${activeClass?.name || 'Lop'}`);

    // Sheet 2: Tổng hợp 4 kỳ
    const periodCols: ExcelColumnDef[] = [
      { header: 'Kỳ thống kê', key: 'period', width: 20 },
      { header: 'Sĩ số học sinh', key: 'total', width: 15, isNumber: true },
      { header: 'Số buổi ghi nhận', key: 'sessions', width: 16, isNumber: true },
      { header: 'Số lượt có mặt', key: 'present', width: 15, isNumber: true },
      { header: 'Vắng có phép', key: 'excused', width: 14, isNumber: true },
      { header: 'Vắng không phép', key: 'unexcused', width: 15, isNumber: true },
      { header: 'Nghỉ ốm', key: 'sick', width: 12, isNumber: true },
      { header: 'Tỷ lệ chuyên cần (%)', key: 'attRate', width: 18 },
      { header: 'Suất ăn bán trú', key: 'eating', width: 16, isNumber: true },
      { header: 'Tỷ lệ bán trú (%)', key: 'bRate', width: 16 }
    ];

    const periodRows = [
      {
        period: `Hôm nay (${shortDateVN(selectedDate)})`,
        total: currentClassStudents.length,
        sessions: 1,
        present: singleClassStats.today.present,
        excused: singleClassStats.today.excused,
        unexcused: singleClassStats.today.unexcused,
        sick: singleClassStats.today.sick,
        attRate: `${singleClassStats.today.attRate}%`,
        eating: singleClassStats.today.boardingEating,
        bRate: `${singleClassStats.today.bRate}%`
      },
      {
        period: 'Tuần này',
        total: currentClassStudents.length,
        sessions: singleClassStats.thisWeek.sessions,
        present: singleClassStats.thisWeek.present,
        excused: singleClassStats.thisWeek.excused,
        unexcused: singleClassStats.thisWeek.unexcused,
        sick: singleClassStats.thisWeek.sick,
        attRate: `${singleClassStats.thisWeek.attRate}%`,
        eating: singleClassStats.thisWeek.boardingEating,
        bRate: `${singleClassStats.thisWeek.bRate}%`
      },
      {
        period: 'Tuần trước',
        total: currentClassStudents.length,
        sessions: singleClassStats.lastWeek.sessions,
        present: singleClassStats.lastWeek.present,
        excused: singleClassStats.lastWeek.excused,
        unexcused: singleClassStats.lastWeek.unexcused,
        sick: singleClassStats.lastWeek.sick,
        attRate: `${singleClassStats.lastWeek.attRate}%`,
        eating: singleClassStats.lastWeek.boardingEating,
        bRate: `${singleClassStats.lastWeek.bRate}%`
      },
      {
        period: 'Cả tháng',
        total: currentClassStudents.length,
        sessions: singleClassStats.thisMonth.sessions,
        present: singleClassStats.thisMonth.present,
        excused: singleClassStats.thisMonth.excused,
        unexcused: singleClassStats.thisMonth.unexcused,
        sick: singleClassStats.thisMonth.sick,
        attRate: `${singleClassStats.thisMonth.attRate}%`,
        eating: singleClassStats.thisMonth.boardingEating,
        bRate: `${singleClassStats.thisMonth.bRate}%`
      }
    ];

    const wsMeta = buildFormattedSheet(
      {
        schoolName: teacherProfile.schoolName || 'TRƯỜNG HỌC',
        className: activeClass?.name || 'Lớp',
        teacherName: teacherProfile.name,
        reportTitle: `TỔNG HỢP CHUYÊN CẦN VÀ BÁN TRÚ 4 KỲ - LỚP ${activeClass?.name || ''}`,
        reportDate: shortDateVN(selectedDate)
      },
      periodCols,
      periodRows
    );
    XLSX.utils.book_append_sheet(wb, wsMeta, 'TongHop_4_Ky');

    XLSX.writeFile(wb, `Bao_Cao_Chuyen_Can_Lop_${activeClass?.name || 'Lop'}_${selectedDate}.xlsx`);
    setExportToast('Đã xuất thành công file Excel báo cáo chuyên cần lớp chuẩn đẹp!');
    setTimeout(() => setExportToast(null), 3000);
  };

  // 2. Export Excel: Multi Class (Toàn Trường) with scientific formatting
  const handleExportMultiClassExcel = () => {
    const summaryCols: ExcelColumnDef[] = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Khối', key: 'grade', width: 10 },
      { header: 'Lớp học', key: 'className', width: 14 },
      { header: 'Giáo viên chủ nhiệm', key: 'teacherName', width: 22 },
      { header: 'Sĩ số', key: 'totalStudents', width: 10, isNumber: true },
      { header: 'Có mặt hôm nay', key: 'present', width: 15, isNumber: true },
      { header: 'Vắng có phép', key: 'excused', width: 14, isNumber: true },
      { header: 'Vắng không phép', key: 'unexcused', width: 15, isNumber: true },
      { header: 'Nghỉ ốm', key: 'sick', width: 12, isNumber: true },
      { header: 'Tỷ lệ CC hôm nay (%)', key: 'attRate', width: 18 },
      { header: 'Suất ăn bán trú', key: 'eating', width: 16, isNumber: true },
      { header: 'Tỷ lệ bán trú (%)', key: 'bRate', width: 16 },
      { header: 'Tỷ lệ CC Tuần này (%)', key: 'weekRate', width: 18 },
      { header: 'Tỷ lệ CC Tuần trước (%)', key: 'lastWeekRate', width: 18 },
      { header: 'Tỷ lệ CC Cả tháng (%)', key: 'monthRate', width: 18 }
    ];

    const summaryRows = multiClassData.map(c => ({
      stt: c.stt,
      grade: c.grade,
      className: c.className,
      teacherName: c.teacherName,
      totalStudents: c.totalStudents,
      present: c.stats.today.present,
      excused: c.stats.today.excused,
      unexcused: c.stats.today.unexcused,
      sick: c.stats.today.sick,
      attRate: `${c.stats.today.attRate}%`,
      eating: c.stats.today.boardingEating,
      bRate: `${c.stats.today.bRate}%`,
      weekRate: `${c.stats.thisWeek.attRate}%`,
      lastWeekRate: `${c.stats.lastWeek.attRate}%`,
      monthRate: `${c.stats.thisMonth.attRate}%`
    }));

    // Summary Total row
    const summaryTotalRow = {
      stt: 'TỔNG',
      grade: 'TOÀN TRƯỜNG',
      className: `${classes.length} Lớp`,
      teacherName: '',
      totalStudents: totalSchoolStudents,
      present: totalSchoolPresentToday,
      excused: multiClassData.reduce((acc, c) => acc + c.stats.today.excused, 0),
      unexcused: multiClassData.reduce((acc, c) => acc + c.stats.today.unexcused, 0),
      sick: multiClassData.reduce((acc, c) => acc + c.stats.today.sick, 0),
      attRate: `${schoolAttRateToday}%`,
      eating: totalSchoolEatingToday,
      bRate: `${schoolBRateToday}%`,
      weekRate: `${Math.round(multiClassData.reduce((acc, c) => acc + c.stats.thisWeek.attRate, 0) / (classes.length || 1))}%`,
      lastWeekRate: `${Math.round(multiClassData.reduce((acc, c) => acc + c.stats.lastWeek.attRate, 0) / (classes.length || 1))}%`,
      monthRate: `${Math.round(multiClassData.reduce((acc, c) => acc + c.stats.thisMonth.attRate, 0) / (classes.length || 1))}%`
    };

    // List of absent students across the school today
    const absentCols: ExcelColumnDef[] = [
      { header: 'STT', key: 'stt', width: 6, isNumber: true },
      { header: 'Lớp học', key: 'className', width: 14 },
      { header: 'Họ và tên học sinh', key: 'name', width: 24 },
      { header: 'Giới tính', key: 'gender', width: 10 },
      { header: 'Lý do vắng', key: 'reason', width: 18 },
      { header: 'Ăn bán trú', key: 'boardingStatus', width: 24 },
      { header: 'Ghi chú', key: 'note', width: 26 }
    ];

    const absentRows: any[] = [];
    let absIdx = 1;
    classes.forEach(cls => {
      const clsStudents = students.filter(s => s.classId === cls.id);
      const aRec = attendanceRecords.find(r => r.classId === cls.id && r.date === selectedDate);
      if (aRec) {
        clsStudents.forEach(st => {
          const status = aRec.records[st.id];
          if (status === 'sick' || status === 'excused' || status === 'unexcused' || status === 'other') {
            const reason = status === 'sick' ? 'Nghỉ ốm'
              : status === 'excused' ? 'Vắng có phép'
              : status === 'unexcused' ? 'Vắng không phép'
              : 'Lý do khác';
            absentRows.push({
              stt: absIdx++,
              className: cls.name,
              name: st.name,
              gender: st.gender,
              reason: reason,
              boardingStatus: 'Không ăn (Khóa do vắng chuyên cần)',
              note: `GVCN: ${cls.teacherName || teacherProfile.name}`
            });
          }
        });
      }
    });

    const wb = XLSX.utils.book_new();

    const wsSummary = buildFormattedSheet(
      {
        schoolName: teacherProfile.schoolName || 'TRƯỜNG HỌC',
        reportTitle: 'BÁO CÁO TỔNG HỢP CHUYÊN CẦN & BÁN TRÚ TOÀN TRƯỜNG',
        reportDate: shortDateVN(selectedDate),
        formulaNote: 'Công thức tính: Tỷ lệ (%) = (Số học sinh có mặt / Tổng số học sinh) × 100%'
      },
      summaryCols,
      summaryRows,
      summaryTotalRow
    );
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Tong_Hop_Toan_Truong');

    if (absentRows.length > 0) {
      const wsAbsent = buildFormattedSheet(
        {
          schoolName: teacherProfile.schoolName || 'TRƯỜNG HỌC',
          reportTitle: 'DANH SÁCH HỌC SINH VẮNG MẶT HÔM NAY TOÀN TRƯỜNG',
          reportDate: shortDateVN(selectedDate)
        },
        absentCols,
        absentRows
      );
      XLSX.utils.book_append_sheet(wb, wsAbsent, 'HocSinh_Vang_HomNay');
    }

    XLSX.writeFile(wb, `Tong_Hop_Chuyen_Can_Toan_Truong_${selectedDate}.xlsx`);
    setExportToast('Đã xuất thành công file Excel tổng hợp chuyên cần toàn trường chuẩn đẹp!');
    setTimeout(() => setExportToast(null), 3000);
  };

  // 3. Export PNG: Single Class with customizable orientation (landscape / portrait)
  const handleExportSingleClassPng = async (forceOrientation?: 'portrait' | 'landscape') => {
    const targetOrientation = forceOrientation || pdfOrientation;
    if (forceOrientation && forceOrientation !== pdfOrientation) {
      setPdfOrientation(forceOrientation);
    }
    if (!printSingleRef.current) return;
    setIsExportingPng(true);
    try {
      // Allow DOM to re-render and un-scroll before capturing
      await new Promise(resolve => setTimeout(resolve, 100));
      const success = await exportElementToImagePng(
        printSingleRef.current,
        `Bao_Cao_Chuyen_Can_Lop_${activeClass?.name || 'Lop'}_${selectedDate}_${targetOrientation === 'landscape' ? 'Kho_Ngang' : 'Kho_Doc'}.png`,
        targetOrientation,
        `Báo Cáo Điểm Danh Chuyên Cần Lớp ${activeClass?.name}`
      );
      if (success) {
        setExportToast(`Đã xuất thành công ảnh PNG (${targetOrientation === 'landscape' ? 'Khổ Ngang' : 'Khổ Dọc'}) chuyên cần lớp sắc nét!`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExportingPng(false);
      setTimeout(() => setExportToast(null), 3000);
    }
  };

  // 4. Export PNG: Multi Class (Toàn Trường) with customizable orientation (landscape / portrait)
  const handleExportMultiClassPng = async (forceOrientation?: 'portrait' | 'landscape') => {
    const targetOrientation = forceOrientation || pdfOrientation;
    if (forceOrientation && forceOrientation !== pdfOrientation) {
      setPdfOrientation(forceOrientation);
    }
    if (!printMultiRef.current) return;
    setIsExportingPng(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const success = await exportElementToImagePng(
        printMultiRef.current,
        `Tong_Hop_Chuyen_Can_Toan_Truong_${selectedDate}_${targetOrientation === 'landscape' ? 'Kho_Ngang' : 'Kho_Doc'}.png`,
        targetOrientation,
        'Báo Cáo Tổng Hợp Chuyên Cần Toàn Trường'
      );
      if (success) {
        setExportToast(`Đã xuất thành công ảnh PNG (${targetOrientation === 'landscape' ? 'Khổ Ngang' : 'Khổ Dọc'}) toàn trường sắc nét!`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExportingPng(false);
      setTimeout(() => setExportToast(null), 3000);
    }
  };

  // 5. Export PDF: Single Class with customizable A4 orientation
  const handleExportSingleClassPdf = async (forceOrientation?: 'portrait' | 'landscape') => {
    const targetOrientation = forceOrientation || pdfOrientation;
    if (forceOrientation && forceOrientation !== pdfOrientation) {
      setPdfOrientation(forceOrientation);
    }
    if (!printSingleRef.current) return;
    setIsExportingPdf(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const success = await exportElementToPdf(
        printSingleRef.current,
        `Bao_Cao_Chuyen_Can_Lop_${activeClass?.name || 'Lop'}_${selectedDate}_${targetOrientation === 'landscape' ? 'Kho_Ngang' : 'Kho_Doc'}.pdf`,
        targetOrientation,
        `Báo Cáo Chuyên Cần Lớp ${activeClass?.name}`
      );
      if (success) {
        setExportToast(`Đã xuất thành công file PDF A4 (${targetOrientation === 'landscape' ? 'Khổ Ngang' : 'Khổ Dọc'}) chuyên cần lớp!`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExportingPdf(false);
      setTimeout(() => setExportToast(null), 3000);
    }
  };

  // 6. Export PDF: Multi Class with customizable A4 orientation
  const handleExportMultiClassPdf = async (forceOrientation?: 'portrait' | 'landscape') => {
    const targetOrientation = forceOrientation || pdfOrientation;
    if (forceOrientation && forceOrientation !== pdfOrientation) {
      setPdfOrientation(forceOrientation);
    }
    if (!printMultiRef.current) return;
    setIsExportingPdf(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const success = await exportElementToPdf(
        printMultiRef.current,
        `Bao_Cao_Chuyen_Can_Toan_Truong_${selectedDate}_${targetOrientation === 'landscape' ? 'Kho_Ngang' : 'Kho_Doc'}.pdf`,
        targetOrientation,
        'Báo Cáo Tổng Hợp Chuyên Cần Toàn Trường'
      );
      if (success) {
        setExportToast(`Đã xuất thành công file PDF A4 (${targetOrientation === 'landscape' ? 'Khổ Ngang' : 'Khổ Dọc'}) toàn trường!`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExportingPdf(false);
      setTimeout(() => setExportToast(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl my-auto max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 md:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shadow-2xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-black text-slate-900 uppercase">
                XUẤT BÁO CÁO CHUYÊN CẦN & BÁN TRÚ (ẢNH PNG • PDF • EXCEL)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Xuất ảnh PNG tổng hợp theo khổ ngang/dọc sắc nét, in bản PDF chuẩn sư phạm & xuất file Excel chi tiết
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scope Tabs & Quick Actions */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Scope tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button
                onClick={() => {
                  setExportScope('single');
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer uppercase ${
                  exportScope === 'single'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Lớp hiện tại ({activeClass?.name})</span>
              </button>

              <button
                onClick={() => {
                  setExportScope('multi');
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer uppercase ${
                  exportScope === 'multi'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Toàn trường ({classes.length} lớp)</span>
              </button>
            </div>

            {/* Chọn khổ bố cục: Khổ Ngang (Landscape) vs Khổ Dọc (Portrait) */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Khổ bố cục:</span>
              <div className="flex items-center bg-white p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setPdfOrientation('landscape')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    pdfOrientation === 'landscape' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Khổ Ngang (Landscape) - Tối ưu xem trên màn hình rộng, gửi ảnh Zalo, Facebook, các cột bảng rộng rãi"
                >
                  <span>🖼️ Khổ Ngang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPdfOrientation('portrait')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    pdfOrientation === 'portrait' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Khổ Dọc (Portrait) - Tối ưu danh sách học sinh theo chiều dọc chuẩn in ấn A4"
                >
                  <span>📄 Khổ Dọc</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons: XUẤT ẢNH PNG • XUẤT PDF • XUẤT EXCEL */}
          <div className="flex flex-wrap items-center gap-2">
            {/* NÚT XUẤT ẢNH PNG TỔNG HỢP THEO YÊU CẦU MỚI */}
            <button
              onClick={() => exportScope === 'single' ? handleExportSingleClassPng() : handleExportMultiClassPng()}
              disabled={isExportingPng || isExportingPdf}
              className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/25 transition-all hover-zoom-btn uppercase cursor-pointer"
              title={`Xuất ảnh PNG tổng hợp chuẩn nét 2x (${pdfOrientation === 'landscape' ? 'Khổ Ngang' : 'Khổ Dọc'})`}
            >
              <ImageIcon className="w-4 h-4 text-emerald-100" />
              <span>
                {isExportingPng 
                  ? 'Đang tạo ảnh...' 
                  : `Xuất Ảnh PNG (${pdfOrientation === 'landscape' ? 'Khổ Ngang' : 'Khổ Dọc'})`}
              </span>
            </button>

            {/* NÚT XUẤT PDF */}
            <button
              onClick={() => exportScope === 'single' ? handleExportSingleClassPdf() : handleExportMultiClassPdf()}
              disabled={isExportingPdf || isExportingPng}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all hover-zoom-btn uppercase cursor-pointer"
              title={`Xuất bản PDF chuẩn A4 (${pdfOrientation === 'landscape' ? 'Khổ Ngang' : 'Khổ Dọc'})`}
            >
              <Download className="w-4 h-4" />
              <span>
                {isExportingPdf 
                  ? 'Đang tạo PDF...' 
                  : `Xuất PDF (${pdfOrientation === 'landscape' ? 'Khổ Ngang' : 'Khổ Dọc'})`}
              </span>
            </button>

            {/* NÚT XUẤT EXCEL */}
            <button
              onClick={exportScope === 'single' ? handleExportSingleClassExcel : handleExportMultiClassExcel}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all hover-zoom-btn uppercase cursor-pointer"
              title={`Xuất file Excel chuẩn bảng biểu ${exportScope === 'single' ? 'lớp' : 'toàn trường'}`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* Dải nút tải nhanh 1 chạm cho cả Khổ Ngang và Khổ Dọc */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-slate-500 flex items-center gap-1.5 text-[11px] uppercase">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Tải nhanh 1 chạm:</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => exportScope === 'single' ? handleExportSingleClassPng('landscape') : handleExportMultiClassPng('landscape')}
              disabled={isExportingPng || isExportingPdf}
              className="px-2.5 py-1 bg-white hover:bg-teal-50 text-teal-800 border border-teal-200 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
              title="Xuất ngay file ảnh PNG định dạng khổ ngang rộng rãi"
            >
              <ImageIcon className="w-3 h-3 text-teal-600" />
              <span>🖼️ Tải Ảnh Ngang</span>
            </button>
            <button
              onClick={() => exportScope === 'single' ? handleExportSingleClassPng('portrait') : handleExportMultiClassPng('portrait')}
              disabled={isExportingPng || isExportingPdf}
              className="px-2.5 py-1 bg-white hover:bg-teal-50 text-teal-800 border border-teal-200 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
              title="Xuất ngay file ảnh PNG định dạng khổ dọc"
            >
              <ImageIcon className="w-3 h-3 text-teal-600" />
              <span>🖼️ Tải Ảnh Dọc</span>
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => exportScope === 'single' ? handleExportSingleClassPdf('landscape') : handleExportMultiClassPdf('landscape')}
              disabled={isExportingPdf || isExportingPng}
              className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
              title="Xuất ngay file PDF định dạng khổ ngang"
            >
              <Download className="w-3 h-3 text-indigo-600" />
              <span>📕 Tải PDF Ngang</span>
            </button>
            <button
              onClick={() => exportScope === 'single' ? handleExportSingleClassPdf('portrait') : handleExportMultiClassPdf('portrait')}
              disabled={isExportingPdf || isExportingPng}
              className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
              title="Xuất ngay file PDF định dạng khổ dọc"
            >
              <Download className="w-3 h-3 text-indigo-600" />
              <span>📕 Tải PDF Dọc</span>
            </button>
          </div>
        </div>

        {exportToast && (
          <div className="mx-4 mt-3 bg-emerald-50 border border-emerald-300 text-emerald-900 p-3 rounded-2xl text-xs flex items-center gap-2 font-bold animate-in fade-in duration-150">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{exportToast}</span>
          </div>
        )}

        {/* Preview Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-100/70">
          {/* ========================================================================= */}
          {/* 1. SINGLE CLASS PREVIEW (A4 Document Format) */}
          {/* ========================================================================= */}
          {exportScope === 'single' && (
            <div 
              ref={printSingleRef}
              className={`mx-auto bg-white p-6 md:p-8 rounded-2xl border border-slate-300 shadow-md text-slate-800 text-xs space-y-5 transition-all ${
                pdfOrientation === 'landscape' ? 'max-w-[1123px] w-full' : 'max-w-[794px] w-full'
              }`}
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-300 pb-4">
                <div>
                  <div className="font-bold uppercase text-[11px] text-slate-600">
                    {teacherProfile.schoolName || 'TRƯỜNG HỌC'}
                  </div>
                  <div className="font-black text-sm text-slate-900">
                    LỚP: {activeClass?.name} - NĂM HỌC: {activeClass?.academicYear || '2026 - 2027'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Giáo viên chủ nhiệm: <strong>{teacherProfile.name}</strong>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500">
                  <div className="font-bold uppercase text-slate-700">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                  <div className="italic text-[10px]">Độc lập - Tự do - Hạnh phúc</div>
                  <div className="mt-1 font-semibold">{formatDateVN(selectedDate)}</div>
                </div>
              </div>

              {/* Title */}
              <div className="text-center space-y-1 py-1">
                <div className="inline-block px-3 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[10px] font-black uppercase text-indigo-700 tracking-wider">
                  {pdfOrientation === 'landscape' ? '🖼️ ĐỊNH DẠNG KHỔ NGANG (LANDSCAPE)' : '📄 ĐỊNH DẠNG KHỔ DỌC (PORTRAIT)'}
                </div>
                <h2 className="text-base md:text-lg font-black uppercase text-indigo-950 tracking-wide">
                  BÁO CÁO ĐIỂM DANH CHUYÊN CẦN & BÁN TRÚ {pdfOrientation === 'landscape' ? 'TỔNG HỢP' : ''}
                </h2>
                <p className="text-[11px] text-slate-500 italic">
                  (Căn cứ số liệu điểm danh ngày {shortDateVN(selectedDate)} và tổng hợp đối chiếu 4 kỳ)
                </p>
              </div>

              {/* Formula & Rule highlight + KPI cards in Landscape */}
              <div className={pdfOrientation === 'landscape' ? 'grid grid-cols-12 gap-3.5 items-stretch' : 'space-y-3'}>
                <div className={`bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 space-y-1.5 text-[11px] ${pdfOrientation === 'landscape' ? 'col-span-7' : ''}`}>
                  <div className="font-black text-emerald-900 flex items-center justify-between">
                    <span>📐 CÔNG THỨC TÍNH TỶ LỆ CHUYÊN CẦN:</span>
                    <span className="font-mono bg-emerald-200/80 px-2 py-0.5 rounded text-emerald-950 font-black">
                      SỐ HỌC SINH CÓ MẶT / TỔNG SỐ HỌC SINH × 100%
                    </span>
                  </div>
                  <div className="text-emerald-800 flex items-center justify-between font-bold">
                    <span>• Chuyên cần hôm nay: <strong>{singleClassStats.today.present} / {currentClassStudents.length} học sinh</strong></span>
                    <span className="font-mono text-emerald-900 font-black text-xs">
                      = ({singleClassStats.today.present} / {currentClassStudents.length}) × 100% = {singleClassStats.today.attRate}%
                    </span>
                  </div>
                  <div className="text-indigo-800 flex items-center justify-between font-bold pt-0.5 border-t border-emerald-200">
                    <span>• Đăng ký ăn bán trú: <strong>{singleClassStats.today.boardingEating} / {currentClassStudents.length} học sinh</strong></span>
                    <span className="font-mono text-indigo-950 font-black text-xs">
                      = ({singleClassStats.today.boardingEating} / {currentClassStudents.length}) × 100% = {singleClassStats.today.bRate}%
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-600 italic">
                    * Quy định: Học sinh vắng (nghỉ ốm, có phép, không phép) không được điểm danh ăn bán trú trong ngày.
                  </div>
                </div>

                {/* KPI stats in Landscape mode */}
                {pdfOrientation === 'landscape' ? (
                  <div className="col-span-5 grid grid-cols-2 gap-2 text-center">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Sĩ Số Lớp</span>
                      <span className="text-xl font-black text-slate-900 font-mono">{currentClassStudents.length}</span>
                      <span className="text-[10px] text-slate-500">Học sinh</span>
                    </div>
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col justify-center">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">Có Mặt Hôm Nay</span>
                      <span className="text-xl font-black text-emerald-800 font-mono">{singleClassStats.today.present}</span>
                      <span className="text-[10px] text-emerald-700 font-bold">Tỷ lệ: {singleClassStats.today.attRate}%</span>
                    </div>
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex flex-col justify-center">
                      <span className="text-[10px] font-bold text-rose-700 uppercase">Vắng Hôm Nay</span>
                      <span className="text-xl font-black text-rose-800 font-mono">{singleClassStats.today.totalAbsent}</span>
                      <span className="text-[10px] text-rose-700 font-bold">{singleClassStats.today.sick} ốm, {singleClassStats.today.excused} phép, {singleClassStats.today.unexcused} KP</span>
                    </div>
                    <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl flex flex-col justify-center">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase">Suất Ăn Bán Trú</span>
                      <span className="text-xl font-black text-indigo-800 font-mono">{singleClassStats.today.boardingEating}</span>
                      <span className="text-[10px] text-indigo-700 font-bold">Tỷ lệ: {singleClassStats.today.bRate}%</span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* 4 Periods Matrix */}
              <div>
                <div className="font-black text-xs uppercase text-slate-800 mb-1.5">
                  1. THỐNG KÊ ĐỐI CHIẾU CÁC KỲ (HÔM NAY • TUẦN NÀY • TUẦN TRƯỚC • CẢ THÁNG):
                </div>
                <table className="w-full text-[11px] border border-slate-300 text-center">
                  <thead className="bg-slate-100 font-black text-slate-800 border-b border-slate-300">
                    <tr>
                      <th className="p-2 border-r border-slate-300 text-left">Kỳ Thống Kê</th>
                      <th className="p-2 border-r border-slate-300">Sĩ Số</th>
                      <th className="p-2 border-r border-slate-300 text-emerald-700">Có Mặt</th>
                      <th className="p-2 border-r border-slate-300 text-blue-700">Có Phép</th>
                      <th className="p-2 border-r border-slate-300 text-rose-700">Không Phép</th>
                      <th className="p-2 border-r border-slate-300 text-purple-700">Nghỉ Ốm</th>
                      <th className="p-2 border-r border-slate-300 bg-emerald-50 text-emerald-900">% Chuyên Cần</th>
                      <th className="p-2 border-r border-slate-300 text-indigo-700">Ăn Bán Trú</th>
                      <th className="p-2 bg-indigo-50 text-indigo-900">% Bán Trú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold">
                    <tr>
                      <td className="p-2 text-left font-black text-slate-900 border-r border-slate-300">HÔM NAY</td>
                      <td className="p-2 border-r border-slate-300">{currentClassStudents.length}</td>
                      <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{singleClassStats.today.present}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.today.excused}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.today.unexcused}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.today.sick}</td>
                      <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{singleClassStats.today.attRate}%</td>
                      <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{singleClassStats.today.boardingEating}</td>
                      <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{singleClassStats.today.bRate}%</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-left font-black text-slate-900 border-r border-slate-300">TUẦN NÀY</td>
                      <td className="p-2 border-r border-slate-300">{currentClassStudents.length}</td>
                      <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{singleClassStats.thisWeek.present}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.thisWeek.excused}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.thisWeek.unexcused}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.thisWeek.sick}</td>
                      <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{singleClassStats.thisWeek.attRate}%</td>
                      <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{singleClassStats.thisWeek.boardingEating}</td>
                      <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{singleClassStats.thisWeek.bRate}%</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-left font-black text-slate-900 border-r border-slate-300">TUẦN TRƯỚC</td>
                      <td className="p-2 border-r border-slate-300">{currentClassStudents.length}</td>
                      <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{singleClassStats.lastWeek.present}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.lastWeek.excused}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.lastWeek.unexcused}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.lastWeek.sick}</td>
                      <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{singleClassStats.lastWeek.attRate}%</td>
                      <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{singleClassStats.lastWeek.boardingEating}</td>
                      <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{singleClassStats.lastWeek.bRate}%</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-left font-black text-slate-900 border-r border-slate-300">CẢ THÁNG</td>
                      <td className="p-2 border-r border-slate-300">{currentClassStudents.length}</td>
                      <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{singleClassStats.thisMonth.present}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.thisMonth.excused}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.thisMonth.unexcused}</td>
                      <td className="p-2 border-r border-slate-300">{singleClassStats.thisMonth.sick}</td>
                      <td className="p-2 border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/60">{singleClassStats.thisMonth.attRate}%</td>
                      <td className="p-2 border-r border-slate-300 font-bold text-indigo-700">{singleClassStats.thisMonth.boardingEating}</td>
                      <td className="p-2 font-black text-indigo-800 bg-indigo-50/60">{singleClassStats.thisMonth.bRate}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Student Roster Table */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-black text-xs uppercase text-slate-800">
                    2. BẢNG CHI TIẾT DANH SÁCH HỌC SINH VÀ ĐIỂM DANH HẰNG NGÀY:
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAllStudentsPreview(!showAllStudentsPreview)}
                    className="no-print no-pdf no-png text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                  >
                    {showAllStudentsPreview ? 'Thu gọn khung xem' : `Xem toàn bộ ${currentClassStudents.length} học sinh`}
                  </button>
                </div>
                <div className={isExportingPng || isExportingPdf || showAllStudentsPreview ? 'border border-slate-300 rounded overflow-visible' : 'max-h-80 overflow-y-auto border border-slate-300 rounded'}>
                  <table className="w-full text-[11px] text-center">
                    <thead className="bg-slate-100 font-black text-slate-800 border-b border-slate-300 sticky top-0">
                      <tr>
                        <th className="p-2 border-r border-slate-300 w-10">STT</th>
                        <th className="p-2 border-r border-slate-300 text-left">Họ và Tên</th>
                        <th className="p-2 border-r border-slate-300 w-14">Phái</th>
                        <th className="p-2 border-r border-slate-300 w-16">Tổ</th>
                        <th className="p-2 border-r border-slate-300">Điểm danh ngày</th>
                        <th className="p-2 border-r border-slate-300">Bán trú ngày</th>
                        <th className="p-2 border-r border-slate-300 w-16">Chuyên cần</th>
                        <th className="p-2 w-20">Xếp loại</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-semibold">
                      {currentClassStudents.map((st, idx) => {
                        const todayARec = attendanceRecords.find(r => r.classId === activeClass?.id && r.date === selectedDate);
                        const todayBRec = boardingRecords.find(r => r.classId === activeClass?.id && r.date === selectedDate);
                        const status = todayARec?.records[st.id] || 'present';
                        const isAbsent = status === 'sick' || status === 'excused' || status === 'unexcused' || status === 'other';
                        const bStatus = isAbsent ? 'Không ăn' : (todayBRec?.records[st.id] || 'eating') === 'eating' ? 'Ăn bán trú' : 'Không ăn';

                        return (
                          <tr key={st.id} className="hover:bg-slate-50">
                            <td className="p-1.5 border-r border-slate-300 font-mono">{idx + 1}</td>
                            <td className="p-1.5 border-r border-slate-300 text-left font-bold text-slate-900">{st.name}</td>
                            <td className="p-1.5 border-r border-slate-300 text-slate-600">{st.gender}</td>
                            <td className="p-1.5 border-r border-slate-300">{st.group || 'Tổ 1'}</td>
                            <td className="p-1.5 border-r border-slate-300 font-bold">
                              {status === 'present' ? <span className="text-emerald-700">Có mặt</span>
                               : status === 'sick' ? <span className="text-purple-700">Nghỉ ốm</span>
                               : status === 'excused' ? <span className="text-blue-700">Có phép</span>
                               : <span className="text-rose-700">Không phép</span>}
                            </td>
                            <td className="p-1.5 border-r border-slate-300 font-bold">
                              {isAbsent ? (
                                <span className="text-rose-600">Không ăn (Khóa)</span>
                              ) : bStatus === 'Ăn bán trú' ? (
                                <span className="text-emerald-700">Ăn bán trú</span>
                              ) : (
                                <span className="text-slate-500">Về nhà</span>
                              )}
                            </td>
                            <td className="p-1.5 border-r border-slate-300 font-mono font-bold text-emerald-800">
                              {status === 'present' ? '100%' : '80%'}
                            </td>
                            <td className="p-1.5 font-bold text-slate-800">
                              {status === 'present' ? 'Tốt' : 'Đạt'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 pt-6 text-center text-xs">
                <div>
                  <div className="font-black uppercase text-slate-800">BAN GIÁM HIỆU / XÁC NHẬN</div>
                  <div className="text-[10px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
                  <div className="h-16" />
                </div>
                <div>
                  <div className="font-black uppercase text-slate-800">GIÁO VIÊN CHỦ NHIỆM</div>
                  <div className="text-[10px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
                  <div className="h-16" />
                  <div className="font-black text-slate-900">{teacherProfile.name}</div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. MULTI CLASS PREVIEW (TOÀN TRƯỜNG) */}
          {/* ========================================================================= */}
          {exportScope === 'multi' && (
            <div 
              ref={printMultiRef}
              className={`mx-auto bg-white p-6 md:p-8 rounded-2xl border border-slate-300 shadow-md text-slate-800 text-xs space-y-5 transition-all ${
                pdfOrientation === 'landscape' ? 'max-w-[1123px] w-full' : 'max-w-[794px] w-full'
              }`}
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-300 pb-4">
                <div>
                  <div className="font-bold uppercase text-[11px] text-slate-600">
                    PHÒNG GIÁO DỤC VÀ ĐÀO TẠO
                  </div>
                  <div className="font-black text-sm text-slate-900 uppercase">
                    {teacherProfile.schoolName || 'TRƯỜNG HỌC'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Báo cáo tổng hợp chuyên cần & bán trú toàn trường
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500">
                  <div className="font-bold uppercase text-slate-700">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                  <div className="italic text-[10px]">Độc lập - Tự do - Hạnh phúc</div>
                  <div className="mt-1 font-semibold">{formatDateVN(selectedDate)}</div>
                </div>
              </div>

              {/* Title */}
              <div className="text-center space-y-1 py-1">
                <div className="inline-block px-3 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[10px] font-black uppercase text-indigo-700 tracking-wider">
                  {pdfOrientation === 'landscape' ? '🖼️ ĐỊNH DẠNG KHỔ NGANG (LANDSCAPE)' : '📄 ĐỊNH DẠNG KHỔ DỌC (PORTRAIT)'}
                </div>
                <h2 className="text-base md:text-lg font-black uppercase text-indigo-950 tracking-wide">
                  BÁO CÁO TỔNG HỢP CHUYÊN CẦN & BÁN TRÚ TOÀN TRƯỜNG {pdfOrientation === 'landscape' ? '(KHỔ NGANG)' : ''}
                </h2>
                <p className="text-[11px] text-slate-500 italic">
                  Tổng hợp đối chiếu số liệu ngày {shortDateVN(selectedDate)} và các kỳ
                </p>
              </div>

              {/* School KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Tổng Sĩ Số Toàn Trường</span>
                  <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">{totalSchoolStudents}</span>
                  <span className="text-[10px] text-slate-500">Học sinh ({classes.length} lớp)</span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase block">Có Mặt Hôm Nay</span>
                  <span className="text-xl font-black text-emerald-800 font-mono mt-0.5 block">{totalSchoolPresentToday}</span>
                  <span className="text-[10px] text-emerald-700 font-bold">Tỷ lệ: {schoolAttRateToday}%</span>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <span className="text-[10px] font-bold text-rose-700 uppercase block">Vắng Mặt Hôm Nay</span>
                  <span className="text-xl font-black text-rose-800 font-mono mt-0.5 block">{totalSchoolAbsentToday}</span>
                  <span className="text-[10px] text-rose-700 font-bold">Nghỉ ốm / Có phép / Không phép</span>
                </div>
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase block">Suất Ăn Bán Trú</span>
                  <span className="text-xl font-black text-indigo-800 font-mono mt-0.5 block">{totalSchoolEatingToday}</span>
                  <span className="text-[10px] text-indigo-700 font-bold">Tỷ lệ: {schoolBRateToday}%</span>
                </div>
              </div>

              {/* Multi Class Comparison Table */}
              <div>
                <div className="font-black text-xs uppercase text-slate-800 mb-1.5">
                  BẢNG ĐỐI CHIẾU CHUYÊN CẦN & BÁN TRÚ TẤT CẢ CÁC LỚP:
                </div>
                <div className="overflow-x-auto border border-slate-300 rounded">
                  <table className="w-full text-[11px] border-collapse text-center">
                    <thead className="bg-slate-100 font-black text-slate-800 border-b border-slate-300">
                      <tr>
                        <th className="p-2 border-r border-slate-300 w-10">STT</th>
                        <th className="p-2 border-r border-slate-300 text-left">Lớp</th>
                        <th className="p-2 border-r border-slate-300 text-left">Giáo viên CN</th>
                        <th className="p-2 border-r border-slate-300">Sĩ số</th>
                        <th className="p-2 border-r border-slate-300 text-emerald-700">Có mặt</th>
                        <th className="p-2 border-r border-slate-300 text-rose-700">Vắng</th>
                        <th className="p-2 border-r border-slate-300 bg-emerald-50 text-emerald-900">% CC Hôm nay</th>
                        <th className="p-2 border-r border-slate-300 text-indigo-700">Suất ăn</th>
                        <th className="p-2 border-r border-slate-300 bg-indigo-50 text-indigo-900">% Bán trú</th>
                        <th className="p-2 border-r border-slate-300">% CC Tuần này</th>
                        <th className="p-2">% CC Cả tháng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-semibold">
                      {multiClassData.map(c => (
                        <tr key={c.classId} className="hover:bg-slate-50">
                          <td className="p-2 border-r border-slate-300 font-mono">{c.stt}</td>
                          <td className="p-2 border-r border-slate-300 text-left font-black text-slate-900">{c.className}</td>
                          <td className="p-2 border-r border-slate-300 text-left text-slate-600 truncate max-w-[120px]">{c.teacherName}</td>
                          <td className="p-2 border-r border-slate-300 font-mono">{c.totalStudents}</td>
                          <td className="p-2 border-r border-slate-300 text-emerald-700 font-bold">{c.stats.today.present}</td>
                          <td className="p-2 border-r border-slate-300 text-rose-700 font-bold">{c.stats.today.totalAbsent}</td>
                          <td className="p-2 border-r border-slate-300 bg-emerald-50/60 font-black text-emerald-800">{c.stats.today.attRate}%</td>
                          <td className="p-2 border-r border-slate-300 text-indigo-700 font-bold">{c.stats.today.boardingEating}</td>
                          <td className="p-2 border-r border-slate-300 bg-indigo-50/60 font-black text-indigo-800">{c.stats.today.bRate}%</td>
                          <td className="p-2 border-r border-slate-300 font-bold text-slate-700">{c.stats.thisWeek.attRate}%</td>
                          <td className="p-2 font-bold text-slate-700">{c.stats.thisMonth.attRate}%</td>
                        </tr>
                      ))}
                      {/* Total Row */}
                      <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                        <td colSpan={3} className="p-2 border-r border-slate-300 text-center uppercase">
                          TỔNG CỘNG TOÀN TRƯỜNG ({classes.length} LỚP)
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono">{totalSchoolStudents}</td>
                        <td className="p-2 border-r border-slate-300 text-emerald-800">{totalSchoolPresentToday}</td>
                        <td className="p-2 border-r border-slate-300 text-rose-800">{totalSchoolAbsentToday}</td>
                        <td className="p-2 border-r border-slate-300 bg-emerald-100 text-emerald-950 font-black">{schoolAttRateToday}%</td>
                        <td className="p-2 border-r border-slate-300 text-indigo-800">{totalSchoolEatingToday}</td>
                        <td className="p-2 border-r border-slate-300 bg-indigo-100 text-indigo-950 font-black">{schoolBRateToday}%</td>
                        <td className="p-2 border-r border-slate-300">
                          {Math.round(multiClassData.reduce((acc, c) => acc + c.stats.thisWeek.attRate, 0) / (classes.length || 1))}%
                        </td>
                        <td className="p-2">
                          {Math.round(multiClassData.reduce((acc, c) => acc + c.stats.thisMonth.attRate, 0) / (classes.length || 1))}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 pt-6 text-center text-xs">
                <div>
                  <div className="font-black uppercase text-slate-800">NGƯỜI LẬP BÁO CÁO</div>
                  <div className="text-[10px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
                  <div className="h-16" />
                  <div className="font-black text-slate-900">{teacherProfile.name}</div>
                </div>
                <div>
                  <div className="font-black uppercase text-slate-800">HIỆU TRƯỞNG / BAN GIÁM HIỆU</div>
                  <div className="text-[10px] text-slate-500 italic">(Ký tên và đóng dấu)</div>
                  <div className="h-16" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
