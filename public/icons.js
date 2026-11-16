// SVG icons for the luxury casino theme (gold on black, no characters).
// Icons.svg(name, cls) returns markup.
(() => {
  const G = 'url(#icoGold)';
  const DEF = '<defs><linearGradient id="icoGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c2"/><stop offset=".5" stop-color="#e6b54a"/><stop offset="1" stop-color="#9c6a1c"/></linearGradient></defs>';
  const P = {
    // masquerade mask (bluff gestures)
    taunt: `<path d="M6 22 Q32 12 58 22 Q58 42 44 44 Q36 44 32 36 Q28 44 20 44 Q6 42 6 22Z" fill="#14100a" stroke="${G}" stroke-width="3" stroke-linejoin="round"/><path d="M14 28 q6-5 12 0 q-6 6-12 0Z M38 28 q6-5 12 0 q-6 6-12 0Z" fill="${G}"/><path d="M58 22 q4 -10 -2 -16" fill="none" stroke="${G}" stroke-width="2.5" stroke-linecap="round"/>`,
    // tomato (kept for the aimed gesture)
    tomato: `<circle cx="32" cy="36" r="21" fill="#d63a3a" stroke="#3a0d0d" stroke-width="3"/><ellipse cx="24" cy="29" rx="6" ry="4" fill="#fff" opacity=".45" transform="rotate(-25 24 29)"/><path d="M32 16 l-9 -3 6 7 -8 3 10 1 1 7 3-7 9 1-7-4 5-6z" fill="#3fae6a" stroke="#123a20" stroke-width="2.5" stroke-linejoin="round"/>`,
    // classic black bomb with a lit fuse
    bomb: `<path d="M41 17 q5-9 13-8" fill="none" stroke="#c9a26b" stroke-width="3.5" stroke-linecap="round"/><circle cx="55" cy="9" r="4.5" fill="#ffd34d"/><circle cx="55" cy="9" r="8" fill="#ff9a2e" opacity=".35"/><rect x="33" y="14" width="12" height="9" rx="2" transform="rotate(35 39 18)" fill="${G}"/><circle cx="29" cy="38" r="20" fill="#16161c" stroke="${G}" stroke-width="3"/><path d="M18 30 q5-8 13-8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/>`,
    // masked face with a raised eyebrow card (liar's cards)
    liar: `<rect x="10" y="10" width="26" height="36" rx="4" fill="#fffaf0" stroke="${G}" stroke-width="3" transform="rotate(-10 23 28)"/><rect x="28" y="16" width="26" height="36" rx="4" fill="#14100a" stroke="${G}" stroke-width="3" transform="rotate(10 41 34)"/><text x="41" y="40" font-family="Georgia,serif" font-size="20" font-weight="700" fill="${G}" text-anchor="middle" transform="rotate(10 41 34)">?</text>`,
    // speed bolt
    bolt: `<path d="M36 4 L14 36 L30 36 L24 60 L50 24 L33 24 Z" fill="${G}" stroke="#3a2600" stroke-width="2.5" stroke-linejoin="round"/>`,
    // spectators
    eye: `<path d="M4 32 q28 -26 56 0 q-28 26 -56 0z" fill="none" stroke="${G}" stroke-width="3.5"/><circle cx="32" cy="32" r="10" fill="${G}"/><circle cx="35" cy="29" r="3" fill="#fff"/>`,
  };
  const Icons = {
    svg: (name, cls = 'fab-ico') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${DEF}${P[name] || ''}</svg>`,
    has: (name) => !!P[name],
  };
  window.Icons = Icons;
})();
