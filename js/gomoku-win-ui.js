const BOARD_SIZE = 15;
const WIN_LINE_DELAY_MS = 250;
const WIN_OVERLAY_DELAY_MS = 1200;

/** @type {ReturnType<typeof setTimeout> | null} */
let lineTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let overlayTimer = null;

/**
 * @param {Set<number>} winLine
 * @param {[number, number] | null} lastMove
 * @returns {[[number, number], [number, number]] | null}
 */
export function getWinLineEndpoints(winLine, lastMove) {
  if (!winLine || winLine.size < 5) return null;
  const coords = [...winLine].map((i) => [Math.floor(i / BOARD_SIZE), i % BOARD_SIZE]);
  const anchor =
    lastMove && winLine.has(lastMove[0] * BOARD_SIZE + lastMove[1]) ? lastMove : coords[0];

  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const line = coords.filter(([r, c]) => (r - anchor[0]) * dc === (c - anchor[1]) * dr);
    if (line.length < 5) continue;
    const proj = ([r, c]) => (dr !== 0 ? r : c);
    line.sort((a, b) => proj(a) - proj(b));
    const anchorIdx = line.findIndex(([r, c]) => r === anchor[0] && c === anchor[1]);
    const start = Math.max(0, Math.min(anchorIdx, line.length - 5));
    const five = line.slice(start, start + 5);
    return [five[0], five[five.length - 1]];
  }
  return coords.length >= 2 ? [coords[0], coords[coords.length - 1]] : null;
}

/** @param {Element | null} stageEl */
export function clearGomokuWinLine(stageEl) {
  stageEl?.querySelector(".gomoku-win-line-layer")?.remove();
}

/**
 * @param {Element | null} stageEl
 * @param {Set<number>} winLine
 * @param {[number, number] | null} lastMove
 */
export function renderGomokuWinLine(stageEl, winLine, lastMove) {
  if (!stageEl) return;
  clearGomokuWinLine(stageEl);
  const ends = getWinLineEndpoints(winLine, lastMove);
  if (!ends) return;

  const [[r0, c0], [r1, c1]] = ends;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("gomoku-win-line-layer");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(((c0 + 0.5) / BOARD_SIZE) * 100));
  line.setAttribute("y1", String(((r0 + 0.5) / BOARD_SIZE) * 100));
  line.setAttribute("x2", String(((c1 + 0.5) / BOARD_SIZE) * 100));
  line.setAttribute("y2", String(((r1 + 0.5) / BOARD_SIZE) * 100));
  svg.appendChild(line);
  stageEl.appendChild(svg);
}

/**
 * @param {object} opts
 * @param {Element | null} opts.stageEl
 * @param {Element | null} opts.overlayEl
 * @param {Element | null} [opts.titleEl]
 * @param {Element | null} [opts.detailEl]
 * @param {Set<number> | null} [opts.winLine]
 * @param {[number, number] | null} [opts.lastMove]
 * @param {string} opts.title
 * @param {string} [opts.detail]
 */
export function celebrateGomokuWin(opts) {
  const { stageEl, overlayEl, titleEl, detailEl, winLine, lastMove, title, detail } = opts;
  clearGomokuWinCelebration(stageEl, overlayEl);

  if (winLine && winLine.size >= 5) {
    lineTimer = setTimeout(() => {
      lineTimer = null;
      renderGomokuWinLine(stageEl, winLine, lastMove);
    }, WIN_LINE_DELAY_MS);
  }

  overlayTimer = setTimeout(() => {
    overlayTimer = null;
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail || "";
    if (overlayEl) overlayEl.hidden = false;
  }, WIN_OVERLAY_DELAY_MS);
}

/** @param {Element | null} stageEl @param {Element | null} overlayEl */
export function clearGomokuWinCelebration(stageEl, overlayEl) {
  if (lineTimer) clearTimeout(lineTimer);
  if (overlayTimer) clearTimeout(overlayTimer);
  lineTimer = null;
  overlayTimer = null;
  clearGomokuWinLine(stageEl);
  if (overlayEl) overlayEl.hidden = true;
}

export function hideGomokuWinOverlay(overlayEl) {
  if (overlayTimer) clearTimeout(overlayTimer);
  overlayTimer = null;
  if (overlayEl) overlayEl.hidden = true;
}

/**
 * @param {Element | null} overlayEl
 * @param {Element | null} stageEl
 * @param {Set<number> | null} [winLine]
 * @param {[number, number] | null} [lastMove]
 */
export function dismissGomokuWinOverlay(overlayEl, stageEl, winLine, lastMove) {
  hideGomokuWinOverlay(overlayEl);
  if (winLine && winLine.size >= 5) {
    renderGomokuWinLine(stageEl, winLine, lastMove);
  }
}

export function isGomokuWinCelebrationPending() {
  return !!(lineTimer || overlayTimer);
}

/**
 * @param {object} opts
 * @param {Element | null} opts.overlayEl
 * @param {Element | null} [opts.titleEl]
 * @param {Element | null} [opts.detailEl]
 * @param {string} opts.title
 * @param {string} [opts.detail]
 */
export function showGomokuWinOverlayImmediate(opts) {
  const { overlayEl, titleEl, detailEl, title, detail } = opts;
  if (titleEl) titleEl.textContent = title;
  if (detailEl) detailEl.textContent = detail || "";
  if (overlayEl) overlayEl.hidden = false;
}
