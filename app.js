/* =================================================================================
  MOTORASER - app.js (COMPLETO / ATUALIZADO)
  - Leaflet + OSRM rota
  - Firebase Auth + Firestore
  - Desafios 1x1
  - Chegada automática (100m)
  - Presença online + mapa
  - Encerrar corrida (finalizar corridas antigas/incompletas) ✅
================================================================================= */

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
const on = (el, evt, fn) => { if (el) el.addEventListener(evt, fn); };

const yearEl = $("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// =================== UI ===================
const btnLogin = $("btnLogin");
const btnLogout = $("btnLogout");
const btnLocate = $("btnLocate");
const btnCreateChallenge = $("btnCreateChallenge");
const btnRefresh = $("btnRefresh");

const btnFullscreenMap = $("btnFullscreenMap");
const btnCloseFullscreenMap = $("btnCloseFullscreenMap");
const mapBox = $("mapBox");

const btnClearRoute = $("btnClearRoute");
const btnPickMap = $("btnPickMap");

const userStatus = $("userStatus");
const locStatus = $("locStatus");
const mapInfo = $("mapInfo");
const challengesEl = $("challenges");
const liveCount = $("liveCount");

const profileForm = $("profileForm");
const nameInput = $("name");
const phoneInput = $("phone");
const btnClear = $("btnClear");

// Modal
const modal = $("modal");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const modalClose = $("modalClose");
const modalOk = $("modalOk");

// =================== MODAL ===================
function openModal(title, html) {
  if (!modal) return;
  if (modalTitle) modalTitle.textContent = title || "";
  if (modalBody) modalBody.innerHTML = html || "";
  modal.classList.remove("hidden");
}
function closeModal(){
  if (!modal) return;
  modal.classList.add("hidden");
}
if (modalClose) modalClose.onclick = closeModal;
if (modalOk) modalOk.onclick = closeModal;
if (modal) modal.onclick = (e) => { if (e.target === modal) closeModal(); };

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
function withinRadius(myLoc, destLoc, radiusMeters = 100){
  if (!myLoc || !destLoc) return false;
  return haversineMeters(myLoc, destLoc) <= radiusMeters;
}

// =================== PROFILE (local + firestore) ===================
function saveProfileLocal(data){ localStorage.setItem("motoraser_profile", JSON.stringify(data)); }
function loadProfileLocal(){ return JSON.parse(localStorage.getItem("motoraser_profile") || "{}"); }
function setFormFromProfile(p){
  if (nameInput) nameInput.value = p?.name || "";
  if (phoneInput) phoneInput.value = p?.phone || "";
}

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

// =================== ESTADO GLOBAL ===================
let map = null;
let meMarker = null;
let destMarker = null;

let lastLocation = null;    // {lat,lng}
let lastDest = null;        // {lat,lng}
let lastDestName = "";      // string
let routeLayer = null;      // L.geoJSON layer
let tileLayer = null;

let gpsWatchId = null;

let pickingMode = false;
let pickingMarker = null;
let pickingCallback = null;

// ====== SETA / DIREÇÃO ======
let meHeadingDeg = 0;
let lastPosForBearing = null;
let compassEnabled = false;
let lastCompassDeg = null;

function normDeg(d){
  let x = Number(d);
  if (!Number.isFinite(x)) return 0;
  x = x % 360;
  if (x < 0) x += 360;
  return x;
}
function bearingDeg(a, b){
  const toRad = (x) => x * Math.PI / 180;
  const toDeg = (x) => x * 180 / Math.PI;

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLng);

  return normDeg(toDeg(Math.atan2(y, x)));
}
function driverArrowIcon(){
  return L.divIcon({
    className: "driverWrap",
    html: `
      <div class="driverArrow" style="
        width:28px;height:28px;display:grid;place-items:center;
        transform: rotate(0deg);
        transition: transform .08s linear;
        filter: drop-shadow(0 2px 10px rgba(0,0,0,.55));
      ">
        <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <linearGradient id="drvG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#00c8ff"/>
              <stop offset="1" stop-color="#1ddc8b"/>
            </linearGradient>
          </defs>
          <path d="M32 4 L54 58 L32 48 L10 58 Z" fill="url(#drvG)" stroke="rgba(255,255,255,.8)" stroke-width="2"/>
          <path d="M32 10 L45 50 L32 44 L19 50 Z" fill="rgba(0,0,0,.25)"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
function setMarkerRotation(marker, deg){
  if (!marker) return;
  const el = marker.getElement?.();
  if (!el) return;
  const arrow = el.querySelector?.(".driverArrow");
  if (!arrow) return;
  arrow.style.transform = `rotate(${normDeg(deg)}deg)`;
}

// =================== MAP INIT ===================
function initMap(){
  const fallback = { lat: -3.2041, lng: -52.2111 }; // Altamira
  map = L.map("map", { zoomControl: true })
    .setView([fallback.lat, fallback.lng], 13);

  tileLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map);

  meMarker = L.marker([fallback.lat, fallback.lng], { icon: driverArrowIcon() })
    .addTo(map)
    .bindPopup("Você");

  setMarkerRotation(meMarker, meHeadingDeg);

  if (mapInfo) mapInfo.textContent = "Toque em “Minha localização”.";
}
initMap();

function setMapFullscreen(onFull){
  if (!mapBox) return;
  if (onFull) mapBox.classList.add("fullscreen");
  else mapBox.classList.remove("fullscreen");
  setTimeout(() => { try { map?.invalidateSize(); } catch(e){} }, 120);
}
on(btnFullscreenMap, "click", () => setMapFullscreen(true));
on(btnCloseFullscreenMap, "click", () => setMapFullscreen(false));

// =================== ROTA (OSRM) ===================
function clearRoute(){
  if (routeLayer && map){
    try { map.removeLayer(routeLayer); } catch(e){}
  }
  routeLayer = null;
}

async function updateRouteIfReady(){
  if (!map || !lastLocation || !lastDest) return;

  try{
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${lastLocation.lng},${lastLocation.lat};${lastDest.lng},${lastDest.lat}` +
      `?overview=full&geometries=geojson`;

    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return;

    const data = await res.json();
    const route = data?.routes?.[0];
    const geom = route?.geometry;
    if (!geom) return;

    clearRoute();

    routeLayer = L.geoJSON(geom, {
      style: { weight: 5, opacity: 0.95, className: "route-neon" }
    }).addTo(map);

    const bounds = routeLayer.getBounds();
    if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.2));

    const km = (Number(route.distance || 0) / 1000).toFixed(2);
    const min = Math.max(1, Math.round(Number(route.duration || 0) / 60));
    if (mapInfo) mapInfo.textContent = `Rota: ${km} km • ~${min} min ✅`;
  }catch(e){
    if (mapInfo) mapInfo.textContent = "Rota indisponível (ok para demo).";
  }
}

