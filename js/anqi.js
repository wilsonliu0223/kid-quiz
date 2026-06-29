import { openDuoModePicker } from "./online-duo.js";
import {
  applyAction,
  cloneState,
  createInitialState,
  decodeAction,
  ensureAnqiWasm,
  flipAction,
  HIDDEN,
  cannonLeapInfo,
  isCannonCode,
  cellManhattan,
  legalActions,
  legalFlipCells,
  legalMovesFromCell,
  moveAction,
  pieceSide,
  playerSide,
  playerToMove,
  sidePlayerIdx,
  turnColorSide,
} from "./anqi-engine.js";
import {
  applyAnqiViewFlip,
  ensureAnqiBoardSvg,
  renderAnqiBoardSvg,
  renderAnqiStatusBar,
  rebuildAnqiBoardSvg,
  resetAnqiBoardSvg,
} from "./anqi-board-ui.js";
import {
  AI_PLAYER_ID,
  ANQI_AI_LEVELS,
  anqiAiLevelLabel,
  requestAnqiAiMove,
} from "./anqi-ai.js";
import {
  ANQI_PRESENT,
  animateAnqiAction,
  describeAnqiAction,
  setAnqiActionToast,
  sleep,
} from "./anqi-present.js";
import { getChildName, otherDuoPlayer } from "./children.js";
import { getSelectedChild } from "./store.js";
import {
  getActiveDuoPlayerIds,
  getDuoBattleBlockReason,
  refreshDuoBattleUI,
  renderDuoPickButtons,
} from "./duo-pick.js";

/** @typedef {"local"|"ai"} SetupMode */

/** @type {SetupMode} */
let setupMode = "local";
let aiDifficulty = 3;
let aiMovePending = false;
let aiMoveToken = 0;
let localWinUiDismissed = false;
let actionPresenting = false;
let presentToken = 0;
let beginGameToken = 0;

/** @type {{ showView: (v: string) => void, getChildNames: () => Record<string, string> } | null} */
let deps = null;

/**
 * @typedef {object} AnqiState
 * @property {"local"|"ai"} mode
 * @property {Int16Array} state
 * @property {number} seed
 * @property {string[]} playerIds
 * @property {number} humanPlayerIdx
 * @property {number} [aiPlayerIdx]
 * @property {number} [aiDifficulty]
 * @property {boolean} over
 * @property {number|null} winnerPlayerIdx
 * @property {number|null} selected
 * @property {number|null} lastFrom
 * @property {number|null} lastTo
 * @property {boolean} viewFlipped
 * @property {{ action: number }[]} actionHistory
 */

/** @type {AnqiState | null} */
let game = null;

const $ = (sel) => document.querySelector(sel);

function playerName(id) {
  if (id === AI_PLAYER_ID) {
    if (game?.mode === "ai") {
      const label = anqiAiLevelLabel(game.aiDifficulty ?? aiDifficulty);
      return label ? `電腦（${label}）` : "電腦";
    }
    return "電腦";
  }
  const names = deps?.getChildNames() || {};
  return names[id] || getChildName(id) || id;
}

function playerIdForIdx(idx) {
  if (!game) return "";
  if (game.mode === "ai") {
    return idx === game.humanPlayerIdx
      ? game.playerIds[game.humanPlayerIdx]
      : AI_PLAYER_ID;
  }
  return game.playerIds[idx] || "";
}

function redBlackDisplayNames() {
  if (!game) return { redName: "—", blackName: "—" };
  const rIdx = sidePlayerIdx(game.state, "red");
  const bIdx = sidePlayerIdx(game.state, "black");
  if (rIdx != null && bIdx != null) {
    return {
      redName: playerName(playerIdForIdx(rIdx)),
      blackName: playerName(playerIdForIdx(bIdx)),
    };
  }

  if (game.mode === "ai") {
    const humanName = playerName(game.playerIds[game.humanPlayerIdx]);
    const aiName = playerName(AI_PLAYER_ID);
    const humanSide = playerSide(game.state, game.humanPlayerIdx);
    const aiIdx = game.aiPlayerIdx ?? (game.humanPlayerIdx === 0 ? 1 : 0);
    const aiSide = playerSide(game.state, aiIdx);
    return {
      redName:
        rIdx != null
          ? playerName(playerIdForIdx(rIdx))
          : humanSide === "red"
            ? humanName
            : aiSide === "red"
              ? aiName
              : humanName,
      blackName:
        bIdx != null
          ? playerName(playerIdForIdx(bIdx))
          : humanSide === "black"
            ? humanName
            : aiSide === "black"
              ? aiName
              : aiName,
    };
  }

  return {
    redName: rIdx != null ? playerName(playerIdForIdx(rIdx)) : "翻棋定色",
    blackName: bIdx != null ? playerName(playerIdForIdx(bIdx)) : "翻棋定色",
  };
}

