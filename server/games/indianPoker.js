const MemoryPoker = require('./memoryPoker');
const { shuffle } = require('../cards');

const CFG = {
  ante: 20,
  maxRounds: 12,
  showdownMs: 7000,
  tenPenalty: 100,
};
// Two sets of 1–10: ♠ set and ♥ set. Codes reuse the card renderer ('T' = 10).
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'T'];
const DECK = [...RANKS.map((r) => `${r}s`), ...RANKS.map((r) => `${r}h`)];
const value = (code) => (code[0] === 'T' ? 10 : Number(code[0]));

/**
 * 인디언 포커 (Indian Poker / Blind Man's Bluff), 2–6 players.
 * Everyone holds one card on their forehead: you see every card but your own.
 * One betting round (shared engine in memoryPoker.js), then the highest
 * number wins the pot; ties split. Folding while holding a 10 costs a penalty.
 * The deck is only reshuffled when it runs out, and revealed cards are shown,
 * so players (and the hard bot) can count cards.
 */
class IndianPoker extends MemoryPoker {
  static meta = { ...MemoryPoker.meta, id: 'indian', name: '인디언 포커' };

  static normalizeSettings(raw = {}) {
    const { players } = MemoryPoker.normalizeSettings(raw);
    return { players, betting: true, turnSec: MemoryPoker.clampInt(raw.turnSec, 20, 10, 60) };
  }

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
    for (const s of this.ps.values()) if (s.chips <= 0) s.out = true;
    const active = this.activePlayers();
    if (this.deck.length < active.length) {
      this.deck = shuffle(DECK);
      this.discards = [];
      this.reshuffledAt = this.round;
    }
    for (const s of this.ps.values()) this.resetHand(s);
    this.ante = Math.min(CFG.ante, ...active.map((p) => this.ps.get(p.id).chips));
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

  // Folding a 10 is punished: the penalty goes into the pot.
  onFold(s) {
    if (value(s.card) === 10) {
      s.penalty = Math.min(CFG.tenPenalty, s.chips);
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
      uncontested: live.length === 1, final: this.isGameOver(),
    };
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
    return (pool.filter((c) => value(c) === 10).length / Math.max(1, pool.length)) * CFG.tenPenalty;
  }

  // ---- view ---------------------------------------------------------------

  viewFor(viewerId) {
    const reveal = this.phase === 'showdown' || this.phase === 'gameover';
    return {
      game: 'indian',
      gameName: IndianPoker.meta.name,
      phase: this.phase,
      dealId: this.dealId,
      round: this.round,
      maxRounds: CFG.maxRounds,
      maxPlayers: this.maxPlayers,
      minPlayers: MemoryPoker.CFG.minPlayers,
      ante: this.ante,
      pot: this.pot,
      deadline: this.deadline,
      settings: this.settings,
      durations: { bet: this.turnMs, showdown: CFG.showdownMs },
      notice: this.notice,
      ...this.betView(viewerId),
      tenPenalty: CFG.tenPenalty,
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
