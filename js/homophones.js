/** 依注音從題庫找同音字／詞，組成四選一 */

import { answersMatch } from "./ocr.js";

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

/**
 * 是否適合出同音四選一（寫成別的字、但可能是同音混淆時才出）
 * @param {string} recognized 辨識結果（可能為空）
 */
export function shouldOfferHomophonePicker(expected, recognized, zhuyin, bank) {
  const answer = String(expected ?? "").trim();
  if (!answer) return false;

  const rec = String(recognized ?? "")
    .replace(/\s/g, "")
    .trim();

  /** 辨識不出字：仍可依注音四選一 */
  if (!rec) return true;

  if (answersMatch(rec, answer)) return false;

  const answerLen = [...answer].length;
  const recLen = [...rec].length;
  if (recLen !== answerLen) return false;

  const choices = buildHomophoneChoices(answer, zhuyin, bank, 8);
  if (!choices.includes(rec)) return false;

  const expBase = zhuyinBaseKey(zhuyin);
  const item = (bank || []).find((row) => String(row.word) === rec);
  if (item?.zhuyin) {
    const recBase = zhuyinBaseKey(item.zhuyin);
    if (expBase && recBase && recBase !== expBase) return false;
  }

  return true;
}
