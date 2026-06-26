import { duoScores, getChildName, otherDuoPlayer } from "./children.js";
import {
  canStartDuoBattle,
  getActiveDuoPlayerIds,
  refreshDuoBattleUI,
  renderDuoPickButtons,
} from "./duo-pick.js";
import { getOnlineContext, leaveOnlineRoom } from "./online-duo.js?v=duo-online-v2";
import { openMathDuoMode } from "./flip-math-online.js?v=duo-online-v2";

const DECK_VERSION = "deck30";
const KEY_MATH_RANGE = "kid-quiz-math-range";
const WIN_SCORE = 5;
const FLIP_PER_TURN = 5;
const DIGIT_COPIES = 2;
/** 補滿 30 張：數字 1 多 1 張（1 共 3 張） */
const EXTRA_DIGIT_VALUE = 1;

/** @type {MathDeps | null} */
let deps = null;
/** @type {MathGameState | null} */
let game = null;
/** @type {'open' | 'flip' | 'guess' | null} */
let pendingMode = null;

/**
 * @typedef {object} MathDeps
 * @property {(name: string) => void} showView
 * @property {() => { A: string, B: string }} getChildNames
 * @property {(title: string, sub?: string) => void} showWarn
 * @property {(title: string, sub?: string) => void} showOk
 */

/**
 * @typedef {object} MathCard
 * @property {string} id
 * @property {'digit'|'money'|'op'} kind
 * @property {number|string} value
 * @property {string} label
 * @property {string} [sub]
 * @property {boolean} faceUp
 */

/**
 * @typedef {object} MathGameState
 * @property {'open'|'flip'|'guess'} mode
 * @property {'100'|'1000'} rangeKey
 * @property {number} target
 * @property {MathCard[]} cards
 * @property {Record<string, number>} scores
 * @property {string[]} playerIds
 * @property {string} firstPlayerId
 * @property {string} currentPlayerId
 * @property {string[]} selection
 * @property {string[]} turnFlippedIds
 * @property {boolean} locked
 * @property {string} [guessInput]
 * @property {{ text: string, level: string }} [lastHint]
 */

const GUESS_HINT_IDLE = { text: "輸入數字後送出", level: "idle" };
let numpadBuilt = false;

const $ = (sel) => document.querySelector(sel);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getMathRangeSetting() {
  const raw = localStorage.getItem(KEY_MATH_RANGE);
  return raw === "1000" ? "1000" : "100";
}

function setMathRangeSetting(key) {
  localStorage.setItem(KEY_MATH_RANGE, key);
}

export function syncMathRangeChips() {
  const container = $("#math-setup-range-chips");
  if (!container) return;
  const current = getMathRangeSetting();
  container.querySelectorAll(".chip").forEach((btn) => {
    btn.classList.toggle("chip-active", btn.dataset.mathRange === current);
  });
}

export function initMathRangePicker() {
  const container = $("#math-setup-range-chips");
  if (!container) return;
  container.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.mathRange;
      if (key === "100" || key === "1000") {
        setMathRangeSetting(key);
        syncMathRangeChips();
      }
    });
  });
  syncMathRangeChips();
}

export function renderMathHomePlayers() {
  refreshDuoBattleUI();
}

function mathModeTitle(mode) {
  if (mode === "flip") return "數學翻牌";
  if (mode === "guess") return "猜數字";
  return "數學攤牌";
}

function renderMathSetupView() {
  const mode = pendingMode || "open";
  const title = mathModeTitle(mode);
  const titleEl = $("#math-setup-title");
  const headerEl = $("#math-setup-header");
  if (titleEl) titleEl.textContent = title;
  if (headerEl) headerEl.textContent = title;
  refreshDuoBattleUI();
  syncMathRangeChips();
}

function buildDeck() {
  /** @type {MathCard[]} */
  const cards = [];
  let id = 0;
  for (let d = 0; d <= 9; d++) {
    for (let c = 0; c < DIGIT_COPIES; c++) {
      cards.push({
        id: `d${id++}`,
        kind: "digit",
        value: d,
        label: String(d),
        faceUp: false,
      });
    }
  }
  cards.push({
    id: `d${id++}`,
    kind: "digit",
    value: EXTRA_DIGIT_VALUE,
    label: String(EXTRA_DIGIT_VALUE),
    faceUp: false,
  });
  const money = [10, 50, 100, 500, 1000];
  for (const value of money) {
    cards.push({
      id: `m${id++}`,
      kind: "money",
      value,
      label: String(value),
      faceUp: false,
    });
  }
  for (const op of ["+", "-", "×", "÷"]) {
    cards.push({
      id: `o${id++}`,
      kind: "op",
      value: op,
      label: op,
      faceUp: false,
    });
  }
  return shuffle(cards);
}