function aiOpponentLabel() {
  if (!game || game.mode !== "ai") return "";
  const label = playerName(AI_PLAYER_ID);
  return label ? `對手：${label}` : "對手：電腦";
}

function myPlayerIdx() {
  if (!game) return null;
  if (game.mode === "ai") return game.humanPlayerIdx;
  return playerToMove(game.state);
}

function isInputLocked() {
  return actionPresenting || aiMovePending;
}

function isHumanTurn() {
  if (!game || game.over || isInputLocked()) return false;
  if (game.mode === "ai") {
    return playerToMove(game.state) === game.humanPlayerIdx;
  }
  return true;
}

function resolveViewFlipped() {
  if (!game || game.mode !== "ai") return false;
  const side = playerSide(game.state, game.humanPlayerIdx);
  return side === "black";
}

export function renderAnqiHomePlayers() {
  refreshDuoBattleUI();
}

function setFirstScreenMode(mode) {
  setupMode = mode;
  $("#anqi-local-setup")?.toggleAttribute("hidden", mode !== "local");
  $("#anqi-ai-setup")?.toggleAttribute("hidden", mode !== "ai");
  const title = $("#anqi-first-title");
  const meta = $("#anqi-first-meta");
  if (mode === "ai") {
    if (title) title.textContent = "暗棋 · 挑戰 AI";
    if (meta) meta.textContent = "4×8 · 翻棋定色 · 台灣暗棋規則";
    renderAiSetup();
  } else {
    if (title) title.textContent = "暗棋 · 誰先手？";
    if (meta) meta.textContent = "4×8 · 先手翻棋定色 · 吃完對方棋子獲勝";
    renderLocalPick();
  }
}

function renderLocalPick() {
  refreshDuoBattleUI();
  renderDuoPickButtons("#anqi-pick-btns", {
    onPick: startLocalGame,
    labelSuffix: " 先手",
  });
}

function renderAiDifficultyChips() {
  const wrap = $("#anqi-ai-difficulty-chips");
  if (!wrap) return;
  wrap.innerHTML = "";
  const descs = {
    1: "隨機翻走，熟悉規則。",
    2: "banqi 引擎深度 2。",
    3: "banqi 引擎深度 3。",
    4: "深度 3 · 約 2.5 秒思考。",
    5: "深度 4 · 約 6 秒思考。",
    6: "MCTS 開源最強 banqi 引擎。",
  };
  for (const item of ANQI_AI_LEVELS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `xiangqi-ai-card${aiDifficulty === item.level ? " is-selected" : ""}`;
    btn.innerHTML = `<strong>${item.label}</strong><span>${descs[item.level] || ""}</span>`;
    btn.addEventListener("click", () => {
      aiDifficulty = item.level;
      renderAiSetup();
    });
    wrap.appendChild(btn);
  }
}

function renderAiSetup() {
  const active = getSelectedChild();
  const nameEl = $("#anqi-ai-active-name");
  if (nameEl) nameEl.textContent = active ? playerName(active) : "—";
  renderAiDifficultyChips();
  const wrap = $("#anqi-ai-start-btns");
  if (!wrap) return;
  wrap.innerHTML = "";
  const humanFirst = document.createElement("button");
  humanFirst.type = "button";
  humanFirst.className = "btn btn-secondary btn-block";
  humanFirst.textContent = "我先手（翻棋定色）";
  humanFirst.addEventListener("click", () => startAiGame(true));
  const aiFirst = document.createElement("button");
  aiFirst.type = "button";
  aiFirst.className = "btn btn-secondary btn-block";
  const aiLabel = anqiAiLevelLabel(aiDifficulty) || "電腦";
  aiFirst.textContent = `電腦先手（${aiLabel}）`;
  aiFirst.addEventListener("click", () => startAiGame(false));
  wrap.append(humanFirst, aiFirst);
}

