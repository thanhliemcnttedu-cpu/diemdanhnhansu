import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { 
  Users, User, CheckSquare, Gift, Sparkles, Plus, 
  ArrowUpRight, Award, Calendar, BookOpen, ChevronRight,
  TrendingUp, Brain, School, Trophy, Flame, ShieldCheck
} from 'lucide-react';
import { playPointClink } from '../../utils/audio';
import confetti from 'canvas-confetti';
import { callGeminiAi } from '../../services/aiService';
import { APP_AUTHOR_INFO } from '../../data/initialData';
import { SubjectTeacherDashboard } from './dashboard/SubjectTeacherDashboard';
import { DriveAttendanceStatsPanel } from './reports/DriveAttendanceStatsPanel';
import { getOfficialDisplayName } from '../../utils/accountIdentity';

interface DashboardViewProps {
  onNavigate: (viewId: any) => void;
  onOpenAddStudent?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  onNavigate,
  onOpenAddStudent 
}) => {
  const { 
    classes, activeClassId, setActiveClassId, students, currentClassStudents, 
    currentDateAttendance, attendanceRecords, timetable, awardPoints,
    teacherProfile, teacherRole,
    currentUser, isBgh, isSchoolAdmin, isAdmin, allUsers
  } = useClassroom();

  if (teacherRole === 'subject') {
    return (
      <SubjectTeacherDashboard 
        onNavigate={onNavigate} 
        onOpenAddStudent={onOpenAddStudent} 
      />
    );
  }

  const activeClass = classes.find(c => c.id === activeClassId) || classes[0];

  // Selected class for Timetable view on Dashboard
  const [selectedTimetableClassId, setSelectedTimetableClassId] = useState<string>(activeClassId || (classes[0]?.id || ''));
  // Selected class for Top Students ranking view on Dashboard
  const [selectedRankingClassId, setSelectedRankingClassId] = useState<string>(activeClassId || (classes[0]?.id || ''));

  // Sync if activeClassId changes
  React.useEffect(() => {
    if (activeClassId) {
      setSelectedTimetableClassId(activeClassId);
      setSelectedRankingClassId(activeClassId);
    }
  }, [activeClassId]);

  // Time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Chào buổi sáng';
    if (hour < 14) return 'Chào buổi trưa';
    if (hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  };

  // Metrics for active class (Giáo viên chủ nhiệm)
  const totalStudents = currentClassStudents.length;
  const presentCount = currentClassStudents.filter(
    s => currentDateAttendance[s.id] === 'present' || currentDateAttendance[s.id] === 'late'
  ).length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 100;
  
  const totalCoins = currentClassStudents.reduce((acc, s) => acc + (s.points || 0), 0);
  const avgCoins = totalStudents > 0 ? (totalCoins / totalStudents).toFixed(1) : '0';

  // Lọc chỉ lớp chủ nhiệm (GVCN) cho tổng quan toàn trường (loại trừ GVBM để chống trùng học sinh)
  const isManagementAccount = Boolean(isBgh || isSchoolAdmin || currentUser?.role === 'admin' || currentUser?.role === 'guest_admin');
  const homeroomClasses = React.useMemo(() => {
    return classes.filter(c => {
      if (!c) return false;
      if (c.id && c.id.startsWith('class-sub-')) return false;
      if (c.isHomeroom === true) return true;
      if (c.isHomeroom === false) return false;
      const r = String(c.teacherRole || '').toLowerCase();
      if (r === 'homeroom' || r === 'gvcn') return true;
      if (r === 'subject' || r === 'gvbm') return false;
      const lowerName = (c.name || '').toLowerCase();
      if (lowerName.includes('tin học') || lowerName.includes('bộ môn') || lowerName.includes('tiếng anh')) return false;
      return true;
    });
  }, [classes]);

  const homeroomClassIds = React.useMemo(() => new Set(homeroomClasses.map(c => c.id)), [homeroomClasses]);
  const homeroomStudents = React.useMemo(() => 
    students.filter(s => homeroomClassIds.has(s.classId) && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-')), 
    [students, homeroomClassIds]
  );

  // Metrics: linh hoạt giữa vai trò Quản trị viên (Toàn trường) và Giáo viên (Lớp activeClass)
  const displayTotalStudents = isManagementAccount ? homeroomStudents.length : totalStudents;
  const displayPresentCount = React.useMemo(() => {
    if (!isManagementAccount) return presentCount;
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let count = 0;
    attendanceRecords.forEach(att => {
      if (att && att.date === todayStr && att.records) {
        Object.entries(att.records).forEach(([sId, status]) => {
          if ((status === 'present' || status === 'late') && homeroomStudents.some(s => s.id === sId)) count++;
        });
      }
    });
    return count;
  }, [isManagementAccount, presentCount, attendanceRecords, homeroomStudents]);

  // Hôm nay đã có lớp nào điểm danh chưa (tránh hiện "0/3 0%" như thể cả lớp vắng)
  const hasAttendanceToday = React.useMemo(() => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return attendanceRecords.some(att =>
      att && att.date === todayStr && att.records && Object.keys(att.records).length > 0 &&
      (isManagementAccount ? homeroomClassIds.has(att.classId) : att.classId === activeClassId)
    );
  }, [attendanceRecords, isManagementAccount, homeroomClassIds, activeClassId]);

  const displayAttendanceRate = displayTotalStudents > 0 
    ? Math.round((displayPresentCount / displayTotalStudents) * 100) 
    : 100;

  const displayTotalCoins = isManagementAccount
    ? homeroomStudents.reduce((acc, s) => acc + (s.points || 0), 0)
    : totalCoins;

  const displayAvgCoins = displayTotalStudents > 0 
    ? (displayTotalCoins / displayTotalStudents).toFixed(1) 
    : '0';

  // Ranking of classes (management account ranks homeroom classes only)
  const rankingClassesPool = isManagementAccount ? homeroomClasses : classes;
  const classesRanking = rankingClassesPool.map(cls => {
    const clsStudents = students.filter(s => s.classId === cls.id && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-'));
    const sumCoins = clsStudents.reduce((acc, s) => acc + (s.points || 0), 0);
    const avg = clsStudents.length > 0 ? (sumCoins / clsStudents.length).toFixed(1) : '0';
    const topSt = [...clsStudents].sort((a, b) => b.points - a.points)[0];
    return {
      ...cls,
      studentCount: clsStudents.length,
      totalCoins: sumCoins,
      avgCoins: avg,
      topStudent: topSt
    };
  }).sort((a, b) => b.totalCoins - a.totalCoins);

  // Top ranked students for the selected ranking class
  const rankingClassStudents = students.filter(s => s.classId === selectedRankingClassId);
  const sortedStudents = [...rankingClassStudents].sort((a, b) => b.points - a.points);
  const topStudents = sortedStudents.slice(0, 5);

  // Today timetable slots for selected timetable class (Yêu cầu 1: Cố định theo từng lớp)
  const currentDayOfWeek = new Date().getDay() + 1; // 2 = Mon, 3 = Tue...
  const selectedTimetableClass = classes.find(c => c.id === selectedTimetableClassId) || activeClass;
  const todaySlots = timetable.filter(t => 
    t.day === currentDayOfWeek && 
    (t.classId ? t.classId === selectedTimetableClassId : (selectedTimetableClassId === classes[0]?.id))
  ).sort((a, b) => {
    if (a.session === b.session) return a.period - b.period;
    return a.session === 'morning' ? -1 : 1;
  });

  // AI Daily Inspiration Quote
  const [dailyQuote, setDailyQuote] = useState<string>(
    '“Mỗi đứa trẻ là một bông hoa độc nhất vô nhị. Giáo dục hạnh phúc bắt đầu từ sự lắng nghe và yêu thương chân thành.”'
  );
  const [loadingQuote, setLoadingQuote] = useState(false);

  const fetchAiQuote = async () => {
    setLoadingQuote(true);
    try {
      const prompt = `Viết 1 câu châm ngôn sư phạm ngắn (1-2 câu) truyền cảm hứng và yêu thương cho thầy/cô giáo chủ nhiệm lớp ${activeClass?.name || 'tiểu học'} trong ngày hôm nay theo triết lý "Lớp Học Hạnh Phúc".`;
      const quote = await callGeminiAi({ prompt });
      if (quote) setDailyQuote(quote.trim());
    } catch {
      // Keep existing default
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleQuickAddCoin = (studentId: string, studentName: string, amount: number) => {
    awardPoints([studentId], amount, `Thưởng nhanh +${amount} xu đầu ngày`);
    playPointClink();
    confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
  };

  return (
    <div className="p-2.5 sm:p-3.5 md:p-4 max-w-7xl mx-auto space-y-3 sm:space-y-4">
      {/* 1. Lời chào + việc cần làm hôm nay + lối tắt (bảng điều khiển) */}
      {(() => {
        const isManagementAccount = Boolean(isBgh || isSchoolAdmin || currentUser?.role === 'admin' || currentUser?.role === 'guest_admin');
        const officialName = getOfficialDisplayName(currentUser, allUsers);
        const greetingUserName = isManagementAccount
          ? officialName
          : (officialName || activeClass?.teacherName || teacherProfile.name);
        const displaySchoolName = currentUser?.schoolName || teacherProfile.schoolName || 'Trường học hạnh phúc';
        const displayAvatar = currentUser?.avatar || teacherProfile.avatar;
        const roleText = isBgh ? 'Ban giám hiệu' : isSchoolAdmin ? 'Quản trị trường' : currentUser?.role === 'admin' ? 'Quản trị tối cao'
          : currentUser?.role === 'guest_admin' ? 'Quản trị cá nhân' : 'Giáo viên chủ nhiệm';
        const now = new Date();
        const WD = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const dateLine = `${WD[now.getDay()]}, ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

        type Task = { key: string; title: string; detail: string; done: boolean; onClick: () => void; action: string };
        const tasks: Task[] = isManagementAccount ? [
          { key: 'rep', title: 'Chuyên cần hôm nay', detail: hasAttendanceToday ? `${displayPresentCount}/${displayTotalStudents} học sinh có mặt (${displayAttendanceRate}%)` : 'Chưa có lớp nào báo cáo', done: hasAttendanceToday, onClick: () => onNavigate('reports'), action: 'Xem báo cáo' },
          { key: 'staff', title: 'Chấm công nhân sự', detail: 'Ai đã điểm danh đi làm hôm nay', done: false, onClick: () => onNavigate('staff_attendance'), action: 'Mở chấm công' },
          { key: 'cls', title: 'Lớp học toàn trường', detail: `${homeroomClasses.length} lớp chủ nhiệm • ${homeroomStudents.length} học sinh`, done: homeroomClasses.length > 0, onClick: () => onNavigate('classes'), action: 'Xem lớp' },
        ] : [
          { key: 'att', title: 'Điểm danh lớp', detail: displayTotalStudents === 0 ? 'Lớp chưa có học sinh' : hasAttendanceToday ? `Đã điểm danh • ${displayPresentCount}/${displayTotalStudents} có mặt` : 'Chưa điểm danh hôm nay', done: hasAttendanceToday, onClick: () => onNavigate('attendance'), action: hasAttendanceToday ? 'Xem lại' : 'Điểm danh ngay' },
          { key: 'tkb', title: 'Thời khóa biểu hôm nay', detail: todaySlots.length > 0 ? `${todaySlots.length} tiết: ${todaySlots.slice(0, 3).map(t => t.subject).filter(Boolean).join(', ')}${todaySlots.length > 3 ? '…' : ''}` : 'Chưa có tiết nào cho hôm nay', done: todaySlots.length > 0, onClick: () => onNavigate('schedule'), action: 'Mở TKB' },
          { key: 'stu', title: 'Học sinh của lớp', detail: displayTotalStudents > 0 ? `${displayTotalStudents} học sinh • TB ${displayAvgCoins} xu/em` : 'Chưa có học sinh – thêm danh sách', done: displayTotalStudents > 0, onClick: () => (displayTotalStudents > 0 ? onNavigate('students') : (onOpenAddStudent ? onOpenAddStudent() : onNavigate('students'))), action: displayTotalStudents > 0 ? 'Xem học sinh' : 'Thêm học sinh' },
        ];

        const shortcuts: Array<{ key: string; label: string; icon: React.ReactNode; onClick: () => void; tone: string }> = isManagementAccount ? [
          { key: 'r', label: 'Báo cáo', icon: <ShieldCheck className="w-5 h-5" />, onClick: () => onNavigate('reports'), tone: 'text-indigo-700 bg-indigo-50' },
          { key: 's', label: 'Chấm công', icon: <CheckSquare className="w-5 h-5" />, onClick: () => onNavigate('staff_attendance'), tone: 'text-emerald-800 bg-emerald-50' },
          { key: 'c', label: 'Lớp học', icon: <School className="w-5 h-5" />, onClick: () => onNavigate('classes'), tone: 'text-sky-800 bg-sky-50' },
          { key: 'k', label: 'Tìm nhanh', icon: <TrendingUp className="w-5 h-5" />, onClick: () => window.dispatchEvent(new Event('lhhp:open-command-palette')), tone: 'text-slate-700 bg-slate-100' },
        ] : [
          { key: 'a', label: 'Điểm danh', icon: <CheckSquare className="w-5 h-5" />, onClick: () => onNavigate('attendance'), tone: 'text-emerald-800 bg-emerald-50' },
          { key: 'p', label: 'Gọi tên', icon: <Sparkles className="w-5 h-5" />, onClick: () => onNavigate('picker'), tone: 'text-violet-700 bg-violet-50' },
          { key: 'g', label: 'Đổi quà', icon: <Gift className="w-5 h-5" />, onClick: () => onNavigate('rewards'), tone: 'text-rose-700 bg-rose-50' },
          { key: 'c', label: 'Thư khen', icon: <Award className="w-5 h-5" />, onClick: () => onNavigate('certificate'), tone: 'text-amber-800 bg-amber-50' },
          { key: 'i', label: 'Infographic', icon: <BookOpen className="w-5 h-5" />, onClick: () => onNavigate('infographic'), tone: 'text-sky-800 bg-sky-50' },
          { key: 't', label: 'Trình chiếu', icon: <Flame className="w-5 h-5" />, onClick: () => window.dispatchEvent(new Event('lhhp:toggle-presentation')), tone: 'text-slate-800 bg-slate-100' },
        ];

        return (
          <section className="rounded-3xl bg-white/75 backdrop-blur-xl border border-white shadow-[0_10px_40px_-18px_rgba(37,99,235,0.35)] overflow-hidden" aria-label="Bảng điều khiển hôm nay">
            {/* Lời chào */}
            <div className="relative px-4 sm:px-6 pt-5 pb-4 bg-gradient-to-br from-sky-50/70 via-indigo-50/60 to-violet-50/70">
              <div className="absolute -right-10 -top-16 w-64 h-64 rounded-full bg-gradient-to-br from-sky-200/50 to-violet-200/40 blur-2xl pointer-events-none" aria-hidden="true" />
              <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <img src={displayAvatar} alt={greetingUserName} className="w-14 h-14 rounded-2xl object-cover ring-4 ring-white shadow-sm bg-white shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-indigo-800">{dateLine} • {roleText}</p>
                    <h1 className="normal-case text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug truncate mt-0.5" title={greetingUserName}>
                      {(() => { const g = String(getGreeting()).toLocaleLowerCase('vi-VN'); return g.charAt(0).toLocaleUpperCase('vi-VN') + g.slice(1); })()}, {greetingUserName}!
                    </h1>
                    {/* Dòng phụ dạng nhãn tách rời — dễ đọc hơn 1 dòng dài nhiều dấu "•" */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {isManagementAccount
                        ? <span className="px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-slate-700"><strong className="text-slate-900">{homeroomClasses.length}</strong> lớp · <strong className="text-slate-900">{homeroomStudents.length}</strong> học sinh</span>
                        : <span className="px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-slate-700">Lớp <strong className="text-slate-900">{activeClass?.name || 'chưa có'}</strong></span>}
                      <span className="px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-slate-700">Năm học <strong className="text-slate-900">{teacherProfile.academicYear || activeClass?.academicYear || '2026–2027'}</strong></span>
                      <span className="max-sm:hidden px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-slate-700 truncate max-w-[18rem]" title={displaySchoolName}>{displaySchoolName}</span>
                    </div>
                  </div>
                </div>
                {/* Lối tắt */}
                <div className={`grid gap-2 ${isManagementAccount ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-6'} w-full xl:w-auto shrink-0`}>
                  {shortcuts.map(sc => (
                    <button key={sc.key} type="button" onClick={sc.onClick}
                      className="no-hover-fx group flex flex-col items-center gap-1 px-2 py-2 rounded-2xl bg-white/80 hover:bg-white border border-white hover:border-slate-200 hover:shadow-sm transition-all min-w-[72px]">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${sc.tone} transition-transform group-hover:-translate-y-0.5`}>{sc.icon}</span>
                      <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{sc.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Việc cần làm hôm nay */}
            <div className="px-4 sm:px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              {tasks.map(t => (
                <button key={t.key} type="button" onClick={t.onClick}
                  className={`no-hover-fx text-left rounded-2xl border p-4 flex items-start gap-3 transition-colors ${t.done ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50' : 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'}`}>
                  <span className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-black ${t.done ? 'bg-emerald-700' : 'bg-amber-700'}`} aria-hidden="true">{t.done ? '✓' : '!'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-slate-900 leading-snug whitespace-nowrap truncate" title={t.title}>{t.title}</span>
                    <span className="block text-sm text-slate-600 truncate mt-0.5" title={t.detail}>{t.detail}</span>
                    <span className={`inline-flex items-center gap-1 mt-2 text-xs font-bold ${t.done ? 'text-emerald-800' : 'text-amber-900'}`}>{t.action} <ChevronRight className="w-3.5 h-3.5" /></span>
                  </span>
                </button>
              ))}
            </div>

            {/* Câu cảm hứng */}
            <div className="mx-4 sm:mx-6 mb-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-sm text-slate-500">
              <Brain className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="italic truncate flex-1" title={dailyQuote}>{dailyQuote}</span>
              <button onClick={fetchAiQuote} disabled={loadingQuote} className="no-hover-fx text-xs font-bold text-indigo-700 hover:text-indigo-900 shrink-0">
                {loadingQuote ? 'Đang tải…' : 'Cảm hứng AI'}
              </button>
            </div>
          </section>
        );
      })()}

      {/* 2. CLASS SELECTOR SWITCHER: Chỉ dành cho Giáo viên khi có nhiều lớp. Quản trị viên quản trị vĩ mô toàn trường nên loại bỏ */}
      {!isManagementAccount && classes.length > 1 && (
        <div className="bg-white rounded-xl p-2.5 px-3 border border-indigo-100 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-black">
              <School className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[12px] font-black text-indigo-900 block leading-tight">CHỌN LỚP XEM BẢNG TIN:</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 md:pb-0">
            {classes.map(cls => {
              const isSelected = cls.id === activeClassId;
              const count = students.filter(s => s.classId === cls.id).length;
              return (
                <button
                  key={cls.id}
                  onClick={() => {
                    setActiveClassId(cls.id);
                    setSelectedTimetableClassId(cls.id);
                    setSelectedRankingClassId(cls.id);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 shrink-0 hover-zoom-btn ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-2xs font-black'
                      : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-indigo-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full ring-1 ring-white/60" style={{ backgroundColor: cls.color || '#3B82F6' }} />
                  <span>Lớp {cls.name}</span>
                  <span className={`px-1 py-0.1 rounded text-[12px] ${isSelected ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {count} HS
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2b. BGH / Quản trị: thống kê chuyên cần & bán trú toàn trường từ Google Drive dùng chung */}
      {isManagementAccount && currentUser?.role !== 'guest_admin' && !currentUser?.isGuestAdmin && (
        <DriveAttendanceStatsPanel />
      )}

      {/* 3. 4 thẻ số liệu dạng thẻ màu hiện đại (số to, chữ trắng rõ, có thanh tiến độ) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            key: 'students',
            onClick: () => onNavigate(isManagementAccount ? 'classes' : 'students'),
            gradient: 'from-sky-700 to-blue-800',
            icon: <Users className="w-5 h-5" />,
            link: 'Chi tiết',
            label: 'Sĩ số học sinh',
            value: String(displayTotalStudents),
            unit: isManagementAccount ? `HS • ${homeroomClasses.length} lớp` : `HS ${activeClass ? `• Lớp ${activeClass.name}` : ''}`,
            progress: null as number | null
          },
          {
            key: 'attendance',
            onClick: () => onNavigate(isManagementAccount ? 'reports' : 'attendance'),
            gradient: 'from-emerald-700 to-teal-800',
            icon: <CheckSquare className="w-5 h-5" />,
            link: isManagementAccount ? 'Báo cáo' : 'Điểm danh',
            label: 'Hiện diện hôm nay',
            value: displayTotalStudents > 0 && hasAttendanceToday ? `${displayPresentCount}/${displayTotalStudents}` : '—',
            unit: displayTotalStudents === 0 ? 'chưa có học sinh' : (hasAttendanceToday ? `${displayAttendanceRate}%` : (isManagementAccount ? 'chưa có lớp báo cáo' : 'chưa điểm danh')),
            progress: displayTotalStudents > 0 && hasAttendanceToday ? (Number(displayAttendanceRate) || 0) : null
          },
          {
            key: 'coins',
            onClick: () => onNavigate(isManagementAccount ? 'reports' : 'rewards'),
            gradient: 'from-rose-700 to-pink-800',
            icon: <Award className="w-5 h-5" />,
            link: isManagementAccount ? 'Báo cáo' : 'Đổi quà',
            label: 'Tổng xu thi đua',
            value: String(displayTotalCoins),
            unit: isManagementAccount ? 'xu toàn trường' : 'xu cả lớp',
            progress: null
          },
          {
            key: 'avg',
            onClick: () => onNavigate('reports'),
            gradient: 'from-violet-700 to-indigo-800',
            icon: <TrendingUp className="w-5 h-5" />,
            link: 'Báo cáo',
            label: 'Trung bình / học sinh',
            value: String(displayAvgCoins),
            unit: 'xu / em',
            progress: null
          }
        ].map(card => (
          <div
            key={card.key}
            onClick={card.onClick}
            className={`relative overflow-hidden rounded-2xl p-3 sm:p-3.5 bg-gradient-to-br ${card.gradient} text-white shadow-md hover-zoom-card cursor-pointer group flex flex-col justify-between min-h-[108px]`}
          >
            {/* decorative bubbles */}
            <span className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
            <span className="pointer-events-none absolute right-6 -bottom-8 w-20 h-20 rounded-full bg-white/10" />
            <div className="relative flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">{card.icon}</div>
              <span className="text-[12px] font-black uppercase flex items-center gap-0.5 bg-black/20 rounded-full px-2 py-0.5 group-hover:bg-black/30 transition-colors">
                {card.link} <ArrowUpRight className="w-3 h-3" />
              </span>
            </div>
            <div className="relative mt-2">
              <div className="text-[12px] sm:text-[12px] font-bold uppercase tracking-wider text-white">{card.label}</div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-2xl sm:text-3xl font-black tracking-tight font-mono leading-none">{card.value}</span>
                <span className="text-[12px] sm:text-[12px] font-bold text-white truncate">{card.unit}</span>
              </div>
              {card.progress !== null && (
                <div className="mt-1.5 h-1.5 rounded-full bg-white/25 overflow-hidden">
                  <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 4. TOP THI ĐUA NHẬN XU THEO LỚP (Hiển thị khi có nhiều lớp học - Yêu cầu 1) */}
      {classes.length > 1 && (
        <div className="bg-gradient-to-r from-amber-50/70 via-orange-50/60 to-yellow-50/70 rounded-3xl p-5 border border-amber-200/80 shadow-xs hover-zoom-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-700 to-yellow-700 text-white flex items-center justify-center font-black shadow-xs">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-black text-amber-950">
                  BẢNG XẾP HẠNG THI ĐUA NHẬN XU THEO LỚP HỌC
                </h3>
                <p className="text-xs text-amber-800 font-semibold">
                  THỐNG KÊ TỔNG ĐIỂM XU THI ĐUA, ĐIỂM TRUNG BÌNH VÀ HỌC SINH TIÊU BIỂU CỦA TỪNG LỚP
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('reports')}
              className="text-xs font-black text-amber-800 hover:text-amber-950 flex items-center gap-1 self-start sm:self-auto hover-zoom-interactive"
            >
              <span>Xem báo cáo chi tiết</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {classesRanking.map((cls, idx) => {
              const medalBadges = ['🥇 Hạng 1', '🥈 Hạng 2', '🥉 Hạng 3'];
              const medalStyles = [
                'bg-amber-100 text-amber-900 border-amber-300 font-black',
                'bg-slate-100 text-slate-800 border-slate-300 font-bold',
                'bg-orange-100 text-orange-900 border-orange-300 font-bold'
              ];

              return (
                <div
                  key={cls.id}
                  onClick={() => {
                    setActiveClassId(cls.id);
                    setSelectedTimetableClassId(cls.id);
                    setSelectedRankingClassId(cls.id);
                  }}
                  className={`p-4 rounded-2xl bg-white border transition-all cursor-pointer hover-zoom-interactive shadow-xs ${
                    cls.id === activeClassId 
                      ? 'border-indigo-400 ring-2 ring-indigo-400/30' 
                      : 'border-amber-200/80 hover:border-amber-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[12px] border ${idx < 3 ? medalStyles[idx] : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {idx < 3 ? medalBadges[idx] : `Hạng ${idx + 1}`}
                    </span>
                    <span className="text-[12px] font-bold text-slate-500">
                      {cls.studentCount} học sinh
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-black text-indigo-900">
                        Lớp {cls.name}
                      </h4>
                      <div className="text-xs text-slate-500 font-medium">
                        {cls.grade} · GV: {cls.teacherName || teacherProfile.name}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-black text-amber-700">
                        🪙 {cls.totalCoins} xu
                      </div>
                      <div className="text-[12px] text-slate-500 font-semibold">
                        TB: {cls.avgCoins} xu/em
                      </div>
                    </div>
                  </div>

                  {cls.topStudent && (
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Dẫn đầu lớp:</span>
                      <span className="font-extrabold text-indigo-700 truncate max-w-[140px]">
                        ⭐ {cls.topStudent.name} ({cls.topStudent.points} xu)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Bottom Grid: Timetable today & Top Students ranking (quản lý chưa có lớp nào thì ẩn — toàn ô trống) */}
      {!(isManagementAccount && classes.length === 0) && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Left: Thời Khóa Biểu Cố Định Theo Từng Lớp (Yêu cầu 1) */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4 hover-zoom-card flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm md:text-base font-black text-indigo-950">
                    Thời khóa biểu hôm nay
                  </h2>
                  <span className="text-[12px] text-indigo-600 font-bold block">
                    Theo lớp <strong>{selectedTimetableClass?.name}</strong>
                  </span>
                </div>
              </div>

              <button
                onClick={() => onNavigate('schedule')}
                className="text-xs font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover-zoom-interactive"
              >
                <span>Xem cả tuần</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Class switcher buttons for Timetable if multiple classes (Yêu cầu 1) */}
            {classes.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-b border-slate-100">
                <span className="text-[12px] font-bold text-slate-400 shrink-0">Lớp:</span>
                {classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedTimetableClassId(cls.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 hover-zoom-btn ${
                      selectedTimetableClassId === cls.id
                        ? 'bg-blue-600 text-white font-black shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    LỚP {cls.name}
                  </button>
                ))}
              </div>
            )}

            {todaySlots.length > 0 ? (
              <div className="space-y-2">
                {todaySlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50/60 rounded-2xl border border-slate-100 transition-all hover-zoom-interactive"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-white text-indigo-700 font-extrabold text-xs flex items-center justify-center shadow-2xs border border-indigo-100">
                        T{slot.period}
                      </span>
                      <div>
                        <div className="text-xs md:text-sm font-black text-indigo-950">{slot.subject}</div>
                        <div className="text-[12px] text-slate-500 font-medium">
                          {slot.session === 'morning' ? 'BUỔI SÁNG' : 'BUỔI CHIỀU'} · {slot.teacher || teacherProfile.name}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-black">
                      TIẾT {slot.period}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-slate-400 space-y-2">
                <Calendar className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-xs md:text-sm font-medium text-slate-600">
                  Hôm nay lớp {selectedTimetableClass?.name} chưa có tiết nào trong thời khóa biểu.
                </p>
                <button
                  onClick={() => onNavigate('schedule')}
                  className="text-xs font-bold text-indigo-600 hover:underline inline-block mt-1 hover-zoom-interactive"
                >
                  + Cài đặt thời khóa biểu lớp {selectedTimetableClass?.name}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Top Thi Đua Nhận Xu Theo Lớp (Yêu cầu 1) */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4 hover-zoom-card flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm md:text-base font-black text-indigo-950">
                    Top thi đua nhận xu
                  </h2>
                  <span className="text-[12px] text-amber-700 font-bold block">
                    Đang xem lớp <strong>{classes.find(c => c.id === selectedRankingClassId)?.name || activeClass?.name}</strong>
                  </span>
                </div>
              </div>

              <button
                onClick={() => onNavigate('reports')}
                className="text-xs font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover-zoom-interactive"
              >
                <span>Xem tất cả</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Class switcher buttons for Top Students if multiple classes (Yêu cầu 1) */}
            {classes.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-b border-slate-100">
                <span className="text-[12px] font-bold text-slate-400 shrink-0">Lớp:</span>
                {classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedRankingClassId(cls.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 hover-zoom-btn ${
                      selectedRankingClassId === cls.id
                        ? 'bg-amber-700 text-white font-black shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Lớp {cls.name}
                  </button>
                ))}
              </div>
            )}

            {topStudents.length > 0 ? (
              <div className="space-y-2.5">
                {topStudents.map((st, idx) => {
                  const medalColors = [
                    'bg-amber-100 text-amber-900 border-amber-300 font-black',
                    'bg-slate-200 text-slate-800 border-slate-300 font-bold',
                    'bg-orange-100 text-orange-950 border-orange-300 font-bold',
                  ];

                  return (
                    <div
                      key={st.id}
                      className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-amber-50/40 rounded-2xl border border-slate-100 transition-all hover-zoom-interactive"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-xl text-xs flex items-center justify-center border ${
                          idx < 3 ? medalColors[idx] : 'bg-white text-slate-600 border-slate-200 font-bold'
                        }`}>
                          {idx + 1}
                        </span>

                        <img
                          src={st.avatar}
                          alt={st.name}
                          className="w-10 h-10 rounded-xl object-cover bg-white ring-2 ring-slate-100"
                        />

                        <div>
                          <div className="text-xs md:text-sm font-black text-indigo-950">{st.name}</div>
                          <div className="text-[12px] text-slate-500 font-medium">
                            {st.gender} · {st.group || 'Tổ 1'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 font-black text-xs rounded-xl shadow-2xs">
                          🪙 {st.points} xu
                        </span>

                        {/* Quick +1, +5 buttons */}
                        <button
                          onClick={() => handleQuickAddCoin(st.id, st.name, 1)}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-[12px] rounded-lg border border-emerald-200 hover-zoom-btn"
                          title="Cộng +1 xu"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => handleQuickAddCoin(st.id, st.name, 5)}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 font-black text-[12px] rounded-lg border border-blue-200 hover-zoom-btn"
                          title="Cộng +5 xu"
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center text-slate-400 space-y-2">
                <Users className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-xs md:text-sm font-medium text-slate-600">
                  Lớp này chưa có danh sách học sinh.
                </p>
                <button
                  onClick={() => onNavigate('students')}
                  className="text-xs font-bold text-indigo-600 hover:underline inline-block mt-1 hover-zoom-interactive"
                >
                  + Thêm học sinh cho lớp
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* 6. BANNER THÔNG TIN GIÁO VIÊN & TÁC GIẢ BẢN QUYỀN CỐ ĐỊNH (Yêu cầu 5 & 6) */}
      {(() => {
        const isManagementAccount = Boolean(isBgh || isSchoolAdmin || currentUser?.role === 'admin' || currentUser?.role === 'guest_admin');
        const officialName = getOfficialDisplayName(currentUser, allUsers);
        const greetingUserName = isManagementAccount
          ? officialName
          : (officialName || activeClass?.teacherName || teacherProfile.name);
        const displaySchoolName = currentUser?.schoolName || teacherProfile.schoolName || 'Trường học hạnh phúc';
        const displayAvatar = currentUser?.avatar || teacherProfile.avatar;

        return (
          <div className="rounded-2xl bg-white/70 border border-slate-200/80 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
            {/* Tài khoản đang dùng */}
            <div className="flex items-center gap-3 min-w-0">
              <img src={displayAvatar} alt={greetingUserName} className="w-9 h-9 rounded-xl object-cover ring-2 ring-white shrink-0 bg-indigo-50" />
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate" title={greetingUserName}>{greetingUserName}</p>
                <p className="text-xs text-slate-600 truncate" title={displaySchoolName}>
                  {displaySchoolName} · Năm học {teacherProfile.academicYear || '2026–2027'}
                  {isManagementAccount ? ` · ${classes.length} lớp, ${students.length} học sinh` : activeClass ? ` · Lớp ${activeClass.name}` : ''}
                </p>
              </div>
            </div>
            {/* Tác giả ứng dụng cố định (Yêu cầu 6) */}
            <div className="flex flex-wrap items-center gap-2 md:justify-end text-xs">
              <span className="text-slate-600">Tác giả <strong className="text-slate-900">{APP_AUTHOR_INFO.name}</strong> · {APP_AUTHOR_INFO.schoolName}</span>
              <a href={APP_AUTHOR_INFO.zaloUrl} target="_blank" rel="noreferrer"
                className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold border border-blue-200 whitespace-nowrap">Zalo {APP_AUTHOR_INFO.zalo}</a>
              <a href={APP_AUTHOR_INFO.facebook} target="_blank" rel="noreferrer"
                className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold border border-indigo-200">Facebook</a>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
