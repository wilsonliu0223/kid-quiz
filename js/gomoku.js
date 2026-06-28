import { forbiddenLabel, wouldBlackForbidden } from "./gomoku-renju.js?v=gomoku-v9";
import { openDuoModePicker } from "./online-duo.js";
import { AI_PLAYER_ID, requestAiMove, terminateAiWorker } from "./gomoku-ai.js?v=gomoku-v9";
import {
  resetGomokuBoardZoom,
  rebindGomokuBoardZoom,
  shouldSuppressGomokuCellTap,
} from "./gomoku-board-zoom.js";
import {
  celebrateGomokuWin,
  clearGomokuWinCelebration,
  renderGomokuWinLine,
} from "./gomoku-win-ui.js";
import { startGomokuReplay, stopGomokuReplay, isGomokuReplayRunning } from "./gomoku-replay.js?v=gomoku-v9";
import { getChildName, otherDuoPlayer } from "./children.js";
import { getSelectedChild } from "./store.js";
import {
  canStartDuoBattle,
  getActiveDuoPlayerIds,
  refreshDuoBattleUI,
  renderDuoPickButtons,
} from "./duo-pick.js";

const BOARD_SIZE = 15;
/** @type {string[]} */
let duoPlayerIds = [];
/** @type {"local"|"ai"} */
let setupMode = "local";
let aiDifficulty = 2;
let aiMovePending = false;
let aiMoveToken = 0;

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
 * @property {"local"|"ai"} [mode]
 * @property {string} [humanPlayerId]
 * @property {string} [aiPlayerId]
 * @property {number} [aiDifficulty]
 * @property {(''|string)[][]} cells
 * @property {string} blackPlayerId
 * @property {string} currentPlayerId
 * @property {boolean} over
 * @property {string|null} winner
 * @property {string[]} playerIds
 * @property {[number, number]|null} lastMove
 * @property {Set<number>|null} winLine
 * @property {{ row: number, col: number, player: string }[]} [moveHistory]
 */

const $ = (sel) => document.querySelector(sel);

const AI_DIFFICULTIES = [
  {
    level: 1,
    label: "入門",
    tier: "入門練習",
    desc: "剛學連五規則，電腦棋力較溫和，適合熟悉棋盤與落子。",
  },
  {
    level: 2,
    label: "普通",
    tier: "休閒對戰",
    desc: "會擋住下一手必殺，適合日常陪練、輕鬆下幾局。",
  },
  {
    level: 3,
    label: "高手",
    tier: "進階挑戰",
    desc: "能看活三、活四，中盤較難僥倖獲勝，適合有基礎者。",
  },
  {
    level: 4,
    label: "大師",
    tier: "深度 AI",
    desc: "較深搜尋、背景運算，整體棋力明顯提升。",
  },
  {
    level: 5,
    label: "宗師",
    tier: "內建最強",
    desc: "含 VCF/VCT 戰術與深度分析（每步最長約 20 秒），建議執白挑戰。",
  },
];

function playerName(id) {
  if (id === AI_PLAYER_ID) return "電腦";
  const names = deps?.getChildNames() || { A: "A", B: "B" };
  return names[id] || getChildName(id) || id;
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

function setFirstScreenMode(mode) {
  setupMode = mode;
  const local = $("#gomoku-local-setup");
  const ai = $("#gomoku-ai-setup");
  const title = $("#gomoku-first-title");
  const meta = $("#gomoku-first-meta");
  const hint = $("#gomoku-first-hint");
  if (local) local.hidden = mode !== "local";
  if (ai) ai.hidden = mode !== "ai";
  if (title) title.textContent = mode === "ai" ? "挑戰 AI" : "誰拿黑子？";
  if (meta) {
    meta.textContent =
      mode === "ai"
        ? "單人對電腦 · 15×15 · 連珠規則"
        : "15×15 · 先連五子獲勝 · 連珠規則";
  }
  if (hint) hint.hidden = mode === "ai";
}

function renderFirstPicker() {
  setFirstScreenMode("local");
  refreshDuoBattleUI();
  renderDuoPickButtons("#gomoku-pick-btns", {
    onPick: startWithBlackPlayer,
    labelSuffix: "（黑先）",
  });
}

function renderAiDifficultyIntro() {
  const box = $("#gomoku-ai-difficulty-intro");
  if (!box) return;
  const item = AI_DIFFICULTIES.find((d) => d.level === aiDifficulty) || AI_DIFFICULTIES[1];
  box.innerHTML = `
    <p class="gomoku-ai-difficulty-tier">${item.tier}</p>
    <p class="gomoku-ai-difficulty-desc">${item.desc}</p>
  `;
}

function renderAiDifficultyChips() {
  const wrap = $("#gomoku-ai-difficulty-chips");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const item of AI_DIFFICULTIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    if (item.level === aiDifficulty) btn.classList.add("chip-active");
    btn.textContent = item.label;
    btn.setAttribute("aria-pressed", String(item.level === aiDifficulty));
    btn.addEventListener("click", () => {
      aiDifficulty = item.level;
      renderAiDifficultyChips();
    });
    wrap.appendChild(btn);
  }
  renderAiDifficultyIntro();
}

