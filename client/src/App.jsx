import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const socket = io(SOCKET_URL);

const SOUNDS = {
  spin: '/sounds/spin.mp3',
  hold: '/sounds/hold.mp3',
  win: '/sounds/win.mp3',
  round: '/sounds/round.mp3'
};

function playSound(name) {
  if (!window.soundOn) return;
  const audio = new window.Audio(SOUNDS[name]);
  audio.volume = 0.8;
  audio.play();
}
window.soundOn = true;

const SYMBOLS = [
  { key: 'joker', label: 'Joker', points3: 200, points4: 400, points5: 1000, svg: (<svg className="neon-symbol" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#ffe000" stroke="#ff00de" strokeWidth="3" /><text x="32" y="38" textAnchor="middle" fontSize="22" fill="#ff00de" fontWeight="bold">J</text></svg>) },
  { key: 'stern', label: 'Stern', points3: 110, points4: 220, points5: 550, svg: (<svg className="neon-symbol" viewBox="0 0 64 64"><polygon points="32,7 39,27 61,27 43,39 50,59 32,47 14,59 21,39 3,27 25,27" fill="#ffe000" stroke="#ff00de" strokeWidth="3" /></svg>) },
  { key: 'herz', label: 'Herz', points3: 80, points4: 160, points5: 400, svg: (<svg className="neon-symbol" viewBox="0 0 64 64"><path d="M32 58s-26-15-26-30a14 14 0 0 1 28-4 14 14 0 0 1 28 4c0 15-26 30-26 30z" fill="#ff00de" stroke="#ffe000" strokeWidth="3" /></svg>) },
  { key: 'quadrat', label: 'Quadrat', points3: 60, points4: 120, points5: 300, svg: (<svg className="neon-symbol" viewBox="0 0 64 64"><rect x="14" y="14" width="36" height="36" fill="#44ff44" stroke="#ffe000" strokeWidth="3" /></svg>) },
  { key: 'dreieck', label: 'Dreieck', points3: 40, points4: 80, points5: 200, svg: (<svg className="neon-symbol" viewBox="0 0 64 64"><polygon points="32,12 56,52 8,52" fill="#4ee9ff" stroke="#ffe000" strokeWidth="3" /></svg>) },
  { key: 'kreis', label: 'Kreis', points3: 30, points4: 60, points5: 150, svg: (<svg className="neon-symbol" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#fff" stroke="#ff00de" strokeWidth="3" /></svg>) },
];

const KOMBIS = [
  { name: "Fünf verschiedene", points: 800 },
  { name: "Full House", points: 600 },
  { name: "Vier gleiche", points: 400 },
  { name: "Fünf gleiche", points: 900 },
  { name: "Joker", points: 250 }
];

function Reel({ symbol, held, animating, onToggle }) {
  const sObj = SYMBOLS.find(s=>s.key===symbol);
  return (
    <div
      className={`neon-reel${held ? " held" : ""}${animating ? " spinning" : ""}`}
      tabIndex={0}
      role="button"
      title="Zum Halten auf das Symbol tippen/klicken"
      style={{cursor: "pointer", outline: "none"}}
      onClick={onToggle}
      onKeyDown={e => { if (e.key === " " || e.key === "Enter") onToggle(); }}
    >
      <div className="reel-frame">
        {sObj ? sObj.svg : <div style={{height:48}} />}
      </div>
    </div>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState("room1");
  const [name, setName] = useState("");
  const [roundCount, setRoundCount] = useState(5);
  const [spieler, setSpieler] = useState([]);
  const [meId, setMeId] = useState("");
  const [roomState, setRoomState] = useState({ started: false, runde: 1, ended: false, maxRunden: 5, spieler: [] });
  const [message, setMessage] = useState('');
  const [showEnd, setShowEnd] = useState(false);

  const [reelAnim, setReelAnim] = useState([false,false,false,false,false]);
  const [showFirework, setShowFirework] = useState(false);

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
      playSound('round');
    });
    socket.on("next-round", (data) => {
      setRoomState(data);
      setSpieler(data.spieler || []);
      setMessage(`Runde ${data.runde} beginnt!`);
      playSound('round');
    });
    return () => { socket.off(); }
  }, []);

  function createRoom() {
    if (!name) { setMessage("Bitte gib deinen Namen ein."); return; }
    socket.emit("create-room", { roomId: room, name, roundCount: Math.max(3, Math.min(10, roundCount)) }, (res) => {
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

  const me = spieler.find(s => s.id === meId);

  function roll() {
    playSound('spin');
    setReelAnim([true,true,true,true,true]);
    [0,1,2,3,4].forEach((i) => {
      setTimeout(() => {
        setReelAnim(anim => {
          const newAnim = [...anim];
          newAnim[i] = false;
          return newAnim;
        });
        if (i===4) socket.emit("roll-reels", { roomId: room });
      }, 350 + i*120);
    });
  }

  function toggleHold(i) {
    playSound('hold');
    socket.emit("toggle-hold", { roomId: room, index: i });
  }
  function chooseCombo(kombiName, symbolKey) {
    if (kombiName === "Fünf gleiche") {
      setShowFirework(true);
      setTimeout(()=>setShowFirework(false), 1800);
    }
    playSound('win');
    socket.emit("choose-combo", { roomId: room, kombiName, symbolKey });
  }
  function restartGame() { socket.emit("restart-game", { roomId: room }); setShowEnd(false); }

  let sieger = [];
  if (showEnd && spieler.length > 0) {
    let maxPunkte = Math.max(...spieler.map(s=>s.punkte));
    sieger = spieler.filter(s=>s.punkte === maxPunkte);
  }

  return (
    <div style={{maxWidth:"100vw",margin:"0 auto",padding:"0.5em"}}>
      <div className="neon-panel" style={{marginBottom:"0.7em", textAlign:"center"}}>
        <div className="neon-text" style={{fontSize:"2.2rem"}}>PICK UP</div>
        <div style={{fontSize:"1.1em",color:"#ffe000",textShadow:"0 0 10px #ff00de"}}>Online Multiplayer – Deutsche Version</div>
      </div>
      {!roomState.started && (
        <div className="neon-panel">
          <div>
            <label>Raum: <input className="neon-btn" style={{width:120}} type="text" value={room} onChange={e=>setRoom(e.target.value)} /></label>
            <label style={{marginLeft:"1em"}}>Name: <input className="neon-btn" style={{width:120}} type="text" value={name} onChange={e=>setName(e.target.value)} /></label>
            <label style={{marginLeft:"1em"}}>Runden: 
              <select className="neon-btn" style={{width:80}} value={roundCount} onChange={e=>setRoundCount(Number(e.target.value))}>
                {[...Array(8)].map((_,i)=><option key={i+3} value={i+3}>{i+3}</option>)}
              </select>
            </label>
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
        <div className="players-row">
          {spieler.map(sp=>{
            const symbolResultsSorted = [...(sp.symbolResults || [])]
              .sort((a,b)=>b.points5-a.points5);
            const kombisSorted = [...KOMBIS].sort((a,b)=>b.points-a.points);
            const tableRows = [
              ...symbolResultsSorted.map(s=>({
                label: s.label,
                icon: SYMBOLS.find(o=>o.key===s.key)?.svg,
                verbraucht: s.verbraucht,
                type: "symbol",
                key: s.key,
                showBtn: (sp.auswahlSymbole && sp.auswahlSymbole.some(ss=>ss.key===s.key))
              })),
              ...kombisSorted.map(k=>({
                label: k.name,
                icon: null,
                verbraucht: sp.verbrauchte.includes(k.name),
                type: "kombi",
                key: k.name,
                showBtn: (sp.auswahlKombis && sp.auswahlKombis.some(kk=>kk.name===k.name))
              }))
            ];

            return (
            <div key={sp.id} className={`player-card${meId===sp.id ? " me" : ""}`} style={{position:"relative"}}>
              {showFirework && meId===sp.id && (
                <div className="firework-points">
                  <span className="firework-emoji">🎉</span>
                  <span className="firework-points-text">900 Punkte!</span>
                </div>
              )}
              <div className="player-info">{sp.name}</div>
              <div>Runde: {sp.runde}</div>
              <div style={{fontWeight:"bold",fontSize:"1.2em"}}>Gesamtpunkte: {sp.punkte}</div>
              <div>Ziehungen: {sp.drawsLeft} / 3</div>
              <div style={{
                display:"flex",
                justifyContent:"center",
                gap:"16px",
                margin:"1em auto 0.7em auto",
                flexWrap: "nowrap",
                minHeight: "90px"
              }}>
                {(sp.reels||[]).map((s,i)=>(
                  <Reel
                    key={i}
                    symbol={s}
                    held={sp.holds && sp.holds[i]}
                    animating={meId===sp.id ? reelAnim[i] : false}
                    onToggle={()=>{
                      if(meId===sp.id && !roomState.ended && !sp.beendet && sp.drawsLeft>0){
                        toggleHold(i);
                      }
                    }}
                  />
                ))}
              </div>
              <div style={{fontSize:"0.85em",color:"#fff",minHeight:18}}>{sp.message}</div>
              {/* Wertungsliste im Kombi-Design */}
              <div className="player-kombis" style={{marginTop:"0.7em"}}>
                <div style={{fontWeight:"bold",marginBottom:"0.1em"}}>Wertung:</div>
                <ul style={{listStyle:"none",padding:0}}>
                  {tableRows.map(row=>(
                    <li key={row.key}
                      style={{
                        marginBottom:8,
                        padding:"8px 14px",
                        borderRadius:"10px",
                        background: row.verbraucht ? "rgba(255,0,222,0.09)" : "rgba(255,0,222,0.22)",
                        color: row.verbraucht ? "#aaa" : "#fff",
                        fontWeight:"bold",
                        boxShadow: "0 0 8px #ff00de",
                        minHeight:"40px",
                        display:"flex",
                        alignItems:"center",
                        justifyContent:"space-between"
                      }}
                    >
                      <span>
                        {row.icon && <span style={{marginRight:7,verticalAlign:"middle"}}>{row.icon}</span>}
                        {row.type==="kombi" && row.label}
                      </span>
                      <span>
                        {meId===sp.id && !roomState.ended && !sp.beendet && row.showBtn && !row.verbraucht && (
                          <button className="neon-btn" style={{marginLeft:10,padding:"4px 12px",fontSize:"1em"}} onClick={()=>row.type==="symbol"?chooseCombo(null,row.key):chooseCombo(row.key,null)}>Wählen</button>
                        )}
                        {row.verbraucht && (
                          <span style={{marginLeft:7,color:"#aaa"}}>✓ erfüllt</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {meId===sp.id && !roomState.ended && !sp.beendet && (
                <div style={{marginTop:"1.1em",textAlign:"center"}}>
                  <button className="neon-btn" onClick={roll}>Ziehen</button>
                </div>
              )}
            </div>
          )})}
        </div>
      )}
      {showEnd && sieger.length > 0 && (
        <div className="neon-panel" style={{marginTop:"2em", fontWeight:"bold", color:"#ffe000", fontSize:"1.3em",textAlign:"center"}}>
          Sieger: {sieger.map(s=>s.name).join(", ")} mit {sieger[0].punkte} Punkten!
          <div><button className="neon-btn" style={{marginTop:"1em"}} onClick={restartGame}>Neues Spiel starten</button></div>
        </div>
      )}
      <div style={{position:"fixed",top:18,right:22,zIndex:100}}>
        <button className="neon-btn" style={{fontSize:"1.2em"}} onClick={()=>{window.soundOn=!window.soundOn;}}>
          {window.soundOn ? "🔊" : "🔇"}
        </button>
      </div>
    </div>
  );
}