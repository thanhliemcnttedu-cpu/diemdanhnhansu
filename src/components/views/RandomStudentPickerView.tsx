import React, { useState, useEffect } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { 
  Sparkles, LayoutGrid, Home, ArrowLeft
} from 'lucide-react';
import { LuckyWheelView } from './LuckyWheelView';
import { FilmReelView } from './FilmReelView';
import { RocketMissionGame } from './picker/RocketMissionGame';
import { MysteryGiftBoxGame } from './picker/MysteryGiftBoxGame';
import { DuckRaceGame } from './picker/DuckRaceGame';
import { GameHomeView } from './picker/GameHomeView';
import { HeadTiltGame } from './picker/headtilt/HeadTiltGame';
import { LuckyLensGame } from './picker/LuckyLensGame';
import { BombGame } from './picker/BombGame';
import { DiceChallengeGame } from './picker/DiceChallengeGame';
import { TeamDuelGame } from './picker/TeamDuelGame';
import { ClawMachineGame } from './picker/ClawMachineGame';
import { PuzzleFlipGame } from './picker/puzzle/PuzzleFlipGame';
import { QuizStorageButton } from '../modals/QuizStorageModal';
import { QuestionBankModal } from '../modals/QuestionBankModal';
import { saveQuizBank } from '../../utils/quizParser';
import { Library } from 'lucide-react';

export type PickerGameMode = 'dashboard' | 'wheel' | 'reel' | 'rocket' | 'mystery_box' | 'duck_race' | 'head_tilt' | 'lucky_lens' | 'bomb' | 'dice' | 'team_duel' | 'claw' | 'puzzle';

const GAME_TABS: Array<{ id: PickerGameMode; icon: string; label: string; active: string; badge?: string; badgeCls?: string }> = [
  { id: 'wheel', icon: '🎡', label: 'VÒNG QUAY', active: 'bg-gradient-to-br from-indigo-600 to-violet-600' },
  { id: 'reel', icon: '🎬', label: 'CUỘN PHIM', active: 'bg-gradient-to-br from-fuchsia-600 to-purple-700' },
  { id: 'rocket', icon: '🚀', label: 'TÀU VŨ TRỤ', active: 'bg-gradient-to-br from-sky-600 to-indigo-700' },
  { id: 'mystery_box', icon: '🎁', label: 'HỘP QUÀ', active: 'bg-gradient-to-br from-rose-600 to-orange-600' },
  { id: 'duck_race', icon: '🦆', label: 'ĐUA VỊT', active: 'bg-gradient-to-br from-amber-600 to-orange-600' },
  { id: 'head_tilt', icon: '👧', label: 'QUIZ NGHIÊNG ĐẦU', active: 'bg-gradient-to-br from-purple-600 to-pink-600', badge: 'AI', badgeCls: 'bg-purple-600 text-white' },
  { id: 'lucky_lens', icon: '📸', label: 'ỐNG KÍNH', active: 'bg-gradient-to-br from-cyan-700 to-blue-700', badge: 'HOT', badgeCls: 'bg-rose-600 text-white' },
  { id: 'bomb', icon: '💣', label: 'BOM HẸN GIỜ', active: 'bg-gradient-to-br from-orange-600 to-rose-600', badge: 'MỚI', badgeCls: 'bg-emerald-600 text-white' },
  { id: 'dice', icon: '🎲', label: 'XÚC XẮC', active: 'bg-gradient-to-br from-violet-600 to-indigo-700', badge: 'MỚI', badgeCls: 'bg-emerald-600 text-white' },
  { id: 'puzzle', icon: '🧩', label: 'LẬT MẢNH GHÉP', active: 'bg-gradient-to-br from-emerald-600 to-sky-600', badge: 'MỚI', badgeCls: 'bg-emerald-600 text-white' },
  { id: 'claw', icon: '🧸', label: 'MÁY GẮP THÚ', active: 'bg-gradient-to-br from-pink-600 to-orange-600', badge: 'MỚI', badgeCls: 'bg-emerald-600 text-white' },
  { id: 'team_duel', icon: '⚔️', label: 'ĐẤU TỔ', active: 'bg-gradient-to-br from-rose-600 to-amber-600', badge: 'MỚI', badgeCls: 'bg-emerald-600 text-white' },
];

