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

// =================== ELEMENTOS ===================
const btnLogin = $("btnLogin");
const btnLogout = $("btnLogout");
const btnLocate = $("btnLocate");
const btnAposta = $("btnAposta");
const btnProfile = $("btnProfile");
const btnRefreshRides = $("btnRefreshRides");
const btnRefreshHistory = $("btnRefreshHistory");

const btnRolePassenger = $("btnRolePassenger");
const btnRoleDriver = $("btnRoleDriver");

const createRideBox = $("createRideBox");
const btnCreateRide = $("btnCreateRide");
const destInput = $("destInput");

const ridesHint = $("ridesHint");
const ridesEl = $("rides");
const historyEl = $("history");
const liveCount = $("liveCount");

const userStatus = $("userStatus");
const roleStatus = $("roleStatus");
const locStatus = $("locStatus");
const mapInfo = $("mapInfo");

const userCard = $("userCard");
const userPhoto = $("userPhoto");
const userName = $("userName");
const userEmail = $("userEmail");

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
function closeModal() { modal.classList.add("hidden"); }
modalClose.addEventListener("click", closeModal);
modalOk.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

// =================== HELPERS ===================
function escapeHtml(s){
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function fmtTime(ts){
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
  return d ? d.toLocaleString() : "";
}

// =================== PERFIL (LOCAL + FIRESTORE) ===================
function saveProfileLocal(data){ localStorage.setItem("motoraser_profile", JSON.stringify(data)); }
function loadProfileLocal(){ return JSON.parse(localStorage.getItem("motoraser_profile") || "{}"); }
function setFormFromProfile(p){ nameInput.value = p?.name || ""; phoneInput.value = p?.phone || ""; }

async function loadUserDoc(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? (snap.data() || {}) : null;
}

async function saveProfileToFirestore(uid, profile) {
  await db.collection("users").doc(uid).set(
    { profile, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function saveRoleToFirestore(uid, role) {
  await db.collection("users").doc(uid).set(
    { role, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

// =================== ROLE ===================
let currentRole = null; // "passenger" | "driver" | null

function setRoleUI(role){
  currentRole = role;

  btnRolePassenger.classList.toggle("active", role === "passenger");
  btnRoleDriver.classList.toggle("active", role === "driver");

  roleStatus.textContent = role ? `Modo: ${role === "passenger" ? "Passageiro" : "Motorista"}` : "Modo: não definido";

  const logged = !!auth.currentUser;
  createRideBox.classList.toggle("hidden", !(logged && role === "passenger"));

  if (!logged) {
    ridesHint.textContent = "Faça login para escolher modo e interagir.";
  } else if (role === "passenger") {
    ridesHint.textContent = "Passageiro: crie corridas, pode cancelar abertas e finalizar aceitas.";
  } else if (role === "driver") {
    ridesHint.textContent = "Motorista: aceite corridas abertas e finalize ao terminar.";
  } else {
    ridesHint.textContent = "Escolha um modo (Passageiro/Motorista).";
  }
}

btnRolePassenger.addEventListener("click", async () => {
  const u = auth.currentUser;
  if (!u) return openModal("Login", `<p class="muted">Entre com Google para escolher modo.</p>`);
  try { await saveRoleToFirestore(u.uid, "passenger"); setRoleUI("passenger"); }
  catch (e) { openModal("Erro", `<p class="muted">${e?.message || e}</p>`); }
});

btnRoleDriver.addEventListener("click", async () => {
  const u = auth.currentUser;
  if (!u) return openModal("Login", `<p class="muted">Entre com Google para escolher modo.</p>`);
  try { await saveRoleToFirestore(u.uid, "driver"); setRoleUI("driver"); }
  catch (e) { openModal("Erro", `<p class="muted">${e?.message || e}</p>`); }
});

// =================== AUTH ===================
btnLogin.addEventListener("click", async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (err) {
    openModal("Erro no login", `<p class="muted">${err?.message || err}</p>`);
  }
});

btnLogout.addEventListener("click", async () => {
  try { await auth.signOut(); }
  catch (err) { openModal("Erro", `<p class="muted">${err?.message || err}</p>`); }
});

auth.onAuthStateChanged(async (user) => {
  if (user) {
    btnLogin.classList.add("hidden");
    btnLogout.classList.remove("hidden");

    userStatus.textContent = `Usuário: ${user.displayName || "Sem nome"}`;

    userCard.classList.remove("hidden");
    userPhoto.src = user.photoURL || "";
    userPhoto.style.display = user.photoURL ? "block" : "none";
    userName.textContent = user.displayName || "Sem nome";
    userEmail.textContent = user.email || "";

    try {
      await db.collection("users").doc(user.uid).set({
        name: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {}

    try {
      const udoc = await loadUserDoc(user.uid);
      const profile = udoc?.profile || null;
      const role = udoc?.role || null;

      if (profile) { setFormFromProfile(profile); saveProfileLocal(profile); }
      else { setFormFromProfile(loadProfileLocal()); }

      setRoleUI(role);
    } catch (e) {
      setFormFromProfile(loadProfileLocal());
      setRoleUI(null);
    }

    startRidesListener();
    startHistoryListener();
  } else {
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");
    userStatus.textContent = "Usuário: visitante";
    userCard.classList.add("hidden");

    setFormFromProfile(loadProfileLocal());
    setRoleUI(null);

    stopRidesListener();
    stopHistoryListener();
    renderRides([]);
    renderHistory([]);
  }
});

// =================== SALVAR PERFIL ===================
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const profile = { name: nameInput.value.trim(), phone: phoneInput.value.trim() };
  saveProfileLocal(profile);

  const user = auth.currentUser;
  if (user) {
    try { await saveProfileToFirestore(user.uid, profile); openModal("Salvo ✅", `<p class="muted">Perfil salvo no Firebase.</p>`); return; }
    catch (err) { openModal("Erro", `<p class="muted">${err?.message || err}</p>`); return; }
  }
  openModal("Salvo local ✅", `<p class="muted">Entre com Google para salvar na nuvem.</p>`);
});

btnClear.addEventListener("click", async () => {
  localStorage.removeItem("motoraser_profile");
  setFormFromProfile({ name:"", phone:"" });
  const user = auth.currentUser;
  if (user) { try { await saveProfileToFirestore(user.uid, { name:"", phone:"" }); } catch(e){} }
  openModal("Limpo ✅", `<p class="muted">Perfil apagado.</p>`);
});

// =================== MAPA + LOCALIZAÇÃO ===================
let map, marker;
let lastLocation = null;

window.initMap = function initMap() {
  const fallback = { lat: -3.2041, lng: -52.2111 }; // Altamira
  map = new google.maps.Map(document.getElementById("map"), {
    center: fallback, zoom: 13,
    mapTypeControl:false, streetViewControl:false, fullscreenControl:false
  });
  marker = new google.maps.Marker({ position: fallback, map });
  mapInfo.textContent = "Toque em “Minha localização”.";
};

function setLocation(lat, lng) {
  lastLocation = { lat, lng };
  const pos = { lat, lng };
  map.setCenter(pos);
  map.setZoom(15);
  marker.setPosition(pos);
  locStatus.textContent = `Localização: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  mapInfo.textContent = "Localização carregada ✅";
}

async function getLocationOrAsk() {
  if (lastLocation) return lastLocation;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Navegador sem geolocalização"));
    mapInfo.textContent = "Pegando sua localização...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(pos.coords.latitude, pos.coords.longitude);
        resolve(lastLocation);
      },
      (err) => reject(err),
      { enableHighAccuracy:true, timeout:12000, maximumAge:0 }
    );
  });
}

btnLocate.addEventListener("click", async () => {
  try { await getLocationOrAsk(); }
  catch (err) {
    mapInfo.textContent = "Não foi possível pegar localização.";
    openModal("Localização bloqueada", `<p class="muted">${err?.message || err}</p>`);
  }
});

// =================== LISTENERS ===================
let ridesUnsub = null;
let historyUnsub = null;

function stopRidesListener(){ if (ridesUnsub) ridesUnsub(); ridesUnsub = null; }
function stopHistoryListener(){ if (historyUnsub) historyUnsub(); historyUnsub = null; }

function startRidesListener() {
  stopRidesListener();
  ridesUnsub = db.collection("rides")
    .orderBy("createdAt", "desc")
    .limit(50)
    .onSnapshot(
      (snap) => renderRides(snap.docs),
      (err) => openModal("Erro ao carregar corridas", `<p class="muted">${err?.message || err}</p>`)
    );
}

function startHistoryListener() {
  stopHistoryListener();
  historyUnsub = db.collection("rides")
    .where("status", "in", ["completed", "canceled"])
    .orderBy("completedAt", "desc")
    .limit(30)
    .onSnapshot(
      (snap) => renderHistory(snap.docs),
      (err) => openModal("Erro no histórico", `<p class="muted">${err?.message || err}</p>`)
    );
}

btnRefreshRides.addEventListener("click", () => startRidesListener());
btnRefreshHistory.addEventListener("click", () => startHistoryListener());

// =================== RENDER ===================
function renderRides(docs) {
  const me = auth.currentUser ? auth.currentUser.uid : null;

  const active = docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.status !== "completed" && r.status !== "canceled");

  liveCount.textContent = `${active.length} online`;
  ridesEl.innerHTML = "";

  if (active.length === 0) {
    ridesEl.innerHTML = `<div class="muted">Nenhuma corrida ativa agora.</div>`;
    return;
  }

  active.forEach((r) => {
    const isMine = me && r.createdByUid === me;
    const isAcceptedByMe = me && r.acceptedByUid === me;
    const isAccepted = r.status === "accepted";
    const isOpen = r.status === "open";

    const statusTag = isAccepted
      ? `<span class="tag accepted">Aceita</span>`
      : `<span class="tag open">Aberta</span>`;

    const mineTag = isMine ? `<span class="tag mine">Minha</span>` : "";

    // aceitar: motorista + aberta + não ser a sua
    const acceptBtn = (isOpen && me && !isMine && currentRole === "driver")
      ? `<button class="btn primary" data-action="accept" data-id="${r.id}">✅ Aceitar</button>`
      : "";

    // finalizar aceitas: criador ou motorista que aceitou
    const canFinishAccepted = isAccepted && me && (isMine || isAcceptedByMe);
    const finishAcceptedBtn = canFinishAccepted
      ? `<button class="btn danger" data-action="finishAccepted" data-id="${r.id}">🏁 FINALIZAR (ACEITA)</button>`
      : "";

    // cancelar/finalizar abertas: só criador
    const canCancelOpen = isOpen && me && isMine;
    const cancelOpenBtn = canCancelOpen
      ? `<button class="btn danger" data-action="cancelOpen" data-id="${r.id}">🛑 FINALIZAR (ABERTA)</button>`
      : "";

    const acceptedInfo = isAccepted
      ? `<div class="rideMeta">Motorista: <b>${escapeHtml(r.acceptedByName || "—")}</b></div>`
      : `<div class="rideMeta">Motorista: <b>—</b></div>`;

    const div = document.createElement("div");
    div.className = "ride";
    div.innerHTML = `
      <div>
        <div class="rideTitle">🚗 Corrida</div>
        <div class="rideMeta">Passageiro: <b>${escapeHtml(r.createdByName || "—")}</b></div>
        ${acceptedInfo}
        <div class="rideMeta">Destino: <b>${escapeHtml(r.destination || "—")}</b></div>
        <div class="rideMeta">Origem: <b>${Number(r.originLat).toFixed(5)}, ${Number(r.originLng).toFixed(5)}</b></div>
        <div class="rideMeta">${escapeHtml(fmtTime(r.createdAt))}</div>
      </div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <div class="tagsRow">
          ${statusTag}
          ${mineTag}
        </div>
        <button class="btn ghost" data-action="zoom" data-lat="${r.originLat}" data-lng="${r.originLng}">📍 Ver no mapa</button>
        ${acceptBtn}
        ${cancelOpenBtn}
        ${finishAcceptedBtn}
      </div>
    `;
    ridesEl.appendChild(div);
  });

  // ações
  ridesEl.querySelectorAll("button[data-action='zoom']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lat = Number(btn.getAttribute("data-lat"));
      const lng = Number(btn.getAttribute("data-lng"));
      setLocation(lat, lng);
      openModal("Mapa", `<p class="muted">Centralizado na origem da corrida.</p>`);
    });
  });

  ridesEl.querySelectorAll("button[data-action='accept']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await acceptRide(id);
    });
  });

  ridesEl.querySelectorAll("button[data-action='finishAccepted']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await confirmFinishAccepted(id);
    });
  });

  ridesEl.querySelectorAll("button[data-action='cancelOpen']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await confirmCancelOpen(id);
    });
  });
}

function renderHistory(docs){
  historyEl.innerHTML = "";
  if (!docs || docs.length === 0) {
    historyEl.innerHTML = `<div class="muted">Ainda não tem corridas finalizadas/canceladas.</div>`;
    return;
  }

  docs.forEach((d) => {
    const r = d.data();
    const kind = r.status === "canceled" ? "🛑 Cancelada" : "✅ Finalizada";
    const tagClass = r.status === "canceled" ? "open" : "done";

    const div = document.createElement("div");
    div.className = "ride";
    div.innerHTML = `
      <div>
        <div class="rideTitle">${kind}</div>
        <div class="rideMeta">Passageiro: <b>${escapeHtml(r.createdByName || "—")}</b></div>
        <div class="rideMeta">Motorista: <b>${escapeHtml(r.acceptedByName || "—")}</b></div>
        <div class="rideMeta">Destino: <b>${escapeHtml(r.destination || "—")}</b></div>
        <div class="rideMeta">Encerrada em: <b>${escapeHtml(fmtTime(r.completedAt))}</b></div>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <span class="tag ${tagClass}">Histórico</span>
        <button class="btn ghost" data-action="zoom" data-lat="${r.originLat}" data-lng="${r.originLng}">📍 Ver origem</button>
      </div>
    `;
    historyEl.appendChild(div);
  });

  historyEl.querySelectorAll("button[data-action='zoom']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lat = Number(btn.getAttribute("data-lat"));
      const lng = Number(btn.getAttribute("data-lng"));
      setLocation(lat, lng);
      openModal("Mapa", `<p class="muted">Centralizado na origem da corrida.</p>`);
    });
  });
}

// =================== AÇÕES ===================
btnCreateRide.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return openModal("Login", `<p class="muted">Entre com Google para criar corrida.</p>`);
  if (currentRole !== "passenger") return openModal("Modo", `<p class="muted">Para criar corrida, selecione <b>Passageiro</b>.</p>`);

  const destination = destInput.value.trim();
  if (!destination) return openModal("Destino obrigatório", `<p class="muted">Digite o destino.</p>`);

  let loc;
  try { loc = await getLocationOrAsk(); }
  catch (e) { return openModal("Localização", `<p class="muted">Toque em “Minha localização” e permita o acesso.</p>`); }

  btnCreateRide.disabled = true;
  btnCreateRide.textContent = "Criando...";

  try {
    await db.collection("rides").add({
      status: "open",
      destination,
      originLat: loc.lat,
      originLng: loc.lng,

      createdByUid: user.uid,
      createdByName: user.displayName || "Sem nome",
      createdByEmail: user.email || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),

      acceptedByUid: null,
      acceptedByName: null,
      acceptedAt: null,

      completedByUid: null,
      completedAt: null
    });

    destInput.value = "";
    openModal("Criada ✅", `<p class="muted">Sua corrida foi publicada.</p>`);
  } catch (err) {
    openModal("Erro", `<p class="muted">${err?.message || err}</p>`);
  } finally {
    btnCreateRide.disabled = false;
    btnCreateRide.textContent = "➕ Criar corrida";
  }
});

async function acceptRide(rideId) {
  const user = auth.currentUser;
  if (!user) return openModal("Login", `<p class="muted">Entre com Google para aceitar.</p>`);
  if (currentRole !== "driver") return openModal("Modo", `<p class="muted">Para aceitar corrida, selecione <b>Motorista</b>.</p>`);

  const ref = db.collection("rides").doc(rideId);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Corrida não existe.");
      const r = snap.data();

      if (r.status !== "open") throw new Error("Essa corrida já foi aceita/finalizada.");
      if (r.createdByUid === user.uid) throw new Error("Você não pode aceitar a sua própria corrida.");

      tx.update(ref, {
        status: "accepted",
        acceptedByUid: user.uid,
        acceptedByName: user.displayName || "Sem nome",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    openModal("Aceita ✅", `<p class="muted">Você aceitou. Pode finalizar depois.</p>`);
  } catch (err) {
    openModal("Não deu 😬", `<p class="muted">${err?.message || err}</p>`);
  }
}

async function confirmFinishAccepted(rideId){
  openModal(
    "Finalizar corrida aceita?",
    `
      <p class="muted">Tem certeza que deseja <b>FINALIZAR</b> essa corrida aceita?</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
        <button id="yesFinish" class="btn danger" type="button">SIM, FINALIZAR</button>
        <button id="noFinish" class="btn ghost" type="button">Cancelar</button>
      </div>
    `
  );
  setTimeout(() => {
    const yes = document.getElementById("yesFinish");
    const no = document.getElementById("noFinish");
    if (no) no.onclick = closeModal;
    if (yes) yes.onclick = async () => { closeModal(); await finishAcceptedRide(rideId); };
  }, 0);
}

async function finishAcceptedRide(rideId) {
  const user = auth.currentUser;
  if (!user) return openModal("Login", `<p class="muted">Entre com Google.</p>`);

  const ref = db.collection("rides").doc(rideId);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Corrida não existe.");
      const r = snap.data();

      if (r.status !== "accepted") throw new Error("Essa corrida não está aceita.");
      const canFinish = (r.createdByUid === user.uid) || (r.acceptedByUid === user.uid);
      if (!canFinish) throw new Error("Sem permissão.");

      tx.update(ref, {
        status: "completed",
        completedByUid: user.uid,
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    openModal("Finalizada ✅", `<p class="muted">Corrida finalizada e enviada pro histórico.</p>`);
  } catch (err) {
    openModal("Erro", `<p class="muted">${err?.message || err}</p>`);
  }
}

async function confirmCancelOpen(rideId){
  openModal(
    "Finalizar corrida aberta?",
    `
      <p class="muted">Isso vai <b>ENCERRAR</b> a corrida aberta (sem motorista) e mandar pro histórico como <b>Cancelada</b>.</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
        <button id="yesCancel" class="btn danger" type="button">SIM, ENCERRAR</button>
        <button id="noCancel" class="btn ghost" type="button">Cancelar</button>
      </div>
    `
  );
  setTimeout(() => {
    const yes = document.getElementById("yesCancel");
    const no = document.getElementById("noCancel");
    if (no) no.onclick = closeModal;
    if (yes) yes.onclick = async () => { closeModal(); await cancelOpenRide(rideId); };
  }, 0);
}

async function cancelOpenRide(rideId){
  const user = auth.currentUser;
  if (!user) return openModal("Login", `<p class="muted">Entre com Google.</p>`);

  const ref = db.collection("rides").doc(rideId);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Corrida não existe.");
      const r = snap.data();

      if (r.status !== "open") throw new Error("Essa corrida não está aberta.");
      if (r.createdByUid !== user.uid) throw new Error("Só o passageiro (criador) pode encerrar aberta.");

      tx.update(ref, {
        status: "canceled",
        completedByUid: user.uid,
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    openModal("Encerrada ✅", `<p class="muted">Corrida aberta encerrada (cancelada) e enviada pro histórico.</p>`);
  } catch (err) {
    openModal("Erro", `<p class="muted">${err?.message || err}</p>`);
  }
}

// =================== OUTROS ===================
btnAposta.addEventListener("click", () => {
  openModal("Aposta Corrida", `<p class="muted">Depois a gente liga apostas. Agora já dá: aceitar + finalizar + encerrar abertas.</p>`);
});
btnProfile.addEventListener("click", () => nameInput.focus());
