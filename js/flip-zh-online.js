import { pickFlipWords, getFlipPairCountSetting, clearLocalFlipGame } from "./flip-zh.js?v=duo-active-v1";
import {
  registerOnlineGame,
  getOnlineContext,
  leaveOnlineRoom,
  openDuoModePicker,
} from "./online-duo.js?v=duo-online-v5";
import { startGameRoom, transactGameState, asFirebaseList } from "./room-service.js";

/** @typedef {'host' | 'guest'} RoomSlot */

/** @type {object | null} */
let onlineState = null;

/** @type {{ host: string, guest: string } | null} */
let names = null;

const $ = (sel) => document.querySelector(sel);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildCards(words) {
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

function otherSlot(slot) {
  return slot === "host" ? "guest" : "host";
}

function slotLabel(slot, snap) {
  const p = snap?.players?.[slot];
  return p?.name || (slot === "host" ? "房主" : "來賓");
}

function renderSlotStartButtons(panel, snap, onPick) {
  ["host", "guest"].forEach((slot) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary gomoku-lobby-black-btn";
    btn.dataset.slot = slot;
    btn.textContent = `${slotLabel(slot, snap)} 先手`;
    btn.addEventListener("click", () => onPick(/** @type {RoomSlot} */ (slot)));
    panel.appendChild(btn);
  });
}

function createInitialFlipState(words, pairCount, firstSlot) {
  return {
    words,
    pairCount,
    cards: buildCards(words),
    scores: { host: 0, guest: 0 },
    firstPlayerId: firstSlot,
    currentPlayerId: firstSlot,
    flippedIdx: [],
    locked: false,
    matchedPairs: 0,
    totalClicks: 0,
    over: false,
    lessonFilter: "",
  };
}

async function startFlipZhGame(roomId, firstSlot, snap) {
  const config = snap.meta?.config || {};
  const pairCount = config.pairCount || getFlipPairCountSetting();
  const lessonFilter = config.lessonFilter || "全部";
  const ctx = getOnlineContext();
  const getZhBank = ctx.deps?.getZhBank;
  const zhBank = typeof getZhBank === "function" ? getZhBank() : [];
  const result = pickFlipWords(zhBank, lessonFilter, pairCount);
  if (!result.ok) {
    alert(`無法開局：字庫不足（需要 ${pairCount} 組）`);
    return;
  }
  const state = createInitialFlipState(result.words, pairCount, firstSlot);
  state.lessonFilter = lessonFilter;
  await startGameRoom(roomId, state);
}

function nameOf(slot) {
  return names?.[slot] || (slot === "host" ? "房主" : "來賓");
}

function gridCols(cardCount) {
  if (cardCount <= 20) return 5;
  if (cardCount <= 30) return 6;
  return 5;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TONE_CHARS = new Set(["ˊ", "ˇ", "ˋ", "˙", "\u02CA", "\u02C7", "\u02CB", "\u02D9"]);

function parseZhuyinVertical(raw) {
  const chars = [...String(raw || "").replace(/\s+/g, "")];
  let tone = "";
  const body = [];
  for (const ch of chars) {
    if (TONE_CHARS.has(ch)) tone = ch;
    else body.push(ch);
  }
  return { body, tone };
}

function zhuyinVerticalHtml(zhuyin) {
  const raw = String(zhuyin || "").trim().replace(/\s+/g, "");
  if (!raw) return "";
  const { body, tone } = parseZhuyinVertical(raw);
  if (!body.length) return escapeHtml(raw);
  const letters = body.map((ch) => `<span class="zhuyin-letter">${escapeHtml(ch)}</span>`).join("");
  const toneHtml = tone ? `<span class="zhuyin-tone-side">${escapeHtml(tone)}</span>` : "";
  return `<span class="zhuyin-vertical${tone ? " has-tone" : ""}"><span class="zhuyin-stack"><span class="zhuyin-letters">${letters}</span>${toneHtml}</span></span>`;
}

function flipCardFaceHtml(card) {
  if (card.kind === "zhuyin") {
    return `<span class="flip-card-inner">${zhuyinVerticalHtml(card.face)}</span>`;
  }
  return `<span class="flip-card-inner">${escapeHtml(card.face)}</span>`;
}

function renderPlayHeader() {
  if (!onlineState) return;
  const ctx = getOnlineContext();
  if ($("#flip-play-name-a")) $("#flip-play-name-a").textContent = nameOf("host");
  if ($("#flip-play-name-b")) $("#flip-play-name-b").textContent = nameOf("guest");
  if ($("#flip-score-a")) $("#flip-score-a").textContent = String(onlineState.scores.host ?? 0);
  if ($("#flip-score-b")) $("#flip-score-b").textContent = String(onlineState.scores.guest ?? 0);
  if ($("#flip-turn-label")) {
    const me = ctx.slot === onlineState.currentPlayerId;
    $("#flip-turn-label").textContent = `輪到：${nameOf(onlineState.currentPlayerId)}${me ? "（你）" : ""}`;
  }
  if ($("#flip-progress-label")) {
    $("#flip-progress-label").textContent = `配對 ${onlineState.matchedPairs} / ${onlineState.pairCount}`;
  }
  if ($("#flip-click-label")) {
    $("#flip-click-label").textContent = `點擊 ${onlineState.totalClicks} 次`;
  }
  $("#flip-score-block-a")?.classList.toggle("flip-score-active", onlineState.currentPlayerId === "host");
  $("#flip-score-block-b")?.classList.toggle("flip-score-active", onlineState.currentPlayerId === "guest");
  if ($("#flip-first-tag-a")) $("#flip-first-tag-a").hidden = onlineState.firstPlayerId !== "host";
  if ($("#flip-first-tag-b")) $("#flip-first-tag-b").hidden = onlineState.firstPlayerId !== "guest";
}

function normalizeFlipState(state) {
  if (!state || typeof state !== "object") return state;
  return {
    ...state,
    cards: asFirebaseList(state.cards),
    flippedIdx: asFirebaseList(state.flippedIdx).map((n) => Number(n)),
  };
}

let onlineGridBound = false;

function ensureOnlineGridClick() {
  const grid = $("#flip-card-grid");
  if (!grid || onlineGridBound) return;
  onlineGridBound = true;
  grid.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest(".flip-card") : null;
    if (!btn || /** @type {HTMLButtonElement} */ (btn).disabled) return;
    const ctx = getOnlineContext();
    if (!ctx.roomId || !ctx.slot || !onlineState || onlineState.over || onlineState.locked) return;
    if (ctx.slot !== onlineState.currentPlayerId) return;
    const idx = Number(btn.dataset.idx);
    if (!Number.isFinite(idx)) return;
    const card = onlineState.cards[idx];
    if (!card || card.matched || card.faceUp) return;
    void onOnlineCardClick(idx);
  });
}

