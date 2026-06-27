import { ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { ensureFirebase } from "./firebase-app.js";
import {
  registerOnlineGame,
  getOnlineContext,
  leaveOnlineRoom,
  rematchOnlineRoom,
  openOnlineOnlyDuo,
} from "./online-duo.js";
import { startGameRoom } from "./room-service.js";
import { SHIPS, SHIP_IDS } from "./sky-shooter/ships.js";
import {
  createInitialState,
  stepSimulation,
  applyPlayerInput,
  cloneState,
} from "./sky-shooter/sim.js";
import { drawSkyFrame } from "./sky-shooter/render.js";

const $ = (sel) => document.querySelector(sel);

/** @type {object | null} */
let liveState = null;
/** @type {number | null} */
let rafId = null;
/** @type {number | null} */
let hostTimer = null;
/** @type {(() => void) | null} */
let inputUnsub = null;
/** @type {(() => void) | null} */
let stateUnsub = null;

let localInput = { x: 0.5, y: 0.9, weaponTap: false };
let pointerDown = false;
let lastInputSend = 0;
let hostSimState = null;
let hostInputs = { host: { x: 0.5, y: 0.9 }, guest: { x: 0.5, y: 0.12 } };
let resultShown = false;
/** @type {string | null} */
let activeRoomId = null;

function gameModeFromKey(key) {
  return key === "sky-coop" ? "coop" : "versus";
}

function bindSkyOnlineOnce() {
  if (bindSkyOnlineOnce.done) return;
  bindSkyOnlineOnce.done = true;

  $("#btn-sky-duo-coop")?.addEventListener("click", () =>
    openSkyDuo("sky-coop", "天空射擊 · 合作"),
  );
  $("#btn-sky-duo-versus")?.addEventListener("click", () =>
    openSkyDuo("sky-versus", "天空射擊 · 對戰"),
  );
  $("#btn-sky-duo-menu-back")?.addEventListener("click", () => {
    getOnlineContext().deps?.showView("home");
  });

  $("#btn-sky-online-play-back")?.addEventListener("click", async () => {
    if (confirm("離開戰鬥？")) {
      await teardownSession();
      await leaveOnlineRoom();
      getOnlineContext().deps?.showView("skyDuoMenu");
    }
  });
  $("#btn-sky-online-rematch")?.addEventListener("click", async () => {
    resultShown = false;
    await teardownSession();
    await rematchOnlineRoom();
  });
  $("#btn-sky-online-result-home")?.addEventListener("click", async () => {
    await teardownSession();
    await leaveOnlineRoom();
    getOnlineContext().deps?.showView("home");
  });
  $("#btn-sky-canvas-weapon")?.addEventListener("click", () => {
    localInput.weaponTap = true;
    void sendInputNow();
  });
}

export function openSkyDuoMenu() {
  getOnlineContext().deps?.showView("skyDuoMenu");
}

function openSkyDuo(game, title) {
  openOnlineOnlyDuo({
    game,
    title,
    backView: "skyDuoMenu",
    config: { mode: gameModeFromKey(game) },
  });
}

function skyHandler(gameKey, title) {
  return {
    startHint: "雙方選好機體並準備後，房主按開始",
    onEnterLobby: () => {
      void teardownSession();
      renderShipLobby(title);
    },
    onLeave: () => teardownSession(),
    renderStartButtons: (panel, snap, onStart) => {
      const hostShip = snap.players.host?.ship;
      const guestShip = snap.players.guest?.ship;
      const ready = hostShip && guestShip;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary btn-block";
      btn.textContent = ready ? "開始戰鬥" : "雙方需先選機體";
      btn.disabled = !ready;
      btn.addEventListener("click", () => onStart("host"));
      panel.innerHTML = "";
      panel.appendChild(btn);
    },
    startGame: async (roomId, _slot, snap) => {
      const mode = gameModeFromKey(gameKey);
      const ships = {
        host: snap.players.host?.ship || "swift",
        guest: snap.players.guest?.ship || "heavy",
      };
      const state = createInitialState(mode, ships);
      const { db } = await ensureFirebase();
      await set(ref(db, `rooms/${roomId}/inputs`), null);
      await startGameRoom(roomId, state);
    },
    onPlaying: (snap, ctx) => {
      resultShown = false;
      startSkySession(snap, ctx);
    },
  };
}

async function setPlayerShip(roomId, slot, shipId) {
  const { db } = await ensureFirebase();
  await update(ref(db, `rooms/${roomId}`), { [`players/${slot}/ship`]: shipId });
}

function renderShipLobby(title) {
  const panel = $("#online-lobby-sky-panel");
  const pick = $("#sky-lobby-ship-pick");
  if (!panel || !pick) return;
  panel.hidden = false;
  const ctx = getOnlineContext();
  const slot = ctx.slot;
  if (!slot) return;

  pick.innerHTML = "";
  const label = document.createElement("p");
  label.className = "sky-lobby-ship-label";
  label.textContent = `${title} · 選擇你的機體`;
  pick.appendChild(label);

  const row = document.createElement("div");
  row.className = "sky-ship-pick-row";
  SHIP_IDS.forEach((id) => {
    const s = SHIPS[id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sky-ship-card";
    btn.dataset.ship = id;
    btn.innerHTML = `<strong>${s.name}</strong><span>${s.tag}</span><small>速度×${s.speed} · ${s.lives}命</small>`;
    btn.addEventListener("click", async () => {
      if (!ctx.roomId || !slot) return;
      await setPlayerShip(ctx.roomId, slot, id);
      row.querySelectorAll(".sky-ship-card").forEach((el) => {
        el.classList.toggle("sky-ship-card-active", el.dataset.ship === id);
      });
    });
    row.appendChild(btn);
  });
  pick.appendChild(row);
}

async function teardownSession() {
  if (rafId) cancelAnimationFrame(rafId);
  if (hostTimer) clearInterval(hostTimer);
  rafId = null;
  hostTimer = null;
  inputUnsub?.();
  stateUnsub?.();
  inputUnsub = null;
  stateUnsub = null;
  liveState = null;
  hostSimState = null;
  pointerDown = false;
  activeRoomId = null;
  const panel = $("#online-lobby-sky-panel");
  if (panel) panel.hidden = true;
}

async function inputRef(roomId, slot) {
  const { db } = await ensureFirebase();
  return ref(db, `rooms/${roomId}/inputs/${slot}`);
}

function subscribeInputs(roomId, cb) {
  let unsub = () => {};
  ensureFirebase().then(({ db }) => {
    const r = ref(db, `rooms/${roomId}/inputs`);
    unsub = onValue(r, (snap) => cb(snap.val() || {}));
  });
  return () => unsub();
}

function startSkySession(snap, ctx) {
  if (activeRoomId === snap.roomId) return;
  activeRoomId = snap.roomId;
  resultShown = false;
  if (rafId) cancelAnimationFrame(rafId);
  if (hostTimer) clearInterval(hostTimer);
  inputUnsub?.();
  stateUnsub?.();
  rafId = null;
  hostTimer = null;
  inputUnsub = null;
  stateUnsub = null;
  hostSimState = null;
  ctx.deps.showView("skyOnlinePlay");

  const titleEl = $("#sky-online-title");
  if (titleEl) {
    titleEl.textContent =
      snap.meta?.game === "sky-coop" ? "天空射擊 · 合作" : "天空射擊 · 對戰";
  }
  const roomTag = $("#sky-online-room-tag");
  if (roomTag) roomTag.textContent = `房間 ${snap.roomId}`;

  const names = {
    host: snap.players.host?.name || "房主",
    guest: snap.players.guest?.name || "來賓",
  };

  liveState = snap.state;
  bindCanvasInput(ctx.slot, snap.state?.mode);
  renderLoop(ctx.slot, names);

  if (ctx.slot === "host") {
    hostSimState = cloneState(snap.state);
    hostInputs = {
      host: { x: hostSimState.players.host.x, y: hostSimState.players.host.y },
      guest: { x: hostSimState.players.guest.x, y: hostSimState.players.guest.y },
    };
    inputUnsub = subscribeInputs(snap.roomId, (inputs) => {
      if (inputs.host) hostInputs.host = { ...hostInputs.host, ...inputs.host };
      if (inputs.guest) hostInputs.guest = { ...hostInputs.guest, ...inputs.guest };
    });
    let acc = 0;
    let last = performance.now();
    const hostTick = async () => {
      if (!hostSimState) return;
      if (hostSimState.phase === "end") {
        if (!resultShown) {
          resultShown = true;
          showResult(hostSimState, ctx, names);
        }
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= 1 / 30) {
        applyPlayerInput(hostSimState, "host", hostInputs.host);
        applyPlayerInput(hostSimState, "guest", hostInputs.guest);
        stepSimulation(hostSimState, 1 / 30);
        acc -= 1 / 30;
      }
      liveState = hostSimState;
      const { db } = await ensureFirebase();
      await set(ref(db, `rooms/${snap.roomId}/state`), hostSimState);
    };
    hostTimer = setInterval(() => void hostTick(), 50);
  } else {
    ensureFirebase().then(({ db }) => {
      stateUnsub = onValue(ref(db, `rooms/${snap.roomId}/state`), (val) => {
        liveState = val.val();
        if (liveState?.phase === "end" && !resultShown) {
          resultShown = true;
          showResult(liveState, ctx, names);
        }
      });
    });
  }
}

function renderLoop(mySlot, names) {
  const canvas = /** @type {HTMLCanvasElement | null} */ ($("#sky-online-canvas"));
  if (!canvas) return;
  const ctx2d = canvas.getContext("2d");
  const wrap = canvas.parentElement;

  const frame = () => {
    if (!ctx2d || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (liveState) {
      drawSkyFrame(ctx2d, liveState, { w, h, mySlot, names });
    }
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

function bindCanvasInput(slot, mode) {
  const canvas = /** @type {HTMLCanvasElement | null} */ ($("#sky-online-canvas"));
  if (!canvas) return;
  const onPtr = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    localInput.x = x;
    if (mode === "versus") localInput.y = y;
    pointerDown = e.type !== "pointerup" && e.type !== "pointercancel";
    if (pointerDown) void sendInputNow();
  };
  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    onPtr(e);
  };
  canvas.onpointermove = (e) => {
    if (!pointerDown) return;
    onPtr(e);
  };
  canvas.onpointerup = canvas.onpointercancel = (e) => {
    pointerDown = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const moveLoop = () => {
    if (pointerDown) void sendInputNow();
    requestAnimationFrame(moveLoop);
  };
  requestAnimationFrame(moveLoop);

  localInput.y = slot === "host" ? 0.88 : mode === "versus" ? 0.12 : 0.9;
  localInput.x = slot === "host" ? 0.35 : 0.65;
}

async function sendInputNow() {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot) return;
  const now = Date.now();
  if (now - lastInputSend < 50) return;
  lastInputSend = now;
  const payload = {
    x: localInput.x,
    y: localInput.y,
    weaponTap: !!localInput.weaponTap,
    t: now,
  };
  localInput.weaponTap = false;
  await set(await inputRef(ctx.roomId, ctx.slot), payload);
  if (ctx.slot === "host" && hostInputs) {
    hostInputs.host = { ...hostInputs.host, ...payload };
  }
}

function showResult(state, ctx, names) {
  if (rafId) cancelAnimationFrame(rafId);
  if (hostTimer) clearInterval(hostTimer);
  rafId = null;
  hostTimer = null;

  ctx.deps.showView("skyOnlineResult");
  const title = $("#sky-online-result-title");
  const detail = $("#sky-online-result-detail");

  if (state.mode === "coop") {
    if (title) title.textContent = state.endReason === "win" ? "關卡通過！" : "任務失敗";
    if (detail) {
      detail.textContent =
        state.endReason === "win"
          ? `總分 ${state.teamScore} · ${names.host} & ${names.guest} 合作成功`
          : `總分 ${state.teamScore} · 兩位都沒命了`;
    }
  } else {
    const me = ctx.slot;
    if (title) {
      title.textContent =
        state.winner === me ? "你贏了！" : state.winner ? "對手獲勝" : "平手！";
    }
    if (detail) {
      const bossLine = state.bossKillCredit
        ? ` · Boss 最後一擊 +15（${names[state.bossKillCredit]}）`
        : "";
      detail.textContent = `${names.host} ${state.scores.host} : ${state.scores.guest} ${names.guest}${bossLine}`;
    }
  }
}

export function initSkyOnline() {
  bindSkyOnlineOnce();
  registerOnlineGame("sky-coop", skyHandler("sky-coop", "天空射擊 · 合作"));
  registerOnlineGame("sky-versus", skyHandler("sky-versus", "天空射擊 · 對戰"));
}
