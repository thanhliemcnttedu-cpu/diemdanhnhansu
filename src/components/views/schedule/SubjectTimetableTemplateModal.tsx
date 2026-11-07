import React, { useState, useMemo } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';
import { SubjectTimetableSlot } from '../../../types';
import { 
  SAMPLE_SUBJECT_TIMETABLE_BY_IMAGE, 
  SAMPLE_SUBJECT_CLASSES_BY_IMAGE 
} from '../../../data/initialData';
import { 
  Calendar, Clock, Sparkles, Check, X, ArrowRight, 
  RotateCcw, Sliders, Layers, School, CheckCircle2, 
  AlertCircle, BookOpen, Sun, Moon, Info, Star, Award
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playFanfareSound, playPointClink } from '../../../utils/audio';

interface SubjectTimetableTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type TemplateType = 'template_by_image' | 'standard_20' | 'morning_only' | 'afternoon_only' | 'double_periods' | 'smart_auto';

export const SubjectTimetableTemplateModal: React.FC<SubjectTimetableTemplateModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { 
    classes, 
    subjectTeacherConfig, 
    applySubjectTimetableSlots, 
    initSubjectClasses,
    subjectTimetable,
    teacherProfile
  } = useClassroom();

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('template_by_image');
  const [selectedClassesForSchedule, setSelectedClassesForSchedule] = useState<string[]>(() => 
    classes.map(c => c.name)
  );
  const [autoCreateClasses, setAutoCreateClasses] = useState<boolean>(true);
  const [periodsPerClass, setPeriodsPerClass] = useState<number>(1);
  const [sessionPreference, setSessionPreference] = useState<'both' | 'morning' | 'afternoon'>('both');
  const [previewSlots, setPreviewSlots] = useState<SubjectTimetableSlot[]>([]);
  const [activeTab, setActiveTab] = useState<'templates' | 'preview'>('templates');

  const subjectName = subjectTeacherConfig.subjectName || 'Tin học';
  const defaultRoom = subjectTeacherConfig.roomDefault || 'Phòng máy Tin học';

  // Toggle class selection for smart scheduling
  const toggleClassSelect = (className: string) => {
    setSelectedClassesForSchedule(prev => 
      prev.includes(className)
        ? prev.filter(c => c !== className)
        : [...prev, className]
    );
  };

  const selectAllClasses = () => {
    setSelectedClassesForSchedule(classes.map(c => c.name));
  };

  const deselectAllClasses = () => {
    setSelectedClassesForSchedule([]);
  };

  // Helper generator function for different templates
  const generateSlotsForTemplate = (template: TemplateType): SubjectTimetableSlot[] => {
    if (template === 'template_by_image') {
      return SAMPLE_SUBJECT_TIMETABLE_BY_IMAGE.map(s => {
        const matchedClass = classes.find(c => c.name.toLowerCase() === s.className.toLowerCase());
        return {
          ...s,
          classId: matchedClass?.id || s.classId,
          subject: subjectTeacherConfig.subjectName || 'Tin học',
          room: defaultRoom || s.room
        };
      });
    }

    const classList = classes.length > 0 ? classes.map(c => c.name) : [
      '4A1', '4A2', '5A1', '5A2', '3A1', '3A2',
      '4A3', '4A4', '5A3', '5A4', '3A3', '3A4',
      '4A5', '4A6', '5A5', '5A6', '2A1', '2A2', '1A1', '1A2'
    ];

    const slots: SubjectTimetableSlot[] = [];

    if (template === 'standard_20') {
      // 20 periods spread over Mon-Fri: Morning 1-4, Afternoon 1-2
      const schedulePattern = [
        { day: 2, session: 'morning' as const, period: 1 },
        { day: 2, session: 'morning' as const, period: 2 },
        { day: 2, session: 'morning' as const, period: 3 },
        { day: 2, session: 'morning' as const, period: 4 },
        { day: 2, session: 'afternoon' as const, period: 1 },
        { day: 2, session: 'afternoon' as const, period: 2 },

        { day: 3, session: 'morning' as const, period: 1 },
        { day: 3, session: 'morning' as const, period: 2 },
        { day: 3, session: 'morning' as const, period: 3 },
        { day: 3, session: 'morning' as const, period: 4 },
        { day: 3, session: 'afternoon' as const, period: 1 },
        { day: 3, session: 'afternoon' as const, period: 2 },

        { day: 4, session: 'morning' as const, period: 1 },
        { day: 4, session: 'morning' as const, period: 2 },
        { day: 4, session: 'morning' as const, period: 3 },
        { day: 4, session: 'morning' as const, period: 4 },
        { day: 4, session: 'afternoon' as const, period: 1 },
        { day: 4, session: 'afternoon' as const, period: 2 },

        { day: 5, session: 'morning' as const, period: 1 },
        { day: 5, session: 'morning' as const, period: 2 },
        { day: 5, session: 'morning' as const, period: 3 },
        { day: 5, session: 'morning' as const, period: 4 },

        { day: 6, session: 'morning' as const, period: 1 },
        { day: 6, session: 'morning' as const, period: 2 },
        { day: 6, session: 'morning' as const, period: 3 },
        { day: 6, session: 'morning' as const, period: 4 },
      ];

      schedulePattern.forEach((pos, idx) => {
        if (idx < classList.length) {
          const cName = classList[idx];
          const matchedClass = classes.find(c => c.name === cName);
          const cId = matchedClass?.id || `class-${cName.toLowerCase()}`;
          slots.push({
            id: `sbj-slot-tmpl-${pos.day}-${pos.session}-${pos.period}-${idx}`,
            day: pos.day,
            session: pos.session,
            period: pos.period,
            classId: cId,
            className: cName,
            subject: subjectName,
            room: defaultRoom,
            note: `Lịch giảng dạy môn ${subjectName} lớp ${cName}`,
            scope: subjectTeacherConfig.scheduleScope,
            periodName: subjectTeacherConfig.periodName
          });
        }
      });
    } else if (template === 'morning_only') {
      // 4 periods every morning Mon to Fri (20 periods total)
      let classIdx = 0;
      for (let day = 2; day <= 6; day++) {
        for (let period = 1; period <= 4; period++) {
          if (classIdx < classList.length) {
            const cName = classList[classIdx];
            const matchedClass = classes.find(c => c.name === cName);
            const cId = matchedClass?.id || `class-${cName.toLowerCase()}`;
            slots.push({
              id: `sbj-slot-tmpl-${day}-morning-${period}-${classIdx}`,
              day,
              session: 'morning',
              period,
              classId: cId,
              className: cName,
              subject: subjectName,
              room: defaultRoom,
              note: `Tiết ${period} buổi sáng - Lớp ${cName}`,
              scope: subjectTeacherConfig.scheduleScope,
              periodName: subjectTeacherConfig.periodName
            });
            classIdx++;
          }
        }
      }
    } else if (template === 'afternoon_only') {
      // Afternoon periods Mon to Fri (Tiết 1-4)
      let classIdx = 0;
      for (let day = 2; day <= 6; day++) {
        for (let period = 1; period <= 4; period++) {
          if (classIdx < classList.length) {
            const cName = classList[classIdx];
            const matchedClass = classes.find(c => c.name === cName);
            const cId = matchedClass?.id || `class-${cName.toLowerCase()}`;
            slots.push({
              id: `sbj-slot-tmpl-${day}-afternoon-${period}-${classIdx}`,
              day,
              session: 'afternoon',
              period,
              classId: cId,
              className: cName,
              subject: subjectName,
              room: defaultRoom,
              note: `Tiết ${period} buổi chiều - Lớp ${cName}`,
              scope: subjectTeacherConfig.scheduleScope,
              periodName: subjectTeacherConfig.periodName
            });
            classIdx++;
          }
        }
      }
    } else if (template === 'double_periods') {
      // 2 consecutive periods per class (e.g. Periods 1-2 or 3-4)
      const blocks = [
        { day: 2, session: 'morning' as const, p1: 1, p2: 2 },
        { day: 2, session: 'morning' as const, p1: 3, p2: 4 },
        { day: 2, session: 'afternoon' as const, p1: 1, p2: 2 },
        { day: 3, session: 'morning' as const, p1: 1, p2: 2 },
        { day: 3, session: 'morning' as const, p1: 3, p2: 4 },
        { day: 3, session: 'afternoon' as const, p1: 1, p2: 2 },
        { day: 4, session: 'morning' as const, p1: 1, p2: 2 },
        { day: 4, session: 'morning' as const, p1: 3, p2: 4 },
        { day: 4, session: 'afternoon' as const, p1: 1, p2: 2 },
        { day: 5, session: 'morning' as const, p1: 1, p2: 2 },
        { day: 5, session: 'morning' as const, p1: 3, p2: 4 },
        { day: 6, session: 'morning' as const, p1: 1, p2: 2 },
        { day: 6, session: 'morning' as const, p1: 3, p2: 4 }
      ];

      blocks.forEach((blk, idx) => {
        if (idx < classList.length) {
          const cName = classList[idx];
          const matchedClass = classes.find(c => c.name === cName);
          const cId = matchedClass?.id || `class-${cName.toLowerCase()}`;

          slots.push({
            id: `sbj-slot-tmpl-${blk.day}-${blk.session}-${blk.p1}-${idx}`,
            day: blk.day,
            session: blk.session,
            period: blk.p1,
            classId: cId,
            className: cName,
            subject: subjectName,
            room: defaultRoom,
            note: `Thực hành máy tính (Tiết 1/2) - Lớp ${cName}`,
            scope: subjectTeacherConfig.scheduleScope,
            periodName: subjectTeacherConfig.periodName
          });

          slots.push({
            id: `sbj-slot-tmpl-${blk.day}-${blk.session}-${blk.p2}-${idx}`,
            day: blk.day,
            session: blk.session,
            period: blk.p2,
            classId: cId,
            className: cName,
            subject: subjectName,
            room: defaultRoom,
            note: `Thực hành máy tính (Tiết 2/2) - Lớp ${cName}`,
            scope: subjectTeacherConfig.scheduleScope,
            periodName: subjectTeacherConfig.periodName
          });
        }
      });
    } else if (template === 'smart_auto') {
      // Smart algorithm distribution based on selectedClassesForSchedule
      const activeList = selectedClassesForSchedule.length > 0 
        ? selectedClassesForSchedule 
        : classList;

      // Available slot coordinates based on sessionPreference
      const availableGrid: { day: number; session: 'morning' | 'afternoon'; period: number }[] = [];
      const days = [2, 3, 4, 5, 6];
      if (subjectTeacherConfig.hasSaturday) days.push(7);

      days.forEach(day => {
        if (sessionPreference === 'both' || sessionPreference === 'morning') {
          for (let p = 1; p <= 4; p++) {
            availableGrid.push({ day, session: 'morning', period: p });
          }
        }
        if (sessionPreference === 'both' || sessionPreference === 'afternoon') {
          for (let p = 1; p <= 3; p++) {
            availableGrid.push({ day, session: 'afternoon', period: p });
          }
        }
      });

      let gridIdx = 0;
      activeList.forEach((cName, cIdx) => {
        const times = periodsPerClass;
        for (let t = 0; t < times; t++) {
          if (gridIdx < availableGrid.length) {
            const coord = availableGrid[gridIdx];
            const matchedClass = classes.find(c => c.name === cName);
            const cId = matchedClass?.id || `class-${cName.toLowerCase()}`;

            slots.push({
              id: `sbj-slot-auto-${coord.day}-${coord.session}-${coord.period}-${cIdx}-${t}`,
              day: coord.day,
              session: coord.session,
              period: coord.period,
              classId: cId,
              className: cName,
              subject: subjectName,
              room: defaultRoom,
              note: `Lịch giảng dạy môn ${subjectName} lớp ${cName}`,
              scope: subjectTeacherConfig.scheduleScope,
              periodName: subjectTeacherConfig.periodName
            });
            gridIdx++;
          }
        }
      });
    }

    return slots;
  };

  // Keep preview updated when template changes
  React.useEffect(() => {
    if (isOpen) {
      const generated = generateSlotsForTemplate(selectedTemplate);
      setPreviewSlots(generated);
    }
  }, [isOpen, selectedTemplate, selectedClassesForSchedule, periodsPerClass, sessionPreference]);

  if (!isOpen) return null;

  const handleApplyTemplate = () => {
    if (previewSlots.length === 0) {
      alert('Chưa có tiết học nào được tạo trong thời khóa biểu mẫu!');
      return;
    }

    applySubjectTimetableSlots(previewSlots);

    if (selectedTemplate === 'template_by_image' && autoCreateClasses) {
      initSubjectClasses(SAMPLE_SUBJECT_CLASSES_BY_IMAGE, false);
    }

    playFanfareSound();
    confetti({ particleCount: 70, spread: 70 });

    if (onSuccess) onSuccess();
    onClose();
  };

  const DAY_NAMES = [
    { day: 2, label: 'Thứ Hai', short: 'T2' },
    { day: 3, label: 'Thứ Ba', short: 'T3' },
    { day: 4, label: 'Thứ Tư', short: 'T4' },
    { day: 5, label: 'Thứ Năm', short: 'T5' },
    { day: 6, label: 'Thứ Sáu', short: 'T6' },
    ...(subjectTeacherConfig.hasSaturday ? [{ day: 7, label: 'Thứ Bảy', short: 'T7' }] : [])
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 px-6 py-5 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <Calendar className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3" />
                MÔN {subjectName}
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase">
                TẠO THỜI KHÓA BIỂU THEO MẪU
              </h2>
              <p className="text-xs text-blue-100 font-medium mt-0.5">
                Tự động phân bổ lịch giảng dạy khoa học cho các lớp bộ môn theo mẫu chuẩn
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors border border-white/20"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2.5 font-black text-xs sm:text-sm rounded-t-2xl transition-all flex items-center gap-2 border-t-2 ${
              activeTab === 'templates'
                ? 'bg-white text-indigo-700 border-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>1. CHỌN MẪU THỜI KHÓA BIỂU</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2.5 font-black text-xs sm:text-sm rounded-t-2xl transition-all flex items-center gap-2 border-t-2 ${
              activeTab === 'preview'
                ? 'bg-white text-indigo-700 border-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span>2. XEM TRƯỚC LỊCH DẠY ({previewSlots.length} TIẾT)</span>
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {activeTab === 'templates' ? (
            <div className="space-y-6">

              {/* Template card options */}
              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wide mb-3">
                  CÁC MẪU THỜI KHÓA BIỂU CHUYÊN DỤNG CHO GIÁO VIÊN BỘ MÔN:
                </label>

                {/* FEATURED: Template By Image (18 periods of Tin học) */}
                <div
                  onClick={() => {
                    setSelectedTemplate('template_by_image');
                    playPointClink();
                  }}
                  className={`p-4 sm:p-5 rounded-2xl border-2 cursor-pointer transition-all mb-4 relative overflow-hidden ${
                    selectedTemplate === 'template_by_image'
                      ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-emerald-600 shadow-lg shadow-emerald-600/15 ring-2 ring-emerald-400/25'
                      : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-black text-lg shadow-md shrink-0">
                        <Star className="w-6 h-6 text-amber-300 fill-amber-300" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-[10px] uppercase tracking-wider">
                            ★ MẪU THỰC TẾ CHUẨN THEO ẢNH
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10px] uppercase">
                            18 TIẾT / TUẦN (18 LỚP BỘ MÔN)
                          </span>
                        </div>
                        <h4 className="text-sm sm:text-base font-black text-slate-900 uppercase">
                          MẪU THỜI KHÓA BIỂU GIẢNG DẠY (THEO ẢNH ĐÍNH KÈM)
                        </h4>
                        <p className="text-xs text-slate-600 font-medium mt-1">
                          Áp dụng mẫu TKB giảng dạy môn <strong>Tin học</strong> của thầy <strong>Nguyễn Thanh Liêm</strong> (Học kì I - Thực hiện từ 05/9/2026):
                        </p>
                      </div>
                    </div>

                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selectedTemplate === 'template_by_image' ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs' : 'border-slate-300'
                    }`}>
                      {selectedTemplate === 'template_by_image' && '✓'}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-bold">
                    <div className="bg-white/80 p-2 rounded-xl border border-emerald-200">
                      <span className="text-slate-500 block text-[10px]">THỨ HAI (6 tiết):</span>
                      <span className="text-emerald-800 font-black">4A1 → 4A6</span>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl border border-emerald-200">
                      <span className="text-slate-500 block text-[10px]">THỨ BA (7 tiết):</span>
                      <span className="text-emerald-800 font-black">3A1 → 3A7</span>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl border border-emerald-200">
                      <span className="text-slate-500 block text-[10px]">THỨ TƯ (4 tiết):</span>
                      <span className="text-emerald-800 font-black">5A1 → 5A4</span>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl border border-emerald-200">
                      <span className="text-slate-500 block text-[10px]">THỨ SÁU (1 tiết):</span>
                      <span className="text-emerald-800 font-black">5A5</span>
                    </div>
                  </div>

                  {selectedTemplate === 'template_by_image' && (
                    <div className="mt-3 pt-3 border-t border-emerald-200/80 flex items-center gap-2 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-950">
                        <input
                          type="checkbox"
                          checked={autoCreateClasses}
                          onChange={e => setAutoCreateClasses(e.target.checked)}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                        />
                        <span>Tự động khởi tạo đầy đủ 18 lớp học tương ứng (3A1–3A7, 4A1–4A6, 5A1–5A5) nếu chưa có</span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Template 1 */}
                  <div
                    onClick={() => {
                      setSelectedTemplate('standard_20');
                      playPointClink();
                    }}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      selectedTemplate === 'standard_20'
                        ? 'bg-indigo-50/70 border-indigo-600 shadow-md shadow-indigo-600/10 ring-2 ring-indigo-400/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm">
                          1
                        </span>
                        <div>
                          <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                            Mẫu Phân Bổ Chuẩn (20 Tiết / Tuần)
                          </h4>
                          <span className="text-[10px] font-bold text-indigo-700 uppercase bg-indigo-100 px-2 py-0.5 rounded">
                            Khuyên Dùng Phổ Biến
                          </span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedTemplate === 'standard_20' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                      }`}>
                        {selectedTemplate === 'standard_20' && '✓'}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">
                      Phân bổ đều 4 tiết sáng (T2-T6) và các tiết chiều một cách hài hòa cho 20 lớp học. Không bị dồn ca hay quá tải.
                    </p>
                  </div>

                  {/* Template 2 */}
                  <div
                    onClick={() => {
                      setSelectedTemplate('morning_only');
                      playPointClink();
                    }}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      selectedTemplate === 'morning_only'
                        ? 'bg-amber-50/70 border-amber-600 shadow-md shadow-amber-600/10 ring-2 ring-amber-400/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-sm">
                          <Sun className="w-4 h-4" />
                        </span>
                        <div>
                          <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                            Mẫu Chuyên Dạy Ca Sáng
                          </h4>
                          <span className="text-[10px] font-bold text-amber-800 uppercase bg-amber-100 px-2 py-0.5 rounded">
                            Tiết 1 – 4 Sáng (T2 - T6)
                          </span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedTemplate === 'morning_only' ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300'
                      }`}>
                        {selectedTemplate === 'morning_only' && '✓'}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">
                      Dành riêng cho giáo viên chỉ dạy buổi sáng. Mỗi sáng đúng 4 tiết cho 4 lớp khác nhau (tổng 20 tiết sáng).
                    </p>
                  </div>

                  {/* Template 3 */}
                  <div
                    onClick={() => {
                      setSelectedTemplate('double_periods');
                      playPointClink();
                    }}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      selectedTemplate === 'double_periods'
                        ? 'bg-emerald-50/70 border-emerald-600 shadow-md shadow-emerald-600/10 ring-2 ring-emerald-400/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-sm">
                          2x
                        </span>
                        <div>
                          <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                            Mẫu 2 Tiết Liền / Lớp
                          </h4>
                          <span className="text-[10px] font-bold text-emerald-800 uppercase bg-emerald-100 px-2 py-0.5 rounded">
                            Thực Hành Phòng Máy
                          </span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedTemplate === 'double_periods' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
                      }`}>
                        {selectedTemplate === 'double_periods' && '✓'}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">
                      Mỗi lớp học 2 tiết liền nhau (Tiết 1-2 hoặc Tiết 3-4) giúp học sinh làm bài tập thực hành liên tục và hoàn thiện sản phẩm.
                    </p>
                  </div>

                  {/* Template 4 */}
                  <div
                    onClick={() => {
                      setSelectedTemplate('smart_auto');
                      playPointClink();
                    }}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      selectedTemplate === 'smart_auto'
                        ? 'bg-purple-50/70 border-purple-600 shadow-md shadow-purple-600/10 ring-2 ring-purple-400/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black text-sm">
                          <Sparkles className="w-4 h-4" />
                        </span>
                        <div>
                          <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                            Tự Động Thông Minh Tùy Biến
                          </h4>
                          <span className="text-[10px] font-bold text-purple-800 uppercase bg-purple-100 px-2 py-0.5 rounded">
                            Tùy Chọn Theo Lớp
                          </span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedTemplate === 'smart_auto' ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300'
                      }`}>
                        {selectedTemplate === 'smart_auto' && '✓'}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 font-medium">
                      Tự động xếp lịch dựa theo danh sách lớp cụ thể bạn chọn, số tiết mỗi lớp và ca dạy ưu tiên (Sáng / Chiều).
                    </p>
                  </div>
                </div>
              </div>

              {/* Additional Options for smart_auto */}
              {selectedTemplate === 'smart_auto' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-4 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <span className="text-xs font-black text-slate-800 uppercase">
                      CHỌN CÁC LỚP THAM GIA XẾP LỊCH ({selectedClassesForSchedule.length} / {classes.length} LỚP):
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllClasses}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllClasses}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                    {classes.map(c => {
                      const isChecked = selectedClassesForSchedule.includes(c.name);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleClassSelect(c.name)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                            isChecked
                              ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {isChecked ? '✓ ' : ''}{c.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Số tiết / tuần mỗi lớp
                      </label>
                      <select
                        value={periodsPerClass}
                        onChange={e => setPeriodsPerClass(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                      >
                        <option value={1}>1 tiết / lớp / tuần</option>
                        <option value={2}>2 tiết / lớp / tuần</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Ca học ưu tiên
                      </label>
                      <select
                        value={sessionPreference}
                        onChange={e => setSessionPreference(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                      >
                        <option value="both">Cả ngày (Sáng & Chiều)</option>
                        <option value="morning">Chỉ buổi Sáng</option>
                        <option value="afternoon">Chỉ buổi Chiều</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Fast Preview Banner */}
              <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
                    {previewSlots.length}
                  </div>
                  <div>
                    <p className="font-black text-emerald-950 uppercase">
                      ĐÃ PHÂN BỔ {previewSlots.length} TIẾT DẠY CHO MÔN {subjectName}
                    </p>
                    <p className="text-emerald-800 mt-0.5">
                      Bấm vào tab "Xem trước lịch dạy" để duyệt bảng thời khóa biểu trực quan trước khi xác nhận.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <span>Xem trước</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          ) : (
            /* TAB 2: PREVIEW TIMETABLE MATRIX */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase">
                    BẢNG XEM TRƯỚC THỜI KHÓA BIỂU DẠY BỘ MÔN ({previewSlots.length} TIẾT)
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">
                    Mẫu đã chọn: {selectedTemplate === 'standard_20' ? 'Chuẩn 20 tiết' : selectedTemplate === 'morning_only' ? 'Chuyên ca sáng' : selectedTemplate === 'double_periods' ? '2 tiết liền / lớp' : 'Tự động thông minh'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('templates')}
                  className="text-xs text-indigo-700 font-bold hover:underline"
                >
                  ← Đổi mẫu khác
                </button>
              </div>

              {/* Matrix Preview Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead className="bg-slate-100 text-slate-700 text-xs font-black uppercase sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-20 text-center border-r border-slate-200">Buổi / Tiết</th>
                        {DAY_NAMES.map(d => (
                          <th key={d.day} className="py-2.5 px-2 text-center border-r border-slate-200 last:border-r-0">
                            {d.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {/* Morning periods 1-4 */}
                      {[1, 2, 3, 4].map(period => (
                        <tr key={`m-${period}`} className="hover:bg-slate-50/60">
                          <td className="py-2 px-2 text-center font-black bg-blue-50/50 text-blue-900 border-r border-slate-200">
                            Sáng T.{period}
                          </td>
                          {DAY_NAMES.map(d => {
                            const slot = previewSlots.find(s => s.day === d.day && s.session === 'morning' && s.period === period);
                            return (
                              <td key={d.day} className="py-1.5 px-2 text-center border-r border-slate-200 last:border-r-0">
                                {slot ? (
                                  <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-1.5 text-center shadow-2xs">
                                    <span className="block font-black text-emerald-950 text-xs">
                                      {slot.className}
                                    </span>
                                    <span className="block text-[9px] text-emerald-700 font-bold truncate">
                                      {slot.room || defaultRoom}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-bold text-xs">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Afternoon periods 1-3 */}
                      {[1, 2, 3].map(period => (
                        <tr key={`a-${period}`} className="hover:bg-slate-50/60">
                          <td className="py-2 px-2 text-center font-black bg-amber-50/50 text-amber-900 border-r border-slate-200">
                            Chiều T.{period}
                          </td>
                          {DAY_NAMES.map(d => {
                            const slot = previewSlots.find(s => s.day === d.day && s.session === 'afternoon' && s.period === period);
                            return (
                              <td key={d.day} className="py-1.5 px-2 text-center border-r border-slate-200 last:border-r-0">
                                {slot ? (
                                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-1.5 text-center shadow-2xs">
                                    <span className="block font-black text-amber-950 text-xs">
                                      {slot.className}
                                    </span>
                                    <span className="block text-[9px] text-amber-700 font-bold truncate">
                                      {slot.room || defaultRoom}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-bold text-xs">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm border border-slate-300 transition-colors"
          >
            Đóng / Hủy bỏ
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleApplyTemplate}
              disabled={previewSlots.length === 0}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 hover:from-blue-800 hover:to-purple-800 text-white font-black text-xs sm:text-sm uppercase tracking-wide flex items-center gap-2.5 shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
              <span>ÁP DỤNG THỜI KHÓA BIỂU NÀY</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
