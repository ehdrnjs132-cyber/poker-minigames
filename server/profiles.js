// Player profiles, per-game records and ranking points.
// No passwords: each browser holds a random id + secret token. The pair can
// be copied as a transfer code to use the same profile on another device.
const crypto = require('crypto');
const store = require('./store');
const { compareScores } = require('./handEval');

const GAMES = ['memory', 'nut'];
const PRESETS = Array.from({ length: 12 }, (_, i) => `p${i}`);
const START_RATING = 1000;
const MAX_IMAGE_CHARS = 90_000; // ~65 KB image as a data URL
const HISTORY = 10;

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newId = () => crypto.randomBytes(6).toString('hex');
const newToken = () => crypto.randomBytes(12).toString('base64url');

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

function publicUser(u) {
  return u && { id: u.id, name: u.name, avatar: u.avatar || null, avatarV: u.avatarV || 0 };
}

// Find or create the profile for this browser.
function hello({ uid, token, name, noCreate } = {}) {
  let u = uid && store.get(`user:${uid}`);
  if (!u || u.tokenHash !== hash(token)) {
    if (noCreate) return { invalid: true }; // transfer-code check: never mint a new profile

    const id = newId();
    const tok = newToken();
    u = { id, tokenHash: hash(tok), name: cleanName(name) || 'Player', avatar: `p${crypto.randomInt(PRESETS.length)}`, avatarV: 0, createdAt: Date.now() };
    store.set(`user:${id}`, u);
    return { user: publicUser(u), uid: id, token: tok, created: true };
  }
  u.lastSeen = Date.now();
  store.set(`user:${u.id}`, u);
  return { user: publicUser(u), uid: u.id, token };
}

function getUser(id) {
  return id ? store.get(`user:${id}`) : null;
}

// Update nickname / preset avatar / uploaded photo. Returns the public user or an error code.
function update(id, { name, avatar, image } = {}) {
  const u = getUser(id);
  if (!u) return { error: 'srv.noProfile' };
  if (name !== undefined) {
    const n = cleanName(name);
    if (n) u.name = n;
  }
  if (avatar !== undefined) {
    if (!PRESETS.includes(avatar)) return { error: 'srv.badAvatar' };
    u.avatar = avatar;
    u.avatarV = (u.avatarV || 0) + 1;
  }
  if (image !== undefined) {
    const ok = typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) && image.length <= MAX_IMAGE_CHARS;
    if (!ok) return { error: 'srv.badImage' };
    store.set(`img:${id}`, image);
    u.avatar = 'img';
    u.avatarV = (u.avatarV || 0) + 1;
  }
  store.set(`user:${id}`, u);
  return { user: publicUser(u) };
}

function image(id) {
  return store.get(`img:${id}`) || null;
}

function stat(id, game) {
  return store.get(`stat:${id}:${game}`) || {
    rating: START_RATING, games: 0, wins: 0, rounds: 0, roundsWon: 0, chipsWon: 0, bestScore: null, bestCard: 0, history: [],
  };
}

// After every showdown: rounds played/won, chips, best hand.
function recordRound(game, entries) {
  for (const e of entries) {
    if (!e.userId || !GAMES.includes(game)) continue;
    const s = stat(e.userId, game);
    s.rounds++;
    if (e.won) s.roundsWon++;
    if (e.net > 0) s.chipsWon += e.net;
    if (e.score && (!s.bestScore || compareScores(e.score, s.bestScore) > 0)) s.bestScore = e.score;
    if (e.card && e.won && e.card > (s.bestCard || 0)) s.bestCard = e.card;
    store.set(`stat:${e.userId}:${game}`, s);
  }
}

// At game end: placement → ranking points. Bot-only games count half.
function recordGame(game, entries) {
  const n = entries.length;
  if (n < 2 || !GAMES.includes(game)) return [];
  const humans = entries.filter((e) => e.userId).length;
  const out = [];
  for (const e of entries) {
    if (!e.userId) continue;
    const s = stat(e.userId, game);
    const base = (24 * (n - 2 * e.place + 1)) / (n - 1);
    const delta = Math.round(humans > 1 ? base : base / 2);
    s.rating = Math.max(0, s.rating + delta);
    s.games++;
    if (e.place === 1) s.wins++;
    s.history.unshift({ at: Date.now(), place: e.place, n, delta, chips: e.chips });
    s.history = s.history.slice(0, HISTORY);
    store.set(`stat:${e.userId}:${game}`, s);
    out.push({ userId: e.userId, delta, rating: s.rating });
  }
  return out;
}

// Leaving a game in progress counts as finishing last.
function recordAbandon(game, userId, n) {
  if (!userId) return;
  recordGame(game, [{ userId, place: n, chips: 0 }, ...Array.from({ length: n - 1 }, (_, i) => ({ userId: null, place: i + 1 }))]);
}

function leaderboard(game, viewerId) {
  if (!GAMES.includes(game)) return { rows: [] };
  const rows = [];
  for (const [k, s] of store.entries(`stat:`)) {
    const [, uid, g] = k.split(':');
    if (g !== game || !s.games) continue;
    const u = getUser(uid);
    if (!u) continue;
    rows.push({ ...publicUser(u), rating: s.rating, games: s.games, wins: s.wins, bestScore: s.bestScore, bestCard: s.bestCard });
  }
  rows.sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.games - b.games);
  rows.forEach((r, i) => (r.rank = i + 1));
  return { rows: rows.slice(0, 50), me: rows.find((r) => r.id === viewerId) || null, total: rows.length };
}

function myStats(id) {
  const u = getUser(id);
  if (!u) return null;
  const games = {};
  for (const g of GAMES) {
    const s = stat(id, g);
    const board = leaderboard(g, id);
    games[g] = { ...s, rank: board.me?.rank || null, ranked: board.total };
  }
  return { user: publicUser(u), games };
}

module.exports = { hello, getUser, update, image, recordRound, recordGame, recordAbandon, leaderboard, myStats, publicUser, PRESETS, GAMES };
