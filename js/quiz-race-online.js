import { pickRandomQuestions } from "./sheets.js";
import { englishAnswersMatch } from "./english.js";
import { buildMulRaceQuestions } from "./times-table.js";
import {
  registerOnlineGame,
  getOnlineContext,
  leaveOnlineRoom,
  openDuoModePicker,
  rematchOnlineRoom,
} from "./online-duo.js";
import { startGameRoom, transactGameState, asFirebaseList } from "./room-service.js";

/** @typedef {'host' | 'guest'} RoomSlot */
/** @typedef {'zh' | 'en' | 'mul'} RaceSubject */

const WIN_SCORE = 5;
const READY_MS = 2000;
const OPEN_MS = 10000;
const REVEAL_MS = 2500;

/** @type {object | null} */
let onlineState = null;
/** @type {{ host: string, guest: string } | null} */
let names = null;
/** @type {RaceSubject | null} */
let activeSubject = null;
/** @type {string | number | null} */
let localDraft = null;
/** @type {ReturnType<typeof setInterval> | null} */
let phaseTimer = null;

/** @type {object | null} */
let raceDeps = null;

const $ = (sel) => document.querySelector(sel);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nameOf(slot) {
  return names?.[slot] || (slot === "host" ? "房主" : "來賓");
}

function normalizeSubmissions(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    host: src.host ?? null,
    guest: src.guest ?? null,
  };
}

function normalizeRaceState(state) {
  if (!state || typeof state !== "object") return state;
  return {
    ...state,
    questions: asFirebaseList(state.questions),
    submissions: normalizeSubmissions(state.submissions),
  };
}

function resetRaceSession() {
  onlineState = null;
  names = null;
  activeSubject = null;
  localDraft = null;
  lastQuestionKey = "";
  stopPhaseTimer();
  clearRacePlayUi();
}

function stopPhaseTimer() {
  if (phaseTimer) {
    clearInterval(phaseTimer);
    phaseTimer = null;
  }
}

function startPhaseTimer() {
  stopPhaseTimer();
  phaseTimer = setInterval(() => {
    void tryAdvancePhase();
    renderRaceHeader();
    updateBuzzButton();
  }, 200);
}

/** @type {string} */
let lastQuestionKey = "";

function questionRenderKey() {
  if (!onlineState) return "";
  const q = currentQuestion();
  return `${onlineState.round}-${onlineState.phase}-${activeSubject}-${q?.id || ""}`;
}

function highlightChoice(selected) {
  document.querySelectorAll(".race-choice-btn").forEach((btn) => {
    const val = btn.textContent ?? "";
    const match =
      activeSubject === "mul" ? Number(val) === Number(selected) : val === String(selected);
    btn.classList.toggle("race-choice-selected", match);
  });
}

function clearRacePlayUi() {
  const grid = $("#race-choices");
  if (grid) grid.innerHTML = "";
  const prompt = $("#race-question-prompt");
  if (prompt) prompt.textContent = "";
  const input = /** @type {HTMLInputElement | null} */ ($("#race-answer-input"));
  if (input) {
    input.value = "";
    input.hidden = true;
  }
  const buzz = $("#btn-race-buzz");
  if (buzz) buzz.disabled = true;
  const hint = $("#race-status-hint");
  if (hint) hint.textContent = "";
}

function buildZhRaceQuestions(zhBank, lessonFilter, count) {
  const singles = zhBank.filter((w) => w.word && [...String(w.word).trim()].length === 1);
  const picked = pickRandomQuestions(singles, count, lessonFilter);
  if (!picked.length) return { ok: false, available: singles.length, questions: [] };
  const questions = picked.map((item, i) => {
    const answer = String(item.word || "").trim();
    const others = shuffle(singles.filter((w) => String(w.word).trim() !== answer))
      .slice(0, 3)
      .map((w) => String(w.word).trim());
    const choices = shuffle([answer, ...others]);
    return {
      id: `zh-${i}`,
      zhuyin: item.zhuyin || "",
      sentence: item.sentence || "",
      answer,
      choices,
    };
  });
  return { ok: true, available: picked.length, questions };
}

