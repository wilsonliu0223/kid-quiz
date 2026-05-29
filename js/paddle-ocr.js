import { CONFIG } from "./config.site.js";

const ORT_WASM =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

let ocrPromise = null;
let loadError = null;

/**
 * 初始化 PaddleOCR.js（PP-OCRv5 mobile，繁簡中文）。
 * 首次會下載 SDK、WASM 與模型（約 40～60 MB，瀏覽器會快取）。
 */
export async function ensurePaddleOcr() {
  if (loadError) throw loadError;
  if (ocrPromise) return ocrPromise;

  ocrPromise = (async () => {
    const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
    return PaddleOCR.create({
      lang: "ch",
      ocrVersion: "PP-OCRv5",
      worker: false,
      ortOptions: {
        backend: "wasm",
        wasmPaths: ORT_WASM,
      },
    });
  })().catch((err) => {
    loadError = err;
    ocrPromise = null;
    throw err;
  });

  return ocrPromise;
}

/** @param {HTMLCanvasElement} canvas */
export async function predictHandwriting(canvas) {
  const ocr = await ensurePaddleOcr();
  const results = await ocr.predict(canvas);
  return results[0] ?? null;
}

/** 從 Paddle 結果抽出文字，可選依標準答案字元過濾 */
export function textFromPaddleResult(result, expectedWord) {
  if (!result?.items?.length) return "";

  const sorted = [...result.items].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );

  let text = sorted
    .map((item) => String(item.text || "").replace(/\s/g, ""))
    .filter(Boolean)
    .join("");

  if (CONFIG.OCR_USE_WHITELIST !== false && expectedWord) {
    const allowed = new Set([
      ...String(expectedWord || "")
        .replace(/\s/g, "")
        .split(""),
    ]);
    if (allowed.size) {
      text = [...text].filter((c) => allowed.has(c)).join("");
    }
  }

  return text.replace(/\s/g, "").trim();
}