function rangeBounds(rangeKey) {
  return rangeKey === "1000" ? { min: 100, max: 1000 } : { min: 10, max: 100 };
}

function guessMidThreshold(rangeKey) {
  return rangeKey === "1000" ? 100 : 25;
}

function maxGuessDigits(rangeKey) {
  return rangeKey === "1000" ? 4 : 3;
}

function pickSecret(rangeKey) {
  const { min, max } = rangeBounds(rangeKey);
  return randInt(min, max);
}

/**
 * @param {number} guess
 * @param {number} secret
 * @param {'100'|'1000'} rangeKey
 */
function guessHint(guess, secret, rangeKey) {
  const diff = Math.abs(guess - secret);
  if (diff < 5) {
    return { text: "快猜中了！", level: "hot" };
  }
  const mid = guessMidThreshold(rangeKey);
  if (guess > secret) {
    return diff < mid
      ? { text: "偏大一點", level: "warm" }
      : { text: "太大了", level: "far" };
  }
  return diff < mid
    ? { text: "偏小一點", level: "warm" }
    : { text: "太小了", level: "far" };
}

function cardNum(card) {
  return Number(card.value);
}

function evaluateExpression(tokens) {
  if (!tokens.length) return null;
  if (tokens.length === 1) {
    return typeof tokens[0] === "number" ? tokens[0] : null;
  }
  if (tokens.length % 2 === 0) return null;

  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      if (typeof tokens[i] !== "number") return null;
    } else if (!["+", "-", "×", "÷"].includes(tokens[i])) {
      return null;
    }
  }

  const vals = tokens.filter((_, i) => i % 2 === 0);
  const ops = tokens.filter((_, i) => i % 2 === 1);

  let i = 0;
  while (i < ops.length) {
    if (ops[i] === "×" || ops[i] === "÷") {
      const a = vals[i];
      const b = vals[i + 1];
      let r;
      if (ops[i] === "×") r = a * b;
      else {
        if (b === 0 || a % b !== 0) return null;
        r = a / b;
      }
      vals.splice(i, 2, r);
      ops.splice(i, 1);
    } else {
      i += 1;
    }
  }

  let result = vals[0];
  for (let j = 0; j < ops.length; j++) {
    if (ops[j] === "+") result += vals[j + 1];
    else result -= vals[j + 1];
  }
  return result;
}

function validateSelection(cards) {
  if (!cards.length) {
    return { ok: false, reason: "請先選牌" };
  }

  const hasOp = cards.some((c) => c.kind === "op");
  if (!hasOp) {
    const sum = cards.reduce((s, c) => s + cardNum(c), 0);
    return { ok: true, value: sum, mode: "money" };
  }

  const tokens = cards.map((c) => (c.kind === "op" ? c.value : cardNum(c)));
  const value = evaluateExpression(tokens);
  if (value === null) {
    return { ok: false, reason: "算式不合法（需數字與＋－×÷交替，除法須整除）" };
  }
  return { ok: true, value, mode: "expr" };
}

function selectionLabel(cards) {
  return cards
    .map((c) => {
      if (c.kind === "op") return c.label;
      if (c.kind === "money" && c.sub) return `${c.label}`;
      return c.label;
    })
    .join(" ");
}

function playerName(id) {
  return deps.getChildNames()[id] || id;
}

function deckMaxCopies(value) {
  if (typeof value !== "number") return 0;
  if (value >= 0 && value <= 9) {
    return value === EXTRA_DIGIT_VALUE ? DIGIT_COPIES + 1 : DIGIT_COPIES;
  }
  if ([10, 50, 100, 500, 1000].includes(value)) return 1;
  return 0;
}

const DIGIT_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const MONEY_VALUES = [10, 50, 100, 500, 1000];

function randomDigitValue() {
  return DIGIT_VALUES[randInt(0, DIGIT_VALUES.length - 1)];
}

function randomMoneyValue() {
  return MONEY_VALUES[randInt(0, MONEY_VALUES.length - 1)];
}

