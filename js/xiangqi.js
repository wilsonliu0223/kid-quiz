import { openDuoModePicker } from "./online-duo.js";
import { AI_PLAYER_ID, chooseAiMove } from "./xiangqi-ai.js";
import {
  ensureXiangqiBoardSvg,
  renderXiangqiBoardSvg,
  renderXiangqiStatusBar,
} from "./xiangqi-board-ui.js";
import {
  applyMove,
  cloneBoard,
  createBoard,
  gameResult,
  getLegalMovesFrom,
  shouldFlipBoardForSide,
  sideOfPiece,
} from "./xiangqi-core.js";
import { buildCheckAlert, getResolveCheckSquares } from "./xiangqi-check-ui.js";
import {
  isXiangqiReplayRunning,
  startXiangqiReplay,
  stopXiangqiReplay,
} from "./xiangqi-replay.js";
import { getChildName, otherDuoPlayer } from "./children.js";
import { getSelectedChild } from "./store.js";
import {
  canStartDuoBattle,
  getActiveDuoPlayerIds,
  refreshDuoBattleUI,
  renderDuoPickButtons,
} from "./duo-pick.js";

/** @typedef {"local"|"ai"} SetupMode */

/** @type {SetupMode} */
let setupMode = "local";
let aiDifficulty = 2;
let aiMovePending = false;
let aiMoveToken = 0;
let localWinUiDismissed = false;
let headerStatusText = "";

/** @type {{ showView: (v: string) => void, getChildNames: () => Record<string, string> } | null} */
let deps = null;

/**
 * @typedef {object} XiangqiState
 * @property {"local"|"ai"} mode
 * @property {string[][]} board
 * @property {"red"|"black"} turn
 * @property {string} redPlayerId
 * @property {string} blackPlayerId
 * @property {boolean} over
 * @property {"red"|"black"|null} winner
 * @property {string} [endReason]
 * @property {number} [aiDifficulty]
 * @property {string} [humanPlayerId]
 * @property {string} [aiPlayerId]
 * @property {[number, number]|null} selected
 * @property {[number, number]|null} lastMove
 * @property {boolean} viewFlipped
 * @property {{ from: [number, number], to: [number, number] }[]} moveHistory
 */

/** @type {XiangqiState | null} */
let game = null;

const $ = (sel) => document.querySelector(sel);

const AI_LEVELS = [
  { level: 1, label: "入門", desc: "隨機合法走法，適合剛學規則。" },
  { level: 2, label: "普通", desc: "會吃子、會將軍，日常陪練。" },
  { level: 3, label: "高手", desc: "簡短搜尋，中盤較難僥倖。" },
  { level: 4, label: "大師", desc: "較深搜尋，棋力明顯提升。" },
];

function playerName(id) {
  if (!id) return "—";
  if (id === AI_PLAYER_ID) return "電腦";
  const names = deps?.getChildNames() || {};
  return names[id] || getChildName(id) || id;
}

function sideName(side) {
  return side === "red" ? "紅方" : "黑方";
}

function playerSide(playerId) {
  if (!game) return null;
  if (playerId === game.redPlayerId) return "red";
  if (playerId === game.blackPlayerId) return "black";
  return null;
}

function sidePlayerId(side) {
  if (!game) return "";
  return side === "red" ? game.redPlayerId : game.blackPlayerId;
}

export function renderXiangqiHomePlayers() {
  refreshDuoBattleUI();
}

function setFirstScreenMode(mode) {
  setupMode = mode;
  $("#xiangqi-local-setup")?.toggleAttribute("hidden", mode !== "local");
  $("#xiangqi-ai-setup")?.toggleAttribute("hidden", mode !== "ai");
  const title = $("#xiangqi-first-title");
  const meta = $("#xiangqi-first-meta");
  if (mode === "ai") {
    if (title) title.textContent = "象棋 · 對電腦";
    if (meta) meta.textContent = "9×10 · 紅先 · 台灣象棋規則";
    renderAiSetup();
  } else {
    if (title) title.textContent = "誰執紅（先手）？";
    if (meta) meta.textContent = "9×10 · 紅先 · 台灣象棋規則";
    renderLocalPick();
  }
}

