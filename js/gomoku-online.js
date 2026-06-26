import { forbiddenLabel, wouldBlackForbidden } from "./gomoku-renju.js?v=gomoku-v2";
import {
  resetGomokuBoardZoom,
  rebindGomokuBoardZoom,
  shouldSuppressGomokuCellTap,
} from "./gomoku-board-zoom.js";
import { isFirebaseConfigured, ensureFirebase } from "./firebase-app.js";
import {
  createRoom,
  joinRoom,
  subscribeRoom,
  leaveRoom,
  setPlayerReady,
  startGomokuRoom,
  transactGomoku,
  getOnlineSession,
  getRoomSnapshot,
  clearGuestSlot,
} from "./room-service.js";
import { beginGomokuLocal } from "./gomoku.js?v=gomoku-online-v6";
import { getChildName } from "./children.js";

const BOARD_SIZE = 15;

/** @typedef {'host' | 'guest'} RoomSlot */

/**
 * @typedef {object} OnlineDeps
 * @property {(name: string) => void} showView
 * @property {() => string} getSelectedChild
 * @property {(title: string, sub?: string) => void} showWarn
 */

/** @type {OnlineDeps | null} */
let deps = null;

/** @type {(() => void) | null} */
let roomUnsub = null;

/** @type {string | null} */
let activeRoomId = null;

/** @type {RoomSlot | null} */
let mySlot = null;

/**
 * @typedef {object} OnlineGame
 * @property {(''|RoomSlot)[][]} cells
 * @property {RoomSlot} blackPlayerId
 * @property {RoomSlot} currentPlayerId
 * @property {boolean} over
 * @property {RoomSlot|null} winner
 * @property {[number, number]|null} lastMove
 * @property {Set<number>|null} winLine
 * @property {{ host: string, guest: string }} names
 */

/** @type {OnlineGame | null} */
let onlineGame = null;

const $ = (sel) => document.querySelector(sel);

/** @param {unknown} err */
function formatOnlineError(err) {
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

function otherSlot(slot) {
  return slot === "host" ? "guest" : "host";
}

function slotName(slot) {
  if (!onlineGame) return slot === "host" ? "房主" : "來賓";
  return onlineGame.names[slot] || (slot === "host" ? "房主" : "來賓");
}

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => "")
  );
}

function decodeCells(str) {
  const cells = emptyBoard();
  const s = String(str || "").padEnd(225, ".");
  for (let i = 0; i < 225; i++) {
    const ch = s[i];
    const row = Math.floor(i / BOARD_SIZE);
    const col = i % BOARD_SIZE;
    if (ch === "h") cells[row][col] = "host";
    else if (ch === "g") cells[row][col] = "guest";
  }
  return cells;
}

function encodeCells(cells) {
  let out = "";
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const v = cells[r][c];
      if (v === "host") out += "h";
      else if (v === "guest") out += "g";
      else out += ".";
    }
  }
  return out;
}

function checkWin(cells, row, col, player) {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of dirs) {
    const line = [[row, col]];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (
        r >= 0 &&
        r < BOARD_SIZE &&
        c >= 0 &&
        c < BOARD_SIZE &&
        cells[r][c] === player
      ) {
        line.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 5) {
      return new Set(line.map(([r, c]) => r * BOARD_SIZE + c));
    }
  }
  return null;
}

function hasFiveWin(cells, row, col, player) {
  return !!checkWin(cells, row, col, player);
}

function boardFull(cells) {
  return cells.every((row) => row.every((cell) => cell !== ""));
}

function stoneLabel(slot) {
  return slot === onlineGame?.blackPlayerId ? "黑子" : "白子";
}

function stopRoomListener() {
  roomUnsub?.();
  roomUnsub = null;
}

function activeChildName() {
  const id = deps?.getSelectedChild?.() || "A";
  return getChildName(id);
}

function activeChildId() {
  return deps?.getSelectedChild?.() || "A";
}

function showFirebaseSetupHint() {
  deps?.showWarn?.(
    "尚未設定 Firebase",
    "請用 Google 帳號登入 Firebase 主控台完成設定，並把網頁設定貼到 js/config.site.js 的 FIREBASE 欄位。詳細步驟見專案 docs/firebase-setup.md（或 GitHub 倉庫同路徑）。"
  );
}

function enterOnlineFlow() {
  if (!isFirebaseConfigured()) {
    showFirebaseSetupHint();
    deps?.showView("gomokuFirebaseSetup");
    return;
  }
  const nameEl = $("#gomoku-online-player-name");
  if (nameEl) nameEl.textContent = activeChildName();
  deps?.showView("gomokuRoomEntry");
}

