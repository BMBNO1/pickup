import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

// Neon Symbol SVGs
const SYMBOLS = [
  'star', 'moon', 'horseshoe', 'heart', 'crown', 'clover'
];
const SYMBOL_SVGS = {
  star: (
    <svg className="neon-symbol" viewBox="0 0 64 64">
      <polygon points="32,7 39,27 61,27 43,39 50,59 32,47 14,59 21,39 3,27 25,27" fill="#ffe000" stroke="#ff00de" strokeWidth="3" />
    </svg>
  ),
  moon: (
    <svg className="neon-symbol" viewBox="0 0 64 64">
      <path d="M40 32a24 24 0 1 1-14-22 18 18 0 1 0 14 22z" fill="#fff" stroke="#ff00de" strokeWidth="3" />
    </svg>
  ),
  horseshoe: (
    <svg className="neon-symbol" viewBox="0 0 64 64">
      <path d="M16 8c-6 8-8 16-8 24s2 16 8 24c6 8 20 8 26 0 6-8 8-16 8-24s-2-16-8-24c-6-8-20-8-26 0z" fill="none" stroke="#ffe000" strokeWidth="5" />
      <circle cx="18" cy="18" r="3" fill="#ff00de" />
      <circle cx="46" cy="18" r="3" fill="#ff00de" />
      <circle cx="32" cy="48" r="3" fill="#ff00de" />
    </svg>
  ),
  heart: (
    <svg className="neon-symbol" viewBox="0 0 64 64">
      <path d="M32 58s-26-15-26-30a14 14 0 0 1 28-4 14 14 0 0 1 28 4c0 15-26 30-26 30z" fill="#ff00de" stroke="#ffe000" strokeWidth="3" />
    </svg>
  ),
  crown: (
    <svg className="neon-symbol" viewBox="0 0 64 64">
      <polygon points="8,44 56,44 48,16 32,36 16,16" fill="#ffe000" stroke="#ff00de" strokeWidth="3" />
      <rect x="16" y="44" width="32" height="10" fill="#ff00de" stroke="#ffe000" strokeWidth="2"/>
    </svg>
  ),
  clover: (
    <svg className="neon-symbol" viewBox="0 0 64 64">
      <circle cx="20" cy="24" r="10" fill="#44ff44" stroke="#ffe000" strokeWidth="2"/>
      <circle cx="44" cy="24" r="10" fill="#44ff44" stroke="#ffe000" strokeWidth="2"/>
      <circle cx="32" cy="44" r="10" fill="#44ff44" stroke="#ffe000" strokeWidth="2"/>
      <rect x="29" y="44" width="6" height="12" fill="#44ff44" />
    </svg>
  )
};

// Socket setup
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const socket = io(SOCKET_URL, { autoConnect: true });

// Helper for offline mode (hotseat)
function createOfflineGame(playersCount=2) {
  return {
    round: 1,
    currentPlayerIndex: 0,
    playersOrder: Array.from({length: playersCount}, (_,i)=>'offline'+i),
    reels: Array(5).fill(null),
    holds: Array(5).fill(false),
    rollsLeft: 3,
    scores: Object.fromEntries(Array.from({length: playersCount}, (_,i)=>['offline'+i,0])),
    started: true,
    offline: true,
  };
}

function Reel({ symbol, held, onToggle }) {
  return (
    <div className={`neon-reel${held ? " held" : ""}`}>
      {symbol ? SYMBOL_SVGS[symbol] : <div style={{height:48}} />}
      <div style={{fontSize:"0.9em",marginTop:"-3px"}}>{symbol ? symbol.toUpperCase() : ""}</div>
      <button className="neon-btn" style={{marginTop:6}} onClick={onToggle}>{held ? "HELD" : "HOLD"}</button>
    </div>
  );
}

