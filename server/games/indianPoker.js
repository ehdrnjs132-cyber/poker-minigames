const MemoryPoker = require('./memoryPoker');
const { shuffle } = require('../cards');

const CFG = {
  // Antes climb every 3 rounds so the late game gets tense.
  antes: [20, 20, 20, 40, 40, 40, 60, 60, 60, 100, 100, 100],
  maxRounds: 12,
  showdownMs: 7500,
  topPenalty: 100, // folding an Ace (the top card) costs this
  minRaise: 20,
  maxRaises: 12,
};
// Standard poker ranks, low to high: 2 3 4 5 6 7 8 9 10 J Q K A.
// Two suits (♠ and ♥) = 26 cards, so each rank appears twice (countable).
const RANKS = '23456789TJQKA';
const VALUE = Object.fromEntries([...RANKS].map((r, i) => [r, i + 2])); // 2..14 (A = 14)
const DECK = [...[...RANKS].map((r) => `${r}s`), ...[...RANKS].map((r) => `${r}h`)];
const value = (code) => (code ? VALUE[code[0]] : 0);
const TOP = 14;

/**
 * 인디언 포커 (Indian Poker / Blind Man's Bluff), 2–6 players.
 * Everyone wears one card on their forehead: you see every card but your own.
 * Free betting: raise any amount (min raise .. all-in), and you may fold at any
 * moment of the betting round, even out of turn. Highest number wins the pot,
 * ties split. Folding an Ace (the top card) costs a penalty. The deck is only reshuffled when it
 * runs out and revealed cards stay visible, so card counting pays off.
 */
class IndianPoker extends MemoryPoker {
  static meta = { ...MemoryPoker.meta, id: 'indian', name: '인디언 포커' };

  static normalizeSettings(raw = {}) {
    const { players } = MemoryPoker.normalizeSettings(raw);
    return { players, betting: true, turnSec: MemoryPoker.clampInt(raw.turnSec, 20, 10, 60) };
  }

  freeRaise() { return true; }
  minRaise() { return CFG.minRaise; }
  maxRaisesN() { return CFG.maxRaises; }

  resetHand(s) {
    super.resetHand(s);
    s.card = null;
  }

  toLobby(notice) {
    this.deck = [];
    this.discards = [];
    super.toLobby(notice);
  }

  isGameOver() {
    const alive = this.activePlayers().filter((p) => this.ps.get(p.id).chips > 0);
    return this.round >= CFG.maxRounds || alive.length < MemoryPoker.CFG.minPlayers;
  }

  startGame() {
    this.deck = [];
    this.discards = [];
    super.startGame();
  }

  nextRound() {
    this.round++;
    for (const s of this.ps.values()) {
      if (s.pending) { s.pending = false; s.out = false; } // late joiners sit in now
      if (s.chips <= 0) s.out = true;
    }
    const active = this.activePlayers();
    if (this.deck.length < active.length) {
      this.deck = shuffle(DECK);
      this.discards = [];
      this.reshuffledAt = this.round;
    }
    for (const s of this.ps.values()) this.resetHand(s);
    const scheduled = CFG.antes[Math.min(this.round - 1, CFG.antes.length - 1)];
    this.ante = Math.min(scheduled, ...active.map((p) => this.ps.get(p.id).chips));
    this.pot = 0;
    for (const p of active) {
      const s = this.ps.get(p.id);
      s.chips -= this.ante;
      this.pot += this.ante;
      s.card = this.deck.pop();
    }
    this.result = null;
    this.dealId++;
    this.rotateDealer();
    this.startBetting();
  }

  // Fold any time during the betting round, not only on your turn.
  onAction(playerId, action) {
    if (this.paused) return;
    if (action?.type === 'fold' && this.phase === 'bet' && playerId !== this.turnId) return void this.foldNow(playerId);
    return super.onAction(playerId, action);
  }

  foldNow(playerId) {
    const s = this.ps.get(playerId);
    if (!s || s.out || s.folded || s.pending) return;
    s.folded = true;
    s.acted = true;
    this.onFold(s);
    s.lastAction = { kind: 'fold' };
    if (this.inHand().length <= 1) return this.betDone();
    this.changed();
  }

  // Folding an Ace is punished: the penalty goes into the pot.
  onFold(s) {
    if (value(s.card) === TOP) {
      s.penalty = Math.min(CFG.topPenalty, s.chips);
      s.chips -= s.penalty;
      this.pot += s.penalty;
    }
  }

