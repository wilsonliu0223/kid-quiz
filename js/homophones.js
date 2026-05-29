/** 依注音從題庫找同音字／詞，組成四選一 */

import { getStrokeTrustTopN } from "./stroke-lenient.js";

export function normalizeZhuyinKey(zhuyin) {
  return String(zhuyin ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 去掉聲調，同音範圍較大（天／田等） */
export function zhuyinBaseKey(zhuyin) {
  return normalizeZhuyinKey(zhuyin).replace(/[ˊˋˇ˙]/g, "");
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueWords(items) {
  const seen = new Set();
  const out = [];
  for (const w of items) {
    const word = String(w ?? "").trim();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

function wordsFromBank(bank, matchFn) {
  return uniqueWords(
    (bank || [])
      .filter((item) => matchFn(item))
      .map((item) => item.word)
  );
}

function pickRandom(arr, n, exclude = new Set()) {
  const pool = arr.filter((x) => !exclude.has(x));
  return shuffleArray(pool).slice(0, n);
}

/**
 * @returns {string[]} 含正確答案在內、最多 4 個同音選項（不足則回傳較少）
 */
export function buildHomophoneChoices(expected, zhuyin, bank, count = 4) {
  const answer = String(expected ?? "").trim();
  if (!answer) return [];

  const exactKey = normalizeZhuyinKey(zhuyin);
  const baseKey = zhuyinBaseKey(zhuyin);
  const answerLen = [...answer].length;

  let pool = wordsFromBank(
    bank,
    (item) => normalizeZhuyinKey(item.zhuyin) === exactKey
  );

  if (pool.length < count) {
    const basePool = wordsFromBank(
      bank,
      (item) => zhuyinBaseKey(item.zhuyin) === baseKey
    );
    pool = uniqueWords([...pool, ...basePool]);
  }

  if (pool.length < count) {
    const sameLen = wordsFromBank(
      bank,
      (item) => [...String(item.word)].length === answerLen
    );
    pool = uniqueWords([...pool, ...sameLen]);
  }

  if (!pool.includes(answer)) pool.unshift(answer);

  const distractors = pool.filter((w) => w !== answer);
  const need = Math.min(count - 1, distractors.length);
  const picked = pickRandom(distractors, need);
  const choices = shuffleArray([answer, ...picked]);

  return choices.slice(0, count);
}

function cleanText(s) {
  return String(s ?? "")
    .replace(/\s/g, "")
    .trim();
}

function homophonePool(expected, zhuyin, bank, count = 12) {
  return buildHomophoneChoices(expected, zhuyin, bank, count);
}

/** 是否為「同音易混」範圍（才值得四選一） */
export function isHomophoneSimilar(char, expected, zhuyin, bank) {
  const c = cleanText(char);
  const answer = cleanText(expected);
  if (!c || !answer) return false;
  if (c === answer) return true;
  return homophonePool(answer, zhuyin, bank).includes(c);
}

function strokeCandidates(strokeMatches) {
  return (strokeMatches || [])
    .map((m) => cleanText(m.character))
    .filter(Boolean);
}

/**
 * 國語答題判定：homophone → 四選一；wrong → 直接記錯（進錯題本）
 * @returns {{ type: 'correct'|'homophone'|'wrong', recognized: string }}
 */
export function classifyZhAnswer(expected, zhuyin, bank, { recognized, strokeMatches }) {
  const answer = cleanText(expected);
  const rec = cleanText(recognized);
  const ansLen = [...answer].length;
  const pool = homophonePool(answer, zhuyin, bank);
  const strokes = strokeCandidates(strokeMatches);
  const strokeTop = strokes[0] || "";
  const trustTop = getStrokeTrustTopN(answer);

  /** 筆畫候選含正確答案 → 視為寫對（優先於 OCR 猜錯） */
  if (strokes.slice(0, trustTop).includes(answer)) {
    return { type: "correct", recognized: answer };
  }

  if (rec && [...rec].length !== ansLen) {
    return { type: "wrong", recognized: rec };
  }

  /** 筆畫辨識：最像的字明顯不是答案、也不是同音易混 → 直接算錯 */
  if (strokeTop && strokeTop !== answer && !pool.includes(strokeTop)) {
    return { type: "wrong", recognized: rec || strokeTop };
  }

  /** 圖像／綜合辨識：很像別的字（非同音）→ 直接算錯 */
  if (rec && rec !== answer && !pool.includes(rec)) {
    return { type: "wrong", recognized: rec };
  }

  /** 辨成同音易混字，或筆畫最像同音字 → 四選一 */
  if (rec && rec !== answer && pool.includes(rec)) {
    return { type: "homophone", recognized: rec };
  }

  if (
    strokeTop &&
    strokeTop !== answer &&
    pool.includes(strokeTop)
  ) {
    return { type: "homophone", recognized: rec || strokeTop };
  }

  /** 寫對了但 OCR 沒對上；或都辨不出 → 依注音四選一（不算直接答錯） */
  if (!rec || rec === answer) {
    return { type: "homophone", recognized: rec || strokeTop };
  }

  return { type: "wrong", recognized: rec || strokeTop || "—" };
}
