// =================== FIREBASE CONFIG ===================
const firebaseConfig = {
  apiKey: "AIzaSyBI_ZNuKytSxM_XzWv2SE9xGgF_1ea3qgs",
  authDomain: "motoraser-4e869.firebaseapp.com",
  projectId: "motoraser-4e869",
  storageBucket: "motoraser-4e869.firebasestorage.app",
  messagingSenderId: "662628905736",
  appId: "1:662628905736:web:fa3df9dec147efd85672bd",
  measurementId: "G-7E6NDFMM91"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const $ = (id) => document.getElementById(id);
$("year").textContent = new Date().getFullYear();

// =================== UI ===================
const btnLogin = $("btnLogin");
const btnLogout = $("btnLogout");
const btnLocate = $("btnLocate");
const btnCreateChallenge = $("btnCreateChallenge");
const btnRefresh = $("btnRefresh");

const userStatus = $("userStatus");
const locStatus = $("locStatus");
const mapInfo = $("mapInfo");
const challengesEl = $("challenges");
const liveCount = $("liveCount");

const profileForm = $("profileForm");
const nameInput = $("name");
const phoneInput = $("phone");
const btnClear = $("btnClear");

const modal = $("modal");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const modalClose = $("modalClose");
const modalOk = $("modalOk");

// =================== MODAL ===================
function openModal(title, html) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.classList.remove("hidden");
}
function closeModal(){ modal.classList.add("hidden"); }
modalClose.onclick = closeModal;
modalOk.onclick = closeModal;
modal.onclick = (e) => { if (e.target === modal) closeModal(); };

