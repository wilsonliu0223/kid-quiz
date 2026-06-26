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
 * @property {number} [digit]
 * @property {'digit'|'full'} quizMode
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

function defaultFullQuizProgress() {
  return { bestCorrect: 0, passed: false };
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
function toQuestion(fact, blank, quizMode = "full") {
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
    choices: buildChoices(answer, inputMode, quizMode),
    factKey: factKey(a, b),
  };
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
  return facts.map((f, i) => toQuestion(f, blanks[i], "digit"));
}

function buildRandomQuiz(onlyKeys = null) {
  let facts = allFactsPool();
  if (onlyKeys) {
    facts = facts.filter((f) => onlyKeys.includes(factKey(f.a, f.b)));
  } else {
    facts = shuffle(facts).slice(0, QUIZ_SIZE);
  }
  const blanks = pickBlankTypes(facts.length);
  return facts.map((f, i) => toQuestion(f, blanks[i], "full"));
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
    deps.showOk(
      "答對了！",
      `${learnDigit} × ${revealIndex + 1} ＝ ${expected}`,
      () => advanceRevealLine()
    );
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
  deps.showView("mulPick");
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

function startQuiz(retryWrongs = false) {
  if (!learnDigit) return;
  let questions;
  if (retryWrongs && session?.wrongs?.length && session.quizMode === "digit") {
    const keys = session.wrongs.map((w) => w.question.factKey);
    questions = buildDigitQuiz(learnDigit, keys);
  } else {
    questions = buildDigitQuiz(learnDigit);
  }
  session = {
    digit: learnDigit,
    quizMode: "digit",
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

function startFullQuiz(retryWrongs = false) {
  learnDigit = null;
  let questions;
  if (retryWrongs && session?.wrongs?.length && session.quizMode === "full") {
    const keys = session.wrongs.map((w) => w.question.factKey);
    questions = buildRandomQuiz(keys);
  } else {
    questions = buildRandomQuiz();
  }
  session = {
    quizMode: "full",
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
  $("#mul-quiz-title").textContent =
    session.quizMode === "full"
      ? "全部測驗 · 2～9"
      : `背 ${session.digit} · 測驗`;
  $("#mul-quiz-progress").textContent = `第 ${session.index + 1} / ${session.questions.length} 題`;
  $("#mul-prompt").textContent = q.prompt;
  const hintEl = $("#mul-quiz-hint");
  if (hintEl) {
    hintEl.textContent = "選出正確答案";
    hintEl.className = "mul-quiz-hint";
  }
  applyMulQuizAnswerPanels(q.inputMode);
  if (q.inputMode === "digit19") {
    renderFactorPad(session.quizMode);
  } else {
    renderChoicePad(q);
  }
}

function renderFactorPad(quizMode = "full") {
  const pad = $("#mul-factor-pad");
  if (!pad) return;
  const nums = quizMode === "digit" ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : DIGITS;
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
  if (session.hintCount === 0) {
    if (blank === "product") return `想想 ${a} 個 ${b} 相加會是多少？`;
    if (session.quizMode === "digit") {
      return `這句在背誦的 ${session.digit} 那一列裡`;
    }
    return `在九九表裡找 ${a} 和 ${b} 那一格`;
  }
  if (blank === "product") {
    return `答案在 ${Math.max(4, product - 10)}～${Math.min(81, product + 10)} 之間`;
  }
  return session.quizMode === "digit" ? `答案在 1～9 之間` : `答案在 2～9 之間`;
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

  if (session.quizMode === "full") {
    const fullProg = getFullQuizProgress();
    setFullQuizProgress({
      bestCorrect: Math.max(fullProg.bestCorrect, correct),
      passed: fullProg.passed || passed,
    });
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

  $("#mul-result-title").textContent = passed ? "過關了！" : "再練一次";
  $("#mul-result-score").textContent = `${correct} / ${total} 題正確`;
  const sub = $("#mul-result-sub");
  if (sub) {
    if (session.quizMode === "full") {
      sub.textContent = passed
        ? "全部測驗過關！2～9 都很熟了"
        : `要 ${PASS_CORRECT} 題以上才過關，錯題可以再練`;
    } else if (passed) {
      sub.textContent = `「${session.digit}」的乘法背好了！`;
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
  $("#btn-mul-next-digit").hidden = session.quizMode === "full";
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
  $("#btn-mul-skip-learn")?.addEventListener("click", () => startQuiz(false));
  $("#btn-mul-full-quiz")?.addEventListener("click", () => startFullQuiz(false));
  $("#btn-mul-quiz-back")?.addEventListener("click", () => {
    if (confirm("離開測驗？進度不會儲存。")) {
      session = null;
      resetMulPanels();
      openPick();
    }
  });
  $("#btn-mul-retry-wrong")?.addEventListener("click", () => {
    if (session?.quizMode === "full") startFullQuiz(true);
    else startQuiz(true);
  });
  $("#btn-mul-try-again")?.addEventListener("click", () => {
    if (session?.quizMode === "full") startFullQuiz(false);
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
