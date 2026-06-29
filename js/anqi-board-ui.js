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

/**
 * @param {SVGSVGElement|null} svg
 * @param {(index: number) => void} onCellClick
 */
export function ensureAnqiBoardSvg(svg, onCellClick) {
  if (!svg) return null;
  if (svg.dataset.anqiBound === "1") return svg;
  svg.dataset.anqiBound = "1";
  svg.setAttribute("viewBox", `0 0 ${DISPLAY_COLS} ${DISPLAY_ROWS}`);
  svg.setAttribute("class", "anqi-svg");

  const onPointer = (idx) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCellClick(idx);
  };

  svg.innerHTML = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = cellIndex(r, c);
      const { dr, dc } = engineToDisplayPos(r, c);
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("anqi-cell");
      g.dataset.index = String(idx);
      g.setAttribute("transform", `translate(${dc + 0.5} ${dr + 0.5})`);

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.classList.add("anqi-cell-bg");
      rect.setAttribute("x", "-0.48");
      rect.setAttribute("y", "-0.48");
      rect.setAttribute("width", "0.96");
      rect.setAttribute("height", "0.96");
      rect.setAttribute("rx", "0.1");
      g.appendChild(rect);

      const back = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      back.classList.add("anqi-piece-back");
      back.setAttribute("x", "-0.4");
      back.setAttribute("y", "-0.4");
      back.setAttribute("width", "0.8");
      back.setAttribute("height", "0.8");
      back.setAttribute("rx", "0.08");
      g.appendChild(back);

      const disc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      disc.classList.add("anqi-disc");
      disc.setAttribute("r", "0.38");
      g.appendChild(disc);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.classList.add("anqi-label");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "central");
      label.setAttribute("y", "0.05");
      g.appendChild(label);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
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