function renderBoard() {
  const grid = $("#flip-card-grid");
  if (!grid || !onlineState) return;
  grid.style.setProperty("--flip-cols", String(gridCols(onlineState.cards.length)));
  grid.dataset.pairs = String(onlineState.pairCount);
  grid.innerHTML = "";

  const ctx = getOnlineContext();
  const myTurn =
    ctx.slot === onlineState.currentPlayerId && !onlineState.over && !onlineState.locked;

  onlineState.cards.forEach((card, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "flip-card";
    btn.dataset.idx = String(idx);
    btn.disabled = !myTurn || card.matched || onlineState.locked;

    if (card.matched) {
      btn.classList.add("flip-card-matched", "flip-card-face-up");
      btn.classList.add(card.kind === "char" ? "flip-card-char" : "flip-card-zhuyin");
      btn.innerHTML = flipCardFaceHtml(card);
    } else if (card.faceUp) {
      btn.classList.add("flip-card-face-up");
      btn.classList.add(card.kind === "char" ? "flip-card-char" : "flip-card-zhuyin");
      btn.innerHTML = flipCardFaceHtml(card);
    } else {
      btn.innerHTML = '<span class="flip-card-back">?</span>';
    }

    grid.appendChild(btn);
  });

  renderPlayHeader();
}

function cardsMatch(a, b) {
  return a.word === b.word && a.kind !== b.kind;
}

const MISMATCH_MS = 900;

/** @type {ReturnType<typeof setTimeout> | null} */
let mismatchTimer = null;

function clearMismatchTimer() {
  if (mismatchTimer) {
    clearTimeout(mismatchTimer);
    mismatchTimer = null;
  }
}

function isPendingMismatch(state) {
  if (!state?.locked || state.flippedIdx?.length !== 2) return false;
  const [i0, i1] = state.flippedIdx;
  const c0 = state.cards[i0];
  const c1 = state.cards[i1];
  if (!c0 || !c1 || c0.matched || c1.matched) return false;
  return !cardsMatch(c0, c1);
}

function maybeScheduleMismatchReveal(state, ctx) {
  clearMismatchTimer();
  if (!isPendingMismatch(state)) return;
  if (ctx.slot !== state.currentPlayerId) return;
  mismatchTimer = setTimeout(() => {
    mismatchTimer = null;
    void resolveMismatchFlip();
  }, MISMATCH_MS);
}

async function resolveMismatchFlip() {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot) return;
  try {
    const next = await transactGameState(ctx.roomId, (raw) => {
      const current = normalizeFlipState(raw);
      if (!isPendingMismatch(current)) return;
      const [i0, i1] = current.flippedIdx;
      const cards = asFirebaseList(current.cards).map((c) => ({ ...c }));
      if (cards[i0]) cards[i0].faceUp = false;
      if (cards[i1]) cards[i1].faceUp = false;
      return {
        ...current,
        cards,
        flippedIdx: [],
        locked: false,
        currentPlayerId: otherSlot(current.currentPlayerId),
      };
    });
    if (next) {
      onlineState = normalizeFlipState(next);
      renderBoard();
    }
  } catch (err) {
    console.error("flip-zh mismatch resolve failed", err);
  }
}

