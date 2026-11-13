const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 10000;
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

// Rooms are intentionally in memory for the single-instance Render starter.
const rooms = new Map();
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const VALUES = [1, 2, 3, 4, 5, 6];

function makeDeck() {
  const deck = [];
  for (let value of VALUES) {
    for (let i = 0; i < 4; i++) deck.push({ id: crypto.randomUUID(), value, type: "number" });
  }
  // Two Sylop cards act as wild cards and copy the other card's value for scoring.
  for (let i = 0; i < 2; i++) deck.push({ id: crypto.randomUUID(), value: "S", type: "sylop" });
  return shuffle(deck);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function roomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function scoreHand(hand) {
  if (!hand || hand.length !== 2) return null;
  const [a, b] = hand;
  if (a.type === "sylop" && b.type === "sylop") return { rank: 0, points: 0, label: "Double Sylop" };
  if (a.type === "sylop" || b.type === "sylop") return { rank: 1, points: 0, label: "Pure Sabacc" };
  const difference = Math.abs(a.value - b.value);
  return { rank: 2, points: difference, label: difference === 0 ? "Pair" : `${difference} difference` };
}
function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    currentTurn: room.currentTurn,
    round: room.round,
    callerId: room.callerId,
    finalTurns: room.finalTurns,
    players: room.players.map(p => ({
      id: p.id, name: p.name, connected: p.connected,
      ready: p.ready, isHost: p.id === room.hostId,
      hasActed: p.hasActed,
      hand: null
    }))
  };
}
function emitRoom(room) {
  for (const p of room.players) {
    const snapshot = publicRoom({ ...room, currentViewer: p.id });
    snapshot.you = p.id;
    snapshot.yourHand = room.status === "lobby" ? [] : p.hand.map(c => ({ id: c.id, value: c.value, type: c.type }));
    snapshot.pendingCard = p.pendingCard ? { id: p.pendingCard.id, value: p.pendingCard.value, type: p.pendingCard.type } : null;
    snapshot.isYourTurn = room.status === "playing" && room.players[room.currentTurn]?.id === p.id;
    snapshot.isCaller = room.callerId === p.id;
    io.to(p.id).emit("room:update", snapshot);
  }
}
function findPlayer(socket) {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.id === socket.id);
    if (player) return { room, player };
  }
  return {};
}
function nextTurn(room) {
  if (room.status !== "playing") return;
  for (let step = 1; step <= room.players.length; step++) {
    const idx = (room.currentTurn + step) % room.players.length;
    const p = room.players[idx];
    if (!p) continue;
    if (room.callerId && room.finalTurns.has(p.id)) continue;
    if (!p.connected) {
      if (room.callerId) room.finalTurns.delete(p.id);
      continue;
    }
    room.currentTurn = idx;
    return;
  }
  finishRound(room);
}
function finishRound(room) {
  room.status = "results";
  const ranked = room.players.map(p => ({ id: p.id, name: p.name, score: scoreHand(p.hand) }))
    .filter(x => x.score)
    .sort((a, b) => a.score.rank - b.score.rank || a.score.points - b.score.points);
  const best = ranked[0];
  room.winners = best ? ranked.filter(x => x.score.rank === best.score.rank && x.score.points === best.score.points).map(x => x.id) : [];
  room.results = ranked;
  emitRoom(room);
  io.to(room.code).emit("round:results", { results: ranked, winners: room.winners });
}
function startRound(room) {
  room.deck = makeDeck();
  room.round += 1;
  room.status = "playing";
  room.callerId = null;
  room.finalTurns = new Set();
  room.players.forEach(p => {
    p.hand = [room.deck.pop(), room.deck.pop()];
    p.pendingCard = null;
    p.hasActed = false;
  });
  room.currentTurn = 0;
  emitRoom(room);
  io.to(room.code).emit("notice", `Round ${room.round} is live. Lowest hand difference wins; Sylop is wild.`);
}
function validRoomCode(code) { return /^[A-Z0-9]{6}$/.test(String(code || "").toUpperCase()); }

