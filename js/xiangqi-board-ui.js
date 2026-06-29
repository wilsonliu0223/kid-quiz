import { COLS, PIECE_LABEL, ROWS, sideOfPiece } from "./xiangqi-core.js";
import { renderDuoTurnStatusBar } from "./game-turn-status.js?v=gomoku-v14";

const SVG_NS = "http://www.w3.org/2000/svg";

const LINE_MARKUP = `
  <g class="xiangqi-lines" stroke="currentColor" stroke-width="0.04" fill="none">
    <line x1="0" y1="0" x2="8" y2="0" />
    <line x1="0" y1="1" x2="8" y2="1" />
    <line x1="0" y1="2" x2="8" y2="2" />
    <line x1="0" y1="3" x2="8" y2="3" />
    <line x1="0" y1="4" x2="8" y2="4" />
    <line x1="0" y1="5" x2="8" y2="5" />
    <line x1="0" y1="6" x2="8" y2="6" />
    <line x1="0" y1="7" x2="8" y2="7" />
    <line x1="0" y1="8" x2="8" y2="8" />
    <line x1="0" y1="9" x2="8" y2="9" />
    <line x1="0" y1="0" x2="0" y2="9" />
    <line x1="1" y1="0" x2="1" y2="9" />
    <line x1="2" y1="0" x2="2" y2="9" />
    <line x1="3" y1="0" x2="3" y2="4" />
    <line x1="3" y1="5" x2="3" y2="9" />
    <line x1="4" y1="0" x2="4" y2="9" />
    <line x1="5" y1="0" x2="5" y2="4" />
    <line x1="5" y1="5" x2="5" y2="9" />
    <line x1="6" y1="0" x2="6" y2="9" />
    <line x1="7" y1="0" x2="7" y2="9" />
    <line x1="8" y1="0" x2="8" y2="9" />
    <line x1="3" y1="0" x2="5" y2="2" />
    <line x1="5" y1="0" x2="3" y2="2" />
    <line x1="3" y1="7" x2="5" y2="9" />
    <line x1="5" y1="7" x2="3" y2="9" />
  </g>
  <text class="xiangqi-river-label" x="1.35" y="4.62">楚河</text>
  <text class="xiangqi-river-label" x="5.85" y="4.62">漢界</text>
`;

/** @returns {[number, number]} */
function viewCoord(r, c, flipped) {
  return flipped ? [ROWS - 1 - r, COLS - 1 - c] : [r, c];
}

/** 點擊座標吸附最近交叉點（viewBox 單位，約半格內有效） */
const SNAP_RADIUS = 0.62;

/**
 * @param {SVGElement} svg
 * @param {number} clientX
 * @param {number} clientY
 * @param {boolean} flipped
 * @returns {[number, number] | null}
 */
function findNearestPoint(svg, clientX, clientY, flipped) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const loc = pt.matrixTransform(ctm.inverse());

  let bestR = 0;
  let bestC = 0;
  let bestD = Infinity;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const [vr, vc] = viewCoord(r, c, flipped);
      const d = Math.hypot(loc.x - vc, loc.y - vr);
      if (d < bestD) {
        bestD = d;
        bestR = r;
        bestC = c;
      }
    }
  }
  return bestD <= SNAP_RADIUS ? [bestR, bestC] : null;
}

/** @param {SVGGElement} g */
function placePoint(g, r, c, flipped) {
  const [vr, vc] = viewCoord(r, c, flipped);
  g.setAttribute("transform", `translate(${vc} ${vr})`);
}

/** @param {SVGElement} svg @param {boolean} flipped */
export function applyBoardViewFlip(svg, flipped) {
  const linesWrap = svg?.querySelector(".xiangqi-lines-wrap");
  if (!linesWrap) return;
  const on = !!flipped;
  if (on) {
    linesWrap.setAttribute("transform", "rotate(180 4 4.5)");
  } else {
    linesWrap.removeAttribute("transform");
  }
  linesWrap.querySelectorAll(".xiangqi-river-label").forEach((el) => {
    const x = el.getAttribute("x");
    const y = el.getAttribute("y");
    if (on && x && y) {
      el.setAttribute("transform", `rotate(180 ${x} ${y})`);
    } else {
      el.removeAttribute("transform");
    }
  });
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const g = svg.querySelector(`.xiangqi-point[data-r="${r}"][data-c="${c}"]`);
      if (g) placePoint(g, r, c, on);
    }
  }
  svg.dataset.flipped = on ? "1" : "0";
}

