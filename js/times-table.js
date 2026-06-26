const KEY_MUL_PROGRESS = "kid-quiz-mul-progress";
const PASS_CORRECT = 8;
const QUIZ_SIZE = 9;
const HARD_QUIZ_SIZE = 18;
const HARD_PASS_CORRECT = 16;
const DIGITS = [2, 3, 4, 5, 6, 7, 8, 9];

import {
  randomLifeStory,
  lifeQuestionText,
  pickLifeQuestionFlags,
} from "./mul-life-scenarios.js";

/** @type {MulDeps | null} */
let deps = null;
/** @type {MulSession | null} */
let session = null;
/** @type {number | null} */
let learnDigit = null;
/** @type {ReturnType<typeof setInterval> | null} */
let reciteTimer = null;
let reciteIndex = 0;
let revealIndex = 0;
let revealLifePrompt = "";
/** @type {number[]} */
let pairPicks = [];
/** @type {Set<string>} */
let foundPairKeys = new Set();
let pairTapLock = false;

/**
 * @typedef {object} MulDeps
 * @property {(name: string) => void} showView
 * @property {() => string} getSelectedChild
 * @property {(title: string, sub?: string, onClose?: () => void) => void} showWarn
 * @property {(title: string, sub?: string, onClose?: () => void) => void} showOk
 */

/**
 * @typedef {'product'|'factorA'|'factorB'|'factorPair'} MulBlank
 * @typedef {'choices'|'digit19'|'factorPair'} MulInputMode
 * @typedef {object} MulQuestion
 * @property {number} a
 * @property {number} b
 * @property {number} product
 * @property {MulBlank} blank
 * @property {string} prompt
 * @property {number} answer
 * @property {MulInputMode} inputMode
 * @property {number[]} choices
 * @property {string} factKey
 * @property {boolean} [isLife]
 * @property {string} [lifePrompt]
 * @property {boolean} [isFactorPair]
 * @property {string[]} [validPairLabels]
 *
 * @typedef {object} MulWrong
 * @property {MulQuestion} question
 * @property {number} attempts
 *
 * @typedef {object} MulSession
 * @property {number} [digit]
 * @property {'digit'|'full'|'hard-digit'|'hard-full'} quizMode
 * @property {MulQuestion[]} questions
 * @property {number} index
 * @property {number} correct
 * @property {MulWrong[]} wrongs
 * @property {boolean} retryMode
 * @property {number} hintCount
 */

const $ = (sel) => document.querySelector(sel);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function factKey(a, b) {
  return `${a}x${b}`;
}

function loadProgressRoot() {
  try {
    const raw = localStorage.getItem(KEY_MUL_PROGRESS);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { A: {}, B: {} };
}

function saveProgressRoot(root) {
  localStorage.setItem(KEY_MUL_PROGRESS, JSON.stringify(root));
}

function defaultDigitProgress() {
  return {
    learned: false,
    bestCorrect: 0,
    passed: false,
    phaseB: false,
    hardBestCorrect: 0,
    hardPassed: false,
  };
}

function defaultFullQuizProgress() {
  return { bestCorrect: 0, passed: false, hardBestCorrect: 0, hardPassed: false };
}

function getFullQuizProgress() {
  const child = deps.getSelectedChild();
  const root = loadProgressRoot();
  if (!root[child]) root[child] = {};
  if (!root[child].fullQuiz) root[child].fullQuiz = defaultFullQuizProgress();
  return root[child].fullQuiz;
}

function setFullQuizProgress(patch) {
  const child = deps.getSelectedChild();
  const root = loadProgressRoot();
  if (!root[child]) root[child] = {};
  root[child].fullQuiz = { ...getFullQuizProgress(), ...patch };
  saveProgressRoot(root);
}

function getDigitProgress(digit) {
  const child = deps.getSelectedChild();
  const root = loadProgressRoot();
  if (!root[child]) root[child] = {};
  if (!root[child][digit]) root[child][digit] = defaultDigitProgress();
  return root[child][digit];
}

function setDigitProgress(digit, patch) {
  const child = deps.getSelectedChild();
  const root = loadProgressRoot();
  if (!root[child]) root[child] = {};
  root[child][digit] = { ...getDigitProgress(digit), ...patch };
  saveProgressRoot(root);
}

function blankTypes() {
  return /** @type {MulBlank[]} */ (["product", "factorA", "factorB"]);
}

function pickBlankTypes(count) {
  const pool = shuffle(blankTypes());
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[i % pool.length]);
  }
  return shuffle(out);
}

/** 進階：只考求因數（較難） */
function pickFactorOnlyBlanks(count) {
  const types = /** @type {MulBlank[]} */ (["factorA", "factorB"]);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(types[i % 2]);
  }
  return shuffle(out);
}

function isHardQuizMode(mode) {
  return mode === "hard-digit" || mode === "hard-full";
}

function isDigitKeypadMode(mode) {
  return mode === "digit" || mode === "hard-digit";
}

function passThreshold(mode) {
  return mode === "hard-full" ? HARD_PASS_CORRECT : PASS_CORRECT;
}

function maxHints(mode) {
  return isHardQuizMode(mode) ? 2 : 3;
}

