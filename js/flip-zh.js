const KEY_FLIP_PAIR_COUNT = "kid-quiz-flip-pair-count";
const FLIP_PAIR_OPTIONS = [5, 10, 15, 20];
const MISMATCH_MS = 900;

/** @type {import('./flip-zh.js').FlipDeps | null} */
let deps = null;
/** @type {FlipGameState | null} */
let game = null;

/**
 * @typedef {object} FlipDeps
 * @property {(name: string) => void} showView
 * @property {() => object[]} getZhBank
 * @property {() => string} getLessonFilter
 * @property {() => { A: string, B: string }} getChildNames
 * @property {(title: string, sub?: string) => void} showWarn
 */

/**
 * @typedef {object} FlipCard
 * @property {string} id
 * @property {'char'|'zhuyin'} kind
 * @property {string} word
 * @property {string} face
 * @property {boolean} faceUp
 * @property {boolean} matched
 */

/**
 * @typedef {object} FlipGameState
 * @property {{ word: string, zhuyin: string }[]} words
 * @property {FlipCard[]} cards
 * @property {{ A: number, B: number }} scores
 * @property {'A'|'B'} firstPlayerId
 * @property {'A'|'B'} currentPlayerId
 * @property {number[]} flippedIdx
 * @property {boolean} locked
 * @property {number} matchedPairs
 * @property {number} pairCount
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

export function getFlipPairCountSetting() {
  const raw = localStorage.getItem(KEY_FLIP_PAIR_COUNT);
  if (raw) {
    const n = parseInt(raw, 10);
    if (FLIP_PAIR_OPTIONS.includes(n)) return n;
  }
  return 10;
}

function setFlipPairCountSetting(n) {
  localStorage.setItem(KEY_FLIP_PAIR_COUNT, String(n));
}

export function syncFlipPairCountChips() {
  const container = $("#flip-pair-count-chips");
  if (!container) return;
  const current = String(getFlipPairCountSetting());
  container.querySelectorAll(".chip").forEach((btn) => {
    btn.classList.toggle("chip-active", btn.dataset.flipPairs === current);
  });
}

export function initFlipPairCountPicker() {
  const container = $("#flip-pair-count-chips");
  if (!container) return;
  container.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.dataset.flipPairs, 10);
      if (FLIP_PAIR_OPTIONS.includes(n)) {
        setFlipPairCountSetting(n);
        syncFlipPairCountChips();
      }
    });
  });
  syncFlipPairCountChips();
}

export function renderFlipHomePlayers() {
  const names = deps?.getChildNames() || { A: "A", B: "B" };
  const aEl = $("#flip-player-a-name");
  const bEl = $("#flip-player-b-name");
  if (aEl) aEl.textContent = names.A;
  if (bEl) bEl.textContent = names.B;
}

/** @returns {{ ok: true, words: object[] } | { ok: false, available: number }} */
export function pickFlipWords(zhBank, lessonFilter, pairCount) {
  let pool = zhBank.filter((i) => {
    const w = String(i.word || "").trim();
    return w && [...w].length === 1 && String(i.zhuyin || "").trim();
  });

  if (lessonFilter && lessonFilter !== "全部") {
    pool = pool.filter((i) => i.lesson === lessonFilter);
  }

  const seen = new Set();
  pool = pool.filter((i) => {
    if (seen.has(i.word)) return false;
    seen.add(i.word);
    return true;
  });

  if (pool.length < pairCount) {
    return { ok: false, available: pool.length };
  }

  const picked = shuffle([...pool]).slice(0, pairCount).map((i) => ({
    word: i.word,
    zhuyin: String(i.zhuyin).trim(),
  }));
  return { ok: true, words: picked };
}

function gridCols(cardCount) {
  if (cardCount <= 10) return 5;
  if (cardCount <= 20) return 5;
  if (cardCount <= 30) return 6;
  return 5;
}

