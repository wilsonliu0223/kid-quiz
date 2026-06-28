import { ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { ensureFirebase } from "./firebase-app.js";
import {
  registerOnlineGame,
  getOnlineContext,
  leaveOnlineRoom,
  rematchOnlineRoom,
  openOnlineOnlyDuo,
  refreshOnlineLobby,
} from "./online-duo.js";
import { startGameRoom } from "./room-service.js";
import { SHIPS, SHIP_IDS, shipLobbyCardHtml } from "./sky-shooter/ships.js?v=sky-duo-v42";
import {
  createInitialState,
  stepSimulation,
  applyPlayerInput,
  cloneState,
  pointerToWorld,
  clampPlayersToZone,
  canPlayerControl,
  setNetworkLagComp,
  clearNetworkLagComp,
  applyCoopLagCompPositions,
  reconcileGuestShadowState,
  createGuestInterpSnap,
  pickGuestInterpPair,
  applyGuestInterpVisual,
  tickGuestParticles,
  tickGuestLocalCombat,
  advanceGuestOwnedBullets,
  VERSUS_GUEST_Y_BAND,
} from "./sky-shooter/sim.js?v=sky-duo-v42";
import { drawSkyFrame } from "./sky-shooter/render.js?v=sky-duo-v42";
import { normalizeSkyState, isValidSkyState } from "./sky-shooter/state-util.js?v=sky-duo-v42";

const SKY_BUILD = "v42";
const HOST_TICK_MS = 16;
const HOST_TICK_DT = HOST_TICK_MS / 1000;
const INPUT_SEND_MS = 0;
const GUEST_INPUT_LEAD_MS = 150;
const GUEST_RENDER_DELAY_MS = 90;
const GUEST_INTERP_BUFFER_MAX = 16;

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

/** 螢幕正規化座標 [0,1]（勿存世界座標，避免來賓 y 被重複翻轉） */
let localInput = { x: 0.5, y: 0.9, weaponTap: false };
let pointerDown = false;
let lastInputSend = 0;
let hostSimState = null;
let hostInputs = { host: { x: 0.35, y: 0.84 }, guest: { x: 0.65, y: 0.12 } };
let guestInputVel = { vx: 0, vy: 0 };
let guestInputPrev = { x: 0.65, y: 0.12, t: 0 };
let hostStateWriteBusy = false;
let guestStateRecvAt = Date.now();
/** @type {object[]} */
let guestInterpBuffer = [];
/** @type {object | null} */
let pendingInputPayload = null;
let inputSendFlight = false;
let inputSendSeq = 0;
/** @type {import('firebase/database').DatabaseReference | null} */
let cachedInputRef = null;
/** @type {object | null} */
let pendingHostState = null;
/** @type {string | null} */
let pendingHostRoomId = null;
/** @type {object | null} */
let guestShadowState = null;
let guestShadowLastFrame = 0;
let resultShown = false;
/** @type {string | null} */
let activeRoomId = null;
let sessionRunning = false;
/** @type {'coop'|'versus'} */
let activeSkyMode = "coop";

function gameModeFromKey(key) {
  return key === "sky-coop" ? "coop" : "versus";
}

function bindSkyOnlineOnce() {
  if (bindSkyOnlineOnce.done) return;
  bindSkyOnlineOnce.done = true;

  $("#btn-sky-duo-solo")?.addEventListener("click", () => {
    window.location.href = "prototypes/sky-stage1.html?v=sky-stage1-v9";
  });
  $("#btn-sky-duo-solo2")?.addEventListener("click", () => {
    window.location.href = "prototypes/sky-stage2.html?v=sky-stage2-v6";
  });
  $("#btn-sky-duo-solo3")?.addEventListener("click", () => {
    window.location.href = "prototypes/sky-stage3.html?v=sky-stage3-v1";
  });
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
    stopSkyGameLoop();
    resetShipLobby();
    await rematchOnlineRoom();
  });
  $("#btn-sky-online-result-home")?.addEventListener("click", async () => {
    await teardownSession();
    await leaveOnlineRoom();
    getOnlineContext().deps?.showView("home");
  });
  $("#btn-sky-hud-weapon")?.addEventListener("click", () => {
    if (!myPlayerCanControl()) return;
    localInput.weaponTap = true;
    const ctx = getOnlineContext();
    applyLocalPointerInput(ctx.slot, liveState?.mode || activeSkyMode);
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

function ensureStateMode(state, fallback) {
  if (!state) return state;
  if (!state.mode) state.mode = fallback;
  return state;
}

function skyHandler(gameKey, title) {
  return {
    startHint: "雙方選好機體並準備後，房主按開始",
    onEnterLobby: (snap) => {
      resultShown = false;
      stopSkyGameLoop();
      ensureShipLobby(title, snap);
    },
    onLeave: () => teardownSession(),
    renderStartButtons: (panel, snap, onStart) => {
      const hostShip = snap.players.host?.ship;
      const guestShip = snap.players.guest?.ship;
      const bothShips = !!(hostShip && guestShip);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary btn-block";
      if (bothShips) {
        btn.textContent = "開始戰鬥";
      } else if (!hostShip && !guestShip) {
        btn.textContent = "雙方需先選機體";
      } else if (!hostShip) {
        btn.textContent = "等待房主選機體";
      } else {
        btn.textContent = "等待來賓選機體";
      }
      btn.disabled = !bothShips;
      btn.addEventListener("click", () => onStart("host"));
      panel.innerHTML = "";
      panel.appendChild(btn);
    },
    startGame: async (roomId, _slot, snap) => {
      const mode = gameModeFromKey(gameKey);
      activeSkyMode = mode;
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
      if (!isValidSkyState(snap.state)) return;
      normalizeSkyState(snap.state);
      ensureStateMode(snap.state, gameModeFromKey(gameKey));
      activeSkyMode = snap.state.mode;

      const names = {
        host: snap.players.host?.name || "房主",
        guest: snap.players.guest?.name || "來賓",
      };

      if (snap.state.phase === "end") {
        if (!resultShown) showResult(snap.state, ctx, names);
        return;
      }

      resultShown = false;

      if (sessionRunning && activeRoomId === snap.roomId) {
        liveState = snap.state;
        ensureStateMode(liveState, activeSkyMode);
        if (ctx.slot === "guest" && isValidSkyState(snap.state)) {
          onGuestAuthorityState(normalizeSkyState(snap.state), ctx.slot);
        }
        return;
      }
      ctx.deps.showView("skyOnlinePlay");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => startSkySession(snap, ctx));
      });
    },
  };
}

