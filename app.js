const $ = (sel) => document.querySelector(sel);

/* ================== FIREBASE (LOGIN GOOGLE + FIRESTORE) ================== */
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
const provider = new firebase.auth.GoogleAuthProvider();
const db = firebase.firestore();

/* ================== ESTADO ================== */
const STORAGE_KEY = "motoraser_profile_v1";

const state = {
  profile: { name: "", phone: "" },
  location: null, // {lat, lng, accuracy}
};

let map;
let userMarker;

// Fallback: Altamira-PA
const ALTAMIRA = { lat: -3.2042, lng: -52.2057 };

/* ================== MAPA ================== */
window.initMap = function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: ALTAMIRA,
    zoom: 13,
    disableDefaultUI: true,
    zoomControl: true,
  });

  userMarker = new google.maps.Marker({
    position: ALTAMIRA,
    map,
    title: "Você",
  });
};

/* ================== PERFIL LOCAL ================== */
function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    state.profile = {
      name: (obj?.name ?? "").toString(),
      phone: (obj?.phone ?? "").toString(),
    };
  } catch {}
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.profile));
}

function renderProfile() {
  $("#name").value = state.profile.name;
  $("#phone").value = state.profile.phone;

  const userLabel = state.profile.name?.trim()
    ? `Usuário: ${state.profile.name.trim()}`
    : "Usuário: visitante";
  $("#userStatus").textContent = userLabel;
}

function renderLocation() {
  if (!state.location) {
    $("#locStatus").textContent = "Localização: não carregada";
    $("#mapInfo").textContent = "Toque em “Minha localização”.";
    return;
  }

  const { lat, lng, accuracy } = state.location;
  $("#locStatus").textContent = `Localização: ok (±${Math.round(accuracy)}m)`;
  $("#mapInfo").textContent = `Lat: ${lat.toFixed(6)} • Lng: ${lng.toFixed(6)}`;
}

/* ================== MODAL ================== */
function openModal(title, html) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
function closeModal() {
  $("#modal").classList.add("hidden");
}

/* ================== GEOLOCALIZAÇÃO ================== */
function getLocation() {
  if (!navigator.geolocation) {
    openModal("Localização", "Seu navegador não suporta geolocalização.");
    return;
  }

  $("#btnLocate").disabled = true;
  $("#btnLocate").textContent = "📍 Localizando...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.location = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };

      renderLocation();

      // Atualiza mapa quando pegar a localização
      if (map && userMarker) {
        const p = { lat: state.location.lat, lng: state.location.lng };
        userMarker.setPosition(p);
        map.setCenter(p);
        map.setZoom(16);
      }

      $("#btnLocate").disabled = false;
      $("#btnLocate").textContent = "📍 Minha localização";
    },
    (err) => {
      $("#btnLocate").disabled = false;
      $("#btnLocate").textContent = "📍 Minha localização";

      let msg = "Não consegui pegar sua localização.";
      if (err.code === 1) msg = "Permissão negada. Ative a localização no navegador.";
      if (err.code === 2) msg = "Localização indisponível no momento.";
      if (err.code === 3) msg = "Tempo esgotado tentando localizar.";
      openModal("Localização", msg);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

/* ================== CORRIDAS (MOCK) ================== */
function ridesMock() {
  return [
    { from: "Centro", to: "Bairro A", eta: "6 min", demand: "Alta" },
    { from: "Altamira", to: "Bairro B", eta: "9 min", demand: "Média" },
    { from: "Orla", to: "Hospital", eta: "4 min", demand: "Alta" },
  ];
}

function renderRides() {
  const rides = ridesMock();
  const root = $("#rides");
  root.innerHTML = "";

  rides.forEach((r, idx) => {
    const el = document.createElement("div");
    el.className = "ride";

    el.innerHTML = `
      <div>
        <div class="rideTitle">Corrida #${idx + 1}</div>
        <div class="rideSub">Origem: ${r.from} → Destino: ${r.to} • Chega em ${r.eta}</div>
      </div>
      <div class="rideRight">
        <div class="badge">Demanda: ${r.demand}</div>
        <button class="btn" data-ride="${idx}">Detalhes</button>
      </div>
    `;

    root.appendChild(el);
  });

  root.querySelectorAll("button[data-ride]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-ride"));
      const r = rides[i];
      openModal("Detalhes da corrida", `
        <div><b>Origem:</b> ${r.from}</div>
        <div><b>Destino:</b> ${r.to}</div>
        <div><b>Tempo estimado:</b> ${r.eta}</div>
        <div><b>Demanda:</b> ${r.demand}</div>
      `);
    });
  });
}