/**
 * @param {SVGElement} svg
 * @param {(r: number, c: number) => void} onPointClick
 */
export function ensureXiangqiBoardSvg(svg, onPointClick) {
  if (!svg) return null;
  if (svg.dataset.built === "1") return svg;

  svg.setAttribute("viewBox", "0 0 8 9");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-label", "象棋棋盤");
  svg.innerHTML = `<g class="xiangqi-stage"><g class="xiangqi-lines-wrap">${LINE_MARKUP}</g><g class="xiangqi-points"></g></g>`;

  const points = svg.querySelector(".xiangqi-points");
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "xiangqi-point");
      g.setAttribute("data-r", String(r));
      g.setAttribute("data-c", String(c));
      placePoint(g, r, c, false);

      const hit = document.createElementNS(SVG_NS, "rect");
      hit.setAttribute("class", "xiangqi-hit");
      hit.setAttribute("x", "-0.52");
      hit.setAttribute("y", "-0.52");
      hit.setAttribute("width", "1.04");
      hit.setAttribute("height", "1.04");
      hit.setAttribute("rx", "0.2");
      hit.setAttribute("fill", "rgba(0,0,0,0.02)");

      const disc = document.createElementNS(SVG_NS, "circle");
      disc.setAttribute("class", "xiangqi-disc");
      disc.setAttribute("r", "0.36");
      disc.setAttribute("pointer-events", "none");

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("class", "xiangqi-label");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "middle");
      label.setAttribute("y", "0.04");
      label.setAttribute("pointer-events", "none");

      const danger = document.createElementNS(SVG_NS, "g");
      danger.setAttribute("class", "xiangqi-danger-mark");
      danger.setAttribute("visibility", "hidden");
      danger.setAttribute("pointer-events", "none");
      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("class", "xiangqi-danger-ring");
      ring.setAttribute("r", "0.44");
      ring.setAttribute("fill", "none");
      const xA = document.createElementNS(SVG_NS, "line");
      xA.setAttribute("class", "xiangqi-danger-x");
      xA.setAttribute("x1", "-0.24");
      xA.setAttribute("y1", "-0.24");
      xA.setAttribute("x2", "0.24");
      xA.setAttribute("y2", "0.24");
      const xB = document.createElementNS(SVG_NS, "line");
      xB.setAttribute("class", "xiangqi-danger-x");
      xB.setAttribute("x1", "0.24");
      xB.setAttribute("y1", "-0.24");
      xB.setAttribute("x2", "-0.24");
      xB.setAttribute("y2", "0.24");
      danger.append(ring, xA, xB);

      g.append(disc, label, hit, danger);
      points.appendChild(g);
    }
  }

  const onActivate = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const flipped = svg.dataset.flipped === "1";
    const nearest = findNearestPoint(svg, e.clientX, e.clientY, flipped);
    if (!nearest) return;
    const [r, c] = nearest;
    const g = svg.querySelector(`.xiangqi-point[data-r="${r}"][data-c="${c}"]`);
    if (!g || g.getAttribute("data-disabled") === "1") return;
    e.preventDefault();
    onPointClick(r, c);
  };
  svg.addEventListener("pointerup", onActivate);

  svg.dataset.built = "1";
  svg.dataset.flipped = "0";
  return svg;
}

/**
 * @param {SVGElement} svg
 * @param {object} opts
 * @param {string[][]} opts.board
 * @param {[number, number]|null} [opts.selected]
 * @param {[number, number]|null} [opts.lastMove]
 * @param {Set<string>} [opts.legal]
 * @param {Set<string>} [opts.resolveCheck]
 * @param {[number, number] | null} [opts.kingInCheck]
 * @param {boolean} [opts.over]
 * @param {boolean} [opts.interactive]
 * @param {boolean} [opts.flipped]
 */
