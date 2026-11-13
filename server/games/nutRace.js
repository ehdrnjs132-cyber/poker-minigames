const MemoryPoker = require('./memoryPoker');
const Bots = require('../bots');
const { compareScores } = require('../handEval');

/**
 * 너트 레이스 (Nut Race)
 * The 5 community cards and all 16 grid cards are face up from the start.
 * Find the 2 grid cards that make the strongest hand and lock in fast:
 * best hand wins, and among equal hands the fastest lock wins.
 * At showdown the true nuts (best possible pair) is revealed.
 */
class NutRace extends MemoryPoker {
  static meta = { ...MemoryPoker.meta, id: 'nut', name: '너트 레이스' };

  static normalizeSettings(raw = {}) {
    // Same betting round as Memory Poker (after everyone locks in).
    const { players, pickSec, betting, turnSec } = MemoryPoker.normalizeSettings(raw);
    return { players, pickSec, betting, turnSec };
  }

  startRound() {
    this.startPick();
  }

  gridPhases() {
    return ['pick', 'bet', 'showdown', 'gameover']; // everything stays face up while betting
  }

  pickWinners(hands) {
    const best = super.pickWinners(hands);
    if (best.length < 2) return best;
    // Tie on hand strength → fastest lock wins. Auto-picked (no lock) are slowest.
    const time = (id) => hands.find((h) => h.id === id).lockedAt ?? Infinity;
    const fastest = Math.min(...best.map(time));
    return best.filter((id) => time(id) === fastest);
  }

  extraResult(hands) {
    const nuts = Bots.rankPairs(this.grid, this.board)[0];
    // Who found a nuts-strength hand (several pairs can be equally strong).
    const hitters = hands.filter((h) => h.score && compareScores(h.score, nuts.score) === 0).map((h) => h.id);
    return { nuts: { picks: nuts.picks, score: nuts.score }, hitters };
  }

  botPlan(player) {
    return Bots.nutPlan(this.grid, this.board, player.bot, { maxDelay: this.pickMs - 1200 });
  }
}

module.exports = NutRace;
