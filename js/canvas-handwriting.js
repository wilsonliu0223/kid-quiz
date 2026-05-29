import { CONFIG } from "./config.site.js";

const STROKE_WIDTH = CONFIG.OCR_STROKE_WIDTH ?? 6;

export function createHandwritingCanvas(canvasEl, wrapEl) {
  const ctx = canvasEl.getContext("2d");
  let drawing = false;
  let last = null;
  /** @type {number[][][]} */
  let strokes = [];
  /** @type {{ x: number, y: number }[]} */
  let currentStroke = [];

  function getStrokes() {
    if (currentStroke.length >= 2) {
      commitStroke();
    }
    return strokes.map((s) => s.map(([x, y]) => [x, y]));
  }

  function resize() {
    strokes = [];
    currentStroke = [];
    const rect = wrapEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.floor(rect.width * dpr);
    canvasEl.height = Math.floor(rect.height * dpr);
    canvasEl.style.width = `${rect.width}px`;
    canvasEl.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = STROKE_WIDTH;
    ctx.strokeStyle = "#1a1a1a";
  }

  function pointFromEvent(e) {
    const rect = canvasEl.getBoundingClientRect();
    const t = e.touches?.[0] ?? e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function pushPoint(p) {
    currentStroke.push({ x: p.x, y: p.y });
  }

  function commitStroke() {
    if (currentStroke.length < 2) {
      currentStroke = [];
      return;
    }
    const stroke = currentStroke.map((p) => [
      Math.round(p.x),
      Math.round(p.y),
    ]);
    strokes.push(stroke);
    currentStroke = [];
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    last = pointFromEvent(e);
    currentStroke = [last];
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    pushPoint(p);
    last = p;
  }

  function end(e) {
    if (!drawing) return;
    e.preventDefault();
    drawing = false;
    commitStroke();
    last = null;
  }

  function clear() {
    const rect = wrapEl.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    strokes = [];
    currentStroke = [];
  }

  function isBlank() {
    const w = canvasEl.width;
    const h = canvasEl.height;
    if (!w || !h) return true;
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false;
    }
    return true;
  }

  function toDataURL() {
    return canvasEl.toDataURL("image/png");
  }

  canvasEl.addEventListener("mousedown", start);
  canvasEl.addEventListener("mousemove", move);
  canvasEl.addEventListener("mouseup", end);
  canvasEl.addEventListener("mouseleave", end);
  canvasEl.addEventListener("touchstart", start, { passive: false });
  canvasEl.addEventListener("touchmove", move, { passive: false });
  canvasEl.addEventListener("touchend", end, { passive: false });

  window.addEventListener("resize", resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize);
  }
  resize();

  return { resize, clear, isBlank, toDataURL, getStrokes };
}