/* ================== APOSTA (SIMULADOR) ================== */
function handleAposta() {
  const name = $("#userName")?.textContent?.trim() || state.profile.name?.trim() || "Visitante";
  const loc = state.location
    ? `Sua localização está ativa (±${Math.round(state.location.accuracy)}m).`
    : "Sua localização ainda não foi ativada.";

  openModal("APOSTA CORRIDA (simulador)", `
    <div><b>Usuário:</b> ${name}</div>
    <div style="margin-top:6px">${loc}</div>
    <div style="margin-top:10px">
      Aqui entra a tela do seu “jogo de previsão” (ex: escolher corrida, prever demanda, etc).
      <br/><br/>
      <b>Importante:</b> Sem dinheiro real neste modo.
    </div>
  `);
}

/* ================== LOGIN + SALVAR USUÁRIO NO FIRESTORE ================== */
function setupAuth() {
  $("#btnLogin").addEventListener("click", async () => {
    try {
      await auth.signInWithPopup(provider);
    } catch (e) {
      openModal("Login", "Não foi possível abrir o login. Verifique domínios autorizados no Firebase.");
    }
  });

  $("#btnLogout").addEventListener("click", async () => {
    await auth.signOut();
  });

  auth.onAuthStateChanged(async (user) => {
    const isLogged = !!user;

    // Botões
    $("#btnLogin").classList.toggle("hidden", isLogged);
    $("#btnLogout").classList.toggle("hidden", !isLogged);

    // Card do usuário
    $("#userCard").classList.toggle("hidden", !isLogged);

    if (!isLogged) {
      // mantém o perfil local funcionando
      renderProfile();
      return;
    }

    // UI
    $("#userStatus").textContent = `Logado: ${user.displayName || "Usuário"}`;
    $("#userName").textContent = user.displayName || "Usuário";
    $("#userEmail").textContent = user.email || "";

    if (user.photoURL) {
      $("#userPhoto").src = user.photoURL;
      $("#userPhoto").classList.remove("hidden");
    } else {
      $("#userPhoto").classList.add("hidden");
    }

    // ✅ SALVAR/ATUALIZAR USUÁRIO NO FIRESTORE
    try {
      await db.collection("users").doc(user.uid).set({
        uid: user.uid,
        name: user.displayName || "",
        email: user.email || "",
        photo: user.photoURL || "",
        provider: "google",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      // se regra bloquear, a gente ajusta as rules depois
      console.error("Erro ao salvar usuário no Firestore:", e);
    }
  });
}

/* ================== INIT ================== */
function init() {
  $("#year").textContent = new Date().getFullYear();

  loadProfile();
  renderProfile();
  renderLocation();
  renderRides();
  setupAuth();

  $("#btnLocate").addEventListener("click", getLocation);

  $("#profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.profile.name = $("#name").value;
    state.profile.phone = $("#phone").value;
    saveProfile();
    renderProfile();
    openModal("Perfil", "✅ Perfil salvo no seu navegador.");
  });

  $("#btnClear").addEventListener("click", () => {
    state.profile = { name: "", phone: "" };
    saveProfile();
    renderProfile();
  });

  $("#btnAposta").addEventListener("click", handleAposta);
  $("#btnProfile").addEventListener("click", () => {
    openModal("Perfil", "Preencha seu nome e telefone e clique em salvar.");
  });

  $("#modalClose").addEventListener("click", closeModal);
  $("#modalOk").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => {
    if (e.target === $("#modal")) closeModal();
  });
}

init();
