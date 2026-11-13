// Room avatars, sword duels and tomato coupons.
//
// - Roaming: every seated player has a little avatar walking over the room
//   screen (normalized 0..1 coords). Bots wander on their own.
// - Duel: swing at someone -> confirm -> they accept -> the card game pauses
//   and both fight in a side-view arena (HP 100, 45 s). Clients simulate their
//   own fighter and report state; the server validates hits and owns HP. A bot
//   opponent is simulated here.
// - Winning a duel gives a tomato coupon: using it tints the target's screen
//   translucent red for 4 s.
const crypto = require('crypto');
const Bots = require('./bots');

const ARENA = { w: 960, ground: 470, minX: 50, maxX: 910 };
const DUEL = {
  hp: 100, dmg: 12, jumpDmg: 18, blockDmg: 2, countdownMs: 3000, fightMs: 45000,
  reachX: 105, reachY: 80, hitGapMs: 330, askMs: 10000, cooldownMs: 15000, endMs: 2600,
};
const BOT_DUEL = {
  easy: { attackGap: 1150, speed: 170, block: 0.1, jump: 0.006 },
  normal: { attackGap: 820, speed: 220, block: 0.3, jump: 0.01 },
  hard: { attackGap: 560, speed: 270, block: 0.5, jump: 0.014 },
};
const rnd = (n) => crypto.randomInt(n);

