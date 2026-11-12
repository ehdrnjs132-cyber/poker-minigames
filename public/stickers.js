// Original "mochi cat" sticker set drawn as inline SVG (no image files).
// Soft white cat with pink ears/blush + handwritten Korean captions.
const Stickers = (() => {
  const INK = '#4a3b3b';
  const PINK = '#ffb3c1';
  const MOUTH = '#d95c6c';
  const L = 46, R = 74, Y = 66;

  const heart = (x, y, s = 1, c = '#ff6b81') =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M0 3C0-1 5-2 6 2 7-2 12-1 12 3 12 7 6 10 6 11 6 10 0 7 0 3Z" fill="${c}" stroke="none"/>`;
  const spark = (x, y, s = 1, c = '#ffd34d') =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M0-6Q1-1 6 0 1 1 0 6-1 1-6 0-1-1 0-6Z" fill="${c}" stroke="none"/>`;
  const drop = (x, y, s = 1, c = '#8fd3ff') =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0Q-4 6 0 9 4 6 0 0Z" fill="${c}" stroke="none"/>`;
  const txt = (x, y, t, size = 18, c = INK, rot = 0) =>
    `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="Gaegu, Jua, 'Noto Sans KR', sans-serif" font-weight="700" font-size="${size}" fill="${c}" stroke="none" text-anchor="middle">${t}</text>`;

  function eyes(type, ink) {
    const both = (fn) => fn(L, 1) + fn(R, -1);
    switch (type) {
      case 'happy': return both((x) => `<path d="M${x - 5} ${Y + 1}Q${x} ${Y - 5} ${x + 5} ${Y + 1}" fill="none"/>`);
      case 'sleep': return both((x) => `<path d="M${x - 5} ${Y - 1}Q${x} ${Y + 4} ${x + 5} ${Y - 1}" fill="none"/>`);
      case 'flat': return both((x) => `<path d="M${x - 5} ${Y}L${x + 5} ${Y}" fill="none"/>`);
      case 'big': return both((x) => `<circle cx="${x}" cy="${Y}" r="6" fill="${ink}" stroke="none"/><circle cx="${x - 2}" cy="${Y - 2.2}" r="2.3" fill="#fff" stroke="none"/><circle cx="${x + 2.2}" cy="${Y + 2}" r="1" fill="#fff" stroke="none"/>`);
      case 'angry': return both((x, d) => `<ellipse cx="${x}" cy="${Y + 1}" rx="3.2" ry="3.6" fill="${ink}" stroke="none"/><path d="M${x - 6 * d} ${Y - 9}L${x + 5 * d} ${Y - 5}" fill="none"/>`);
      case 'squint': return both((x, d) => `<path d="M${x - 4 * d} ${Y - 4}L${x + 4 * d} ${Y}L${x - 4 * d} ${Y + 4}" fill="none"/>`);
      case 'shock': return both((x) => `<circle cx="${x}" cy="${Y}" r="5.5" fill="#fff"/><circle cx="${x}" cy="${Y}" r="1.8" fill="${ink}" stroke="none"/>`);
      case 'heart': return heart(L - 6, Y - 6, 1) + heart(R - 6, Y - 6, 1);
      case 'side': return both((x) => `<ellipse cx="${x - 3}" cy="${Y}" rx="3" ry="3.6" fill="${ink}" stroke="none"/>`);
      default: return both((x) => `<ellipse cx="${x}" cy="${Y}" rx="3.2" ry="3.8" fill="${ink}" stroke="none"/>`);
    }
  }

  function mouth(type) {
    switch (type) {
      case 'open': return `<path d="M53 73Q60 85 67 73Z" fill="${MOUTH}"/>`;
      case 'o': return `<ellipse cx="60" cy="77" rx="3.2" ry="3.8" fill="${MOUTH}"/>`;
      case 'frown': return `<path d="M54 78Q60 72 66 78" fill="none"/>`;
      case 'line': return `<path d="M56 76L64 76" fill="none"/>`;
      case 'small': return `<path d="M57 75Q60 78 63 75" fill="none"/>`;
      default: return `<path d="M53 73Q56.5 78 60 73Q63.5 78 67 73" fill="none"/>`;
    }
  }

  function cat({ eyes: e = 'dot', mouth: m = 'w', gray = false, pose = '', t = '', fill: f, ink: k } = {}) {
    const fill = f || (gray ? '#a19ca8' : '#fff');
    const ink = k || (gray ? '#3b3540' : INK);
    const inner = gray ? '#f0b9c4' : '#ffc9d3';
    const paws = pose === 'head' ? '' : pose === 'wave'
      ? `<ellipse cx="46" cy="98" rx="8" ry="6" fill="${fill}"/><ellipse cx="94" cy="70" rx="7.5" ry="6.5" fill="${fill}"/><path d="M101 58q5 4 4 10M106 54q7 6 5 15" fill="none" stroke-width="2"/>`
      : `<ellipse cx="47" cy="98" rx="8" ry="6" fill="${fill}"/><ellipse cx="73" cy="98" rx="8" ry="6" fill="${fill}"/>`;
    return `<g ${t ? `transform="${t}"` : ''} stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      ${pose === 'head' ? '' : `<ellipse cx="60" cy="92" rx="27" ry="13" fill="${fill}"/>`}
      <path d="M27 54Q22 27 47 37Z" fill="${fill}"/><path d="M93 54Q98 27 73 37Z" fill="${fill}"/>
      <ellipse cx="60" cy="67" rx="38" ry="30" fill="${fill}"/>
      <path d="M31 47Q29 34 42 39Z" fill="${inner}" stroke="none"/><path d="M89 47Q91 34 78 39Z" fill="${inner}" stroke="none"/>
      <ellipse cx="35" cy="75" rx="6.5" ry="3.8" fill="${PINK}" opacity=".85" stroke="none"/>
      <ellipse cx="85" cy="75" rx="6.5" ry="3.8" fill="${PINK}" opacity=".85" stroke="none"/>
      ${eyes(e, ink)}${mouth(m)}${paws}
    </g>`;
  }

  const tears = `<path d="M44 71Q40 80 42 90M76 71Q80 80 78 90" fill="none" stroke="#8fd3ff" stroke-width="3.4" stroke-linecap="round"/>`;
  const chips = `<g transform="translate(92 96)" stroke="${INK}" stroke-width="2">
      <ellipse cx="0" cy="6" rx="10" ry="4" fill="#d9a02c"/><ellipse cx="0" cy="1" rx="10" ry="4" fill="#f5c451"/><ellipse cx="0" cy="-4" rx="10" ry="4" fill="#ffe08a"/></g>`;
  const card = `<g transform="translate(92 78) rotate(14)" stroke="${INK}" stroke-width="2"><rect x="-9" y="-12" width="18" height="24" rx="3" fill="#fff"/>
      <text x="0" y="5" font-size="14" text-anchor="middle" fill="#e3283a" stroke="none">♥</text></g>`;

  const LIST = [
    { id: 'hi', label: '안녕~', en: 'Hi~', svg: () => cat({ eyes: 'happy', pose: 'wave' }) },
    { id: 'ya', label: '야!!', en: 'Hey!!', svg: () => cat({ eyes: 'angry', mouth: 'open' }) + txt(103, 50, '!!', 22, '#ff5a6b', 12) },
    { id: 'hmph', label: '흥', en: 'Hmph', svg: () => cat({ eyes: 'sleep', mouth: 'frown', t: 'rotate(-8 60 70)' }) + `<path d="M98 66q8-2 10 4" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>` },
    { id: 'thanks', label: '고마워', en: 'Thanks', svg: () => cat({ eyes: 'happy' }) + heart(88, 32, 1.4) + heart(100, 48, 0.8) },
    { id: 'what', label: '뭔데~?', en: 'What~?', svg: () => cat({ eyes: 'dot', mouth: 'small', t: 'rotate(6 60 70)' }) + txt(104, 50, '?', 26, INK, 10) },
    { id: 'why', label: '왜구래용', en: 'Whyyy', svg: () => cat({ eyes: 'big', mouth: 'frown' }) + drop(36, 74, 0.9) },
    { id: 'nope', label: '하기시러', en: 'Nope', svg: () => cat({ eyes: 'flat', mouth: 'line' }) + drop(96, 40, 1.3) },
    { id: 'cry', label: '흑흑', en: 'Sob sob', svg: () => cat({ eyes: 'sleep', mouth: 'open' }) + tears },
    { id: 'love', label: '좋아♥', en: 'Love it♥', svg: () => cat({ eyes: 'heart' }) + heart(16, 40, 0.9) + heart(96, 34, 1.1) },
    { id: 'allin', label: '올인!', en: 'All in!', svg: () => cat({ eyes: 'big', mouth: 'open' }) + chips + spark(18, 46, 1.2) + spark(102, 40, 0.9) },
    { id: 'gg', label: 'GG', en: 'GG', svg: () => cat({ eyes: 'happy' }) + card + spark(20, 48, 1) },
    { id: 'lol', label: 'ㅋㅋㅋ', en: 'LOL', svg: () => cat({ eyes: 'squint', mouth: 'open', t: 'rotate(-5 60 70)' }) + drop(30, 58, 0.8) + drop(90, 58, 0.8) },
    { id: 'hurry', label: '빨리~', en: 'Hurry~', svg: () => cat({ eyes: 'angry', mouth: 'small' }) + drop(98, 42, 1.1) + `<path d="M8 70h12M5 80h14M9 90h10" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>` },
    { id: 'shock', label: '헐', en: 'Whoa', svg: () => cat({ eyes: 'shock', mouth: 'o' }) + `<path d="M24 34l6 8M60 26v9M96 34l-6 8" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>` },
    { id: 'sleepy', label: '졸려…', en: 'Sleepy…', svg: () => cat({ eyes: 'sleep', mouth: 'line' }) + txt(98, 46, 'z', 14, '#7f8bb3') + txt(106, 36, 'Z', 18, '#7f8bb3') },
    { id: 'hug', label: '꼬옥', en: 'Hug', svg: () => cat({ eyes: 'happy', gray: true, t: 'translate(-12 14) scale(.78)' }) + cat({ eyes: 'sleep', t: 'translate(38 18) scale(.72)' }) + heart(54, 30, 1.2) },
  ];
  const BY_ID = Object.fromEntries(LIST.map((s) => [s.id, s]));

  const labelOf = (s) => (window.I18N && I18N.lang === 'en' ? s.en : s.label);

  function svg(id, size = 96) {
    const s = BY_ID[id];
    if (!s) return '';
    const label = labelOf(s);
    return `<svg class="sticker" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${label}">
      ${s.svg()}${txt(60, 20, label, 19, INK)}</svg>`;
  }

  // Profile picture presets: the same cat in different colours and moods.
  const AVATARS = [
    { bg: '#ffd6e0', eyes: 'dot' }, { bg: '#c9e7ff', eyes: 'happy' }, { bg: '#fff1b8', eyes: 'big' },
    { bg: '#d8f5e3', eyes: 'heart' }, { bg: '#e6dcff', eyes: 'squint', mouth: 'open' }, { bg: '#ffe0c2', eyes: 'sleep' },
    { bg: '#b9c3d9', eyes: 'dot', fill: '#a19ca8', ink: '#3b3540' }, { bg: '#ffd1a8', eyes: 'happy', fill: '#ffb36b' },
    { bg: '#3a4a7a', eyes: 'big', fill: '#4a4458', ink: '#1e1a26' }, { bg: '#fbe3ff', eyes: 'shock', mouth: 'o' },
    { bg: '#cfeee9', eyes: 'angry', mouth: 'small', fill: '#f5ead8' }, { bg: '#ffeaa0', eyes: 'happy', mouth: 'open', fill: '#ffcf70' },
  ];
  function avatar(id) {
    const a = AVATARS[Number(String(id).slice(1))] || AVATARS[0];
    return `<svg class="avatar-svg" viewBox="14 24 92 92" aria-hidden="true"><rect x="14" y="24" width="92" height="92" fill="${a.bg}"/>
      ${cat({ eyes: a.eyes, mouth: a.mouth, fill: a.fill, ink: a.ink, pose: 'head', t: 'translate(0 8)' })}</svg>`;
  }

  return { list: LIST, svg, avatar, avatarIds: AVATARS.map((_, i) => `p${i}`), has: (id) => !!BY_ID[id], label: (id) => (BY_ID[id] ? labelOf(BY_ID[id]) : '') };
})();

window.Stickers = Stickers;