io.on("connection", socket => {
  socket.on("room:create", ({ name } = {}, cb = () => {}) => {
    name = String(name || "Guest").trim().slice(0, 18) || "Guest";
    let code; do { code = roomCode(); } while (rooms.has(code));
    const room = { code, hostId: socket.id, status: "lobby", round: 0, currentTurn: 0,
      callerId: null, finalTurns: new Set(), players: [], deck: [] };
    room.players.push({ id: socket.id, name, connected: true, ready: true, hand: [], pendingCard: null, hasActed: false });
    rooms.set(code, room); socket.join(code); socket.join(socket.id);
    cb({ ok: true, code }); emitRoom(room);
  });

  socket.on("room:join", ({ code, name } = {}, cb = () => {}) => {
    code = String(code || "").toUpperCase();
    const room = rooms.get(code);
    if (!validRoomCode(code) || !room) return cb({ ok: false, error: "Room not found." });
    if (room.status !== "lobby") return cb({ ok: false, error: "That game has already started." });
    if (room.players.length >= MAX_PLAYERS) return cb({ ok: false, error: "That table is full." });
    name = String(name || "Guest").trim().slice(0, 18) || "Guest";
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) name = `${name}${Math.floor(Math.random()*90+10)}`;
    room.players.push({ id: socket.id, name, connected: true, ready: true, hand: [], pendingCard: null, hasActed: false });
    socket.join(code); socket.join(socket.id); cb({ ok: true, code }); emitRoom(room);
  });

  socket.on("game:start", (_data, cb = () => {}) => {
    const { room, player } = findPlayer(socket);
    if (!room || player.id !== room.hostId) return cb({ ok: false, error: "Only the host can start." });
    if (room.players.length < MIN_PLAYERS) return cb({ ok: false, error: "You need at least two players." });
    if (room.status !== "lobby" && room.status !== "results") return cb({ ok: false, error: "A round is already active." });
    startRound(room); cb({ ok: true });
  });

  socket.on("card:draw", (_data, cb = () => {}) => {
    const { room, player } = findPlayer(socket);
    if (!room || room.status !== "playing" || room.players[room.currentTurn]?.id !== socket.id) return cb({ ok: false, error: "It is not your turn." });
    if (player.pendingCard) return cb({ ok: false, error: "Resolve your drawn card first." });
    if (!room.deck.length) room.deck = makeDeck();
    player.pendingCard = room.deck.pop();
    emitRoom(room); cb({ ok: true });
  });

  socket.on("card:resolve", ({ choice } = {}, cb = () => {}) => {
    const { room, player } = findPlayer(socket);
    if (!room || room.status !== "playing" || room.players[room.currentTurn]?.id !== socket.id) return cb({ ok: false, error: "It is not your turn." });
    if (!player.pendingCard) return cb({ ok: false, error: "Draw a card first." });
    if (choice === "discard") {
      player.pendingCard = null;
    } else if (choice === "slot0" || choice === "slot1") {
      const idx = choice === "slot0" ? 0 : 1;
      player.hand[idx] = player.pendingCard;
      player.pendingCard = null;
    } else return cb({ ok: false, error: "Choose a card slot or discard." });
    player.hasActed = true;
    if (room.callerId) room.finalTurns.delete(player.id);
    nextTurn(room); emitRoom(room); cb({ ok: true });
  });

  socket.on("round:call", (_data, cb = () => {}) => {
    const { room } = findPlayer(socket);
    if (!room || room.status !== "playing" || room.callerId || room.players[room.currentTurn]?.id !== socket.id) return cb({ ok: false, error: "You cannot call right now." });
    room.callerId = socket.id;
    room.finalTurns = new Set(room.players.filter(p => p.id !== socket.id && p.connected).map(p => p.id));
    nextTurn(room); emitRoom(room); cb({ ok: true });
  });

  socket.on("room:leave", () => {
    const { room, player } = findPlayer(socket);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== player.id);
    socket.leave(room.code);
    if (!room.players.length) rooms.delete(room.code);
    else {
      if (room.hostId === player.id) room.hostId = room.players[0].id;
      if (room.status === "playing" && room.players[room.currentTurn]?.id === player.id) nextTurn(room);
      emitRoom(room);
    }
  });

  socket.on("disconnect", () => {
    const { room, player } = findPlayer(socket);
    if (!room) return;
    player.connected = false;
    if (room.status === "playing" && room.players[room.currentTurn]?.id === player.id) nextTurn(room);
    emitRoom(room);
  });
});

server.listen(PORT, () => console.log(`Kessel Sabacc listening on ${PORT}`));
