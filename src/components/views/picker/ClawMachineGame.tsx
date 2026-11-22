import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Hand, Gift } from 'lucide-react';
import { handleAvatarImgError } from '../../../utils/avatarConfig';
import { useClassroom } from '../../../context/ClassroomContext';
import type { Student } from '../../../types';
import { playTickSound, playFanfareSound, playCoinSound } from '../../../utils/audio';
import { CalledStudentModal } from './CalledStudentModal';
import { useFairCall } from './useFairCall';

/**
 * Máy gắp thú gọi tên: mỗi bạn là một chú thú 3D bóng trong máy. Bấm gắp: thú xáo trộn, càng gắp hai lần đầu đều lắc lắc rồi
 * làm rơi, lần thứ ba mới gắp chắc, đưa về cửa nhận quà và ảnh bạn được gọi hiện lên (~9 giây). Bạn được chọn trước theo lượt
 * công bằng (không gọi lại bạn đã gọi), cú gắp chỉ là phần diễn.
 * Tọa độ trong máy tính theo % khung: x theo bề rộng, y theo chiều cao.
 */
const CAP = 24;               // tối đa số thú trong máy (lớp đông thì lấy ngẫu nhiên trong số chưa được gọi)
const PER_ROW = 8;
const PITCH = 8.75;           // khoảng cách ngang giữa các thú (% bề rộng)
const PILE_X0 = 26, PILE_W = 70;
const TOY_D = 8.2;            // đường kính thú (% bề rộng)
const RAIL_Y = 6.5;
const HEAD_H = 14;            // chiều cao đầu càng (% chiều cao)
const HOLD = 0.82 * HEAD_H;   // thú được kẹp ở độ sâu này so với đỉnh đầu càng
const TOP_REST = 20;          // đỉnh đầu càng khi nghỉ
const REST_X = 60;
const CHUTE_X = 11, CHUTE_Y = 76;
const SHUFFLE_MS = 1300;      // thời gian xáo trộn trước khi gắp

const ANIMALS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦉', '🦋', '🐢', '🐙', '🐬', '🐳', '🦄', '🐝', '🐞', '🦀'];
// Ba sắc độ (sáng, vừa, tối) cho mỗi quả cầu bông 3D
const TONES: Array<[string, string, string]> = [
  ['#FBCFE8', '#F472B6', '#BE185D'], ['#CCFBF1', '#2DD4BF', '#0F766E'], ['#FEF3C7', '#FBBF24', '#B45309'], ['#E0F2FE', '#38BDF8', '#0369A1'],
  ['#EDE9FE', '#A78BFA', '#6D28D9'], ['#FFEDD5', '#FB923C', '#C2410C'], ['#DCFCE7', '#4ADE80', '#15803D'], ['#FEE2E2', '#F87171', '#B91C1C'],
];

const hashStr = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const shuffle = <T,>(a: T[]): T[] => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const pickSome = (list: Student[], n: number) => shuffle(list).slice(0, n);
const givenName = (name: string) => { const p = name.trim().split(/\s+/); return p[p.length - 1] || name; };
const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const bounceOut = (u: number) => { const n1 = 7.5625, d1 = 2.75; if (u < 1 / d1) return n1 * u * u; if (u < 2 / d1) { u -= 1.5 / d1; return n1 * u * u + 0.75; } if (u < 2.5 / d1) { u -= 2.25 / d1; return n1 * u * u + 0.9375; } u -= 2.625 / d1; return n1 * u * u + 0.984375; };

/** Vị trí từng chỗ trong đống thú: hàng giữa cho đẹp, so le nhẹ. */
function layoutSlots(n: number): Array<{ x: number; y: number }> {
  const rows = Math.max(1, Math.ceil(n / PER_ROW));
  const ys = rows === 1 ? [76] : rows === 2 ? [66, 83] : [60, 74, 88];
  const out: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++) {
    const count = Math.min(PER_ROW, n - r * PER_ROW);
    const start = PILE_X0 + (PILE_W - count * PITCH) / 2 + PITCH / 2;
    for (let i = 0; i < count; i++) out.push({ x: start + i * PITCH, y: ys[r] + (i % 2 ? 0.9 : -0.9) });
  }
  return out;
}

