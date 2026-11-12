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
      toast('닉네임을 입력하세요');
      nameInput.focus();
      return null;
    }
    pref.set('name', n);
    return n;
  }

  document.querySelectorAll('[data-game]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.classList.contains('locked')) return toast('준비 중인 게임입니다');
      if (!getName()) return;
      SFX.click();
      openSetup(btn.dataset.game);
    })
  );

  // ---- create-room settings modal (last choice remembered per browser)
  const setupEl = $('#setup');
  let setupGame = null;
  let settings = { memorizeSec: 30, pickSec: 20 };
  try { Object.assign(settings, JSON.parse(pref.get('roomSettings')) || {}); } catch {}

  function renderSetup() {
    $('#memVal').textContent = settings.memorizeSec;
    $('#pickVal').textContent = settings.pickSec;
    setupEl.querySelectorAll('.seg').forEach((seg) =>
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === settings[seg.dataset.key])));
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
      settings[seg.dataset.key] = Number(b.dataset.v);
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
    if (code.length !== 4) return toast('4자리 방 코드를 입력하세요');
    SFX.click();
    socket.emit('join', { name, code }, onJoined);
  }
  $('#joinBtn').addEventListener('click', join);
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));

  function onJoined(res) {
    if (!res || !res.ok) return toast(res?.error || '입장에 실패했습니다');
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
        toast(res?.error || '방이 종료되었습니다');
      }
    });
  });
  socket.on('disconnect', () => S && $('#netState').classList.add('show'));
  socket.on('kicked', (msg) => {
    session.clear();
    showLobby();
    toast(msg);
  });
  socket.on('state', (st) => {
    offset = st.now - Date.now();
    P = S;
    S = st;
    showRoom();
    render();
  });

  // ------------------------------------------------------------- room controls
  $('#leaveBtn').addEventListener('click', () => {
    if (S && !['lobby', 'gameover'].includes(S.phase) && !confirm('게임 중에 나가면 게임이 종료됩니다. 나갈까요?')) return;
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
        ? '복사했지만 localhost 링크는 내 PC에서만 열립니다. 배포 주소나 내 IP 주소로 접속해서 초대하세요.'
        : '초대 링크를 복사했습니다', localOnly ? 5000 : 2400))
      .catch(() => toast(`방 코드: ${S.code}`));
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
    act(a);
  }

  function onGridClick(i) {
    if (!S || S.phase !== 'pick') return;
    const me = S.players.find((p) => p.id === S.me);
    if (!me || me.locked) return;
    if (!(me.picks || []).includes(i) && me.pickCount >= 2) return toast('이미 2장을 골랐어요. 선택한 카드를 눌러 취소하세요.');
    SFX.select();
    act('pick', { index: i });
  }

  // ------------------------------------------------------------- render
  function render() {
    const me = S.players.find((p) => p.id === S.me);
    const opp = S.players.find((p) => p.id !== S.me);
    const inResult = S.phase === 'showdown' || S.phase === 'gameover';
    const hlCards = new Set();
    if (inResult && S.result) {
      for (const h of S.result.hands) if (S.result.winners.includes(h.id)) h.best.forEach((c) => hlCards.add(c));
    }
    const ctx = { me, opp, inResult, hlCards };

    $('#roomCode').textContent = S.code;
    $('#roundInfo').textContent = S.round ? `${S.round}/${S.maxRounds}` : '-';
    $('#anteInfo').textContent = S.ante ? fmt(S.ante) : '-';
    $('#potInfo').textContent = fmt(inResult && S.result ? S.result.pot : S.pot);

    renderSeat($('#seatOpp'), opp, false, ctx);
    renderSeat($('#seatMe'), me, true, ctx);
    renderGrid(ctx);
    renderBoard(ctx);
    renderStatus(ctx);
    renderActions(ctx);
    renderOverlay(ctx);
    phaseEffects(ctx);

    if (S.notice && S.notice !== P?.notice) toast(S.notice, 3500);
  }

  function renderSeat(el, p, isMe, { inResult, hlCards }) {
    if (!p) {
      el.className = `seat ${isMe ? 'me' : 'opp'} empty`;
      setHTML(el, `<span class="dots">상대를 기다리는 중</span>`);
      return;
    }
    const ph = S.phase;
    const hand = inResult && S.result ? S.result.hands.find((h) => h.id === p.id) : null;
    const isWinner = hand && S.result.winners.includes(p.id);
    el.className = `seat ${isMe ? 'me' : 'opp'}${isWinner ? ' winner' : ''}`;

    let badge = '';
    if (!p.connected) badge = '<span class="badge warn">연결 끊김</span>';
    else if (ph === 'lobby' || ph === 'gameover') badge = p.ready ? '<span class="badge ok">준비 완료</span>' : '<span class="badge">대기 중</span>';
    else if (ph === 'memorize') badge = p.memorized ? '<span class="badge ok">기억 완료</span>' : '<span class="badge">기억 중…</span>';
    else if (ph === 'pick') badge = p.locked ? '<span class="badge ok">선택 확정</span>' : `<span class="badge">선택 중 ${p.pickCount}/2</span>`;
    else if (hand) badge = `<span class="badge hand">${esc(hand.desc)}</span>`;

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
      <div class="avatar${p.connected ? '' : ' off'}" style="background:${colorFor(p.id)}">${esc(p.name[0] || '?')}</div>
      <div class="who">
        <div class="name">${esc(p.name)}${isMe ? '<em>나</em>' : ''}</div>
        <div class="chips"><span class="chip-icon"></span>${fmt(p.chips)} ${delta}</div>
        ${badge}
      </div>
      <div class="hole">${hole}</div>`);
  }

  function renderGrid({ me, opp, inResult, hlCards }) {
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
        c.addEventListener('click', () => onGridClick(i));
        g.appendChild(c);
      }
    }

    const ph = S.phase;
    const myPicks = me?.picks || [];
    const oppPicks = inResult ? opp?.picks || [] : [];
    const picked = new Set([...myPicks, ...oppPicks]);

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
      const theirs = oppPicks.includes(i);
      el.classList.toggle('mine', mine);
      el.classList.toggle('opp', theirs);
      el.classList.toggle('pickable', ph === 'pick' && !me?.locked);
      el.classList.toggle('dim', inResult && !picked.has(i));
      el.classList.toggle('hl', inResult && picked.has(i) && hlCards.has(info?.card));
      setHTML(el.querySelector('.tag'),
        (mine ? '<span class="t-me">나</span>' : '') + (theirs ? `<span class="t-opp">${esc(opp.name.slice(0, 4))}</span>` : ''));
    });
  }

  function renderBoard({ inResult, hlCards }) {
    const b = $('#board');
    const key = S.board.length ? S.dealId : null;
    if (key !== boardKey) {
      boardKey = key;
      b.innerHTML = '';
      if (S.board.length) {
        const animate = S.phase === 'reveal' || P?.phase === 'reveal' || P?.phase === 'memorize';
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
    const labels = {
      lobby: opp ? '준비하면 시작합니다' : '상대를 기다리는 중',
      memorize: '카드를 기억하세요!',
      reveal: '카드가 뒤집힙니다',
      pick: '카드 2장을 고르세요',
      showdown: '쇼다운',
      gameover: '게임 종료',
    };
    const memSec = Math.round(S.durations.memorize / 1000);
    const pickSec = Math.round(S.durations.pick / 1000);
    const subs = {
      lobby: `${opp ? '두 명 모두 준비하면 시작' : `방 코드 ${S.code} 를 친구에게 알려주세요`} · 기억 ${memSec}초 / 선택 ${pickSec}초`,
      memorize: `${memSec}초 뒤 카드가 뒤집힙니다. 위치를 외우세요!`,
      reveal: '공유 카드 5장이 깔립니다',
      pick: '위치를 떠올려 고르세요 · 상대와 같은 카드도 가능',
      showdown: S.result ? `팟 ${fmt(S.result.pot)}` : '',
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
      banner.innerHTML = `${title}<small>${esc(myHand?.desc || '')}</small>`;
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
    if (ph === 'lobby') {
      html = `<button class="btn ghost" data-tutorial>게임 방법</button>
        ${!opp ? '<button class="btn ghost" data-act="invite">초대 링크 복사</button>' : ''}
        <button class="btn ${me.ready ? 'ghost' : 'gold'} big" data-act="ready">${me.ready ? '준비 취소' : '준비'}</button>`;
    } else if (ph === 'memorize') {
      html = me.memorized
        ? '<span class="hint dots">상대가 외우는 중</span>'
        : '<button class="btn blue big" data-act="memorized">다 외웠어요</button>';
    } else if (ph === 'reveal') {
      html = '<span class="hint">집중하세요…</span>';
    } else if (ph === 'pick') {
      html = me.locked
        ? '<span class="hint dots">상대의 선택을 기다리는 중</span>'
        : `<span class="hint">카드를 눌러 선택 <b>${me.pickCount}/2</b></span>
           <button class="btn gold big" data-act="lock" ${me.pickCount === 2 ? '' : 'disabled'}>선택 확정</button>`;
    } else if (ph === 'showdown') {
      const last = S.result?.final;
      html = me.next
        ? '<span class="hint dots">상대를 기다리는 중</span>'
        : `<button class="btn blue" data-act="next">${last ? '최종 결과 보기' : '다음 라운드'}</button>`;
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
    const title = draw ? '무승부' : won ? '최종 승리!' : '패배';
    const reasonText = reason === 'bust' ? '상대의 칩이 모두 소진되었습니다' : `${S.maxRounds}라운드 종료 · 칩이 많은 쪽이 승리`;
    const rows = standings.map((s, i) =>
      `<div class="${i === 0 && !draw ? 'top' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(s.name)}${s.id === S.me ? ' (나)' : ''}</span><span class="ch">${fmt(s.chips)}</span></div>`).join('');
    const waiting = me?.ready ? (opp ? (opp.ready ? '' : '상대의 준비를 기다리는 중…') : '상대가 나갔습니다') : (opp?.ready ? '상대가 재대결을 원합니다!' : '');
    setHTML(ov, `
      <div class="result-card">
        <div class="trophy">${draw ? '🤝' : won ? '🏆' : '🃏'}</div>
        <h2 class="${won || draw ? '' : 'lose'}">${title}</h2>
        <p class="reason">${reasonText}</p>
        <div class="standings">${rows}</div>
        <div class="result-actions">
          <button class="btn ghost" data-act="exit">나가기</button>
          <button class="btn ${me?.ready ? 'ghost' : 'gold'} big" data-act="ready">${me?.ready ? '준비 취소' : '다시 하기'}</button>
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
      case 'showdown':
        SFX.flip(0.15); SFX.flip(0.25);
        SFX.flipWave(16, 0.035, 0.9);
        break;
      case 'gameover':
        if (S.final?.championId === S.me) SFX.fanfare();
        break;
    }
  }

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
