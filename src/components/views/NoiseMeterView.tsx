import React, { useState, useEffect, useRef } from 'react';
import { 
  Volume2, VolumeX, ShieldAlert, Mic, MicOff, 
  Bell, AlertTriangle, Maximize2, Minimize2, CheckCircle2, Clock, X, Sparkles, RefreshCw, Sliders
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  playLoudAlertSound, 
  playStopNowAlertSound, 
  playApplauseWithHappyMusic20s, 
  playDeductSound, 
  playCoinSound,
  playLoudAlertSound20s,
  playStopNowAlertSound20s,
  playShhAlertSound20s
} from '../../utils/audio';

interface AttentionAlert {
  type: 'shh' | 'loud' | 'stop' | 'great';
  title: string;
  subText: string;
  icon: string;
  theme: 'amber' | 'orange' | 'rose' | 'emerald';
}

export const NoiseMeterView: React.FC = () => {
  const [hasSound, setHasSound] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Microphone detection
  const [isListening, setIsListening] = useState(false);
  const [noiseLevel, setNoiseLevel] = useState(0); // 0 - 100
  const [threshold, setThreshold] = useState(65);
  const [lastAlertTime, setLastAlertTime] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  // Simulation mode (chế độ mô phỏng khi chưa cấp quyền mic hoặc máy không có mic)
  const [isSimulating, setIsSimulating] = useState(false);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Silence timer (Đếm ngược im lặng)
  const [silenceSecondsLeft, setSilenceSecondsLeft] = useState<number | null>(null);
  const [activeDuration, setActiveDuration] = useState<number>(10);
  const [activeAlertMsg, setActiveAlertMsg] = useState<string | null>(null);

  // 20-second High-Impact Attention Alert state (User Request)
  const [activeAttentionAlert, setActiveAttentionAlert] = useState<AttentionAlert | null>(null);
  const [attentionSecondsLeft, setAttentionSecondsLeft] = useState<number>(20);
  const attentionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const happyMusicControlRef = useRef<{ stop: () => void } | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  // 4 Instant Alerts: Phóng to thu nhỏ nhanh trong 20s để gây sự chú ý của học sinh
  const triggerAlert = (type: 'shh' | 'loud' | 'stop' | 'great') => {
    // Clear any existing attention countdown and audio
    if (attentionTimerRef.current) {
      clearInterval(attentionTimerRef.current);
      attentionTimerRef.current = null;
    }
    if (happyMusicControlRef.current) {
      happyMusicControlRef.current.stop();
      happyMusicControlRef.current = null;
    }

    let alertData: AttentionAlert;
    if (type === 'shh') {
      alertData = {
        type: 'shh',
        title: 'IM LẶNG NÀO!',
        subText: 'HÃY ĐẶT TAY LÊN BÀN VÀ LẮNG NGHE THẦY CÔ NHẮC NHỞ! 🤫',
        icon: '🤫',
        theme: 'amber'
      };
      // Âm thanh liên tục 20 giây cho IM LẶNG NÀO (chuông nhắc nhở nhẹ nhàng lặp lại)
      if (hasSound) {
        happyMusicControlRef.current = playShhAlertSound20s();
      }
    } else if (type === 'loud') {
      alertData = {
        type: 'loud',
        title: 'LỚP QUÁ ỒN!',
        subText: 'YÊU CẦU TOÀN THỂ CÁC BẠN HỌC SINH GIỮ TRẬT TỰ NGAY! 📢',
        icon: '📢',
        theme: 'orange'
      };
      // Âm thanh liên tục 20 giây cho LỚP QUÁ ỒN (chuông cảnh báo âm thanh tăng dần lặp lại)
      if (hasSound) {
        happyMusicControlRef.current = playLoudAlertSound20s();
      }
    } else if (type === 'stop') {
      alertData = {
        type: 'stop',
        title: 'DỪNG LẠI NGAY!',
        subText: 'DỪNG MỌI HOẠT ĐỘNG, KHÔNG NÓI CHUYỆN VÀ HƯỚNG MẮT LÊN BẢNG! 🛑',
        icon: '🛑',
        theme: 'rose'
      };
      // Âm thanh liên tục 20 giây cho DỪNG LẠI NGAY (còi báo dừng sắc bén lặp lại)
      if (hasSound) {
        happyMusicControlRef.current = playStopNowAlertSound20s();
      }
    } else {
      alertData = {
        type: 'great',
        title: 'TUYỆT VỜI!',
        subText: 'CẢ LỚP RẤT NGOAN, HĂNG HÁI VÀ TRẬT TỰ! THẦY CÔ KHEN CẢ LỚP! 🎉',
        icon: '👏',
        theme: 'emerald'
      };
      // TUYỆT VỜI VỖ TAY: âm thanh vỗ tay kèm nhạc vui nhộn trong 20 giây
      if (hasSound) {
        happyMusicControlRef.current = playApplauseWithHappyMusic20s();
      }
      confetti({
        particleCount: 90,
        spread: 100,
        origin: { y: 0.5 }
      });
      setTimeout(() => {
        confetti({
          particleCount: 70,
          spread: 120,
          origin: { y: 0.4 }
        });
      }, 500);
    }

    setActiveAttentionAlert(alertData);
    setAttentionSecondsLeft(20);

    // Run countdown for 20 seconds
    let remaining = 20;
    attentionTimerRef.current = setInterval(() => {
      remaining -= 1;
      setAttentionSecondsLeft(remaining);

      // Repeat celebratory confetti wave
      if (type === 'great' && remaining % 4 === 0 && remaining > 0) {
        confetti({ particleCount: 45, spread: 85, origin: { y: 0.55 } });
      }

      if (remaining <= 0) {
        if (attentionTimerRef.current) clearInterval(attentionTimerRef.current);
        attentionTimerRef.current = null;
        if (happyMusicControlRef.current) {
          happyMusicControlRef.current.stop();
          happyMusicControlRef.current = null;
        }
        setActiveAttentionAlert(null);
      }
    }, 1000);
  };

  const handleDismissAttentionAlert = () => {
    if (happyMusicControlRef.current) {
      happyMusicControlRef.current.stop();
      happyMusicControlRef.current = null;
    }
    if (attentionTimerRef.current) {
      clearInterval(attentionTimerRef.current);
      attentionTimerRef.current = null;
    }
    setActiveAttentionAlert(null);
  };

  // Silence Countdown
  const startSilenceTimer = (seconds: number) => {
    setActiveDuration(seconds);
    setSilenceSecondsLeft(seconds);
    setActiveAlertMsg(`Bắt đầu thử thách ${seconds} giây im lặng! 🤫`);
  };

  useEffect(() => {
    if (silenceSecondsLeft === null) return;
    if (silenceSecondsLeft <= 0) {
      setSilenceSecondsLeft(null);
      triggerAlert('great');
      return;
    }

    const timer = setInterval(() => {
      setSilenceSecondsLeft(prev => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [silenceSecondsLeft]);

  // Mic logic
  const startMic = async () => {
    try {
      setMicError(null);
      stopSimulation();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicError('Trình duyệt của bạn chưa hỗ trợ giao diện Microphone trực tiếp. Bạn có thể sử dụng Chế độ Mô phỏng bên dưới để thử nghiệm.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }, 
        video: false 
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsListening(true);

      const bufferLength = analyser.fftSize;
      const timeDataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        analyser.getByteTimeDomainData(timeDataArray);
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const normalizedVal = (timeDataArray[i] - 128) / 128;
          sumSquares += normalizedVal * normalizedVal;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        // Sensitive mapping from RMS to 0 - 100 dB
        const currentDb = Math.min(100, Math.max(0, Math.round(rms * 260)));
        setNoiseLevel(currentDb);

        if (currentDb >= threshold) {
          const now = Date.now();
          if (now - lastAlertTime > 4000) {
            setLastAlertTime(now);
            if (hasSound) {
              playLoudAlertSound();
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err: any) {
      console.error('Microphone access error:', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setMicError('Trình duyệt đang chặn quyền Microphone của trang web. Vui lòng bấm vào biểu tượng Ổ khóa 🔒 hoặc Cài đặt trên thanh địa chỉ URL, chọn "Cho phép Microphone" (Allow) rồi bấm Bật micro lại.');
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setMicError('Không tìm thấy thiết bị Microphone trên máy tính của bạn. Bạn có thể sử dụng Chế độ Mô phỏng bên dưới để thử nghiệm.');
      } else {
        setMicError(`Không thể bật Micro (${err?.message || 'Quyền bị từ chối'}). Vui lòng cấp quyền Microphone trên trình duyệt hoặc sử dụng Chế độ Mô Phỏng.`);
      }
      setIsListening(false);
    }
  };

  const stopMic = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsListening(false);
    setNoiseLevel(0);
  };

  // Simulation mode logic
  const startSimulation = () => {
    stopMic();
    setMicError(null);
    setIsSimulating(true);
    const base = 30;
    simIntervalRef.current = setInterval(() => {
      const randomJitter = Math.floor(Math.random() * 22) - 11;
      const spike = Math.random() < 0.08 ? 38 : 0;
      const newDb = Math.min(100, Math.max(12, base + randomJitter + spike));
      setNoiseLevel(newDb);

      if (newDb >= threshold) {
        const now = Date.now();
        if (now - lastAlertTime > 4000) {
          setLastAlertTime(now);
          if (hasSound) {
            playLoudAlertSound();
          }
        }
      }
    }, 300);
  };

  const stopSimulation = () => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setIsSimulating(false);
    setNoiseLevel(0);
  };

  const triggerTestNoiseSpike = () => {
    setNoiseLevel(82);
    if (hasSound) {
      playLoudAlertSound();
    }
  };

  useEffect(() => {
    return () => {
      stopMic();
      stopSimulation();
      if (happyMusicControlRef.current) {
        happyMusicControlRef.current.stop();
        happyMusicControlRef.current = null;
      }
      if (attentionTimerRef.current) {
        clearInterval(attentionTimerRef.current);
        attentionTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Top Header Card matching PDF Page 23 */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover-zoom-card">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h2 className="text-base md:text-lg font-black text-slate-900 uppercase">
              CÔNG CỤ CHỐNG ỒN LỚP HỌC
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 uppercase">
            BẤM CẢNH BÁO TỨC THÌ, ĐẾM NGƯỢC IM LẶNG, HOẶC DÙNG MICROPHONE PHÁT HIỆN TIẾNG ỒN TỰ ĐỘNG.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHasSound(!hasSound)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-all hover-zoom-btn uppercase ${
              hasSound 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {hasSound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{hasSound ? 'CÓ ÂM THANH' : 'TẮT ÂM THANH'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 hover-zoom-btn uppercase"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>TOÀN MÀN HÌNH</span>
          </button>
        </div>
      </div>

      {/* 20-SECOND HIGH-IMPACT ATTENTION ALERT OVERLAY (User Request: phóng to thu nhỏ nhanh trong 20s) */}
      {activeAttentionAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div 
            className={`w-full max-w-4xl p-8 sm:p-12 rounded-3xl shadow-2xl border-4 text-center relative overflow-hidden transition-all duration-300 ${
              activeAttentionAlert.theme === 'rose'
                ? 'bg-gradient-to-b from-rose-600 via-red-600 to-rose-700 border-rose-300 text-white shadow-rose-900/50'
                : activeAttentionAlert.theme === 'orange'
                ? 'bg-gradient-to-b from-orange-500 via-amber-600 to-red-600 border-amber-300 text-white shadow-orange-900/50'
                : activeAttentionAlert.theme === 'amber'
                ? 'bg-gradient-to-b from-amber-400 via-yellow-500 to-amber-600 border-yellow-200 text-slate-950 shadow-amber-900/50'
                : 'bg-gradient-to-b from-emerald-500 via-teal-600 to-emerald-700 border-emerald-300 text-white shadow-emerald-900/50'
            }`}
          >
            {/* Top Bar with 20s Countdown Timer Badge & Close Button */}
            <div className="flex items-center justify-between pb-6 border-b border-white/20 mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/25 backdrop-blur-sm text-white font-mono text-sm sm:text-base font-black">
                <Clock className="w-5 h-5 text-amber-300 animate-spin" />
                <span>PHÁT TÍN HIỆU CHÚ Ý: <strong className="text-amber-300 text-lg">{attentionSecondsLeft}s</strong></span>
              </div>

              <button
                onClick={handleDismissAttentionAlert}
                className="px-4 py-2 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all hover-zoom-btn"
                title="Bấm để đóng sớm khi lớp đã trật tự"
              >
                <X className="w-4 h-4" />
                <span>Đã trật tự • Tắt sớm</span>
              </button>
            </div>

            {/* Giant Animated Icon */}
            <div className="my-2">
              <div className={`text-7xl sm:text-9xl inline-block ${
                activeAttentionAlert.type === 'great' 
                  ? 'animate-clap-bounce' 
                  : 'animate-bounce'
              }`}>
                {activeAttentionAlert.icon}
              </div>
            </div>

            {/* GIANT TITLE TEXT (Phóng to thu nhỏ nhanh trong 20s) */}
            <div className="py-4">
              <h1 className="text-5xl sm:text-7xl md:text-8xl font-black uppercase tracking-tight drop-shadow-2xl animate-rapid-pulse-zoom leading-none select-none">
                {activeAttentionAlert.title}
              </h1>
            </div>

            {/* Subtext description */}
            <p className="text-lg sm:text-2xl md:text-3xl font-extrabold mt-4 max-w-3xl mx-auto opacity-95 leading-relaxed drop-shadow-md">
              {activeAttentionAlert.subText}
            </p>

            {/* Special Clapping Hands Graphic for "TUYỆT VỜI" */}
            {activeAttentionAlert.type === 'great' && (
              <div className="mt-6 flex items-center justify-center gap-3 text-3xl sm:text-5xl font-black text-amber-200">
                <span className="animate-clap-bounce">👏</span>
                <span className="text-xl sm:text-2xl uppercase tracking-wider text-white bg-black/20 px-4 py-1.5 rounded-full">
                  ★ TIẾNG VỖ TAY KHEN NGỢI CẢ LỚP ★
                </span>
                <span className="animate-clap-bounce">👏</span>
              </div>
            )}

            {/* Bottom 20s Progress Bar */}
            <div className="mt-8 pt-4">
              <div className="w-full bg-black/20 rounded-full h-3 overflow-hidden p-0.5 border border-white/20">
                <div 
                  className="bg-amber-300 h-full rounded-full transition-all duration-1000 ease-linear shadow-xs"
                  style={{ width: `${(attentionSecondsLeft / 20) * 100}%` }}
                />
              </div>
              <div className="text-xs sm:text-sm font-semibold opacity-80 mt-2">
                Tự động tắt sau 20 giây khi hết thời gian nhắc nhở ({attentionSecondsLeft}/20s)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid: 2 Panels matching PDF Page 23 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel 1: Cảnh Báo Tức Thì (4 Big colorful buttons) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4 hover-zoom-card">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" />
            Cảnh Báo Tức Thì (Phóng to thu nhỏ 20s)
          </h3>

          <div className="grid grid-cols-2 gap-3.5">
            {/* 1. IM LẶNG NÀO */}
            <button
              onClick={() => triggerAlert('shh')}
              className="p-5 rounded-3xl bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 text-amber-900 font-black text-xs md:text-sm flex flex-col items-center justify-center gap-2 shadow-xs hover-zoom-btn"
            >
              <span className="text-3xl">🤫</span>
              <span>IM LẶNG NÀO</span>
            </button>

            {/* 2. LỚP QUÁ ỒN */}
            <button
              onClick={() => triggerAlert('loud')}
              className="p-5 rounded-3xl bg-orange-100 hover:bg-orange-200 border-2 border-orange-400 text-orange-950 font-black text-xs md:text-sm flex flex-col items-center justify-center gap-2 shadow-xs hover-zoom-btn"
            >
              <span className="text-3xl">📢</span>
              <span>LỚP QUÁ ỒN</span>
            </button>

            {/* 3. DỪNG LẠI NGAY! */}
            <button
              onClick={() => triggerAlert('stop')}
              className="p-5 rounded-3xl bg-rose-100 hover:bg-rose-200 border-2 border-rose-400 text-rose-950 font-black text-xs md:text-sm flex flex-col items-center justify-center gap-2 shadow-xs hover-zoom-btn"
            >
              <span className="text-3xl">🛑</span>
              <span>DỪNG LẠI NGAY!</span>
            </button>

            {/* 4. TUYỆT VỜI! */}
            <button
              onClick={() => triggerAlert('great')}
              className="p-5 rounded-3xl bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-300 text-emerald-950 font-black text-xs md:text-sm flex flex-col items-center justify-center gap-2 shadow-xs hover-zoom-btn"
            >
              <span className="text-3xl">👏</span>
              <span>TUYỆT VỜI! (Vỗ tay)</span>
            </button>
          </div>
        </div>

        {/* Panel 2: Đếm Ngược Im Lặng */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4 hover-zoom-card flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Đếm Ngược Im Lặng
            </h3>

            {/* Clock Circle */}
            <div className="my-5 flex flex-col items-center justify-center">
              <div className="w-24 h-24 rounded-full border-4 border-indigo-100 bg-indigo-50 flex items-center justify-center shadow-inner hover-zoom-interactive">
                <span className="text-2xl font-black font-mono text-indigo-700">
                  {silenceSecondsLeft !== null ? `${silenceSecondsLeft}s` : '⏱️'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Khi hết giờ sẽ tự động khen lớp "TUYỆT VỜI!" 🎉
              </p>
            </div>

            {/* Presets [10s] [15s] [20s] [30s] [60s] */}
            <div className="flex items-center justify-center gap-2">
              {[10, 15, 20, 30, 60].map(s => (
                <button
                  key={s}
                  onClick={() => startSilenceTimer(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover-zoom-btn ${
                    silenceSecondsLeft !== null && activeDuration === s
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          {silenceSecondsLeft !== null && (
            <button
              onClick={() => setSilenceSecondsLeft(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
            >
              Hủy đếm ngược
            </button>
          )}
        </div>
      </div>

      {/* Panel 3: Phát Hiện Tiếng Ồn Tự Động (Microphone) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-5 hover-zoom-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold ${
              isListening ? 'bg-emerald-100 text-emerald-700 animate-pulse' : isSimulating ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-600'
            }`}>
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span>Phát Hiện Tiếng Ồn Tự Động (Microphone)</span>
                {isListening && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    Đang nghe trực tiếp
                  </span>
                )}
                {isSimulating && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase">
                    Đang mô phỏng (Demo)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tự động đo âm lượng lớp học thời gian thực và phát cảnh báo khi vượt ngưỡng cho phép.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isListening ? (
              <button
                type="button"
                onClick={stopMic}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 hover-zoom-btn"
              >
                <MicOff className="w-3.5 h-3.5" />
                <span>Tắt micro</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startMic}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-500/25 flex items-center gap-1.5 hover-zoom-btn"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Bật micro</span>
              </button>
            )}

            {isSimulating ? (
              <button
                type="button"
                onClick={stopSimulation}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold hover-zoom-btn"
              >
                Dừng mô phỏng
              </button>
            ) : (
              <button
                type="button"
                onClick={startSimulation}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 hover-zoom-btn"
                title="Bật mô phỏng tiếng ồn giả lập (thích hợp khi máy không có micro hoặc đang bị chặn quyền)"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Chế độ mô phỏng</span>
              </button>
            )}
          </div>
        </div>

        {/* Error notification & instruction */}
        {micError && (
          <div className="p-4 bg-amber-50 border-2 border-amber-300 text-amber-900 text-xs rounded-2xl space-y-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-extrabold text-amber-900">{micError}</div>
                <div className="text-amber-800 leading-relaxed">
                  💡 <strong>Cách xử lý:</strong> Nhấp vào biểu tượng <strong>Ổ khóa 🔒</strong> hoặc <strong>Cài đặt trang web</strong> bên trái thanh địa chỉ trình duyệt &gt; Tìm mục <strong>Microphone</strong> &gt; Chọn <strong>Cho phép (Allow)</strong> rồi bấm nút thử lại bên dưới.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 pl-6">
              <button
                type="button"
                onClick={startMic}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 hover-zoom-btn"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Thử lại bật micro</span>
              </button>
              <button
                type="button"
                onClick={startSimulation}
                className="px-3 py-1.5 rounded-lg bg-white border border-amber-400 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1 hover-zoom-btn"
              >
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span>Dùng chế độ mô phỏng ngay</span>
              </button>
            </div>
          </div>
        )}

        {(isListening || isSimulating) ? (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2">
                <span className="text-slate-600">Mức âm lượng hiện tại:</span>
                <span className={`font-mono text-lg font-black ${noiseLevel >= threshold ? 'text-rose-600 animate-pulse' : 'text-slate-800'}`}>
                  {noiseLevel} dB
                </span>
                {noiseLevel >= threshold && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black animate-bounce">
                    ⚠️ QUÁ NGƯỠNG CHO PHÉP!
                  </span>
                )}
              </div>

              {(isListening || isSimulating) && (
                <button
                  type="button"
                  onClick={triggerTestNoiseSpike}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold hover-zoom-btn"
                  title="Thử tạo tiếng ồn 82dB để kiểm tra cảnh báo"
                >
                  ⚡ Thử tạo tiếng ồn (82 dB)
                </button>
              )}
            </div>

            {/* Level Bar */}
            <div className="h-5 bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
              <div 
                className="absolute top-0 bottom-0 w-1.5 bg-rose-700 z-10 shadow-sm"
                style={{ left: `${threshold}%` }}
                title={`Ngưỡng cảnh báo: ${threshold} dB`}
              />
              <div 
                className={`h-full rounded-full transition-all duration-150 ${
                  noiseLevel >= threshold ? 'bg-gradient-to-r from-amber-500 to-rose-600' : 'bg-gradient-to-r from-emerald-400 to-teal-500'
                }`}
                style={{ width: `${noiseLevel}%` }}
              />
            </div>

            {/* Scale Legends */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
              <span>0 dB (Yên lặng)</span>
              <span className="font-bold text-rose-600">Ngưỡng báo động: {threshold} dB</span>
              <span>100 dB (Rất ồn)</span>
            </div>

            {/* Threshold Slider control */}
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700 font-bold">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>Điều chỉnh độ nhạy ngưỡng tiếng ồn:</span>
                <span className="font-mono text-indigo-600 font-black">{threshold} dB</span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-64">
                <span className="text-[10px] text-slate-400">40 dB</span>
                <input
                  type="range"
                  min="40"
                  max="90"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <span className="text-[10px] text-slate-400">90 dB</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Mic className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">
              Bật Micro hoặc Chế độ Mô phỏng để bắt đầu phát hiện tiếng ồn tự động.
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Hệ thống sẽ đo âm lượng âm thanh theo chuẩn dB và tự động phát âm thanh cảnh báo khi lớp quá ồn.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