const CSS = `
.claw-stage{container-type:inline-size;position:relative;width:100%;aspect-ratio:1/.95;overflow:hidden;border-radius:20px;
  background:linear-gradient(180deg,#DFF4FF 0%,#F6E9FF 55%,#FFF3D1 100%)}
.claw-stage::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.55) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.55) 1px,transparent 1px);background-size:6.25% 6.58%;opacity:.7}
.claw-floor{position:absolute;left:0;right:0;bottom:0;height:46%;background:repeating-linear-gradient(90deg,#FFE9A8 0 6%,#FFDF86 6% 12%);border-top:.8cqw solid #F59E0B}
.claw-toy{position:absolute;width:${TOY_D}%;aspect-ratio:1;transform:translate(-50%,-50%)}
.claw-shadow{position:absolute;left:8%;width:84%;bottom:-7%;height:17%;border-radius:50%;background:radial-gradient(closest-side,rgba(80,30,0,.38),transparent);z-index:-1}
.claw-wob{position:absolute;inset:0;animation:clawBob var(--dur,2.6s) ease-in-out var(--del,0s) infinite alternate}
.claw-playing .claw-wob{animation-duration:calc(var(--dur,2.6s)*.4)}
.claw-ear{position:absolute;top:-9%;width:34%;height:34%;border-radius:50%;background:radial-gradient(circle at 40% 35%,var(--hi),var(--mid) 60%,var(--lo));box-shadow:inset -.3cqw -.3cqw .6cqw rgba(0,0,0,.25)}
.claw-ear.l{left:3%}.claw-ear.r{right:3%}
.claw-body{position:absolute;inset:0;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 34% 28%,var(--hi) 0%,var(--mid) 42%,var(--lo) 100%);
  box-shadow:inset -.8cqw -1cqw 1.5cqw rgba(0,0,0,.3),inset .5cqw .6cqw 1cqw rgba(255,255,255,.55),0 1cqw 1.4cqw rgba(80,30,0,.25)}
.claw-face{width:70%;height:70%;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:4.1cqw;line-height:1;
  background:radial-gradient(circle at 40% 30%,#fff,#FFF3DC 70%,#F6DFB4);box-shadow:inset 0 -.5cqw .9cqw rgba(160,100,20,.28),0 .2cqw .4cqw rgba(255,255,255,.7)}
.claw-face span{filter:drop-shadow(0 .35cqw .35cqw rgba(0,0,0,.28))}
.claw-gloss{position:absolute;left:13%;top:7%;width:38%;height:22%;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(255,255,255,0));transform:rotate(-30deg);pointer-events:none}
.claw-label{position:absolute;left:50%;top:calc(100% + .3cqw);transform:translateX(-50%);max-width:125%;padding:0 .8cqw;border-radius:999px;background:rgba(255,255,255,.92);
  color:#1e293b;font-weight:800;font-size:max(9px,1.9cqw);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.claw-card{position:absolute;z-index:40;left:50%;top:44%;width:34%;padding:2.2cqw 2cqw 2.4cqw;border-radius:3cqw;background:linear-gradient(180deg,#fff,#FFF4D6);border:.9cqw solid #F59E0B;text-align:center;
  box-shadow:0 2cqw 4cqw rgba(120,53,15,.35);animation:clawPop .7s cubic-bezier(.2,1.2,.3,1) both}
.claw-card img{width:100%;aspect-ratio:1;object-fit:cover;object-position:center top;border-radius:2cqw;display:block;background:#fff}
.claw-card b{display:block;margin-top:1.4cqw;font-size:max(11px,2.7cqw);line-height:1.2;color:#0f172a;font-weight:800;overflow-wrap:break-word;text-wrap:balance}
.claw-card i{display:block;font-style:normal;font-size:max(9px,1.9cqw);font-weight:800;color:#B45309;text-transform:uppercase;margin-top:.5cqw}
@keyframes clawPop{0%{left:11%;top:76%;transform:translate(-50%,-50%) scale(.12);opacity:0}100%{left:50%;top:44%;transform:translate(-50%,-50%) scale(1);opacity:1}}
@keyframes clawBob{from{transform:perspective(500px) rotateY(-18deg) translateY(0)}to{transform:perspective(500px) rotateY(18deg) translateY(-6%)}}
/* Máy hẹp: tên dưới thú không đủ chỗ (sẽ bị cắt chữ) nên ẩn; tên bạn vẫn hiện ở lời nhắn và thẻ ảnh */
@container (max-width:430px){.claw-label{display:none}}
@media (prefers-reduced-motion:reduce){.claw-wob{animation:none!important}.claw-card{animation-duration:.01s}}
`;

