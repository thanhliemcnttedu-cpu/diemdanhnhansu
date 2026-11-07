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
    <div className="p-2.5 sm:p-3.5 md:p-4 max-w-7xl mx-auto space-y-2.5 sm:space-y-3">
      {/* 1. Main Welcome Banner matching Requirement 5: TÊN GIÁO VIÊN, ĐƠN VỊ CÔNG TÁC, NĂM HỌC */}
      {(() => {
        const isManagementAccount = Boolean(isBgh || isSchoolAdmin || currentUser?.role === 'admin' || currentUser?.role === 'guest_admin');
        const officialName = getOfficialDisplayName(currentUser, allUsers);
        const greetingUserName = isManagementAccount
          ? officialName
          : (officialName || activeClass?.teacherName || teacherProfile.name);
        const displaySchoolName = currentUser?.schoolName || teacherProfile.schoolName || 'TRƯỜNG HỌC HẠNH PHÚC';
        const displayAvatar = currentUser?.avatar || teacherProfile.avatar;
        const roleBadge = isBgh 
          ? { text: 'BGH', bg: 'bg-amber-600' }
          : isSchoolAdmin 
          ? { text: 'QUẢN TRỊ TRƯỜNG', bg: 'bg-rose-600' }
          : currentUser?.role === 'admin'
          ? { text: 'SUPER ADMIN', bg: 'bg-rose-700' }
          : currentUser?.role === 'guest_admin'
          ? { text: 'QUẢN TRỊ CÁ NHÂN', bg: 'bg-purple-600' }
          : { text: 'GVCN', bg: 'bg-indigo-600' };

        return (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-violet-100 via-indigo-50 to-blue-100 p-2.5 sm:p-3 px-3 sm:px-4 border border-indigo-200/80 shadow-2xs hover-zoom-card">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 relative z-10">
              {/* Left Greeting & Avatar */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="relative shrink-0">
                  <img
                    src={displayAvatar}
                    alt={greetingUserName}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover ring-2 ring-white shadow-xs bg-white hover-zoom-interactive"
                  />
                  <span className={`absolute -bottom-1 -right-1 px-1.5 py-0.2 ${roleBadge.bg} text-white font-black text-[8px] rounded-full shadow-xs uppercase tracking-tight whitespace-nowrap`}>
                    {roleBadge.text}
                  </span>
                </div>

                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-md bg-white/95 text-[9.5px] font-black text-indigo-700 shadow-2xs border border-indigo-100 uppercase">
                      {isManagementAccount ? 'TÀI KHOẢN: ' : 'GV: '}
                      <strong className="text-indigo-950 font-black">{greetingUserName}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-md bg-emerald-50 text-[9.5px] font-black text-emerald-800 border border-emerald-200 shadow-2xs uppercase">
                      {displaySchoolName}
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-amber-50 text-[9.5px] font-black text-amber-800 border border-amber-200 shadow-2xs uppercase">
                      NH: {teacherProfile.academicYear || activeClass?.academicYear || '2026–2027'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <h1 className="text-xs sm:text-base font-black text-indigo-950 tracking-tight uppercase leading-snug truncate">
                      {getGreeting()}, <span className="text-indigo-600">{greetingUserName}</span>! 👋
                    </h1>
                    <span className="text-[10px] text-slate-500 font-bold uppercase hidden sm:inline">
                      {isManagementAccount ? (
                        <>• TOÀN TRƯỜNG: <strong className="text-indigo-700 font-black">{homeroomClasses.length} LỚP GVCN • {homeroomStudents.length} HỌC SINH</strong></>
                      ) : (
                        <>• LỚP: <strong className="text-indigo-700 font-black">{activeClass ? `LỚP ${activeClass.name}` : 'CHƯA CÓ'}</strong></>
                      )}
                      {currentUser?.phone && ` • SĐT/ZALO: ${currentUser.phone}`}
                    </span>
                  </div>
                </div>
              </div>

          {/* Quick Action Buttons: Quản trị viên chỉ có nút Báo cáo Realtime. Ẩn 5 nút thao tác lớp (Điểm danh, Thêm HS, Vòng quay, Đổi xu, Infographic) vì là chức năng của GVCN */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1 sm:gap-1.5 shrink-0 pt-2 lg:pt-0 w-full lg:w-auto">
            {isManagementAccount ? (
              <button
                onClick={() => onNavigate('reports')}
                className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-500 to-indigo-700 hover:from-indigo-800 hover:to-indigo-800 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-900/30 hover-zoom-btn uppercase cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-amber-300" />
                <span>BÁO CÁO REALTIME</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => onNavigate('attendance')}
                  className="px-2.5 py-1.5 sm:py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase cursor-pointer"
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>ĐIỂM DANH</span>
                </button>

                <button
                  onClick={() => onOpenAddStudent ? onOpenAddStudent() : onNavigate('students')}
                  className="px-2.5 py-1.5 sm:py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>THÊM HỌC SINH</span>
                </button>

                <button
                  onClick={() => onNavigate('wheel')}
                  className="px-2.5 py-1.5 sm:py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>VÒNG QUAY</span>
                </button>

                <button
                  onClick={() => onNavigate('rewards')}
                  className="px-2.5 py-1.5 sm:py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase cursor-pointer"
                >
                  <Gift className="w-3 h-3" />
                  <span>ĐỔI XU</span>
                </button>

                <button
                  onClick={() => onNavigate('infographic')}
                  className="col-span-2 sm:col-span-1 px-2.5 py-1.5 sm:py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg font-black text-[10.5px] flex items-center justify-center gap-1 shadow-2xs hover-zoom-btn uppercase cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>INFOGRAPHIC</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* AI Daily Inspiration & Author Information - compact row */}
        <div className="mt-2 pt-1.5 border-t border-indigo-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10.5px] text-indigo-900">
          <div className="flex items-center gap-1.5 italic flex-1 truncate">
            <Brain className="w-3 h-3 text-indigo-600 shrink-0" />
            <span className="truncate">{dailyQuote}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-[10px]">
            <button
              onClick={fetchAiQuote}
              disabled={loadingQuote}
              className="font-black text-indigo-600 hover:text-indigo-800 underline hover-zoom-interactive uppercase"
            >
              {loadingQuote ? 'ĐANG TẢI...' : 'LẤY CẢM HỨNG AI'}
            </button>
            <span className="text-slate-500 hidden md:inline">|</span>
            <span className="text-slate-600 hidden md:inline font-bold uppercase">
              TÁC GIẢ: <strong className="text-indigo-800 font-black">{APP_AUTHOR_INFO.name}</strong> • ZALO: <a href={APP_AUTHOR_INFO.zaloUrl} className="text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-800" title="Bấm để hiện mã QR Zalo">{APP_AUTHOR_INFO.zalo}</a>
            </span>
          </div>
        </div>
      </div>
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
              <span className="text-[11px] font-black text-indigo-900 block leading-tight">CHỌN LỚP XEM BẢNG TIN:</span>
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
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 hover-zoom-btn ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-2xs font-black'
                      : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-indigo-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full ring-1 ring-white/60" style={{ backgroundColor: cls.color || '#3B82F6' }} />
                  <span>Lớp {cls.name}</span>
                  <span className={`px-1 py-0.1 rounded text-[9.5px] ${isSelected ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {[
          {
            key: 'students',
            onClick: () => onNavigate(isManagementAccount ? 'classes' : 'students'),
            gradient: 'from-sky-600 to-blue-700',
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
            gradient: 'from-emerald-700 to-teal-700',
            icon: <CheckSquare className="w-5 h-5" />,
            link: isManagementAccount ? 'Báo cáo' : 'Điểm danh',
            label: 'Hiện diện hôm nay',
            value: `${displayPresentCount}/${displayTotalStudents}`,
            unit: `${displayAttendanceRate}%`,
            progress: Number(displayAttendanceRate) || 0
          },
          {
            key: 'coins',
            onClick: () => onNavigate(isManagementAccount ? 'reports' : 'rewards'),
            gradient: 'from-rose-600 to-pink-700',
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
            gradient: 'from-violet-600 to-indigo-700',
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
              <span className="text-[10px] font-black uppercase flex items-center gap-0.5 bg-white/20 rounded-full px-2 py-0.5 group-hover:bg-white/30 transition-colors">
                {card.link} <ArrowUpRight className="w-3 h-3" />
              </span>
            </div>
            <div className="relative mt-2">
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/90">{card.label}</div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-2xl sm:text-3xl font-black tracking-tight font-mono leading-none">{card.value}</span>
                <span className="text-[10px] sm:text-[11px] font-bold text-white/90 truncate">{card.unit}</span>
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
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-600 to-yellow-600 text-white flex items-center justify-center font-black shadow-xs">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-black text-amber-950 uppercase">
                  BẢNG XẾP HẠNG THI ĐUA NHẬN XU THEO LỚP HỌC
                </h3>
                <p className="text-xs text-amber-800 font-semibold uppercase">
                  THỐNG KÊ TỔNG ĐIỂM XU THI ĐUA, ĐIỂM TRUNG BÌNH VÀ HỌC SINH TIÊU BIỂU CỦA TỪNG LỚP
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('reports')}
              className="text-xs font-black text-amber-800 hover:text-amber-950 flex items-center gap-1 self-start sm:self-auto hover-zoom-interactive uppercase"
            >
              <span>XEM BÁO CÁO CHI TIẾT</span>
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
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] border ${idx < 3 ? medalStyles[idx] : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {idx < 3 ? medalBadges[idx] : `Hạng ${idx + 1}`}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
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
                      <div className="text-lg font-black text-amber-600">
                        🪙 {cls.totalCoins} xu
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">
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

      {/* 5. Bottom Grid: Timetable today & Top Students ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Thời Khóa Biểu Cố Định Theo Từng Lớp (Yêu cầu 1) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4 hover-zoom-card flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm md:text-base font-black text-indigo-950 uppercase">
                    THỜI KHÓA BIỂU HÔM NAY
                  </h2>
                  <span className="text-[11px] text-indigo-600 font-bold block uppercase">
                    CỐ ĐỊNH THEO: <strong>LỚP {selectedTimetableClass?.name}</strong>
                  </span>
                </div>
              </div>

              <button
                onClick={() => onNavigate('schedule')}
                className="text-xs font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover-zoom-interactive uppercase"
              >
                <span>XEM CẢ TUẦN</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Class switcher buttons for Timetable if multiple classes (Yêu cầu 1) */}
            {classes.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-b border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 shrink-0 uppercase">LỚP:</span>
                {classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedTimetableClassId(cls.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 hover-zoom-btn uppercase ${
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
                        <div className="text-xs md:text-sm font-black text-indigo-950 uppercase">{slot.subject}</div>
                        <div className="text-[11px] text-slate-500 font-medium uppercase">
                          {slot.session === 'morning' ? 'BUỔI SÁNG' : 'BUỔI CHIỀU'} · {slot.teacher || teacherProfile.name}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-black uppercase">
                      TIẾT {slot.period}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-slate-400 space-y-2">
                <Calendar className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-xs md:text-sm font-medium text-slate-600 uppercase">
                  HÔM NAY KHÔNG CÓ TIẾT HỌC NÀO TRONG THỜI KHÓA BIỂU LỚP {selectedTimetableClass?.name}.
                </p>
                <button
                  onClick={() => onNavigate('schedule')}
                  className="text-xs font-bold text-indigo-600 hover:underline inline-block mt-1 hover-zoom-interactive uppercase"
                >
                  + CÀI ĐẶT THỜI KHÓA BIỂU CỐ ĐỊNH LỚP {selectedTimetableClass?.name}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Top Thi Đua Nhận Xu Theo Lớp (Yêu cầu 1) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4 hover-zoom-card flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm md:text-base font-black text-indigo-950 uppercase">
                    TOP THI ĐUA NHẬN XU
                  </h2>
                  <span className="text-[11px] text-amber-700 font-bold block uppercase">
                    ĐANG XEM: <strong>LỚP {classes.find(c => c.id === selectedRankingClassId)?.name || activeClass?.name}</strong>
                  </span>
                </div>
              </div>

              <button
                onClick={() => onNavigate('reports')}
                className="text-xs font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover-zoom-interactive uppercase"
              >
                <span>XEM TẤT CẢ</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Class switcher buttons for Top Students if multiple classes (Yêu cầu 1) */}
            {classes.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-b border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 shrink-0">Lớp:</span>
                {classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedRankingClassId(cls.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 hover-zoom-btn ${
                      selectedRankingClassId === cls.id
                        ? 'bg-amber-600 text-white font-black shadow-xs'
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
                          <div className="text-[11px] text-slate-500 font-medium">
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
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-[11px] rounded-lg border border-emerald-200 hover-zoom-btn"
                          title="Cộng +1 xu"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => handleQuickAddCoin(st.id, st.name, 5)}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 font-black text-[11px] rounded-lg border border-blue-200 hover-zoom-btn"
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

      {/* 6. BANNER THÔNG TIN GIÁO VIÊN & TÁC GIẢ BẢN QUYỀN CỐ ĐỊNH (Yêu cầu 5 & 6) */}
      {(() => {
        const isManagementAccount = Boolean(isBgh || isSchoolAdmin || currentUser?.role === 'admin' || currentUser?.role === 'guest_admin');
        const officialName = getOfficialDisplayName(currentUser, allUsers);
        const greetingUserName = isManagementAccount
          ? officialName
          : (officialName || activeClass?.teacherName || teacherProfile.name);
        const displaySchoolName = currentUser?.schoolName || teacherProfile.schoolName || 'TRƯỜNG HỌC HẠNH PHÚC';
        const displayAvatar = currentUser?.avatar || teacherProfile.avatar;

        return (
          <div className="bg-white rounded-3xl p-5 border border-indigo-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4 hover-zoom-card">
            {/* Info Giáo viên: TÊN GIÁO VIÊN, ĐƠN VỊ CÔNG TÁC, NĂM HỌC */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <img
                src={displayAvatar}
                alt={greetingUserName}
                className="w-12 h-12 rounded-2xl object-cover ring-2 ring-indigo-200 shrink-0 bg-indigo-50"
              />
              <div className="space-y-0.5">
                <div className="text-xs font-black text-indigo-950 uppercase flex flex-wrap items-center gap-2">
                  <span>{isManagementAccount ? 'TÀI KHOẢN:' : 'TÊN GIÁO VIÊN:'} <strong className="text-indigo-600">{greetingUserName}</strong></span>
                  <span className="text-slate-500 hidden sm:inline">•</span>
                  <span>ĐƠN VỊ CÔNG TÁC: <strong className="text-emerald-700">{displaySchoolName}</strong></span>
                </div>
                <div className="text-[11px] text-slate-500 font-bold uppercase">
                  NĂM HỌC: <strong className="text-amber-700">{teacherProfile.academicYear || '2026–2027'}</strong>
                  {isManagementAccount ? (
                    <span className="ml-2 text-indigo-600 font-semibold">• QUẢN LÝ: {classes.length} LỚP • {students.length} HỌC SINH</span>
                  ) : activeClass ? (
                    <span className="ml-2 text-indigo-600 font-semibold">• LỚP: {activeClass.name} ({activeClass.grade})</span>
                  ) : null}
                </div>
              </div>
            </div>

        {/* Tác giả ứng dụng cố định (Yêu cầu 6) */}
        <div className="w-full md:w-auto flex flex-wrap items-center gap-2.5 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 text-xs justify-start md:justify-end">
          <div className="text-left md:text-right">
            <div className="flex items-center gap-1.5 md:justify-end">
              <span className="text-[10px] font-black text-indigo-600 block uppercase">TÁC GIẢ ỨNG DỤNG:</span>
              <span className="px-1.5 py-0.2 rounded-md bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase">CỐ ĐỊNH</span>
            </div>
            <span className="text-xs font-black text-slate-900 uppercase">{APP_AUTHOR_INFO.name}</span>
            <span className="text-[11px] text-slate-600 block font-bold uppercase">{APP_AUTHOR_INFO.schoolName}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={APP_AUTHOR_INFO.zaloUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs flex items-center gap-1 border border-blue-200 transition-colors uppercase font-mono"
            >
              <span>ZALO HỖ TRỢ: {APP_AUTHOR_INFO.zalo}</span>
            </a>
            <a
              href={APP_AUTHOR_INFO.facebook}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs flex items-center gap-1 border border-indigo-200 transition-colors uppercase"
            >
              <span>FACEBOOK</span>
            </a>
          </div>
        </div>
      </div>
        );
      })()}
    </div>
  );
};
