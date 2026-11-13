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
  // Profile picture inside an .avatar circle: bot face, uploaded photo, preset cat, or initial.
  function avatarInner(p) {
    if (!p) return '?';
    if (p.bot) return botFace();
    if (p.avatar === 'img' && p.uid) return `<img src="/avatar/${p.uid}?v=${p.avatarV || 0}" alt="" loading="lazy">`;
    if (p.avatar && /^p\d+$/.test(p.avatar)) return Stickers.avatar(p.avatar);
    return esc((p.name || '?')[0]);
  }
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
  // Shared with chat.js / profile.js.
  let ME = null; // my public profile { id, name, avatar, avatarV }
  window.HA = {
    socket, toast, esc, fmt, setHTML,
    me: () => S?.me || session.get()?.playerId,
    profile: () => ME,
    setProfile: (u) => { ME = u; renderNavMe(); if (S) render(); },
    avatarInner: (p) => avatarInner(p),
    colorFor: (id) => colorFor(id),
    createGame: (id) => createGame(id),
    join: (code) => join(code),
    myName: () => nameInput.value.trim() || ME?.name || pref.get('name') || '',
    credentials: () => ({ uid: pref.get('uid'), token: pref.get('utok') }),
    useCredentials: (uid, token) => { pref.set('uid', uid); pref.set('utok', token); },
  };
  function renderNavMe() {
    const el = $('#navAvatar');
    if (el && ME) el.innerHTML = avatarInner({ ...ME, uid: ME.id });
    $('#topName').textContent = nameInput.value.trim() || ME?.name || 'Player';
  }
  function hello() {
    socket.emit('hello', { uid: pref.get('uid'), token: pref.get('utok'), name: pref.get('name') }, (res) => {
      if (!res?.ok) return;
      pref.set('uid', res.uid);
      pref.set('utok', res.token);
      ME = res.user;
      if (!nameInput.value && ME.name && ME.name !== 'Player') nameInput.value = ME.name;
      renderNavMe();
    });
  }

  // Force a style flush so a class change right after insertion still transitions.
  const reflow = (el) => void el.offsetWidth;

  // ------------------------------------------------------------- lobby
  const nameInput = $('#nameInput');
  const codeInput = $('#codeInput');
  nameInput.value = pref.get('name') || '';
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) codeInput.value = urlRoom.toUpperCase().slice(0, 4);

  // Lobby panels (settings / find rooms) — ranking & my page live in profile.js.
  const openPanel = (id) => { $(id).classList.add('show'); SFX.click(); };
  function askName() {
    openPanel('#setPanel');
    toast(t('err.nick'));
    setTimeout(() => nameInput.focus(), 250);
  }
  $('#setBtn').addEventListener('click', () => openPanel('#setPanel'));
  $('#roomsBtn').addEventListener('click', () => openPanel('#roomsPanel'));
  $('#topChat').addEventListener('click', () => window.Chat && Chat.open());
  $('#setMe').addEventListener('click', () => { $('#setPanel').classList.remove('show'); $('#meBtn').click(); });
  // Save the nickname as soon as it's edited.
  nameInput.addEventListener('change', () => { if (nameInput.value.trim()) getName(); renderNavMe(); });
  nameInput.addEventListener('input', renderNavMe);

  function getName() {
    const n = nameInput.value.trim().slice(0, 12);
    if (!n) {
      askName();
      return null;
    }
    pref.set('name', n);
    if (ME && ME.name !== n) {
      ME.name = n;
      socket.emit('profile:update', { name: n }, () => {});
    }
    return n;
  }

  // Called by the plaza when you stand on a game pad.
  function createGame(gameId) {
    if (!getName()) return;
    SFX.click();
    openSetup(gameId);
  }

  // ---- create-room settings modal (last choice remembered per browser)
  const setupEl = $('#setup');
  let setupGame = null;
  let settings = { players: 4, memorizeSec: 30, pickSec: 20, turnSec: 20, betting: 'on', swaps: 5, speed: 'normal' };
  try { Object.assign(settings, JSON.parse(pref.get('roomSettings')) || {}); } catch {}

  function renderSetup() {
    $('#memVal').textContent = settings.memorizeSec;
    $('#pickVal').textContent = settings.pickSec;
    $('#turnVal').textContent = settings.turnSec;
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

  function join(codeArg) {
    const name = getName();
    if (!name) return;
    const code = (typeof codeArg === 'string' ? codeArg : codeInput.value).trim().toUpperCase();
    if (code.length !== 4) return toast(t('err.code'));
    SFX.click();
    socket.emit('join', { name, code }, onJoined);
  }

  // ---- live room list
  let roomsCache = [];
  function renderRooms(list = roomsCache) {
    roomsCache = list;
    const box = $('#roomList');
    $('#roomsCount').textContent = list.length ? t('rooms.count', { n: list.length }) : '';
    $('#roomsBadge').textContent = list.length || '';
    if (!list.length) {
      setHTML(box, `<div class="room-empty">${t('rooms.empty')}</div>`);
      return;
    }
    setHTML(box, list.map((r) => {
      const status = !r.playing ? (r.joinable ? t('rooms.waiting') : t('rooms.full'))
        : t('rooms.playingRound', { n: r.round }) + (r.joinable ? ` · ${t('rooms.lateOk')}` : '');
      const btn = r.joinable ? (r.playing ? t('rooms.lateJoin') : t('join.btn')) : t('rooms.watch');
      return `<div class="room-row${r.joinable ? '' : ' closed'}">
        <span class="room-game g-${r.gameId}">${esc(t(`game.${r.gameId}`))}</span>
        <div class="room-info">
          <b>${esc(t('rooms.host', { name: r.host }))}</b>
          <span>${t('rooms.players', { n: r.players, max: r.max })}${r.bots ? ` · ${t('rooms.bots', { n: r.bots })}` : ''}${r.watchers ? ` · 👀 ${r.watchers}` : ''} · <em class="${r.joinable ? 'ok' : ''}">${status}</em></span>
        </div>
        <button class="btn ${r.joinable ? 'gold' : 'ghost'}" data-join="${r.code}">${btn}</button>
      </div>`;
    }).join(''));
  }
  $('#roomList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-join]');
    if (b && !b.disabled) join(b.dataset.join);
  });
  socket.on('rooms', (list) => renderRooms(list || []));

  // ---- who's online (lobby)
  let onlineCache = [];
  function renderOnline(list = onlineCache) {
    onlineCache = list;
    const box = $('#onlineList');
    const myUid = pref.get('uid');
    $('#onlineCount').textContent = list.length ? t('online.count', { n: list.length }) : '';
    if (list.length <= 1) {
      setHTML(box, `${list.map(personHTML).join('')}<div class="online-empty">${t('online.empty')}</div>`);
      return;
    }
    setHTML(box, list.map(personHTML).join(''));
    function personHTML(u) {
      const isMe = u.uid === myUid;
      const r = u.room;
      const game = r ? t(`game.${r.gameId}`) : '';
      const status = !r ? t('online.lobby') : r.watching ? t('online.watching', { game }) : r.playing ? t('online.playing', { game }) : t('online.waiting', { game });
      const canJoin = r && !isMe;
      return `<div class="person${r ? (r.playing ? ' busy' : ' waiting') : ''}${isMe ? ' me' : ''}">
        <div class="avatar" style="background:${colorFor(u.uid)}">${avatarInner(u)}</div>
        <div class="p-info"><b>${esc(u.name)}${isMe ? `<em>${t('online.me')}</em>` : ''}</b><span><i class="dot"></i>${esc(status)}</span></div>
        ${canJoin ? `<button class="btn ${r.joinable ? 'gold' : 'ghost'} small" data-join="${r.code}">${r.joinable ? t('online.join') : t('rooms.watch')}</button>` : ''}
      </div>`;
    }
  }
  $('#onlineList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-join]');
    if (b) join(b.dataset.join);
  });
  socket.on('online', (list) => renderOnline(list || []));

  // ---- invite links (?room=CODE): show what you're joining; join at once if we know your name
  let inviteHandled = false;
  function handleInvite() {
    if (inviteHandled || !urlRoom || session.get()) return;
    inviteHandled = true;
    socket.emit('roomInfo', urlRoom, (info) => {
      const card = $('#inviteCard');
      if (!info?.ok) {
        toast(t('srv.notFound'));
        history.replaceState(null, '', location.pathname);
        return;
      }
      card.hidden = false;
      card._info = info;
      renderInvite();
      if (pref.get('name')) join(info.code);
      else askName();
    });
  }
  function renderInvite() {
    const info = $('#inviteCard')._info;
    if (!info) return;
    $('#inviteTitle').textContent = t('invite.title', { name: info.host, game: t(`game.${info.gameId}`) });
    $('#inviteMeta').textContent = [t('rooms.players', { n: info.players, max: info.max }),
      info.playing ? t('rooms.playingRound', { n: info.round }) : '',
      info.joinable ? (info.playing ? t('rooms.lateOk') : '') : t('invite.watchOnly'),
      pref.get('name') ? '' : t('invite.needName')].filter(Boolean).join(' · ');
    $('#inviteJoin').textContent = info.joinable ? t('invite.enter') : t('rooms.watch');
  }
  $('#inviteJoin').addEventListener('click', () => join($('#inviteCard')._info?.code || urlRoom));
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('#inviteCard').hidden) $('#inviteJoin').click();
  });
  $('#joinBtn').addEventListener('click', join);
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));

  function onJoined(res) {
    if (!res || !res.ok) return toast(I18N.msg(res) || t('err.joinFail'));
    session.set({ code: res.code, playerId: res.playerId });
    document.querySelectorAll('.sheet-overlay.show').forEach((p) => p.classList.remove('show'));
    history.replaceState(null, '', `?room=${res.code}`);
    $('#inviteCard').hidden = true;
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
    hello(); // first, so rooms see who we are
    const s = session.get();
    if (!s) return handleInvite();
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
    // Only a seated, active player loses anything by leaving mid-game.
    const seated = S && S.players.find((p) => p.id === S.me && !p.pending && !p.out);
    if (seated && !['lobby', 'gameover'].includes(S.phase) && !confirm(t('confirm.leave'))) return;
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
  // Same switch in the lobby settings panel.
  const lobbyMute = $('#lobbyMute');
  const renderLobbyMute = () => { lobbyMute.innerHTML = muteBtn.innerHTML + ` <span>${SFX.muted ? t('set.off') : t('set.on')}</span>`; };
  lobbyMute.addEventListener('click', () => { SFX.toggleMute(); renderMute(); renderLobbyMute(); SFX.click(); });
  renderMute();
  renderLobbyMute();
  I18N.onChange(renderLobbyMute);

  $('#actionBar').addEventListener('click', onActionClick);
  $('#overlay').addEventListener('click', onActionClick);
  function onActionClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'ipQuick') {
      ipRaiseTo = Number(b.dataset.to);
      const sl = $('#ipSlider');
      if (sl) sl.value = String(ipRaiseTo);
      ipRaiseLabel();
      return SFX.click();
    }
    if (a === 'raiseTo') { SFX.chips(); return act('raise', { to: ipRaiseTo }); }
    if (a === 'invite') return copyInvite();
    if (a === 'exit') return $('#leaveBtn').click();
    if (a === 'lock') SFX.lock(); else SFX.click();
    const amount = b.dataset.amount === 'allin' ? 'allin' : b.dataset.amount ? Number(b.dataset.amount) : undefined;
    act(a, { level: b.dataset.level, id: b.dataset.id, amount });
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
      for (const h of S.result.hands) if (S.result.winners.includes(h.id)) (h.best || []).forEach((c) => hlCards.add(c));
    }
    const ctx = { me, opp, opps, inResult, hlCards };
    $('#roomCode').textContent = S.code;
    $('#roundInfo').textContent = S.round ? `${S.round}/${S.maxRounds}` : '-';
    $('#anteInfo').textContent = S.ante ? fmt(S.ante) : '-';
    $('#potInfo').textContent = fmt(inResult && S.result ? S.result.pot : S.pot);
    const watchers = S.spectators || [];
    $('#watchInfo').hidden = !watchers.length;
    $('#watchCount').textContent = watchers.length;
    $('#watchInfo').title = watchers.map((w) => w.name).join(', ');
    $('#room').classList.toggle('watching', !!S.spectator);
    $('#room').classList.toggle('game-indian', S.game === 'indian');

    if (S.game === 'indian') {
      renderIndian(ctx);
      renderActions(ctx);
      renderOverlay(ctx);
      phaseEffects(ctx);
      ipChipFly();
      if (S.notice && JSON.stringify(S.notice) !== JSON.stringify(P?.notice)) toast(I18N.msg(S.notice), 3500);
      return;
    }

    renderOpps(ctx);
    renderSeat($('#seatMe'), me, true, ctx);
    $('#board').dataset.label = t('zone.board');
    $('#grid').dataset.label = S.game === 'nut' ? t('zone.gridNut') : t('zone.grid');
    renderGrid(ctx);
    renderBoard(ctx);
    renderGridStatus(ctx);
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
    const turn = ph === 'bet' && S.turn === p.id;
    el.className = `seat ${isMe ? 'me' : 'opp'}${isWinner ? ' winner' : ''}${p.out ? ' out' : ''}${p.folded ? ' folded' : ''}${turn ? ' turn' : ''}`;

    let badge = '';
    if (p.pending && ph !== 'lobby' && ph !== 'gameover') badge = `<span class="badge ok">${t('badge.nextRound')}</span>`;
    else if (p.out && ph !== 'lobby' && ph !== 'gameover') badge = `<span class="badge warn">${t('badge.out')}</span>`;
    else if (!p.connected) badge = `<span class="badge warn">${t('badge.off')}</span>`;
    else if (ph === 'lobby' || ph === 'gameover') badge = p.ready ? `<span class="badge ok">${t('badge.ready')}</span>` : `<span class="badge">${t('badge.wait')}</span>`;
    else if (ph === 'memorize') badge = p.memorized ? `<span class="badge ok">${t('badge.memorized')}</span>` : `<span class="badge">${t('badge.memorizing')}</span>`;
    else if (ph === 'pick') badge = p.locked ? `<span class="badge ok">${t('badge.locked')}</span>` : `<span class="badge">${t('badge.picking', { n: p.pickCount })}</span>`;
    else if (p.dq && (ph === 'bet' || ph === 'showdown')) badge = `<span class="badge warn">${t('badge.dq')}</span>`;
    else if (ph === 'bet') {
      if (turn) badge = `<span class="badge think dots">${t('ip.thinking')}</span>`;
      else if (p.lastAction) badge = `<span class="badge ${p.folded ? 'warn' : 'ok'}">${actionLabel(p.lastAction)}</span>`;
    } else if (hand?.folded) badge = `<span class="badge warn">${hand.dq ? t('badge.dq') : t('ip.fold')}</span>`;
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
    if (ph === 'showdown' && S.result && hand) {
      const won = S.result.winners.includes(p.id);
      const net = (won ? S.result.share : 0) - S.result.ante - (hand?.bet || 0);
      if (net) delta = `<span class="delta ${net > 0 ? 'plus' : 'minus'}">${net > 0 ? '+' : ''}${fmt(net)}</span>`;
    }
    const betChip = ph === 'bet' && p.bet ? `<span class="bet-chip"><span class="chip-icon"></span>${fmt(p.bet)}</span>` : '';
    const dealer = S.betting && S.dealerId === p.id && ph !== 'lobby' && ph !== 'gameover' ? `<span class="dealer-btn" title="${t('ip.dealer')}">D</span>` : '';

    let hole = '';
    for (let k = 0; k < 2; k++) {
      const idx = p.picks ? p.picks[k] : undefined;
      if (hand && !hand.cards[k]) {
        hole += '<div class="slot"></div>';
      } else if (hand) {
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
      ${removeBtn}${dealer}
      <div class="avatar${p.connected ? '' : ' off'}${p.bot ? ' bot' : ''}" style="background:${colorFor(p.id)}">${avatarInner(p)}</div>
      <div class="who">
        <div class="name">${esc(p.name)}${isMe ? `<em>${t('me')}</em>` : ''}${botTag}</div>
        <div class="chips"><span class="chip-icon"></span>${fmt(p.chips)} ${delta}</div>
        ${badge}
      </div>
      ${betChip}
      <div class="hole">${hole}</div>`);
  }

  function actionLabel(a) {
    if (!a) return '';
    if (a.kind === 'check') return t('ip.check');
    if (a.kind === 'call') return t('ip.callN', { n: fmt(a.amount) });
    if (a.kind === 'raise') return t('ip.raiseTo', { n: fmt(a.amount) });
    if (a.kind === 'allin') return t('ip.allin');
    if (a.kind === 'fold') return t('ip.fold');
    return '';
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
      el.classList.toggle('pickable', ph === 'pick' && !!me && !me.locked && !me.out);
      el.classList.toggle('dim', inResult && !picked.has(i) && !isNuts);
      el.classList.toggle('hl', inResult && picked.has(i) && hlCards.has(info?.card));
      const shown = theirs.slice(0, 2).map((o) => `<span class="t-opp">${esc(o.name.slice(0, 4))}</span>`).join('');
      const more = theirs.length > 2 ? `<span class="t-opp">+${theirs.length - 2}</span>` : '';
      setHTML(el.querySelector('.tag'),
        (isNuts ? '<span class="t-nuts">NUTS</span>' : '') + (mine ? `<span class="t-me">${t('me')}</span>` : '') + shown + more);
    });
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

  const cmpScore = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  };
  const secsBetween = (a, b) => (Math.abs(a - b) / 1000).toFixed(1);

  // One line explaining a close result: speed tie-break (Nut Race) or kicker.
  function outcomeReason() {
    const r = S.result;
    if (!r) return '';
    const nameOf = (id) => S.players.find((p) => p.id === id)?.name || '';
    if (r.voided) return t('why.voided');
    const mine = r.hands.find((h) => h.id === S.me);
    if (mine?.dq) return t('why.dq');
    if (r.uncontested) return r.winners[0] === S.me ? t('ip.whyAllFold') : t('ip.whyOthersWin', { name: nameOf(r.winners[0]) });
    if (mine?.folded) return t('why.folded');
    if (!mine || r.winners.length > 1) return '';
    const handName = I18N.hand(mine.score);
    if (!r.winners.includes(S.me)) {
      const w = r.hands.find((h) => h.id === r.winners[0]);
      if (cmpScore(mine.score, w.score) === 0) {
        if (mine.lockedAt == null) return t('why.noLock');
        return t('why.slower', { name: nameOf(w.id), n: secsBetween(mine.lockedAt, w.lockedAt) });
      }
      return I18N.hand(w.score) === handName ? t('why.kicker', { hand: handName }) : '';
    }
    const others = r.hands.filter((h) => h.id !== S.me && !h.folded);
    const sameHand = others.filter((h) => cmpScore(h.score, mine.score) === 0);
    if (sameHand.length) {
      const times = sameHand.map((h) => h.lockedAt).filter((x) => x != null);
      return times.length ? t('why.faster', { n: secsBetween(Math.min(...times), mine.lockedAt) }) : t('why.fasterNoLock');
    }
    return others.some((h) => I18N.hand(h.score) === handName) ? t('why.kickerWin', { hand: handName }) : '';
  }


  // ============================================================ Indian Poker
  // Its own interface: a big oval table with up to 6 seats around it; every
  // character wears their card above the head (yours stays a "?").
  const ipValue = (c) => (c ? (c[0] === 'T' ? 10 : Number(c[0])) : 0);
  // Seat anchor points (% of the table box): landscape and portrait tables.
  const IP_SLOTS = {
    wide: [[50, 89], [10, 63], [17, 17], [50, 6], [83, 17], [90, 63]],
    tall: [[50, 88], [13, 66], [13, 31], [50, 9], [87, 31], [87, 66]],
  };
  const IP_ORDER = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
  let ipRaiseTo = 0;
  let ipRaiseKey = '';
  let ipFlipped = -1;

  function ipBuild() {
    const box = $('#ipTable');
    if (box._built) return;
    box._built = true;
    box.innerHTML = `
      <div class="ip-oval" id="ipOval">
        <div class="ip-rail"></div>
        <div class="ip-felt"><div class="ip-logo">INDIAN POKER</div></div>
        <div class="ip-center" id="ipCenter"></div>
        <div class="ip-seats" id="ipSeats"></div>
      </div>
      <div class="ip-bar" id="ipActions"></div>`;
    $('#ipActions').addEventListener('click', onActionClick);
    $('#ipActions').addEventListener('input', (e) => {
      if (e.target.id !== 'ipSlider') return;
      ipRaiseTo = Number(e.target.value);
      ipRaiseLabel();
    });
    $('#ipSeats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="removeBot"]');
      if (!b) return;
      SFX.click();
      act('removeBot', { id: b.dataset.id });
    });
  }

  function ipSeatOrder() {
    const list = S.players;
    const meIdx = list.findIndex((p) => p.id === S.me);
    const ordered = meIdx >= 0 ? [...list.slice(meIdx), ...list.slice(0, meIdx)] : list.slice();
    // One open chair while the waiting room has space.
    if (S.phase === 'lobby' && ordered.length < S.maxPlayers) ordered.push(null);
    return ordered.slice(0, 6);
  }

  function renderIndian({ inResult }) {
    ipBuild();
    const oval = $('#ipOval');
    const tall = oval.clientHeight > oval.clientWidth;
    const slots = IP_SLOTS[tall ? 'tall' : 'wide'];
    const seated = ipSeatOrder();
    const order = IP_ORDER[Math.max(1, seated.length)];
    const box = $('#ipSeats');
    const wanted = new Set();

    seated.forEach((p, i) => {
      const [x, y] = slots[order[i]];
      const id = p ? p.id : 'empty';
      wanted.add(id);
      let el = box.querySelector(`.iseat[data-id="${id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.dataset.id = id;
        box.appendChild(el);
      }
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      // Bet chips sit between the seat and the pot.
      el.style.setProperty('--bx', `${((50 - x) / 100) * oval.clientWidth * 0.34}px`);
      el.style.setProperty('--by', `${((50 - y) / 100) * oval.clientHeight * 0.34}px`);
      if (!p) {
        el.className = 'iseat empty';
        setHTML(el, `<div class="is-avatar-wrap"><div class="is-avatar avatar empty-av">+</div></div><div class="is-plate"><b class="dots">${t('seat.waiting')}</b></div>`);
        return;
      }
      const isMe = p.id === S.me;
      const hand = inResult && S.result ? S.result.hands.find((h) => h.id === p.id) : null;
      const isWinner = !!hand && S.result.winners.includes(p.id);
      const turn = S.phase === 'bet' && S.turn === p.id;
      el.className = `iseat${isMe ? ' me' : ''}${turn ? ' turn' : ''}${isWinner ? ' winner' : ''}${p.folded ? ' folded' : ''}${(p.out && !p.pending) ? ' out' : ''}${y < 50 ? ' top' : ''}`;
      setHTML(el, ipSeatHTML(p, isMe, hand, isWinner));
    });
    [...box.children].forEach((el) => !wanted.has(el.dataset.id) && el.remove());

    // My card flips over at the showdown (once per deal).
    if (S.phase === 'showdown' && ipFlipped !== S.dealId) {
      const mine = box.querySelector('.iseat.me .ip-card.down');
      if (mine) {
        ipFlipped = S.dealId;
        reflow(mine);
        setTimeout(() => { mine.classList.remove('down'); SFX.flip(0); }, 650);
      }
    }
    setHTML($('#ipCenter'), ipCenterHTML());
    renderIndianStatus();
  }

  function ipSeatHTML(p, isMe, hand, isWinner) {
    const ph = S.phase;
    const turn = ph === 'bet' && S.turn === p.id;
    let card = '';
    if (p.card) {
      // My own card: face down first at the showdown, then it flips.
      const flipPending = isMe && ph === 'showdown' && ipFlipped !== S.dealId;
      card = cardHTML(p.card, '', { down: flipPending, cls: `ip-card${isWinner ? ' hl' : ''}` });
    } else if (p.hasCard) card = cardHTML(null, '?', { down: true, cls: `ip-card${isMe ? ' mine-hidden' : ''}` });

    let badge = '';
    if (p.pending && ph !== 'lobby' && ph !== 'gameover') badge = `<span class="badge ok">${t('badge.nextRound')}</span>`;
    else if (p.out && ph !== 'lobby' && ph !== 'gameover') badge = `<span class="badge warn">${t('badge.out')}</span>`;
    else if (!p.connected) badge = `<span class="badge warn">${t('badge.off')}</span>`;
    else if (ph === 'lobby' || ph === 'gameover') badge = p.ready ? `<span class="badge ok">${t('badge.ready')}</span>` : `<span class="badge">${t('badge.wait')}</span>`;
    else if (ph === 'bet') {
      if (turn) badge = `<span class="badge think dots">${t('ip.thinking')}</span>`;
      else if (p.lastAction) badge = `<span class="badge ${p.folded ? 'warn' : 'ok'}">${actionLabel(p.lastAction)}</span>`;
    } else if (hand) {
      badge = `<span class="badge hand">${hand.folded ? t('ip.fold') : t('ip.value', { n: hand.value })}</span>`;
      if (hand.penalty) badge += `<span class="badge warn">${t('ip.penalty', { n: hand.penalty })}</span>`;
    }
    let delta = '';
    if (ph === 'showdown' && hand) {
      const net = (isWinner ? S.result.share : 0) - S.result.ante - hand.bet - hand.penalty;
      if (net) delta = `<span class="delta ${net > 0 ? 'plus' : 'minus'}">${net > 0 ? '+' : ''}${fmt(net)}</span>`;
    }
    const bet = ph === 'bet' && p.bet ? `<div class="is-bet"><span class="chip-stack"><i></i><i></i><i></i></span><b>${fmt(p.bet)}</b></div>` : '';
    const dealer = S.dealerId === p.id && ph !== 'lobby' && ph !== 'gameover' ? `<span class="dealer-btn" title="${t('ip.dealer')}">D</span>` : '';
    const botTag = p.bot ? `<span class="bot-tag">BOT·${t(`lvl.${p.bot}`)}</span>` : '';
    const removeBtn = p.bot && ph === 'lobby' ? `<button class="seat-x" data-act="removeBot" data-id="${p.id}" aria-label="${t('bot.remove')}">×</button>` : '';
    return `${removeBtn}
      <div class="is-card">${card}</div>
      <div class="is-avatar-wrap">
        <svg class="is-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/></svg>
        <div class="is-avatar avatar${p.connected ? '' : ' off'}" style="background:${colorFor(p.id)}">${avatarInner(p)}</div>
        ${dealer}
      </div>
      <div class="is-plate"><b>${esc(p.name)}${isMe ? `<em>${t('me')}</em>` : ''}</b><span><i class="chip-icon"></i>${fmt(p.chips)} ${delta}</span>${botTag}</div>
      <div class="is-badges">${badge}</div>
      ${bet}`;
  }

  function ipCenterHTML() {
    const inResult = S.phase === 'showdown' || S.phase === 'gameover';
    const pot = inResult && S.result ? S.result.pot : S.pot;
    const status = `<div class="ipc-status"><b id="ipLabel"></b><span id="ipSub"></span></div>`;
    if (S.phase === 'lobby') {
      return `${status}<div class="ipc-rules">${t('ip.lobbyRules', { n: S.tenPenalty || 100 })}<br><b>${t('ip.freeRules')}</b></div>`;
    }
    const fresh = S.reshuffledAt === S.round && S.phase === 'bet';
    const discards = (S.discards || []).map((c) => `<span class="mini-v ${c[1] === 'h' ? 'red' : ''}">${ipValue(c)}</span>`).join('');
    const chips = Math.min(14, Math.ceil((pot || 0) / 60));
    return `${status}
      <div class="ipc-pot">
        <div class="ipc-pile">${Array.from({ length: chips }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
        <div class="ipc-amount"><span>POT</span><b>${fmt(pot || 0)}</b></div>
      </div>
      <div class="ipc-info">
        <span>${t('ip.toBeat')} <b>${fmt(S.currentBet || 0)}</b></span>
        <span>${t('ip.deck')} <b>${S.deckLeft ?? '-'}</b>${fresh ? ` <i class="ip-new">${t('ip.reshuffled')}</i>` : ''}</span>
      </div>
      <div class="ipc-discards"><em>${t('ip.discards')}</em><div class="mini-row">${discards || `<span class="none">${t('ip.noDiscards')}</span>`}</div></div>`;
  }

  function indianReason() {
    const r = S.result;
    if (!r) return '';
    const mine = r.hands.find((h) => h.id === S.me);
    const nameOf = (id) => S.players.find((p) => p.id === id)?.name || '';
    if (r.uncontested) return r.winners[0] === S.me ? t('ip.whyAllFold') : t('ip.whyOthersWin', { name: nameOf(r.winners[0]) });
    if (!mine) return '';
    if (mine.folded) {
      // The sting of Indian Poker: you folded the winning card.
      const best = Math.max(...r.hands.filter((h) => !h.folded).map((h) => h.value));
      return mine.value > best ? t('ip.whyFoldedWin', { n: mine.value }) : t('ip.whyFolded', { n: mine.value });
    }
    if (r.winners.length > 1) return t('ip.whyTie', { n: r.hands.find((h) => h.id === r.winners[0]).value });
    return t('ip.whyMine', { n: mine.value });
  }

  function renderIndianStatus() {
    const ph = S.phase;
    const turnP = S.players.find((p) => p.id === S.turn);
    const myTurn = ph === 'bet' && S.turn === S.me;
    const others = S.players.filter((p) => p.id !== S.me);
    const label = {
      lobby: others.length ? t('ph.lobbyReady') : t('ph.lobbyWait'),
      bet: myTurn ? t('ip.yourTurn') : t('ip.turnOf', { name: turnP?.name || '' }),
      showdown: t('ph.showdown'),
      gameover: t('ph.gameover'),
    }[ph] || '';
    const sub = {
      lobby: [t('sub.count', { n: S.players.length, max: S.maxPlayers }), t('ip.turnTime', { p: Math.round(S.durations.bet / 1000) })].join(' · '),
      bet: myTurn && S.toCall ? t('ip.toCall', { n: fmt(S.toCall) }) : t('ip.betHint'),
      showdown: indianReason(),
    }[ph] || '';
    const lab = $('#ipLabel');
    if (lab) { lab.textContent = label; $('#ipSub').textContent = sub; }
    showBanner(() => {
      const mine = S.result.hands.find((h) => h.id === S.me);
      return mine ? t('ip.myCard', { n: mine.value }) : '';
    }, indianReason);
  }

  // Betting panel: fold any time; on your turn check/call or raise any amount.
  function ipBetActions(me) {
    if (me.folded) return `<span class="hint">${t('ip.foldedWait')}</span>`;
    const myTurn = S.turn === S.me;
    const fold = `<button class="btn ip-fold" data-act="fold">${t('ip.fold')}${myTurn ? '' : `<small>${t('ip.foldAny')}</small>`}</button>`;
    if (!myTurn) {
      const turnP = S.players.find((p) => p.id === S.turn);
      return `<div class="ipa-row">${fold}<span class="hint dots">${t('ip.waitTurn', { name: turnP?.name || '' })}</span></div>`;
    }
    const toCall = S.toCall || 0;
    const call = toCall
      ? `<button class="btn blue" data-act="call">${t('ip.callBtn', { n: fmt(Math.min(toCall, me.chips)) })}</button>`
      : `<button class="btn blue" data-act="check">${t('ip.check')}</button>`;
    const canRaise = S.raises < S.maxRaises && S.cap > S.currentBet && me.chips > toCall;
    if (!canRaise) return `<div class="ipa-row">${fold}${call}</div>`;
    const min = Math.min(S.cap, S.currentBet + (S.minRaise || 20));
    const max = S.cap;
    const key = `${S.dealId}:${S.currentBet}:${S.turn}`;
    if (key !== ipRaiseKey) { ipRaiseKey = key; ipRaiseTo = min; }
    ipRaiseTo = Math.max(min, Math.min(max, ipRaiseTo));
    const r10 = (n) => Math.max(min, Math.min(max, Math.round(n / 10) * 10));
    const quick = [
      [t('ipq.min'), min], [t('ipq.half'), r10(S.currentBet + S.pot / 2)], [t('ipq.pot'), r10(S.currentBet + S.pot)], [t('ip.allin'), max],
    ].map(([l, v]) => `<button class="ipq" data-act="ipQuick" data-to="${v}">${l}</button>`).join('');
    return `<div class="ipa-row">${fold}${call}
      <div class="ipa-raise">
        <div class="ipa-quick">${quick}</div>
        <div class="ipa-slide"><input type="range" id="ipSlider" min="${min}" max="${max}" step="10" value="${ipRaiseTo}" aria-label="${t('ipq.amount')}" /></div>
      </div>
      <button class="btn gold big ipa-go" data-act="raiseTo">${t('ipq.raise')} <b id="ipRaiseVal"></b></button></div>`;
  }
  function ipRaiseLabel() {
    const el = $('#ipRaiseVal');
    if (el) el.textContent = ipRaiseTo >= S.cap ? `${fmt(ipRaiseTo)} · ${t('ip.allin')}` : fmt(ipRaiseTo);
  }

  // Chips fly from a seat into the middle whenever someone puts money in.
  function ipChipFly() {
    if (S.phase !== 'bet' || !P || P.dealId !== S.dealId) return;
    const center = $('#ipCenter');
    if (!center) return;
    const b = center.getBoundingClientRect();
    for (const p of S.players) {
      const before = P.players.find((q) => q.id === p.id);
      if (!before || p.bet <= before.bet) continue;
      const seat = document.querySelector(`.iseat[data-id="${p.id}"] .is-avatar-wrap`);
      if (!seat) continue;
      const a = seat.getBoundingClientRect();
      for (let k = 0; k < 4; k++) {
        const c = document.createElement('i');
        c.className = 'chip-fly';
        c.style.left = `${a.left + a.width / 2}px`;
        c.style.top = `${a.top + a.height / 2}px`;
        document.body.appendChild(c);
        reflow(c);
        c.style.transitionDelay = `${k * 70}ms`;
        c.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2 + (k - 1.5) * 8}px, ${b.top + b.height / 2 - a.top - a.height / 2}px)`;
        setTimeout(() => c.remove(), 1000);
      }
    }
  }


  // ---------------------------------------------------------- winner spotlight
  // Once per showdown: a full-screen moment naming who won and with what.
  const CROWN = '<svg viewBox="0 0 64 44" aria-hidden="true"><defs><linearGradient id="spG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b8"/><stop offset=".5" stop-color="#f5c451"/><stop offset="1" stop-color="#a06c17"/></linearGradient></defs><path d="M4 14l14 10L32 4l14 20 14-10-6 26H10z" fill="url(#spG)" stroke="#6b450c" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="4" r="4" fill="#e3283a"/><circle cx="4" cy="14" r="3.5" fill="#2f7bff"/><circle cx="60" cy="14" r="3.5" fill="#2f7bff"/></svg>';

  function showBanner(detail, reason) {
    const ph = S.phase;
    if (ph === 'showdown' && P?.phase !== 'showdown' && S.result && !S.result.voided) {
      clearTimeout(bannerTimer);
      // Let the table reveal play first, then take the stage.
      const delay = S.game === 'indian' ? 1500 : S.game === 'nut' ? 500 : 1300;
      const d = detail();
      const why = reason();
      bannerTimer = setTimeout(() => openSpotlight(d, why), delay);
    } else if (ph !== 'showdown') {
      clearTimeout(bannerTimer);
      closeSpotlight(true);
    }
  }

  function openSpotlight(myDetail, why) {
    const r = S.result;
    if (!r) return;
    const el = $('#spotlight');
    const winners = r.winners.map((id) => S.players.find((p) => p.id === id) || { id, name: '?' });
    const iWon = r.winners.includes(S.me);
    const split = winners.length > 1;
    const wHand = r.hands.find((h) => h.id === r.winners[0]);
    const indian = S.game === 'indian';
    const handName = r.uncontested ? t('sp.allFold') : indian ? t('sp.indianWin', { n: wHand.value }) : I18N.hand(wHand.score);
    const title = split ? t('sp.split') : iWon ? t('sp.youWin') : t('sp.wins', { name: winners[0].name });

    let cards = '';
    if (indian && !r.uncontested) {
      cards = winners.map((w, i) => cardHTML(r.hands.find((h) => h.id === w.id).card, '', { cls: 'sp-card big', style: `--i:${i}` })).join('');
    } else if (!r.uncontested) {
      const own = new Set(wHand.cards);
      cards = wHand.best.map((c, i) => cardHTML(c, '', { cls: `sp-card${own.has(c) ? ' own' : ''}`, style: `--i:${i}` })).join('');
    }
    const avatars = winners.map((w) => `<div class="sp-avatar" style="background:${colorFor(w.id)}">${avatarInner(w)}</div>`).join('');
    const mine = !iWon && myDetail ? `<div class="sp-mine">${t('sp.yours')}: <b>${esc(myDetail)}</b></div>` : '';

    el.className = `spotlight show${iWon ? ' me' : ''}${split ? ' split' : ''}`;
    el.innerHTML = `
      <canvas class="sp-confetti"></canvas>
      <div class="sp-rays"></div>
      <div class="sp-box">
        <div class="sp-crown">${CROWN}</div>
        <div class="sp-avatars">${avatars}</div>
        <div class="sp-title">${esc(title)}</div>
        <div class="sp-hand">${esc(handName)}</div>
        ${cards ? `<div class="sp-cards">${cards}</div>` : ''}
        <div class="sp-pot"><span class="chip-icon"></span><span>+</span><b class="sp-count">0</b></div>
        ${why ? `<div class="sp-why">${esc(why)}</div>` : ''}
        ${mine}
        <div class="sp-tap">${t('sp.tap')}</div>
      </div>`;
    countUp(el.querySelector('.sp-count'), r.share, 1200);
    confetti(el.querySelector('.sp-confetti'), iWon ? 170 : 90);
    SFX.spotlight();
    setTimeout(() => (split ? SFX.split() : iWon ? SFX.win() : SFX.lose()), 650);
    clearTimeout(openSpotlight._t);
    openSpotlight._t = setTimeout(() => closeSpotlight(), 4600);
  }

  function closeSpotlight(instant) {
    const el = $('#spotlight');
    if (!el.classList.contains('show')) return;
    clearTimeout(openSpotlight._t);
    el.classList.add('out');
    setTimeout(() => { el.className = 'spotlight'; el.innerHTML = ''; }, instant ? 0 : 450);
  }
  $('#spotlight').addEventListener('click', () => closeSpotlight());

  function countUp(node, target, ms) {
    if (!node) return;
    const t0 = Date.now();
    const iv = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      node.textContent = fmt(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k >= 1) clearInterval(iv);
    }, 30);
  }

  function confetti(cv, count) {
    if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const g = cv.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = (cv.width = innerWidth * dpr);
    const H = (cv.height = innerHeight * dpr);
    const colors = ['#f5c451', '#fff0b0', '#e3283a', '#3ea0ff', '#7dffb0', '#ffffff'];
    const parts = Array.from({ length: count }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.2,
      y: H * 0.42,
      vx: (Math.random() - 0.5) * 22 * dpr,
      vy: (-Math.random() * 20 - 6) * dpr,
      s: (Math.random() * 6 + 4) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = Date.now();
    (function frame() {
      if (!cv.isConnected) return;
      const age = Date.now() - t0;
      g.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.55 * dpr;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        g.save();
        g.globalAlpha = Math.max(0, 1 - age / 3600);
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.fillStyle = p.c;
        g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        g.restore();
      }
      if (age < 3600) requestAnimationFrame(frame);
    })();
  }

  function renderGridStatus({ me, opp }) {
    const ph = S.phase;
    const nut = S.game === 'nut';
    const labels = {
      lobby: opp ? t('ph.lobbyReady') : t('ph.lobbyWait'),
      memorize: t('ph.memorize'),
      reveal: t('ph.reveal'),
      pick: nut ? t('ph.nutPick') : t('ph.pick'),
      bet: S.turn === S.me ? t('bet.yourTurn') : t('ip.turnOf', { name: S.players.find((p) => p.id === S.turn)?.name || '' }),
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
        S.betting ? t('bet.on') : '',
      ].filter(Boolean).join(' · '),
      bet: S.turn === S.me && S.toCall ? t('ip.toCall', { n: fmt(S.toCall) }) : t('bet.hint'),
      memorize: t('sub.memorize', { m: memSec }),
      reveal: t('sub.reveal'),
      pick: nut ? t('sub.nutPick') : t('sub.pick'),
      showdown: S.result ? outcomeReason() || t('sub.pot', { n: fmt(S.result.pot) }) : '',
      gameover: '',
    };
    $('#phaseLabel').textContent = labels[ph] || '';
    $('#phaseSub').textContent = subs[ph] || '';
    showBanner(() => {
      const mine = S.result.hands.find((h) => h.id === S.me);
      return mine?.dq ? t('badge.dq') : mine?.score ? I18N.hand(mine.score) : '';
    }, outcomeReason);
  }

  function renderActions({ me, opp }) {
    const bar = S.game === 'indian' ? $('#ipActions') : $('#actionBar');
    if (!me) return setHTML(bar, spectatorActions());
    const ph = S.phase;
    let html = '';
    if (me.pending && ph !== 'lobby' && ph !== 'gameover') {
      html = `<span class="hint">${t('hint.pending')}</span>`;
    } else if (me.out && ph !== 'lobby' && ph !== 'gameover') {
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
    } else if (ph === 'bet') {
      html = S.game === 'indian' ? ipBetActions(me) : betActions(me);
    } else if (ph === 'memorize') {
      html = me.memorized
        ? `<span class="hint dots">${t('hint.oppMemorizing')}</span>`
        : `<button class="btn blue big" data-act="memorized">${t('act.memorized')}</button>`;
    } else if (ph === 'reveal') {
      html = `<span class="hint">${t('hint.focus')}</span>`;
    } else if (ph === 'pick') {
      html = me.locked
        ? `<span class="hint dots">${t('hint.oppPicking')}</span>`
        : `<span class="hint">${t('hint.tapToPick')} <b>${me.pickCount}/2</b> <em class="dq-warn">${t('hint.dqWarn')}</em></span>
           <button class="btn gold big" data-act="lock" ${me.pickCount === 2 ? '' : 'disabled'}>${t('act.lock')}</button>`;
    } else if (ph === 'showdown') {
      const last = S.result?.final;
      html = me.next
        ? `<span class="hint dots">${t('hint.waitOpp')}</span>`
        : `<button class="btn blue" data-act="next">${last ? t('act.final') : t('act.nextRound')}</button>`;
    }
    setHTML(bar, html);
    if (S.game === 'indian' && ph === 'bet') ipRaiseLabel();
  }

  // Watching: take a seat when one opens (mid-game seats play from the next round).
  function spectatorActions() {
    const inGame = !['lobby', 'gameover'].includes(S.phase);
    const sit = S.canSit
      ? `<button class="btn gold big" data-act="sit">${inGame ? t('watch.sitNext') : t('watch.sit')}</button>`
      : `<span class="hint">${inGame && S.players.length < S.maxPlayers ? t('watch.tooLate', { n: S.lateJoinRound }) : t('watch.full')}</span>`;
    return `<div class="action-row"><span class="watch-tag">👀 ${t('watch.on')}</span>${sit}</div>`;
  }

  function betActions(me) {
    if (me.folded) return `<span class="hint">${t('ip.foldedWait')}</span>`;
    if (S.turn !== S.me) {
      const turnP = S.players.find((p) => p.id === S.turn);
      return `<span class="hint dots">${t('ip.waitTurn', { name: turnP?.name || '' })}</span>`;
    }
    const toCall = S.toCall || 0;
    const canRaise = S.raises < S.maxRaises && S.cap > S.currentBet && me.chips > toCall;
    const raiseBtn = (step) => {
      const target = Math.min(S.currentBet + step, S.cap);
      return `<button class="btn ip-raise" data-act="raise" data-amount="${step}" ${canRaise ? '' : 'disabled'}>${t('ip.raiseBtn', { n: step })}<small>${t('ip.toN', { n: fmt(target) })}</small></button>`;
    };
    return `<div class="ip-actions">
      <button class="btn ip-fold" data-act="fold">${t('ip.fold')}</button>
      ${toCall ? `<button class="btn blue" data-act="call">${t('ip.callBtn', { n: fmt(Math.min(toCall, me.chips)) })}</button>`
        : `<button class="btn blue" data-act="check">${t('ip.check')}</button>`}
      ${(S.raiseSteps || [50, 100]).map(raiseBtn).join('')}
      <button class="btn ip-allin" data-act="raise" data-amount="allin" ${canRaise ? '' : 'disabled'}>${t('ip.allin')}<small>${t('ip.toN', { n: fmt(S.cap) })}</small></button>
    </div>`;
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
    const ratingOf = (pid) => (S.final.ratings || []).find((r) => r.pid === pid);
    const rows = standings.map((s, i) => {
      const r = ratingOf(s.id);
      const pts = r ? `<span class="rp ${r.delta >= 0 ? 'up' : 'down'}">${r.delta >= 0 ? '+' : ''}${r.delta}</span>` : '';
      return `<div class="${i === 0 && !draw ? 'top' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(s.name)}${s.id === S.me ? t('meSuffix') : ''}${s.bot ? ` <small class="bot-tag">BOT·${t(`lvl.${s.bot}`)}</small>` : ''}</span>${pts}<span class="ch">${fmt(s.chips)}</span></div>`;
    }).join('');
    const myRating = ratingOf(S.me);
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
        ${myRating ? `<div class="go-rating ${myRating.delta >= 0 ? 'up' : 'down'}">${t('go.rating', { d: `${myRating.delta >= 0 ? '+' : ''}${myRating.delta}`, r: fmt(myRating.rating) })}</div>` : ''}
        <div class="standings">${rows}</div>
        <div class="result-actions">
          <button class="btn ghost" data-act="exit">${t('act.exit')}</button>
          ${!me ? (S.canSit ? `<button class="btn gold big" data-act="sit">${t('watch.sit')}</button>` : '')
            : `<button class="btn ${me.ready ? 'ghost' : 'gold'} big" data-act="ready">${me.ready ? t('act.unready') : t('act.rematch')}</button>`}
        </div>
        <div class="wait">${waiting}</div>
      </div>`);
    ov.classList.add('show');
  }

  function phaseEffects() {
    if (S.phase === 'bet') {
      if (S.turn === S.me && (P?.turn !== S.me || P?.phase !== 'bet')) SFX.select();
      // Chip sound whenever someone puts money in.
      if (P?.phase === 'bet' && P?.dealId === S.dealId && S.pot > P.pot) SFX.chips();
    }
    if (S.game === 'indian') {
      if (S.phase === 'bet' && P?.dealId !== S.dealId) { SFX.shuffle(); SFX.deal(); }
      if (S.phase === 'gameover' && P?.phase !== 'gameover' && S.final?.championId === S.me) SFX.fanfare();
      return;
    }
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
    renderRooms();
    renderOnline();
    renderInvite();
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
    const ring = S.game === 'indian' && document.querySelector('.iseat.turn .is-ring circle');
    if (ring) ring.style.strokeDashoffset = String(289 * (1 - left / total));
    timerBar.style.strokeDashoffset = String(CIRC * (1 - left / total));
    const urgent = (S.phase === 'memorize' || S.phase === 'pick' || (S.phase === 'bet' && S.turn === S.me)) && sec <= 5;
    timerEl.classList.toggle('urgent', urgent);
    if (urgent && sec > 0 && sec !== lastTick) SFX.tick();
    lastTick = sec;
  }
  requestAnimationFrame(tick);
})();