function renderLocalPick() {
  refreshDuoBattleUI();
  renderDuoPickButtons("#xiangqi-pick-btns", {
    onPick: startLocalGame,
    labelSuffix: " 執紅（先手）",
  });
}

function renderAiSetup() {
  const active = getSelectedChild();
  const nameEl = $("#xiangqi-ai-active-name");
  if (nameEl) nameEl.textContent = active ? playerName(active) : "—";
  const chips = $("#xiangqi-ai-difficulty-chips");
  if (chips) {
    chips.innerHTML = "";
    for (const d of AI_LEVELS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `xiangqi-ai-card${aiDifficulty === d.level ? " is-selected" : ""}`;
      btn.innerHTML = `<strong>${d.label}</strong><span>${d.desc}</span>`;
      btn.addEventListener("click", () => {
        aiDifficulty = d.level;
        renderAiSetup();
      });
      chips.appendChild(btn);
    }
  }
  const startBox = $("#xiangqi-ai-start-btns");
  if (!startBox) return;
  startBox.innerHTML = "";
  const humanRed = document.createElement("button");
  humanRed.type = "button";
  humanRed.className = "btn btn-secondary btn-block";
  humanRed.textContent = `我執紅（先手）`;
  humanRed.addEventListener("click", () => startAiGame(true));
  const aiRed = document.createElement("button");
  aiRed.type = "button";
  aiRed.className = "btn btn-secondary btn-block";
  aiRed.textContent = `電腦執紅（先手）`;
  aiRed.addEventListener("click", () => startAiGame(false));
  startBox.append(humanRed, aiRed);
}

function startLocalGame(redPlayerId) {
  if (!canStartDuoBattle()) return;
  const ids = getActiveDuoPlayerIds();
  const blackPlayerId = otherDuoPlayer(redPlayerId, ids);
  beginGame({
    mode: "local",
    redPlayerId,
    blackPlayerId,
  });
}

function startAiGame(humanRed) {
  const humanId = getSelectedChild();
  if (!humanId) {
    alert("請在首頁選「誰在練習」");
    return;
  }
  beginGame({
    mode: "ai",
    aiDifficulty,
    redPlayerId: humanRed ? humanId : AI_PLAYER_ID,
    blackPlayerId: humanRed ? AI_PLAYER_ID : humanId,
    humanPlayerId: humanId,
    aiPlayerId: AI_PLAYER_ID,
  });
}

function resolveViewFlipped(opts) {
  if (opts.mode === "ai" && opts.humanPlayerId) {
    const humanSide = opts.humanPlayerId === opts.redPlayerId ? "red" : "black";
    return shouldFlipBoardForSide(humanSide);
  }
  if (opts.mode === "local") {
    const active = getSelectedChild();
    if (active === opts.blackPlayerId) return true;
    if (active === opts.redPlayerId) return false;
  }
  return false;
}

function beginGame(opts) {
  aiMoveToken += 1;
  aiMovePending = false;
  localWinUiDismissed = false;
  headerStatusText = "";
  stopXiangqiReplay();
  game = {
    mode: opts.mode,
    board: createBoard(),
    turn: "red",
    redPlayerId: opts.redPlayerId,
    blackPlayerId: opts.blackPlayerId,
    over: false,
    winner: null,
    aiDifficulty: opts.aiDifficulty,
    humanPlayerId: opts.humanPlayerId,
    aiPlayerId: opts.aiPlayerId,
    selected: null,
    lastMove: null,
    viewFlipped: resolveViewFlipped(opts),
    moveHistory: [],
  };
  resetBoardDom();
  renderBoard();
  maybeScheduleAiMove();
}

