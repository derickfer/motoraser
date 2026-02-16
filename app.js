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
const btnProfile = $("btnProfile");

const userStatus = $("userStatus");
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

const challengeHint = $("challengeHint");
const challengeCreateBox = $("challengeCreateBox");
const challengeDest = $("challengeDest");
const btnCreateChallenge = $("btnCreateChallenge");
const btnRefreshChallenges = $("btnRefreshChallenges");
const challengesEl = $("challenges");

// Modal
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
function randInt(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// =================== PERFIL LOCAL ===================
function saveProfileLocal(data){ localStorage.setItem("motoraser_profile", JSON.stringify(data)); }
function loadProfileLocal(){ return JSON.parse(localStorage.getItem("motoraser_profile") || "{}"); }
function setFormFromProfile(p){ nameInput.value = p?.name || ""; phoneInput.value = p?.phone || ""; }

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

    const p = loadProfileLocal();
    setFormFromProfile(p);

    challengeCreateBox.classList.remove("hidden");
    challengeHint.textContent = "Crie um desafio ou aceite um que estiver aberto.";

    startChallengesListener();
  } else {
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");
    userStatus.textContent = "Usuário: visitante";

    userCard.classList.add("hidden");
    setFormFromProfile(loadProfileLocal());

    challengeCreateBox.classList.add("hidden");
    challengeHint.textContent = "Entre com Google pra criar/aceitar.";
    stopChallengesListener();
    renderChallenges([]);
  }
});

// =================== PERFIL ===================
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const profile = { name: nameInput.value.trim(), phone: phoneInput.value.trim() };
  saveProfileLocal(profile);
  openModal("Salvo ✅", `<p class="muted">Perfil salvo no seu navegador.</p>`);
});

btnClear.addEventListener("click", () => {
  localStorage.removeItem("motoraser_profile");
  setFormFromProfile({ name:"", phone:"" });
  openModal("Limpo ✅", `<p class="muted">Perfil apagado.</p>`);
});

btnProfile.addEventListener("click", () => nameInput.focus());

// =================== DESAFIOS (SIMULADOR) ===================
let challengesUnsub = null;
function stopChallengesListener(){ if (challengesUnsub) challengesUnsub(); challengesUnsub = null; }

function startChallengesListener(){
  stopChallengesListener();
  challengesUnsub = db.collection("challenges")
    .orderBy("createdAt", "desc")
    .limit(50)
    .onSnapshot(
      (snap) => renderChallenges(snap.docs),
      (err) => openModal("Erro", `<p class="muted">${err?.message || err}</p>`)
    );
}

btnRefreshChallenges.addEventListener("click", () => startChallengesListener());

btnCreateChallenge.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return openModal("Login", `<p class="muted">Entre com Google primeiro.</p>`);

  const dest = challengeDest.value.trim();
  if (!dest) return openModal("Destino obrigatório", `<p class="muted">Digite o destino do desafio.</p>`);

  btnCreateChallenge.disabled = true;
  btnCreateChallenge.textContent = "Criando...";

  try {
    await db.collection("challenges").add({
      status: "open",
      destination: dest,

      createdByUid: user.uid,
      createdByName: user.displayName || "Sem nome",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),

      acceptedByUid: null,
      acceptedByName: null,
      acceptedAt: null,

      // simulação
      startAt: null,
      durationMsCreator: null,
      durationMsOpponent: null,

      // controle manual
      manualFinishByUid: null,
      manualFinishReason: null,

      winnerUid: null,
      winnerName: null,
      finishedAt: null
    });

    challengeDest.value = "";
    openModal("Criado ✅", `<p class="muted">Desafio criado! Agora alguém pode aceitar.</p>`);
  } catch (e) {
    openModal("Erro", `<p class="muted">${e?.message || e}</p>`);
  } finally {
    btnCreateChallenge.disabled = false;
    btnCreateChallenge.textContent = "⚡ Criar desafio";
  }
});

