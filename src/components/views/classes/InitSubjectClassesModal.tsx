import React, { useState } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';
import { InitSubjectClassItem } from '../../../types';
import { SAMPLE_SUBJECT_CLASSES_BY_IMAGE } from '../../../data/initialData';
import { 
  Sparkles, Plus, Trash2, X, Check, Users, School, BookOpen, 
  Layers, RefreshCw, FileText, CheckCircle2, AlertCircle, Copy, Sliders,
  Calendar, CheckSquare, Star
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playFanfareSound, playPointClink } from '../../../utils/audio';

interface InitSubjectClassesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const InitSubjectClassesModal: React.FC<InitSubjectClassesModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { 
    classes, 
    initSubjectClasses, 
    subjectTeacherConfig, 
    teacherProfile,
    setActiveClassId 
  } = useClassroom();

  const [activeTab, setActiveTab] = useState<'quick' | 'table' | 'paste'>('quick');

  // Quick setup state
  const [selectedGrades, setSelectedGrades] = useState<number[]>([3, 4, 5]);
  const [classesPerGrade, setClassesPerGrade] = useState<number>(4);
  const [namingSuffix, setNamingSuffix] = useState<'A' | 'number'>('A'); // A1, A2... or 1, 2...
  const [defaultStudentCount, setDefaultStudentCount] = useState<number>(35);
  const [defaultRoom, setDefaultRoom] = useState<string>(subjectTeacherConfig.roomDefault || 'Phòng máy Tin học');
  const [bulkApplyCount, setBulkApplyCount] = useState<number>(35);

  // Detailed items state (preview / edit table) - initialized with 18 sample classes from timetable template
  const [classItems, setClassItems] = useState<InitSubjectClassItem[]>(() => {
    return SAMPLE_SUBJECT_CLASSES_BY_IMAGE.map(c => ({
      name: c.name,
      grade: c.grade,
      studentCount: c.studentCount,
      room: subjectTeacherConfig.roomDefault || 'Phòng máy Tin học',
      teacherName: c.teacherName
    }));
  });

  // Paste text state
  const [pasteText, setPasteText] = useState<string>(
    '4A1, 35\n4A2, 34\n4A3, 35\n4A4, 32\n5A1, 36\n5A2, 35\n5A3, 34\n5A4, 33\n3A1, 30\n3A2, 31'
  );

  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Grade toggle
  const toggleGrade = (grade: number) => {
    setSelectedGrades(prev => 
      prev.includes(grade) 
        ? prev.filter(g => g !== grade)
        : [...prev, grade].sort()
    );
  };

  // Generate quick preview list
  const handleGenerateQuickList = () => {
    if (selectedGrades.length === 0) {
      setFeedbackMsg('Vui lòng chọn ít nhất 1 khối học!');
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    const generated: InitSubjectClassItem[] = [];
    selectedGrades.forEach(gradeNum => {
      for (let i = 1; i <= classesPerGrade; i++) {
        const className = namingSuffix === 'A' ? `${gradeNum}A${i}` : `${gradeNum}/${i}`;
        generated.push({
          name: className,
          grade: `Khối ${gradeNum}`,
          studentCount: defaultStudentCount,
          room: defaultRoom,
          teacherName: `GVCN Lớp ${className}`
        });
      }
    });

    setClassItems(generated);
    setActiveTab('table');
    playPointClink();
    setFeedbackMsg(`Đã tạo nhanh xem trước danh sách ${generated.length} lớp học!`);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Preset from Timetable Image (18 classes: 3A1-3A7, 4A1-4A6, 5A1-5A5)
  const handleLoadPresetFromImage = () => {
    const list = SAMPLE_SUBJECT_CLASSES_BY_IMAGE.map(c => ({
      name: c.name,
      grade: c.grade,
      studentCount: defaultStudentCount || c.studentCount || 35,
      room: defaultRoom,
      teacherName: c.teacherName
    }));
    setClassItems(list);
    setActiveTab('table');
    playPointClink();
    setFeedbackMsg(`Đã nạp thành công 18 lớp theo Thời khóa biểu mẫu (3A1–3A7, 4A1–4A6, 5A1–5A5)!`);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Bulk Apply student count to all currently listed classes
  const handleApplyBulkStudentCount = () => {
    const validCount = Math.max(5, Math.min(60, Number(bulkApplyCount) || 35));
    setClassItems(prev => prev.map(item => ({ ...item, studentCount: validCount })));
    playPointClink();
    setFeedbackMsg(`Đã đồng loạt cập nhật sĩ số ${validCount} học sinh cho tất cả ${classItems.length} lớp!`);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Preset 20 classes generator
  const handleLoadPreset20 = () => {
    const presetNames = [
      '3A1', '3A2', '3A3', '3A4',
      '4A1', '4A2', '4A3', '4A4', '4A5', '4A6',
      '5A1', '5A2', '5A3', '5A4', '5A5', '5A6',
      '2A1', '2A2', '1A1', '1A2'
    ];
    const generated: InitSubjectClassItem[] = presetNames.map(name => {
      const gNum = name.charAt(0);
      return {
        name,
        grade: `Khối ${gNum}`,
        studentCount: defaultStudentCount || 35,
        room: defaultRoom,
        teacherName: `GVCN Lớp ${name}`
      };
    });
    setClassItems(generated);
    setActiveTab('table');
    playPointClink();
    setFeedbackMsg('Đã nạp sẵn danh sách 20 lớp bộ môn!');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Parse pasted text
  const handleParsePasteText = () => {
    if (!pasteText.trim()) {
      setFeedbackMsg('Vui lòng dán danh sách lớp vào khung bên dưới!');
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed: InitSubjectClassItem[] = [];

    lines.forEach(line => {
      // Split by comma, tab, semicolon or space
      const parts = line.split(/[,;\t]/).map(p => p.trim());
      const rawName = parts[0];
      if (!rawName) return;

      let studentCount = defaultStudentCount;
      if (parts.length > 1 && !isNaN(parseInt(parts[1], 10))) {
        studentCount = parseInt(parts[1], 10);
      } else {
        // Try to find numbers in parenthesis like 4A1 (35 HS)
        const match = line.match(/\((\d+)\s*(hs|học sinh)?\)/i);
        if (match) {
          studentCount = parseInt(match[1], 10);
        }
      }

      const gradeMatch = rawName.match(/\d+/);
      const grade = gradeMatch ? `Khối ${gradeMatch[0]}` : 'Khối 4';

      parsed.push({
        name: rawName.toUpperCase().replace(/\s+/g, ''),
        grade,
        studentCount: Math.max(5, Math.min(studentCount, 60)),
        room: defaultRoom,
        teacherName: `GVCN Lớp ${rawName.toUpperCase()}`
      });
    });

    if (parsed.length === 0) {
      setFeedbackMsg('Không nhận dạng được danh sách lớp hợp lệ!');
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    setClassItems(parsed);
    setActiveTab('table');
    playPointClink();
    setFeedbackMsg(`Đã phân tích thành công ${parsed.length} lớp học từ nội dung đã dán!`);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Table row operations
  const handleUpdateItem = (index: number, field: keyof InitSubjectClassItem, value: any) => {
    setClassItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setClassItems(prev => prev.filter((_, i) => i !== index));
    playPointClink();
  };

  const handleAddNewRow = () => {
    const lastItem = classItems[classItems.length - 1];
    const newName = lastItem ? `Lớp mới` : '4A1';
    setClassItems(prev => [
      ...prev,
      {
        name: newName,
        grade: 'Khối 4',
        studentCount: defaultStudentCount,
        room: defaultRoom,
        teacherName: `GVCN ${newName}`
      }
    ]);
    playPointClink();
  };

  const handleClearAllRows = () => {
    setClassItems([]);
    playPointClink();
  };

  // Submit and create classes with students
  const handleConfirmSubmit = () => {
    if (classItems.length === 0) {
      setFeedbackMsg('Danh sách lớp đang trống. Vui lòng thêm ít nhất 1 lớp học!');
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    // Filter valid names
    const validItems = classItems.filter(item => item.name.trim().length > 0);
    if (validItems.length === 0) {
      setFeedbackMsg('Vui lòng nhập tên lớp hợp lệ!');
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    initSubjectClasses(validItems, replaceExisting);
    playFanfareSound();
    confetti({ particleCount: 80, spread: 80 });

    if (onSuccess) onSuccess();
    onClose();
  };

  const totalStudentsToGenerate = classItems.reduce((sum, item) => sum + (Number(item.studentCount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-6 py-5 text-white flex items-center justify-between shadow-md relative">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <School className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3" />
                GIÁO VIÊN BỘ MÔN {subjectTeacherConfig.subjectName || 'TIN HỌC'}
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase">
                KHỞI TẠO LỚP DẠY BỘ MÔN
              </h2>
              <p className="text-xs text-emerald-100 font-medium mt-0.5">
                Thiết lập nhanh các lớp giảng dạy bộ môn, điền thông tin lớp và số lượng học sinh mỗi lớp
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

        {/* Feedback alert if any */}
        {feedbackMsg && (
          <div className="bg-amber-500 text-amber-950 px-6 py-2.5 text-xs font-bold flex items-center justify-between animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{feedbackMsg}</span>
            </div>
            <button onClick={() => setFeedbackMsg(null)} className="text-amber-950 font-black">✕</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={`px-4 py-2.5 font-black text-xs sm:text-sm rounded-t-2xl transition-all flex items-center gap-2 border-t-2 ${
              activeTab === 'quick'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>1. TẠO THEO KHỐI & SỐ LỚP</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('table')}
            className={`px-4 py-2.5 font-black text-xs sm:text-sm rounded-t-2xl transition-all flex items-center gap-2 border-t-2 ${
              activeTab === 'table'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Users className="w-4 h-4 text-teal-600" />
            <span>2. BẢNG CHI TIẾT ({classItems.length} LỚP)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-4 py-2.5 font-black text-xs sm:text-sm rounded-t-2xl transition-all flex items-center gap-2 border-t-2 ${
              activeTab === 'paste'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Copy className="w-4 h-4 text-indigo-600" />
            <span>3. DÁN DANH SÁCH NHANH</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* TAB 1: QUICK SETUP BY GRADE */}
          {activeTab === 'quick' && (
            <div className="space-y-6">
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 text-xs text-emerald-950 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Phương thức khởi tạo nhanh chóng và tiện lợi nhất:</p>
                  <p className="text-emerald-800 mt-1">
                    Chọn các khối lớp bạn đang giảng dạy, chọn số lượng lớp mỗi khối và điền số lượng học sinh. Hệ thống sẽ lập tức tạo danh sách lớp và sinh đầy đủ học sinh theo sĩ số!
                  </p>
                </div>
              </div>

              {/* Quick Preset Buttons Bar */}
              <div className="bg-gradient-to-r from-amber-50 via-emerald-50 to-teal-50 p-4 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-black text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>NẠP NHANH CÁC LỚP BỘ MÔN THEO MẪU</span>
                  </span>
                  <p className="text-[11px] text-emerald-800 mt-0.5 font-medium">
                    Chọn nhanh danh sách lớp có sẵn theo Thời khóa biểu hoặc tự tạo theo khối tùy ý
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadPresetFromImage}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-950 font-black text-xs transition-all shadow-sm uppercase flex items-center gap-2 hover-zoom-btn"
                    title="Nạp 18 lớp tương ứng chính xác với Thời khóa biểu mẫu (3A1–3A7, 4A1–4A6, 5A1–5A5)"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-950 fill-amber-950" />
                    <span>Nạp 18 lớp theo TKB mẫu</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadPreset20}
                    className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-black text-xs transition-all uppercase flex items-center gap-1.5 hover-zoom-btn"
                    title="Nạp nhanh danh sách 20 lớp (1A1 đến 5A6)"
                  >
                    <School className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Nạp 20 lớp (1A1–5A6)</span>
                  </button>
                </div>
              </div>

              {/* 1. Grade selection */}
              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wide mb-2.5">
                  1. CHỌN CÁC KHỐI LỚP PHỤ TRÁCH GIẢNG DẠY
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(gradeNum => {
                    const isSelected = selectedGrades.includes(gradeNum);
                    return (
                      <button
                        key={gradeNum}
                        type="button"
                        onClick={() => toggleGrade(gradeNum)}
                        className={`px-4 py-2.5 rounded-2xl font-black text-xs sm:text-sm transition-all flex items-center gap-2 border-2 ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20 scale-105'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] bg-white/20">
                          {isSelected ? '✓' : ''}
                        </span>
                        <span>Khối {gradeNum}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Number of classes per grade & Naming convention */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-black text-slate-800 uppercase mb-2">
                    2. SỐ LỚP MỖI KHỐI
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={classesPerGrade}
                      onChange={e => setClassesPerGrade(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                      className="w-24 px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-emerald-700 text-base text-center focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600 font-bold">
                      ({selectedGrades.length * classesPerGrade} lớp tổng cộng)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 font-medium">
                    Ví dụ: 4 lớp mỗi khối sẽ sinh các lớp A1, A2, A3, A4
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-black text-slate-800 uppercase mb-2">
                    3. SỐ LƯỢNG HỌC SINH MỖI LỚP (SĨ SỐ)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={defaultStudentCount}
                      onChange={e => setDefaultStudentCount(Math.max(5, Math.min(60, parseInt(e.target.value) || 30)))}
                      className="w-24 px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-emerald-700 text-base text-center focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600 font-bold">học sinh / lớp</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 font-medium">
                    Tự động tạo danh sách học sinh theo đúng sĩ số này
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-black text-slate-800 uppercase mb-2">
                    4. KIỂU TÊN LỚP
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNamingSuffix('A')}
                      className={`flex-1 py-2 px-3 rounded-xl font-black text-xs border ${
                        namingSuffix === 'A'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      3A1, 4A1, 5A1...
                    </button>
                    <button
                      type="button"
                      onClick={() => setNamingSuffix('number')}
                      className={`flex-1 py-2 px-3 rounded-xl font-black text-xs border ${
                        namingSuffix === 'number'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      3/1, 4/1, 5/1...
                    </button>
                  </div>
                </div>
              </div>

              {/* Room & Quick action buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Phòng học bộ môn mặc định
                  </label>
                  <input
                    type="text"
                    value={defaultRoom}
                    onChange={e => setDefaultRoom(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Ví dụ: Phòng máy Tin học, Phòng Âm nhạc..."
                  />
                </div>

                <div className="flex items-center gap-2 pt-2 sm:pt-4">
                  <button
                    type="button"
                    onClick={handleLoadPreset20}
                    className="px-4 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-black text-xs transition-all uppercase flex items-center gap-1.5"
                    title="Nạp nhanh 20 lớp mẫu từ 3A1 đến 5A6"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    <span>Nạp 20 lớp mẫu</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateQuickList}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm transition-all shadow-md shadow-emerald-600/20 uppercase flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>Tạo danh sách xem trước</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EDITABLE TABLE OF CLASSES */}
          {activeTab === 'table' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800 uppercase flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span>DANH SÁCH LỚP DẠY BỘ MÔN ({classItems.length} LỚP – {totalStudentsToGenerate} HỌC SINH)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Bạn có thể chỉnh sửa trực tiếp tên lớp, khối, sĩ số học sinh và phòng học của từng lớp bên dưới
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadPresetFromImage}
                    className="px-3 py-1.5 bg-amber-100 text-amber-950 hover:bg-amber-200 border border-amber-300 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all uppercase"
                    title="Nạp 18 lớp theo TKB mẫu"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    <span>Nạp 18 lớp TKB mẫu</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddNewRow}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all uppercase"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm lớp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAllRows}
                    className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all uppercase"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa hết</span>
                  </button>
                </div>
              </div>

              {/* Bulk Student Count Applicator Tool */}
              <div className="bg-emerald-50/80 border border-emerald-200 p-3 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="font-black text-emerald-950 uppercase">
                    Áp dụng nhanh số lượng học sinh (sĩ số) cho tất cả các lớp:
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={bulkApplyCount}
                    onChange={e => setBulkApplyCount(Math.max(5, Math.min(60, parseInt(e.target.value) || 30)))}
                    className="w-16 px-2 py-1.5 bg-white border border-emerald-300 rounded-xl font-black text-emerald-800 text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-emerald-900 font-bold">học sinh / lớp</span>
                  <button
                    type="button"
                    onClick={handleApplyBulkStudentCount}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all shadow-xs uppercase flex items-center gap-1 hover-zoom-btn"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Áp dụng toàn bộ</span>
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left border-collapse min-w-[620px]">
                    <thead className="bg-slate-100 text-slate-700 text-xs font-black uppercase sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">STT</th>
                        <th className="py-2.5 px-3 w-32">Tên lớp</th>
                        <th className="py-2.5 px-3 w-28">Khối học</th>
                        <th className="py-2.5 px-3 w-36 text-center">Sĩ số học sinh</th>
                        <th className="py-2.5 px-3">Phòng học bộ môn</th>
                        <th className="py-2.5 px-3 w-16 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {classItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            <School className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                            <p className="font-bold">Chưa có lớp nào trong danh sách!</p>
                            <p className="text-xs mt-1">Bấm nút "Tạo theo khối" hoặc "+ Thêm lớp" để bắt đầu.</p>
                          </td>
                        </tr>
                      ) : (
                        classItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2 px-3 text-center font-bold text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={item.name}
                                onChange={e => handleUpdateItem(idx, 'name', e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                                placeholder="Tên lớp (4A1)"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={item.grade || 'Khối 4'}
                                onChange={e => handleUpdateItem(idx, 'grade', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => (
                                  <option key={g} value={`Khối ${g}`}>Khối {g}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItem(idx, 'studentCount', Math.max(5, item.studentCount - 1))}
                                  className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-black flex items-center justify-center text-sm"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={5}
                                  max={60}
                                  value={item.studentCount}
                                  onChange={e => handleUpdateItem(idx, 'studentCount', Math.max(5, Math.min(60, parseInt(e.target.value) || 30)))}
                                  className="w-14 px-1.5 py-1 text-center bg-white border border-slate-300 rounded-lg font-black text-emerald-700 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItem(idx, 'studentCount', Math.min(60, item.studentCount + 1))}
                                  className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-black flex items-center justify-center text-sm"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={item.room || ''}
                                onChange={e => handleUpdateItem(idx, 'room', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                                placeholder="Phòng máy Tin học"
                              />
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Xóa lớp này"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PASTE TEXT */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-950">
                <p className="font-bold flex items-center gap-1.5">
                  <Copy className="w-4 h-4 text-indigo-600" />
                  <span>Dán danh sách lớp và sĩ số từ Excel hoặc Word:</span>
                </p>
                <p className="text-indigo-800 mt-1">
                  Mỗi dòng là một lớp. Định dạng hỗ trợ: <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-indigo-900">Tên lớp, Sĩ số</code> hoặc chỉ cần danh sách tên lớp cách nhau bằng dòng/phẩy.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase mb-2">
                  Dán nội dung danh sách lớp vào đây:
                </label>
                <textarea
                  rows={8}
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-300 rounded-2xl font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Ví dụ:&#10;4A1, 35&#10;4A2, 34&#10;5A1, 36&#10;5A2, 35"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePasteText}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-indigo-600/20 uppercase flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Phân tích & Nạp vào bảng</span>
                </button>
              </div>
            </div>
          )}

          {/* Creation Options & Summary Footer Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="radio"
                    name="replace_mode"
                    checked={!replaceExisting}
                    onChange={() => setReplaceExisting(false)}
                    className="text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>Thêm nối tiếp vào danh sách lớp hiện có (Giữ lại {classes.length} lớp cũ)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="radio"
                    name="replace_mode"
                    checked={replaceExisting}
                    onChange={() => setReplaceExisting(true)}
                    className="text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  <span className="text-rose-700">Khởi tạo mới lại từ đầu (Thay thế danh sách)</span>
                </label>
              </div>

              <div className="flex items-center gap-4 font-black uppercase text-[11px] text-slate-700">
                <span className="bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-lg">
                  {classItems.length} Lớp học
                </span>
                <span className="bg-teal-100 text-teal-900 px-2.5 py-1 rounded-lg">
                  {totalStudentsToGenerate} Học sinh
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer Controls */}
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
              onClick={handleConfirmSubmit}
              disabled={classItems.length === 0}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 text-white font-black text-xs sm:text-sm uppercase tracking-wide flex items-center gap-2.5 shadow-lg shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
              <span>XÁC NHẬN KHỞI TẠO LỚP DẠY BỘ MÔN</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
