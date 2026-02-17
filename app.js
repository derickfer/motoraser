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
function canGeofenceArrive(myLoc, destLoc, radiusMeters = 100){
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
let lastDestName = "";
let routeLayer = null;

function initMap(){
  const fallback = { lat: -3.2041, lng: -52.2111 }; // Altamira
  map = L.map("map", { zoomControl: true }).setView([fallback.lat, fallback.lng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  meMarker = L.marker([fallback.lat, fallback.lng]).addTo(map).bindPopup("Você");
  destMarker = null;

  mapInfo.textContent = "Ative a localização para iniciar.";
}
initMap();

function setMyLocation(lat, lng){
  lastLocation = { lat, lng };
  meMarker.setLatLng([lat, lng]);
  map.setView([lat, lng], 15);
  locStatus.textContent = `Localização: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  mapInfo.textContent = "Localização OK ✅";

  // atualiza rota se já tiver destino
  updateRouteIfReady();

  // se tiver corrida ativa, tenta auto-chegada
  if (autoArriveActiveId) autoArriveTryMark(autoArriveActiveId);
}

function setDestinationOnMap(dest){
  lastDest = dest;
  if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  destMarker = L.marker([dest.lat, dest.lng]).addTo(map).bindPopup("Destino");
  updateRouteIfReady();
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

// ===========================
// REVERSE GEOCODE (Nominatim)
// ===========================
async function reverseGeocodeOSM(lat, lng){
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
  const resp = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6"
    }
  });

  if (!resp.ok) throw new Error("Não foi possível pegar o nome do local (OSM).");
  const data = await resp.json();

  const addr = data.address || {};
  const best =
    data.name ||
    addr.attraction ||
    addr.amenity ||
    addr.shop ||
    addr.road ||
    addr.neighbourhood ||
    addr.suburb ||
    addr.city ||
    addr.town ||
    addr.village ||
    data.display_name ||
    "";

  return String(best).trim();
}

// ===========================
// ROTAS (OSRM)
// ===========================
async function fetchRouteOSRM(from, to){
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
  const resp = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!resp.ok) throw new Error("Falha ao buscar rota (OSRM).");
  const data = await resp.json();

  const route = data?.routes?.[0];
  if (!route?.geometry) throw new Error("Rota não encontrada.");

  return {
    geometry: route.geometry,
    distance: route.distance || 0,
    duration: route.duration || 0
  };
}

function clearRoute(){
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
}

async function updateRouteIfReady(){
  if (!lastLocation || !lastDest) return;

  try{
    mapInfo.textContent = "Calculando rota...";
    const r = await fetchRouteOSRM(lastLocation, lastDest);

    clearRoute();

    routeLayer = L.geoJSON(r.geometry, {
      style: { weight: 5, opacity: 0.9 }
    }).addTo(map);

    const bounds = routeLayer.getBounds();
    if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.2));

    const km = (r.distance / 1000).toFixed(2);
    const min = Math.max(1, Math.round(r.duration / 60));
    mapInfo.textContent = `Rota: ${km} km • ~${min} min ✅`;
  }catch(e){
    mapInfo.textContent = "Rota indisponível (ok para demo).";
  }
}

/* ===========================
   ✅ GPS AO VIVO + CHEGADA AUTOMÁTICA (SEM BOTÃO)
   - Move o ponto do motorista no mapa (watchPosition)
   - Quando entrar no raio do destino (100m), marca chegada no Firestore
   =========================== */

const AUTO_ARRIVE_RADIUS_M = 100;      // ✅ seu raio
const AUTO_ARRIVE_COOLDOWN_MS = 6000;  // evita spam

let gpsWatchId = null;
let autoArriveActiveId = null;
let autoArriveLastTry = 0;

function startGpsWatch() {
  if (gpsWatchId != null) return;
  if (!navigator.geolocation) return;

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      setMyLocation(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      console.warn("GPS watch error:", err);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
  );
}
function stopGpsWatch() {
  if (gpsWatchId == null) return;
  try { navigator.geolocation.clearWatch(gpsWatchId); } catch(e){}
  gpsWatchId = null;
}

async function autoArriveTryMark(challengeId) {
  const u = auth.currentUser;
  if (!u) return;

  const now = Date.now();
  if (now - autoArriveLastTry < AUTO_ARRIVE_COOLDOWN_MS) return;
  autoArriveLastTry = now;

  let myLoc;
  try { myLoc = await getLocationOrAsk(); } catch(e){ return; }

  const ref = db.collection("challenges").doc(challengeId);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const c = snap.data();

      if (c.status !== "racing") return;

      const isCreator = c.createdByUid === u.uid;
      const isAccepter = c.acceptedByUid === u.uid;
      if (!isCreator && !isAccepter) return;

      // já marcou?
      if (isCreator && c.arrivedCreatorAt) return;
      if (isAccepter && c.arrivedAccepterAt) return;

      const dest = { lat: Number(c.destinationLat), lng: Number(c.destinationLng) };
      const ok = canGeofenceArrive(myLoc, dest, AUTO_ARRIVE_RADIUS_M);
      if (!ok) return;

      const updates = {};
      if (isCreator) updates.arrivedCreatorAt = firebase.firestore.FieldValue.serverTimestamp();
      if (isAccepter) updates.arrivedAccepterAt = firebase.firestore.FieldValue.serverTimestamp();

      tx.update(ref, updates);
    });

    await tryFinish(challengeId);
  } catch (e) {
    console.warn("Auto-arrive fail:", e?.message || e);
  }
}

function enableAutoArriveForChallenge(challengeId) {
  autoArriveActiveId = challengeId;
}

function disableAutoArrive() {
  autoArriveActiveId = null;
}

/* ===========================
   SELECIONAR DESTINO NO MAPA
   =========================== */
let pickingMode = false;
let pickingMarker = null;
let pickingCallback = null;

function startPickOnMap(callback) {
  pickingMode = true;
  pickingCallback = callback;

  mapInfo.textContent = "🎯 Clique no mapa para selecionar o DESTINO.";
  const mapEl = document.getElementById("map");
  if (mapEl) mapEl.style.cursor = "crosshair";

  if (pickingMarker) {
    map.removeLayer(pickingMarker);
    pickingMarker = null;
  }

  openModal("Selecionar no mapa", `
    <p class="muted">Clique no mapa para escolher o destino.</p>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
      <button id="btnStopPick" class="btn danger" type="button">Parar seleção</button>
    </div>
  `);

  setTimeout(() => {
    const btnStop = document.getElementById("btnStopPick");
    if (btnStop) btnStop.onclick = stopPickOnMap;
  }, 0);
}

function stopPickOnMap() {
  pickingMode = false;
  pickingCallback = null;

  mapInfo.textContent = "Seleção encerrada.";
  const mapEl = document.getElementById("map");
  if (mapEl) mapEl.style.cursor = "";

  closeModal();
}

map.on("click", async (e) => {
  if (!pickingMode) return;

  const lat = e.latlng.lat;
  const lng = e.latlng.lng;

  if (pickingMarker) map.removeLayer(pickingMarker);
  pickingMarker = L.marker([lat, lng]).addTo(map).bindPopup("Destino selecionado ✅").openPopup();

  setDestinationOnMap({ lat, lng });

  try{
    mapInfo.textContent = "Buscando nome do local...";
    const place = await reverseGeocodeOSM(lat, lng);
    lastDestName = place || "";
  }catch(err){
    lastDestName = "";
  }

  if (typeof pickingCallback === "function") {
    pickingCallback({ lat, lng, name: lastDestName });
  }

  stopPickOnMap();
});

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

// ✅ ÚNICO onAuthStateChanged (SEM DUPLICAR)
auth.onAuthStateChanged(async (user) => {
  if (user) {
    btnLogin.classList.add("hidden");
    btnLogout.classList.remove("hidden");
    userStatus.textContent = `Usuário: ${user.displayName || "Sem nome"}`;

    // ✅ GPS SEMPRE LIGADO (você pediu)
    startGpsWatch();

    try{
      await db.collection("users").doc(user.uid).set({
        name: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    }catch(e){}

    try{
      const doc = await loadUserDoc(user.uid);
      if (doc?.profile) { setFormFromProfile(doc.profile); saveProfileLocal(doc.profile); }
      else { setFormFromProfile(loadProfileLocal()); }
    }catch(e){
      setFormFromProfile(loadProfileLocal());
    }

    // ✅ PRESENÇA (lista + mapa)
    presenceStart();
    presenceListen();

    startChallengesListener();
  } else {
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");
    userStatus.textContent = "Usuário: visitante";
    setFormFromProfile(loadProfileLocal());

    disableAutoArrive();

    // ✅ GPS pode ficar ligado mesmo sem login, mas se quiser economizar, desliga:
    // stopGpsWatch();

    presenceStop();

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

  let myLoc;
  try { myLoc = await getLocationOrAsk(); }
  catch(e){ return openModal("Localização", `<p class="muted">Permita a localização primeiro.</p>`); }

  openModal("Criar desafio 🏁", `
    <div class="muted" style="margin-bottom:10px">
      Digite o destino e a “aposta” em pontos (simulador).
    </div>

    <label style="display:flex;flex-direction:column;gap:6px;margin:10px 0">
      <span class="muted">Destino (nome)</span>
      <input id="cDestName" placeholder="Ex: Orla do Xingu"
        value="${escapeHtml(lastDestName || "")}" />
    </label>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0">
      <button id="btnPickMap" class="btn ghost" type="button">🗺️ Selecionar no mapa</button>
      <button id="btnPickStop" class="btn ghost" type="button">❌ Sair da seleção</button>
      <button id="btnClearRoute" class="btn ghost" type="button">🧹 Limpar rota</button>
    </div>

    <label style="display:flex;flex-direction:column;gap:6px;margin:10px 0">
      <span class="muted">Destino (LAT)</span>
      <input id="cLat" placeholder="-3.20410" value="${lastDest?.lat ? Number(lastDest.lat).toFixed(6) : ""}" />
    </label>

    <label style="display:flex;flex-direction:column;gap:6px;margin:10px 0">
      <span class="muted">Destino (LNG)</span>
      <input id="cLng" placeholder="-52.21110" value="${lastDest?.lng ? Number(lastDest.lng).toFixed(6) : ""}" />
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
      Dica: clique em “Selecionar no mapa” e toque no destino. O nome e a rota vão aparecer.
    </div>
  `);

  setTimeout(() => {
    const btnC = document.getElementById("cCreate");
    const btnX = document.getElementById("cCancel");
    const btnPickMap = document.getElementById("btnPickMap");
    const btnPickStop = document.getElementById("btnPickStop");
    const btnClearRoute = document.getElementById("btnClearRoute");

    btnX.onclick = closeModal;

    btnPickStop.onclick = () => {
      stopPickOnMap();
      openModal("Seleção", `<p class="muted">Seleção encerrada.</p>`);
    };

    btnClearRoute.onclick = () => {
      clearRoute();
      openModal("Rota", `<p class="muted">Rota removida do mapa.</p>`);
    };

    btnPickMap.onclick = () => {
      closeModal();
      startPickOnMap(({ lat, lng, name }) => {
        btnCreateChallenge.onclick();

        setTimeout(() => {
          const latInput = document.getElementById("cLat");
          const lngInput = document.getElementById("cLng");
          const nameInput2 = document.getElementById("cDestName");

          if (latInput) latInput.value = lat.toFixed(6);
          if (lngInput) lngInput.value = lng.toFixed(6);
          if (nameInput2 && name) nameInput2.value = name;

          updateRouteIfReady();
        }, 120);
      });
    };

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

          destinationName: destName,
          destinationLat: lat,
          destinationLng: lng,

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

        lastDestName = destName;
        setDestinationOnMap({ lat, lng });
        updateRouteIfReady();

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

  // ✅ AUTO-CHEGADA: procura um desafio que EU esteja correndo
  if (me) {
    const myRacing = list.find(c =>
      c.status === "racing" && (c.createdByUid === me || c.acceptedByUid === me)
    );

    if (myRacing) {
      enableAutoArriveForChallenge(myRacing.id);

      // marca destino no mapa (top)
      const dest = { lat: Number(myRacing.destinationLat), lng: Number(myRacing.destinationLng) };
      setDestinationOnMap(dest);

      // tenta já
      autoArriveTryMark(myRacing.id);
    } else {
      disableAutoArrive();
    }
  }

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

    const acceptBtn = (c.status === "open" && me && !isMine)
      ? `<button class="btn primary" data-action="accept" data-id="${c.id}">✅ Aceitar</button>`
      : "";

    const canStart = (c.status === "accepted" && me && (isMine || isAcceptedByMe));
    const startBtn = canStart
      ? `<button class="btn primary" data-action="start" data-id="${c.id}">🏁 Iniciar</button>`
      : "";

    // ✅ SEM BOTÃO "CHEGUEI" (automático)
    const arriveBtn = "";

    const cancelBtn = (c.status === "open" && me && isMine)
      ? `<button class="btn danger" data-action="cancel" data-id="${c.id}">🛑 Cancelar</button>`
      : "";

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
        <button class="btn ghost" data-action="route" data-id="${c.id}" data-lat="${dest.lat}" data-lng="${dest.lng}">🧭 Rota</button>
        ${acceptBtn}
        ${startBtn}
        ${arriveBtn}
        ${cancelBtn}
      </div>
    `;
    challengesEl.appendChild(div);
  }

  challengesEl.querySelectorAll("button[data-action='zoom']").forEach(btn => {
    btn.onclick = () => {
      const lat = Number(btn.getAttribute("data-lat"));
      const lng = Number(btn.getAttribute("data-lng"));
      setDestinationOnMap({ lat, lng });
      map.setView([lat, lng], 15);
      openModal("Destino", `<p class="muted">Destino marcado no mapa 🎯</p>`);
    };
  });

  challengesEl.querySelectorAll("button[data-action='route']").forEach(btn => {
    btn.onclick = async () => {
      try{
        await getLocationOrAsk();
        const lat = Number(btn.getAttribute("data-lat"));
        const lng = Number(btn.getAttribute("data-lng"));
        setDestinationOnMap({ lat, lng });
        await updateRouteIfReady();
        openModal("Rota ✅", `<p class="muted">Rota desenhada no mapa.</p>`);
      }catch(e){
        openModal("Erro", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
      }
    };
  });

  challengesEl.querySelectorAll("button[data-action='accept']").forEach(btn => {
    btn.onclick = async () => await acceptChallenge(btn.getAttribute("data-id"));
  });

  challengesEl.querySelectorAll("button[data-action='start']").forEach(btn => {
    btn.onclick = async () => await startRace(btn.getAttribute("data-id"));
  });

  // ✅ NÃO TEM MAIS "arrive"

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

    // ativa auto-chegada pra este desafio
    enableAutoArriveForChallenge(id);
    autoArriveTryMark(id);

    openModal("Valendo! 🏁", `<p class="muted">Corrida iniciada. Chegada é <b>automática</b> quando entrar em 100m do destino.</p>`);
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
    if (c.winnerUid) return;

    let winnerUid = null;
    let winnerName = null;

    if (c.arrivedCreatorAt && !c.arrivedAccepterAt) {
      winnerUid = c.createdByUid;
      winnerName = c.createdByName || "Criador";
    } else if (!c.arrivedCreatorAt && c.arrivedAccepterAt) {
      winnerUid = c.acceptedByUid;
      winnerName = c.acceptedByName || "Adversário";
    } else if (c.arrivedCreatorAt && c.arrivedAccepterAt) {
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

  try{
    const snap = await db.collection("challenges").doc(id).get();
    if (snap.exists){
      const c = snap.data();
      if (c?.status === "finished"){
        disableAutoArrive();

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
   PRESENÇA ONLINE + MAPA (🟢)
   Coleção: presence (docId = uid)
   =========================== */

const PRESENCE_COL = "presence";
const ONLINE_TTL_MS = 60 * 1000;  // online se pingou nos últimos 60s
const PRESENCE_PING_MS = 25000;   // ping a cada 25s
const PRESENCE_LOC_MS  = 20000;   // atualiza localização a cada 20s

let presenceUnsub = null;
let presencePingInterval = null;
let presenceLocInterval = null;

// elemento da UI (precisa existir no HTML)
const onlineUsersEl = document.getElementById("onlineUsers");

// ---------- UI LISTA ----------
function renderOnlineUsersList(list){
  if (!onlineUsersEl) return;

  if (!list.length) {
    onlineUsersEl.innerHTML = `<div class="muted">Ninguém online agora.</div>`;
    return;
  }

  onlineUsersEl.innerHTML = list.map(u => `
    <div class="ride" style="display:flex;align-items:center;gap:10px;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="width:10px;height:10px;border-radius:999px;background:#22c55e;display:inline-block;"></span>
        <div>
          <div class="rideTitle" style="margin:0;">${escapeHtml(u.name || "Sem nome")}</div>
          <div class="rideMeta">
            ${(u.lat != null && u.lng != null) ? escapeHtml(`${u.lat.toFixed(5)}, ${u.lng.toFixed(5)}`) : "Sem localização"}
          </div>
        </div>
      </div>
      <div class="tiny muted">${u.lastSeenText || ""}</div>
    </div>
  `).join("");
}

// ---------- ÍCONE VERDE NO MAPA ----------
function greenDotIcon(){
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:14px;height:14px;border-radius:999px;
        background:#22c55e;
        border:2px solid white;
        box-shadow:0 2px 10px rgba(0,0,0,.25);
      "></div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// ---------- MARKERS ONLINE ----------
const onlineMarkers = new Map(); // uid -> Leaflet marker

function clearOnlineMarkers(){
  if (!map) return;
  for (const [, marker] of onlineMarkers.entries()){
    try { map.removeLayer(marker); } catch(e){}
  }
  onlineMarkers.clear();
}

function upsertOnlineMarker(u){
  if (!map) return;
  if (!u?.uid) return;
  if (!Number.isFinite(u.lat) || !Number.isFinite(u.lng)) return;

  const title = u.name || "Usuário";
  const popupHtml = `
    <div style="min-width:160px">
      <div style="font-weight:700;">🟢 ${escapeHtml(title)}</div>
      <div class="muted" style="font-size:12px;">${escapeHtml(u.lat.toFixed(5) + ", " + u.lng.toFixed(5))}</div>
    </div>
  `;

  const existing = onlineMarkers.get(u.uid);
  if (existing){
    existing.setLatLng([u.lat, u.lng]);
    existing.setPopupContent(popupHtml);
    return;
  }

  const m = L.marker([u.lat, u.lng], { icon: greenDotIcon() })
    .addTo(map)
    .bindPopup(popupHtml);

  onlineMarkers.set(u.uid, m);
}

// ---------- SALVAR PRESENÇA ----------
async function presenceSetOnline(){
  const user = auth.currentUser;
  if (!user) return;

  let loc = null;
  try { loc = await getLocationOrAsk(); } catch(e){ /* ok sem loc */ }

  const ref = db.collection(PRESENCE_COL).doc(user.uid);
  await ref.set({
    uid: user.uid,
    name: user.displayName || "Sem nome",
    photoURL: user.photoURL || "",
    online: true,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null
  }, { merge: true });
}

async function presenceUpdateLocation(){
  const user = auth.currentUser;
  if (!user) return;

  let loc = null;
  try { loc = await getLocationOrAsk(); } catch(e){ return; }

  const ref = db.collection(PRESENCE_COL).doc(user.uid);
  await ref.set({
    lat: loc.lat,
    lng: loc.lng,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    online: true
  }, { merge: true });
}

async function presenceSetOffline(){
  const user = auth.currentUser;
  if (!user) return;

  const ref = db.collection(PRESENCE_COL).doc(user.uid);
  try{
    await ref.set({
      online: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }catch(e){}
}

// ---------- START / STOP ----------
function presenceStart(){
  presenceStop();

  presenceSetOnline();

  presencePingInterval = setInterval(() => {
    presenceSetOnline();
  }, PRESENCE_PING_MS);

  presenceLocInterval = setInterval(() => {
    presenceUpdateLocation();
  }, PRESENCE_LOC_MS);

  window.addEventListener("beforeunload", () => {
    try { presenceSetOffline(); } catch(e){}
  });
}

function presenceStop(){
  if (presencePingInterval) clearInterval(presencePingInterval);
  if (presenceLocInterval) clearInterval(presenceLocInterval);
  presencePingInterval = null;
  presenceLocInterval = null;

  if (presenceUnsub) presenceUnsub();
  presenceUnsub = null;

  clearOnlineMarkers();
  renderOnlineUsersList([]);
}

// ---------- LISTENER ----------
function presenceListen(){
  if (presenceUnsub) presenceUnsub();

  presenceUnsub = db.collection(PRESENCE_COL)
    .orderBy("lastSeen", "desc")
    .limit(80)
    .onSnapshot((snap) => {
      const now = Date.now();

      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }))
        .filter(p => {
          const ts = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
          const fresh = (now - ts) <= ONLINE_TTL_MS;
          return p.online === true && fresh;
        })
        .map(p => {
          const ts = p.lastSeen?.toDate ? p.lastSeen.toDate() : null;
          return {
            ...p,
            lastSeenText: ts ? ts.toLocaleTimeString() : "",
            lat: Number.isFinite(Number(p.lat)) ? Number(p.lat) : null,
            lng: Number.isFinite(Number(p.lng)) ? Number(p.lng) : null
          };
        });

      renderOnlineUsersList(list);

      clearOnlineMarkers();
      for (const u of list) upsertOnlineMarker(u);
    }, () => {
      if (onlineUsersEl) onlineUsersEl.innerHTML = `<div class="muted">Erro ao carregar online.</div>`;
    });
}