function quizTitle(session) {
  if (session.quizMode === "full") return "全部測驗 · 2～9";
  if (session.quizMode === "hard-full") return "進階挑戰 · 2～9";
  if (session.quizMode === "hard-digit") return `背 ${session.digit} · 進階`;
  return `背 ${session.digit} · 測驗`;
}

const HARD_PAIR_COUNT_FULL = 6;
const HARD_PAIR_COUNT_DIGIT = 3;

function pairLabel(a, b) {
  return `${a} × ${b}`;
}

function factorPairKey(product) {
  return `pair${product}`;
}

function pairUnorderedKey(a, b) {
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

/** 這個積在九九表內有幾種不同的因數組合 */
function getRequiredPairKeys(q, quizMode) {
  const minF = isDigitKeypadMode(quizMode) ? 1 : 2;
  const keys = new Set();
  for (let a = minF; a <= 9; a++) {
    if (q.product % a !== 0) continue;
    const b = q.product / a;
    if (b < minF || b > 9) continue;
    keys.add(pairUnorderedKey(a, b));
  }
  return keys;
}

function formatFoundPairsList(keys) {
  return [...keys]
    .map((k) => {
      const [a, b] = k.split("x").map((s) => parseInt(s, 10));
      return pairLabel(a, b);
    })
    .join("、");
}

/** 積的所有合法「□ × □」寫法（因數在 min～max） */
function allValidPairLabels(product, minF, maxF) {
  const labels = new Set();
  for (let a = minF; a <= maxF; a++) {
    if (product % a !== 0) continue;
    const b = product / a;
    if (b >= minF && b <= maxF) labels.add(pairLabel(a, b));
  }
  return [...labels];
}

function unorderedPairCount(product, minF, maxF) {
  const seen = new Set();
  for (let a = minF; a <= maxF; a++) {
    if (product % a !== 0) continue;
    const b = product / a;
    if (b < minF || b > maxF) continue;
    seen.add(`${Math.min(a, b)}x${Math.max(a, b)}`);
  }
  return seen.size;
}

function pickFactorPairProducts(quizMode, count, digit = null) {
  const minF = isDigitKeypadMode(quizMode) ? 1 : 2;
  let pool = [];
  for (let p = 4; p <= 81; p++) {
    if (unorderedPairCount(p, minF, 9) >= 2) pool.push(p);
  }
  if (digit) {
    const filtered = pool.filter((p) => p % digit === 0);
    if (filtered.length >= Math.min(count, 1)) pool = filtered;
  }
  return shuffle(pool).slice(0, count);
}

function toFactorPairQuestion(product, quizMode) {
  const minF = isDigitKeypadMode(quizMode) ? 1 : 2;
  const validLabels = allValidPairLabels(product, minF, 9);
  if (!validLabels.length) return null;
  const [a, b] = validLabels[0].split("×").map((s) => parseInt(s.trim(), 10));
  return {
    a,
    b,
    product,
    blank: /** @type {MulBlank} */ ("factorPair"),
    prompt: `${product} ＝ □ × □`,
    answer: 0,
    inputMode: /** @type {MulInputMode} */ ("factorPair"),
    validPairLabels: validLabels,
    factKey: factorPairKey(product),
    isFactorPair: true,
  };
}

function rebuildHardFromKeys(onlyKeys, quizMode, digit) {
  const qs = [];
  let factIdx = 0;
  onlyKeys.forEach((key) => {
    if (key.startsWith("pair")) {
      const product = parseInt(key.slice(4), 10);
      const q = toFactorPairQuestion(product, quizMode);
      if (q) qs.push(q);
      return;
    }
    const m = key.match(/^(\d+)x(\d+)$/);
    if (!m) return;
    const fact = {
      a: parseInt(m[1], 10),
      b: parseInt(m[2], 10),
      product: parseInt(m[1], 10) * parseInt(m[2], 10),
    };
    if (digit && fact.a !== digit) return;
    const blank = /** @type {MulBlank[]} */ (["factorA", "factorB"])[
      factIdx % 2
    ];
    factIdx += 1;
    qs.push(toQuestion(fact, blank, quizMode, { isLife: true }));
  });
  return qs;
}

function mixHardQuestions(quizMode, digit = null, onlyKeys = null) {
  if (onlyKeys) return rebuildHardFromKeys(onlyKeys, quizMode, digit);

  const isFull = quizMode === "full";
  const total = isFull ? HARD_QUIZ_SIZE : QUIZ_SIZE;
  const pairCount = isFull ? HARD_PAIR_COUNT_FULL : HARD_PAIR_COUNT_DIGIT;
  const regularCount = total - pairCount;

  const pairProducts = pickFactorPairProducts(quizMode, pairCount, digit);
  const pairQs = pairProducts
    .map((p) => toFactorPairQuestion(p, quizMode))
    .filter(Boolean);

  let facts =
    digit !== null ? factsForDigit(digit) : shuffle(allFactsPool()).slice(0, regularCount);
  if (digit !== null) {
    facts = shuffle(facts).slice(0, regularCount);
  }
  const blanks = pickFactorOnlyBlanks(facts.length);
  const regularQs = facts.map((f, i) =>
    toQuestion(f, blanks[i], quizMode, { isLife: true })
  );

  return shuffle([...pairQs, ...regularQs]);
}

function allFactsPool() {
  const facts = [];
  for (const a of DIGITS) {
    for (const b of DIGITS) {
      facts.push({ a, b, product: a * b });
    }
  }
  return facts;
}

function buildChoices(answer, inputMode, quizMode = "full") {
  if (inputMode === "digit19") {
    const pool =
      quizMode === "digit"
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n !== answer)
        : DIGITS.filter((n) => n !== answer);
    const picks = shuffle(pool).slice(0, 3);
    return shuffle([answer, ...picks]);
  }
  const deltas = [-3, -2, -1, 1, 2, 3, 10, -10];
  const wrong = new Set();
  while (wrong.size < 3) {
    const d = deltas[Math.floor(Math.random() * deltas.length)];
    const v = answer + d;
    if (v > 0 && v !== answer && v <= 81) wrong.add(v);
  }
  return shuffle([answer, ...wrong]);
}

