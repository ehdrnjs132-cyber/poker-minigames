const crypto = require('crypto');
const { makeDeck, shuffle } = require('../cards');
const { bestHand, compareScores } = require('../handEval');
const Bots = require('../bots');

const CFG = {
  gridSize: 16,
  picks: 2,
  memorizeMs: 30000,
  revealMs: 2500,
  pickMs: 20000,
  turnMs: 15000,
  showdownMs: 9000,
  startChips: 1000,
  maxRounds: 10,
  antes: [50, 50, 100, 100, 150, 150, 200, 200, 300, 300],
  minPlayers: 2,
  maxPlayers: 6,
  defaultPlayers: 4,
  maxRaises: 4,
  raiseSteps: [50, 100],
  lateJoinRound: 6, // newcomers can take a seat mid-game and play from the next round, up to round 6
};
const ACTIVE_PHASES = ['memorize', 'reveal', 'shuffle', 'pick', 'bet', 'showdown'];
const BET_ACTIONS = ['check', 'call', 'raise', 'fold'];

const clampInt = (v, def, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/**
 * 기억 포커 (Memory Poker)
 * 16 cards are shown face up, then flipped face down (players remember
 * positions only). 5 community cards are dealt; each player secretly picks
 * 2 positions (several players may pick the same card). Optionally a betting
 * round follows, where players bet on how well they remembered. Best 5 of 7
 * among players who didn't fold wins. 2–6 players; busted players are out.
 *
 * This is also the base class for the other games (nutRace.js), which override the hooks below. It holds the
 * shared lobby / ready / elimination / bot plumbing and the betting engine.
 * The server is authoritative: grid cards are only sent to clients in the
 * phases listed by gridPhases().
 */
class MemoryPoker {
  static meta = { id: 'memory', name: '기억 포커', minPlayers: CFG.minPlayers, maxPlayers: CFG.maxPlayers };

  // Room-creator options; anything invalid falls back to the defaults.
  static normalizeSettings(raw = {}) {
    return {
      players: clampInt(raw.players, CFG.defaultPlayers, CFG.minPlayers, CFG.maxPlayers),
      memorizeSec: clampInt(raw.memorizeSec, CFG.memorizeMs / 1000, 5, 90),
      pickSec: clampInt(raw.pickSec, CFG.pickMs / 1000, 5, 60),
      betting: raw.betting !== 'off' && raw.betting !== false,
      turnSec: clampInt(raw.turnSec, CFG.turnMs / 1000, 10, 60),
    };
  }

  constructor(room, settings) {
    this.room = room;
    this.settings = this.constructor.normalizeSettings(settings);
    this.maxPlayers = this.settings.players;
    this.memorizeMs = (this.settings.memorizeSec || 0) * 1000;
    this.pickMs = (this.settings.pickSec || 0) * 1000;
    this.turnMs = (this.settings.turnSec || CFG.turnMs / 1000) * 1000;
    this.ps = new Map();
    this.timer = null;
    this.botTimers = [];
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
    return this.phase === 'lobby' && this.players.length < this.maxPlayers;
  }

  // Joining a game in progress: a free seat and no later than round LATE_JOIN_ROUND.
  // The newcomer sits out until the next round starts.
  canLateJoin() {
    return this.players.length < this.maxPlayers
      && (this.phase === 'gameover' || (ACTIVE_PHASES.includes(this.phase) && this.round < CFG.lateJoinRound));
  }

  canSit() {
    return this.canJoin() || this.canLateJoin();
  }

  activePlayers() {
    return this.players.filter((p) => this.ps.get(p.id) && !this.ps.get(p.id).out);
  }

  // ---- hooks for variants ----------------------------------------------

  startRound() {
    this.setPhase('memorize', this.memorizeMs, () => this.startReveal());
  }

  afterReveal() {
    this.startPick();
  }

  bettingOn() {
    return !!this.settings.betting;
  }

  gridPhases() {
    return ['memorize', 'showdown', 'gameover'];
  }

  boardPhases() {
    return ['reveal', 'pick', 'bet', 'showdown', 'gameover'];
  }

  // Default: best hand wins, equal hands split.
  pickWinners(hands) {
    let top = null;
    for (const h of hands) if (!top || compareScores(h.score, top) > 0) top = h.score;
    return hands.filter((h) => compareScores(h.score, top) === 0).map((h) => h.id);
  }

  extraResult(/* hands */) {
    return {};
  }

  extraView() {
    return {};
  }

  // Called when a player folds (Indian Poker charges a penalty here).
  onFold(/* s */) {}

  botPlan(player) {
    return Bots.memoryPlan(this.grid, this.board, player.bot, { swaps: this.swapCount || 0, maxDelay: this.pickMs - 1200 });
  }

  // Chance (0..1) that this bot beats everyone still in the hand.
  botWinChance(player) {
    const s = this.ps.get(player.id);
    const opponents = Math.max(1, this.inHand().length - 1);
    return Math.pow(s.botConfidence ?? 0.35, opponents);
  }

  // Extra cost a bot attaches to folding (Indian Poker: maybe folding a 10).
  botFoldCost(/* player */) {
    return 0;
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
    this.dealerIdx = -1;
    this.turnId = null;
    this.currentBet = 0;
    this.raises = 0;
    this.dealId++;
    for (const p of this.players) {
      const s = this.ps.get(p.id);
      if (!s) continue;
      s.chips = CFG.startChips;
      s.ready = !!p.bot;
      s.out = false;
      this.resetHand(s);
    }
    this.runBots();
  }

  resetHand(s) {
    s.picks = [];
    s.locked = false;
    s.lockedAt = null;
    s.memorized = false;
    s.next = false;
    s.bet = 0;
    s.folded = false;
    s.acted = false;
    s.lastAction = null;
    s.penalty = 0;
    s.botConfidence = null;
    s.dq = false;
  }

  onJoin(player) {
    const s = { chips: CFG.startChips, ready: !!player.bot, out: false, pending: false };
    // Mid-game arrivals wait for the next deal (out of this hand, no ante).
    if (ACTIVE_PHASES.includes(this.phase)) { s.out = true; s.pending = true; }
    this.resetHand(s);
    this.ps.set(player.id, s);
    this.notice = null;
  }

  // Called after the player has been removed from room.players.
  onLeave(playerId, name) {
    const wasTurn = this.turnId === playerId;
    this.ps.delete(playerId);
    const inGame = ACTIVE_PHASES.includes(this.phase);
    if (inGame || this.phase === 'gameover') {
      const humans = this.players.filter((p) => !p.bot).length;
      if (this.players.length < CFG.minPlayers || humans === 0) return this.toLobby({ code: 'srv.oppLeft', name, at: Date.now() });
      this.notice = { code: 'sys.left', name, at: Date.now() };
      if (inGame && this.activePlayers().length < CFG.minPlayers) return this.finish();
      if (this.phase === 'bet' && (wasTurn || this.inHand().length <= 1)) return this.advance();
      if (inGame) this.checkProgress();
    } else {
      // Someone left the waiting room: humans re-confirm before a surprise start.
      for (const p of this.players) if (!p.bot) this.ps.get(p.id).ready = false;
    }
  }

  dispose() {
    this.clearTimer();
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.botTimers.forEach(clearTimeout);
    this.botTimers = [];
  }

  setPhase(phase, ms, then) {
    this.clearTimer();
    this.phase = phase;
    this.phaseStartedAt = Date.now();
    this.deadline = ms ? Date.now() + ms : null;
    if (ms) this.timer = setTimeout(then, ms);
    this.changed();
    this.runBots();
  }

  // Everyone still playing (connected, not eliminated) satisfies pred.
  allActive(pred) {
    const live = this.activePlayers().filter((p) => p.connected);
    return live.length > 0 && live.every((p) => pred(this.ps.get(p.id)));
  }

  // Advance early when nobody is left to wait for. Returns true if advanced.
  checkProgress() {
    if (this.phase === 'memorize' && this.allActive((s) => s.memorized)) return this.startReveal(), true;
    if (this.phase === 'pick' && this.allActive((s) => s.locked)) return this.afterPick(), true;
    if (this.phase === 'showdown' && this.allActive((s) => s.next)) return this.afterShowdown(), true;
    return false;
  }

  tryStart() {
    const ready = this.players.length >= CFG.minPlayers && this.players.every((p) => this.ps.get(p.id).ready);
    if ((this.phase === 'lobby' || this.phase === 'gameover') && ready) return this.startGame(), true;
    return false;
  }

  // ---- betting engine (shared) -----------------------------------------
  // One betting round: check / call / raise / fold, turn by turn.
  // Bets are capped at the shortest stack still in the hand, so no side pots.

  inHand() {
    return this.activePlayers().filter((p) => !this.ps.get(p.id).folded);
  }

  cap() {
    const live = this.inHand().map((p) => this.ps.get(p.id));
    return live.length ? Math.min(...live.map((s) => s.chips + s.bet)) : 0;
  }

  canAct(p) {
    const s = this.ps.get(p.id);
    return !!s && !s.out && !s.folded && s.chips > 0;
  }

  nextIndex(from, pred) {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + k) % n) + n) % n;
      const p = this.players[i];
      if (this.ps.get(p.id) && !this.ps.get(p.id).out && pred(p)) return i;
    }
    return Math.max(0, from);
  }

  rotateDealer() {
    this.dealerIdx = this.nextIndex(this.dealerIdx, () => true);
  }

  startBetting() {
    this.currentBet = 0;
    this.raises = 0;
    for (const s of this.ps.values()) {
      s.bet = 0;
      s.acted = false;
      s.lastAction = null;
    }
    // Nobody to bet against (others disqualified) or everyone all-in: skip.
    if (this.inHand().length <= 1 || !this.activePlayers().some((p) => this.canAct(p))) return this.betDone();
    this.startTurn(this.players[this.nextIndex(this.dealerIdx, (p) => this.canAct(p))].id);
  }

  startTurn(id) {
    this.turnId = id;
    this.setPhase('bet', this.turnMs, () => this.onTurnTimeout());
  }

  onTurnTimeout() {
    const s = this.ps.get(this.turnId);
    if (!s) return this.advance();
    this.applyBet(this.turnId, s.bet === this.currentBet ? { type: 'check' } : { type: 'fold' });
  }

  advance() {
    const live = this.inHand();
    if (live.length <= 1) return this.betDone();
    const needs = (p) => {
      const s = this.ps.get(p.id);
      return this.canAct(p) && (!s.acted || s.bet < this.currentBet);
    };
    if (!live.some(needs)) return this.betDone();
    const from = this.players.findIndex((p) => p.id === this.turnId);
    this.startTurn(this.players[this.nextIndex(from, needs)].id);
  }

  betDone() {
    this.turnId = null;
    this.showdown();
  }

  applyBet(playerId, action) {
    const s = this.ps.get(playerId);
    if (this.phase !== 'bet' || playerId !== this.turnId || !s || s.folded || s.out) return false;
    const toCall = this.currentBet - s.bet;
    switch (action.type) {
      case 'check':
        if (toCall !== 0) return false;
        s.lastAction = { kind: 'check' };
        break;
      case 'call': {
        if (toCall <= 0) return false;
        const pay = Math.min(toCall, s.chips);
        s.chips -= pay;
        s.bet += pay;
        this.pot += pay;
        s.lastAction = { kind: s.chips === 0 ? 'allin' : 'call', amount: pay };
        break;
      }
      case 'raise': {
        const cap = this.cap();
        if (this.raises >= CFG.maxRaises || cap <= this.currentBet) return false;
        const step = action.amount === 'allin' ? Infinity : Number(action.amount);
        if (step !== Infinity && !CFG.raiseSteps.includes(step)) return false;
        const target = Math.min(this.currentBet + step, cap);
        const pay = target - s.bet;
        if (pay <= 0 || pay > s.chips) return false;
        s.chips -= pay;
        s.bet = target;
        this.pot += pay;
        this.currentBet = target;
        this.raises++;
        for (const p of this.inHand()) if (p.id !== playerId) this.ps.get(p.id).acted = false;
        s.lastAction = { kind: s.chips === 0 || target === cap ? 'allin' : 'raise', amount: target };
        break;
      }
      case 'fold':
        s.folded = true;
        this.onFold(s);
        s.lastAction = { kind: 'fold' };
        break;
      default:
        return false;
    }
    s.acted = true;
    this.advance();
    return true;
  }

  // Shared bot betting brain: compare win chance with pot odds.
  botBetDecision(p) {
    const L = { easy: { noise: 0.3, bluff: 0.05 }, normal: { noise: 0.12, bluff: 0.1 }, hard: { noise: 0.04, bluff: 0.14 } }[p.bot]
      || { noise: 0.12, bluff: 0.1 };
    const s = this.ps.get(p.id);
    let win = this.botWinChance(p);
    win = Math.min(1, Math.max(0, win + (crypto.randomInt(2001) / 1000 - 1) * L.noise));
    const toCall = this.currentBet - s.bet;
    const canRaise = this.raises < CFG.maxRaises && this.cap() > this.currentBet && s.chips > toCall;
    const roll = crypto.randomInt(1000) / 1000;
    const raise = (amount) => ({ type: 'raise', amount });
    if (toCall === 0) {
      if (canRaise && (win > 0.72 || roll < L.bluff)) return raise(win > 0.9 && p.bot === 'hard' ? 'allin' : win > 0.82 ? 100 : 50);
      return { type: 'check' };
    }
    const callEv = win * (this.pot + toCall) - toCall;
    if (canRaise && win > 0.8 && roll < 0.6) return raise(win > 0.9 ? 100 : 50);
    // Big calls (a large part of the stack) need real confidence, not just pot odds.
    const big = toCall >= s.chips * 0.35;
    const needed = big ? { easy: 0.4, normal: 0.55, hard: 0.6 }[p.bot] ?? 0.55 : 0;
    if (win < needed && this.botFoldCost(p) < toCall * 0.5) return { type: 'fold' };
    if (callEv > -this.botFoldCost(p) || roll < L.bluff / 2) return { type: 'call' };
    return { type: 'fold' };
  }

  // ---- bots ------------------------------------------------------------

  botLater(ms, fn) {
    const key = `${this.phase}:${this.dealId}`;
    this.botTimers.push(setTimeout(() => {
      if (`${this.phase}:${this.dealId}` !== key) return;
      fn();
    }, ms));
  }

  runBots() {
    if (this.phase === 'bet') {
      const p = this.players.find((x) => x.id === this.turnId);
      if (p?.bot) {
        this.botLater(Bots.rand([1200, 2800]), () => {
          if (!this.applyBet(p.id, this.botBetDecision(p))) this.applyBet(p.id, { type: 'fold' });
        });
      }
      return;
    }
    for (const p of this.players) {
      if (!p.bot) continue;
      const s = this.ps.get(p.id);
      if (!s || s.out) continue;
      switch (this.phase) {
        case 'memorize':
          this.botLater(Bots.rand([700, 1600]), () => {
            s.memorized = true;
            if (!this.checkProgress()) this.changed();
          });
          break;
        case 'pick': {
          const plan = this.botPlan(p);
          this.botLater(Math.max(800, plan.delay), () => {
            s.picks = plan.picks;
            s.locked = true;
            s.lockedAt = Date.now() - this.phaseStartedAt;
            s.botConfidence = plan.confidence;
            if (!this.checkProgress()) this.changed();
          });
          break;
        }
        case 'showdown': {
          const won = this.result?.winners.includes(p.id);
          if (crypto.randomInt(100) < 35) {
            this.botLater(Bots.rand([2600, 4200]), () => this.room.postChat({
              kind: 'sticker', playerId: p.id, name: p.name,
              sticker: Bots.pickOne(won ? Bots.WIN_STICKERS : Bots.LOSE_STICKERS),
            }));
          }
          this.botLater(Bots.rand([4200, 5600]), () => {
            s.next = true;
            if (!this.checkProgress()) this.changed();
          });
          break;
        }
        default:
          break;
      }
    }
  }

  // ---- actions ---------------------------------------------------------

  onAction(playerId, action) {
    const s = this.ps.get(playerId);
    if (!s || !action) return;
    if (BET_ACTIONS.includes(action.type)) return void this.applyBet(playerId, action);

    switch (action.type) {
      case 'ready': {
        if (this.phase !== 'lobby' && this.phase !== 'gameover') return;
        s.ready = !s.ready;
        if (this.tryStart()) return;
        break;
      }
      case 'memorized': {
        if (this.phase !== 'memorize' || s.out) return;
        s.memorized = true;
        if (this.checkProgress()) return;
        break;
      }
      case 'pick': {
        if (this.phase !== 'pick' || s.locked || s.out) return;
        const i = Number(action.index);
        if (!Number.isInteger(i) || i < 0 || i >= CFG.gridSize) return;
        const at = s.picks.indexOf(i);
        if (at >= 0) s.picks.splice(at, 1);
        else if (s.picks.length < CFG.picks) s.picks.push(i);
        else return;
        break;
      }
      case 'lock': {
        if (this.phase !== 'pick' || s.out || s.picks.length !== CFG.picks) return;
        s.locked = true;
        s.lockedAt = Date.now() - this.phaseStartedAt;
        if (this.checkProgress()) return;
        break;
      }
      case 'next': {
        if (this.phase !== 'showdown') return;
        s.next = true;
        if (this.checkProgress()) return;
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
      s.out = false;
      s.pending = false;
    }
    this.round = 0;
    this.final = null;
    this.notice = null;
    this.dealerIdx = -1;
    this.nextRound();
  }

  nextRound() {
    this.round++;
    for (const s of this.ps.values()) {
      if (s.pending) { s.pending = false; s.out = false; }
      if (s.chips <= 0) s.out = true;
    }
    const active = this.activePlayers().map((p) => this.ps.get(p.id));
    const scheduled = CFG.antes[Math.min(this.round - 1, CFG.antes.length - 1)];
    // Cap the ante at the shortest stack so nobody needs a side pot.
    this.ante = Math.min(scheduled, ...active.map((s) => s.chips));
    this.pot = 0;
    for (const s of this.ps.values()) this.resetHand(s);
    for (const s of active) {
      s.chips -= this.ante;
      this.pot += this.ante;
    }

    const deck = shuffle(makeDeck());
    this.grid = deck.slice(0, CFG.gridSize);
    this.board = deck.slice(CFG.gridSize, CFG.gridSize + 5);
    this.result = null;
    this.currentBet = 0;
    this.turnId = null;
    this.dealId++;
    this.rotateDealer();
    this.startRound();
  }

  startReveal() {
    this.setPhase('reveal', CFG.revealMs, () => this.afterReveal());
  }

  startPick() {
    this.setPhase('pick', this.pickMs, () => this.afterPick());
  }

  // Time's up: anyone without 2 picks is disqualified for this round (no random
  // picks). They're out of the hand like a fold and lose their ante. Two picks
  // that weren't locked still count (Nut Race treats them as the slowest).
  disqualifyUnpicked(players) {
    for (const p of players) {
      const s = this.ps.get(p.id);
      if (s.folded) continue;
      if (s.picks.length < CFG.picks) {
        s.dq = true;
        s.folded = true;
      }
      s.locked = true;
    }
  }

  afterPick() {
    this.disqualifyUnpicked(this.activePlayers());
    if (this.bettingOn()) this.startBetting();
    else this.showdown();
  }

  showdown() {
    this.turnId = null;
    const active = this.activePlayers();
    this.disqualifyUnpicked(active);
    const hands = active.map((p) => {
      const s = this.ps.get(p.id);
      const cards = s.picks.map((i) => this.grid[i]);
      if (s.dq) return { id: p.id, picks: s.picks.slice(), cards, score: null, best: [], lockedAt: null, folded: true, dq: true, bet: s.bet };
      const bh = bestHand([...cards, ...this.board]);
      return { id: p.id, picks: s.picks.slice(), cards, score: bh.score, best: bh.cards, lockedAt: s.lockedAt, folded: s.folded, bet: s.bet };
    });

    const live = hands.filter((h) => !h.folded);
    // Everyone disqualified: nobody wins, antes go back.
    const voided = live.length === 0;
    const winners = voided ? [] : live.length === 1 ? [live[0].id] : this.pickWinners(live);
    const share = voided ? 0 : Math.floor(this.pot / winners.length);
    if (voided) {
      for (const h of hands) this.ps.get(h.id).chips += this.ante + h.bet;
    } else {
      let remainder = this.pot - share * winners.length;
      for (const id of winners) {
        const s = this.ps.get(id);
        s.chips += share + (remainder > 0 ? 1 : 0);
        remainder--;
      }
    }

    const willEnd = this.isGameOver();
    this.result = {
      hands, winners, pot: this.pot, share, ante: this.ante,
      uncontested: live.length === 1 && hands.length > 1, voided, final: willEnd, ...this.extraResult(hands),
    };
    this.room.onRound?.(hands.map((h) => ({
      id: h.id, won: winners.includes(h.id), score: h.folded ? null : h.score,
      net: voided ? 0 : (winners.includes(h.id) ? share : 0) - this.ante - h.bet,
    })), this.constructor.meta.id);
    this.pot = 0;
    this.setPhase('showdown', CFG.showdownMs, () => this.afterShowdown());
  }

  isGameOver() {
    const alive = this.activePlayers().filter((p) => this.ps.get(p.id).chips > 0);
    return this.round >= CFG.maxRounds || alive.length < CFG.minPlayers;
  }

  afterShowdown() {
    if (this.isGameOver()) this.finish();
    else this.nextRound();
  }

  finish() {
    const standings = this.players
      .map((p) => ({ id: p.id, name: p.name, bot: p.bot || null, chips: this.ps.get(p.id).chips }))
      .sort((a, b) => b.chips - a.chips);
    const championId = standings.length > 1 && standings[0].chips === standings[1].chips ? null : standings[0].id;
    const bust = standings.some((s) => s.chips <= 0);
    this.final = { standings, championId, reason: bust ? 'bust' : 'rounds' };
    for (const p of this.players) this.ps.get(p.id).ready = !!p.bot;
    this.final.ratings = this.room.onFinish?.(standings, this.constructor.meta.id) || [];
    this.setPhase('gameover', 0);
  }

  // ---- view ------------------------------------------------------------

  // Betting fields shared by every game's view.
  betView(viewerId) {
    const me = this.ps.get(viewerId);
    return {
      betting: this.bettingOn(),
      turn: this.turnId,
      currentBet: this.currentBet,
      toCall: me ? Math.max(0, this.currentBet - me.bet) : 0,
      cap: this.phase === 'bet' ? this.cap() : 0,
      raises: this.raises,
      maxRaises: CFG.maxRaises,
      raiseSteps: CFG.raiseSteps,
      dealerId: this.players[this.dealerIdx]?.id || null,
    };
  }

  playerBetView(s) {
    return { folded: s.folded, dq: !!s.dq, bet: s.bet, lastAction: s.lastAction, penalty: s.penalty };
  }

  viewFor(viewerId) {
    const showGrid = this.gridPhases().includes(this.phase);
    const showBoard = this.boardPhases().includes(this.phase);
    const showAllPicks = this.phase === 'showdown' || this.phase === 'gameover';

    return {
      game: this.constructor.meta.id,
      phase: this.phase,
      dealId: this.dealId,
      round: this.round,
      maxRounds: CFG.maxRounds,
      maxPlayers: this.maxPlayers,
      minPlayers: CFG.minPlayers,
      lateJoinRound: CFG.lateJoinRound,
      canSit: this.canSit(),
      ante: this.ante,
      pot: this.pot,
      deadline: this.deadline,
      settings: this.settings,
      durations: { memorize: this.memorizeMs, reveal: CFG.revealMs, shuffle: this.shuffleMs || 0, pick: this.pickMs, bet: this.turnMs, showdown: CFG.showdownMs },
      notice: this.notice,
      ...this.betView(viewerId),
      grid: this.grid.map((card) => ({ card: showGrid ? card : null })),
      board: showBoard ? this.board : [],
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
          memorized: s.memorized,
          locked: s.locked,
          next: s.next,
          pickCount: s.picks.length,
          picks: p.id === viewerId || showAllPicks ? s.picks : null,
          ...this.playerBetView(s),
        };
      }),
      result: showAllPicks ? this.result : null,
      final: this.final,
      ...this.extraView(),
    };
  }
}

MemoryPoker.CFG = CFG;
MemoryPoker.clampInt = clampInt;
module.exports = MemoryPoker;