function randomCardValue() {
  return Math.random() < 0.5 ? randomDigitValue() : randomMoneyValue();
}

function partsFitDeck(parts) {
  const need = new Map();
  for (const v of parts) {
    need.set(v, (need.get(v) || 0) + 1);
  }
  for (const [v, count] of need) {
    if (count > deckMaxCopies(v)) return false;
  }
  return true;
}

function randomMoneyParts(maxCards) {
  const n = randInt(2, maxCards);
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(Math.random() < 0.45 ? randomDigitValue() : randomMoneyValue());
  }
  return parts;
}

function tryMoneyTarget(min, max, maxCards) {
  for (let t = 0; t < 200; t++) {
    const parts = randomMoneyParts(maxCards);
    if (!partsFitDeck(parts)) continue;
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum >= min && sum <= max) return sum;
  }
  return null;
}

function tryExprTarget(min, max) {
  for (let t = 0; t < 300; t++) {
    const a = randomCardValue();
    const b = randomCardValue();
    const op = ["+", "-", "×", "÷"][randInt(0, 3)];
    let result;
    if (op === "+") result = a + b;
    else if (op === "-") {
      if (a < b) continue;
      result = a - b;
    } else if (op === "×") result = a * b;
    else {
      if (b === 0 || a % b !== 0) continue;
      result = a / b;
    }
    if (result < min || result > max) continue;
    if (!partsFitDeck([a, b])) continue;
    return result;
  }
  return null;
}

function pickTarget(rangeKey, mode = "open") {
  const { min, max } = rangeBounds(rangeKey);
  const maxCards = mode === "flip" ? FLIP_PER_TURN : 12;
  for (let pass = 0; pass < 2; pass++) {
    const gen = pass === 0 ? tryMoneyTarget : tryExprTarget;
    for (let t = 0; t < 100; t++) {
      const target = gen(min, max, maxCards);
      if (target !== null) return target;
    }
  }
  const fallback = tryMoneyTarget(min, max, mode === "flip" ? FLIP_PER_TURN : 4);
  return fallback ?? randInt(min, max);
}

function startNewRound(keepScores = true) {
  const rangeKey = getMathRangeSetting();
  const prev = game;
  const mode = pendingMode || prev?.mode || "open";
  const playerIds =
    prev?.playerIds?.length === 2 ? prev.playerIds : getActiveDuoPlayerIds();

  if (mode === "guess") {
    game = {
      mode: "guess",
      rangeKey,
      target: pickSecret(rangeKey),
      cards: [],
      playerIds,
      scores: keepScores && prev ? { ...prev.scores } : duoScores(playerIds),
      firstPlayerId: prev?.firstPlayerId || playerIds[0],
      currentPlayerId: prev?.currentPlayerId || playerIds[0],
      selection: [],
      turnFlippedIds: [],
      locked: false,
      guessInput: "",
      lastHint: { ...GUESS_HINT_IDLE },
    };
    renderMathPlayView();
    return;
  }

  game = {
    mode,
    rangeKey,
    target: pickTarget(rangeKey, mode),
    cards: buildDeck(),
    playerIds,
    scores: keepScores && prev ? { ...prev.scores } : duoScores(playerIds),
    firstPlayerId: prev?.firstPlayerId || playerIds[0],
    currentPlayerId: prev?.currentPlayerId || playerIds[0],
    selection: [],
    turnFlippedIds: [],
    locked: false,
  };

  if (game.mode === "open") {
    game.cards.forEach((c) => {
      c.faceUp = true;
    });
  } else {
    applyFlipModeFaces(game.cards);
  }
  renderMathPlayView();
}

function applyFlipModeFaces(cards) {
  cards.forEach((c) => {
    c.faceUp = false;
  });
}

