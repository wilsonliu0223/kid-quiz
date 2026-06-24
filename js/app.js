import { CONFIG } from "./config.site.js";
import {
  loadZhItems,
  loadEnItems,
  uniqueLessons,
  pickRandomQuestions,
} from "./sheets.js";
import {
  englishAnswersMatch,
  speakEnglish,
  primeSpeech,
} from "./english.js";
import { createHandwritingCanvas } from "./canvas-handwriting.js";
import {
  buildHomophoneChoices,
  classifyZhAnswer,
} from "./homophones.js";
import { recognizeZhHandwriting } from "./zh-recognize.js";
import { ensureHanziStrokeReady } from "./hanzi-stroke.js";
import { ensurePaddleOcr } from "./paddle-ocr.js";
import {
  showStrokeOrderForWord,
  hideStrokeOrderPanel,
} from "./stroke-order.js";
import {
  getSelectedChild,
  setSelectedChild,
  addPending,
  loadPending,
  removePending,
  saveQuizDraft,
  loadQuizDraft,
  clearQuizDraft,
} from "./store.js";
import { fillSentenceContext } from "./sentence.js";
import { getChildName, getChildNames, setChildNames } from "./children.js";
import {
  logQuizResult,
  loadLocalScores,
  formatScoreLine,
  formatScoreSummary,
  scoresForChild,
} from "./score-log.js";
import {
  initFlipZh,
  renderFlipHomePlayers,
} from "./flip-zh.js?v=20260531";
import {
  initFlipMath,
  renderMathHomePlayers,
} from "./flip-math.js?v=20260531b";
import {
  addMistake,
  removeMistake,
  clearMistakes,
  countMistakes,
  listMistakes,
  recordMistakesFromQuiz,
  questionsFromMistakeBook,
  formatMistakeLine,
} from "./mistake-book.js";

const $ = (sel) => document.querySelector(sel);

let zhBank = [];
let enBank = [];
let lessonFilter = "全部";
let enMode = "meaning";
let quiz = null;
let handwriting = null;
/** @type {{ recognized: string, imageDataUrl: string | null } | null} */
let pendingReview = null;
let homeHistoryShowAll = false;
/** @type {{ subject: string, child: string, questions: object[], mode?: string } | null} */
let lastWrongRound = null;
const KEY_QUIZ_COUNT = "kid-quiz-count";

function getQuizCountSetting() {
  const raw = localStorage.getItem(KEY_QUIZ_COUNT);
  if (raw === "all") return 0;
  if (raw) {
    const n = parseInt(raw, 10);
    if (n > 0) return n;
  }
  return CONFIG.QUIZ_COUNT_DEFAULT || 10;
}

function setQuizCountSetting(value) {
  localStorage.setItem(KEY_QUIZ_COUNT, String(value));
}

function syncQuizCountChips() {
  const container = $("#quiz-count-chips");
  if (!container) return;
  const current =
    localStorage.getItem(KEY_QUIZ_COUNT) || String(CONFIG.QUIZ_COUNT_DEFAULT || 10);
  container.querySelectorAll(".chip").forEach((btn) => {
    const val = btn.dataset.quizCount;
    const active = val === "all" ? current === "all" : val === current;
    btn.classList.toggle("chip-active", active);
  });
  updateQuizCountHint();
}

function initQuizCountPicker() {
  const container = $("#quiz-count-chips");
  if (!container) return;

  container.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.quizCount;
      setQuizCountSetting(val === "all" ? "all" : val);
      syncQuizCountChips();
    });
  });

  syncQuizCountChips();
}

function updateQuizCountHint() {
  const hint = $("#quiz-count-hint");
  if (!hint) return;
  const setting = getQuizCountSetting();
  if (!setting) {
    hint.textContent = "「全部」：目前課次有幾題就考幾題，隨機一輪、不重複";
    return;
  }
  hint.textContent = `最多 ${setting} 題；題庫較少時會考完全部（不重複）`;
}

const views = {
  home: $("#view-home"),
  quizZh: $("#view-quiz-zh"),
  quizEn: $("#view-quiz-en"),
  flipFirst: $("#view-flip-first"),
  flipPlay: $("#view-flip-play"),
  flipResult: $("#view-flip-result"),
  mathFirst: $("#view-math-first"),
  mathPlay: $("#view-math-play"),
  mathResult: $("#view-math-result"),
  result: $("#view-result"),
  parent: $("#view-parent"),
};

function showView(name) {
  if (name !== "quizEn" && enKeyboardLiftCleanup) {
    enKeyboardLiftCleanup();
    enKeyboardLiftCleanup = null;
  }

  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    const on = key === name;
    el.classList.toggle("view-active", on);
    el.classList.toggle("view-hidden", !on);
  });
  if (name === "quizZh") {
    requestAnimationFrame(() => handwriting?.resize());
  }
  if (name === "home") {
    renderHomeScoreHistory();
    renderResumeBanner();
    renderMistakeBookHome();
    renderFlipHomePlayers();
    renderMathHomePlayers();
  }
  if (name === "quizEn") setupEnQuizKeyboardLift();
}

function showBootError(msg) {
  const el = $("#boot-error");
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
}

function setSheetStatus(msg, isError = false) {
  const el = $("#sheet-status");
  el.textContent = msg;
  el.style.color = isError ? "var(--err)" : "var(--muted)";
}

async function refreshBank() {
  setSheetStatus("正在載入題庫…");
  try {
    const [zh, en] = await Promise.all([loadZhItems(), loadEnItems()]);
    zhBank = zh;
    enBank = en;
    const src = CONFIG.SPREADSHEET_ID || CONFIG.SHEETS_JSON_URL ? "試算表" : "示範題庫";
    const enNote =
      enBank.length === 12 && CONFIG.SPREADSHEET_ID
        ? "（若應有更多題，請重新載入或檢查試算表）"
        : "";
    setSheetStatus(
      `國語 ${zhBank.length} 題 · 英語 ${enBank.length} 題（${src}）${enNote}`
    );
    buildLessonChips(zhBank);
    if (CONFIG.HANZI_STROKE_ENABLED !== false) {
      ensureHanziStrokeReady().catch(() => {});
    }
  } catch (e) {
    console.error(e);
    setSheetStatus(`載入失敗：${e.message}`, true);
  }
}

