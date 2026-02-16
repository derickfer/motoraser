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

// =================== HELPERS ===================
const $ = (id) => document.getElementById(id);

// =================== ELEMENTOS ===================
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

// =================== PERFIL (LOCAL) ===================
function saveProfileLocal(data) {
  localStorage.setItem("motoraser_profile", JSON.stringify(data));
}
function loadProfileLocal() {
  return JSON.parse(localStorage.getItem("motoraser_profile") || "{}");
}
function setFormFromProfile(p) {
  nameInput.value = p?.name || "";
  phoneInput.value = p?.phone || "";
}

// =================== PERFIL (FIRESTORE) ===================
async function loadProfileFromFirestore(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return data.profile || null;
}

async function saveProfileToFirestore(uid, profile) {
  await db.collection("users").doc(uid).set(
    {
      profile,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

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

    // salva dados base do user
    try {
      await db.collection("users").doc(user.uid).set(
        {
          name: user.displayName || "",
          email: user.email || "",
          photoURL: user.photoURL || "",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      openModal(
        "Firestore bloqueou 😬",
        `<p class="muted">Não consegui salvar o usuário no Firestore.</p>
         <p class="muted"><b>Erro:</b> ${err?.message || err}</p>
         <p class="muted">Isso é regra do Firestore. Eu te digo como liberar já já.</p>`
      );
    }

    // 🔥 carrega perfil do Firestore (prioridade)
    try {
      const fsProfile = await loadProfileFromFirestore(user.uid);
      if (fsProfile) {
        setFormFromProfile(fsProfile);
        saveProfileLocal(fsProfile); // espelha local também
      } else {
        // se não tiver no Firestore, usa o local
        setFormFromProfile(loadProfileLocal());
      }
    } catch (err) {
      // se falhar, usa local
      setFormFromProfile(loadProfileLocal());
    }
  } else {
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");

    userStatus.textContent = "Usuário: visitante";
    userCard.classList.add("hidden");

    // visitante usa só local
    setFormFromProfile(loadProfileLocal());
  }
});

// =================== SALVAR PERFIL ===================
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const profile = {
    name: nameInput.value.trim(),
    phone: phoneInput.value.trim()
  };

  // sempre salva local (mesmo sem login)
  saveProfileLocal(profile);

  // se estiver logado, salva no Firestore (NÚVEM)
  const user = auth.currentUser;
  if (user) {
    try {
      await saveProfileToFirestore(user.uid, profile);
      openModal("Salvo na NUVEM ✅", `
        <p class="muted">Seu perfil foi salvo no Firebase (Firestore).</p>
        <p class="muted"><b>users/${user.uid}/profile</b></p>
      `);
      return;
    } catch (err) {
      openModal("Não salvou no Firebase 😬", `
        <p class="muted">Salvei no navegador, mas o Firebase bloqueou.</p>
        <p class="muted"><b>Erro:</b> ${err?.message || err}</p>
        <p class="muted">Isso é regra do Firestore. A gente ajusta e fica 100%.</p>
      `);
      return;
    }
  }

  openModal("Salvo local ✅", `<p class="muted">Você está como visitante. Entre com Google pra salvar na nuvem.</p>`);
});

btnClear.addEventListener("click", async () => {
  localStorage.removeItem("motoraser_profile");
  setFormFromProfile({ name: "", phone: "" });

  const user = auth.currentUser;
  if (user) {
    try {
      await saveProfileToFirestore(user.uid, { name: "", phone: "" });
    } catch (e) {}
  }

  openModal("Limpo ✅", `<p class="muted">Perfil apagado (local e, se logado, no Firebase).</p>`);
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

// =================== APOSTA (SIMULADOR) ===================
btnAposta.addEventListener("click", () => {
  openModal("Aposta Corrida", `
    <p class="muted">Aqui vai entrar o sistema de aposta (dinheiro virtual).</p>
    <p class="muted">Primeiro vamos deixar corridas reais no Firestore.</p>
  `);
});

// =================== MAPA + LOCALIZAÇÃO ===================
let map;
let marker;

window.initMap = function initMap() {
  const fallback = { lat: -3.2041, lng: -52.2111 }; // Altamira
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
    (pos) => setLocation(pos.coords.latitude, pos.coords.longitude),
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

btnProfile.addEventListener("click", () => nameInput.focus());
