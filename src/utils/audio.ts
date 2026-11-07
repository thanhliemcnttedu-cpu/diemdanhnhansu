/**
 * Sound synthesis engine using the browser's Web Audio API.
 * Provides authentic, high-quality audio feedback without external file dependencies.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('AudioContext is only available in browser environment');
  }

  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this browser');
    }
    audioCtx = new AudioContextClass();
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

// Auto-unlock AudioContext on first user interaction to comply with browser Autoplay Policy
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch (_) {}
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('click', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true, once: true });
  window.addEventListener('keydown', unlockAudio, { passive: true, once: true });
  window.addEventListener('click', unlockAudio, { passive: true, once: true });
}

/**
 * Play a cheery coin / reward sound (LOUD & ENERGETIC)
 */
export function playCoinSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, now); // B5
    osc1.frequency.setValueAtTime(1318.51, now + 0.08); // E6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1975.53, now + 0.08); // B6

    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  } catch (e) {
    console.warn('Audio playback error', e);
  }
}

/**
 * Play a gentle deduction / warning sound (LOUD)
 */
export function playDeductSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.3);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Play tick sound for wheel or film reel (LOUD & CRISP)
 */
export function playTickSound(frequency = 700) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Play a triumphant fanfare / victory chime (LOUD, MAJESTIC & JOYFUL)
 */
export function playFanfareSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);

      const noteDuration = i === notes.length - 1 ? 0.8 : 0.18;
      gain.gain.setValueAtTime(0.45, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + noteDuration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + noteDuration);
    });
  } catch (e) {
    console.warn(e);
  }
}


/**
 * 10-second warning tick for timer
 */
export function playWarningTick() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Timer expired alarm - School bell / Rich alert chimes
 */
export function playTimerAlarm() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Rhythmic school bell / two-tone alert chime (Ding-Dong)
    const tones = [
      { f1: 880, f2: 1320, offset: 0, dur: 0.32, gain: 0.32 },
      { f1: 698.46, f2: 1046.5, offset: 0.25, dur: 0.45, gain: 0.38 }
    ];

    tones.forEach(({ f1, f2, offset, dur, gain: vol }) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(f1, now + offset);
      osc2.frequency.setValueAtTime(f2, now + offset);

      gainNode.gain.setValueAtTime(vol, now + offset);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now + offset);
      osc2.start(now + offset);
      osc1.stop(now + offset + dur);
      osc2.stop(now + offset + dur);
    });
  } catch (e) {
    console.warn(e);
  }
}

/**
 * 10-second continuous timer alarm with repeating bell chimes every second
 */
export function playTenSecondTimerAlarm(): { stop: () => void } {
  let isStopped = false;
  let count = 0;

  playTimerAlarm();
  count++;

  const interval = setInterval(() => {
    if (isStopped || count >= 10) {
      clearInterval(interval);
      return;
    }
    playTimerAlarm();
    count++;
  }, 1000);

  return {
    stop: () => {
      isStopped = true;
      clearInterval(interval);
    }
  };
}

/**
 * Sound 1 for "LỚP QUÁ ỒN!" - Melodic Warning Chime (Megaphone / Classroom Chime)
 */
export function playLoudAlertSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 3 ascending warning bell tones (D5 -> F#5 -> A5)
    const chords = [
      { freq: 587.33, time: 0, dur: 0.35 },
      { freq: 739.99, time: 0.22, dur: 0.35 },
      { freq: 880.00, time: 0.44, dur: 0.6 }
    ];

    chords.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      oscHarmonic.type = 'triangle';

      osc.frequency.setValueAtTime(freq, now + time);
      oscHarmonic.frequency.setValueAtTime(freq * 1.5, now + time);

      gain.gain.setValueAtTime(0.28, now + time);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      oscHarmonic.start(now + time);
      osc.stop(now + time + dur);
      oscHarmonic.stop(now + time + dur);
    });
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Sound 2 for "DỪNG LẠI NGAY!" - Sharp Referee Whistle / Urgent Stop Alarm (Distinct from LỚP QUÁ ỒN)
 */
export function playStopNowAlertSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 2 sharp whistle / siren stop blasts
    [0, 0.28].forEach(startTime => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sine';

      // Whistle vibrato effect
      osc1.frequency.setValueAtTime(2200, now + startTime);
      osc1.frequency.linearRampToValueAtTime(2600, now + startTime + 0.08);
      osc1.frequency.linearRampToValueAtTime(2300, now + startTime + 0.22);

      osc2.frequency.setValueAtTime(2800, now + startTime);
      osc2.frequency.linearRampToValueAtTime(3200, now + startTime + 0.08);
      osc2.frequency.linearRampToValueAtTime(2900, now + startTime + 0.22);

      gain.gain.setValueAtTime(0.32, now + startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startTime + 0.24);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now + startTime);
      osc2.start(now + startTime);
      osc1.stop(now + startTime + 0.24);
      osc2.stop(now + startTime + 0.24);
    });
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Classroom silence / noise warning bell
 */
