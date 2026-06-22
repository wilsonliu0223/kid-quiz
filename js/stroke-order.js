import { CONFIG } from "./config.site.js";

let loadPromise = null;
let animToken = 0;

function loadHanziWriterScript() {
  if (window.HanziWriter) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src =
      "https://cdn.jsdelivr.net/npm/hanzi-writer@2.0.0/dist/hanzi-writer.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("HanziWriter 載入失敗"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

export function hideStrokeOrderPanel() {
  animToken += 1;
  const panel = document.getElementById("stroke-order-panel");
  const target = document.getElementById("stroke-order-target");
  const err = document.getElementById("stroke-order-error");
  if (panel) panel.hidden = true;
  if (target) target.innerHTML = "";
  if (err) err.hidden = true;
}

function animateOneChar(char, targetEl, delay) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.className = "stroke-order-char-host";
    targetEl.appendChild(host);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    try {
      const writer = window.HanziWriter.create(host, char, {
        width: 128,
        height: 128,
        padding: 10,
        strokeColor: "#e85d2a",
        radicalColor: "#c94a1a",
        outlineColor: "#e8e8e8",
        showOutline: true,
        delayBetweenStrokes: delay,
      });
      writer.animateCharacter({ onComplete: finish });
      setTimeout(finish, 20000);
    } catch (err) {
      console.warn("stroke-order", char, err);
      host.textContent = char;
      finish();
    }
  });
}

/** 在畫布下方播放標準答案的筆畫順序（參考 stroke-order-animation） */
export async function showStrokeOrderForWord(word) {
  if (CONFIG.STROKE_ORDER_ENABLED === false) return false;

  const panel = document.getElementById("stroke-order-panel");
  const target = document.getElementById("stroke-order-target");
  const errEl = document.getElementById("stroke-order-error");
  if (!panel || !target) return false;

  const chars = [...String(word || "").trim()].filter(Boolean);
  if (!chars.length) return false;

  try {
    await loadHanziWriterScript();
  } catch (e) {
    console.warn(e);
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "筆畫動畫載入失敗，請檢查網路";
    }
    return false;
  }

  const token = ++animToken;
  panel.hidden = false;
  target.innerHTML = "";
  if (errEl) errEl.hidden = true;

  const delay = CONFIG.STROKE_ORDER_DELAY ?? 500;

  for (const char of chars) {
    if (token !== animToken) return false;
    await animateOneChar(char, target, delay);
  }

  return token === animToken;
}