async function onCreateRoom() {
  try {
    await ensureFirebase();
    const roomId = await createRoom("gomoku", activeChildName(), activeChildId());
    activeRoomId = roomId;
    mySlot = "host";
    openLobby(roomId);
  } catch (err) {
    console.error("createRoom failed", err);
    alert(formatOnlineError(err).replace(/^加入/, "建立"));
  }
}

async function onJoinRoom() {
  const input = /** @type {HTMLInputElement | null} */ ($("#gomoku-room-join-input"));
  const code = input?.value?.trim() || "";
  if (!/^\d{4}$/.test(code)) {
    alert("請輸入 4 位數房間碼");
    return;
  }
  try {
    await ensureFirebase();
    await joinRoom(code, activeChildName(), activeChildId());
    activeRoomId = code;
    mySlot = getOnlineSession()?.slot || "guest";
    openLobby(code);
  } catch (err) {
    console.error("joinRoom failed", err);
    alert(formatOnlineError(err));
  }
}

function renderLobby(snapshot) {
  const codeEl = $("#gomoku-lobby-code");
  const statusEl = $("#gomoku-lobby-status");
  const hostEl = $("#gomoku-lobby-host");
  const guestEl = $("#gomoku-lobby-guest");
  const readyBtn = $("#btn-gomoku-lobby-ready");
  const startPanel = $("#gomoku-lobby-start-panel");
  const blackPick = $("#gomoku-lobby-black-pick");
  const kickBtn = $("#btn-gomoku-lobby-kick-guest");

  if (!snapshot) {
    if (statusEl) statusEl.textContent = "房間已關閉";
    return;
  }

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
  if (blackPick && showStart) {
    blackPick.innerHTML = "";
    const mkBtn = (slot, label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-secondary gomoku-lobby-black-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => onHostStart(slot));
      blackPick.appendChild(btn);
    };
    mkBtn("host", `${host?.name || "房主"} 執黑`);
    mkBtn("guest", `${guest?.name || "來賓"} 執黑`);
  }
}

function openLobby(roomId) {
  stopRoomListener();
  activeRoomId = roomId;
  mySlot = getOnlineSession()?.slot || mySlot;
  deps?.showView("gomokuLobby");
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

  if (snapshot.meta?.status === "playing" && snapshot.gomoku) {
    const onPlay =
      $("#view-gomoku-online-play")?.classList.contains("view-active") ||
      $("#view-gomoku-online-result")?.classList.contains("view-active");
    if (!onPlay) {
      enterOnlinePlay(snapshot);
    } else {
      applyRemoteGomoku(snapshot);
    }
    return;
  }

  renderLobby(snapshot);
}

async function onHostStart(blackSlot) {
  if (!activeRoomId || mySlot !== "host") return;
  try {
    await startGomokuRoom(activeRoomId, blackSlot);
  } catch (err) {
    console.error(err);
    alert("開始對局失敗");
  }
}

function applyRemoteGomoku(snapshot) {
  const g = snapshot.gomoku;
  if (!g) return;

  const names = {
    host: snapshot.players.host?.name || "房主",
    guest: snapshot.players.guest?.name || "來賓",
  };

  onlineGame = {
    cells: decodeCells(g.cells),
    blackPlayerId: g.blackPlayerId,
    currentPlayerId: g.currentPlayerId,
    over: !!g.over,
    winner: g.winner || null,
    lastMove: g.lastMove || null,
    winLine: g.winLine
      ? new Set(g.winLine.map((n) => Number(n)))
      : null,
    names,
  };

  renderOnlineBoard();

  if (
    g.over &&
    !$("#view-gomoku-online-result")?.classList.contains("view-active")
  ) {
    showOnlineResult();
  }
}

function enterOnlinePlay(snapshot) {
  if (!snapshot.gomoku) return;
  deps?.showView("gomokuOnlinePlay");
  const grid = $("#gomoku-online-board");
  if (grid) delete grid.dataset.built;
  rebindGomokuBoardZoom(
    "#gomoku-online-board-viewport",
    "#gomoku-online-board-stage"
  );
  resetGomokuBoardZoom();
  applyRemoteGomoku(snapshot);
}

function forbiddenAt(row, col) {
  if (!onlineGame || onlineGame.over || onlineGame.currentPlayerId !== onlineGame.blackPlayerId) {
    return null;
  }
  if (onlineGame.cells[row][col]) return null;
  const whiteId = otherSlot(onlineGame.blackPlayerId);
  return wouldBlackForbidden(
    onlineGame.cells,
    row,
    col,
    onlineGame.blackPlayerId,
    whiteId,
    hasFiveWin
  );
}