async function setPlayerShip(roomId, slot, shipId) {
  const { db } = await ensureFirebase();
  await update(ref(db, `rooms/${roomId}`), { [`players/${slot}/ship`]: shipId });
}

function resetShipLobby() {
  const pick = $("#sky-lobby-ship-pick");
  if (pick) {
    pick.innerHTML = "";
    delete pick.dataset.built;
  }
}

function syncShipLobbyFromSnap(snap) {
  const slot = getOnlineContext().slot;
  if (!slot || !snap?.players) return;
  const myShip = snap.players[slot]?.ship;
  document.querySelectorAll(".sky-ship-card").forEach((el) => {
    el.classList.toggle("sky-ship-card-active", !!(myShip && el.dataset.ship === myShip));
  });
}

function ensureShipLobby(title, snap) {
  const panel = $("#online-lobby-sky-panel");
  const pick = $("#sky-lobby-ship-pick");
  if (!panel || !pick) return;
  panel.hidden = false;
  const ctx = getOnlineContext();
  if (!ctx.slot) return;

  if (pick.dataset.built !== "1") {
    pick.innerHTML = "";
    const label = document.createElement("p");
    label.className = "sky-lobby-ship-label";
    label.textContent = `${title} · 選擇你的機體`;
    pick.appendChild(label);

    const row = document.createElement("div");
    row.className = "sky-ship-pick-row";
    SHIP_IDS.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `sky-ship-card sky-ship-card-${id}`;
      btn.dataset.ship = id;
      btn.innerHTML = shipLobbyCardHtml(id);
      btn.addEventListener("click", () => {
        const live = getOnlineContext();
        if (!live.roomId || !live.slot) return;
        row.querySelectorAll(".sky-ship-card").forEach((el) => {
          el.classList.toggle("sky-ship-card-active", el.dataset.ship === id);
        });
        void setPlayerShip(live.roomId, live.slot, id)
          .then(() => refreshOnlineLobby())
          .catch((err) => {
            console.error("setPlayerShip failed", err);
            alert("選機失敗，請檢查網路後再試");
          });
      });
      row.appendChild(btn);
    });
    pick.appendChild(row);
    pick.dataset.built = "1";
  }

  if (snap) syncShipLobbyFromSnap(snap);
}

