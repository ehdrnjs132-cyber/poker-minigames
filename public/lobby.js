// Lobby home: a casino-lounge game list under the top bar (no walking
// characters). Each game is a table card: tap it to open the room settings,
// "?" for that game's how-to. Below, a live strip of open tables.
(() => {
  const { socket, esc } = window.HA;
  const t = (k, v) => I18N.t(k, v);
  const root = document.getElementById('lobbyHome');
  if (!root) return;

  const GAMES = ['memory', 'nut', 'indian', 'dual', 'bomb', 'liar'];
  // Mini table art per game: a little felt oval with the game's signature cards.
  const c = (rank, suit, red) => `<span class="lg-card${red ? ' red' : ''}">${rank}<i>${suit}</i></span>`;
  const back = (q = '') => `<span class="lg-card back">${q}</span>`;
  const ART = {
    memory: back() + c('A', '♥', 1) + back(),
    nut: c('K', '♠') + c('K', '♥', 1) + `<span class="lg-badge">NUT</span>`,
    indian: c('7', '♠') + back('?') + c('10', '♥', 1),
    dual: '<span class="lg-dual"><span class="lg-df">9</span><span class="lg-db">?</span></span><span class="lg-dual"><span class="lg-df">4</span><span class="lg-db">10</span></span><span class="lg-badge">×2</span>',
    bomb: `<span class="lg-bomb">${window.Icons ? Icons.svg('bomb', 'lg-ico') : '💣'}</span>`,
    liar: back('?') + back('?') + `<span class="lg-badge">LIAR</span>`,
  };

  let rooms = [];
  let online = 0;

  function render() {
    root.innerHTML = `
      <section class="lg-hero">
        <div class="lg-emblem" aria-hidden="true"><span>♠</span></div>
        <h1 class="lg-title">HOLDEM <em>ARCADE</em></h1>
        <p class="lg-sub">${esc(t('lobby.heroSub'))}</p>
        <div class="lg-stats"><span><i class="lg-dot"></i>${esc(t('lobby.online', { n: online || 1 }))}</span><span>${esc(t('lobby.live'))} ${rooms.length}</span></div>
      </section>
      <h2 class="lg-h"><span>${esc(t('games.title'))}</span></h2>
      <div class="lg-grid">
        ${GAMES.map((id) => `
          <article class="lg-game g-${id}" data-game="${id}" tabindex="0" role="button" aria-label="${esc(t(`game.${id}`))}">
            <div class="lg-table"><div class="lg-felt">${ART[id]}</div></div>
            <div class="lg-info">
              <b>${esc(t(`game.${id}`))}</b>
              <p>${esc(t(`game.${id}.desc`))}</p>
              <div class="lg-foot"><span class="lg-meta">${esc(t(`game.${id}.meta`))}</span><span class="lg-play">${esc(t('lobby.play'))}</span></div>
            </div>
            <button class="lg-help" data-help="${id}" aria-label="${esc(t('howto'))}">?</button>
          </article>`).join('')}
      </div>
      <h2 class="lg-h"><span>${esc(t('lobby.live'))}</span></h2>
      <div class="lg-live">
        ${rooms.length ? rooms.slice(0, 6).map((r) => `
          <button class="lg-room${r.joinable ? '' : ' watch'}" data-join="${esc(r.code)}">
            <span class="lg-room-game">${esc(t(`game.${r.gameId}`))}</span>
            <b>${esc(t('rooms.host', { name: r.host }))}</b>
            <span class="lg-room-meta">${r.players}/${r.max} · ${esc(r.joinable ? (r.playing ? t('rooms.lateJoin') : t('join.btn')) : t('rooms.watch'))}</span>
          </button>`).join('') : `<div class="lg-empty">${esc(t('lobby.liveNone'))}</div>`}
      </div>`;
  }

  root.addEventListener('click', (e) => {
    const help = e.target.closest('[data-help]');
    if (help) { e.stopPropagation(); window.SFX && SFX.click(); return window.Tutorial?.open?.(help.dataset.help); }
    const j = e.target.closest('[data-join]');
    if (j) { window.SFX && SFX.click(); return HA.join(j.dataset.join); }
    const g = e.target.closest('[data-game]');
    if (g) HA.createGame(g.dataset.game);
  });
  root.addEventListener('keydown', (e) => {
    const g = e.target.closest('[data-game]');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); HA.createGame(g.dataset.game); }
  });

  socket.on('rooms', (list) => { rooms = list || []; render(); });
  socket.on('online', (list) => { online = (list || []).length; render(); });
  I18N.onChange(render);
  render();
})();
