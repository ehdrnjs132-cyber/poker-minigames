// Lobby plaza: everyone in the lobby is a little character you walk around with
// the arrow keys / WASD (or tap to move). Standing on a pad for a moment
// triggers it: create a game, open the ranking / my page / tutorial, or walk
// into a portal to join an open room.
(() => {
  const { socket, esc } = window.HA;
  const t = (k, v) => I18N.t(k, v);
  const W = 760;
  const H = 520;
  const SPEED = 240;      // logical px per second
  const CHARGE_MS = 850;  // how long to stand on a pad
  const SEND_MS = 100;
  const HEARTBEAT_MS = 2000;

  const root = document.getElementById('plaza');
  if (!root) return;
  root.innerHTML = `
    <div class="plaza-world" id="plazaWorld">
      <div class="plaza-floor"></div>
      <div class="plaza-pads" id="plazaPads"></div>
      <div class="plaza-people" id="plazaPeople"></div>
    </div>
    <div class="plaza-hint" id="plazaHint"></div>`;
  const world = root.querySelector('#plazaWorld');
  const padsBox = root.querySelector('#plazaPads');
  const people = root.querySelector('#plazaPeople');

  // ---------------------------------------------------------------- pads
  const STATIC_PADS = [
    { id: 'memory', x: 28, y: 34, w: 228, h: 128, kind: 'game', label: () => t('game.memory'), art: 'memory' },
    { id: 'nut', x: 276, y: 34, w: 228, h: 128, kind: 'game', label: () => t('game.nut'), art: 'nut' },
    { id: 'rank', x: 526, y: 34, w: 206, h: 54, kind: 'menu', icon: '🏆', label: () => t('plaza.rank') },
    { id: 'me', x: 526, y: 100, w: 206, h: 54, kind: 'menu', icon: '🐱', label: () => t('plaza.me') },
    { id: 'howto', x: 526, y: 166, w: 206, h: 54, kind: 'menu', icon: '❔', label: () => t('plaza.howto') },
  ];
  let rooms = [];
  let pads = [];

  const ART = {
    memory: '<span class="pm pm-back"></span><span class="pm pm-face red">A<i>♥</i></span><span class="pm pm-back"></span>',
    nut: '<span class="pm pm-face">K<i>♠</i></span><span class="pm pm-face red">K<i>♥</i></span><span class="pm pm-bolt">⚡</span>',
  };

  function portalPads() {
    const list = rooms.slice(0, 4);
    return list.map((r, i) => ({
      id: `room-${r.code}`, code: r.code, x: 28 + i * 180, y: 404, w: 164, h: 92, kind: 'portal', room: r,
      label: () => t('plaza.portal', { name: r.host }),
    }));
  }

  function buildPads() {
    pads = [...STATIC_PADS, ...portalPads()];
    const html = pads.map((p) => {
      const style = `left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px`;
      if (p.kind === 'game') {
        return `<div class="pad game" data-pad="${p.id}" style="${style}"><div class="pad-in"><div class="pad-art">${ART[p.art]}</div><b>${esc(p.label())}</b><span class="pad-sub">${t('cta.create')}</span></div><i class="pad-fill"></i></div>`;
      }
      if (p.kind === 'menu') {
        return `<div class="pad menu" data-pad="${p.id}" style="${style}"><div class="pad-in"><span class="pad-icon">${p.icon}</span><b>${esc(p.label())}</b></div><i class="pad-fill"></i></div>`;
      }
      const r = p.room;
      const sub = r.joinable ? (r.playing ? t('rooms.lateJoin') : t('join.btn')) : t('rooms.watch');
      return `<div class="pad portal${r.joinable ? '' : ' watch'}" data-pad="${p.id}" style="${style}"><div class="pad-in"><span class="portal-ring"></span><b>${esc(p.label())}</b><span class="pad-sub">${esc(t(`game.${r.gameId}`))} · ${r.players}/${r.max} · ${sub}</span></div><i class="pad-fill"></i></div>`;
    }).join('');
    const empty = rooms.length ? '' : `<div class="plaza-empty" style="left:28px;top:420px;width:704px">${t('plaza.noRooms')}</div>`;
    padsBox.innerHTML = html + empty;
    for (const p of pads) p.el = padsBox.querySelector(`[data-pad="${p.id}"]`);
  }

  function trigger(p) {
    if (window.SFX) SFX.click();
    if (p.kind === 'game') {
      document.querySelector(`.games [data-game="${p.id}"]`)?.click();
    } else if (p.id === 'rank') {
      document.getElementById('rankBtn')?.click();
    } else if (p.id === 'me') {
      document.getElementById('meBtn')?.click();
    } else if (p.id === 'howto') {
      document.querySelector('#lobby [data-tutorial]')?.click();
    } else if (p.kind === 'portal') {
      document.querySelector(`#roomList [data-join="${p.code}"]`)?.click();
    }
  }

  // ---------------------------------------------------------------- characters
  function charHTML(p) {
    return `<div class="pc-shadow"></div>
      <div class="pc-body" style="--pc:${HA.colorFor(p.uid || p.name || 'x')}">
        <div class="pc-head avatar">${HA.avatarInner(p)}</div>
        <i class="pc-arm l"></i><i class="pc-arm r"></i>
        <i class="pc-foot l"></i><i class="pc-foot r"></i>
      </div>
      <div class="pc-name">${esc(p.name || '')}</div>`;
  }

  function makeChar(p, mine) {
    const el = document.createElement('div');
    el.className = `pc${mine ? ' mine' : ''}`;
    el.innerHTML = charHTML(p);
    el._sig = sigOf(p);
    people.appendChild(el);
    return el;
  }
  const sigOf = (p) => `${p.name}|${p.avatar}|${p.avatarV}|${p.uid}`;

  function place(el, x, y, d, moving) {
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.zIndex = String(Math.round(y));
    el.classList.toggle('walk', !!moving);
    el.classList.toggle('left', d < 0);
  }

  const me = { x: W / 2, y: 300, d: 1, moving: false, el: null, target: null };
  function myProfile() {
    const u = HA.profile() || {};
    return { uid: HA.credentials().uid, name: HA.myName() || u.name || '?', avatar: u.avatar, avatarV: u.avatarV };
  }

  const others = new Map(); // sid -> { el, x, y, tx, ty, d, m }
  socket.on('plaza', (list) => {
    const seen = new Set();
    for (const p of list || []) {
      if (p.sid === socket.id) continue;
      seen.add(p.sid);
      let o = others.get(p.sid);
      if (!o) {
        o = { el: makeChar(p, false), x: p.x, y: p.y };
        o.el.dataset.sid = p.sid;
        others.set(p.sid, o);
      } else if (o.el._sig !== sigOf(p)) {
        const bubble = o.el.querySelector('.pc-bubble');
        o.el.innerHTML = charHTML(p);
        if (bubble) o.el.appendChild(bubble);
        o.el._sig = sigOf(p);
      }
      Object.assign(o, { tx: p.x, ty: p.y, d: p.d, m: p.m });
    }
    for (const [sid, o] of others) if (!seen.has(sid)) { o.el.remove(); others.delete(sid); }
  });
  socket.on('rooms', (list) => {
    rooms = list || [];
    buildPads();
  });

  // ---------------------------------------------------------------- input
  const keys = new Set();
  const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  const lobbyActive = () => document.getElementById('lobby').classList.contains('active');
  const modalOpen = () => !!document.querySelector('.overlay.show, .tut-overlay.show, .sheet-overlay.show');
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  function inView() {
    const r = root.getBoundingClientRect();
    return r.bottom > 60 && r.top < innerHeight - 60;
  }
  addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (!k || typing(e) || !lobbyActive() || modalOpen() || !inView()) return;
    e.preventDefault();
    keys.add(k);
    me.target = null;
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => keys.clear());

  world.addEventListener('pointerdown', (e) => {
    const r = world.getBoundingClientRect();
    const s = scale;
    me.target = { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  });

  // ---------------------------------------------------------------- loop
  // Small screens zoom in and follow your character instead of shrinking the whole plaza.
  const MIN_SCALE = 0.62;
  let scale = 1;
  let camX = 0;
  function fit() {
    scale = Math.max(MIN_SCALE, root.clientWidth / W);
    root.style.height = `${H * scale}px`;
    applyCamera();
  }
  function applyCamera() {
    const view = root.clientWidth;
    const span = W * scale - view;
    camX = span > 0 ? Math.max(0, Math.min(span, me.x * scale - view / 2)) : 0;
    world.style.transform = `translateX(${-camX}px) scale(${scale})`;
  }
  addEventListener('resize', fit);

  let lastSend = 0;
  let lastSent = '';
  let charge = null; // { pad, start }
  const armed = new Set(STATIC_PADS.map((p) => p.id)); // re-arm after stepping off

  function send(now, force) {
    const msg = { x: Math.round(me.x), y: Math.round(me.y), d: me.d, m: me.moving };
    const key = JSON.stringify(msg);
    if (!force && key === lastSent && now - lastSend < HEARTBEAT_MS) return;
    if (!force && now - lastSend < SEND_MS) return;
    socket.emit('plaza:move', msg);
    lastSend = now;
    lastSent = key;
  }

  let prev = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (!lobbyActive()) { keys.clear(); charge = null; return; }
    if (root.clientWidth && Math.abs(Math.max(MIN_SCALE, root.clientWidth / W) - scale) > 0.001) fit();

    // my character
    if (!me.el) me.el = makeChar(myProfile(), true);
    if (me.el.dataset.sid !== socket.id) me.el.dataset.sid = socket.id || '';
    const prof = myProfile();
    if (me.el._sig !== sigOf(prof)) { me.el.innerHTML = charHTML(prof); me.el._sig = sigOf(prof); }

    let vx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
    let vy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
    if (!vx && !vy && me.target) {
      const dx = me.target.x - me.x, dy = me.target.y - me.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) me.target = null;
      else { vx = dx / dist; vy = dy / dist; }
    }
    const len = Math.hypot(vx, vy);
    me.moving = len > 0 && !modalOpen();
    if (me.moving) {
      me.x = Math.max(16, Math.min(W - 16, me.x + (vx / len) * SPEED * dt));
      me.y = Math.max(40, Math.min(H - 8, me.y + (vy / len) * SPEED * dt));
      if (vx) me.d = vx < 0 ? -1 : 1;
    }
    place(me.el, me.x, me.y, me.d, me.moving);
    if (scale * W > root.clientWidth) applyCamera();
    send(now, false);

    // pads: stand still-ish on one to charge it
    const on = pads.find((p) => me.x > p.x && me.x < p.x + p.w && me.y > p.y && me.y < p.y + p.h);
    for (const p of pads) if (p !== on) { armed.add(p.id); p.el?.classList.remove('charging'); }
    if (on && armed.has(on.id) && !modalOpen()) {
      if (!charge || charge.pad !== on) charge = { pad: on, start: now };
      const k = Math.min(1, (now - charge.start) / CHARGE_MS);
      on.el?.classList.add('charging');
      on.el?.style.setProperty('--k', k.toFixed(3));
      if (k >= 1) {
        armed.delete(on.id);
        on.el?.classList.remove('charging');
        charge = null;
        trigger(on);
      }
    } else if (!on) charge = null;

    // everyone else glides toward their latest reported spot
    const a = Math.min(1, dt * 12);
    for (const o of others.values()) {
      o.x += (o.tx - o.x) * a;
      o.y += (o.ty - o.y) * a;
      place(o.el, o.x, o.y, o.d, o.m);
    }
  }

  function renderHint() {
    root.querySelector('#plazaHint').textContent = t('plaza.hint');
  }
  I18N.onChange(() => { buildPads(); renderHint(); });
  buildPads();
  renderHint();
  fit();
  requestAnimationFrame(frame);
  socket.on('connect', () => { lastSent = ''; });
})();
