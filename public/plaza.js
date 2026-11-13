// Lobby plaza: the whole area under the top bar is a walkable world.
// Everyone in the lobby is a little character; arrow keys / WASD walk, and on
// touch screens you press and hold where you want to go. Walk down to the game
// pads (stand on one to create a room) and the open-room portals below them.
// The camera follows your character.
(() => {
  const { socket, esc } = window.HA;
  const t = (k, v) => I18N.t(k, v);
  const W = 480;  // portrait world: phones see it at ~full width
  const H = 1960;
  const SPEED = 260;      // logical px per second
  const CHARGE_MS = 850;  // how long to stand on a pad
  const SEND_MS = 100;
  const HEARTBEAT_MS = 2000;
  const SPAWN = { x: W / 2, y: 212 };

  const root = document.getElementById('plaza');
  if (!root) return;
  root.innerHTML = `
    <div class="plaza-world" id="plazaWorld">
      <div class="plaza-floor"></div>
      <div class="plaza-deco" id="plazaDeco"></div>
      <div class="plaza-pads" id="plazaPads"></div>
      <div class="plaza-people" id="plazaPeople"></div>
    </div>
    <div class="plaza-hint" id="plazaHint"></div>`;
  const world = root.querySelector('#plazaWorld');
  const padsBox = root.querySelector('#plazaPads');
  const people = root.querySelector('#plazaPeople');

  // ---------------------------------------------------------------- scenery
  function renderDeco() {
    root.querySelector('#plazaDeco').innerHTML = `
      <div class="pz-sign" style="left:40px;top:26px;width:400px">
        <b>HOLDEM ARCADE</b><span>${t('plaza.welcome')}</span>
      </div>
      <div class="pz-arrow" style="left:226px;top:236px">▼</div>
      <div class="pz-label" style="left:24px;top:268px">${t('plaza.games')}</div>
      <div class="pz-label" style="left:24px;top:1497px">${t('plaza.rooms')}</div>
      <span class="pz-suit" style="left:20px;top:150px">♠</span>
      <span class="pz-suit red" style="left:430px;top:140px">♥</span>
      <span class="pz-suit red" style="left:420px;top:1475px">♦</span>
      <span class="pz-suit" style="left:20px;top:1905px">♣</span>
      <span class="pz-chips" style="left:60px;top:205px"></span>
      <span class="pz-chips" style="left:380px;top:200px"></span>`;
  }

  // ---------------------------------------------------------------- pads
  const GAME_PADS = [
    { id: 'memory', x: 24, y: 310, w: 432, h: 200, art: 'memory' },
    { id: 'nut', x: 24, y: 545, w: 432, h: 200, art: 'nut' },
    { id: 'indian', x: 24, y: 780, w: 432, h: 200, art: 'indian' },
    { id: 'bomb', x: 24, y: 1015, w: 432, h: 200, art: 'bomb' },
    { id: 'liar', x: 24, y: 1250, w: 432, h: 200, art: 'liar' },
  ];
  const ART = {
    memory: '<span class="pm pm-back"></span><span class="pm pm-face red">A<i>♥</i></span><span class="pm pm-back"></span>',
    nut: '<span class="pm pm-face">K<i>♠</i></span><span class="pm pm-face red">K<i>♥</i></span><span class="pm pm-bolt">⚡</span>',
    liar: '<span class="pm-bombcat">🤥</span><span class="pm pm-back pm-q">?</span><span class="pm pm-back pm-q">?</span>',
    bomb: '<span class="pm-bombcat">💣</span><span class="pm pm-bolt">🐱</span>',
    indian: '<span class="pm pm-face">7<i>♠</i></span><span class="pm pm-back pm-q">?</span><span class="pm pm-face red">10<i>♥</i></span>',
  };
  let rooms = [];
  let pads = [];

  function portalPads() {
    return rooms.slice(0, 6).map((r, i) => ({
      id: `room-${r.code}`, code: r.code, kind: 'portal', room: r,
      x: 24 + (i % 2) * 222, y: 1539 + Math.floor(i / 2) * 115, w: 210, h: 100,
    }));
  }

  function buildPads() {
    pads = [...GAME_PADS.map((p) => ({ ...p, kind: 'game' })), ...portalPads()];
    const html = pads.map((p) => {
      const style = `left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px`;
      if (p.kind === 'game') {
        return `<div class="pad game" data-pad="${p.id}" style="${style}">
          <div class="pad-in">
            <div class="pad-art">${ART[p.art]}</div>
            <div class="pad-text"><b>${esc(t(`game.${p.id}`))}</b><p>${esc(t(`game.${p.id}.desc`))}</p><span class="pad-meta">${esc(t(`game.${p.id}.meta`))}</span></div>
            <span class="pad-cta">${t('plaza.standToCreate')}</span>
          </div>
          <button class="pad-help" data-help="${p.id}" aria-label="${t('howto')}">?</button>
          <i class="pad-fill"></i></div>`;
      }
      const r = p.room;
      const sub = r.joinable ? (r.playing ? t('rooms.lateJoin') : t('join.btn')) : t('rooms.watch');
      return `<div class="pad portal${r.joinable ? '' : ' watch'}" data-pad="${p.id}" style="${style}"><div class="pad-in"><span class="portal-ring"></span><b>${esc(t('plaza.portal', { name: r.host }))}</b><span class="pad-sub">${esc(t(`game.${r.gameId}`))} · ${r.players}/${r.max} · ${sub}</span></div><i class="pad-fill"></i></div>`;
    }).join('');
    const empty = rooms.length ? '' : `<div class="plaza-empty" style="left:24px;top:1545px;width:432px">${t('plaza.noRooms')}</div>`;
    padsBox.innerHTML = html + empty;
    for (const p of pads) p.el = padsBox.querySelector(`[data-pad="${p.id}"]`);
  }

  // "?" on a game pad: that game's how-to (the lobby has no general tutorial).
  padsBox.addEventListener('pointerdown', (e) => {
    const help = e.target.closest('[data-help]');
    if (!help) return;
    e.stopPropagation();
    window.Tutorial?.open?.(help.dataset.help);
  });

  function trigger(p) {
    if (p.kind === 'game') HA.createGame(p.id);
    else if (p.kind === 'portal') { window.SFX && SFX.click(); HA.join(p.code); }
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
  const sigOf = (p) => `${p.name}|${p.avatar}|${p.avatarV}|${p.uid}`;
  function makeChar(p, mine) {
    const el = document.createElement('div');
    el.className = `pc${mine ? ' mine' : ''}`;
    el.innerHTML = charHTML(p);
    el._sig = sigOf(p);
    people.appendChild(el);
    return el;
  }
  function refreshChar(el, p) {
    if (el._sig === sigOf(p)) return;
    const bubble = el.querySelector('.pc-bubble');
    el.innerHTML = charHTML(p);
    if (bubble) el.appendChild(bubble);
    el._sig = sigOf(p);
  }
  function place(el, x, y, d, moving) {
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.zIndex = String(Math.round(y));
    el.classList.toggle('walk', !!moving);
    el.classList.toggle('left', d < 0);
  }

  const me = { x: SPAWN.x, y: SPAWN.y, d: 1, moving: false, el: null, target: null };
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
      } else refreshChar(o.el, p);
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
  const modalOpen = () => !!document.querySelector('.overlay.show');
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (!k || typing(e) || !lobbyActive() || modalOpen()) return;
    e.preventDefault();
    keys.add(k);
    me.target = null;
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => keys.clear());

  // Press (and hold/drag) to walk toward the finger or cursor.
  let pressing = false;
  const toWorld = (e) => {
    const r = world.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  world.addEventListener('pointerdown', (e) => {
    pressing = true;
    me.target = toWorld(e);
    try { world.setPointerCapture(e.pointerId); } catch {}
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  });
  world.addEventListener('pointermove', (e) => { if (pressing) me.target = toWorld(e); });
  const release = () => { pressing = false; };
  world.addEventListener('pointerup', release);
  world.addEventListener('pointercancel', release);

  // ---------------------------------------------------------------- camera
  let scale = 1;
  let camX = 0;
  let camY = 0;
  function applyCamera(snap) {
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    if (!vw || !vh) return;
    scale = Math.max(0.7, Math.min(1.3, vw / W));
    const ww = W * scale;
    const wh = H * scale;
    const tx = ww <= vw ? (ww - vw) / 2 : Math.max(0, Math.min(ww - vw, me.x * scale - vw / 2));
    const ty = wh <= vh ? (wh - vh) / 2 : Math.max(0, Math.min(wh - vh, me.y * scale - vh * 0.45));
    // Ease the camera so it glides after the character.
    camX = snap ? tx : camX + (tx - camX) * 0.18;
    camY = snap ? ty : camY + (ty - camY) * 0.18;
    world.style.transform = `translate(${-camX}px, ${-camY}px) scale(${scale})`;
  }
  addEventListener('resize', () => applyCamera(true));

  // ---------------------------------------------------------------- loop
  let lastSend = 0;
  let lastSent = '';
  let charge = null; // { pad, start }
  const armed = new Set(GAME_PADS.map((p) => p.id)); // re-arm after stepping off

  function send(now) {
    const msg = { x: Math.round(me.x), y: Math.round(me.y), d: me.d, m: me.moving };
    const key = JSON.stringify(msg);
    if (key === lastSent && now - lastSend < HEARTBEAT_MS) return;
    if (now - lastSend < SEND_MS) return;
    socket.emit('plaza:move', msg);
    lastSend = now;
    lastSent = key;
  }

  let prev = performance.now();
  let wasActive = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (!lobbyActive()) { keys.clear(); charge = null; pressing = false; wasActive = false; return; }
    if (!wasActive) { wasActive = true; applyCamera(true); lastSent = ''; }

    if (!me.el) me.el = makeChar(myProfile(), true);
    if (me.el.dataset.sid !== socket.id) me.el.dataset.sid = socket.id || '';
    refreshChar(me.el, myProfile());

    let vx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
    let vy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
    if (!vx && !vy && me.target) {
      const dx = me.target.x - me.x, dy = me.target.y - me.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) { if (!pressing) me.target = null; }
      else { vx = dx / dist; vy = dy / dist; }
    }
    const len = Math.hypot(vx, vy);
    me.moving = len > 0 && !modalOpen();
    if (me.moving) {
      me.x = Math.max(20, Math.min(W - 20, me.x + (vx / len) * SPEED * dt));
      me.y = Math.max(130, Math.min(H - 14, me.y + (vy / len) * SPEED * dt));
      if (vx) me.d = vx < 0 ? -1 : 1;
    }
    place(me.el, me.x, me.y, me.d, me.moving);
    applyCamera(false);
    send(now);

    // pads: stand on one for a moment to trigger it
    const on = pads.find((p) => me.x > p.x && me.x < p.x + p.w && me.y > p.y && me.y < p.y + p.h);
    for (const p of pads) if (p !== on) { armed.add(p.id); p.el?.classList.remove('charging'); }
    if (on && me.moving) {
      // Just passing through: only standing still on a pad charges it.
      charge = null;
      on.el?.classList.remove('charging');
    } else if (on && armed.has(on.id) && !modalOpen()) {
      if (!charge || charge.pad !== on) charge = { pad: on, start: now };
      const k = Math.min(1, (now - charge.start) / CHARGE_MS);
      on.el?.classList.add('charging');
      on.el?.style.setProperty('--k', k.toFixed(3));
      if (k >= 1) {
        armed.delete(on.id);
        on.el?.classList.remove('charging');
        charge = null;
        me.target = null;
        pressing = false;
        trigger(on);
      }
    } else if (!on) charge = null;

    const a = Math.min(1, dt * 12);
    for (const o of others.values()) {
      o.x += (o.tx - o.x) * a;
      o.y += (o.ty - o.y) * a;
      place(o.el, o.x, o.y, o.d, o.m);
    }
  }

  function renderText() {
    root.querySelector('#plazaHint').textContent = matchMedia('(pointer: coarse)').matches ? t('plaza.hintTouch') : t('plaza.hint');
    renderDeco();
  }
  I18N.onChange(() => { buildPads(); renderText(); });
  buildPads();
  renderText();
  requestAnimationFrame(frame);
})();