function renderMathHeader() {
  if (!game) return;
  const [idA, idB] = game.playerIds;
  $("#math-play-name-a").textContent = playerName(idA);
  $("#math-play-name-b").textContent = playerName(idB);
  $("#math-score-a").textContent = String(game.scores[idA] ?? 0);
  $("#math-score-b").textContent = String(game.scores[idB] ?? 0);
  $("#math-turn-label").textContent = `輪到：${playerName(game.currentPlayerId)}`;

  $("#math-score-block-a")?.classList.toggle("flip-score-active", game.currentPlayerId === idA);
  $("#math-score-block-b")?.classList.toggle("flip-score-active", game.currentPlayerId === idB);
  $("#math-first-tag-a").hidden = game.firstPlayerId !== idA;
  $("#math-first-tag-b").hidden = game.firstPlayerId !== idB;

  const { min, max } = rangeBounds(game.rangeKey);

  if (game.mode === "guess") {
    $("#math-mode-badge").textContent = "猜數字";
    $("#math-guess-range").textContent = `猜 ${min}～${max}`;
    const inputEl = $("#math-guess-input");
    if (inputEl) {
      inputEl.textContent = game.guessInput || "—";
    }
    const hintEl = $("#math-guess-hint");
    if (hintEl && game.lastHint) {
      hintEl.textContent = game.lastHint.text;
      hintEl.className = `math-guess-hint math-guess-hint-${game.lastHint.level}`;
    }
    return;
  }

  $("#math-target-big").textContent = String(game.target);
  $("#math-target-hint").textContent = `範圍 ${min}～${max} · 先 ${WIN_SCORE} 分勝 · 共 ${game.cards.length} 張（${DECK_VERSION}）`;

  const modeLabel = game.mode === "open" ? "攤牌" : "翻牌";
  $("#math-mode-badge").textContent = modeLabel;

  const sel = getSelectionCards();
  const exprEl = $("#math-expression");
  if (exprEl) {
    if (!sel.length) {
      exprEl.textContent = "點選下方牌組成算式或湊錢";
    } else {
      exprEl.textContent = selectionLabel(sel);
    }
    exprEl.classList.remove("math-expression-ok");
  }

  const flipHint = $("#math-flip-hint");
  if (flipHint) {
    if (game.mode === "flip") {
      flipHint.hidden = false;
      flipHint.textContent = `本回合已翻 ${game.turnFlippedIds.length} / ${FLIP_PER_TURN} 張（至少 1 張粉紅運算符）`;
    } else {
      flipHint.hidden = true;
    }
  }
}

function getSelectionCards() {
  if (!game) return [];
  return game.selection
    .map((id) => game.cards.find((c) => c.id === id))
    .filter(Boolean);
}

function cardClass(card) {
  const parts = ["math-card", `math-card-${card.kind}`];
  if (game?.mode === "flip" && !card.faceUp) {
    parts.push("math-card-down", `math-card-down-${card.kind}`);
  }
  if (game?.selection.includes(card.id)) parts.push("math-card-selected");
  if (game?.turnFlippedIds.includes(card.id)) parts.push("math-card-turn");
  return parts.join(" ");
}

function cardBackHtml(kind) {
  return `<span class="math-card-back math-card-back-${kind}" aria-hidden="true"></span>`;
}

function cardHtml(card) {
  if (game?.mode === "flip" && !card.faceUp) {
    return cardBackHtml(card.kind);
  }
  if (card.kind === "money") {
    return `<span class="math-card-face">${card.label}</span>`;
  }
  return `<span class="math-card-face">${card.label}</span>`;
}

function renderCardGrid() {
  const grid = $("#math-card-grid");
  if (!grid || !game) return;

  grid.classList.toggle("math-grid-open", game.mode === "open");
  grid.classList.toggle("math-grid-flip", game.mode === "flip");
  grid.innerHTML = "";

  game.cards.forEach((card) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cardClass(card);
    btn.dataset.id = card.id;
    if (card.kind === "money") btn.dataset.value = String(card.value);
    btn.innerHTML = cardHtml(card);
    btn.disabled = game.locked;
    btn.addEventListener("click", () => onCardClick(card.id));
    grid.appendChild(btn);
  });

  renderMathHeader();
}

function buildNumpad() {
  if (numpadBuilt) return;
  const pad = $("#math-numpad");
  if (!pad) return;
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"];
  keys.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "math-numpad-key" + (key === "⌫" ? " math-numpad-back" : "");
    btn.textContent = key;
    btn.addEventListener("click", () => {
      if (key === "⌫") backspaceGuessDigit();
      else appendGuessDigit(key);
    });
    pad.appendChild(btn);
  });
  numpadBuilt = true;
}

function renderGuessPanel() {
  buildNumpad();
  renderMathHeader();
}

/** @param {HTMLElement | null} el */
function setPanelVisible(el, show, display = "flex") {
  if (!el) return;
  el.hidden = !show;
  el.style.display = show ? display : "none";
  el.classList.toggle("math-panel-off", !show);
}

