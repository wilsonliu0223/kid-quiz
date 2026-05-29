import { CONFIG } from "./config.site.js";
import { loadZhItems, uniqueLessons, pickRandomQuestions } from "./sheets.js";
import { createHandwritingCanvas } from "./canvas-handwriting.js";
import { recognizeCanvas, answersMatch } from "./ocr.js";
import {
  getSelectedChild,
  setSelectedChild,
  addPending,
  loadPending,
  removePending,
} from "./store.js";
import { fillSentenceContext } from "./sentence.js";
import { getChildName, getChildNames, setChildNames } from "./children.js";

const $ = (sel) => document.querySelector(sel);

let zhBank = [];
let lessonFilter = "全部";
let quiz = null;
let handwriting = null;
/** @type {{ recognized: string, imageDataUrl: string } | null} */
let pendingReview = null;

const views = {
  home: $("#view-home"),
  quiz: $("#view-quiz-zh"),
  result: $("#view-result"),
  parent: $("#view-parent"),
};

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    const on = key === name;
    el.classList.toggle("view-active", on);
    el.classList.toggle("view-hidden", !on);
  });
  if (name === "quiz") {
    requestAnimationFrame(() => {
      handwriting?.resize();
    });
  }
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
    zhBank = await loadZhItems();
    const src = CONFIG.SPREADSHEET_ID || CONFIG.SHEETS_JSON_URL ? "試算表" : "示範題庫";
    setSheetStatus(`國語 ${zhBank.length} 題（${src}）`);
    buildLessonChips();
  } catch (e) {
    console.error(e);
    setSheetStatus(`載入失敗：${e.message}`, true);
  }
}

