import { duoScores, otherDuoPlayer } from "./children.js";
import {
  getActiveDuoPlayerIds,
  refreshDuoBattleUI,
  renderDuoPickButtons,
} from "./duo-pick.js";

const DIGITS = [2, 3, 4, 5, 6, 7, 8, 9];
const FLIP_PAIR_OPTIONS = [9, 20, 50];
const MISMATCH_MS = 900;
const KEY_MUL_FLIP_PAIRS = "kid-quiz-mul-flip-pairs";
const KEY_MUL_FLIP_DIGIT = "kid-quiz-mul-flip-digit";

/** @type {import('./flip-mul.js').FlipMulDeps | null} */
let deps = null;
/** @type {FlipMulGameState | null} */
let game = null;

/**
 * @typedef {object} FlipMulDeps
 * @property {(name: string) => void} showView
 * @property {() => { A: string, B: string }} getChildNames
 * @property {(title: string, sub?: string) => void} showWarn
 */

/**
 * @typedef {object} MulFlipFact
 * @property {number} a
 * @property {number} b
 * @property {number} product
 * @property {string} factKey
 */

/**
 * @typedef {object} MulFlipCard
 * @property {string} id
 * @property {'equation'|'answer'} kind
 * @property {string} factKey
 * @property {string} face
 * @property {boolean} faceUp
 * @property {boolean} matched
 */

/**
 * @typedef {object} FlipMulGameState
 * @property {MulFlipFact[]} facts
 * @property {MulFlipCard[]} cards
 * @property {Record<string, number>} scores
 * @property {string[]} playerIds
 * @property {string} firstPlayerId
 * @property {string} currentPlayerId
 * @property {number[]} flippedIdx
 * @property {boolean} locked
 * @property {number} matchedPairs
 * @property {number} pairCount
 * @property {number} requestedPairs
 * @property {number|null} flipDigit
 * @property {number} totalClicks
 */

const $ = (sel) => document.querySelector(sel);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function factKey(a, b) {
  return `${a}x${b}`;
}

function equationFace(a, b) {
  return `${a} × ${b}`;
}

/** @param {number|null} digit */
function allMulFlipFacts(digit) {
  /** @type {MulFlipFact[]} */
  const facts = [];
  if (digit) {
    for (const b of DIGITS) {
      facts.push({ a: digit, b, product: digit * b, factKey: factKey(digit, b) });
    }
    return facts;
  }
  for (const a of DIGITS) {
    for (const b of DIGITS) {
      facts.push({ a, b, product: a * b, factKey: factKey(a, b) });
    }
  }
  return facts;
}

/**
 * @param {number|null} digit
 * @param {number} pairCount
 */
export function pickMulFlipFacts(digit, pairCount) {
  const pool = allMulFlipFacts(digit);
  if (pool.length < pairCount) {
    return { ok: false, available: pool.length };
  }
  const picked = shuffle([...pool]).slice(0, pairCount);
  return { ok: true, facts: picked };
}

export function getMulFlipPairCountSetting() {
  const raw = localStorage.getItem(KEY_MUL_FLIP_PAIRS);
  if (raw) {
    const n = parseInt(raw, 10);
    if (FLIP_PAIR_OPTIONS.includes(n)) return n;
  }
  return 9;
}

function setMulFlipPairCountSetting(n) {
  localStorage.setItem(KEY_MUL_FLIP_PAIRS, String(n));
}

export function getMulFlipDigitSetting() {
  const raw = localStorage.getItem(KEY_MUL_FLIP_DIGIT);
  if (!raw || raw === "all") return null;
  const d = parseInt(raw, 10);
  return DIGITS.includes(d) ? d : null;
}

function setMulFlipDigitSetting(digit) {
  if (digit == null) localStorage.setItem(KEY_MUL_FLIP_DIGIT, "all");
  else localStorage.setItem(KEY_MUL_FLIP_DIGIT, String(digit));
}

export function syncMulFlipPairCountChips() {
  const container = $("#mul-flip-pair-chips");
  if (!container) return;
  const current = String(getMulFlipPairCountSetting());
  container.querySelectorAll(".chip").forEach((btn) => {
    btn.classList.toggle("chip-active", btn.dataset.mulFlipPairs === current);
  });
}

export function syncMulFlipDigitChips() {
  const container = $("#mul-flip-digit-chips");
  if (!container) return;
  const digit = getMulFlipDigitSetting();
  const current = digit == null ? "all" : String(digit);
  container.querySelectorAll(".chip").forEach((btn) => {
    btn.classList.toggle("chip-active", btn.dataset.mulFlipDigit === current);
  });
  const hint = $("#mul-flip-scope-hint");
  if (hint) {
    hint.textContent =
      digit == null
        ? "全表 2～9 · 不含 ×1（共 64 題可抽）"
        : `只玩 ${digit} 的乘法 · ${digit}×2～${digit}×9（8 題）`;
  }
}