module.exports = function setupDuels({ io, rooms, members }) {
  const emitTo = (p, ev, msg) => p?.socketId && io.to(p.socketId).emit(ev, msg);
  const emitRoom = (room, ev, msg) => { for (const p of members(room)) emitTo(p, ev, msg); };
  const playerOf = (room, id) => room.players.find((p) => p.id === id);

  // ---------------------------------------------------------------- roaming
  function roamOf(room) {
    if (!room.roam) room.roam = {};
    return room.roam;
  }
  setInterval(() => {
    for (const room of rooms.values()) {
      const roam = roamOf(room);
      // Bots wander toward a random spot, pause, repeat.
      for (const p of room.players) {
        if (!p.bot) continue;
        const r = roam[p.id] || (roam[p.id] = { x: 0.2 + Math.random() * 0.6, y: 0.55 + Math.random() * 0.35, d: 1, m: false, sw: 0, tx: null });
        if (room.duel && (room.duel.a === p.id || room.duel.b === p.id)) continue;
        if (r.tx == null || Math.random() < 0.004) { r.tx = 0.08 + Math.random() * 0.84; r.ty = 0.3 + Math.random() * 0.62; }
        const dx = r.tx - r.x, dy = r.ty - r.y, dist = Math.hypot(dx, dy);
        if (dist < 0.01) { r.m = false; if (Math.random() < 0.02) r.tx = null; } else {
          r.x += (dx / dist) * 0.0045; r.y += (dy / dist) * 0.0045; r.m = true; r.d = dx < 0 ? -1 : 1;
        }
        room.roamDirty = true;
      }
      for (const id of Object.keys(roam)) if (!playerOf(room, id)) { delete roam[id]; room.roamDirty = true; }
      if (!room.roamDirty) continue;
      room.roamDirty = false;
      const list = Object.entries(roam).map(([id, r]) => ({ id, x: +r.x.toFixed(4), y: +r.y.toFixed(4), d: r.d, m: r.m, sw: r.sw }));
      emitRoom(room, 'roam', list);
    }
  }, 100);

  // ---------------------------------------------------------------- duels
  function duelView(room) {
    const d = room.duel;
    if (!d) return null;
    return { a: d.a, b: d.b, hp: d.hp, phase: d.phase, startAt: d.startAt, endsAt: d.endsAt };
  }
  function broadcastDuel(room) { emitRoom(room, 'duel:update', duelView(room)); }

  function startDuel(room, aId, bId) {
    room.duelReq = null;
    const now = Date.now();
    room.duel = {
      a: aId, b: bId, hp: { [aId]: DUEL.hp, [bId]: DUEL.hp }, phase: 'countdown',
      startAt: now + DUEL.countdownMs, endsAt: now + DUEL.countdownMs + DUEL.fightMs,
      st: { [aId]: { x: 220, y: ARENA.ground, face: 1, act: 'idle', air: false }, [bId]: { x: 740, y: ARENA.ground, face: -1, act: 'idle', air: false } },
      lastHit: {}, timers: [],
    };
    room.game.pause?.();
    const d = room.duel;
    const names = Object.fromEntries([aId, bId].map((id) => [id, playerOf(room, id)?.name || '']));
    const cfg = { a: aId, b: bId, names, startAt: d.startAt, endsAt: d.endsAt, now, arena: ARENA, hp: DUEL.hp };
    emitRoom(room, 'duel:start', cfg);
    d.timers.push(setTimeout(() => { if (room.duel === d) { d.phase = 'fight'; broadcastDuel(room); } }, DUEL.countdownMs));
    d.timers.push(setTimeout(() => room.duel === d && endDuel(room, 'time'), DUEL.countdownMs + DUEL.fightMs));
    // Bot fighter brain.
    const bot = [aId, bId].map((id) => playerOf(room, id)).find((p) => p?.bot);
    if (bot) d.timers.push(setInterval(() => botFight(room, d, bot), 50));
    room.postChat({ kind: 'system', code: 'sys.duelStart', name: names[aId], other: names[bId] });
  }

  function botFight(room, d, bot) {
    if (room.duel !== d || d.phase !== 'fight') return;
    const L = BOT_DUEL[bot.bot] || BOT_DUEL.normal;
    const me = d.st[bot.id];
    const oppId = d.a === bot.id ? d.b : d.a;
    const opp = d.st[oppId];
    const dt = 0.05;
    const dx = opp.x - me.x;
    me.face = dx < 0 ? -1 : 1;
    // gravity / jump
    me.vy = (me.vy || 0) + 1600 * dt;
    me.y = Math.min(ARENA.ground, me.y + me.vy * dt);
    me.air = me.y < ARENA.ground - 1;
    if (!me.air) me.vy = 0;
    if (!me.air && Math.random() < L.jump) { me.vy = -620; me.air = true; }
    const now = Date.now();
    if (opp.act === 'attack' && Math.abs(dx) < 140 && Math.random() < L.block) me.act = 'block';
    else if (Math.abs(dx) > 80) { me.x += Math.sign(dx) * L.speed * dt; me.act = me.air ? 'jump' : 'run'; }
    else me.act = me.air ? 'jump' : 'idle';
    me.x = Math.max(ARENA.minX, Math.min(ARENA.maxX, me.x));
    if (Math.abs(dx) < DUEL.reachX - 10 && now - (me.lastSwing || 0) > L.attackGap + rnd(250)) {
      me.lastSwing = now;
      me.act = 'attack';
      me.swingAt = now;
      tryHit(room, bot.id, oppId);
    }
    if (me.act === 'attack' && now - me.swingAt < 220) me.act = 'attack';
    emitTo(playerOf(room, oppId), 'duel:peer', { id: bot.id, ...me, t: now });
  }

  function tryHit(room, fromId, toId) {
    const d = room.duel;
    if (!d || d.phase !== 'fight' || d.hp[toId] == null) return;
    const now = Date.now();
    if (now - (d.lastHit[fromId] || 0) < DUEL.hitGapMs) return;
    const a = d.st[fromId], b = d.st[toId];
    if (!a || !b) return;
    const dx = b.x - a.x;
    if (Math.abs(dx) > DUEL.reachX || Math.abs(b.y - a.y) > DUEL.reachY) return;
    if (Math.sign(dx) !== a.face && Math.abs(dx) > 25) return; // must face the target
    d.lastHit[fromId] = now;
    const blocked = b.act === 'block' && b.face === -a.face;
    const dmg = blocked ? DUEL.blockDmg : a.air ? DUEL.jumpDmg : DUEL.dmg;
    d.hp[toId] = Math.max(0, d.hp[toId] - dmg);
    emitRoom(room, 'duel:hp', { hp: d.hp, by: fromId, to: toId, dmg, blocked, crit: !blocked && a.air, dir: Math.sign(dx) || 1 });
    if (d.hp[toId] <= 0) endDuel(room, 'ko');
  }

  function endDuel(room, why, leaverId) {
    const d = room.duel;
    if (!d) return;
    d.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    room.duel = null;
    let winner = null;
    if (leaverId) winner = leaverId === d.a ? d.b : d.a;
    else if (d.hp[d.a] !== d.hp[d.b]) winner = d.hp[d.a] > d.hp[d.b] ? d.a : d.b;
    const loser = winner ? (winner === d.a ? d.b : d.a) : null;
    if (!room.coupons) room.coupons = {};
    if (winner && playerOf(room, winner)) room.coupons[winner] = (room.coupons[winner] || 0) + 1;
    for (const id of [d.a, d.b]) room.lastDuelAt = { ...(room.lastDuelAt || {}), [id]: Date.now() };
    emitRoom(room, 'duel:end', { winner, loser, why, hp: d.hp, coupons: room.coupons });
    const wName = playerOf(room, winner)?.name;
    const lName = playerOf(room, loser)?.name;
    room.postChat(winner ? { kind: 'system', code: 'sys.duelWin', name: wName || '?', other: lName || '?' } : { kind: 'system', code: 'sys.duelDraw' });
    // Give the duelists a moment to see the result, then the table runs again.
    setTimeout(() => { if (rooms.has(room.code) && !room.duel) room.game.resume?.(); room.broadcast(); }, DUEL.endMs);
  }

  // A seat left the room mid-duel / mid-request.
  function onLeave(room, playerId) {
    if (room.duel && (room.duel.a === playerId || room.duel.b === playerId)) endDuel(room, 'left', playerId);
    if (room.duelReq && (room.duelReq.from === playerId || room.duelReq.to === playerId)) room.duelReq = null;
    if (room.roam) delete room.roam[playerId];
    if (room.coupons) delete room.coupons[playerId];
  }

  // ---------------------------------------------------------------- sockets
  function attach(socket, getCtx) {
    const seated = () => {
      const ctx = getCtx();
      return ctx && !ctx.spectator ? ctx : null;
    };

    socket.on('roam:move', (m) => {
      const ctx = seated();
      if (!ctx || !m || typeof m !== 'object') return;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
      const r = roamOf(ctx.room);
      r[ctx.player.id] = { x: clamp(m.x, 0, 1), y: clamp(m.y, 0, 1), d: m.d === -1 ? -1 : 1, m: !!m.m, sw: Number(m.sw) || 0 };
      ctx.room.roamDirty = true;
    });

    socket.on('duel:challenge', ({ target } = {}, ack) => {
      const ctx = seated();
      const reply = (x) => typeof ack === 'function' && ack(x);
      if (!ctx) return reply({ ok: false, code: 'duel.notSeated' });
      const { room, player } = ctx;
      const other = playerOf(room, target);
      if (!other || other.id === player.id) return reply({ ok: false, code: 'duel.noTarget' });
      if (room.duel || room.duelReq) return reply({ ok: false, code: 'duel.busy' });
      if (!room.game.canDuel?.()) return reply({ ok: false, code: 'duel.notNow' });
      const last = room.lastDuelAt || {};
      if (Date.now() - (last[player.id] || 0) < DUEL.cooldownMs || Date.now() - (last[other.id] || 0) < DUEL.cooldownMs) return reply({ ok: false, code: 'duel.cooldown' });
      if (!other.bot && !other.connected) return reply({ ok: false, code: 'duel.noTarget' });
      const req = { from: player.id, to: other.id, until: Date.now() + DUEL.askMs };
      room.duelReq = req;
      reply({ ok: true });
      if (other.bot) {
        // Bots usually accept a fight.
        setTimeout(() => {
          if (room.duelReq !== req) return;
          if (rnd(100) < 80) startDuel(room, player.id, other.id);
          else { room.duelReq = null; emitTo(player, 'duel:declined', { name: other.name }); }
        }, 900 + rnd(900));
      } else {
        emitTo(other, 'duel:ask', { from: player.id, name: player.name, until: req.until, now: Date.now() });
        setTimeout(() => {
          if (room.duelReq !== req) return;
          room.duelReq = null;
          emitTo(player, 'duel:declined', { name: other.name, timeout: true });
          emitTo(other, 'duel:askClose', {});
        }, DUEL.askMs);
      }
    });

    socket.on('duel:answer', ({ accept } = {}) => {
      const ctx = seated();
      if (!ctx) return;
      const { room, player } = ctx;
      const req = room.duelReq;
      if (!req || req.to !== player.id) return;
      const from = playerOf(room, req.from);
      if (!accept || !from) {
        room.duelReq = null;
        return emitTo(from, 'duel:declined', { name: player.name });
      }
      if (!room.game.canDuel?.()) { room.duelReq = null; return emitTo(from, 'duel:declined', { name: player.name }); }
      startDuel(room, req.from, player.id);
    });

    // Duelist reports its own fighter (~20 Hz); relayed to the opponent.
    socket.on('duel:state', (s) => {
      const ctx = seated();
      const d = ctx?.room.duel;
      if (!d || !s || (d.a !== ctx.player.id && d.b !== ctx.player.id)) return;
      const me = d.st[ctx.player.id];
      me.x = Math.max(ARENA.minX, Math.min(ARENA.maxX, Number(s.x) || me.x));
      me.y = Math.max(0, Math.min(ARENA.ground, Number(s.y) || ARENA.ground));
      me.face = s.face === -1 ? -1 : 1;
      me.act = ['idle', 'run', 'jump', 'attack', 'block', 'hurt'].includes(s.act) ? s.act : 'idle';
      me.air = me.y < ARENA.ground - 1;
      const oppId = d.a === ctx.player.id ? d.b : d.a;
      emitTo(playerOf(ctx.room, oppId), 'duel:peer', { id: ctx.player.id, ...me, t: Date.now() });
    });

    socket.on('duel:hit', () => {
      const ctx = seated();
      const d = ctx?.room.duel;
      if (!d || (d.a !== ctx.player.id && d.b !== ctx.player.id)) return;
      tryHit(ctx.room, ctx.player.id, d.a === ctx.player.id ? d.b : d.a);
    });

    // Tomato coupon: tint the target's screen red for 4 seconds.
    socket.on('coupon:use', ({ target } = {}) => {
      const ctx = seated();
      if (!ctx) return;
      const { room, player } = ctx;
      const other = playerOf(room, target);
      if (!other || other.id === player.id || !(room.coupons?.[player.id] > 0)) return;
      room.coupons[player.id]--;
      emitRoom(room, 'taunt', { from: player.id, kind: 'tomato', target: other.id, at: Date.now(), coupon: true });
      setTimeout(() => emitTo(other, 'redscreen', { from: player.name, ms: 4000 }), 620);
      room.broadcast();
    });
  }

  // Socket dropped (may come back): stop a duel or request, keep coupons.
  function onDisconnect(room, playerId) {
    if (room.duel && (room.duel.a === playerId || room.duel.b === playerId)) endDuel(room, 'left', playerId);
    if (room.duelReq && (room.duelReq.from === playerId || room.duelReq.to === playerId)) room.duelReq = null;
  }
  function cleanup(room) {
    if (room.duel) room.duel.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    room.duel = null;
    room.duelReq = null;
  }

  return { attach, onLeave, onDisconnect, cleanup, duelView };
};
