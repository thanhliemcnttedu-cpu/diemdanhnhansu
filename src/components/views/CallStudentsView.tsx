import React, { useState, useEffect, useRef } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { Student } from '../../types';
import { 
  Sparkles, RotateCcw, Trophy, Award, Users, 
  Camera, Play, Volume2, VolumeX, Eye, ArrowRight, 
  RefreshCw, Check, Zap, Shuffle, Film, Disc
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  playFanfareSound, playCoinSound, playTickSound, 
  playCameraShutterSound, playDuckQuackSound, 
  playCardFlipSound, playWhistleSound 
} from '../../utils/audio';

import { LuckyWheelView } from './LuckyWheelView';
import { FilmReelView } from './FilmReelView';
import { LuckyLensGame } from './picker/LuckyLensGame';
import { handleAvatarImgError } from '../../utils/avatarConfig';

export type CallGameType = 'wheel' | 'reel' | 'duck_race' | 'lucky_lens';

export const CallStudentsView: React.FC<{ initialGame?: CallGameType }> = ({ initialGame = 'wheel' }) => {
  const { currentClassStudents, awardPoints, activeClassId, classes } = useClassroom();
  const [activeGame, setActiveGame] = useState<CallGameType>(
    (initialGame as string) === 'photo_cards' ? 'reel' : initialGame
  );

  const activeClass = classes.find(c => c.id === activeClassId);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/90 p-4 md:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover-zoom-card">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 text-white flex items-center justify-center font-black shadow-md shadow-amber-500/25 shrink-0">
            <Trophy className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-black text-slate-900 tracking-tight">
                Gọi Tên Học Sinh • Các Trò Chơi Ngẫu Nhiên Sôi Động
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black uppercase">
                {activeClass?.name || '4A1'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tạo không khí học tập hào hứng, công bằng và tràn ngập tiếng cười trong giờ học!
            </p>
          </div>
        </div>

        {/* 3 Game Modes Segmented Control */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80">
          <button
            onClick={() => setActiveGame('wheel')}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 hover-zoom-btn ${
              activeGame === 'wheel' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎡</span>
            <span>Vòng Quay</span>
          </button>

          <button
            onClick={() => setActiveGame('reel')}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 hover-zoom-btn ${
              activeGame === 'reel' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎞️</span>
            <span>Cuộn Phim</span>
          </button>

          <button
            onClick={() => setActiveGame('duck_race')}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 hover-zoom-btn ${
              activeGame === 'duck_race' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🦆</span>
            <span>Đua Vịt</span>
            <span className="px-1 py-0.2 bg-amber-400 text-amber-950 text-[9px] rounded font-black">HOT</span>
          </button>

          <button
            onClick={() => setActiveGame('lucky_lens')}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 hover-zoom-btn ${
              activeGame === 'lucky_lens' ? 'bg-cyan-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📸</span>
            <span>Ống Kính</span>
            <span className="px-1 py-0.2 bg-cyan-400 text-slate-950 text-[9px] rounded font-black">MỚI</span>
          </button>
        </div>
      </div>

      {/* RENDER CURRENT GAME */}
      {activeGame === 'wheel' && <LuckyWheelView />}
      {activeGame === 'reel' && <FilmReelView />}
      {activeGame === 'duck_race' && <DuckRaceGame students={currentClassStudents} onAward={awardPoints} />}
      {activeGame === 'lucky_lens' && <LuckyLensGame students={currentClassStudents} onAward={awardPoints} />}
    </div>
  );
};

/* ========================================================================= */
/* GAME 3: VÒNG QUAY ĐUA VỊT MAY MẮN (DUCK RACE DERBY)                      */
/* ========================================================================= */
interface DuckRacer {
  student: Student;
  progress: number; // 0 to 100
  lane: number;
  speed: number;
  bobOffset: number;
  color: string;
}

const DUCK_COLORS = ['#F59E0B', '#F97316', '#EC4899', '#8B5CF6', '#3B82F6', '#10B981', '#06B6D4', '#E11D48'];

const DuckRaceGame: React.FC<{ students: Student[]; onAward: (ids: string[], pts: number, reason: string) => void }> = ({ students, onAward }) => {
  const [racers, setRacers] = useState<DuckRacer[]>([]);
  const [isRacing, setIsRacing] = useState(false);
  const [winner, setWinner] = useState<Student | null>(null);
  const [runnerUp, setRunnerUp] = useState<Student | null>(null);
  const [thirdPlace, setThirdPlace] = useState<Student | null>(null);
  const [showPodium, setShowPodium] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [raceCommentary, setRaceCommentary] = useState('Chuẩn bị sẵn sàng xuất phát!');

  const animationFrameRef = useRef<number | null>(null);

  const activeStudents = students.filter(s => {
    if (selectedGroupFilter !== 'all' && (s.group || 'Tổ 1') !== selectedGroupFilter) return false;
    return true;
  });

  const setupRacers = () => {
    const list = activeStudents.length > 0 ? activeStudents : students;
    // Up to 12 ducks displayed at once for optimal visibility
    const pool = [...list].sort(() => Math.random() - 0.5).slice(0, Math.min(list.length, 12));
    const newRacers: DuckRacer[] = pool.map((s, idx) => ({
      student: s,
      progress: 0,
      lane: idx,
      speed: 0.2 + Math.random() * 0.3,
      bobOffset: Math.random() * Math.PI * 2,
      color: DUCK_COLORS[idx % DUCK_COLORS.length]
    }));
    setRacers(newRacers);
    setWinner(null);
    setRunnerUp(null);
    setThirdPlace(null);
    setShowPodium(false);
    setRaceCommentary('Các chú vịt đã vào vị trí xuất phát!');
  };

  useEffect(() => {
    setupRacers();
  }, [selectedGroupFilter, students.length]);

  const startRace = () => {
    if (isRacing || racers.length === 0) return;
    setIsRacing(true);
    setWinner(null);
    setRunnerUp(null);
    setThirdPlace(null);
    setShowPodium(false);
    playWhistleSound();
    playDuckQuackSound();

    // Reset progress
    const freshRacers = racers.map(r => ({
      ...r,
      progress: 0,
      speed: 0.25 + Math.random() * 0.35
    }));
    setRacers(freshRacers);

    const commentaryPhrases = [
      'Còi đã vang lên! Cuộc đua vịt bắt đầu!',
      'Các chú vịt đang rẽ sóng cực kỳ quyết liệt!',
      'Một chú vịt đang bứt tốc vươn lên dẫn đầu!',
      'Khoảng cách rất sít sao, ai sẽ chạm đích trước?!',
      'Đang tiến gần vạch đích! Kịch tính từng mét nước!'
    ];

    let commentaryIndex = 0;
    const interval = setInterval(() => {
      commentaryIndex = (commentaryIndex + 1) % commentaryPhrases.length;
      setRaceCommentary(commentaryPhrases[commentaryIndex]);
      playTickSound(800 + Math.random() * 400);
    }, 900);

    const finishedStudents: Student[] = [];

    const updateLoop = () => {
      setRacers(prevRacers => {
        let anyoneFinished = false;
        const updated = prevRacers.map(r => {
          // Dynamic surge physics
          const surge = Math.random() > 0.85 ? Math.random() * 0.6 : 0;
          const slow = Math.random() > 0.9 ? 0.15 : 0;
          const delta = (r.speed + surge - slow) * (0.8 + Math.random() * 0.4);
          const nextProgress = Math.min(100, r.progress + delta);

          if (nextProgress >= 100 && !finishedStudents.some(s => s.id === r.student.id)) {
            finishedStudents.push(r.student);
            anyoneFinished = true;
          }

          return {
            ...r,
            progress: nextProgress,
            bobOffset: r.bobOffset + 0.15
          };
        });

        if (finishedStudents.length >= 1 && !anyoneFinished) {
          // Keep running until top 3 or animation completes
        }

        const allFinished = updated.every(r => r.progress >= 100) || finishedStudents.length >= Math.min(3, updated.length);

        if (allFinished) {
          clearInterval(interval);
          setIsRacing(false);
          const winnerStudent = finishedStudents[0] || updated[0].student;
          const secondStudent = finishedStudents[1] || (updated[1] ? updated[1].student : null);
          const thirdStudent = finishedStudents[2] || (updated[2] ? updated[2].student : null);

          setWinner(winnerStudent);
          setRunnerUp(secondStudent);
          setThirdPlace(thirdStudent);
          setRaceCommentary(`Chúc mừng chú vịt ${winnerStudent.name} đã cán đích xuất sắc!`);
          playFanfareSound();
          confetti({ particleCount: 80, spread: 80, origin: { y: 0.6 } });
          setTimeout(() => setShowPodium(true), 600);
          return updated;
        }

        animationFrameRef.current = requestAnimationFrame(updateLoop);
        return updated;
      });
    };

    animationFrameRef.current = requestAnimationFrame(updateLoop);
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 p-5 md:p-6 shadow-xs space-y-6 hover-zoom-card">
      {/* Race Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🦆</span>
            <h3 className="text-base font-black text-slate-900">
              Đường Đua Vịt May Mắn
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Mỗi chú vịt mang tên và ảnh của học sinh. Bấm bắt đầu để xem ai bơi nhanh nhất!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            disabled={isRacing}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
          >
            <option value="all">Tất cả lớp học</option>
            <option value="Tổ 1">Tổ 1</option>
            <option value="Tổ 2">Tổ 2</option>
            <option value="Tổ 3">Tổ 3</option>
            <option value="Tổ 4">Tổ 4</option>
          </select>

          <button
            onClick={setupRacers}
            disabled={isRacing}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all hover-zoom-btn flex items-center gap-1.5"
            title="Xáo trộn lại các chú vịt"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Đổi thí sinh</span>
          </button>

          <button
            onClick={startRace}
            disabled={isRacing || racers.length === 0}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-2xl text-xs font-black shadow-md shadow-amber-500/30 transition-all hover-zoom-btn flex items-center gap-2 disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{isRacing ? 'Đang đua bứt phá...' : 'BẮT ĐẦU ĐUA VỊT'}</span>
          </button>
        </div>
      </div>

      {/* Live Commentary Banner */}
      <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-sky-50 via-indigo-50 to-blue-50 border border-sky-200 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
          <span className="font-extrabold text-sky-950">Bình luận viên:</span>
          <span className="font-bold text-sky-700 italic">{raceCommentary}</span>
        </div>
        <span className="text-[11px] font-mono font-bold text-slate-500 hidden sm:inline">
          {racers.length} Vịt đua tranh tài
        </span>
      </div>

      {/* THE RIVER CANAL (Water lanes) */}
      <div className="relative rounded-3xl bg-gradient-to-b from-sky-400 via-blue-500 to-sky-600 p-4 sm:p-6 overflow-hidden shadow-inner min-h-[380px] border-4 border-sky-300">
        {/* Animated Water Ripples Background */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        
        {/* Start Line */}
        <div className="absolute left-8 top-0 bottom-0 w-2 border-r-2 border-dashed border-white/60 pointer-events-none z-10 flex flex-col justify-around py-2">
          <span className="text-[10px] font-black uppercase text-white/80 transform -rotate-90 origin-left">XUẤT PHÁT</span>
        </div>

        {/* Finish Line (Checkered Ribbon) */}
        <div className="absolute right-12 top-0 bottom-0 w-8 bg-[repeating-conic-gradient(#000000_0%_25%,#ffffff_0%_50%)] [background-size:12px_12px] opacity-85 z-10 shadow-lg pointer-events-none flex items-center justify-center">
          <span className="bg-amber-400 text-amber-950 text-[10px] font-black px-1.5 py-4 rounded-md transform -rotate-90 whitespace-nowrap shadow-md uppercase">
            ĐÍCH
          </span>
        </div>

        {/* Duck Lanes */}
        <div className="space-y-3 relative z-20">
          {racers.map((racer, idx) => {
            const bobY = Math.sin(racer.bobOffset) * 4;
            const leftPercent = Math.min(88, Math.max(2, racer.progress * 0.86));

            return (
              <div 
                key={racer.student.id}
                className="relative h-11 bg-white/15 backdrop-blur-xs rounded-2xl border border-white/20 flex items-center px-2"
              >
                {/* Lane Number */}
                <span className="w-5 h-5 rounded-full bg-white/30 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>

                {/* Swimming Rubber Duck */}
                <div 
                  className="absolute transition-all duration-75 flex items-center gap-1.5 cursor-pointer"
                  style={{
                    left: `${leftPercent}%`,
                    transform: `translateY(${bobY}px)`
                  }}
                >
                  {/* Duck Avatar Badge */}
                  <div className="relative">
                    {/* SVG Cute Rubber Duck */}
                    <div className="w-9 h-9 rounded-full bg-amber-300 border-2 border-amber-500 shadow-md flex items-center justify-center relative overflow-hidden group-hover:scale-110 transition-transform">
                      <img 
                        src={racer.student.avatar} 
                        alt={racer.student.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => handleAvatarImgError(e, racer.student.gender, racer.student.name)}
                      />
                    </div>

                    {/* Duck Beak Icon */}
                    <span className="absolute -bottom-1 -right-1 text-sm pointer-events-none">
                      🦆
                    </span>
                  </div>

                  {/* Name Tag */}
                  <div className="bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded-lg border border-slate-200 shadow-xs flex items-center gap-1 whitespace-nowrap">
                    <span className="text-[11px] font-black text-slate-800">
                      {racer.student.name}
                    </span>
                    <span className="text-[10px] text-indigo-600 font-bold">
                      #{racer.student.stt}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* WINNER PODIUM MODAL */}
      {showPodium && winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 bg-gradient-to-br from-amber-400 via-orange-400 to-yellow-400 text-amber-950 text-center relative">
              <span className="text-4xl animate-bounce block mb-1">👑</span>
              <h3 className="text-xl font-black uppercase tracking-wide">
                QUÁN QUÂN ĐUA VỊT!
              </h3>
              <p className="text-xs font-bold opacity-90 mt-0.5">
                Vịt vàng vô địch đã cán đích đầu tiên!
              </p>
            </div>

            <div className="p-6 space-y-5 text-center">
              {/* Winner Showcase */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-amber-400 shadow-xl bg-white p-1">
                    <img 
                      src={winner.avatar} 
                      alt={winner.name} 
                      className="w-full h-full object-cover rounded-2xl" 
                      referrerPolicy="no-referrer"
                      onError={(e) => handleAvatarImgError(e, winner.gender, winner.name)}
                    />
                  </div>
                  <span className="absolute -top-3 -right-2 bg-amber-500 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-md">
                    HẠNG 1 🏆
                  </span>
                </div>

                <h4 className="text-lg font-black text-slate-900 mt-3">
                  {winner.name}
                </h4>
                <div className="text-xs font-bold text-slate-500 mt-0.5">
                  STT: #{winner.stt} • {winner.group || 'Tổ 1'} • Hiện có: {winner.points} xu
                </div>
              </div>

              {/* Runners Up Podium (2nd & 3rd) */}
              {(runnerUp || thirdPlace) && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  {runnerUp && (
                    <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-2 text-left">
                      <span className="text-lg">🥈</span>
                      <img src={runnerUp.avatar} alt={runnerUp.name} className="w-8 h-8 rounded-xl object-cover bg-white" onError={(e) => handleAvatarImgError(e, runnerUp.gender, runnerUp.name)} />
                      <div className="truncate text-xs">
                        <div className="font-black text-slate-800 truncate">{runnerUp.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold">Hạng 2</div>
                      </div>
                    </div>
                  )}

                  {thirdPlace && (
                    <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-2 text-left">
                      <span className="text-lg">🥉</span>
                      <img src={thirdPlace.avatar} alt={thirdPlace.name} className="w-8 h-8 rounded-xl object-cover bg-white" onError={(e) => handleAvatarImgError(e, thirdPlace.gender, thirdPlace.name)} />
                      <div className="truncate text-xs">
                        <div className="font-black text-slate-800 truncate">{thirdPlace.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold">Hạng 3</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reward Actions */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => {
                    onAward([winner.id], 5, 'Vô địch đua vịt');
                    playCoinSound();
                    setShowPodium(false);
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-md shadow-amber-500/25 hover-zoom-btn"
                >
                  +5 Xu Quán Quân
                </button>
                <button
                  onClick={() => {
                    onAward([winner.id], 2, 'Khen thưởng đua vịt');
                    playCoinSound();
                    setShowPodium(false);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-600/25 hover-zoom-btn"
                >
                  +2 Xu Khen Thưởng
                </button>
                <button
                  onClick={() => setShowPodium(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ========================================================================= */
/* GAME 4: GỌI TÊN BẰNG HÌNH ẢNH (MYSTERY PHOTO CARDS)                      */
/* ========================================================================= */
const PhotoCardsGame: React.FC<{ students: Student[]; onAward: (ids: string[], pts: number, reason: string) => void }> = ({ students, onAward }) => {
  const [revealedStudentIds, setRevealedStudentIds] = useState<string[]>([]);
  const [selectedWinner, setSelectedWinner] = useState<Student | null>(null);
  const [isShuffling, setIsShuffling] = useState(false);
  const [isAutoPicking, setIsAutoPicking] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');

  const filteredStudents = students.filter(s => {
    if (selectedGroupFilter !== 'all' && (s.group || 'Tổ 1') !== selectedGroupFilter) return false;
    return true;
  });

  const handleShuffle = () => {
    setIsShuffling(true);
    setRevealedStudentIds([]);
    setSelectedWinner(null);
    playCardFlipSound();
    setTimeout(() => {
      setIsShuffling(false);
    }, 600);
  };

  const handleCardClick = (student: Student) => {
    if (isAutoPicking) return;
    playCardFlipSound();
    setRevealedStudentIds(prev => [...prev, student.id]);
    setSelectedWinner(student);
    playFanfareSound();
    confetti({ particleCount: 50, spread: 60 });
  };

  const handleAutoPick = () => {
    if (isAutoPicking || filteredStudents.length === 0) return;
    setIsAutoPicking(true);
    setSelectedWinner(null);
    let speed = 60;
    let iterations = 0;
    const maxIterations = 25 + Math.floor(Math.random() * 10);

    const step = () => {
      const randIdx = Math.floor(Math.random() * filteredStudents.length);
      setHighlightedIndex(randIdx);
      playTickSound(600 + (iterations * 15));
      iterations++;

      if (iterations < maxIterations) {
        speed += 12;
        setTimeout(step, speed);
      } else {
        const winningStudent = filteredStudents[randIdx];
        setRevealedStudentIds(prev => [...prev, winningStudent.id]);
        setSelectedWinner(winningStudent);
        setIsAutoPicking(false);
        setHighlightedIndex(null);
        playFanfareSound();
        confetti({ particleCount: 70, spread: 70 });
      }
    };

    step();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 p-5 md:p-6 shadow-xs space-y-6 hover-zoom-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎴</span>
            <h3 className="text-base font-black text-slate-900">
              Gọi Tên Bằng Thẻ Hình Ảnh Bí Mật
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Các thẻ bài úp xuống. Bấm vào bất kỳ thẻ nào hoặc chọn "Lật Tự Động" để khám phá học sinh may mắn!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            disabled={isAutoPicking}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
          >
            <option value="all">Tất cả lớp học</option>
            <option value="Tổ 1">Tổ 1</option>
            <option value="Tổ 2">Tổ 2</option>
            <option value="Tổ 3">Tổ 3</option>
            <option value="Tổ 4">Tổ 4</option>
          </select>

          <button
            onClick={handleShuffle}
            disabled={isAutoPicking}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all hover-zoom-btn flex items-center gap-1.5"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Úp lại & Xáo thẻ</span>
          </button>

          <button
            onClick={handleAutoPick}
            disabled={isAutoPicking || filteredStudents.length === 0}
            className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-black shadow-md shadow-purple-600/30 transition-all hover-zoom-btn flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{isAutoPicking ? 'Đang chọn thẻ...' : 'Lật Ngẫu Nhiên'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Mystery Cards */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 ${isShuffling ? 'opacity-40 scale-95 transition-all' : ''}`}>
        {filteredStudents.map((st, idx) => {
          const isRevealed = revealedStudentIds.includes(st.id);
          const isHighlighted = highlightedIndex === idx;

          return (
            <div
              key={st.id}
              onClick={() => !isRevealed && handleCardClick(st)}
              className={`h-40 rounded-2xl p-2.5 transition-all duration-300 cursor-pointer relative overflow-hidden select-none border-2 ${
                isHighlighted
                  ? 'border-amber-400 ring-4 ring-amber-300 scale-105 z-20 shadow-xl'
                  : isRevealed
                    ? 'border-indigo-400 bg-gradient-to-b from-indigo-50 via-white to-sky-50 shadow-md'
                    : 'border-indigo-200 bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700 hover:-translate-y-1.5 hover:shadow-lg shadow-sm'
              }`}
            >
              {isRevealed ? (
                /* Card Front (Revealed Student) */
                <div className="flex flex-col items-center justify-between h-full text-center">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-indigo-200 bg-white shadow-xs shrink-0">
                    <img src={st.avatar} alt={st.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => handleAvatarImgError(e, st.gender, st.name)} />
                  </div>
                  <div className="w-full truncate px-1">
                    <div className="text-xs font-black text-slate-900 truncate">{st.name}</div>
                    <div className="text-[10px] text-indigo-600 font-bold">#{st.stt} • {st.group || 'Tổ 1'}</div>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-black rounded-lg">
                    🪙 {st.points} xu
                  </span>
                </div>
              ) : (
                /* Card Back (Mystery Question / School Logo Pattern) */
                <div className="flex flex-col items-center justify-center h-full text-white text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/40 flex items-center justify-center shadow-inner mb-2">
                    <span className="text-2xl animate-pulse">❓</span>
                  </div>
                  <span className="text-[11px] font-black tracking-wider text-indigo-100 uppercase">
                    THẺ SỐ {st.stt}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Winner Spotlight Popup */}
      {selectedWinner && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <img src={selectedWinner.avatar} alt={selectedWinner.name} className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-400 bg-white shadow-md shrink-0" onError={(e) => handleAvatarImgError(e, selectedWinner.gender, selectedWinner.name)} />
            <div>
              <span className="text-[10px] font-black uppercase text-amber-700">HỌC SINH ĐƯỢC CHỌN QUA THẺ ẢNH</span>
              <h4 className="text-base font-black text-slate-900">{selectedWinner.name}</h4>
              <p className="text-xs text-slate-500 font-semibold">STT: #{selectedWinner.stt} • {selectedWinner.group || 'Tổ 1'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                onAward([selectedWinner.id], 3, 'Khen thưởng qua thẻ ảnh');
                playCoinSound();
                setSelectedWinner(null);
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-xs hover-zoom-btn"
            >
              +3 Xu Khen Thưởng
            </button>
            <button
              onClick={() => setSelectedWinner(null)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


