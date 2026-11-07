import React from 'react';
import { 
  Sparkles, Play, Award, Film, Rocket, 
  Gift, Trophy, Camera, Users, ChevronRight,
  Flame, Zap, Star, ShieldCheck
} from 'lucide-react';

export type GameDashboardTarget = 'wheel' | 'reel' | 'rocket' | 'mystery_box' | 'duck_race' | 'head_tilt' | 'lucky_lens';

interface GameItem {
  id: GameDashboardTarget;
  title: string;
  subtitle: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  gradient: string;
  ringColor: string;
  visualComponent: React.ReactNode;
}

interface GameHomeViewProps {
  onSelectGame: (game: GameDashboardTarget) => void;
  classNameName?: string;
  studentCount?: number;
}

export const GameHomeView: React.FC<GameHomeViewProps> = ({
  onSelectGame,
  classNameName = '4A1',
  studentCount = 30
}) => {
  const games: GameItem[] = [
    {
      id: 'wheel',
      title: 'VÒNG QUAY MAY MẮN',
      subtitle: '(GỌI TÊN & CHỌN NHÓM)',
      description: 'Quay số ngẫu nhiên gọi tên học sinh trả lời hoặc chia nhóm phát biểu, tích hợp cộng xu thi đua trực tiếp.',
      gradient: 'from-amber-400 via-rose-500 to-indigo-600',
      ringColor: 'ring-rose-400',
      visualComponent: (
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full p-2 bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-600 shadow-2xl flex items-center justify-center group-hover:rotate-45 transition-transform duration-700">
          <svg viewBox="0 0 100 100" className="w-full h-full rounded-full shadow-inner">
            {/* 8 colorful wheel slices */}
            <path d="M50 50 L50 0 A50 50 0 0 1 85.35 14.65 Z" fill="#3b82f6" />
            <path d="M50 50 L85.35 14.65 A50 50 0 0 1 100 50 Z" fill="#10b981" />
            <path d="M50 50 L100 50 A50 50 0 0 1 85.35 85.35 Z" fill="#f59e0b" />
            <path d="M50 50 L85.35 85.35 A50 50 0 0 1 50 100 Z" fill="#ef4444" />
            <path d="M50 50 L50 100 A50 50 0 0 1 14.65 85.35 Z" fill="#8b5cf6" />
            <path d="M50 50 L14.65 85.35 A50 50 0 0 1 0 50 Z" fill="#ec4899" />
            <path d="M50 50 L0 50 A50 50 0 0 1 14.65 14.65 Z" fill="#06b6d4" />
            <path d="M50 50 L14.65 14.65 A50 50 0 0 1 50 0 Z" fill="#eab308" />
            {/* Center Circle */}
            <circle cx="50" cy="50" r="16" fill="#dc2626" stroke="#ffffff" strokeWidth="3" />
            <text x="50" y="53" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="900">QUAY</text>
          </svg>
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-6 bg-amber-400 clip-pointer drop-shadow-md z-10"></div>
        </div>
      )
    },
    {
      id: 'reel',
      title: 'CUỘN PHIM ĐIỆN ẢNH',
      subtitle: '(35MM CINEMA REEL)',
      description: 'Dải phim quay mượt mà từ Phải sang Trái, gọi ngẫu nhiên nhiều học sinh đồng thời bốc câu hỏi thử thách.',
      gradient: 'from-purple-600 via-fuchsia-500 to-indigo-700',
      ringColor: 'ring-purple-400',
      visualComponent: (
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full p-3 bg-gradient-to-tr from-purple-800 via-fuchsia-600 to-indigo-900 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
          <div className="w-36 h-36 sm:w-42 sm:h-42 rounded-full bg-slate-900 border-4 border-slate-300 shadow-inner flex items-center justify-center relative overflow-hidden">
            {/* Film strip spool */}
            <div className="absolute inset-0 border-8 border-dashed border-slate-600 rounded-full animate-spin [animation-duration:12s]"></div>
            <div className="w-16 h-16 rounded-full bg-slate-800 border-4 border-slate-400 flex items-center justify-center shadow-md">
              <Film className="w-8 h-8 text-fuchsia-400" />
            </div>
            {/* Spool holes */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-purple-950 border border-slate-500"></div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-purple-950 border border-slate-500"></div>
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-purple-950 border border-slate-500"></div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-purple-950 border border-slate-500"></div>
          </div>
        </div>
      )
    },
    {
      id: 'rocket',
      title: 'TÀU VŨ TRỤ KHÁM PHÁ',
      subtitle: '(ROCKET SPACE MISSION)',
      description: 'Phóng phi thuyền vũ trụ bay qua các dải ngân hà kỳ thú để tìm ra nhà thám hiểm vũ trụ xuất sắc nhất.',
      badge: 'MỚI',
      badgeColor: 'bg-cyan-500 text-slate-950',
      gradient: 'from-blue-600 via-indigo-600 to-cyan-500',
      ringColor: 'ring-cyan-400',
      visualComponent: (
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full p-2 bg-gradient-to-tr from-slate-950 via-indigo-950 to-blue-900 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500 overflow-hidden">
          {/* Starfield & Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/20 via-transparent to-transparent"></div>
          <div className="relative z-10 w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-slate-900 border border-cyan-500/40 flex items-center justify-center shadow-lg group-hover:-translate-y-2 transition-transform duration-500">
            <Rocket className="w-16 h-16 sm:w-20 sm:h-20 text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.8)] -rotate-45" />
          </div>
          {/* Flame particles */}
          <div className="absolute bottom-6 right-8 w-6 h-6 rounded-full bg-amber-400/80 blur-xs animate-pulse"></div>
        </div>
      )
    },
    {
      id: 'mystery_box',
      title: 'HỘP QUÀ BÍ MẬT',
      subtitle: '(MYSTERY GIFT BOX)',
      description: 'Hàng loạt hộp quà 3D rực rỡ sắc màu ẩn chứa phần thưởng điểm thưởng và câu hỏi bí ẩn kích thích tò mò.',
      badge: 'HOT',
      badgeColor: 'bg-rose-500 text-white',
      gradient: 'from-amber-500 via-orange-500 to-rose-600',
      ringColor: 'ring-orange-400',
      visualComponent: (
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full p-3 bg-gradient-to-tr from-amber-600 via-orange-500 to-rose-600 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
          <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-200 border-4 border-amber-300 shadow-2xl flex items-center justify-center relative transform -rotate-3 group-hover:rotate-0 transition-transform">
            {/* Red Ribbon */}
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-6 bg-rose-500 shadow-sm"></div>
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-6 bg-rose-500 shadow-sm"></div>
            {/* Question Mark floating */}
            <div className="relative z-10 w-14 h-14 rounded-full bg-rose-600 text-white font-black text-3xl flex items-center justify-center shadow-lg border-2 border-white animate-bounce">
              ?
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'duck_race',
      title: 'ĐUA VỊT MAY MẮN',
      subtitle: '(DUCK RACE 3D)',
      description: 'Đường đua vịt trên mặt nước kịch tính, các chú vịt bơi lội đua tốc độ hào hứng để chọn học sinh thắng cuộc.',
      gradient: 'from-amber-400 via-yellow-400 to-orange-500',
      ringColor: 'ring-amber-400',
      visualComponent: (
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full p-3 bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-600 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
          <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-gradient-to-b from-sky-300 to-blue-400 border-4 border-white/60 shadow-inner flex items-center justify-center relative overflow-hidden">
            {/* Water waves */}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-blue-500/40 rounded-full blur-xs"></div>
            {/* Cute Yellow Duck */}
            <div className="relative z-10 text-6xl sm:text-7xl drop-shadow-lg transform group-hover:scale-110 transition-transform">
              🦆
            </div>
            {/* Water ripple */}
            <div className="absolute bottom-5 inset-x-6 h-2 rounded-full bg-white/40"></div>
          </div>
        </div>
      )
    },
    {
      id: 'head_tilt',
      title: 'QUIZ NGHIÊNG ĐẦU',
      subtitle: '(AI HEAD-TILT QUIZ)',
      description: 'Công nghệ Camera AI thông minh nhận diện khuôn mặt, học sinh nghiêng đầu sang Trái hoặc Phải để trả lời câu hỏi A/B.',
      badge: 'AI CAMERA',
      badgeColor: 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white',
      gradient: 'from-violet-600 via-purple-600 to-pink-500',
      ringColor: 'ring-purple-400',
      visualComponent: (
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full p-2.5 bg-gradient-to-tr from-purple-600 via-pink-500 to-indigo-600 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
          <div className="w-36 h-36 sm:w-42 sm:h-42 rounded-full bg-slate-900 border-4 border-white/80 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden p-2">
            {/* Camera Frame Preview with cute child illustration */}
            <div className="text-4xl sm:text-5xl mb-1 animate-pulse">
              👧
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-sky-400 text-slate-950 font-black text-[10px]">
                👈 A
              </span>
              <span className="px-2 py-0.5 rounded-md bg-orange-500 text-white font-black text-[10px]">
                B 👉
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[9px] font-bold text-emerald-400">
              <Camera className="w-2.5 h-2.5" />
              <span>Webcam Live</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'lucky_lens',
      title: 'ỐNG KÍNH MAY MẮN',
      subtitle: '(LUCKY CAMERA LENS)',
      description: 'Những bức ảnh học sinh di chuyển ngẫu nhiên trên màn hình ống kính, tạo cảm giác tò mò, hào hứng chờ xem ai sẽ được bắt trọn vào khung hình may mắn!',
      badge: 'HOT MỚI',
      badgeColor: 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white',
      gradient: 'from-cyan-500 via-blue-600 to-indigo-700',
      ringColor: 'ring-cyan-400',
      visualComponent: (
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full p-2.5 bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-700 shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
          <div className="w-36 h-36 sm:w-42 sm:h-42 rounded-full bg-slate-950 border-4 border-cyan-400 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden p-2">
            {/* Viewfinder Lens graphics */}
            <div className="absolute inset-2 rounded-full border border-dashed border-cyan-400/60 animate-spin [animation-duration:15s]" />
            <div className="w-16 h-16 rounded-full bg-slate-900 border-2 border-cyan-300 flex items-center justify-center shadow-lg relative z-10 group-hover:scale-110 transition-transform">
              <Camera className="w-8 h-8 text-cyan-300 animate-pulse" />
            </div>
            <div className="relative z-10 mt-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-mono font-black uppercase shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              <span>REC 4K</span>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      
      {/* =========================================================================
       * HERO HEADER (Page 1 trong PDF)
       * ========================================================================= */}
      <div className="text-center pt-2 pb-1">
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-red-600 uppercase tracking-tight mb-2 drop-shadow-xs">
          GAME GỌI TÊN HỌC SINH
        </h1>
        <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
          LỚP <span className="text-indigo-600 font-black">{classNameName}</span> • SĨ SỐ: <span className="text-slate-800 font-black">{studentCount} HỌC SINH</span> • 7 TRÒ CHƠI GỌI TÊN & QUIZ TƯƠNG TÁC HÀO HỨNG!
        </p>
      </div>

      {/* =========================================================================
       * 6 GAME CARDS GRID (Page 1 trong PDF)
       * Bố cục lưới 3 cột x 2 hàng tuyệt đẹp
       * ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 px-2">
        {games.map(game => (
          <div
            key={game.id}
            onClick={() => onSelectGame(game.id)}
            className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 hover:border-indigo-400/80 shadow-md hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 cursor-pointer flex flex-col items-center text-center justify-between overflow-hidden"
          >
            {/* Top Badge (if any) */}
            {game.badge && (
              <div className="absolute top-4 right-4 z-20">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${game.badgeColor || 'bg-indigo-600 text-white'}`}>
                  {game.badge}
                </span>
              </div>
            )}

            {/* Visual Circular Artwork */}
            <div className="my-2 flex items-center justify-center">
              {game.visualComponent}
            </div>

            {/* Title & Subtitle in Red as shown on Page 1 */}
            <div className="mt-4 mb-2">
              <h2 className="text-lg sm:text-xl font-black uppercase text-red-600 group-hover:text-red-700 tracking-tight transition-colors">
                {game.title}
              </h2>
              {game.subtitle && (
                <div className="text-xs sm:text-sm font-black uppercase text-red-600/90 group-hover:text-red-700 tracking-wide mt-0.5">
                  {game.subtitle}
                </div>
              )}
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed line-clamp-2 px-1 mb-5">
              {game.description}
            </p>

            {/* Play Button */}
            <button
              type="button"
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-900 group-hover:bg-gradient-to-r group-hover:from-indigo-600 group-hover:to-purple-600 text-white font-black text-xs uppercase tracking-wider shadow-md group-hover:shadow-indigo-500/25 transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>VÀO CHƠI NGAY</span>
              <ChevronRight className="w-4 h-4 ml-0.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
};