export function playNoiseAlertSound() {
  playLoudAlertSound();
}

/**
 * Continuous "LỚP QUÁ ỒN!" alert sound for 20 seconds - Repeating ascending warning chime
 * Returns a stop control to cancel early when class is quiet again.
 */
export function playLoudAlertSound20s(): { stop: () => void } {
  let isStopped = false;
  const ctx = getAudioContext();
  const intervals: NodeJS.Timeout[] = [];

  const fireWarningChime = () => {
    if (isStopped) return;
    try {
      const now = ctx.currentTime;
      // Ascending warning bell tones (D5 -> F#5 -> A5) with harmonic overlay
      const chords = [
        { freq: 587.33, time: 0, dur: 0.35 },
        { freq: 739.99, time: 0.22, dur: 0.35 },
        { freq: 880.00, time: 0.44, dur: 0.6 }
      ];
      chords.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const oscH = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        oscH.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);
        oscH.frequency.setValueAtTime(freq * 1.5, now + time);
        gain.gain.setValueAtTime(0.26, now + time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
        osc.connect(gain);
        oscH.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + time);
        oscH.start(now + time);
        osc.stop(now + time + dur);
        oscH.stop(now + time + dur);
      });
    } catch (e) {
      console.warn(e);
    }
  };

  // Fire immediately
  fireWarningChime();

  // Repeat every 1.5s
  const chimeInterval = setInterval(() => {
    if (isStopped) { clearInterval(chimeInterval); return; }
    fireWarningChime();
  }, 1500);
  intervals.push(chimeInterval);

  // Auto-stop after 20 seconds
  const autoStopTimeout = setTimeout(() => { stop(); }, 20000);

  const stop = () => {
    isStopped = true;
    clearTimeout(autoStopTimeout);
    intervals.forEach(i => clearInterval(i));
  };

  return { stop };
}

/**
 * Continuous "DỪNG LẠI NGAY!" alert sound for 20 seconds - Repeating sharp whistle / urgent siren
 * Returns a stop control to cancel early.
 */
export function playStopNowAlertSound20s(): { stop: () => void } {
  let isStopped = false;
  const ctx = getAudioContext();
  const intervals: NodeJS.Timeout[] = [];

  const fireWhistleBlast = () => {
    if (isStopped) return;
    try {
      const now = ctx.currentTime;
      // 2 sharp whistle / siren stop blasts
      [0, 0.28].forEach(startTime => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sawtooth';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(2200, now + startTime);
        osc1.frequency.linearRampToValueAtTime(2600, now + startTime + 0.08);
        osc1.frequency.linearRampToValueAtTime(2300, now + startTime + 0.22);
        osc2.frequency.setValueAtTime(2800, now + startTime);
        osc2.frequency.linearRampToValueAtTime(3200, now + startTime + 0.08);
        osc2.frequency.linearRampToValueAtTime(2900, now + startTime + 0.22);
        gain.gain.setValueAtTime(0.30, now + startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, now + startTime + 0.24);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now + startTime);
        osc2.start(now + startTime);
        osc1.stop(now + startTime + 0.24);
        osc2.stop(now + startTime + 0.24);
      });
    } catch (e) {
      console.warn(e);
    }
  };

  // Fire immediately
  fireWhistleBlast();

  // Repeat every 1.2s
  const whistleInterval = setInterval(() => {
    if (isStopped) { clearInterval(whistleInterval); return; }
    fireWhistleBlast();
  }, 1200);
  intervals.push(whistleInterval);

  // Auto-stop after 20 seconds
  const autoStopTimeout = setTimeout(() => { stop(); }, 20000);

  const stop = () => {
    isStopped = true;
    clearTimeout(autoStopTimeout);
    intervals.forEach(i => clearInterval(i));
  };

  return { stop };
}

/**
 * Continuous "IM LẶNG NÀO!" alert sound for 20 seconds - Soft repeating descending chime (shh reminder)
 * Returns a stop control to cancel early.
 */