function buildLessonChips(bank) {
  const lessons = uniqueLessons(bank || zhBank);
  const wrap = $("#lesson-picker");
  const container = $("#lesson-chips");
  container.innerHTML = "";

  if (lessons.length <= 1) {
    wrap.hidden = true;
    lessonFilter = "全部";
    return;
  }

  if (!lessons.includes(lessonFilter)) {
    lessonFilter = "全部";
  }

  wrap.hidden = false;
  lessons.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (name === lessonFilter ? " chip-active" : "");
    btn.textContent = name;
    btn.dataset.lesson = name;
    btn.addEventListener("click", () => {
      lessonFilter = name;
      container.querySelectorAll(".chip").forEach((c) => {
        c.classList.toggle("chip-active", c.dataset.lesson === name);
      });
      updateQuizCountHint();
    });
    container.appendChild(btn);
  });
}

function renderChildChips() {
  const names = getChildNames();
  const selected = getSelectedChild();
  document.querySelectorAll(".child-btns .chip").forEach((btn) => {
    const id = btn.dataset.child;
    btn.textContent = names[id] || id;
    btn.classList.toggle("chip-active", id === selected);
  });
  renderFlipHomePlayers();
  renderMathHomePlayers();
}

function initChildPicker() {
  renderChildChips();
  document.querySelectorAll(".child-btns .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      setSelectedChild(btn.dataset.child);
      renderChildChips();
      renderHomeScoreHistory();
      renderMistakeBookHome();
    });
  });
}

function fillParentNameInputs() {
  const names = getChildNames();
  $("#name-child-a").value = names.A;
  $("#name-child-b").value = names.B;
}

function saveParentNames() {
  const names = setChildNames({
    A: $("#name-child-a").value,
    B: $("#name-child-b").value,
  });
  renderChildChips();
  const msg = $("#name-save-msg");
  msg.hidden = false;
  msg.textContent = `已儲存：A ${names.A}、B ${names.B}`;
  setTimeout(() => {
    msg.hidden = true;
  }, 2000);
}

function persistQuizDraft() {
  if (!quiz) return false;
  return saveQuizDraft({
    subject: quiz.subject,
    mode: quiz.mode,
    child: quiz.child,
    lessonFilter,
    enMode,
    questions: quiz.questions,
    index: quiz.index,
    autoCorrect: quiz.autoCorrect,
    pending: quiz.pending,
    wrong: quiz.wrong,
    startedAt: quiz.startedAt,
  });
}

function renderResumeBanner() {
  const banner = $("#resume-quiz-banner");
  const text = $("#resume-quiz-text");
  if (!banner) return;

  const draft = loadQuizDraft();
  if (!draft?.questions?.length) {
    banner.hidden = true;
    return;
  }

  const subj = draft.subject === "en" ? "英語" : "國語";
  const at = draft.index + 1;
  const total = draft.questions.length;
  text.textContent = `${subj} 測驗進行中：第 ${at} / ${total} 題（已暫存）`;
  banner.hidden = false;
}

function resumeQuiz() {
  const draft = loadQuizDraft();
  if (!draft?.questions?.length) return;

  lessonFilter = draft.lessonFilter || "全部";
  if (draft.subject === "en") enMode = draft.mode || draft.enMode || "meaning";

  quiz = {
    subject: draft.subject,
    mode: draft.mode,
    child: draft.child || getSelectedChild(),
    questions: draft.questions,
    index: draft.index,
    autoCorrect: draft.autoCorrect,
    pending: draft.pending,
    wrong: draft.wrong || [],
    startedAt: draft.startedAt,
  };

  if (draft.subject === "en") {
    document.querySelectorAll(".en-mode-picker .chip").forEach((btn) => {
      btn.classList.toggle("chip-active", btn.dataset.enMode === (quiz.mode || enMode));
    });
    showView("quizEn");
    renderEnQuestion();
    return;
  }

  showView("quizZh");
  const canvas = $("#hand-canvas");
  const wrap = canvas.parentElement;
  if (!handwriting) {
    handwriting = createHandwritingCanvas(canvas, wrap);
  } else {
    handwriting.resize();
  }
  renderQuestion();
}

function leaveQuizToHome() {
  if (!quiz) {
    showView("home");
    return;
  }
  const at = quiz.index + 1;
  const total = quiz.questions.length;
  const ok = confirm(
    `離開測驗？\n\n目前第 ${at} / ${total} 題。\n進度會暫存，回首頁可點「繼續上次測驗」。`
  );
  if (!ok) return;
  hideStrokeOrderPanel();
  persistQuizDraft();
  showView("home");
}

function setupQuizAutoSave() {
  const saveIfInQuiz = () => {
    const active = document.querySelector(".view-active");
    if (
      quiz &&
      active &&
      (active.id === "view-quiz-zh" || active.id === "view-quiz-en")
    ) {
      persistQuizDraft();
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveIfInQuiz();
  });
  window.addEventListener("pagehide", saveIfInQuiz);
}

let enKeyboardLiftCleanup = null;

function setupEnQuizKeyboardLift() {
  enKeyboardLiftCleanup?.();
  enKeyboardLiftCleanup = null;

  const footer = $("#quiz-footer-en");
  if (!footer || !window.visualViewport) return;

  const onResize = () => {
    const gap = Math.max(0, window.innerHeight - window.visualViewport.height);
    footer.style.paddingBottom =
      gap > 0 ? `${gap + 8 + parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom") || "0", 10)}px` : "";
  };

  window.visualViewport.addEventListener("resize", onResize);
  window.visualViewport.addEventListener("scroll", onResize);
  onResize();

  enKeyboardLiftCleanup = () => {
    window.visualViewport.removeEventListener("resize", onResize);
    window.visualViewport.removeEventListener("scroll", onResize);
    footer.style.paddingBottom = "";
  };
}

function blockIfShouldResumeInstead() {
  const existing = loadQuizDraft();
  if (!existing?.questions?.length) return false;

  const subj = existing.subject === "en" ? "英語" : "國語";
  const at = existing.index + 1;
  const total = existing.questions.length;
  const restart = confirm(
    `你有未完成的${subj}測驗（第 ${at}/${total} 題）。\n\n按「確定」= 放棄暫存、重新測驗\n按「取消」= 回首頁點「繼續上次測驗」`
  );
  if (!restart) {
    showView("home");
    renderResumeBanner();
    return true;
  }
  clearQuizDraft();
  return false;
}

function clearMistakeOnCorrect(q) {
  if (!quiz || !q) return;
  const expected = quiz.subject === "en" ? q.english : q.word;
  removeMistake(quiz.child, quiz.subject, expected);
  renderMistakeBookHome();
}