function applyRemoteState(state, snap) {
  ensureOnlineGridClick();
  onlineState = normalizeFlipState(state);
  names = {
    host: snap.players.host?.name || "房主",
    guest: snap.players.guest?.name || "來賓",
  };
  renderBoard();
  maybeScheduleMismatchReveal(onlineState, getOnlineContext());
  if (onlineState?.over) showOnlineResult();
}

function enterPlay(snap) {
  clearLocalFlipGame();
  getOnlineContext().deps?.showView("flipPlay");
  applyRemoteState(snap.state, snap);
}

async function onOnlineCardClick(idx) {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot || !onlineState || onlineState.over) return;

  try {
    const next = await transactGameState(ctx.roomId, (raw) => {
      const current = normalizeFlipState(raw);
      if (!current || current.over || current.locked) return;
      if (current.currentPlayerId !== ctx.slot) return;
      const cards = asFirebaseList(current.cards).map((c) => ({ ...c }));
      const card = cards[idx];
      if (!card || card.matched || card.faceUp) return;
      if (current.flippedIdx.length >= 2) return;

      card.faceUp = true;
      const flippedIdx = [...current.flippedIdx, idx];
      const totalClicks = current.totalClicks + 1;

      if (flippedIdx.length < 2) {
        return { ...current, cards, flippedIdx, totalClicks };
      }

      const [i0, i1] = flippedIdx;
      const c0 = cards[i0];
      const c1 = cards[i1];

      if (cardsMatch(c0, c1)) {
        c0.matched = true;
        c1.matched = true;
        const scores = { ...current.scores };
        scores[ctx.slot] = (scores[ctx.slot] || 0) + 1;
        const matchedPairs = current.matchedPairs + 1;
        return {
          ...current,
          cards,
          flippedIdx: [],
          locked: false,
          scores,
          matchedPairs,
          totalClicks,
          over: matchedPairs >= current.pairCount,
        };
      }

      c0.faceUp = true;
      c1.faceUp = true;
      return {
        ...current,
        cards,
        flippedIdx,
        locked: true,
        totalClicks,
      };
    });

    if (next) {
      onlineState = normalizeFlipState(next);
      renderBoard();
      maybeScheduleMismatchReveal(onlineState, ctx);
      if (onlineState.over) showOnlineResult();
    }
  } catch (err) {
    console.error("flip-zh online click failed", err);
    alert("翻牌失敗，請再試一次");
  }
}

function showOnlineResult() {
  if (!onlineState) return;
  const ctx = getOnlineContext();
  const a = onlineState.scores.host ?? 0;
  const b = onlineState.scores.guest ?? 0;

  if ($("#flip-result-scores")) {
    $("#flip-result-scores").textContent = `${nameOf("host")} ${a} ：${b} ${nameOf("guest")}`;
  }
  if ($("#flip-result-clicks")) {
    $("#flip-result-clicks").textContent = `本局共點擊 ${onlineState.totalClicks} 次`;
  }

  const title = $("#flip-result-title");
  if (a > b) {
    if (title) title.textContent = ctx.slot === "host" ? "你贏了！" : `${nameOf("host")} 獲勝！`;
  } else if (b > a) {
    if (title) title.textContent = ctx.slot === "guest" ? "你贏了！" : `${nameOf("guest")} 獲勝！`;
  } else if (title) title.textContent = "平手！";

  if ($("#flip-result-detail")) {
    $("#flip-result-detail").textContent = `共 ${onlineState.pairCount} 組 · 線上對戰`;
  }
  ctx.deps?.showView("flipResult");
}

registerOnlineGame("flip-zh", {
  startHint: "請選誰先翻牌",
  renderStartButtons: renderSlotStartButtons,
  startGame: startFlipZhGame,
  onPlaying(snap) {
    const onPlay = $("#view-flip-play")?.classList.contains("view-active");
    const onResult = $("#view-flip-result")?.classList.contains("view-active");
    if (!onPlay && !onResult) enterPlay(snap);
    else applyRemoteState(snap.state, snap);
  },
});

export function openFlipZhDuoMode(localStart) {
  const ctx = getOnlineContext();
  const lessonFilter =
    typeof ctx.deps?.getLessonFilter === "function" ? ctx.deps.getLessonFilter() : "全部";
  openDuoModePicker({
    game: "flip-zh",
    title: "國語翻字對戰",
    backView: "setupZh",
    localStart,
    config: { lessonFilter, pairCount: getFlipPairCountSetting() },
  });
}