export function playShhAlertSound20s(): { stop: () => void } {
  let isStopped = false;
  const ctx = getAudioContext();
  const intervals: NodeJS.Timeout[] = [];

  const fireShhChime = () => {
    if (isStopped) return;
    try {
      const now = ctx.currentTime;
      // Gentle descending 3-note chime: G5 -> E5 -> C5 (soft reminder tone)
      const notes = [
        { freq: 783.99, time: 0, dur: 0.28 },
        { freq: 659.25, time: 0.20, dur: 0.28 },
        { freq: 523.25, time: 0.40, dur: 0.45 }
      ];
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);
        gain.gain.setValueAtTime(0.22, now + time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    } catch (e) {
      console.warn(e);
    }
  };

  // Fire immediately
  fireShhChime();

  // Repeat every 1.8s (gentler pace for "shh" reminder)
  const shhInterval = setInterval(() => {
    if (isStopped) { clearInterval(shhInterval); return; }
    fireShhChime();
  }, 1800);
  intervals.push(shhInterval);

  // Auto-stop after 20 seconds
  const autoStopTimeout = setTimeout(() => { stop(); }, 20000);

  const stop = () => {
    isStopped = true;
    clearTimeout(autoStopTimeout);
    intervals.forEach(i => clearInterval(i));
  };

  return { stop };
}

/**
 * Continuous applause + happy celebratory music for 20 seconds ("TUYỆT VỜI! VỖ TAY")
 */
export function playApplauseWithHappyMusic20s(): { stop: () => void } {
  let isStopped = false;
  const ctx = getAudioContext();
  const intervals: NodeJS.Timeout[] = [];

  // 1. Clapping generator (fires realistic claps repeatedly every 0.5s)
  const fireClapBurst = () => {
    if (isStopped) return;
    try {
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 0.04);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
      }

      // Generate 14 overlapping claps
      for (let i = 0; i < 14; i++) {
        const offset = Math.random() * 0.48;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800 + Math.random() * 900, now + offset);
        filter.Q.setValueAtTime(2.2, now + offset);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.12 + Math.random() * 0.1, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(now + offset);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  // 2. Upbeat Happy Celebration Melody (Bouncy celebratory tune in C Major)
  const melodyNotes = [
    { freq: 523.25, dur: 0.18 }, // C5
    { freq: 659.25, dur: 0.18 }, // E5
    { freq: 783.99, dur: 0.18 }, // G5
    { freq: 1046.50, dur: 0.32 }, // C6
    { freq: 880.00, dur: 0.2 },  // A5
    { freq: 783.99, dur: 0.26 }, // G5
    { freq: 659.25, dur: 0.18 }, // E5
    { freq: 587.33, dur: 0.22 }, // D5
    { freq: 523.25, dur: 0.38 }, // C5
    { freq: 0, dur: 0.12 },      // rest
    { freq: 659.25, dur: 0.18 }, // E5
    { freq: 783.99, dur: 0.18 }, // G5
    { freq: 880.00, dur: 0.24 }, // A5
    { freq: 1046.50, dur: 0.42 }, // C6
    { freq: 0, dur: 0.18 }        // rest
  ];

  let currentStep = 0;
  const playNextMelodyNote = () => {
    if (isStopped) return;
    try {
      const item = melodyNotes[currentStep % melodyNotes.length];
      currentStep++;
      if (item.freq > 0) {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle'; // marimba / music box feel
        osc2.type = 'sine';

        osc.frequency.setValueAtTime(item.freq, now);
        osc2.frequency.setValueAtTime(item.freq * 2, now); // 1 octave higher overtone

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + item.dur);

        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + item.dur);
        osc2.stop(now + item.dur);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  // Initial immediate bursts
  fireClapBurst();
  playNextMelodyNote();

  // Repeating clap burst every 500ms
  const clapInterval = setInterval(() => {
    if (isStopped) {
      clearInterval(clapInterval);
      return;
    }
    fireClapBurst();
  }, 500);
  intervals.push(clapInterval);

  // Repeating music notes every 210ms
  const musicInterval = setInterval(() => {
    if (isStopped) {
      clearInterval(musicInterval);
      return;
    }
    playNextMelodyNote();
  }, 210);
  intervals.push(musicInterval);

  // Auto-stop after 20 seconds
  const autoStopTimeout = setTimeout(() => {
    stop();
  }, 20000);

  const stop = () => {
    isStopped = true;
    clearTimeout(autoStopTimeout);
    intervals.forEach(i => clearInterval(i));
  };

  return { stop };
}

/**
 * Camera Shutter Snap for Lucky Lens
 */
export function playCameraShutterSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // First click
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(800, now);
    osc1.frequency.exponentialRampToValueAtTime(200, now + 0.04);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.05);

    // Second metallic snap
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1200, now + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(300, now + 0.12);
    gain2.gain.setValueAtTime(0.25, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.14);
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Duck Quack sound for Duck Race
 */
export function playDuckQuackSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.linearRampToValueAtTime(310, now + 0.08);
    osc.frequency.linearRampToValueAtTime(260, now + 0.2);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Card Flip sound for Mystery Cards
 */
export function playCardFlipSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Race Start Whistle sound
 */
