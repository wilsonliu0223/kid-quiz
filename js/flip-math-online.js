import { getMathRangeSetting } from "./flip-math-deck30.js?v=duo-active-v1";
import {
  registerOnlineGame,
  getOnlineContext,
  leaveOnlineRoom,
  openDuoModePicker,
} from "./online-duo.js?v=duo-online-v2";
import { startGameRoom, transactGameState } from "./room-service.js";

const WIN_SCORE = 5;
const FLIP_PER_TURN = 5;
const DIGIT_COPIES = 2;
const EXTRA_DIGIT_VALUE = 1;
const GUESS_HINT_IDLE = { text: "輸入數字後送出", level: "idle" };

/** @typedef {'host' | 'guest'} RoomSlot */
/** @typedef {'open'|'flip'|'guess'} MathMode */

/** @type {object | null} */
let onlineState = null;
/** @type {{ host: string, guest: string } | null} */
let names = null;
/** @type {MathMode | null} */
let activeMode = null;

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

function buildDeck() {
  const cards = [];
  let id = 0;
  for (let d = 0; d <= 9; d++) {
    for (let c = 0; c < DIGIT_COPIES; c++) {
      cards.push({ id: `d${id++}`, kind: "digit", value: d, label: String(d), faceUp: false });
    }
  }
  cards.push({ id: `d${id++}`, kind: "digit", value: EXTRA_DIGIT_VALUE, label: String(EXTRA_DIGIT_VALUE), faceUp: false });
  for (const value of [10, 50, 100, 500, 1000]) {
    cards.push({ id: `m${id++}`, kind: "money", value, label: String(value), faceUp: false });
  }
  for (const op of ["+", "-", "×", "÷"]) {
    cards.push({ id: `o${id++}`, kind: "op", value: op, label: op, faceUp: false });
  }
  return shuffle(cards);
}

function rangeBounds(rangeKey) {
  return rangeKey === "1000" ? { min: 100, max: 1000 } : { min: 10, max: 100 };
}

function pickSecret(rangeKey) {
  const { min, max } = rangeBounds(rangeKey);
  return randInt(min, max);
}

function pickTarget(rangeKey, mode) {
  const { min, max } = rangeBounds(rangeKey);
  return randInt(min, max);
}

function evaluateExpression(tokens) {
  if (!tokens.length) return null;
  if (tokens.length === 1) return typeof tokens[0] === "number" ? tokens[0] : null;
  if (tokens.length % 2 === 0) return null;
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0 && typeof tokens[i] !== "number") return null;
    if (i % 2 === 1 && !["+", "-", "×", "÷"].includes(tokens[i])) return null;
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
    } else i += 1;
  }
  let result = vals[0];
  for (let j = 0; j < ops.length; j++) {
    if (ops[j] === "+") result += vals[j + 1];
    else result -= vals[j + 1];
  }
  return result;
}

function validateSelection(cards) {
  if (!cards.length) return { ok: false, reason: "請先選牌" };
  const hasOp = cards.some((c) => c.kind === "op");
  if (!hasOp) {
    const sum = cards.reduce((s, c) => s + Number(c.value), 0);
    return { ok: true, value: sum, mode: "money" };
  }
  const tokens = cards.map((c) => (c.kind === "op" ? c.value : Number(c.value)));
  const value = evaluateExpression(tokens);
  if (value === null) return { ok: false, reason: "算式不合法" };
  return { ok: true, value, mode: "expr" };
}

function otherSlot(slot) {
  return slot === "host" ? "guest" : "host";
}

function slotLabel(slot, snap) {
  return snap?.players?.[slot]?.name || (slot === "host" ? "房主" : "來賓");
}

function renderSlotStartButtons(panel, snap, onPick) {
  ["host", "guest"].forEach((slot) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary gomoku-lobby-black-btn";
    btn.textContent = `${slotLabel(slot, snap)} 先手`;
    btn.addEventListener("click", () => onPick(/** @type {RoomSlot} */ (slot)));
    panel.appendChild(btn);
  });
}

function createRoundState(mode, rangeKey, firstSlot, scores = { host: 0, guest: 0 }) {
  if (mode === "guess") {
    return {
      mode,
      rangeKey,
      target: pickSecret(rangeKey),
      cards: [],
      scores: { ...scores },
      firstPlayerId: firstSlot,
      currentPlayerId: firstSlot,
      selection: [],
      turnFlippedIds: [],
      locked: false,
      guessInput: "",
      lastHint: { ...GUESS_HINT_IDLE },
      over: false,
      winner: null,
    };
  }
  const cards = buildDeck();
  if (mode === "open") cards.forEach((c) => { c.faceUp = true; });
  return {
    mode,
    rangeKey,
    target: pickTarget(rangeKey, mode),
    cards,
    scores: { ...scores },
    firstPlayerId: firstSlot,
    currentPlayerId: firstSlot,
    selection: [],
    turnFlippedIds: [],
    locked: false,
    guessInput: "",
    lastHint: { ...GUESS_HINT_IDLE },
    over: false,
    winner: null,
  };
}