/**
 * @param {string} firstPlayerId
 */
function startLocalGame(firstPlayerId) {
  const block = getDuoBattleBlockReason();
  if (block) {
    alert(block);
    renderLocalPick();
    return;
  }
  const ids = getActiveDuoPlayerIds();
  const secondId = otherDuoPlayer(firstPlayerId, ids);
  void beginGame({
    mode: "local",
    playerIds: [firstPlayerId, secondId],
    humanPlayerIdx: 0,
    firstIsHuman: true,
  });
}

/**
 * @param {boolean} humanFirst
 */
function startAiGame(humanFirst) {
  const humanId = getSelectedChild();
  if (!humanId) {
    alert("請在首頁選「誰在練習」");
    return;
  }
  void beginGame({
    mode: "ai",
    playerIds: [humanId, AI_PLAYER_ID],
    humanPlayerIdx: humanFirst ? 0 : 1,
    aiPlayerIdx: humanFirst ? 1 : 0,
    aiDifficulty,
  }).catch((e) => {
    console.error(e);
    alert("開局失敗，請重新整理頁面（Ctrl+Shift+R）後再試。");
  });
}

/**
 * @param {object} opts
 */
async function beginGame(opts) {
  const token = ++beginGameToken;
  aiMoveToken += 1;
  aiMovePending = false;
  localWinUiDismissed = false;
  try {
    await ensureAnqiWasm();
  } catch (e) {
    console.error(e);
    alert("暗棋引擎載入失敗，請重新整理頁面（Ctrl+Shift+R）後再試。");
    return;
  }
  if (token !== beginGameToken) return;
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  game = {
    mode: opts.mode,
    state: createInitialState(seed),
    seed,
    playerIds:
      opts.mode === "ai"
        ? [opts.playerIds[0], AI_PLAYER_ID]
        : opts.playerIds,
    humanPlayerIdx: opts.humanPlayerIdx ?? 0,
    aiPlayerIdx: opts.aiPlayerIdx,
    aiDifficulty: opts.aiDifficulty,
    over: false,
    winnerPlayerIdx: null,
    selected: null,
    lastFrom: null,
    lastTo: null,
    viewFlipped: false,
    actionHistory: [],
  };
  game.viewFlipped = resolveViewFlipped();
  resetBoardDom();
  if (token !== beginGameToken) return;
  renderBoard();
  maybeScheduleAiMove();
}

function resetBoardDom() {
  const svg = $("#anqi-board");
  if (svg) {
    resetAnqiBoardSvg(svg);
    svg.replaceChildren();
    svg.setAttribute("class", "anqi-svg");
    svg.classList.remove("anqi-svg-flipped");
  }
  $("#anqi-win-overlay")?.setAttribute("hidden", "");
  deps?.showView("anqiPlay");
}

function abandonAnqiGame() {
  beginGameToken += 1;
  aiMoveToken += 1;
  presentToken += 1;
  actionPresenting = false;
  aiMovePending = false;
  game = null;
  setAnqiActionToast("");
  $("#anqi-play-meta")?.setAttribute("hidden", "");
}

/**
 * @param {{ toSetup?: boolean }} [opts]
 */
function requestLeaveAnqiPlay(opts = {}) {
  if (!game) {
    deps?.showView(setupMode === "ai" ? "anqiFirst" : "xiangqiVariant");
    return;
  }
  const wasAi = game.mode === "ai";
  const inProgress = !game.over;
  const msg = inProgress
    ? "離開棋局？這局將放棄，進度不會儲存。"
    : "離開棋局？";
  if (!confirm(msg)) return;
  abandonAnqiGame();
  if (opts.toSetup || wasAi) {
    setFirstScreenMode(wasAi ? "ai" : "local");
    deps?.showView("anqiFirst");
  } else {
    deps?.showView("xiangqiVariant");
  }
}

function goToAnqiSetupFromResult() {
  if (!game) return;
  const wasAi = game.mode === "ai";
  abandonAnqiGame();
  setFirstScreenMode(wasAi ? "ai" : "local");
  deps?.showView("anqiFirst");
}

