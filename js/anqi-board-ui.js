import {
  COLS,
  ROWS,
  DISPLAY_ROWS,
  DISPLAY_COLS,
  HIDDEN,
  pieceLabel,
  pieceSide,
  cellIndex,
  cellRowCol,
  engineToDisplayPos,
} from "./anqi-engine.js";
import { renderDuoTurnStatusBar } from "./game-turn-status.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG 文字在圓心置中（iOS 不支援 dominant-baseline: central） */
function centerPieceText(el, dyEm = "0.38") {
  el.setAttribute("x", "0");
  el.setAttribute("y", "0");
  el.setAttribute("text-anchor", "middle");
  el.setAttribute("dy", `${dyEm}em`);
}

/**
 * @param {SVGSVGElement} svg
 */
function ensureAnqiDefs(svg) {
  if (svg.querySelector("#anqi-defs")) return;
  const defs = document.createElementNS(SVG_NS, "defs");
  defs.setAttribute("id", "anqi-defs");

  const wood = document.createElementNS(SVG_NS, "radialGradient");
  wood.setAttribute("id", "anqi-wood");
  wood.setAttribute("cx", "38%");
  wood.setAttribute("cy", "32%");
  wood.setAttribute("r", "68%");
  wood.innerHTML = `
    <stop offset="0%" stop-color="#d4a574"/>
    <stop offset="45%" stop-color="#9c5c28"/>
    <stop offset="100%" stop-color="#5c3218"/>
  `;

  const rim = document.createElementNS(SVG_NS, "linearGradient");
  rim.setAttribute("id", "anqi-rim");
  rim.setAttribute("x1", "0%");
  rim.setAttribute("y1", "0%");
  rim.setAttribute("x2", "100%");
  rim.setAttribute("y2", "100%");
  rim.innerHTML = `
    <stop offset="0%" stop-color="#f0d78c"/>
    <stop offset="50%" stop-color="#c9a227"/>
    <stop offset="100%" stop-color="#8b6914"/>
  `;

  const shine = document.createElementNS(SVG_NS, "radialGradient");
  shine.setAttribute("id", "anqi-shine");
  shine.setAttribute("cx", "30%");
  shine.setAttribute("cy", "25%");
  shine.setAttribute("r", "55%");
  shine.innerHTML = `
    <stop offset="0%" stop-color="#fff" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
  `;

  const shadow = document.createElementNS(SVG_NS, "filter");
  shadow.setAttribute("id", "anqi-piece-shadow");
  shadow.setAttribute("x", "-30%");
  shadow.setAttribute("y", "-30%");
  shadow.setAttribute("width", "160%");
  shadow.setAttribute("height", "160%");
  shadow.innerHTML = `
    <feDropShadow dx="0" dy="0.04" stdDeviation="0.05" flood-color="#3e2723" flood-opacity="0.45"/>
  `;

  defs.append(wood, rim, shine, shadow);
  svg.appendChild(defs);
}

/**
 * @param {SVGSVGElement|null} svg
 * @param {(index: number) => void} onCellClick
 */
export function ensureAnqiBoardSvg(svg, onCellClick) {
  if (!svg) return null;
  if (svg.dataset.anqiBound === "1" && svg.querySelector(".anqi-cell")) return svg;
  if (svg.dataset.anqiBound === "1") delete svg.dataset.anqiBound;
  svg.dataset.anqiBound = "1";
  svg.setAttribute("viewBox", `0 0 ${DISPLAY_COLS} ${DISPLAY_ROWS}`);
  svg.setAttribute("class", "anqi-svg");

  const onPointer = (idx) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCellClick(idx);
  };

  svg.innerHTML = "";
  ensureAnqiDefs(svg);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = cellIndex(r, c);
      const { dr, dc } = engineToDisplayPos(r, c);
      const g = document.createElementNS(SVG_NS, "g");
      g.classList.add("anqi-cell");
      if ((dr + dc) % 2 === 0) g.classList.add("is-cell-lite");
      else g.classList.add("is-cell-dark");
      g.dataset.index = String(idx);
      g.setAttribute("transform", `translate(${dc + 0.5} ${dr + 0.5})`);

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.classList.add("anqi-cell-bg");
      rect.setAttribute("x", "-0.48");
      rect.setAttribute("y", "-0.48");
      rect.setAttribute("width", "0.96");
      rect.setAttribute("height", "0.96");
      rect.setAttribute("rx", "0.1");
      g.appendChild(rect);

      const backLayer = document.createElementNS(SVG_NS, "g");
      backLayer.classList.add("anqi-back-layer");
      backLayer.setAttribute("filter", "url(#anqi-piece-shadow)");

      const backDisc = document.createElementNS(SVG_NS, "circle");
      backDisc.classList.add("anqi-piece-back");
      backDisc.setAttribute("r", "0.38");
      backDisc.setAttribute("fill", "url(#anqi-wood)");
      backLayer.appendChild(backDisc);

      const backRim = document.createElementNS(SVG_NS, "circle");
      backRim.classList.add("anqi-back-rim");
      backRim.setAttribute("r", "0.38");
      backRim.setAttribute("fill", "none");
      backLayer.appendChild(backRim);

      const backShine = document.createElementNS(SVG_NS, "circle");
      backShine.classList.add("anqi-back-shine");
      backShine.setAttribute("r", "0.38");
      backShine.setAttribute("fill", "url(#anqi-shine)");
      backLayer.appendChild(backShine);

      g.appendChild(backLayer);

      const disc = document.createElementNS(SVG_NS, "circle");
      disc.classList.add("anqi-disc");
      disc.setAttribute("r", "0.38");
      g.appendChild(disc);

      const labelWrap = document.createElementNS(SVG_NS, "g");
      labelWrap.classList.add("anqi-label-wrap");
      const label = document.createElementNS(SVG_NS, "text");
      label.classList.add("anqi-label");
      centerPieceText(label);
      labelWrap.appendChild(label);
      g.appendChild(labelWrap);

      const hit = document.createElementNS(SVG_NS, "rect");
      hit.classList.add("anqi-hit");
      hit.setAttribute("x", "-0.5");
      hit.setAttribute("y", "-0.5");
      hit.setAttribute("width", "1");
      hit.setAttribute("height", "1");
      g.appendChild(hit);

      const fire = onPointer(idx);
      g.addEventListener("pointerup", fire);
      svg.appendChild(g);
    }
  }
  return svg;
}

