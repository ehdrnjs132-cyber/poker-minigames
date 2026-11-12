// Floating blue glow particles behind everything.
(() => {
  const cv = document.getElementById('bg');
  const g = cv.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h, dpr, parts;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = cv.width = innerWidth * dpr;
    h = cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    const n = Math.round(Math.min(90, (innerWidth * innerHeight) / 16000));
    parts = Array.from({ length: n }, () => spawn(true));
  }

  function spawn(anywhere) {
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: (Math.random() * 1.8 + 0.4) * dpr,
      vy: (Math.random() * 0.25 + 0.08) * dpr,
      vx: (Math.random() - 0.5) * 0.12 * dpr,
      a: Math.random() * 0.6 + 0.2,
      tw: Math.random() * Math.PI * 2,
    };
  }

  function frame() {
    g.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.y -= p.vy;
      p.x += p.vx;
      p.tw += 0.03;
      if (p.y < -10) Object.assign(p, spawn(false));
      const a = p.a * (0.6 + 0.4 * Math.sin(p.tw));
      g.beginPath();
      g.fillStyle = `rgba(110,170,255,${a})`;
      g.shadowColor = 'rgba(60,140,255,.9)';
      g.shadowBlur = 8 * dpr;
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    if (!reduce) requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  resize();
  frame();
})();
