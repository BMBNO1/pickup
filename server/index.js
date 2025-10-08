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
const SYMBOLS = [
  { key: 'kreis', label: 'Kreis', points3: 30, points4: 60, points5: 150 },
  { key: 'dreieck', label: 'Dreieck', points3: 40, points4: 80, points5: 200 },
  { key: 'quadrat', label: 'Quadrat', points3: 60, points4: 120, points5: 300 },
  { key: 'herz', label: 'Herz', points3: 80, points4: 160, points5: 400 },
  { key: 'stern', label: 'Stern', points3: 110, points4: 220, points5: 550 },
  { key: 'joker', label: 'Joker', points3: 200, points4: 400, points5: 1000 }
];
const KOMBIS = [
  { name: "Fünf verschiedene", points: 800 },
  { name: "Full House", points: 600 },
  { name: "Vier gleiche", points: 400 },
  { name: "Fünf gleiche", points: 900 },
  { name: "Joker", points: 250 }
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
    symbolVerbrauchte: [],
    beendet: false,
    runde: 1,
    message: '',
    auswahlKombis: [],
    auswahlSymbole: [],
    symbolResults: SYMBOLS.map(s => ({ ...s, count: 0, punkte: 0, punkteLabel: "" }))
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

function countSymbols(reels) {
  const freq = {};
  reels.forEach(s => { freq[s] = (freq[s]||0)+1; });
  return freq;
}

function isFiveDifferent(reels) {
  const set = new Set(reels);
  return set.size === 5;
}
function isFullHouse(reels) {
  const freq = Object.values(countSymbols(reels)).sort();
  return freq.length === 2 && freq[0] === 2 && freq[1] === 3;
}
function hasNOfAKind(reels, n) {
  const freq = Object.values(countSymbols(reels));
  return freq.includes(n);
}
function isJoker(reels) {
  return reels.includes("joker");
}
function comboCheck(reels, verbrauchte) {
  const result = [];
  if (!verbrauchte.includes("Fünf verschiedene") && isFiveDifferent(reels)) result.push(KOMBIS[0]);
  if (!verbrauchte.includes("Full House") && isFullHouse(reels)) result.push(KOMBIS[1]);
  if (!verbrauchte.includes("Vier gleiche") && hasNOfAKind(reels,4)) result.push(KOMBIS[2]);
  if (!verbrauchte.includes("Fünf gleiche") && hasNOfAKind(reels,5)) result.push(KOMBIS[3]);
  if (!verbrauchte.includes("Joker") && isJoker(reels)) result.push(KOMBIS[4]);
  return result;
}

// Gibt vollständige Symbolpunkte-Liste zurück (inkl. „verbraucht“)
function symbolPoints(reels, symbolVerbrauchte) {
  const freq = countSymbols(reels);
  return SYMBOLS.map(s => {
    const n = freq[s.key] || 0;
    let punkte = 0, label = "";
    if (!symbolVerbrauchte.includes(s.key)) {
      if (n === 3) { punkte = s.points3; label = "3x"; }
      else if (n === 4) { punkte = s.points4; label = "4x"; }
      else if (n === 5) { punkte = s.points5; label = "5x"; }
    }
    return { ...s, count: n, punkte, punkteLabel: label, verbraucht: symbolVerbrauchte.includes(s.key) };
  });
}

function noKombiLeft(sp) {
  // Keine Kombis/Symbole mehr auswählbar
  const kombis = comboCheck(sp.reels, sp.verbrauchte).length;
  const symbole = symbolPoints(sp.reels, sp.symbolVerbrauchte).filter(s=>s.punkte > 0 && !s.verbraucht).length;
  return kombis === 0 && symbole === 0;
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
    sp.holds[index] = !sp.holds[index];
    io.to(roomId).emit('game-update', room);
  });

  socket.on('roll-reels', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;
    const sp = room.spieler.find(s => s.id === socket.id);
    if (!sp || sp.beendet || sp.drawsLeft === 0) return;
    sp.reels = sp.reels.map((s,i) => sp.holds[i] ? s : SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)].key);
    sp.drawsLeft -= 1;
    sp.symbolResults = symbolPoints(sp.reels, sp.symbolVerbrauchte);
    sp.auswahlKombis = [];
    sp.auswahlSymbole = [];
    if (sp.drawsLeft === 0 || noKombiLeft(sp)) {
      // Nach letztem Dreh oder nichts mehr möglich
      sp.auswahlKombis = comboCheck(sp.reels, sp.verbrauchte);
      sp.auswahlSymbole = symbolPoints(sp.reels, sp.symbolVerbrauchte)
        .filter(s=>s.punkte > 0 && !s.verbraucht);
    }
    // Automatisches Rundenende: Wenn keine Auswahl mehr, Runde beenden
    if (noKombiLeft(sp)) {
      sp.beendet = true;
      sp.runde = room.runde;
    }
    io.to(roomId).emit('game-update', room);
    // Wenn alle Spieler fertig -> nächste Runde
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

  socket.on('choose-combo', ({ roomId, kombiName, symbolKey }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;
    const sp = room.spieler.find(s => s.id === socket.id);
    if (!sp || sp.beendet || (sp.drawsLeft > 0 && !noKombiLeft(sp))) return;
    let punkteAdd = 0;
    if (kombiName) {
      const k = KOMBIS.find(k => k.name === kombiName);
      if (!k) return;
      punkteAdd = k.points;
      sp.verbrauchte.push(k.name);
      sp.message = `Kombination "${k.name}" gewählt! +${k.points} Punkte`;
    } else if (symbolKey) {
      const symbolData = symbolPoints(sp.reels, sp.symbolVerbrauchte).find(s => s.key === symbolKey);
      if (!symbolData) return;
      punkteAdd = symbolData.punkte;
      sp.symbolVerbrauchte.push(symbolKey);
      sp.message = `Symbol "${symbolData.label}" gewählt! +${symbolData.punkte} Punkte`;
    }
    sp.punkte += punkteAdd;
    sp.auswahlKombis = [];
    sp.auswahlSymbole = [];
    sp.symbolResults = symbolPoints([], sp.symbolVerbrauchte);
    // Nach Wertung: Runde vorbei wenn keine Auswahl mehr
    if (noKombiLeft(sp)) {
      sp.beendet = true;
      sp.runde = room.runde;
    } else {
      // Für nächste Zug: alles zurücksetzen
      sp.reels = Array(5).fill(null);
      sp.holds = Array(5).fill(false);
      sp.drawsLeft = 3;
    }
    io.to(roomId).emit('game-update', room);
    // Wenn alle Spieler fertig -> nächste Runde
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