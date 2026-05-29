import { CONFIG } from "./config.site.js";
import { normalizeAnswer } from "./ocr.js";

export async function recognizeViaVision(imageDataUrl) {
  if (CONFIG.VISION_HANDWRITING === false || !CONFIG.SCORE_LOG_URL) {
    return { text: "", skipped: true };
  }

  try {
    const res = await fetch(CONFIG.SCORE_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "handwritingVision",
        imageBase64: imageDataUrl,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      return { text: "", error: data.error || "vision_failed" };
    }
    return { text: normalizeAnswer(data.text), skipped: false };
  } catch (err) {
    console.warn("Vision handwriting failed", err);
    return { text: "", error: true };
  }
}