/** @param {'open'|'flip'|'guess'|null} mode */
function applyMathPlayPanels(mode) {
  const cardsPanel = $("#math-cards-panel");
  const guessPanel = $("#math-guess-panel");
  const isGuess = mode === "guess";
  setPanelVisible(cardsPanel, !isGuess);
  setPanelVisible(guessPanel, isGuess);
  if (isGuess) {
    const grid = $("#math-card-grid");
    if (grid) grid.innerHTML = "";
  }
}

function renderMathPlayView() {
  if (!game) {
    applyMathPlayPanels(null);
    return;
  }

  applyMathPlayPanels(game.mode);

  if (game.mode === "guess") {
    renderGuessPanel();
    return;
  }

  renderCardGrid();
}

function appendGuessDigit(digit) {
  if (getOnlineContext().roomId) return;
  if (!game || game.mode !== "guess" || game.locked) return;
  if (game.guessInput.length >= maxGuessDigits(game.rangeKey)) return;
  game.guessInput += digit;
  renderMathHeader();
}

function backspaceGuessDigit() {
  if (!game || game.mode !== "guess" || game.locked) return;
  game.guessInput = game.guessInput.slice(0, -1);
  renderMathHeader();
}

function clearGuessInput() {
  if (!game || game.mode !== "guess") return;
  game.guessInput = "";
  renderMathHeader();
}

function submitGuess() {
  if (!game || game.mode !== "guess" || game.locked) return;
  const raw = game.guessInput.trim();
  if (!raw) {
    deps.showWarn("請先輸入", "點數字鍵盤組出你的猜測");
    return;
  }
  const guess = Number(raw);
  if (!Number.isFinite(guess)) {
    deps.showWarn("無法送出", "請輸入數字");
    return;
  }
  const { min, max } = rangeBounds(game.rangeKey);
  if (guess < min || guess > max) {
    deps.showWarn("超出範圍", `請猜 ${min}～${max} 之間的數`);
    return;
  }

  if (guess === game.target) {
    game.scores[game.currentPlayerId] += 1;
    const who = playerName(game.currentPlayerId);
    deps.showOk("猜中了！", `${who} 猜對秘密數，+1 分`, () => {
      if (!game) return;
      if (checkWin()) return;
      game.currentPlayerId = otherDuoPlayer(game.currentPlayerId, game.playerIds);
      nextGuessRound();
    });
    return;
  }

  const hint = guessHint(guess, game.target, game.rangeKey);
  game.lastHint = hint;
  game.guessInput = "";
  switchPlayer();
  renderMathHeader();
}

function nextGuessRound() {
  const scores = { ...game.scores };
  const firstPlayerId = game.firstPlayerId;
  const currentPlayerId = game.currentPlayerId;
  const playerIds = game.playerIds;
  const rangeKey = getMathRangeSetting();
  game = {
    mode: "guess",
    rangeKey,
    target: pickSecret(rangeKey),
    cards: [],
    playerIds,
    scores,
    firstPlayerId,
    currentPlayerId,
    selection: [],
    turnFlippedIds: [],
    locked: false,
    guessInput: "",
    lastHint: { ...GUESS_HINT_IDLE },
  };
  renderMathPlayView();
}

function switchPlayer() {
  game.currentPlayerId = otherDuoPlayer(game.currentPlayerId, game.playerIds);
  game.selection = [];
}

function turnHasOpFlipped() {
  if (!game) return false;
  return game.turnFlippedIds.some((id) => {
    const c = game.cards.find((x) => x.id === id);
    return c?.kind === "op";
  });
}

function flipBackTurn() {
  for (const id of game.turnFlippedIds) {
    const c = game.cards.find((x) => x.id === id);
    if (c) c.faceUp = false;
  }
  game.turnFlippedIds = [];
  game.selection = [];
}