if (btnClearRoute){
  btnClearRoute.onclick = () => {
    clearRoute();
    openModal("Rota", `<p class="muted">Rota removida do mapa.</p>`);
  };
}

// =================== LOCALIZAÇÃO ===================
function setMyLocation(lat, lng){
  lastLocation = { lat, lng };

  // direção pelo movimento
  if (lastPosForBearing){
    meHeadingDeg = bearingDeg(lastPosForBearing, { lat, lng });
  }
  lastPosForBearing = { lat, lng };

  setMarkerRotation(meMarker, meHeadingDeg);
  if (meMarker) meMarker.setLatLng([lat, lng]);
  if (map) map.setView([lat, lng], 15);

  if (locStatus) locStatus.textContent = `Localização: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  updateRouteIfReady();
  if (typeof autoArriveCheckAll === "function") autoArriveCheckAll();
}

function setDestinationOnMap(dest){
  lastDest = dest;

  if (destMarker && map) {
    try { map.removeLayer(destMarker); } catch(e){}
  }

  destMarker = L.marker([dest.lat, dest.lng]).addTo(map).bindPopup("Destino");

  // gira seta: bússola > movimento
  if (compassEnabled && Number.isFinite(lastCompassDeg)) {
    meHeadingDeg = normDeg(lastCompassDeg);
  } else if (lastLocation) {
    meHeadingDeg = bearingDeg(lastLocation, dest);
  }
  setMarkerRotation(meMarker, meHeadingDeg);

  map.setView([dest.lat, dest.lng], 15);
  updateRouteIfReady();
  if (typeof autoArriveCheckAll === "function") autoArriveCheckAll();
}

async function getLocationOnce(){
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocalização não suportada."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 8000 }
    );
  });
}

async function getLocationOrAsk(){
  if (lastLocation) return lastLocation;
  const loc = await getLocationOnce();
  setMyLocation(loc.lat, loc.lng);
  return loc;
}

function startGpsWatch(){
  if (!navigator.geolocation) return;
  if (gpsWatchId != null) return;

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setMyLocation(lat, lng);
    },
    () => {},
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 3000 }
  );
}
function stopGpsWatch(){
  if (gpsWatchId != null){
    try { navigator.geolocation.clearWatch(gpsWatchId); } catch(e){}
  }
  gpsWatchId = null;
}

// =================== BÚSSOLA ===================
async function enableCompassIfPossible(){
  try{
    if (typeof DeviceOrientationEvent === "undefined") return;
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const p = await DeviceOrientationEvent.requestPermission();
      if (p !== "granted") return;
    }
    window.addEventListener("deviceorientation", (e) => {
      const a = e.alpha;
      if (!Number.isFinite(a)) return;
      compassEnabled = true;
      lastCompassDeg = normDeg(a);
      // se tiver destino, aponta pra ele
      if (lastDest && lastLocation){
        meHeadingDeg = lastCompassDeg;
        setMarkerRotation(meMarker, meHeadingDeg);
      }
    }, { passive: true });
  }catch(e){}
}

// tenta ligar no mobile
enableCompassIfPossible();

// =================== AUTO START LOCATION ===================
let autoStarted = false;
async function autoStartLocation(){
  if (autoStarted) return;
  autoStarted = true;
  try{
    await getLocationOrAsk();
    startGpsWatch();
    await updateRouteIfReady();
  }catch(e){}
}

if (btnLocate){
  btnLocate.onclick = async () => {
    try{
      const loc = await getLocationOrAsk();
      startGpsWatch();
      openModal("Localização ✅", `<p class="muted">${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</p>`);
    }catch(e){
      openModal("Localização", `<p class="muted">Permita a localização no navegador.</p>`);
    }
  };
}

// ===========================
// REVERSE GEOCODE (nome do local)
// ===========================
async function reverseGeocodeOSM(lat, lng){
  try{
    const url1 = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
    const r1 = await fetch(url1, { headers: { "Accept":"application/json" } });
    if (r1.ok){
      const data = await r1.json();
      const addr = data.address || {};
      const best =
        data.name ||
        addr.road ||
        addr.neighbourhood ||
        addr.suburb ||
        addr.city ||
        addr.town ||
        addr.village ||
        data.display_name ||
        "";
      const name = String(best).trim();
      if (name) return name;
    }
  }catch(e){}

  try{
    const url2 = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const r2 = await fetch(url2, { headers: { "Accept":"application/json" } });
    if (r2.ok){
      const data = await r2.json();
      const p = data?.features?.[0]?.properties || {};
      const best = p.name || p.street || p.locality || p.city || p.state || p.country || "";
      const name = String(best).trim();
      if (name) return name;
    }
  }catch(e){}

  return "";
}

// ===========================
// SELECIONAR DESTINO NO MAPA
// ===========================
function startPickOnMap(callback){
  pickingMode = true;
  pickingCallback = callback;

  if (mapInfo) mapInfo.textContent = "🎯 Clique no mapa para selecionar o DESTINO.";
  const mapEl = $("map");
  if (mapEl) mapEl.style.cursor = "crosshair";

  if (pickingMarker && map){
    try { map.removeLayer(pickingMarker); } catch(e){}
    pickingMarker = null;
  }
}

function stopPickOnMap(){
  pickingMode = false;
  pickingCallback = null;

  if (mapInfo) mapInfo.textContent = "Seleção encerrada.";
  const mapEl = $("map");
  if (mapEl) mapEl.style.cursor = "";
}

// click do mapa
if (map){
  map.on("click", async (e) => {
    if (!pickingMode) return;

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (pickingMarker){
      try { map.removeLayer(pickingMarker); } catch(e){}
    }
    pickingMarker = L.marker([lat, lng]).addTo(map).bindPopup("Destino selecionado ✅").openPopup();

    setDestinationOnMap({ lat, lng });

    lastDestName = "";
    try{
      if (mapInfo) mapInfo.textContent = "Buscando nome do local...";
      const place = await reverseGeocodeOSM(lat, lng);
      lastDestName = place || "";
    }catch(e){
      lastDestName = "";
    }

    if (typeof pickingCallback === "function"){
      pickingCallback({ lat, lng, name: lastDestName });
    }

    stopPickOnMap();
  });
}

if (btnPickMap){
  btnPickMap.onclick = () => {
    closeModal();
    startPickOnMap(({ lat, lng, name }) => {
      // abre modal de criação se existir
      if (btnCreateChallenge) btnCreateChallenge.click();

      setTimeout(() => {
        const latInput = $("cLat");
        const lngInput = $("cLng");
        const nameInput2 = $("cDestName");

        if (latInput) latInput.value = lat.toFixed(6);
        if (lngInput) lngInput.value = lng.toFixed(6);

        if (nameInput2 && name) nameInput2.value = name;
        if (nameInput2 && (!name || !String(name).trim()) && lastDestName) {
          nameInput2.value = lastDestName;
        }

        updateRouteIfReady();
      }, 120);
    });
  };
}

// =================== AUTH ===================
if (btnLogin){
  btnLogin.onclick = async () => {
    try{
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    }catch(e){
      openModal("Login", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
    }
  };
}

if (btnLogout){
  btnLogout.onclick = async () => {
    try { await auth.signOut(); } catch(e){}
  };
}

// =================== CHALLENGES LISTENER ===================
let unsubChallenges = null;

function stopChallengesListener(){
  if (unsubChallenges) unsubChallenges();
  unsubChallenges = null;
}

function startChallengesListener(){
  stopChallengesListener();

  // ✅ mais simples e confiável
  unsubChallenges = db.collection("challenges")
    .orderBy("createdAt", "desc")
    .limit(60)
    .onSnapshot((snap) => {
      renderChallenges(snap.docs);
    }, () => {
      if (challengesEl) challengesEl.innerHTML = `<div class="muted">Erro ao carregar desafios.</div>`;
    });
}

if (btnRefresh){
  btnRefresh.onclick = () => {
    startChallengesListener();
    openModal("Atualizar", `<p class="muted">Atualizado ✅</p>`);
  };
}

// =================== CRIAR DESAFIO (modal) ===================
// Se teu HTML tiver botão "btnC" (confirmar criação), isso aqui funciona.
const btnC = $("btnC");
if (btnC){
  btnC.onclick = async () => {
    const u = auth.currentUser;
    if (!u) return openModal("Login", `<p class="muted">Entre com Google para criar.</p>`);

    let myLoc;
    try { myLoc = await getLocationOrAsk(); startGpsWatch(); }
    catch(e){ return openModal("Localização", `<p class="muted">Permita a localização.</p>`); }

    const destName = ($("cDestName")?.value || "").trim();
    const lat = Number($("cLat")?.value);
    const lng = Number($("cLng")?.value);
    const stake = Number($("cStake")?.value || 0);

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
}

// =================== RENDER CHALLENGES ===================
function renderChallenges(docs){
  const u = auth.currentUser;
  const me = u ? u.uid : null;

  const list = docs.map(d => ({ id:d.id, ...d.data() }))
    .filter(x => x.status !== "canceled"); // deixa finished opcional (se quiser esconder, filtra aqui)

  if (liveCount) liveCount.textContent = `${list.length} online`;
  if (!challengesEl) return;

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
      c.status === "racing" ? `<span class="tag racing">Correndo</span>` :
      c.status === "finished" ? `<span class="tag done">Finalizado</span>` :
      `<span class="tag done">${escapeHtml(c.status || "—")}</span>`;

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

    // ✅ BOTÃO ENCERRAR (corridas antigas/incompletas)
    const canFinish = me && (isMine || isAcceptedByMe) && (c.status !== "canceled" && c.status !== "finished");
    const finishBtn = canFinish
      ? `<button class="btn danger" data-action="finish" data-id="${c.id}">🛑 Encerrar</button>`
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
        <div class="rideMeta">Coord: <b>${Number.isFinite(dest.lat) ? dest.lat.toFixed(5) : "—"}, ${Number.isFinite(dest.lng) ? dest.lng.toFixed(5) : "—"}</b></div>
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
        ${finishBtn}
      </div>
    `;
    challengesEl.appendChild(div);
  }

  challengesEl.querySelectorAll("button[data-action='zoom']").forEach(btn => {
    btn.onclick = () => {
      const lat = Number(btn.getAttribute("data-lat"));
      const lng = Number(btn.getAttribute("data-lng"));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setDestinationOnMap({ lat, lng });
      map?.setView([lat, lng], 15);
      openModal("Destino", `<p class="muted">Destino marcado no mapa 🎯</p>`);
    };
  });

  challengesEl.querySelectorAll("button[data-action='route']").forEach(btn => {
    btn.onclick = async () => {
      try{
        await getLocationOrAsk();
        startGpsWatch();
        const lat = Number(btn.getAttribute("data-lat"));
        const lng = Number(btn.getAttribute("data-lng"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
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

  challengesEl.querySelectorAll("button[data-action='finish']").forEach(btn => {
    btn.onclick = async () => await finishChallenge(btn.getAttribute("data-id"));
  });
}

// =================== ACTIONS ===================
async function acceptChallenge(id){
  const u = auth.currentUser;
  if (!u) return openModal("Login", `<p class="muted">Entre com Google para aceitar.</p>`);

  let myLoc;
  try { myLoc = await getLocationOrAsk(); startGpsWatch(); }
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

    startGpsWatch();
    openModal("Valendo! 🏁", `<p class="muted">GPS ligado ✅ Ao entrar em <b>100m</b> do destino, registra sozinho.</p>`);
  }catch(e){
    openModal("Erro", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
  }
}

// ✅ ENCERRAR CORRIDA (antigas/incompletas)
async function finishChallenge(id){
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

      if (c.status === "finished" || c.status === "canceled") return;

      tx.update(ref, {
        status: "finished",
        finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
        winnerUid: null,
        winnerName: "Encerrado manualmente"
      });
    });

    openModal("Encerrado ✅", `<p class="muted">Corrida finalizada manualmente.</p>`);
  }catch(e){
    openModal("Erro", `<p class="muted">${escapeHtml(e?.message || String(e))}</p>`);
  }
}

// ✅ CHEGADA AUTOMÁTICA (100m)
const arrivingNow = new Set();

async function arriveAuto(id, myLoc){
  const u = auth.currentUser;
  if (!u) return;
  if (arrivingNow.has(id)) return;

  arrivingNow.add(id);
  const ref = db.collection("challenges").doc(id);

  try{
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Desafio não existe.");
      const c = snap.data();

      if (c.status !== "racing") return;

      const isCreator = c.createdByUid === u.uid;
      const isAccepter = c.acceptedByUid === u.uid;
      if (!isCreator && !isAccepter) return;

      if (isCreator && c.arrivedCreatorAt) return;
      if (isAccepter && c.arrivedAccepterAt) return;

      const dest = { lat:Number(c.destinationLat), lng:Number(c.destinationLng) };
      const ok = withinRadius(myLoc, dest, 100);
      if (!ok) return;

      const updates = {};
      if (isCreator) updates.arrivedCreatorAt = firebase.firestore.FieldValue.serverTimestamp();
      else updates.arrivedAccepterAt = firebase.firestore.FieldValue.serverTimestamp();

      tx.update(ref, updates);
    });

    await tryFinish(id);

    openModal("Chegou! ✅", `<p class="muted">Você entrou no raio de <b>100m</b>. Chegada registrada automaticamente.</p>`);
  }catch(e){
    console.log("arriveAuto error:", e);
  }finally{
    setTimeout(() => arrivingNow.delete(id), 2500);
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
        openModal("Resultado 🏆", `
          <p class="muted">Vencedor: <b>${escapeHtml(c.winnerName || "—")}</b></p>
          <p class="muted">Aposta: <b>${Number(c.stakePoints||0)} pts</b></p>
        `);
      }
    }
  }catch(e){}
}

