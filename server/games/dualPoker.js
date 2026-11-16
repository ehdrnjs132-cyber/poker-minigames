const crypto = require('crypto');
const Bots = require('../bots');

/**
 * 양면 포커 (Double-sided Poker), 1 vs 1.
 *
 * Rules:
 * - 90 double-sided number cards: every (front, back) pair of different
 *   numbers 1–10. Each player gets one card; fronts are public, only the
 *   owner sees their back.
 * - Both start with 30 chips and ante 1 chip per hand.
 * - The first player (alternates every hand) picks a side to bet on
 *   (front / back) and bets. The side can't be changed after that.
 *   The other player picks their side on their first action too.
 * - Matching the opponent's bet (call) ends betting at once: the chosen
 *   sides are revealed and the higher number wins the pot. Betting more
 *   (raise) keeps betting going. Giving up (fold) = the opponent wins.
 * - Equal numbers = draw: the pot stays and goes to the next hand's winner.
 * - Both-sides bet: wins only if BOTH of your numbers beat the opponent's
 *   chosen number (any side equal or lower = you lose). You must match the
 *   opponent's bet on each side, i.e. pay double. Winning it takes 10 extra
 *   chips from the opponent. Folding against it also costs 10 chips; the
 *   both-sides bettor pays no penalty when losing.
 * - Whoever runs out of chips loses.
 *
 * Bets are tracked as a "level" (chips per side). A both-sides bettor has
 * put 2 × level into the pot, everyone else 1 × level.
 */