function renderAiStartButtons() {
  const humanId = getSelectedChild();
  const humanName = humanId ? getChildName(humanId) : "—";
  const activeName = $("#gomoku-ai-active-name");
  if (activeName) activeName.textContent = humanName;

  const wrap = $("#gomoku-ai-start-btns");
  if (!wrap) return;
  wrap.innerHTML = "";

  const humanBlack = document.createElement("button");
  humanBlack.type = "button";
  humanBlack.className = "btn btn-primary btn-block btn-primary-gomoku";
  humanBlack.textContent = `${humanName} 拿黑子（先手）`;
  humanBlack.addEventListener("click", () => startAiGame(true));

  const aiBlack = document.createElement("button");
  aiBlack.type = "button";
  aiBlack.className = "btn btn-secondary btn-block";
  aiBlack.textContent = "電腦拿黑子（先手）";
  aiBlack.addEventListener("click", () => startAiGame(false));

  wrap.appendChild(humanBlack);
  wrap.appendChild(aiBlack);
}

function renderAiSetup() {
  setFirstScreenMode("ai");
  renderAiDifficultyChips();
  renderAiStartButtons();
}

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ""),
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

function isHumanTurn() {
  return game?.mode !== "ai" || game.currentPlayerId === game.humanPlayerId;
}

function renderPlayHeader() {
  if (!game) return;
  const turn = $("#gomoku-turn-label");
  const blackTag = $("#gomoku-black-tag");
  const renjuHint = $("#gomoku-renju-hint");
  if (game.over) {
    if (turn) {
      turn.textContent = game.winner
        ? `${playerName(game.winner)} 連五獲勝！`
        : "和棋！";
    }
    if (renjuHint) {
      renjuHint.classList.remove("is-visible");
      renjuHint.setAttribute("aria-hidden", "true");
    }
    return;
  }
  if (turn) {
    if (game.mode === "ai" && aiMovePending) {
      const diff = game.aiDifficulty ?? aiDifficulty;
      turn.textContent = diff >= 5 ? "電腦深度分析中（最長約 20 秒）…" : "電腦思考中…";
    } else {
      turn.textContent = `輪到：${playerName(game.currentPlayerId)} · ${stoneLabel(game.currentPlayerId)}`;
    }
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
    hasFiveWin,
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
      cell === game.blackPlayerId ? "gomoku-stone-black" : "gomoku-stone-white",
    );
    btn.disabled = true;
    const stone = document.createElement("span");
    stone.className = "gomoku-stone";
    stone.setAttribute("aria-hidden", "true");
    btn.appendChild(stone);
    btn.setAttribute("aria-label", `${playerName(cell)} ${stoneLabel(cell)}`);
  } else {
    const waitingAi = game.mode === "ai" && (aiMovePending || !isHumanTurn());
    btn.disabled = game.over || waitingAi;
    const forbidden = forbiddenAt(row, col);
    if (forbidden) {
      btn.classList.add("gomoku-cell-forbidden");
      btn.setAttribute("aria-label", `禁手：${forbiddenLabel(forbidden)}`);
      if (!waitingAi && !game.over) {
        btn.onclick = () => alert(`不能下這裡：${forbiddenLabel(forbidden)}`);
      }
    } else if (!game.over && !waitingAi) {
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

function finishAfterMove(row, col, prevLastMove) {
  const player = game.cells[row][col];
  const winLine = checkWin(game.cells, row, col, player);
  if (winLine) {
    game.over = true;
    game.winner = player;
    game.winLine = winLine;
    aiMovePending = false;
    renderBoard();
    showWinOnBoard();
    return;
  }

  if (boardFull(game.cells)) {
    game.over = true;
    game.winner = null;
    aiMovePending = false;
    renderBoard();
    showWinOnBoard();
    return;
  }

  game.currentPlayerId = otherPlayer(player);
  syncBoardAfterMove(row, col, prevLastMove);
  maybeScheduleAiMove();
}

function placeMove(row, col) {
  if (!game || game.over || game.cells[row][col]) return false;

  const player = game.currentPlayerId;
  if (player === game.blackPlayerId) {
    const whiteId = otherPlayer(game.blackPlayerId);
    const forbidden = wouldBlackForbidden(
      game.cells,
      row,
      col,
      game.blackPlayerId,
      whiteId,
      hasFiveWin,
    );
    if (forbidden) return false;
  }

  const prevLastMove = game.lastMove;
  game.cells[row][col] = player;
  game.lastMove = [row, col];
  if (!game.moveHistory) game.moveHistory = [];
  game.moveHistory.push({ row, col, player });
  finishAfterMove(row, col, prevLastMove);
  return true;
}

function onCellClick(row, col) {
  if (shouldSuppressGomokuCellTap()) return;
  if (isGomokuReplayRunning()) return;
  if (!game || game.over) return;
  if (game.cells[row][col]) return;
  if (game.mode === "ai" && !isHumanTurn()) return;

  const player = game.currentPlayerId;
  if (player === game.blackPlayerId) {
    const whiteId = otherPlayer(game.blackPlayerId);
    const forbidden = wouldBlackForbidden(
      game.cells,
      row,
      col,
      game.blackPlayerId,
      whiteId,
      hasFiveWin,
    );
    if (forbidden) {
      alert(`不能下這裡：${forbiddenLabel(forbidden)}`);
      return;
    }
  }

  placeMove(row, col);
}

function maybeScheduleAiMove() {
  if (!game || game.mode !== "ai" || game.over) return;
  if (game.currentPlayerId !== game.aiPlayerId) return;
  aiMovePending = true;
  renderPlayHeader();
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!game.cells[row][col]) {
        applyCellState(getCellBtn(row, col), row, col);
      }
    }
  }
  window.setTimeout(() => void runAiMove(), 40);
}

