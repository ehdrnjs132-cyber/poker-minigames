// In-room chat: side panel, sticker tray, and speech bubbles over seats.
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
  });
  input.addEventListener('keydown', (e) => e.stopPropagation());

  function setOpen(open) {
    panel.classList.toggle('open', open);
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
    const me = window.HA.me();
    const mine = m.playerId === me;
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
    if (nearBottom || m.playerId === window.HA.me()) list.scrollTop = list.scrollHeight;
    if (!live || m.kind === 'system') return;
    showBubble(m);
    if (m.playerId !== window.HA.me()) {
      window.SFX && SFX.pop();
      if (!panel.classList.contains('open')) {
        unread++;
        renderBadge();
      }
    }
  }

  // Speech bubble that pops from the sender's seat.
  function showBubble(m) {
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

  socket.on('chatHistory', (msgs) => {
    list.innerHTML = '';
    history = [];
    (msgs || []).forEach((m) => append(m, { live: false }));
    list.scrollTop = list.scrollHeight;
  });
  socket.on('chat', (m) => append(m));
  socket.on('chatError', (msg) => window.HA.toast(I18N.msg(msg)));

  I18N.onChange(() => {
    renderTray();
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
