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

function getWrap() {
  return document.getElementById("canvas-wrap");
}

export function hideStrokeOrderPanel() {
  animToken += 1;
  const wrap = getWrap();
  const layer = document.getElementById("stroke-order-layer");
  const toolbar = document.getElementById("stroke-order-toolbar");
  const target = document.getElementById("stroke-order-target");
  const err = document.getElementById("stroke-order-error");
  wrap?.classList.remove("stroke-order-active");
  if (layer) layer.hidden = true;
  if (toolbar) toolbar.hidden = true;
  if (target) target.innerHTML = "";
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
}

function measureCharSize(targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const size = Math.floor(Math.min(rect.width, rect.height) - 20);
  return Math.max(80, size);
}

/** 單字依序播放在同一格（參考 stroke-order-animation 疊層做法） */
function animateOneChar(char, targetEl, delay) {
  return new Promise((resolve) => {
    targetEl.innerHTML = "";
    const host = document.createElement("div");
    host.className = "stroke-order-char-host";
    targetEl.appendChild(host);

    const size = measureCharSize(targetEl);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    try {
      const writer = window.HanziWriter.create(host, char, {
        width: size,
        height: size,
        padding: 10,
        strokeColor: "#e85d2a",
        radicalColor: "#c94a1a",
        outlineColor: "#ddd",
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

/**
 * 答錯後「再寫一次」：HanziWriter 在畫布底層播筆畫，手寫 canvas 疊在上層描紅。
 * @see https://wilsonliu0223.github.io/stroke-order-animation/
 */
export async function showStrokeOrderForWord(word) {
  if (CONFIG.STROKE_ORDER_ENABLED === false) return false;

  const wrap = getWrap();
  const layer = document.getElementById("stroke-order-layer");
  const toolbar = document.getElementById("stroke-order-toolbar");
  const target = document.getElementById("stroke-order-target");
  const errEl = document.getElementById("stroke-order-error");
  if (!wrap || !layer || !target) return false;

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
  wrap.classList.add("stroke-order-active");
  layer.hidden = false;
  if (toolbar) toolbar.hidden = false;
  target.innerHTML = "";
  if (errEl) errEl.hidden = true;

  const delay = CONFIG.STROKE_ORDER_DELAY ?? 500;

  for (const char of chars) {
    if (token !== animToken) return false;
    await animateOneChar(char, target, delay);
  }

  return token === animToken;
}
