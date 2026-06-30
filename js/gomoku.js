import { forbiddenLabel, wouldBlackForbidden } from "./gomoku-renju.js?v=gomoku-v12";
import { openDuoModePicker } from "./online-duo.js";
import {
  AI_PLAYER_ID,
  requestAiMove,
  terminateAiWorker,
  rapfiLoadState,
  preloadNirvanaFullEngine,
  GRANDMASTER_LEVEL,
  NIRVANA_LEVEL,
} from "./gomoku-ai.js?v=gomoku-v29";
import {
  resetGomokuBoardZoom,
  rebindGomokuBoardZoom,
  shouldSuppressGomokuCellTap,
} from "./gomoku-board-zoom.js";
import {
  celebrateGomokuWin,
  clearGomokuWinCelebration,
  dismissGomokuWinOverlay,
  isGomokuWinCelebrationPending,
  renderGomokuWinLine,
  showGomokuWinOverlayImmediate,
} from "./gomoku-win-ui.js";
import { startGomokuReplay, stopGomokuReplay, isGomokuReplayRunning } from "./gomoku-replay.js?v=gomoku-v13";
import { renderDuoTurnStatusBar } from "./game-turn-status.js?v=gomoku-v14";
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
let localWinUiDismissed = false;

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
    tier: "強力 AI",
    desc: "Rapfi 快板（精簡、載入快），棋力勝過舊版宗師、也明顯強於大師。每步最長 60 秒，建議執白。",
  },
  {
    level: 6,
    label: "涅槃",
    tier: "Rapfi 滿血",
    desc: "完整 Rapfi NNUE（首次約 40 MB）；單步最長 60 秒，棋力接近 Gomocalc。建議執白。",
  },
];

function aiLevelLabel(level) {
  return AI_DIFFICULTIES.find((d) => d.level === level)?.label || "";
}