function renderMistakeBookHome() {
  const section = $("#mistake-book-home");
  if (!section) return;

  const child = getSelectedChild();
  const zhN = countMistakes(child, "zh");
  const enN = countMistakes(child, "en");
  const name = getChildName(child);

  section.hidden = zhN + enN === 0;
  const meta = $("#mistake-book-meta");
  if (meta) {
    meta.textContent =
      zhN + enN === 0 ? "" : `${name}：國語 ${zhN} · 英語 ${enN}`;
  }

  const btnZh = $("#btn-review-zh-mistakes");
  const btnEn = $("#btn-review-en-mistakes");
  if (btnZh) {
    btnZh.hidden = zhN === 0;
    btnZh.textContent = `複習國語錯題（${zhN}）`;
  }
  if (btnEn) {
    btnEn.hidden = enN === 0;
    btnEn.textContent = `複習英語錯題（${enN}）`;
  }
}

function renderParentMistakeList() {
  const listEl = $("#parent-mistake-list");
  const countEl = $("#parent-mistake-count");
  if (!listEl) return;

  const child = getSelectedChild();
  const all = [
    ...listMistakes(child, "zh").map((m) => ({ ...m, subject: "zh" })),
    ...listMistakes(child, "en").map((m) => ({ ...m, subject: "en" })),
  ].sort((a, b) => new Date(b.lastWrongAt) - new Date(a.lastWrongAt));

  if (countEl) countEl.textContent = String(all.length);
  listEl.innerHTML = "";

  if (!all.length) {
    listEl.innerHTML =
      "<li class=\"parent-note\" style=\"border:none\">目前沒有錯題（或請先選對小孩 A/B）</li>";
    return;
  }

  all.forEach((m) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    const subj = m.subject === "en" ? "英" : "國";
    label.textContent = `${subj} · ${formatMistakeLine(m)}`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-text btn-text-sm";
    del.textContent = "刪除";
    del.addEventListener("click", () => {
      removeMistake(child, m.subject, m.expected);
      renderParentMistakeList();
      renderMistakeBookHome();
    });

    li.append(label, del);
    listEl.appendChild(li);
  });
}

function questionsFromQuizWrong(quiz) {
  const out = [];
  const seen = new Set();
  for (const w of quiz.wrong) {
    if (w.skipped) continue;
    const q = quiz.questions.find((item) =>
      quiz.subject === "en"
        ? item.english === w.expected
        : item.word === w.expected
    );
    if (!q) continue;
    const key =
      quiz.subject === "en"
        ? String(q.english).toLowerCase()
        : String(q.word);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function startZhQuiz(options = {}) {
  if (CONFIG.OCR_ENABLED) {
    ensurePaddleOcr().catch(() => {});
  }
  if (!options.mistakeReview && blockIfShouldResumeInstead()) return;
  if (CONFIG.HANZI_STROKE_ENABLED !== false) {
    ensureHanziStrokeReady().catch(() => {});
  }
  clearQuizDraft();
  const countSetting = getQuizCountSetting();
  const child = getSelectedChild();
  const questions = options.mistakeReview
    ? questionsFromMistakeBook(zhBank, child, "zh", countSetting)
    : pickRandomQuestions(zhBank, countSetting, lessonFilter);

  if (!questions.length) {
    alert(
      options.mistakeReview
        ? "錯題本裡沒有國語題目（或題庫已刪除該字）。"
        : "沒有題目！請檢查試算表或課次篩選。"
    );
    return;
  }

  quiz = {
    subject: "zh",
    child,
    questions,
    index: 0,
    autoCorrect: 0,
    pending: 0,
    wrong: [],
    startedAt: Date.now(),
    fromMistakeBook: Boolean(options.mistakeReview),
  };

  showView("quizZh");
  const canvas = $("#hand-canvas");
  const wrap = canvas.parentElement;
  if (!handwriting) {
    handwriting = createHandwritingCanvas(canvas, wrap);
  } else {
    handwriting.resize();
  }
  renderQuestion();
  persistQuizDraft();
}

function renderQuestion() {
  hideStrokeOrderPanel();
  const q = quiz.questions[quiz.index];
  $("#quiz-progress").textContent = `第 ${quiz.index + 1} / ${quiz.questions.length} 題`;

  const zhuyinEl = $("#zhuyin-display");
  const sentenceEl = $("#sentence-context");
  const hasSentence = fillSentenceContext(sentenceEl, q.sentence, q.word, q.zhuyin);

  const viewZh = $("#view-quiz-zh");
  if (viewZh) viewZh.classList.toggle("has-sentence", hasSentence);

  if (hasSentence) {
    zhuyinEl.classList.add("is-compact");
    zhuyinEl.textContent = q.zhuyin;
    $("#quiz-hint").textContent =
      "看例句寫國字；字寫大一點、寫在格子中間，辨識較準";
  } else {
    zhuyinEl.classList.remove("is-compact");
    zhuyinEl.textContent = q.zhuyin;
    sentenceEl.hidden = true;
    $("#quiz-hint").textContent =
      "請寫出國字或詞；字寫大一點、寫在格子中間，辨識較準";
  }

  $("#ocr-status").hidden = true;
  handwriting.clear();
  requestAnimationFrame(() => handwriting?.resize());
}

function setEnMode(mode) {
  enMode = mode;
  if (quiz?.subject === "en") quiz.mode = mode;
  document.querySelectorAll(".en-mode-picker .chip").forEach((btn) => {
    btn.classList.toggle("chip-active", btn.dataset.enMode === mode);
  });
  if (quiz?.subject === "en") {
    renderEnQuestion();
    if (mode === "listen") void playEnglishAudio();
  }
}

async function playEnglishAudio() {
  const q = quiz?.questions[quiz.index];
  if (!q?.english) return;

  const btn = $("#btn-speak-en");
  const hint = $("#en-quiz-hint");
  primeSpeech();

  if (btn) {
    btn.disabled = true;
    btn.textContent = "播放中…";
  }

  const ok = await speakEnglish(q.english);

  if (btn) {
    btn.disabled = false;
    btn.textContent = "🔊 播放發音";
  }
  if (!ok && hint) {
    hint.textContent = "無法播音：請確認有網路並調大音量，或改「看中拼英」";
  } else if (hint && quiz?.mode === "listen") {
    hint.textContent = "聽清楚後輸入英文（沒聽到就再按一次）";
  }
}

function startEnQuiz(options = {}) {
  if (!options.mistakeReview && blockIfShouldResumeInstead()) return;
  clearQuizDraft();
  if (!options.mistakeReview) buildLessonChips(enBank);
  const countSetting = getQuizCountSetting();
  const child = getSelectedChild();
  const questions = options.mistakeReview
    ? questionsFromMistakeBook(enBank, child, "en", countSetting)
    : pickRandomQuestions(enBank, countSetting, lessonFilter);

  if (!questions.length) {
    const hint = options.mistakeReview
      ? "錯題本裡沒有英語題目。"
      : lessonFilter !== "全部"
        ? `目前課次「${lessonFilter}」在英語題庫沒有題目，請改選「全部」或「測試」等英語課次。`
        : "請在試算表新增「英語」工作表，並確認「類型」欄為「單字」。";
    alert(`沒有英語題目！${hint}`);
    return;
  }

  quiz = {
    subject: "en",
    mode: enMode,
    child,
    questions,
    index: 0,
    autoCorrect: 0,
    pending: 0,
    wrong: [],
    startedAt: Date.now(),
    fromMistakeBook: Boolean(options.mistakeReview),
  };

  showView("quizEn");
  renderEnQuestion();
  persistQuizDraft();
}

function renderEnQuestion() {
  const q = quiz.questions[quiz.index];
  const mode = quiz.mode || enMode;
  $("#quiz-progress-en").textContent = `第 ${quiz.index + 1} / ${quiz.questions.length} 題`;

  const meaningBlock = $("#en-prompt-meaning");
  const hintEl = $("#en-hint-display");
  const speakBtn = $("#btn-speak-en");

  let listenPrompt = $("#en-listen-prompt");
  if (mode === "listen") {
    meaningBlock.hidden = true;
    speakBtn.hidden = false;
    if (!listenPrompt) {
      listenPrompt = document.createElement("p");
      listenPrompt.id = "en-listen-prompt";
      listenPrompt.className = "en-listen-prompt";
      speakBtn.before(listenPrompt);
    }
    listenPrompt.hidden = false;
    listenPrompt.textContent = "請按下方「播放發音」";
    $("#en-quiz-hint").textContent = "聽清楚後輸入英文（沒聽到就再按一次）";
  } else {
    if (listenPrompt) listenPrompt.hidden = true;
    meaningBlock.hidden = false;
    speakBtn.hidden = true;
    $("#en-chinese-display").textContent = q.chinese;
    if (q.hint) {
      hintEl.hidden = false;
      hintEl.textContent = `提示：${q.hint}`;
    } else {
      hintEl.hidden = true;
    }
    $("#en-quiz-hint").textContent = "看中文與提示，輸入英文單字";
  }

  const input = $("#en-answer-input");
  input.value = "";
  input.focus();
}

function showFeedback(type, text, actions = [], options = {}) {
  const overlay = $("#feedback-overlay");
  const card = $("#feedback-card");
  overlay.hidden = false;
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.remove("feedback-ok", "feedback-warn", "feedback-simple");
  card.classList.toggle("feedback-simple", !!options.simple);

  if (type === "ok") overlay.classList.add("feedback-ok");
  if (type === "warn") overlay.classList.add("feedback-warn");

  $("#feedback-text").textContent = text;
  const sub = $("#feedback-sub");
  if (options.sub) {
    sub.hidden = false;
    sub.textContent = options.sub;
  } else {
    sub.hidden = true;
  }

  const parentBlock = $("#feedback-parent");
  const homophoneBlock = $("#feedback-homophone");
  const choicesEl = $("#homophone-choices");

  if (options.homophonePicker && options.choices?.length) {
    homophoneBlock.hidden = false;
    parentBlock.hidden = true;
    $("#feedback-homophone-zhuyin").textContent = options.zhuyin || "";
    choicesEl.innerHTML = "";
    options.choices.forEach((word) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "homophone-choice";
      btn.textContent = word;
      btn.addEventListener("click", () => {
        closeFeedbackOverlay();
        onHomophonePick(word);
      });
      choicesEl.appendChild(btn);
    });
  } else {
    homophoneBlock.hidden = true;
    if (choicesEl) choicesEl.innerHTML = "";
  }

  if (options.parentReview) {
    parentBlock.hidden = false;
  } else if (!options.homophonePicker) {
    parentBlock.hidden = true;
  }

  const actionsEl = $("#feedback-actions");
  actionsEl.innerHTML = "";
  actions.forEach(({ label, primary, onClick }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = primary ? "btn btn-primary" : "btn btn-secondary";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      closeFeedbackOverlay();
      onClick?.();
    });
    actionsEl.appendChild(btn);
  });

  if (!actions.length) {
    setTimeout(closeFeedbackOverlay, 900);
  }
}