function renderChallenges(docs){
  const me = auth.currentUser ? auth.currentUser.uid : null;
  challengesEl.innerHTML = "";

  const list = docs.map(d => ({ id:d.id, ...d.data() }));

  if (list.length === 0) {
    challengesEl.innerHTML = `<div class="muted">Nenhum desafio por enquanto.</div>`;
    return;
  }

  list.forEach((c) => {
    const isMine = me && c.createdByUid === me;
    const isOpponent = me && c.acceptedByUid === me;

    const statusTag =
      c.status === "open" ? `<span class="tag open">Aberto</span>` :
      c.status === "accepted" ? `<span class="tag accepted">Aceito</span>` :
      c.status === "running" ? `<span class="tag accepted">Rolando</span>` :
      `<span class="tag done">Finalizado</span>`;

    const mineTag = isMine ? `<span class="tag mine">Meu</span>` : "";

    const canAccept = me && !isMine && c.status === "open";
    const canStart = me && (isMine || isOpponent) && (c.status === "accepted");
    const canWatch = me && (isMine || isOpponent) && (c.status === "running");
    const canForceFinish = me && (isMine || isOpponent) && (c.status === "running"); // NOVO
    const canSeeResult = c.status === "finished";

    const acceptBtn = canAccept ? `<button class="btn primary" data-action="accept" data-id="${c.id}">✅ Aceitar</button>` : "";
    const startBtn = canStart ? `<button class="btn primary" data-action="start" data-id="${c.id}">🏁 Começar</button>` : "";
    const watchBtn = canWatch ? `<button class="btn" data-action="watch" data-id="${c.id}">👀 Ver corrida</button>` : "";
    const forceBtn = canForceFinish ? `<button class="btn danger" data-action="forcefinish" data-id="${c.id}">🏁 Finalizar agora</button>` : "";
    const resultBtn = canSeeResult ? `<button class="btn" data-action="result" data-id="${c.id}">🏆 Resultado</button>` : "";

    const acceptedInfo = (c.status === "open")
      ? `<div class="rideMeta">Adversário: <b>—</b></div>`
      : `<div class="rideMeta">Adversário: <b>${escapeHtml(c.acceptedByName || "—")}</b></div>`;

    const winnerInfo = (c.status === "finished")
      ? `<div class="rideMeta">Vencedor: <b>${escapeHtml(c.winnerName || "—")}</b></div>`
      : "";

    const div = document.createElement("div");
    div.className = "ride";
    div.innerHTML = `
      <div>
        <div class="rideTitle">🏍️ Desafio</div>
        <div class="rideMeta">Criador: <b>${escapeHtml(c.createdByName || "—")}</b></div>
        ${acceptedInfo}
        <div class="rideMeta">Destino: <b>${escapeHtml(c.destination || "—")}</b></div>
        <div class="rideMeta">${escapeHtml(fmtTime(c.createdAt))}</div>
        ${winnerInfo}
      </div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
        <div class="tagsRow">${statusTag}${mineTag}</div>
        ${acceptBtn}
        ${startBtn}
        ${watchBtn}
        ${forceBtn}
        ${resultBtn}
      </div>
    `;
    challengesEl.appendChild(div);
  });

  challengesEl.querySelectorAll("button[data-action='accept']").forEach((b) => {
    b.addEventListener("click", async () => acceptChallenge(b.getAttribute("data-id")));
  });
  challengesEl.querySelectorAll("button[data-action='start']").forEach((b) => {
    b.addEventListener("click", async () => startChallenge(b.getAttribute("data-id")));
  });
  challengesEl.querySelectorAll("button[data-action='watch']").forEach((b) => {
    b.addEventListener("click", async () => watchChallenge(b.getAttribute("data-id")));
  });
  challengesEl.querySelectorAll("button[data-action='forcefinish']").forEach((b) => {
    b.addEventListener("click", async () => forceFinishConfirm(b.getAttribute("data-id")));
  });
  challengesEl.querySelectorAll("button[data-action='result']").forEach((b) => {
    b.addEventListener("click", async () => showResult(b.getAttribute("data-id")));
  });
}

