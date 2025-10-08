import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const socket = io(SOCKET_URL);

const SYMBOLS = ['herz', 'stern', 'kreis', 'dreieck', 'quadrat', 'joker'];
const SYMBOL_SVGS = {
  herz: (<svg className="neon-symbol" viewBox="0 0 64 64"><path d="M32 58s-26-15-26-30a14 14 0 0 1 28-4 14 14 0 0 1 28 4c0 15-26 30-26 30z" fill="#ff00de" stroke="#ffe000" strokeWidth="3" /></svg>),
  stern: (<svg className="neon-symbol" viewBox="0 0 64 64"><polygon points="32,7 39,27 61,27 43,39 50,59 32,47 14,59 21,39 3,27 25,27" fill="#ffe000" stroke="#ff00de" strokeWidth="3" /></svg>),
  kreis: (<svg className="neon-symbol" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#fff" stroke="#ff00de" strokeWidth="3" /></svg>),
  dreieck: (<svg className="neon-symbol" viewBox="0 0 64 64"><polygon points="32,12 56,52 8,52" fill="#4ee9ff" stroke="#ffe000" strokeWidth="3" /></svg>),
  quadrat: (<svg className="neon-symbol" viewBox="0 0 64 64"><rect x="14" y="14" width="36" height="36" fill="#44ff44" stroke="#ffe000" strokeWidth="3" /></svg>),
  joker: (<svg className="neon-symbol" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#ffe000" stroke="#ff00de" strokeWidth="3" /><text x="32" y="38" textAnchor="middle" fontSize="22" fill="#ff00de" fontWeight="bold">J</text></svg>)
};

const MAX_SPIELER = 4;
const MAX_RUNDEN = 5;
const KOMBIS = [
  { name: "Drei gleiche", points: 100 },
  { name: "Vier gleiche", points: 400 },
  { name: "Fünf gleiche", points: 800 },
  { name: "Zwei gleiche", points: 50 },
  { name: "Full House", points: 500 },
  { name: "Fünf verschiedene", points: 700 },
  { name: "Joker", points: 200 }
];

function Reel({ symbol, held, onToggle }) {
  return (
    <div className={`neon-reel${held ? " held" : ""}`}>
      {symbol ? SYMBOL_SVGS[symbol] : <div style={{height:48}} />}
      <div style={{fontSize:"0.9em",marginTop:"-3px"}}>{symbol ? symbol.charAt(0).toUpperCase()+symbol.slice(1) : ""}</div>
      <button className="neon-btn" style={{marginTop:6}} onClick={onToggle}>
        {held ? "GEHALTEN" : "HALTEN"}
      </button>
    </div>
  );
}

export default function App() {
  // Verbindungs-/Raumzustände
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState("room1");
  const [name, setName] = useState("");
  const [spieler, setSpieler] = useState([]);
  const [meId, setMeId] = useState("");
  const [roomState, setRoomState] = useState({ started: false, runde: 1, ended: false, spieler: [] });
  const [message, setMessage] = useState('');
  const [showEnd, setShowEnd] = useState(false);

  useEffect(() => {
    socket.on("connect", () => {
      setConnected(true);
      setMeId(socket.id);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room-data", (data) => {
      setRoomState(data);
      setSpieler(data.spieler || []);
    });
    socket.on("game-update", (data) => {
      setRoomState(data);
      setSpieler(data.spieler || []);
      setShowEnd(data.ended || false);
    });
    socket.on("game-ended", (data) => {
      setRoomState(data);
      setSpieler(data.spieler || []);
      setShowEnd(true);
    });
    socket.on("next-round", (data) => {
      setRoomState(data);
      setSpieler(data.spieler || []);
      setMessage(`Runde ${data.runde} beginnt!`);
    });
    return () => { socket.off(); }
  }, []);

  // Raum betreten/Spieler hinzufügen
  function createRoom() {
    if (!name) { setMessage("Bitte gib deinen Namen ein."); return; }
    socket.emit("create-room", { roomId: room, name }, (res) => {
      if (!res.ok) setMessage(res.error);
    });
  }
  function joinRoom() {
    if (!name) { setMessage("Bitte gib deinen Namen ein."); return; }
    socket.emit("join-room", { roomId: room, name }, (res) => {
      if (!res.ok) setMessage(res.error);
    });
  }
  function startGame() { socket.emit("start-game", { roomId: room }); }
  function leaveRoom() { socket.emit("leave-room", { roomId: room }); window.location.reload(); }

  // Eigener Spielerobjekt
  const me = spieler.find(s => s.id === meId);

  // Aktionen für eigenen Spieler
  function toggleHold(i) { socket.emit("toggle-hold", { roomId: room, index: i }); }
  function roll() { socket.emit("roll-reels", { roomId: room }); }
  function chooseCombo(name) { socket.emit("choose-combo", { roomId: room, kombiName: name }); }
  function restartGame() { socket.emit("restart-game", { roomId: room }); setShowEnd(false); }

  // Kombi-Highlight für eigenen Spieler
  function isErfüllbar(name) {
    if (!me) return false;
    const verbrauchte = me.verbrauchte || [];
    if (verbrauchte.includes(name)) return false;
    // Kombi-Logik wie Server
    const reels = me.reels || [];
    if (name === "Drei gleiche") return hasNOfAKind(reels,3);
    if (name === "Vier gleiche") return hasNOfAKind(reels,4);
    if (name === "Fünf gleiche") return hasNOfAKind(reels,5);
    if (name === "Zwei gleiche") return hasNOfAKind(reels,2);
    if (name === "Full House") return isFullHouse(reels);
    if (name === "Fünf verschiedene") return isFiveDifferent(reels);
    if (name === "Joker") return isJoker(reels);
    return false;
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

  // Gewinner ermitteln
  let sieger = [];
  if (showEnd && spieler.length > 0) {
    let maxPunkte = Math.max(...spieler.map(s=>s.punkte));
    sieger = spieler.filter(s=>s.punkte === maxPunkte);
  }

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"2em"}}>
      <div className="neon-panel" style={{marginBottom:"1em", textAlign:"center"}}>
        <div className="neon-text" style={{fontSize:"2.2rem"}}>PICK UP</div>
        <div style={{fontSize:"1.1em",color:"#ffe000",textShadow:"0 0 10px #ff00de"}}>Online Multiplayer – Deutsche Version</div>
      </div>
      {!roomState.started && (
        <div className="neon-panel">
          <div>
            <label>Raum: <input className="neon-btn" style={{width:120}} type="text" value={room} onChange={e=>setRoom(e.target.value)} /></label>
            <label style={{marginLeft:"1em"}}>Name: <input className="neon-btn" style={{width:120}} type="text" value={name} onChange={e=>setName(e.target.value)} /></label>
          </div>
          <div style={{marginTop:"1em"}}>
            <button className="neon-btn" onClick={createRoom}>Raum erstellen</button>
            <button className="neon-btn" onClick={joinRoom} style={{marginLeft:"1em"}}>Raum betreten</button>
            <button className="neon-btn" onClick={startGame} style={{marginLeft:"1em"}}>Spiel starten</button>
            <button className="neon-btn" onClick={leaveRoom} style={{marginLeft:"1em"}}>Verlassen</button>
          </div>
          <div style={{marginTop:"1em",color:"#fff"}}>
            Aktive Spieler: {spieler.map(s=>s.name).join(", ")}
          </div>
          <div style={{marginTop:"1em",color:"#ffe000"}}>{message}</div>
        </div>
      )}
      {roomState.started && (
        <div className="neon-panel">
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:"1em"}}>
            <div className="neon-round">Runde: {roomState.runde} / {MAX_RUNDEN}</div>
            <div className="neon-current">Max. Spieler: {MAX_SPIELER}</div>
            <div className="neon-current">Raum: {room}</div>
            <button className="neon-btn" onClick={leaveRoom}>Verlassen</button>
          </div>
          <div style={{display:"flex",gap:"2em",justifyContent:"center"}}>
            {spieler.map(sp=>(
              <div key={sp.id} style={{width:180,background:meId===sp.id?"rgba(255,224,0,0.2)":"rgba(255,0,222,0.1)",borderRadius:"12px",padding:"1em",boxShadow:"0 0 8px #ff00de"}}>
                <div style={{fontWeight:"bold",color:"#ffe000",marginBottom:3}}>{sp.name}</div>
                <div>Runde: {sp.runde}</div>
                <div>Punkte: {sp.punkte}</div>
                <div>Ziehungen: {sp.drawsLeft} / 3</div>
                <div style={{display:"flex",justifyContent:"center",gap:"6px",margin:"0.7em 0"}}>
                  {(sp.reels||[]).map((s,i)=>(
                    <div key={i} className={`neon-reel${sp.holds && sp.holds[i] ? " held" : ""}`} style={{width:38,height:56,minWidth:38}}>
                      {s ? SYMBOL_SVGS[s] : <div style={{height:28}} />}
                    </div>
                  ))}
                </div>
                <div style={{fontSize:"0.85em",color:"#fff",minHeight:18}}>{sp.message}</div>
                {/* Kombi-Auswahl Buttons für eigenen Spieler */}
                {meId===sp.id && !roomState.ended && !sp.beendet && sp.drawsLeft===0 && (sp.auswahlKombis && sp.auswahlKombis.length > 0) && (
                  <div style={{marginTop:"0.5em"}}>
                    <div style={{fontWeight:"bold",marginBottom:"0.2em"}}>Wähle eine Kombination:</div>
                    <div style={{display:"flex",gap:"7px",flexWrap:"wrap"}}>
                      {sp.auswahlKombis.map(k=>(
                        <button className="neon-btn" key={k.name} onClick={()=>chooseCombo(k.name)}>
                          {k.name} (+{k.points * 0.5} Punkte)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Halten/Ziehen wie gehabt */}
                {meId===sp.id && !roomState.ended && !sp.beendet && sp.drawsLeft>0 && (
                  <div style={{marginTop:"0.5em"}}>
                    <div style={{display:"flex",gap:"5px",justifyContent:"center"}}>
                      {sp.reels && sp.reels.map((_,i)=><button className="neon-btn" style={{fontSize:"0.8em",padding:"2px 8px"}} key={i} onClick={()=>toggleHold(i)}>{sp.holds[i]?"GEHALTEN":"HALTEN"}</button>)}
                    </div>
                    <button className="neon-btn" style={{marginTop:"0.5em"}} onClick={roll}>Ziehen</button>
                  </div>
                )}
                <div style={{marginTop:"0.4em"}}>
                  <div style={{fontWeight:"bold"}}>Kombinationen:</div>
                  <ul style={{listStyle:"none",padding:0}}>
                    {KOMBIS.map(k=>(
                      <li key={k.name}
                        style={{
                          marginBottom:5,
                          padding:"5px 8px",
                          borderRadius:"8px",
                          background: sp.verbrauchte.includes(k.name) ? "rgba(255,0,222,0.12)" : (meId===sp.id && isErfüllbar(k.name)) ? "rgba(255,224,0,0.22)" : "rgba(255,0,222,0.22)",
                          fontWeight:"bold",
                          color: sp.verbrauchte.includes(k.name) ? "#aaa" : "#fff",
                          boxShadow: (meId===sp.id && isErfüllbar(k.name)) ? "0 0 8px #ffe000" : "0 0 8px #ff00de"
                        }}
                      >
                        {k.name} <span style={{float:"right",color:"#ffe000"}}>{k.points} Punkte</span>
                        {sp.verbrauchte.includes(k.name) && <span style={{marginLeft:12,color:"#aaa"}}>✓ erfüllt</span>}
                        {(meId===sp.id && isErfüllbar(k.name)) && <span style={{marginLeft:12,color:"#ffe000"}}>Jetzt erfüllbar!</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
          {showEnd && sieger.length > 0 && (
            <div style={{marginTop:"2em", fontWeight:"bold", color:"#ffe000", fontSize:"1.3em"}}>
              Sieger: {sieger.map(s=>s.name).join(", ")} mit {sieger[0].punkte} Punkten!
              <div><button className="neon-btn" style={{marginTop:"1em"}} onClick={restartGame}>Neues Spiel starten</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}