function closeFeedbackOverlay() {
  const overlay = $("#feedback-overlay");
  if (!overlay) return;
  overlay.hidden = true;
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  $("#feedback-pin").value = "";
  $("#feedback-pin-error").hidden = true;
  const homophoneBlock = $("#feedback-homophone");
  if (homophoneBlock) homophoneBlock.hidden = true;
  const choicesEl = $("#homophone-choices");
  if (choicesEl) choicesEl.innerHTML = "";
  pendingReview = null;
}

function getQuestionExpected(q) {
  if (!q) return "";
  return quiz?.subject === "en" ? q.english : q.word;
}

function undoWrongForQuestion(q) {
  if (!quiz || !q) return;
  const expected = getQuestionExpected(q);
  quiz.wrong = quiz.wrong.filter((w) => w.expected !== expected);
  removeMistake(quiz.child, quiz.subject, expected);
  renderMistakeBookHome();
}

/** 家長確認：孩子其實寫對了（辨識誤判／拼字爭議） */
function showParentConfirmWrittenCorrect(q, recognized, imageDataUrl) {
  pendingReview = { recognized, imageDataUrl, writtenCorrectClaim: true };
  const expected = getQuestionExpected(q);
  if (quiz.subject === "en") {
    $("#feedback-ocr-line").textContent = recognized
      ? `孩子輸入：「${recognized}」　｜　標準：${expected}`
      : `標準答案：${expected}`;
  } else {
    $("#feedback-ocr-line").textContent = recognized
      ? `辨識結果：「${recognized}」　｜　標準：${expected}`
      : `標準答案：${expected}`;
  }

  showFeedback(
    "warn",
    "家長確認：其實寫對了？",
    [
      {
        label: "取消",
        primary: false,
        onClick: () => {
          pendingReview = null;
          closeFeedbackOverlay();
        },
      },
    ],
    {
      parentReview: true,
      sub: "輸入 PIN 後按「算對」；會取消本題錯題紀錄。",
    }
  );
  setTimeout(() => $("#feedback-pin").focus(), 100);
}

/** 記本輪錯題並立刻寫入錯題本（同題只記一次，國語／英語） */
function recordWrongAnswer(q, recognized) {
  if (!quiz || !q) return;
  const expected = getQuestionExpected(q);
  const exists = quiz.wrong.some((w) => w.expected === expected);
  if (exists) return;

  if (quiz.subject === "en") {
    quiz.wrong.push({
      chinese: q.chinese,
      expected: q.english,
      recognized: recognized || "—",
      pending: false,
      skipped: false,
      mistakeBookSaved: true,
    });
  } else {
    quiz.wrong.push({
      zhuyin: q.zhuyin,
      expected: q.word,
      recognized: recognized || "—",
      pending: false,
      skipped: false,
      mistakeBookSaved: true,
    });
  }
  addMistake(quiz.child, quiz.subject, q, recognized || "—");
}

