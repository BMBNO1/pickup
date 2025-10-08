# Pick Up — Multiplayer (prototype)

This bundle contains a working prototype of a multiplayer "Pick Up" slot-like game.

## Quick start (local)

Requirements: Node.js

Start server:
```
cd server
npm install
npm start
```

Start client (in another terminal):
```
cd client
npm install
npm run dev
```

Default server URL: http://localhost:3001
Make sure the client connects to the server (Vite dev server on port 5173 by default).

The uploaded design image has been included at `client/src/assets/pick-up-sprite.png`.

## Deployment

See the in-project instructions for deploying server and client to Render.com or use Dockerfiles if preferred.