function ensureBoardSvg() {
  const svg = $("#anqi-board");
  if (!svg) return null;
  if (!svg.querySelector(".anqi-cell")) {
    return rebuildAnqiBoardSvg(svg, onCellClick);
  }
  return ensureAnqiBoardSvg(svg, onCellClick);
}

function computeUiTargets() {
  if (!game || game.over || !isHumanTurn()) {
    return { targets: [], jumpTargets: [], captureTargets: [], screenTargets: [], flipTargets: [] };
  }
  const acts = legalActions(game.state);
  const flipTargets = acts.filter((a) => decodeAction(a).isFlip).map((a) => decodeAction(a).from);
  if (game.selected == null) {
    return { targets: [], jumpTargets: [], captureTargets: [], screenTargets: [], flipTargets };
  }
  const from = game.selected;
  const fromCode = game.state[from];
  const moves = legalMovesFromCell(game.state, from);
  const targets = [];
  const jumpTargets = [];
  const captureTargets = [];
  const screenTargets = new Set();
  for (const a of moves) {
    const to = decodeAction(a).to;
    targets.push(to);
    const toCode = game.state[to];
    if (toCode !== 0 && toCode !== HIDDEN) captureTargets.push(to);
    if (isCannonCode(fromCode) && cellManhattan(from, to) > 1) {
      jumpTargets.push(to);
      const leap = cannonLeapInfo(game.state, from, to);
      if (leap.ok && leap.screen != null) screenTargets.add(leap.screen);
    }
  }
  return {
    targets,
    jumpTargets,
    captureTargets,
    screenTargets: [...screenTargets],
    flipTargets,
  };
}

function renderBoard() {
  if (!game) return;
  const svg = ensureBoardSvg();
  if (!svg) return;
  const { targets, jumpTargets, captureTargets, screenTargets, flipTargets } = computeUiTargets();
  applyAnqiViewFlip(svg, game.viewFlipped);

  let drawState = game.state;
  let presFrom = null;
  let presTo = null;
  let presCapture = false;
  if (actionPresenting && game.presentation) {
    const p = game.presentation;
    presFrom = p.from;
    presTo = p.to;
    presCapture = p.isCapture;
    drawState = cloneState(p.before);
    if (!p.isFlip) {
      drawState[p.from] = 0;
    }
  }

  renderAnqiBoardSvg(svg, {
    state: drawState,
    selected: game.selected,
    targets,
    jumpTargets,
    captureTargets,
    screenTargets,
    flipTargets: game.selected == null ? flipTargets : [],
    lastFrom: actionPresenting ? null : game.lastFrom,
    lastTo: actionPresenting ? null : game.lastTo,
    presFrom,
    presTo,
    presCapture,
    presScreen: actionPresenting && game.presentation?.screen != null ? game.presentation.screen : null,
  });
  renderStatusBar();
  syncWinOverlay();
  $("#anqi-board")
    ?.closest(".anqi-board-wrap")
    ?.classList.toggle("is-presenting", actionPresenting);

  const hintEl = $("#anqi-play-hint");
  if (hintEl && !actionPresenting) {
    const from = game.selected;
    const fromCode = from != null ? drawState[from] : 0;
    if (from != null && isCannonCode(fromCode) && jumpTargets.length > 0) {
      hintEl.textContent =
        "炮／包：可直橫走一格；遠距吃子時紫色為炮架（恰好一子），橘色遠格、紅閃為隔架吃子，不可隔兩子";
    } else {
      hintEl.textContent =
        "點暗棋翻開 · 明子直橫走一格（炮／包遠距僅能隔一子跳吃）· 炮架可明可暗";
    }
  }
}

