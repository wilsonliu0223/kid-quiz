import {
  HIDDEN,
  cannonLeapInfo,
  cellRowCol,
  cellManhattan,
  decodeAction,
  engineToDisplayPos,
  isCannonCode,
  pieceLabel,
  pieceSide,
} from "./anqi-engine.js";

const NS = "http://www.w3.org/2000/svg";

/** @param {number} index */
export function cellCenter(index) {
  const { row, col } = cellRowCol(index);
  const { dr, dc } = engineToDisplayPos(row, col);
  return { x: dc + 0.5, y: dr + 0.5 };
}

export function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * @param {ReturnType<typeof decodeAction>} dec
 * @param {Int16Array|number[]} state
 * @param {boolean} [isAi]
 */
export function describeAnqiAction(dec, state, isAi = false) {
  const who = isAi ? "電腦" : "你";
  if (dec.isFlip) return `${who}翻開暗棋`;
  const fromLabel = pieceLabel(state[dec.from]);
  const toCode = state[dec.to];
  const leap =
    isCannonCode(state[dec.from]) && cellManhattan(dec.from, dec.to) > 1
      ? cannonLeapInfo(state, dec.from, dec.to)
      : null;
  const over = leap?.ok ? pieceLabel(state[leap.screen]) : "";
  if (!toCode || toCode === HIDDEN) {
    return over ? `${who}：${fromLabel} 隔${over}移動` : `${who}：${fromLabel} 移動`;
  }
  return over
    ? `${who}：${fromLabel} 隔${over}吃 ${pieceLabel(toCode)}`
    : `${who}：${fromLabel} 吃 ${pieceLabel(toCode)}`;
}

/**
 * @param {HTMLElement|null} el
 * @param {string} text
 */
export function setAnqiActionToast(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

/**
 * @param {SVGSVGElement|null} svg
 * @param {object} opts
 * @param {number} opts.action
 * @param {Int16Array|number[]} opts.stateBefore
 */
export function animateAnqiAction(svg, opts) {
  const { action, stateBefore } = opts;
  if (!svg) return sleep(0);

  svg.querySelector(".anqi-fly-layer")?.remove();
  const dec = decodeAction(action);

  if (dec.isFlip) {
    return sleep(420);
  }

  const fromCode = stateBefore[dec.from];
  const from = cellCenter(dec.from);
  const to = cellCenter(dec.to);
  const side = pieceSide(fromCode);
  const leap =
    isCannonCode(fromCode) && cellManhattan(dec.from, dec.to) > 1
      ? cannonLeapInfo(stateBefore, dec.from, dec.to)
      : null;
  const via = leap?.ok && leap.screen != null ? cellCenter(leap.screen) : null;

  return new Promise((resolve) => {
    const layer = document.createElementNS(NS, "g");
    layer.setAttribute("class", "anqi-fly-layer");

    const fly = document.createElementNS(NS, "g");
    fly.setAttribute("class", `anqi-fly-piece${side === "red" ? " is-red" : " is-black"}`);
    fly.setAttribute("transform", `translate(${from.x} ${from.y})`);

    const disc = document.createElementNS(NS, "circle");
    disc.setAttribute("class", "anqi-disc");
    disc.setAttribute("r", "0.38");
    fly.appendChild(disc);

    const label = document.createElementNS(NS, "text");
    label.setAttribute("class", "anqi-label");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("y", "0.05");
    label.textContent = pieceLabel(fromCode);
    fly.appendChild(label);

    const anim = document.createElementNS(NS, "animateTransform");
    anim.setAttribute("attributeName", "transform");
    anim.setAttribute("type", "translate");
    anim.setAttribute("dur", via ? "0.58s" : "0.48s");
    anim.setAttribute("fill", "freeze");
    anim.setAttribute("calcMode", "linear");
    if (via) {
      anim.setAttribute("values", `${from.x} ${from.y};${via.x} ${via.y};${to.x} ${to.y}`);
      anim.setAttribute("keyTimes", "0;0.42;1");
    } else {
      anim.setAttribute("from", `${from.x} ${from.y}`);
      anim.setAttribute("to", `${to.x} ${to.y}`);
    }
    fly.appendChild(anim);

    layer.appendChild(fly);
    svg.appendChild(layer);

    const finish = () => {
      layer.remove();
      resolve();
    };
    anim.addEventListener("endEvent", finish, { once: true });
    window.setTimeout(finish, via ? 620 : 520);
    try {
      anim.beginElement();
    } catch {
      /* SMIL 不可用時靠 timeout */
    }
  });
}

export const ANQI_PRESENT = {
  aiPreShowMs: 520,
  aiPostHoldMs: 1300,
  humanPreShowMs: 160,
  humanPostHoldMs: 380,
};
