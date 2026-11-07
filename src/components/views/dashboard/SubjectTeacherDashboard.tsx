import React, { useState } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';
import { 
  Calendar, Clock, Users, School, Star, Sparkles, 
  Trophy, ArrowUpRight, Plus, CheckSquare, Gift, 
  Volume2, Timer, BookOpen, ChevronRight, MapPin, 
  Check, ArrowRight, RotateCcw, Award, User
} from 'lucide-react';
import { playPointClink, playFanfareSound } from '../../../utils/audio';
import confetti from 'canvas-confetti';
import { APP_AUTHOR_INFO } from '../../../data/initialData';
import { InitSubjectClassesModal } from '../classes/InitSubjectClassesModal';

interface SubjectTeacherDashboardProps {
  onNavigate: (viewId: any) => void;
  onOpenAddStudent?: () => void;
}

const DAYS_MAP = [
  { day: 2, label: 'Thứ Hai', short: 'T2' },
  { day: 3, label: 'Thứ Ba', short: 'T3' },
  { day: 4, label: 'Thứ Tư', short: 'T4' },
  { day: 5, label: 'Thứ Năm', short: 'T5' },
  { day: 6, label: 'Thứ Sáu', short: 'T6' },
  { day: 7, label: 'Thứ Bảy', short: 'T7' }
];

