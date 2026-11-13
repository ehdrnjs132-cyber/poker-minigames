// Visual effects: a particle burst engine using Kenney's CC0 particle textures
// (tinted on the fly) and one-shot Lottie animations from LottieFiles (Lottie
// Simple License). Presets cover bets, raises, all-ins, wins and knock-outs.
(() => {
  const TEX = ['star_04', 'star_06', 'star_07', 'spark_01', 'spark_04', 'spark_06', 'flare_01', 'light_01', 'magic_02', 'twirl_02', 'circle_05', 'smoke_04', 'smoke_07', 'flame_03', 'scorch_02', 'symbol_01', 'symbol_02'];
  const imgs = {};
  for (const n of TEX) { const im = new Image(); im.src = `/assets/fx/${n}.png`; imgs[n] = im; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // tinted copies of the white textures, cached per color
  const tintCache = {};
  function tinted(name, color) {
    const key = `${name}|${color}`;
    if (tintCache[key]) return tintCache[key];
    const im = imgs[name];
    if (!im || !im.complete || !im.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0, 128, 128);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.35;
    g.drawImage(im, 0, 0, 128, 128); // keep a hot white core
    tintCache[key] = c;
    return c;
  }

  // ---------------------------------------------------------------- canvas
  const cv = document.createElement('canvas');
  cv.className = 'fx-canvas';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
  }
  resize();
  addEventListener('resize', resize);

  const parts = [];
  let running = false;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function emit(x, y, o) {
    const n = reduced ? Math.ceil(o.count / 3) : o.count;
    for (let i = 0; i < n; i++) {
      const ang = rand(o.angle?.[0] ?? 0, o.angle?.[1] ?? Math.PI * 2);
      const sp = rand(o.speed[0], o.speed[1]);
      parts.push({
        tex: pick(o.tex), color: pick(o.colors), x: x + rand(-(o.spread || 0), o.spread || 0), y: y + rand(-(o.spread || 0), o.spread || 0),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: o.gravity || 0, drag: o.drag ?? 0.98,
        size: rand(o.size[0], o.size[1]), grow: o.grow ?? 0, rot: rand(0, Math.PI * 2), vr: rand(-(o.spin || 0), o.spin || 0),
        life: 0, max: rand(o.life[0], o.life[1]), delay: rand(0, o.delay || 0), blend: o.blend || 'lighter', fade: o.fade ?? 1,
      });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const k = p.life / p.max;
      const size = p.size * (1 + p.grow * k);
      const img = tinted(p.tex, p.color);
      if (!img) continue;
      g.globalCompositeOperation = p.blend;
      g.globalAlpha = Math.max(0, (k < 0.12 ? k / 0.12 : 1) * (1 - Math.pow(k, 2) * p.fade));
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.drawImage(img, -size / 2, -size / 2, size, size);
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (parts.length) requestAnimationFrame(tick);
    else { running = false; g.clearRect(0, 0, W, H); }
  }

  const GOLD = ['#ffd34d', '#ffe9a0', '#ffb31a'];
  const PRESETS = {
    // small chip toss: call / check-raise
    bet: [{ count: 10, tex: ['spark_04', 'star_06'], colors: GOLD, speed: [80, 220], size: [14, 26], life: [0.35, 0.6], drag: 0.9 }],
    // a real raise: ring + stars
    raise: [
      { count: 1, tex: ['circle_05'], colors: ['#ffd34d'], speed: [0, 0], size: [40, 40], grow: 3, life: [0.45, 0.45] },
      { count: 18, tex: ['star_04', 'star_07', 'spark_06'], colors: GOLD, speed: [140, 340], size: [16, 34], life: [0.5, 0.9], drag: 0.92, spin: 6 },
    ],
    // all-in: flare, flames and a big star shower
    allin: [
      { count: 1, tex: ['flare_01'], colors: ['#ff7a1a'], speed: [0, 0], size: [120, 120], grow: 1.5, life: [0.7, 0.7] },
      { count: 14, tex: ['flame_03'], colors: ['#ff5a1a', '#ffb31a', '#ff2d55'], speed: [60, 180], angle: [-Math.PI * 0.95, -Math.PI * 0.05], size: [40, 70], grow: 0.6, life: [0.6, 1], gravity: -120, drag: 0.94 },
      { count: 30, tex: ['star_04', 'star_06', 'spark_01'], colors: GOLD, speed: [200, 480], size: [16, 36], life: [0.6, 1.2], drag: 0.93, spin: 8 },
    ],
    // winner: hearts + stars + twirls in cute colors
    win: [
      { count: 1, tex: ['light_01'], colors: ['#fff2b8'], speed: [0, 0], size: [160, 160], grow: 1.2, life: [0.9, 0.9] },
      { count: 26, tex: ['star_04', 'star_06', 'star_07'], colors: [...GOLD, '#ff9ecb', '#9be7ff'], speed: [180, 460], size: [18, 40], life: [0.8, 1.5], drag: 0.95, gravity: 160, spin: 6 },
      { count: 10, tex: ['symbol_01'], colors: ['#ff6b9a', '#ff9ecb'], speed: [120, 300], angle: [-Math.PI * 0.9, -Math.PI * 0.1], size: [20, 34], life: [1, 1.6], gravity: -40, drag: 0.97 },
      { count: 4, tex: ['twirl_02', 'magic_02'], colors: ['#ffe28a', '#c7a6ff'], speed: [0, 30], size: [90, 140], grow: 0.8, life: [0.8, 1.1], spin: 3 },
    ],
    sparkle: [{ count: 8, tex: ['star_06', 'spark_04'], colors: ['#ffffff', '#ffe28a'], speed: [30, 120], size: [10, 22], life: [0.4, 0.8], drag: 0.9, spread: 10 }],
    // knock-out / bomb: smoke + scorch
    boom: [
      { count: 1, tex: ['flare_01'], colors: ['#ffb31a'], speed: [0, 0], size: [140, 140], grow: 1.4, life: [0.5, 0.5] },
      { count: 12, tex: ['smoke_04', 'smoke_07'], colors: ['#8a8a9a', '#5c5c6e'], speed: [40, 160], size: [50, 90], grow: 1.2, life: [0.8, 1.4], drag: 0.95, blend: 'source-over', gravity: -30 },
      { count: 16, tex: ['spark_01', 'spark_06'], colors: ['#ffd34d', '#ff7a1a'], speed: [220, 520], size: [16, 30], life: [0.3, 0.6], drag: 0.9 },
    ],
    ko: [
      { count: 10, tex: ['star_07', 'star_04'], colors: ['#ffffff', '#ffe28a'], speed: [60, 160], size: [14, 24], life: [0.6, 1], drag: 0.92, spin: 10 },
      { count: 6, tex: ['smoke_04'], colors: ['#9a9aaa'], speed: [20, 80], size: [40, 70], grow: 1, life: [0.7, 1.1], blend: 'source-over', gravity: -40 },
    ],
  };

  function burst(x, y, name) {
    for (const o of PRESETS[name] || []) emit(x, y, o);
  }
  function center(el) {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  // ---------------------------------------------------------------- Lottie
  const LOTTIE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js';
  let lottieLoading = null;
  function loadLottie() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (!lottieLoading) {
      lottieLoading = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = LOTTIE_URL;
        s.onload = () => res(window.lottie);
        s.onerror = () => { lottieLoading = null; rej(new Error('lottie')); };
        document.head.appendChild(s);
      });
    }
    return lottieLoading;
  }
  const animCache = {};
  function animData(name) {
    if (!animCache[name]) animCache[name] = fetch(`/assets/lottie/${name}.json`).then((r) => r.json());
    return animCache[name];
  }
  // warm up quietly so the first win plays instantly
  setTimeout(() => { loadLottie().catch(() => {}); ['confetti', 'coins-burst', 'coins-fall', 'trophy'].forEach((n) => animData(n).catch(() => {})); }, 2500);

  // Play a Lottie once. full: covers the screen; otherwise centered at x,y with a size.
  function lottieOnce(name, { x, y, size = 220, full = false, speed = 1, z = 64 } = {}) {
    if (reduced) return;
    Promise.all([loadLottie(), animData(name)]).then(([L, data]) => {
      const box = document.createElement('div');
      box.className = `fx-lottie${full ? ' full' : ''}`;
      box.style.zIndex = String(z);
      if (!full) {
        box.style.width = box.style.height = `${size}px`;
        box.style.left = `${x - size / 2}px`;
        box.style.top = `${y - size / 2}px`;
      }
      document.body.appendChild(box);
      const anim = L.loadAnimation({
        container: box, renderer: 'svg', loop: false, autoplay: true, animationData: JSON.parse(JSON.stringify(data)),
        rendererSettings: { preserveAspectRatio: full ? 'xMidYMid slice' : 'xMidYMid meet' }, // full-screen ones cover any shape
      });
      anim.setSpeed(speed);
      const done = () => { anim.destroy(); box.remove(); };
      anim.addEventListener('complete', done);
      setTimeout(done, 6000);
    }).catch(() => {});
  }

  // ---------------------------------------------------------------- combos
  const FX = {
    burst,
    at(el, name) { if (el) burst(...center(el), name); },
    lottie: lottieOnce,
    // A bet went in. level: 1 call, 2 raise, 3 big raise, 4 all-in
    bet(el, level = 1) {
      if (!el) return;
      const [x, y] = center(el);
      if (level >= 4) {
        burst(x, y, 'allin');
        lottieOnce('coins-burst', { x, y: y - 20, size: 260, speed: 1.1 });
      } else if (level >= 2) {
        burst(x, y, 'raise');
        if (level >= 3) lottieOnce('coins-burst', { x, y: y - 10, size: 180, speed: 1.2 });
      } else burst(x, y, 'bet');
    },
    // A round won (winner's avatar element, and whether it was me)
    win(el, mine) {
      lottieOnce('confetti', { full: true, z: 63, speed: mine ? 1 : 1.3 });
      if (el) {
        const [x, y] = center(el);
        burst(x, y, 'win');
        lottieOnce('coins-fall', { x, y: y - 60, size: 240, z: 65 });
      }
      if (mine) setTimeout(() => window.SFX?.sparkle?.(), 400);
    },
    // Game over: trophy for the champion
    champion(mine) {
      lottieOnce('confetti', { full: true, z: 63 });
      if (mine) lottieOnce('trophy', { x: innerWidth / 2, y: innerHeight * 0.32, size: Math.min(300, innerWidth * 0.6), z: 66 });
    },
  };
  window.FX = FX;
})();
