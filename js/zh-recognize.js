import { CONFIG } from "./config.site.js";
import { recognizeCanvas, answersMatch } from "./ocr.js";
import {
  ensureHanziStrokeReady,
  recognizeStrokes,
  pickStrokeAnswer,
  shouldUseStrokeRecognition,
} from "./hanzi-stroke.js";
import { recognizeViaVision } from "./vision-handwriting.js";

/**
 * 國語手寫辨識：筆畫 → 雲端 Vision → Tesseract（可關）
 * @returns {{ matched: boolean, text: string, method?: string, tries: Array }}
 */
export async function recognizeZhHandwriting({
  canvas,
  strokes,
  imageDataUrl,
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

  if (CONFIG.VISION_HANDWRITING !== false && CONFIG.SCORE_LOG_URL) {
    onStatus?.("雲端辨識中…");
    const { text, skipped, error } = await recognizeViaVision(imageDataUrl);
    if (!skipped && !error && text) {
      lastText = text;
      tries.push({ method: "vision", text });
      if (answersMatch(text, expected)) {
        return { matched: true, text, method: "vision", tries };
      }
    }
  }

  if (CONFIG.OCR_ENABLED) {
    onStatus?.("本機辨識中…");
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