function buildLessonChips() {
  const lessons = uniqueLessons(zhBank);
  const wrap = $("#lesson-picker");
  const container = $("#lesson-chips");
  container.innerHTML = "";

  if (lessons.length <= 1) {
    wrap.hidden = true;
    lessonFilter = "全部";
    return;
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
}

function initChildPicker() {
  renderChildChips();
  document.querySelectorAll(".child-btns .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      setSelectedChild(btn.dataset.child);
      renderChildChips();
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

function startZhQuiz() {
  const questions = pickRandomQuestions(zhBank, 10, lessonFilter);
  if (!questions.length) {
    alert("沒有題目！請檢查試算表或課次篩選。");
    return;
  }

  quiz = {
    child: getSelectedChild(),
    questions,
    index: 0,
    autoCorrect: 0,
    pending: 0,
    wrong: [],
    startedAt: Date.now(),
  };

  showView("quiz");
  const canvas = $("#hand-canvas");
  const wrap = canvas.parentElement;
  if (!handwriting) {
    handwriting = createHandwritingCanvas(canvas, wrap);
  } else {
    handwriting.resize();
  }
  renderQuestion();
}

function renderQuestion() {
  const q = quiz.questions[quiz.index];
  $("#quiz-progress").textContent = `第 ${quiz.index + 1} / ${quiz.questions.length} 題`;

  const zhuyinEl = $("#zhuyin-display");
  const sentenceEl = $("#sentence-context");
  const hasSentence = fillSentenceContext(sentenceEl, q.sentence, q.word, q.zhuyin);

  if (hasSentence) {
    zhuyinEl.classList.add("is-compact");
    zhuyinEl.textContent = q.zhuyin;
    $("#quiz-hint").textContent = "看例句中的注音，在下方寫出國字";
  } else {
    zhuyinEl.classList.remove("is-compact");
    zhuyinEl.textContent = q.zhuyin;
    sentenceEl.hidden = true;
    $("#quiz-hint").textContent = "請在下方寫出國字或詞";
  }

  $("#ocr-status").hidden = true;
  handwriting.clear();
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
  if (options.parentReview) {
    parentBlock.hidden = false;
  } else {
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
  pendingReview = null;
}

function showParentReviewOverlay(recognized, imageDataUrl) {
  const q = quiz.questions[quiz.index];
  pendingReview = { recognized, imageDataUrl };

  const rec = recognized ? `「${recognized}」` : "（辨識不出）";
  $("#feedback-ocr-line").textContent =
    `辨識結果：${rec}　｜　標準答案：${q.word}`;

  showFeedback(
    "warn",
    "電腦無法確認，請家長判定",
    [
      {
        label: "再寫一次",
        primary: false,
        onClick: () => {
          pendingReview = null;
          handwriting.clear();
        },
      },
      {
        label: "先跳過（不算分）",
        primary: true,
        onClick: () => {
          quiz.wrong.push({
            zhuyin: q.zhuyin,
            expected: q.word,
            recognized: recognized || "—",
            pending: false,
            skipped: true,
          });
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
    quiz.autoCorrect += 1;
    closeFeedbackOverlay();
    showFeedback("ok", "家長確認：答對！", [], { simple: true });
    setTimeout(goNextQuestion, 800);
    return;
  }

  addPending({
    child: quiz.child,
    lesson: q.lesson,
    zhuyin: q.zhuyin,
    expected: q.word,
    recognized: recognized || "(無法辨識)",
    imageDataUrl,
    at: new Date().toISOString(),
    questionIndex: quiz.index + 1,
  });
  quiz.pending += 1;
  quiz.wrong.push({
    zhuyin: q.zhuyin,
    expected: q.word,
    recognized: recognized || "—",
    pending: true,
  });

  closeFeedbackOverlay();
  goNextQuestion();
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
  statusEl.textContent = "辨識中…";

  await ensureOcrReady();

  const canvas = $("#hand-canvas");
  const imageDataUrl = handwriting.toDataURL();
  const { text: recognized, skipped, error } = await recognizeCanvas(canvas);

  statusEl.hidden = true;
  submitBtn.disabled = false;

  const match = !skipped && !error && answersMatch(recognized, q.word);

  if (match) {
    quiz.autoCorrect += 1;
    showFeedback("ok", "答對了！", [], { simple: true });
    setTimeout(goNextQuestion, 950);
    return;
  }

  showParentReviewOverlay(recognized || "", imageDataUrl);
}

function goNextQuestion() {
  quiz.index += 1;
  if (quiz.index >= quiz.questions.length) {
    showResult();
    return;
  }
  renderQuestion();
}

function showResult() {
  showView("result");
  const total = quiz.questions.length;
  const scored = quiz.autoCorrect;
  $("#result-title").textContent = `${getChildName(quiz.child)} 完成 · 國語`;
  $("#score-big").textContent = `${scored} / ${total}`;

  const pendingEl = $("#score-pending");
  if (quiz.pending > 0) {
    pendingEl.hidden = false;
    pendingEl.textContent = `另有 ${quiz.pending} 題待家長確認（長按首頁標題進入）`;
  } else {
    pendingEl.hidden = true;
  }

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
      li.textContent = w.pending
        ? `注音 ${w.zhuyin} → 辨識「${w.recognized}」（標準：${w.expected}）待確認`
        : `注音 ${w.zhuyin} → 標準答案：${w.expected}`;
      list.appendChild(li);
    });
  }
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
    card.innerHTML = `
      <div><strong>${getChildName(p.childId || p.child)}</strong> · 第 ${p.questionIndex} 題 · ${p.lesson || ""}</div>
      <div class="pending-meta">注音：${p.zhuyin}</div>
      <div class="pending-meta">辨識：${p.recognized} → 標準：${p.expected}</div>
    `;
    const img = document.createElement("img");
    img.src = p.imageDataUrl;
    img.alt = "手寫內容";
    card.appendChild(img);

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
      removePending(p.id);
      renderPendingList();
    });

    actions.append(okBtn, noBtn);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

let homeTitlePressTimer = null;

function bindEvents() {
  const startBtn = $("#btn-start-zh");
  if (startBtn) {
    const go = (e) => {
      e.preventDefault();
      startZhQuiz();
    };
    startBtn.addEventListener("click", go);
    startBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      go(e);
    });
  }
  $("#btn-quiz-back").addEventListener("click", () => {
    if (confirm("確定要離開測驗嗎？")) showView("home");
  });
  $("#btn-clear-canvas").addEventListener("click", () => handwriting?.clear());
  $("#btn-submit-answer").addEventListener("click", submitAnswer);
  $("#btn-retry").addEventListener("click", startZhQuiz);
  $("#btn-home").addEventListener("click", () => showView("home"));
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
  initChildPicker();
  await refreshBank();
}

window.startZhQuiz = startZhQuiz;

init().catch((e) => {
  console.error(e);
  showBootError(`程式錯誤：${e.message}。請用 http://localhost:8787 開啟。`);
});

function loadTesseractScript() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("無法載入辨識程式"));
    document.head.appendChild(s);
  });
}

async function ensureOcrReady() {
  if (!CONFIG.OCR_ENABLED) return false;
  try {
    await loadTesseractScript();
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}
