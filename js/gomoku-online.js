import { forbiddenLabel, wouldBlackForbidden } from "./gomoku-renju.js?v=gomoku-v2";
import {
  resetGomokuBoardZoom,
  rebindGomokuBoardZoom,
  shouldSuppressGomokuCellTap,
} from "./gomoku-board-zoom.js";
import {
  registerOnlineGame,
  getOnlineContext,
  leaveOnlineRoom,
  openDuoModePicker,
} from "./online-duo.js";
import { startGomokuRoom, transactGameState } from "./room-service.js";

const BOARD_SIZE = 15;

/** @typedef {'host' | 'guest'} RoomSlot */

/** @type {object | null} */
let onlineGame = null;

const $ = (sel) => document.querySelector(sel);

function otherSlot(slot) {
  return slot === "host" ? "guest" : "host";
}

function slotName(slot) {
  if (!onlineGame) return slot === "host" ? "房主" : "來賓";
  return onlineGame.names[slot] || (slot === "host" ? "房主" : "來賓");
}

function decodeCells(str) {
  const cells = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => "")
  );
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

function renderBlackPick(panel, snap, onPick) {
  const host = snap.players.host;
  const guest = snap.players.guest;
  [
    ["host", `${host?.name || "房主"} 執黑`],
    ["guest", `${guest?.name || "來賓"} 執黑`],
  ].forEach(([slot, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary gomoku-lobby-black-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => onPick(/** @type {RoomSlot} */ (slot)));
    panel.appendChild(btn);
  });
}

function applyRemoteGomoku(snapshot) {
  const g = snapshot.state;
  if (!g) return;
  onlineGame = {
    cells: decodeCells(g.cells),
    blackPlayerId: g.blackPlayerId,
    currentPlayerId: g.currentPlayerId,
    over: !!g.over,
    winner: g.winner || null,
    lastMove: g.lastMove || null,
    winLine: g.winLine ? new Set(g.winLine.map((n) => Number(n))) : null,
    names: {
      host: snapshot.players.host?.name || "房主",
      guest: snapshot.players.guest?.name || "來賓",
    },
  };
  renderOnlineBoard();
  if (g.over && !$("#view-gomoku-online-result")?.classList.contains("view-active")) {
    showOnlineResult();
  }
}

function enterOnlinePlay(snapshot) {
  getOnlineContext().deps?.showView("gomokuOnlinePlay");
  const grid = $("#gomoku-online-board");
  if (grid) delete grid.dataset.built;
  rebindGomokuBoardZoom("#gomoku-online-board-viewport", "#gomoku-online-board-stage");
  resetGomokuBoardZoom();
  applyRemoteGomoku(snapshot);
}

function forbiddenAt(row, col) {
  if (!onlineGame || onlineGame.over || onlineGame.currentPlayerId !== onlineGame.blackPlayerId) {
    return null;
  }
  if (onlineGame.cells[row][col]) return null;
  return wouldBlackForbidden(
    onlineGame.cells,
    row,
    col,
    onlineGame.blackPlayerId,
    otherSlot(onlineGame.blackPlayerId),
    hasFiveWin
  );
}

function getOnlineCellBtn(row, col) {
  return $("#gomoku-online-board")?.querySelector(`[data-row="${row}"][data-col="${col}"]`) || null;
}

function applyOnlineCellState(btn, row, col) {
  if (!onlineGame || !btn) return;
  const cell = onlineGame.cells[row][col];
  const idx = row * BOARD_SIZE + col;
  const ctx = getOnlineContext();
  btn.className = "gomoku-cell";
  btn.replaceChildren();
  btn.onclick = null;

  if (cell) {
    btn.classList.add("gomoku-cell-filled");
    btn.classList.add(cell === onlineGame.blackPlayerId ? "gomoku-stone-black" : "gomoku-stone-white");
    btn.disabled = true;
    const stone = document.createElement("span");
    stone.className = "gomoku-stone";
    stone.setAttribute("aria-hidden", "true");
    btn.appendChild(stone);
  } else {
    const myTurn = ctx.slot === onlineGame.currentPlayerId && !onlineGame.over;
    btn.disabled = !myTurn;
    const forbidden = forbiddenAt(row, col);
    if (forbidden) {
      btn.classList.add("gomoku-cell-forbidden");
      btn.onclick = () => alert(`不能下這裡：${forbiddenLabel(forbidden)}`);
    } else if (myTurn) {
      btn.onclick = () => onOnlineCellClick(row, col);
    }
  }
  if (onlineGame.lastMove?.[0] === row && onlineGame.lastMove?.[1] === col) {
    btn.classList.add("gomoku-cell-last");
  }
  if (onlineGame.winLine?.has(idx)) btn.classList.add("gomoku-cell-win");
}