/**
 * @param {{ a: number, b: number, product: number }} fact
 * @param {MulBlank} blank
 */
function toQuestion(fact, blank, quizMode = "full", options = {}) {
  const { a, b, product } = fact;
  let prompt = "";
  let answer = 0;
  let inputMode = /** @type {MulInputMode} */ ("choices");

  if (blank === "product") {
    prompt = `${a} × ${b} = □`;
    answer = product;
    inputMode = "choices";
  } else if (blank === "factorB") {
    prompt = `${a} × □ = ${product}`;
    answer = b;
    inputMode = "digit19";
  } else {
    prompt = `□ × ${b} = ${product}`;
    answer = a;
    inputMode = "digit19";
  }

  const q = {
    a,
    b,
    product,
    blank,
    prompt,
    answer,
    inputMode,
    choices: buildChoices(answer, inputMode, quizMode),
    factKey: factKey(a, b),
  };

  if (options.isLife) {
    q.isLife = true;
    q.lifePrompt = lifeQuestionText(
      a,
      b,
      product,
      blank,
      options.templateId
    );
  }

  return q;
}

function factsForDigit(digit) {
  const facts = [];
  for (let n = 1; n <= 9; n++) {
    facts.push({ a: digit, b: n, product: digit * n });
  }
  return facts;
}

function buildDigitQuiz(digit, onlyKeys = null) {
  let facts = factsForDigit(digit);
  if (onlyKeys) {
    facts = facts.filter((f) => onlyKeys.includes(factKey(f.a, f.b)));
  }
  const blanks = pickBlankTypes(facts.length);
  const lifeFlags = pickLifeQuestionFlags(facts.length);
  return facts.map((f, i) =>
    toQuestion(f, blanks[i], "digit", { isLife: lifeFlags[i] })
  );
}

function buildHardDigitQuiz(digit, onlyKeys = null) {
  return mixHardQuestions("digit", digit, onlyKeys);
}

function buildRandomQuiz(onlyKeys = null) {
  let facts = allFactsPool();
  if (onlyKeys) {
    facts = facts.filter((f) => onlyKeys.includes(factKey(f.a, f.b)));
  } else {
    facts = shuffle(facts).slice(0, QUIZ_SIZE);
  }
  const blanks = pickBlankTypes(facts.length);
  const lifeFlags = pickLifeQuestionFlags(facts.length);
  return facts.map((f, i) =>
    toQuestion(f, blanks[i], "full", { isLife: lifeFlags[i] })
  );
}

function buildHardRandomQuiz(onlyKeys = null) {
  return mixHardQuestions("full", null, onlyKeys);
}

function stopRecite() {
  if (reciteTimer) {
    clearInterval(reciteTimer);
    reciteTimer = null;
  }
}

/** @param {HTMLElement | null} el */
function setMulPanelVisible(el, show, display = "flex") {
  if (!el) return;
  el.hidden = !show;
  el.style.display = show ? display : "none";
  el.classList.toggle("mul-panel-off", !show);
}

function applyMulQuizAnswerPanels(inputMode) {
  const factorPad = $("#mul-factor-pad");
  const choicePad = $("#mul-choice-pad");
  const pairClear = $("#btn-mul-pair-clear");
  const isFactor = inputMode === "digit19" || inputMode === "factorPair";
  setMulPanelVisible(factorPad, isFactor, "grid");
  setMulPanelVisible(choicePad, inputMode === "choices", "grid");
  if (pairClear) {
    pairClear.hidden = inputMode !== "factorPair";
    pairClear.style.display = inputMode === "factorPair" ? "block" : "none";
  }
}

function applyMulLearnPanels(mode) {
  const recite = $("#mul-learn-recite-panel");
  const reveal = $("#mul-learn-reveal-panel");
  const row = $("#mul-learn-row");
  const sub = $("#mul-learn-sub");
  const body = document.querySelector("#view-mul-learn .mul-body");
  const isRecite = mode === "recite";
  setMulPanelVisible(recite, isRecite);
  setMulPanelVisible(reveal, !isRecite);
  if (row) {
    row.hidden = !isRecite;
    row.style.display = isRecite ? "grid" : "none";
    row.classList.toggle("mul-panel-off", !isRecite);
  }
  if (sub) {
    sub.hidden = !isRecite;
    sub.style.display = isRecite ? "block" : "none";
  }
  body?.classList.toggle("mul-learn-reveal-active", !isRecite);
  if (isRecite) {
    const n = reciteIndex + 1;
    if (learnDigit) showLearnLifeStory(learnDigit, n);
  } else {
    hideLearnLifeStory();
  }
}

