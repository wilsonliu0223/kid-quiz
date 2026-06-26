import { forbiddenLabel, wouldBlackForbidden } from "./gomoku-renju.js?v=gomoku-v2";
import {
  initGomokuBoardZoom,
  resetGomokuBoardZoom,
} from "./gomoku-board-zoom.js";
import { getChildName, otherDuoPlayer } from "./children.js";
import {
  canStartDuoBattle,
  getActiveDuoPlayerIds,
  refreshDuoBattleUI,
  renderDuoPickButtons,
} from "./duo-pick.js";

const BOARD_SIZE = 15;
/** @type {string[]} */
let duoPlayerIds = [];

/** @type {GomokuDeps | null} */
let deps = null;
/** @type {GomokuState | null} */
let game = null;

/**
 * @typedef {object} GomokuDeps
 * @property {(name: string) => void} showView
 * @property {() => { A: string, B: string }} getChildNames
 */

/**
 * @typedef {object} GomokuState
 * @property {(''|string)[][]} cells
 * @property {string} blackPlayerId
 * @property {string} currentPlayerId
 * @property {boolean} over
 * @property {string|null} winner
 * @property {string[]} playerIds
 * @property {[number, number]|null} lastMove
 * @property {Set<number>|null} winLine
 */

const $ = (sel) => document.querySelector(sel);

function playerName(id) {
  const names = deps?.getChildNames() || { A: "A", B: "B" };
  return names[id] || id;
}

function otherPlayer(id) {
  if (game?.playerIds?.length === 2) {
    return otherDuoPlayer(id, game.playerIds);
  }
  return otherDuoPlayer(id, duoPlayerIds);
}

export function renderGomokuHomePlayers() {
  refreshDuoBattleUI();
}

function renderFirstPicker() {
  refreshDuoBattleUI();
  renderDuoPickButtons("#gomoku-pick-btns", {
    onPick: startWithBlackPlayer,
    labelSuffix: "（黑先）",
  });
}

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => "")
  );
}

function hasFiveWin(cells, row, col, player) {
  return !!checkWin(cells, row, col, player);
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

function boardFull(cells) {
  return cells.every((row) => row.every((cell) => cell !== ""));
}

function stoneLabel(playerId) {
  return playerId === game?.blackPlayerId ? "黑子" : "白子";
}

function renderPlayHeader() {
  if (!game || game.over) return;
  const turn = $("#gomoku-turn-label");
  const blackTag = $("#gomoku-black-tag");
  const renjuHint = $("#gomoku-renju-hint");
  if (turn) {
    turn.textContent = `輪到：${playerName(game.currentPlayerId)} · ${stoneLabel(game.currentPlayerId)}`;
  }
  if (blackTag) {
    blackTag.textContent = `黑子：${playerName(game.blackPlayerId)}`;
  }
  if (renjuHint) {
    const isBlackTurn = game.currentPlayerId === game.blackPlayerId;
    renjuHint.classList.toggle("is-visible", isBlackTurn);
    renjuHint.setAttribute("aria-hidden", String(!isBlackTurn));
  }
}

function getCellBtn(row, col) {
  const grid = $("#gomoku-board");
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

function forbiddenAt(row, col) {
  if (!game || game.over || game.currentPlayerId !== game.blackPlayerId) return null;
  if (game.cells[row][col]) return null;
  const whiteId = otherPlayer(game.blackPlayerId);
  return wouldBlackForbidden(
    game.cells,
    row,
    col,
    game.blackPlayerId,
    whiteId,
    hasFiveWin
  );
}

function applyCellState(btn, row, col) {
  if (!game || !btn) return;
  const cell = game.cells[row][col];
  const idx = row * BOARD_SIZE + col;

  btn.className = "gomoku-cell";
  btn.replaceChildren();
  btn.onclick = null;

  if (cell) {
    btn.classList.add("gomoku-cell-filled");
    btn.classList.add(
      cell === game.blackPlayerId ? "gomoku-stone-black" : "gomoku-stone-white"
    );
    btn.disabled = true;
    const stone = document.createElement("span");
    stone.className = "gomoku-stone";
    stone.setAttribute("aria-hidden", "true");
    btn.appendChild(stone);
    btn.setAttribute("aria-label", `${playerName(cell)} ${stoneLabel(cell)}`);
  } else {
    btn.disabled = game.over;
    const forbidden = forbiddenAt(row, col);
    if (forbidden) {
      btn.classList.add("gomoku-cell-forbidden");
      btn.setAttribute("aria-label", `禁手：${forbiddenLabel(forbidden)}`);
      btn.onclick = () => alert(`不能下這裡：${forbiddenLabel(forbidden)}`);
    } else if (!game.over) {
      btn.setAttribute("aria-label", `第 ${row + 1} 行第 ${col + 1} 列`);
      btn.onclick = () => onCellClick(row, col);
    }
  }

  if (game.lastMove && game.lastMove[0] === row && game.lastMove[1] === col) {
    btn.classList.add("gomoku-cell-last");
  }
  if (game.winLine?.has(idx)) {
    btn.classList.add("gomoku-cell-win");
  }
}

function ensureBoardGrid() {
  const grid = $("#gomoku-board");
  if (!grid || !game) return null;
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

function syncBoardAfterMove(changedRow, changedCol, prevLastMove) {
  applyCellState(getCellBtn(changedRow, changedCol), changedRow, changedCol);

  if (prevLastMove) {
    const [pr, pc] = prevLastMove;
    if (pr !== changedRow || pc !== changedCol) {
      applyCellState(getCellBtn(pr, pc), pr, pc);
    }
  }

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (game.cells[row][col]) continue;
      if (row === changedRow && col === changedCol) continue;
      applyCellState(getCellBtn(row, col), row, col);
    }
  }

  renderPlayHeader();
}

function renderBoard() {
  const grid = ensureBoardGrid();
  if (!grid || !game) return;

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      applyCellState(getCellBtn(row, col), row, col);
    }
  }

  renderPlayHeader();
}

