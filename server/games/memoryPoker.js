const crypto = require('crypto');
const { makeDeck, shuffle } = require('../cards');
const { bestHand, compareScores } = require('../handEval');

const CFG = {
  gridSize: 16,
  picks: 2,
  memorizeMs: 30000,
  revealMs: 2500,
  pickMs: 20000,
  showdownMs: 9000,
  startChips: 1000,
  maxRounds: 10,
  antes: [50, 50, 100, 100, 150, 150, 200, 200, 300, 300],
};
const ACTIVE_PHASES = ['memorize', 'reveal', 'shuffle', 'pick', 'showdown'];

/**
 * 기억 포커 (Memory Poker)
 * 16 cards are shown face up, then flipped face down (players remember
 * positions only). 5 community cards are dealt; each player secretly picks
 * 2 positions (both may pick the same card). Best 5 of 7 wins the pot.
 * Variants (see shuffleMemory.js) extend this class and override the hooks.
 *
 * The server is authoritative: card identities in the grid are only sent
 * to clients during memorize / showdown / gameover.
 */
class MemoryPoker {
  static meta = { id: 'memory', name: '기억 포커', minPlayers: 2, maxPlayers: 2 };

  // Room-creator options; anything invalid falls back to the defaults.
  static normalizeSettings(raw = {}) {
    const sec = (v, def, min, max) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    };
    return {
      memorizeSec: sec(raw.memorizeSec, CFG.memorizeMs / 1000, 5, 90),
      pickSec: sec(raw.pickSec, CFG.pickMs / 1000, 5, 60),
    };
  }

  constructor(room, settings) {
    this.room = room;
    this.settings = this.constructor.normalizeSettings(settings);
    this.memorizeMs = this.settings.memorizeSec * 1000;
    this.pickMs = this.settings.pickSec * 1000;
    this.ps = new Map();
    this.timer = null;
    this.dealId = 0;
    this.toLobby();
  }

  get players() {
    return this.room.players;
  }

  changed() {
    this.room.broadcast();
  }

  canJoin() {
    return this.phase === 'lobby' && this.players.length < this.constructor.meta.maxPlayers;
  }

  // ---- lifecycle -------------------------------------------------------

  toLobby(notice = null) {
    this.clearTimer();
    this.phase = 'lobby';
    this.round = 0;
    this.ante = 0;
    this.pot = 0;
    this.grid = [];
    this.board = [];
    this.result = null;
    this.final = null;
    this.deadline = null;
    this.notice = notice;
    this.dealId++;
    for (const s of this.ps.values()) {
      s.chips = CFG.startChips;
      s.ready = false;
      this.resetHand(s);
    }
  }

  resetHand(s) {
    s.picks = [];
    s.locked = false;
    s.memorized = false;
    s.next = false;
  }

  onJoin(player) {
    const s = { chips: CFG.startChips, ready: false };
    this.resetHand(s);
    this.ps.set(player.id, s);
    this.notice = null;
  }

  // Called after the player has been removed from room.players.
  onLeave(playerId, name) {
    this.ps.delete(playerId);
    if (ACTIVE_PHASES.includes(this.phase) || this.phase === 'gameover') {
      this.toLobby({ code: 'srv.oppLeft', name, at: Date.now() });
    } else {
      for (const s of this.ps.values()) s.ready = false;
    }
  }

  dispose() {
    this.clearTimer();
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  setPhase(phase, ms, then) {
    this.clearTimer();
    this.phase = phase;
    this.deadline = ms ? Date.now() + ms : null;
    if (ms) this.timer = setTimeout(then, ms);
    this.changed();
  }

  allConnected(pred) {
    const live = this.players.filter((p) => p.connected);
    return live.length > 0 && live.every((p) => pred(this.ps.get(p.id)));
  }

  // ---- actions ---------------------------------------------------------

  onAction(playerId, action) {
    const s = this.ps.get(playerId);
    if (!s || !action) return;

    switch (action.type) {
      case 'ready': {
        if (this.phase !== 'lobby' && this.phase !== 'gameover') return;
        s.ready = !s.ready;
        const full = this.players.length === this.constructor.meta.maxPlayers;
        if (full && this.players.every((p) => this.ps.get(p.id).ready)) return this.startGame();
        break;
      }
      case 'memorized': {
        if (this.phase !== 'memorize') return;
        s.memorized = true;
        if (this.allConnected((x) => x.memorized)) return this.startReveal();
        break;
      }
      case 'pick': {
        if (this.phase !== 'pick' || s.locked) return;
        const i = Number(action.index);
        if (!Number.isInteger(i) || i < 0 || i >= CFG.gridSize) return;
        const at = s.picks.indexOf(i);
        if (at >= 0) s.picks.splice(at, 1);
        else if (s.picks.length < CFG.picks) s.picks.push(i);
        else return;
        break;
      }
      case 'lock': {
        if (this.phase !== 'pick' || s.picks.length !== CFG.picks) return;
        s.locked = true;
        if (this.allConnected((x) => x.locked)) return this.showdown();
        break;
      }
      case 'next': {
        if (this.phase !== 'showdown') return;
        s.next = true;
        if (this.allConnected((x) => x.next)) return this.afterShowdown();
        break;
      }
      default:
        return;
    }
    this.changed();
  }

  // ---- flow ------------------------------------------------------------

  startGame() {
    for (const s of this.ps.values()) {
      s.chips = CFG.startChips;
      s.ready = false;
    }
    this.round = 0;
    this.final = null;
    this.notice = null;
    this.nextRound();
  }

  nextRound() {
    this.round++;
    const scheduled = CFG.antes[Math.min(this.round - 1, CFG.antes.length - 1)];
    const states = this.players.map((p) => this.ps.get(p.id));
    // Cap the ante at the shortest stack so nobody needs a side pot.
    this.ante = Math.min(scheduled, ...states.map((s) => s.chips));
    this.pot = 0;
    for (const s of states) {
      s.chips -= this.ante;
      this.pot += this.ante;
      this.resetHand(s);
    }

    const deck = shuffle(makeDeck());
    this.grid = deck.slice(0, CFG.gridSize);
    this.board = deck.slice(CFG.gridSize, CFG.gridSize + 5);
    this.result = null;
    this.dealId++;
    this.setPhase('memorize', this.memorizeMs, () => this.startReveal());
  }

  startReveal() {
    this.setPhase('reveal', CFG.revealMs, () => this.afterReveal());
  }

  // Hook: variants insert extra phases between the flip and picking.
  afterReveal() {
    this.startPick();
  }

  // Hook: phases in which the community cards are visible.
  boardPhases() {
    return ['reveal', 'pick', 'showdown', 'gameover'];
  }

  // Hook: extra per-variant view fields.
  extraView() {
    return {};
  }

  startPick() {
    this.setPhase('pick', this.pickMs, () => this.showdown());
  }

  showdown() {
    // Anyone who didn't finish picking gets random cards.
    for (const p of this.players) {
      const s = this.ps.get(p.id);
      while (s.picks.length < CFG.picks) {
        const i = crypto.randomInt(CFG.gridSize);
        if (!s.picks.includes(i)) s.picks.push(i);
      }
      s.locked = true;
    }

    const hands = this.players.map((p) => {
      const s = this.ps.get(p.id);
      const cards = s.picks.map((i) => this.grid[i]);
      const bh = bestHand([...cards, ...this.board]);
      return { id: p.id, picks: s.picks.slice(), cards, name: bh.name, desc: bh.desc, score: bh.score, best: bh.cards };
    });

    let top = null;
    for (const h of hands) if (!top || compareScores(h.score, top) > 0) top = h.score;
    const winners = hands.filter((h) => compareScores(h.score, top) === 0).map((h) => h.id);

    const share = Math.floor(this.pot / winners.length);
    let remainder = this.pot - share * winners.length;
    for (const id of winners) {
      const s = this.ps.get(id);
      s.chips += share + (remainder > 0 ? 1 : 0);
      remainder--;
    }

    const willEnd = this.isGameOver();
    this.result = { hands, winners, pot: this.pot, share, ante: this.ante, final: willEnd };
    this.pot = 0;
    this.setPhase('showdown', CFG.showdownMs, () => this.afterShowdown());
  }

  isGameOver() {
    return this.round >= CFG.maxRounds || this.players.some((p) => this.ps.get(p.id).chips <= 0);
  }

  afterShowdown() {
    if (this.isGameOver()) this.finish();
    else this.nextRound();
  }

  finish() {
    const standings = this.players
      .map((p) => ({ id: p.id, name: p.name, chips: this.ps.get(p.id).chips }))
      .sort((a, b) => b.chips - a.chips);
    const championId = standings.length > 1 && standings[0].chips === standings[1].chips ? null : standings[0].id;
    const bust = standings.some((s) => s.chips <= 0);
    this.final = { standings, championId, reason: bust ? 'bust' : 'rounds' };
    for (const s of this.ps.values()) s.ready = false;
    this.setPhase('gameover', 0);
  }

  // ---- view ------------------------------------------------------------

  viewFor(viewerId) {
    const showGrid = ['memorize', 'showdown', 'gameover'].includes(this.phase);
    const showBoard = this.boardPhases().includes(this.phase);
    const showAllPicks = this.phase === 'showdown' || this.phase === 'gameover';

    return {
      game: this.constructor.meta.id,
      gameName: this.constructor.meta.name,
      phase: this.phase,
      dealId: this.dealId,
      round: this.round,
      maxRounds: CFG.maxRounds,
      ante: this.ante,
      pot: this.pot,
      deadline: this.deadline,
      settings: this.settings,
      durations: { memorize: this.memorizeMs, reveal: CFG.revealMs, shuffle: this.shuffleMs || 0, pick: this.pickMs, showdown: CFG.showdownMs },
      notice: this.notice,
      grid: this.grid.map((card) => ({ card: showGrid ? card : null })),
      board: showBoard ? this.board : [],
      players: this.players.map((p) => {
        const s = this.ps.get(p.id);
        return {
          id: p.id,
          name: p.name,
          connected: p.connected,
          chips: s.chips,
          ready: s.ready,
          memorized: s.memorized,
          locked: s.locked,
          next: s.next,
          pickCount: s.picks.length,
          picks: p.id === viewerId || showAllPicks ? s.picks : null,
        };
      }),
      result: showAllPicks ? this.result : null,
      final: this.final,
      ...this.extraView(),
    };
  }
}

MemoryPoker.CFG = CFG;
module.exports = MemoryPoker;