export function renderXiangqiBoardSvg(svg, opts) {
  if (!svg) return;
  const { board, selected, lastMove, legal, resolveCheck, kingInCheck, over, interactive = true, flipped = false } = opts;
  const [kr, kc] = kingInCheck || [null, null];
  applyBoardViewFlip(svg, flipped);
  const [sr, sc] = selected || [null, null];
  const [lr, lc] = lastMove || [null, null];
  const canPlay = !over && interactive;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const g = svg.querySelector(`.xiangqi-point[data-r="${r}"][data-c="${c}"]`);
      if (!g) continue;
      const piece = board[r][c];
      const label = g.querySelector(".xiangqi-label");
      const disc = g.querySelector(".xiangqi-disc");

      g.classList.remove(
        "xiangqi-piece-red",
        "xiangqi-piece-black",
        "is-selected",
        "is-target",
        "is-resolve-check",
        "is-king-in-check",
        "is-last",
        "is-empty"
      );

      if (piece) {
        g.classList.add(sideOfPiece(piece) === "red" ? "xiangqi-piece-red" : "xiangqi-piece-black");
        if (label) label.textContent = PIECE_LABEL[piece] || piece;
        if (disc) disc.setAttribute("visibility", "visible");
      } else {
        g.classList.add("is-empty");
        if (label) label.textContent = "";
        if (disc) disc.setAttribute("visibility", "hidden");
      }

      if (sr === r && sc === c) g.classList.add("is-selected");
      if (legal?.has(`${r},${c}`)) g.classList.add("is-target");
      if (resolveCheck?.has(`${r},${c}`) && piece) g.classList.add("is-resolve-check");
      if (kr === r && kc === c && piece) {
        g.classList.add("is-king-in-check");
        const danger = g.querySelector(".xiangqi-danger-mark");
        danger?.setAttribute("visibility", "visible");
      } else {
        g.querySelector(".xiangqi-danger-mark")?.setAttribute("visibility", "hidden");
      }
      if (lr === r && lc === c) g.classList.add("is-last");

      g.setAttribute("data-disabled", canPlay ? "0" : "1");
      g.style.pointerEvents = canPlay ? "all" : "none";
      g.style.cursor = canPlay ? "pointer" : "default";
    }
  }
}

export function resetXiangqiBoardSvg(svg) {
  if (!svg) return;
  delete svg.dataset.built;
  delete svg.dataset.flipped;
}

/**
 * @param {object} opts
 * @param {HTMLElement|null} [opts.redCard]
 * @param {HTMLElement|null} [opts.blackCard]
 * @param {HTMLElement|null} [opts.banner]
 * @param {HTMLElement|null} [opts.turnMain]
 * @param {HTMLElement|null} [opts.turnSub]
 * @param {string} opts.redName
 * @param {string} opts.blackName
 * @param {"red"|"black"|null} [opts.turn]
 * @param {string} [opts.turnPlayerName]
 * @param {boolean} [opts.over]
 * @param {string} [opts.overTitle]
 * @param {boolean} [opts.waitingAi]
 * @param {string} [opts.youHint]
 * @param {boolean} [opts.inCheck]
 * @param {HTMLElement|null} [opts.checkEl]
 * @param {HTMLElement|null} [opts.checkTitleEl]
 * @param {HTMLElement|null} [opts.checkDetailEl]
 * @param {string} [opts.checkTitle]
 * @param {string} [opts.checkDetail]
 */
export function renderXiangqiStatusBar(opts) {
  const {
    redCard,
    blackCard,
    banner,
    turnMain,
    turnSub,
    redName,
    blackName,
    turn = null,
    turnPlayerName = "",
    over = false,
    overTitle = "對局結束",
    waitingAi = false,
    statusText = "",
    youHint = "",
    inCheck = false,
    checkEl = null,
    checkTitleEl = null,
    checkDetailEl = null,
    checkTitle = "",
    checkDetail = "",
    checkText = "",
  } = opts;

  renderDuoTurnStatusBar({
    theme: "xiangqi",
    leftCard: redCard,
    rightCard: blackCard,
    banner,
    turnMain,
    turnSub,
    leftName: redName,
    rightName: blackName,
    turn,
    turnPlayerName,
    over,
    overTitle,
    waitingAi,
    statusText,
    youHint,
  });

  if (checkEl) {
    const show = inCheck && !statusText;
    checkEl.classList.toggle("is-active", show);
    checkEl.toggleAttribute("hidden", !show);
    const title = checkTitle || checkText || (show ? "你被將軍了！" : "");
    const detail = checkDetail || (show ? "快解將！" : "");
    if (checkTitleEl) checkTitleEl.textContent = title;
    else if (show && title) checkEl.textContent = title;
    if (checkDetailEl) checkDetailEl.textContent = detail;
  }
}