function recordZhWrong(q, recognized) {
  recordWrongAnswer(q, recognized);
}

/** 答錯後：畫布底層播筆畫動畫，上層手寫描紅（參考 stroke-order-animation） */
function promptStrokeOrderRewrite(q) {
  const wrap = document.getElementById("canvas-wrap");
  if (wrap) wrap.classList.add("stroke-order-active");
  handwriting?.clear();
  requestAnimationFrame(() => {
    handwriting?.resize();
    void showStrokeOrderForWord(q.word);
  });
  const hint = $("#quiz-hint");
  if (hint) hint.textContent = "格子裡有淡色筆畫示範，照著描一次再按送出";
}

function onHomophonePick(picked) {
  if (!quiz || quiz.subject !== "zh") return;

  const q = quiz.questions[quiz.index];
  if (picked === q.word) {
    quiz.autoCorrect += 1;
    undoWrongForQuestion(q);
    showFeedback("ok", "答對了！", [], { simple: true });
    setTimeout(goNextQuestion, 900);
    return;
  }

  showFeedback(
    "warn",
    `你選了「${picked}」`,
    [
      {
        label: "再寫一次",
        primary: true,
        onClick: () => promptStrokeOrderRewrite(q),
      },
      {
        label: "下一題",
        primary: false,
        onClick: () => goNextQuestion(),
      },
    ],
    { sub: `正確答案是「${q.word}」（${q.zhuyin}）` }
  );
}

/** 答錯後按「下一題」→ 四選一，選對可得分 */
function showHomophoneRecovery(q, recognized, imageDataUrl) {
  const choices = buildHomophoneChoices(q.word, q.zhuyin, zhBank, 4);
  if (choices.length < 2 || CONFIG.HOMOPHONE_PICKER === false) {
    goNextQuestion();
    return;
  }

  pendingReview = { recognized, imageDataUrl };

  const note =
    recognized && recognized !== q.word
      ? `你寫的像「${recognized}」· `
      : "";
  showFeedback(
    "warn",
    "請選出正確的字",
    [],
    {
      homophonePicker: true,
      choices,
      zhuyin: q.zhuyin,
      sub: `${note}看注音點選 · 選對可以得分`,
    }
  );
}

/** 答錯：先記錯題本，按「下一題」才四選一 */
function showZhWrongAnswer(q, recognized, imageDataUrl) {
  const rec = recognized && recognized !== "—" ? `你寫的像「${recognized}」` : "辨識結果不像這個字";

  recordZhWrong(q, recognized);

  showFeedback(
    "warn",
    "答錯了",
    [
      {
        label: "再寫一次",
        primary: true,
        onClick: () => promptStrokeOrderRewrite(q),
      },
      {
        label: "下一題",
        primary: false,
        onClick: () => showHomophoneRecovery(q, recognized, imageDataUrl),
      },
      {
        label: "我寫對了（家長確認）",
        primary: false,
        onClick: () => showParentConfirmWrittenCorrect(q, recognized, imageDataUrl),
      },
    ],
    {
      sub: `${rec} · 正確：${q.word}（${q.zhuyin}）· 已記入錯題本`,
    }
  );
}

function showParentReviewOverlay(recognized, imageDataUrl = null) {
  const q = quiz.questions[quiz.index];
  pendingReview = { recognized, imageDataUrl };

  const rec = recognized ? `「${recognized}」` : "（無／辨識不出）";
  if (quiz.subject === "en") {
    $("#feedback-ocr-line").textContent =
      `孩子答案：${rec}　｜　標準：${q.english}`;
  } else {
    $("#feedback-ocr-line").textContent =
      `辨識結果：${rec}　｜　標準答案：${q.word}`;
  }

  const retryLabel = quiz.subject === "en" ? "再答一次" : "再寫一次";

  showFeedback(
    "warn",
    "電腦無法確認，請家長判定",
    [
      {
        label: retryLabel,
        primary: false,
        onClick: () => {
          pendingReview = null;
          if (quiz.subject === "en") {
            $("#en-answer-input").value = "";
            $("#en-answer-input").focus();
          } else {
            handwriting.clear();
          }
        },
      },
      {
        label: "先跳過（不算分）",
        primary: true,
        onClick: () => {
          pushWrongSkipped(q, recognized);
          pendingReview = null;
          goNextQuestion();
        },
      },
    ],
    {
      parentReview: true,
      sub: "孩子不能自行給分；請輸入 PIN 後按算對或算錯。",
    }
  );

  setTimeout(() => $("#feedback-pin").focus(), 100);
}

function pushWrongSkipped(q, recognized) {
  if (quiz.subject === "en") {
    quiz.wrong.push({
      chinese: q.chinese,
      expected: q.english,
      recognized: recognized || "—",
      pending: false,
      skipped: true,
    });
  } else {
    quiz.wrong.push({
      zhuyin: q.zhuyin,
      expected: q.word,
      recognized: recognized || "—",
      pending: false,
      skipped: true,
    });
  }
}

function checkParentPin(inputEl, errorEl) {
  const pin = inputEl.value.trim();
  if (pin !== String(CONFIG.PARENT_PIN)) {
    errorEl.hidden = false;
    return false;
  }
  errorEl.hidden = true;
  return true;
}

function resolveParentReview(isCorrect) {
  if (!quiz || !pendingReview) return;

  const pinEl = $("#feedback-pin");
  const errEl = $("#feedback-pin-error");
  if (!checkParentPin(pinEl, errEl)) return;

  const q = quiz.questions[quiz.index];
  const { recognized, imageDataUrl } = pendingReview;

  if (isCorrect) {
    if (pendingReview.writtenCorrectClaim) {
      undoWrongForQuestion(q);
    }
    quiz.autoCorrect += 1;
    clearMistakeOnCorrect(q);
    closeFeedbackOverlay();
    const msg = pendingReview.writtenCorrectClaim
      ? "家長確認：寫對了！"
      : "家長確認：答對！";
    showFeedback("ok", msg, [], { simple: true });
    setTimeout(goNextQuestion, 800);
    return;
  }

  if (quiz.subject === "en") {
    if (!quiz.wrong.some((w) => w.expected === q.english)) {
      recordWrongAnswer(q, recognized || "—");
    }
    addPending({
      subject: "en",
      child: quiz.child,
      lesson: q.lesson,
      chinese: q.chinese,
      expected: q.english,
      recognized: recognized || "",
      imageDataUrl: imageDataUrl || "",
      at: new Date().toISOString(),
      questionIndex: quiz.index + 1,
    });
    const row = quiz.wrong.find((w) => w.expected === q.english);
    if (row) row.pending = true;
  } else {
    addPending({
      subject: "zh",
      child: quiz.child,
      lesson: q.lesson,
      zhuyin: q.zhuyin,
      expected: q.word,
      recognized: recognized || "(無法辨識)",
      imageDataUrl,
      at: new Date().toISOString(),
      questionIndex: quiz.index + 1,
    });
    quiz.wrong.push({
      zhuyin: q.zhuyin,
      expected: q.word,
      recognized: recognized || "—",
      pending: true,
    });
  }
  quiz.pending += 1;

  closeFeedbackOverlay();
  goNextQuestion();
}