// =================== HELPERS ===================
function escapeHtml(s){
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function fmtTime(ts){
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : null;
  return d ? d.toLocaleString() : "";
}
function haversineMeters(a, b){
  const R = 6371000;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function canGeofenceArrive(myLoc, destLoc, radiusMeters = 120){
  if (!myLoc || !destLoc) return false;
  const dist = haversineMeters(myLoc, destLoc);
  return dist <= radiusMeters;
}

// =================== PROFILE (local + firestore) ===================
function saveProfileLocal(data){ localStorage.setItem("motoraser_profile", JSON.stringify(data)); }
function loadProfileLocal(){ return JSON.parse(localStorage.getItem("motoraser_profile") || "{}"); }
function setFormFromProfile(p){ nameInput.value = p?.name || ""; phoneInput.value = p?.phone || ""; }

async function saveProfileToFirestore(uid, profile) {
  await db.collection("users").doc(uid).set(
    { profile, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}
async function loadUserDoc(uid){
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? (snap.data() || {}) : null;
}

// =================== MAP (Leaflet) ===================
let map, meMarker, destMarker;
let lastLocation = null;
let lastDest = null;

function initMap(){
  // Altamira fallback
  const fallback = { lat: -3.2041, lng: -52.2111 };
  map = L.map("map", { zoomControl: true }).setView([fallback.lat, fallback.lng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  meMarker = L.marker([fallback.lat, fallback.lng]).addTo(map).bindPopup("Você");
  destMarker = null;

  mapInfo.textContent = "Toque em “Minha localização”.";
}
initMap();

function setMyLocation(lat, lng){
  lastLocation = { lat, lng };
  meMarker.setLatLng([lat, lng]);
  map.setView([lat, lng], 15);
  locStatus.textContent = `Localização: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  mapInfo.textContent = "Localização OK ✅";
}

function setDestinationOnMap(dest){
  lastDest = dest;
  if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  destMarker = L.marker([dest.lat, dest.lng]).addTo(map).bindPopup("Destino");
}

async function getLocationOrAsk(){
  if (lastLocation) return lastLocation;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Sem geolocalização no navegador."));
    mapInfo.textContent = "Pegando localização...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation(pos.coords.latitude, pos.coords.longitude);
        resolve(lastLocation);
      },
      (err) => reject(err),
      { enableHighAccuracy:true, timeout:12000, maximumAge:0 }
    );
  });
}

btnLocate.onclick = async () => {
  try { await getLocationOrAsk(); }
  catch (e) { openModal("Localização", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`); }
};

// =================== AUTH ===================
btnLogin.onclick = async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (e) {
    openModal("Erro no login", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
  }
};
btnLogout.onclick = async () => {
  try { await auth.signOut(); } catch(e){}
};

auth.onAuthStateChanged(async (user) => {
  if (user) {
    btnLogin.classList.add("hidden");
    btnLogout.classList.remove("hidden");
    userStatus.textContent = `Usuário: ${user.displayName || "Sem nome"}`;

    // sync básico
    try{
      await db.collection("users").doc(user.uid).set({
        name: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    }catch(e){}

    // carrega perfil
    try{
      const doc = await loadUserDoc(user.uid);
      if (doc?.profile) { setFormFromProfile(doc.profile); saveProfileLocal(doc.profile); }
      else { setFormFromProfile(loadProfileLocal()); }
    }catch(e){
      setFormFromProfile(loadProfileLocal());
    }

    startChallengesListener();
  } else {
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");
    userStatus.textContent = "Usuário: visitante";
    setFormFromProfile(loadProfileLocal());
    stopChallengesListener();
    renderChallenges([]);
  }
});

// =================== PROFILE FORM ===================
profileForm.onsubmit = async (e) => {
  e.preventDefault();
  const profile = { name: nameInput.value.trim(), phone: phoneInput.value.trim() };
  saveProfileLocal(profile);

  const u = auth.currentUser;
  if (u) {
    try{
      await saveProfileToFirestore(u.uid, profile);
      openModal("Salvo ✅", `<p class="muted">Perfil salvo no Firebase.</p>`);
      return;
    }catch(err){
      openModal("Erro", `<p class="muted">${escapeHtml(err?.message || String(err))}</p>`);
      return;
    }
  }
  openModal("Salvo local ✅", `<p class="muted">Entre com Google para salvar na nuvem.</p>`);
};

btnClear.onclick = async () => {
  localStorage.removeItem("motoraser_profile");
  setFormFromProfile({ name:"", phone:"" });
  const u = auth.currentUser;
  if (u) {
    try{ await saveProfileToFirestore(u.uid, { name:"", phone:"" }); }catch(e){}
  }
  openModal("Limpo ✅", `<p class="muted">Perfil apagado.</p>`);
};

// =================== CHALLENGES (Firestore) ===================
// Collection: challenges
// status: "open" | "accepted" | "racing" | "finished" | "canceled"

let unsubChallenges = null;

function stopChallengesListener(){
  if (unsubChallenges) unsubChallenges();
  unsubChallenges = null;
}

function startChallengesListener(){
  stopChallengesListener();
  unsubChallenges = db.collection("challenges")
    .orderBy("createdAt", "desc")
    .limit(50)
    .onSnapshot(
      (snap) => renderChallenges(snap.docs),
      (err) => openModal("Erro", `<p class="muted">${escapeHtml(err?.message || String(err))}</p>`)
    );
}

btnRefresh.onclick = () => startChallengesListener();

// =================== CREATE CHALLENGE ===================
btnCreateChallenge.onclick = async () => {
  const u = auth.currentUser;
  if (!u) return openModal("Login", `<p class="muted">Entre com Google para criar desafio.</p>`);

  // precisa de localização
  let myLoc;
  try { myLoc = await getLocationOrAsk(); }
  catch(e){ return openModal("Localização", `<p class="muted">Permita a localização primeiro.</p>`); }

  openModal("Criar desafio 🏁", `
    <div class="muted" style="margin-bottom:10px">
      Digite o destino e a “aposta” em pontos (simulador).
    </div>

    <label style="display:flex;flex-direction:column;gap:6px;margin:10px 0">
      <span class="muted">Destino (nome)</span>
      <input id="cDestName" placeholder="Ex: Orla do Xingu" />
    </label>

    <label style="display:flex;flex-direction:column;gap:6px;margin:10px 0">
      <span class="muted">Destino (LAT)</span>
      <input id="cLat" placeholder="-3.20410" />
    </label>

    <label style="display:flex;flex-direction:column;gap:6px;margin:10px 0">
      <span class="muted">Destino (LNG)</span>
      <input id="cLng" placeholder="-52.21110" />
    </label>

    <label style="display:flex;flex-direction:column;gap:6px;margin:10px 0">
      <span class="muted">Aposta (pontos)</span>
      <input id="cStake" type="number" value="10" min="0" />
    </label>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
      <button id="cCreate" class="btn primary" type="button">Criar</button>
      <button id="cCancel" class="btn ghost" type="button">Cancelar</button>
    </div>

    <div class="tiny muted" style="margin-top:10px">
      Dica: LAT/LNG você pega no mapa (depois eu te boto um seletor clicando no mapa).
    </div>
  `);

  setTimeout(() => {
    const btnC = document.getElementById("cCreate");
    const btnX = document.getElementById("cCancel");
    btnX.onclick = closeModal;

    btnC.onclick = async () => {
      const destName = (document.getElementById("cDestName").value || "").trim();
      const lat = Number(document.getElementById("cLat").value);
      const lng = Number(document.getElementById("cLng").value);
      const stake = Number(document.getElementById("cStake").value || 0);

      if (!destName) return openModal("Erro", `<p class="muted">Digite o nome do destino.</p>`);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return openModal("Erro", `<p class="muted">LAT/LNG inválidos.</p>`);

      try{
        await db.collection("challenges").add({
          status: "open",
          stakePoints: stake,

          createdByUid: u.uid,
          createdByName: u.displayName || "Sem nome",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),

          acceptedByUid: null,
          acceptedByName: null,
          acceptedAt: null,

          // destino único pros dois
          destinationName: destName,
          destinationLat: lat,
          destinationLng: lng,

          // pontos de corrida
          startedAt: null,

          arrivedCreatorAt: null,
          arrivedAccepterAt: null,
          winnerUid: null,
          winnerName: null,
          finishedAt: null,

          originCreatorLat: myLoc.lat,
          originCreatorLng: myLoc.lng,
          originAccepterLat: null,
          originAccepterLng: null
        });

        closeModal();
        openModal("Desafio criado ✅", `<p class="muted">Agora outro piloto pode aceitar.</p>`);
      }catch(e){
        openModal("Erro", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
      }
    };
  }, 0);
};

// =================== RENDER CHALLENGES ===================
function renderChallenges(docs){
  const u = auth.currentUser;
  const me = u ? u.uid : null;

  const list = docs.map(d => ({ id:d.id, ...d.data() }))
    .filter(x => x.status !== "finished" && x.status !== "canceled");

  liveCount.textContent = `${list.length} online`;
  challengesEl.innerHTML = "";

  if (!list.length){
    challengesEl.innerHTML = `<div class="muted">Nenhum desafio ativo agora.</div>`;
    return;
  }

  for (const c of list){
    const isMine = me && c.createdByUid === me;
    const isAcceptedByMe = me && c.acceptedByUid === me;

    const statusTag =
      c.status === "open" ? `<span class="tag open">Aberto</span>` :
      c.status === "accepted" ? `<span class="tag accepted">Aceito</span>` :
      `<span class="tag racing">Correndo</span>`;

    const mineTag = isMine ? `<span class="tag mine">Meu desafio</span>` : "";
    const stakeTag = `<span class="tag done">Aposta: ${Number(c.stakePoints||0)} pts</span>`;

    const dest = { lat:Number(c.destinationLat), lng:Number(c.destinationLng) };

    // Botões de ação por estado
    // 1) aceitar: só se aberto e não for meu
    const acceptBtn = (c.status === "open" && me && !isMine)
      ? `<button class="btn primary" data-action="accept" data-id="${c.id}">✅ Aceitar</button>`
      : "";

    // 2) iniciar: quando aceito, e só os 2 participantes podem iniciar
    const canStart = (c.status === "accepted" && me && (isMine || isAcceptedByMe));
    const startBtn = canStart
      ? `<button class="btn primary" data-action="start" data-id="${c.id}">🏁 Iniciar</button>`
      : "";

    // 3) cheguei: quando correndo, só os 2 participantes
    const canArrive = (c.status === "racing" && me && (isMine || isAcceptedByMe));
    const arriveBtn = canArrive
      ? `<button class="btn primary" data-action="arrive" data-id="${c.id}">📍 CHEGUEI</button>`
      : "";

    // 4) cancelar: só criador e só quando aberto (pra limpar desafio)
    const cancelBtn = (c.status === "open" && me && isMine)
      ? `<button class="btn danger" data-action="cancel" data-id="${c.id}">🛑 Cancelar</button>`
      : "";

    // Info de quem está participando
    const creator = escapeHtml(c.createdByName || "—");
    const accepter = escapeHtml(c.acceptedByName || "—");

    const div = document.createElement("div");
    div.className = "ride";
    div.innerHTML = `
      <div>
        <div class="rideTitle">🏍️ Desafio 1x1</div>
        <div class="rideMeta">Criador: <b>${creator}</b></div>
        <div class="rideMeta">Adversário: <b>${accepter || "—"}</b></div>
        <div class="rideMeta">Destino: <b>${escapeHtml(c.destinationName || "—")}</b></div>
        <div class="rideMeta">Coord: <b>${dest.lat.toFixed(5)}, ${dest.lng.toFixed(5)}</b></div>
        <div class="rideMeta">${escapeHtml(fmtTime(c.createdAt))}</div>
      </div>

      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="tagsRow">
          ${statusTag}
          ${mineTag}
          ${stakeTag}
        </div>
        <button class="btn ghost" data-action="zoom" data-id="${c.id}" data-lat="${dest.lat}" data-lng="${dest.lng}">🎯 Ver destino</button>
        ${acceptBtn}
        ${startBtn}
        ${arriveBtn}
        ${cancelBtn}
      </div>
    `;
    challengesEl.appendChild(div);
  }

  // bind actions
  challengesEl.querySelectorAll("button[data-action='zoom']").forEach(btn => {
    btn.onclick = () => {
      const lat = Number(btn.getAttribute("data-lat"));
      const lng = Number(btn.getAttribute("data-lng"));
      setDestinationOnMap({ lat, lng });
      map.setView([lat, lng], 15);
      openModal("Destino", `<p class="muted">Destino marcado no mapa 🎯</p>`);
    };
  });

  challengesEl.querySelectorAll("button[data-action='accept']").forEach(btn => {
    btn.onclick = async () => await acceptChallenge(btn.getAttribute("data-id"));
  });

  challengesEl.querySelectorAll("button[data-action='start']").forEach(btn => {
    btn.onclick = async () => await startRace(btn.getAttribute("data-id"));
  });

  challengesEl.querySelectorAll("button[data-action='arrive']").forEach(btn => {
    btn.onclick = async () => await arrive(btn.getAttribute("data-id"));
  });

  challengesEl.querySelectorAll("button[data-action='cancel']").forEach(btn => {
    btn.onclick = async () => await cancelChallenge(btn.getAttribute("data-id"));
  });
}

// =================== ACTIONS ===================
async function acceptChallenge(id){
  const u = auth.currentUser;
  if (!u) return openModal("Login", `<p class="muted">Entre com Google para aceitar.</p>`);

  let myLoc;
  try { myLoc = await getLocationOrAsk(); }
  catch(e){ return openModal("Localização", `<p class="muted">Permita a localização.</p>`); }

  const ref = db.collection("challenges").doc(id);

  try{
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Desafio não existe.");
      const c = snap.data();

      if (c.status !== "open") throw new Error("Esse desafio já foi aceito.");
      if (c.createdByUid === u.uid) throw new Error("Você não pode aceitar seu próprio desafio.");

      tx.update(ref, {
        status: "accepted",
        acceptedByUid: u.uid,
        acceptedByName: u.displayName || "Sem nome",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
        originAccepterLat: myLoc.lat,
        originAccepterLng: myLoc.lng
      });
    });

    openModal("Aceito ✅", `<p class="muted">Agora os dois podem apertar <b>Iniciar</b>.</p>`);
  }catch(e){
    openModal("Erro", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
  }
}

async function startRace(id){
  const u = auth.currentUser;
  if (!u) return openModal("Login", `<p class="muted">Entre com Google.</p>`);

  const ref = db.collection("challenges").doc(id);

  try{
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Desafio não existe.");
      const c = snap.data();

      const isCreator = c.createdByUid === u.uid;
      const isAccepter = c.acceptedByUid === u.uid;
      if (!isCreator && !isAccepter) throw new Error("Você não participa desse desafio.");
      if (c.status !== "accepted") throw new Error("Só dá pra iniciar quando estiver ACEITO.");

      tx.update(ref, {
        status: "racing",
        startedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    openModal("Valendo! 🏁", `<p class="muted">Corrida iniciada. Vá até o destino e aperte <b>CHEGUEI</b>.</p>`);
  }catch(e){
    openModal("Erro", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
  }
}

async function arrive(id){
  const u = auth.currentUser;
  if (!u) return openModal("Login", `<p class="muted">Entre com Google.</p>`);

  const ref = db.collection("challenges").doc(id);

  // pega localização
  let myLoc;
  try { myLoc = await getLocationOrAsk(); }
  catch(e){ return openModal("Localização", `<p class="muted">Permita a localização.</p>`); }

  try{
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Desafio não existe.");
      const c = snap.data();

      if (c.status !== "racing") throw new Error("Só dá pra marcar chegada quando estiver CORRENDO.");

      const isCreator = c.createdByUid === u.uid;
      const isAccepter = c.acceptedByUid === u.uid;
      if (!isCreator && !isAccepter) throw new Error("Você não participa desse desafio.");

      const dest = { lat:Number(c.destinationLat), lng:Number(c.destinationLng) };
      const ok = canGeofenceArrive(myLoc, dest, 150); // raio 150m
      if (!ok) {
        const dist = haversineMeters(myLoc, dest);
        throw new Error(`Você ainda está longe do destino. Distância ~ ${Math.round(dist)}m`);
      }

      // marca chegada
      const updates = {};
      if (isCreator) {
        if (c.arrivedCreatorAt) throw new Error("Você já marcou chegada.");
        updates.arrivedCreatorAt = firebase.firestore.FieldValue.serverTimestamp();
      } else {
        if (c.arrivedAccepterAt) throw new Error("Você já marcou chegada.");
        updates.arrivedAccepterAt = firebase.firestore.FieldValue.serverTimestamp();
      }

      tx.update(ref, updates);
    });

    // depois da transação, tenta finalizar se alguém já chegou antes
    await tryFinish(id);

    openModal("Chegada registrada ✅", `<p class="muted">Se você foi o primeiro, você ganha.</p>`);
  }catch(e){
    openModal("Erro", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
  }
}

async function tryFinish(id){
  const ref = db.collection("challenges").doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const c = snap.data();

    if (c.status !== "racing") return;
    if (!c.arrivedCreatorAt && !c.arrivedAccepterAt) return;

    // se já tem winner, nada
    if (c.winnerUid) return;

    // regra simples:
    // - Se só um chegou: ele vence
    // - Se os dois chegaram: quem tem arrivedAt menor vence (Firestore timestamp)
    let winnerUid = null;
    let winnerName = null;

    if (c.arrivedCreatorAt && !c.arrivedAccepterAt) {
      winnerUid = c.createdByUid;
      winnerName = c.createdByName || "Criador";
    } else if (!c.arrivedCreatorAt && c.arrivedAccepterAt) {
      winnerUid = c.acceptedByUid;
      winnerName = c.acceptedByName || "Adversário";
    } else if (c.arrivedCreatorAt && c.arrivedAccepterAt) {
      // compara
      const tC = c.arrivedCreatorAt.toMillis();
      const tA = c.arrivedAccepterAt.toMillis();
      if (tC <= tA) {
        winnerUid = c.createdByUid;
        winnerName = c.createdByName || "Criador";
      } else {
        winnerUid = c.acceptedByUid;
        winnerName = c.acceptedByName || "Adversário";
      }
    }

    if (!winnerUid) return;

    tx.update(ref, {
      status: "finished",
      winnerUid,
      winnerName,
      finishedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  // avisa vencedor (best-effort)
  try{
    const snap = await db.collection("challenges").doc(id).get();
    if (snap.exists){
      const c = snap.data();
      if (c?.status === "finished"){
        openModal("Resultado 🏆", `
          <p class="muted">Vencedor: <b>${escapeHtml(c.winnerName || "—")}</b></p>
          <p class="muted">Aposta: <b>${Number(c.stakePoints||0)} pts</b></p>
        `);
      }
    }
  }catch(e){}
}

async function cancelChallenge(id){
  const u = auth.currentUser;
  if (!u) return openModal("Login", `<p class="muted">Entre com Google.</p>`);

  const ref = db.collection("challenges").doc(id);

  try{
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Desafio não existe.");
      const c = snap.data();

      if (c.createdByUid !== u.uid) throw new Error("Só o criador pode cancelar.");
      if (c.status !== "open") throw new Error("Só dá pra cancelar quando estiver ABERTO.");

      tx.update(ref, { status:"canceled", finishedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });

    openModal("Cancelado", `<p class="muted">Desafio cancelado.</p>`);
  }catch(e){
    openModal("Erro", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
  }
}
/* ===========================
   FINALIZAR CORRIDA (MANUAL)
   =========================== */

// Finaliza no Firebase com segurança (transaction)
async function finalizarCorridaManual(challengeId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      if (typeof openModal === "function") {
        openModal("Login", `<p class="muted">Entre com Google para finalizar.</p>`);
      } else {
        alert("Entre com Google para finalizar.");
      }
      return;
    }

    const ref = db.collection("challenges").doc(challengeId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Corrida não existe.");

      const c = snap.data() || {};

      // Se quiser forçar somente quando estiver correndo, descomente:
      // if (c.status !== "running") throw new Error("Só dá pra finalizar quando estiver ROLANDO.");

      if (c.status === "finished") throw new Error("Essa corrida já foi finalizada.");

      tx.update(ref, {
        status: "finished",
        winnerUid: user.uid,
        winnerName: user.displayName || "Sem nome",
        finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
        manualFinish: true
      });
    });

    if (typeof openModal === "function") {
      openModal("Finalizada ✅", `<p class="muted">Corrida finalizada.</p>`);
    } else {
      alert("Corrida finalizada.");
    }
  } catch (e) {
    const msg = e?.message || String(e);
    if (typeof openModal === "function") {
      openModal("Erro", `<p class="muted">${msg}</p>`);
    } else {
      alert(msg);
    }
  }
}

// Ativa cliques do botão (chame depois de renderizar a lista)
function bindFinalizarCorridaBotoes(containerEl) {
  if (!containerEl) return;

  containerEl.querySelectorAll("[data-action='finalizar-corrida']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;

      // Confirmação simples (se você já usa modal, ele usa)
      if (typeof openModal === "function" && typeof closeModal === "function") {
        openModal(
          "Finalizar corrida?",
          `
            <p class="muted">Tem certeza que deseja <b>FINALIZAR</b> agora?</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
              <button id="__yesFinish" class="btn danger" type="button">SIM, FINALIZAR</button>
              <button id="__noFinish" class="btn ghost" type="button">Cancelar</button>
            </div>
          `
        );

        setTimeout(() => {
          const yes = document.getElementById("__yesFinish");
          const no = document.getElementById("__noFinish");
          if (no) no.onclick = closeModal;
          if (yes) yes.onclick = async () => {
            closeModal();
            await finalizarCorridaManual(id);
          };
        }, 0);
      } else {
        const ok = confirm("Finalizar corrida agora?");
        if (ok) finalizarCorridaManual(id);
      }
    });
  });
}