interface RandomStudentPickerViewProps {
  initialGame?: PickerGameMode;
}

export const RandomStudentPickerView: React.FC<RandomStudentPickerViewProps> = ({ 
  initialGame = 'dashboard' 
}) => {
  const { currentClassStudents, classes, activeClassId, quizBank, updateQuizBank } = useClassroom();
  // Quản lý kho câu hỏi (mở từ thanh trò chơi)
  const [isBankOpen, setIsBankOpen] = useState(false);
  const activeClass = classes.find(c => c.id === activeClassId) || classes[0];
  const [activeGame, setActiveGame] = useState<PickerGameMode>(
    (initialGame as string) === 'photo_cards' ? 'reel' : initialGame
  );

  useEffect(() => {
    if (initialGame) {
      setActiveGame(
        (initialGame as string) === 'photo_cards' ? 'reel' : initialGame
      );
    }
  }, [initialGame]);

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header: title + class info on top, then an even grid of game tiles (2 rows of 5 on desktop) */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 md:p-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-tr from-amber-600 to-rose-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase leading-tight">GỌI TÊN HỌC SINH</h1>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase">
                <span className="whitespace-nowrap px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800">LỚP {activeClass?.name || '4A1'}</span>
                <span className="whitespace-nowrap px-2.5 py-1 rounded-full bg-sky-50 text-sky-800">SĨ SỐ <span className="tabular-nums">{currentClassStudents.length}</span> HỌC SINH</span>
                <span className="whitespace-nowrap px-2.5 py-1 rounded-full bg-amber-50 text-amber-900">12 TRÒ CHƠI</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveGame('dashboard')}
              className={`min-h-10 px-3.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5 uppercase whitespace-nowrap cursor-pointer border ${activeGame === 'dashboard' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>TẤT CẢ GAME</span>
            </button>
            {/* Quản lý kho câu hỏi: soạn, nhập, chơi thử, xóa câu hỏi dùng cho các trò chơi */}
            <button
              type="button"
              onClick={() => setIsBankOpen(true)}
              className="min-h-10 px-3.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5 uppercase cursor-pointer whitespace-nowrap border bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              title="Quản lý kho câu hỏi: soạn câu mới, nhập từ tệp, chơi thử, sửa / xóa"
            >
              <Library className="w-4 h-4 shrink-0" />
              <span>Kho câu hỏi</span>
              <span className="px-1.5 rounded-md bg-emerald-600 text-white text-[12px] font-black tabular-nums">{quizBank.length}</span>
            </button>
            {/* Nơi lưu câu hỏi của tôi: cấu hình thư mục máy tính / Drive cá nhân cho bộ câu hỏi trò chơi */}
            <QuizStorageButton variant="tab" />
          </div>
        </div>

        {/* Trang "Tất cả game" đã liệt kê đủ các trò dưới dạng thẻ lớn nên ẩn thanh chọn nhanh ở đó; đang chơi một trò thì vẫn hiện để chuyển trò */}
        {activeGame !== 'dashboard' && (
        <nav className="border-t border-slate-100 bg-slate-50/70 p-3 md:p-4" aria-label="Chọn trò chơi gọi tên">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
            {GAME_TABS.map(g => {
              const on = activeGame === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGame(g.id)}
                  aria-pressed={on}
                  className={`relative min-h-[72px] px-2 py-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 text-center uppercase cursor-pointer transition-all ${on ? `${g.active} border-transparent text-white shadow-lg` : 'bg-white border-slate-200 text-slate-800 hover:border-sky-300 hover:shadow-sm'}`}
                >
                  <span className="text-2xl leading-none" aria-hidden>{g.icon}</span>
                  <span className="text-xs font-black leading-tight whitespace-nowrap">{g.label}</span>
                  {g.badge && (
                    <span className={`absolute -top-1.5 right-2 px-1.5 rounded-full text-[12px] leading-5 font-black ${g.badgeCls}`}>{g.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 0. GAME DASHBOARD HOME (GRID OF 6 GAMES)                             */}
      {/* ===================================================================== */}
      {activeGame === 'dashboard' && (
        <GameHomeView
          onSelectGame={(target) => setActiveGame(target)}
          classNameName={activeClass?.name || '4A1'}
          studentCount={currentClassStudents.length}
        />
      )}

      {/* ===================================================================== */}
      {/* 1. VÒNG QUAY MAY MẮN (LUCKY WHEEL)                                    */}
      {/* ===================================================================== */}
      {activeGame === 'wheel' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveGame('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Game Dashboard</span>
          </button>
          <LuckyWheelView />
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. CUỘN PHIM GỌI TÊN (FILM REEL)                                     */}
      {/* ===================================================================== */}
      {activeGame === 'reel' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveGame('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Game Dashboard</span>
          </button>
          <FilmReelView />
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. TÀU VŨ TRỤ KHÁM PHÁ (ROCKET LAUNCH)                               */}
      {/* ===================================================================== */}
      {activeGame === 'rocket' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveGame('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Game Dashboard</span>
          </button>
          <RocketMissionGame />
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. HỘP QUÀ BÍ MẬT (MYSTERY GIFT BOX)                                 */}
      {/* ===================================================================== */}
      {activeGame === 'mystery_box' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveGame('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Game Dashboard</span>
          </button>
          <MysteryGiftBoxGame />
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. ĐUA VỊT MAY MẮN (DUCK RACE 3D)                                     */}
      {/* ===================================================================== */}
      {activeGame === 'duck_race' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveGame('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Game Dashboard</span>
          </button>
          <DuckRaceGame />
        </div>
      )}

      {/* ===================================================================== */}
      {/* 6. QUIZ NGHIÊNG ĐẦU (HEAD-TILT AI QUIZ)                               */}
      {/* ===================================================================== */}
      {activeGame === 'head_tilt' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveGame('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Game Dashboard</span>
          </button>
          <HeadTiltGame onBackToDashboard={() => setActiveGame('dashboard')} />
        </div>
      )}

      {/* ===================================================================== */}
      {/* 7. ỐNG KÍNH MAY MẮN (LUCKY CAMERA LENS)                                */}
      {/* ===================================================================== */}
      {activeGame === 'lucky_lens' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveGame('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Game Dashboard</span>
          </button>
          <LuckyLensGame />
        </div>
      )}

      {(activeGame === 'bomb' || activeGame === 'dice' || activeGame === 'team_duel' || activeGame === 'claw' || activeGame === 'puzzle') && (
        <div className="space-y-4">
          <button type="button" onClick={() => setActiveGame('dashboard')} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer">
            <ArrowLeft className="w-4 h-4" /><span>Quay lại Game Dashboard</span>
          </button>
          {activeGame === 'bomb' && <BombGame />}
          {activeGame === 'dice' && <DiceChallengeGame />}
          {activeGame === 'team_duel' && <TeamDuelGame />}
          {activeGame === 'claw' && <ClawMachineGame />}
          {activeGame === 'puzzle' && <PuzzleFlipGame />}
        </div>
      )}

      <QuestionBankModal
        isOpen={isBankOpen}
        onClose={() => setIsBankOpen(false)}
        questions={quizBank}
        onSaveQuestions={(updated) => { updateQuizBank(updated); saveQuizBank(updated); }}
      />
    </div>
  );
};