  showdown() {
    this.turnId = null;
    const active = this.activePlayers();
    const live = this.inHand();
    let winners;
    if (live.length === 1) winners = [live[0].id];
    else {
      const top = Math.max(...live.map((p) => value(this.ps.get(p.id).card)));
      winners = live.filter((p) => value(this.ps.get(p.id).card) === top).map((p) => p.id);
    }
    const share = Math.floor(this.pot / winners.length);
    let remainder = this.pot - share * winners.length;
    for (const id of winners) {
      this.ps.get(id).chips += share + (remainder > 0 ? 1 : 0);
      remainder--;
    }
    const hands = active.map((p) => {
      const s = this.ps.get(p.id);
      return { id: p.id, card: s.card, value: value(s.card), folded: s.folded, bet: s.bet, penalty: s.penalty };
    });
    // Revealed cards go to the visible discard history (for card counting).
    this.discards.push(...hands.map((h) => h.card));
    this.result = {
      hands, winners, pot: this.pot, share, ante: this.ante,
      uncontested: live.length === 1 && hands.length > 1, final: this.isGameOver(),
    };
    this.room.onRound?.(hands.map((h) => ({
      id: h.id, won: winners.includes(h.id), card: h.folded ? 0 : h.value,
      net: (winners.includes(h.id) ? share : 0) - this.ante - h.bet - h.penalty,
    })), 'indian');
    this.pot = 0;
    this.setPhase('showdown', CFG.showdownMs, () => this.afterShowdown());
  }

  // ---- bots: estimate my own (unseen) card from what's left in the deck ----

  ownCardPool(p) {
    const level = { easy: 0, normal: 0.5, hard: 1 }[p.bot] ?? 0.5;
    const seen = this.activePlayers().filter((x) => x.id !== p.id).map((x) => this.ps.get(x.id).card);
    const remembered = this.discards.slice(this.discards.length - Math.round(this.discards.length * level));
    const pool = DECK.slice();
    for (const c of [...seen, ...remembered]) {
      const i = pool.findIndex((d) => value(d) === value(c));
      if (i >= 0) pool.splice(i, 1);
    }
    return pool;
  }

  botWinChance(p) {
    const pool = this.ownCardPool(p);
    const oppMax = Math.max(0, ...this.inHand().filter((x) => x.id !== p.id).map((x) => value(this.ps.get(x.id).card)));
    return pool.reduce((a, c) => a + (value(c) > oppMax ? 1 : value(c) === oppMax ? 0.5 : 0), 0) / Math.max(1, pool.length);
  }

  botFoldCost(p) {
    if (p.bot === 'easy') return 0;
    const pool = this.ownCardPool(p);
    return (pool.filter((c) => value(c) === TOP).length / Math.max(1, pool.length)) * CFG.topPenalty;
  }

  // Bots size free raises off the pot instead of fixed steps.
  botBetDecision(p) {
    const d = super.botBetDecision(p);
    if (d.type !== 'raise' || d.amount === 'allin') return d;
    const potShare = d.amount >= 100 ? 1 : 0.5;
    return { type: 'raise', to: this.currentBet + Math.max(CFG.minRaise, Math.round((this.pot * potShare) / 10) * 10) };
  }

  // ---- view ---------------------------------------------------------------

  viewFor(viewerId) {
    const reveal = this.phase === 'showdown' || this.phase === 'gameover';
    return {
      game: 'indian',
      phase: this.phase,
      dealId: this.dealId,
      round: this.round,
      maxRounds: CFG.maxRounds,
      maxPlayers: this.maxPlayers,
      minPlayers: MemoryPoker.CFG.minPlayers,
      lateJoinRound: MemoryPoker.CFG.lateJoinRound,
      canSit: this.canSit(),
      ante: this.ante,
      pot: this.pot,
      deadline: this.deadline,
      settings: this.settings,
      durations: { bet: this.turnMs, showdown: CFG.showdownMs },
      notice: this.notice,
      paused: !!this.paused,
      ...this.betView(viewerId),
      topPenalty: CFG.topPenalty,
      deckLeft: this.deck.length,
      discards: this.discards.slice(-20),
      reshuffledAt: this.reshuffledAt || 0,
      grid: [],
      board: [],
      players: this.players.map((p) => {
        const s = this.ps.get(p.id);
        return {
          id: p.id,
          name: p.name,
          bot: p.bot || null,
          connected: p.connected,
          chips: s.chips,
          out: s.out,
          pending: !!s.pending,
          ready: s.ready,
          next: s.next,
          ...this.playerBetView(s),
          hasCard: !!s.card,
          // Never send a player their own card before the reveal.
          card: s.card && (p.id !== viewerId || reveal) ? s.card : null,
        };
      }),
      result: reveal ? this.result : null,
      final: this.final,
    };
  }
}

IndianPoker.CFG = CFG;
IndianPoker.value = value;
module.exports = IndianPoker;