function renderStatusBar() {
  if (!game) return;
  const { redName, blackName } = redBlackDisplayNames();
  const turn = turnColorSide(game.state);
  const turnIdx = playerToMove(game.state);
  const waitingAi = game.mode === "ai" && !game.over && (aiMovePending || actionPresenting);
  let turnPlayerName = playerName(playerIdForIdx(turnIdx));
  if (turn == null) turnPlayerName = playerName(playerIdForIdx(turnIdx));

  let statusText = "";
  if (aiMovePending) statusText = "電腦思考中…";
  else if (actionPresenting && game.presentation?.hint) statusText = game.presentation.hint;

  renderAnqiStatusBar({
    leftCard: $("#anqi-side-red"),
    rightCard: $("#anqi-side-black"),
    banner: $("#anqi-turn-banner"),
    turnMain: $("#anqi-turn-main"),
    turnSub: $("#anqi-turn-sub"),
    redName,
    blackName,
    turn,
    turnPlayerName,
    over: game.over,
    overTitle: game.winnerPlayerIdx != null
      ? `${playerName(playerIdForIdx(game.winnerPlayerIdx))} 獲勝！`
      : "和棋",
    waitingAi,
    statusText,
    extraEl: $("#anqi-play-meta"),
    extraText: aiOpponentLabel(),
    extraVisible: game.mode === "ai",

function syncWinOverlay() {
  const overlay = $("#anqi-win-overlay");
  if (!overlay || !game) return;
  if (!game.over || localWinUiDismissed) {
    overlay.setAttribute("hidden", "");
    return;
  }
  overlay.removeAttribute("hidden");
  const title = $("#anqi-win-title");
  const detail = $("#anqi-win-detail");
  if (title) {
    title.textContent =
      game.winnerPlayerIdx != null
        ? `${playerName(playerIdForIdx(game.winnerPlayerIdx))} 獲勝！`
        : "和棋";
  }
  if (detail) {
    detail.textContent =
      game.winnerPlayerIdx != null
        ? "暗棋對局結束"
        : "雙方和棋";
  }
}

function dismissWinOverlay() {
  localWinUiDismissed = true;
  $("#anqi-win-overlay")?.setAttribute("hidden", "");
}

function applyCommit(action, result) {
  if (!game) return;
  const dec = decodeAction(action);
  game.state = cloneState(result.state);
  game.actionHistory.push({ action });
  game.selected = null;
  game.lastFrom = dec.from;
  game.lastTo = dec.isFlip ? dec.from : dec.to;
  game.viewFlipped = resolveViewFlipped();
  if (result.done) {
    game.over = true;
    game.winnerPlayerIdx = result.draw ? null : result.winner;
    aiMovePending = false;
  }
}

async function commitAction(action, result, { presenter = "human" } = {}) {
  if (!game) return;
  const usePresent = game.mode === "ai";
  if (!usePresent) {
    applyCommit(action, result);
    renderBoard();
    maybeScheduleAiMove();
    return;
  }

  const token = ++presentToken;
  const isAi = presenter === "ai";
  const dec = decodeAction(action);
  const before = cloneState(game.state);
  const isCapture = !dec.isFlip && before[dec.to] !== 0 && before[dec.to] !== HIDDEN;
  const leap =
    !dec.isFlip && isCannonCode(before[dec.from])
      ? cannonLeapInfo(before, dec.from, dec.to)
      : null;

  actionPresenting = true;
  game.presentation = {
    before,
    from: dec.from,
    to: dec.isFlip ? dec.from : dec.to,
    screen: leap?.ok ? leap.screen : null,
    isFlip: dec.isFlip,
    isCapture,
    hint: describeAnqiAction(dec, before, isAi),
  };
  game.selected = null;
  setAnqiActionToast($("#anqi-action-toast"), game.presentation.hint);
  renderBoard();

  await sleep(isAi ? ANQI_PRESENT.aiPreShowMs : ANQI_PRESENT.humanPreShowMs);
  if (!game || token !== presentToken) return;

  await animateAnqiAction($("#anqi-board"), { action, stateBefore: before });
  if (!game || token !== presentToken) return;

  applyCommit(action, result);
  game.presentation = null;
  renderBoard();

  await sleep(isAi ? ANQI_PRESENT.aiPostHoldMs : ANQI_PRESENT.humanPostHoldMs);
  if (!game || token !== presentToken) return;

  actionPresenting = false;
  setAnqiActionToast($("#anqi-action-toast"), "");
  renderBoard();
  maybeScheduleAiMove();
}

function finishAfterAction(action, result) {
  void commitAction(action, result, { presenter: "human" });
}

/**
 * @param {number} action
 */
function tryApplyAction(action) {
  if (!game || game.over || !isHumanTurn()) return;
  const legal = legalActions(game.state);
  if (!legal.includes(action)) return;
  const result = applyAction(game.state, action, game.seed);
  finishAfterAction(action, result);
}

/**
 * @param {number} index
 */
function onCellClick(index) {
  if (!game || game.over || !isHumanTurn()) return;
  const me = myPlayerIdx();
  if (me == null) return;
  const myColor = playerSide(game.state, me);
  const code = game.state[index];

  if (game.selected != null) {
    if (game.selected === index) {
      game.selected = null;
      renderBoard();
      return;
    }
    const moveActs = legalMovesFromCell(game.state, game.selected);
    const hit = moveActs.find((a) => decodeAction(a).to === index);
    if (hit != null) {
      tryApplyAction(hit);
      return;
    }
    if (myColor && code !== 0 && pieceSide(code) === myColor) {
      game.selected = index;
      renderBoard();
      return;
    }
  }

  const flips = legalFlipCells(game.state);
  if (flips.includes(index)) {
    tryApplyAction(flipAction(index));
    return;
  }

  if (myColor && code !== 0 && pieceSide(code) === myColor) {
    const moves = legalMovesFromCell(game.state, index);
    if (moves.length) {
      game.selected = index;
      renderBoard();
    }
  }
}

function maybeScheduleAiMove() {
  if (!game || game.mode !== "ai" || game.over) return;
  if (playerToMove(game.state) !== game.aiPlayerIdx) return;
  const token = ++aiMoveToken;
  aiMovePending = true;
  renderBoard();
  const level = game.aiDifficulty ?? aiDifficulty;
  const snapshot = cloneState(game.state);
  const seed = game.seed;
  requestAnqiAiMove(snapshot, /** @type {1|2|3|4|5|6} */ (level), seed)
    .then(async (action) => {
      if (!game || token !== aiMoveToken || game.over) return;
      if (playerToMove(game.state) !== game.aiPlayerIdx) return;
      aiMovePending = false;
      const legal = legalActions(game.state);
      if (!legal.includes(action)) {
        console.error("AI returned illegal Taiwan action", action);
        maybeScheduleAiMove();
        return;
      }
      const result = applyAction(game.state, action, game.seed);
      await commitAction(action, result, { presenter: "ai" });
    })
    .catch((e) => {
      console.error(e);
      if (token === aiMoveToken) aiMovePending = false;
      renderBoard();
    });
}

export function beginAnqiFromHome() {
  void ensureAnqiWasm();
  openDuoModePicker({
    game: "anqi",
    title: "暗棋",
    backView: "xiangqiVariant",
    localStart: beginAnqiLocal,
    aiStart: beginAnqiAi,
  });
}

export function onAnqiFirstShown() {
  refreshDuoBattleUI();
  if (setupMode === "ai") renderAiSetup();
  else renderLocalPick();
}

export function beginAnqiLocal() {
  const block = getDuoBattleBlockReason();
  if (block) {
    alert(block);
    return;
  }
  setFirstScreenMode("local");
  deps?.showView("anqiFirst");
}

export function beginAnqiAi() {
  setFirstScreenMode("ai");
  deps?.showView("anqiFirst");
  void ensureAnqiWasm().catch((e) => {
    console.error(e);
    alert("暗棋引擎預載失敗，仍可選難度；若開局失敗請 Ctrl+Shift+R 重新整理。");
  });
}

export function initAnqi(d) {
  deps = d;
  bindAnqiEvents();
  void ensureAnqiWasm();
}

function bindAnqiEvents() {
  if (bindAnqiEvents.done) return;
  bindAnqiEvents.done = true;

  $("#btn-anqi-first-back")?.addEventListener("click", () => {
    if (setupMode === "ai") deps?.showView("duoMode");
    else deps?.showView("xiangqiVariant");
  });
  $("#btn-anqi-play-back")?.addEventListener("click", () => requestLeaveAnqiPlay());
  $("#btn-anqi-win-dismiss")?.addEventListener("click", dismissWinOverlay);
  $("#btn-anqi-win-replay")?.addEventListener("click", () => {
    if (!game) return;
    beginGame({
      mode: game.mode,
      playerIds: game.playerIds,
      humanPlayerIdx: game.humanPlayerIdx,
      aiPlayerIdx: game.aiPlayerIdx,
      aiDifficulty: game.aiDifficulty,
    });
  });
  $("#btn-anqi-win-home")?.addEventListener("click", () => {
    abandonAnqiGame();
    deps?.showView("home");
  });
  $("#btn-anqi-win-options")?.addEventListener("click", goToAnqiSetupFromResult);
}