async function acceptChallenge(id){
  const user = auth.currentUser;
  if (!user) return openModal("Login", `<p class="muted">Entre com Google.</p>`);

  const ref = db.collection("challenges").doc(id);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Desafio não existe.");
      const c = snap.data();

      if (c.status !== "open") throw new Error("Esse desafio já foi aceito.");
      if (c.createdByUid === user.uid) throw new Error("Você não pode aceitar o seu próprio desafio.");

      tx.update(ref, {
        status: "accepted",
        acceptedByUid: user.uid,
        acceptedByName: user.displayName || "Sem nome",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    openModal("Aceito ✅", `<p class="muted">Agora vocês podem apertar <b>Começar</b>.</p>`);
  } catch (e) {
    openModal("Erro", `<p class="muted">${e?.message || e}</p>`);
  }
}

async function startChallenge(id){
  const user = auth.currentUser;
  if (!user) return openModal("Login", `<p class="muted">Entre com Google.</p>`);

  const ref = db.collection("challenges").doc(id);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Desafio não existe.");
      const c = snap.data();

      if (c.status !== "accepted") throw new Error("Só dá pra começar quando estiver ACEITO.");

      const can = (c.createdByUid === user.uid) || (c.acceptedByUid === user.uid);
      if (!can) throw new Error("Sem permissão.");

      const durCreator = randInt(25000, 60000);
      const durOpp = randInt(25000, 60000);

      tx.update(ref, {
        status: "running",
        startAt: firebase.firestore.FieldValue.serverTimestamp(),
        durationMsCreator: durCreator,
        durationMsOpponent: durOpp
      });
    });

    openModal("Valendo! 🏁", `<p class="muted">Corrida iniciada (simulador). Clique em <b>Ver corrida</b> ou <b>Finalizar agora</b>.</p>`);
  } catch (e) {
    openModal("Erro", `<p class="muted">${e?.message || e}</p>`);
  }
}

// =================== FINALIZAR MANUAL ===================
async function forceFinishConfirm(id){
  const user = auth.currentUser;
  if (!user) return openModal("Login", `<p class="muted">Entre com Google.</p>`);

  openModal(
    "Finalizar agora?",
    `
      <p class="muted">Isso vai encerrar a corrida mesmo sem “chegar”.</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
        <button id="ff_me" class="btn primary">Eu ganhei</button>
        <button id="ff_other" class="btn">Outro ganhou</button>
        <button id="ff_cancel" class="btn ghost">Cancelar</button>
      </div>
    `
  );

  setTimeout(() => {
    const meBtn = document.getElementById("ff_me");
    const otherBtn = document.getElementById("ff_other");
    const cancelBtn = document.getElementById("ff_cancel");

    if (cancelBtn) cancelBtn.onclick = closeModal;

    if (meBtn) meBtn.onclick = async () => {
      closeModal();
      await forceFinish(id, "me");
    };
    if (otherBtn) otherBtn.onclick = async () => {
      closeModal();
      await forceFinish(id, "other");
    };
  }, 0);
}