async function startMathGame(roomId, firstSlot, snap, mode) {
  const rangeKey = snap.meta?.config?.rangeKey || getMathRangeSetting();
  await startGameRoom(roomId, createRoundState(mode, rangeKey, firstSlot));
}

function nameOf(slot) {
  return names?.[slot] || slot;
}

function mathModeTitle(mode) {
  if (mode === "flip") return "數學翻牌";
  if (mode === "guess") return "猜數字";
  return "數學攤牌";
}

function applyPanels(mode) {
  const cardsPanel = $("#math-cards-panel");
  const guessPanel = $("#math-guess-panel");
  const isGuess = mode === "guess";
  if (cardsPanel) {
    cardsPanel.hidden = isGuess;
    cardsPanel.style.display = isGuess ? "none" : "flex";
  }
  if (guessPanel) {
    guessPanel.hidden = !isGuess;
    guessPanel.style.display = isGuess ? "flex" : "none";
  }
}

function renderHeader() {
  if (!onlineState) return;
  const ctx = getOnlineContext();
  $("#math-play-name-a").textContent = nameOf("host");
  $("#math-play-name-b").textContent = nameOf("guest");
  $("#math-score-a").textContent = String(onlineState.scores.host ?? 0);
  $("#math-score-b").textContent = String(onlineState.scores.guest ?? 0);
  const me = ctx.slot === onlineState.currentPlayerId;
  $("#math-turn-label").textContent = `輪到：${nameOf(onlineState.currentPlayerId)}${me ? "（你）" : ""}`;
  $("#math-first-tag-a").hidden = onlineState.firstPlayerId !== "host";
  $("#math-first-tag-b").hidden = onlineState.firstPlayerId !== "guest";
  $("#math-mode-badge").textContent = mathModeTitle(onlineState.mode);
  $("#math-score-block-a")?.classList.toggle("flip-score-active", onlineState.currentPlayerId === "host");
  $("#math-score-block-b")?.classList.toggle("flip-score-active", onlineState.currentPlayerId === "guest");

  const { min, max } = rangeBounds(onlineState.rangeKey);
  if (onlineState.mode === "guess") {
    $("#math-guess-range").textContent = `猜 ${min}～${max}`;
    $("#math-guess-input").textContent = onlineState.guessInput || "—";
    const hintEl = $("#math-guess-hint");
    if (hintEl && onlineState.lastHint) {
      hintEl.textContent = onlineState.lastHint.text;
      hintEl.className = `math-guess-hint math-guess-hint-${onlineState.lastHint.level}`;
    }
    return;
  }

  $("#math-target-big").textContent = String(onlineState.target);
  $("#math-target-hint").textContent = `範圍 ${min}～${max} · 先 ${WIN_SCORE} 分勝`;
  const sel = onlineState.selection.map((id) => onlineState.cards.find((c) => c.id === id)).filter(Boolean);
  const exprEl = $("#math-expression");
  if (exprEl) {
    exprEl.textContent = sel.length
      ? sel.map((c) => c.label).join(" ")
      : "點選下方牌組成算式或湊錢";
  }
  const flipHint = $("#math-flip-hint");
  if (flipHint) {
    if (onlineState.mode === "flip") {
      flipHint.hidden = false;
      flipHint.textContent = `本回合已翻 ${onlineState.turnFlippedIds.length} / ${FLIP_PER_TURN} 張`;
    } else flipHint.hidden = true;
  }
}

function renderCards() {
  const grid = $("#math-card-grid");
  if (!grid || !onlineState || onlineState.mode === "guess") return;
  grid.classList.toggle("math-grid-open", onlineState.mode === "open");
  grid.classList.toggle("math-grid-flip", onlineState.mode === "flip");
  grid.innerHTML = "";
  const ctx = getOnlineContext();
  const myTurn = ctx.slot === onlineState.currentPlayerId && !onlineState.over && !onlineState.locked;

  onlineState.cards.forEach((card) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const parts = ["math-card", `math-card-${card.kind}`];
    if (onlineState.mode === "flip" && !card.faceUp) parts.push("math-card-down", `math-card-down-${card.kind}`);
    if (onlineState.selection.includes(card.id)) parts.push("math-card-selected");
    if (onlineState.turnFlippedIds.includes(card.id)) parts.push("math-card-turn");
    btn.className = parts.join(" ");
    btn.dataset.id = card.id;
    if (onlineState.mode === "flip" && !card.faceUp) {
      btn.innerHTML = `<span class="math-card-back math-card-back-${card.kind}"></span>`;
    } else {
      btn.innerHTML = `<span class="math-card-face">${card.label}</span>`;
    }
    btn.disabled = !myTurn || onlineState.locked;
    if (myTurn) btn.addEventListener("click", () => onCardClick(card.id));
    grid.appendChild(btn);
  });
  renderHeader();
}

