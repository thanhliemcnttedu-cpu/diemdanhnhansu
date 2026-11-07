import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';
import { Student } from '../../../types';
import { 
  Trophy, RotateCcw, Award, Play, Sparkles, Zap, Flame, 
  Crown, Flag, Timer, Volume2, VolumeX, ChevronRight, Waves,
  Maximize2, X, Star, Heart
} from 'lucide-react';
import { 
  playFanfareSound, 
  playCoinSound, 
  playTickSound, 
  playApplauseSound, 
  playYesSound, 
  triggerFlowerConfetti 
} from '../../../utils/audio';
import confetti from 'canvas-confetti';

// Duck color palettes with cute 3D glossy gradients
const DUCK_THEMES = [
  { id: 'yellow', name: 'Vàng Hoàng Kim', bodyGrad: ['#fef08a', '#facc15', '#ca8a04'], beak: '#ea580c', cap: '#3b82f6', glow: 'rgba(250, 204, 21, 0.7)' },
  { id: 'cyan', name: 'Xanh Đại Dương', bodyGrad: ['#7dd3fc', '#38bdf8', '#0284c7'], beak: '#ea580c', cap: '#f59e0b', glow: 'rgba(56, 189, 248, 0.7)' },
  { id: 'pink', name: 'Hồng Kẹo Ngọt', bodyGrad: ['#fbcfe8', '#f472b6', '#db2777'], beak: '#ea580c', cap: '#10b981', glow: 'rgba(244, 114, 182, 0.7)' },
  { id: 'orange', name: 'Cam Hỏa Tiễn', bodyGrad: ['#fed7aa', '#fb923c', '#c2410c'], beak: '#b45309', cap: '#8b5cf6', glow: 'rgba(249, 115, 22, 0.7)' },
  { id: 'purple', name: 'Tím Siêu Tốc', bodyGrad: ['#e9d5ff', '#c084fc', '#7e22ce'], beak: '#ea580c', cap: '#eab308', glow: 'rgba(168, 85, 247, 0.7)' },
  { id: 'green', name: 'Xanh Lá Táo', bodyGrad: ['#bbf7d0', '#4ade80', '#15803d'], beak: '#ea580c', cap: '#ec4899', glow: 'rgba(74, 222, 128, 0.7)' },
  { id: 'red', name: 'Đỏ Siêu Nhân', bodyGrad: ['#fecaca', '#f87171', '#b91c1c'], beak: '#d97706', cap: '#06b6d4', glow: 'rgba(239, 68, 68, 0.7)' }
];

export type RaceDurationOption = 5 | 8 | 10;

interface DuckState {
  progress: number; // 0 to 100
  speedMultiplier: number;
  isBoosting: boolean;
  boostMessage?: string;
  rank: number;
}

// Falling flower petal interface for celebration
interface FlowerPetal {
  id: number;
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  rotation: number;
  rotSpeed: number;
  char: string;
}

