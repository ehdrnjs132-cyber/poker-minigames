// Room avatars, sword fights on the game screen, and tomato coupons.
//
// - Every seated player has a little avatar walking over the room screen
//   (normalized 0..1 coords) with an HP bar from the start. Bots wander.
// - Swinging the sword at someone close hits them right there (no separate
//   battle screen, the card game keeps going). HP 0 = knocked out for a few
//   seconds, then back with full HP. The one who lands the KO gets a tomato
//   coupon. Bots that get hit chase their attacker and hit back.
// - A tomato coupon tints the target's screen dark translucent red.
const crypto = require('crypto');

const HP = 100;
const HIT = { dmg: 10, crit: 16, critChance: 15, reachX: 0.085, reachY: 0.1, gapMs: 420, respawnMs: 8000 };
const RED_MS = 6500;
const BOT_FIGHT = {
  easy: { speed: 0.0035, gap: 1300, aggroMs: 6000 },
  normal: { speed: 0.0045, gap: 950, aggroMs: 9000 },
  hard: { speed: 0.0058, gap: 700, aggroMs: 12000 },
};
const rnd = (n) => crypto.randomInt(n);

module.exports = function setupDuels({ io, rooms, members }) {
  const emitTo = (p, ev, msg) => p?.socketId && io.to(p.socketId).emit(ev, msg);
  const emitRoom = (room, ev, msg) => { for (const p of members(room)) emitTo(p, ev, msg); };
  const playerOf = (room, id) => room.players.find((p) => p.id === id);

  function roamOf(room) {
    if (!room.roam) room.roam = {};
    return room.roam;
  }
  function avatar(room, id) {
    const roam = roamOf(room);
    if (!roam[id]) roam[id] = { x: 0.2 + Math.random() * 0.6, y: 0.75 + Math.random() * 0.2, d: 1, m: false, sw: 0, hp: HP, deadUntil: 0 };
    return roam[id];
  }
  const alive = (r) => r && !(r.deadUntil > Date.now());

  // ---------------------------------------------------------------- hits
  function hit(room, fromId, toId) {
    const a = roamOf(room)[fromId];
    const b = roamOf(room)[toId];
    if (!alive(a) || !alive(b) || fromId === toId) return false;
    const now = Date.now();
    if (now - (a.lastHit || 0) < HIT.gapMs) return false;
    const dx = b.x - a.x;
    if (Math.abs(dx) > HIT.reachX || Math.abs(b.y - a.y) > HIT.reachY) return false;
    if (Math.sign(dx) !== a.d && Math.abs(dx) > 0.02) return false; // must face them
    a.lastHit = now;
    const crit = rnd(100) < HIT.critChance;
    const dmg = crit ? HIT.crit : HIT.dmg;
    b.hp = Math.max(0, b.hp - dmg);
    // knock the victim back a little
    b.x = Math.max(0.03, Math.min(0.97, b.x + Math.sign(dx || a.d) * 0.025));
    let ko = false;
    if (b.hp === 0) {
      ko = true;
      b.deadUntil = now + HIT.respawnMs;
      if (!room.coupons) room.coupons = {};
      room.coupons[fromId] = (room.coupons[fromId] || 0) + 1;
      const victimId = toId;
      setTimeout(() => {
        const r = roamOf(room)[victimId];
        if (!r || !rooms.has(room.code)) return;
        r.hp = HP;
        r.deadUntil = 0;
        room.roamDirty = true;
        emitRoom(room, 'roam:hp', { id: victimId, hp: HP, respawn: true });
      }, HIT.respawnMs);
      room.postChat({ kind: 'system', code: 'sys.roamKo', name: playerOf(room, fromId)?.name || '?', other: playerOf(room, toId)?.name || '?' });
      // A bot cashes its coupon in right away: tomato in the loser's face.
      const killer = playerOf(room, fromId);
      if (killer?.bot) setTimeout(() => useCoupon(room, killer, toId), 1500 + rnd(1500));
      room.broadcast(); // coupon count lives in the room state
    }
    room.roamDirty = true;
    emitRoom(room, 'roam:hp', { id: toId, by: fromId, hp: b.hp, dmg, crit, ko, dir: Math.sign(dx) || a.d, respawnAt: ko ? b.deadUntil : 0 });
    // A bot that gets hit goes after its attacker.
    const victim = playerOf(room, toId);
    if (victim?.bot && !ko) {
      const L = BOT_FIGHT[victim.bot] || BOT_FIGHT.normal;
      b.aggro = { id: fromId, until: now + L.aggroMs };
    }
    return true;
  }

  function useCoupon(room, player, target) {
    if (!rooms.has(room.code)) return;
    const other = playerOf(room, target);
    if (!other || other.id === player.id || !(room.coupons?.[player.id] > 0)) return;
    room.coupons[player.id]--;
    emitRoom(room, 'taunt', { from: player.id, kind: 'tomato', target: other.id, at: Date.now(), coupon: true });
    setTimeout(() => emitTo(other, 'redscreen', { from: player.name, ms: RED_MS }), 620);
    room.broadcast();
  }

  // ---------------------------------------------------------------- roaming loop
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const roam = roamOf(room);
      for (const p of room.players) {
        if (!p.bot) continue;
        const r = avatar(room, p.id);
        if (!alive(r)) { r.m = false; continue; }
        const L = BOT_FIGHT[p.bot] || BOT_FIGHT.normal;
        const foe = r.aggro && r.aggro.until > now ? roam[r.aggro.id] : null;
        if (foe && alive(foe) && playerOf(room, r.aggro.id)) {
          // chase and swing
          const dx = foe.x - r.x, dy = foe.y - r.y, dist = Math.hypot(dx, dy);
          r.d = dx < 0 ? -1 : 1;
          if (Math.abs(dx) > HIT.reachX * 0.7 || Math.abs(dy) > HIT.reachY * 0.6) {
            r.x += (dx / dist) * L.speed; r.y += (dy / dist) * L.speed; r.m = true;
          } else r.m = false;
          if (now - (r.lastSwing || 0) > L.gap + rnd(300) && Math.abs(dx) < HIT.reachX && Math.abs(dy) < HIT.reachY) {
            r.lastSwing = now;
            r.sw = now;
            hit(room, p.id, r.aggro.id);
          }
        } else {
          r.aggro = null;
          if (r.tx == null || Math.random() < 0.004) { r.tx = 0.08 + Math.random() * 0.84; r.ty = 0.3 + Math.random() * 0.62; }
          const dx = r.tx - r.x, dy = r.ty - r.y, dist = Math.hypot(dx, dy);
          if (dist < 0.01) { r.m = false; if (Math.random() < 0.02) r.tx = null; } else {
            r.x += (dx / dist) * 0.004; r.y += (dy / dist) * 0.004; r.m = true; r.d = dx < 0 ? -1 : 1;
          }
        }
        room.roamDirty = true;
      }
      for (const id of Object.keys(roam)) if (!playerOf(room, id)) { delete roam[id]; room.roamDirty = true; }
      if (!room.roamDirty) continue;
      room.roamDirty = false;
      const list = Object.entries(roam).map(([id, r]) => ({
        id, x: +r.x.toFixed(4), y: +r.y.toFixed(4), d: r.d, m: r.m, sw: r.sw, hp: r.hp, dead: !alive(r), respawnAt: alive(r) ? 0 : r.deadUntil,
      }));
      emitRoom(room, 'roam', list);
    }
  }, 100);

  // ---------------------------------------------------------------- lifecycle hooks
  function onLeave(room, playerId) {
    if (room.roam) delete room.roam[playerId];
    if (room.coupons) delete room.coupons[playerId];
    for (const r of Object.values(room.roam || {})) if (r.aggro?.id === playerId) r.aggro = null;
  }
  function onDisconnect() {}
  function cleanup(room) { room.roam = {}; }
  function duelView() { return null; }

  // ---------------------------------------------------------------- sockets
  function attach(socket, getCtx) {
    const seated = () => {
      const ctx = getCtx();
      return ctx && !ctx.spectator ? ctx : null;
    };

    socket.on('roam:move', (m) => {
      const ctx = seated();
      if (!ctx || !m || typeof m !== 'object') return;
      const r = avatar(ctx.room, ctx.player.id);
      if (!alive(r)) return; // knocked out: lie still
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
      Object.assign(r, { x: clamp(m.x, 0, 1), y: clamp(m.y, 0, 1), d: m.d === -1 ? -1 : 1, m: !!m.m, sw: Number(m.sw) || 0 });
      ctx.room.roamDirty = true;
    });

    socket.on('roam:hit', ({ target } = {}) => {
      const ctx = seated();
      if (!ctx || !playerOf(ctx.room, target)) return;
      hit(ctx.room, ctx.player.id, target);
    });

    // Tomato coupon: tint the target's screen dark translucent red.
    socket.on('coupon:use', ({ target } = {}) => {
      const ctx = seated();
      if (!ctx) return;
      useCoupon(ctx.room, ctx.player, target);
    });
  }

  return { attach, onLeave, onDisconnect, cleanup, duelView };
};
