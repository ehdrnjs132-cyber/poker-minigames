const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const GAMES = {
  memory: require('./games/memoryPoker'),
  nut: require('./games/nutRace'),
  indian: require('./games/indianPoker'),
};
const Bots = require('./bots');
const store = require('./store');
const profiles = require('./profiles');

const PORT = process.env.PORT || 3000;
const ROOM_IDLE_MS = 3 * 60 * 1000;
const CHAT_HISTORY = 40;
const CHAT_MAX_LEN = 120;
const CHAT_BURST = 5;          // messages allowed per window
const CHAT_WINDOW_MS = 4000;
const MAX_SPECTATORS = 20;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', (_req, res) => res.send('ok'));

// Uploaded profile photos (stored as data URLs) served as real images.
app.get('/avatar/:id', (req, res) => {
  const data = profiles.image(String(req.params.id).replace(/[^a-f0-9]/g, ''));
  const m = data && data.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'public, max-age=86400'); // URLs carry ?v= so updates bust the cache
  res.send(Buffer.from(m[2], 'base64'));
});

const server = http.createServer(app);
const io = new Server(server);

/** @type {Map<string, any>} */
const rooms = new Map();

// Lobby chat: everyone not seated in a room shares one channel.
const lobbyChat = [];
let lobbySeq = 0;
function postLobbyChat(msg) {
  const full = { id: ++lobbySeq, at: Date.now(), lobby: true, ...msg };
  lobbyChat.push(full);
  if (lobbyChat.length > CHAT_HISTORY) lobbyChat.shift();
  io.to('lobby').emit('chat', full);
}

function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join('');
  while (rooms.has(code));
  return code;
}

function cleanName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
  return n || 'Player';
}

function createRoom(gameId, settings) {
  const Game = GAMES[gameId];
  if (!Game) return null;
  const room = { code: genCode(), gameId, players: [], spectators: [], chat: [], chatSeq: 0, cleanupTimer: null };
  room.broadcast = () => { broadcast(room); announceRooms(); };
  room.postChat = (msg) => postChat(room, msg);
  // Records: game players → profiles (bots have no userId and aren't recorded).
  const userOf = (pid) => room.players.find((p) => p.id === pid)?.userId || null;
  room.onRound = (entries, game) => profiles.recordRound(game, entries.map((e) => ({ ...e, userId: userOf(e.id) })));
  room.onFinish = (standings, game) => {
    // Equal chip counts share a place.
    const entries = standings.map((s) => ({ userId: userOf(s.id), place: 1 + standings.filter((o) => o.chips > s.chips).length, chips: s.chips, pid: s.id }));
    return profiles.recordGame(game, entries).map((r) => ({ ...r, pid: entries.find((e) => e.userId === r.userId)?.pid }));
  };
  room.game = new Game(room, settings && typeof settings === 'object' ? settings : {});
  rooms.set(room.code, room);
  return room;
}

function broadcast(room) {
  const now = Date.now();
  const faces = new Map(room.players.map((p) => [p.id, { uid: p.userId || null, avatar: p.avatar || null, avatarV: p.avatarV || 0 }]));
  const watchers = room.spectators.map((s) => ({ id: s.id, name: s.name, uid: s.userId || null, avatar: s.avatar || null, avatarV: s.avatarV || 0 }));
  const send = (p, spectator) => {
    if (!p.socketId) return;
    const view = room.game.viewFor(p.id);
    for (const vp of view.players) Object.assign(vp, faces.get(vp.id));
    io.to(p.socketId).emit('state', { now, code: room.code, gameId: room.gameId, me: p.id, spectator, spectators: watchers, ...view });
  };
  for (const p of room.players) send(p, false);
  for (const s of room.spectators) send(s, true);
}

function members(room) {
  return [...room.players, ...room.spectators];
}

function postChat(room, msg) {
  const full = { id: ++room.chatSeq, at: Date.now(), ...msg };
  room.chat.push(full);
  if (room.chat.length > CHAT_HISTORY) room.chat.shift();
  for (const p of members(room)) if (p.socketId) io.to(p.socketId).emit('chat', full);
}

function scheduleCleanup(room) {
  clearTimeout(room.cleanupTimer);
  // Bots never "disconnect", so only humans keep a room alive.
  if (room.players.some((p) => p.connected && !p.bot)) return;
  room.cleanupTimer = setTimeout(() => destroyRoom(room), ROOM_IDLE_MS);
}

