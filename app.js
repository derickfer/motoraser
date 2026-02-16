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

// =================== ELEMENTOS ===================
const btnLogin = $("btnLogin");
const btnLogout = $("btnLogout");
const btnLocate = $("btnLocate");
const btnAposta = $("btnAposta");
const btnProfile = $("btnProfile");
const btnRefreshRides = $("btnRefreshRides");
const btnCreateRide = $("btnCreateRide");

const destInput = $("destInput");

const userStatus = $("userStatus");
const locStatus = $("locStatus");
const mapInfo = $("mapInfo");

const userCard = $("userCard");
const userPhoto = $("userPhoto");
const userName = $("userName");
const userEmail = $("userEmail");

const ridesEl = $("rides");
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

$("year").textContent = new Date().getFullYear();

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

// =================== PERFIL (LOCAL + FIRESTORE) ===================
function saveProfileLocal(data){ localStorage.setItem("motoraser_profile", JSON.stringify(data)); }
function loadProfileLocal(){ return JSON.parse(localStorage.getItem("motoraser_profile") || "{}"); }
function setFormFromProfile(p){ nameInput.value = p?.name || ""; phoneInput.value = p?.phone || ""; }

async function loadProfileFromFirestore(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return data.profile || null;
}

async function saveProfileToFirestore(uid, profile) {
  await db.collection("users").doc(uid).set(
    { profile, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

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

    // salva base do user
    try {
      await db.collection("users").doc(user.uid).set({
        name: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {}

    // carrega perfil do Firestore (prioridade)
    try {
      const fsProfile = await loadProfileFromFirestore(user.uid);
      if (fsProfile) {
        setFormFromProfile(fsProfile);
        saveProfileLocal(fsProfile);
      } else {
        setFormFromProfile(loadProfileLocal());
      }
    } catch (e) {
      setFormFromProfile(loadProfileLocal());
    }
  } else {
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");
    userStatus.textContent = "Usuário: visitante";
    userCard.classList.add("hidden");
    setFormFromProfile(loadProfileLocal());
  }
});

// =================== SALVAR PERFIL ===================
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const profile = { name: nameInput.value.trim(), phone: phoneInput.value.trim() };
  saveProfileLocal(profile);

  const user = auth.currentUser;
  if (user) {
    try {
      await saveProfileToFirestore(user.uid, profile);
      openModal("Salvo ✅", `<p class="muted">Perfil salvo no Firebase.</p>`);
      return;
    } catch (err) {
      openModal("Erro", `<p class="muted">${err?.message || err}</p>`);
      return;
    }
  }
  openModal("Salvo local ✅", `<p class="muted">Entre com Google para salvar na nuvem.</p>`);
});

btnClear.addEventListener("click", async () => {
  localStorage.removeItem("motoraser_profile");
  setFormFromProfile({ name:"", phone:"" });
  const user = auth.currentUser;
  if (user) {
    try { await saveProfileToFirestore(user.uid, { name:"", phone:"" }); } catch(e){}
  }
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

// =================== CORRIDAS REAIS (FIRESTORE) ===================
let ridesUnsub = null;

function escapeHtml(s){
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function renderRides(docs) {
  ridesEl.innerHTML = "";
  liveCount.textContent = `${docs.length} online`;

  if (docs.length === 0) {
    ridesEl.innerHTML = `<div class="muted">Nenhuma corrida aberta ainda.</div>`;
    return;
  }

  const me = auth.currentUser ? auth.currentUser.uid : null;

  docs.forEach((doc) => {
    const r = doc.data();
    const isMine = me && r.createdByUid === me;
    const isAccepted = r.status === "accepted";

    const statusTag = isAccepted
      ? `<span class="tag accepted">Aceita</span>`
      : `<span class="tag open">Aberta</span>`;

    const mineTag = isMine ? `<span class="tag mine">Minha</span>` : "";

    const acceptBtn = (!isAccepted && me && !isMine)
      ? `<button class="btn primary" data-action="accept" data-id="${doc.id}">✅ Aceitar</button>`
      : "";

    const acceptedInfo = isAccepted
      ? `<div class="rideMeta">Aceita por: <b>${escapeHtml(r.acceptedByName || "—")}</b></div>`
      : "";

    const createdAt = r.createdAt?.toDate ? r.createdAt.toDate() : null;
    const when = createdAt ? createdAt.toLocaleString() : "";

    const div = document.createElement("div");
    div.className = "ride";
    div.innerHTML = `
      <div>
        <div class="rideTitle">🚗 Corrida</div>
        <div class="rideMeta">Usuário: <b>${escapeHtml(r.createdByName || "—")}</b></div>
        <div class="rideMeta">Destino: <b>${escapeHtml(r.destination || "—")}</b></div>
        <div class="rideMeta">Origem: <b>${Number(r.originLat).toFixed(5)}, ${Number(r.originLng).toFixed(5)}</b></div>
        ${acceptedInfo}
        <div class="rideMeta">${escapeHtml(when)}</div>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        ${statusTag}
        ${mineTag}
        <button class="btn ghost" data-action="zoom" data-lat="${r.originLat}" data-lng="${r.originLng}">📍 Ver no mapa</button>
        ${acceptBtn}
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
}

function startRidesListener() {
  if (ridesUnsub) ridesUnsub();

  // Mostra as últimas corridas primeiro
  ridesUnsub = db.collection("rides")
    .orderBy("createdAt", "desc")
    .limit(30)
    .onSnapshot(
      (snap) => renderRides(snap.docs),
      (err) => openModal("Erro ao carregar corridas", `<p class="muted">${err?.message || err}</p>`)
    );
}

startRidesListener();
btnRefreshRides.addEventListener("click", startRidesListener);

async function createRide() {
  const user = auth.currentUser;
  if (!user) {
    openModal("Faça login", `<p class="muted">Entre com Google para criar corrida.</p>`);
    return;
  }

  const destination = destInput.value.trim();
  if (!destination) {
    openModal("Destino obrigatório", `<p class="muted">Digite o destino para criar a corrida.</p>`);
    return;
  }

  let loc;
  try {
    loc = await getLocationOrAsk();
  } catch (err) {
    openModal("Localização", `<p class="muted">Toque em “Minha localização” e permita o acesso.</p>`);
    return;
  }

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
      acceptedAt: null
    });

    destInput.value = "";
    openModal("Corrida criada ✅", `<p class="muted">Sua corrida foi publicada e todos online conseguem ver.</p>`);
  } catch (err) {
    openModal("Erro ao criar", `<p class="muted">${err?.message || err}</p>`);
  } finally {
    btnCreateRide.disabled = false;
    btnCreateRide.textContent = "➕ Criar corrida";
  }
}

btnCreateRide.addEventListener("click", createRide);

async function acceptRide(rideId) {
  const user = auth.currentUser;
  if (!user) {
    openModal("Faça login", `<p class="muted">Entre com Google para aceitar corrida.</p>`);
    return;
  }

  const ref = db.collection("rides").doc(rideId);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Corrida não existe.");
      const r = snap.data();

      if (r.status !== "open") throw new Error("Essa corrida já foi aceita.");
      if (r.createdByUid === user.uid) throw new Error("Você não pode aceitar a sua própria corrida.");

      tx.update(ref, {
        status: "accepted",
        acceptedByUid: user.uid,
        acceptedByName: user.displayName || "Sem nome",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    openModal("Aceita ✅", `<p class="muted">Você aceitou a corrida.</p>`);
  } catch (err) {
    openModal("Não deu 😬", `<p class="muted">${err?.message || err}</p>`);
  }
}

// =================== OUTROS BOTÕES ===================
btnAposta.addEventListener("click", () => {
  openModal("Aposta Corrida", `<p class="muted">Depois a gente liga apostas. Primeiro: corridas reais.</p>`);
});
btnProfile.addEventListener("click", () => nameInput.focus());