function ensureNumpad() {
  const pad = $("#math-numpad");
  if (!pad || pad.children.length) return;
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"].forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "math-numpad-key" + (key === "⌫" ? " math-numpad-back" : "");
    btn.textContent = key;
    pad.appendChild(btn);
  });
}

function renderPlay() {
  if (!onlineState) return;
  applyPanels(onlineState.mode);
  if (onlineState.mode === "guess") {
    ensureNumpad();
    renderHeader();
  } else renderCards();
}

function applyRemote(snap) {
  onlineState = snap.state;
  activeMode = onlineState?.mode || null;
  names = {
    host: snap.players.host?.name || "房主",
    guest: snap.players.guest?.name || "來賓",
  };
  renderPlay();
  if (onlineState?.over) showResult();
}

function enterPlay(snap) {
  getOnlineContext().deps?.showView("mathPlay");
  applyRemote(snap);
}

function showResult() {
  if (!onlineState) return;
  const ctx = getOnlineContext();
  const a = onlineState.scores.host ?? 0;
  const b = onlineState.scores.guest ?? 0;
  $("#math-result-scores").textContent = `${nameOf("host")} ${a} ：${b} ${nameOf("guest")}`;
  const title = $("#math-result-title");
  if (onlineState.winner === "host") {
    title.textContent = ctx.slot === "host" ? "你贏了！" : `${nameOf("host")} 獲勝！`;
  } else if (onlineState.winner === "guest") {
    title.textContent = ctx.slot === "guest" ? "你贏了！" : `${nameOf("guest")} 獲勝！`;
  } else title.textContent = "平手！";
  ctx.deps?.showView("mathResult");
}

function checkWin(scores) {
  if ((scores.host ?? 0) >= WIN_SCORE) return "host";
  if ((scores.guest ?? 0) >= WIN_SCORE) return "guest";
  return null;
}

async function onCardClick(cardId) {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot) return;
  await transactGameState(ctx.roomId, (current) => {
    if (!current || current.over || current.locked || current.currentPlayerId !== ctx.slot) return;
    const cards = current.cards.map((c) => ({ ...c }));
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    if (current.mode === "flip") {
      if (!card.faceUp) {
        if (current.turnFlippedIds.length >= FLIP_PER_TURN) return;
        card.faceUp = true;
        return { ...current, cards, turnFlippedIds: [...current.turnFlippedIds, cardId] };
      }
      if (!current.turnFlippedIds.includes(cardId)) return;
      const selection = current.selection.includes(cardId)
        ? current.selection.filter((id) => id !== cardId)
        : [...current.selection, cardId];
      return { ...current, cards, selection };
    }

    const selection = current.selection.includes(cardId)
      ? current.selection.filter((id) => id !== cardId)
      : [...current.selection, cardId];
    return { ...current, cards, selection };
  });
}

async function submitAnswer() {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot) return;
  await transactGameState(ctx.roomId, (current) => {
    if (!current || current.over || current.locked || current.currentPlayerId !== ctx.slot) return;
    if (current.mode === "guess") return;

    const selCards = current.selection.map((id) => current.cards.find((c) => c.id === id)).filter(Boolean);
    const result = validateSelection(selCards);
    if (!result.ok) return;

    if (result.value !== current.target) {
      const cards = current.cards.map((c) => ({ ...c }));
      if (current.mode === "flip") {
        for (const id of current.turnFlippedIds) {
          const c = cards.find((x) => x.id === id);
          if (c) c.faceUp = false;
        }
      }
      return {
        ...current,
        cards,
        selection: [],
        turnFlippedIds: [],
        currentPlayerId: otherSlot(ctx.slot),
      };
    }

    const scores = { ...current.scores };
    scores[ctx.slot] = (scores[ctx.slot] || 0) + 1;
    const winner = checkWin(scores);
    if (winner) {
      return { ...current, scores, over: true, winner, selection: [], turnFlippedIds: [] };
    }
    const next = createRoundState(current.mode, current.rangeKey, current.currentPlayerId, scores);
    next.firstPlayerId = current.firstPlayerId;
    next.currentPlayerId = otherSlot(ctx.slot);
    return next;
  });
}

