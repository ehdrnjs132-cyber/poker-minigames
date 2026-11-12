const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const GAMES = {
  memory: require('./games/memoryPoker'),
  shuffle: require('./games/shuffleMemory'),
  nut: require('./games/nutRace'),
  indian: require('./games/indianPoker'),
};
const Bots = require('./bots');

const PORT = process.env.PORT || 3000;
const ROOM_IDLE_MS = 3 * 60 * 1000;
const CHAT_HISTORY = 40;
const CHAT_MAX_LEN = 120;
const CHAT_BURST = 5;          // messages allowed per window
const CHAT_WINDOW_MS = 4000;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', (_req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server);

/** @type {Map<string, any>} */
const rooms = new Map();

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
  const room = { code: genCode(), gameId, players: [], chat: [], chatSeq: 0, cleanupTimer: null };
  room.broadcast = () => { broadcast(room); announceRooms(); };
  room.postChat = (msg) => postChat(room, msg);
  room.game = new Game(room, settings && typeof settings === 'object' ? settings : {});
  rooms.set(room.code, room);
  return room;
}

function broadcast(room) {
  const now = Date.now();
  for (const p of room.players) {
    if (!p.socketId) continue;
    io.to(p.socketId).emit('state', {
      now,
      code: room.code,
      gameId: room.gameId,
      me: p.id,
      ...room.game.viewFor(p.id),
    });
  }
}

function postChat(room, msg) {
  const full = { id: ++room.chatSeq, at: Date.now(), ...msg };
  room.chat.push(full);
  if (room.chat.length > CHAT_HISTORY) room.chat.shift();
  for (const p of room.players) if (p.socketId) io.to(p.socketId).emit('chat', full);
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
    joinable: room.game.canJoin(),
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
  if (announceTimer) return;
  announceTimer = setTimeout(() => {
    announceTimer = null;
    io.to('lobby').emit('rooms', roomList());
  }, 300);
}

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
    ctx = { room, player };
    socket.leave('lobby');
    clearTimeout(room.cleanupTimer);
    socket.emit('chatHistory', room.chat);
    room.broadcast();
  }

  function detach() {
    if (!ctx) return;
    const { room, player } = ctx;
    ctx = null;
    socket.join('lobby');
    socket.emit('rooms', roomList());
    room.players = room.players.filter((p) => p !== player);
    room.game.onLeave(player.id, player.name);
    if (!room.players.some((p) => !p.bot)) return destroyRoom(room);
    postChat(room, { kind: 'system', code: 'sys.left', name: player.name });
    room.broadcast();
  }

  const chatTimes = [];
  socket.on('chat', (msg) => {
    if (!ctx || !msg || typeof msg !== 'object') return;
    const now = Date.now();
    while (chatTimes.length && now - chatTimes[0] > CHAT_WINDOW_MS) chatTimes.shift();
    if (chatTimes.length >= CHAT_BURST) return socket.emit('chatError', { code: 'srv.chatFast' });
    const { player, room } = ctx;
    const base = { playerId: player.id, name: player.name };
    if (msg.kind === 'sticker' && /^[a-z0-9]{1,16}$/.test(String(msg.sticker))) {
      chatTimes.push(now);
      postChat(room, { ...base, kind: 'sticker', sticker: msg.sticker });
    } else if (msg.kind === 'text') {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
      if (!text) return;
      chatTimes.push(now);
      postChat(room, { ...base, kind: 'text', text });
    }
  });

  socket.on('create', ({ name, gameId, settings } = {}, ack) => {
    const room = createRoom(gameId, settings);
    if (!room) return reply(ack, { ok: false, code: 'srv.noGame' });
    const player = { id: crypto.randomUUID(), name: cleanName(name), connected: true, socketId: null };
    room.players.push(player);
    room.game.onJoin(player);
    reply(ack, { ok: true, code: room.code, playerId: player.id });
    attach(room, player);
  });

  socket.on('join', ({ name, code, playerId } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return reply(ack, { ok: false, code: 'srv.notFound' });

    const existing = playerId && room.players.find((p) => p.id === playerId);
    if (existing) {
      reply(ack, { ok: true, code: room.code, playerId: existing.id, rejoined: true });
      return attach(room, existing);
    }
    if (!room.game.canJoin()) {
      const full = room.players.length >= room.game.maxPlayers;
      return reply(ack, { ok: false, code: full ? 'srv.full' : 'srv.inProgress' });
    }
    const player = { id: crypto.randomUUID(), name: cleanName(name), connected: true, socketId: null };
    room.players.push(player);
    room.game.onJoin(player);
    reply(ack, { ok: true, code: room.code, playerId: player.id });
    attach(room, player);
    postChat(room, { kind: 'system', code: 'sys.joined', name: player.name });
  });

  socket.on('action', (action) => {
    if (!ctx || !action || typeof action !== 'object') return;
    const { room } = ctx;
    if (action.type === 'addBot') return addBot(room, action.level);
    if (action.type === 'removeBot') return removeBot(room, action.id);
    room.game.onAction(ctx.player.id, action);
  });

  socket.on('leave', () => detach());

  socket.on('disconnect', () => {
    if (!ctx) return;
    const { room, player } = ctx;
    if (player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    room.broadcast();
    scheduleCleanup(room);
  });
});

server.listen(PORT, () => {
  console.log(`Holdem Arcade listening on http://localhost:${PORT}`);
});
