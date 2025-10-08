const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.get('/', (req, res) => res.send('Pick Up server running'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const rooms = {};
const MAX_PLAYERS = 4;
const SYMBOLS = ['star', 'moon', 'horseshoe', 'heart', 'crown', 'clover'];
const GOAL_SCORE = 220000;

function createNewGameState(playersOrder) {
  return {
    round: 1,
    currentPlayerIndex: 0,
    playersOrder: playersOrder,
    reels: Array(5).fill(null),
    holds: Array(5).fill(false),
    rollsLeft: 3,
    scores: Object.fromEntries(playersOrder.map(id => [id, 0])),
    started: false,
    ended: false
  };
}

io.on('connection', (socket) => {
  console.log('conn', socket.id);

  socket.on('create-room', ({ roomId, name }, cb) => {
    if (!roomId) return cb && cb({ ok: false, error: 'no-room-id' });
    if (!name) return cb && cb({ ok: false, error: 'no-name' });

    rooms[roomId] = rooms[roomId] || { players: {}, game: null };
    if (Object.keys(rooms[roomId].players).length >= MAX_PLAYERS) {
      return cb && cb({ ok: false, error: 'room-full' });
    }
    rooms[roomId].players[socket.id] = { name, id: socket.id };
    socket.join(roomId);

    io.to(roomId).emit('room-data', {
      room: roomId,
      players: Object.values(rooms[roomId].players),
      game: rooms[roomId].game
    });
    cb && cb({ ok: true });
  });

  socket.on('join-room', ({ roomId, name }, cb) => {
    if (!rooms[roomId]) return cb && cb({ ok: false, error: 'room-not-found' });
    if (!name) return cb && cb({ ok: false, error: 'no-name' });
    if (Object.keys(rooms[roomId].players).length >= MAX_PLAYERS) {
      return cb && cb({ ok: false, error: 'room-full' });
    }
    rooms[roomId].players[socket.id] = { name, id: socket.id };
    socket.join(roomId);

    io.to(roomId).emit('room-data', {
      room: roomId,
      players: Object.values(rooms[roomId].players),
      game: rooms[roomId].game
    });
    cb && cb({ ok: true });
  });

  socket.on('start-game', ({ roomId }) => {
    const r = rooms[roomId];
    if (!r) return;
    const playersOrder = Object.keys(r.players);
    if (playersOrder.length < 2) return; // Mindestens 2 Spieler
    r.game = createNewGameState(playersOrder);
    r.game.started = true;

    io.to(roomId).emit('game-started', r.game);
  });

  socket.on('toggle-hold', ({ roomId, index }) => {
    const r = rooms[roomId];
    if (!r || !r.game || r.game.ended) return;
    if (index < 0 || index > 4) return;
    r.game.holds[index] = !r.game.holds[index];
    io.to(roomId).emit('game-update', r.game);
  });

  socket.on('roll-reels', ({ roomId }) => {
    const r = rooms[roomId];
    if (!r || !r.game || r.game.ended) return;
    if (r.game.rollsLeft <= 0) return;
    for (let i = 0; i < r.game.reels.length; i++) {
      if (!r.game.holds[i]) {
        r.game.reels[i] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      }
    }
    r.game.rollsLeft -= 1;

    if (r.game.rollsLeft === 0) {
      // Score calculation (Fun4Four rules)
      const freq = {};
      r.game.reels.forEach(s => freq[s] = (freq[s] || 0) + 1);
      const best = Object.values(freq).reduce((a, b) => Math.max(a, b), 0);

      let scoreGain = 0;
      if (best === 5) scoreGain = 10000;
      else if (best === 4) scoreGain = 3000;
      else if (best === 3) scoreGain = 1000;

      // Crown multiplier
      const crowns = r.game.reels.filter(x => x === 'crown').length;
      if (crowns > 0) scoreGain *= (1 + crowns);

      const pid = r.game.playersOrder[r.game.currentPlayerIndex];
      r.game.scores[pid] = (r.game.scores[pid] || 0) + scoreGain;

      // Nächster Spieler / nächste Runde
      r.game.currentPlayerIndex = (r.game.currentPlayerIndex + 1) % r.game.playersOrder.length;
      if (r.game.currentPlayerIndex === 0) r.game.round += 1;

      // Spielende prüfen (Ziel erreicht)
      const totalScore = Object.values(r.game.scores).reduce((a, b) => a + b, 0);
      if (totalScore >= GOAL_SCORE) {
        r.game.ended = true;
        io.to(roomId).emit('game-update', r.game);
        io.to(roomId).emit('game-ended', { game: r.game, room: roomId });
        return;
      }

      r.game.rollsLeft = 3;
      r.game.holds = Array(5).fill(false);
      r.game.reels = Array(5).fill(null);
    }
    io.to(roomId).emit('game-update', r.game);
  });

  socket.on('leave-room', ({ roomId }) => {
    socket.leave(roomId);
    if (rooms[roomId] && rooms[roomId].players[socket.id]) {
      delete rooms[roomId].players[socket.id];
    }
    io.to(roomId).emit('room-data', {
      room: roomId,
      players: rooms[roomId] ? Object.values(rooms[roomId].players) : [],
      game: rooms[roomId]?.game
    });
  });

  socket.on('disconnect', () => {
    for (const rid of Object.keys(rooms)) {
      if (rooms[rid].players[socket.id]) {
        delete rooms[rid].players[socket.id];
        io.to(rid).emit('room-data', {
          room: rid,
          players: Object.values(rooms[rid].players),
          game: rooms[rid].game
        });
      }
      if (Object.keys(rooms[rid].players).length === 0) delete rooms[rid];
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Server running on', PORT));