async function submitGuess() {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot) return;
  await transactGameState(ctx.roomId, (current) => {
    if (!current || current.over || current.mode !== "guess" || current.currentPlayerId !== ctx.slot) return;
    const raw = String(current.guessInput || "").trim();
    if (!raw) return;
    const guess = Number(raw);
    if (!Number.isFinite(guess)) return;
    const { min, max } = rangeBounds(current.rangeKey);
    if (guess < min || guess > max) return;

    if (guess === current.target) {
      const scores = { ...current.scores };
      scores[ctx.slot] = (scores[ctx.slot] || 0) + 1;
      const winner = checkWin(scores);
      if (winner) return { ...current, scores, over: true, winner, guessInput: "" };
      const next = createRoundState("guess", current.rangeKey, otherSlot(ctx.slot), scores);
      next.firstPlayerId = current.firstPlayerId;
      return next;
    }

    const diff = Math.abs(guess - current.target);
    let hint;
    if (diff < 5) hint = { text: "快猜中了！", level: "hot" };
    else if (guess > current.target) {
      hint = diff < 25 ? { text: "偏大一點", level: "warm" } : { text: "太大了", level: "far" };
    } else {
      hint = diff < 25 ? { text: "偏小一點", level: "warm" } : { text: "太小了", level: "far" };
    }
    return {
      ...current,
      guessInput: "",
      lastHint: hint,
      currentPlayerId: otherSlot(ctx.slot),
    };
  });
}

async function appendGuessDigit(digit) {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot) return;
  await transactGameState(ctx.roomId, (current) => {
    if (!current || current.mode !== "guess" || current.currentPlayerId !== ctx.slot) return;
    const maxD = current.rangeKey === "1000" ? 4 : 3;
    if (String(current.guessInput || "").length >= maxD) return;
    return { ...current, guessInput: String(current.guessInput || "") + digit };
  });
}

async function backspaceGuess() {
  const ctx = getOnlineContext();
  if (!ctx.roomId) return;
  await transactGameState(ctx.roomId, (current) => {
    if (!current || current.mode !== "guess") return;
    return { ...current, guessInput: String(current.guessInput || "").slice(0, -1) };
  });
}

function bindMathOnlineUi() {
  if (bindMathOnlineUi.done) return;
  bindMathOnlineUi.done = true;
  $("#btn-math-submit")?.addEventListener("click", () => {
    if (!getOnlineContext().roomId || !onlineState) return;
    if (onlineState.mode === "guess") submitGuess();
    else submitAnswer();
  });
  const pad = $("#math-numpad");
  pad?.addEventListener("click", (e) => {
    if (!getOnlineContext().roomId || onlineState?.mode !== "guess") return;
    const btn = e.target instanceof Element ? e.target.closest(".math-numpad-key") : null;
    if (!btn) return;
    const key = btn.textContent?.trim() || "";
    if (key === "⌫") backspaceGuess();
    else if (/^\d$/.test(key)) appendGuessDigit(key);
  });
  $("#btn-math-clear")?.addEventListener("click", () => {
    if (!getOnlineContext().roomId) return;
    if (onlineState?.mode === "guess") backspaceGuess();
    else transactGameState(getOnlineContext().roomId, (c) => (c ? { ...c, selection: [] } : undefined));
  });
}

function onMathPlaying(snap) {
  bindMathOnlineUi();
  const onPlay = $("#view-math-play")?.classList.contains("view-active");
  const onResult = $("#view-math-result")?.classList.contains("view-active");
  if (!onPlay && !onResult) enterPlay(snap);
  else applyRemote(snap);
}

function registerMathMode(mode) {
  const titles = { open: "數學攤牌", flip: "數學翻牌", guess: "猜數字" };
  registerOnlineGame(`math-${mode}`, {
    startHint: mode === "guess" ? "請選誰先猜" : "請選誰先出牌",
    renderStartButtons: renderSlotStartButtons,
    startGame: (roomId, slot, snap) => startMathGame(roomId, slot, snap, mode),
    onPlaying: onMathPlaying,
  });
  return titles[mode];
}

["open", "flip", "guess"].forEach(registerMathMode);

export function openMathDuoMode(mode, localStart) {
  openDuoModePicker({
    game: `math-${mode}`,
    title: mathModeTitle(mode),
    backView: "mathSetup",
    localStart,
    config: { rangeKey: getMathRangeSetting(), mode },
  });
}