type Phase = 'idle' | 'play' | 'landed';

export const ClawMachineGame: React.FC = () => {
  const { currentClassStudents, awardPoints } = useClassroom();
  const fair = useFairCall();
  const classKey = currentClassStudents.map(s => s.id).join('|');

  const [toys, setToys] = useState<Student[]>(() => pickSome(currentClassStudents.filter(s => !fair.calledIds.includes(s.id)), CAP));
  const [phase, setPhase] = useState<Phase>('idle');
  const [msg, setMsg] = useState('Sẵn sàng! Bấm nút để gắp ngẫu nhiên');
  const [winner, setWinner] = useState<Student | null>(null);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ s: Student; t: string }>>([]);   // các bạn vừa được gọi trong phiên này
  const [card, setCard] = useState<Student | null>(null);   // thẻ ảnh bạn trúng hiện lên từ cửa nhận quà
  const [awarded, setAwarded] = useState(false);

  const rafRef = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const toyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trolleyRef = useRef<HTMLDivElement | null>(null);
  const cableRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const armL = useRef<SVGGElement | null>(null);
  const armR = useRef<SVGGElement | null>(null);

  const playing = phase === 'play';
  const slots = useMemo(() => layoutSlots(toys.length), [toys.length]);
  const emojis = useMemo(() => {
    const used = new Set<number>();
    const map: Record<string, string> = {};
    toys.forEach(t => {
      let k = hashStr(t.id) % ANIMALS.length;
      for (let g = 0; g < ANIMALS.length && used.has(k); g++) k = (k + 1) % ANIMALS.length;
      used.add(k); map[t.id] = ANIMALS[k];
    });
    return map;
  }, [toys]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timers.current.forEach(t => window.clearTimeout(t));
  }, []);

  // Đổi lớp thì dựng lại đống thú
  useEffect(() => {
    if (playing) return;
    setToys(pickSome(currentClassStudents.filter(s => !fair.calledIds.includes(s.id)).length > 0 ? currentClassStudents.filter(s => !fair.calledIds.includes(s.id)) : currentClassStudents, CAP));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey]);

  const setArms = (open: number) => {
    const a = -15 + 29 * open;
    armL.current?.setAttribute('transform', `rotate(${a} 38 16)`);
    armR.current?.setAttribute('transform', `rotate(${-a} 62 16)`);
  };
  const placeClaw = (x: number, top: number, open: number) => {
    if (trolleyRef.current) trolleyRef.current.style.left = `${x}%`;
    if (headRef.current) headRef.current.style.left = `${x}%`;
    if (headRef.current) headRef.current.style.top = `${top}%`;
    if (cableRef.current) { cableRef.current.style.left = `${x}%`; cableRef.current.style.height = `${Math.max(0, top - RAIL_Y - 2)}%`; }
    setArms(open);
  };
  const moveToy = (id: string, x: number, y: number, extra?: { opacity?: number; scale?: number; z?: string; rot?: number }) => {
    const el = toyRefs.current[id];
    if (!el) return;
    el.style.left = `${x}%`; el.style.top = `${y}%`;
    el.style.zIndex = extra?.z ?? '';
    el.style.opacity = extra?.opacity != null ? String(extra.opacity) : '';
    el.style.transform = `translate(-50%,-50%)${extra?.rot ? ` rotate(${extra.rot}deg)` : ''}${extra?.scale != null ? ` scale(${extra.scale})` : ''}`;
  };

  const grab = () => {
    if (playing || currentClassStudents.length === 0) return;
    timers.current.forEach(t => window.clearTimeout(t)); timers.current = [];
    const pool = currentClassStudents.filter(s => !fair.calledIds.includes(s.id));
    const list = pool.length > 0 ? pool : currentClassStudents;
    // Đống thú chỉ gồm các bạn chưa được gọi; thiếu thì lấy thêm cho đủ
    let shown = toys.filter(t => list.some(s => s.id === t.id));
    if (shown.length < Math.min(CAP, list.length)) shown = pickSome(list, CAP);
    const target = shown[Math.floor(Math.random() * shown.length)];
    const others = shuffle(shown.filter(t => t.id !== target.id));
    // Hai lần gắp trượt dùng hai chú khác (lớp quá ít bạn thì dùng lại)
    const d1 = others[0] || target, d2 = others[1] || others[0] || target;
    setToys(shown);
    setWinner(null); setOpen(false); setCard(null); setAwarded(false); setPhase('play'); setMsg('Đang xáo trộn các chú thú…');

    // Chờ bố cục mới được vẽ rồi mới chạy
    rafRef.current = requestAnimationFrame(() => {
      const n = shown.length;
      const sl = layoutSlots(n);
      const midOrder = shuffle(shown), finOrder = shuffle(shown);
      const idx0: Record<string, number> = {}, idxMid: Record<string, number> = {}, idxFin: Record<string, number> = {};
      shown.forEach((t, i) => { idx0[t.id] = i; });
      midOrder.forEach((t, i) => { idxMid[t.id] = i; });
      finOrder.forEach((t, i) => { idxFin[t.id] = i; });
      const jit: Record<string, number> = {}, arc: Record<string, number> = {}, ph: Record<string, number> = {};
      shown.forEach(t => { jit[t.id] = Math.random() * 0.3; arc[t.id] = 3 + Math.random() * 6; ph[t.id] = Math.random() * 6.28; });
      const fin = (id: string) => sl[idxFin[id]];
      const LIFT = TOP_REST + 4;

      // ---- Dựng kịch bản: [ms, x, đỉnh đầu càng, độ mở (1 mở, 0 đóng)] + các cửa sổ mang / lắc / rơi ----
      const K: Array<[number, number, number, number]> = [[0, REST_X, TOP_REST, 1], [SHUFFLE_MS, REST_X, TOP_REST, 1]];
      type Win = { id: string; ok: boolean; carry: [number, number]; shake: [number, number]; drop: [number, number] };
      const wins: Win[] = [];
      let t = SHUFFLE_MS;
      let resultAt = 0;
      ([[d1, false], [d2, false], [target, true]] as Array<[Student, boolean]>).forEach(([toy, ok]) => {
        const s0 = fin(toy.id);
        const top = s0.y - HOLD;
        K.push([t += 500, s0.x, TOP_REST, 1]);
        K.push([t += 450, s0.x, top, 1]);
        const tClose = (t += 200); K.push([t, s0.x, top, 0.05]);
        const tLiftEnd = (t += 450); K.push([t, s0.x, LIFT, 0.05]);
        if (!ok) {
          const tShakeEnd = (t += 700); K.push([t, s0.x, LIFT, 0.05]);      // lắc lắc lắc rồi tuột
          wins.push({ id: toy.id, ok, carry: [tClose, tShakeEnd], shake: [tLiftEnd, tShakeEnd], drop: [tShakeEnd, tShakeEnd + 450] });
          K.push([t += 150, s0.x, LIFT - 1, 1]);
          K.push([t += 250, s0.x, TOP_REST, 1]);
        } else {
          const tHoldEnd = (t += 200); K.push([t, s0.x, LIFT, 0.05]);
          const tCarryEnd = (t += 800); K.push([t, CHUTE_X, LIFT, 0.05]);     // mang về cửa nhận quà
          wins.push({ id: toy.id, ok, carry: [tClose, tCarryEnd], shake: [tLiftEnd, tHoldEnd], drop: [tCarryEnd, tCarryEnd + 350] });
          K.push([t += 200, CHUTE_X, LIFT - 1, 1]);
          resultAt = tCarryEnd + 350;
          K.push([t += 250, CHUTE_X, TOP_REST, 1]);
        }
      });
      K.push([t += 700, REST_X, TOP_REST, 1]);
      const END = t;
      const at = (tt: number): [number, number, number] => {
        for (let i = 0; i < K.length - 1; i++) {
          const a0 = K[i], b0 = K[i + 1];
          if (tt < b0[0]) { const u = ease(clamp01((tt - a0[0]) / Math.max(1, b0[0] - a0[0]))); return [a0[1] + (b0[1] - a0[1]) * u, a0[2] + (b0[2] - a0[2]) * u, a0[3] + (b0[3] - a0[3]) * u]; }
        }
        const l = K[K.length - 1]; return [l[1], l[2], l[3]];
      };
      const shufflePos = (id: string, tt: number) => {
        const half = SHUFFLE_MS / 2;
        const [from, to, u0] = tt < half ? [sl[idx0[id]], sl[idxMid[id]], tt / half] as const : [sl[idxMid[id]], sl[idxFin[id]], (tt - half) / half] as const;
        const u = clamp01((u0 - jit[id]) / (1 - jit[id]));
        const e = ease(u);
        return { x: from.x + (to.x - from.x) * e + Math.sin(u * 6.28 + ph[id]) * 1.2, y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * u) * arc[id] };
      };

      const notes: Array<[number, () => void]> = [
        [wins[0].drop[0], () => { setMsg('Lắc lắc… rơi mất rồi! Gắp lại nào…'); playTickSound(300); }],
        [wins[1].drop[0], () => { setMsg('Lại trượt! Thử lần nữa…'); playTickSound(280); }],
        [wins[2].carry[0], () => { setMsg('Gắp được rồi! Đưa về cửa nhận quà…'); playTickSound(560); }],
      ];
      const closeTicks = wins.map(w => w.carry[0]);
      let ni = 0, ci = 0, reordered = false, resultDone = false;
      const t0 = performance.now();

      const frame = (now: number) => {
        const tt = now - t0;
        const [x, top, open] = at(tt);
        let shakeX = 0, swing = 0;
        wins.forEach(w => {
          if (tt >= w.shake[0] && tt < w.shake[1]) {
            const u = (tt - w.shake[0]) / (w.shake[1] - w.shake[0]);
            const amp = w.ok ? 0.5 : 0.5 + 2.2 * u;
            shakeX = amp * Math.sin(tt / 36); swing = Math.sin(tt / 36 + 1) * (w.ok ? 5 : 8 + 18 * u);
          }
        });
        placeClaw(x + shakeX, top, open);

        // Thú nằm trong đống: xáo trộn rồi về chỗ mới
        shown.forEach(toy => {
          const p = tt < SHUFFLE_MS ? shufflePos(toy.id, tt) : fin(toy.id);
          moveToy(toy.id, p.x, p.y);
        });
        if (!reordered && tt >= SHUFFLE_MS) { reordered = true; setToys(finOrder); setMsg('Hạ tay gắp nào!'); }

        // Thú bị càng kẹp: mang theo, lắc, rơi lại / vào cửa nhận quà
        wins.forEach(w => {
          const sl0 = fin(w.id);
          if (tt >= w.carry[0] && tt < w.carry[1]) moveToy(w.id, x + shakeX, top + HOLD, { z: '20', rot: swing });
          else if (tt >= w.drop[0] && tt < w.drop[1]) {
            const u = clamp01((tt - w.drop[0]) / (w.drop[1] - w.drop[0]));
            if (w.ok) {
              moveToy(w.id, CHUTE_X, (LIFT + HOLD) + (CHUTE_Y - (LIFT + HOLD)) * easeOut(u), { z: '20', scale: 1 - 0.4 * u, opacity: 1 - 0.85 * u });
            } else {
              const fx = sl0.x + (x + shakeX - sl0.x) * (1 - u);
              moveToy(w.id, fx, (LIFT + HOLD) + (sl0.y - (LIFT + HOLD)) * bounceOut(u), { z: '20', rot: swing * (1 - u) });
            }
          } else if (w.ok && tt >= w.drop[1]) moveToy(w.id, CHUTE_X, CHUTE_Y, { scale: 0.5, opacity: 0 });
        });

        while (ci < closeTicks.length && tt >= closeTicks[ci]) { playTickSound(420); ci++; }
        while (ni < notes.length && tt >= notes[ni][0]) { notes[ni][1](); ni++; }

        if (!resultDone && tt >= resultAt) {
          resultDone = true;
          const newcomer = pickSome(list.filter(s2 => s2.id !== target.id && !shown.some(x2 => x2.id === s2.id)), 1)[0];
          setToys(prev => {
            const idx = prev.findIndex(p2 => p2.id === target.id);
            if (idx < 0) return prev;
            const next = [...prev];
            if (newcomer) next[idx] = newcomer; else next.splice(idx, 1);
            return next;
          });
          setWinner(target); setPhase('landed'); setMsg(`Gắp trúng: ${target.name}`);
          setCard(target);
          setHistory(h => [{ s: target, t: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 8));
          fair.markCalled(target.id, 'claw');
          playFanfareSound(); confetti({ particleCount: 80, spread: 75, origin: { x: 0.2, y: 0.7 } });
          timers.current.push(window.setTimeout(() => { setCard(null); setOpen(true); }, 1800));
        }
        if (tt < END) rafRef.current = requestAnimationFrame(frame);
        else { rafRef.current = null; placeClaw(REST_X, TOP_REST, 1); }
      };
      rafRef.current = requestAnimationFrame(frame);
    });
  };

  const award = (pts: number, reason: string) => {
    if (!winner || awarded) return;
    awardPoints([winner.id], pts, `${reason} (Máy gắp thú gọi tên)`);
    playCoinSound(); setAwarded(true);
  };

  const remaining = currentClassStudents.length - fair.calledIds.length;

  return (
    <div className="rounded-3xl border border-sky-100 shadow-xs p-3 sm:p-4 space-y-3 text-center" style={{ background: 'linear-gradient(180deg,#F0F9FF 0%,#FFF7ED 100%)' }}>
      <style>{CSS}</style>
      <div>
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">MÁY GẮP THÚ GỌI TÊN</h2>
        <p className="text-sm text-slate-700 wrap-ok">Mỗi chú thú là một bạn. Các chú thú xáo trộn, càng gắp trượt hai lần, lần thứ ba gắp được chú nào thì bạn đó được gọi tên.</p>
      </div>

      <div className="grid gap-3 min-[1280px]:grid-cols-[180px_minmax(0,1fr)_180px] min-[1600px]:grid-cols-[250px_minmax(0,1fr)_250px] items-start text-left">
      {/* Cột trái: cách chơi + tiến độ cả lớp (dưới 1280px: nằm dưới máy gắp) */}
      <aside className="order-2 min-[1280px]:order-1 grid gap-3 grid-cols-1 max-[1279px]:min-[640px]:grid-cols-2 content-start">
        <section className="rounded-2xl bg-white/90 border border-sky-200 p-3.5 shadow-2xs">
          <h3 className="text-sm font-black text-slate-900 uppercase mb-2.5">Cách chơi</h3>
          <ol className="space-y-2.5">
            {[['1', 'Bấm "Hạ tay gắp thú ngay".'], ['2', 'Các chú thú xáo trộn, càng chạy đi tìm.'], ['3', 'Gắp trượt hai lần, lần thứ ba gắp được bạn nào thì bạn đó được gọi tên.']].map(([n, t]) => (
              <li key={n} className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-pink-600 text-white text-xs font-black flex items-center justify-center shrink-0">{n}</span>
                <span className="text-sm font-semibold text-slate-800 wrap-ok">{t}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-2xl bg-white/90 border border-amber-200 p-3.5 shadow-2xs">
          <h3 className="text-sm font-black text-slate-900 uppercase mb-1.5">Lớp học</h3>
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-3xl font-black tabular-nums text-pink-700">{remaining}</span>
            <span className="text-sm font-bold text-slate-700 tabular-nums">/ {currentClassStudents.length} bạn chưa được gọi</span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-200 overflow-hidden" aria-hidden>
            <div className="h-full bg-gradient-to-r from-pink-500 to-orange-500" style={{ width: `${currentClassStudents.length ? ((currentClassStudents.length - remaining) / currentClassStudents.length) * 100 : 0}%` }} />
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-700 wrap-ok">Bạn đã được gọi không bị gọi lại cho đến khi cả lớp đủ một vòng.</p>
          {fair.calledIds.length > 0 && !playing && (
            <button type="button" onClick={fair.resetRound} className="mt-2 min-h-9 px-3 rounded-xl border border-amber-300 bg-amber-50 text-xs font-black text-amber-900 cursor-pointer hover:bg-amber-100 whitespace-nowrap">Bắt đầu vòng mới</button>
          )}
        </section>
      </aside>

      <div className="order-1 min-[1280px]:order-2 min-w-0">
      {/* Vỏ máy */}
      <div className="mx-auto w-full max-w-[820px] rounded-[32px] p-2.5 shadow-lg" style={{ background: 'linear-gradient(135deg,#FBBF24,#FB7185 50%,#A78BFA)' }}>
        <div className="rounded-t-[22px] px-4 py-2 flex items-center justify-center gap-2 text-white font-black uppercase tracking-wide text-sm sm:text-base"
          style={{ background: 'linear-gradient(90deg,#E11D48,#EA580C)' }}>
          <span aria-hidden>🧸</span><span>Máy gắp thú may mắn</span><span aria-hidden>🧸</span>
        </div>

        <div className={`claw-stage ${playing ? 'claw-playing' : ''}`} role="img" aria-label="Máy gắp thú gọi tên">
          {/* Thanh ray */}
          <div className="absolute left-[3%] right-[3%] rounded-full" style={{ top: `${RAIL_Y}%`, height: '1.6%', background: 'linear-gradient(180deg,#CBD5E1,#94A3B8)', transform: 'translateY(-50%)' }} />
          <div className="absolute rounded-md" style={{ left: '1.5%', top: `${RAIL_Y}%`, width: '3%', height: '8%', transform: 'translateY(-50%)', background: 'linear-gradient(90deg,#94A3B8,#E2E8F0)' }} />
          <div className="absolute rounded-md" style={{ right: '1.5%', top: `${RAIL_Y}%`, width: '3%', height: '8%', transform: 'translateY(-50%)', background: 'linear-gradient(90deg,#E2E8F0,#94A3B8)' }} />

          {/* Xe trượt + dây cáp + đầu càng */}
          <div ref={trolleyRef} className="absolute z-10 rounded-lg" style={{ left: `${REST_X}%`, top: `${RAIL_Y}%`, width: '12%', height: '5.5%', transform: 'translate(-50%,-50%)', background: 'linear-gradient(180deg,#FDE047,#F59E0B)', border: '.5cqw solid #B45309', boxShadow: '0 2px 4px rgba(0,0,0,.2)' }}>
            <span className="absolute left-1/2 top-1/2 w-[14%] aspect-square rounded-full bg-rose-500 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div ref={cableRef} className="absolute z-10" style={{ left: `${REST_X}%`, top: `${RAIL_Y + 2}%`, height: `${TOP_REST - RAIL_Y - 2}%`, width: '1.6%', transform: 'translateX(-50%)', background: 'repeating-linear-gradient(180deg,#64748B 0 4px,#E2E8F0 4px 8px)', borderRadius: 4 }} />
          <div ref={headRef} className="absolute z-30" style={{ left: `${REST_X}%`, top: `${TOP_REST}%`, width: '15%', transform: 'translateX(-50%)' }}>
            <svg viewBox="0 0 100 90" className="w-full h-auto block drop-shadow-md" aria-hidden>
              <rect x="32" y="0" width="36" height="20" rx="8" fill="#FBBF24" stroke="#B45309" strokeWidth="3" />
              <circle cx="50" cy="10" r="4" fill="#38BDF8" stroke="#fff" strokeWidth="1.5" />
              <g ref={armL} transform="rotate(14 38 16)">
                <path d="M38 16 C18 30 12 52 22 76" fill="none" stroke="#94A3B8" strokeWidth="8" strokeLinecap="round" />
                <circle cx="22" cy="76" r="6" fill="#F43F5E" stroke="#fff" strokeWidth="2" />
              </g>
              <g ref={armR} transform="rotate(-14 62 16)">
                <path d="M62 16 C82 30 88 52 78 76" fill="none" stroke="#94A3B8" strokeWidth="8" strokeLinecap="round" />
                <circle cx="78" cy="76" r="6" fill="#F43F5E" stroke="#fff" strokeWidth="2" />
              </g>
            </svg>
          </div>

          {/* Lời nhắn */}
          <div className="absolute left-1/2 z-20 -translate-x-1/2 px-3 py-1 rounded-full bg-white/90 border border-sky-200 text-center font-bold text-slate-800 shadow-xs"
            style={{ top: '38%', fontSize: 'max(9px,2.2cqw)', width: 'max-content', maxWidth: '96%', whiteSpace: 'nowrap' }} aria-live="polite">
            {msg}
          </div>

          {/* Sàn + cửa nhận quà */}
          <div className="claw-floor" />
          <div className="absolute rounded-2xl flex flex-col items-center justify-center text-center" style={{ left: '3%', top: '58%', width: '18%', height: '36%', background: 'linear-gradient(180deg,#FFFFFF,#FFF1C2)', border: '.8cqw solid #F59E0B', boxShadow: '0 .8cqw 1.4cqw rgba(120,53,15,.2)' }}>
            <span className="rounded-full" style={{ width: '70%', height: '6%', background: '#92400E', marginBottom: '8%' }} />
            <Gift style={{ width: '38%', height: 'auto', color: '#EA580C' }} />
            <span className="font-black text-amber-900 leading-tight uppercase flex flex-col items-center whitespace-nowrap" style={{ fontSize: 'max(9px,1.9cqw)', marginTop: '6%' }}>
              <span>Cửa</span><span>nhận quà</span>
            </span>
          </div>

          {/* Đống thú (quả cầu bông 3D bóng) */}
          {toys.map((t, i) => {
            const sPos = slots[i];
            if (!sPos) return null;
            const h = hashStr(t.id);
            const tone = TONES[h % TONES.length];
            return (
              <div
                key={t.id}
                ref={el => { toyRefs.current[t.id] = el; }}
                className="claw-toy"
                style={{ left: `${sPos.x}%`, top: `${sPos.y}%`, ['--hi' as string]: tone[0], ['--mid' as string]: tone[1], ['--lo' as string]: tone[2] } as React.CSSProperties}
              >
                <span className="claw-shadow" />
                <div className="claw-wob" style={{ ['--dur' as string]: `${2.2 + (h % 5) * 0.35}s`, ['--del' as string]: `${-(h % 7) * 0.3}s` } as React.CSSProperties}>
                  <span className="claw-ear l" /><span className="claw-ear r" />
                  <div className="claw-body">
                    <div className="claw-face"><span aria-hidden>{emojis[t.id]}</span></div>
                    <span className="claw-gloss" />
                  </div>
                </div>
                <span className="claw-label" title={t.name}>{givenName(t.name)}</span>
              </div>
            );
          })}

          {/* Ảnh bạn được gọi hiện lên từ cửa nhận quà */}
          {card && (
            <div className="claw-card" role="status">
              <img src={card.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => handleAvatarImgError(e, card.gender, card.name)} />
              <b>{card.name}</b>
              <i>Được gọi tên!</i>
            </div>
          )}
        </div>

        <div className="rounded-b-[22px] px-3 py-3" style={{ background: 'linear-gradient(180deg,#FEF3C7,#FDE68A)' }}>
          <button type="button" onClick={grab} disabled={playing || currentClassStudents.length === 0}
            className="no-hover-fx w-full min-h-14 px-6 rounded-2xl text-white text-base sm:text-lg font-black uppercase flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-pink-500/30 disabled:opacity-60 bg-gradient-to-r from-pink-600 to-orange-600">
            <Hand className="w-5 h-5 shrink-0" />
            <span>{playing ? 'Đang gắp…' : 'Hạ tay gắp thú ngay'}</span>
          </button>
        </div>
      </div>

      </div>

      {/* Cột phải: các bạn vừa được gọi + số thú trong máy */}
      <aside className="order-3 grid gap-3 grid-cols-1 max-[1279px]:min-[640px]:grid-cols-2 content-start">
        <section className="rounded-2xl bg-white/90 border border-pink-200 p-3.5 shadow-2xs">
          <h3 className="text-sm font-black text-slate-900 uppercase mb-2.5">Vừa được gọi</h3>
          {history.length === 0 ? (
            <p className="text-sm font-semibold text-slate-600 wrap-ok">Chưa gọi bạn nào. Bấm nút hạ tay gắp thú để bắt đầu.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h, i) => (
                <li key={`${h.s.id}-${i}`} className={`flex items-center gap-2.5 rounded-xl p-1.5 ${i === 0 ? 'bg-amber-50 border border-amber-200' : ''}`}>
                  <img src={h.s.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => handleAvatarImgError(e, h.s.gender, h.s.name)}
                    className="w-9 h-9 rounded-full object-cover object-top bg-white border border-slate-200 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-slate-900 leading-tight break-words">{h.s.name}</div>
                    <div className="text-xs font-semibold text-slate-600 tabular-nums">{h.t}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl bg-white/90 border border-violet-200 p-3.5 shadow-2xs">
          <h3 className="text-sm font-black text-slate-900 uppercase mb-1.5">Trong máy</h3>
          <p className="text-sm font-bold text-slate-800 tabular-nums">{Math.min(CAP, toys.length)} chú thú đang chờ được gắp</p>
          <p className="mt-1 text-xs font-semibold text-slate-700 wrap-ok">
            {currentClassStudents.length > CAP ? 'Lớp đông nên máy lấy ngẫu nhiên từ các bạn chưa được gọi; gắp xong sẽ có bạn khác vào thay.' : 'Mỗi chú thú là một bạn chưa được gọi trong vòng này.'}
          </p>
        </section>
      </aside>
      </div>

      <CalledStudentModal
        student={winner} open={open} title="MÁY GẮP THÚ GỌI TÊN" badge="MÁY GẮP"
        onAward={award} awarded={awarded} onClose={() => setOpen(false)}
      />
    </div>
  );
};

export default ClawMachineGame;
