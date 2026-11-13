// Sound effects: recorded samples (Kenney CC0: casino + interface sounds in
// /assets/sfx) with a tiny WebAudio synth as fallback (e.g. before the files
// load, or if a browser can't decode .ogg).
const SFX = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('muted') === '1'; } catch {}

  // ---- recorded samples ------------------------------------------------
  const SAMPLES = [
    'card-place-1', 'card-place-2', 'card-place-3', 'card-slide-1', 'card-slide-2', 'card-slide-3', 'card-shuffle', 'card-fan-1',
    'chip-lay-1', 'chip-lay-2', 'chip-lay-3', 'chips-collide-1', 'chips-collide-2', 'chips-stack-1', 'chips-stack-2', 'chips-stack-3',
    'chips-handle-1', 'chips-handle-4', 'click_002', 'click_004', 'select_003', 'confirmation_002', 'confirmation_004', 'error_004',
    'maximize_006', 'open_002', 'pluck_001', 'drop_002', 'toggle_002', 'glass_002', 'bong_001', 'tick_002', 'minimize_006',
  ];
  const raw = {};      // name -> ArrayBuffer (fetched early)
  const buffers = {};  // name -> AudioBuffer (decoded once audio is unlocked)
  for (const n of SAMPLES) {
    fetch(`/assets/sfx/${n}.ogg`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { if (b) { raw[n] = b; decode(n); } }).catch(() => {});
  }
  function decode(n) {
    if (!ctx || !raw[n] || buffers[n]) return;
    const b = raw[n];
    raw[n] = null;
    ctx.decodeAudioData(b, (buf) => { buffers[n] = buf; }, () => {});
  }
  // Play one of the named samples (picked at random). Returns false if none is ready.
  function sample(names, { vol = 0.7, at = 0, rate = 1 } = {}) {
    if (muted) return true;
    const c = ac();
    if (!c) return false;
    const list = (Array.isArray(names) ? names : [names]).filter((n) => buffers[n]);
    if (!list.length) return false;
    const src = c.createBufferSource();
    src.buffer = buffers[list[(Math.random() * list.length) | 0]];
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g).connect(master);
    src.start(c.currentTime + at);
    return true;
  }
  const CARD_PLACE = ['card-place-1', 'card-place-2', 'card-place-3'];
  const CARD_SLIDE = ['card-slide-1', 'card-slide-2', 'card-slide-3'];
  const CHIP_LAY = ['chip-lay-1', 'chip-lay-2', 'chip-lay-3'];
  const CHIP_STACK = ['chips-stack-1', 'chips-stack-2', 'chips-stack-3'];

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      for (const n of SAMPLES) decode(n);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = null } = {}) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, { vol = 0.2, at = 0, freq = 2500, q = 0.8 } = {}) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  return {
    unlock: () => ac(),
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('muted', muted ? '1' : '0'); } catch {}
      return muted;
    },
    sample,
    click: () => sample(['click_002', 'click_004'], { vol: 0.5 }) || tone(880, 0.07, { type: 'triangle', vol: 0.12 }),
    select: () => sample('select_003', { vol: 0.55 }) || (tone(660, 0.08, { type: 'triangle', vol: 0.14 }), tone(990, 0.1, { type: 'triangle', vol: 0.1, at: 0.05 })),
    flip: (at = 0) => sample(CARD_PLACE, { vol: 0.45, at }) || noise(0.06, { at, freq: 3200, vol: 0.22, q: 1.2 }),
    // many cards at once: a few real card sounds spread over the wave
    flipWave(n = 16, gap = 0.04, start = 0) {
      if (buffers['card-slide-1']) { const k = Math.min(5, n); for (let i = 0; i < k; i++) sample(CARD_SLIDE, { vol: 0.32, at: start + (i * n * gap) / k }); return; }
      for (let i = 0; i < n; i++) noise(0.06, { at: start + i * gap, freq: 3200, vol: 0.22, q: 1.2 });
    },
    deal() {
      if (buffers['card-slide-1']) { for (let i = 0; i < 3; i++) sample(CARD_SLIDE, { vol: 0.5, at: i * 0.13 }); return; }
      for (let i = 0; i < 5; i++) noise(0.14, { at: i * 0.12, freq: 1400, vol: 0.18, q: 0.6 });
    },
    shuffle() { if (sample('card-shuffle', { vol: 0.6 })) return; for (let i = 0; i < 14; i++) noise(0.05, { at: i * 0.03, freq: 2600 + Math.random() * 800, vol: 0.1 }); },
    // Bets: bigger raise = more chips. level 1 (call) .. 3 (big raise)
    bet(level = 1) {
      if (!buffers['chip-lay-1']) return this.chips();
      sample(CHIP_LAY, { vol: 0.6 });
      if (level >= 2) sample(CHIP_STACK, { vol: 0.55, at: 0.12 });
      if (level >= 3) sample('chips-handle-4', { vol: 0.5, at: 0.26 });
    },
    allin() {
      if (!buffers['chips-collide-1']) { this.chips(); this.chips(); return; }
      sample('chips-handle-1', { vol: 0.6 });
      sample(['chips-collide-1', 'chips-collide-2'], { vol: 0.7, at: 0.18 });
      sample(CHIP_STACK, { vol: 0.6, at: 0.42 });
      tone(220, 0.6, { type: 'sawtooth', vol: 0.05, slide: 660, at: 0.05 });
    },
    sparkle: () => sample('glass_002', { vol: 0.45 }),
    panelOpen: () => sample('maximize_006', { vol: 0.35 }),
    // Rising whoosh + bright stab when the winner spotlight opens.
    spotlight() {
      noise(0.5, { freq: 700, vol: 0.14, q: 0.4 });
      tone(220, 0.45, { type: 'sawtooth', vol: 0.05, slide: 880 });
      [784, 988, 1175].forEach((f) => tone(f, 0.5, { type: 'triangle', vol: 0.09, at: 0.42 }));
    },
    swoosh: () => noise(0.32, { freq: 900, vol: 0.16, q: 0.5 }),
    pop: () => sample('pluck_001', { vol: 0.55 }) || (tone(740, 0.09, { type: 'sine', vol: 0.16, slide: 1180 }), tone(1180, 0.08, { type: 'triangle', vol: 0.06, at: 0.06 })),
    tick: () => sample('tick_002', { vol: 0.4 }) || tone(1320, 0.05, { type: 'square', vol: 0.05 }),
    lock: () => sample('confirmation_002', { vol: 0.55 }) || (tone(520, 0.08, { type: 'triangle', vol: 0.16 }), tone(780, 0.14, { type: 'triangle', vol: 0.14, at: 0.07 })),
    chips() { if (sample(CHIP_STACK, { vol: 0.6 })) return; for (let i = 0; i < 6; i++) tone(2400 + Math.random() * 1200, 0.07, { type: 'sine', vol: 0.08, at: i * 0.05 }); },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.16, at: i * 0.08 }));
      sample(['chips-collide-1', 'chips-collide-2'], { vol: 0.6, at: 0.1 }) || this.chips();
      sample(CHIP_STACK, { vol: 0.55, at: 0.45 });
      sample('glass_002', { vol: 0.4, at: 0.3 });
    },
    lose() { tone(392, 0.35, { type: 'sawtooth', vol: 0.06, slide: 196 }); tone(311, 0.45, { type: 'triangle', vol: 0.1, at: 0.15, slide: 155 }); },
    split() { tone(660, 0.2, { type: 'triangle', vol: 0.14 }); tone(660, 0.25, { type: 'triangle', vol: 0.14, at: 0.18 }); },
    fanfare() {
      [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: 'triangle', vol: 0.15, at: i * 0.11 }));
      sample('confirmation_004', { vol: 0.5, at: 0.75 });
      sample(['chips-collide-1', 'chips-collide-2'], { vol: 0.5, at: 0.4 });
    },
  };
})();

window.SFX = SFX;
