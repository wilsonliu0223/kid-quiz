import { CONFIG } from "./config.site.js";
import { ensurePaddleOcr, predictHandwriting } from "./paddle-ocr.js";
import { prepareHandwritingImage } from "./ocr.js";

const FW_DIGITS = "０１２３４５６７８９";
const CN_DIGIT = {
  零: "0",
  〇: "0",
  ○: "0",
  一: "1",
  二: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
};
const LETTER_DIGIT = {
  O: "0",
  o: "0",
  Q: "0",
  l: "1",
  I: "1",
  i: "1",
  "|": "1",
  Z: "2",
  z: "2",
  S: "5",
  s: "5",
  G: "6",
  b: "6",
  T: "7",
  B: "8",
};

/** 寬鬆 OCR 偵測門檻（單一手寫數字常偵測不到） */
const NUMERIC_PREDICT_PARAMS = {
  textDetThresh: 0.2,
  textDetBoxThresh: 0.25,
  textDetUnclipRatio: 2.2,
  textRecScoreThresh: 0.08,
};

/** 將 OCR 文字轉成純阿拉伯數字 */
export function normalizeNumericText(s) {
  let out = "";
  for (const ch of String(s ?? "")) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    const fw = FW_DIGITS.indexOf(ch);
    if (fw >= 0) {
      out += String(fw);
      continue;
    }
    if (CN_DIGIT[ch] != null) {
      out += CN_DIGIT[ch];
      continue;
    }
    if (LETTER_DIGIT[ch] != null) {
      out += LETTER_DIGIT[ch];
    }
  }
  return out;
}

export function numericAnswerMatch(recognized, expected) {
  const exp = String(expected);
  const digits = normalizeNumericText(recognized);
  if (!digits) return false;
  if (digits === exp) return true;
  if (exp.length === 1 && digits.includes(exp)) return true;
  if (exp.length > 1 && digits.endsWith(exp)) return true;
  return false;
}

function itemMinX(item) {
  const poly = item?.poly;
  if (!Array.isArray(poly) || !poly.length) return 0;
  let minX = Infinity;
  for (const p of poly) {
    minX = Math.min(minX, Number(p?.[0] ?? 0));
  }
  return Number.isFinite(minX) ? minX : 0;
}

/** 從 Paddle 結果收集數字候選（含中文數字、全形數字） */
function collectNumericCandidates(result) {
  if (!result?.items?.length) return [];

  const byScore = [...result.items].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );
  const byX = [...result.items].sort((a, b) => itemMinX(a) - itemMinX(b));
  const candidates = [];
  const seen = new Set();

  function push(digits, score, source) {
    if (!digits || seen.has(`${digits}:${source}`)) return;
    seen.add(`${digits}:${source}`);
    candidates.push({ digits, score: score ?? 0, source });
  }

  for (const item of byScore) {
    push(normalizeNumericText(item.text), item.score, "item");
    const raw = String(item.text ?? "").trim();
    if (raw.length === 1 && CN_DIGIT[raw] != null) {
      push(CN_DIGIT[raw], item.score, "cn");
    }
  }

  const joined = normalizeNumericText(
    byX.map((item) => String(item.text ?? "")).join("")
  );
  if (joined) {
    const avg =
      byX.reduce((sum, item) => sum + (item.score ?? 0), 0) /
      Math.max(byX.length, 1);
    push(joined, avg, "join");
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function pickBestNumeric(candidates, expected) {
  const exp = String(expected);
  if (!candidates.length) return "";

  const exact = candidates.find((c) => c.digits === exp);
  if (exact) return exact.digits;

  if (exp.length === 1) {
    const single = candidates.find((c) => c.digits.length === 1);
    if (single) return single.digits;
    const contains = candidates.find((c) => c.digits.includes(exp));
    if (contains) return contains.digits;
  }

  const partial = candidates.find(
    (c) => c.digits.endsWith(exp) || c.digits.startsWith(exp)
  );
  if (partial) return partial.digits;

  return candidates[0]?.digits ?? "";
}

/**
 * 九九乘法用手寫數字辨識（較寬鬆的偵測與中文數字對照）
 * @param {HTMLCanvasElement} canvas
 * @param {{ expected?: string | number }} options
 */
export async function recognizeNumericCanvas(canvas, options = {}) {
  if (!CONFIG.OCR_ENABLED) {
    return { text: "", skipped: true };
  }

  const expected = String(options.expected ?? "");

  try {
    await ensurePaddleOcr();

    const prepared =
      CONFIG.OCR_PREPROCESS !== false
        ? prepareHandwritingImage(canvas, expected) || canvas
        : canvas;

    const images = prepared === canvas ? [canvas] : [prepared, canvas];
    let best = "";
    let raw = "";
    const paramSets = [NUMERIC_PREDICT_PARAMS, {
      textDetThresh: 0.12,
      textDetBoxThresh: 0.18,
      textDetUnclipRatio: 2.8,
      textRecScoreThresh: 0.05,
    }];

    for (const img of images) {
      for (const params of paramSets) {
        const result = await predictHandwriting(img, params);
        if (!result?.items?.length) continue;

        const topText = [...result.items]
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .map((item) => String(item.text ?? ""))
          .filter(Boolean)
          .join("");
        if (topText && !raw) raw = topText;

        const candidates = collectNumericCandidates(result);
        const picked = pickBestNumeric(candidates, expected);
        if (picked) {
          best = picked;
          break;
        }
      }
      if (best) break;
    }

    if (!best && raw) {
      best = normalizeNumericText(raw);
    }

    return { text: best, skipped: false, raw };
  } catch (err) {
    console.warn("Numeric OCR failed", err);
    return { text: "", error: true };
  }
}