function buildEnRaceQuestions(enBank, lessonFilter, count, mode) {
  const picked = pickRandomQuestions(enBank, count, lessonFilter);
  if (!picked.length) return { ok: false, available: 0, questions: [] };
  const questions = picked.map((item, i) => ({
    id: `en-${i}`,
    mode,
    chinese: item.chinese || "",
    english: item.english || "",
    hint: item.hint || "",
  }));
  return { ok: true, available: picked.length, questions };
}

function checkRaceAnswer(subject, q, answer) {
  if (subject === "mul") return Number(answer) === Number(q.answer);
  if (subject === "en") return englishAnswersMatch(String(answer), q.english);
  if (subject === "zh") return String(answer).trim() === String(q.answer).trim();
  return false;
}

function pickQuestions(subject, config) {
  const count = config.questionCount || raceDeps?.getQuizCountSetting?.() || 10;
  if (subject === "mul") {
    const questions = buildMulRaceQuestions({
      quizMode: config.quizMode || "full",
      digit: config.digit ?? null,
      count: config.quizMode === "digit" ? 9 : count,
    });
    return questions.length ? { ok: true, questions } : { ok: false, available: 0, questions: [] };
  }
  if (subject === "en") {
    const bank = raceDeps?.getEnBank?.() || [];
    if (!bank.length) return { ok: false, available: 0, questions: [] };
    return buildEnRaceQuestions(
      bank,
      config.lessonFilter || raceDeps?.getEnLessonFilter?.() || "全部",
      count,
      config.enMode || raceDeps?.getEnMode?.() || "meaning"
    );
  }
  const bank = raceDeps?.getZhBank?.() || [];
  if (!bank.length) return { ok: false, available: 0, questions: [] };
  return buildZhRaceQuestions(
    bank,
    config.lessonFilter || raceDeps?.getLessonFilter?.() || "全部",
    count
  );
}

function createInitialRaceState(subject, questions) {
  return {
    subject,
    questions,
    round: 0,
    phase: "ready",
    phaseStartedAt: Date.now(),
    readyMs: READY_MS,
    questionLimitMs: OPEN_MS,
    revealMs: REVEAL_MS,
    winScore: WIN_SCORE,
    submissions: { host: null, guest: null },
    roundWinner: null,
    scores: { host: 0, guest: 0 },
    over: false,
    matchWinner: null,
  };
}

async function startRaceGame(roomId, snap, subject) {
  const config = snap.meta?.config || {};
  const result = pickQuestions(subject, config);
  if (!result.ok || !result.questions.length) {
    alert(
      subject === "mul"
        ? "無法開局：題目不足"
        : `無法開局：題庫不足（需要題目，目前 ${result.available || 0} 題）`
    );
    return;
  }
  await startGameRoom(roomId, createInitialRaceState(subject, result.questions));
}

function renderRaceStartButton(panel, _snap, onPick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-primary btn-block btn-primary-gomoku";
  btn.textContent = "開始搶答對戰";
  btn.addEventListener("click", () => onPick(/** @type {RoomSlot} */ ("host")));
  panel.appendChild(btn);
}

function currentQuestion() {
  if (!onlineState?.questions?.length) return null;
  return onlineState.questions[onlineState.round] || null;
}

function remainingMs() {
  if (!onlineState) return 0;
  const now = Date.now();
  const elapsed = now - (onlineState.phaseStartedAt || now);
  if (onlineState.phase === "ready") return Math.max(0, onlineState.readyMs - elapsed);
  if (onlineState.phase === "open") return Math.max(0, onlineState.questionLimitMs - elapsed);
  if (onlineState.phase === "reveal") return Math.max(0, onlineState.revealMs - elapsed);
  return 0;
}

function phaseLabel() {
  if (!onlineState) return "";
  if (onlineState.phase === "ready") return "準備";
  if (onlineState.phase === "open") return "作答";
  if (onlineState.phase === "reveal") return "揭曉";
  if (onlineState.over) return "結束";
  return "";
}