function resetBoardDom() {
  const svg = $("#xiangqi-board");
  if (svg) {
    svg.replaceWith(svg.cloneNode(false));
  }
  $("#xiangqi-win-overlay")?.setAttribute("hidden", "");
  syncReplayDock();
  deps?.showView("xiangqiPlay");
}

function ensureBoardSvg() {
  const svg = $("#xiangqi-board");
  return ensureXiangqiBoardSvg(svg, onPointClick);
}

function legalTargets() {
  if (!game?.selected) return [];
  const [sr, sc] = game.selected;
  return getLegalMovesFrom(game.board, game.turn, sr, sc).map((m) => m.to);
}

function renderBoard() {
  const svg = ensureBoardSvg();
  if (!svg || !game) return;
  const legal = new Set(legalTargets().map(([r, c]) => `${r},${c}`));
  const checkAlert =
    !game.over && !headerStatusText
      ? buildCheckAlert(game.board, game.turn, game.selected, {
          youLabel: game.mode === "ai" ? "你" : sideName(game.turn),
        })
      : null;
  const resolveCheck = checkAlert
    ? getResolveCheckSquares(game.board, game.turn)
    : new Set();
  const replaying = isXiangqiReplayRunning();
  const humanSide = playerSide(game.humanPlayerId);
  renderXiangqiBoardSvg(svg, {
    board: game.board,
    selected: replaying ? null : game.selected,
    lastMove: game.lastMove,
    legal: replaying ? new Set() : legal,
    resolveCheck: replaying ? new Set() : resolveCheck,
    kingInCheck: replaying ? null : checkAlert?.kingPos || null,
    over: game.over,
    interactive:
      !replaying &&
      !(game.mode === "ai" && game.turn !== humanSide),
    flipped: game.viewFlipped,
  });
  renderPlayHeader(checkAlert);
}

function getWinTexts() {
  if (!game) return { title: "", detail: "" };
  if (!game.winner) {
    return { title: "和棋", detail: game.endReason || "" };
  }
  const winPlayer = sidePlayerId(game.winner);
  return {
    title: `${playerName(winPlayer)} 獲勝！`,
    detail: `${sideName(game.winner)} · ${game.endReason || "勝"}`,
  };
}

function syncReplayDock() {
  const dock = $("#xiangqi-replay-dock");
  if (!dock) return;
  const overlay = $("#xiangqi-win-overlay");
  const show =
    !!game?.over &&
    (game.moveHistory?.length || 0) > 0 &&
    !!overlay?.hidden &&
    (localWinUiDismissed || isXiangqiReplayRunning());
  dock.hidden = !show;
}

function dismissWinOverlay() {
  if (!game) return;
  localWinUiDismissed = true;
  $("#xiangqi-win-overlay")?.setAttribute("hidden", "");
  syncReplayDock();
}

function showWinOptions() {
  if (!game) return;
  const { title, detail } = getWinTexts();
  localWinUiDismissed = false;
  const titleEl = $("#xiangqi-win-title");
  const detailEl = $("#xiangqi-win-detail");
  if (titleEl) titleEl.textContent = title;
  if (detailEl) detailEl.textContent = detail;
  $("#xiangqi-win-overlay")?.removeAttribute("hidden");
  const reviewBtn = $("#btn-xiangqi-win-moves");
  if (reviewBtn) reviewBtn.hidden = !(game.moveHistory?.length > 0);
  syncReplayDock();
}