function ensureOnlineBoardGrid() {
  const grid = $("#gomoku-online-board");
  if (!grid || !onlineGame) return null;
  if (grid.dataset.built === "1") return grid;
  grid.innerHTML = "";
  grid.style.setProperty("--gomoku-size", String(BOARD_SIZE));
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gomoku-cell";
      btn.dataset.row = String(row);
      btn.dataset.col = String(col);
      grid.appendChild(btn);
    }
  }
  grid.dataset.built = "1";
  return grid;
}

function renderOnlineBoard() {
  const grid = ensureOnlineBoardGrid();
  if (!grid || !onlineGame) return;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      applyOnlineCellState(getOnlineCellBtn(row, col), row, col);
    }
  }
  const ctx = getOnlineContext();
  if ($("#gomoku-online-room-tag") && ctx.roomId) {
    $("#gomoku-online-room-tag").textContent = `房間 ${ctx.roomId}`;
  }
  if ($("#gomoku-online-turn-label") && !onlineGame.over) {
    const me = ctx.slot === onlineGame.currentPlayerId;
    $("#gomoku-online-turn-label").textContent = `輪到：${slotName(onlineGame.currentPlayerId)} · ${stoneLabel(onlineGame.currentPlayerId)}${me ? "（你）" : ""}`;
  }
  if ($("#gomoku-online-black-tag")) {
    $("#gomoku-online-black-tag").textContent = `黑子：${slotName(onlineGame.blackPlayerId)}`;
  }
}

async function onOnlineCellClick(row, col) {
  if (shouldSuppressGomokuCellTap()) return;
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot || !onlineGame || onlineGame.over) return;
  if (onlineGame.currentPlayerId !== ctx.slot) return;

  const slot = ctx.slot;
  const result = await transactGameState(ctx.roomId, (current) => {
    if (!current || current.over || current.currentPlayerId !== slot) return;
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
  if (!result) alert("這一步無法下（可能輪到對方或已被下過）");
}

function showOnlineResult() {
  if (!onlineGame) return;
  const ctx = getOnlineContext();
  const title = $("#gomoku-online-result-title");
  const detail = $("#gomoku-online-result-detail");
  if (onlineGame.winner) {
    const meWon = onlineGame.winner === ctx.slot;
    if (title) title.textContent = meWon ? "你贏了！" : `${slotName(onlineGame.winner)} 連五獲勝`;
    if (detail) detail.textContent = `${slotName(onlineGame.winner)} 的${stoneLabel(onlineGame.winner)}連成五子`;
  } else {
    if (title) title.textContent = "和棋！";
    if (detail) detail.textContent = "棋盤已滿，沒有連五";
  }
  ctx.deps?.showView("gomokuOnlineResult");
}

function bindGomokuOnlineOnly() {
  if (bindGomokuOnlineOnly.done) return;
  bindGomokuOnlineOnly.done = true;
  $("#btn-gomoku-online-play-back")?.addEventListener("click", async () => {
    if (confirm("離開棋局？")) {
      await leaveOnlineRoom();
      onlineGame = null;
      getOnlineContext().deps?.showView("home");
    }
  });
  $("#btn-gomoku-online-home")?.addEventListener("click", async () => {
    await leaveOnlineRoom();
    onlineGame = null;
    getOnlineContext().deps?.showView("home");
  });
}

registerOnlineGame("gomoku", {
  startHint: "請選誰執黑（黑先）",
  renderStartButtons: renderBlackPick,
  startGame: (roomId, slot) => startGomokuRoom(roomId, slot),
  onPlaying(snapshot) {
    bindGomokuOnlineOnly();
    const onPlay = $("#view-gomoku-online-play")?.classList.contains("view-active");
    const onResult = $("#view-gomoku-online-result")?.classList.contains("view-active");
    if (!onPlay && !onResult) enterOnlinePlay(snapshot);
    else applyRemoteGomoku(snapshot);
  },
});

export function openGomokuDuoMode(localStart) {
  openDuoModePicker({
    game: "gomoku",
    title: "五子棋",
    backView: "home",
    localStart,
  });
}