function stopSkyGameLoop() {
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
  guestInputVel = { vx: 0, vy: 0 };
  guestInputPrev = { x: 0.65, y: 0.12, t: 0 };
  hostStateWriteBusy = false;
  guestInterpBuffer = [];
  pendingInputPayload = null;
  inputSendFlight = false;
  inputSendSeq = 0;
  cachedInputRef = null;
  pendingHostState = null;
  pendingHostRoomId = null;
  guestShadowState = null;
  guestShadowLastFrame = 0;
  guestStateRecvAt = Date.now();
  activeRoomId = null;
  sessionRunning = false;
}

async function teardownSession() {
  stopSkyGameLoop();
  resetShipLobby();
  const panel = $("#online-lobby-sky-panel");
  if (panel) panel.hidden = true;
}

async function inputRef(roomId, slot) {
  if (cachedInputRef) return cachedInputRef;
  const { db } = await ensureFirebase();
  cachedInputRef = ref(db, `rooms/${roomId}/inputs/${slot}`);
  return cachedInputRef;
}

function pushGuestInterpBuffer(state) {
  guestInterpBuffer.push(createGuestInterpSnap(state));
  guestStateRecvAt = Date.now();
  while (guestInterpBuffer.length > GUEST_INTERP_BUFFER_MAX) {
    guestInterpBuffer.shift();
  }
}

function onGuestAuthorityState(next, mySlot) {
  pushGuestInterpBuffer(next);
  liveState = next;
  if (!guestShadowState) {
    guestShadowState = cloneState(next);
  } else {
    reconcileGuestShadowState(guestShadowState, next, mySlot);
  }
  guestShadowLastFrame = performance.now();
  clampPlayersToZone(liveState);
}

function tickGuestShadowFrame(mySlot, mode) {
  if (!guestShadowState || !mySlot) return null;
  try {
    const now = performance.now();
    const dt = Math.min(0.033, (now - guestShadowLastFrame) / 1000 || 0.016);
    guestShadowLastFrame = now;

    const pair = pickGuestInterpPair(guestInterpBuffer, GUEST_RENDER_DELAY_MS);
    applyGuestInterpVisual(guestShadowState, pair, mySlot);
    tickGuestParticles(guestShadowState, dt);

    const me = guestShadowState.players[mySlot];
    const canMove = me && canPlayerControl(guestShadowState, mySlot);
    if (canMove) {
      const world = pointerToWorld(mySlot, mode, localInput.x, localInput.y);
      applyPlayerInput(guestShadowState, mySlot, world);
      tickGuestLocalCombat(guestShadowState, mySlot, dt);
      advanceGuestOwnedBullets(guestShadowState, mySlot, dt);
    } else if (liveState?.players?.[mySlot]) {
      const ap = liveState.players[mySlot];
      me.x = ap.x;
      me.y = ap.y;
      guestShadowState.bullets = guestShadowState.bullets.filter((b) => b.owner !== mySlot);
    }

    clampPlayersToZone(guestShadowState);
    return guestShadowState;
  } catch (err) {
    console.error("guest shadow tick failed", err);
    return liveState;
  }
}