function mySubmission() {
  const ctx = getOnlineContext();
  if (!ctx.slot || !onlineState) return null;
  return onlineState.submissions?.[ctx.slot] ?? null;
}

function renderRaceHeader() {
  if (!onlineState) return;
  const ctx = getOnlineContext();
  if ($("#race-play-name-a")) $("#race-play-name-a").textContent = nameOf("host");
  if ($("#race-play-name-b")) $("#race-play-name-b").textContent = nameOf("guest");
  if ($("#race-score-a")) $("#race-score-a").textContent = String(onlineState.scores.host ?? 0);
  if ($("#race-score-b")) $("#race-score-b").textContent = String(onlineState.scores.guest ?? 0);
  $("#race-score-block-a")?.classList.toggle("flip-score-active", onlineState.roundWinner === "host");
  $("#race-score-block-b")?.classList.toggle("flip-score-active", onlineState.roundWinner === "guest");

  const total = onlineState.questions.length;
  const roundNum = Math.min(onlineState.round + 1, total);
  if ($("#race-round-label")) {
    $("#race-round-label").textContent = `第 ${roundNum} / ${total} 題`;
  }
  if ($("#race-timer-label")) {
    const sec = Math.ceil(remainingMs() / 1000);
    $("#race-timer-label").textContent = `${phaseLabel()} ${sec} 秒`;
  }
  if ($("#race-room-tag") && ctx.roomId) {
    $("#race-room-tag").textContent = `房間 ${ctx.roomId}`;
  }
}

function renderQuestionArea(force = false) {
  const key = questionRenderKey();
  if (!force && key === lastQuestionKey) return;
  lastQuestionKey = key;

  const q = currentQuestion();
  const promptEl = $("#race-question-prompt");
  const choicesEl = $("#race-choices");
  const inputEl = /** @type {HTMLInputElement | null} */ ($("#race-answer-input"));
  if (!promptEl || !choicesEl || !q) return;

  choicesEl.innerHTML = "";

  if (activeSubject === "zh") {
    if (inputEl) inputEl.hidden = true;
    promptEl.innerHTML = `<span class="race-zhuyin">${escapeHtml(q.zhuyin || "")}</span>`;
    if (q.sentence) {
      promptEl.innerHTML += `<p class="race-sentence">${escapeHtml(q.sentence)}</p>`;
    }
    promptEl.innerHTML += `<p class="race-prompt-sub">選出正確國字，再按搶答</p>`;
    q.choices.forEach((ch) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn race-choice-btn";
      btn.textContent = ch;
      btn.classList.toggle("race-choice-selected", localDraft === ch);
      btn.addEventListener("click", () => {
        if (onlineState?.phase !== "open" || mySubmission()) return;
        localDraft = ch;
        highlightChoice(ch);
        updateBuzzButton();
      });
      choicesEl.appendChild(btn);
    });
    return;
  }

  if (activeSubject === "en") {
    const mode = q.mode || "meaning";
    if (mode === "meaning") {
      promptEl.innerHTML = `<p class="race-en-chinese">${escapeHtml(q.chinese || "")}</p><p class="race-prompt-sub">輸入英文，再按搶答</p>`;
    } else {
      promptEl.innerHTML = `<p class="race-prompt-sub">聽音拼字（請輸入英文後搶答）</p>`;
    }
    if (inputEl) {
      inputEl.hidden = false;
      inputEl.placeholder = "輸入答案";
      if (document.activeElement !== inputEl) {
        inputEl.value = String(localDraft ?? "");
      }
    }
    return;
  }

  if (activeSubject === "mul") {
    if (inputEl) inputEl.hidden = true;
    promptEl.innerHTML = `<p class="race-mul-prompt">${escapeHtml(q.prompt || "")}</p><p class="race-prompt-sub">選出答案，再按搶答</p>`;
    asFirebaseList(q.choices).forEach((n) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn race-choice-btn race-mul-choice";
      btn.textContent = String(n);
      btn.classList.toggle("race-choice-selected", Number(localDraft) === Number(n));
      btn.addEventListener("click", () => {
        if (onlineState?.phase !== "open" || mySubmission()) return;
        localDraft = n;
        highlightChoice(n);
        updateBuzzButton();
      });
      choicesEl.appendChild(btn);
    });
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function updateBuzzButton() {
  const buzz = $("#btn-race-buzz");
  const hint = $("#race-status-hint");
  const ctx = getOnlineContext();
  if (!buzz || !onlineState) return;

  const submitted = mySubmission();
  const hasDraft =
    localDraft !== null &&
    localDraft !== "" &&
    !(typeof localDraft === "string" && !localDraft.trim());

  buzz.disabled =
    onlineState.phase !== "open" || !!submitted || !hasDraft || onlineState.over;

  if (!hint) return;
  if (onlineState.phase === "ready") {
    hint.textContent = "下一題準備中…";
  } else if (onlineState.phase === "reveal") {
    const q = currentQuestion();
    const expected = q ? formatExpected(q) : "";
    if (onlineState.roundWinner) {
      hint.textContent = `${nameOf(onlineState.roundWinner)} 搶答答對！正解：${expected}`;
    } else {
      hint.textContent = `本題無人答對。正解：${expected}`;
    }
  } else if (submitted) {
    hint.textContent = submitted.correct
      ? "你已搶答且答對，等候揭曉…"
      : "你已搶答，等候對方或揭曉…";
  } else if (onlineState.phase === "open") {
    hint.textContent = hasDraft ? "確認答案後，按搶答送出！" : "請先選好或輸入答案";
  } else {
    hint.textContent = "";
  }
}