function onCardClick(cardId) {
  if (getOnlineContext().roomId) return;
  if (!game || game.locked) return;
  const card = game.cards.find((c) => c.id === cardId);
  if (!card) return;

  if (game.mode === "flip") {
    if (!card.faceUp) {
      if (game.turnFlippedIds.length >= FLIP_PER_TURN) return;
      const lastSlot = game.turnFlippedIds.length === FLIP_PER_TURN - 1;
      if (lastSlot && card.kind !== "op" && !turnHasOpFlipped()) {
        deps.showWarn("請翻運算符", `本回合 ${FLIP_PER_TURN} 張中至少要有 1 張粉紅運算符，請翻粉紅牌`);
        return;
      }
      card.faceUp = true;
      game.turnFlippedIds.push(cardId);
      renderCardGrid();
      return;
    }
    if (!game.turnFlippedIds.includes(cardId)) return;
    if (game.selection.includes(cardId)) {
      game.selection = game.selection.filter((id) => id !== cardId);
    } else {
      game.selection.push(cardId);
    }
    renderCardGrid();
    return;
  }

  if (game.selection.includes(cardId)) {
    game.selection = game.selection.filter((id) => id !== cardId);
  } else {
    game.selection.push(cardId);
  }
  renderCardGrid();
}

function checkWin() {
  const [idA, idB] = game.playerIds;
  if ((game.scores[idA] ?? 0) >= WIN_SCORE || (game.scores[idB] ?? 0) >= WIN_SCORE) {
    showMathResult();
    return true;
  }
  return false;
}

function nextQuestion() {
  if (game.mode === "guess") {
    nextGuessRound();
    return;
  }
  const scores = { ...game.scores };
  const firstPlayerId = game.firstPlayerId;
  const currentPlayerId = game.currentPlayerId;
  const playerIds = game.playerIds;
  const mode = game.mode;
  game = {
    mode,
    rangeKey: getMathRangeSetting(),
    target: pickTarget(getMathRangeSetting(), mode),
    cards: buildDeck(),
    playerIds,
    scores,
    firstPlayerId,
    currentPlayerId,
    selection: [],
    turnFlippedIds: [],
    locked: false,
  };
  if (mode === "open") {
    game.cards.forEach((c) => {
      c.faceUp = true;
    });
  } else {
    applyFlipModeFaces(game.cards);
  }
  renderMathPlayView();
}

function submitAnswer() {
  if (getOnlineContext().roomId) return;
  if (!game || game.locked) return;
  if (game.mode === "guess") {
    submitGuess();
    return;
  }
  if (game.mode === "flip" && !turnHasOpFlipped()) {
    deps.showWarn("請翻運算符", "本回合至少需翻開 1 張粉紅運算符才能送出");
    return;
  }
  const sel = getSelectionCards();
  const result = validateSelection(sel);
  if (!result.ok) {
    deps.showWarn("無法送出", result.reason);
    return;
  }
  if (result.value !== game.target) {
    const who = playerName(game.currentPlayerId);
    const msg = `${who}：${selectionLabel(sel)} ＝ ${result.value}，目標是 ${game.target}`;
    if (game.mode === "flip") flipBackTurn();
    else game.selection = [];
    switchPlayer();
    renderCardGrid();
    deps.showWarn("還沒湊對", `${msg}，換 ${playerName(game.currentPlayerId)}`);
    return;
  }

  game.scores[game.currentPlayerId] += 1;
  const who = playerName(game.currentPlayerId);
  const modeText = result.mode === "money" ? "湊錢" : "算式";
  deps.showOk("答對了！", `${who} 用${modeText}湊出 ${game.target}，+1 分`, () => {
    if (!game) return;
    if (checkWin()) return;
    game.currentPlayerId = otherDuoPlayer(game.currentPlayerId, game.playerIds);
    nextQuestion();
  });
}

function clearSelection() {
  if (!game) return;
  if (game.mode === "guess") {
    clearGuessInput();
    return;
  }
  game.selection = [];
  renderCardGrid();
}

function showMathResult() {
  const [idA, idB] = game.playerIds;
  const a = game.scores[idA] ?? 0;
  const b = game.scores[idB] ?? 0;
  $("#math-result-scores").textContent = `${playerName(idA)} ${a} ：${b} ${playerName(idB)}`;
  if (a > b) $("#math-result-title").textContent = `${playerName(idA)} 獲勝！`;
  else if (b > a) $("#math-result-title").textContent = `${playerName(idB)} 獲勝！`;
  else $("#math-result-title").textContent = "平手！";
  deps.showView("mathResult");
}

