import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Pause } from 'lucide-react';

/** Nút "Nghe câu hỏi" khi câu hỏi có âm thanh (QuestionItem.audio). Không có âm thanh → không hiện gì. */
export const QuestionAudioButton: React.FC<{ src?: string; className?: string }> = ({ src, className = '' }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setPlaying(false);
    return () => { try { ref.current?.pause(); } catch (_) { /* ignore */ } ref.current = null; };
  }, [src]);

  if (!src) return null;
  const toggle = () => {
    if (!ref.current) {
      const a = new Audio(src);
      a.onended = () => setPlaying(false);
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      ref.current = a;
    }
    const a = ref.current;
    if (a.paused) { a.currentTime = a.ended ? 0 : a.currentTime; a.play().catch(() => setPlaying(false)); } else a.pause();
  };
  return (
    <div className={`flex justify-center ${className}`}>
      <button type="button" onClick={toggle} aria-pressed={playing}
        className="no-hover-fx h-10 px-4 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-black inline-flex items-center gap-2 shadow-sm">
        {playing ? <Pause className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />} {playing ? 'Tạm dừng' : 'Nghe câu hỏi'}
      </button>
    </div>
  );
};