function formatExpected(q) {
  if (activeSubject === "mul") return String(q.answer);
  if (activeSubject === "en") return String(q.english);
  if (activeSubject === "zh") return String(q.answer);
  return "";
}

function renderRaceUi({ forceQuestion = false } = {}) {
  if (!onlineState) return;
  renderRaceHeader();
  if (onlineState.phase !== "over") {
    renderQuestionArea(forceQuestion);
  }
  updateBuzzButton();
}

function applyRemoteState(state, snap, force = false) {
  const normalized = normalizeRaceState(state);
  if (!normalized) return;

  const prevRound = onlineState?.round;
  const prevPhase = onlineState?.phase;

  onlineState = normalized;
  activeSubject = normalized.subject;
  names = {
    host: snap.players.host?.name || "房主",
    guest: snap.players.guest?.name || "來賓",
  };

  const phaseRoundChanged =
    force || prevRound !== onlineState.round || prevPhase !== onlineState.phase;
  if (phaseRoundChanged && !mySubmission()) {
    localDraft = null;
    lastQuestionKey = "";
  }

  renderRaceUi({ forceQuestion: phaseRoundChanged });

  if (onlineState.over) {
    stopPhaseTimer();
    showRaceResult();
  } else {
    startPhaseTimer();
  }
}

function enterPlay(snap) {
  resetRaceSession();
  getOnlineContext().deps?.showView("racePlay");
  applyRemoteState(snap.state, snap, true);
}

function shouldReenterPlay(snap) {
  if (!$("#view-race-play")?.classList.contains("view-active")) return true;
  const remote = normalizeRaceState(snap.state);
  if (!remote || !onlineState) return true;
  if (remote.subject !== onlineState.subject) return true;
  if (remote.over && !onlineState.over) return true;
  if (!remote.over && onlineState.over) return true;
  return false;
}

