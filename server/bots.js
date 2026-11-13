// Bot "brains". Bots read the true server state, then deliberately make
// human-like mistakes depending on difficulty.
const crypto = require('crypto');
const { bestHand, compareScores } = require('./handEval');

const LEVELS = {
  //          memory accuracy   per-swap tracking  pick from top-N  pick delay (ms)     nut race: hit rate / delay
  easy:   { remember: 0.45, track: 0.86, choose: 10, delay: [6000, 12000], nutHit: 0.45, nutDelay: [6500, 13000] },
  normal: { remember: 0.72, track: 0.93, choose: 3, delay: [4000, 9000], nutHit: 0.75, nutDelay: [3800, 8500] },
  hard:   { remember: 0.93, track: 0.985, choose: 1, delay: [2500, 6000], nutHit: 0.95, nutDelay: [2200, 5200] },
};
const NAMES = ['Leo', 'Mia', 'Max', 'Luna', 'Kai', 'Nova', 'Rex', 'Zoe', 'Ari', 'Bo'];

const rand = ([a, b]) => a + crypto.randomInt(Math.max(1, b - a));
const pickOne = (arr) => arr[crypto.randomInt(arr.length)];
const isLevel = (l) => Object.hasOwn(LEVELS, l);

// Every 2-card choice from the grid, strongest first.
function rankPairs(grid, board) {
  const pairs = [];
  for (let i = 0; i < grid.length; i++)
    for (let j = i + 1; j < grid.length; j++) {
      const bh = bestHand([grid[i], grid[j], ...board]);
      pairs.push({ picks: [i, j], score: bh.score });
    }
  return pairs.sort((a, b) => compareScores(b.score, a.score));
}

// A misremembered card: usually a neighbour on the 8×2 table, sometimes anywhere.
function wrongSpot(idx, size) {
  const near = [idx - 1, idx + 1, idx - 8, idx + 8].filter((n) => n >= 0 && n < size && n !== idx);
  if (near.length && crypto.randomInt(100) < 65) return pickOne(near);
  let n;
  do n = crypto.randomInt(size); while (n === idx);
  return n;
}

function memoryPlan(grid, board, level, { swaps = 0, maxDelay = Infinity } = {}) {
  const L = LEVELS[level] || LEVELS.normal;
  const pairs = rankPairs(grid, board);
  const rank = crypto.randomInt(Math.min(L.choose, pairs.length));
  const target = pairs[rank].picks;
  const accuracy = L.remember * Math.pow(L.track, swaps);
  const picks = [];
  for (const idx of target) {
    let pos = crypto.randomInt(1000) / 1000 < accuracy ? idx : wrongSpot(idx, grid.length);
    while (picks.includes(pos)) pos = crypto.randomInt(grid.length);
    picks.push(pos);
  }
  // How sure the bot feels it beats one opponent: a strong target it trusts
  // its memory of → high. Used for betting.
  const strength = 1 - rank / pairs.length;
  const confidence = Math.min(0.95, Math.max(0.1, 0.2 + 0.65 * accuracy * strength));
  return { picks, delay: Math.min(rand(L.delay), maxDelay), confidence };
}

function nutPlan(grid, board, level, { maxDelay = Infinity } = {}) {
  const L = LEVELS[level] || LEVELS.normal;
  const pairs = rankPairs(grid, board);
  const hit = crypto.randomInt(1000) / 1000 < L.nutHit;
  const rank = hit ? 0 : 1 + crypto.randomInt(Math.min(8, pairs.length - 1));
  const target = pairs[rank];
  // Everything is face up, so the bot knows how close to the nuts it got.
  // Even the nuts can lose a speed tie, so it never feels certain.
  const confidence = hit ? 0.85 : Math.max(0.2, 0.72 - rank * 0.06);
  return { picks: target.picks.slice(), delay: Math.min(rand(L.nutDelay), maxDelay), confidence };
}

function makeName(taken) {
  const free = NAMES.filter((n) => !taken.includes(n));
  return free.length ? pickOne(free) : `Bot${crypto.randomInt(100)}`;
}

const WIN_STICKERS = ['gg', 'lol', 'allin', 'love', 'hi'];
const LOSE_STICKERS = ['cry', 'hmph', 'why', 'nope', 'shock'];

module.exports = { LEVELS, isLevel, rankPairs, memoryPlan, nutPlan, makeName, rand, pickOne, WIN_STICKERS, LOSE_STICKERS };