export const DuckRaceGame: React.FC = () => {
  const { currentClassStudents, awardPoints, classes, activeClassId } = useClassroom();
  const activeClass = classes.find(c => c.id === activeClassId) || classes[0];

  // Options: 5s, 8s, 10s
  const [raceDuration, setRaceDuration] = useState<RaceDurationOption>(8);
  const [duckFilterGroup, setDuckFilterGroup] = useState<string>('all');
  
  // Game states
  const [isRacing, setIsRacing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [raceWinner, setRaceWinner] = useState<Student | null>(null);
  const [showGrandVictoryModal, setShowGrandVictoryModal] = useState(false);
  const [isScreenShaking, setIsScreenShaking] = useState(false);
  const [podium, setPodium] = useState<Student[]>([]);
  const [rewardXu, setRewardXu] = useState(2);
  const [hasAwardedDuck, setHasAwardedDuck] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [commentary, setCommentary] = useState<string>('Sẵn sàng cho trận tranh tài hồ bơi gay cấn!');

  // Filtered duck participants
  const duckStudents = useMemo(() => {
    return currentClassStudents.filter(s => {
      if (duckFilterGroup === 'all') return true;
      return s.group === duckFilterGroup;
    });
  }, [currentClassStudents, duckFilterGroup]);

  // Duck progress state: map studentId -> DuckState
  const [duckStates, setDuckStates] = useState<{ [id: string]: DuckState }>({});

  const animFrameRef = useRef<number | null>(null);
  const raceStartTimeRef = useRef<number>(0);
  const finishCrossedRef = useRef<boolean>(false);

  // Race music refs
  const raceMusicCtxRef = useRef<AudioContext | null>(null);
  const raceMusicNodesRef = useRef<AudioNode[]>([]);

  // Initialize ducks on student change or reset
  const initDuckStates = () => {
    const states: { [id: string]: DuckState } = {};
    duckStudents.forEach((s, idx) => {
      states[s.id] = {
        progress: 0,
        speedMultiplier: 1,
        isBoosting: false,
        rank: idx + 1
      };
    });
    setDuckStates(states);
  };

  useEffect(() => {
    initDuckStates();
    resetRace();
  }, [duckStudents]);

  // =========================================================================
  // WEB AUDIO SYNTHESIZER: DUCK QUACK, WHISTLE, SPLASH, CHEER
  // =========================================================================
  const getAudioCtx = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (_) {
      return null;
    }
  };

  // Play playful rubber duck quack
  const playDuckQuack = () => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Two rapid formant squeaks: "Quack-quack"
      [0, 0.12].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(580, now + delay);
        osc.frequency.exponentialRampToValueAtTime(360, now + delay + 0.1);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1100, now + delay);
        filter.Q.setValueAtTime(3.5, now + delay);

        gain.gain.setValueAtTime(0.2, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.1);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + delay);
        osc.stop(now + delay + 0.1);
      });
    } catch (_) {}
  };

  // Play sport whistle
  const playWhistle = () => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.exponentialRampToValueAtTime(2600, now + 0.12);
      osc.frequency.setValueAtTime(2300, now + 0.18);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch (_) {}
  };

  // Play water splash swoosh
  const playSplash = () => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000, now);
      filter.frequency.exponentialRampToValueAtTime(350, now + 0.3);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    } catch (_) {}
  };

  // =========================================================================
  // RACE MUSIC: Fun looping upbeat synthesized music during race
  // =========================================================================
  const startRaceMusic = () => {
    if (!soundEnabled) return;
    try {
      // Stop any existing music first
      stopRaceMusic();
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      raceMusicCtxRef.current = ctx;

      const nodes: AudioNode[] = [];

      // Master gain (overall volume control)
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.5); // fade in
      masterGain.connect(ctx.destination);
      nodes.push(masterGain);

      // --- Upbeat rhythmic bass drum pattern (kick) ---
      const kickInterval = setInterval(() => {
        if (!raceMusicCtxRef.current || raceMusicCtxRef.current !== ctx) { clearInterval(kickInterval); return; }
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g); g.connect(masterGain);
        osc.start(now); osc.stop(now + 0.22);
      }, 350);

      // --- Hi-hat (snappy noise bursts) ---
      const hihatInterval = setInterval(() => {
        if (!raceMusicCtxRef.current || raceMusicCtxRef.current !== ctx) { clearInterval(hihatInterval); return; }
        const now = ctx.currentTime;
        const bufSize = Math.floor(ctx.sampleRate * 0.06);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'highpass'; filt.frequency.value = 8000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        src.connect(filt); filt.connect(g); g.connect(masterGain);
        src.start(now);
      }, 175);

      // --- Cheerful melody line (pentatonic) ---
      const melody = [523, 659, 784, 880, 1047, 880, 784, 659, 523, 659, 784, 659, 523, 392, 523];
      let melodyIdx = 0;
      const melodyInterval = setInterval(() => {
        if (!raceMusicCtxRef.current || raceMusicCtxRef.current !== ctx) { clearInterval(melodyInterval); return; }
        const freq = melody[melodyIdx % melody.length];
        melodyIdx++;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);
        // Slight pitch bend for fun
        osc.frequency.exponentialRampToValueAtTime(freq * 1.02, now + 0.08);
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g); g.connect(masterGain);
        osc.start(now); osc.stop(now + 0.25);
      }, 220);

      // --- Bass harmony line ---
      const bassNotes = [131, 165, 196, 220, 196, 165];
      let bassIdx = 0;
      const bassInterval = setInterval(() => {
        if (!raceMusicCtxRef.current || raceMusicCtxRef.current !== ctx) { clearInterval(bassInterval); return; }
        const freq = bassNotes[bassIdx % bassNotes.length];
        bassIdx++;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.14, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(g); g.connect(masterGain);
        osc.start(now); osc.stop(now + 0.4);
      }, 700);

      // Store intervals in ref for cleanup (attach to window temporarily)
      (window as unknown as Record<string, unknown>).__raceIntervals = [kickInterval, hihatInterval, melodyInterval, bassInterval];
    } catch (_) {}
  };

  const stopRaceMusic = () => {
    // Clear all intervals
    const intervals = (window as unknown as Record<string, unknown>).__raceIntervals as ReturnType<typeof setInterval>[] | undefined;
    if (intervals) { intervals.forEach(clearInterval); }
    (window as unknown as Record<string, unknown>).__raceIntervals = [];

    if (raceMusicCtxRef.current) {
      try {
        // Fade out
        const masterNodes = raceMusicNodesRef.current;
        if (masterNodes.length > 0) {
          // nothing to fade explicitly - just close context
        }
        raceMusicCtxRef.current.close();
      } catch (_) {}
      raceMusicCtxRef.current = null;
    }
    raceMusicNodesRef.current = [];
  };

  // Play crowd cheer & applause
  const playCrowdCheer = () => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      // Synthesize celebratory roar
      const bufferSize = ctx.sampleRate * 1.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.linearRampToValueAtTime(1600, now + 0.6);
      filter.frequency.exponentialRampToValueAtTime(400, now + 1.5);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    } catch (_) {}
  };

  // =========================================================================
  // FALLING FLOWERS CANVAS & CELEBRATION SHOWER
  // =========================================================================
  const flowerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!showGrandVictoryModal) return;

    const canvas = flowerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const flowerChars = ['🌸', '🌺', '🌼', '🌻', '🌷', '🌹', '⭐', '✨', '🎉'];
    const petals: FlowerPetal[] = [];
    const count = 55;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < count; i++) {
      petals.push({
        id: i,
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height, // start above screen
        size: 18 + Math.random() * 18,
        speedY: 2 + Math.random() * 3.5,
        speedX: (Math.random() - 0.5) * 2,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 4,
        char: flowerChars[Math.floor(Math.random() * flowerChars.length)]
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      petals.forEach(p => {
        p.y += p.speedY;
        p.x += Math.sin(p.y * 0.02) * 1.5 + p.speedX;
        p.rotation += p.rotSpeed;

        if (p.y > canvas.height + 40) {
          p.y = -30;
          p.x = Math.random() * canvas.width;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.char, 0, 0);
        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [showGrandVictoryModal]);

  // =========================================================================
  // RACE ENGINE WITH DRAMATIC OVERTAKING
  // =========================================================================
  const handleStartCountdown = () => {
    if (duckStudents.length === 0 || isRacing || countdown !== null) return;
    setRaceWinner(null);
    setShowGrandVictoryModal(false);
    setIsScreenShaking(false);
    setPodium([]);
    setHasAwardedDuck(false);
    initDuckStates();

    let count = 3;
    setCountdown(count);
    playTickSound(700);

    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        playTickSound(800);
      } else if (count === 0) {
        setCountdown(0); // GO!
        playWhistle();
        playSplash();
        playDuckQuack();
        clearInterval(timer);
        setTimeout(() => {
          setCountdown(null);
          startRace();
        }, 500);
      }
    }, 700);
  };

  const startRace = () => {
    setIsRacing(true);
    setElapsedTime(0);
    finishCrossedRef.current = false;
    raceStartTimeRef.current = performance.now();
    // Start fun race music
    startRaceMusic();

    const totalMs = raceDuration * 1000;

    // Seed randomized drama curves for each duck
    const duckTraits: { [id: string]: {
      sprintPhase: 'early' | 'mid' | 'late' | 'steady';
      basePace: number;
      boosts: number[];
    } } = {};

    duckStudents.forEach(s => {
      const phases: Array<'early' | 'mid' | 'late' | 'steady'> = ['early', 'mid', 'late', 'steady'];
      duckTraits[s.id] = {
        sprintPhase: phases[Math.floor(Math.random() * phases.length)],
        basePace: 0.94 + Math.random() * 0.12,
        boosts: [0.18 + Math.random() * 0.25, 0.5 + Math.random() * 0.3]
      };
    });

    // Random pre-selected dramatic winner from participants (fair random picker)
    const winnerStudent = duckStudents[Math.floor(Math.random() * duckStudents.length)];

    const commentaryQuotes = [
      '🚀 Còi khai cuộc vang rền! Các chú vịt đồng loạt lao xuống nước rẽ sóng cuồn cuộn!',
      '🔥 Bám đuổi quyết liệt! Vị trí dẫn đầu đang đổi ngôi liên tục từng mét nước!',
      '⚡ Đột phá ngoạn mục! Chú vịt bất ngờ kích hoạt Siêu tốc Nitro vượt lên!',
      '🌊 Sóng lớn dâng cao! Cuộc đua đang bước vào giai đoạn nghẹt thở!',
      '🏁 Giai đoạn nước rút cuối cùng! So kè từng milimet trước vạch đích!'
    ];

    const step = (now: number) => {
      const elapsed = now - raceStartTimeRef.current;
      const progressRatio = Math.min(elapsed / totalMs, 1);
      setElapsedTime(elapsed / 1000);

      // Commentary updates based on race phase
      if (progressRatio < 0.25) {
        setCommentary(commentaryQuotes[0]);
      } else if (progressRatio < 0.5) {
        setCommentary(commentaryQuotes[1]);
      } else if (progressRatio < 0.75) {
        setCommentary(commentaryQuotes[2]);
      } else if (progressRatio < 0.92) {
        setCommentary(commentaryQuotes[3]);
      } else {
        setCommentary(commentaryQuotes[4]);
      }

      // Calculate progress for each duck
      const updatedStates: { [id: string]: DuckState } = {};

      duckStudents.forEach(st => {
        const traits = duckTraits[st.id];
        const isTheWinner = st.id === winnerStudent.id;

        // Base linear progress
        let p = progressRatio * 100;

        // Wave bobbing effect
        const sineBob = Math.sin(progressRatio * Math.PI * 5 + st.stt) * 4;
        p += sineBob;

        // Personality boost phases
        if (traits.sprintPhase === 'early' && progressRatio < 0.4) {
          p += Math.sin(progressRatio / 0.4 * Math.PI) * 7;
        } else if (traits.sprintPhase === 'mid' && progressRatio >= 0.3 && progressRatio <= 0.7) {
          p += Math.sin((progressRatio - 0.3) / 0.4 * Math.PI) * 8;
        } else if (traits.sprintPhase === 'late' && progressRatio > 0.6) {
          p += Math.sin((progressRatio - 0.6) / 0.4 * Math.PI) * 7;
        }

        // Mini-boost moments
        let isBoosting = false;
        traits.boosts.forEach(bTime => {
          if (Math.abs(progressRatio - bTime) < 0.05) {
            p += 4.5;
            isBoosting = true;
          }
        });

        // The chosen winner accelerates strongly in the final 18% to guarantee clean finish
        if (isTheWinner) {
          if (progressRatio > 0.82) {
            const sprintFactor = (progressRatio - 0.82) / 0.18;
            p += sprintFactor * 12;
            isBoosting = true;
          }
        } else {
          // Others get capped just behind the winner in final stretch
          if (progressRatio > 0.9) {
            p = Math.min(p, 96 + Math.random() * 2);
          }
        }

        p = Math.max(0, Math.min(p, 100));

        if (progressRatio >= 1) {
          p = isTheWinner ? 100 : Math.min(97, p);
        }

        updatedStates[st.id] = {
          progress: p,
          speedMultiplier: isBoosting ? 1.8 : 1,
          isBoosting,
          boostMessage: isBoosting ? '⚡ NITRO!' : undefined,
          rank: 1
        };
      });

      // Calculate realtime ranks
      const sortedByProgress = [...duckStudents].sort((a, b) => {
        return (updatedStates[b.id]?.progress || 0) - (updatedStates[a.id]?.progress || 0);
      });

      sortedByProgress.forEach((st, idx) => {
        if (updatedStates[st.id]) {
          updatedStates[st.id].rank = idx + 1;
        }
      });

      setDuckStates(updatedStates);

      // Finish condition
      if (progressRatio >= 1 && !finishCrossedRef.current) {
        finishCrossedRef.current = true;
        setIsRacing(false);
        setRaceWinner(winnerStudent);
        setPodium(sortedByProgress.slice(0, 3));
        setCommentary(`🎉 QUÁN QUÂN: Chú vịt của ${winnerStudent.name} đã cán đích ngoạn mục!`);

        // Stop race music before playing fanfare
        stopRaceMusic();

        // Trigger Screen Vibration / Shake
        setIsScreenShaking(true);
        setTimeout(() => setIsScreenShaking(false), 900);

        // Sound effects (LOUD, VIBRANT & JOYFUL)
        playWhistle();
        playFanfareSound();
        playApplauseSound();
        playYesSound();
        playCrowdCheer();
        playDuckQuack();
        triggerFlowerConfetti();

        // Confetti cannon
        confetti({
          particleCount: 140,
          spread: 100,
          origin: { y: 0.6 }
        });
        setTimeout(() => {
          confetti({
            particleCount: 80,
            angle: 60,
            spread: 60,
            origin: { x: 0 }
          });
          confetti({
            particleCount: 80,
            angle: 120,
            spread: 60,
            origin: { x: 1 }
          });
        }, 300);

        // Open Grand Fullscreen Victory Pop-up
        setTimeout(() => {
          setShowGrandVictoryModal(true);
        }, 400);

        return;
      }

      if (progressRatio < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  };

  const resetRace = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    stopRaceMusic();
    setIsRacing(false);
    setCountdown(null);
    setElapsedTime(0);
    setRaceWinner(null);
    setShowGrandVictoryModal(false);
    setIsScreenShaking(false);
    setPodium([]);
    setHasAwardedDuck(false);
    setCommentary('Sẵn sàng cho trận tranh tài hồ bơi gay cấn!');
    initDuckStates();
  };

  const handleAwardPoints = () => {
    if (!raceWinner || hasAwardedDuck) return;
    awardPoints([raceWinner.id], rewardXu, `Vô địch giải đua vịt hồ bơi (${raceDuration}s)`);
    setHasAwardedDuck(true);
    playCoinSound();
    confetti({ particleCount: 60, spread: 70 });
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopRaceMusic();
    };
  }, []);

  // Top 3 live leaderboard
  const liveTopThree = useMemo(() => {
    return [...duckStudents]
      .sort((a, b) => (duckStates[b.id]?.progress || 0) - (duckStates[a.id]?.progress || 0))
      .slice(0, 3);
  }, [duckStudents, duckStates]);

  return (
    <div className={`space-y-6 transition-transform ${isScreenShaking ? 'animate-[bounce_0.15s_infinite]' : ''}`}>
      {/* 1. TOP CONTROL PANEL */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Group Filter & Duration Picker */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {/* Group Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 uppercase shrink-0">Đua theo:</span>
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs font-black uppercase">
              {['all', 'Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'].map((grp) => (
                <button
                  key={grp}
                  disabled={isRacing || countdown !== null}
                  onClick={() => {
                    setDuckFilterGroup(grp);
                    resetRace();
                  }}
                  className={`px-3 py-1.5 rounded-xl transition-all uppercase cursor-pointer disabled:opacity-50 ${
                    duckFilterGroup === grp
                      ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {grp === 'all' ? 'Toàn lớp' : grp}
                </button>
              ))}
            </div>
          </div>

          {/* Race Duration Selector (5s, 8s, 10s) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 uppercase shrink-0 flex items-center gap-1">
              <Timer className="w-3.5 h-3.5 text-indigo-600" />
              <span>Thời gian đua:</span>
            </span>
            <div className="flex items-center gap-1 bg-indigo-50 p-1 rounded-2xl border border-indigo-100 text-xs font-black">
              {([5, 8, 10] as RaceDurationOption[]).map((dur) => (
                <button
                  key={dur}
                  disabled={isRacing || countdown !== null}
                  onClick={() => {
                    setRaceDuration(dur);
                    resetRace();
                  }}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 ${
                    raceDuration === dur
                      ? 'bg-indigo-600 text-white shadow-xs font-black scale-105'
                      : 'text-indigo-700 hover:bg-indigo-100/60'
                  }`}
                >
                  {dur === 5 && <span>⚡</span>}
                  {dur === 8 && <span>🔥</span>}
                  {dur === 10 && <span>🏆</span>}
                  <span>{dur} Giây</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Sound toggle & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>

          {/* Duck Quack Sound Test */}
          <button
            onClick={playDuckQuack}
            className="px-3 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl text-xs font-black flex items-center gap-1 border border-amber-200/80 transition-all hover-zoom-btn uppercase"
            title="Thử tiếng vịt kêu"
          >
            <span>🦆</span>
            <span className="hidden sm:inline">Cạp cạp</span>
          </button>

          {/* Reset Button */}
          <button
            onClick={resetRace}
            disabled={isRacing || countdown !== null}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-black flex items-center gap-1.5 transition-all hover-zoom-btn uppercase disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt lại</span>
          </button>

          {/* Launch Race Button */}
          <button
            onClick={handleStartCountdown}
            disabled={isRacing || countdown !== null || duckStudents.length === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-md shadow-orange-500/25 transition-all hover-zoom-btn disabled:opacity-50 uppercase cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>
              {countdown !== null ? 'ĐANG ĐẾM NGƯỢC...' : isRacing ? 'ĐANG TRANH TÀI...' : `XUẤT PHÁT ĐUA (${raceDuration}S)!`}
            </span>
          </button>
        </div>
      </div>

      {/* 2. LIVE DASHBOARD BANNER & COMMENTARY */}
      <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-700 rounded-3xl p-4 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-3 border border-sky-400/40 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.2),transparent_70%)] pointer-events-none" />

        <div className="flex items-center gap-3 relative z-10 w-full md:w-auto">
          <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-xl shrink-0 shadow-inner">
            🦆
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-wider">
                ĐƯỜNG ĐUA 3D OLYMPIC
              </span>
              <span className="text-xs text-sky-200 font-semibold">
                {duckStudents.length} Chú Vịt Nhỏ Tranh Tài • Chặng 100m
              </span>
            </div>
            <p className="text-sm font-black text-white tracking-wide mt-0.5 line-clamp-1">
              {commentary}
            </p>
          </div>
        </div>

        {/* Live Top 3 Mini-Leaderboard */}
        <div className="flex items-center gap-2 relative z-10 bg-black/25 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/20 self-stretch md:self-auto justify-around">
          <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Trophy className="w-3 h-3 text-amber-400" />
            <span>Top dẫn đầu:</span>
          </span>
          {liveTopThree.map((st, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            return (
              <div key={st.id} className="flex items-center gap-1.5 text-xs font-black">
                <span>{medal}</span>
                <img src={st.avatar} alt={st.name} className="w-5 h-5 rounded-full object-cover border border-white" />
                <span className="truncate max-w-[80px] sm:max-w-[110px] text-white text-[11px]">{st.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. 3D AQUA ARENA & RACING LANES */}
      <div className="relative rounded-3xl overflow-hidden border-4 border-sky-500 shadow-2xl bg-gradient-to-b from-sky-400 via-cyan-400 to-blue-600 p-4 sm:p-6">
        {/* Animated Water Surface Texture & Light Caustics */}
        <div className="absolute inset-0 pointer-events-none opacity-25 bg-[radial-gradient(#ffffff_2px,transparent_2px)] [background-size:24px_24px] animate-pulse" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/20 via-transparent to-black/20" />

        {/* Countdown Overlay (3.. 2.. 1.. GO!) */}
        {countdown !== null && (
          <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-xs flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center">
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 border-4 border-white shadow-2xl flex items-center justify-center text-5xl sm:text-6xl font-black text-white animate-bounce">
                {countdown === 0 ? '🏁 GO!' : countdown}
              </div>
              <p className="mt-4 text-xl sm:text-2xl font-black text-white uppercase tracking-wider drop-shadow-md">
                {countdown === 0 ? 'XUẤT PHÁT NƯỚC RÚT!' : 'CHUẨN BỊ XUẤT PHÁT...'}
              </p>
            </div>
          </div>
        )}

        {/* Stadium Top Bar: Start Gate & Finish Arch */}
        <div className="flex items-center justify-between text-white font-black text-xs uppercase tracking-wider mb-4 relative z-10 px-2">
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/30 shadow-xs">
            <Flag className="w-3.5 h-3.5 text-amber-300" />
            <span>VẠCH XUẤT PHÁT (0M)</span>
          </div>

          {/* Digital Timer HUD */}
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-amber-400/40 text-amber-300 shadow-md">
            <Timer className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />
            <span className="font-mono text-sm tracking-widest font-black">
              {elapsedTime.toFixed(2)}s / {raceDuration.toFixed(2)}s
            </span>
          </div>

          <div className="flex items-center gap-2 bg-red-600/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/40 shadow-xs text-white">
            <span>🏁</span>
            <span>VẠCH ĐÍCH (100M)</span>
          </div>
        </div>

        {/* Swimming Lanes Container */}
        <div className="space-y-3 relative z-10 max-h-[58vh] overflow-y-auto pr-2 custom-scrollbar">
          {duckStudents.map((st, idx) => {
            const state = duckStates[st.id] || { progress: 0, isBoosting: false, rank: idx + 1 };
            const prog = state.progress;
            const isBoosting = state.isBoosting;
            const isWinner = raceWinner?.id === st.id;
            const theme = DUCK_THEMES[idx % DUCK_THEMES.length];

            return (
              <div
                key={st.id}
                className={`relative h-14 sm:h-16 rounded-2xl flex items-center px-3 overflow-hidden transition-all duration-150 ${
                  isWinner
                    ? 'bg-amber-300/40 border-2 border-amber-300 shadow-lg shadow-amber-400/30 ring-2 ring-amber-300'
                    : isBoosting
                    ? 'bg-white/40 border-2 border-yellow-300 shadow-md'
                    : 'bg-white/25 hover:bg-white/30 border border-white/40 shadow-inner'
                }`}
                style={{
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.15) 100%)'
                }}
              >
                {/* 3D Olympic Floating Lane Buoys (Phao bơi phân làn) */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-white to-blue-500 opacity-60" />
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-white to-blue-500 opacity-60" />

                {/* Lane Number Badge */}
                <div className="w-8 shrink-0 flex flex-col items-center justify-center font-black font-mono z-10">
                  <span className="text-xs text-sky-950 font-black">#{idx + 1}</span>
                  {state.rank <= 3 && isRacing && (
                    <span className="text-[9px] px-1 rounded-sm bg-amber-400 text-amber-950 font-black">
                      Top {state.rank}
                    </span>
                  )}
                </div>

                {/* Finish Line Checkered Strip with Red Ribbon */}
                <div className="absolute right-0 top-0 bottom-0 w-12 border-l-2 border-dashed border-red-500 bg-gradient-to-r from-red-500/20 to-red-600/40 flex items-center justify-center font-black text-white text-xs pointer-events-none z-10">
                  <div className="flex flex-col items-center">
                    <span className="text-sm">🏁</span>
                    <span className="text-[8px] font-black text-white uppercase tracking-tighter">ĐÍCH</span>
                  </div>
                </div>

                {/* The 3D Swimming Duck Unit */}
                <div
                  className="absolute flex items-center gap-2.5 will-change-transform z-20"
                  style={{
                    left: `calc(38px + ${prog * 0.76}%)`,
                    transform: isRacing
                      ? `translateY(${Math.sin(prog * 0.5 + idx) * 2.5}px) rotate(${Math.sin(prog * 0.3) * 3.5}deg)`
                      : 'none',
                    transition: isRacing ? 'transform 0.1s ease-out' : 'left 0.3s ease-out'
                  }}
                >
                  {/* Water Wake & Splash Bubbles behind the duck */}
                  {isRacing && prog > 2 && (
                    <div className="absolute -left-7 top-1/2 -translate-y-1/2 flex items-center opacity-85 pointer-events-none">
                      <div className="w-3.5 h-2 rounded-full bg-white animate-ping opacity-80" />
                      <div className="w-6 h-2.5 rounded-full bg-white/80 blur-[1px]" />
                      <div className="w-10 h-3.5 rounded-full bg-sky-200/60 -ml-3" />
                    </div>
                  )}

                  {/* Nitro Boost Flash */}
                  {isBoosting && (
                    <div className="absolute -top-3.5 left-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 text-white font-black text-[9px] shadow-lg animate-bounce whitespace-nowrap z-30 flex items-center gap-0.5">
                      <Flame className="w-2.5 h-2.5 fill-yellow-200" />
                      <span>NITRO!</span>
                    </div>
                  )}

                  {/* 3D Cute Duck Model (Vector Styled) */}
                  <div className={`relative w-11 h-11 sm:w-12 sm:h-12 shrink-0 select-none ${
                    isWinner ? 'scale-125 animate-bounce' : isBoosting ? 'scale-110' : ''
                  }`}>
                    <svg viewBox="0 0 100 100" className="w-full h-full filter drop-shadow-[0_5px_7px_rgba(0,0,0,0.35)]">
                      <defs>
                        {/* 3D Gradient for Body */}
                        <radialGradient id={`duckBodyGrad-${st.id}`} cx="40%" cy="35%" r="65%">
                          <stop offset="0%" stopColor={theme.bodyGrad[0]} />
                          <stop offset="60%" stopColor={theme.bodyGrad[1]} />
                          <stop offset="100%" stopColor={theme.bodyGrad[2]} />
                        </radialGradient>
                        {/* 3D Gradient for Head */}
                        <radialGradient id={`duckHeadGrad-${st.id}`} cx="45%" cy="35%" r="60%">
                          <stop offset="0%" stopColor={theme.bodyGrad[0]} />
                          <stop offset="70%" stopColor={theme.bodyGrad[1]} />
                          <stop offset="100%" stopColor={theme.bodyGrad[2]} />
                        </radialGradient>
                      </defs>

                      {/* Ripple ring beneath duck */}
                      <ellipse cx="50" cy="85" rx="36" ry="7" fill="#ffffff" opacity={isRacing ? 0.65 : 0.3} />
                      <ellipse cx="50" cy="85" rx="24" ry="4" fill="rgba(14, 165, 233, 0.45)" />

                      {/* Duck Tail & Body */}
                      <path 
                        d="M 20,52 C 12,42 16,35 24,40 C 26,48 32,58 48,60 C 65,60 76,52 80,44 C 84,62 70,78 50,78 C 30,78 18,66 20,52 Z" 
                        fill={`url(#duckBodyGrad-${st.id})`} 
                      />

                      {/* Wing with 3D Depth & Swimming Flap */}
                      <g style={{
                        transformOrigin: '44px 58px',
                        transform: isRacing ? `rotate(${Math.sin(prog * 0.8) * 12}deg)` : 'none'
                      }}>
                        <ellipse cx="44" cy="58" rx="15" ry="9" fill={theme.bodyGrad[2]} opacity="0.85" transform="rotate(-6 44 58)" />
                        <ellipse cx="43" cy="57" rx="12" ry="7" fill={theme.bodyGrad[0]} opacity="0.6" transform="rotate(-6 43 57)" />
                      </g>

                      {/* Duck Head */}
                      <circle cx="68" cy="38" r="21" fill={`url(#duckHeadGrad-${st.id})`} />

                      {/* Big Anime Eyes (Kawaii Style for Elementary Students) */}
                      <ellipse cx="73" cy="34" rx="4.5" ry="5.5" fill="#0f172a" />
                      {/* Eye Sparkles */}
                      <circle cx="74.5" cy="32.5" r="1.8" fill="#ffffff" />
                      <circle cx="72" cy="36" r="0.8" fill="#ffffff" />

                      {/* Cute Orange Beak */}
                      <path d="M 83,38 Q 99,41 94,48 Q 84,49 82,44 Z" fill={theme.beak} />
                      <ellipse cx="87" cy="42" rx="6" ry="1.5" fill="#f97316" opacity="0.7" />

                      {/* Swim Goggles / Sport Glasses */}
                      <rect x="62" y="27" width="18" height="11" rx="4" fill="none" stroke="#0284c7" strokeWidth="2.5" />
                      <ellipse cx="71" cy="32" rx="7" ry="4" fill="rgba(56, 189, 248, 0.45)" />
                      <path d="M 52,32 L 62,32" stroke="#0284c7" strokeWidth="2.5" />

                      {/* Winner Crown if leading */}
                      {(isWinner || (state.rank === 1 && isRacing && prog > 20)) && (
                        <g transform="translate(62, 10) scale(0.7)">
                          <polygon points="10,0 15,10 20,2 25,10 30,0 28,15 12,15" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
                          <circle cx="10" cy="0" r="2" fill="#ef4444" />
                          <circle cx="20" cy="2" r="2" fill="#3b82f6" />
                          <circle cx="30" cy="0" r="2" fill="#10b981" />
                        </g>
                      )}
                    </svg>

                    {/* Miniature Student Avatar attached to the duck - circular frame */}
                    <div className={`absolute -top-2 -left-2 rounded-full overflow-hidden z-10 shrink-0 aspect-square
                      ${isWinner
                        ? 'w-9 h-9 border-2 border-amber-300 shadow-lg shadow-amber-400/80 ring-2 ring-white'
                        : 'w-8 h-8 border-2 border-white shadow-md ring-1 ring-sky-300'
                      }`}>
                      <img src={st.avatar} alt={st.name} className="w-full h-full object-cover rounded-full" />
                    </div>
                  </div>

                  {/* Student Name Banner Tag */}
                  <div className={`px-2.5 py-1 rounded-xl text-xs font-black whitespace-nowrap shadow-md flex items-center gap-1.5 transition-all ${
                    isWinner
                      ? 'bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 border-2 border-white ring-2 ring-amber-400 scale-105'
                      : isBoosting
                      ? 'bg-yellow-300 text-slate-900 border border-white ring-1 ring-yellow-400'
                      : 'bg-white/95 backdrop-blur-md text-slate-800 border border-slate-200'
                  }`}>
                    <span className="text-[10px] opacity-75 font-mono">#{st.stt}</span>
                    <span>{st.name}</span>
                    {isWinner && <Crown className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MÀN HÌNH POP-UP RUNG LỚN: VINH DANH QUÁN QUÂN & TUNG HOA RƠI LẢ TẢ   */}
      {/* ========================================================================= */}
      {showGrandVictoryModal && raceWinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
          {/* Falling Flowers Shower Canvas */}
          <canvas
            ref={flowerCanvasRef}
            className="absolute inset-0 pointer-events-none z-10 w-full h-full"
          />

          {/* Golden spotlight glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.3)_0%,transparent_65%)] pointer-events-none z-0 animate-pulse" />

          {/* Main Victory Card */}
          <div className="relative z-20 w-full max-w-lg animate-in zoom-in-90 duration-400">
            {/* Close button */}
            <button
              onClick={() => setShowGrandVictoryModal(false)}
              className="absolute -top-3 -right-3 z-30 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors cursor-pointer border-2 border-white/20 shadow-xl"
            >
              <X className="w-4 h-4" />
            </button>

            {/* TOP BANNER */}
            <div className="bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 rounded-t-[2rem] px-6 py-3 flex items-center justify-center gap-2 shadow-lg">
              <span className="text-2xl animate-bounce">🏆</span>
              <span className="text-sm sm:text-base font-black text-amber-950 uppercase tracking-widest text-center">
                QUÁN QUÂN VÔ ĐỊCH HỒ BƠI
              </span>
              <span className="text-2xl animate-bounce" style={{ animationDelay: '0.3s' }}>🏆</span>
            </div>

            {/* MAIN BODY - dark navy premium */}
            <div
              className="relative rounded-b-[2rem] px-6 pb-5 text-center text-white"
              style={{ background: 'linear-gradient(160deg, #1e3a5f 0%, #0f2044 35%, #1a1060 65%, #2d1b69 100%)', paddingTop: '8px' }}
            >
              {/* Bokeh orbs */}
              <div className="absolute top-4 left-6 w-24 h-24 rounded-full bg-amber-400/10 blur-2xl pointer-events-none" />
              <div className="absolute bottom-10 right-4 w-28 h-28 rounded-full bg-purple-500/15 blur-2xl pointer-events-none" />
              <div className="absolute top-20 right-8 w-16 h-16 rounded-full bg-sky-400/10 blur-xl pointer-events-none" />

              {/* AVATAR SECTION - clean circular frame with concentric rings */}
              <div className="relative flex flex-col items-center pt-8 pb-3">

                {/* Crown - poised majestically on top of the avatar frame */}
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-5xl animate-bounce select-none pointer-events-none z-20"
                  style={{ filter: 'drop-shadow(0 0 14px rgba(251,191,36,1))' }}
                >👑</div>

                {/* Side decorations */}
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl animate-pulse pointer-events-none select-none" style={{ animationDelay: '0s' }}>🏆</div>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-3xl animate-pulse pointer-events-none select-none" style={{ animationDelay: '0.6s' }}>⭐</div>

                {/* Avatar container with centered concentric rings */}
                <div className="relative flex items-center justify-center" style={{ width: 172, height: 172 }}>
                  {/* 1. Spinning rainbow conic ring */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 170,
                      height: 170,
                      background: 'conic-gradient(from 0deg, #fde047, #fb923c, #ef4444, #a855f7, #3b82f6, #22d3ee, #4ade80, #fde047)',
                      animation: 'spin 2.5s linear infinite',
                      zIndex: 1
                    }}
                  />

                  {/* 2. Dark gap ring between spinning ring and gold frame */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 160,
                      height: 160,
                      background: '#0f2044',
                      zIndex: 2
                    }}
                  />

                  {/* 3. Gold outer border ring */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 154,
                      height: 154,
                      background: 'linear-gradient(145deg, #fde68a, #f59e0b, #d97706)',
                      boxShadow: '0 0 30px rgba(251,191,36,0.9), 0 0 60px rgba(251,191,36,0.35)',
                      zIndex: 3
                    }}
                  />

                  {/* 4. Perfectly Circular White Ring & Avatar Clipper (Guaranteed No Overflow) */}
                  <div
                    style={{
                      width: 142,
                      height: 142,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      position: 'relative',
                      zIndex: 4,
                      backgroundColor: '#ffffff',
                      border: '3px solid #ffffff',
                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.15)'
                    }}
                  >
                    <img
                      src={raceWinner.avatar}
                      alt={raceWinner.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center 20%',
                        borderRadius: '50%',
                        display: 'block',
                        ...(raceWinner.avatarPosition || (raceWinner.avatarScale && raceWinner.avatarScale !== 1)
                          ? {
                              transform: `translate(${raceWinner.avatarPosition?.x || 0}px, ${raceWinner.avatarPosition?.y || 0}px) scale(${raceWinner.avatarScale || 1})`,
                              transformOrigin: 'center center'
                            }
                          : {})
                      }}
                    />
                  </div>
                </div>

                {/* STT badge - below avatar, in normal flow */}
                <div
                  className="mt-3 px-4 py-1 rounded-full font-black text-xs border-2 border-white shadow-lg whitespace-nowrap z-10"
                  style={{ background: 'linear-gradient(90deg,#f59e0b,#fde047)', color: '#1c1917' }}
                >
                  STT #{raceWinner.stt}
                </div>
              </div>

              {/* NAME & CONGRATS */}
              <div className="space-y-1">
                <h2
                  className="font-black uppercase tracking-wide leading-tight"
                  style={{
                    fontSize: 'clamp(1.7rem, 6vw, 2.6rem)',
                    background: 'linear-gradient(90deg,#fde047,#fbbf24,#fde047)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 2px 8px rgba(251,191,36,0.7))'
                  }}
                >
                  {raceWinner.name}
                </h2>
                <p className="font-extrabold text-sm uppercase tracking-widest animate-pulse" style={{ color: '#fcd34d' }}>
                  🎉 XUẤT SẮC VỀ ĐÍCH VÔ ĐỊCH! 🎉
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  {raceWinner.group} &bull; Lớp {activeClass?.name || '4A1'} &bull; Thành tích:&nbsp;
                  <span className="font-black text-amber-300">{raceDuration} giây</span>
                </p>
              </div>

              {/* PODIUM TOP 3 */}
              {podium.length > 0 && (
                <div className="mt-5 flex items-end justify-center gap-2">
                  {podium[1] && (
                    <div className="flex flex-col items-center gap-1">
                      <img src={podium[1].avatar} alt={podium[1].name} className="w-10 h-10 rounded-full object-cover border-2 border-slate-400 shadow-md" />
                      <span className="text-[9px] text-slate-300 font-black truncate max-w-[56px]">{podium[1].name.split(' ').pop()}</span>
                      <div className="w-14 h-10 rounded-t-lg flex items-center justify-center text-white font-black text-sm" style={{ background: 'linear-gradient(180deg,#9ca3af,#6b7280)' }}>🥈</div>
                    </div>
                  )}
                  {podium[0] && (
                    <div className="flex flex-col items-center gap-1">
                      <img src={podium[0].avatar} alt={podium[0].name} className="w-12 h-12 rounded-full object-cover border-2 border-amber-300 shadow-lg" />
                      <span className="text-[9px] font-black truncate max-w-[64px] text-amber-300">{podium[0].name.split(' ').pop()}</span>
                      <div className="w-16 h-14 rounded-t-lg flex items-center justify-center font-black text-base shadow-lg" style={{ background: 'linear-gradient(180deg,#fbbf24,#d97706)' }}>🥇</div>
                    </div>
                  )}
                  {podium[2] && (
                    <div className="flex flex-col items-center gap-1">
                      <img src={podium[2].avatar} alt={podium[2].name} className="w-10 h-10 rounded-full object-cover border-2 border-orange-400 shadow-md" />
                      <span className="text-[9px] text-orange-300 font-black truncate max-w-[56px]">{podium[2].name.split(' ').pop()}</span>
                      <div className="w-14 h-8 rounded-t-lg flex items-center justify-center text-white font-black text-sm" style={{ background: 'linear-gradient(180deg,#f97316,#c2410c)' }}>🥉</div>
                    </div>
                  )}
                </div>
              )}

              {/* REWARD ROW */}
              <div className="mt-5 pt-4 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Thưởng xu:</span>
                  <div className="flex items-center gap-1 p-1 rounded-xl border border-white/10 bg-white/5">
                    {[1, 2, 5].map((val) => (
                      <button
                        key={val}
                        disabled={hasAwardedDuck}
                        onClick={() => setRewardXu(val)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-black transition-all cursor-pointer disabled:opacity-50 ${
                          rewardXu === val
                            ? 'scale-105 shadow-md text-amber-950'
                            : 'text-white/70 hover:bg-white/10'
                        }`}
                        style={rewardXu === val ? { background: 'linear-gradient(180deg,#fde047,#f59e0b)' } : {}}
                      >
                        +{val} 🪙
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    onClick={handleAwardPoints}
                    disabled={hasAwardedDuck}
                    className="w-full sm:w-auto px-7 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                    style={{
                      background: hasAwardedDuck ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#fde047,#f59e0b)',
                      color: hasAwardedDuck ? '#fff' : '#1c1917',
                      boxShadow: hasAwardedDuck ? 'none' : '0 6px 24px rgba(251,191,36,0.5)'
                    }}
                  >
                    <Award className="w-5 h-5" />
                    <span>{hasAwardedDuck ? '✅ Đã tặng xu!' : `Tặng +${rewardXu} Xu Thưởng`}</span>
                  </button>

                  <button
                    onClick={() => { setShowGrandVictoryModal(false); handleStartCountdown(); }}
                    className="w-full sm:w-auto px-6 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer hover:bg-white/15 text-white border border-white/20"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Đua vòng mới</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
