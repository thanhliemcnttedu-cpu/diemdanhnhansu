/**
 * Audio synthesis engine for 5-minute Energizer Games.
 * Generates lively background music loops and game-specific sound effects
 * using the Web Audio API without requiring any external MP3 files.
 */

let audioCtx: AudioContext | null = null;
let bgmInterval: NodeJS.Timeout | null = null;
let isBgmPlaying = false;
let isMuted = false;

function getContext(): AudioContext | null {
  return null;
}

export function setEnergizerMuted(muted: boolean) {
  isMuted = muted;
  if (muted && isBgmPlaying) {
    stopEnergizerBgm();
  }
}

export function getEnergizerMuted(): boolean {
  return isMuted;
}

/**
 * Cheerful, upbeat background music loop for 5-minute energizer games.
 * Soft marimba / chime pentatonic sequence (~112 BPM).
 */
export function startEnergizerBgm() {
  if (isMuted || isBgmPlaying) return;
  const ctx = getContext();
  if (!ctx) return;

  isBgmPlaying = true;
  // Pentatonic notes: C5, D5, E5, G5, A5, C6
  const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
  const pattern = [0, 2, 4, 3, 2, 4, 5, 3, 1, 3, 4, 2, 0, 4, 3, 1];
  let step = 0;

  const playBeat = () => {
    if (!isBgmPlaying || isMuted) return;
    try {
      const now = ctx.currentTime;
      const freq = scale[pattern[step % pattern.length]];
      step++;

      // Marimba / Toy piano oscillator
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      // Warm percussive envelope
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.24);

      // Bass note every 4 beats
      if (step % 4 === 1) {
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(freq / 4, now);
        bassGain.gain.setValueAtTime(0.06, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        bassOsc.connect(bassGain);
        bassGain.connect(ctx.destination);
        bassOsc.start(now);
        bassOsc.stop(now + 0.45);
      }
    } catch {
      // Ignore audio glitches
    }
  };

  playBeat();
  // 112 BPM = ~268ms per 16th beat
  bgmInterval = setInterval(playBeat, 270);
}

export function stopEnergizerBgm() {
  isBgmPlaying = false;
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
}

/**
 * 1. Clapping Sound Effect for "Vỗ tay theo nhịp Hạnh Phúc"
 */
export function playClapSound(count = 1) {
  if (isMuted) return;
  const ctx = getContext();
  if (!ctx) return;

  for (let c = 0; c < count; c++) {
    const delay = c * 0.18;
    setTimeout(() => {
      try {
        const now = ctx.currentTime;
        const bufferSize = ctx.sampleRate * 0.04;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1100, now);
        filter.Q.setValueAtTime(3, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(now);
      } catch {
        // ignore
      }
    }, delay * 1000);
  }
}

/**
 * 2. Deep Tibetan Singing Bowl / Zen Bell for "Bức tượng tĩnh lặng"
 */
export function playZenSingingBowl() {
  if (isMuted) return;
  const ctx = getContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const freqs = [392.00, 784.00, 1176.00]; // G4 harmonic series
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq + (idx === 1 ? 2 : 0), now); // Subtle natural chorus

      const volume = idx === 0 ? 0.22 : 0.08;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 3.3);
    });
  } catch {
    // ignore
  }
}

/**
 * 3. Mystery Gift Box Opening Sound with Sparkling Arpeggio
 */
export function playMysteryBoxOpenSound() {
  if (isMuted) return;
  const ctx = getContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const chimeNotes = [440, 554.37, 659.25, 880, 1108.73, 1318.51, 1760]; // A Major sparkle
    chimeNotes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      gain.gain.setValueAtTime(0.18, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.36);
    });
  } catch {
    // ignore
  }
}

/**
 * 4. Wind Gust Whoosh for "Gió thổi - Gió thổi"
 */
export function playWindWhooshSound() {
  if (isMuted) return;
  const ctx = getContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const duration = 0.9;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.linearRampToValueAtTime(850, now + 0.4);
    filter.frequency.linearRampToValueAtTime(220, now + duration);
    filter.Q.setValueAtTime(3.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  } catch {
    // ignore
  }
}

/**
 * 5. Gentle Warm Harp Chime for "Bức thư Lời khen giấu tên"
 */
export function playComplimentHeartChime() {
  if (isMuted) return;
  const ctx = getContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    // Warm F Major chord: F4, A4, C5, E5, G5
    const freqs = [349.23, 440.00, 523.25, 659.25, 783.99];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(0.16, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 1.25);
    });
  } catch {
    // ignore
  }
}

/**
 * 6. Quick Urgent Tick for "Đồng hồ cát 10 giây"
 */
export function playSandHourglassTick() {
  if (isMuted) return;
  const ctx = getContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    // ignore
  }
}
