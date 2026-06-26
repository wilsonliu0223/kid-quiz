import { isFirebaseConfigured, ensureFirebase } from "./firebase-app.js";
import {
  createRoom,
  joinRoom,
  subscribeRoom,
  leaveRoom,
  setPlayerReady,
  getRoomSnapshot,
  clearGuestSlot,
  getOnlineSession,
  returnRoomToLobby,
} from "./room-service.js";
import { getChildName } from "./children.js";

/** @typedef {'host' | 'guest'} RoomSlot */

/**
 * @typedef {object} OnlineDuoDeps
 * @property {(name: string) => void} showView
 * @property {() => string} getSelectedChild
 * @property {(title: string, sub?: string) => void} showWarn
 * @property {() => unknown[]} [getZhBank]
 * @property {() => string} [getLessonFilter]
 */

/**
 * @typedef {object} DuoModeRequest
 * @property {string} game
 * @property {string} title
 * @property {string} backView
 * @property {() => void} localStart
 * @property {object} [config]
 */

/**
 * @typedef {object} OnlineContext
 * @property {string | null} roomId
 * @property {RoomSlot | null} slot
 * @property {OnlineDuoDeps} deps
 */

/** @type {OnlineDuoDeps | null} */
let deps = null;

/** @type {DuoModeRequest | null} */
let pendingMode = null;

/** @type {Map<string, object>} */
const gameHandlers = new Map();

/** @type {(() => void) | null} */
let roomUnsub = null;

/** @type {string | null} */
let activeRoomId = null;

/** @type {RoomSlot | null} */
let mySlot = null;

const $ = (sel) => document.querySelector(sel);

/** @param {string} game @param {object} handler */
export function registerOnlineGame(game, handler) {
  gameHandlers.set(game, handler);
}

/** @returns {OnlineContext} */
export function getOnlineContext() {
  return {
    roomId: activeRoomId,
    slot: mySlot,
    deps: /** @type {OnlineDuoDeps} */ (deps),
  };
}

/** @param {unknown} err */
export function formatOnlineError(err) {
  const code =
    typeof err === "object" && err && "code" in err
      ? String(/** @type {{ code?: string }} */ (err).code)
      : "";
  const cause =
    typeof err === "object" && err && "cause" in err
      ? /** @type {{ cause?: { code?: string, message?: string } }} */ (err).cause
      : null;
  const causeCode = cause?.code || "";

  const map = {
    ROOM_NOT_FOUND: "找不到這個房間碼（請確認房主還在等候室、房間碼正確）",
    ROOM_FULL:
      "房間已有另一位玩家（可能是上次測試殘留）。請房主在等候室按「清除來賓重試」，或房主離開後重建房間。",
    ROOM_EXPIRED: "房間已過期，請房主重新建立",
    ROOM_ID_INVALID: "房間碼格式不正確",
    FIREBASE_NOT_CONFIGURED: "尚未設定 Firebase，請見 docs/firebase-setup.md",
    FIREBASE_AUTH_FAILED:
      "無法連線 Firebase（請確認已啟用「匿名登入」，並重新整理再試）",
  };
  if (map[code]) return map[code];

  if (
    code === "permission-denied" ||
    code === "PERMISSION_DENIED" ||
    causeCode === "permission-denied"
  ) {
    return "權限被拒：請到 Firebase → Authentication 啟用「匿名」，並在 Realtime Database → 規則 發布 rooms 規則。";
  }
  if (causeCode === "auth/operation-not-allowed") {
    return "請到 Firebase → Authentication → 登入方式 → 啟用「匿名」。";
  }
  if (causeCode === "auth/network-request-failed") {
    return "網路連線失敗，請檢查 Wi‑Fi 或行動網路後再試。";
  }

  const detail = cause?.message || (err instanceof Error ? err.message : "");
  return detail ? `加入失敗：${detail}` : "加入房間失敗，請稍後再試。";
}

function activeChildName() {
  return getChildName(deps?.getSelectedChild?.() || "A");
}

function activeChildId() {
  return deps?.getSelectedChild?.() || "A";
}

function stopRoomListener() {
  roomUnsub?.();
  roomUnsub = null;
}

const GAME_TITLES = {
  gomoku: "五子棋",
  "flip-zh": "國語翻字",
  "math-open": "數學攤牌",
  "math-flip": "數學翻牌",
  "math-guess": "猜數字",
};

/**
 * @param {DuoModeRequest} req
 */
export function openDuoModePicker(req) {
  pendingMode = req;
  const titleEl = $("#duo-mode-title");
  const subEl = $("#duo-mode-sub");
  const headerEl = $("#duo-mode-header");
  if (titleEl) titleEl.textContent = req.title;
  if (headerEl) headerEl.textContent = req.title;
  if (subEl) subEl.textContent = "同一台裝置，或兩台手機用房間碼連線";
  deps?.showView("duoMode");
}