export default function App() {
  // States
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState("room1");
  const [name, setName] = useState("Player"+Math.floor(Math.random()*1000));
  const [players, setPlayers] = useState([]);
  const [game, setGame] = useState(null);
  const [offline, setOffline] = useState(false);
  const [offlinePlayers, setOfflinePlayers] = useState(2);

  // Socket events
  useEffect(() => {
    if (offline) return;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("room-data", (data) => {
      setPlayers(data.players || []);
      if (data.game) setGame(data.game);
    });
    socket.on("game-started", (g) => setGame(g));
    socket.on("game-update", (g) => setGame({...g}));
    return () => { socket.off(); };
  }, [offline]);

  // Controls
  function createRoom() {
    socket.emit("create-room", { roomId: room, name }, (res) => { if (!res.ok) alert(res.error); });
  }
  function joinRoom() {
    socket.emit("join-room", { roomId: room, name }, (res) => { if (!res.ok) alert(res.error); });
  }
  function startGame() {
    socket.emit("start-game", { roomId: room });
  }
  function toggleHold(i) {
    if (offline) {
      setGame(g => ({...g, holds: g.holds.map((h,idx)=> idx===i ? !h : h)}));
      return;
    }
    socket.emit("toggle-hold", { roomId: room, index: i });
  }
  function roll() {
    if (offline) {
      setGame(g => {
        if (g.rollsLeft <= 0) return g;
        const newReels = g.reels.map((s,idx) => g.holds[idx] ? s : SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)]);
        const newRolls = g.rollsLeft - 1;
        let scores = {...g.scores};
        let nextPlayer = g.currentPlayerIndex;
        let round = g.round;
        let holds = Array(5).fill(false);
        if (newRolls === 0) {
          // Score logic wie Fun4Four
          let freq = {};
          newReels.forEach(s => freq[s] = (freq[s]||0)+1);
          let best = Object.values(freq).reduce((a,b)=>Math.max(a,b),0);
          let scoreGain = 0;
          if (best === 5) scoreGain = 10000;
          else if (best === 4) scoreGain = 3000;
          else if (best === 3) scoreGain = 1000;
          // Krone Multiplikator
          const crowns = newReels.filter(x=>x==="crown").length;
          if (crowns > 0) scoreGain *= (1+crowns);
          const pid = g.playersOrder[g.currentPlayerIndex];
          scores[pid] = (scores[pid]||0) + scoreGain;
          nextPlayer = (g.currentPlayerIndex + 1) % g.playersOrder.length;
          if (nextPlayer === 0) round += 1;
          holds = Array(5).fill(false);
          return {
            ...g,
            reels: Array(5).fill(null),
            holds,
            scores,
            currentPlayerIndex: nextPlayer,
            round,
            rollsLeft: 3
          };
        } else {
          return {
            ...g,
            reels: newReels,
            rollsLeft: newRolls
          };
        }
      });
      return;
    }
    socket.emit("roll-reels", { roomId: room });
  }

  // Offline setup
  function startOfflineGame() {
    setOffline(true);
    setGame(createOfflineGame(offlinePlayers));
    setPlayers(Array.from({length:offlinePlayers},(v,i)=>({id:"offline"+i, name:"Player"+(i+1)})));
  }

  // UI helpers
  function getPlayerName(pid) {
    const found = players.find(p=>p.id===pid);
    return found ? found.name : pid;
  }
  // Zielbalken: z.B. Ziel 220.000 Punkte
  const goal = 220000;
  const currentScore = game ? Object.values(game.scores||{}).reduce((a,b)=>a+b,0) : 0;

  return (
    <div style={{maxWidth:1200,margin:"0 auto",padding:"2em"}}>
      <div className="neon-panel" style={{marginBottom:"1em", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <div>
          <div className="neon-text" style={{fontSize:"2.7rem"}}>PICK UP</div>
          <div style={{fontSize:"1.2em",marginTop:"0.2em",color:"#ffe000",textShadow:"0 0 10px #ff00de"}}>Fun4Four Edition</div>
        </div>
        <div>
          <button className="neon-btn" onClick={()=>window.location.reload()}>Exit</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:"2em"}}>
        <section className="neon-panel">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.2em"}}>
            <div className="neon-round">Round: {game?.round ?? "—"}</div>
            <div className="neon-current">
              Rolls left: {game?.rollsLeft ?? "—"}
            </div>
            <div className="neon-current">
              Current: {game?.playersOrder ? getPlayerName(game.playersOrder[game.currentPlayerIndex]) : "—"}
            </div>
          </div>
          <div className="neon-goalbar">
            <div className="neon-goalbar-fill"
              style={{width:`${Math.min(currentScore/goal*100,100)}%`}}
            ></div>
            <span style={{position:"absolute",left:"50%",top:"3px",transform:"translateX(-50%)",fontWeight:"bold",color:"#ffe000"}}>{currentScore} / {goal}</span>
          </div>
          <div className="neon-symbol-row">
            {SYMBOLS.map(s => <div key={s}>{SYMBOL_SVGS[s]}</div>)}
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:"7px"}}>
            {(game?.reels || Array(5).fill(null)).map((s,i) => (
              <Reel key={i} symbol={s} held={game?.holds?.[i]} onToggle={()=>toggleHold(i)} />
            ))}
          </div>
          <div className="neon-controls">
            <button className="neon-btn" onClick={roll}>DRAW</button>
            <button className="neon-btn" onClick={()=>window.location.reload()}>EXIT</button>
          </div>
        </section>
        <aside className="neon-panel">
          <div style={{marginBottom:"1em"}}>
            <span className="neon-round">Players</span>
            <ul className="neon-player-list">
              {(game?.playersOrder||[]).map(pid=>(
                <li key={pid}>{getPlayerName(pid)} <span style={{color:"#ffe000"}}>({game?.scores?.[pid]??0})</span></li>
              ))}
            </ul>
          </div>
          {!offline && (
            <>
              <div style={{marginBottom:"1em"}}>
                <input className="neon-btn" style={{width:"80%",marginBottom:"0.5em"}} type="text" value={room} onChange={e=>setRoom(e.target.value)} placeholder="Room" />
                <input className="neon-btn" style={{width:"80%",marginBottom:"0.5em"}} type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Name" />
                <div style={{display:"flex",gap:"6px"}}>
                  <button className="neon-btn" onClick={createRoom}>Create</button>
                  <button className="neon-btn" onClick={joinRoom}>Join</button>
                  <button className="neon-btn" onClick={startGame}>Start</button>
                </div>
                <div style={{marginTop:"0.6em",fontSize:"0.9em",color:"#fff"}}>
                  Multiplayer: Verbinde dich mit anderen Spielern online.
                </div>
              </div>
              <div style={{marginBottom:"1em"}}>
                <div style={{fontWeight:"bold",marginBottom:"0.4em"}}>Offline-Modus:</div>
                <label style={{color:"#fff"}}>Anzahl Spieler:&nbsp;
                  <select value={offlinePlayers} onChange={e=>setOfflinePlayers(Number(e.target.value))} style={{marginRight:"0.5em"}}>
                    {[2,3,4].map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <button className="neon-btn" onClick={startOfflineGame}>Start Hotseat</button>
                <div style={{marginTop:"0.6em",fontSize:"0.9em",color:"#fff"}}>
                  Offline: Mehrere Spieler spielen am selben Gerät.
                </div>
              </div>
            </>
          )}
          <div style={{marginTop:"2em",fontSize:"0.9em",color:"#ffe000"}}>
            <b>Regeln:</b><br/>
            - 5 Walzen, 3 Ziehungen pro Spieler<br/>
            - Kombinationen: 3 gleiche = 1000, 4 = 3000, 5 = 10000 Punkte<br/>
            - Kronen multiplizieren die Punkte<br/>
            - Ziel: Als Team 220.000 Punkte erreichen<br/>
            - Max. 4 Spieler, Online & Offline
          </div>
        </aside>
      </div>
    </div>
  );
}