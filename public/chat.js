// Chat: one panel for the lobby (lobby channel) and for rooms (room channel).
// Enter opens it from anywhere; messages also pop as bubbles over seats
// (in a room) or over plaza characters (in the lobby).
const Chat = (() => {
  const $ = (s) => document.querySelector(s);
  const socket = window.HA.socket;
  const panel = $('#chatPanel');
  const list = $('#chatList');
  const tray = $('#stickerTray');
  const input = $('#chatInput');
  const badge = $('#chatBadge');
  let unread = 0;
  let history = [];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Sticker tray
  const renderTray = () => (tray.innerHTML = Stickers.list.map((s) => `<button type="button" data-sticker="${s.id}" title="${Stickers.label(s.id)}">${Stickers.svg(s.id, 64)}</button>`).join(''));
  renderTray();
  tray.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sticker]');
    if (!b) return;
    socket.emit('chat', { kind: 'sticker', sticker: b.dataset.sticker });
    tray.classList.remove('open');
    $('#stickerBtn').classList.remove('on');
  });
  $('#stickerBtn').addEventListener('click', () => {
    const on = tray.classList.toggle('open');
    $('#stickerBtn').classList.toggle('on', on);
  });

  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat', { kind: 'text', text });
    input.value = '';
    // Sent with Enter on a keyboard: hand the keys back to the game / plaza.
    if (matchMedia('(pointer: fine)').matches) input.blur();
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { input.blur(); setOpen(false); }
    // Enter on an empty box just leaves the chat input.
    if (e.key === 'Enter' && !input.value.trim()) { e.preventDefault(); input.blur(); }
  });

  // Enter anywhere (not while typing elsewhere or in a dialog) jumps into chat.
  addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.repeat) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (document.querySelector('.overlay.show:not(#overlay)')) return;
    e.preventDefault();
    setOpen(true);
    input.focus();
  });

  const inLobby = () => document.getElementById('lobby').classList.contains('active');
  const isMine = (m) => (m.sid ? m.sid === socket.id : m.playerId === window.HA.me());
  function renderTitle() {
    document.getElementById('chatTitle').textContent = inLobby() ? I18N.t('chat.lobbyTitle') : I18N.t('chat.title');
  }

  function setOpen(open) {
    panel.classList.toggle('open', open);
    renderTitle();
    document.body.classList.toggle('chat-open', open);
    if (open) {
      unread = 0;
      renderBadge();
      list.scrollTop = list.scrollHeight;
      if (matchMedia('(pointer: fine)').matches) input.focus();
    } else {
      tray.classList.remove('open');
      $('#stickerBtn').classList.remove('on');
    }
  }
  $('#chatFab').addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  $('#chatClose').addEventListener('click', () => setOpen(false));

  function renderBadge() {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.classList.toggle('show', unread > 0);
  }

  function itemHTML(m) {
    if (m.kind === 'system') return `<div class="msg system">${esc(I18N.msg(m))}</div>`;
    const mine = isMine(m);
    const time = new Date(m.at).toLocaleTimeString(I18N.lang === 'ko' ? 'ko-KR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    const body = m.kind === 'sticker'
      ? `<div class="bubble sticker-msg">${Stickers.svg(m.sticker, 92)}</div>`
      : `<div class="bubble">${esc(m.text)}</div>`;
    return `<div class="msg ${mine ? 'mine' : 'theirs'}">
      ${mine ? '' : `<span class="who-name">${esc(m.name)}</span>`}
      <div class="row">${body}<time>${time}</time></div></div>`;
  }

  function append(m, { live = true } = {}) {
    if (m.kind === 'sticker' && !Stickers.has(m.sticker)) return;
    history.push(m);
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.insertAdjacentHTML('beforeend', itemHTML(m));
    if (nearBottom || isMine(m)) list.scrollTop = list.scrollHeight;
    if (!live || m.kind === 'system') return;
    showBubble(m);
    if (!isMine(m)) {
      window.SFX && SFX.pop();
      if (!panel.classList.contains('open')) {
        unread++;
        renderBadge();
      }
    }
  }

  // Speech bubble that pops from the sender's seat.
  function showBubble(m) {
    if (m.sid) return plazaBubble(m);
    const seat = document.querySelector(`.seat[data-id="${m.playerId}"]`);
    if (!seat || !document.getElementById('room').classList.contains('active')) return;
    const r = seat.getBoundingClientRect();
    const b = document.createElement('div');
    const top = seat.id !== 'seatMe';
    // One bubble per seat: a new message replaces the previous one.
    document.querySelectorAll(`.seat-bubble[data-seat="${m.playerId}"]`).forEach((old) => old.remove());
    b.dataset.seat = m.playerId;
    b.className = `seat-bubble ${top ? 'below' : 'above'}${m.kind === 'sticker' ? ' is-sticker' : ''}`;
    b.innerHTML = m.kind === 'sticker' ? Stickers.svg(m.sticker, 88) : esc(m.text);
    b.style.left = `${Math.max(12, r.left + 70)}px`;
    if (top) b.style.top = `${r.bottom - 6}px`;
    else b.style.bottom = `${innerHeight - r.top - 6}px`;
    document.body.appendChild(b);
    setTimeout(() => b.classList.add('out'), 3200);
    setTimeout(() => b.remove(), 3600);
  }

  // Lobby: the bubble rides along on the sender's plaza character.
  function plazaBubble(m) {
    if (!inLobby()) return;
    const pc = document.querySelector(`.pc[data-sid="${m.sid}"]`);
    if (!pc) return;
    pc.querySelectorAll('.pc-bubble').forEach((old) => old.remove());
    const b = document.createElement('div');
    b.className = `pc-bubble${m.kind === 'sticker' ? ' is-sticker' : ''}`;
    b.innerHTML = m.kind === 'sticker' ? Stickers.svg(m.sticker, 64) : esc(m.text);
    pc.appendChild(b);
    setTimeout(() => b.classList.add('out'), 3800);
    setTimeout(() => b.remove(), 4200);
  }

  socket.on('chatHistory', (msgs) => {
    renderTitle();
    list.innerHTML = '';
    history = [];
    (msgs || []).forEach((m) => append(m, { live: false }));
    list.scrollTop = list.scrollHeight;
  });
  socket.on('chat', (m) => append(m));
  socket.on('chatError', (msg) => window.HA.toast(I18N.msg(msg)));

  I18N.onChange(() => {
    renderTray();
    renderTitle();
    list.innerHTML = history.map(itemHTML).join('');
    list.scrollTop = list.scrollHeight;
  });

  function reset() {
    setOpen(false);
    list.innerHTML = '';
    history = [];
    unread = 0;
    renderBadge();
    document.querySelectorAll('.seat-bubble').forEach((b) => b.remove());
  }

  return { reset, open: () => setOpen(true) };
})();

window.Chat = Chat;
