import React, { useState, useEffect, useRef } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';
import { Student, QuestionItem } from '../../../types';
import { 
  Rocket, Play, Award, RotateCcw, Sparkles, Check, 
  HelpCircle, ChevronRight, Volume2, ShieldCheck, Compass, Edit3
} from 'lucide-react';
import { 
  playTickSound, 
  playFanfareSound, 
  playCoinSound, 
  playRocketLaunchSound,
  triggerCorrectCelebration, 
  triggerWrongFeedback 
} from '../../../utils/audio';
import confetti from 'canvas-confetti';
import { QuestionBankModal } from '../../modals/QuestionBankModal';
import { loadQuizBank, saveQuizBank } from '../../../utils/quizParser';

import { handleAvatarImgError } from '../../../utils/avatarConfig';
import { CalledStudentModal } from './CalledStudentModal';
import { useFairCall } from './useFairCall';
import { QuestionChallengeModal } from './QuestionChallengeModal';
import { QuestionAudioButton } from './QuestionAudioButton';
import { useQuizSelection, QuizSelectionChip } from './QuizSetPicker';
// Planet positions on the stage (% of width / height); the launch pad is bottom centre
const PLANET_SLOTS: Array<[number, number]> = [[14, 30], [34, 20], [56, 28], [78, 20], [90, 38], [22, 56], [44, 48], [68, 54], [86, 66]];
const PLANET_RINGS = ['from-sky-400 to-indigo-500', 'from-amber-300 to-orange-500', 'from-emerald-300 to-teal-500', 'from-rose-300 to-pink-500', 'from-violet-300 to-purple-500', 'from-cyan-300 to-blue-500', 'from-lime-300 to-green-500', 'from-fuchsia-300 to-rose-500', 'from-yellow-300 to-amber-500'];

const PLANET_SLOTS_SMALL: Array<[number, number]> = [[20, 28], [50, 20], [80, 28], [24, 56], [50, 48], [78, 58]];
const slotsFor = (n: number) => (n <= 6 ? PLANET_SLOTS_SMALL : PLANET_SLOTS);

/** Up to 9 students (6 on phones) that become planets on the stage (the called student is always one of them) */
function samplePlanets(list: Student[], must?: Student): Student[] {
  const rest = list.filter(s => !must || s.id !== must.id).sort(() => Math.random() - 0.5).slice(0, (typeof window !== 'undefined' && window.innerWidth < 640 ? 6 : 9) - (must ? 1 : 0));
  return (must ? [...rest, must] : rest).sort(() => Math.random() - 0.5);
}

const ROCKET_CSS = `
@keyframes rkFlame{0%,100%{transform:scaleY(1) scaleX(1)}50%{transform:scaleY(1.45) scaleX(.85)}}
@keyframes rkShake{0%,100%{transform:translate(0,0)}25%{transform:translate(-2px,1px)}75%{transform:translate(2px,-1px)}}
@keyframes rkFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes rkPop{0%{transform:scale(.3);opacity:0}30%{transform:scale(1.25);opacity:1}100%{transform:scale(1);opacity:.95}}
@keyframes rkRing{0%{box-shadow:0 0 0 0 rgba(251,191,36,.8)}100%{box-shadow:0 0 0 22px rgba(251,191,36,0)}}
.rk-flame{transform-origin:top center;animation:rkFlame .12s linear infinite}
.rk-shake{animation:rkShake .08s linear infinite}
.rk-float{animation:rkFloat 3.2s ease-in-out infinite}
.rk-pop{animation:rkPop .7s ease-out both}
.rk-ring{animation:rkRing .7s ease-out infinite}
@media (prefers-reduced-motion:reduce){.rk-flame,.rk-shake,.rk-float,.rk-pop,.rk-ring{animation:none}}
`;

