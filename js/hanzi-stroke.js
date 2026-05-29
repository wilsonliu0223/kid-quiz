import { CONFIG } from "./config.site.js";
import { normalizeAnswer } from "./ocr.js";

const HANZI_LOOKUP_URL =
  "https://cdn.jsdelivr.net/npm/hanzilookup-js@1.0.3/dist/hanzilookup.esm.js";

let loadPromise = null;
let ready = false;
let MatcherClass = null;
let AnalyzedCharacterClass = null;
let matcher = null;

function getDataUrl() {
  return (
    CONFIG.HANZI_STROKE_DATA_URL ||
    "https://raw.githubusercontent.com/gugray/HanziLookupJS/master/dist/mmah.json"
  );
}

export function isHanziStrokeReady() {
  return ready;
}

/** 首次約需下載字庫（數 MB），背景載入 */
export function ensureHanziStrokeReady() {
  if (CONFIG.HANZI_STROKE_ENABLED === false) {
    return Promise.resolve(false);
  }
  if (ready) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const mod = await import(HANZI_LOOKUP_URL);
      MatcherClass = mod.Matcher;
      AnalyzedCharacterClass = mod.AnalyzedCharacter;
      const ok = await new Promise((resolve) => {
        mod.init("mmah", getDataUrl(), (success) => resolve(!!success));
      });
      if (!ok) {
        console.warn("hanzi stroke data load failed");
        return false;
      }
      matcher = new MatcherClass("mmah");
      ready = true;
      return true;
    } catch (err) {
      console.warn("hanzi stroke init failed", err);
      return false;
    }
  })();

  return loadPromise;
}

export function recognizeStrokes(rawStrokes, limit = 8) {
  return new Promise((resolve) => {
    if (!ready || !matcher || !AnalyzedCharacterClass || !rawStrokes?.length) {
      resolve([]);
      return;
    }
    try {
      const char = new AnalyzedCharacterClass(rawStrokes);
      matcher.match(char, limit, (matches) => {
        resolve(Array.isArray(matches) ? matches : []);
      });
    } catch (err) {
      console.warn("stroke match failed", err);
      resolve([]);
    }
  });
}

/** 筆畫候選前 N 名是否含標準答案（寫對但 OCR 猜錯時仍可信） */
export function strokeAnswerInMatches(matches, expected, topN = 5) {
  const exp = normalizeAnswer(expected);
  if (!exp || !matches?.length) return false;
  return matches.slice(0, topN).some((m) => normalizeAnswer(m.character) === exp);
}

/** 從筆畫候選挑字（僅在候選中出現才回傳，避免亂猜第一候選） */
export function pickStrokeAnswer(matches, expected) {
  const exp = normalizeAnswer(expected);
  if (!exp || !matches?.length) return "";

  for (const m of matches) {
    const c = normalizeAnswer(m.character);
    if (c === exp) return c;
  }

  if ([...exp].length > 1) {
    for (const m of matches) {
      const c = normalizeAnswer(m.character);
      if (c && exp.includes(c)) return c;
    }
  }

  return "";
}

export function shouldUseStrokeRecognition(word) {
  if (CONFIG.HANZI_STROKE_ENABLED === false) return false;
  const w = String(word ?? "").trim();
  if (!w) return false;
  return [...w].length <= 2;
}