function resetMulPanels() {
  applyMulLearnPanels("recite");
  applyMulQuizAnswerPanels("digit19");
  setMulPanelVisible($("#mul-factor-pad"), false, "grid");
  setMulPanelVisible($("#mul-choice-pad"), false, "grid");
  const pairClear = $("#btn-mul-pair-clear");
  if (pairClear) {
    pairClear.hidden = true;
    pairClear.style.display = "none";
  }
  pairPicks = [];
  foundPairKeys = new Set();
}

function renderDigitGrid() {
  const grid = $("#mul-digit-grid");
  if (!grid) return;
  grid.innerHTML = "";
  DIGITS.forEach((d) => {
    const prog = getDigitProgress(d);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mul-digit-btn";
    if (prog.passed) btn.classList.add("mul-digit-passed");
    else if (prog.bestCorrect > 0 || prog.learned) btn.classList.add("mul-digit-tried");
    btn.textContent = String(d);
    btn.dataset.digit = String(d);
    if (prog.passed) {
      const star = document.createElement("span");
      star.className = "mul-digit-star";
      star.textContent = "★";
      btn.appendChild(star);
    }
    btn.addEventListener("click", () => openLearn(d));
    grid.appendChild(btn);
  });
}

function renderLearnRow() {
  if (!learnDigit) return;
  const row = $("#mul-learn-row");
  if (!row) return;
  row.innerHTML = "";
  for (let n = 1; n <= 9; n++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "mul-learn-cell";
    cell.textContent = `${learnDigit}×${n}=${learnDigit * n}`;
    cell.dataset.n = String(n);
    cell.addEventListener("click", () => selectLearnFact(n - 1));
    row.appendChild(cell);
  }
  highlightLearnCell(reciteIndex);
}

function selectLearnFact(index) {
  if (!learnDigit) return;
  stopRecite();
  reciteIndex = index;
  updateReciteLine();
  showLearnLifeStory(learnDigit, index + 1);
}

function showLearnLifeStory(a, b) {
  const el = $("#mul-learn-life-story");
  if (!el) return;
  el.textContent = randomLifeStory(a, b);
  el.hidden = false;
}

function hideLearnLifeStory() {
  const el = $("#mul-learn-life-story");
  if (el) el.hidden = true;
}

function highlightLearnCell(index) {
  const cells = document.querySelectorAll("#mul-learn-row .mul-learn-cell");
  cells.forEach((c, i) => {
    c.classList.toggle("mul-learn-cell-active", i === index);
  });
}

function updateReciteLine() {
  if (!learnDigit) return;
  const n = reciteIndex + 1;
  const line = $("#mul-recite-line");
  if (line) {
    line.textContent = `${learnDigit} × ${n} ＝ ${learnDigit * n}`;
  }
  highlightLearnCell(reciteIndex);
  showLearnLifeStory(learnDigit, n);
}

function startRecite() {
  if (!learnDigit) return;
  stopRecite();
  reciteIndex = 0;
  updateReciteLine();
  reciteTimer = setInterval(() => {
    reciteIndex += 1;
    if (reciteIndex >= 9) {
      stopRecite();
      setDigitProgress(learnDigit, { learned: true });
      deps.showOk("跟念完成", "可以開始測驗囉");
      return;
    }
    updateReciteLine();
  }, 1500);
}

function renderRevealChoicePad(answer) {
  const pad = $("#mul-reveal-choice-pad");
  if (!pad) return;
  pad.innerHTML = "";
  const choices = buildChoices(answer, "choices", "digit");
  choices.forEach((val) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mul-choice-key";
    btn.textContent = String(val);
    btn.addEventListener("click", () => submitRevealAnswer(val, answer));
    pad.appendChild(btn);
  });
}

function submitRevealAnswer(value, expected) {
  const hint = $("#mul-reveal-hint");
  if (value === expected) {
    const lifeLine = revealLifePrompt
      ? revealLifePrompt.replace("□", String(expected))
      : `${learnDigit} × ${revealIndex + 1} ＝ ${expected}`;
    deps.showOk("答對了！", lifeLine, () => advanceRevealLine());
    return;
  }
  if (hint) {
    hint.textContent = "還不對，再選一次";
    hint.className = "mul-reveal-hint mul-reveal-hint-warn";
  }
  deps.showWarn("還不對喔", `正確是 ${expected}`);
}

function advanceRevealLine() {
  revealIndex += 1;
  if (revealIndex >= 9) {
    if (learnDigit) setDigitProgress(learnDigit, { learned: true });
    deps.showOk("遮答案練完了", "可以開始測驗");
    revealIndex = 8;
    renderRevealCard();
    return;
  }
  renderRevealCard();
}

function renderRevealCard() {
  if (!learnDigit) return;
  const n = revealIndex + 1;
  const answer = learnDigit * n;
  const eq = $("#mul-reveal-equation");
  const hint = $("#mul-reveal-hint");
  const lifeEl = $("#mul-reveal-life-story");
  revealLifePrompt = lifeQuestionText(learnDigit, n, answer, "product");
  if (lifeEl) {
    lifeEl.textContent = revealLifePrompt;
    lifeEl.hidden = false;
  }
  if (eq) {
    eq.textContent = `${learnDigit} × ${n} ＝ □`;
  }
  if (hint) {
    hint.textContent = "選出正確答案";
    hint.className = "mul-reveal-hint";
  }
  renderRevealChoicePad(answer);
}