function showEnWrongAnswer(q, recognized) {
  recordWrongAnswer(q, recognized);

  showFeedback(
    "warn",
    "答錯了",
    [
      {
        label: "再答一次",
        primary: true,
        onClick: () => {
          $("#en-answer-input").value = "";
          $("#en-answer-input").focus();
        },
      },
      {
        label: "下一題",
        primary: false,
        onClick: () => goNextQuestion(),
      },
      {
        label: "請家長幫忙",
        primary: false,
        onClick: () => showParentReviewOverlay(recognized, null),
      },
      {
        label: "其實拼對了（家長確認）",
        primary: false,
        onClick: () => showParentConfirmWrittenCorrect(q, recognized, null),
      },
    ],
    {
      sub: `你輸入：「${recognized}」· 正確：${q.english}（${q.chinese}）· 已記入錯題本`,
    }
  );
}

function submitEnAnswer() {
  if (!quiz || quiz.subject !== "en") return;

  const q = quiz.questions[quiz.index];
  const typed = $("#en-answer-input").value;

  if (!typed.trim()) {
    showFeedback("warn", "請先輸入英文", [
      { label: "好的", primary: true, onClick: () => {} },
    ]);
    return;
  }

  if (englishAnswersMatch(typed, q.english)) {
    quiz.autoCorrect += 1;
    clearMistakeOnCorrect(q);
    showFeedback("ok", "答對了！", [], { simple: true });
    setTimeout(goNextQuestion, 900);
    return;
  }

  showEnWrongAnswer(q, typed.trim());
}

async function submitAnswer() {
  if (!quiz || !handwriting) return;

  const q = quiz.questions[quiz.index];
  const submitBtn = $("#btn-submit-answer");
  submitBtn.disabled = true;

  if (handwriting.isBlank()) {
    showFeedback("warn", "請先寫字再送出", [
      { label: "好的", primary: true, onClick: () => {} },
    ]);
    submitBtn.disabled = false;
    return;
  }

  const statusEl = $("#ocr-status");
  statusEl.hidden = false;
  statusEl.textContent = CONFIG.OCR_ENABLED
    ? "載入／辨識中…（首次載入引擎較久）"
    : "辨識中…";

  if (CONFIG.OCR_ENABLED) {
    await ensureOcrReady();
    statusEl.textContent = "辨識中…";
  }

  const canvas = $("#hand-canvas");
  const imageDataUrl = handwriting.toDataURL();
  const strokes = handwriting.getStrokes ? handwriting.getStrokes() : [];

  const result = await recognizeZhHandwriting({
    canvas,
    strokes,
    imageDataUrl,
    expected: q.word,
    onStatus: (msg) => {
      statusEl.textContent = msg;
    },
  });

  statusEl.hidden = true;
  submitBtn.disabled = false;

  if (result.matched) {
    quiz.autoCorrect += 1;
    clearMistakeOnCorrect(q);
    showFeedback("ok", "答對了！", [], { simple: true });
    setTimeout(goNextQuestion, 950);
    return;
  }

  const recognized = result.text || "";
  const verdict = classifyZhAnswer(q.word, q.zhuyin, zhBank, {
    recognized,
    strokeMatches: result.strokeMatches,
  });

  if (verdict.type === "correct") {
    quiz.autoCorrect += 1;
    clearMistakeOnCorrect(q);
    showFeedback("ok", "答對了！", [], { simple: true });
    setTimeout(goNextQuestion, 950);
    return;
  }

  showZhWrongAnswer(q, verdict.recognized || recognized, imageDataUrl);
}

function goNextQuestion() {
  quiz.index += 1;
  if (quiz.index >= quiz.questions.length) {
    showResult();
    return;
  }
  persistQuizDraft();
  if (quiz.subject === "en") renderEnQuestion();
  else renderQuestion();
}

function retryWrongRound() {
  if (!lastWrongRound?.questions?.length) return;
  const { subject, child, questions, mode } = lastWrongRound;
  clearQuizDraft();
  quiz = {
    subject,
    child,
    questions: [...questions],
    index: 0,
    autoCorrect: 0,
    pending: 0,
    wrong: [],
    startedAt: Date.now(),
    mode,
    fromMistakeBook: true,
  };

  if (subject === "en") {
    enMode = mode || enMode;
    setEnMode(enMode);
    showView("quizEn");
    renderEnQuestion();
  } else {
    if (CONFIG.OCR_ENABLED) ensurePaddleOcr().catch(() => {});
    showView("quizZh");
    const canvas = $("#hand-canvas");
    const wrap = canvas.parentElement;
    if (!handwriting) {
      handwriting = createHandwritingCanvas(canvas, wrap);
    } else {
      handwriting.resize();
    }
    renderQuestion();
  }
  persistQuizDraft();
}

function showResult() {
  clearQuizDraft();
  recordMistakesFromQuiz(quiz);

  const retryQs = questionsFromQuizWrong(quiz);
  lastWrongRound = retryQs.length
    ? {
        subject: quiz.subject,
        child: quiz.child,
        questions: retryQs,
        mode: quiz.mode || enMode,
      }
    : null;

  const retryBtn = $("#btn-retry-wrong");
  if (retryBtn) retryBtn.hidden = !lastWrongRound;

  showView("result");
  const total = quiz.questions.length;
  const scored = quiz.autoCorrect;
  const subj = quiz.subject === "en" ? "英語" : "國語";
  const bookTag = quiz.fromMistakeBook ? " · 錯題複習" : "";
  $("#result-title").textContent = `${getChildName(quiz.child)} 完成 · ${subj}${bookTag}`;
  $("#score-big").textContent = `${scored} / ${total}`;

  const pendingEl = $("#score-pending");
  if (quiz.pending > 0) {
    pendingEl.hidden = false;
    pendingEl.textContent = `另有 ${quiz.pending} 題待家長確認（長按首頁標題進入）`;
  } else {
    pendingEl.hidden = true;
  }

  const saveStatus = $("#score-save-status");
  saveStatus.hidden = false;
  saveStatus.textContent = "正在記錄成績…";
  void logQuizResult(quiz, lessonFilter).then((r) => {
    saveStatus.textContent = r.message;
    renderHomeScoreHistory();
  });

  const list = $("#mistake-list");
  list.innerHTML = "";
  if (!quiz.wrong.length && scored === total) {
    const li = document.createElement("li");
    li.className = "ok-item";
    li.textContent = "全部自動答對，太棒了！";
    list.appendChild(li);
  } else {
    quiz.wrong.forEach((w) => {
      const li = document.createElement("li");
      if (w.chinese !== undefined) {
        li.textContent = w.pending
          ? `${w.chinese} → 孩子「${w.recognized}」（標準：${w.expected}）待確認`
          : `${w.chinese} → 標準：${w.expected}`;
      } else {
        li.textContent = w.pending
          ? `注音 ${w.zhuyin} → 辨識「${w.recognized}」（標準：${w.expected}）待確認`
          : `注音 ${w.zhuyin} → 標準答案：${w.expected}`;
      }
      list.appendChild(li);
    });
  }

  renderMistakeBookHome();
}

