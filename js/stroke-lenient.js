import { CONFIG } from "./config.site.js";

/** 筆畫候選要信任到第幾名（「要」等難字用較大值） */
export function getStrokeTrustTopN(expectedWord) {
  const w = String(expectedWord ?? "").trim();
  const extra = CONFIG.STROKE_EXTRA_LENIENT_CHARS || [];
  if (w && extra.includes(w)) {
    return CONFIG.STROKE_EXTRA_LENIENT_TOP_N ?? 12;
  }
  return CONFIG.STROKE_TRUST_TOP_N ?? 8;
}

export function isLenientChar(expectedWord) {
  const w = String(expectedWord ?? "").trim();
  return (CONFIG.STROKE_EXTRA_LENIENT_CHARS || []).includes(w);
}

export function getOcrMinSide(expectedWord) {
  const w = String(expectedWord ?? "").trim();
  if (/^\d+$/.test(w)) {
    const base = CONFIG.OCR_NUMERIC_MIN_SIDE ?? 380;
    if (w.length <= 1) {
      return Math.max(base, CONFIG.OCR_NUMERIC_SINGLE_MIN_SIDE ?? 460);
    }
    return base;
  }
  const base = CONFIG.OCR_MIN_SIDE ?? 280;
  if (!isLenientChar(expectedWord)) return base;
  return Math.max(base, CONFIG.OCR_LENIENT_MIN_SIDE ?? 340);
}

/** 單字是否跳過 OCR 白名單（避免把辨識結果洗成空白） */
export function shouldSkipOcrWhitelist(expectedWord) {
  if (CONFIG.OCR_USE_WHITELIST === false) return true;
  if (CONFIG.OCR_WHITELIST_SINGLE_CHAR === false) {
    return [...String(expectedWord ?? "").trim()].length === 1;
  }
  return false;
}