function renderMathFirstPicker() {
  renderDuoPickButtons("#math-pick-btns", {
    onPick: startWithFirstPlayer,
  });
  const { min, max } = rangeBounds(getMathRangeSetting());
  $("#math-first-range").textContent = `${min}～${max}`;
  const modeName =
    pendingMode === "flip"
      ? "翻牌對戰"
      : pendingMode === "guess"
        ? "猜數字"
        : "攤牌計算機";
  $("#math-first-mode").textContent = modeName;
  const hintEl = document.querySelector("#view-math-first .flip-first-hint");
  if (hintEl) {
    hintEl.textContent =
      pendingMode === "guess" ? "點名字先猜" : "點名字先出牌";
  }
}

function beginMath(mode) {
  pendingMode = mode;
  applyMathPlayPanels(mode);
  renderMathSetupView();
  deps.showView("mathSetup");
}

export function beginMathOpen() {
  beginMath("open");
}

export function beginMathFlip() {
  beginMath("flip");
}

export function beginMathGuess() {
  beginMath("guess");
}

function startWithFirstPlayer(firstPlayerId) {
  const playerIds = getActiveDuoPlayerIds();
  if (playerIds.length < 2 || !playerIds.includes(firstPlayerId)) return;

  game = null;
  const mode = pendingMode || "open";
  startNewRound(false);
  game.playerIds = playerIds;
  game.firstPlayerId = firstPlayerId;
  game.currentPlayerId = firstPlayerId;
  game.mode = mode;

  if (mode === "guess") {
    game.guessInput = "";
    game.lastHint = { ...GUESS_HINT_IDLE };
    pendingMode = null;
    deps.showView("mathPlay");
    renderMathPlayView();
    return;
  }

  if (game.mode === "open") {
    game.cards.forEach((c) => {
      c.faceUp = true;
    });
  } else {
    applyFlipModeFaces(game.cards);
  }
  pendingMode = null;
  deps.showView("mathPlay");
  renderMathPlayView();
}

export function bindMathEvents() {
  $("#btn-start-math-open")?.addEventListener("click", (e) => {
    e.preventDefault();
    beginMathOpen();
  });
  $("#btn-start-math-flip")?.addEventListener("click", (e) => {
    e.preventDefault();
    beginMathFlip();
  });
  $("#btn-start-math-guess")?.addEventListener("click", (e) => {
    e.preventDefault();
    beginMathGuess();
  });
  $("#btn-math-setup-back")?.addEventListener("click", () => {
    pendingMode = null;
    applyMathPlayPanels(null);
    deps.showView("home");
  });
  $("#btn-math-setup-continue")?.addEventListener("click", () => {
    if (!pendingMode) return;
    if (!canStartDuoBattle()) {
      deps.showWarn(
        "需要兩位才能對戰",
        "請在首頁選「誰在練習」，並挑選對戰對象"
      );
      return;
    }
    const mode = pendingMode;
    openMathDuoMode(mode, () => {
      renderMathFirstPicker();
      deps.showView("mathFirst");
    });
  });
  $("#btn-math-first-back")?.addEventListener("click", () => {
    if (!pendingMode) {
      deps.showView("home");
      return;
    }
    renderMathSetupView();
    deps.showView("mathSetup");
  });
  $("#btn-math-play-back")?.addEventListener("click", async () => {
    if (getOnlineContext().roomId) {
      if (confirm("離開對戰？")) {
        await leaveOnlineRoom();
        game = null;
        applyMathPlayPanels(null);
        deps.showView("home");
      }
      return;
    }
    if (confirm("離開對戰？進度不會儲存。")) {
      game = null;
      pendingMode = null;
      applyMathPlayPanels(null);
      deps.showView("home");
    }
  });
  $("#btn-math-clear")?.addEventListener("click", clearSelection);
  $("#btn-math-submit")?.addEventListener("click", submitAnswer);
  $("#btn-math-replay")?.addEventListener("click", () => {
    const mode = game?.mode || "open";
    pendingMode = mode;
    game = null;
    applyMathPlayPanels(mode);
    renderMathFirstPicker();
    deps.showView("mathFirst");
  });
  $("#btn-math-home")?.addEventListener("click", () => {
    game = null;
    pendingMode = null;
    applyMathPlayPanels(null);
    deps.showView("home");
  });
}

/**
 * @param {MathDeps} d
 */
export function initFlipMath(d) {
  deps = d;
  initMathRangePicker();
  renderMathHomePlayers();
  applyMathPlayPanels(null);
  bindMathEvents();
}