function playerName(id) {
  if (id === AI_PLAYER_ID) {
    if (game?.mode === "ai") {
      const label = aiLevelLabel(game.aiDifficulty ?? aiDifficulty);
      return label ? `電腦（${label}）` : "電腦";
    }
    return "電腦";
  }
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

function renderAiDifficultyChips() {
  const wrap = $("#gomoku-ai-difficulty-chips");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const item of AI_DIFFICULTIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `card gomoku-ai-diff-card gomoku-ai-diff-card-${item.level}`;
    if (item.level === aiDifficulty) btn.classList.add("gomoku-ai-diff-card-active");
    btn.setAttribute("aria-pressed", String(item.level === aiDifficulty));
    btn.dataset.level = String(item.level);
    btn.innerHTML = `
      <span class="gomoku-ai-diff-card-head">
        <span class="card-title">${item.label}</span>
        <span class="gomoku-ai-diff-card-tier">${item.tier}</span>
      </span>
      <span class="card-desc gomoku-ai-diff-card-desc">${item.desc}</span>
    `;
    btn.addEventListener("click", () => {
      aiDifficulty = item.level;
      renderAiDifficultyChips();
    });
    wrap.appendChild(btn);
  }
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
  humanBlack.className = "card gomoku-ai-start-card gomoku-ai-start-card-human";
  humanBlack.innerHTML = `
    <span class="card-title">${humanName} 拿黑子</span>
    <span class="card-desc">你先手 · 須遵守黑棋禁手</span>
  `;
  humanBlack.addEventListener("click", () => startAiGame(true));

  const aiBlack = document.createElement("button");
  aiBlack.type = "button";
  aiBlack.className = "card gomoku-ai-start-card gomoku-ai-start-card-ai";
  const aiLabel = aiLevelLabel(aiDifficulty) || "電腦";
  aiBlack.innerHTML = `
    <span class="card-title">電腦拿黑子（${aiLabel}）</span>
    <span class="card-desc">電腦先手 · 適合練防守</span>
  `;
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

function whitePlayerId() {
  if (!game) return "";
  return otherPlayer(game.blackPlayerId);
}

function currentTurnSide() {
  if (!game) return null;
  return game.currentPlayerId === game.blackPlayerId ? "black" : "white";
}

function renderPlayHeader(statusText = "") {
  if (!game) return;
  const renjuHint = $("#gomoku-renju-hint");
  const waitingAi = game.mode === "ai" && !game.over && aiMovePending;
  const humanTurn = isHumanTurn();
  const diff = game.aiDifficulty ?? aiDifficulty;
  const overTitle = game.over
    ? game.winner
      ? `${playerName(game.winner)} 獲勝！`
      : "和棋！"
    : "";

  const rapfiLoadingLabel =
    rapfiLoadState.label ||
    (diff >= NIRVANA_LEVEL ? "載入涅槃引擎…" : diff >= GRANDMASTER_LEVEL ? "載入宗師快板引擎…" : "");
  const rapfiThinkingLabel =
    diff >= NIRVANA_LEVEL
      ? rapfiLoadState.mode === "lite"
        ? `涅槃思考中（快板${rapfiLoadState.failReason ? "：" + rapfiLoadState.failReason : ""}）…`
        : "涅槃思考中…"
      : "宗師思考中（快板）…";

  const displayStatus =
    statusText ||
    (rapfiLoadState.loading ? rapfiLoadingLabel : "") ||
    (waitingAi && diff >= GRANDMASTER_LEVEL ? rapfiThinkingLabel : "");

  renderDuoTurnStatusBar({
    theme: "gomoku",
    leftCard: $("#gomoku-side-black"),
    rightCard: $("#gomoku-side-white"),
    banner: $("#gomoku-turn-banner"),
    turnMain: $("#gomoku-turn-main"),
    turnSub: $("#gomoku-turn-sub"),
    leftName: playerName(game.blackPlayerId),
    rightName: playerName(whitePlayerId()),
    turn: game.over || displayStatus ? null : currentTurnSide(),
    turnPlayerName: playerName(game.currentPlayerId),
    over: game.over && !displayStatus,
    overTitle,
    waitingAi: waitingAi && !displayStatus,
    statusText: displayStatus,
    youHint: waitingAi && !displayStatus
      ? ` · ${stoneLabel(game.currentPlayerId)} · 請稍候…`
      : humanTurn && !displayStatus
        ? " · 輪到你"
        : "",
  });

  if (renjuHint) {
    if (displayStatus || game.over) {
      renjuHint.classList.remove("is-visible");
      renjuHint.setAttribute("aria-hidden", "true");
    } else {
      const isBlackTurn = game.currentPlayerId === game.blackPlayerId;
      renjuHint.classList.toggle("is-visible", isBlackTurn);
      renjuHint.setAttribute("aria-hidden", String(!isBlackTurn));
    }
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
    const forbidden = forbiddenAt(row, col);
    btn.disabled = game.over || waitingAi || !!forbidden;
    if (forbidden) {
      btn.classList.add("gomoku-cell-forbidden");
      btn.setAttribute("aria-label", `禁手：${forbiddenLabel(forbidden)}`);
      btn.title = `禁手：${forbiddenLabel(forbidden)}`;
      if (!waitingAi && !game.over) {
        btn.onclick = () => alert(`不能下這裡：${forbiddenLabel(forbidden)}`);
      }
    } else if (!game.over && !waitingAi) {
      btn.removeAttribute("title");
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

function countBoardStones() {
  if (!game) return 0;
  let n = 0;
  for (const row of game.cells) {
    for (const cell of row) {
      if (cell) n++;
    }
  }
  return n;
}

function maybePreloadNirvanaEngine() {
  if (!game || game.mode !== "ai" || game.over) return;
  const diff = game.aiDifficulty ?? aiDifficulty;
  if (diff < NIRVANA_LEVEL) return;
  if (countBoardStones() !== 2) return;
  void preloadNirvanaFullEngine();
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
  maybePreloadNirvanaEngine();
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

  if (!placeMove(row, col)) {
    if (player === game.blackPlayerId) {
      alert("此著為黑棋禁手，無法落下。");
    }
  }
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
    const diff = game.aiDifficulty ?? aiDifficulty;
    let loadPoll = null;
    if (diff >= GRANDMASTER_LEVEL) {
      loadPoll = window.setInterval(() => {
        if (token !== aiMoveToken) {
          window.clearInterval(loadPoll);
          return;
        }
        renderPlayHeader();
        if (!rapfiLoadState.loading) window.clearInterval(loadPoll);
      }, 180);
    }

    const move = await requestAiMove(game.cells, {
      aiId: game.aiPlayerId,
      blackId,
      whiteId,
      difficulty: diff,
      moveHistory: game.moveHistory || [],
    });

    if (loadPoll) window.clearInterval(loadPoll);

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

function getLocalWinTexts() {
  if (!game) return { title: "", detail: "" };
  const title = game.winner ? `${playerName(game.winner)} 獲勝！` : "和棋！";
  const detail = game.winner
    ? `${playerName(game.winner)} 的${stoneLabel(game.winner)}連成五子`
    : "棋盤已滿，沒有連五";
  return { title, detail };
}

function syncLocalReplayDock() {
  const dock = $("#gomoku-replay-dock");
  if (!dock) return;
  const overlay = $("#gomoku-win-overlay");
  const show =
    !!game?.over &&
    (game.moveHistory?.length || 0) > 0 &&
    !!overlay?.hidden &&
    !isGomokuWinCelebrationPending() &&
    (localWinUiDismissed || isGomokuReplayRunning());
  dock.hidden = !show;
}

function dismissLocalWinOverlay() {
  if (!game) return;
  localWinUiDismissed = true;
  dismissGomokuWinOverlay(
    $("#gomoku-win-overlay"),
    $("#gomoku-board-stage"),
    game.winLine,
    game.lastMove,
  );
  syncLocalReplayDock();
}

function showLocalWinOptions() {
  if (!game) return;
  const { title, detail } = getLocalWinTexts();
  localWinUiDismissed = false;
  showGomokuWinOverlayImmediate({
    overlayEl: $("#gomoku-win-overlay"),
    titleEl: $("#gomoku-win-title"),
    detailEl: $("#gomoku-win-detail"),
    title,
    detail,
  });
  const reviewBtn = $("#btn-gomoku-win-moves");
  if (reviewBtn) reviewBtn.hidden = !(game.moveHistory?.length > 0);
  syncLocalReplayDock();
}

function showWinOnBoard() {
  if (!game) return;
  localWinUiDismissed = false;
  const { title, detail } = getLocalWinTexts();
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
  syncLocalReplayDock();
}

function startLocalReplay() {
  if (!game?.moveHistory?.length) return;
  stopGomokuReplay();
  localWinUiDismissed = true;
  clearGomokuWinCelebration($("#gomoku-board-stage"), $("#gomoku-win-overlay"));
  syncLocalReplayDock();
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
      renderPlayHeader(text);
    },
    onDone: ({ cells, winLine: wl, lastMove: lm }) => {
      game.cells = cells;
      game.lastMove = lm;
      game.winLine = wl;
      renderBoard();
      if (wl) renderGomokuWinLine($("#gomoku-board-stage"), wl, lm);
      renderPlayHeader(
        game.winner
          ? `${playerName(game.winner)} 獲勝！（重播完成）`
          : "和棋！（重播完成）",
      );
      syncLocalReplayDock();
    },
  });
}

function resetBoardDom() {
  const grid = $("#gomoku-board");
  if (grid) delete grid.dataset.built;
  localWinUiDismissed = false;
  clearGomokuWinCelebration($("#gomoku-board-stage"), $("#gomoku-win-overlay"));
  syncLocalReplayDock();
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
      localWinUiDismissed = false;
      syncLocalReplayDock();
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
    localWinUiDismissed = false;
    syncLocalReplayDock();
    terminateAiWorker();
    deps.showView("home");
  });
  $("#btn-gomoku-replay-moves")?.addEventListener("click", () => {
    startLocalReplay();
  });
  $("#btn-gomoku-replay-options")?.addEventListener("click", () => {
    showLocalWinOptions();
  });
  $("#btn-gomoku-win-dismiss")?.addEventListener("click", () => {
    dismissLocalWinOverlay();
  });
  $("#btn-gomoku-win-moves")?.addEventListener("click", () => {
    startLocalReplay();
  });
  $("#btn-gomoku-win-replay")?.addEventListener("click", () => {
    stopGomokuReplay();
    localWinUiDismissed = false;
    clearGomokuWinCelebration($("#gomoku-board-stage"), $("#gomoku-win-overlay"));
    syncLocalReplayDock();
    replayGomoku();
  });
  $("#btn-gomoku-win-home")?.addEventListener("click", () => {
    clearGomokuWinCelebration($("#gomoku-board-stage"), $("#gomoku-win-overlay"));
    stopGomokuReplay();
    aiMoveToken += 1;
    aiMovePending = false;
    game = null;
    localWinUiDismissed = false;
    syncLocalReplayDock();
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
