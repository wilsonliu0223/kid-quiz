import { CONFIG } from "./config.site.js";
import { recognizeCanvas, answersMatch, normalizeAnswer } from "./ocr.js";
import {
  ensureHanziStrokeReady,
  recognizeStrokes,
  pickStrokeAnswer,
  strokeAnswerInMatches,
  shouldUseStrokeRecognition,
} from "./hanzi-stroke.js";
import { getStrokeTrustTopN } from "./stroke-lenient.js";

/**
 * 國語手寫辨識（全開源、不需 API Key）
 * ① hanzilookup 筆畫 ② PaddleOCR.js 圖像 → 失敗則同音四選一
 */
export async function recognizeZhHandwriting({
  canvas,
  strokes,
  expected,
  onStatus,
}) {
  const tries = [];
  let lastText = "";
  let strokeMatches = [];

  if (shouldUseStrokeRecognition(expected) && strokes?.length) {
    onStatus?.("筆畫辨識中…");
    const loaded = await ensureHanziStrokeReady();
    if (loaded) {
      const matches = await recognizeStrokes(strokes, 10);
      strokeMatches = matches;
      const topN = getStrokeTrustTopN(expected);

      if (strokeAnswerInMatches(matches, expected, topN)) {
        const text = normalizeAnswer(expected);
        return {
          matched: true,
          text,
          method: "stroke",
          tries: [{ method: "stroke", text }],
          strokeMatches,
        };
      }

      const text = pickStrokeAnswer(matches, expected);
      if (text) {
        lastText = text;
        tries.push({ method: "stroke", text });
        if (answersMatch(text, expected)) {
          return {
            matched: true,
            text,
            method: "stroke",
            tries,
            strokeMatches,
          };
        }
      }
    }
  }

  if (CONFIG.OCR_ENABLED) {
    onStatus?.("圖像辨識中…");
    const { text, skipped, error } = await recognizeCanvas(canvas, { expected });
    if (!skipped && !error && text) {
      lastText = text;
      tries.push({ method: "paddle", text });
      if (answersMatch(text, expected)) {
        return {
          matched: true,
          text,
          method: "paddle",
          tries,
          strokeMatches,
        };
      }
    }
  }

  return { matched: false, text: lastText, tries, strokeMatches };
}
