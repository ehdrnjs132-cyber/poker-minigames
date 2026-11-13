// Ranking page and My Page (profile picture, nickname, per-game records).
(() => {
  const $ = (s) => document.querySelector(s);
  const { socket, toast, esc, fmt, setHTML } = window.HA;
  const GAMES = ['memory', 'nut', 'indian'];
  const MEDALS = ['🥇', '🥈', '🥉'];
  let rankGame = 'memory';
  let rankData = null;
  let meData = null;

  const avatar = (u) => `<div class="avatar">${window.HA.avatarInner({ ...u, uid: u.id })}</div>`;
  const winRate = (w, g) => (g ? Math.round((w / g) * 100) : 0);
  const bestText = (game, s) =>
    game === 'indian' ? (s.bestCard ? t('rank.bestCard', { n: s.bestCard }) : '—') : s.bestScore ? I18N.hand(s.bestScore) : '—';

  function open(panel) {
    panel.classList.add('show');
    window.SFX && SFX.click();
  }
  function close(panel) {
    panel.classList.remove('show');
  }
  document.querySelectorAll('.sheet-overlay').forEach((p) => {
    p.addEventListener('click', (e) => (e.target === p || e.target.closest('[data-close]')) && close(p));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.sheet-overlay.show').forEach(close);
  });

  // ---------------------------------------------------------------- ranking
  function loadRanking() {
    document.querySelectorAll('#rankTabs button').forEach((b) => b.classList.toggle('on', b.dataset.g === rankGame));
    setHTML($('#rankList'), '<div class="rank-empty dots"></div>');
    socket.emit('ranking', rankGame, (res) => {
      rankData = res?.ok ? res : { rows: [] };
      renderRanking();
    });
  }

  function rankRow(r, mine) {
    const medal = r.rank <= 3 ? `<span class="medal">${MEDALS[r.rank - 1]}</span>` : `<span class="rk">${r.rank}</span>`;
    return `<div class="rank-row${mine ? ' mine' : ''}${r.rank <= 3 ? ` top${r.rank}` : ''}">
      ${medal}${avatar(r)}
      <div class="rank-who"><b>${esc(r.name)}${mine ? ` <em>${t('me')}</em>` : ''}</b>
        <span>${t('rank.record', { g: r.games, w: r.wins, p: winRate(r.wins, r.games) })} · ${esc(bestText(rankGame, r))}</span></div>
      <div class="rank-pts">${fmt(r.rating)}<small>${t('rank.ptsUnit')}</small></div>
    </div>`;
  }

  function renderRanking() {
    if (!rankData) return;
    const myId = window.HA.profile()?.id;
    const { rows, me } = rankData;
    setHTML($('#rankList'), rows.length ? rows.map((r) => rankRow(r, r.id === myId)).join('') : `<div class="rank-empty">${t('rank.empty')}</div>`);
    const pinned = me && !rows.some((r) => r.id === me.id);
    setHTML($('#rankMe'), me ? (pinned ? rankRow(me, true) : '') : `<div class="rank-unranked">${t('rank.unranked')}</div>`);
  }

  $('#rankBtn').addEventListener('click', () => { open($('#rankPanel')); loadRanking(); });
  $('#rankTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    rankGame = b.dataset.g;
    window.SFX && SFX.click();
    loadRanking();
  });

  // ---------------------------------------------------------------- my page
  function loadMe() {
    socket.emit('me', null, (res) => {
      if (!res?.ok) return;
      meData = res;
      window.HA.setProfile(res.user);
      renderMe();
    });
  }

  function renderMe() {
    const me = window.HA.profile();
    if (!me) return;
    $('#meAvatar').innerHTML = window.HA.avatarInner({ ...me, uid: me.id });
    if (document.activeElement !== $('#meName')) $('#meName').value = me.name;
    setHTML($('#avatarGrid'), Stickers.avatarIds.map((id) =>
      `<button class="avatar pick${me.avatar === id ? ' on' : ''}" data-av="${id}" aria-label="${id}">${Stickers.avatar(id)}</button>`).join(''));
    if (!meData) return;
    setHTML($('#statCards'), GAMES.map((g) => {
      const s = meData.games[g];
      const hist = s.history.length
        ? s.history.map((h) => `<span class="hdot ${h.place === 1 ? 'win' : h.delta >= 0 ? 'ok' : 'lose'}" title="${t('me.place', { n: h.place })} (${h.delta >= 0 ? '+' : ''}${h.delta})">${h.place}</span>`).join('')
        : `<span class="none">${t('me.none')}</span>`;
      return `<div class="stat-card g-${g}">
        <div class="sc-head"><b>${t(`game.${g}`)}</b><span class="sc-rank">${s.rank ? `#${s.rank}<small>/${s.ranked}</small>` : t('rank.unranked')}</span></div>
        <div class="sc-pts">${fmt(s.rating)}<small>${t('rank.ptsUnit')}</small></div>
        <div class="sc-grid">
          <span><em>${t('me.games')}</em>${s.games}</span>
          <span><em>${t('me.wins')}</em>${s.wins}</span>
          <span><em>${t('me.winrate')}</em>${winRate(s.wins, s.games)}%</span>
          <span><em>${t('me.rounds')}</em>${s.roundsWon}/${s.rounds}</span>
          <span><em>${t('me.chips')}</em>${fmt(s.chipsWon)}</span>
          <span><em>${t('me.best')}</em>${esc(bestText(g, s))}</span>
        </div>
        <div class="sc-hist"><em>${t('me.recent')}</em><div>${hist}</div></div>
      </div>`;
    }).join(''));
  }

  function update(patch) {
    socket.emit('profile:update', patch, (res) => {
      if (!res?.ok) return toast(I18N.msg(res) || t('srv.badImage'));
      window.HA.setProfile(res.user);
      renderMe();
      toast(t('me.saved'));
    });
  }

  $('#meBtn').addEventListener('click', () => { open($('#mePanel')); renderMe(); loadMe(); });
  $('#avatarGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-av]');
    if (b) update({ avatar: b.dataset.av });
  });
  $('#meSave').addEventListener('click', () => {
    const name = $('#meName').value.trim().slice(0, 12);
    if (!name) return toast(t('err.nick'));
    try { localStorage.setItem('name', name); } catch {}
    const lobbyName = $('#nameInput');
    if (lobbyName) lobbyName.value = name;
    update({ name });
  });

  // Photo upload: centre-crop to a small square JPEG in the browser before sending.
  $('#avatarFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const size = 160;
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const side = Math.min(img.width, img.height);
      cv.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      let data = cv.toDataURL('image/jpeg', 0.86);
      if (data.length > 88000) data = cv.toDataURL('image/jpeg', 0.6);
      update({ image: data });
    } catch {
      toast(t('srv.badImage'));
    }
  });

  // Transfer code = id.token. Paste it on another device to continue as the same profile.
  const myCode = () => { const c = window.HA.credentials(); return `${c.uid}.${c.token}`; };
  $('#showCode').addEventListener('click', () => { $('#myCode').value = myCode(); });
  $('#copyCode').addEventListener('click', () => {
    (navigator.clipboard?.writeText(myCode()) || Promise.reject()).then(() => toast(t('me.copied'))).catch(() => { $('#myCode').value = myCode(); });
  });
  $('#importBtn').addEventListener('click', () => {
    const m = $('#importCode').value.trim().match(/^([a-f0-9]{12})\.([A-Za-z0-9_-]{10,})$/);
    if (!m) return toast(t('me.badCode'));
    socket.emit('hello', { uid: m[1], token: m[2], noCreate: true }, (res) => {
      if (!res?.ok) return toast(t('me.badCode'));
      window.HA.useCredentials(res.uid, res.token);
      window.HA.setProfile(res.user);
      $('#importCode').value = '';
      toast(t('me.imported'));
      loadMe();
    });
  });

  I18N.onChange(() => {
    if ($('#rankPanel').classList.contains('show')) renderRanking();
    if ($('#mePanel').classList.contains('show')) renderMe();
  });
})();
