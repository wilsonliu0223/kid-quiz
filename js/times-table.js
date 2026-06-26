const KEY_MUL_PROGRESS = "kid-quiz-mul-progress";
const PASS_CORRECT = 8;
const QUIZ_SIZE = 9;
const DIGITS = [2, 3, 4, 5, 6, 7, 8, 9];

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

/**
 * @typedef {object} MulDeps
 * @property {(name: string) => void} showView
 * @property {() => string} getSelectedChild
 * @property {(title: string, sub?: string, onClose?: () => void) => void} showWarn
 * @property {(title: string, sub?: string, onClose?: () => void) => void} showOk
 */

/**
 * @typedef {'product'|'factorA'|'factorB'} MulBlank
 * @typedef {'choices'|'digit19'} MulInputMode
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
 *
 * @typedef {object} MulWrong
 * @property {MulQuestion} question
 * @property {number} attempts
 *
 * @typedef {object} MulSession
 * @property {number} digit
 * @property {'A'|'B'} phase
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
  return { learned: false, bestCorrect: 0, passed: false, phaseB: false };
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

function allFactsPool() {
  const facts = [];
  for (const a of DIGITS) {
    for (const b of DIGITS) {
      facts.push({ a, b, product: a * b });
    }
  }
  return facts;
}

function buildChoices(answer, inputMode) {
  if (inputMode === "digit19") {
    const pool = DIGITS.filter((n) => n !== answer);
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
function toQuestion(fact, blank) {
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

  return {
    a,
    b,
    product,
    blank,
    prompt,
    answer,
    inputMode,
    choices: buildChoices(answer, inputMode),
    factKey: factKey(a, b),
  };
}

function buildRandomQuiz(onlyKeys = null) {
  let facts = allFactsPool();
  if (onlyKeys) {
    facts = facts.filter((f) => onlyKeys.includes(factKey(f.a, f.b)));
  } else {
    facts = shuffle(facts).slice(0, QUIZ_SIZE);
  }
  const blanks = pickBlankTypes(facts.length);
  return facts.map((f, i) => toQuestion(f, blanks[i]));
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
  const isFactor = inputMode === "digit19";
  setMulPanelVisible(factorPad, isFactor, "grid");
  setMulPanelVisible(choicePad, !isFactor, "grid");
}

function applyMulLearnPanels(mode) {
  const recite = $("#mul-learn-recite-panel");
  const reveal = $("#mul-learn-reveal-panel");
  const isRecite = mode === "recite";
  setMulPanelVisible(recite, isRecite);
  setMulPanelVisible(reveal, !isRecite);
}

function resetMulPanels() {
  applyMulLearnPanels("recite");
  applyMulQuizAnswerPanels("digit19");
  setMulPanelVisible($("#mul-factor-pad"), false, "grid");
  setMulPanelVisible($("#mul-choice-pad"), false, "grid");
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
    const cell = document.createElement("div");
    cell.className = "mul-learn-cell";
    cell.textContent = `${learnDigit}×${n}=${learnDigit * n}`;
    cell.dataset.n = String(n);
    row.appendChild(cell);
  }
  highlightLearnCell(reciteIndex);
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

function renderRevealCard() {
  if (!learnDigit) return;
  const n = revealIndex + 1;
  const product = learnDigit * n;
  const eq = $("#mul-reveal-equation");
  const hint = $("#mul-reveal-hint");
  if (eq) {
    eq.textContent = `${learnDigit} × ${n} ＝ □`;
    eq.dataset.answer = String(product);
    eq.classList.remove("mul-revealed");
  }
  if (hint) hint.textContent = "點一下看答案";
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
  learnDigit = null;
  session = null;
  stopRecite();
  resetMulPanels();
  renderDigitGrid();
  deps.showView("mulPick");
}

function startQuiz(retryWrongs = false) {
  if (!learnDigit) return;
  let questions;
  if (retryWrongs && session?.wrongs?.length) {
    const keys = session.wrongs.map((w) => w.question.factKey);
    questions = buildRandomQuiz(keys);
  } else {
    questions = buildRandomQuiz();
  }
  session = {
    digit: learnDigit,
    phase: "random",
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
  $("#mul-quiz-title").textContent = `背 ${session.digit} · 隨機 2～9`;
  $("#mul-quiz-progress").textContent = `第 ${session.index + 1} / ${session.questions.length} 題`;
  $("#mul-prompt").textContent = q.prompt;
  const hintEl = $("#mul-quiz-hint");
  if (hintEl) {
    hintEl.textContent = "選出正確答案";
    hintEl.className = "mul-quiz-hint";
  }
  applyMulQuizAnswerPanels(q.inputMode);
  if (q.inputMode === "digit19") {
    renderFactorPad();
  } else {
    renderChoicePad(q);
  }
}

function renderFactorPad() {
  const pad = $("#mul-factor-pad");
  if (!pad || pad.dataset.built === "1") return;
  pad.innerHTML = "";
  DIGITS.forEach((n) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mul-factor-key";
    btn.textContent = String(n);
    btn.addEventListener("click", () => submitAnswer(n));
    pad.appendChild(btn);
  });
  pad.dataset.built = "1";
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
  if (session.hintCount === 0) {
    if (blank === "product") return `想想 ${a} 個 ${b} 相加會是多少？`;
    return `在九九表裡找 ${a} 和 ${b} 那一格`;
  }
  if (blank === "product") {
    return `答案在 ${Math.max(4, product - 10)}～${Math.min(81, product + 10)} 之間`;
  }
  return `答案在 2～9 之間`;
}

function submitAnswer(value) {
  if (!session) return;
  const q = session.questions[session.index];
  if (value === q.answer) {
    session.correct += 1;
    deps.showOk("答對了！", q.prompt.replace("□", String(q.answer)), () => {
      goNextQuestion();
    });
    return;
  }

  session.hintCount += 1;
  const hintEl = $("#mul-quiz-hint");
  if (session.hintCount < 3) {
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
  deps.showWarn(
    "這題是",
    `${q.a} × ${q.b} ＝ ${q.product}`,
    () => goNextQuestion()
  );
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
  const passed = correct >= PASS_CORRECT;
  const prog = getDigitProgress(session.digit);
  setDigitProgress(session.digit, {
    learned: true,
    bestCorrect: Math.max(prog.bestCorrect, correct),
    passed: prog.passed || passed,
    phaseB: prog.phaseB,
  });

  $("#mul-result-title").textContent = passed ? "過關了！" : "再練一次";
  $("#mul-result-score").textContent = `${correct} / ${total} 題正確`;
  const sub = $("#mul-result-sub");
  if (sub) {
    if (passed && session.phase === "random") {
      sub.textContent = `「${session.digit}」背誦過關！隨機測驗也達標`;
    } else if (passed) {
      sub.textContent = `「${session.digit}」已熟練`;
    } else {
      sub.textContent = `要 ${PASS_CORRECT} 題以上才過關，錯題可以再練`;
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
        li.textContent = `${w.question.a} × ${w.question.b} ＝ ${w.question.product}`;
        wrongList.appendChild(li);
      });
    }
  }

  $("#btn-mul-retry-wrong").hidden = session.wrongs.length === 0;
  learnDigit = session.digit;
  deps.showView("mulResult");
}

export function bindMulEvents() {
  $("#btn-start-mul")?.addEventListener("click", (e) => {
    e.preventDefault();
    openPick();
  });
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
  $("#mul-reveal-equation")?.addEventListener("click", () => {
    const eq = $("#mul-reveal-equation");
    if (!eq || eq.classList.contains("mul-revealed")) return;
    eq.textContent = eq.textContent.replace("□", eq.dataset.answer || "?");
    eq.classList.add("mul-revealed");
    $("#mul-reveal-hint").textContent = "點「下一句」繼續";
  });
  $("#btn-mul-reveal-next")?.addEventListener("click", () => {
    revealIndex += 1;
    if (revealIndex >= 9) {
      if (learnDigit) setDigitProgress(learnDigit, { learned: true });
      deps.showOk("遮答案練完了", "可以開始測驗");
      revealIndex = 8;
      return;
    }
    renderRevealCard();
  });
  $("#btn-mul-to-quiz")?.addEventListener("click", () => startQuiz(false));
  $("#btn-mul-skip-learn")?.addEventListener("click", () => startQuiz(false));
  $("#btn-mul-quiz-back")?.addEventListener("click", () => {
    if (confirm("離開測驗？進度不會儲存。")) {
      session = null;
      resetMulPanels();
      openPick();
    }
  });
  $("#btn-mul-retry-wrong")?.addEventListener("click", () => startQuiz(true));
  $("#btn-mul-try-again")?.addEventListener("click", () => startQuiz(false));
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
