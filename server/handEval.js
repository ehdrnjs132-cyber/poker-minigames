const { RANKS } = require('./cards');

const CATEGORY_NAMES = [
  '하이카드', '원페어', '투페어', '트리플', '스트레이트',
  '플러시', '풀하우스', '포카드', '스트레이트 플러시',
];

const parse = (code) => ({ r: RANKS.indexOf(code[0]) + 2, s: code[1] });

function rankLabel(r) {
  return { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' }[r] || String(r);
}

// Returns a comparable score array: [category, ...tiebreakers].
function score5(codes) {
  const cards = codes.map(parse);
  const rs = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);

  let straightHigh = 0;
  if (new Set(rs).size === 5) {
    if (rs[0] - rs[4] === 4) straightHigh = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) straightHigh = 5; // A-2-3-4-5
  }

  const counts = {};
  for (const r of rs) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, n]) => [n, Number(r)])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const ordered = groups.map((g) => g[1]);

  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, ...ordered];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...ordered];
  if (flush) return [5, ...rs];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...ordered];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...ordered];
  if (groups[0][0] === 2) return [1, ...ordered];
  return [0, ...rs];
}

function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

function describe(score) {
  const [cat, a, b] = score;
  switch (cat) {
    case 8: return a === 14 ? '로열 플러시' : `${rankLabel(a)} 하이 스트레이트 플러시`;
    case 7: return `${rankLabel(a)} 포카드`;
    case 6: return `${rankLabel(a)} 풀하우스 (${rankLabel(b)})`;
    case 5: return `${rankLabel(a)} 하이 플러시`;
    case 4: return `${rankLabel(a)} 하이 스트레이트`;
    case 3: return `${rankLabel(a)} 트리플`;
    case 2: return `${rankLabel(a)}·${rankLabel(b)} 투페어`;
    case 1: return `${rankLabel(a)} 원페어`;
    default: return `${rankLabel(a)} 하이카드`;
  }
}

// Best 5-card hand out of any number (>=5) of cards.
function bestHand(codes) {
  let best = null;
  const n = codes.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const hand = [codes[a], codes[b], codes[c], codes[d], codes[e]];
            const score = score5(hand);
            if (!best || compareScores(score, best.score) > 0) best = { score, cards: hand };
          }
  const cat = best.score[0];
  return {
    ...best,
    category: cat,
    name: cat === 8 && best.score[1] === 14 ? '로열 플러시' : CATEGORY_NAMES[cat],
    desc: describe(best.score),
  };
}

module.exports = { score5, bestHand, compareScores };