function queueHostStateWrite(roomId, state) {
  pendingHostRoomId = roomId;
  pendingHostState = state;
  flushHostStateWrite();
}

function flushHostStateWrite() {
  if (hostStateWriteBusy || !pendingHostState || !pendingHostRoomId) return;
  const roomId = pendingHostRoomId;
  const state = pendingHostState;
  pendingHostState = null;
  hostStateWriteBusy = true;
  ensureFirebase()
    .then(({ db }) => set(ref(db, `rooms/${roomId}/state`), state))
    .catch((err) => console.error("sky state sync failed", err))
    .finally(() => {
      hostStateWriteBusy = false;
      if (pendingHostState) flushHostStateWrite();
    });
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
  if (!isValidSkyState(snap.state)) return;
  if (snap.state.phase === "end") return;
  if (sessionRunning && activeRoomId === snap.roomId) return;

  resultShown = false;
  normalizeSkyState(snap.state);
  activeSkyMode = snap.state.mode || gameModeFromKey(snap.meta?.game || "sky-coop");
  ensureStateMode(snap.state, activeSkyMode);

  activeRoomId = snap.roomId;
  sessionRunning = true;

  if (rafId) cancelAnimationFrame(rafId);
  if (hostTimer) clearInterval(hostTimer);
  inputUnsub?.();
  stateUnsub?.();
  rafId = null;
  hostTimer = null;
  inputUnsub = null;
  stateUnsub = null;

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
  const playMode = liveState.mode || activeSkyMode;
  bindCanvasInput(ctx.slot, playMode);
  void primeInputRef(snap.roomId, ctx.slot);
  renderLoop(names);
  void sendInputNow();

  if (ctx.slot === "host") {
    hostSimState = cloneState(snap.state);
    hostInputs = {
      host: { x: hostSimState.players.host.x, y: hostSimState.players.host.y },
      guest: { x: hostSimState.players.guest.x, y: hostSimState.players.guest.y },
    };
    inputUnsub = subscribeInputs(snap.roomId, (inputs) => {
      if (inputs.host && canPlayerControl(hostSimState, "host")) {
        hostInputs.host = {
          ...hostInputs.host,
          x: Number(inputs.host.x),
          y: Number(inputs.host.y),
          weaponTap: !!inputs.host.weaponTap,
        };
      }
      if (inputs.guest && canPlayerControl(hostSimState, "guest")) {
        const nx = Number(inputs.guest.x);
        const ny = Number(inputs.guest.y);
        const nt = Number(inputs.guest.t) || Date.now();
        if (guestInputPrev.t > 0) {
          const dtSec = Math.max(0.02, (nt - guestInputPrev.t) / 1000);
          guestInputVel = {
            vx: (nx - guestInputPrev.x) / dtSec,
            vy: (ny - guestInputPrev.y) / dtSec,
          };
        }
        guestInputPrev = { x: nx, y: ny, t: nt };
        hostInputs.guest = {
          ...hostInputs.guest,
          x: nx,
          y: ny,
          weaponTap: !!inputs.guest.weaponTap,
          t: nt,
        };
      }
    });

    const runHostTick = () => {
      if (!hostSimState) return;
      try {
        if (hostSimState.phase === "end") {
          if (!resultShown) {
            resultShown = true;
            showResult(hostSimState, ctx, names);
          }
          return;
        }
        if (canPlayerControl(hostSimState, "host")) {
          applyPlayerInput(hostSimState, "host", hostInputs.host);
          hostInputs.host.weaponTap = false;
        }
        if (canPlayerControl(hostSimState, "guest")) {
          applyPlayerInput(hostSimState, "guest", hostInputs.guest);
          hostInputs.guest.weaponTap = false;
        }
        setNetworkLagComp(hostSimState, {
          guest: {
            x: hostInputs.guest.x,
            y: hostInputs.guest.y,
            vx: guestInputVel.vx,
            vy: guestInputVel.vy,
            t: hostInputs.guest.t || Date.now(),
            extraMs: GUEST_INPUT_LEAD_MS,
          },
        });
        applyCoopLagCompPositions(hostSimState);
        stepSimulation(hostSimState, HOST_TICK_DT);
        clearNetworkLagComp(hostSimState);
        liveState = hostSimState;
        queueHostStateWrite(snap.roomId, hostSimState);
      } catch (err) {
        console.error("host tick failed", err);
      }
    };

    void runHostTick();
    hostTimer = setInterval(runHostTick, HOST_TICK_MS);
  } else {
    guestShadowState = cloneState(snap.state);
    guestInterpBuffer = [createGuestInterpSnap(snap.state)];
    guestShadowLastFrame = performance.now();
    ensureFirebase().then(({ db }) => {
      stateUnsub = onValue(ref(db, `rooms/${snap.roomId}/state`), (val) => {
        const next = val.val();
        if (isValidSkyState(next)) {
          const normalized = normalizeSkyState(next);
          onGuestAuthorityState(normalized, ctx.slot);
        }
        if (liveState?.phase === "end") {
          if (!resultShown) {
            resultShown = true;
            showResult(liveState, ctx, names);
          }
          return;
        }
      });
    });
  }
}

