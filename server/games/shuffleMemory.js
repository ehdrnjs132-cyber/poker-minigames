const crypto = require('crypto');
const MemoryPoker = require('./memoryPoker');

const SPEEDS = { slow: 950, normal: 680, fast: 440 };
const SWAP_COUNTS = [3, 5, 8, 12, 16];

/**
 * 셔플 메모리 (Shuffle Memory) — Memory Poker, part 2.
 * After the cards flip face down, pairs of cards visibly swap places like a
 * shell game. Players must track where the good cards went before picking.
 *
 * The swap list only contains positions, which every player sees animate
 * anyway, so sending it to clients leaks nothing about card identities.
 */
class ShuffleMemory extends MemoryPoker {
  static meta = { ...MemoryPoker.meta, id: 'shuffle', name: '셔플 메모리' };

  static normalizeSettings(raw = {}) {
    const base = MemoryPoker.normalizeSettings(raw);
    const n = Math.round(Number(raw.swaps));
    return {
      ...base,
      swaps: SWAP_COUNTS.includes(n) ? n : 5,
      speed: Object.hasOwn(SPEEDS, raw.speed) ? raw.speed : 'normal',
    };
  }

  constructor(room, settings) {
    super(room, settings);
    this.stepMs = SPEEDS[this.settings.speed];
    this.swapCount = this.settings.swaps; // bots lose track as swaps pile up
    // A little lead-in so clients can settle after the flip, plus a tail.
    this.shuffleMs = 600 + this.settings.swaps * this.stepMs + 500;
    this.swaps = [];
  }

  afterReveal() {
    this.swaps = this.makeSwaps(this.settings.swaps);
    for (const [a, b] of this.swaps) [this.grid[a], this.grid[b]] = [this.grid[b], this.grid[a]];
    this.setPhase('shuffle', this.shuffleMs, () => this.startPick());
  }

  makeSwaps(count) {
    const size = MemoryPoker.CFG.gridSize;
    const swaps = [];
    let last = [];
    while (swaps.length < count) {
      const a = crypto.randomInt(size);
      const b = crypto.randomInt(size);
      // Distinct cards, and don't touch the pair that just moved.
      if (a === b || last.includes(a) || last.includes(b)) continue;
      swaps.push([a, b]);
      last = [a, b];
    }
    return swaps;
  }

  boardPhases() {
    // Keep the board hidden during the shuffle so eyes stay on the grid.
    return ['pick', 'showdown', 'gameover'];
  }

  extraView() {
    return {
      shuffle: this.phase === 'shuffle' ? { swaps: this.swaps, stepMs: this.stepMs, leadMs: 600 } : null,
    };
  }
}

module.exports = ShuffleMemory;