export function playWhistleSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.setValueAtTime(2600, now + 0.08);
    osc.frequency.setValueAtTime(2350, now + 0.16);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Realistic Applause / Clapping Sound with cheer (LOUD & ENERGETIC)
 */
export function playApplauseSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 2.8;

    // Buffer of white noise for clapping bursts
    const bufferSize = Math.floor(ctx.sampleRate * 0.05); // 50ms per clap
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    // Play multiple random clapping sounds (rich crowd effect)
    const clapCount = 52;
    for (let i = 0; i < clapCount; i++) {
      const startTime = now + Math.random() * duration;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Bandpass filter to shape clap frequency
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(850 + Math.random() * 950, startTime);
      filter.Q.setValueAtTime(2.2, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25 + Math.random() * 0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.07);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(startTime);
    }

    // Add a triumphant chord swell under the applause
    const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C Major
    freqs.forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    });
  } catch (e) {
    console.warn('playApplauseSound error:', e);
  }
}

/**
 * 🌟 Energetic "YES!" Victory Sound
 * Phát âm thanh "Yes!" hào hứng qua Web Speech Synthesis + hợp âm Synth vui tươi
 */
export function playYesSound() {
  try {
    // 1. Synth chime nảy tươi vui
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [659.25, 783.99, 1046.50, 1318.51]; // E5, G5, C6, E6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.35, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.35);
    });

    // 2. Giọng nói hô vang "Yes!" / "Tuyệt vời!" qua Web Speech API
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Dừng câu trước nếu có
      const utterance = new SpeechSynthesisUtterance('Yes!');
      utterance.rate = 1.15;
      utterance.pitch = 1.35;
      utterance.volume = 1.0;
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.warn('playYesSound error:', e);
  }
}

/**
 * ❌ Funny Wrong Answer Buzzer Sound ("Uh-oh!" slide down)
 */
export function playWrongBuzzerSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Two-tone descending slide: 380Hz -> 260Hz -> 160Hz
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.setValueAtTime(260, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.45);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.setValueAtTime(0.35, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  } catch (e) {
    console.warn('playWrongBuzzerSound error:', e);
  }
}

/**
 * 🌸 Hiệu ứng Tung Hoa Rơi Lả Tả & Pháo Hoa Rực Rỡ (Canvas Confetti)
 */
export function triggerFlowerConfetti() {
  if (typeof window === 'undefined') return;

  import('canvas-confetti').then(({ default: confetti }) => {
    // Đợt 1: Bắn cánh hoa pastel rực rỡ từ 2 góc dưới màn hình
    const colors = ['#f472b6', '#fb7185', '#fde047', '#38bdf8', '#c084fc', '#4ade80', '#fb923c'];

    confetti({
      particleCount: 55,
      angle: 60,
      spread: 65,
      origin: { x: 0, y: 0.8 },
      colors,
      shapes: ['circle', 'square'],
      scalar: 1.2
    });

    confetti({
      particleCount: 55,
      angle: 120,
      spread: 65,
      origin: { x: 1, y: 0.8 },
      colors,
      shapes: ['circle', 'square'],
      scalar: 1.2
    });

    // Đợt 2: Tung pháo hoa kim tuyến giữa màn hình
    setTimeout(() => {
      confetti({
        particleCount: 75,
        spread: 100,
        origin: { y: 0.5 },
        colors,
        gravity: 0.7,
        ticks: 300,
        scalar: 1.3
      });
    }, 180);
  }).catch(() => {});
}

/**
 * 🎉 Tổ hợp Hiệu Ứng Trả Lời ĐÚNG: Tung hoa + Vỗ tay + Hô "Yes!" + Kèn chiến thắng
 */
export function triggerCorrectCelebration() {
  playCoinSound();
  playFanfareSound();
  playApplauseSound();
  playYesSound();
  triggerFlowerConfetti();
}

/**
 * 💔 Hiệu ứng Trả Lời SAI: Âm thanh Uh-oh + Rung nhẹ thiết bị
 */
export function triggerWrongFeedback() {
  playWrongBuzzerSound();
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([80, 50, 80]);
    } catch (_) {}
  }
}

export const playPointClink = playCoinSound;
export const playFanfare = playFanfareSound;

/**
 * 🚀 Âm thanh Tên lửa phóng lên vũ trụ (Rocket Thruster Whoosh)
 */
export function playRocketLaunchSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 1. Synth sweep up (110Hz -> 880Hz)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 1.2);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.3);

    // 2. White noise booster rush
    const bufferSize = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + 1.0);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.linearRampToValueAtTime(0.4, now + 0.5);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 1.2);
  } catch (e) {
    console.warn('playRocketLaunchSound error:', e);
  }
}

