const crypto = require('crypto');
const { makeDeck, shuffle } = require('../cards');
const Bots = require('../bots');

const CFG = {
  minPlayers: 2,
  maxPlayers: 6,
  defaultPlayers: 4,
  handSize: 7,
  maxPlay: 3,
  turnMs: 20000,
  windowMs: 4500,   // time to shout "Liar!" after a play
  revealMs: 3200,
  noseMax: 6,
};
const RANKS = 'A23456789TJQK';
const rankOf = (c) => c[0];
const clampInt = (v, def, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const rand = (a, b) => a + crypto.randomInt(Math.max(1, b - a));
const chance = (p) => crypto.randomInt(1000) / 1000 < p;
const BOT = {
  easy: { truth: 0.92, call: 0.1, tell: 0, react: [1800, 3600], think: [1500, 3200] },
  normal: { truth: 0.85, call: 0.18, tell: 0.08, react: [1100, 3000], think: [1200, 2600] },
  hard: { truth: 0.72, call: 0.22, tell: 0.14, react: [700, 2400], think: [900, 2000] },
};

/**
 * 피노키오 거짓말 카드 (Pinocchio Liar's Cards), 2–6 players.
 * The rank to claim walks A → 2 → … → K. On your turn put 1–3 cards face down
 * and claim they're all that rank. Anyone can shout "Liar!" during a short
 * window: if it was a lie the player takes the whole pile and their nose grows
 * for good; if it was true, the accuser takes the pile. Every play makes the
 * nose twitch (a bit more when lying) — a small tell. Empty your hand to win.
 */
class Pinocchio {
  static meta = { id: 'liar', name: '피노키오 거짓말 카드', minPlayers: CFG.minPlayers, maxPlayers: CFG.maxPlayers };

  static normalizeSettings(raw = {}) {
    return {
      players: clampInt(raw.players, CFG.defaultPlayers, CFG.minPlayers, CFG.maxPlayers),
      turnSec: clampInt(raw.turnSec, 20, 10, 60),
    };
  }

  constructor(room, settings) {
    this.room = room;
    this.settings = Pinocchio.normalizeSettings(settings);
    this.maxPlayers = this.settings.players;
    this.turnMs = this.settings.turnSec * 1000;
    this.ps = new Map();
    this.timers = [];
    this.dealId = 0;
    this.toLobby();
  }

  get players() { return this.room.players; }
  changed() { this.room.broadcast(); }
  canJoin() { return this.phase === 'lobby' && this.players.length < this.maxPlayers; }
  canLateJoin() { return this.phase === 'gameover' && this.players.length < this.maxPlayers; }
  canSit() { return this.canJoin() || this.canLateJoin(); }
  canDuel() { return this.phase === 'lobby' || this.phase === 'gameover'; }
  pause() {}
  resume() {}

  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  later(ms, fn) { const key = this.dealId; this.timers.push(setTimeout(() => key === this.dealId && fn(), ms)); }
  dispose() { this.clearTimers(); }

  toLobby(notice = null) {
    this.clearTimers();
    this.phase = 'lobby';
    this.round = 0;
    this.pile = [];
    this.turnId = null;
    this.target = 0;
    this.lastPlay = null;
    this.reveal = null;
    this.final = null;
    this.deadline = null;
    this.notice = notice;
    for (const p of this.players) {
      const s = this.ps.get(p.id);
      if (s) Object.assign(s, { hand: [], ready: !!p.bot, nose: 0, out: false });
    }
  }

  onJoin(player) {
    this.ps.set(player.id, { hand: [], ready: !!player.bot, nose: 0, out: false, pending: false });
    this.notice = null;
  }

  onLeave(playerId, name) {
    const s = this.ps.get(playerId);
    this.ps.delete(playerId);
    if (this.phase === 'lobby') {
      for (const p of this.players) if (!p.bot) this.ps.get(p.id).ready = false;
      return this.changed();
    }
    const humans = this.players.filter((p) => !p.bot).length;
    if (this.players.length < CFG.minPlayers || humans === 0) return this.toLobby({ code: 'srv.oppLeft', name, at: Date.now() });
    this.notice = { code: 'sys.left', name, at: Date.now() };
    if (this.phase === 'gameover') return this.changed();
    if (s?.hand.length) this.pile.push(...s.hand); // their cards join the pile
    if (this.turnId === playerId || this.lastPlay?.by === playerId) this.nextTurn(playerId, true);
    else this.changed();
  }

  onAction(playerId, action) {
    const s = this.ps.get(playerId);
    if (!s || !action) return;
    switch (action.type) {
      case 'ready':
        if (this.phase !== 'lobby' && this.phase !== 'gameover') return;
        s.ready = !s.ready;
        if (!this.tryStart()) this.changed();
        return;
      case 'play':
        return this.play(playerId, Array.isArray(action.cards) ? action.cards.map(String) : []);
      case 'call':
        return this.call(playerId);
      default:
    }
  }

  tryStart() {
    const ready = this.players.length >= CFG.minPlayers && this.players.every((p) => this.ps.get(p.id).ready);
    if (ready) this.startGame();
    return ready;
  }

  order() { return this.players.filter((p) => this.ps.get(p.id)); }

  startGame() {
    this.clearTimers();
    const deck = shuffle(makeDeck());
    for (const p of this.order()) {
      Object.assign(this.ps.get(p.id), { hand: deck.splice(0, CFG.handSize).sort(), ready: false, nose: 0, out: false });
    }
    this.pile = [];
    this.round = 0;
    this.target = 0;
    this.final = null;
    this.notice = null;
    this.lastPlay = null;
    this.reveal = null;
    const list = this.order();
    this.startTurn(list[crypto.randomInt(list.length)].id);
  }

  startTurn(id) {
    this.clearTimers();
    this.dealId++;
    this.round++;
    this.phase = 'play';
    this.turnId = id;
    this.reveal = null;
    this.deadline = Date.now() + this.turnMs;
    this.later(this.turnMs, () => {
      // Out of time: one random card goes down.
      const s = this.ps.get(id);
      if (s?.hand.length) this.play(id, [s.hand[crypto.randomInt(s.hand.length)]]);
    });
    this.changed();
    this.botPlay();
  }

  play(playerId, cards) {
    if (this.phase !== 'play' || playerId !== this.turnId) return;
    const s = this.ps.get(playerId);
    const uniq = [...new Set(cards)];
    if (!uniq.length || uniq.length > CFG.maxPlay || !uniq.every((c) => s.hand.includes(c))) return;
    s.hand = s.hand.filter((c) => !uniq.includes(c));
    this.pile.push(...uniq);
    const claim = RANKS[this.target];
    const lied = uniq.some((c) => rankOf(c) !== claim);
    // The nose always twitches; a lie makes it twitch a little more (a tell).
    const wiggle = Math.min(4, rand(1, 4) + (lied ? 1 : 0));
    this.lastPlay = { by: playerId, cards: uniq, count: uniq.length, claim, lied, wiggle, at: Date.now() };
    this.clearTimers();
    this.dealId++;
    this.phase = 'window';
    this.turnId = null;
    this.deadline = Date.now() + CFG.windowMs;
    this.later(CFG.windowMs, () => this.afterWindow());
    this.changed();
    this.botCalls();
  }

  call(playerId) {
    if (this.phase !== 'window' || !this.lastPlay || playerId === this.lastPlay.by) return;
    if (!this.ps.get(playerId)) return;
    const lp = this.lastPlay;
    const liar = this.ps.get(lp.by);
    const taker = lp.lied ? lp.by : playerId;
    const pileSize = this.pile.length;
    this.ps.get(taker)?.hand.push(...this.pile);
    this.ps.get(taker)?.hand.sort();
    this.pile = [];
    if (lp.lied && liar) liar.nose = Math.min(CFG.noseMax, liar.nose + 1);
    this.reveal = { by: lp.by, caller: playerId, cards: lp.cards, claim: lp.claim, lied: lp.lied, taker, pileSize, at: Date.now() };
    this.clearTimers();
    this.dealId++;
    this.phase = 'reveal';
    this.deadline = Date.now() + CFG.revealMs;
    this.later(CFG.revealMs, () => {
      // A truthful last card still wins, even after a failed accusation.
      if (!lp.lied && liar && liar.hand.length === 0) return this.finish(lp.by);
      this.nextTurn(lp.by);
    });
    this.changed();
  }

  afterWindow() {
    const lp = this.lastPlay;
    if (lp && this.ps.get(lp.by)?.hand.length === 0) return this.finish(lp.by);
    this.nextTurn(lp?.by);
  }

  nextTurn(fromId, removed) {
    this.target = (this.target + 1) % RANKS.length;
    const list = this.order();
    if (list.length < CFG.minPlayers) return this.finish(list[0]?.id);
    let idx = this.players.findIndex((p) => p.id === fromId);
    if (removed || idx < 0) idx = Math.max(-1, idx - 1);
    // next player in seat order
    let next = null;
    for (let k = 1; k <= this.players.length + 1; k++) {
      const p = this.players[(((idx + k) % this.players.length) + this.players.length) % this.players.length];
      if (p && this.ps.get(p.id)) { next = p; break; }
    }
    this.startTurn((next || list[0]).id);
  }

  finish(winnerId) {
    this.clearTimers();
    this.dealId++;
    const order = this.order().slice().sort((a, b) => {
      if (a.id === winnerId) return -1;
      if (b.id === winnerId) return 1;
      return this.ps.get(a.id).hand.length - this.ps.get(b.id).hand.length;
    });
    const n = order.length;
    const standings = order.map((p, i) => {
      const s = this.ps.get(p.id);
      return { id: p.id, name: p.name, bot: p.bot || null, chips: n - i, cards: s.hand.length, display: i === 0 ? '🏆' : `🃏${s.hand.length}` };
    });
    this.final = { standings, championId: winnerId || standings[0]?.id || null, reason: 'liar' };
    for (const p of this.players) this.ps.get(p.id).ready = !!p.bot;
    this.final.ratings = this.room.onFinish?.(standings, 'liar') || [];
    this.phase = 'gameover';
    this.turnId = null;
    this.deadline = null;
    this.changed();
  }

  // ---- bots ------------------------------------------------------------

  botPlay() {
    const p = this.players.find((x) => x.id === this.turnId);
    if (!p?.bot) return;
    const L = BOT[p.bot] || BOT.normal;
    this.later(rand(...L.think), () => {
      const s = this.ps.get(p.id);
      if (!s || this.turnId !== p.id) return;
      const claim = RANKS[this.target];
      const have = s.hand.filter((c) => rankOf(c) === claim);
      const others = s.hand.filter((c) => rankOf(c) !== claim);
      let cards;
      if (have.length && (chance(L.truth) || !others.length)) {
        cards = have.slice(0, CFG.maxPlay);
        // a sneaky extra card now and then
        if (p.bot === 'hard' && cards.length < CFG.maxPlay && others.length && chance(0.25)) cards.push(others[0]);
      } else {
        const n = others.length >= 2 && chance(0.35) ? 2 : 1;
        cards = (others.length ? others : s.hand).slice().sort(() => Math.random() - 0.5).slice(0, n);
      }
      this.play(p.id, cards);
    });
  }

  botCalls() {
    const lp = this.lastPlay;
    if (!lp) return;
    const bots = this.players.filter((p) => p.bot && p.id !== lp.by && this.ps.get(p.id));
    for (const b of bots.sort(() => Math.random() - 0.5)) {
      const L = BOT[b.bot] || BOT.normal;
      const s = this.ps.get(b.id);
      const held = s.hand.filter((c) => rankOf(c) === lp.claim).length;
      let p = L.call;
      if (held + lp.count > 4) p = 1;                          // impossible claim
      p += (lp.wiggle - 2.5) * L.tell;                          // read the nose
      if (this.ps.get(lp.by)?.hand.length === 0) p += 0.45;    // they'd win
      if (lp.count === 3) p += 0.08;
      p -= Math.min(0.15, this.pile.length * 0.01);             // big pile = risky
      if (!chance(Math.max(0, Math.min(1, p)))) continue;
      this.later(Math.min(CFG.windowMs - 300, rand(...L.react)), () => this.call(b.id));
      break; // one bot is enough
    }
  }

  // ---- view ------------------------------------------------------------

  viewFor(viewerId) {
    const reveal = this.phase === 'reveal' ? this.reveal : null;
    return {
      game: 'liar',
      phase: this.phase,
      dealId: this.dealId,
      round: this.round,
      maxRounds: 0,
      maxPlayers: this.maxPlayers,
      minPlayers: CFG.minPlayers,
      lateJoinRound: 0,
      canSit: this.canSit(),
      ante: 0,
      pot: 0,
      deadline: this.deadline,
      settings: this.settings,
      durations: { play: this.turnMs, window: CFG.windowMs, reveal: CFG.revealMs },
      notice: this.notice,
      turn: this.turnId,
      target: RANKS[this.target],
      nextTarget: RANKS[(this.target + 1) % RANKS.length],
      pileCount: this.pile.length,
      maxPlay: CFG.maxPlay,
      // the claim is public; whether it's a lie is not (until a reveal)
      lastPlay: this.lastPlay ? { by: this.lastPlay.by, count: this.lastPlay.count, claim: this.lastPlay.claim, wiggle: this.lastPlay.wiggle, at: this.lastPlay.at } : null,
      reveal,
      myHand: this.ps.get(viewerId)?.hand || [],
      grid: [],
      board: [],
      players: this.players.map((p) => {
        const s = this.ps.get(p.id);
        return { id: p.id, name: p.name, bot: p.bot || null, connected: p.connected, ready: s.ready, out: false, pending: false, cards: s.hand.length, nose: s.nose, chips: s.hand.length };
      }),
      result: null,
      final: this.final,
    };
  }
}

Pinocchio.CFG = CFG;
Pinocchio.RANKS = RANKS;
module.exports = Pinocchio;
