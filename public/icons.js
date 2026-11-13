// Hand-drawn SVG icons for the cute cat theme (replacing emoji, which look
// different on every device). Icons.svg(name, cls) returns markup.
(() => {
  const O = '#1c1440'; // outline
  const P = {
    // smirking cat face (taunts)
    taunt: `<path d="M10 22 L13 8 L22 16 Z M54 22 L51 8 L42 16 Z" fill="#fffaf3" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><path d="M14 13 l2-3 4 4z M50 13 l-2-3-4 4z" fill="#ff9fc6"/><ellipse cx="32" cy="36" rx="23" ry="20" fill="#fffaf3" stroke="${O}" stroke-width="3"/><path d="M20 33 q4 -4 8 0 M36 31 q5 -3 9 1" fill="none" stroke="${O}" stroke-width="3" stroke-linecap="round"/><path d="M27 43 q6 5 13 -2" fill="none" stroke="${O}" stroke-width="3" stroke-linecap="round"/><ellipse cx="18" cy="41" rx="4" ry="2.5" fill="#ff9fc6"/><ellipse cx="46" cy="41" rx="4" ry="2.5" fill="#ff9fc6"/>`,
    // little sword
    sword: `<path d="M44 8 L56 8 L56 20 L28 48 L16 36 Z" fill="#eef4ff" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><path d="M48 12 L30 30" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M12 32 L32 52" stroke="${O}" stroke-width="9" stroke-linecap="round"/><path d="M12 32 L32 52" stroke="#ffcf4d" stroke-width="4" stroke-linecap="round"/><path d="M18 46 L8 56" stroke="${O}" stroke-width="9" stroke-linecap="round"/><path d="M18 46 L8 56" stroke="#c97a3a" stroke-width="4" stroke-linecap="round"/>`,
    // tomato
    tomato: `<circle cx="32" cy="36" r="21" fill="#ff5a5a" stroke="${O}" stroke-width="3"/><ellipse cx="24" cy="29" rx="6" ry="4" fill="#fff" opacity=".55" transform="rotate(-25 24 29)"/><path d="M32 16 l-9 -3 6 7 -8 3 10 1 1 7 3-7 9 1-7-4 5-6z" fill="#5fd38a" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>`,
    // round cat bomb with a lit fuse
    bomb: `<path d="M40 14 q6-8 14-6" fill="none" stroke="#c9a26b" stroke-width="3.5" stroke-linecap="round"/><circle cx="55" cy="8" r="4.5" fill="#ffd34d" stroke="${O}" stroke-width="2"/><path d="M14 26 L17 10 L27 19 Z M50 26 L47 10 L37 19 Z" fill="#3b3355" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="38" r="21" fill="#3b3355" stroke="${O}" stroke-width="3"/><path d="M22 36 q3-4 6 0 M36 36 q3-4 6 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M28 45 q4 3 8 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="20" cy="43" rx="3.5" ry="2" fill="#ff9fc6"/><ellipse cx="44" cy="43" rx="3.5" ry="2" fill="#ff9fc6"/>`,
    // cat with a long wooden nose
    liar: `<path d="M8 24 L11 9 L20 17 Z M40 24 L37 9 L28 17 Z" fill="#fffaf3" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><ellipse cx="24" cy="36" rx="19" ry="17" fill="#fffaf3" stroke="${O}" stroke-width="3"/><circle cx="17" cy="33" r="2.6" fill="${O}"/><circle cx="31" cy="33" r="2.6" fill="${O}"/><path d="M26 40 L58 34 L58 41 L26 44 Z" fill="#e8a868" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><path d="M18 46 q4 3 7 0" fill="none" stroke="${O}" stroke-width="2.5" stroke-linecap="round"/>`,
    // speed bolt
    bolt: `<path d="M36 4 L14 36 L30 36 L24 60 L50 24 L33 24 Z" fill="#ffcf4d" stroke="${O}" stroke-width="3.5" stroke-linejoin="round"/>`,
    // spectators
    eye: `<path d="M4 32 q28 -26 56 0 q-28 26 -56 0z" fill="#fffaf3" stroke="${O}" stroke-width="3"/><circle cx="32" cy="32" r="10" fill="#7a5ce6" stroke="${O}" stroke-width="3"/><circle cx="35" cy="29" r="3" fill="#fff"/>`,
  };
  const Icons = {
    svg: (name, cls = 'fab-ico') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${P[name] || ''}</svg>`,
    has: (name) => !!P[name],
  };
  window.Icons = Icons;
})();
