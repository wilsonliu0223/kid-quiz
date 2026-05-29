import { CONFIG } from "./config.site.js";
import { recognizeCanvas, answersMatch } from "./ocr.js";
import {
  ensureHanziStrokeReady,
  recognizeStrokes,
  pickStrokeAnswer,
  shouldUseStrokeRecognition,
} from "./hanzi-stroke.js";

/**
 * 國語手寫辨識（全開源、不需 API Key）
 * ① hanzilookup 筆畫 ② Tesseract 圖像（輔助）→ 失敗則同音四選一
 */
export async function recognizeZhHandwriting({
  canvas,
  strokes,
  expected,
  onStatus,
}) {
  const tries = [];
  let lastText = "";

  if (shouldUseStrokeRecognition(expected) && strokes?.length) {
    onStatus?.("筆畫辨識中…");
    const loaded = await ensureHanziStrokeReady();
    if (loaded) {
      const matches = await recognizeStrokes(strokes, 10);
      const text = pickStrokeAnswer(matches, expected);
      if (text) {
        lastText = text;
        tries.push({ method: "stroke", text });
        if (answersMatch(text, expected)) {
          return { matched: true, text, method: "stroke", tries };
        }
      }
    }
  }

  if (CONFIG.OCR_ENABLED) {
    onStatus?.("圖像辨識中…");
    const { text, skipped, error } = await recognizeCanvas(canvas, { expected });
    if (!skipped && !error && text) {
      lastText = text;
      tries.push({ method: "tesseract", text });
      if (answersMatch(text, expected)) {
        return { matched: true, text, method: "tesseract", tries };
      }
    }
  }

  return { matched: false, text: lastText, tries };
}
