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

// =================== ELEMENTOS ===================
const $ = (id) => document.getElementById(id);

const btnLogin = $("btnLogin");
const btnLogout = $("btnLogout");
const btnLocate = $("btnLocate");
const btnAposta = $("btnAposta");
const btnProfile = $("btnProfile");
const btnRefreshRides = $("btnRefreshRides");

const userStatus = $("userStatus");
const locStatus = $("locStatus");
const mapInfo = $("mapInfo");

const userCard = $("userCard");
const userPhoto = $("userPhoto");
const userName = $("userName");
const userEmail = $("userEmail");

const ridesEl = $("rides");

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
function closeModal() {
  modal.classList.add("hidden");
}
modalClose.addEventListener("click", closeModal);
modalOk.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

// =================== AUTH (GOOGLE) ===================
btnLogin.addEventListener("click", async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (err) {
    openModal("Erro no login", `<p class="muted">${err?.message || err}</p>`);
  }
});

btnLogout.addEventListener("click", async () => {
  try {
    await auth.signOut();
  } catch (err) {
    openModal("Erro", `<p class="muted">${err?.message || err}</p>`);
  }
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

    // Salva/atualiza usuário no Firestore
    try {
      await db.collection("users").doc(user.uid).set({
        name: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.log("Erro salvando user:", err);
    }

    // Carrega perfil do localStorage
    loadProfileFromLocal();
  } else {
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");

    userStatus.textContent = "Usuário: visitante";
    userCard.classList.add("hidden");
  }
});

// =================== PERFIL (LOCAL) ===================
function loadProfileFromLocal() {
  const saved = JSON.parse(localStorage.getItem("motoraser_profile") || "{}");
  nameInput.value = saved.name || "";
  phoneInput.value = saved.phone || "";
}

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    name: nameInput.value.trim(),
    phone: phoneInput.value.trim()
  };
  localStorage.setItem("motoraser_profile", JSON.stringify(data));

  // se estiver logado, salva no Firestore também
  const user = auth.currentUser;
  if (user) {
    try {
      await db.collection("users").doc(user.uid).set({
        profile: data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      openModal("Erro", `<p class="muted">${err?.message || err}</p>`);
      return;
    }
  }

  openModal("Salvo ✅", `<p class="muted">Seu perfil foi salvo.</p>`);
});

btnClear.addEventListener("click", () => {
  localStorage.removeItem("motoraser_profile");
  nameInput.value = "";
  phoneInput.value = "";
  openModal("Limpo ✅", `<p class="muted">Dados do perfil apagados.</p>`);
});

// =================== CORRIDAS (SIMULADAS) ===================
function fakeRides() {
  return [
    { id: "1", title: "Corrida #1", from: "Centro", to: "Bairro A", eta: 6, demand: "Alta" },
    { id: "2", title: "Corrida #2", from: "Altamira", to: "Bairro B", eta: 9, demand: "Média" },
    { id: "3", title: "Corrida #3", from: "Orla", to: "Hospital", eta: 4, demand: "Alta" }
  ];
}

function demandTagClass(d) {
  const x = (d || "").toLowerCase();
  if (x.includes("alta")) return "high";
  if (x.includes("média") || x.includes("media")) return "mid";
  return "low";
}

function renderRides() {
  const rides = fakeRides();
  ridesEl.innerHTML = "";
  rides.forEach((r) => {
    const div = document.createElement("div");
    div.className = "ride";
    div.innerHTML = `
      <div>
        <div class="rideTitle">${r.title}</div>
        <div class="rideMeta">Origem: <b>${r.from}</b> → Destino: <b>${r.to}</b> • Chega em <b>${r.eta} min</b></div>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <span class="tag ${demandTagClass(r.demand)}">Demanda: ${r.demand}</span>
        <button class="btn ghost" data-ride="${r.id}">Detalhes</button>
      </div>
    `;
    ridesEl.appendChild(div);
  });

  // botão detalhes
  ridesEl.querySelectorAll("button[data-ride]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = fakeRides().find(x => x.id === btn.getAttribute("data-ride"));
      openModal("Detalhes da Corrida", `
        <p><b>${r.title}</b></p>
        <p class="muted">Origem: ${r.from}<br/>Destino: ${r.to}<br/>Chegada: ${r.eta} min<br/>Demanda: ${r.demand}</p>
      `);
    });
  });
}
renderRides();
btnRefreshRides.addEventListener("click", renderRides);

// =================== APOSTA CORRIDA (SIMULADOR) ===================
btnAposta.addEventListener("click", () => {
  openModal("Aposta Corrida", `
    <p class="muted">Aqui vai entrar o sistema de aposta (dinheiro virtual).</p>
    <p class="muted">Próximo passo: salvar apostas no Firestore.</p>
  `);
});

// =================== MAPA + LOCALIZAÇÃO ===================
let map;
let marker;

window.initMap = function initMap() {
  // inicia em Altamira como fallback
  const fallback = { lat: -3.2041, lng: -52.2111 };
  map = new google.maps.Map(document.getElementById("map"), {
    center: fallback,
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  });
  marker = new google.maps.Marker({ position: fallback, map });

  mapInfo.textContent = "Toque em “Minha localização”.";
};

function setLocation(lat, lng) {
  const pos = { lat, lng };
  map.setCenter(pos);
  map.setZoom(15);
  marker.setPosition(pos);

  locStatus.textContent = `Localização: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  mapInfo.textContent = "Localização carregada ✅";
}

btnLocate.addEventListener("click", () => {
  if (!navigator.geolocation) {
    openModal("Erro", `<p class="muted">Seu navegador não suporta localização.</p>`);
    return;
  }

  mapInfo.textContent = "Pegando sua localização...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setLocation(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      mapInfo.textContent = "Não foi possível pegar localização.";
      openModal("Localização bloqueada", `
        <p class="muted">Permita a localização no navegador e tente de novo.</p>
        <p class="muted">Detalhe: ${err?.message || err}</p>
      `);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
});

// botão perfil só dá foco no formulário
btnProfile.addEventListener("click", () => {
  nameInput.focus();
});
