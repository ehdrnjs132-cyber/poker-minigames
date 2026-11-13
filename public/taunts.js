// Taunts / bluff gestures in game rooms: a 😏 button opens a tray of gestures.
// Self gestures play on your own seat; aimed ones (tomato, tongue, point) ask
// you to tap a target seat first. Everyone in the room sees the animation.
(() => {
  const { socket, esc } = window.HA;
  const t = (k, v) => I18N.t(k, v);
  const $ = (s) => document.querySelector(s);

  const TAUNTS = [
    { id: 'smirk', icon: '😏', ko: '비웃기', en: 'Smirk', say: { ko: '흥~ 그 정도야?', en: 'Heh. That all?' } },
    { id: 'yawn', icon: '🥱', ko: '하품', en: 'Yawn', say: { ko: '하암~ 너무 쉽네', en: 'Yaaawn… too easy' } },
    { id: 'shades', icon: '😎', ko: '선글라스', en: 'Shades', say: { ko: '내 카드? 안 봐도 알지', en: "Don't need to look" } },
    { id: 'sweat', icon: '😰', ko: '식은땀', en: 'Nervous', say: { ko: '어… 어떡하지…?', en: 'Uh… oh no…?' } },
    { id: 'fire', icon: '🔥', ko: '자신감', en: 'On fire', say: { ko: '오늘 운 좋다!', en: "I'm on fire!" } },
    { id: 'chips', icon: '💰', ko: '칩 만지작', en: 'Chip riffle', say: { ko: '올인 해볼까~?', en: 'Maybe all in~?' } },
    { id: 'tomato', icon: '🍅', ko: '토마토', en: 'Tomato', aimed: true, say: { ko: '받아라!', en: 'Catch!' } },
    { id: 'tongue', icon: '😜', ko: '메롱', en: 'Tongue', aimed: true, say: { ko: '{name} 메롱~', en: 'Nyah, {name}~' } },
    { id: 'point', icon: '👉', ko: '손가락질', en: 'Point', aimed: true, say: { ko: '{name}, 떨고 있지?', en: '{name}, scared?' } },
  ];
  const byId = Object.fromEntries(TAUNTS.map((x) => [x.id, x]));
  const L = (o) => (I18N.lang === 'ko' ? o.ko : o.en);

  // ---------------------------------------------------------------- UI
  const fab = document.createElement('button');
  fab.id = 'tauntFab';
  fab.className = 'taunt-fab';
  fab.innerHTML = '<span>😏</span>';
  const tray = document.createElement('div');
  tray.id = 'tauntTray';
  tray.className = 'taunt-tray';
  document.body.append(fab, tray);

  function renderTray() {
    fab.setAttribute('aria-label', t('taunt.title'));
    fab.title = t('taunt.title');
    tray.innerHTML = `<div class="tt-head">${t('taunt.title')}</div>
      <div class="tt-grid">${TAUNTS.map((x) => `<button data-taunt="${x.id}" class="${x.aimed ? 'aimed' : ''}"><i>${x.icon}</i><span>${esc(L(x))}</span></button>`).join('')}</div>
      <div class="tt-note">${t('taunt.note')}</div>`;
  }
  renderTray();
  I18N.onChange(renderTray);

  const inRoom = () => $('#room').classList.contains('active');
  const amSeated = () => {
    const S = window.currentState?.();
    return !!S && !S.spectator;
  };
  let aiming = null;
  function setOpen(open) {
    tray.classList.toggle('open', open);
    if (!open) stopAim();
  }
  function stopAim() {
    aiming = null;
    document.body.classList.remove('taunt-aim');
  }
  fab.addEventListener('click', () => {
    window.SFX && SFX.click();
    if (aiming) return stopAim();
    setOpen(!tray.classList.contains('open'));
  });
  tray.addEventListener('click', (e) => {
    const b = e.target.closest('[data-taunt]');
    if (!b) return;
    const x = byId[b.dataset.taunt];
    window.SFX && SFX.click();
    if (x.aimed) {
      aiming = x.id;
      tray.classList.remove('open');
      document.body.classList.add('taunt-aim');
      window.HA.toast(t('taunt.pick'), 2200);
      return;
    }
    socket.emit('taunt', { kind: x.id });
    setOpen(false);
  });
  // Aiming: tap an opponent's seat.
  document.addEventListener('click', (e) => {
    if (!aiming) return;
    const seat = e.target.closest('.iseat[data-id], .seat[data-id]');
    if (!seat || seat.classList.contains('me') || seat.id === 'seatMe' || seat.dataset.id === 'empty' || seat.dataset.id.startsWith('empty')) return;
    e.stopPropagation();
    socket.emit('taunt', { kind: aiming, target: seat.dataset.id });
    stopAim();
  }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  // Show the button only while seated in a room.
  setInterval(() => {
    const show = inRoom() && amSeated();
    fab.classList.toggle('show', show);
    if (!show) setOpen(false);
  }, 400);

  // ---------------------------------------------------------------- effects
  function seatOf(id) {
    return document.querySelector(`.iseat[data-id="${id}"], .seat[data-id="${id}"]`);
  }
  function avatarRect(id) {
    const seat = seatOf(id);
    if (!seat) return null;
    const av = seat.querySelector('.is-avatar, .avatar') || seat;
    return av.getBoundingClientRect();
  }
  function nameOf(id) {
    const S = window.currentState?.();
    return S?.players.find((p) => p.id === id)?.name || '';
  }
  function fx(cls, html, r, life = 2600) {
    const el = document.createElement('div');
    el.className = `taunt-fx ${cls}`;
    el.innerHTML = html;
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top + r.height / 2}px`;
    el.style.setProperty('--s', `${Math.max(40, r.width)}px`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), life);
    return el;
  }
  function say(r, text) {
    const b = fx('taunt-say', esc(text), r, 2600);
    b.style.top = `${r.top - 10}px`;
  }

  socket.on('taunt', ({ from, kind, target }) => {
    if (!inRoom()) return;
    const x = byId[kind];
    const r = avatarRect(from);
    if (!x || !r) return;
    const line = L(x.say).replace('{name}', nameOf(target));
    const sfx = window.SFX || {};
    switch (kind) {
      case 'tomato': {
        const tr = avatarRect(target);
        if (!tr) break;
        const p = fx('taunt-throw', '🍅', r, 1400);
        p.getBoundingClientRect();
        const dx = tr.left + tr.width / 2 - (r.left + r.width / 2);
        const dy = tr.top + tr.height / 2 - (r.top + r.height / 2);
        p.style.setProperty('--dx', `${dx}px`);
        p.style.setProperty('--dy', `${dy}px`);
        p.classList.add('go');
        sfx.swoosh?.();
        setTimeout(() => {
          fx('taunt-splat', '<i class="splat-blob"></i><b>🍅</b>', tr, 2600);
          sfx.lose?.();
          const seat = seatOf(target);
          seat?.classList.add('taunt-hit');
          setTimeout(() => seat?.classList.remove('taunt-hit'), 600);
        }, 620);
        break;
      }
      case 'point': {
        const tr = avatarRect(target);
        const el = fx('taunt-point', '👉', r, 2400);
        if (tr) {
          const ang = Math.atan2(tr.top - r.top, tr.left - r.left) * 180 / Math.PI;
          el.style.setProperty('--a', `${ang}deg`);
        }
        sfx.pop?.();
        break;
      }
      case 'shades':
        fx('taunt-shades', '🕶️', r, 3200);
        sfx.swoosh?.();
        break;
      case 'sweat':
        fx('taunt-sweat', '<b>💦</b><b>💧</b><b>💦</b>', r, 2600);
        sfx.pop?.();
        break;
      case 'fire':
        fx('taunt-fire', '<b>🔥</b><b>🔥</b><b>🔥</b>', r, 2600);
        sfx.spotlight?.();
        break;
      case 'chips':
        fx('taunt-chips', '<i></i><i></i><i></i><i></i>', r, 2400);
        sfx.chips?.();
        break;
      default:
        fx(`taunt-pop taunt-${kind}`, x.icon, r, 2400);
        sfx.pop?.();
    }
    say(r, line);
  });
})();