function openLearn(digit) {
  learnDigit = digit;
  reciteIndex = 0;
  revealIndex = 0;
  stopRecite();
  $("#mul-learn-title").textContent = `背 ${digit}`;
  $("#mul-learn-sub").textContent = `${digit} × 1 ～ ${digit} × 9`;
  renderLearnRow();
  applyMulLearnPanels("recite");
  updateReciteLine();
  renderRevealCard();
  deps.showView("mulLearn");
}

function openPick() {
  if (!deps) return;
  learnDigit = null;
  session = null;
  stopRecite();
  resetMulPanels();
  renderDigitGrid();
  renderFullQuizBlock();
  renderHardFullBlock();
  deps.showView("mulPick");
}

function renderHardFullBlock() {
  const prog = getFullQuizProgress();
  const meta = $("#mul-hard-meta");
  if (meta) {
    meta.textContent = prog.hardPassed
      ? `已過關 · 最佳 ${prog.hardBestCorrect}/${HARD_QUIZ_SIZE}`
      : prog.hardBestCorrect > 0
        ? `最佳 ${prog.hardBestCorrect}/${HARD_QUIZ_SIZE}`
        : "18 題 · 生活題 · 因數分解";
  }
  const btn = $("#btn-mul-hard-full-quiz");
  if (btn) btn.classList.toggle("mul-hard-passed", !!prog.hardPassed);
}

function renderFullQuizBlock() {
  const prog = getFullQuizProgress();
  const meta = $("#mul-full-meta");
  if (meta) {
    meta.textContent = prog.passed
      ? `已過關 · 最佳 ${prog.bestCorrect}/${QUIZ_SIZE}`
      : prog.bestCorrect > 0
        ? `最佳 ${prog.bestCorrect}/${QUIZ_SIZE}`
        : "2～9 隨機 · 9 題";
  }
  const btn = $("#btn-mul-full-quiz");
  if (btn) btn.classList.toggle("mul-full-passed", prog.passed);
}

function startQuiz(retryWrongs = false, hard = false) {
  if (!learnDigit) return;
  const mode = hard ? "hard-digit" : "digit";
  let questions;
  if (
    retryWrongs &&
    session?.wrongs?.length &&
    session.quizMode === mode
  ) {
    const keys = session.wrongs.map((w) => w.question.factKey);
    questions = hard
      ? buildHardDigitQuiz(learnDigit, keys)
      : buildDigitQuiz(learnDigit, keys);
  } else {
    questions = hard
      ? buildHardDigitQuiz(learnDigit)
      : buildDigitQuiz(learnDigit);
  }
  session = {
    digit: learnDigit,
    quizMode: mode,
    questions,
    index: 0,
    correct: 0,
    wrongs: [],
    retryMode: retryWrongs,
    hintCount: 0,
  };
  resetMulPanels();
  renderQuizQuestion();
  deps.showView("mulQuiz");
}

function startFullQuiz(retryWrongs = false, hard = false) {
  learnDigit = null;
  const mode = hard ? "hard-full" : "full";
  let questions;
  if (
    retryWrongs &&
    session?.wrongs?.length &&
    session.quizMode === mode
  ) {
    const keys = session.wrongs.map((w) => w.question.factKey);
    questions = hard
      ? buildHardRandomQuiz(keys)
      : buildRandomQuiz(keys);
  } else {
    questions = hard ? buildHardRandomQuiz() : buildRandomQuiz();
  }
  session = {
    quizMode: mode,
    questions,
    index: 0,
    correct: 0,
    wrongs: [],
    retryMode: retryWrongs,
    hintCount: 0,
  };
  resetMulPanels();
  renderQuizQuestion();
  deps.showView("mulQuiz");
}

function renderQuizQuestion() {
  if (!session) return;
  const q = session.questions[session.index];
  if (!q) return;
  session.hintCount = 0;
  $("#mul-quiz-title").textContent = quizTitle(session);
  $("#mul-quiz-progress").textContent = `第 ${session.index + 1} / ${session.questions.length} 題`;
  const lifeEl = $("#mul-quiz-life-story");
  const promptEl = $("#mul-prompt");
  const badgeEl = $("#mul-pair-badge");
  pairPicks = [];
  foundPairKeys = new Set();
  if (badgeEl) badgeEl.hidden = !q.isFactorPair;
  if (q.isFactorPair && promptEl) {
    promptEl.textContent = `${q.product} ＝ □ × □`;
    if (lifeEl) lifeEl.hidden = true;
    updatePairProgressHint(q);
  } else if (q.isLife && q.lifePrompt && lifeEl && promptEl) {
    lifeEl.textContent = q.lifePrompt;
    lifeEl.hidden = false;
    promptEl.textContent = q.prompt;
    promptEl.classList.add("mul-prompt-equation");
  } else if (lifeEl && promptEl) {
    lifeEl.hidden = true;
    promptEl.textContent = q.prompt;
    promptEl.classList.remove("mul-prompt-equation");
  }
  const hintEl = $("#mul-quiz-hint");
  if (hintEl) {
    if (q.isFactorPair) {
      hintEl.textContent = pairMainHint(q);
    } else if (isHardQuizMode(session.quizMode)) {
      hintEl.textContent = "進階題：想想生活題，選因數";
    } else if (q.isLife) {
      hintEl.textContent = "想想生活題，再選答案";
    } else {
      hintEl.textContent = "選出正確答案";
    }
    hintEl.className = "mul-quiz-hint";
  }
  applyMulQuizAnswerPanels(q.inputMode);
  if (q.inputMode === "digit19") {
    renderFactorPad(session.quizMode);
  } else if (q.inputMode === "factorPair") {
    renderFactorPairPad(q);
  } else {
    renderChoicePad(q);
  }
}

