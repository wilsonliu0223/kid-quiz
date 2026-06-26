const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_WHEEL_STEP = 0.1;
const PAN_THRESHOLD = 6;

/** @type {HTMLElement | null} */
let viewportEl = null;
/** @type {HTMLElement | null} */
let stageEl = null;

const zoomState = { scale: 1, x: 0, y: 0 };

/** @type {Map<number, { x: number, y: number }>} */
const pointers = new Map();
/** @type {{ x: number, y: number, tx: number, ty: number, moved?: boolean } | null} */
let panStart = null;
/** @type {{ distance: number, scale: number, x: number, y: number, centerX: number, centerY: number } | null} */
let pinchStart = null;

let bound = false;
let panSuppressUntil = 0;

function applyTransform() {
  if (!stageEl) return;
  stageEl.style.transform = `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`;
}

function getPinchMetrics() {
  const pts = [...pointers.values()];
  const dx = pts[1].x - pts[0].x;
  const dy = pts[1].y - pts[0].y;
  return {
    distance: Math.hypot(dx, dy) || 1,
    centerX: (pts[0].x + pts[1].x) / 2,
    centerY: (pts[0].y + pts[1].y) / 2,
  };
}

function clampPan() {
  if (!viewportEl || !stageEl || zoomState.scale <= 1) {
    zoomState.x = 0;
    zoomState.y = 0;
    return;
  }
  const board = stageEl.querySelector(".gomoku-board");
  if (!board) return;

  const vpW = viewportEl.clientWidth;
  const vpH = viewportEl.clientHeight;
  const scaledW = board.offsetWidth * zoomState.scale;
  const scaledH = board.offsetHeight * zoomState.scale;
  const maxX = Math.max(0, (scaledW - vpW) / 2 + 24);
  const maxY = Math.max(0, (scaledH - vpH) / 2 + 24);
  zoomState.x = Math.min(maxX, Math.max(-maxX, zoomState.x));
  zoomState.y = Math.min(maxY, Math.max(-maxY, zoomState.y));
}

function setScaleAt(newScale, anchorX, anchorY) {
  if (!viewportEl) return;
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newScale));
  const vp = viewportEl.getBoundingClientRect();
  const ox = anchorX - vp.left - vp.width / 2;
  const oy = anchorY - vp.top - vp.height / 2;
  const ratio = clamped / zoomState.scale;

  zoomState.x = ox - ratio * (ox - zoomState.x);
  zoomState.y = oy - ratio * (oy - zoomState.y);
  zoomState.scale = clamped;

  if (zoomState.scale <= 1) {
    zoomState.scale = 1;
    zoomState.x = 0;
    zoomState.y = 0;
  } else {
    clampPan();
  }
  applyTransform();
}

export function resetGomokuBoardZoom() {
  zoomState.scale = 1;
  zoomState.x = 0;
  zoomState.y = 0;
  panStart = null;
  pinchStart = null;
  pointers.clear();
  viewportEl?.classList.remove("is-panning");
  applyTransform();
}

export function wasGomokuBoardPanned() {
  return Date.now() < panSuppressUntil;
}

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1 + ZOOM_WHEEL_STEP : 1 - ZOOM_WHEEL_STEP;
  setScaleAt(zoomState.scale * factor, e.clientX, e.clientY);
}

function onPointerDown(e) {
  if (!viewportEl) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  viewportEl.setPointerCapture(e.pointerId);

  if (pointers.size === 2) {
    panStart = null;
    const m = getPinchMetrics();
    pinchStart = {
      distance: m.distance,
      centerX: m.centerX,
      centerY: m.centerY,
      scale: zoomState.scale,
      x: zoomState.x,
      y: zoomState.y,
    };
  } else if (pointers.size === 1 && zoomState.scale > 1) {
    panStart = {
      x: e.clientX,
      y: e.clientY,
      tx: zoomState.x,
      ty: zoomState.y,
      moved: false,
    };
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2 && pinchStart) {
    e.preventDefault();
    const m = getPinchMetrics();
    const factor = m.distance / pinchStart.distance;
    const nextScale = pinchStart.scale * factor;
    setScaleAt(nextScale, m.centerX, m.centerY);
    return;
  }

  if (pointers.size === 1 && panStart && zoomState.scale > 1) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    if (!panStart.moved) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      panStart.moved = true;
      viewportEl?.classList.add("is-panning");
    }
    e.preventDefault();
    zoomState.x = panStart.tx + dx;
    zoomState.y = panStart.ty + dy;
    clampPan();
    applyTransform();
  }
}

function onPointerUp(e) {
  if (panStart?.moved) {
    panSuppressUntil = Date.now() + 320;
  }
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size === 0) {
    panStart = null;
    viewportEl?.classList.remove("is-panning");
  } else if (pointers.size === 1 && zoomState.scale > 1) {
    const remaining = [...pointers.values()][0];
    panStart = {
      x: remaining.x,
      y: remaining.y,
      tx: zoomState.x,
      ty: zoomState.y,
      moved: false,
    };
  }
  try {
    viewportEl?.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} viewportSelector
 * @param {string} stageSelector
 */
export function initGomokuBoardZoom(viewportSelector, stageSelector) {
  viewportEl = document.querySelector(viewportSelector);
  stageEl = document.querySelector(stageSelector);
  if (!viewportEl || !stageEl || bound) return;

  bound = true;
  resetGomokuBoardZoom();

  viewportEl.addEventListener("wheel", onWheel, { passive: false });
  viewportEl.addEventListener("pointerdown", onPointerDown);
  viewportEl.addEventListener("pointermove", onPointerMove);
  viewportEl.addEventListener("pointerup", onPointerUp);
  viewportEl.addEventListener("pointercancel", onPointerUp);
}