async function runAiMove() {
  if (!game || game.mode !== "ai" || game.over || game.currentPlayerId !== game.aiPlayerId) {
    aiMovePending = false;
    return;
  }

  const token = ++aiMoveToken;
  const blackId = game.blackPlayerId;
  const whiteId = otherPlayer(blackId);

  try {
    const move = await requestAiMove(game.cells, {
      aiId: game.aiPlayerId,
      blackId,
      whiteId,
      difficulty: game.aiDifficulty ?? aiDifficulty,
    });

    if (token !== aiMoveToken) return;
    if (!game || game.mode !== "ai" || game.over || game.currentPlayerId !== game.aiPlayerId) {
      aiMovePending = false;
      return;
    }

    aiMovePending = false;
    if (!move) {
      renderBoard();
      return;
    }

    const [row, col] = move;
    if (!placeMove(row, col)) {
      renderBoard();
    }
  } catch (err) {
    console.error("gomoku ai failed", err);
    if (token !== aiMoveToken) return;
    aiMovePending = false;
    renderBoard();
  }
}

function showWinOnBoard() {
  if (!game) return;
  const title = game.winner
    ? `${playerName(game.winner)} 連五獲勝！`
    : "和棋！";
  const detail = game.winner
    ? `${playerName(game.winner)} 的${stoneLabel(game.winner)}連成五子`
    : "棋盤已滿，沒有連五";
  celebrateGomokuWin({
    stageEl: $("#gomoku-board-stage"),
    overlayEl: $("#gomoku-win-overlay"),
    titleEl: $("#gomoku-win-title"),
    detailEl: $("#gomoku-win-detail"),
    winLine: game.winLine,
    lastMove: game.lastMove,
    title,
    detail,
  });
  const reviewBtn = $("#btn-gomoku-win-moves");
  if (reviewBtn) reviewBtn.hidden = !(game.moveHistory?.length > 0);
}

function startLocalReplay() {
  if (!game?.moveHistory?.length) return;
  stopGomokuReplay();
  clearGomokuWinCelebration($("#gomoku-board-stage"), $("#gomoku-win-overlay"));
  const moves = game.moveHistory.map((m) => ({ ...m }));
  const winLine = game.winLine;
  const lastMove = game.lastMove;

  startGomokuReplay({
    moves,
    winLine,
    lastMove,
    onStep: ({ cells, lastMove: lm }) => {
      game.cells = cells;
      game.lastMove = lm;
      game.winLine = null;
      renderBoard();
    },
    onStatus: (text) => {
      const el = $("#gomoku-turn-label");
      if (el) el.textContent = text;
      const hint = $("#gomoku-renju-hint");
      if (hint) {
        hint.classList.remove("is-visible");
        hint.setAttribute("aria-hidden", "true");
      }
    },
    onDone: ({ cells, winLine: wl, lastMove: lm }) => {
      game.cells = cells;
      game.lastMove = lm;
      game.winLine = wl;
      renderBoard();
      if (wl) renderGomokuWinLine($("#gomoku-board-stage"), wl, lm);
      const el = $("#gomoku-turn-label");
      if (el) {
        el.textContent = game.winner
          ? `${playerName(game.winner)} 連五獲勝！（重播完成）`
          : "和棋！（重播完成）";
      }
    },
  });
}