function updatePairPrompt(q) {
  const promptEl = $("#mul-prompt");
  if (!promptEl) return;
  if (pairPicks.length === 0) {
    promptEl.textContent = `${q.product} ＝ □ × □`;
  } else if (pairPicks.length === 1) {
    promptEl.textContent = `${q.product} ＝ ${pairPicks[0]} × □`;
  } else {
    promptEl.textContent = `${q.product} ＝ ${pairPicks[0]} × ${pairPicks[1]}`;
  }
}

function pairMainHint(q) {
  const required = getRequiredPairKeys(q, session.quizMode);
  const total = required.size;
  const found = foundPairKeys.size;
  if (total <= 1) {
    return "多選題：點兩個因數，相乘要等於上面的數";
  }
  if (found === 0) {
    return `多選題：找出全部 ${total} 組因數（每組點兩個數字）`;
  }
  return `已找到 ${found} / ${total} 組，繼續找剩下的組合`;
}

function updatePairProgressHint(q) {
  const hintEl = $("#mul-quiz-hint");
  if (!hintEl || !q.isFactorPair) return;
  hintEl.textContent = pairMainHint(q);
  hintEl.className =
    foundPairKeys.size > 0 ? "mul-quiz-hint mul-quiz-hint-warm" : "mul-quiz-hint";
}

function updatePairHintAfterPick() {
  const hintEl = $("#mul-quiz-hint");
  if (!hintEl || !session) return;
  const q = session.questions[session.index];
  if (!q?.isFactorPair) return;
  if (pairPicks.length === 1) {
    hintEl.textContent = `已選 ${pairPicks[0]}，再選第二個因數`;
    hintEl.className = "mul-quiz-hint";
    return;
  }
  updatePairProgressHint(q);
}

function isPairProductCorrect(q, a, b) {
  const minF = isDigitKeypadMode(session?.quizMode ?? "full") ? 1 : 2;
  if (a < minF || a > 9 || b < minF || b > 9) return false;
  return a * b === q.product;
}

function renderFactorPairPad(q) {
  const pad = $("#mul-factor-pad");
  if (!pad) return;
  const nums = isDigitKeypadMode(session.quizMode)
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
    : DIGITS;
  pad.innerHTML = "";
  nums.forEach((n) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mul-factor-key";
    if (pairPicks.includes(n)) btn.classList.add("mul-factor-key-picked");
    btn.textContent = String(n);
    btn.addEventListener("click", () => onPairFactorTap(n, q));
    pad.appendChild(btn);
  });
}

function clearPairPicks(q) {
  pairPicks = [];
  if (q) {
    renderFactorPairPad(q);
    updatePairPrompt(q);
    updatePairHintAfterPick();
  }
}

function onPairFactorTap(n, q) {
  if (!session || pairTapLock) return;
  pairTapLock = true;
  setTimeout(() => {
    pairTapLock = false;
  }, 280);

  if (pairPicks.length >= 2) {
    pairPicks = [n];
    renderFactorPairPad(q);
    updatePairPrompt(q);
    updatePairHintAfterPick();
    return;
  }
  pairPicks.push(n);
  renderFactorPairPad(q);
  updatePairPrompt(q);
  if (pairPicks.length < 2) {
    updatePairHintAfterPick();
    return;
  }

  const [a, b] = pairPicks;
  pairPicks = [];

  if (!isPairProductCorrect(q, a, b)) {
    pairWrongAttempt(q);
    return;
  }

  const key = pairUnorderedKey(a, b);
  if (foundPairKeys.has(key)) {
    renderFactorPairPad(q);
    updatePairPrompt(q);
    updatePairProgressHint(q);
    deps.showWarn("這組找過了", "試試別的因數組合");
    return;
  }

  foundPairKeys.add(key);
  const required = getRequiredPairKeys(q, session.quizMode);

  if (foundPairKeys.size >= required.size) {
    session.correct += 1;
    const allPairs = formatFoundPairsList(required);
    deps.showOk("全部找齊了！", `${q.product} ＝ ${allPairs}`, () => {
      foundPairKeys = new Set();
      goNextQuestion();
    });
    return;
  }

  renderFactorPairPad(q);
  updatePairPrompt(q);
  updatePairProgressHint(q);
  const left = required.size - foundPairKeys.size;
  deps.showOk(
    "找到一組！",
    `${a} × ${b} ＝ ${q.product}，還有 ${left} 組沒找到`,
    () => {}
  );
}