function drawSkyPlaceholder(ctx2d, w, h, msg) {
  const grad = ctx2d.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#1a2848");
  grad.addColorStop(0.45, "#243858");
  grad.addColorStop(1, "#1e3028");
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(0, 0, w, h);
  if (msg && w > 0 && h > 0) {
    ctx2d.fillStyle = "rgba(255,255,255,0.85)";
    ctx2d.font = "14px sans-serif";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    ctx2d.fillText(msg, w / 2, h / 2);
  }
}

function getCanvasDims(canvas, wrap) {
  let w = wrap?.clientWidth || 0;
  let h = wrap?.clientHeight || 0;
  if (w <= 0 || h <= 0) {
    const rect = canvas.getBoundingClientRect();
    w = rect.width || 0;
    h = rect.height || 0;
  }
  if (w <= 0 || h <= 0) {
    const header = $("#view-sky-online-play .quiz-header-sky");
    const controls = $(".sky-online-controls");
    const headerH = header?.getBoundingClientRect().height || 48;
    const ctrlH = controls?.getBoundingClientRect().height || 88;
    w = window.innerWidth;
    h = Math.max(280, window.innerHeight - headerH - ctrlH - 16);
  }
  return { w, h };
}

function updateDebugStatus(w, h, state) {
  const el = $("#sky-debug-status");
  if (!el) return;
  const enemies = state?.enemies?.length ?? "?";
  const phase = state?.phase || "—";
  const buf = guestInterpBuffer.length;
  el.textContent = `${SKY_BUILD} · ${Math.round(w)}×${Math.round(h)} · 敵${enemies} · ${phase} · buf${buf}`;
}

const WEAPON_HUD = { straight: "直射彈", spread: "擴散彈", laser: "雷射" };