function resetBoardDom() {
  const grid = $("#gomoku-board");
  if (grid) delete grid.dataset.built;
  clearGomokuWinCelebration($("#gomoku-board-stage"), $("#gomoku-win-overlay"));
  deps?.showView("gomokuPlay");
  rebindGomokuBoardZoom("#gomoku-board-viewport", "#gomoku-board-stage");
  resetGomokuBoardZoom();
}

function startWithBlackPlayer(blackPlayerId) {
  const playerIds = getActiveDuoPlayerIds();
  if (playerIds.length < 2 || !playerIds.includes(blackPlayerId)) return;
  duoPlayerIds = playerIds;
  aiMovePending = false;
  game = {
    mode: "local",
    cells: emptyBoard(),
    playerIds,
    blackPlayerId,
    currentPlayerId: blackPlayerId,
    over: false,
    winner: null,
    lastMove: null,
    winLine: null,
    moveHistory: [],
  };
  resetBoardDom();
  renderBoard();
}

function startAiGame(humanIsBlack) {
  const humanId = getSelectedChild();
  if (!humanId) {
    alert("請在首頁選「誰在練習」");
    return;
  }
  const blackPlayerId = humanIsBlack ? humanId : AI_PLAYER_ID;
  const playerIds = [humanId, AI_PLAYER_ID];
  duoPlayerIds = playerIds;
  aiMovePending = false;
  game = {
    mode: "ai",
    humanPlayerId: humanId,
    aiPlayerId: AI_PLAYER_ID,
    aiDifficulty,
    cells: emptyBoard(),
    playerIds,
    blackPlayerId,
    currentPlayerId: blackPlayerId,
    over: false,
    winner: null,
    lastMove: null,
    winLine: null,
    moveHistory: [],
  };
  resetBoardDom();
  renderBoard();
  maybeScheduleAiMove();
}

export function beginGomokuFromHome() {
  openDuoModePicker({
    game: "gomoku",
    title: "五子棋",
    backView: "home",
    localStart: beginGomokuLocal,
    aiStart: beginGomokuAi,
  });
}

export function beginGomokuLocal() {
  if (!canStartDuoBattle()) {
    alert("請在首頁選「誰在練習」，並在對戰設定中挑選對戰對象（至少需要兩位）");
    return;
  }
  duoPlayerIds = getActiveDuoPlayerIds();
  renderFirstPicker();
  deps.showView("gomokuFirst");
}

export function beginGomokuAi() {
  const humanId = getSelectedChild();
  if (!humanId) {
    alert("請在首頁選「誰在練習」");
    return;
  }
  renderAiSetup();
  deps.showView("gomokuFirst");
}

function replayGomoku() {
  if (!game) {
    beginGomokuFromHome();
    return;
  }
  if (game.mode === "ai") {
    renderAiSetup();
    deps.showView("gomokuFirst");
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

  $("#btn-gomoku-first-back")?.addEventListener("click", () => {
    if (setupMode === "ai") deps.showView("duoMode");
    else deps.showView("home");
  });
  $("#btn-gomoku-play-back")?.addEventListener("click", () => {
    if (confirm("離開棋局？目前進度不會儲存。")) {
      stopGomokuReplay();
      aiMoveToken += 1;
      aiMovePending = false;
      game = null;
      terminateAiWorker();
      deps.showView("home");
    }
  });
  $("#btn-gomoku-replay")?.addEventListener("click", replayGomoku);
  $("#btn-gomoku-home")?.addEventListener("click", () => {
    stopGomokuReplay();
    aiMoveToken += 1;
    aiMovePending = false;
    game = null;
    terminateAiWorker();
    deps.showView("home");
  });
  $("#btn-gomoku-win-dismiss")?.addEventListener("click", () => {
    clearGomokuWinCelebration($("#gomoku-board-stage"), $("#gomoku-win-overlay"));
  });
  $("#btn-gomoku-win-moves")?.addEventListener("click", () => {
    startLocalReplay();
  });
  $("#btn-gomoku-win-replay")?.addEventListener("click", () => {
    stopGomokuReplay();
    clearGomokuWinCelebration($("#gomoku-board-stage"), $("#gomoku-win-overlay"));
    replayGomoku();
  });
  $("#btn-gomoku-win-home")?.addEventListener("click", () => {
    clearGomokuWinCelebration($("#gomoku-board-stage"), $("#gomoku-win-overlay"));
    stopGomokuReplay();
    aiMoveToken += 1;
    aiMovePending = false;
    game = null;
    terminateAiWorker();
    deps.showView("home");
  });
}

/**
 * @param {GomokuDeps} d
 */
export function initGomoku(d) {
  deps = d;
  renderGomokuHomePlayers();
  bindGomokuEvents();
}