function pairWrongAttempt(q) {
  session.hintCount += 1;
  pairPicks = [];
  renderFactorPairPad(q);
  updatePairPrompt(q);
  updatePairProgressHint(q);
  const hintEl = $("#mul-quiz-hint");
  const hintsLeft = maxHints(session.quizMode);
  if (session.hintCount < hintsLeft) {
    if (hintEl) {
      hintEl.textContent = hintText(q);
      hintEl.className = "mul-quiz-hint mul-quiz-hint-warm";
    }
    deps.showWarn("還不對喔", hintText(q));
    return;
  }
  if (!session.wrongs.find((w) => w.question.factKey === q.factKey)) {
    session.wrongs.push({ question: q, attempts: session.hintCount });
  }
  deps.showWarn("這題是", formatQuestionReveal(q), () => {
    pairPicks = [];
    foundPairKeys = new Set();
    goNextQuestion();
  });
}

function renderFactorPad(quizMode = "full") {
  const pad = $("#mul-factor-pad");
  if (!pad) return;
  const nums = isDigitKeypadMode(quizMode)
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
    : DIGITS;
  pad.innerHTML = "";
  nums.forEach((n) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mul-factor-key";
    btn.textContent = String(n);
    btn.addEventListener("click", () => submitAnswer(n));
    pad.appendChild(btn);
  });
}

function renderChoicePad(q) {
  const pad = $("#mul-choice-pad");
  if (!pad) return;
  pad.innerHTML = "";
  q.choices.forEach((val) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mul-choice-key";
    btn.textContent = String(val);
    btn.addEventListener("click", () => submitAnswer(val));
    pad.appendChild(btn);
  });
}

function hintText(q) {
  const { a, b, product, blank } = q;
  if (q.isFactorPair) {
    if (session.hintCount === 0) {
      const required = getRequiredPairKeys(q, session.quizMode);
      if (required.size > 1) {
        return `想想看，${q.product} 可以拆成哪幾組乘法？`;
      }
      return "想想看，九九表裡哪兩個數相乘會等於這個積？";
    }
    const eg = q.validPairLabels?.[0] || "";
    return eg ? `例如 ${eg} 是一組，請找齊全部組合` : "兩個因數都在 1～9 之間";
  }
  if (q.isLife && session.hintCount === 0) {
    return `想想：${a} 和 ${b} 相乘`;
  }
  if (session.hintCount === 0) {
    if (blank === "product") return `想想 ${a} 個 ${b} 相加會是多少？`;
    if (isDigitKeypadMode(session.quizMode)) {
      return `這句在背誦的 ${session.digit} 那一列裡`;
    }
    return `在九九表裡找 ${a} 和 ${b} 那一格`;
  }
  if (blank === "product") {
    return `答案在 ${Math.max(4, product - 10)}～${Math.min(81, product + 10)} 之間`;
  }
  return isDigitKeypadMode(session.quizMode)
    ? `答案在 1～9 之間`
    : `答案在 2～9 之間`;
}

function isAnswerCorrect(q, value) {
  return value === q.answer;
}

function formatQuestionReveal(q) {
  if (q.isFactorPair) {
    const keys = getRequiredPairKeys(q, session?.quizMode ?? "full");
    return `${q.product} ＝ ${formatFoundPairsList(keys)}`;
  }
  return `${q.a} × ${q.b} ＝ ${q.product}`;
}

function submitAnswer(value) {
  if (!session) return;
  const q = session.questions[session.index];
  if (isAnswerCorrect(q, value)) {
    session.correct += 1;
    let okSub;
    if (q.isLife && q.lifePrompt) {
      okSub = `${q.lifePrompt.replace("□", String(q.answer))}`;
    } else {
      okSub = q.prompt.replace("□", String(q.answer));
    }
    deps.showOk("答對了！", okSub, () => {
      goNextQuestion();
    });
    return;
  }

  session.hintCount += 1;
  const hintEl = $("#mul-quiz-hint");
  const hintsLeft = maxHints(session.quizMode);
  if (session.hintCount < hintsLeft) {
    if (hintEl) {
      hintEl.textContent = hintText(q);
      hintEl.className = "mul-quiz-hint mul-quiz-hint-warm";
    }
    deps.showWarn("再想想", hintText(q));
    return;
  }

  if (!session.wrongs.find((w) => w.question.factKey === q.factKey)) {
    session.wrongs.push({ question: q, attempts: session.hintCount });
  }
  deps.showWarn("這題是", formatQuestionReveal(q), () => goNextQuestion());
}

function goNextQuestion() {
  if (!session) return;
  session.index += 1;
  if (session.index >= session.questions.length) {
    showResult();
    return;
  }
  renderQuizQuestion();
}