function openParentGate() {
  showView("parent");
  $("#pin-gate").hidden = false;
  $("#parent-panel").hidden = true;
  $("#parent-names").hidden = true;
  $("#pin-input").value = "";
  $("#pin-error").hidden = true;
}

function unlockParent() {
  const pin = $("#pin-input").value.trim();
  if (pin !== String(CONFIG.PARENT_PIN)) {
    $("#pin-error").hidden = false;
    return;
  }
  $("#pin-gate").hidden = true;
  $("#parent-panel").hidden = false;
  $("#parent-names").hidden = false;
  fillParentNameInputs();
  renderPendingList();
  renderScoreHistory();
  renderParentMistakeList();
}

function renderHomeScoreHistory() {
  const listEl = $("#home-history-list");
  const emptyEl = $("#home-history-empty");
  const toggleBtn = $("#btn-home-history-toggle");
  if (!listEl) return;

  const all = loadLocalScores();
  const childId = getSelectedChild();
  const childName = getChildName(childId);
  const scores = homeHistoryShowAll
    ? all
    : scoresForChild(all, childId, childName);
  const shown = scores.slice(0, 8);

  listEl.innerHTML = "";
  if (emptyEl) emptyEl.hidden = shown.length > 0;

  if (!shown.length) {
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = homeHistoryShowAll
        ? "尚無紀錄，完成測驗後會顯示"
        : `${childName} 尚無紀錄`;
    }
  } else {
    shown.forEach((s) => {
      const { score, meta } = formatScoreSummary(s);
      const li = document.createElement("li");
      const scoreSpan = document.createElement("span");
      scoreSpan.className = "home-history-score";
      scoreSpan.textContent = score;
      if (s.subject === "英語") scoreSpan.style.color = "var(--en)";
      const metaSpan = document.createElement("span");
      metaSpan.className = "home-history-meta";
      const who =
        homeHistoryShowAll && s.child && s.child !== childName
          ? `${s.child} · `
          : "";
      metaSpan.textContent = who + meta;
      li.append(scoreSpan, metaSpan);
      listEl.appendChild(li);
    });
  }

  if (toggleBtn) {
    toggleBtn.textContent = homeHistoryShowAll ? "只看此人" : "看全部";
  }

  const cloudEl = $("#home-history-cloud");
  if (cloudEl) {
    const hasUrl = Boolean((CONFIG.SCORE_LOG_URL || "").trim());
    cloudEl.hidden = hasUrl;
    if (!hasUrl) {
      cloudEl.textContent =
        "目前成績只存在此手機。要寫入 Google 雲端試算表，請完成 Apps Script 設定（見 docs/成績寫入試算表.md）。";
    }
  }
}

function renderScoreHistory() {
  const listEl = $("#score-history-list");
  const hintEl = $("#score-history-hint");
  if (!listEl) return;

  const scores = loadLocalScores();
  listEl.innerHTML = "";

  if (!scores.length) {
    const li = document.createElement("li");
    li.textContent = "尚無紀錄（完成一次測驗後會出現）";
    listEl.appendChild(li);
  } else {
    scores.slice(0, 15).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = formatScoreLine(s);
      listEl.appendChild(li);
    });
  }

  if (hintEl) {
    const hasUrl = Boolean((CONFIG.SCORE_LOG_URL || "").trim());
    hintEl.textContent = hasUrl
      ? "本機保留最近紀錄；完整歷史請看試算表「成績」工作表。"
      : "若要寫入 Google 試算表，請部署 Apps Script 並在 config.site.js 設定 SCORE_LOG_URL。";
  }
}

