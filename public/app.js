(() => {
  const socket = io();
  const $ = (s) => document.querySelector(s);
  const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const AVATAR_COLORS = ['#3a7bff', '#e3283a', '#14a37f', '#a14bff', '#ff8a1f', '#e0359b', '#1fb6d6'];

  const session = {
    get() { try { return JSON.parse(sessionStorage.getItem('session')); } catch { return null; } },
    set(v) { try { sessionStorage.setItem('session', JSON.stringify(v)); } catch {} },
    clear() { try { sessionStorage.removeItem('session'); } catch {} },
  };
  const pref = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  let S = null;        // current state
  let P = null;        // previous state
  let offset = 0;      // server clock - local clock
  let dealKey = null;
  let boardKey;
  let lastTick = null;
  let bannerTimer = null;

  document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });

  // ------------------------------------------------------------- helpers
  function toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  function colorFor(id) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  const botFace = () =>
    '<svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden="true"><rect x="4" y="7" width="16" height="12" rx="4" fill="#fff"/><circle cx="9" cy="13" r="1.8" fill="#1b2a5c"/><circle cx="15" cy="13" r="1.8" fill="#1b2a5c"/><path d="M12 7V4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="3.5" r="1.6" fill="#fff"/></svg>';
  function setHTML(el, html) {
    if (el._html === html) return false;
    el._html = html;
    el.innerHTML = html;
    return true;
  }
  const act = (type, extra = {}) => socket.emit('action', { type, ...extra });

  function faceHTML(code) {
    const r = code[0] === 'T' ? '10' : code[0];
    const s = SUIT[code[1]];
    return `<div class="corner tl"><b>${r}</b><i>${s}</i></div><div class="pip">${s}</div><div class="corner br"><b>${r}</b><i>${s}</i></div>`;
  }
  function cardHTML(code, letter, { down = false, cls = '', style = '' } = {}) {
    const red = code && 'hd'.includes(code[1]) ? ' red' : '';
    return `<div class="card${down ? ' down' : ''} ${cls}" style="${style}"><div class="card-inner"><div class="face front${red}">${code ? faceHTML(code) : ''}</div><div class="face back"><span class="letter">${letter ?? ''}</span></div></div></div>`;
  }
  function makeCard(letter) {
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHTML(null, letter, { down: true });
    const el = wrap.firstElementChild;
    // Drop the deal animation once done so its fill state can't interfere with the 3D flip.
    el.addEventListener('animationend', (e) => e.target === el && el.classList.remove('deal-in'));
    return el;
  }
  function setFace(el, code, letter) {
    if (el.dataset.code === code) return;
    el.dataset.code = code;
    const f = el.querySelector('.front');
    f.className = 'face front' + ('hd'.includes(code[1]) ? ' red' : '');
    f.innerHTML = faceHTML(code) + (letter ? `<span class="flabel">${letter}</span>` : '');
  }
  window.cardHTML = cardHTML; // shared with tutorial.js
  window.HA = { socket, toast, me: () => S?.me || session.get()?.playerId }; // shared with chat.js

  // Force a style flush so a class change right after insertion still transitions.
  const reflow = (el) => void el.offsetWidth;

  // ------------------------------------------------------------- lobby
  const nameInput = $('#nameInput');
  const codeInput = $('#codeInput');
  nameInput.value = pref.get('name') || '';
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) codeInput.value = urlRoom.toUpperCase().slice(0, 4);

  function getName() {
    const n = nameInput.value.trim().slice(0, 12);
    if (!n) {
      toast(t('err.nick'));
      nameInput.focus();
      return null;
    }
    pref.set('name', n);
    return n;
  }

  document.querySelectorAll('[data-game]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.classList.contains('locked')) return toast(t('err.soon'));
      if (!getName()) return;
      SFX.click();
      openSetup(btn.dataset.game);
    })
  );

  // ---- create-room settings modal (last choice remembered per browser)
  const setupEl = $('#setup');
  let setupGame = null;
  let settings = { players: 4, memorizeSec: 30, pickSec: 20, swaps: 5, speed: 'normal' };
  try { Object.assign(settings, JSON.parse(pref.get('roomSettings')) || {}); } catch {}

  function renderSetup() {
    $('#memVal').textContent = settings.memorizeSec;
    $('#pickVal').textContent = settings.pickSec;
    setupEl.querySelectorAll('.seg').forEach((seg) =>
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(settings[seg.dataset.key]))));
    setupEl.querySelectorAll('[data-only]').forEach((row) => (row.hidden = !row.dataset.only.split(' ').includes(setupGame)));
    $('#setupGameName').textContent = t(`game.${setupGame}`);
    $('#setupTutorial').dataset.tutorial = setupGame;
    setupEl.querySelectorAll('input[type=range]').forEach((r) => (r.value = settings[r.dataset.key]));
  }
  function openSetup(gameId) {
    setupGame = gameId;
    renderSetup();
    setupEl.classList.add('show');
  }
  const closeSetup = () => setupEl.classList.remove('show');

  setupEl.querySelectorAll('.seg').forEach((seg) =>
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const v = b.dataset.v;
      settings[seg.dataset.key] = /^\d+$/.test(v) ? Number(v) : v;
      SFX.click();
      renderSetup();
    }));
  setupEl.querySelectorAll('input[type=range]').forEach((r) =>
    r.addEventListener('input', () => { settings[r.dataset.key] = Number(r.value); renderSetup(); }));
  $('#setupCancel').addEventListener('click', closeSetup);
  setupEl.addEventListener('click', (e) => e.target === setupEl && closeSetup());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSetup());
  $('#setupCreate').addEventListener('click', () => {
    const name = getName();
    if (!name) return closeSetup();
    pref.set('roomSettings', JSON.stringify(settings));
    SFX.click();
    closeSetup();
    socket.emit('create', { name, gameId: setupGame, settings }, onJoined);
  });

  function join() {
    const name = getName();
    if (!name) return;
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 4) return toast(t('err.code'));
    SFX.click();
    socket.emit('join', { name, code }, onJoined);
  }
  $('#joinBtn').addEventListener('click', join);
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));

  function onJoined(res) {
    if (!res || !res.ok) return toast(I18N.msg(res) || t('err.joinFail'));
    session.set({ code: res.code, playerId: res.playerId });
    history.replaceState(null, '', `?room=${res.code}`);
  }

  function showLobby() {
    $('#room').classList.remove('active');
    $('#lobby').classList.add('active');
    $('#overlay').classList.remove('show');
    S = P = null;
    dealKey = null;
    boardKey = undefined;
    window.currentGameId = null;
    window.Chat && Chat.reset();
  }
  function showRoom() {
    if ($('#room').classList.contains('active')) return;
    $('#lobby').classList.remove('active');
    $('#room').classList.add('active');
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------- socket
  socket.on('connect', () => {
    $('#netState').classList.remove('show');
    const s = session.get();
    if (!s) return;
    socket.emit('join', { code: s.code, playerId: s.playerId, name: pref.get('name') }, (res) => {
      if (!res?.ok) {
        session.clear();
        showLobby();
        toast(I18N.msg(res) || t('err.roomClosed'));
      }
    });
  });
  socket.on('disconnect', () => S && $('#netState').classList.add('show'));
  socket.on('kicked', (msg) => {
    session.clear();
    showLobby();
    toast(I18N.msg(msg));
  });
  socket.on('state', (st) => {
    offset = st.now - Date.now();
    P = S;
    S = st;
    window.currentGameId = st.gameId;
    showRoom();
    render();
  });

  // ------------------------------------------------------------- room controls
  $('#leaveBtn').addEventListener('click', () => {
    if (S && !['lobby', 'gameover'].includes(S.phase) && !confirm(t('confirm.leave'))) return;
    socket.emit('leave');
    session.clear();
    history.replaceState(null, '', location.pathname);
    showLobby();
  });
  $('#codeChip').addEventListener('click', copyInvite);
  function copyInvite() {
    if (!S) return;
    const url = `${location.origin}${location.pathname}?room=${S.code}`;
    const localOnly = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    (navigator.clipboard?.writeText(url) || Promise.reject())
      .then(() => toast(localOnly
        ? t('invite.local')
        : t('invite.copied'), localOnly ? 5000 : 2400))
      .catch(() => toast(t('invite.code', { code: S.code })));
  }
  const muteBtn = $('#muteBtn');
  function renderMute() {
    muteBtn.innerHTML = SFX.muted
      ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  muteBtn.addEventListener('click', () => { SFX.toggleMute(); renderMute(); SFX.click(); });
  renderMute();

  $('#actionBar').addEventListener('click', onActionClick);
  $('#overlay').addEventListener('click', onActionClick);
  function onActionClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'invite') return copyInvite();
    if (a === 'exit') return $('#leaveBtn').click();
    if (a === 'lock') SFX.lock(); else SFX.click();
    act(a, { level: b.dataset.level, id: b.dataset.id });
  }
  // Bot "remove" buttons live inside opponent seats.
  $('#opps').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="removeBot"]');
    if (!b) return;
    SFX.click();
    act('removeBot', { id: b.dataset.id });
  });

  function onGridClick(i) {
    if (!S || S.phase !== 'pick') return;
    const me = S.players.find((p) => p.id === S.me);
    if (!me || me.locked) return;
    if (!(me.picks || []).includes(i) && me.pickCount >= 2) return toast(t('pick.max'));
    SFX.select();
    act('pick', { index: i });
  }

  // ------------------------------------------------------------- render
  function render() {
    const me = S.players.find((p) => p.id === S.me);
    const opps = S.players.filter((p) => p.id !== S.me);
    const opp = opps[0];
    const inResult = S.phase === 'showdown' || S.phase === 'gameover';
    const hlCards = new Set();
    if (inResult && S.result) {
      for (const h of S.result.hands) if (S.result.winners.includes(h.id)) h.best.forEach((c) => hlCards.add(c));
    }
    const ctx = { me, opp, opps, inResult, hlCards };

    $('#roomCode').textContent = S.code;
    $('#roundInfo').textContent = S.round ? `${S.round}/${S.maxRounds}` : '-';
    $('#anteInfo').textContent = S.ante ? fmt(S.ante) : '-';
    $('#potInfo').textContent = fmt(inResult && S.result ? S.result.pot : S.pot);

    renderOpps(ctx);
    renderSeat($('#seatMe'), me, true, ctx);
    renderGrid(ctx);
    runShuffle();
    renderBoard(ctx);
    renderStatus(ctx);
    renderActions(ctx);
    renderOverlay(ctx);
    phaseEffects(ctx);

    if (S.notice && JSON.stringify(S.notice) !== JSON.stringify(P?.notice)) toast(I18N.msg(S.notice), 3500);
  }

  // Opponent seats: one per other player, plus empty seats up to the room size in the lobby.
  function renderOpps(ctx) {
    const box = $('#opps');
    const { opps } = ctx;
    // While seats are open, show one "waiting" placeholder.
    const empties = S.phase === 'lobby' && opps.length < S.maxPlayers - 1 ? 1 : 0;
    const wanted = opps.map((p) => p.id);
    for (let i = 0; i < empties; i++) wanted.push(`empty-${i}`);
    [...box.children].forEach((el) => !wanted.includes(el.dataset.id) && el.remove());
    wanted.forEach((id, i) => {
      let el = box.querySelector(`[data-id="${id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.dataset.id = id;
      }
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
      renderSeat(el, opps.find((p) => p.id === id) || null, false, ctx);
    });
    box.classList.toggle('multi', wanted.length > 1);
    box.classList.toggle('many', wanted.length > 3);
  }

  function renderSeat(el, p, isMe, { inResult, hlCards }) {
    if (!p) {
      el.className = `seat ${isMe ? 'me' : 'opp'} empty`;
      setHTML(el, `<span class="dots">${t('seat.waiting')}</span>`);
      return;
    }
    el.dataset.id = p.id;
    const ph = S.phase;
    const hand = inResult && S.result ? S.result.hands.find((h) => h.id === p.id) : null;
    const isWinner = hand && S.result.winners.includes(p.id);
    el.className = `seat ${isMe ? 'me' : 'opp'}${isWinner ? ' winner' : ''}${p.out ? ' out' : ''}`;

    let badge = '';
    if (p.out && ph !== 'lobby' && ph !== 'gameover') badge = `<span class="badge warn">${t('badge.out')}</span>`;
    else if (!p.connected) badge = `<span class="badge warn">${t('badge.off')}</span>`;
    else if (ph === 'lobby' || ph === 'gameover') badge = p.ready ? `<span class="badge ok">${t('badge.ready')}</span>` : `<span class="badge">${t('badge.wait')}</span>`;
    else if (ph === 'memorize') badge = p.memorized ? `<span class="badge ok">${t('badge.memorized')}</span>` : `<span class="badge">${t('badge.memorizing')}</span>`;
    else if (ph === 'pick') badge = p.locked ? `<span class="badge ok">${t('badge.locked')}</span>` : `<span class="badge">${t('badge.picking', { n: p.pickCount })}</span>`;
    else if (hand) {
      badge = `<span class="badge hand">${esc(I18N.hand(hand.score))}</span>`;
      if (S.game === 'nut') {
        const secs = hand.lockedAt == null ? '—' : t('secs', { n: (hand.lockedAt / 1000).toFixed(1) });
        const nutsTag = S.result.hitters?.includes(p.id) ? ' <b class="nuts-tag">NUTS</b>' : '';
        badge += `<span class="badge time">⏱ ${secs}${nutsTag}</span>`;
      }
    }
    const botTag = p.bot ? `<span class="bot-tag">BOT·${t(`lvl.${p.bot}`)}</span>` : '';
    const removeBtn = p.bot && ph === 'lobby' ? `<button class="seat-x" data-act="removeBot" data-id="${p.id}" aria-label="${t('bot.remove')}" title="${t('bot.remove')}">×</button>` : '';

    let delta = '';
    if (ph === 'showdown' && S.result) {
      const won = S.result.winners.includes(p.id);
      const net = won ? S.result.share - S.result.ante : -S.result.ante;
      if (net) delta = `<span class="delta ${net > 0 ? 'plus' : 'minus'}">${net > 0 ? '+' : ''}${fmt(net)}</span>`;
    }

    let hole = '';
    for (let k = 0; k < 2; k++) {
      const idx = p.picks ? p.picks[k] : undefined;
      if (hand) {
        const code = hand.cards[k];
        hole += cardHTML(code, '', { cls: `pop${hlCards.has(code) ? ' hl' : ''}`, style: `--dd:${k * 120}ms` });
      } else if (idx !== undefined) {
        hole += cardHTML(null, '', { down: true });
      } else if (!p.picks && k < p.pickCount) {
        hole += cardHTML(null, '?', { down: true });
      } else {
        hole += '<div class="slot"></div>';
      }
    }

    setHTML(el, `
      ${removeBtn}
      <div class="avatar${p.connected ? '' : ' off'}${p.bot ? ' bot' : ''}" style="background:${colorFor(p.id)}">${p.bot ? botFace() : esc(p.name[0] || '?')}</div>
      <div class="who">
        <div class="name">${esc(p.name)}${isMe ? `<em>${t('me')}</em>` : ''}${botTag}</div>
        <div class="chips"><span class="chip-icon"></span>${fmt(p.chips)} ${delta}</div>
        ${badge}
      </div>
      <div class="hole">${hole}</div>`);
  }

  function renderGrid({ me, opps, inResult, hlCards }) {
    const g = $('#grid');
    const fresh = S.dealId !== dealKey;
    if (fresh) {
      dealKey = S.dealId;
      g.innerHTML = '';
      for (let i = 0; i < 16; i++) {
        const c = makeCard('');
        c.style.setProperty('--dd', `${i * 28}ms`);
        if (S.phase !== 'lobby') c.classList.add('deal-in');
        c.insertAdjacentHTML('beforeend', '<div class="tag"></div>');
        // Index by current DOM position: shuffle swaps reorder the nodes.
        c.addEventListener('click', () => onGridClick([...g.children].indexOf(c)));
        g.appendChild(c);
      }
    }

    const ph = S.phase;
    const myPicks = me?.picks || [];
    // Who picked each position (only revealed at showdown).
    const pickers = new Map();
    if (inResult) for (const o of opps) for (const i of o.picks || []) pickers.set(i, [...(pickers.get(i) || []), o]);
    const picked = new Set([...myPicks, ...pickers.keys()]);
    const nuts = inResult && S.result?.nuts ? S.result.nuts.picks : [];

    [...g.children].forEach((el, i) => {
      const info = S.grid[i];
      if (info?.card) setFace(el, info.card);
      const wantDown = !info?.card;
      if (el.classList.contains('down') !== wantDown) {
        let d;
        if (!wantDown && ph === 'showdown') d = picked.has(i) ? 150 : 900 + i * 35;
        else d = (fresh ? 520 : 0) + i * 40;
        el.style.setProperty('--d', `${d}ms`);
        if (fresh) reflow(el);
        el.classList.toggle('down', wantDown);
      }
      const mine = myPicks.includes(i);
      const theirs = pickers.get(i) || [];
      const isNuts = nuts.includes(i);
      el.classList.toggle('mine', mine);
      el.classList.toggle('opp', theirs.length > 0);
      el.classList.toggle('nuts', isNuts);
      el.classList.toggle('pickable', ph === 'pick' && !me?.locked && !me?.out);
      el.classList.toggle('dim', inResult && !picked.has(i) && !isNuts);
      el.classList.toggle('hl', inResult && picked.has(i) && hlCards.has(info?.card));
      const shown = theirs.slice(0, 2).map((o) => `<span class="t-opp">${esc(o.name.slice(0, 4))}</span>`).join('');
      const more = theirs.length > 2 ? `<span class="t-opp">+${theirs.length - 2}</span>` : '';
      setHTML(el.querySelector('.tag'),
        (isNuts ? '<span class="t-nuts">NUTS</span>' : '') + (mine ? `<span class="t-me">${t('me')}</span>` : '') + shown + more);
    });
  }

  // Shell-game animation: plays the server's swap list on the face-down grid.
  // Each swap moves the two card nodes visually, then swaps them in the DOM so
  // grid index i always matches server position i afterwards.
  let shuffleRun = null; // { key, queue, timer }
  function swapNodes(a, b) {
    const t = document.createElement('div');
    a.parentNode.insertBefore(t, a);
    b.parentNode.insertBefore(a, b);
    t.parentNode.insertBefore(b, t);
    t.remove();
  }
  function finishShuffle() {
    if (!shuffleRun) return;
    clearTimeout(shuffleRun.timer);
    const g = $('#grid');
    for (const el of g.children) { el.style.transition = ''; el.style.transform = ''; el.classList.remove('moving'); }
    while (shuffleRun.queue.length) {
      const [a, b] = shuffleRun.queue.shift();
      const cards = [...g.children];
      swapNodes(cards[a], cards[b]);
    }
    shuffleRun.done = true;
  }
  function runShuffle() {
    if (S.phase !== 'shuffle') {
      if (shuffleRun && !shuffleRun.done) finishShuffle();
      return;
    }
    if (!S.shuffle || shuffleRun?.key === S.dealId) return;
    if (shuffleRun && !shuffleRun.done) finishShuffle();
    const { swaps, stepMs, leadMs } = S.shuffle;
    shuffleRun = { key: S.dealId, queue: swaps.slice(), timer: null, done: false };
    const run = shuffleRun;
    const g = $('#grid');
    const moveMs = Math.round(stepMs * 0.78);
    const step = () => {
      if (run !== shuffleRun || run.done) return;
      if (!run.queue.length) { run.done = true; return; }
      const [a, b] = run.queue[0];
      const cards = [...g.children];
      const A = cards[a], B = cards[b];
      const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
      const dx = rb.left - ra.left, dy = rb.top - ra.top;
      for (const [el, sx, sy] of [[A, dx, dy], [B, -dx, -dy]]) {
        el.classList.add('moving');
        el.style.transition = `transform ${moveMs}ms cubic-bezier(.55,0,.25,1)`;
        el.style.transform = `translate(${sx}px, ${sy}px)`;
      }
      SFX.swoosh();
      run.timer = setTimeout(() => {
        if (run !== shuffleRun || run.done) return;
        run.queue.shift();
        for (const el of [A, B]) { el.style.transition = 'none'; el.style.transform = ''; el.classList.remove('moving'); }
        swapNodes(A, B);
        reflow(A);
        A.style.transition = B.style.transition = '';
        run.timer = setTimeout(step, stepMs - moveMs);
      }, moveMs);
    };
    // If we arrive late (e.g. reconnect), there's nothing visible to track; just apply.
    const lateBy = S.deadline ? (S.durations.shuffle - (S.deadline - (Date.now() + offset))) : 0;
    if (lateBy > leadMs + stepMs) finishShuffle();
    else run.timer = setTimeout(step, Math.max(0, leadMs - lateBy));
  }

  function renderBoard({ inResult, hlCards }) {
    const b = $('#board');
    const key = S.board.length ? S.dealId : null;
    if (key !== boardKey) {
      boardKey = key;
      b.innerHTML = '';
      if (S.board.length) {
        // Deal animation for a fresh board, but not when (re)joining straight into results.
        const animate = !['showdown', 'gameover'].includes(S.phase);
        S.board.forEach((code, i) => {
          const c = makeCard('');
          setFace(c, code);
          b.appendChild(c);
          if (animate) {
            c.classList.add('deal-in');
            c.style.setProperty('--dd', `${700 + i * 130}ms`);
            c.style.setProperty('--d', `${1100 + i * 130}ms`);
            reflow(c);
          }
          c.classList.remove('down');
        });
        if (animate) {
          setTimeout(() => SFX.deal(), 650);
          for (let i = 0; i < 5; i++) SFX.flip(1.2 + i * 0.13);
        }
      } else {
        b.innerHTML = '<div class="slot"></div>'.repeat(5);
      }
    }
    b.classList.toggle('result', inResult);
    [...b.querySelectorAll('.card')].forEach((c) => c.classList.toggle('hl', inResult && hlCards.has(c.dataset.code)));
  }

  function renderStatus({ me, opp }) {
    const ph = S.phase;
    const nut = S.game === 'nut';
    const labels = {
      lobby: opp ? t('ph.lobbyReady') : t('ph.lobbyWait'),
      memorize: t('ph.memorize'),
      reveal: t('ph.reveal'),
      shuffle: t('ph.shuffle'),
      pick: nut ? t('ph.nutPick') : t('ph.pick'),
      showdown: t('ph.showdown'),
      gameover: t('ph.gameover'),
    };
    const memSec = Math.round(S.durations.memorize / 1000);
    const pickSec = Math.round(S.durations.pick / 1000);
    const times = nut ? t('sub.nutTime', { p: pickSec }) : t('sub.times', { m: memSec, p: pickSec });
    const subs = {
      lobby: [
        t(`game.${S.game}`),
        t('sub.count', { n: S.players.length, max: S.maxPlayers }),
        opp ? t('sub.lobbyOpp') : t('sub.lobbyCode', { code: S.code }),
        times,
        S.settings?.swaps ? t('sub.swaps', { n: S.settings.swaps }) : '',
      ].filter(Boolean).join(' · '),
      memorize: t('sub.memorize', { m: memSec }),
      reveal: S.game === 'shuffle' ? t('sub.revealShuffle') : t('sub.reveal'),
      shuffle: t('sub.shuffle'),
      pick: nut ? t('sub.nutPick') : t('sub.pick'),
      showdown: S.result ? t('sub.pot', { n: fmt(S.result.pot) }) : '',
      gameover: '',
    };
    $('#phaseLabel').textContent = labels[ph] || '';
    $('#phaseSub').textContent = subs[ph] || '';

    // Result banner
    const banner = $('#banner');
    if (ph === 'showdown' && P?.phase !== 'showdown' && S.result) {
      const won = S.result.winners.includes(S.me);
      const split = S.result.winners.length > 1;
      const myHand = S.result.hands.find((h) => h.id === S.me);
      const kind = split ? 'split' : won ? 'win' : 'lose';
      const title = split ? 'SPLIT' : won ? 'WIN!' : 'LOSE';
      banner.className = `banner ${kind}`;
      banner.innerHTML = `${title}<small>${esc(I18N.hand(myHand?.score))}</small>`;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.classList.add('show');
        if (split) SFX.split(); else if (won) SFX.win(); else SFX.lose();
        bannerTimer = setTimeout(() => banner.classList.remove('show'), 2400);
      }, 1700);
    } else if (ph !== 'showdown') {
      clearTimeout(bannerTimer);
      banner.classList.remove('show');
    }
  }

  function renderActions({ me, opp }) {
    const bar = $('#actionBar');
    if (!me) return setHTML(bar, '');
    const ph = S.phase;
    let html = '';
    if (me.out && ph !== 'lobby' && ph !== 'gameover') {
      html = `<span class="hint">${t('hint.out')}</span>`;
    } else if (ph === 'lobby') {
      const full = S.players.length >= S.maxPlayers;
      const bots = full ? '' : `<div class="bot-add"><span>${t('bot.add')}</span>${['easy', 'normal', 'hard']
        .map((l) => `<button data-act="addBot" data-level="${l}" class="lvl-${l}">${t(`lvl.${l}`)}</button>`).join('')}</div>`;
      html = `<div class="action-row">
          <button class="btn ghost" data-tutorial>${t('howto')}</button>
          ${full ? '' : `<button class="btn ghost" data-act="invite">${t('invite.copy')}</button>`}
          <button class="btn ${me.ready ? 'ghost' : 'gold'} big" data-act="ready" ${opp ? '' : 'disabled'}>${me.ready ? t('act.unready') : t('act.ready')}</button>
        </div>${bots}`;
    } else if (ph === 'memorize') {
      html = me.memorized
        ? `<span class="hint dots">${t('hint.oppMemorizing')}</span>`
        : `<button class="btn blue big" data-act="memorized">${t('act.memorized')}</button>`;
    } else if (ph === 'reveal') {
      html = `<span class="hint">${t('hint.focus')}</span>`;
    } else if (ph === 'shuffle') {
      html = `<span class="hint">${t('hint.shuffle')}</span>`;
    } else if (ph === 'pick') {
      html = me.locked
        ? `<span class="hint dots">${t('hint.oppPicking')}</span>`
        : `<span class="hint">${t('hint.tapToPick')} <b>${me.pickCount}/2</b></span>
           <button class="btn gold big" data-act="lock" ${me.pickCount === 2 ? '' : 'disabled'}>${t('act.lock')}</button>`;
    } else if (ph === 'showdown') {
      const last = S.result?.final;
      html = me.next
        ? `<span class="hint dots">${t('hint.waitOpp')}</span>`
        : `<button class="btn blue" data-act="next">${last ? t('act.final') : t('act.nextRound')}</button>`;
    }
    setHTML(bar, html);
  }

  function renderOverlay({ me, opp }) {
    const ov = $('#overlay');
    if (S.phase !== 'gameover' || !S.final) {
      ov.classList.remove('show');
      setHTML(ov, '');
      return;
    }
    const { standings, championId, reason } = S.final;
    const won = championId === S.me;
    const draw = championId === null;
    const title = draw ? t('go.draw') : won ? t('go.win') : t('go.lose');
    const reasonText = reason === 'bust' ? t('go.bust') : t('go.rounds', { n: S.maxRounds });
    const rows = standings.map((s, i) =>
      `<div class="${i === 0 && !draw ? 'top' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(s.name)}${s.id === S.me ? t('meSuffix') : ''}${s.bot ? ` <small class="bot-tag">BOT·${t(`lvl.${s.bot}`)}</small>` : ''}</span><span class="ch">${fmt(s.chips)}</span></div>`).join('');
    const others = S.players.filter((p) => p.id !== S.me);
    const readyCount = S.players.filter((p) => p.ready).length;
    const waiting = !others.length ? t('go.oppGone')
      : me?.ready ? t('go.readyCount', { n: readyCount, max: S.players.length })
      : others.some((p) => p.ready && !p.bot) ? t('go.oppWants') : '';
    setHTML(ov, `
      <div class="result-card">
        <div class="trophy">${draw ? '🤝' : won ? '🏆' : '🃏'}</div>
        <h2 class="${won || draw ? '' : 'lose'}">${title}</h2>
        <p class="reason">${reasonText}</p>
        <div class="standings">${rows}</div>
        <div class="result-actions">
          <button class="btn ghost" data-act="exit">${t('act.exit')}</button>
          <button class="btn ${me?.ready ? 'ghost' : 'gold'} big" data-act="ready">${me?.ready ? t('act.unready') : t('act.rematch')}</button>
        </div>
        <div class="wait">${waiting}</div>
      </div>`);
    ov.classList.add('show');
  }

  function phaseEffects() {
    if (P?.phase === S.phase && P?.dealId === S.dealId) return;
    switch (S.phase) {
      case 'memorize':
        SFX.shuffle();
        SFX.flipWave(16, 0.04, 0.55);
        break;
      case 'reveal':
        SFX.flipWave(16, 0.04);
        break;
      case 'pick':
        if (S.game === 'nut') { SFX.shuffle(); SFX.flipWave(16, 0.04, 0.5); }
        break;
      case 'showdown':
        SFX.flip(0.15); SFX.flip(0.25);
        if (S.game !== 'nut') SFX.flipWave(16, 0.035, 0.9);
        break;
      case 'gameover':
        if (S.final?.championId === S.me) SFX.fanfare();
        break;
    }
  }

  I18N.apply();
  I18N.onChange(() => {
    if ($('#setup').classList.contains('show')) renderSetup();
    if (S) render();
  });

  // ------------------------------------------------------------- timer loop
  const timerEl = $('#timer');
  const timerNum = $('#timerNum');
  const timerBar = timerEl.querySelector('.bar');
  const CIRC = 2 * Math.PI * 19;
  function tick() {
    requestAnimationFrame(tick);
    if (!S || !S.deadline) {
      timerEl.classList.add('hidden');
      return;
    }
    const total = S.durations[S.phase] || 1;
    const left = Math.max(0, S.deadline - (Date.now() + offset));
    const sec = Math.ceil(left / 1000);
    timerEl.classList.remove('hidden');
    timerNum.textContent = sec;
    timerBar.style.strokeDashoffset = String(CIRC * (1 - left / total));
    const urgent = (S.phase === 'memorize' || S.phase === 'pick') && sec <= 5;
    timerEl.classList.toggle('urgent', urgent);
    if (urgent && sec > 0 && sec !== lastTick) SFX.tick();
    lastTick = sec;
  }
  requestAnimationFrame(tick);
})();
