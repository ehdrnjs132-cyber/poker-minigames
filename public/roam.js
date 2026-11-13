// In-room avatars: every seated player walks around the room screen.
// Arrow keys / WASD (or the joystick on touch screens) move, Space / ⚔ swings
// the sword. Swinging at someone close asks "challenge to a duel?"; if they
// accept, duel.js runs the fight. Also: tomato coupons and the red screen.
(() => {
  const { socket, esc, toast } = window.HA;
  const t = (k, v) => I18N.t(k, v);
  const $ = (s) => document.querySelector(s);
  const state = () => window.currentState?.();
  const inRoom = () => $('#room').classList.contains('active');

  const layer = document.createElement('div');
  layer.id = 'roamLayer';
  layer.className = 'roam-layer';
  document.body.appendChild(layer);

  const ui = document.createElement('div');
  ui.className = 'roam-ui';
  ui.innerHTML = `
    <div class="joy" id="joy"><div class="joy-knob" id="joyKnob"></div></div>
    <button class="sword-btn" id="swordBtn" aria-label="sword">⚔️</button>
    <button class="coupon-btn" id="couponBtn"><span>🍅</span><b id="couponN">0</b></button>`;
  document.body.appendChild(ui);

  // ---------------------------------------------------------------- avatars
  const me = { x: 0.5, y: 0.82, d: 1, m: false, sw: 0 };
  let placed = false;
  const others = new Map(); // id -> {el,x,y,tx,ty,d,m,sw}
  let myEl = null;

  function charHTML(p) {
    return `<div class="rc-shadow"></div>
      <div class="rc-body" style="--pc:${HA.colorFor(p.id)}">
        <div class="rc-head avatar">${HA.avatarInner(p)}</div>
        <i class="rc-foot l"></i><i class="rc-foot r"></i>
        <div class="rc-sword"><i class="blade"></i><i class="hilt"></i></div>
      </div>
      <div class="rc-name">${esc(p.name || '')}</div>`;
  }
  const sig = (p) => `${p.name}|${p.avatar}|${p.avatarV}|${p.uid}|${p.bot}`;
  function ensureEl(p, mine) {
    let el = layer.querySelector(`.rc[data-id="${p.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = `rc${mine ? ' mine' : ''}`;
      el.dataset.id = p.id;
      layer.appendChild(el);
    }
    if (el._sig !== sig(p)) { el.innerHTML = charHTML(p); el._sig = sig(p); }
    return el;
  }
  const px = (x, y) => [x * innerWidth, (0.1 + y * 0.86) * innerHeight];
  function place(el, x, y, d, m) {
    const [X, Y] = px(x, y);
    el.style.transform = `translate(${X}px, ${Y}px)`;
    el.style.zIndex = String(10 + Math.round(y * 100));
    el.classList.toggle('walk', !!m);
    el.classList.toggle('left', d < 0);
  }
  function swing(el) {
    if (!el) return;
    el.classList.remove('swing');
    void el.offsetWidth;
    el.classList.add('swing');
  }

  socket.on('roam', (list) => {
    const S = state();
    if (!S) return;
    const seen = new Set();
    for (const r of list || []) {
      if (r.id === S.me) continue;
      const p = S.players.find((q) => q.id === r.id);
      if (!p) continue;
      seen.add(r.id);
      let o = others.get(r.id);
      if (!o) { o = { x: r.x, y: r.y, sw: r.sw }; others.set(r.id, o); }
      o.el = ensureEl(p, false);
      if (r.sw && r.sw !== o.sw) swing(o.el);
      Object.assign(o, { tx: r.x, ty: r.y, d: r.d, m: r.m, sw: r.sw });
    }
    for (const [id, o] of others) if (!seen.has(id)) { o.el?.remove(); others.delete(id); }
  });

  // ---------------------------------------------------------------- input
  const keys = new Set();
  const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  const blocked = () => !!document.querySelector('.overlay.show, .duel-stage.show, .roam-modal.show');
  const active = () => {
    const S = state();
    return inRoom() && S && !S.spectator && S.players.some((p) => p.id === S.me);
  };
  addEventListener('keydown', (e) => {
    if (!active() || typing(e) || blocked()) return;
    if (e.code === 'Space') { e.preventDefault(); return doSwing(); }
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    keys.add(k);
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => keys.clear());

  // Joystick (touch screens)
  const joy = $('#joy'), knob = $('#joyKnob');
  let joyVec = null;
  function joyMove(e) {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const max = r.width / 2;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joyVec = len > 8 ? { x: dx / max, y: dy / max } : null;
  }
  joy.addEventListener('pointerdown', (e) => { joy.setPointerCapture(e.pointerId); joyMove(e); });
  joy.addEventListener('pointermove', (e) => { if (joy.hasPointerCapture(e.pointerId)) joyMove(e); });
  const joyEnd = () => { joyVec = null; knob.style.transform = ''; };
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);
  $('#swordBtn').addEventListener('click', () => doSwing());

  // ---------------------------------------------------------------- swing -> challenge
  let lastSwing = 0;
  function doSwing() {
    const now = Date.now();
    if (now - lastSwing < 400) return;
    lastSwing = now;
    me.sw = now;
    swing(myEl);
    window.SFX && SFX.swoosh();
    sendNow = true;
    // Anyone in reach, in front of me?
    const [mx, my] = px(me.x, me.y);
    let best = null;
    for (const [id, o] of others) {
      const [ox, oy] = px(o.x, o.y);
      const dx = ox - mx, dy = oy - my;
      if (Math.abs(dy) > 70 || Math.abs(dx) > 95) continue;
      if (Math.sign(dx) !== me.d && Math.abs(dx) > 20) continue;
      const dist = Math.hypot(dx, dy);
      if (!best || dist < best.dist) best = { id, dist };
    }
    if (best) askChallenge(best.id);
  }

  const modal = document.createElement('div');
  modal.className = 'roam-modal';
  document.body.appendChild(modal);
  let modalTimer = null;
  function openModal(html) {
    modal.innerHTML = `<div class="rm-card">${html}</div>`;
    modal.classList.add('show');
  }
  function closeModal() { modal.classList.remove('show'); clearInterval(modalTimer); }
  modal.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const a = b.dataset.rm;
    if (a === 'challenge') {
      socket.emit('duel:challenge', { target: b.dataset.id }, (res) => {
        if (!res?.ok) return toast(t(res?.code || 'duel.busy'));
        openModal(`<div class="rm-ico">⚔️</div><h3>${t('duel.waiting')}</h3><p class="dots">${t('duel.waitingSub')}</p>`);
      });
      window.SFX && SFX.click();
      return;
    }
    if (a === 'accept' || a === 'decline') socket.emit('duel:answer', { accept: a === 'accept' });
    closeModal();
  });

  function nameOf(id) { return state()?.players.find((p) => p.id === id)?.name || ''; }
  function askChallenge(id) {
    if (state()?.duel) return toast(t('duel.busy'));
    openModal(`<div class="rm-ico">🗡️</div><h3>${t('duel.askTitle', { name: esc(nameOf(id)) })}</h3>
      <p>${t('duel.askSub')}</p>
      <div class="rm-btns"><button class="btn ghost" data-rm="cancel">${t('cancel')}</button><button class="btn gold big" data-rm="challenge" data-id="${id}">${t('duel.send')}</button></div>`);
  }
  socket.on('duel:ask', ({ name, until, now }) => {
    const end = Date.now() + (until - now);
    openModal(`<div class="rm-ico shake">⚔️</div><h3>${t('duel.incoming', { name: esc(name) })}</h3>
      <p>${t('duel.incomingSub')}</p><div class="rm-count" id="rmCount"></div>
      <div class="rm-btns"><button class="btn ghost" data-rm="decline">${t('duel.decline')}</button><button class="btn gold big" data-rm="accept">${t('duel.accept')}</button></div>`);
    window.SFX && SFX.spotlight();
    const tickc = () => { const el = $('#rmCount'); if (el) el.textContent = Math.max(0, Math.ceil((end - Date.now()) / 1000)); };
    tickc();
    modalTimer = setInterval(tickc, 250);
  });
  socket.on('duel:askClose', closeModal);
  socket.on('duel:declined', ({ name, timeout }) => { closeModal(); toast(t(timeout ? 'duel.timeout' : 'duel.declined', { name })); });
  socket.on('duel:start', () => closeModal());

  // ---------------------------------------------------------------- coupons + red screen
  const couponBtn = $('#couponBtn');
  let aimingCoupon = false;
  couponBtn.addEventListener('click', () => {
    aimingCoupon = !aimingCoupon;
    document.body.classList.toggle('coupon-aim', aimingCoupon);
    if (aimingCoupon) toast(t('coupon.pick'), 2200);
    window.SFX && SFX.click();
  });
  document.addEventListener('click', (e) => {
    if (!aimingCoupon) return;
    const target = e.target.closest('.iseat[data-id], .seat[data-id], .rc[data-id]');
    if (!target) return;
    const id = target.dataset.id;
    const S = state();
    if (!S || id === S.me || id.startsWith('empty') || target.id === 'seatMe') return;
    e.stopPropagation();
    socket.emit('coupon:use', { target: id });
    aimingCoupon = false;
    document.body.classList.remove('coupon-aim');
  }, true);

  socket.on('redscreen', ({ from, ms }) => {
    const el = document.createElement('div');
    el.className = 'red-screen';
    el.innerHTML = `<i class="rs-drip d1"></i><i class="rs-drip d2"></i><i class="rs-drip d3"></i><b>🍅 ${esc(t('coupon.hit', { name: from }))}</b>`;
    document.body.appendChild(el);
    window.SFX && SFX.lose();
    if (navigator.vibrate) navigator.vibrate(200);
    setTimeout(() => el.classList.add('out'), ms - 600);
    setTimeout(() => el.remove(), ms);
  });

  // ---------------------------------------------------------------- loop
  let sendNow = false;
  let lastSend = 0;
  let lastKey = '';
  let prev = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const S = state();
    const on = active();
    layer.classList.toggle('show', !!S && inRoom());
    ui.classList.toggle('show', on && !S?.duel);
    couponBtn.classList.toggle('show', on && (S?.myCoupons || 0) > 0);
    $('#couponN').textContent = S?.myCoupons || 0;
    if (!S || !inRoom()) { layer.innerHTML = ''; others.clear(); myEl = null; placed = false; return; }
    if (!on) { if (myEl) { myEl.remove(); myEl = null; } }
    else {
      const p = S.players.find((q) => q.id === S.me);
      if (!placed) { me.x = 0.15 + Math.random() * 0.7; me.y = 0.86; placed = true; }
      myEl = ensureEl(p, true);
      let vx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
      let vy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
      if (joyVec) { vx = joyVec.x; vy = joyVec.y; }
      const len = Math.hypot(vx, vy);
      me.m = len > 0.1 && !blocked() && !S.duel;
      if (me.m) {
        const sp = 0.32; // screen widths per second
        me.x = Math.max(0.03, Math.min(0.97, me.x + (vx / Math.max(1, len)) * sp * dt * (innerHeight / innerWidth) * 1.4));
        me.y = Math.max(0, Math.min(1, me.y + (vy / Math.max(1, len)) * sp * dt));
        if (Math.abs(vx) > 0.1) me.d = vx < 0 ? -1 : 1;
      }
      place(myEl, me.x, me.y, me.d, me.m);
      const key = `${me.x.toFixed(3)},${me.y.toFixed(3)},${me.d},${me.m},${me.sw}`;
      if ((key !== lastKey && now - lastSend > 90) || sendNow || now - lastSend > 2000) {
        socket.emit('roam:move', { x: me.x, y: me.y, d: me.d, m: me.m, sw: me.sw });
        lastSend = now; lastKey = key; sendNow = false;
      }
    }
    const a = Math.min(1, dt * 12);
    for (const o of others.values()) {
      o.x += (o.tx - o.x) * a;
      o.y += (o.ty - o.y) * a;
      if (o.el) place(o.el, o.x, o.y, o.d, o.m);
    }
  }
  requestAnimationFrame(frame);
})();
