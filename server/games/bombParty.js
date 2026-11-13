const crypto = require('crypto');
const Bots = require('../bots');

const CFG = {
  minPlayers: 2,
  maxPlayers: 6,
  defaultPlayers: 4,
  lives: 3,
  fuseMin: 9000,      // hidden fuse length per bomb
  fuseMax: 22000,
  flightMs: 650,      // a thrown bomb is in the air this long
  catchMs: 500,       // you must hold it this long before throwing again
  countdownMs: 3000,
  boomMs: 3400,
  dangerAt: [0.4, 0.7, 0.88], // fuse fractions where the cat gets more scared
};
const ACTIVE = ['countdown', 'play', 'boom'];
const clampInt = (v, def, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const rand = (a, b) => a + crypto.randomInt(Math.max(1, b - a));
const BOT_REACT = { easy: [1400, 3800], normal: [800, 2400], hard: [450, 1300] };

/**
 * 고양이 폭탄 파티 (Cat Bomb Party), 2–6 players.
 * A cat bomb with a hidden fuse goes around the table: whoever holds it taps
 * another player to throw it. When the fuse runs out, the holder (or whoever
 * it's flying to) loses a life. Out of lives = out. Last cat standing wins.
 * The cat's face (danger level 0–3) gives a hint of how much fuse is left.
 */
class BombParty {
  static meta = { id: 'bomb', name: '고양이 폭탄 파티', minPlayers: CFG.minPlayers, maxPlayers: CFG.maxPlayers };

  static normalizeSettings(raw = {}) {
    return {
      players: clampInt(raw.players, CFG.defaultPlayers, CFG.minPlayers, CFG.maxPlayers),
      lives: clampInt(raw.lives, CFG.lives, 1, 5),
    };
  }

  constructor(room, settings) {
    this.room = room;
    this.settings = BombParty.normalizeSettings(settings);
    this.maxPlayers = this.settings.players;
    this.ps = new Map();
    this.timers = [];
    this.botTimers = [];
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

  alive() { return this.players.filter((p) => { const s = this.ps.get(p.id); return s && !s.out; }); }

  // ---- lifecycle -------------------------------------------------------

  clearTimers() {
    this.timers.forEach(clearTimeout);
    this.botTimers.forEach(clearTimeout);
    this.timers = [];
    this.botTimers = [];
  }
  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }
  dispose() { this.clearTimers(); }

  toLobby(notice = null) {
    this.clearTimers();
    this.phase = 'lobby';
    this.round = 0;
    this.holder = null;
    this.flight = null;
    this.lastBoom = null;
    this.final = null;
    this.deadline = null;
    this.notice = notice;
    this.outCount = 0;
    for (const p of this.players) {
      const s = this.ps.get(p.id);
      if (s) Object.assign(s, { lives: this.settings.lives, ready: !!p.bot, out: false, outAt: 0 });
    }
  }

  onJoin(player) {
    this.ps.set(player.id, { lives: this.settings.lives, ready: !!player.bot, out: false, outAt: 0, pending: false });
    this.notice = null;
  }

  onLeave(playerId, name) {
    this.ps.delete(playerId);
    if (ACTIVE.includes(this.phase) || this.phase === 'gameover') {
      const humans = this.players.filter((p) => !p.bot).length;
      if (this.players.length < CFG.minPlayers || humans === 0) return this.toLobby({ code: 'srv.oppLeft', name, at: Date.now() });
      this.notice = { code: 'sys.left', name, at: Date.now() };
      if (ACTIVE.includes(this.phase)) {
        if (this.alive().length < 2) return this.finish();
        // The bomb never disappears: hand it to someone still in.
        if (this.holder === playerId || this.flight?.to === playerId) {
          this.flight = null;
          this.giveTo(this.randomAlive());
        }
      }
    } else {
      for (const p of this.players) if (!p.bot) this.ps.get(p.id).ready = false;
    }
    this.changed();
  }

  onAction(playerId, action) {
    const s = this.ps.get(playerId);
    if (!s || !action) return;
    if (action.type === 'ready') {
      if (this.phase !== 'lobby' && this.phase !== 'gameover') return;
      s.ready = !s.ready;
      if (!this.tryStart()) this.changed();
      return;
    }
    if (action.type === 'pass') this.pass(playerId, action.target);
  }

  tryStart() {
    const ready = this.players.length >= CFG.minPlayers && this.players.every((p) => this.ps.get(p.id).ready);
    if (!ready) return false;
    this.startGame();
    return true;
  }

  startGame() {
    this.clearTimers();
    for (const p of this.players) Object.assign(this.ps.get(p.id), { lives: this.settings.lives, ready: false, out: false, outAt: 0 });
    this.round = 0;
    this.outCount = 0;
    this.final = null;
    this.notice = null;
    this.lastBoom = null;
    this.holder = this.randomAlive();
    this.flight = null;
    this.phase = 'countdown';
    this.deadline = Date.now() + CFG.countdownMs;
    this.dealId++;
    this.later(CFG.countdownMs, () => this.lightFuse());
    this.changed();
  }

  randomAlive(exclude) {
    const list = this.alive().filter((p) => p.id !== exclude);
    return list.length ? list[crypto.randomInt(list.length)].id : null;
  }

  // A new bomb: hidden fuse, the cat gets more scared at a few checkpoints.
  lightFuse() {
    this.clearTimers();
    this.phase = 'play';
    this.round++;
    this.dealId++;
    this.fuseMs = rand(CFG.fuseMin, CFG.fuseMax);
    this.fuseStart = Date.now();
    this.danger = 0;
    this.deadline = null; // the fuse stays secret
    this.heldSince = Date.now();
    CFG.dangerAt.forEach((f, i) => this.later(this.fuseMs * f, () => { this.danger = i + 1; this.changed(); }));
    this.later(this.fuseMs, () => this.explode());
    this.changed();
    this.botTurn();
  }

  giveTo(id) {
    this.holder = id;
    this.heldSince = Date.now();
    this.botTurn();
  }

  pass(from, to) {
    if (this.phase !== 'play' || this.flight || this.holder !== from) return;
    if (Date.now() - this.heldSince < CFG.catchMs) return;
    const t = this.ps.get(to);
    if (!t || t.out || to === from) return;
    this.flight = { from, to, start: Date.now() };
    this.holder = null;
    this.later(CFG.flightMs, () => {
      if (!this.flight || this.phase !== 'play') return;
      const target = this.flight.to;
      this.flight = null;
      this.giveTo(target);
      this.changed();
    });
    this.changed();
  }

  explode() {
    // Mid-air bombs land on whoever they were thrown to.
    const victim = this.holder || this.flight?.to || this.randomAlive();
    this.flight = null;
    this.holder = null;
    this.botTimers.forEach(clearTimeout);
    this.botTimers = [];
    const s = this.ps.get(victim);
    if (s) {
      s.lives = Math.max(0, s.lives - 1);
      if (s.lives === 0) { s.out = true; s.outAt = ++this.outCount; }
    }
    this.lastBoom = { victim, out: !!s?.out, at: Date.now() };
    this.phase = 'boom';
    this.danger = 3;
    this.deadline = Date.now() + CFG.boomMs;
    this.dealId++;
    this.later(CFG.boomMs, () => {
      if (this.alive().length < 2) return this.finish();
      // The victim restarts the next bomb (if still in), otherwise someone random.
      this.holder = s && !s.out ? victim : this.randomAlive();
      this.lightFuse();
    });
    this.changed();
    // Bots sometimes gloat when someone else blows up.
    for (const p of this.players) {
      if (!p.bot || p.id === victim || crypto.randomInt(100) >= 30) continue;
      this.later(rand(900, 2200), () => this.room.postChat({ playerId: p.id, name: p.name, kind: 'sticker', sticker: Bots.pickOne(Bots.WIN_STICKERS) }));
      break;
    }
  }

  finish() {
    this.clearTimers();
    // Survivors first (more lives = higher), then the latest to go out.
    const order = this.players.slice().sort((a, b) => {
      const A = this.ps.get(a.id), B = this.ps.get(b.id);
      if (A.out !== B.out) return A.out ? 1 : -1;
      if (!A.out) return B.lives - A.lives;
      return B.outAt - A.outAt;
    });
    const n = order.length;
    const standings = order.map((p, i) => {
      const s = this.ps.get(p.id);
      return { id: p.id, name: p.name, bot: p.bot || null, chips: n - i, lives: s.lives, display: s.out ? '💥' : '❤'.repeat(s.lives) };
    });
    this.final = { standings, championId: standings[0]?.id || null, reason: 'bomb' };
    for (const p of this.players) this.ps.get(p.id).ready = !!p.bot;
    this.final.ratings = this.room.onFinish?.(standings, 'bomb') || [];
    this.phase = 'gameover';
    this.holder = null;
    this.flight = null;
    this.deadline = null;
    this.changed();
  }

  // ---- bots ------------------------------------------------------------

  botTurn() {
    const p = this.players.find((x) => x.id === this.holder);
    if (!p?.bot) return;
    const dealId = this.dealId;
    const holdStart = this.heldSince;
    const [a, b] = BOT_REACT[p.bot] || BOT_REACT.normal;
    this.botTimers.push(setTimeout(() => {
      if (this.phase !== 'play' || this.holder !== p.id || this.heldSince !== holdStart || this.dealId !== dealId) return;
      const others = this.alive().filter((x) => x.id !== p.id);
      if (!others.length) return;
      let target;
      if (p.bot === 'hard') {
        // Pick on whoever has the most lives left.
        const most = Math.max(...others.map((x) => this.ps.get(x.id).lives));
        const top = others.filter((x) => this.ps.get(x.id).lives === most);
        target = top[crypto.randomInt(top.length)];
      } else target = others[crypto.randomInt(others.length)];
      this.pass(p.id, target.id);
    }, Math.max(CFG.catchMs + 50, rand(a, b))));
  }

  // ---- view ------------------------------------------------------------

  viewFor(/* viewerId */) {
    return {
      game: 'bomb',
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
      durations: { countdown: CFG.countdownMs, boom: CFG.boomMs },
      notice: this.notice,
      holder: this.holder,
      flight: this.flight ? { from: this.flight.from, to: this.flight.to, left: Math.max(0, CFG.flightMs - (Date.now() - this.flight.start)) } : null,
      flightMs: CFG.flightMs,
      catchMs: CFG.catchMs,
      heldFor: this.holder ? Date.now() - this.heldSince : 0,
      danger: this.phase === 'play' || this.phase === 'boom' ? this.danger : 0,
      lastBoom: this.lastBoom,
      grid: [],
      board: [],
      players: this.players.map((p) => {
        const s = this.ps.get(p.id);
        return { id: p.id, name: p.name, bot: p.bot || null, connected: p.connected, lives: s.lives, out: s.out, ready: s.ready, pending: false, chips: s.lives };
      }),
      result: null,
      final: this.final,
    };
  }
}

BombParty.CFG = CFG;
module.exports = BombParty;