function renderPendingList() {
  const list = loadPending();
  $("#pending-count").textContent = String(list.length);
  const container = $("#pending-list");
  container.innerHTML = "";

  if (!list.length) {
    container.innerHTML = "<p class=\"parent-note\">目前沒有待確認題目。</p>";
    return;
  }

  list.forEach((p) => {
    const card = document.createElement("div");
    card.className = "pending-card";
    const isEn = p.subject === "en" || p.chinese;
    if (isEn) {
      card.innerHTML = `
      <div><strong>${getChildName(p.childId || p.child)}</strong> · 英語 · 第 ${p.questionIndex} 題</div>
      <div class="pending-meta">${p.chinese || ""} → 標準：${p.expected}</div>
      <div class="pending-meta">孩子答案：${p.recognized}</div>
    `;
    } else {
      card.innerHTML = `
      <div><strong>${getChildName(p.childId || p.child)}</strong> · 國語 · 第 ${p.questionIndex} 題 · ${p.lesson || ""}</div>
      <div class="pending-meta">注音：${p.zhuyin || ""}</div>
      <div class="pending-meta">辨識：${p.recognized} → 標準：${p.expected}</div>
    `;
      if (p.imageDataUrl) {
        const img = document.createElement("img");
        img.src = p.imageDataUrl;
        img.alt = "手寫內容";
        card.appendChild(img);
      }
    }

    const actions = document.createElement("div");
    actions.className = "pending-actions";

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "btn btn-ok";
    okBtn.textContent = "算對";
    okBtn.addEventListener("click", () => {
      removePending(p.id);
      renderPendingList();
    });

    const noBtn = document.createElement("button");
    noBtn.type = "button";
    noBtn.className = "btn btn-no";
    noBtn.textContent = "算錯";
    noBtn.addEventListener("click", () => {
      const childId = p.childId || p.child;
      if (p.subject === "en" || p.chinese) {
        addMistake(
          childId,
          "en",
          {
            lesson: p.lesson,
            chinese: p.chinese,
            english: p.expected,
            hint: p.hint || "",
          },
          p.recognized
        );
      } else {
        addMistake(
          childId,
          "zh",
          {
            lesson: p.lesson,
            word: p.expected,
            zhuyin: p.zhuyin,
            sentence: p.sentence || "",
          },
          p.recognized
        );
      }
      removePending(p.id);
      renderPendingList();
      renderParentMistakeList();
      renderMistakeBookHome();
    });

    actions.append(okBtn, noBtn);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

let homeTitlePressTimer = null;

function bindEvents() {
  const bindStart = (btn, fn) => {
    if (!btn) return;
    const go = (e) => {
      e.preventDefault();
      fn();
    };
    btn.addEventListener("click", go);
  };

  bindStart($("#btn-start-zh"), () => {
    buildLessonChips(zhBank);
    startZhQuiz();
  });
  bindStart($("#btn-start-en"), () => {
    primeSpeech();
    enMode =
      document.querySelector(".en-mode-picker .chip-active")?.dataset.enMode ||
      "meaning";
    buildLessonChips(enBank);
    startEnQuiz();
  });

  $("#btn-review-zh-mistakes")?.addEventListener("click", () => {
    startZhQuiz({ mistakeReview: true });
  });
  $("#btn-review-en-mistakes")?.addEventListener("click", () => {
    primeSpeech();
    startEnQuiz({ mistakeReview: true });
  });
  $("#btn-retry-wrong")?.addEventListener("click", retryWrongRound);
  $("#btn-clear-zh-mistakes")?.addEventListener("click", () => {
    if (confirm("確定清空目前小孩的國語錯題本？")) {
      clearMistakes(getSelectedChild(), "zh");
      renderParentMistakeList();
      renderMistakeBookHome();
    }
  });
  $("#btn-clear-en-mistakes")?.addEventListener("click", () => {
    if (confirm("確定清空目前小孩的英語錯題本？")) {
      clearMistakes(getSelectedChild(), "en");
      renderParentMistakeList();
      renderMistakeBookHome();
    }
  });

  document.querySelectorAll(".en-mode-picker .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      primeSpeech();
      setEnMode(btn.dataset.enMode);
    });
  });

  $("#btn-quiz-back").addEventListener("click", leaveQuizToHome);
  $("#btn-quiz-back-en").addEventListener("click", leaveQuizToHome);

  $("#btn-resume-quiz")?.addEventListener("click", resumeQuiz);
  $("#btn-discard-draft")?.addEventListener("click", () => {
    if (confirm("確定放棄暫存的測驗進度嗎？")) {
      clearQuizDraft();
      renderResumeBanner();
    }
  });
  $("#btn-clear-canvas").addEventListener("click", () => handwriting?.clear());
  $("#btn-stroke-order-replay")?.addEventListener("click", () => {
    if (!quiz || quiz.subject !== "zh") return;
    const q = quiz.questions[quiz.index];
    if (q?.word) void showStrokeOrderForWord(q.word);
  });
  $("#btn-submit-answer").addEventListener("click", submitAnswer);
  $("#btn-clear-en").addEventListener("click", () => {
    $("#en-answer-input").value = "";
    $("#en-answer-input").focus();
  });
  $("#btn-submit-en").addEventListener("click", submitEnAnswer);
  $("#btn-speak-en").addEventListener("click", () => {
    void playEnglishAudio();
  });
  $("#en-answer-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitEnAnswer();
  });

  $("#btn-retry").addEventListener("click", () => {
    if (quiz?.subject === "en") startEnQuiz();
    else startZhQuiz();
  });
  $("#btn-home").addEventListener("click", () => showView("home"));

  $("#btn-home-history-toggle")?.addEventListener("click", () => {
    homeHistoryShowAll = !homeHistoryShowAll;
    renderHomeScoreHistory();
  });
  $("#btn-parent-back").addEventListener("click", () => showView("home"));
  $("#btn-pin-submit").addEventListener("click", unlockParent);
  $("#btn-reload-sheet").addEventListener("click", async () => {
    await refreshBank();
    renderPendingList();
  });

  $("#btn-save-names").addEventListener("click", saveParentNames);

  $("#feedback-mark-correct").addEventListener("click", () => resolveParentReview(true));
  $("#feedback-mark-wrong").addEventListener("click", () => resolveParentReview(false));
  $("#feedback-pin").addEventListener("keydown", (e) => {
    if (e.key === "Enter") resolveParentReview(true);
  });

  const title = $("#home-title");
  title.addEventListener("touchstart", (e) => {
    homeTitlePressTimer = setTimeout(() => {
      e.preventDefault();
      openParentGate();
    }, 800);
  });
  title.addEventListener("touchend", () => clearTimeout(homeTitlePressTimer));
  title.addEventListener("touchmove", () => clearTimeout(homeTitlePressTimer));
  title.addEventListener("mousedown", () => {
    homeTitlePressTimer = setTimeout(openParentGate, 800);
  });
  title.addEventListener("mouseup", () => clearTimeout(homeTitlePressTimer));
  title.addEventListener("mouseleave", () => clearTimeout(homeTitlePressTimer));
}

async function init() {
  if (!$("#view-home") || !$("#btn-start-zh")) {
    showBootError("頁面載入不完整，請確認用 http://localhost:8787 開啟。");
    return;
  }

  bindEvents();
  setupQuizAutoSave();
  initChildPicker();
  initQuizCountPicker();
  initFlipZh({
    showView,
    getZhBank: () => zhBank,
    getLessonFilter: () => lessonFilter,
    getChildNames,
    showWarn: (title, sub) => {
      showFeedback("warn", title, [{ label: "好的", primary: true, onClick: () => {} }], {
        sub: sub || "",
      });
    },
  });
  initFlipMath({
    showView,
    getChildNames,
    showWarn: (title, sub, onClose) => {
      showFeedback(
        "warn",
        title,
        [{ label: "好的", primary: true, onClick: () => onClose?.() }],
        { sub: sub || "" }
      );
    },
    showOk: (title, sub, onClose) => {
      showFeedback(
        "ok",
        title,
        [{ label: "好耶", primary: true, onClick: () => onClose?.() }],
        { sub: sub || "" }
      );
    },
  });
  await refreshBank();
  renderHomeScoreHistory();
  renderResumeBanner();
  renderMistakeBookHome();
}

window.startZhQuiz = startZhQuiz;
window.startEnQuiz = startEnQuiz;

init().catch((e) => {
  console.error(e);
  showBootError(`程式錯誤：${e.message}。請用 http://localhost:8787 開啟。`);
});

async function ensureOcrReady() {
  if (!CONFIG.OCR_ENABLED) return false;
  try {
    await ensurePaddleOcr();
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}