function onCellClick(row, col) {
  if (!game || game.over) return;
  if (game.cells[row][col]) return;

  const player = game.currentPlayerId;
  if (player === game.blackPlayerId) {
    const whiteId = otherPlayer(game.blackPlayerId);
    const forbidden = wouldBlackForbidden(
      game.cells,
      row,
      col,
      game.blackPlayerId,
      whiteId,
      hasFiveWin
    );
    if (forbidden) {
      alert(`不能下這裡：${forbiddenLabel(forbidden)}`);
      return;
    }
  }

  const prevLastMove = game.lastMove;
  game.cells[row][col] = player;
  game.lastMove = [row, col];

  const winLine = checkWin(game.cells, row, col, player);
  if (winLine) {
    game.over = true;
    game.winner = player;
    game.winLine = winLine;
    renderBoard();
    setTimeout(showResult, 350);
    return;
  }

  if (boardFull(game.cells)) {
    game.over = true;
    game.winner = null;
    renderBoard();
    setTimeout(showResult, 350);
    return;
  }

  game.currentPlayerId = otherPlayer(player);
  syncBoardAfterMove(row, col, prevLastMove);
}

function showResult() {
  if (!game) return;
  const title = $("#gomoku-result-title");
  const detail = $("#gomoku-result-detail");

  if (game.winner) {
    if (title) title.textContent = `${playerName(game.winner)} 連五獲勝！`;
    if (detail) {
      detail.textContent = `${playerName(game.winner)} 的${stoneLabel(game.winner)}連成五子`;
    }
  } else {
    if (title) title.textContent = "和棋！";
    if (detail) detail.textContent = "棋盤已滿，沒有連五";
  }

  deps.showView("gomokuResult");
}

function startWithBlackPlayer(blackPlayerId) {
  const playerIds = getActiveDuoPlayerIds();
  if (playerIds.length < 2 || !playerIds.includes(blackPlayerId)) return;
  duoPlayerIds = playerIds;
  game = {
    cells: emptyBoard(),
    playerIds,
    blackPlayerId,
    currentPlayerId: blackPlayerId,
    over: false,
    winner: null,
    lastMove: null,
    winLine: null,
  };
  const grid = $("#gomoku-board");
  if (grid) delete grid.dataset.built;
  deps.showView("gomokuPlay");
  resetGomokuBoardZoom();
  renderBoard();
}

export function beginGomokuFromHome() {
  if (!canStartDuoBattle()) {
    alert("請在首頁選「誰在練習」，並在對戰設定中挑選對戰對象（至少需要兩位）");
    return;
  }
  duoPlayerIds = getActiveDuoPlayerIds();
  renderFirstPicker();
  deps.showView("gomokuFirst");
}

function replayGomoku() {
  if (!game) {
    beginGomokuFromHome();
    return;
  }
  renderFirstPicker();
  deps.showView("gomokuFirst");
}

export function bindGomokuEvents() {
  $("#btn-start-gomoku")?.addEventListener("click", (e) => {
    e.preventDefault();
    beginGomokuFromHome();
  });

  $("#btn-gomoku-first-back")?.addEventListener("click", () => deps.showView("home"));
  $("#btn-gomoku-play-back")?.addEventListener("click", () => {
    if (confirm("離開棋局？目前進度不會儲存。")) deps.showView("home");
  });
  $("#btn-gomoku-replay")?.addEventListener("click", replayGomoku);
  $("#btn-gomoku-home")?.addEventListener("click", () => deps.showView("home"));
}

/**
 * @param {GomokuDeps} d
 */
export function initGomoku(d) {
  deps = d;
  renderGomokuHomePlayers();
  bindGomokuEvents();
  initGomokuBoardZoom("#gomoku-board-viewport", "#gomoku-board-stage");
}
