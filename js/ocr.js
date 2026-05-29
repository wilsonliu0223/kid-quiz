import { CONFIG } from "./config.site.js";

let workerPromise = null;

function loadTesseract() {
  if (!window.Tesseract) {
    throw new Error("Tesseract 尚未載入");
  }
  if (!workerPromise) {
    workerPromise = window.Tesseract.createWorker("chi_tra", 1, {
      logger: () => {},
    });
  }
  return workerPromise;
}

export async function recognizeCanvas(canvas) {
  if (!CONFIG.OCR_ENABLED) {
    return { text: "", skipped: true };
  }

  try {
    const worker = await loadTesseract();
    const {
      data: { text },
    } = await worker.recognize(canvas);
    const cleaned = normalizeAnswer(text);
    return { text: cleaned, skipped: false };
  } catch (err) {
    console.warn("OCR failed", err);
    return { text: "", error: true };
  }
}

export function normalizeAnswer(s) {
  return String(s || "")
    .replace(/\s/g, "")
    .replace(/[，。、．·]/g, "")
    .trim();
}

export function answersMatch(recognized, expected) {
  const a = normalizeAnswer(recognized);
  const b = normalizeAnswer(expected);
  if (!a || !b) return false;
  if (a === b) return true;

  if (!CONFIG.OCR_STRICT) {
    if (a.includes(b) || b.includes(a)) return true;
    // 手寫單字常只辨識出一個字
    if (b.length === 1) {
      if ([...a].includes(b)) return true;
      if (a.length >= 1 && a.charAt(0) === b) return true;
      if (a.length >= 1 && a.charAt(a.length - 1) === b) return true;
    }
    if (b.length === 2 && a.length >= 2 && a.includes(b)) return true;
  }

  return CONFIG.OCR_STRICT ? a === b : false;
}