function getOnlineCellBtn(row, col) {
  const grid = $("#gomoku-online-board");
  return grid?.querySelector(`[data-row="${row}"][data-col="${col}"]`) || null;
}

function buildCellButton(row, col) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "gomoku-cell";
  btn.dataset.row = String(row);
  btn.dataset.col = String(col);
  return btn;
}

function applyOnlineCellState(btn, row, col) {
  if (!onlineGame || !btn) return;
  const cell = onlineGame.cells[row][col];
  const idx = row * BOARD_SIZE + col;

  btn.className = "gomoku-cell";
  btn.replaceChildren();
  btn.onclick = null;

  if (cell) {
    btn.classList.add("gomoku-cell-filled");
    btn.classList.add(
      cell === onlineGame.blackPlayerId ? "gomoku-stone-black" : "gomoku-stone-white"
    );
    btn.disabled = true;
    const stone = document.createElement("span");
    stone.className = "gomoku-stone";
    stone.setAttribute("aria-hidden", "true");
    btn.appendChild(stone);
    btn.setAttribute("aria-label", `${slotName(cell)} ${stoneLabel(cell)}`);
  } else {
    const myTurn = mySlot && onlineGame.currentPlayerId === mySlot && !onlineGame.over;
    btn.disabled = !myTurn;
    const forbidden = forbiddenAt(row, col);
    if (forbidden) {
      btn.classList.add("gomoku-cell-forbidden");
      btn.setAttribute("aria-label", `禁手：${forbiddenLabel(forbidden)}`);
      btn.onclick = () => alert(`不能下這裡：${forbiddenLabel(forbidden)}`);
    } else if (myTurn) {
      btn.setAttribute("aria-label", `第 ${row + 1} 行第 ${col + 1} 列`);
      btn.onclick = () => onOnlineCellClick(row, col);
    }
  }

  if (onlineGame.lastMove && onlineGame.lastMove[0] === row && onlineGame.lastMove[1] === col) {
    btn.classList.add("gomoku-cell-last");
  }
  if (onlineGame.winLine?.has(idx)) {
    btn.classList.add("gomoku-cell-win");
  }
}

function ensureOnlineBoardGrid() {
  const grid = $("#gomoku-online-board");
  if (!grid || !onlineGame) return null;
  if (grid.dataset.built === "1") return grid;
  grid.innerHTML = "";
  grid.style.setProperty("--gomoku-size", String(BOARD_SIZE));
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      grid.appendChild(buildCellButton(row, col));
    }
  }
  grid.dataset.built = "1";
  return grid;
}

function renderOnlinePlayHeader() {
  if (!onlineGame || onlineGame.over) return;
  const turn = $("#gomoku-online-turn-label");
  const blackTag = $("#gomoku-online-black-tag");
  const renjuHint = $("#gomoku-online-renju-hint");
  const roomTag = $("#gomoku-online-room-tag");
  if (roomTag && activeRoomId) roomTag.textContent = `房間 ${activeRoomId}`;
  if (turn) {
    const isMe = mySlot === onlineGame.currentPlayerId;
    turn.textContent = `輪到：${slotName(onlineGame.currentPlayerId)} · ${stoneLabel(onlineGame.currentPlayerId)}${isMe ? "（你）" : ""}`;
  }
  if (blackTag) {
    blackTag.textContent = `黑子：${slotName(onlineGame.blackPlayerId)}`;
  }
  if (renjuHint) {
    const isBlackTurn = onlineGame.currentPlayerId === onlineGame.blackPlayerId;
    renjuHint.classList.toggle("is-visible", isBlackTurn);
    renjuHint.setAttribute("aria-hidden", String(!isBlackTurn));
  }
}

function renderOnlineBoard() {
  const grid = ensureOnlineBoardGrid();
  if (!grid || !onlineGame) return;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      applyOnlineCellState(getOnlineCellBtn(row, col), row, col);
    }
  }
  renderOnlinePlayHeader();
}

