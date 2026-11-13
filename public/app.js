const socket = io();
const $ = id => document.getElementById(id);
let state = null;
let toastTimer;
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.add("hidden"),2800); }
function act(event, data={}, callback) { socket.emit(event,data,result=>{ if(result && !result.ok) toast(result.error); if (callback) callback(result); }); }
function showTable() { $("lobby").classList.add("hidden"); $("table").classList.remove("hidden"); }
function cardMarkup(card, index) {
  if (!card) return '<div class="empty-card">No card</div>';
  const sylop=card.type==="sylop";
  return `<div class="card ${sylop?'sylop':''}"><span class="corner">${index+1}</span><div class="value">${sylop?'✦':card.value}</div><small>${sylop?'SYLOP · WILD':'SABACC VALUE'}</small></div>`;
}
function handScore(hand) {
  if (!hand || hand.length!==2) return "";
  if (hand[0].type==="sylop" && hand[1].type==="sylop") return "DOUBLE SYLOP";
  if (hand.some(c=>c.type==="sylop")) return "PURE SABACC";
  return `DIFFERENCE: ${Math.abs(hand[0].value-hand[1].value)}`;
}
socket.on("room:update", s => {
  state=s; showTable();
  $("tableCode").textContent=s.code;
  $("roundLabel").textContent=s.status==="lobby"?"LOBBY":s.status==="results"?"ROUND COMPLETE":`ROUND ${s.round}`;
  const current=s.players.find(p=>p.id===s.players.find(x=>x.id===s.you)?.id);
  const active=s.players.find(p=>p.id===s.players[s.currentTurn]?.id);
  $("turnLabel").textContent=s.status==="lobby"?"Waiting for the host to deal.":s.status==="results"?"The cards have spoken.":s.isYourTurn?"YOUR TURN — MAKE YOUR MOVE":`${active?.name || "A player"} is making a move`;
  $("notice").textContent=s.callerId?`${s.players.find(p=>p.id===s.callerId)?.name || "A player"} called Sabacc — final turns!`:"";
  $("players").innerHTML=s.players.map(p=>`<div class="player ${p.id===s.players[s.currentTurn]?.id && s.status==='playing'?'active':''}"><b>${escapeHtml(p.name)} ${p.id===s.hostId?'✦':''}</b><small>${p.connected?'● CONNECTED':'○ DISCONNECTED'}${p.id===s.you?' · YOU':''}</small></div>`).join("");
  $("hand").innerHTML=s.status==="lobby"?'<div class="empty-card">Waiting for the deal.</div>':s.yourHand.map(cardMarkup).join("");
  $("handScore").textContent=handScore(s.yourHand);
  $("drawBtn").disabled=!s.isYourTurn || !!s.pendingCard;
  $("callBtn").disabled=!s.isYourTurn || !!s.callerId;
  $("startBtn").classList.toggle("hidden",!(s.status==="lobby" && s.you===s.hostId) );
  $("startBtn").disabled=s.players.length<2;
  $("nextBtn").classList.toggle("hidden",!(s.status==="results" && s.you===s.hostId));
  $("drawBtn").classList.toggle("hidden",s.status!=="playing");
  $("callBtn").classList.toggle("hidden",s.status!=="playing");
  const pending=$("pendingArea");
  if(s.pendingCard) {
    pending.classList.remove("hidden");
    pending.innerHTML=`<strong>DRAWN CARD: ${s.pendingCard.type==='sylop'?'SYLOP ✦':s.pendingCard.value}</strong><div><button data-choice="slot0" class="secondary">KEEP IN SLOT I</button><button data-choice="slot1" class="secondary">KEEP IN SLOT II</button><button data-choice="discard" class="quiet">DISCARD</button></div>`;
    pending.querySelectorAll("button").forEach(b=>b.onclick=()=>act("card:resolve",{choice:b.dataset.choice}));
  } else pending.classList.add("hidden");
  if(s.status!=="results") $("results").classList.add("hidden");
  if(s.status==="results" && s.results) renderResults(s.results,s.winners||[]);
});
socket.on("round:results", data=>renderResults(data.results,data.winners));
socket.on("notice", message=>toast(message));
function renderResults(results,winners) {
  const box=$("results"); box.classList.remove("hidden");
  box.innerHTML='<h3>ROUND RESULTS</h3>'+results.map(r=>`<div class="result-row ${winners.includes(r.id)?'winner':''}"><span>${escapeHtml(r.name)} ${winners.includes(r.id)?'✦ WINNER':''}</span><b>${escapeHtml(r.score.label)}</b></div>`).join("");
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$("createBtn").onclick=()=>act("room:create",{name:$("playerName").value.trim()||"Guest"},res=>{if(res?.ok) toast(`Table ${res.code} created.`);else if(res?.error)toast(res.error);});
$("joinBtn").onclick=()=>act("room:join",{name:$("playerName").value.trim()||"Guest",code:$("roomCode").value.trim()},res=>{if(res?.ok)toast("Joined table.");else if(res?.error)toast(res.error);});
$("startBtn").onclick=()=>act("game:start");
$("nextBtn").onclick=()=>act("game:start");
$("drawBtn").onclick=()=>act("card:draw");
$("callBtn").onclick=()=>act("round:call");
$("leaveBtn").onclick=()=>{act("room:leave");state=null;$("table").classList.add("hidden");$("lobby").classList.remove("hidden");};
$("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