function updateSkyHud(mySlot, hudState = liveState) {
  const p = hudState?.players?.[mySlot];
  const can = !!(p && hudState && canPlayerControl(hudState, mySlot));
  const btnWeapon = $("#btn-sky-hud-weapon");
  if (!btnWeapon) return;
  if (!p || !can) {
    btnWeapon.textContent = "直射彈";
    btnWeapon.disabled = true;
    $("#btn-sky-hud-missile")?.setAttribute("disabled", "");
    return;
  }
  btnWeapon.disabled = false;
  btnWeapon.textContent = WEAPON_HUD[p.weapon] || "直射彈";
  btnWeapon.classList.toggle("sky-hud-active", p.weapon !== "straight");
  btnWeapon.classList.toggle("sky-hud-laser", p.weapon === "laser");

  const btnMissile = $("#btn-sky-hud-missile");
  if (btnMissile) {
    if (p.missileT > 0) {
      btnMissile.disabled = false;
      btnMissile.textContent = `導彈 ${Math.ceil(p.missileT)}s`;
      btnMissile.classList.add("sky-hud-active");
    } else {
      btnMissile.disabled = true;
      btnMissile.textContent = "導彈";
      btnMissile.classList.remove("sky-hud-active");
    }
  }
}

function renderLoop(names) {
  const canvas = /** @type {HTMLCanvasElement | null} */ ($("#sky-online-canvas"));
  if (!canvas) return;
  const ctx2d = canvas.getContext("2d");
  const wrap = canvas.parentElement;

  const frame = () => {
    try {
      if (!ctx2d) return;
      const { w, h } = getCanvasDims(canvas, wrap);
      if (w > 0 && h > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
          canvas.width = Math.floor(w * dpr);
          canvas.height = Math.floor(h * dpr);
          ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        if (liveState && isValidSkyState(liveState)) {
          const mySlot = getOnlineContext().slot;
          const mode = liveState.mode || activeSkyMode;
          const frameState =
            mySlot === "guest" ? tickGuestShadowFrame(mySlot, mode) || liveState : liveState;
          normalizeSkyState(frameState);
          ensureStateMode(frameState, activeSkyMode);
          if (mySlot !== "guest") clampPlayersToZone(frameState);
          try {
            drawSkyFrame(ctx2d, frameState, {
              w,
              h,
              mySlot,
              mode,
              names,
            });
            updateSkyHud(mySlot, frameState);
            updateCanvasInputLock(mySlot);
          } catch (err) {
            console.error("drawSkyFrame failed", err);
            drawSkyPlaceholder(ctx2d, w, h, `繪圖錯誤 ${SKY_BUILD}`);
            updateDebugStatus(w, h, null);
          }
        } else {
          drawSkyPlaceholder(ctx2d, w, h, "連線同步中…");
          updateDebugStatus(w, h, null);
        }
      }
    } catch (err) {
      console.error("sky render frame failed", err);
    } finally {
      rafId = requestAnimationFrame(frame);
    }
  };
  rafId = requestAnimationFrame(frame);
}

function myPlayerCanControl() {
  const slot = getOnlineContext().slot;
  if (!slot || !liveState) return false;
  return canPlayerControl(liveState, slot);
}

function updateCanvasInputLock(mySlot) {
  const canvas = $("#sky-online-canvas");
  const wrap = $("#sky-canvas-wrap");
  const overlay = $("#sky-dead-overlay");
  const can = myPlayerCanControl();
  if (canvas) canvas.classList.toggle("sky-canvas-locked", !can);
  if (wrap) wrap.classList.toggle("sky-canvas-dead", !can && !!liveState);
  if (overlay) overlay.hidden = can || !liveState;
}

function applyLocalPointerInput(slot, mode) {
  if (!slot) return;
  const clamped = pointerToWorld(slot, mode, localInput.x, localInput.y);
  const payload = {
    x: clamped.x,
    y: clamped.y,
    weaponTap: !!localInput.weaponTap,
  };
  if (slot === "host" && hostSimState && canPlayerControl(hostSimState, slot)) {
    if (hostInputs) {
      hostInputs[slot] = { ...hostInputs[slot], x: payload.x, y: payload.y };
    }
    applyPlayerInput(hostSimState, slot, payload);
    clampPlayersToZone(hostSimState);
    liveState = hostSimState;
  }
  // 來賓不直接改 liveState，避免畫面超前於房主碰撞判定
}