async function onOnlineCellClick(row, col) {
  if (shouldSuppressGomokuCellTap()) return;
  if (!activeRoomId || !mySlot || !onlineGame || onlineGame.over) return;
  if (onlineGame.currentPlayerId !== mySlot) return;
  if (onlineGame.cells[row][col]) return;

  if (mySlot === onlineGame.blackPlayerId) {
    const forbidden = wouldBlackForbidden(
      onlineGame.cells,
      row,
      col,
      onlineGame.blackPlayerId,
      otherSlot(onlineGame.blackPlayerId),
      hasFiveWin
    );
    if (forbidden) {
      alert(`不能下這裡：${forbiddenLabel(forbidden)}`);
      return;
    }
  }

  const slot = mySlot;
  const result = await transactGomoku(activeRoomId, (current) => {
    if (!current || current.over) return;
    if (current.currentPlayerId !== slot) return;

    const cells = decodeCells(current.cells);
    if (cells[row][col]) return;

    if (slot === current.blackPlayerId) {
      const forbidden = wouldBlackForbidden(
        cells,
        row,
        col,
        current.blackPlayerId,
        otherSlot(current.blackPlayerId),
        hasFiveWin
      );
      if (forbidden) return;
    }

    cells[row][col] = slot;
    const winLine = checkWin(cells, row, col, slot);
    if (winLine) {
      return {
        ...current,
        cells: encodeCells(cells),
        lastMove: [row, col],
        over: true,
        winner: slot,
        winLine: [...winLine],
      };
    }

    if (boardFull(cells)) {
      return {
        ...current,
        cells: encodeCells(cells),
        lastMove: [row, col],
        over: true,
        winner: null,
        winLine: null,
      };
    }

    return {
      ...current,
      cells: encodeCells(cells),
      lastMove: [row, col],
      currentPlayerId: otherSlot(slot),
    };
  });

  if (!result) {
    alert("這一步無法下（可能輪到對方或已被下過）");
  }
}

function showOnlineResult() {
  if (!onlineGame) return;
  const title = $("#gomoku-online-result-title");
  const detail = $("#gomoku-online-result-detail");
  if (onlineGame.winner) {
    const meWon = onlineGame.winner === mySlot;
    if (title) {
      title.textContent = meWon
        ? "你贏了！"
        : `${slotName(onlineGame.winner)} 連五獲勝`;
    }
    if (detail) {
      detail.textContent = `${slotName(onlineGame.winner)} 的${stoneLabel(onlineGame.winner)}連成五子`;
    }
  } else {
    if (title) title.textContent = "和棋！";
    if (detail) detail.textContent = "棋盤已滿，沒有連五";
  }
  deps?.showView("gomokuOnlineResult");
}

async function leaveOnlineRoom() {
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
  onlineGame = null;
}

async function onKickGuest() {
  if (!activeRoomId || mySlot !== "host") return;
  if (!confirm("清除來賓位子？對方需重新輸入房間碼加入。")) return;
  try {
    await clearGuestSlot(activeRoomId);
  } catch (err) {
    console.error("clearGuestSlot failed", err);
    alert("無法清除來賓，請離開房間後重建。");
  }
}

function bindOnlineEvents() {
  $("#btn-gomoku-mode-local")?.addEventListener("click", () => beginGomokuLocal());
  $("#btn-gomoku-mode-online")?.addEventListener("click", () => enterOnlineFlow());

  $("#btn-gomoku-mode-back")?.addEventListener("click", () => deps?.showView("home"));
  $("#btn-gomoku-firebase-setup-back")?.addEventListener("click", () =>
    deps?.showView("gomokuMode")
  );
  $("#btn-gomoku-room-entry-back")?.addEventListener("click", () =>
    deps?.showView("gomokuMode")
  );
  $("#btn-gomoku-create-room")?.addEventListener("click", () => onCreateRoom());
  $("#btn-gomoku-join-room")?.addEventListener("click", () => onJoinRoom());
  $("#btn-gomoku-lobby-back")?.addEventListener("click", async () => {
    if (confirm("離開房間？")) {
      await leaveOnlineRoom();
      deps?.showView("gomokuRoomEntry");
    }
  });
  $("#btn-gomoku-lobby-ready")?.addEventListener("click", () => onToggleReady());
  $("#btn-gomoku-lobby-kick-guest")?.addEventListener("click", () => onKickGuest());
  $("#btn-gomoku-online-play-back")?.addEventListener("click", async () => {
    if (confirm("離開棋局？房間會結束或回到等候室。")) {
      await leaveOnlineRoom();
      deps?.showView("home");
    }
  });
  $("#btn-gomoku-online-home")?.addEventListener("click", async () => {
    await leaveOnlineRoom();
    deps?.showView("home");
  });
  $("#btn-gomoku-online-lobby")?.addEventListener("click", async () => {
    await leaveOnlineRoom();
    deps?.showView("gomokuRoomEntry");
  });
}

/**
 * @param {OnlineDeps} d
 */
export function initGomokuOnline(d) {
  deps = d;
  bindOnlineEvents();

  const session = getOnlineSession();
  if (session?.roomId && isFirebaseConfigured()) {
    activeRoomId = session.roomId;
    mySlot = session.slot;
    openLobby(session.roomId);
  }
}