function showFirebaseSetupHint() {
  deps?.showWarn?.(
    "尚未設定 Firebase",
    "請用 Google 帳號登入 Firebase 主控台完成設定，並把網頁設定貼到 js/config.site.js。詳見 docs/firebase-setup.md。"
  );
}

function enterOnlineFlow() {
  if (!pendingMode) return;
  if (!isFirebaseConfigured()) {
    showFirebaseSetupHint();
    deps?.showView("onlineFirebaseSetup");
    return;
  }
  const nameEl = $("#online-player-name");
  const gameEl = $("#online-room-game-label");
  if (nameEl) nameEl.textContent = activeChildName();
  if (gameEl) gameEl.textContent = pendingMode.title;
  deps?.showView("onlineRoomEntry");
}

async function onCreateRoom() {
  if (!pendingMode) return;
  try {
    await ensureFirebase();
    const roomId = await createRoom(
      pendingMode.game,
      activeChildName(),
      activeChildId(),
      pendingMode.config || null
    );
    activeRoomId = roomId;
    mySlot = "host";
    openLobby(roomId);
  } catch (err) {
    console.error("createRoom failed", err);
    alert(formatOnlineError(err).replace(/^加入/, "建立"));
  }
}

async function onJoinRoom() {
  const input = /** @type {HTMLInputElement | null} */ ($("#online-room-join-input"));
  const code = input?.value?.trim() || "";
  if (!/^\d{4}$/.test(code)) {
    alert("請輸入 4 位數房間碼");
    return;
  }
  try {
    await ensureFirebase();
    const joined = await joinRoom(code, activeChildName(), activeChildId());
    activeRoomId = joined;
    mySlot = getOnlineSession()?.slot || "guest";
    const snap = await getRoomSnapshot(joined);
    if (snap?.meta?.game) {
      pendingMode = {
        game: snap.meta.game,
        title: GAME_TITLES[snap.meta.game] || snap.meta.game,
        backView: "home",
        localStart: () => {},
        config: snap.meta.config,
      };
    }
    openLobby(joined);
  } catch (err) {
    console.error("joinRoom failed", err);
    alert(formatOnlineError(err));
  }
}

function renderLobby(snapshot) {
  const codeEl = $("#online-lobby-code");
  const statusEl = $("#online-lobby-status");
  const hostEl = $("#online-lobby-host");
  const guestEl = $("#online-lobby-guest");
  const readyBtn = $("#btn-online-lobby-ready");
  const startPanel = $("#online-lobby-start-panel");
  const startHint = $("#online-lobby-start-hint");
  const startPick = $("#online-lobby-start-pick");
  const kickBtn = $("#btn-online-lobby-kick-guest");
  const gameLabel = $("#online-lobby-game");

  if (!snapshot) {
    if (statusEl) statusEl.textContent = "房間已關閉";
    return;
  }

  const handler = gameHandlers.get(snapshot.meta?.game || "");
  if (gameLabel) gameLabel.textContent = pendingMode?.title || snapshot.meta?.game || "對戰";
  if (codeEl) codeEl.textContent = snapshot.roomId;

  const host = snapshot.players.host;
  const guest = snapshot.players.guest;
  if (hostEl) {
    hostEl.textContent = host
      ? `${host.name}${host.ready ? " · 已準備" : ""}`
      : "（無）";
  }
  if (guestEl) {
    guestEl.textContent = guest
      ? `${guest.name}${guest.ready ? " · 已準備" : ""}`
      : "等待另一位加入…";
  }

  const bothReady = !!(host?.ready && guest?.ready);
  if (statusEl) {
    statusEl.textContent = bothReady
      ? "雙方已準備，房主可開始對局"
      : guest
        ? "請雙方按「我準備好了」"
        : "請把房間碼告訴對方，等候加入";
  }

  const me = mySlot === "host" ? host : guest;
  if (readyBtn) {
    readyBtn.textContent = me?.ready ? "取消準備" : "我準備好了";
    readyBtn.disabled = !me;
  }

  const showStart = mySlot === "host" && bothReady && snapshot.meta.status === "lobby";
  if (startPanel) startPanel.hidden = !showStart;
  if (kickBtn) {
    kickBtn.hidden = !(mySlot === "host" && guest && snapshot.meta.status === "lobby");
  }
  if (startHint && handler?.startHint) {
    startHint.textContent = handler.startHint;
  }
  if (startPick && showStart && handler?.renderStartButtons) {
    startPick.innerHTML = "";
    handler.renderStartButtons(startPick, snapshot, (slot) => onHostStart(slot));
  }
}