function bindCanvasInput(slot, mode) {
  const canvas = /** @type {HTMLCanvasElement | null} */ ($("#sky-online-canvas"));
  if (!canvas) return;

  const onPtr = (e) => {
    if (!myPlayerCanControl()) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    localInput.x = x;
    localInput.y = y;
    pointerDown = e.type !== "pointerup" && e.type !== "pointercancel";
    applyLocalPointerInput(slot, mode);
    if (pointerDown) void sendInputNow();
  };

  canvas.onpointerdown = (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    onPtr(e);
  };
  canvas.onpointermove = (e) => {
    if (!pointerDown) return;
    e.preventDefault();
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
    if (pointerDown && myPlayerCanControl()) {
      void sendInputNow(true);
    }
    requestAnimationFrame(moveLoop);
  };
  requestAnimationFrame(moveLoop);

  if (mode === "versus" && slot === "guest") {
    const worldY =
      VERSUS_GUEST_Y_BAND[0] + (VERSUS_GUEST_Y_BAND[1] - VERSUS_GUEST_Y_BAND[0]) * 0.5;
    localInput.y = 1 - worldY;
    localInput.x = 0.65;
  } else if (mode === "versus") {
    localInput.y = 0.84;
    localInput.x = 0.35;
  } else {
    localInput.y = 0.84;
    localInput.x = slot === "host" ? 0.35 : 0.65;
  }
}

async function primeInputRef(roomId, slot) {
  try {
    await inputRef(roomId, slot);
  } catch (err) {
    console.error("primeInputRef failed", err);
  }
}

function flushInputSend() {
  if (inputSendFlight || !pendingInputPayload) return;
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot) return;

  const payload = pendingInputPayload;
  pendingInputPayload = null;
  inputSendFlight = true;

  ensureFirebase()
    .then(({ db }) => {
      const r = cachedInputRef || ref(db, `rooms/${ctx.roomId}/inputs/${ctx.slot}`);
      cachedInputRef = r;
      return set(r, payload);
    })
    .then(() => {
      if (hostInputs && ctx.slot) {
        hostInputs[ctx.slot] = {
          ...hostInputs[ctx.slot],
          x: payload.x,
          y: payload.y,
          t: payload.t,
        };
      }
    })
    .catch((err) => console.error("sky input sync failed", err))
    .finally(() => {
      inputSendFlight = false;
      if (pendingInputPayload) flushInputSend();
    });
}

function sendInputNow(force = false) {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot) return;
  if (!myPlayerCanControl()) return;
  const now = Date.now();
  if (!force && !pointerDown && INPUT_SEND_MS > 0 && now - lastInputSend < INPUT_SEND_MS) return;
  lastInputSend = now;
  const mode = liveState?.mode || activeSkyMode;
  const world = pointerToWorld(ctx.slot, mode, localInput.x, localInput.y);
  inputSendSeq += 1;
  pendingInputPayload = {
    x: world.x,
    y: world.y,
    weaponTap: !!localInput.weaponTap,
    t: now,
    seq: inputSendSeq,
  };
  localInput.weaponTap = false;
  flushInputSend();
}

function showResult(state, ctx, names) {
  if (resultShown && sessionRunning === false && rafId === null) return;
  resultShown = true;
  stopSkyGameLoop();
  pointerDown = false;

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
      const elimLine =
        state.endReason === "elim"
          ? state.winner === null
            ? " · 雙方陣亡，比總分"
            : " · 擊落對手"
          : "";
      detail.textContent = `${names.host} ${state.scores.host} : ${state.scores.guest} ${names.guest}${bossLine}${elimLine}`;
    }
  }
}

export function initSkyOnline() {
  bindSkyOnlineOnce();
  registerOnlineGame("sky-coop", skyHandler("sky-coop", "天空射擊 · 合作"));
  registerOnlineGame("sky-versus", skyHandler("sky-versus", "天空射擊 · 對戰"));
}
