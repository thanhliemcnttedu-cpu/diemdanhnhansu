import React, { useState, useRef } from 'react';
import { writeReportXlsx } from '../../../utils/licensedExport';
import * as XLSX from 'xlsx';
import { useClassroom } from '../../../context/ClassroomContext';
import { SubjectTimetableSlot } from '../../../types';
import { 
  Calendar, Clock, School, Plus, Trash2, Edit2, 
  Printer, Download, Sparkles, BookOpen, CheckCircle2, 
  RotateCcw, SlidersHorizontal, ArrowRight, Star, ExternalLink,
  Layers, MapPin, Eye, Check, X, Award, AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playFanfareSound, playPointClink } from '../../../utils/audio';
import { SubjectTimetableTemplateModal } from './SubjectTimetableTemplateModal';
import { InitSubjectClassesModal } from '../classes/InitSubjectClassesModal';

const DAY_LABELS = [
  { day: 2, label: 'THỨ HAI', short: 'T2', color: 'from-blue-600 to-indigo-600', light: 'bg-blue-50 text-blue-900 border-blue-200' },
  { day: 3, label: 'THỨ BA', short: 'T3', color: 'from-emerald-600 to-teal-600', light: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
  { day: 4, label: 'THỨ TƯ', short: 'T4', color: 'from-amber-500 to-orange-600', light: 'bg-amber-50 text-amber-900 border-amber-200' },
  { day: 5, label: 'THỨ NĂM', short: 'T5', color: 'from-purple-600 to-violet-600', light: 'bg-purple-50 text-purple-900 border-purple-200' },
  { day: 6, label: 'THỨ SÁU', short: 'T6', color: 'from-rose-500 to-pink-600', light: 'bg-rose-50 text-rose-900 border-rose-200' },
  { day: 7, label: 'THỨ BẢY', short: 'T7', color: 'from-slate-700 to-indigo-500', light: 'bg-slate-50 text-slate-900 border-slate-200' }
];

interface SlotModalState {
  isOpen: boolean;
  day: number;
  session: 'morning' | 'afternoon';
  period: number;
  existingSlot?: SubjectTimetableSlot;
}

export const SubjectTeacherTimetableView: React.FC<{ onNavigate?: (view: any) => void }> = ({ onNavigate }) => {
  const { 
    classes, activeClassId, setActiveClassId, students,
    subjectTeacherConfig, updateSubjectTeacherConfig,
    subjectTimetable, updateSubjectTimetableSlot, deleteSubjectTimetableSlot,
    clearSubjectTimetable, seedSample20SubjectClasses, loadSampleTimetableByImage,
    teacherProfile, subjects
  } = useClassroom();

  const [activeSlotModal, setActiveSlotModal] = useState<SlotModalState | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [customClassName, setCustomClassName] = useState('');
  const [slotSubject, setSlotSubject] = useState<string>('TIN HỌC');
  const [newTaughtSubjectInput, setNewTaughtSubjectInput] = useState('');
  const [slotRoom, setSlotRoom] = useState(subjectTeacherConfig.roomDefault || 'Phòng máy Tin học');
  const [slotNote, setSlotNote] = useState('');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isInitSubjectClassesModalOpen, setIsInitSubjectClassesModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [timetableDisplayMode, setTimetableDisplayMode] = useState<'standard_document' | 'interactive_grid'>('standard_document');
  const [quickToast, setQuickToast] = useState<string | null>(null);
  const [activeFilterGrade, setActiveFilterGrade] = useState<string>('all');

  // Cấu hình 4 môn học giảng dạy cho giáo viên bộ môn (Dạy nhiều môn ở nhiều lớp)
  const [configSubjectName, setConfigSubjectName] = useState(subjectTeacherConfig.subjectName || 'TIN HỌC');
  const [configSubject2, setConfigSubject2] = useState(subjectTeacherConfig.subject2 ?? (subjectTeacherConfig.taughtSubjects?.[1] || 'CÔNG NGHỆ'));
  const [configSubject3, setConfigSubject3] = useState(subjectTeacherConfig.subject3 ?? (subjectTeacherConfig.taughtSubjects?.[2] || ''));
  const [configSubject4, setConfigSubject4] = useState(subjectTeacherConfig.subject4 ?? (subjectTeacherConfig.taughtSubjects?.[3] || ''));
  const [configRoom, setConfigRoom] = useState(subjectTeacherConfig.roomDefault || 'Phòng máy Tin học');
  const [configPeriodName, setConfigPeriodName] = useState(subjectTeacherConfig.periodName || 'Học kì I (Từ ngày 05/9/2026)');
  const [configMorningPeriods, setConfigMorningPeriods] = useState(subjectTeacherConfig.morningPeriods || 4);
  const [configAfternoonPeriods, setConfigAfternoonPeriods] = useState(subjectTeacherConfig.afternoonPeriods || 3);
  const [configHasSaturday, setConfigHasSaturday] = useState(subjectTeacherConfig.hasSaturday || false);

  // Sync state khi mở modal cấu hình
  React.useEffect(() => {
    if (isConfigModalOpen) {
      setConfigSubjectName(subjectTeacherConfig.subjectName || 'TIN HỌC');
      setConfigSubject2(subjectTeacherConfig.subject2 !== undefined ? subjectTeacherConfig.subject2 : (subjectTeacherConfig.taughtSubjects?.[1] || 'CÔNG NGHỆ'));
      setConfigSubject3(subjectTeacherConfig.subject3 !== undefined ? subjectTeacherConfig.subject3 : (subjectTeacherConfig.taughtSubjects?.[2] || ''));
      setConfigSubject4(subjectTeacherConfig.subject4 !== undefined ? subjectTeacherConfig.subject4 : (subjectTeacherConfig.taughtSubjects?.[3] || ''));
      setConfigRoom(subjectTeacherConfig.roomDefault || 'Phòng máy Tin học');
      setConfigPeriodName(subjectTeacherConfig.periodName || 'Học kì I (Từ ngày 05/9/2026)');
      setConfigMorningPeriods(subjectTeacherConfig.morningPeriods || 4);
      setConfigAfternoonPeriods(subjectTeacherConfig.afternoonPeriods || 3);
      setConfigHasSaturday(subjectTeacherConfig.hasSaturday || false);
    }
  }, [isConfigModalOpen, subjectTeacherConfig]);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Default times
  const morningTimes = ['07:15 - 07:55', '08:00 - 08:40', '09:00 - 09:40', '09:45 - 10:25', '10:30 - 11:10'];
  const afternoonTimes = ['13:45 - 14:25', '14:30 - 15:10', '15:25 - 16:05', '16:10 - 16:50'];

  const displayedDays = DAY_LABELS.filter(d => d.day <= (subjectTeacherConfig.hasSaturday ? 7 : 6));

  // Tự động đồng bộ các tiết dạy trong TKB: dọn dẹp các tiết của lớp đã bị xóa bên ngoài Lớp học
  React.useEffect(() => {
    if (classes.length === 0 && subjectTimetable.length > 0) {
      clearSubjectTimetable();
      return;
    }
    const currentClassIds = new Set(classes.map(c => c.id));
    const currentClassNamesLower = new Set(classes.map(c => c.name.toLowerCase().trim()));
    const orphanedSlots = subjectTimetable.filter(slot => {
      const matchId = currentClassIds.has(slot.classId);
      const matchName = currentClassNamesLower.has(slot.className.toLowerCase().trim());
      return !matchId && !matchName;
    });

    if (orphanedSlots.length > 0) {
      orphanedSlots.forEach(s => deleteSubjectTimetableSlot(s.id));
    }
  }, [classes, subjectTimetable, clearSubjectTimetable, deleteSubjectTimetableSlot]);

  const showToast = (msg: string) => {
    setQuickToast(msg);
    setTimeout(() => setQuickToast(null), 3000);
  };

  const handleOpenSlotModal = (day: number, session: 'morning' | 'afternoon', period: number) => {
    const existing = subjectTimetable.find(s => s.day === day && s.session === session && s.period === period);
    setActiveSlotModal({
      isOpen: true,
      day,
      session,
      period,
      existingSlot: existing
    });

    if (existing) {
      setSelectedClassId(existing.classId);
      setCustomClassName(existing.className);
      setSlotSubject(existing.subject || subjectTeacherConfig.taughtSubjects?.[0] || subjectTeacherConfig.subjectName || 'TIN HỌC');
      setSlotRoom(existing.room || subjectTeacherConfig.roomDefault);
      setSlotNote(existing.note || '');
    } else {
      setSelectedClassId(classes[0]?.id || '');
      setCustomClassName(classes[0]?.name || '');
      setSlotSubject(subjectTeacherConfig.taughtSubjects?.[0] || subjectTeacherConfig.subjectName || 'TIN HỌC');
      setSlotRoom(subjectTeacherConfig.roomDefault || 'Phòng máy Tin học');
      setSlotNote('');
    }
  };

  const handleSaveSlot = () => {
    if (!activeSlotModal) return;
    const targetClass = classes.find(c => c.id === selectedClassId);
    const finalClassName = customClassName.trim() || targetClass?.name || 'Lớp mới';
    const finalSubject = slotSubject.trim().toUpperCase() || subjectTeacherConfig.subjectName || 'TIN HỌC';

    updateSubjectTimetableSlot({
      id: activeSlotModal.existingSlot?.id,
      day: activeSlotModal.day,
      session: activeSlotModal.session,
      period: activeSlotModal.period,
      classId: selectedClassId || `class-${finalClassName.toLowerCase()}`,
      className: finalClassName,
      subject: finalSubject,
      room: slotRoom.trim() || subjectTeacherConfig.roomDefault,
      note: slotNote.trim(),
      scope: subjectTeacherConfig.scheduleScope,
      periodName: subjectTeacherConfig.periodName
    });

    playPointClink();
    setActiveSlotModal(null);
    showToast(`Đã lưu tiết ${activeSlotModal.period} (${activeSlotModal.session === 'morning' ? 'Sáng' : 'Chiều'}): Môn ${finalSubject} - Lớp ${finalClassName}`);
  };

  const handleDeleteSlot = () => {
    if (!activeSlotModal?.existingSlot) return;
    deleteSubjectTimetableSlot(activeSlotModal.existingSlot.id);
    setActiveSlotModal(null);
    showToast('Đã xóa tiết dạy khỏi thời khóa biểu');
  };

  // Jump to teaching class & award points immediately
  const handleJumpToClass = (classId: string, className: string) => {
    setActiveClassId(classId);
    playPointClink();
    if (onNavigate) {
      onNavigate('students');
    }
  };

  // Calculate unique classes taught and total periods
  const uniqueClassNamesInTimetable = Array.from(new Set(subjectTimetable.map(s => s.className)));
  const totalAssignedSlots = subjectTimetable.length;

  // Apply the official teaching timetable sample matching image.png
  const handleApplySampleTimetable = () => {
    loadSampleTimetableByImage(true);
    playFanfareSound();
    confetti({ particleCount: 70, spread: 70 });
    showToast('Đã áp dụng thành công Thời khóa biểu giảng dạy theo mẫu chuẩn (18 tiết môn Tin học)!');
  };

  // Export timetable to Excel matching image.png format exactly
  const handleExportExcel = () => {
    const teacherName = subjectTeacherConfig.teacherDisplayName || teacherProfile.name || 'Nguyễn Thanh Liêm';
    const subjectName = subjectTeacherConfig.subjectName || 'Tin học';
    const semester = subjectTeacherConfig.semester || 'I';
    const startDate = subjectTeacherConfig.effectiveStartDate || '05/9/2026';

    const rows: any[] = [];
    rows.push(['', '', 'THỜI KHÓA BIỂU GIẢNG DẠY', '', '', '', '']);
    rows.push([`HỌ VÀ TÊN GIÁO VIÊN: ${teacherName}`, '', '', '', `Môn dạy: ${subjectName}`, '', '']);
    rows.push([`HỌC KÌ: ${semester}`, '', '', '', `Thời gian thực hiện từ ngày: ${startDate}`, '', '']);
    rows.push([]);
    rows.push(['BUỔI', 'SỐ TIẾT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU']);

    // Morning (SÁNG)
    const mPeriods = subjectTeacherConfig.morningPeriods || 4;
    for (let p = 1; p <= mPeriods; p++) {
      const row = [p === 1 ? 'SÁNG' : '', p];
      for (let day = 2; day <= 6; day++) {
        const slot = subjectTimetable.find(s => s.day === day && s.session === 'morning' && s.period === p);
        row.push(slot ? `${slot.subject} ${slot.className}` : '');
      }
      rows.push(row);
    }

    // Afternoon (CHIỀU)
    const aPeriods = subjectTeacherConfig.afternoonPeriods || 3;
    for (let p = 1; p <= aPeriods; p++) {
      const row = [p === 1 ? 'CHIỀU' : '', p];
      for (let day = 2; day <= 6; day++) {
        const slot = subjectTimetable.find(s => s.day === day && s.session === 'afternoon' && s.period === p);
        row.push(slot ? `${slot.subject} ${slot.className}` : '');
      }
      rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = [
      { s: { r: 0, c: 2 }, e: { r: 0, c: 4 } }, // Title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }, // Teacher name
      { s: { r: 1, c: 4 }, e: { r: 1, c: 6 } }, // Subject
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }, // Semester
      { s: { r: 2, c: 4 }, e: { r: 2, c: 6 } }, // Date
      { s: { r: 4, c: 0 }, e: { r: 4 + mPeriods - 1, c: 0 } }, // SÁNG
      { s: { r: 4 + mPeriods, c: 0 }, e: { r: 4 + mPeriods + aPeriods - 1, c: 0 } } // CHIỀU
    ];

    ws['!cols'] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TKB_GiangDay');
    writeReportXlsx(wb, `THOI_KHOA_BIEU_GIANG_DAY_${teacherName.replace(/\s+/g, '_')}_${subjectName}.xlsx`);
    showToast('Đã xuất file Excel Thời khóa biểu giảng dạy theo mẫu chuẩn thành công!');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Alert */}
      {quickToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-white text-slate-800 px-4 py-2.5 rounded-2xl shadow-xl border border-slate-200 text-xs font-black flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{quickToast}</span>
        </div>
      )}

      {/* Hero Header for Subject Teacher Timetable */}
      <div className="p-6 md:p-7 rounded-3xl bg-gradient-to-r from-emerald-700 via-teal-700 to-indigo-700 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-white/20 backdrop-blur-md text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
                <span>💻</span>
                <span>GIÁO VIÊN BỘ MÔN</span>
              </span>
              <span className="px-3 py-1 rounded-xl bg-amber-400 text-amber-950 font-black text-xs uppercase tracking-wider shadow-2xs">
                MÔN: {subjectTeacherConfig.subjectName}
              </span>
              <span className="px-3 py-1 rounded-xl bg-emerald-700/80 text-white font-bold text-xs uppercase tracking-wider">
                {subjectTeacherConfig.scheduleScope === 'semester' ? 'DÙNG CHUNG CẢ HỌC KỲ' : 'THEO THỜI ĐIỂM'}
              </span>
            </div>

            <h1 className="text-xl md:text-2xl font-black tracking-tight uppercase flex items-center gap-2">
              <Calendar className="w-7 h-7 text-amber-300" />
              <span>THỜI KHÓA BIỂU GIẢNG DẠY BỘ MÔN ({classes.length} LỚP PHỤ TRÁCH)</span>
            </h1>

            <p className="text-xs md:text-sm text-white max-w-2xl font-medium leading-relaxed">
              Sắp lịch dạy linh hoạt cho nhiều lớp (lên tới 20+ lớp), áp dụng dùng chung cả học kì hoặc theo tuần. Bấm vào bất kỳ tiết nào để vào lớp dạy và chấm sao tặng xu cho học sinh ngay lập tức!
            </p>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex flex-wrap lg:flex-nowrap items-center gap-3">
            <div className="bg-white/15 backdrop-blur-md border border-white/20 px-4 py-3 rounded-2xl text-center min-w-[110px] shadow-sm">
              <div className="text-2xl font-black text-amber-300">{classes.length}</div>
              <div className="text-[12px] font-bold text-white/90 uppercase mt-0.5">Lớp Phụ Trách</div>
            </div>
            <div className="bg-white/15 backdrop-blur-md border border-white/20 px-4 py-3 rounded-2xl text-center min-w-[110px] shadow-sm">
              <div className="text-2xl font-black text-white">{totalAssignedSlots}</div>
              <div className="text-[12px] font-bold text-white/90 uppercase mt-0.5">Tiết Dạy / Tuần</div>
            </div>
            <div className="bg-white/15 backdrop-blur-md border border-white/20 px-4 py-3 rounded-2xl text-center min-w-[110px] shadow-sm">
              <div className="text-2xl font-black text-white">{students.length}</div>
              <div className="text-[12px] font-bold text-white/90 uppercase mt-0.5">Tổng Học Sinh</div>
            </div>
          </div>
        </div>

        {/* Toolbar of Actions */}
        <div className="mt-6 pt-5 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Scope Switcher: Dùng chung cả học kì vs Theo thời điểm */}
            <div className="p-1 bg-black/20 rounded-2xl backdrop-blur-md flex items-center border border-white/10">
              <button
                onClick={() => updateSubjectTeacherConfig({ scheduleScope: 'semester' })}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                  subjectTeacherConfig.scheduleScope === 'semester'
                    ? 'bg-white text-emerald-900 shadow-md'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                <span>📅</span>
                <span>Dùng chung cả học kì</span>
              </button>
              <button
                onClick={() => updateSubjectTeacherConfig({ scheduleScope: 'period' })}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 uppercase ${
                  subjectTeacherConfig.scheduleScope === 'period'
                    ? 'bg-white text-emerald-900 shadow-md'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                <span>⏱️</span>
                <span>Theo thời điểm / tuần</span>
              </button>
            </div>

            <button
              onClick={() => setIsConfigModalOpen(true)}
              className="px-3.5 py-2 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-black text-xs transition-all flex items-center gap-2 hover-zoom-btn border border-white/20 uppercase"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Cấu hình TKB</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 1. KHỞI TẠO LỚP DẠY BỘ MÔN (Thay thế hoàn toàn 20 lớp bộ môn) */}
            <button
              onClick={() => setIsInitSubjectClassesModalOpen(true)}
              className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 text-white font-black text-xs transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/30 hover-zoom-btn uppercase"
              title="Tạo nhanh các lớp giảng dạy bộ môn, điền thông tin lớp và số lượng học sinh"
            >
              <School className="w-4 h-4 text-amber-300" />
              <span>KHỞI TẠO LỚP DẠY BỘ MÔN</span>
            </button>

            {/* 2. TẠO THỜI KHÓA BIỂU THEO MẪU */}
            <button
              onClick={() => setIsTemplateModalOpen(true)}
              className="px-3.5 py-2 rounded-2xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs transition-all flex items-center gap-1.5 shadow-md shadow-amber-400/30 hover-zoom-btn uppercase"
              title="Mở mẫu thời khóa biểu giảng dạy bộ môn chuẩn theo ảnh đính kèm"
            >
              <Sparkles className="w-4 h-4 text-amber-950 animate-pulse" />
              <span>TẠO TKB THEO MẪU</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-2xl bg-white text-emerald-900 hover:bg-emerald-50 font-black text-xs transition-all flex items-center gap-1.5 shadow-sm hover-zoom-btn uppercase"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Xuất Excel</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-black text-xs transition-all flex items-center gap-1.5 hover-zoom-btn border border-white/20 uppercase"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In A4</span>
            </button>

            <button
              onClick={() => setIsClearConfirmOpen(true)}
              className="p-2 rounded-2xl bg-rose-500/30 hover:bg-rose-500/50 text-white font-bold text-xs transition-all hover-zoom-btn border border-rose-300/30"
              title="Xóa trắng thời khóa biểu để xếp lại"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* View Switcher: Bảng Văn Bản Mẫu Theo Ảnh vs Lưới Tương Tác */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
            CHẾ ĐỘ HIỂN THỊ THỜI KHÓA BIỂU BỘ MÔN:
          </span>
        </div>

        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            onClick={() => setTimetableDisplayMode('standard_document')}
            className={`px-3.5 py-1.5 rounded-lg font-black text-xs transition-all uppercase flex items-center gap-1.5 ${
              timetableDisplayMode === 'standard_document'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>MẪU THỜI KHÓA BIỂU GIẢNG DẠY (THEO ẢNH)</span>
          </button>

          <button
            onClick={() => setTimetableDisplayMode('interactive_grid')}
            className={`px-3.5 py-1.5 rounded-lg font-black text-xs transition-all uppercase flex items-center gap-1.5 ${
              timetableDisplayMode === 'interactive_grid'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>BẢNG LƯỚI TƯƠNG TÁC (CHẤM SAO / XU)</span>
          </button>
        </div>
      </div>

      {/* Main Timetable Matrix Table */}
      <div 
        ref={printAreaRef} 
        id="printable-subject-timetable" 
        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
      >
        {timetableDisplayMode === 'standard_document' ? (
          <>
            {/* Header Mẫu Thời khóa biểu giảng dạy theo mẫu ảnh chuẩn */}
            <div className="p-6 md:p-8 bg-white border-b border-slate-200 text-center space-y-3">
              <div className="text-xs md:text-sm font-black text-slate-600 uppercase tracking-widest">
                {teacherProfile.schoolName || 'TRƯỜNG HỌC'}
              </div>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">
                THỜI KHÓA BIỂU GIẢNG DẠY
              </h2>
              <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs md:text-sm text-left pt-2 font-semibold text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 uppercase text-xs">HỌ VÀ TÊN GIÁO VIÊN:</span>
                  <span className="font-black text-slate-900 uppercase">
                    {subjectTeacherConfig.teacherDisplayName || teacherProfile.name || 'Nguyễn Thanh Liêm'}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <span className="font-bold text-slate-500 uppercase text-xs">MÔN DẠY:</span>
                  <span className="font-black text-emerald-800 uppercase">
                    {(subjectTeacherConfig.taughtSubjects && subjectTeacherConfig.taughtSubjects.length > 0)
                      ? subjectTeacherConfig.taughtSubjects.join(' • ')
                      : (subjectTeacherConfig.subjectName || 'Tin học')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 uppercase text-xs">HỌC KÌ:</span>
                  <span className="font-black text-slate-900 uppercase">
                    {subjectTeacherConfig.semester || 'I'}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <span className="font-bold text-slate-500 uppercase text-xs">THỜI GIAN THỰC HIỆN TỪ NGÀY:</span>
                  <span className="font-black text-slate-900 uppercase">
                    {subjectTeacherConfig.effectiveStartDate || '05/9/2026'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bảng Thời Khóa Biểu Chuẩn Theo Mẫu Sảnh/Ảnh Đính Kèm - Hiển thị đơn giản Dạy môn gì lớp mấy */}
            <div className="overflow-x-auto p-4 md:p-6 bg-slate-50/30">
              <table className="w-full text-center border-collapse border-2 border-slate-300 min-w-[760px] bg-white shadow-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 text-xs md:text-sm font-black uppercase border-b-2 border-slate-300">
                    <th className="py-3 px-3 w-24 border border-slate-300">BUỔI</th>
                    <th className="py-3 px-3 w-20 border border-slate-300">SỐ TIẾT</th>
                    {displayedDays.map(d => (
                      <th key={d.day} className="py-3 px-3 border border-slate-300">
                        <div className="font-black text-slate-900">{d.label}</div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="text-xs md:text-sm divide-y divide-slate-300">
                  {/* BUỔI SÁNG */}
                  {Array.from({ length: subjectTeacherConfig.morningPeriods }, (_, i) => i + 1).map((period, pIdx) => (
                    <tr key={`std-m-${period}`} className="hover:bg-slate-50/70 transition-colors">
                      {pIdx === 0 && (
                        <td 
                          rowSpan={subjectTeacherConfig.morningPeriods}
                          className="border border-slate-300 font-black text-slate-900 text-sm md:text-base uppercase bg-slate-100/90 align-middle py-4 px-2"
                        >
                          SÁNG
                        </td>
                      )}
                      <td className="border border-slate-300 py-3.5 px-2 font-black text-slate-800 bg-slate-50/50">
                        {period}
                      </td>

                      {displayedDays.map(d => {
                        const slot = subjectTimetable.find(s => s.day === d.day && s.session === 'morning' && s.period === period);
                        return (
                          <td 
                            key={`std-m-${d.day}-${period}`}
                            onClick={() => handleOpenSlotModal(d.day, 'morning', period)}
                            className="border border-slate-300 p-2.5 align-middle cursor-pointer hover:bg-emerald-50/60 transition-colors group relative"
                            title={slot ? `Tiết dạy: ${slot.subject} ${slot.className} - Bấm để sửa hoặc vào lớp` : 'Bấm để xếp lớp vào tiết này'}
                          >
                            {slot ? (
                              <div className="py-1">
                                <div className="font-black text-slate-900 text-sm md:text-base tracking-tight group-hover:text-emerald-700 transition-colors">
                                  {slot.subject} {slot.className}
                                </div>
                                <div className="hidden group-hover:flex items-center justify-center gap-1.5 mt-1 text-[12px] text-emerald-700 font-bold">
                                  <span 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleJumpToClass(slot.classId, slot.className);
                                    }}
                                    className="hover:underline flex items-center gap-0.5 bg-emerald-100 px-2 py-0.5 rounded-full"
                                  >
                                    Vào dạy »
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="py-2 text-slate-500 group-hover:text-emerald-700 text-[12px] font-bold">
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity">+ Xếp lớp</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* BUỔI CHIỀU */}
                  {Array.from({ length: subjectTeacherConfig.afternoonPeriods }, (_, i) => i + 1).map((period, pIdx) => (
                    <tr key={`std-a-${period}`} className="hover:bg-slate-50/70 transition-colors">
                      {pIdx === 0 && (
                        <td 
                          rowSpan={subjectTeacherConfig.afternoonPeriods}
                          className="border border-slate-300 font-black text-slate-900 text-sm md:text-base uppercase bg-slate-100/90 align-middle py-4 px-2"
                        >
                          CHIỀU
                        </td>
                      )}
                      <td className="border border-slate-300 py-3.5 px-2 font-black text-slate-800 bg-slate-50/50">
                        {period}
                      </td>

                      {displayedDays.map(d => {
                        const slot = subjectTimetable.find(s => s.day === d.day && s.session === 'afternoon' && s.period === period);
                        return (
                          <td 
                            key={`std-a-${d.day}-${period}`}
                            onClick={() => handleOpenSlotModal(d.day, 'afternoon', period)}
                            className="border border-slate-300 p-2.5 align-middle cursor-pointer hover:bg-emerald-50/60 transition-colors group relative"
                            title={slot ? `Tiết dạy: ${slot.subject} ${slot.className} - Bấm để sửa hoặc vào lớp` : 'Bấm để xếp lớp vào tiết này'}
                          >
                            {slot ? (
                              <div className="py-1">
                                <div className="font-black text-slate-900 text-sm md:text-base tracking-tight group-hover:text-emerald-700 transition-colors">
                                  {slot.subject} {slot.className}
                                </div>
                                <div className="hidden group-hover:flex items-center justify-center gap-1.5 mt-1 text-[12px] text-emerald-700 font-bold">
                                  <span 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleJumpToClass(slot.classId, slot.className);
                                    }}
                                    className="hover:underline flex items-center gap-0.5 bg-emerald-100 px-2 py-0.5 rounded-full"
                                  >
                                    Vào dạy »
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="py-2 text-slate-500 group-hover:text-emerald-700 text-[12px] font-bold">
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity">+ Xếp lớp</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* Table Subheader in interactive grid mode */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-indigo-500" />
                <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  BẢNG LỊCH GIẢNG DẠY CẢ TUẦN – {subjectTeacherConfig.scheduleScope === 'semester' ? subjectTeacherConfig.periodName : 'LỊCH THEO TUẦN'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[12px] text-slate-500 font-bold uppercase">
                <span>Phòng máy mặc định:</span>
                <span className="font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                  {subjectTeacherConfig.roomDefault}
                </span>
              </div>
            </div>

            {/* The Matrix in interactive grid mode */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 text-xs font-black uppercase border-b border-slate-200">
                    <th className="py-3.5 px-4 w-24 text-center border-r border-slate-200">Buổi / Tiết</th>
                    <th className="py-3.5 px-3 w-28 text-center border-r border-slate-200">Giờ học</th>
                    {displayedDays.map(d => (
                      <th key={d.day} className="py-3 px-3 text-center border-r border-slate-200 last:border-r-0">
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-black text-slate-900">{d.label}</span>
                          <span className="text-[12px] text-slate-400 font-bold mt-0.5">({d.short})</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 text-xs">
                  {/* SÁNG (Morning) */}
                  <tr className="bg-amber-50/70 border-b border-amber-200/80 font-black text-amber-900 uppercase">
                    <td colSpan={displayedDays.length + 2} className="py-2 px-4 text-xs tracking-wider flex items-center gap-2">
                      <span>☀️</span>
                      <span>BUỔI SÁNG (TIẾT 1 – TIẾT {subjectTeacherConfig.morningPeriods})</span>
                    </td>
                  </tr>

                  {Array.from({ length: subjectTeacherConfig.morningPeriods }, (_, i) => i + 1).map(period => (
                    <tr key={`morning-${period}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 text-center font-black text-slate-800 bg-slate-50/50 border-r border-slate-200">
                        TIẾT {period}
                      </td>
                      <td className="py-2.5 px-2 text-center text-[12px] font-mono text-slate-500 border-r border-slate-200 whitespace-nowrap">
                        {morningTimes[period - 1] || '---'}
                      </td>

                      {displayedDays.map(d => {
                        const slot = subjectTimetable.find(s => s.day === d.day && s.session === 'morning' && s.period === period);
                        const matchingClass = classes.find(c => c.id === slot?.classId || c.name.toLowerCase() === slot?.className.toLowerCase());

                        return (
                          <td key={`${d.day}-m-${period}`} className="p-2 border-r border-slate-200 last:border-r-0 align-top">
                            {slot ? (
                              <div 
                                className="group p-2.5 rounded-2xl bg-gradient-to-br from-indigo-50/90 to-blue-50/70 border border-indigo-200 hover:border-indigo-400 shadow-2xs hover-zoom-card transition-all relative"
                              >
                                <div className="flex items-start justify-between gap-1 mb-1.5">
                                  <div className="flex flex-wrap items-center gap-1 max-w-[155px]">
                                    <span className="px-2 py-0.5 rounded-lg text-[12px] font-black uppercase text-white shadow-2xs truncate bg-indigo-700">
                                      {slot.subject || 'TIN HỌC'}
                                    </span>
                                    <span 
                                      className="px-2 py-0.5 rounded-lg text-xs font-black text-white shadow-2xs uppercase truncate"
                                      style={{ backgroundColor: matchingClass?.color || '#4F46E5' }}
                                    >
                                      {slot.className}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleOpenSlotModal(d.day, 'morning', period)}
                                      className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-white"
                                      title="Chỉnh sửa tiết dạy"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => deleteSubjectTimetableSlot(slot.id)}
                                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-white"
                                      title="Xóa tiết"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                <div className="text-[12px] font-bold text-slate-600 flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span className="truncate">{slot.room || subjectTeacherConfig.roomDefault}</span>
                                </div>

                                {slot.note && (
                                  <div className="text-[12px] text-indigo-900 font-medium mt-1 line-clamp-1 italic bg-white/70 px-1.5 py-0.5 rounded-md border border-indigo-100">
                                    {slot.note}
                                  </div>
                                )}

                                <button
                                  onClick={() => handleJumpToClass(slot.classId, slot.className)}
                                  className="mt-2 w-full py-1 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[12px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase transition-all"
                                  title="Chuyển ngay sang lớp này để chấm sao và thi đua"
                                >
                                  <Star className="w-3 h-3 text-amber-300 fill-amber-300" />
                                  <span>VÀO LỚP DẠY & CHẤM SAO</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenSlotModal(d.day, 'morning', period)}
                                className="w-full h-20 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-400 hover:text-indigo-600 transition-all flex flex-col items-center justify-center gap-1 text-[12px] font-black group"
                                title="Xếp lớp dạy vào tiết này"
                              >
                                <Plus className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:scale-125 transition-transform" />
                                <span className="text-[12px] uppercase font-bold text-slate-400 group-hover:text-indigo-600">+ Xếp lớp</span>
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* CHIỀU (Afternoon) */}
                  <tr className="bg-sky-50/70 border-b border-sky-200/80 font-black text-sky-900 uppercase">
                    <td colSpan={displayedDays.length + 2} className="py-2 px-4 text-xs tracking-wider flex items-center gap-2">
                      <span>🌤️</span>
                      <span>BUỔI CHIỀU (TIẾT 1 – TIẾT {subjectTeacherConfig.afternoonPeriods})</span>
                    </td>
                  </tr>

                  {Array.from({ length: subjectTeacherConfig.afternoonPeriods }, (_, i) => i + 1).map(period => (
                    <tr key={`afternoon-${period}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 text-center font-black text-slate-800 bg-slate-50/50 border-r border-slate-200">
                        TIẾT {period}
                      </td>
                      <td className="py-2.5 px-2 text-center text-[12px] font-mono text-slate-500 border-r border-slate-200 whitespace-nowrap">
                        {afternoonTimes[period - 1] || '---'}
                      </td>

                      {displayedDays.map(d => {
                        const slot = subjectTimetable.find(s => s.day === d.day && s.session === 'afternoon' && s.period === period);
                        const matchingClass = classes.find(c => c.id === slot?.classId || c.name.toLowerCase() === slot?.className.toLowerCase());

                        return (
                          <td key={`${d.day}-a-${period}`} className="p-2 border-r border-slate-200 last:border-r-0 align-top">
                            {slot ? (
                              <div 
                                className="group p-2.5 rounded-2xl bg-gradient-to-br from-teal-50/90 to-emerald-50/70 border border-teal-200 hover:border-teal-400 shadow-2xs hover-zoom-card transition-all relative"
                              >
                                <div className="flex items-start justify-between gap-1 mb-1.5">
                                  <div className="flex flex-wrap items-center gap-1 max-w-[155px]">
                                    <span className="px-2 py-0.5 rounded-lg text-[12px] font-black uppercase text-white shadow-2xs truncate bg-teal-700">
                                      {slot.subject || 'TIN HỌC'}
                                    </span>
                                    <span 
                                      className="px-2 py-0.5 rounded-lg text-xs font-black text-white shadow-2xs uppercase truncate"
                                      style={{ backgroundColor: matchingClass?.color || '#0D9488' }}
                                    >
                                      {slot.className}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleOpenSlotModal(d.day, 'afternoon', period)}
                                      className="p-1 rounded-md text-slate-400 hover:text-teal-700 hover:bg-white"
                                      title="Chỉnh sửa tiết dạy"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => deleteSubjectTimetableSlot(slot.id)}
                                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-white"
                                      title="Xóa tiết"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                <div className="text-[12px] font-bold text-slate-600 flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 text-teal-600 shrink-0" />
                                  <span className="truncate">{slot.room || subjectTeacherConfig.roomDefault}</span>
                                </div>

                                {slot.note && (
                                  <div className="text-[12px] text-teal-900 font-medium mt-1 line-clamp-1 italic bg-white/70 px-1.5 py-0.5 rounded-md border border-teal-100">
                                    {slot.note}
                                  </div>
                                )}

                                <button
                                  onClick={() => handleJumpToClass(slot.classId, slot.className)}
                                  className="mt-2 w-full py-1 px-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-black text-[12px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase transition-all"
                                  title="Chuyển ngay sang lớp này để chấm sao và thi đua"
                                >
                                  <Star className="w-3 h-3 text-amber-300 fill-amber-300" />
                                  <span>VÀO LỚP DẠY & CHẤM SAO</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenSlotModal(d.day, 'afternoon', period)}
                                className="w-full h-20 rounded-2xl border-2 border-dashed border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 text-slate-400 hover:text-teal-700 transition-all flex flex-col items-center justify-center gap-1 text-[12px] font-black group"
                                title="Xếp lớp dạy vào tiết này"
                              >
                                <Plus className="w-4 h-4 text-slate-300 group-hover:text-teal-600 group-hover:scale-125 transition-transform" />
                                <span className="text-[12px] uppercase font-bold text-slate-400 group-hover:text-teal-700">+ Xếp lớp</span>
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 20 Teaching Classes Grid & Quick Entrance Cards */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
                <School className="w-5 h-5 text-indigo-600" />
                <span>DANH SÁCH {classes.length} LỚP DẠY MÔN {subjectTeacherConfig.subjectName}</span>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[12px] font-black uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Đồng bộ với mục Lớp học ngoài
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Danh mục tự động cập nhật khi bạn thêm, sửa, hoặc xóa lớp ở mục Lớp học ngoài (nếu còn 2 lớp thì hiển thị đúng 2 lớp).
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {['all', 'Khối 1', 'Khối 2', 'Khối 3', 'Khối 4', 'Khối 5'].map(grade => (
              <button
                key={grade}
                onClick={() => setActiveFilterGrade(grade)}
                className={`px-3 py-1 rounded-xl text-xs font-black uppercase transition-all ${
                  activeFilterGrade === grade
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {grade === 'all' ? 'TẤT CẢ' : grade}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 pt-2">
          {classes
            .filter(c => activeFilterGrade === 'all' || c.grade === activeFilterGrade)
            .map(cls => {
              const clsStudents = students.filter(s => s.classId === cls.id);
              const weeklySlots = subjectTimetable.filter(s => s.classId === cls.id || s.className.toLowerCase() === cls.name.toLowerCase()).length;
              const totalCoinsInSubject = clsStudents.reduce((acc, st) => acc + (st.subjectPoints?.[subjectTeacherConfig.subjectName] || 0), 0);
              const isActive = activeClassId === cls.id;

              return (
                <div
                  key={cls.id}
                  onClick={() => handleJumpToClass(cls.id, cls.name)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer hover-zoom-card flex flex-col justify-between ${
                    isActive
                      ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-500 shadow-md ring-2 ring-indigo-300'
                      : 'bg-slate-50/70 hover:bg-white border-slate-200 hover:border-indigo-300 shadow-2xs'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span 
                        className="px-2.5 py-0.5 rounded-lg text-xs font-black text-white shadow-2xs uppercase"
                        style={{ backgroundColor: cls.color || '#4F46E5' }}
                      >
                        {cls.name}
                      </span>
                      <span className="text-[12px] font-bold text-slate-500">{cls.grade}</span>
                    </div>

                    <div className="space-y-1 text-[12px] text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>Sĩ số:</span>
                        <span className="font-bold text-slate-900">{clsStudents.length} HS</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Số tiết/tuần:</span>
                        <span className="font-bold text-indigo-700">{weeklySlots} tiết</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Xu tích lũy môn:</span>
                        <span className="font-black text-amber-700 flex items-center gap-0.5">
                          ⭐ {totalCoinsInSubject}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between">
                    <span className="text-[12px] font-black text-indigo-600 uppercase flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Vào dạy</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                    {isActive && (
                      <span className="text-[12px] font-black uppercase px-1.5 py-0.2 rounded bg-indigo-600 text-white">
                        Đang chọn
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Slot Assignment / Editing Modal */}
      {activeSlotModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase">
                    XẾP LỚP DẠY (THỨ {activeSlotModal.day} • {activeSlotModal.session === 'morning' ? 'SÁNG' : 'CHIỀU'} TIẾT {activeSlotModal.period})
                  </h4>
                  <p className="text-[12px] text-slate-500 font-medium">Môn: {subjectTeacherConfig.subjectName}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveSlotModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* 1. Chọn Môn Học Giảng Dạy (Giáo viên có thể dạy nhiều môn) */}
              <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-indigo-950 font-black uppercase text-xs">
                    1. Chọn Môn Giảng Dạy:
                  </label>
                  <span className="text-[12px] font-black text-indigo-700 bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
                    {slotSubject || 'TIN HỌC'}
                  </span>
                </div>

                {/* Các môn bộ môn đã cấu hình (Ưu tiên hiển thị Môn chính, Môn 2, Môn 3, Môn 4) */}
                <div className="space-y-1">
                  <span className="text-[12px] font-bold text-slate-500 uppercase block">Các môn bạn đảm nhiệm:</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: subjectTeacherConfig.subjectName || 'TIN HỌC', label: 'Môn chính', icon: '⭐', color: 'border-indigo-400' },
                      subjectTeacherConfig.subject2 ? { name: subjectTeacherConfig.subject2, label: 'Môn 2', icon: '📘', color: 'border-teal-400' } : null,
                      subjectTeacherConfig.subject3 ? { name: subjectTeacherConfig.subject3, label: 'Môn 3', icon: '📙', color: 'border-amber-400' } : null,
                      subjectTeacherConfig.subject4 ? { name: subjectTeacherConfig.subject4, label: 'Môn 4', icon: '📗', color: 'border-emerald-400' } : null,
                    ].filter(Boolean).map(item => {
                      const isSelected = slotSubject.trim().toUpperCase() === item!.name.trim().toUpperCase();
                      return (
                        <button
                          key={item!.name}
                          type="button"
                          onClick={() => setSlotSubject(item!.name)}
                          className={`px-3 py-2 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 border-2 ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-300'
                              : 'bg-white text-slate-700 hover:bg-indigo-50 ' + item!.color
                          }`}
                        >
                          <span>{item!.icon}</span>
                          <span>{item!.name}</span>
                          <span className={`text-[12px] px-1.5 py-0.5 rounded-md font-bold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item!.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Other Common School Subjects */}
                <div className="space-y-1 pt-1">
                  <span className="text-[12px] font-bold text-slate-400 uppercase block">Hoặc chọn môn khác:</span>
                  <div className="flex flex-wrap gap-1">
                    {['TIN HỌC', 'CÔNG NGHỆ', 'TIẾNG ANH', 'ÂM NHẠC', 'MĨ THUẬT', 'GIÁO DỤC THỂ CHẤT', 'KHOA HỌC', 'STEM', 'HOẠT ĐỘNG TRẢI NGHIỆM', 'TOÁN', 'TIẾNG VIỆT'].map(sub => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setSlotSubject(sub)}
                        className={`px-2 py-0.5 rounded-lg text-[12px] font-bold uppercase transition-all ${
                          slotSubject.trim().toUpperCase() === sub.toUpperCase()
                            ? 'bg-indigo-800 text-white'
                            : 'bg-white/80 text-slate-600 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Input */}
                <input
                  type="text"
                  value={slotSubject}
                  onChange={(e) => setSlotSubject(e.target.value.toUpperCase())}
                  placeholder="Hoặc gõ tên môn khác..."
                  className="w-full px-3 py-2 bg-white rounded-xl border border-indigo-200 text-xs font-black uppercase text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* 2. Chọn Lớp Giảng Dạy Trong Danh Sách */}
              <div className="space-y-1.5">
                <label className="block text-slate-700 font-black uppercase text-xs">
                  2. Chọn Lớp Giảng Dạy Trong Danh Sách ({classes.length} lớp):
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    const cls = classes.find(c => c.id === e.target.value);
                    if (cls) setCustomClassName(cls.name);
                  }}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 font-bold bg-white text-slate-800"
                >
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} — {cls.grade} ({students.filter(s => s.classId === cls.id).length} học sinh)
                    </option>
                  ))}
                </select>
              </div>

              {/* Or type custom class name */}
              <div>
                <label className="block text-slate-700 font-black uppercase text-xs mb-1">
                  Hoặc Gõ Tên Lớp Khác:
                </label>
                <input
                  type="text"
                  value={customClassName}
                  onChange={(e) => setCustomClassName(e.target.value)}
                  placeholder="Ví dụ: 4A1, 5A2, 3A3..."
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 focus:border-indigo-600 font-bold"
                />
              </div>

              {/* Room */}
              <div>
                <label className="block text-slate-700 font-black uppercase mb-1">
                  2. Phòng Học Bộ Môn:
                </label>
                <input
                  type="text"
                  value={slotRoom}
                  onChange={(e) => setSlotRoom(e.target.value)}
                  placeholder="Ví dụ: Phòng máy 1, Phòng Tin học 2..."
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 focus:border-indigo-600 font-medium"
                />
              </div>

              {/* Lesson Note */}
              <div>
                <label className="block text-slate-700 font-black uppercase mb-1">
                  3. Nội Dung Bài Dạy / Ghi Chú (Tùy chọn):
                </label>
                <input
                  type="text"
                  value={slotNote}
                  onChange={(e) => setSlotNote(e.target.value)}
                  placeholder="Ví dụ: Bài 3: Soạn thảo văn bản Word, Thực hành..."
                  className="w-full px-3 py-2 rounded-2xl border border-slate-300 focus:border-indigo-600 font-medium"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              {activeSlotModal.existingSlot ? (
                <button
                  onClick={handleDeleteSlot}
                  className="px-3 py-2 rounded-xl text-xs font-black text-rose-600 hover:bg-rose-50 flex items-center gap-1.5 uppercase transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa Tiết Này</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveSlotModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 uppercase"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveSlot}
                  className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase shadow-md shadow-indigo-600/20 hover-zoom-btn flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Lưu Tiết Dạy</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Config Timetable & Subject Teacher Modal */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 md:p-6 shadow-2xl border border-slate-100 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black shadow-xs">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm md:text-base font-black text-slate-900 uppercase">
                    CẤU HÌNH THỜI KHÓA BIỂU GIÁO VIÊN BỘ MÔN
                  </h4>
                  <p className="text-[12px] text-slate-500 font-medium">
                    Thiết lập các môn học bạn giảng dạy, phòng học và thời gian biểu
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* KHỐI 1: CẤU HÌNH 4 MÔN HỌC GIẢNG DẠY (User Request 2) */}
              <div className="p-4 bg-gradient-to-br from-indigo-50/90 via-purple-50/50 to-blue-50/80 rounded-2xl border-2 border-indigo-200/90 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between pb-1 border-b border-indigo-200/60">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📚</span>
                    <span className="font-black text-indigo-950 uppercase text-xs">
                      MÔN HỌC GIẢNG DẠY (GIÁO VIÊN BỘ MÔN CÓ THỂ DẠY NHIỀU MÔN Ở NHIỀU LỚP)
                    </span>
                  </div>
                  <span className="text-[12px] font-black text-indigo-700 bg-white px-2.5 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
                    {[configSubjectName, configSubject2, configSubject3, configSubject4].filter(s => s && s.trim().length > 0).length} MÔN ĐẢM NHIỆM
                  </span>
                </div>
                <p className="text-[12px] text-indigo-800 leading-relaxed">
                  Thiết lập môn dạy chính và các môn dạy kèm theo (Môn 2, Môn 3, Môn 4). Khi xếp từng tiết dạy trên TKB, hệ thống sẽ tạo các nút bấm nhanh tương ứng để bạn chọn môn phù hợp cho từng lớp.
                </p>

                {/* Grid 4 ô lựa chọn môn dạy rõ ràng khoa học */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Ô 1: MÔN DẠY CHÍNH (BẮT BUỘC) */}
                  <div className="p-3 bg-white rounded-xl border-2 border-indigo-400 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-indigo-950 text-[12px] uppercase flex items-center gap-1">
                        <span>⭐</span>
                        <span>MÔN DẠY CHÍNH (MÔN 1 - BẮT BUỘC):</span>
                      </span>
                      <span className="text-[12px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                        MẶC ĐỊNH
                      </span>
                    </div>
                    <div className="space-y-1">
                      <select
                        value={['TIN HỌC', 'TIẾNG ANH', 'ÂM NHẠC', 'MĨ THUẬT', 'GIÁO DỤC THỂ CHẤT', 'CÔNG NGHỆ', 'KHOA HỌC', 'LỊCH SỬ & ĐỊA LÍ', 'ĐẠO ĐỨC', 'HOẠT ĐỘNG TRẢI NGHIỆM', 'KỸ NĂNG SỐNG', 'STEM', 'TOÁN', 'TIẾNG VIỆT'].includes(configSubjectName.toUpperCase()) ? configSubjectName.toUpperCase() : 'custom'}
                        onChange={(e) => {
                          if (e.target.value !== 'custom') {
                            setConfigSubjectName(e.target.value);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold bg-white text-slate-800 text-xs"
                      >
                        <option value="TIN HỌC">💻 TIN HỌC</option>
                        <option value="CÔNG NGHỆ">⚙️ CÔNG NGHỆ</option>
                        <option value="TIẾNG ANH">🇬🇧 TIẾNG ANH</option>
                        <option value="ÂM NHẠC">🎵 ÂM NHẠC</option>
                        <option value="MĨ THUẬT">🎨 MĨ THUẬT</option>
                        <option value="GIÁO DỤC THỂ CHẤT">⚽ GIÁO DỤC THỂ CHẤT</option>
                        <option value="KHOA HỌC">🔬 KHOA HỌC</option>
                        <option value="LỊCH SỬ & ĐỊA LÍ">🌍 LỊCH SỬ & ĐỊA LÍ</option>
                        <option value="ĐẠO ĐỨC">📖 ĐẠO ĐỨC</option>
                        <option value="HOẠT ĐỘNG TRẢI NGHIỆM">🎒 HOẠT ĐỘNG TRẢI NGHIỆM</option>
                        <option value="KỸ NĂNG SỐNG">🌱 KỸ NĂNG SỐNG</option>
                        <option value="STEM">🚀 STEM</option>
                        <option value="TOÁN">📐 TOÁN</option>
                        <option value="TIẾNG VIỆT">✍️ TIẾNG VIỆT</option>
                        <option value="custom">✏️ Tự gõ tên môn khác...</option>
                      </select>
                      <input
                        type="text"
                        value={configSubjectName}
                        onChange={(e) => setConfigSubjectName(e.target.value.toUpperCase())}
                        placeholder="Gõ hoặc sửa tên môn dạy chính..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-200 font-black uppercase text-indigo-700 bg-indigo-50/50 text-xs"
                      />
                    </div>
                  </div>

                  {/* Ô 2: MÔN DẠY 2 (NẾU CÓ) */}
                  <div className="p-3 bg-white rounded-xl border-2 border-teal-300 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-teal-950 text-[12px] uppercase flex items-center gap-1">
                        <span>📘</span>
                        <span>MÔN DẠY 2 (NẾU CÓ):</span>
                      </span>
                      {configSubject2 && (
                        <button
                          type="button"
                          onClick={() => setConfigSubject2('')}
                          className="text-[12px] text-rose-600 hover:text-rose-800 font-bold flex items-center gap-0.5"
                          title="Xóa môn 2 này"
                        >
                          <X className="w-3 h-3" />
                          <span>Xóa</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <select
                        value={['TIN HỌC', 'TIẾNG ANH', 'ÂM NHẠC', 'MĨ THUẬT', 'GIÁO DỤC THỂ CHẤT', 'CÔNG NGHỆ', 'KHOA HỌC', 'LỊCH SỬ & ĐỊA LÍ', 'ĐẠO ĐỨC', 'HOẠT ĐỘNG TRẢI NGHIỆM', 'KỸ NĂNG SỐNG', 'STEM', 'TOÁN', 'TIẾNG VIỆT'].includes(configSubject2.toUpperCase()) ? configSubject2.toUpperCase() : (configSubject2 ? 'custom' : '')}
                        onChange={(e) => {
                          if (e.target.value !== 'custom') {
                            setConfigSubject2(e.target.value);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold bg-white text-slate-800 text-xs"
                      >
                        <option value="">-- Chưa chọn môn 2 (Để trống nếu không dạy) --</option>
                        <option value="CÔNG NGHỆ">⚙️ CÔNG NGHỆ</option>
                        <option value="TIN HỌC">💻 TIN HỌC</option>
                        <option value="TIẾNG ANH">🇬🇧 TIẾNG ANH</option>
                        <option value="ÂM NHẠC">🎵 ÂM NHẠC</option>
                        <option value="MĨ THUẬT">🎨 MĨ THUẬT</option>
                        <option value="GIÁO DỤC THỂ CHẤT">⚽ GIÁO DỤC THỂ CHẤT</option>
                        <option value="KHOA HỌC">🔬 KHOA HỌC</option>
                        <option value="HOẠT ĐỘNG TRẢI NGHIỆM">🎒 HOẠT ĐỘNG TRẢI NGHIỆM</option>
                        <option value="STEM">🚀 STEM</option>
                        <option value="custom">✏️ Tự gõ tên môn khác...</option>
                      </select>
                      <input
                        type="text"
                        value={configSubject2}
                        onChange={(e) => setConfigSubject2(e.target.value.toUpperCase())}
                        placeholder="Gõ tên môn dạy 2 (hoặc để trống)..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-teal-200 font-black uppercase text-teal-800 bg-teal-50/40 text-xs"
                      />
                    </div>
                  </div>

                  {/* Ô 3: MÔN DẠY 3 (NẾU CÓ) */}
                  <div className="p-3 bg-white rounded-xl border-2 border-amber-300 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-amber-950 text-[12px] uppercase flex items-center gap-1">
                        <span>📙</span>
                        <span>MÔN DẠY 3 (NẾU CÓ):</span>
                      </span>
                      {configSubject3 && (
                        <button
                          type="button"
                          onClick={() => setConfigSubject3('')}
                          className="text-[12px] text-rose-600 hover:text-rose-800 font-bold flex items-center gap-0.5"
                          title="Xóa môn 3 này"
                        >
                          <X className="w-3 h-3" />
                          <span>Xóa</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <select
                        value={['TIN HỌC', 'TIẾNG ANH', 'ÂM NHẠC', 'MĨ THUẬT', 'GIÁO DỤC THỂ CHẤT', 'CÔNG NGHỆ', 'KHOA HỌC', 'LỊCH SỬ & ĐỊA LÍ', 'ĐẠO ĐỨC', 'HOẠT ĐỘNG TRẢI NGHIỆM', 'KỸ NĂNG SỐNG', 'STEM', 'TOÁN', 'TIẾNG VIỆT'].includes(configSubject3.toUpperCase()) ? configSubject3.toUpperCase() : (configSubject3 ? 'custom' : '')}
                        onChange={(e) => {
                          if (e.target.value !== 'custom') {
                            setConfigSubject3(e.target.value);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold bg-white text-slate-800 text-xs"
                      >
                        <option value="">-- Chưa chọn môn 3 (Để trống nếu không dạy) --</option>
                        <option value="KHOA HỌC">🔬 KHOA HỌC</option>
                        <option value="CÔNG NGHỆ">⚙️ CÔNG NGHỆ</option>
                        <option value="HOẠT ĐỘNG TRẢI NGHIỆM">🎒 HOẠT ĐỘNG TRẢI NGHIỆM</option>
                        <option value="KỸ NĂNG SỐNG">🌱 KỸ NĂNG SỐNG</option>
                        <option value="STEM">🚀 STEM</option>
                        <option value="custom">✏️ Tự gõ tên môn khác...</option>
                      </select>
                      <input
                        type="text"
                        value={configSubject3}
                        onChange={(e) => setConfigSubject3(e.target.value.toUpperCase())}
                        placeholder="Gõ tên môn dạy 3 (hoặc để trống)..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 font-black uppercase text-amber-800 bg-amber-50/40 text-xs"
                      />
                    </div>
                  </div>

                  {/* Ô 4: MÔN DẠY 4 (NẾU CÓ) */}
                  <div className="p-3 bg-white rounded-xl border-2 border-emerald-300 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-emerald-950 text-[12px] uppercase flex items-center gap-1">
                        <span>📗</span>
                        <span>MÔN DẠY 4 (NẾU CÓ):</span>
                      </span>
                      {configSubject4 && (
                        <button
                          type="button"
                          onClick={() => setConfigSubject4('')}
                          className="text-[12px] text-rose-600 hover:text-rose-800 font-bold flex items-center gap-0.5"
                          title="Xóa môn 4 này"
                        >
                          <X className="w-3 h-3" />
                          <span>Xóa</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <select
                        value={['TIN HỌC', 'TIẾNG ANH', 'ÂM NHẠC', 'MĨ THUẬT', 'GIÁO DỤC THỂ CHẤT', 'CÔNG NGHỆ', 'KHOA HỌC', 'LỊCH SỬ & ĐỊA LÍ', 'ĐẠO ĐỨC', 'HOẠT ĐỘNG TRẢI NGHIỆM', 'KỸ NĂNG SỐNG', 'STEM', 'TOÁN', 'TIẾNG VIỆT'].includes(configSubject4.toUpperCase()) ? configSubject4.toUpperCase() : (configSubject4 ? 'custom' : '')}
                        onChange={(e) => {
                          if (e.target.value !== 'custom') {
                            setConfigSubject4(e.target.value);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold bg-white text-slate-800 text-xs"
                      >
                        <option value="">-- Chưa chọn môn 4 (Để trống nếu không dạy) --</option>
                        <option value="HOẠT ĐỘNG TRẢI NGHIỆM">🎒 HOẠT ĐỘNG TRẢI NGHIỆM</option>
                        <option value="KỸ NĂNG SỐNG">🌱 KỸ NĂNG SỐNG</option>
                        <option value="STEM">🚀 STEM</option>
                        <option value="custom">✏️ Tự gõ tên môn khác...</option>
                      </select>
                      <input
                        type="text"
                        value={configSubject4}
                        onChange={(e) => setConfigSubject4(e.target.value.toUpperCase())}
                        placeholder="Gõ tên môn dạy 4 (hoặc để trống)..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 font-black uppercase text-emerald-800 bg-emerald-50/40 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Dải tóm tắt môn học đang cấu hình */}
                <div className="pt-2 border-t border-indigo-200/60 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[12px] font-bold text-indigo-900">
                    Môn học sẽ hiển thị trên TKB:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-[12px] uppercase shadow-2xs flex items-center gap-1">
                      <span>⭐</span>
                      <span>{configSubjectName.trim() || 'TIN HỌC'} (Chính)</span>
                    </span>
                    {configSubject2.trim() && (
                      <span className="px-2.5 py-1 rounded-lg bg-teal-700 text-white font-black text-[12px] uppercase shadow-2xs flex items-center gap-1">
                        <span>📘</span>
                        <span>{configSubject2.trim()} (Môn 2)</span>
                      </span>
                    )}
                    {configSubject3.trim() && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-700 text-white font-black text-[12px] uppercase shadow-2xs flex items-center gap-1">
                        <span>📙</span>
                        <span>{configSubject3.trim()} (Môn 3)</span>
                      </span>
                    )}
                    {configSubject4.trim() && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-black text-[12px] uppercase shadow-2xs flex items-center gap-1">
                        <span>📗</span>
                        <span>{configSubject4.trim()} (Môn 4)</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* KHỐI 2: THIẾT LẬP PHÒNG HỌC & THỜI ĐIỂM */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="font-black text-slate-800 uppercase text-xs flex items-center gap-2">
                  <span>🏫</span>
                  <span>THIẾT LẬP PHÒNG HỌC VÀ THỜI GIAN BIỂU</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold uppercase mb-1 text-[12px]">
                      Phòng Học Bộ Môn Mặc Định:
                    </label>
                    <input
                      type="text"
                      value={configRoom}
                      onChange={(e) => setConfigRoom(e.target.value)}
                      placeholder="Ví dụ: Phòng máy Tin học, Phòng Ngoại ngữ..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold uppercase mb-1 text-[12px]">
                      Tên Giai Đoạn / Ghi Chú Thời Điểm:
                    </label>
                    <input
                      type="text"
                      value={configPeriodName}
                      onChange={(e) => setConfigPeriodName(e.target.value)}
                      placeholder="Ví dụ: Học kì I (Từ ngày 05/9/2026)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-slate-700 font-bold uppercase mb-1 text-[12px]">
                      Số Tiết Sáng (4 hoặc 5):
                    </label>
                    <select
                      value={configMorningPeriods}
                      onChange={(e) => setConfigMorningPeriods(parseInt(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold bg-white text-slate-800"
                    >
                      <option value={4}>4 Tiết / buổi sáng</option>
                      <option value={5}>5 Tiết / buổi sáng</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold uppercase mb-1 text-[12px]">
                      Số Tiết Chiều (3 hoặc 4):
                    </label>
                    <select
                      value={configAfternoonPeriods}
                      onChange={(e) => setConfigAfternoonPeriods(parseInt(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold bg-white text-slate-800"
                    >
                      <option value={3}>3 Tiết / buổi chiều</option>
                      <option value={4}>4 Tiết / buổi chiều</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                  <div>
                    <div className="font-black text-slate-800 uppercase text-xs">Có Dạy Vào Thứ Bảy</div>
                    <div className="text-[12px] text-slate-500">Hiển thị thêm cột Thứ 7 trên bảng thời khóa biểu</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={configHasSaturday}
                    onChange={(e) => setConfigHasSaturday(e.target.checked)}
                    className="w-5 h-5 text-indigo-600 rounded-lg cursor-pointer accent-indigo-600"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  const mainSub = configSubjectName.trim().toUpperCase() || 'TIN HỌC';
                  const sub2 = configSubject2.trim().toUpperCase();
                  const sub3 = configSubject3.trim().toUpperCase();
                  const sub4 = configSubject4.trim().toUpperCase();

                  const taughtList = Array.from(new Set([mainSub, sub2, sub3, sub4].filter(Boolean))) as string[];

                  updateSubjectTeacherConfig({
                    subjectName: mainSub,
                    subject2: sub2,
                    subject3: sub3,
                    subject4: sub4,
                    taughtSubjects: taughtList.length > 0 ? taughtList : [mainSub],
                    roomDefault: configRoom.trim() || 'Phòng máy Tin học',
                    periodName: configPeriodName.trim() || 'Học kì I (Từ ngày 05/9/2026)',
                    morningPeriods: configMorningPeriods,
                    afternoonPeriods: configAfternoonPeriods,
                    hasSaturday: configHasSaturday
                  });

                  setIsConfigModalOpen(false);
                  showToast(`Đã lưu cấu hình TKB! Môn giảng dạy: ${taughtList.join(' • ')}`);
                }}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase shadow-md shadow-indigo-600/20 hover-zoom-btn transition-all"
              >
                Lưu Cấu Hình & Hoàn Tất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirm Modal */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto font-black">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-black text-slate-900 uppercase">
                Xóa Trắng Thời Khóa Biểu?
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Tất cả các tiết dạy đã xếp cho các lớp sẽ bị xóa khỏi bảng để bạn bắt đầu xếp lại từ đầu.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setIsClearConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  clearSubjectTimetable();
                  setIsClearConfirmOpen(false);
                  showToast('Đã xóa trắng thời khóa biểu!');
                }}
                className="flex-1 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase shadow-md shadow-rose-600/20"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: KHỞI TẠO LỚP DẠY BỘ MÔN (User Request: Nút lệnh hoạt động trơn tru 100%) */}
      <InitSubjectClassesModal
        isOpen={isInitSubjectClassesModalOpen}
        onClose={() => setIsInitSubjectClassesModalOpen(false)}
      />

      {/* MODAL: TẠO THỜI KHÓA BIỂU THEO MẪU */}
      <SubjectTimetableTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
      />
    </div>
  );
};