async function tryAdvancePhase() {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !onlineState || onlineState.over) return;
  const now = Date.now();
  const s = onlineState;
  const due =
    (s.phase === "ready" && now >= s.phaseStartedAt + s.readyMs) ||
    (s.phase === "open" && now >= s.phaseStartedAt + s.questionLimitMs) ||
    (s.phase === "reveal" && now >= s.phaseStartedAt + s.revealMs);
  if (!due) return;

  const next = await transactGameState(ctx.roomId, (raw) => {
    const cur = normalizeRaceState(raw);
    if (!cur || cur.over) return;
    const n = Date.now();
    if (cur.phase === "ready" && n >= cur.phaseStartedAt + cur.readyMs) {
      return {
        ...cur,
        phase: "open",
        phaseStartedAt: n,
        submissions: { host: null, guest: null },
        roundWinner: null,
      };
    }
    if (cur.phase === "open" && n >= cur.phaseStartedAt + cur.questionLimitMs) {
      return { ...cur, phase: "reveal", phaseStartedAt: n };
    }
    if (cur.phase === "reveal" && n >= cur.phaseStartedAt + cur.revealMs) {
      const winSlot =
        cur.scores.host >= cur.winScore
          ? "host"
          : cur.scores.guest >= cur.winScore
            ? "guest"
            : null;
      const nextRound = cur.round + 1;
      if (winSlot || nextRound >= cur.questions.length) {
        const matchWinner =
          winSlot ||
          (cur.scores.host > cur.scores.guest
            ? "host"
            : cur.scores.guest > cur.scores.host
              ? "guest"
              : null);
        return { ...cur, phase: "over", over: true, matchWinner, phaseStartedAt: n };
      }
      return {
        ...cur,
        round: nextRound,
        phase: "ready",
        phaseStartedAt: n,
        submissions: { host: null, guest: null },
        roundWinner: null,
      };
    }
    return undefined;
  });

  if (next) {
    onlineState = normalizeRaceState(next);
    renderRaceUi({ forceQuestion: true });
    if (onlineState?.over) showRaceResult();
  }
}

async function onBuzz() {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot || !onlineState || onlineState.phase !== "open") return;
  if (mySubmission()) return;
  const draft = localDraft;
  if (draft === null || draft === "" || (typeof draft === "string" && !draft.trim())) return;

  const answer = String(draft);
  const subject = onlineState.subject;

  try {
    const next = await transactGameState(ctx.roomId, (raw) => {
      const s = normalizeRaceState(raw);
      if (!s || s.phase !== "open" || s.over) return;
      if (s.submissions[ctx.slot]) return;

      const q = s.questions[s.round];
      if (!q) return;
      const correct = checkRaceAnswer(subject, q, answer);
      const sub = { answer, at: Date.now(), correct };
      const submissions = { ...s.submissions, [ctx.slot]: sub };

      let roundWinner = s.roundWinner;
      let scores = { ...s.scores };
      let phase = s.phase;
      let phaseStartedAt = s.phaseStartedAt;

      const slots = /** @type {RoomSlot[]} */ (["host", "guest"]).filter((sl) => submissions[sl]);
      slots.sort((a, b) => submissions[a].at - submissions[b].at);

      for (const sl of slots) {
        if (submissions[sl].correct && !roundWinner) {
          roundWinner = sl;
          scores[sl] = (scores[sl] || 0) + 1;
          phase = "reveal";
          phaseStartedAt = Date.now();
          break;
        }
      }

      if (phase === "open" && submissions.host && submissions.guest) {
        phase = "reveal";
        phaseStartedAt = Date.now();
      }

      return { ...s, submissions, roundWinner, scores, phase, phaseStartedAt };
    });

    if (next) {
      const prevPhase = onlineState?.phase;
      onlineState = normalizeRaceState(next);
      if (prevPhase !== onlineState.phase) {
        renderRaceUi({ forceQuestion: true });
      } else {
        renderRaceHeader();
        updateBuzzButton();
      }
      if (onlineState.over) showRaceResult();
    }
  } catch (err) {
    console.error("race buzz failed", err);
    alert("搶答失敗，請再試一次");
  }
}