const CFG = {
  players: 2,
  startChips: 30,
  ante: 1,
  bonus: 10,          // both-sides win / folding against a both-sides bet
  turnMs: 25000,
  showdownMs: 6500,
};
const SIDES = ['front', 'back', 'both'];
const clampInt = (v, def, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const rand = (a, b) => a + crypto.randomInt(Math.max(1, b - a));
const chance = (p) => crypto.randomInt(10000) / 10000 < p;

// All 90 cards: [front, back] with front !== back.
function makeDeck() {
  const deck = [];
  for (let f = 1; f <= 10; f++) for (let b = 1; b <= 10; b++) if (f !== b) deck.push([f, b]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const BOT = {
  //        mistakes      bluff  both-sides threshold  think time
  easy: { noise: 0.22, bluff: 0.04, both: 0.97, think: [1600, 3600] },
  normal: { noise: 0.1, bluff: 0.08, both: 0.88, think: [1200, 2800] },
  hard: { noise: 0.03, bluff: 0.12, both: 0.8, think: [900, 2200] },
};

class DualPoker {
  static meta = { id: 'dual', name: '양면 포커', minPlayers: 2, maxPlayers: 2 };

  static normalizeSettings(raw = {}) {
    return {
      players: 2,
      turnSec: clampInt(raw.turnSec, CFG.turnMs / 1000, 10, 60),
      hands: [0, 15, 25].includes(Number(raw.hands)) ? Number(raw.hands) : 0, // 0 = until someone is broke
    };
  }

  constructor(room, settings) {
    this.room = room;
    this.settings = DualPoker.normalizeSettings(settings);
    this.maxPlayers = 2;
    this.ps = new Map();
    this.timers = [];
    this.dealId = 0;
    this.deck = makeDeck();
    this.toLobby();
  }

  get players() { return this.room.players; }
  changed() { this.room.broadcast(); }
  canJoin() { return this.phase === 'lobby' && this.players.length < 2; }
  canLateJoin() { return this.phase === 'gameover' && this.players.length < 2; }
  canSit() { return this.canJoin() || this.canLateJoin(); }
  canDuel() { return false; }
  pause() {}
  resume() {}

  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }
  dispose() { this.clearTimers(); }

  toLobby(notice = null) {
    this.clearTimers();
    this.phase = 'lobby';
    this.round = 0;
    this.pot = 0;
    this.carry = 0;
    this.turn = null;
    this.firstId = null;
    this.deadline = null;
    this.result = null;
    this.final = null;
    this.notice = notice;
    for (const p of this.players) {
      const s = this.ps.get(p.id);
      if (s) Object.assign(s, this.freshSeat(p), { chips: CFG.startChips });
    }
  }

  freshSeat(p) {
    return { ready: !!p?.bot, card: null, side: null, level: 0, put: 0, folded: false, acted: false, lastAction: null };
  }

  onJoin(player) {
    this.ps.set(player.id, { ...this.freshSeat(player), chips: CFG.startChips });
    this.notice = null;
  }

  onLeave(playerId, name) {
    this.ps.delete(playerId);
    if (this.phase === 'bet' || this.phase === 'showdown') {
      const left = this.players[0];
      // The one who stays wins the game.
      if (left && this.players.filter((p) => !p.bot).length) {
        this.notice = { code: 'srv.oppLeft', name, at: Date.now() };
        return this.finish(left.id);
      }
      return this.toLobby({ code: 'srv.oppLeft', name, at: Date.now() });
    }
    if (this.phase === 'gameover') this.notice = { code: 'sys.left', name, at: Date.now() };
    for (const p of this.players) if (!p.bot) this.ps.get(p.id).ready = false;
    this.changed();
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
      case 'fold': return this.fold(playerId);
      case 'call': return this.call(playerId, action.side);
      case 'bet':
      case 'raise': return this.raise(playerId, action.side, action.to);
      default:
    }
  }

  tryStart() {
    if (this.players.length !== 2 || !this.players.every((p) => this.ps.get(p.id).ready)) return false;
    this.startGame();
    return true;
  }

  startGame() {
    this.clearTimers();
    for (const p of this.players) Object.assign(this.ps.get(p.id), this.freshSeat(p), { chips: CFG.startChips, ready: false });
    this.round = 0;
    this.carry = 0;
    this.final = null;
    this.notice = null;
    this.firstId = this.players[crypto.randomInt(2)].id;
    this.deal();
  }

  other(id) { return this.players.find((p) => p.id !== id)?.id; }

  draw() {
    if (!this.deck.length) { this.deck = makeDeck(); this.reshuffledAt = this.round; }
    return this.deck.pop();
  }

  deal() {
    this.clearTimers();
    this.round++;
    this.dealId++;
    this.result = null;
    if (this.round > 1) this.firstId = this.other(this.firstId); // 선 alternates
    this.pot = this.carry;
    this.carry = 0;
    for (const p of this.players) {
      const s = this.ps.get(p.id);
      Object.assign(s, { card: this.draw(), side: null, level: 0, put: 0, folded: false, acted: false, lastAction: null });
      const ante = Math.min(CFG.ante, s.chips);
      s.chips -= ante;
      s.ante = ante;
      this.pot += ante;
    }
    this.phase = 'bet';
    this.setTurn(this.firstId);
    this.changed();
  }

  setTurn(id) {
    this.turn = id;
    this.deadline = Date.now() + this.settings.turnSec * 1000;
    const dealId = this.dealId;
    const level = this.ps.get(id)?.level;
    this.later(this.settings.turnSec * 1000, () => {
      // Time's up = give up (only if nothing happened since).
      if (this.phase === 'bet' && this.turn === id && this.dealId === dealId && this.ps.get(id)?.level === level) this.fold(id, true);
    });
    this.botTurn();
  }

  mult(side) { return side === 'both' ? 2 : 1; }

  // Highest level a player could reach on a side with their remaining chips.
  capFor(id, side) {
    const s = this.ps.get(id);
    return s.level + Math.floor(s.chips / this.mult(side));
  }

  // The highest level both players can afford (the opponent is assumed to
  // play one side if they haven't chosen yet).
  tableCap(id, side) {
    const o = this.other(id);
    return Math.min(this.capFor(id, side), this.capFor(o, this.ps.get(o).side || 'front'));
  }

  // Can this player still pick this side?
  sideOk(id, side) {
    const s = this.ps.get(id);
    if (!SIDES.includes(side)) return false;
    if (s.side) return s.side === side;
    if (side !== 'both') return true;
    const o = this.ps.get(this.other(id));
    if (o.side === 'both') return false; // only one both-sides bettor
    return this.capFor(id, 'both') >= o.level; // must be able to match on both sides
  }

  putTo(id, level) {
    const s = this.ps.get(id);
    const cost = (level - s.level) * this.mult(s.side);
    s.chips -= cost;
    s.put += cost;
    this.pot += cost;
    s.level = level;
  }

  raise(id, side, to) {
    if (this.phase !== 'bet' || this.turn !== id) return;
    const s = this.ps.get(id);
    const o = this.ps.get(this.other(id));
    side = s.side || side;
    if (!this.sideOk(id, side)) return;
    const cap = this.tableCap(id, side);
    to = clampInt(to, o.level + 1, 0, cap);
    // A raise must beat the opponent's level. (When nobody can afford
    // anything, the first player may open at 0 — an all-in showdown.)
    const opening = !s.acted && !o.acted;
    if (to <= o.level && !(opening && cap === 0 && to === 0)) {
      if (to === o.level && o.acted) return this.call(id, side);
      return;
    }
    s.side = side;
    s.acted = true;
    this.putTo(id, to);
    s.lastAction = { kind: opening ? 'bet' : 'raise', amount: to, side, at: Date.now() };
    this.clearTimers();
    this.setTurn(this.other(id));
    this.changed();
  }

  call(id, side) {
    if (this.phase !== 'bet' || this.turn !== id) return;
    const s = this.ps.get(id);
    const o = this.ps.get(this.other(id));
    if (!o.acted) return; // nothing to call yet: the first player must bet or give up
    side = s.side || side;
    if (!this.sideOk(id, side)) return;
    s.side = side;
    s.acted = true;
    // Match what you can (all-in for less never happens: raises are capped).
    this.putTo(id, Math.min(o.level, this.capFor(id, side)));
    s.lastAction = { kind: 'call', amount: s.level, side, at: Date.now() };
    this.showdown(null);
  }

  fold(id, timeout = false) {
    if (this.phase !== 'bet' || this.turn !== id) return;
    const s = this.ps.get(id);
    s.folded = true;
    s.lastAction = { kind: 'fold', timeout, at: Date.now() };
    this.showdown(id);
  }

  // ---- showdown -------------------------------------------------------

  // Who wins: returns { winner, loser, tie, both } (ids) for two sides.
  judge(aId, bId) {
    const A = this.ps.get(aId), B = this.ps.get(bId);
    const val = (s) => (s.side === 'back' ? s.card[1] : s.card[0]);
    if (A.side === 'both' || B.side === 'both') {
      const [X, xId, yId] = A.side === 'both' ? [A, aId, bId] : [B, bId, aId];
      const Y = this.ps.get(yId);
      const target = val(Y);
      const ok = X.card[0] > target && X.card[1] > target;
      return ok ? { winner: xId, loser: yId, both: xId } : { winner: yId, loser: xId, both: xId };
    }
    const a = val(A), b = val(B);
    if (a === b) return { tie: true };
    return a > b ? { winner: aId, loser: bId } : { winner: bId, loser: aId };
  }

  showdown(foldedId) {
    this.clearTimers();
    const [p1, p2] = this.players.map((p) => p.id);
    let outcome;
    if (foldedId) {
      const w = this.other(foldedId);
      outcome = { winner: w, loser: foldedId, both: this.ps.get(w).side === 'both' ? w : null, folded: true };
    } else outcome = this.judge(p1, p2);

    const pot = this.pot;
    let bonus = 0;
    if (outcome.tie) {
      this.carry = pot; // the next hand's winner takes it
    } else {
      const W = this.ps.get(outcome.winner), L = this.ps.get(outcome.loser);
      // Both-sides penalty: winning a both-sides bet, or folding against one.
      if (outcome.both === outcome.winner) bonus = Math.min(CFG.bonus, L.chips);
      L.chips -= bonus;
      W.chips += pot + bonus;
    }
    this.pot = 0;

    const reveal = (id) => {
      const s = this.ps.get(id);
      if (outcome.folded) return {};
      if (s.side === 'both') return { front: s.card[0], back: s.card[1] };
      return s.side === 'back' ? { back: s.card[1] } : { front: s.card[0] };
    };
    const winners = outcome.tie ? [] : [outcome.winner];
    this.result = {
      winners,
      tie: !!outcome.tie,
      voided: !!outcome.tie, // no winner spotlight on a draw
      uncontested: !!outcome.folded,
      foldedId: foldedId || null,
      bothId: outcome.both || null,
      bothWon: !!outcome.both && outcome.both === outcome.winner,
      bonus,
      pot,
      carry: this.carry,
      ante: CFG.ante,
      share: outcome.tie ? 0 : pot + bonus,
      hands: [p1, p2].map((id) => {
        const s = this.ps.get(id);
        return { id, side: s.side, level: s.level, bet: s.put, penalty: 0, folded: s.folded, front: s.card[0], ...reveal(id), value: outcome.folded ? null : s.side === 'back' ? s.card[1] : s.side === 'both' ? Math.min(...s.card) : s.card[0] };
      }),
    };
    // The front is always public; only revealed backs are sent to the other player (viewFor).
    this.room.onRound?.(this.players.map((p) => {
      const s = this.ps.get(p.id);
      const won = winners.includes(p.id);
      const net = won ? pot + bonus - s.put - s.ante : -(s.put + s.ante + (outcome.loser === p.id ? bonus : 0));
      return { id: p.id, won, net, card: won && !outcome.folded ? this.result.hands.find((h) => h.id === p.id).value : 0 };
    }), 'dual');

    this.phase = 'showdown';
    this.turn = null;
    this.deadline = Date.now() + CFG.showdownMs;
    this.dealId++;
    this.later(CFG.showdownMs, () => this.afterHand());
    this.changed();
    this.botChat(outcome);
  }

  afterHand() {
    const broke = this.players.find((p) => this.ps.get(p.id).chips <= 0);
    if (broke) return this.finish(this.other(broke.id));
    if (this.settings.hands && this.round >= this.settings.hands) return this.finish(null);
    this.deal();
  }

  finish(winnerId) {
    this.clearTimers();
    const list = this.players.slice();
    if (!winnerId) {
      const [a, b] = list.map((p) => this.ps.get(p.id).chips);
      winnerId = a === b ? null : a > b ? list[0].id : list[1].id;
    }
    // Leftover carry-over goes back to whoever won the game.
    if (this.carry && winnerId) { this.ps.get(winnerId).chips += this.carry; this.carry = 0; }
    const order = list.sort((a, b) => (a.id === winnerId ? -1 : b.id === winnerId ? 1 : this.ps.get(b.id).chips - this.ps.get(a.id).chips));
    const standings = order.map((p) => ({ id: p.id, name: p.name, bot: p.bot || null, chips: this.ps.get(p.id).chips }));
    this.final = { standings, championId: winnerId, reason: this.settings.hands && this.round >= this.settings.hands && !this.players.some((p) => this.ps.get(p.id).chips <= 0) ? 'rounds' : 'bust' };
    this.final.ratings = this.room.onFinish?.(standings, 'dual') || [];
    for (const p of this.players) this.ps.get(p.id).ready = !!p.bot;
    this.phase = 'gameover';
    this.turn = null;
    this.deadline = null;
    this.changed();
  }

  // ---- bots -----------------------------------------------------------

  // Chance that my number v beats the opponent's chosen number, over every
  // back the opponent could have (their front is public).
  oppValues(oppId) {
    const o = this.ps.get(oppId);
    const f = o.card[0];
    const backs = [];
    for (let b = 1; b <= 10; b++) if (b !== f) backs.push(b);
    if (o.side === 'front') return [f];
    if (o.side === 'back') return backs.filter((b) => b >= Math.min(f, 6)); // they picked the back: probably a decent one
    if (o.side === 'both') return backs.map((b) => Math.min(f, b)); // must beat both of theirs: the lower one
    return backs.map((b) => Math.max(f, b)); // undecided: they'll pick their better side
  }

  winChance(myId, side) {
    const s = this.ps.get(myId);
    const oppId = this.other(myId);
    const o = this.ps.get(oppId);
    const vals = this.oppValues(oppId);
    if (!vals.length) return 0.5;
    let p = 0;
    for (const v of vals) {
      if (side === 'both') p += s.card[0] > v && s.card[1] > v ? 1 : 0;
      else if (o.side === 'both') {
        // Against a both-sides bettor: I win if either of their sides fails to beat my number.
        const mine = side === 'back' ? s.card[1] : s.card[0];
        p += v <= mine ? 1 : 0;
      } else {
        const mine = side === 'back' ? s.card[1] : s.card[0];
        p += mine > v ? 1 : mine === v ? 0.5 : 0;
      }
    }
    return p / vals.length;
  }

  botTurn() {
    const p = this.players.find((x) => x.id === this.turn);
    if (!p?.bot) return;
    const L = BOT[p.bot] || BOT.normal;
    const dealId = this.dealId;
    const id = p.id;
    this.timers.push(setTimeout(() => {
      if (this.phase !== 'bet' || this.turn !== id || this.dealId !== dealId) return;
      this.botAct(id, L);
    }, rand(...L.think)));
  }

  botAct(id, L) {
    const s = this.ps.get(id);
    const o = this.ps.get(this.other(id));
    // Pick a side (or keep the one already chosen).
    let side = s.side;
    let p;
    if (!side) {
      const front = this.winChance(id, 'front');
      const back = this.winChance(id, 'back');
      side = back > front ? 'back' : 'front';
      p = Math.max(front, back);
      const both = this.sideOk(id, 'both') ? this.winChance(id, 'both') : 0;
      if (both >= L.both && chance(0.85)) { side = 'both'; p = both; }
    } else p = this.winChance(id, side);
    p = Math.min(1, Math.max(0, p + (crypto.randomInt(2001) / 1000 - 1) * L.noise));
    const bluff = chance(L.bluff);
    const cap = this.tableCap(id, side);
    const toCall = o.acted ? o.level : null;
    const foldCost = o.side === 'both' ? CFG.bonus : 0;

    if (toCall === null) {
      // Opening the hand.
      if (p < 0.35 && !bluff) return cap === 0 ? this.raise(id, side, 0) : this.fold(id);
      const size = p > 0.85 ? rand(3, 7) : p > 0.65 ? rand(2, 4) : 1;
      return this.raise(id, side, Math.min(cap, Math.max(cap === 0 ? 0 : 1, size)));
    }
    const callCost = (toCall - s.level) * this.mult(side);
    // Strong: raise (sometimes slow-play with a call).
    if ((p > 0.78 || (bluff && p > 0.3)) && cap > toCall && chance(0.7)) {
      const step = p > 0.9 ? rand(3, 8) : rand(1, 4);
      return this.raise(id, side, Math.min(cap, toCall + step));
    }
    // Worth calling? Compare the risk with the pot (and the both-sides penalty).
    const potAfter = this.pot + callCost;
    const ev = p * potAfter - (1 - p) * callCost + foldCost;
    if (p >= 0.45 || ev > 0) return this.call(id, side);
    return this.fold(id);
  }

  botChat(outcome) {
    if (outcome.tie) return;
    const w = this.players.find((p) => p.id === outcome.winner);
    const l = this.players.find((p) => p.id === outcome.loser);
    const who = w?.bot && chance(outcome.both === outcome.winner ? 0.8 : 0.25) ? [w, Bots.WIN_STICKERS]
      : l?.bot && chance(0.2) ? [l, Bots.LOSE_STICKERS] : null;
    if (!who) return;
    this.later(rand(900, 2000), () => this.room.postChat({ playerId: who[0].id, name: who[0].name, kind: 'sticker', sticker: Bots.pickOne(who[1]) }));
  }

  // ---- view -----------------------------------------------------------

  viewFor(viewerId) {
    const me = this.ps.get(viewerId);
    const inHand = this.phase === 'bet' || this.phase === 'showdown';
    const myTurn = this.phase === 'bet' && this.turn === viewerId;
    let options = null;
    if (myTurn && me) {
      const o = this.ps.get(this.other(viewerId));
      const sides = Object.fromEntries(SIDES.map((sd) => [sd, this.sideOk(viewerId, sd) ? { cap: this.tableCap(viewerId, sd) } : null]));
      options = { sides, toCall: o.acted ? o.level : null, myLevel: me.level, oppLevel: o.level, mySide: me.side, foldPenalty: o.side === 'both' ? CFG.bonus : 0, canOpenZero: !me.acted && !o.acted };
    }
    const revealed = (id) => (this.phase === 'showdown' && this.result ? this.result.hands.find((h) => h.id === id) : null);
    return {
      game: 'dual',
      phase: this.phase,
      dealId: this.dealId,
      round: this.round,
      maxRounds: this.settings.hands || 0,
      maxPlayers: 2,
      minPlayers: 2,
      lateJoinRound: 0,
      canSit: this.canSit(),
      ante: CFG.ante,
      pot: this.pot,
      carry: this.carry,
      bonus: CFG.bonus,
      startChips: CFG.startChips,
      deckLeft: this.deck.length,
      deadline: this.deadline,
      settings: this.settings,
      durations: { bet: this.settings.turnSec * 1000, showdown: CFG.showdownMs },
      notice: this.notice,
      turn: this.turn,
      firstId: this.firstId,
      dealerId: this.firstId,
      options,
      grid: [],
      board: [],
      players: this.players.map((p) => {
        const s = this.ps.get(p.id);
        const mine = p.id === viewerId;
        const r = revealed(p.id);
        let back = null;
        if (inHand && s.card) {
          if (mine) back = s.card[1];
          else if (r && r.back !== undefined) back = r.back;
        }
        return {
          id: p.id, name: p.name, bot: p.bot || null, connected: p.connected, ready: s.ready, pending: false, out: false,
          chips: s.chips, front: inHand && s.card ? s.card[0] : null, back, hasCard: inHand && !!s.card,
          side: s.side, level: s.level, bet: s.put, folded: s.folded, lastAction: s.lastAction,
        };
      }),
      result: this.result,
      final: this.final,
    };
  }
}

DualPoker.CFG = CFG;
DualPoker.makeDeck = makeDeck;
module.exports = DualPoker;