// ✅ checa desafios correndo que eu participo
async function autoArriveCheckAll(){
  const u = auth.currentUser;
  if (!u || !lastLocation) return;

  try{
    const snap = await db.collection("challenges")
      .orderBy("createdAt", "desc")
      .limit(40)
      .get();

    const docs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    for (const c of docs){
      if (c.status !== "racing") continue;
      const iAmCreator = c.createdByUid === u.uid;
      const iAmAccepter = c.acceptedByUid === u.uid;
      if (!iAmCreator && !iAmAccepter) continue;

      if (iAmCreator && c.arrivedCreatorAt) continue;
      if (iAmAccepter && c.arrivedAccepterAt) continue;

      const dest = { lat:Number(c.destinationLat), lng:Number(c.destinationLng) };
      if (withinRadius(lastLocation, dest, 100)) {
        await arriveAuto(c.id, lastLocation);
      }
    }
  }catch(e){
    console.log("autoArriveCheckAll error:", e);
  }
}

// =================== PROFILE FORM ===================
if (profileForm){
  profileForm.onsubmit = async (e) => {
    e.preventDefault();
    const profile = { name: (nameInput?.value || "").trim(), phone: (phoneInput?.value || "").trim() };
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
}

if (btnClear){
  btnClear.onclick = async () => {
    localStorage.removeItem("motoraser_profile");
    setFormFromProfile({ name:"", phone:"" });
    const u = auth.currentUser;
    if (u) {
      try{ await saveProfileToFirestore(u.uid, { name:"", phone:"" }); }catch(e){}
    }
    openModal("Limpo ✅", `<p class="muted">Perfil apagado.</p>`);
  };
}

// =================== PRESENCE ONLINE ===================
const PRESENCE_COL = "presence";
const ONLINE_TTL_MS = 60 * 1000;
const PRESENCE_PING_MS = 25000;
const PRESENCE_LOC_MS  = 20000;

let presenceUnsub = null;
let presencePingInterval = null;
let presenceLocInterval = null;

const onlineUsersEl = $("onlineUsers");
const onlineMarkers = new Map();

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
          <div class="rideMeta">${(u.lat != null && u.lng != null) ? escapeHtml(`${u.lat.toFixed(5)}, ${u.lng.toFixed(5)}`) : "Sem localização"}</div>
        </div>
      </div>
      <div class="tiny muted">${u.lastSeenText || ""}</div>
    </div>
  `).join("");
}

function greenDotIcon(){
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:14px;height:14px;border-radius:999px;
        background:#22c55e;
        border:2px solid rgba(255,255,255,.9);
        box-shadow:0 0 10px rgba(34,197,94,.65), 0 0 20px rgba(0,0,0,.25);
      "></div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

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

async function presenceSetOnline(){
  const user = auth.currentUser;
  if (!user) return;

  let loc = null;
  try { loc = await getLocationOrAsk(); } catch(e){}

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

function presenceStart(){
  presenceStop();
  presenceSetOnline();

  presencePingInterval = setInterval(() => presenceSetOnline(), PRESENCE_PING_MS);
  presenceLocInterval = setInterval(() => presenceUpdateLocation(), PRESENCE_LOC_MS);

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

// =================== AUTH STATE ===================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    autoStartLocation();

    if (btnLogin) btnLogin.classList.add("hidden");
    if (btnLogout) btnLogout.classList.remove("hidden");
    if (userStatus) userStatus.textContent = `Usuário: ${user.displayName || "Sem nome"}`;

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

    presenceStart();
    presenceListen();
    startChallengesListener();
    startGpsWatch();
  } else {
    if (btnLogin) btnLogin.classList.remove("hidden");
    if (btnLogout) btnLogout.classList.add("hidden");
    if (userStatus) userStatus.textContent = "Usuário: visitante";

    setFormFromProfile(loadProfileLocal());
    presenceStop();
    stopChallengesListener();

    if (challengesEl) challengesEl.innerHTML = "";
  }
});
