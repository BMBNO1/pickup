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

function createNewGameState() {
  return {
    round: 1,
    currentPlayerIndex: 0,
    playersOrder: [],
    reels: [null, null, null, null, null],
    holds: [false, false, false, false, false],
    rollsLeft: 3,
    scores: {},
    started: false
  };
}

io.on('connection', (socket) => {
  console.log('conn', socket.id);

  socket.on('create-room', ({ roomId, name }, cb) => {
    if (!roomId) return cb && cb({ ok: false, error: 'no-room-id' });
    rooms[roomId] = rooms[roomId] || { players: {}, game: createNewGameState() };
    rooms[roomId].players[socket.id] = { name, id: socket.id };
    socket.join(roomId);
    io.to(roomId).emit('room-data', { room: roomId, players: Object.values(rooms[roomId].players), game: rooms[roomId].game });
    cb && cb({ ok: true });
  });

  socket.on('join-room', ({ roomId, name }, cb) => {
    if (!rooms[roomId]) return cb && cb({ ok: false, error: 'room-not-found' });
    rooms[roomId].players[socket.id] = { name, id: socket.id };
    socket.join(roomId);
    io.to(roomId).emit('room-data', { room: roomId, players: Object.values(rooms[roomId].players), game: rooms[roomId].game });
    cb && cb({ ok: true });
  });

  socket.on('start-game', ({ roomId }) => {
    const r = rooms[roomId];
    if (!r) return;
    r.game = createNewGameState();
    r.game.started = true;
    r.game.playersOrder = Object.keys(r.players);
    r.game.scores = Object.fromEntries(Object.keys(r.players).map(id => [id, 0]));
    io.to(roomId).emit('game-started', r.game);
  });

  socket.on('toggle-hold', ({ roomId, index }) => {
    const r = rooms[roomId];
    if (!r) return;
    r.game.holds[index] = !r.game.holds[index];
    io.to(roomId).emit('game-update', r.game);
  });

  socket.on('roll-reels', ({ roomId }) => {
    const r = rooms[roomId];
    if (!r) return;
    if (r.game.rollsLeft <= 0) return;
    for (let i = 0; i < r.game.reels.length; i++) {
      if (!r.game.holds[i]) {
        const symbols = ['horseshoe','star','clover','crown','moon','banana'];
        r.game.reels[i] = symbols[Math.floor(Math.random() * symbols.length)];
      }
    }
    r.game.rollsLeft -= 1;

    if (r.game.rollsLeft === 0) {
      const freq = {};
      r.game.reels.forEach(s => freq[s] = (freq[s]||0) + 1);
      const best = Object.values(freq).reduce((a,b) => Math.max(a,b), 0);
      let scoreGain = 0;
      if (best >= 3) {
        if (best === 3) scoreGain = 1000;
        if (best === 4) scoreGain = 3000;
        if (best === 5) scoreGain = 10000;
      }
      // crown multiplier
      const crowns = r.game.reels.filter(x => x === 'crown').length;
      if (crowns > 0) {
        scoreGain = scoreGain * (1 + crowns); // simple multiplier
      }
      const pid = r.game.playersOrder[r.game.currentPlayerIndex];
      r.game.scores[pid] = (r.game.scores[pid] || 0) + scoreGain;

      r.game.currentPlayerIndex = (r.game.currentPlayerIndex + 1) % r.game.playersOrder.length;
      if (r.game.currentPlayerIndex === 0) r.game.round += 1;

      r.game.rollsLeft = 3;
      r.game.holds = [false,false,false,false,false];
    }

    io.to(roomId).emit('game-update', r.game);
  });

  socket.on('leave-room', ({ roomId }) => {
    socket.leave(roomId);
    if (rooms[roomId] && rooms[roomId].players[socket.id]) delete rooms[roomId].players[socket.id];
    io.to(roomId).emit('room-data', { room: roomId, players: rooms[roomId] ? Object.values(rooms[roomId].players) : [] });
  });

  socket.on('disconnect', () => {
    for (const rid of Object.keys(rooms)) {
      if (rooms[rid].players[socket.id]) {
        delete rooms[rid].players[socket.id];
        io.to(rid).emit('room-data', { room: rid, players: Object.values(rooms[rid].players), game: rooms[rid].game });
      }
      if (Object.keys(rooms[rid].players).length === 0) delete rooms[rid];
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Server running on', PORT));