export const SubjectTeacherDashboard: React.FC<SubjectTeacherDashboardProps> = ({ 
  onNavigate,
  onOpenAddStudent 
}) => {
  const { 
    classes, activeClassId, setActiveClassId, students, 
    subjectTeacherConfig, subjectTimetable, awardPoints,
    teacherProfile, seedSample20SubjectClasses
  } = useClassroom();

  const subjectName = subjectTeacherConfig.subjectName || 'TIN HỌC';

  // Greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Chào buổi sáng';
    if (hour < 14) return 'Chào buổi trưa';
    if (hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  };

  // Determine today's day of week
  const rawDayOfWeek = new Date().getDay() + 1; // 2 = Mon, 3 = Tue...
  const todayDayOfWeek = (rawDayOfWeek >= 2 && rawDayOfWeek <= 7) ? rawDayOfWeek : 2;

  // Selected day for timetable on dashboard (default today)
  const [selectedDashboardDay, setSelectedDashboardDay] = useState<number>(todayDayOfWeek);
  
  // Selected class for quick star/coin award on dashboard
  const [quickAwardClassId, setQuickAwardClassId] = useState<string>(activeClassId || (classes[0]?.id || ''));
  const [quickSearchTerm, setQuickSearchTerm] = useState('');
  const [awardFeedbackToast, setAwardFeedbackToast] = useState<string | null>(null);
  const [isInitClassesOpen, setIsInitClassesOpen] = useState(false);

  // Sync if activeClassId changes
  React.useEffect(() => {
    if (activeClassId) {
      setQuickAwardClassId(activeClassId);
    }
  }, [activeClassId]);

  // Timetable slots for the selected day
  const displayedDaySlots = subjectTimetable
    .filter(s => s.day === selectedDashboardDay)
    .sort((a, b) => {
      if (a.session === b.session) return a.period - b.period;
      return a.session === 'morning' ? -1 : 1;
    });

  // Calculate statistics for Subject Teacher
  const totalSubjectWeeklySlots = subjectTimetable.length;
  const totalStudents = students.length;
  const totalSubjectCoins = students.reduce((acc, s) => {
    return acc + (s.subjectPoints?.[subjectName] || 0);
  }, 0);
  const avgSubjectCoins = totalStudents > 0 ? (totalSubjectCoins / totalStudents).toFixed(1) : '0';

  // Classes ranking in this subject
  const classesRanking = classes.map(cls => {
    const clsStudents = students.filter(s => s.classId === cls.id);
    const sumCoins = clsStudents.reduce((acc, st) => acc + (st.subjectPoints?.[subjectName] || 0), 0);
    const avg = clsStudents.length > 0 ? (sumCoins / clsStudents.length).toFixed(1) : '0';
    const topSt = [...clsStudents].sort((a, b) => {
      const pB = b.subjectPoints?.[subjectName] || 0;
      const pA = a.subjectPoints?.[subjectName] || 0;
      return pB - pA;
    })[0];

    return {
      ...cls,
      studentCount: clsStudents.length,
      totalCoins: sumCoins,
      avgCoins: avg,
      topStudent: topSt ? {
        name: topSt.name,
        coins: topSt.subjectPoints?.[subjectName] || 0,
        avatar: topSt.avatar
      } : null
    };
  }).sort((a, b) => b.totalCoins - a.totalCoins);

  // Quick awarding students list
  const selectedQuickClass = classes.find(c => c.id === quickAwardClassId) || classes[0];
  const quickStudentsList = students.filter(s => s.classId === quickAwardClassId);

  const handleQuickAward = (studentId: string, studentName: string, amount: number) => {
    const reason = amount > 0 
      ? `Thưởng +${amount} sao phát biểu tích cực môn ${subjectName}`
      : `Trừ ${Math.abs(amount)} sao nhắc nhở giờ ${subjectName}`;
    awardPoints([studentId], amount, reason, subjectName);
    playPointClink();
    confetti({ particleCount: 25, spread: 45, origin: { y: 0.6 } });

    setAwardFeedbackToast(`Đã tặng ${amount > 0 ? `+${amount}` : amount} sao cho em ${studentName}`);
    setTimeout(() => setAwardFeedbackToast(null), 2500);
  };

  const handleJumpToClass = (classId: string) => {
    setActiveClassId(classId);
    onNavigate('students');
  };

  const morningTimes = ['07:15 - 07:55', '08:00 - 08:40', '09:00 - 09:40', '09:45 - 10:25', '10:30 - 11:10'];
  const afternoonTimes = ['13:45 - 14:25', '14:30 - 15:10', '15:25 - 16:05', '16:10 - 16:50'];

  return (
    <div className="p-2.5 sm:p-3.5 md:p-4 max-w-7xl mx-auto space-y-2.5 sm:space-y-3">
      {/* Toast Alert */}
      {awardFeedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-3.5 py-2 rounded-xl shadow-2xl border border-slate-700 text-xs font-black flex items-center gap-2 animate-in fade-in duration-150">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          <span>{awardFeedbackToast}</span>
        </div>
      )}

      {/* 1. Main Welcome Banner for Subject Teacher */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-100 via-teal-50 to-indigo-100 p-2.5 sm:p-3 px-3 sm:px-4 border border-emerald-200/80 shadow-2xs hover-zoom-card">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 relative z-10">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative shrink-0">
              <img
                src={teacherProfile.avatar}
                alt={teacherProfile.name}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover ring-2 ring-white shadow-xs bg-white hover-zoom-interactive"
              />
              <span className="absolute -bottom-1 -right-1 px-1 py-0.1 bg-emerald-600 text-white font-black text-[8px] rounded-full shadow-xs uppercase">
                GVBM
              </span>
            </div>

            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-md bg-white/95 text-[9.5px] font-black text-emerald-800 shadow-2xs border border-emerald-100 uppercase">
                  GV: <strong className="text-emerald-950 font-black">{teacherProfile.name}</strong>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-md bg-amber-400 text-amber-950 text-[9.5px] font-black shadow-2xs uppercase">
                  MÔN: <strong>{subjectName}</strong>
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-indigo-50 text-[9.5px] font-black text-indigo-800 border border-indigo-200 shadow-2xs uppercase">
                  {classes.length} LỚP PHỤ TRÁCH
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight uppercase leading-snug">
                  {getGreeting()}, <span className="text-emerald-700">{teacherProfile.name}</span>! 👋
                </h1>
                <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:inline">
                  • {teacherProfile.schoolName} • PHÒNG: {subjectTeacherConfig.roomDefault}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons for Subject Teacher */}
          <div className="flex flex-wrap items-center gap-1 shrink-0 pt-1 lg:pt-0">
            <button
              onClick={() => onNavigate('schedule')}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase"
            >
              <Calendar className="w-3 h-3" />
              <span>TKB BỘ MÔN</span>
            </button>

            <button
              onClick={() => onNavigate('students')}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase"
            >
              <Star className="w-3 h-3 text-amber-300" />
              <span>CHẤM SAO / XU</span>
            </button>

            <button
              onClick={() => onNavigate('picker')}
              className="px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase"
            >
              <Sparkles className="w-3 h-3" />
              <span>GỌI TÊN</span>
            </button>

            <button
              onClick={() => onNavigate('reports')}
              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase"
            >
              <Trophy className="w-3 h-3" />
              <span>THỐNG KÊ</span>
            </button>

            <button
              onClick={() => onNavigate('noise')}
              className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase"
            >
              <Volume2 className="w-3 h-3" />
              <span>CHỐNG ỒN</span>
            </button>
          </div>
        </div>

        {/* Footer info banner */}
        <div className="mt-2 pt-1.5 border-t border-emerald-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10.5px] text-emerald-950 font-bold">
          <div className="flex items-center gap-1.5 uppercase">
            <span>📅 NĂM HỌC: {teacherProfile.academicYear || '2026–2027'}</span>
            <span>•</span>
            <span>CHẾ ĐỘ TKB: {subjectTeacherConfig.scheduleScope === 'semester' ? 'CẢ HỌC KỲ' : 'THEO THỜI ĐIỂM'}</span>
          </div>

          <button
            onClick={() => setIsInitClassesOpen(true)}
            className="px-2.5 py-0.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 text-white rounded-md font-black text-[10px] uppercase flex items-center gap-1 shadow-2xs hover-zoom-btn self-start sm:self-auto"
            title="Tạo nhanh các lớp giảng dạy bộ môn, điền thông tin lớp và số lượng học sinh"
          >
            <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
            <span>KHỞI TẠO LỚP DẠY BỘ MÔN</span>
          </button>
        </div>
      </div>

      {/* 2. 4 Metric KPI Cards for Subject Teacher - Compact layout */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
        {/* Card 1: Số lớp phụ trách */}
        <div 
          onClick={() => onNavigate('classes')}
          className="bg-white rounded-xl p-2.5 px-3 border border-slate-200/80 shadow-2xs hover-zoom-card cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <School className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-black text-blue-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform uppercase">
              QUẢN LÝ <ArrowUpRight className="w-2.5 h-2.5" />
            </span>
          </div>
          <div>
            <div className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider">SỐ LỚP DẠY BỘ MÔN</div>
            <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight font-mono leading-tight">
              {classes.length} <span className="text-[10px] font-bold text-slate-500 uppercase">LỚP HỌC</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tiết dạy / tuần */}
        <div 
          onClick={() => onNavigate('schedule')}
          className="bg-white rounded-xl p-2.5 px-3 border border-slate-200/80 shadow-2xs hover-zoom-card cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-black group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-black text-emerald-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform uppercase">
              XEM TKB <ArrowUpRight className="w-2.5 h-2.5" />
            </span>
          </div>
          <div>
            <div className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider">TIẾT DẠY TRONG TUẦN</div>
            <div className="text-base sm:text-lg font-black text-emerald-600 tracking-tight font-mono leading-tight">
              {totalSubjectWeeklySlots} <span className="text-[10px] font-bold text-slate-500 uppercase">TIẾT / TUẦN</span>
            </div>
          </div>
        </div>

        {/* Card 3: Tổng sao / xu thi đua môn */}
        <div 
          onClick={() => onNavigate('reports')}
          className="bg-white rounded-xl p-2.5 px-3 border border-slate-200/80 shadow-2xs hover-zoom-card cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-black group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Star className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-black text-amber-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform uppercase">
              THI ĐUA <ArrowUpRight className="w-2.5 h-2.5" />
            </span>
          </div>
          <div>
            <div className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider">TỔNG XU MÔN {subjectName}</div>
            <div className="text-base sm:text-lg font-black text-amber-600 tracking-tight font-mono leading-tight">
              ⭐ {totalSubjectCoins} <span className="text-[10px] font-bold text-slate-500 uppercase">XU ĐÃ TRAO</span>
            </div>
          </div>
        </div>

        {/* Card 4: Tổng số học sinh toàn trường */}
        <div 
          onClick={() => onNavigate('students')}
          className="bg-white rounded-xl p-2.5 px-3 border border-slate-200/80 shadow-2xs hover-zoom-card cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-black group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <Users className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-black text-purple-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform uppercase">
              DANH SÁCH <ArrowUpRight className="w-2.5 h-2.5" />
            </span>
          </div>
          <div>
            <div className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider">TỔNG SỐ HỌC SINH</div>
            <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight font-mono leading-tight">
              {totalStudents} <span className="text-[10px] font-bold text-slate-500 uppercase">HỌC SINH</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. HERO COMPONENT: THỜI KHÓA BIỂU GIẢNG DẠY CỦA GIÁO VIÊN BỘ MÔN (User requirement) */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 md:p-7 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                TRANG CHỦ BỘ MÔN
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-xs font-bold text-slate-500 uppercase">
                {subjectTeacherConfig.scheduleScope === 'semester' ? 'Dùng chung cả học kì' : 'Theo thời điểm'}
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight uppercase mt-1 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-emerald-600" />
              <span>THỜI KHÓA BIỂU GIẢNG DẠY HÔM NAY – MÔN {subjectName}</span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('schedule')}
              className="px-4 py-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black uppercase flex items-center gap-1.5 transition-all hover-zoom-btn"
            >
              <span>Xem & Sắp TKB Đầy Đủ</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Day Selector Pills (Thứ 2 đến Thứ 7) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {DAYS_MAP.filter(d => d.day <= (subjectTeacherConfig.hasSaturday ? 7 : 6)).map(d => {
            const isToday = d.day === todayDayOfWeek;
            const isSelected = d.day === selectedDashboardDay;
            const countSlotsOnDay = subjectTimetable.filter(s => s.day === d.day).length;

            return (
              <button
                key={d.day}
                onClick={() => setSelectedDashboardDay(d.day)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 shrink-0 hover-zoom-btn uppercase ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 scale-102'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{d.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {countSlotsOnDay} tiết
                </span>
                {isToday && (
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                    isSelected ? 'bg-amber-400 text-amber-950' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    HÔM NAY
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Slots for the selected day */}
        {displayedDaySlots.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
            {displayedDaySlots.map((slot) => {
              const matchingClass = classes.find(c => c.id === slot.classId || c.name.toLowerCase() === slot.className.toLowerCase());
              const matchingStudents = students.filter(s => s.classId === matchingClass?.id);
              const classCoins = matchingStudents.reduce((acc, st) => acc + (st.subjectPoints?.[subjectName] || 0), 0);
              const time = slot.session === 'morning' ? morningTimes[slot.period - 1] : afternoonTimes[slot.period - 1];

              return (
                <div
                  key={slot.id}
                  className="p-4 rounded-3xl bg-slate-50/80 hover:bg-white border border-slate-200 hover:border-emerald-300 shadow-2xs hover-zoom-card transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-slate-200 text-slate-800 text-xs font-black uppercase font-mono">
                        TIẾT {slot.period} ({slot.session === 'morning' ? 'SÁNG' : 'CHIỀU'})
                      </span>

                      <span 
                        className="px-3 py-1 rounded-xl text-xs font-black text-white shadow-2xs uppercase"
                        style={{ backgroundColor: matchingClass?.color || '#059669' }}
                      >
                        {slot.className}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-500 font-bold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{time || 'Khung giờ chuẩn'}</span>
                    </div>

                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{slot.room || subjectTeacherConfig.roomDefault}</span>
                    </div>

                    {slot.note && (
                      <div className="text-xs text-slate-800 font-medium bg-white p-2.5 rounded-2xl border border-slate-200/80 italic">
                        📖 {slot.note}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500 font-bold">
                      <span>Sĩ số: {matchingStudents.length} HS</span>
                      <span className="text-amber-700 font-black">⭐ {classCoins} xu</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleJumpToClass(matchingClass?.id || slot.classId)}
                    className="mt-3.5 w-full py-2 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 hover-zoom-btn transition-all"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    <span>VÀO LỚP DẠY & CHẤM SAO</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 bg-slate-50/70 rounded-3xl border border-dashed border-slate-200 space-y-3">
            <Calendar className="w-10 h-10 mx-auto text-slate-300" />
            <div>
              <p className="text-sm font-black text-slate-700 uppercase">
                Hôm nay không có tiết dạy theo thời khóa biểu.
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Thầy/Cô có thể bấm vào ngày khác trong tuần ở trên để kiểm tra lịch dạy hoặc chuẩn bị bài giảng.
              </p>
            </div>
            <button
              onClick={() => onNavigate('schedule')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase shadow-xs hover-zoom-btn"
            >
              + Sắp xếp thời khóa biểu giảng dạy
            </button>
          </div>
        )}
      </div>

      {/* 4. CHẤM SAO TẶNG XU THEO LỚP & XẾP HẠNG THI ĐUA CÁC LỚP BỘ MÔN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Quick Star Awarding by Class */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4 hover-zoom-card flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
                  <Star className="w-5 h-5 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm md:text-base font-black text-slate-900 uppercase">
                    CHẤM SAO TẶNG XU THEO LỚP
                  </h3>
                  <p className="text-[11px] text-amber-700 font-bold uppercase">
                    MÔN: {subjectName} • ĐANG CHỌN LỚP {selectedQuickClass?.name}
                  </p>
                </div>
              </div>

              <button
                onClick={() => onNavigate('students')}
                className="text-xs font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase"
              >
                <span>Xem đầy đủ</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Class switcher buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-xs font-bold text-slate-400 shrink-0 uppercase">CHỌN LỚP:</span>
              {classes.slice(0, 8).map(cls => (
                <button
                  key={cls.id}
                  onClick={() => {
                    setQuickAwardClassId(cls.id);
                    setActiveClassId(cls.id);
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-black uppercase transition-all shrink-0 hover-zoom-btn ${
                    quickAwardClassId === cls.id
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Lớp {cls.name}
                </button>
              ))}
            </div>

            {/* Students list */}
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {quickStudentsList.slice(0, 10).map((st) => {
                const coins = st.subjectPoints?.[subjectName] || 0;
                return (
                  <div
                    key={st.id}
                    className="p-2.5 rounded-2xl bg-slate-50 hover:bg-amber-50/50 border border-slate-200/80 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-white text-slate-600 font-bold text-xs flex items-center justify-center shadow-2xs shrink-0">
                        {st.stt}
                      </span>
                      <img src={st.avatar} alt="" className="w-8 h-8 rounded-full bg-slate-200 object-cover shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900 uppercase truncate">{st.name}</div>
                        <div className="text-[10px] text-amber-700 font-black">
                          ⭐ {coins} xu môn {subjectName}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleQuickAward(st.id, st.name, 1)}
                        className="px-2 py-1 rounded-xl bg-amber-400 hover:bg-amber-500 text-amber-950 font-black text-xs uppercase shadow-2xs hover-zoom-btn"
                        title="Thưởng +1 xu"
                      >
                        +1 ⭐
                      </button>
                      <button
                        onClick={() => handleQuickAward(st.id, st.name, 2)}
                        className="px-2 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase shadow-2xs hover-zoom-btn"
                        title="Thưởng +2 xu"
                      >
                        +2 ⭐
                      </button>
                      <button
                        onClick={() => handleQuickAward(st.id, st.name, 5)}
                        className="px-2 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase shadow-2xs hover-zoom-btn"
                        title="Thưởng +5 xu xuất sắc"
                      >
                        +5 🌟
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Lớp {selectedQuickClass?.name}: {quickStudentsList.length} học sinh</span>
            <button
              onClick={() => handleJumpToClass(selectedQuickClass?.id)}
              className="font-black text-indigo-600 hover:underline uppercase flex items-center gap-1"
            >
              <span>Vào lớp này để xem tất cả</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Classes Ranking in Subject */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4 hover-zoom-card flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm md:text-base font-black text-slate-900 uppercase">
                    XẾP HẠNG THI ĐUA CÁC LỚP
                  </h3>
                  <p className="text-[11px] text-emerald-700 font-bold uppercase">
                    MÔN: {subjectName} ({classes.length} LỚP PHỤ TRÁCH)
                  </p>
                </div>
              </div>

              <button
                onClick={() => onNavigate('reports')}
                className="text-xs font-black text-emerald-700 hover:text-emerald-900 flex items-center gap-1 uppercase"
              >
                <span>Xem Báo Cáo</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {classesRanking.map((cls, idx) => {
                const isTop3 = idx < 3;
                const medals = ['🥇 Hạng 1', '🥈 Hạng 2', '🥉 Hạng 3'];
                const medalColors = ['bg-amber-100 text-amber-900 border-amber-300', 'bg-slate-100 text-slate-800 border-slate-300', 'bg-orange-100 text-orange-900 border-orange-300'];

                return (
                  <div
                    key={cls.id}
                    onClick={() => {
                      setActiveClassId(cls.id);
                      setQuickAwardClassId(cls.id);
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer hover-zoom-card flex items-center justify-between gap-3 ${
                      cls.id === quickAwardClassId
                        ? 'bg-emerald-50/60 border-emerald-400 ring-2 ring-emerald-200'
                        : 'bg-slate-50/80 border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border shrink-0 ${
                        isTop3 ? medalColors[idx] : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {isTop3 ? medals[idx] : `Hạng ${idx + 1}`}
                      </span>

                      <div className="min-w-0">
                        <div className="font-black text-slate-900 text-xs uppercase flex items-center gap-1.5">
                          <span>Lớp {cls.name}</span>
                          <span className="text-[10px] font-normal text-slate-400">({cls.grade})</span>
                        </div>
                        {cls.topStudent && (
                          <div className="text-[10px] text-slate-500 font-medium truncate">
                            Dẫn đầu: <strong className="text-emerald-800">{cls.topStudent.name}</strong> ({cls.topStudent.coins} xu)
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-amber-600">
                        ⭐ {cls.totalCoins} xu
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold">
                        TB: {cls.avgCoins} xu/em
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-bold uppercase">Tổng cộng: {totalSubjectCoins} xu toàn trường</span>
            <button
              onClick={() => onNavigate('reports')}
              className="font-black text-emerald-700 hover:underline uppercase flex items-center gap-1"
            >
              <span>Xem Báo Cáo Tổng Hợp Chi Tiết</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Khởi Tạo Lớp Dạy Bộ Môn */}
      <InitSubjectClassesModal
        isOpen={isInitClassesOpen}
        onClose={() => setIsInitClassesOpen(false)}
      />
    </div>
  );
};
