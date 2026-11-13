# Kessel Sabacc Online

A real-time, browser-based multiplayer Sabacc table built with Node.js, Express and Socket.IO. It is designed for a single Render Web Service.

## Features
- Private six-character room codes; 2–6 players per table
- Live multiplayer updates using WebSockets
- Host-controlled deal and next-round flow
- Server-authoritative card draws and turn validation
- Private player hands (only each player receives their own cards)
- Draw, replace either card, discard, and call Sabacc
- Automatic round scoring and winner display
- Responsive dark-gold / green-felt interface

## Rules in this starter
This is a playable Kessel-Sabacc-inspired starter ruleset, not a verified implementation of every rule in the linked GitLab project. Each player starts with two cards. Number cards are 1–6; a Sylop is wild and makes a one-Sylop hand Pure Sabacc. Otherwise, the lowest absolute difference between the two cards wins; matching number cards are a pair. On a turn, draw one card and either replace slot I, replace slot II, or discard. Calling Sabacc gives every other connected player one final turn.

The linked repository's README is the default GitLab README template and does not document game rules or source structure. This implementation therefore uses a clearly documented starter ruleset rather than claiming exact parity.

## Run locally
Requirements: Node.js 20+

```bash
npm install
npm start
```

Open http://localhost:10000 in multiple browser tabs to test multiplayer.

## Deploy to Render
1. Push this folder to a GitHub or GitLab repository.
2. In Render, choose **New + → Web Service** and connect the repository.
3. Render can detect `render.yaml`; otherwise use:
   - Build command: `npm install`
   - Start command: `npm start`
4. Deploy. Open the service URL in multiple browsers and create/join a room.

No environment variables are required. Render supplies `PORT` automatically.

## Important deployment notes
- This starter stores active rooms in process memory. Use one Render instance; restarting or redeploying clears active games.
- For multiple server instances or durable rooms, add Redis (Socket.IO adapter) and a persistent database.
- Add authentication, rate limits, reconnect/session recovery, anti-cheat auditing and automated tests before running public tournaments.
- The project is fan-made and is not affiliated with Lucasfilm or Disney.
