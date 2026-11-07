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

export type PickerGameMode = 'dashboard' | 'wheel' | 'reel' | 'rocket' | 'mystery_box' | 'duck_race' | 'head_tilt' | 'lucky_lens';

interface RandomStudentPickerViewProps {
  initialGame?: PickerGameMode;
}

export const RandomStudentPickerView: React.FC<RandomStudentPickerViewProps> = ({ 
  initialGame = 'dashboard' 
}) => {
  const { currentClassStudents, classes, activeClassId } = useClassroom();
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
      {/* Main Top Header & Mode Navigation */}
      <div className="bg-white rounded-3xl p-4 md:p-5 border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 to-rose-500 text-white flex items-center justify-center font-black shadow-md shadow-amber-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                GỌI TÊN HỌC SINH
              </h1>
              <p className="text-xs text-slate-500 font-semibold uppercase">
                LỚP <span className="text-indigo-600 font-black">{activeClass?.name || '4A1'}</span> • SĨ SỐ: {currentClassStudents.length} HỌC SINH • 6 TRÒ CHƠI GỌI TÊN & QUIZ HÀO HỨNG!
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl w-full lg:w-auto">
          {/* Tab 0: Game Dashboard Home */}
          <button
            onClick={() => setActiveGame('dashboard')}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn uppercase cursor-pointer ${
              activeGame === 'dashboard'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>TẤT CẢ GAME</span>
          </button>

          {/* Tab 1: Vòng quay */}
          <button
            onClick={() => setActiveGame('wheel')}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn uppercase cursor-pointer ${
              activeGame === 'wheel'
                ? 'bg-white text-indigo-700 shadow-sm shadow-indigo-500/10'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎡</span>
            <span>VÒNG QUAY</span>
          </button>

          {/* Tab 2: Cuộn phim */}
          <button
            onClick={() => setActiveGame('reel')}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn uppercase cursor-pointer ${
              activeGame === 'reel'
                ? 'bg-white text-indigo-700 shadow-sm shadow-indigo-500/10'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎬</span>
            <span>CUỘN PHIM</span>
          </button>

          {/* Tab 3: Tàu vũ trụ */}
          <button
            onClick={() => setActiveGame('rocket')}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn uppercase cursor-pointer ${
              activeGame === 'rocket'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🚀</span>
            <span>TÀU VŨ TRỤ</span>
          </button>

          {/* Tab 4: Hộp quà */}
          <button
            onClick={() => setActiveGame('mystery_box')}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn uppercase cursor-pointer ${
              activeGame === 'mystery_box'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎁</span>
            <span>HỘP QUÀ</span>
          </button>

          {/* Tab 5: Đua vịt */}
          <button
            onClick={() => setActiveGame('duck_race')}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn uppercase cursor-pointer ${
              activeGame === 'duck_race'
                ? 'bg-amber-400 text-amber-950 shadow-md shadow-amber-400/30'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🦆</span>
            <span>ĐUA VỊT</span>
          </button>

          {/* Tab 6: Quiz Nghiêng Đầu (MỚI) */}
          <button
            onClick={() => setActiveGame('head_tilt')}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn uppercase cursor-pointer ${
              activeGame === 'head_tilt'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                : 'text-purple-700 hover:text-purple-900 bg-purple-50'
            }`}
          >
            <span>👧</span>
            <span>QUIZ NGHIÊNG ĐẦU</span>
            <span className="px-1.5 py-0.2 bg-amber-400 text-purple-950 rounded-md text-[9px] font-black">AI</span>
          </button>

          {/* Tab 7: Ống Kính May Mắn (HOT) */}
          <button
            onClick={() => setActiveGame('lucky_lens')}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all hover-zoom-btn uppercase cursor-pointer ${
              activeGame === 'lucky_lens'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-cyan-700 hover:text-cyan-900 bg-cyan-50'
            }`}
          >
            <span>📸</span>
            <span>ỐNG KÍNH</span>
            <span className="px-1.5 py-0.2 bg-cyan-400 text-slate-950 rounded-md text-[9px] font-black">HOT</span>
          </button>
        </div>
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

    </div>
  );
};