/** 清空棋盤 DOM 後呼叫，讓下次可重新建立格子 */
export function resetAnqiBoardSvg(svg) {
  if (!svg) return;
  delete svg.dataset.anqiBound;
}

/**
 * @param {SVGSVGElement|null} svg
 * @param {boolean} flipped
 */
export function applyAnqiViewFlip(svg, flipped) {
  if (!svg) return;
  svg.classList.toggle("anqi-svg-flipped", flipped);
}

/**
 * @param {SVGSVGElement|null} svg
 * @param {object} opts
 * @param {Int16Array|number[]} opts.state
 * @param {number|null} [opts.selected]
 * @param {Set<number>|number[]} [opts.targets]
 * @param {Set<number>|number[]} [opts.jumpTargets]
 * @param {Set<number>|number[]} [opts.captureTargets]
 * @param {Set<number>|number[]} [opts.screenTargets]
 * @param {Set<number>|number[]} [opts.flipTargets]
 * @param {number|null} [opts.lastFrom]
 * @param {number|null} [opts.lastTo]
 * @param {number|null} [opts.presFrom]
 * @param {number|null} [opts.presTo]
 * @param {boolean} [opts.presCapture]
 * @param {number|null} [opts.presScreen]
 */
export function renderAnqiBoardSvg(svg, opts) {
  if (!svg) return;
  const targets = new Set(opts.targets || []);
  const jumpTargets = new Set(opts.jumpTargets || []);
  const captureTargets = new Set(opts.captureTargets || []);
  const screenTargets = new Set(opts.screenTargets || []);
  const flipTargets = new Set(opts.flipTargets || []);
  const board = opts.state;

  svg.querySelectorAll(".anqi-cell").forEach((g) => {
    const idx = Number(g.dataset.index);
    const code = board[idx];
    const hidden = code === HIDDEN;
    const empty = code === 0;
    const side = pieceSide(code);
    const label = pieceLabel(code);

    g.classList.toggle("is-hidden", hidden);
    g.classList.toggle("is-empty", empty && !hidden);
    g.classList.toggle("is-red", side === "red");
    g.classList.toggle("is-black", side === "black");
    g.classList.toggle("is-selected", opts.selected === idx);
    g.classList.toggle("is-target", targets.has(idx));
    g.classList.toggle("is-target-jump", jumpTargets.has(idx));
    g.classList.toggle("is-target-capture", captureTargets.has(idx));
    g.classList.toggle("is-cannon-screen", opts.presScreen === idx || screenTargets.has(idx));
    g.classList.toggle("is-flip-target", flipTargets.has(idx));
    g.classList.toggle("is-last-from", opts.lastFrom === idx);
    g.classList.toggle("is-last-to", opts.lastTo === idx);
    g.classList.toggle("is-pres-from", opts.presFrom === idx);
    g.classList.toggle("is-pres-to", opts.presTo === idx);
    g.classList.toggle("is-pres-capture", opts.presCapture && opts.presTo === idx);

    const text = g.querySelector(".anqi-label");
    if (text) text.textContent = hidden ? "" : label;

    const { row, col } = cellRowCol(idx);
    g.setAttribute(
      "aria-label",
      hidden ? `暗棋 第${row + 1}行第${col + 1}列` : `${side === "red" ? "紅" : "黑"}${label}`,
    );
  });
}

/**
 * @param {object} opts
 */
export function renderAnqiStatusBar(opts) {
  renderDuoTurnStatusBar({
    theme: "xiangqi",
    leftCard: opts.leftCard,
    rightCard: opts.rightCard,
    banner: opts.banner,
    turnMain: opts.turnMain,
    turnSub: opts.turnSub,
    leftName: opts.redName,
    rightName: opts.blackName,
    turn: opts.turn,
    turnPlayerName: opts.turnPlayerName,
    over: opts.over,
    overTitle: opts.overTitle,
    waitingAi: opts.waitingAi,
    statusText: opts.statusText,
  });
}