function destroyRoom(room) {
  clearTimeout(room.cleanupTimer);
  room.game.dispose();
  rooms.delete(room.code);
  for (const s of room.spectators) if (s.socketId) io.to(s.socketId).emit('kicked', { code: 'srv.roomClosed' });
  announceRooms();
}

// ---- lobby room list ------------------------------------------------------
// Sockets that aren't seated in a room sit in the "lobby" channel and get a
// live list of rooms (debounced so busy games don't spam it).
function roomSummary(room) {
  const humans = room.players.filter((p) => !p.bot);
  return {
    code: room.code,
    gameId: room.gameId,
    host: (humans[0] || room.players[0])?.name || '',
    players: room.players.length,
    bots: room.players.length - humans.length,
    max: room.game.maxPlayers,
    playing: room.game.phase !== 'lobby',
    joinable: room.game.canSit(), // waiting room, or mid-game while late seats are open
    round: room.game.round || 0,
    watchers: room.spectators.length,
  };
}

function roomList() {
  return [...rooms.values()]
    .filter((r) => r.players.some((p) => !p.bot && p.connected))
    .map(roomSummary)
    .sort((a, b) => Number(b.joinable) - Number(a.joinable))
    .slice(0, 30);
}

let announceTimer = null;
function announceRooms() {
  announceOnline(); // room status shows up next to each person
  if (announceTimer) return;
  announceTimer = setTimeout(() => {
    announceTimer = null;
    io.to('lobby').emit('rooms', roomList());
  }, 300);
}

// ---- who's online ---------------------------------------------------------
// Every socket that said hello, deduped by profile (several tabs = one person).
// Someone sitting in a room wins over their idle lobby tab.
const online = new Map(); // socket.id -> { uid, room }
function onlineList() {
  const byUid = new Map();
  for (const { uid, room, watching } of online.values()) {
    if (!uid) continue;
    const prev = byUid.get(uid);
    if (prev && prev.room) continue;
    byUid.set(uid, { uid, room: room && rooms.has(room.code) ? room : null, watching });
  }
  return [...byUid.values()].map(({ uid, room, watching }) => {
    const u = profiles.getUser(uid) || {};
    const r = room && roomSummary(room);
    return {
      uid, name: u.name || 'Player', avatar: u.avatar || null, avatarV: u.avatarV || 0,
      room: r ? { code: r.code, gameId: r.gameId, playing: r.playing, joinable: r.joinable, watching: !!watching } : null,
    };
  }).sort((a, b) => Number(!!a.room) - Number(!!b.room) || a.name.localeCompare(b.name)).slice(0, 60);
}
let onlineTimer = null;
function announceOnline() {
  if (onlineTimer) return;
  plazaDirty = true;
  onlineTimer = setTimeout(() => {
    onlineTimer = null;
    io.to('lobby').emit('online', onlineList());
  }, 400);
}

// ---- lobby plaza: everyone in the lobby walks around as a character -------
const PLAZA_W = 480;
const PLAZA_H = 1480;
const plaza = new Map(); // socket.id -> { x, y, d, m }
let plazaDirty = false;
function plazaList() {
  const list = [];
  for (const [sid, pos] of plaza) {
    const o = online.get(sid);
    if (!o || !o.uid || o.room) continue;
    const u = profiles.getUser(o.uid) || {};
    list.push({ sid, uid: o.uid, name: u.name || 'Player', avatar: u.avatar || null, avatarV: u.avatarV || 0, ...pos });
  }
  return list.slice(0, 40);
}
setInterval(() => {
  if (!plazaDirty) return;
  plazaDirty = false;
  io.to('lobby').emit('plaza', plazaList());
}, 100);

function addBot(room, level) {
  if (!Bots.isLevel(level) || !room.game.canJoin()) return;
  const name = Bots.makeName(room.players.map((p) => p.name));
  const bot = { id: crypto.randomUUID(), name, bot: level, connected: true, socketId: null };
  room.players.push(bot);
  room.game.onJoin(bot);
  postChat(room, { kind: 'system', code: 'sys.botJoined', name, level });
  room.broadcast();
}

function removeBot(room, id) {
  const bot = room.players.find((p) => p.id === id && p.bot);
  if (!bot || room.game.phase !== 'lobby') return;
  room.players = room.players.filter((p) => p !== bot);
  room.game.onLeave(bot.id, bot.name);
  postChat(room, { kind: 'system', code: 'sys.left', name: bot.name });
  room.broadcast();
}

