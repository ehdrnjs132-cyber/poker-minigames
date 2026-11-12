// Tiny WebAudio synth — no audio files needed.
const SFX = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('muted') === '1'; } catch {}

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
    click: () => tone(880, 0.07, { type: 'triangle', vol: 0.12 }),
    select: () => { tone(660, 0.08, { type: 'triangle', vol: 0.14 }); tone(990, 0.1, { type: 'triangle', vol: 0.1, at: 0.05 }); },
    flip: (at = 0) => noise(0.06, { at, freq: 3200, vol: 0.22, q: 1.2 }),
    flipWave(n = 16, gap = 0.04, start = 0) { for (let i = 0; i < n; i++) this.flip(start + i * gap); },
    deal() { for (let i = 0; i < 5; i++) noise(0.14, { at: i * 0.12, freq: 1400, vol: 0.18, q: 0.6 }); },
    shuffle() { for (let i = 0; i < 14; i++) noise(0.05, { at: i * 0.03, freq: 2600 + Math.random() * 800, vol: 0.1 }); },
    tick: () => tone(1320, 0.05, { type: 'square', vol: 0.05 }),
    lock: () => { tone(520, 0.08, { type: 'triangle', vol: 0.16 }); tone(780, 0.14, { type: 'triangle', vol: 0.14, at: 0.07 }); },
    chips() { for (let i = 0; i < 6; i++) tone(2400 + Math.random() * 1200, 0.07, { type: 'sine', vol: 0.08, at: i * 0.05 }); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.16, at: i * 0.08 })); this.chips(); },
    lose() { tone(392, 0.35, { type: 'sawtooth', vol: 0.06, slide: 196 }); tone(311, 0.45, { type: 'triangle', vol: 0.1, at: 0.15, slide: 155 }); },
    split() { tone(660, 0.2, { type: 'triangle', vol: 0.14 }); tone(660, 0.25, { type: 'triangle', vol: 0.14, at: 0.18 }); },
    fanfare() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: 'triangle', vol: 0.15, at: i * 0.11 })); },
  };
})();