function buildCards(words) {
  /** @type {FlipCard[]} */
  const cards = [];
  words.forEach((w, i) => {
    cards.push({
      id: `c-${i}`,
      kind: "char",
      word: w.word,
      face: w.word,
      faceUp: false,
      matched: false,
    });
    cards.push({
      id: `z-${i}`,
      kind: "zhuyin",
      word: w.word,
      face: w.zhuyin,
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

/** 單人記憶全對時，每組剛好翻 2 次 */
function flipMinClicks(pairCount) {
  return pairCount * 2;
}

function renderFirstPicker() {
  const names = deps.getChildNames();
  const aBtn = $("#flip-pick-a");
  const bBtn = $("#flip-pick-b");
  if (aBtn) aBtn.textContent = names.A;
  if (bBtn) bBtn.textContent = names.B;
  $("#flip-first-lesson").textContent = deps.getLessonFilter();
  $("#flip-first-pairs").textContent = String(game?.pairCount ?? getFlipPairCountSetting());
}

function renderPlayHeader() {
  if (!game) return;
  const names = deps.getChildNames();
  const aScore = $("#flip-score-a");
  const bScore = $("#flip-score-b");
  const aName = $("#flip-play-name-a");
  const bName = $("#flip-play-name-b");
  const turn = $("#flip-turn-label");
  const progress = $("#flip-progress-label");
  const firstTagA = $("#flip-first-tag-a");
  const firstTagB = $("#flip-first-tag-b");
  const clickLabel = $("#flip-click-label");

  if (aName) aName.textContent = names.A;
  if (bName) bName.textContent = names.B;
  if (aScore) aScore.textContent = String(game.scores.A);
  if (bScore) bScore.textContent = String(game.scores.B);
  if (turn) turn.textContent = `輪到：${playerName(game.currentPlayerId)}`;
  if (progress) {
    progress.textContent = `配對 ${game.matchedPairs} / ${game.pairCount}`;
  }
  if (clickLabel) {
    const min = flipMinClicks(game.pairCount);
    clickLabel.textContent = `點擊 ${game.totalClicks} 次 · 單人最少 ${min} 次`;
  }

  const aActive = game.currentPlayerId === "A";
  $("#flip-score-block-a")?.classList.toggle("flip-score-active", aActive);
  $("#flip-score-block-b")?.classList.toggle("flip-score-active", !aActive);

  if (firstTagA) firstTagA.hidden = game.firstPlayerId !== "A";
  if (firstTagB) firstTagB.hidden = game.firstPlayerId !== "B";
}

function renderBoard() {
  const grid = $("#flip-card-grid");
  if (!grid || !game) return;

  grid.style.setProperty("--flip-cols", String(gridCols(game.cards.length)));
  grid.dataset.pairs = String(game.pairCount);
  grid.innerHTML = "";

  game.cards.forEach((card, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "flip-card";
    btn.dataset.idx = String(idx);
    btn.disabled = game.locked || card.matched;

    if (card.kind === "zhuyin") {
      btn.dataset.zhRows = String(zhuyinRowCount(card.face));
    }

    if (card.matched) {
      btn.classList.add("flip-card-matched");
      btn.classList.add("flip-card-face-up");
      btn.classList.add(card.kind === "char" ? "flip-card-char" : "flip-card-zhuyin");
      btn.innerHTML = flipCardFaceHtml(card);
    } else if (card.faceUp) {
      btn.classList.add("flip-card-face-up");
      btn.classList.add(card.kind === "char" ? "flip-card-char" : "flip-card-zhuyin");
      btn.innerHTML = flipCardFaceHtml(card);
    } else {
      btn.innerHTML = '<span class="flip-card-back">?</span>';
    }

    btn.addEventListener("click", () => onCardClick(idx));
    grid.appendChild(btn);
  });

  renderPlayHeader();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TONE_CHARS = new Set(["ˊ", "ˇ", "ˋ", "˙", "\u02CA", "\u02C7", "\u02CB", "\u02D9"]);

function isToneChar(ch) {
  return TONE_CHARS.has(ch);
}

/** 拆成直排注音 + 右側聲調（課本寫法：ˊˇˋ˙ 在最後一個音右邊） */
function parseZhuyinVertical(raw) {
  const chars = [...String(raw || "").replace(/\s+/g, "")];
  let tone = "";
  const body = [];
  for (const ch of chars) {
    if (isToneChar(ch)) tone = ch;
    else body.push(ch);
  }
  return { body, tone };
}

function zhuyinRowCount(zhuyin) {
  const { body } = parseZhuyinVertical(String(zhuyin || ""));
  return Math.max(1, body.length);
}

/** 注音直排：左欄音節上下排，右欄聲調對齊最後一音（課本寫法） */
function zhuyinVerticalHtml(zhuyin) {
  const raw = String(zhuyin || "").trim().replace(/\s+/g, "");
  if (!raw) return "";

  const { body, tone } = parseZhuyinVertical(raw);
  if (!body.length) {
    return `<span class="zhuyin-vertical" aria-label="${escapeHtml(raw)}">${escapeHtml(raw)}</span>`;
  }

  const letters = body
    .map((ch) => `<span class="zhuyin-letter">${escapeHtml(ch)}</span>`)
    .join("");

  const toneHtml = tone
    ? `<span class="zhuyin-tone-side">${escapeHtml(tone)}</span>`
    : "";

  return (
    `<span class="zhuyin-vertical${tone ? " has-tone" : ""}" aria-label="${escapeHtml(raw)}">` +
    `<span class="zhuyin-stack">` +
    `<span class="zhuyin-letters">${letters}</span>` +
    toneHtml +
    `</span></span>`
  );
}

function flipCardFaceHtml(card) {
  if (card.kind === "zhuyin") {
    return `<span class="flip-card-inner">${zhuyinVerticalHtml(card.face)}</span>`;
  }
  return `<span class="flip-card-inner">${escapeHtml(card.face)}</span>`;
}

function cardsMatch(a, b) {
  return a.word === b.word && a.kind !== b.kind;
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
    game.currentPlayerId = game.currentPlayerId === "A" ? "B" : "A";
    game.locked = false;
    renderBoard();
  }, MISMATCH_MS);
}

function showFlipResult() {
  if (!game) return;
  const names = deps.getChildNames();
  const a = game.scores.A;
  const b = game.scores.B;
  const title = $("#flip-result-title");
  const detail = $("#flip-result-detail");
  const scoreLine = $("#flip-result-scores");
  const clickLine = $("#flip-result-clicks");

  if (scoreLine) scoreLine.textContent = `${names.A} ${a} ：${b} ${names.B}`;

  const min = flipMinClicks(game.pairCount);
  if (clickLine) {
    const extra = game.totalClicks - min;
    clickLine.textContent =
      extra > 0
        ? `本局共點擊 ${game.totalClicks} 次（比單人最少多 ${extra} 次）`
        : `本局共點擊 ${game.totalClicks} 次 · 達到單人最少！`;
  }

  if (a > b) {
    if (title) title.textContent = `${names.A} 獲勝！`;
  } else if (b > a) {
    if (title) title.textContent = `${names.B} 獲勝！`;
  } else if (title) title.textContent = "平手！";

  if (detail) {
    detail.textContent = `共 ${game.pairCount} 組 · 課次：${deps.getLessonFilter()}`;
  }

  deps.showView("flipResult");
}

function startGameWithFirstPlayer(firstPlayerId) {
  if (!game?.words) return;
  game.firstPlayerId = firstPlayerId;
  game.currentPlayerId = firstPlayerId;
  game.cards = buildCards(game.words);
  game.scores = { A: 0, B: 0 };
  game.flippedIdx = [];
  game.locked = false;
  game.matchedPairs = 0;
  game.totalClicks = 0;
  deps.showView("flipPlay");
  renderBoard();
}

export function beginFlipFromHome() {
  const pairCount = getFlipPairCountSetting();
  const zhBank = deps.getZhBank();
  const lessonFilter = deps.getLessonFilter();
  const result = pickFlipWords(zhBank, lessonFilter, pairCount);

  if (!zhBank.length) {
    deps.showWarn("題庫尚未載入", "請稍候或檢查網路後再試");
    return;
  }

  if (!result.ok) {
    const lesson = lessonFilter === "全部" ? "全部課次" : lessonFilter;
    deps.showWarn(
      "單字不夠開局",
      `${lesson} 目前只有 ${result.available} 個不重複單字，請改選較少組數、改課次，或選全部課次。`
    );
    return;
  }

  game = {
    words: result.words,
    cards: [],
    scores: { A: 0, B: 0 },
    firstPlayerId: "A",
    currentPlayerId: "A",
    flippedIdx: [],
    locked: false,
    matchedPairs: 0,
    pairCount,
    totalClicks: 0,
  };

  renderFirstPicker();
  deps.showView("flipFirst");
}

export function replayFlipGame() {
  if (!game?.words) {
    beginFlipFromHome();
    return;
  }
  game.pairCount = game.words.length;
  renderFirstPicker();
  deps.showView("flipFirst");
}

export function bindFlipEvents() {
  $("#btn-start-flip-zh")?.addEventListener("click", (e) => {
    e.preventDefault();
    beginFlipFromHome();
  });

  $("#flip-pick-a")?.addEventListener("click", () => startGameWithFirstPlayer("A"));
  $("#flip-pick-b")?.addEventListener("click", () => startGameWithFirstPlayer("B"));

  $("#btn-flip-first-back")?.addEventListener("click", () => deps.showView("setupZh"));
  $("#btn-flip-play-back")?.addEventListener("click", () => {
    if (confirm("離開對戰？目前進度不會儲存。")) deps.showView("setupZh");
  });
  $("#btn-flip-replay")?.addEventListener("click", () => {
    const pairCount = getFlipPairCountSetting();
    const result = pickFlipWords(deps.getZhBank(), deps.getLessonFilter(), pairCount);
    if (!result.ok) {
      deps.showWarn("無法再玩一局", "請回首頁調整課次或組數");
      return;
    }
    game = {
      words: result.words,
      cards: [],
      scores: { A: 0, B: 0 },
      firstPlayerId: "A",
      currentPlayerId: "A",
      flippedIdx: [],
      locked: false,
      matchedPairs: 0,
      pairCount,
      totalClicks: 0,
    };
    renderFirstPicker();
    deps.showView("flipFirst");
  });
  $("#btn-flip-home")?.addEventListener("click", () => deps.showView("setupZh"));
}

/**
 * @param {FlipDeps} d
 */
export function initFlipZh(d) {
  deps = d;
  initFlipPairCountPicker();
  renderFlipHomePlayers();
  bindFlipEvents();
}
