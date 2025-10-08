import React, { useEffect, useState } from 'react'
import io from 'socket.io-client'

// Change to your server URL when deploying
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'
const socket = io(SOCKET_URL);

const SYMBOLS = ['horseshoe','star','clover','crown','moon','banana'];
const EMOJI = { horseshoe: 'U', star: '★', clover: '🍀', crown: '👑', moon: '🌙', banana: '🍌' };

function Reel({ symbol, held, onToggle }) {
  return (
    <div className={`w-20 h-28 rounded-xl border-2 border-purple-400 flex flex-col items-center justify-center m-2 ${held ? 'ring-4 ring-yellow-400' : ''}`}>
      <div className="text-4xl">{EMOJI[symbol] || '❔'}</div>
      <div className="mt-2 text-xs uppercase">{symbol || '—'}</div>
      <button className="mt-2 px-2 py-1 bg-purple-600 rounded" onClick={onToggle}>{held ? 'Held' : 'Hold'}</button>
    </div>
  )
}

export default function App(){
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState('room1');
  const [name, setName] = useState('Player'+Math.floor(Math.random()*1000));
  const [players, setPlayers] = useState([]);
  const [game, setGame] = useState(null);

  useEffect(()=>{
    socket.on('connect', ()=> setConnected(true));
    socket.on('disconnect', ()=> setConnected(false));
    socket.on('room-data', (data)=>{
      setPlayers(data.players || []);
      if (data.game) setGame(data.game);
    });
    socket.on('game-started', (g)=> setGame(g));
    socket.on('game-update', (g)=> setGame({...g}));
    return ()=> { socket.off(); }
  },[]);

  function createRoom(){
    socket.emit('create-room', { roomId: room, name }, (res)=>{ if (!res.ok) alert(res.error); });
  }
  function joinRoom(){
    socket.emit('join-room', { roomId: room, name }, (res)=>{ if (!res.ok) alert(res.error); });
  }
  function startGame(){ socket.emit('start-game', { roomId: room }); }
  function toggleHold(i){ socket.emit('toggle-hold', { roomId: room, index: i }); }
  function roll(){ socket.emit('roll-reels', { roomId: room }); }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-2xl font-bold">
            <img src="/src/assets/pick-up-sprite.png" alt="pickup" style={{width:64,height:64,objectFit:'contain'}} />
          </div>
          <div>
            <div className="text-sm text-gray-200">{connected ? 'Connected' : 'Disconnected'}</div>
            <div className="text-lg font-semibold">{name}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <input className="px-3 py-2 rounded bg-purple-900" value={room} onChange={e=>setRoom(e.target.value)} />
          <input className="px-3 py-2 rounded bg-purple-900" value={name} onChange={e=>setName(e.target.value)} />
          <button className="px-3 py-2 bg-indigo-600 rounded" onClick={createRoom}>Create</button>
          <button className="px-3 py-2 bg-indigo-600 rounded" onClick={joinRoom}>Join</button>
          <button className="px-3 py-2 bg-green-600 rounded" onClick={startGame}>Start</button>
        </div>
      </header>

      <main className="grid grid-cols-3 gap-6">
        <section className="col-span-2 bg-purple-800/60 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>Round: {game?.round || '—'}</div>
            <div>Rolls left: {game?.rollsLeft ?? '—'}</div>
            <div>Current: {game?.playersOrder ? (game.playersOrder[game.currentPlayerIndex] === socket.id ? 'Your turn' : 'Other') : '—'}</div>
          </div>

          <div className="flex items-center justify-center">
            {(game?.reels || [null,null,null,null,null]).map((s,i)=> (
              <Reel key={i} symbol={s} held={game?.holds?.[i]} onToggle={()=>toggleHold(i)} />
            ))}
          </div>

          <div className="flex justify-center gap-4 mt-4">
            <button className="px-6 py-3 rounded bg-blue-600" onClick={roll}>Draw</button>
            <button className="px-6 py-3 rounded bg-pink-600" onClick={()=>{ }}>Extra</button>
          </div>
        </section>

        <aside className="bg-purple-800/60 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Players</h3>
          <ul>
            {players.map(p=> (
              <li key={p.id} className="mb-2 p-2 rounded bg-purple-700/40">{p.name} <span className="text-sm text-gray-300">({game?.scores?.[p.id] ?? 0})</span></li>
            ))}
          </ul>

          <div className="mt-6">
            <h4 className="font-semibold">Controls</h4>
            <p className="text-sm text-gray-300">Hold reels, press Draw (Roll). Score computed when rolls end.</p>
          </div>
        </aside>
      </main>

      <footer className="mt-8 text-sm text-gray-300">Prototype. Replace placeholder graphics with your provided image and tune UX to match the design.</footer>
    </div>
  )
}