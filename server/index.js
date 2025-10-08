const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.get('/', (req, res) => res.send('Pick Up Multiplayer Server läuft!'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const MAX_SPIELER = 4;
const MAX_RUNDEN = 5;
const SYMBOLS = ['herz', 'stern', 'kreis', 'dreieck', 'quadrat', 'joker'];
const KOMBIS = [
  { name: "Drei gleiche", points: 100 },
  { name: "Vier gleiche", points: 400 },
  { name: "Fünf gleiche", points: 800 },
  { name: "Zwei gleiche", points: 50 },
  { name: "Full House", points: 500 },
  { name: "Fünf verschiedene", points: 700 },
  { name: "Joker", points: 200 }
];

const rooms = {};

function createPlayer(id, name) {
  return {
    id, name,
    reels: Array(5).fill(null),
    holds: Array(5).fill(false),
    drawsLeft: 3,
    punkte: 0,
    verbrauchte: [],
    beendet: false,
    runde: 1,
    message: '',
    auswahlKombis: []
  };
}

function createRoom() {
  return {
    spieler: [],
    started: false,
    runde: 1,
    ended: false
  };
}

function hasNOfAKind(reels, n) {
  const freq = {};
  reels.forEach(s => { freq[s] = (freq[s]||0)+1; });
  return Object.values(freq).includes(n);
}
function isFullHouse(reels) {
  const freq = {};
  reels.forEach(s => { freq[s] = (freq[s]||0)+1; });
  const vals = Object.values(freq).sort();
  return vals.length === 2 && vals[0] === 2 && vals[1] === 3;
}
function isFiveDifferent(reels) {
  const set = new Set(reels);
  return set.size === 5;
}
function isJoker(reels) {
  return reels.includes("joker");
}
function comboCheck(reels, verbrauchte) {
  const result = [];
  for (const k of KOMBIS) {
    if (verbrauchte.includes(k.name)) continue;
    let ok = false;
    if (k.name === "Drei gleiche") ok = hasNOfAKind(reels,3);
    else if (k.name === "Vier gleiche") ok = hasNOfAKind(reels,4);
    else if (k.name === "Fünf gleiche") ok = hasNOfAKind(reels,5);
    else if (k.name === "Zwei gleiche") ok = hasNOfAKind(reels,2);
    else if (k.name === "Full House") ok = isFullHouse(reels);
    else if (k.name === "Fünf verschiedene") ok = isFiveDifferent(reels);
    else if (k.name === "Joker") ok = isJoker(reels);
    if (ok) result.push(k);
  }
  return result;
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ roomId, name }, cb) => {
    if (!roomId || !name) return cb && cb({ ok: false, error: 'Room/Name fehlt' });
    if (!rooms[roomId]) rooms[roomId] = createRoom();
    if (rooms[roomId].spieler.length >= MAX_SPIELER) return cb && cb({ ok: false, error: 'Raum voll' });
    if (rooms[roomId].spieler.some(sp => sp.id === socket.id)) return cb && cb({ ok: false, error: 'Schon im Raum' });
    rooms[roomId].spieler.push(createPlayer(socket.id, name));
    socket.join(roomId);
    io.to(roomId).emit('room-data', rooms[roomId]);
    cb && cb({ ok: true });
  });

  socket.on('join-room', ({ roomId, name }, cb) => {
    if (!rooms[roomId]) return cb && cb({ ok: false, error: 'Raum existiert nicht' });
    if (rooms[roomId].spieler.length >= MAX_SPIELER) return cb && cb({ ok: false, error: 'Raum voll' });
    if (rooms[roomId].spieler.some(sp => sp.id === socket.id)) return cb && cb({ ok: false, error: 'Schon im Raum' });
    rooms[roomId].spieler.push(createPlayer(socket.id, name));
    socket.join(roomId);
    io.to(roomId).emit('room-data', rooms[roomId]);
    cb && cb({ ok: true });
  });

  socket.on('start-game', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;
    room.started = true;
    room.ended = false;
    room.runde = 1;
    for (const sp of room.spieler) {
      Object.assign(sp, createPlayer(sp.id, sp.name));
      sp.runde = 1;
      sp.beendet = false;
    }
    io.to(roomId).emit('game-update', room);
  });

  socket.on('toggle-hold', ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;
    const sp = room.spieler.find(s => s.id === socket.id);
    if (!sp || sp.beendet || sp.drawsLeft === 0) return;
    const heldCount = sp.holds.filter(Boolean).length;
    if (!sp.holds[index] && heldCount >= 2) return;
    sp.holds[index] = !sp.holds[index];
    io.to(roomId).emit('game-update', room);
  });

  socket.on('roll-reels', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;
    const sp = room.spieler.find(s => s.id === socket.id);
    if (!sp || sp.beendet || sp.drawsLeft === 0) return;
    sp.reels = sp.reels.map((s,i) => sp.holds[i] ? s : SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)]);
    sp.drawsLeft -= 1;
    if (sp.drawsLeft === 0) {
      sp.auswahlKombis = comboCheck(sp.reels, sp.verbrauchte);
    }
    io.to(roomId).emit('game-update', room);
  });

  socket.on('choose-combo', ({ roomId, kombiName }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;
    const sp = room.spieler.find(s => s.id === socket.id);
    if (!sp || sp.beendet || sp.drawsLeft !== 0) return;
    const k = KOMBIS.find(k => k.name === kombiName);
    if (!k) return;
    sp.punkte += k.points * 0.5;
    sp.verbrauchte.push(k.name);
    sp.message = `Kombination "${k.name}" gewählt! +${k.points * 0.5} Punkte`;
    sp.auswahlKombis = [];
    const alleKombisVerbraucht = sp.verbrauchte.length === KOMBIS.length;
    const keineKombiMehr = comboCheck(sp.reels, sp.verbrauchte).length === 0;
    if (alleKombisVerbraucht || keineKombiMehr) {
      sp.beendet = true;
      sp.runde = room.runde;
    }
    sp.drawsLeft = 3;
    sp.holds = Array(5).fill(false);
    sp.reels = Array(5).fill(null);
    io.to(roomId).emit('game-update', room);
    if (room.spieler.every(s => s.beendet)) {
      if (room.runde >= MAX_RUNDEN) {
        room.ended = true;
        io.to(roomId).emit('game-ended', room);
      } else {
        room.runde += 1;
        for (const s of room.spieler) {
          Object.assign(s, createPlayer(s.id, s.name));
          s.runde = room.runde;
          s.beendet = false;
        }
        io.to(roomId).emit('next-round', room);
      }
    }
  });

  socket.on('restart-game', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.started = false;
    room.ended = false;
    room.runde = 1;
    for (const sp of room.spieler) {
      Object.assign(sp, createPlayer(sp.id, sp.name));
      sp.runde = 1;
      sp.beendet = false;
    }
    io.to(roomId).emit('room-data', room);
    io.to(roomId).emit('game-update', room);
  });

  socket.on('leave-room', ({ roomId }) => {
    socket.leave(roomId);
    if (rooms[roomId]) {
      rooms[roomId].spieler = rooms[roomId].spieler.filter(s => s.id !== socket.id);
      if (rooms[roomId].spieler.length === 0) delete rooms[roomId];
      else io.to(roomId).emit('room-data', rooms[roomId]);
    }
  });

  socket.on('disconnect', () => {
    for (const rid of Object.keys(rooms)) {
      rooms[rid].spieler = rooms[rid].spieler.filter(s => s.id !== socket.id);
      if (rooms[rid].spieler.length === 0) delete rooms[rid];
      else io.to(rid).emit('room-data', rooms[rid]);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Server läuft auf', PORT));