async function forceFinish(id, winnerPick){
  const user = auth.currentUser;
  const ref = db.collection("challenges").doc(id);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Desafio não existe.");
      const c = snap.data();

      if (c.status !== "running") throw new Error("Só dá pra finalizar quando estiver ROLANDO.");

      const isCreator = c.createdByUid === user.uid;
      const isOpponent = c.acceptedByUid === user.uid;
      if (!isCreator && !isOpponent) throw new Error("Sem permissão.");

      let winnerUid = null;
      let winnerName = "—";

      if (winnerPick === "me") {
        winnerUid = user.uid;
        winnerName = user.displayName || "Sem nome";
      } else {
        const otherUid = isCreator ? c.acceptedByUid : c.createdByUid;
        const otherName = isCreator ? c.acceptedByName : c.createdByName;
        if (!otherUid) throw new Error("Não tem adversário ainda.");
        winnerUid = otherUid;
        winnerName = otherName || "—";
      }

      tx.update(ref, {
        status: "finished",
        manualFinishByUid: user.uid,
        manualFinishReason: "manual_button",
        winnerUid,
        winnerName,
        finishedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    openModal("Finalizado ✅", `<p class="muted">Corrida encerrada. Veja em <b>Resultado</b>.</p>`);
  } catch (e) {
    openModal("Erro", `<p class="muted">${e?.message || e}</p>`);
  }
}

// =================== “VER CORRIDA” (SIMULADOR) ===================
let liveTimer = null;

async function watchChallenge(id){
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }

  const ref = db.collection("challenges").doc(id);

  const snap = await ref.get();
  if (!snap.exists) return openModal("Ops", `<p class="muted">Desafio não encontrado.</p>`);
  const c = snap.data();

  if (c.status !== "running") return openModal("Ainda não", `<p class="muted">Esse desafio não está rolando.</p>`);

  const start = c.startAt?.toDate ? c.startAt.toDate().getTime() : Date.now();
  const durA = Number(c.durationMsCreator || 40000);
  const durB = Number(c.durationMsOpponent || 42000);

  openModal(
    "Corrida ao vivo (simulador)",
    `
      <p class="muted">Destino: <b>${escapeHtml(c.destination || "")}</b></p>

      <div style="margin-top:12px;">
        <div class="rideMeta">Criador: <b>${escapeHtml(c.createdByName || "—")}</b></div>
        <div class="progressWrap"><div id="barA" class="progressBar"></div></div>
        <div class="rideMeta" id="txtA">0%</div>
      </div>

      <div style="margin-top:14px;">
        <div class="rideMeta">Adversário: <b>${escapeHtml(c.acceptedByName || "—")}</b></div>
        <div class="progressWrap"><div id="barB" class="progressBar"></div></div>
        <div class="rideMeta" id="txtB">0%</div>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
        <button id="finishNow" class="btn danger">🏁 Finalizar agora</button>
      </div>

      <p class="tiny muted" style="margin-top:12px;">
        *Simulador. Não depende de corrida real na rua.
      </p>
    `
  );

  // botão dentro do modal
  setTimeout(() => {
    const finishNow = document.getElementById("finishNow");
    if (finishNow) finishNow.onclick = async () => {
      closeModal();
      await forceFinishConfirm(id);
    };
  }, 0);

  const barA = document.getElementById("barA");
  const barB = document.getElementById("barB");
  const txtA = document.getElementById("txtA");
  const txtB = document.getElementById("txtB");

  liveTimer = setInterval(async () => {
    const now = Date.now();
    const pA = Math.min(1, (now - start) / durA);
    const pB = Math.min(1, (now - start) / durB);

    const pctA = Math.floor(pA * 100);
    const pctB = Math.floor(pB * 100);

    if (barA) barA.style.width = pctA + "%";
    if (barB) barB.style.width = pctB + "%";
    if (txtA) txtA.textContent = pctA + "%";
    if (txtB) txtB.textContent = pctB + "%";

    if (pA >= 1 || pB >= 1) {
      clearInterval(liveTimer);
      liveTimer = null;

      const winnerIsCreator = durA <= durB;
      await finishChallengeAuto(id, winnerIsCreator);
    }
  }, 350);
}

async function finishChallengeAuto(id, winnerIsCreator){
  const ref = db.collection("challenges").doc(id);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Desafio não existe.");
      const c = snap.data();

      if (c.status !== "running") return; // já finalizou

      const winnerUid = winnerIsCreator ? c.createdByUid : c.acceptedByUid;
      const winnerName = winnerIsCreator ? c.createdByName : c.acceptedByName;

      tx.update(ref, {
        status: "finished",
        manualFinishByUid: null,
        manualFinishReason: null,
        winnerUid: winnerUid || null,
        winnerName: winnerName || "—",
        finishedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    openModal("🏆 Resultado", `<p class="muted">A simulação terminou. Abra o card e clique em <b>Resultado</b>.</p>`);
  } catch (e) {
    openModal("Erro", `<p class="muted">${e?.message || e}</p>`);
  }
}

async function showResult(id){
  const snap = await db.collection("challenges").doc(id).get();
  if (!snap.exists) return openModal("Ops", `<p class="muted">Não achei esse desafio.</p>`);
  const c = snap.data();

  if (c.status !== "finished") return openModal("Ainda não", `<p class="muted">Esse desafio não terminou.</p>`);

  const manual = c.manualFinishReason ? `<p class="muted small">Finalizado manualmente ✅</p>` : "";

  openModal(
    "🏆 Resultado do desafio",
    `
      <p class="muted">Destino: <b>${escapeHtml(c.destination || "")}</b></p>
      <p class="muted">Criador: <b>${escapeHtml(c.createdByName || "—")}</b></p>
      <p class="muted">Adversário: <b>${escapeHtml(c.acceptedByName || "—")}</b></p>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,.10);margin:12px 0;">
      <p class="muted">Vencedor: <b>${escapeHtml(c.winnerName || "—")}</b></p>
      ${manual}
      <p class="muted small">Finalizado em: ${escapeHtml(fmtTime(c.finishedAt))}</p>
    `
  );
}
