import { forbiddenLabel, wouldBlackForbidden } from "./gomoku-renju.js?v=gomoku-v2";

const BOARD_SIZE = 15;

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
 * @property {(''|'A'|'B')[][]} cells
 * @property {'A'|'B'} blackPlayerId
 * @property {'A'|'B'} currentPlayerId
 * @property {boolean} over
 * @property {'A'|'B'|null} winner
 * @property {[number, number]|null} lastMove
 * @property {Set<number>|null} winLine
 */

const $ = (sel) => document.querySelector(sel);

function playerName(id) {
  const names = deps?.getChildNames() || { A: "A", B: "B" };
  return names[id] || id;
}

function otherPlayer(id) {
  return id === "A" ? "B" : "A";
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

export function renderGomokuHomePlayers() {
  const names = deps?.getChildNames() || { A: "A", B: "B" };
  const aEl = $("#gomoku-player-a-name");
  const bEl = $("#gomoku-player-b-name");
  if (aEl) aEl.textContent = names.A;
  if (bEl) bEl.textContent = names.B;
}

function renderFirstPicker() {
  const names = deps.getChildNames();
  const aBtn = $("#gomoku-pick-a");
  const bBtn = $("#gomoku-pick-b");
  if (aBtn) aBtn.textContent = `${names.A}（黑先）`;
  if (bBtn) bBtn.textContent = `${names.B}（黑先）`;
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
    renjuHint.hidden = !isBlackTurn;
    renjuHint.textContent = isBlackTurn
      ? "黑棋禁手格會標示 ✕（三三、四四、長連）"
      : "";
  }
}

function renderBoard() {
  const grid = $("#gomoku-board");
  if (!grid || !game) return;

  grid.innerHTML = "";
  grid.style.setProperty("--gomoku-size", String(BOARD_SIZE));

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const idx = row * BOARD_SIZE + col;
      const cell = game.cells[row][col];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gomoku-cell";
      btn.dataset.row = String(row);
      btn.dataset.col = String(col);
      btn.setAttribute(
        "aria-label",
        cell
          ? `${playerName(cell)} ${stoneLabel(cell)}`
          : `第 ${row + 1} 行第 ${col + 1} 列`
      );

      if (cell) {
        btn.classList.add("gomoku-cell-filled");
        btn.classList.add(cell === game.blackPlayerId ? "gomoku-stone-black" : "gomoku-stone-white");
        btn.disabled = true;
        const stone = document.createElement("span");
        stone.className = "gomoku-stone";
        stone.setAttribute("aria-hidden", "true");
        btn.appendChild(stone);
      } else {
        btn.disabled = game.over;
        const isBlackTurn =
          !game.over && game.currentPlayerId === game.blackPlayerId;
        if (isBlackTurn) {
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
            btn.classList.add("gomoku-cell-forbidden");
            btn.setAttribute(
              "aria-label",
              `禁手：${forbiddenLabel(forbidden)}`
            );
          }
        }
      }

      if (game.lastMove && game.lastMove[0] === row && game.lastMove[1] === col) {
        btn.classList.add("gomoku-cell-last");
      }
      if (game.winLine?.has(idx)) {
        btn.classList.add("gomoku-cell-win");
      }

      if (!game.over && !cell) {
        if (btn.classList.contains("gomoku-cell-forbidden")) {
          const label = btn.getAttribute("aria-label") || "禁手";
          btn.addEventListener("click", () => alert(`不能下這裡：${label.replace(/^禁手：/, "")}`));
        } else {
          btn.addEventListener("click", () => onCellClick(row, col));
        }
      }

      grid.appendChild(btn);
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
  renderBoard();
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
  game = {
    cells: emptyBoard(),
    blackPlayerId,
    currentPlayerId: blackPlayerId,
    over: false,
    winner: null,
    lastMove: null,
    winLine: null,
  };
  deps.showView("gomokuPlay");
  renderBoard();
}

export function beginGomokuFromHome() {
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

  $("#gomoku-pick-a")?.addEventListener("click", () => startWithBlackPlayer("A"));
  $("#gomoku-pick-b")?.addEventListener("click", () => startWithBlackPlayer("B"));

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
}