export const RocketMissionGame: React.FC = () => {
  const { currentClassStudents, awardPoints, quizBank, updateQuizBank } = useClassroom();

  // Mode: 'random' | 'coins' | 'quiz'
  const [callMode, setCallMode] = useState<'random' | 'coins' | 'quiz'>('random');
  const [spinDuration, setSpinDuration] = useState<number>(4); // 4 seconds standard

  // Game state
  const [isLaunching, setIsLaunching] = useState(false);
  const [winner, setWinner] = useState<Student | null>(null);
  const [rewardXu, setRewardXu] = useState(2);
  const [hasAwarded, setHasAwarded] = useState(false);
  // Hộp chúc mừng kiểu Ống kính
  const [showWinnerPopup, setShowWinnerPopup] = useState(false);

  // Question challenge state (For mode 3: Gọi tên + Trả lời câu hỏi)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionItem | null>(null);
  const [quizDrawToken, setQuizDrawToken] = useState(0);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);
  const [editTargetQuestion, setEditTargetQuestion] = useState<QuestionItem | null>(null);
  // Chế độ câu hỏi: giáo viên chọn kho + bộ câu hỏi trước khi chơi; chỉ bốc câu trong phần đã chọn
  const quizSel = useQuizSelection(() => { setEditTargetQuestion(null); setIsQuestionBankOpen(true); });
  const quizPool = quizSel.pool;

  // Exclude option
  const [autoExclude, setAutoExclude] = useState(true);
  // Shared fair-call log: students called in the current round (any game) are skipped while auto-exclude is on
  const fair = useFairCall();
  const excludedIds = autoExclude ? fair.calledIds : [];

  const pool = currentClassStudents.filter(s => !excludedIds.includes(s.id));
  const activeList = pool.length > 0 ? pool : currentClassStudents;

  // Sky canvas: stars + drifting clouds; everything scrolls much faster while the rocket flies
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flyRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const stars: Array<{ x: number; y: number; size: number; speed: number; opacity: number }> = [];
    const clouds: Array<{ x: number; y: number; w: number; speed: number }> = [];

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 420;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 70; i++) stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() * 2 + 0.6, speed: Math.random() * 0.5 + 0.2, opacity: Math.random() * 0.7 + 0.3 });
    for (let i = 0; i < 6; i++) clouds.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, w: 70 + Math.random() * 90, speed: 0.15 + Math.random() * 0.25 });

    const render = () => {
      const boost = flyRef.current ? 9 : 1;
      // Bright day-to-dusk sky (the app never uses dark backgrounds)
      const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
      sky.addColorStop(0, '#6366f1');
      sky.addColorStop(0.45, '#7dd3fc');
      sky.addColorStop(1, '#fef3c7');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      clouds.forEach(c => {
        c.y += c.speed * boost;
        if (c.y > canvas.height + 40) { c.y = -40; c.x = Math.random() * canvas.width; }
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w / 2, c.w / 5, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x - c.w / 4, c.y + 6, c.w / 3, c.w / 6, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + c.w / 4, c.y + 6, c.w / 3, c.w / 6, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      stars.forEach(s => {
        s.y += s.speed * boost;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        if (boost > 1) ctx.fillRect(s.x, s.y, s.size, s.size * 6);   // streaks while flying
        else { ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill(); }
      });
      animId = requestAnimationFrame(render);
    };

    render();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  // ---- Launch sequence: 3-2-1 countdown, lift-off, hop from planet to planet, land on the called student's planet
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)); flyRef.current = false; }, []);

  const [planets, setPlanets] = useState<Student[]>(() => samplePlanets(currentClassStudents));
  const [phase, setPhase] = useState<'idle' | 'count' | 'fly' | 'landed'>('idle');
  const [count, setCount] = useState(0);
  const [hot, setHot] = useState(-1);                       // planet the rocket has just reached
  const [hopMs, setHopMs] = useState(0);
  const [rocket, setRocket] = useState({ x: 50, y: 88, rot: 0 });
  useEffect(() => { if (phase === 'idle' || phase === 'landed') setPlanets(samplePlanets(currentClassStudents)); }, [currentClassStudents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const launchRocket = () => {
    if (isLaunching || activeList.length === 0) return;

    setIsLaunching(true);
    setWinner(null);
    setShowWinnerPopup(false);
    setHasAwarded(false);

    const target = activeList[Math.floor(Math.random() * activeList.length)];
    const ps = samplePlanets(currentClassStudents, target); // decoys come from the whole class, only the target obeys the fair round
    const tIdx = ps.findIndex(s => s.id === target.id);
    setPlanets(ps); setHot(-1); setPhase('count'); setRocket({ x: 50, y: 88, rot: 0 }); setHopMs(0);

    const land = () => {
      flyRef.current = false;
      setHot(tIdx); setPhase('landed'); setHopMs(600);
      setRocket(r => ({ ...r, rot: Math.round(r.rot / 360) * 360 }));
      setWinner(target); setIsLaunching(false);
      triggerCorrectCelebration();
      fair.markCalled(target.id, 'rocket');
      confetti({ particleCount: 110, spread: 90, origin: { y: 0.45 } });
      later(() => setShowWinnerPopup(true), 1000);
    };

    const liftoff = () => {
      setPhase('fly'); flyRef.current = true;
      try { playRocketLaunchSound(); } catch { /* ignore */ }
      const T = spinDuration * 1000;
      const H = Math.max(4, Math.min(9, Math.round(T / 650)));
      const route: number[] = [];
      for (let i = 0; i < H - 1; i++) {
        let k = Math.floor(Math.random() * ps.length);
        let guard = 0;
        while (ps.length > 2 && guard++ < 30 && (k === route[route.length - 1] || k === tIdx)) k = Math.floor(Math.random() * ps.length);
        route.push(k);
      }
      route.push(tIdx);
      // hops get slower towards the end (suspense)
      const w = route.map((_, i) => 1 + 1.8 * (i / Math.max(1, H - 1)));
      const sum = w.reduce((a, b) => a + b, 0);
      const dur = w.map(x => Math.max(260, (T * x) / sum));
      let prev = { x: 50, y: 88 }; let prevRot = 0; let at = 0;
      route.forEach((pi, i) => {
        const d = dur[i]; const start = at; at += d;
        later(() => {
          const [px, py] = slotsFor(ps.length)[pi];
          const ty = py + 9; // park just below the planet
          let rot = (Math.atan2((px - prev.x) * 1.8, -(ty - prev.y)) * 180) / Math.PI;
          while (rot - prevRot > 180) rot -= 360;
          while (rot - prevRot < -180) rot += 360;
          prevRot = rot; prev = { x: px, y: ty };
          setHopMs(d); setRocket({ x: px, y: ty, rot });
          if (i < route.length - 1) later(() => { setHot(pi); playTickSound(650 + i * 70); }, d * 0.82);
        }, start);
      });
      later(land, at + 80);
    };

    let n = 3;
    setCount(3); playTickSound(600);
    const tick = () => {
      n--;
      if (n > 0) { setCount(n); playTickSound(600 + (3 - n) * 140); later(tick, 700); }
      else { setCount(0); liftoff(); }
    };
    later(tick, 700);
  };

  const handleAwardCoins = (amount = rewardXu) => {
    if (!winner || hasAwarded) return;
    awardPoints([winner.id], amount, 'Thưởng trò chơi Tàu Vũ Trụ Khám Phá');
    playCoinSound();
    setHasAwarded(true);
    confetti({ particleCount: 50, spread: 60 });
  };

  // Mode 3: draw a random question from the chosen set and show it wide-screen
  const drawQuestion = () => {
    if (quizPool.length === 0) { quizSel.request(); return; }
    setQuizDrawToken(n => n + 1);
    setIsQuizOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP CONTROL BAR: 3 CALL MODES + SPIN DURATION (4s) */}
      <div className="bg-white rounded-3xl p-4 md:p-5 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:flex-wrap lg:items-center justify-between gap-4 text-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-bold">
              <Rocket className="w-5 h-5 text-amber-300" />
            </span>
            <h2 className="text-base md:text-lg font-black uppercase tracking-wide">
              TÀU VŨ TRỤ KHÁM PHÁ
            </h2>
          </div>
          <p className="text-xs text-indigo-700 font-medium mt-0.5">
            Đếm ngược, phóng tàu, bay qua các hành tinh và hạ cánh xuống hành tinh của bạn may mắn
          </p>
        </div>

        {/* 3 Call Modes Switcher (User request: 1. Ngẫu nhiên, 2. Tặng xu, 3. Trả lời câu hỏi) */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setCallMode('random')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer uppercase ${
              callMode === 'random' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Gọi Ngẫu Nhiên
          </button>
          <button
            type="button"
            onClick={() => setCallMode('coins')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer uppercase ${
              callMode === 'coins' ? 'bg-amber-500 text-amber-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Gọi + Tặng Xu
          </button>
          <button
            type="button"
            onClick={() => quizSel.request(() => setCallMode('quiz'))}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer uppercase ${
              callMode === 'quiz' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. Gọi + Trả Lời Câu Hỏi
          </button>
        </div>

        {callMode === 'quiz' && (
          <div className="w-full lg:basis-full lg:order-last"><QuizSelectionChip label={quizSel.label} count={quizPool.length} onChange={() => quizSel.request()} /></div>
        )}

        {/* Duration selection (User request: lựa chọn 4 giây) */}
        <div className="flex items-center gap-2 bg-slate-100/80 px-3 py-1.5 rounded-2xl border border-slate-200">
          <span className="text-[12px] font-bold text-slate-600">Thời gian quay:</span>
          <select
            value={spinDuration}
            onChange={(e) => setSpinDuration(parseInt(e.target.value) || 4)}
            className="bg-transparent text-xs font-black text-amber-700 focus:outline-none cursor-pointer"
          >
            <option value={3} className="bg-white text-slate-800">3 giây</option>
            <option value={4} className="bg-white text-slate-800">4 giây (Chuẩn)</option>
            <option value={5} className="bg-white text-slate-800">5 giây</option>
            <option value={6} className="bg-white text-slate-800">6 giây</option>
          </select>
        </div>
      </div>

      {/* 2. MAIN SPACE LAUNCH STAGE */}
      <div className="bg-white rounded-3xl border-2 border-indigo-300 shadow-xl overflow-hidden select-none">
        <style>{ROCKET_CSS}</style>
        <div className="relative h-[380px] md:h-[440px] overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* Who the rocket has reached right now */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 max-w-[92%]">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/95 border-2 border-indigo-300 rounded-full shadow-md text-sm font-black text-slate-900 whitespace-nowrap overflow-hidden">
              <Rocket className="w-4 h-4 text-indigo-700 shrink-0" />
              <span className="truncate">
                {phase === 'idle' ? `Sẵn sàng khám phá • còn ${activeList.length} bạn chưa được gọi` : phase === 'count' ? 'Chuẩn bị phóng…' : planets[hot] ? (phase === 'landed' ? `Hạ cánh: ${planets[hot].name}` : `Đang bay qua: ${planets[hot].name}`) : 'Cất cánh!'}
              </span>
            </div>
          </div>

          {/* Planets = students */}
          {planets.map((st, i) => {
            const [x, y] = slotsFor(planets.length)[i];
            const isHot = hot === i;
            const isWin = phase === 'landed' && isHot;
            return (
              <div key={st.id} className="absolute z-10" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }}>
                <div className={`${phase === 'idle' ? 'rk-float' : ''}`} style={{ animationDelay: `${i * 0.35}s` }}>
                  <div className={`relative mx-auto w-fit rounded-full p-1 bg-gradient-to-br ${PLANET_RINGS[i % PLANET_RINGS.length]} shadow-lg transition-transform duration-300 ${isWin ? 'scale-[1.6]' : isHot ? 'scale-125 rk-ring' : ''} ${phase !== 'idle' && !isHot ? 'opacity-70' : ''}`}>
                    <img src={st.avatar} alt={st.name} referrerPolicy="no-referrer" onError={e => handleAvatarImgError(e, st.gender, st.name)}
                      className="w-11 h-11 md:w-14 md:h-14 rounded-full object-cover border-2 border-white" />
                    {isWin && <span className="absolute -top-5 -right-1 text-2xl" aria-hidden>🚩</span>}
                  </div>
                  <p className={`mt-1 mx-auto max-w-[88px] md:max-w-[110px] truncate text-center text-[12px] font-black leading-tight px-1.5 py-0.5 rounded-full ${isHot ? 'bg-amber-300 text-slate-900' : 'bg-white/85 text-slate-800'}`}>{st.name}</p>
                </div>
              </div>
            );
          })}

          {/* Launch pad */}
          <div className="absolute z-10 left-1/2 -translate-x-1/2 bottom-2 w-28 h-3 rounded-full bg-gradient-to-r from-slate-300 via-slate-100 to-slate-300 shadow-md" aria-hidden />

          {/* Rocket */}
          <div className={`absolute z-30 ${phase === 'count' ? 'rk-shake' : ''}`}
            style={{ left: `${rocket.x}%`, top: `${rocket.y}%`, transform: `translate(-50%,-50%) rotate(${rocket.rot}deg)`, transition: `left ${hopMs}ms cubic-bezier(.45,.05,.3,1), top ${hopMs}ms cubic-bezier(.45,.05,.3,1), transform ${Math.min(hopMs, 500)}ms ease-out` }}
            aria-hidden>
            <svg viewBox="0 0 48 72" className="w-10 h-14 md:w-12 md:h-[70px] drop-shadow-lg block">
              <path d="M24 2 C34 14 38 30 36 52 H12 C10 30 14 14 24 2Z" fill="#ffffff" stroke="#4f46e5" strokeWidth="2" />
              <path d="M24 2 C29 8 32 14 33 20 H15 C16 14 19 8 24 2Z" fill="#ef4444" />
              <circle cx="24" cy="32" r="6" fill="#38bdf8" stroke="#4f46e5" strokeWidth="2" />
              <path d="M12 40 L2 58 L12 54Z" fill="#f43f5e" />
              <path d="M36 40 L46 58 L36 54Z" fill="#f43f5e" />
              <rect x="18" y="52" width="12" height="6" rx="2" fill="#94a3b8" />
            </svg>
            {(phase === 'count' || phase === 'fly') && (
              <div className="absolute left-1/2 -translate-x-1/2 top-[92%] pointer-events-none">
                <div className={`rk-flame mx-auto rounded-b-full bg-gradient-to-b from-amber-200 via-orange-500 to-transparent ${phase === 'fly' ? 'w-6 h-14' : 'w-4 h-8'}`} />
              </div>
            )}
          </div>

          {/* Countdown */}
          {phase === 'count' && count > 0 && (
            <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
              <span key={count} className="rk-pop text-[110px] leading-none font-black text-white drop-shadow-[0_6px_0_rgba(79,70,229,0.9)]" aria-live="assertive">{count}</span>
            </div>
          )}
        </div>

        {/* Launch Trigger Button */}
        <div className="p-3 md:p-4 bg-gradient-to-b from-white to-indigo-50">
          <button
            onClick={launchRocket}
            disabled={isLaunching || activeList.length === 0}
            className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 text-white font-black text-sm md:text-base rounded-2xl shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2.5 transition-all hover-zoom-btn disabled:opacity-60 uppercase cursor-pointer"
          >
            <Play className={`w-5 h-5 fill-white ${isLaunching ? 'animate-spin' : ''}`} />
            <span>{phase === 'count' ? `ĐẾM NGƯỢC ${count || ''}…` : isLaunching ? '🚀 PHI THUYỀN ĐANG KHÁM PHÁ…' : `🚀 BẤM PHÓNG TÀU VŨ TRỤ (${spinDuration} GIÂY)`}</span>
          </button>
        </div>
      </div>

      {/* 3. WINNER BANNER & 3 CALL MODES ACTION */}
      <CalledStudentModal
        open={showWinnerPopup && Boolean(winner)}
        student={winner}
        title="Phi thuyền đáp xuống thành công!"
        icon={<Rocket className="w-5 h-5 text-amber-200 shrink-0" />}
        badge="KHÁM PHÁ"
        message={winner ? <>Phi thuyền đã đáp xuống hành tinh của <strong className="text-slate-900">{winner.name}</strong>. Chúc mừng em!</> : undefined}
        onAward={callMode === 'quiz' ? undefined : (pts) => handleAwardCoins(pts)}
        awarded={hasAwarded}
        secondaryAction={callMode === 'quiz' ? { label: 'Bốc câu hỏi', icon: <Sparkles className="w-4 h-4" />, onClick: () => { setShowWinnerPopup(false); drawQuestion(); } } : undefined}
        continueLabel={callMode === 'quiz' ? 'Để sau' : 'Tiếp tục gọi em khác'}
        onClose={() => {
          setShowWinnerPopup(false);
          if (callMode !== 'quiz') { setWinner(null); setCurrentQuestion(null); }
        }}
      />
      {/* Thẻ dưới khu chơi: chỉ dùng cho chế độ câu hỏi */}
      {winner && (callMode as string) === 'quiz' && (
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-amber-50 border-2 border-indigo-300 rounded-3xl p-5 md:p-6 shadow-md space-y-4 animate-in fade-in zoom-in-95 hover-zoom-card">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="relative shrink-0">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-4 border-indigo-500 bg-white shadow-2xl ring-4 ring-amber-400/70 aspect-square">
                  <img 
                    src={winner.avatar} onError={(e) => handleAvatarImgError(e, winner?.gender, winner?.name)} 
                    alt={winner.name} 
                    className="w-full h-full object-cover object-center rounded-full"
                  />
                </div>
                <span className="absolute -bottom-1 -right-1 px-2.5 py-0.5 bg-indigo-600 text-white font-black text-xs rounded-full shadow-md">
                  #{winner.stt}
                </span>
              </div>

              <div>
                <div className="text-xs font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 justify-center sm:justify-start">
                  <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
                  <span>PHI THUYỀN ĐÁP XUỐNG THÀNH CÔNG!</span>
                </div>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 mt-0.5">
                  {winner.name}
                </h3>
                <p className="text-xs text-slate-600 font-medium">
                  {winner.gender} • {winner.group || 'Tổ 1'} • Hiện có: <strong className="text-amber-800 font-black">{winner.points} xu</strong>
                </p>
              </div>
            </div>

            {/* Mode Actions */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Mode 2: Gọi + Tặng xu */}
              {callMode === 'coins' && (
                <>
                  <select
                    value={rewardXu}
                    onChange={(e) => setRewardXu(parseInt(e.target.value) || 2)}
                    className="px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-amber-900 focus:outline-none shadow-2xs"
                  >
                    <option value={1}>+1 xu</option>
                    <option value={2}>+2 xu</option>
                    <option value={5}>+5 xu</option>
                    <option value={10}>+10 xu</option>
                  </select>

                  <button
                    onClick={() => handleAwardCoins(rewardXu)}
                    disabled={hasAwarded}
                    className={`px-5 py-2.5 rounded-2xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all hover-zoom-btn uppercase ${
                      hasAwarded
                        ? 'bg-emerald-700 text-white'
                        : 'bg-amber-700 hover:bg-amber-800 text-white'
                    }`}
                  >
                    {hasAwarded ? <Check className="w-4 h-4" /> : <Award className="w-4 h-4" />}
                    <span>{hasAwarded ? 'ĐÃ TRAO XU THƯỞNG!' : `TRAO +${rewardXu} XU`}</span>
                  </button>
                </>
              )}

              {/* Reset/Dismiss winner */}
              <button
                onClick={() => {
                  setWinner(null);
                  setCurrentQuestion(null);
                }}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-xs font-bold"
                title="Đóng kết quả"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mode 3: draw a question → wide-screen QuestionChallengeModal */}
          {callMode === 'quiz' && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={drawQuestion}
                className="flex-1 min-w-[240px] py-3.5 px-5 bg-purple-600 hover:bg-purple-700 text-white font-black text-sm md:text-base rounded-2xl shadow-md flex items-center justify-center gap-2.5 uppercase cursor-pointer"
              >
                <Sparkles className="w-5 h-5" />
                <span>{currentQuestion ? 'Bốc câu hỏi khác cho em này' : 'Bốc câu hỏi cho em này'}</span>
              </button>
              {currentQuestion && (
                <button
                  type="button"
                  onClick={() => setIsQuizOpen(true)}
                  className="px-4 py-3.5 bg-white hover:bg-purple-50 text-purple-800 font-bold text-sm rounded-2xl border border-purple-300 cursor-pointer"
                >
                  Xem lại câu đang mở
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <QuestionChallengeModal
        open={isQuizOpen}
        student={callMode === 'quiz' ? winner : null}
        pool={quizPool}
        drawToken={quizDrawToken}
        onClose={() => setIsQuizOpen(false)}
        closeLabel="🚀 HOÀN THÀNH & QUAY LẠI TÀU VŨ TRỤ"
        onEditQuestion={(q) => { setEditTargetQuestion(q); setIsQuestionBankOpen(true); }}
        onQuestionChange={setCurrentQuestion}
      />
      {quizSel.element}
      {/* QUESTION BANK MODAL */}
      <QuestionBankModal
        isOpen={isQuestionBankOpen}
        initialEditQuestion={editTargetQuestion}
        onClose={() => {
          setIsQuestionBankOpen(false);
          setEditTargetQuestion(null);
        }}
        questions={quizBank}
        onSaveQuestions={(updated) => {
          updateQuizBank(updated);
          saveQuizBank(updated);
          if (currentQuestion) {
            const updatedCur = updated.find(q => q.id === currentQuestion.id);
            if (updatedCur) {
              setCurrentQuestion(updatedCur);
            }
          }
        }}
      />
    </div>
  );
};