export function initMulFlipPickers() {
  $("#mul-flip-pair-chips")?.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.dataset.mulFlipPairs, 10);
      if (FLIP_PAIR_OPTIONS.includes(n)) {
        setMulFlipPairCountSetting(n);
        syncMulFlipPairCountChips();
      }
    });
  });
  $("#mul-flip-digit-chips")?.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset.mulFlipDigit;
      if (raw === "all") setMulFlipDigitSetting(null);
      else {
        const d = parseInt(raw, 10);
        if (DIGITS.includes(d)) setMulFlipDigitSetting(d);
      }
      syncMulFlipDigitChips();
    });
  });
  syncMulFlipPairCountChips();
  syncMulFlipDigitChips();
}

export function renderMulFlipHomePlayers() {
  refreshDuoBattleUI();
}

function gridCols(cardCount) {
  if (cardCount <= 18) return 6;
  if (cardCount <= 40) return 4;
  return 5;
}

/** @param {MulFlipFact[]} facts */
function buildCards(facts) {
  /** @type {MulFlipCard[]} */
  const cards = [];
  facts.forEach((f, i) => {
    cards.push({
      id: `e-${i}`,
      kind: "equation",
      factKey: f.factKey,
      face: equationFace(f.a, f.b),
      faceUp: false,
      matched: false,
    });
    cards.push({
      id: `a-${i}`,
      kind: "answer",
      factKey: f.factKey,
      face: String(f.product),
      faceUp: false,
      matched: false,
    });
  });
  return shuffle(cards);
}

function playerName(id) {
  const names = deps.getChildNames();
  return names[id] || id;
}

function flipMinClicks(pairCount) {
  return pairCount * 2;
}

function scopeLabel(digit) {
  return digit == null ? "2～9 全表" : `${digit} 的乘法`;
}

function renderFirstPicker() {
  refreshDuoBattleUI();
  renderDuoPickButtons("#mul-flip-pick-btns", {
    onPick: startGameWithFirstPlayer,
  });
  if (!game) return;
  const scope = $("#mul-flip-first-scope");
  const pairs = $("#mul-flip-first-pairs");
  if (scope) scope.textContent = scopeLabel(game.flipDigit);
  if (pairs) {
    const note =
      game.pairCount < game.requestedPairs
        ? `${game.pairCount} 組（不含 ×1，此範圍最多 ${game.pairCount} 組）`
        : `${game.pairCount} 組 · 不含 ×1`;
    pairs.textContent = note;
  }
}

