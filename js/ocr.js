import { CONFIG } from "./config.site.js";
import {
  ensurePaddleOcr,
  predictHandwriting,
  textFromPaddleResult,
} from "./paddle-ocr.js";
import { getOcrMinSide } from "./stroke-lenient.js";

/** 裁切筆跡、白底、放大，方便 OCR */
export function prepareHandwritingImage(sourceCanvas, expectedWord = "") {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  if (!sw || !sh) return null;

  const sctx = sourceCanvas.getContext("2d");
  const { data } = sctx.getImageData(0, 0, sw, sh);
  const threshold = CONFIG.OCR_INK_THRESHOLD ?? 200;

  let minX = sw;
  let minY = sh;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (a > 16 && lum < threshold) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return null;

  const inkW = maxX - minX + 1;
  const inkH = maxY - minY + 1;
  const pad = Math.max(
    12,
    Math.round(Math.max(inkW, inkH) * (CONFIG.OCR_CROP_PADDING ?? 0.15))
  );

  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(sw - 1, maxX + pad);
  maxY = Math.min(sh - 1, maxY + pad);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const minSide = getOcrMinSide(expectedWord);
  const scale = Math.max(1, minSide / Math.max(cw, ch, 1));
  const dw = Math.ceil(cw * scale);
  const dh = Math.ceil(ch * scale);

  const out = document.createElement("canvas");
  out.width = dw;
  out.height = dh;
  const octx = out.getContext("2d");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, dw, dh);
  octx.imageSmoothingEnabled = false;
  octx.drawImage(sourceCanvas, minX, minY, cw, ch, 0, 0, dw, dh);

  return out;
}

export async function recognizeCanvas(canvas, options = {}) {
  if (!CONFIG.OCR_ENABLED) {
    return { text: "", skipped: true };
  }

  const expected = options.expected ?? "";

  try {
    await ensurePaddleOcr();
    const prepared =
      CONFIG.OCR_PREPROCESS !== false
        ? prepareHandwritingImage(canvas, expected) || canvas
        : canvas;

    const result = await predictHandwriting(prepared);
    const cleaned = normalizeAnswer(
      textFromPaddleResult(result, expected, { expected })
    );
    return { text: cleaned, skipped: false };
  } catch (err) {
    console.warn("PaddleOCR failed", err);
    return { text: "", error: true };
  }
}

export function normalizeAnswer(s) {
  return String(s || "")
    .replace(/\s/g, "")
    .replace(/[，。、．·「」『』：；！？\[\]【】]/g, "")
    .trim();
}

export function answersMatch(recognized, expected) {
  const a = normalizeAnswer(recognized);
  const b = normalizeAnswer(expected);
  if (!a || !b) return false;
  if (a === b) return true;

  if (!CONFIG.OCR_STRICT) {
    if (a.includes(b) || b.includes(a)) return true;
    if (b.length === 1) {
      if ([...a].includes(b)) return true;
      if (a.length >= 1 && a.charAt(0) === b) return true;
      if (a.length >= 1 && a.charAt(a.length - 1) === b) return true;
    }
    if (b.length === 2 && a.length >= 2 && a.includes(b)) return true;
  }

  return CONFIG.OCR_STRICT ? a === b : false;
}