function startLocalReplay() {
  if (!game?.moveHistory?.length) return;
  stopXiangqiReplay();
  localWinUiDismissed = true;
  $("#xiangqi-win-overlay")?.setAttribute("hidden", "");
  syncReplayDock();
  const moves = game.moveHistory.map((m) => ({ ...m }));
  const lastMove = game.lastMove;

  startXiangqiReplay({
    moves,
    lastMove,
    onStep: ({ board, lastMove: lm }) => {
      game.board = board;
      game.lastMove = lm;
      game.selected = null;
      renderBoard();
    },
    onStatus: (text) => {
      headerStatusText = text;
      renderPlayHeader();
    },
    onDone: ({ board, lastMove: lm }) => {
      game.board = board;
      game.lastMove = lm;
      game.selected = null;
      headerStatusText = game.winner
        ? `${playerName(sidePlayerId(game.winner))} 獲勝！（重播完成）`
        : "和棋！（重播完成）";
      renderBoard();
      syncReplayDock();
    },
  });
}

function buildCurrentCheckAlert() {
  if (!game || game.over || headerStatusText) return null;
  return buildCheckAlert(game.board, game.turn, game.selected, {
    youLabel: game.mode === "ai" ? "你" : sideName(game.turn),
  });
}

function renderPlayHeader(checkAlert = buildCurrentCheckAlert()) {
  if (!game) return;
  const humanSide = playerSide(game.humanPlayerId);
  const isHumanTurn =
    game.mode !== "ai" || (!game.over && game.turn === humanSide);
  const waitingAi =
    game.mode === "ai" &&
    !game.over &&
    game.turn === playerSide(AI_PLAYER_ID) &&
    aiMovePending;

  renderXiangqiStatusBar({
    redCard: $("#xiangqi-side-red"),
    blackCard: $("#xiangqi-side-black"),
    banner: $("#xiangqi-turn-banner"),
    turnMain: $("#xiangqi-turn-main"),
    turnSub: $("#xiangqi-turn-sub"),
    redName: playerName(game.redPlayerId),
    blackName: playerName(game.blackPlayerId),
    turn: game.over || headerStatusText ? null : game.turn,
    turnPlayerName: playerName(sidePlayerId(game.turn)),
    over: game.over && !headerStatusText,
    overTitle: game.winner
      ? `${playerName(sidePlayerId(game.winner))} 獲勝！`
      : "和棋",
    waitingAi: waitingAi && !headerStatusText,
    statusText: headerStatusText,
    youHint: isHumanTurn ? " · 輪到你" : "",
    inCheck: !!checkAlert,
    checkEl: $("#xiangqi-check-hint"),
    checkTitleEl: $("#xiangqi-check-title"),
    checkDetailEl: $("#xiangqi-check-detail"),
    checkTitle: checkAlert?.title || "",
    checkDetail: checkAlert?.detail || "",
  });
}

function showWinOverlay() {
  if (!game) return;
  localWinUiDismissed = false;
  headerStatusText = "";
  const { title, detail } = getWinTexts();
  const titleEl = $("#xiangqi-win-title");
  const detailEl = $("#xiangqi-win-detail");
  if (titleEl) titleEl.textContent = title;
  if (detailEl) detailEl.textContent = detail;
  $("#xiangqi-win-overlay")?.removeAttribute("hidden");
  const reviewBtn = $("#btn-xiangqi-win-moves");
  if (reviewBtn) reviewBtn.hidden = !(game.moveHistory?.length > 0);
  syncReplayDock();
}

function finishAfterMove(move) {
  game.lastMove = move.to;
  game.selected = null;
  const nextTurn = game.turn === "red" ? "black" : "red";
  const terminal = gameResult(game.board, nextTurn);
  if (terminal) {
    game.over = true;
    game.winner = terminal.winner;
    game.endReason = terminal.reason;
    aiMovePending = false;
    renderBoard();
    showWinOverlay();
    return;
  }
  game.turn = nextTurn;
  renderBoard();
  maybeScheduleAiMove();
}

function tryMove(fromR, fromC, toR, toC) {
  const moves = getLegalMovesFrom(game.board, game.turn, fromR, fromC);
  const move = moves.find((m) => m.to[0] === toR && m.to[1] === toC);
  if (!move) return false;
  if (!game.moveHistory) game.moveHistory = [];
  game.moveHistory.push({ from: move.from, to: move.to });
  game.board = applyMove(game.board, move);
  finishAfterMove(move);
  return true;
}

