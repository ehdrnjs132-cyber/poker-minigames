const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const GAMES = {
  memory: require('./games/memoryPoker'),
};

const PORT = process.env.PORT || 3000;
const ROOM_IDLE_MS = 3 * 60 * 1000;

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
  return n || '플레이어';
}

function createRoom(gameId, settings) {
  const Game = GAMES[gameId];
  if (!Game) return null;
  const room = { code: genCode(), gameId, players: [], cleanupTimer: null };
  room.broadcast = () => broadcast(room);
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

function scheduleCleanup(room) {
  clearTimeout(room.cleanupTimer);
  if (room.players.some((p) => p.connected)) return;
  room.cleanupTimer = setTimeout(() => destroyRoom(room), ROOM_IDLE_MS);
}

function destroyRoom(room) {
  clearTimeout(room.cleanupTimer);
  room.game.dispose();
  rooms.delete(room.code);
}

io.on('connection', (socket) => {
  let ctx = null; // { room, player }

  const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

  function attach(room, player) {
    if (ctx && ctx.player !== player) detach();
    if (player.socketId && player.socketId !== socket.id) {
      io.to(player.socketId).emit('kicked', '다른 창에서 같은 자리로 접속했습니다.');
    }
    player.socketId = socket.id;
    player.connected = true;
    ctx = { room, player };
    clearTimeout(room.cleanupTimer);
    room.broadcast();
  }

  function detach() {
    if (!ctx) return;
    const { room, player } = ctx;
    ctx = null;
    room.players = room.players.filter((p) => p !== player);
    room.game.onLeave(player.id, player.name);
    if (room.players.length === 0) destroyRoom(room);
    else room.broadcast();
  }

  socket.on('create', ({ name, gameId, settings } = {}, ack) => {
    const room = createRoom(gameId, settings);
    if (!room) return reply(ack, { ok: false, error: '없는 게임입니다.' });
    const player = { id: crypto.randomUUID(), name: cleanName(name), connected: true, socketId: null };
    room.players.push(player);
    room.game.onJoin(player);
    reply(ack, { ok: true, code: room.code, playerId: player.id });
    attach(room, player);
  });

  socket.on('join', ({ name, code, playerId } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return reply(ack, { ok: false, error: '방을 찾을 수 없습니다.' });

    const existing = playerId && room.players.find((p) => p.id === playerId);
    if (existing) {
      reply(ack, { ok: true, code: room.code, playerId: existing.id, rejoined: true });
      return attach(room, existing);
    }
    if (!room.game.canJoin()) {
      const full = room.players.length >= room.game.constructor.meta.maxPlayers;
      return reply(ack, { ok: false, error: full ? '방이 가득 찼습니다.' : '이미 게임이 진행 중입니다.' });
    }
    const player = { id: crypto.randomUUID(), name: cleanName(name), connected: true, socketId: null };
    room.players.push(player);
    room.game.onJoin(player);
    reply(ack, { ok: true, code: room.code, playerId: player.id });
    attach(room, player);
  });

  socket.on('action', (action) => {
    if (!ctx || !action || typeof action !== 'object') return;
    ctx.room.game.onAction(ctx.player.id, action);
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