function openLobby(roomId) {
  stopRoomListener();
  activeRoomId = roomId;
  mySlot = getOnlineSession()?.slot || mySlot;
  deps?.showView("onlineLobby");
  roomUnsub = subscribeRoom(roomId, onRoomSnapshot);
}

async function onToggleReady() {
  if (!activeRoomId || !mySlot) return;
  const snap = await getRoomSnapshot(activeRoomId);
  const me = mySlot === "host" ? snap?.players.host : snap?.players.guest;
  await setPlayerReady(activeRoomId, mySlot, !me?.ready);
}

function onRoomSnapshot(snapshot) {
  if (!snapshot) {
    renderLobby(null);
    return;
  }

  if (snapshot.meta?.status === "playing" && snapshot.state) {
    const handler = gameHandlers.get(snapshot.meta.game || "");
    handler?.onPlaying?.(snapshot, getOnlineContext());
    return;
  }

  deps?.showView("onlineLobby");
  renderLobby(snapshot);
}

/** @param {RoomSlot} slot */
async function onHostStart(slot) {
  if (!activeRoomId || mySlot !== "host" || !pendingMode) return;
  const handler = gameHandlers.get(pendingMode.game);
  if (!handler?.startGame) return;
  try {
    const snap = await getRoomSnapshot(activeRoomId);
    if (!snap) return;
    await handler.startGame(activeRoomId, slot, snap);
  } catch (err) {
    console.error(err);
    alert("開始對局失敗");
  }
}

export async function leaveOnlineRoom() {
  stopRoomListener();
  if (activeRoomId && mySlot) {
    try {
      await leaveRoom(activeRoomId, mySlot);
    } catch (err) {
      console.error(err);
    }
  }
  activeRoomId = null;
  mySlot = null;
}

/** 同房間再來一局：回到等候室，保留房間碼 */
export async function rematchOnlineRoom() {
  if (!activeRoomId) return;
  try {
    await returnRoomToLobby(activeRoomId);
  } catch (err) {
    console.error("rematchOnlineRoom failed", err);
    alert("無法回到等候室，請稍後再試");
  }
}

async function onKickGuest() {
  if (!activeRoomId || mySlot !== "host") return;
  if (!confirm("清除來賓位子？對方需重新輸入房間碼加入。")) return;
  try {
    await clearGuestSlot(activeRoomId);
  } catch (err) {
    console.error(err);
    alert("無法清除來賓，請離開房間後重建。");
  }
}

function bindOnlineDuoEvents() {
  $("#btn-duo-mode-local")?.addEventListener("click", () => {
    pendingMode?.localStart?.();
  });
  $("#btn-duo-mode-online")?.addEventListener("click", () => enterOnlineFlow());

  $("#btn-duo-mode-back")?.addEventListener("click", () => {
    const back = pendingMode?.backView || "home";
    pendingMode = null;
    deps?.showView(back);
  });

  $("#btn-online-firebase-setup-back")?.addEventListener("click", () =>
    deps?.showView("duoMode")
  );
  $("#btn-online-room-entry-back")?.addEventListener("click", () =>
    deps?.showView("duoMode")
  );
  $("#btn-online-create-room")?.addEventListener("click", () => onCreateRoom());
  $("#btn-online-join-room")?.addEventListener("click", () => onJoinRoom());

  $("#btn-online-lobby-back")?.addEventListener("click", async () => {
    if (confirm("離開房間？")) {
      await leaveOnlineRoom();
      deps?.showView("onlineRoomEntry");
    }
  });
  $("#btn-online-lobby-ready")?.addEventListener("click", () => onToggleReady());
  $("#btn-online-lobby-kick-guest")?.addEventListener("click", () => onKickGuest());
}

/**
 * @param {OnlineDuoDeps} d
 */
export function initOnlineDuo(d) {
  deps = d;
  bindOnlineDuoEvents();

  const session = getOnlineSession();
  if (session?.roomId && isFirebaseConfigured()) {
    activeRoomId = session.roomId;
    mySlot = session.slot;
    getRoomSnapshot(session.roomId)
      .then((snap) => {
        if (!snap) {
          void leaveOnlineRoom();
          return;
        }
        if (snap?.meta?.game) {
          pendingMode = {
            game: snap.meta.game,
            title: GAME_TITLES[snap.meta.game] || snap.meta.game,
            backView: "home",
            localStart: () => {},
            config: snap.meta.config,
          };
        }
        openLobby(session.roomId);
      })
      .catch((err) => {
        console.warn("resume online room failed", err);
        void leaveOnlineRoom();
      });
  }
}