function onPointClick(r, c) {
  if (!game || game.over || isXiangqiReplayRunning()) return;
  if (game.mode === "ai" && game.turn !== playerSide(game.humanPlayerId)) return;

  const piece = game.board[r][c];
  if (game.selected) {
    const [sr, sc] = game.selected;
    if (sr === r && sc === c) {
      game.selected = null;
      renderBoard();
      return;
    }
    if (tryMove(sr, sc, r, c)) return;
  }

  if (piece && sideOfPiece(piece) === game.turn) {
    game.selected = [r, c];
    renderBoard();
  }
}

function maybeScheduleAiMove() {
  if (!game || game.over || game.mode !== "ai") return;
  const aiSide = playerSide(AI_PLAYER_ID);
  if (game.turn !== aiSide) return;
  aiMovePending = true;
  renderPlayHeader();
  const token = ++aiMoveToken;
  setTimeout(() => {
    if (!game || token !== aiMoveToken || game.over) return;
    const move = chooseAiMove({
      board: cloneBoard(game.board),
      turn: game.turn,
      aiSide,
      level: game.aiDifficulty || 2,
    });
    if (!move) return;
    if (!game.moveHistory) game.moveHistory = [];
    game.moveHistory.push({ from: move.from, to: move.to });
    game.board = applyMove(game.board, move);
    aiMovePending = false;
    finishAfterMove(move);
  }, 280);
}

export function beginXiangqiFromHome() {
  openDuoModePicker({
    game: "xiangqi",
    title: "象棋",
    backView: "home",
    localStart: beginXiangqiLocal,
    aiStart: beginXiangqiAi,
  });
}

export function beginXiangqiLocal() {
  if (!canStartDuoBattle()) return;
  setFirstScreenMode("local");
  renderLocalPick();
  deps?.showView("xiangqiFirst");
}

export function beginXiangqiAi() {
  setFirstScreenMode("ai");
  deps?.showView("xiangqiFirst");
}

export function initXiangqi(d) {
  deps = d;
  bindXiangqiEvents();
}

function bindXiangqiEvents() {
  if (bindXiangqiEvents.done) return;
  bindXiangqiEvents.done = true;

  $("#btn-start-xiangqi")?.addEventListener("click", (e) => {
    e.preventDefault();
    beginXiangqiFromHome();
  });
  $("#btn-xiangqi-first-back")?.addEventListener("click", () => {
    if (setupMode === "ai") deps?.showView("duoMode");
    else deps?.showView("home");
  });
  $("#btn-xiangqi-play-back")?.addEventListener("click", () => {
    if (confirm("離開棋局？目前進度不會儲存。")) {
      aiMoveToken += 1;
      stopXiangqiReplay();
      game = null;
      deps?.showView("home");
    }
  });
  $("#btn-xiangqi-win-dismiss")?.addEventListener("click", () => {
    dismissWinOverlay();
  });
  $("#btn-xiangqi-replay-moves")?.addEventListener("click", () => {
    startLocalReplay();
  });
  $("#btn-xiangqi-replay-options")?.addEventListener("click", () => {
    showWinOptions();
  });
  $("#btn-xiangqi-win-moves")?.addEventListener("click", () => {
    startLocalReplay();
  });
  $("#btn-xiangqi-win-replay")?.addEventListener("click", () => {
    if (!game) return;
    beginGame({
      mode: game.mode,
      redPlayerId: game.redPlayerId,
      blackPlayerId: game.blackPlayerId,
      aiDifficulty: game.aiDifficulty,
      humanPlayerId: game.humanPlayerId,
      aiPlayerId: game.aiPlayerId,
    });
  });
  $("#btn-xiangqi-win-home")?.addEventListener("click", () => {
    game = null;
    deps?.showView("home");
  });
}