function showRaceResult() {
  if (!onlineState) return;
  const ctx = getOnlineContext();
  const a = onlineState.scores.host ?? 0;
  const b = onlineState.scores.guest ?? 0;
  const title = $("#race-result-title");
  const mw = onlineState.matchWinner;

  if ($("#race-result-scores")) {
    $("#race-result-scores").textContent = `${nameOf("host")} ${a} ：${b} ${nameOf("guest")}`;
  }
  if (mw === ctx.slot) {
    if (title) title.textContent = "你贏了！";
  } else if (mw === "host") {
    if (title) title.textContent = `${nameOf("host")} 獲勝！`;
  } else if (mw === "guest") {
    if (title) title.textContent = `${nameOf("guest")} 獲勝！`;
  } else if (title) {
    title.textContent = "平手！";
  }
  if ($("#race-result-detail")) {
    $("#race-result-detail").textContent = `搶答對戰 · 先到 ${onlineState.winScore} 分 · 同房間可再玩`;
  }
  const replayBtn = $("#btn-race-replay");
  if (replayBtn) replayBtn.textContent = "同房間再玩一局";
  getOnlineContext().deps?.showView("raceResult");
}

function makeRaceHandler(subject, gameKey) {
  return {
    startHint: "雙方準備好後，房主按開始",
    renderStartButtons: renderRaceStartButton,
    startGame: (roomId, _slot, snap) => startRaceGame(roomId, snap, subject),
    onEnterLobby() {
      resetRaceSession();
    },
    onLeave() {
      resetRaceSession();
    },
    onPlaying(snap) {
      if (shouldReenterPlay(snap)) {
        enterPlay(snap);
        return;
      }
      applyRemoteState(snap.state, snap);
    },
  };
}

registerOnlineGame("race-zh", makeRaceHandler("zh", "race-zh"));
registerOnlineGame("race-en", makeRaceHandler("en", "race-en"));
registerOnlineGame("race-mul", makeRaceHandler("mul", "race-mul"));

function openRaceDuoMode(subject, title, backView, config) {
  resetRaceSession();
  const game = `race-${subject}`;
  openDuoModePicker({ game, title, backView, localStart: () => {}, config });
}

export function openZhRaceDuoMode() {
  openRaceDuoMode("zh", "國語搶答對戰", "setupZh", {
    lessonFilter: raceDeps?.getLessonFilter?.() || "全部",
    questionCount: raceDeps?.getQuizCountSetting?.() || 10,
  });
}

export function openEnRaceDuoMode() {
  openRaceDuoMode("en", "英語搶答對戰", "setupEn", {
    lessonFilter: raceDeps?.getEnLessonFilter?.() || "全部",
    enMode: raceDeps?.getEnMode?.() || "meaning",
    questionCount: raceDeps?.getQuizCountSetting?.() || 10,
  });
}

export function openMulRaceDuoMode(config = {}) {
  openRaceDuoMode("mul", "九九乘法搶答對戰", "mulPick", {
    quizMode: config.quizMode || "full",
    digit: config.digit ?? null,
    questionCount: config.quizMode === "digit" ? 9 : raceDeps?.getQuizCountSetting?.() || 10,
  });
}

export function bindRaceEvents() {
  $("#btn-race-play-back")?.addEventListener("click", async () => {
    if (!getOnlineContext().roomId) return;
    if (!confirm("離開對戰？")) return;
    const subject = activeSubject;
    await leaveOnlineRoom();
    const back =
      subject === "mul" ? "mulPick" : subject === "en" ? "setupEn" : "setupZh";
    getOnlineContext().deps?.showView(back);
  });
  $("#btn-race-buzz")?.addEventListener("click", () => void onBuzz());
  $("#race-answer-input")?.addEventListener("input", () => {
    const el = /** @type {HTMLInputElement | null} */ ($("#race-answer-input"));
    if (!el) return;
    localDraft = el.value;
    updateBuzzButton();
  });
  $("#race-answer-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void onBuzz();
  });
  $("#btn-race-replay")?.addEventListener("click", async () => {
    if (getOnlineContext().roomId) {
      await rematchOnlineRoom();
      return;
    }
  });
  $("#btn-race-home")?.addEventListener("click", async () => {
    if (getOnlineContext().roomId) await leaveOnlineRoom();
    getOnlineContext().deps?.showView("home");
  });
}

/**
 * @param {object} d
 */
export function initRaceDuo(d) {
  raceDeps = d;
  bindRaceEvents();
}