io.on('connection', (socket) => {
  let ctx = null; // { room, player }

  const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

  socket.join('lobby');
  socket.emit('rooms', roomList());
  socket.emit('online', onlineList());
  socket.emit('chatHistory', lobbyChat);
  online.set(socket.id, { uid: null, room: null });

  // ---- profile (no password: browser-held id + token) ----
  let uid = null;
  socket.on('hello', (payload, ack) => {
    const res = profiles.hello(payload || {});
    if (res.invalid) return reply(ack, { ok: false, code: 'me.badCode' });
    uid = res.uid;
    online.get(socket.id).uid = uid;
    announceOnline();
    reply(ack, { ok: true, ...res });
  });

  socket.on('profile:update', (patch, ack) => {
    if (!uid || !patch || typeof patch !== 'object') return reply(ack, { ok: false, code: 'srv.noProfile' });
    const res = profiles.update(uid, patch);
    if (res.error) return reply(ack, { ok: false, code: res.error });
    // Refresh seats in any room this profile is sitting in.
    for (const room of rooms.values()) {
      let touched = false;
      for (const p of room.players) {
        if (p.userId !== uid) continue;
        p.avatar = res.user.avatar;
        p.avatarV = res.user.avatarV;
        touched = true;
      }
      if (touched) room.broadcast();
    }
    announceOnline();
    reply(ack, { ok: true, user: res.user });
  });

  socket.on('ranking', (game, ack) => reply(ack, { ok: true, ...profiles.leaderboard(String(game), uid) }));
  socket.on('me', (_x, ack) => reply(ack, uid ? { ok: true, ...profiles.myStats(uid) } : { ok: false }));

  const makePlayer = (name) => {
    const u = profiles.getUser(uid);
    return { id: crypto.randomUUID(), name: cleanName(name || u?.name), userId: uid, avatar: u?.avatar || null, avatarV: u?.avatarV || 0, connected: true, socketId: null };
  };

  // Invite links ask what they're joining before the player commits.
  socket.on('roomInfo', (code, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    reply(ack, room ? { ok: true, ...roomSummary(room) } : { ok: false, code: 'srv.notFound' });
  });

  function attach(room, player) {
    if (ctx && ctx.player !== player) detach();
    if (player.socketId && player.socketId !== socket.id) {
      io.to(player.socketId).emit('kicked', { code: 'srv.kicked' });
    }
    player.socketId = socket.id;
    player.connected = true;
    const spectator = room.spectators.includes(player);
    ctx = { room, player, spectator };
    Object.assign(online.get(socket.id), { room, watching: spectator });
    plaza.delete(socket.id);
    socket.leave('lobby');
    clearTimeout(room.cleanupTimer);
    socket.emit('chatHistory', room.chat);
    room.broadcast();
  }

  function backToLobby() {
    Object.assign(online.get(socket.id) || {}, { room: null, watching: false });
    socket.join('lobby');
    socket.emit('rooms', roomList());
    socket.emit('online', onlineList());
    socket.emit('chatHistory', lobbyChat);
    announceOnline();
  }

  function detach() {
    if (!ctx) return;
    const { room, player, spectator } = ctx;
    ctx = null;
    backToLobby();
    if (spectator) {
      room.spectators = room.spectators.filter((s) => s !== player);
      return room.broadcast();
    }
    // Walking out of a game in progress counts as finishing last.
    const phase = room.game.phase;
    if (!['lobby', 'gameover'].includes(phase) && !room.game.ps.get(player.id)?.out) {
      profiles.recordAbandon(room.gameId, player.userId, room.players.length);
    }
    room.players = room.players.filter((p) => p !== player);
    room.game.onLeave(player.id, player.name);
    if (!room.players.some((p) => !p.bot)) return destroyRoom(room);
    postChat(room, { kind: 'system', code: 'sys.left', name: player.name });
    room.broadcast();
  }

  const chatTimes = [];
  socket.on('chat', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (!ctx && !uid) return;
    const now = Date.now();
    while (chatTimes.length && now - chatTimes[0] > CHAT_WINDOW_MS) chatTimes.shift();
    if (chatTimes.length >= CHAT_BURST) return socket.emit('chatError', { code: 'srv.chatFast' });
    let base, post;
    if (ctx) {
      const { player, room, spectator } = ctx;
      base = { playerId: player.id, name: player.name, spectator: spectator || undefined };
      post = (m) => postChat(room, m);
    } else {
      // In the lobby: sid lets the plaza pop a bubble over the sender's character.
      base = { sid: socket.id, name: cleanName(profiles.getUser(uid)?.name) };
      post = postLobbyChat;
    }
    if (msg.kind === 'sticker' && /^[a-z0-9]{1,16}$/.test(String(msg.sticker))) {
      chatTimes.push(now);
      post({ ...base, kind: 'sticker', sticker: msg.sticker });
    } else if (msg.kind === 'text') {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
      if (!text) return;
      chatTimes.push(now);
      post({ ...base, kind: 'text', text });
    }
  });

  socket.on('create', ({ name, gameId, settings } = {}, ack) => {
    const room = createRoom(gameId, settings);
    if (!room) return reply(ack, { ok: false, code: 'srv.noGame' });
    const player = makePlayer(name);
    room.players.push(player);
    room.game.onJoin(player);
    reply(ack, { ok: true, code: room.code, playerId: player.id });
    attach(room, player);
  });

  // Take a seat: waiting room, or mid-game (plays from the next round).
  function seat(room, player) {
    const late = room.game.phase !== 'lobby';
    room.players.push(player);
    room.game.onJoin(player);
    attach(room, player);
    postChat(room, { kind: 'system', code: late && room.game.phase !== 'gameover' ? 'sys.lateJoined' : 'sys.joined', name: player.name });
    room.broadcast();
  }

  // Join = sit down if a seat is open, otherwise watch (unless watch=false).
  socket.on('join', ({ name, code, playerId, watch } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return reply(ack, { ok: false, code: 'srv.notFound' });

    const existing = playerId && members(room).find((p) => p.id === playerId);
    if (existing) {
      reply(ack, { ok: true, code: room.code, playerId: existing.id, rejoined: true });
      return attach(room, existing);
    }
    const player = makePlayer(name);
    if (watch !== 'only' && room.game.canSit()) {
      reply(ack, { ok: true, code: room.code, playerId: player.id });
      return seat(room, player);
    }
    if (watch === false) {
      const full = room.players.length >= room.game.maxPlayers;
      return reply(ack, { ok: false, code: full ? 'srv.full' : 'srv.inProgress' });
    }
    if (room.spectators.length >= MAX_SPECTATORS) return reply(ack, { ok: false, code: 'srv.full' });
    room.spectators.push(player);
    reply(ack, { ok: true, code: room.code, playerId: player.id, spectator: true });
    attach(room, player);
    postChat(room, { kind: 'system', code: 'sys.watching', name: player.name });
  });

  socket.on('action', (action) => {
    if (!ctx || !action || typeof action !== 'object') return;
    const { room, player, spectator } = ctx;
    if (spectator) {
      if (action.type !== 'sit' || !room.game.canSit()) return;
      room.spectators = room.spectators.filter((s) => s !== player);
      ctx = null; // seat() re-attaches as a player
      return seat(room, player);
    }
    if (action.type === 'addBot') return addBot(room, action.level);
    if (action.type === 'removeBot') return removeBot(room, action.id);
    room.game.onAction(player.id, action);
  });

  socket.on('leave', () => detach());

  // Lobby plaza movement (only while standing in the lobby).
  socket.on('plaza:move', (m) => {
    if (ctx || !uid || !m || typeof m !== 'object') return;
    const num = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));
    plaza.set(socket.id, { x: Math.round(num(m.x, PLAZA_W)), y: Math.round(num(m.y, PLAZA_H)), d: m.d === -1 ? -1 : 1, m: !!m.m });
    plazaDirty = true;
  });

  socket.on('disconnect', () => {
    online.delete(socket.id);
    plaza.delete(socket.id);
    announceOnline();
    if (!ctx) return;
    const { room, player, spectator } = ctx;
    if (player.socketId !== socket.id) return;
    if (spectator) {
      room.spectators = room.spectators.filter((s) => s !== player);
      return room.broadcast();
    }
    player.connected = false;
    player.socketId = null;
    room.broadcast();
    scheduleCleanup(room);
  });
});

store.init()
  .catch((e) => {
    console.error('Database unavailable, falling back to file storage:', e.message);
    store.pool = null;
    store.backend = 'file';
  })
  .finally(() => server.listen(PORT, () => console.log(`Holdem Arcade listening on http://localhost:${PORT}`)));