function showResult() {
  if (!session) return;
  const total = session.questions.length;
  const correct = session.correct;
  const need = passThreshold(session.quizMode);
  const passed = correct >= need;
  const hard = isHardQuizMode(session.quizMode);

  if (session.quizMode === "hard-full") {
    const fullProg = getFullQuizProgress();
    setFullQuizProgress({
      hardBestCorrect: Math.max(fullProg.hardBestCorrect || 0, correct),
      hardPassed: fullProg.hardPassed || passed,
    });
  } else if (session.quizMode === "full") {
    const fullProg = getFullQuizProgress();
    setFullQuizProgress({
      bestCorrect: Math.max(fullProg.bestCorrect, correct),
      passed: fullProg.passed || passed,
    });
  } else if (session.quizMode === "hard-digit" && session.digit) {
    const prog = getDigitProgress(session.digit);
    setDigitProgress(session.digit, {
      learned: true,
      hardBestCorrect: Math.max(prog.hardBestCorrect || 0, correct),
      hardPassed: prog.hardPassed || passed,
    });
    learnDigit = session.digit;
  } else if (session.digit) {
    const prog = getDigitProgress(session.digit);
    setDigitProgress(session.digit, {
      learned: true,
      bestCorrect: Math.max(prog.bestCorrect, correct),
      passed: prog.passed || passed,
      phaseB: prog.phaseB,
    });
    learnDigit = session.digit;
  }

  $("#mul-result-title").textContent = passed
    ? hard
      ? "進階過關！"
      : "過關了！"
    : "再練一次";
  $("#mul-result-score").textContent = `${correct} / ${total} 題正確`;
  const sub = $("#mul-result-sub");
  if (sub) {
    if (session.quizMode === "hard-full") {
      sub.textContent = passed
        ? "進階挑戰過關！因數與生活題都很熟了"
        : `要 ${need} 題以上才過關，錯題可以再練`;
    } else if (session.quizMode === "full") {
      sub.textContent = passed
        ? "全部測驗過關！2～9 都很熟了"
        : `要 ${need} 題以上才過關，錯題可以再練`;
    } else if (session.quizMode === "hard-digit" && passed) {
      sub.textContent = `「${session.digit}」進階測驗過關！`;
    } else if (passed) {
      sub.textContent = `「${session.digit}」的乘法背好了！`;
    } else {
      sub.textContent = `要 ${need} 題以上才過關，錯題可以再練`;
    }
  }

  const wrongList = $("#mul-wrong-list");
  if (wrongList) {
    wrongList.innerHTML = "";
    if (!session.wrongs.length) {
      wrongList.hidden = true;
    } else {
      wrongList.hidden = false;
      session.wrongs.forEach((w) => {
        const li = document.createElement("li");
        li.textContent = formatQuestionReveal(w.question);
        wrongList.appendChild(li);
      });
    }
  }

  $("#btn-mul-retry-wrong").hidden = session.wrongs.length === 0;
  const isFullLike =
    session.quizMode === "full" || session.quizMode === "hard-full";
  $("#btn-mul-next-digit").hidden = isFullLike;
  deps.showView("mulResult");
}

export function bindMulEvents() {
  $("#btn-mul-pick-back")?.addEventListener("click", () => {
    stopRecite();
    session = null;
    learnDigit = null;
    resetMulPanels();
    deps.showView("home");
  });
  $("#btn-mul-learn-back")?.addEventListener("click", () => {
    stopRecite();
    openPick();
  });
  $("#btn-mul-recite")?.addEventListener("click", () => {
    applyMulLearnPanels("recite");
    startRecite();
  });
  $("#btn-mul-reveal-mode")?.addEventListener("click", () => {
    stopRecite();
    applyMulLearnPanels("reveal");
    revealIndex = 0;
    renderRevealCard();
  });
  $("#btn-mul-reveal-next")?.addEventListener("click", () => {
    advanceRevealLine();
  });
  $("#btn-mul-to-quiz")?.addEventListener("click", () => startQuiz(false));
  $("#btn-mul-hard-quiz")?.addEventListener("click", () => startQuiz(false, true));
  $("#btn-mul-skip-learn")?.addEventListener("click", () => startQuiz(false));
  $("#btn-mul-full-quiz")?.addEventListener("click", () => startFullQuiz(false));
  $("#btn-mul-hard-full-quiz")?.addEventListener("click", () =>
    startFullQuiz(false, true)
  );
  $("#btn-mul-quiz-back")?.addEventListener("click", () => {
    if (confirm("離開測驗？進度不會儲存。")) {
      session = null;
      pairPicks = [];
      foundPairKeys = new Set();
      resetMulPanels();
      openPick();
    }
  });
  $("#btn-mul-pair-clear")?.addEventListener("click", () => {
    if (!session) return;
    const q = session.questions[session.index];
    if (q?.isFactorPair) clearPairPicks(q);
  });
  $("#btn-mul-retry-wrong")?.addEventListener("click", () => {
    if (session?.quizMode === "hard-full") startFullQuiz(true, true);
    else if (session?.quizMode === "full") startFullQuiz(true);
    else if (session?.quizMode === "hard-digit") startQuiz(true, true);
    else startQuiz(true);
  });
  $("#btn-mul-try-again")?.addEventListener("click", () => {
    if (session?.quizMode === "hard-full") startFullQuiz(false, true);
    else if (session?.quizMode === "full") startFullQuiz(false);
    else if (session?.quizMode === "hard-digit") startQuiz(false, true);
    else startQuiz(false);
  });
  $("#btn-mul-next-digit")?.addEventListener("click", () => openPick());
  $("#btn-mul-home")?.addEventListener("click", () => {
    stopRecite();
    session = null;
    learnDigit = null;
    resetMulPanels();
    deps.showView("home");
  });
}

/**
 * @param {MulDeps} d
 */
export function initTimesTable(d) {
  deps = d;
  resetMulPanels();
  bindMulEvents();
}

/** 首頁「九九乘法」按鈕 */
export function openMulHome() {
  openPick();
}