function renderPlayHeader() {
  if (!game) return;
  const [idA, idB] = game.playerIds;
  const aScore = $("#mul-flip-score-a");
  const bScore = $("#mul-flip-score-b");
  const aName = $("#mul-flip-play-name-a");
  const bName = $("#mul-flip-play-name-b");
  const turn = $("#mul-flip-turn-label");
  const progress = $("#mul-flip-progress-label");
  const firstTagA = $("#mul-flip-first-tag-a");
  const firstTagB = $("#mul-flip-first-tag-b");
  const clickLabel = $("#mul-flip-click-label");

  if (aName) aName.textContent = playerName(idA);
  if (bName) bName.textContent = playerName(idB);
  if (aScore) aScore.textContent = String(game.scores[idA] ?? 0);
  if (bScore) bScore.textContent = String(game.scores[idB] ?? 0);
  if (turn) turn.textContent = `輪到：${playerName(game.currentPlayerId)}`;
  if (progress) {
    progress.textContent = `配對 ${game.matchedPairs} / ${game.pairCount}`;
  }
  if (clickLabel) {
    const min = flipMinClicks(game.pairCount);
    clickLabel.textContent = `點擊 ${game.totalClicks} 次 · 單人最少 ${min} 次`;
  }

  const aActive = game.currentPlayerId === idA;
  $("#mul-flip-score-block-a")?.classList.toggle("flip-score-active", aActive);
  $("#mul-flip-score-block-b")?.classList.toggle("flip-score-active", !aActive);

  if (firstTagA) firstTagA.hidden = game.firstPlayerId !== idA;
  if (firstTagB) firstTagB.hidden = game.firstPlayerId !== idB;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function flipCardFaceHtml(card) {
  return `<span class="flip-card-inner">${escapeHtml(card.face)}</span>`;
}

function applyMulFlipGridMetrics(grid, requestedPairs) {
  const metrics =
    requestedPairs === 9
      ? { eqDiv: 4.2, eqHDiv: 2.2, ansDiv: 1.5, ansHDiv: 2 }
      : requestedPairs === 20
        ? { eqDiv: 5, eqHDiv: 2.6, ansDiv: 1.7, ansHDiv: 2.3 }
        : { eqDiv: 5.4, eqHDiv: 2.9, ansDiv: 1.9, ansHDiv: 2.5 };
  grid.style.setProperty("--mul-eq-div", String(metrics.eqDiv));
  grid.style.setProperty("--mul-eq-hdiv", String(metrics.eqHDiv));
  grid.style.setProperty("--mul-ans-div", String(metrics.ansDiv));
  grid.style.setProperty("--mul-ans-hdiv", String(metrics.ansHDiv));
}

function renderBoard() {
  const grid = $("#mul-flip-card-grid");
  if (!grid || !game) return;

  grid.style.setProperty("--flip-cols", String(gridCols(game.cards.length)));
  grid.dataset.pairs = String(game.pairCount);
  grid.dataset.size = String(game.requestedPairs);
  applyMulFlipGridMetrics(grid, game.requestedPairs);
  grid.innerHTML = "";

  game.cards.forEach((card, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "flip-card";
    btn.dataset.idx = String(idx);
    btn.disabled = game.locked || card.matched;

    if (card.matched) {
      btn.classList.add("flip-card-matched");
      btn.classList.add("flip-card-face-up");
      btn.classList.add(
        card.kind === "equation" ? "mul-flip-card-equation" : "mul-flip-card-answer"
      );
      btn.innerHTML = flipCardFaceHtml(card);
    } else if (card.faceUp) {
      btn.classList.add("flip-card-face-up");
      btn.classList.add(
        card.kind === "equation" ? "mul-flip-card-equation" : "mul-flip-card-answer"
      );
      btn.innerHTML = flipCardFaceHtml(card);
    } else {
      btn.innerHTML = '<span class="flip-card-back">?</span>';
    }

    btn.addEventListener("click", () => onCardClick(idx));
    grid.appendChild(btn);
  });

  renderPlayHeader();
}

/**
 * @param {MulFlipCard} a
 * @param {MulFlipCard} b
 */
function cardsMatch(a, b) {
  return a.factKey === b.factKey && a.kind !== b.kind;
}

function onCardClick(idx) {
  if (!game || game.locked) return;
  const card = game.cards[idx];
  if (!card || card.matched || card.faceUp) return;
  if (game.flippedIdx.length >= 2) return;

  card.faceUp = true;
  game.flippedIdx.push(idx);
  game.totalClicks += 1;
  renderBoard();

  if (game.flippedIdx.length < 2) return;

  game.locked = true;
  const [i0, i1] = game.flippedIdx;
  const c0 = game.cards[i0];
  const c1 = game.cards[i1];

  if (cardsMatch(c0, c1)) {
    c0.matched = true;
    c1.matched = true;
    game.scores[game.currentPlayerId] += 1;
    game.matchedPairs += 1;
    game.flippedIdx = [];
    game.locked = false;
    renderBoard();

    if (game.matchedPairs >= game.pairCount) {
      setTimeout(showFlipResult, 400);
    }
    return;
  }

  setTimeout(() => {
    if (!game) return;
    c0.faceUp = false;
    c1.faceUp = false;
    game.flippedIdx = [];
    game.currentPlayerId = otherDuoPlayer(game.currentPlayerId, game.playerIds);
    game.locked = false;
    renderBoard();
  }, MISMATCH_MS);
}

function showFlipResult() {
  if (!game) return;
  const [idA, idB] = game.playerIds;
  const a = game.scores[idA] ?? 0;
  const b = game.scores[idB] ?? 0;
  const title = $("#mul-flip-result-title");
  const detail = $("#mul-flip-result-detail");
  const scoreLine = $("#mul-flip-result-scores");
  const clickLine = $("#mul-flip-result-clicks");

  if (scoreLine) {
    scoreLine.textContent = `${playerName(idA)} ${a} ：${b} ${playerName(idB)}`;
  }

  const min = flipMinClicks(game.pairCount);
  if (clickLine) {
    const extra = game.totalClicks - min;
    clickLine.textContent =
      extra > 0
        ? `本局共點擊 ${game.totalClicks} 次（比單人最少多 ${extra} 次）`
        : `本局共點擊 ${game.totalClicks} 次 · 達到單人最少！`;
  }

  if (a > b) {
    if (title) title.textContent = `${playerName(idA)} 獲勝！`;
  } else if (b > a) {
    if (title) title.textContent = `${playerName(idB)} 獲勝！`;
  } else if (title) title.textContent = "平手！";

  if (detail) {
    detail.textContent = `${game.pairCount} 組 · ${scopeLabel(game.flipDigit)} · 不含 ×1`;
  }

  deps.showView("mulFlipResult");
}

function startGameWithFirstPlayer(firstPlayerId) {
  if (!game?.facts || !game.playerIds?.includes(firstPlayerId)) return;
  game.firstPlayerId = firstPlayerId;
  game.currentPlayerId = firstPlayerId;
  game.cards = buildCards(game.facts);
  game.scores = duoScores(game.playerIds);
  game.flippedIdx = [];
  game.locked = false;
  game.matchedPairs = 0;
  game.totalClicks = 0;
  deps.showView("mulFlipPlay");
  renderBoard();
}

/**
 * @param {MulFlipFact[]} facts
 * @param {number} pairCount
 * @param {number} requestedPairs
 * @param {number|null} flipDigit
 */
function createFlipLobby(facts, pairCount, requestedPairs, flipDigit) {
  const playerIds = getActiveDuoPlayerIds();
  if (playerIds.length < 2) {
    deps.showWarn(
      "需要兩位才能對戰",
      "請在首頁選「誰在練習」，並挑選對戰對象"
    );
    return null;
  }
  return {
    facts,
    cards: [],
    playerIds,
    scores: duoScores(playerIds),
    firstPlayerId: playerIds[0],
    currentPlayerId: playerIds[0],
    flippedIdx: [],
    locked: false,
    matchedPairs: 0,
    pairCount,
    requestedPairs,
    flipDigit,
    totalClicks: 0,
  };
}

function beginFlipLocal() {
  const requestedPairs = getMulFlipPairCountSetting();
  const flipDigit = getMulFlipDigitSetting();
  const pool = allMulFlipFacts(flipDigit);

  if (pool.length === 0) {
    deps.showWarn("無法開局", "請選擇翻牌範圍");
    return;
  }

  let pairCount = requestedPairs;
  if (pool.length < requestedPairs) {
    if (flipDigit != null && requestedPairs === 9) {
      pairCount = pool.length;
    } else if (flipDigit != null) {
      deps.showWarn(
        "這個範圍題目不夠",
        `${flipDigit} 的乘法不含 ×1 只有 ${pool.length} 組。請改選「全表」，或選 9 組玩單數表。`
      );
      return;
    } else {
      deps.showWarn("題目不夠", `全表不含 ×1 最多 ${pool.length} 組，請改選較少組數`);
      return;
    }
  }

  const result = pickMulFlipFacts(flipDigit, pairCount);
  if (!result.ok) {
    deps.showWarn("題目不夠", `此範圍只有 ${result.available} 組`);
    return;
  }

  game = createFlipLobby(result.facts, result.facts.length, requestedPairs, flipDigit);
  if (!game) return;

  renderFirstPicker();
  deps.showView("mulFlipFirst");
}

function replayWithNewFacts() {
  const requestedPairs = game?.requestedPairs ?? getMulFlipPairCountSetting();
  const flipDigit = game?.flipDigit ?? getMulFlipDigitSetting();
  const pool = allMulFlipFacts(flipDigit);
  const pairCount = Math.min(requestedPairs, pool.length);
  if (pairCount < 1) {
    deps.showWarn("無法再玩一局", "請回九九乘法調整範圍或組數");
    return;
  }
  const result = pickMulFlipFacts(flipDigit, pairCount);
  if (!result.ok) {
    deps.showWarn("無法再玩一局", "請回九九乘法調整範圍或組數");
    return;
  }
  game = createFlipLobby(result.facts, result.facts.length, requestedPairs, flipDigit);
  if (!game) return;
  renderFirstPicker();
  deps.showView("mulFlipFirst");
}

export function clearMulFlipPlayUi() {
  const grid = document.querySelector("#mul-flip-card-grid");
  if (grid) {
    grid.innerHTML = "";
    grid.removeAttribute("data-pairs");
    grid.removeAttribute("data-size");
  }
  const set = (sel, text) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  };
  set("#mul-flip-score-a", "0");
  set("#mul-flip-score-b", "0");
  set("#mul-flip-turn-label", "等候對局…");
  set("#mul-flip-progress-label", "");
  set("#mul-flip-click-label", "");
}

export function beginMulFlipFromPick() {
  beginFlipLocal();
}

function bindFlipMulEvents() {
  $("#btn-start-mul-flip")?.addEventListener("click", (e) => {
    e.preventDefault();
    beginFlipLocal();
  });

  $("#btn-mul-flip-first-back")?.addEventListener("click", () => deps.showView("mulPick"));
  $("#btn-mul-flip-play-back")?.addEventListener("click", () => {
    if (confirm("離開對戰？目前進度不會儲存。")) deps.showView("mulPick");
  });
  $("#btn-mul-flip-replay")?.addEventListener("click", () => replayWithNewFacts());
  $("#btn-mul-flip-home")?.addEventListener("click", () => {
    game = null;
    clearMulFlipPlayUi();
    deps.showView("mulPick");
  });
}

/**
 * @param {FlipMulDeps} d
 */
export function initFlipMul(d) {
  deps = d;
  initMulFlipPickers();
  renderMulFlipHomePlayers();
  bindFlipMulEvents();
}
