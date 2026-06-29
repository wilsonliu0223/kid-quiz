/**
 * 暗棋規則與狀態：封裝 banqi WASM（jacoblincool/banqi-minimax, MIT）
 */

export const ROWS = 4;
export const COLS = 8;
export const BOARD_CELLS = 32;
/** 直向棋盤：8 行 × 4 列（引擎座標順時針轉 90°） */
export const DISPLAY_ROWS = 8;
export const DISPLAY_COLS = 4;
export const HIDDEN = 15;
export const EMPTY = 0;
export const STATE_LEN = 66;

/** @typedef {'red'|'black'} AnqiSide */

const RED_LABELS = ["", "帥", "仕", "相", "俥", "傌", "炮", "兵"];
const BLACK_LABELS = ["", "將", "士", "象", "車", "馬", "包", "卒"];

let wasmReady = null;
/** @type {import('../engines/banqi/web/banqi.js').BanqiGameWasm | null} */
let BanqiGameWasm = null;
/** @type {typeof import('../engines/banqi/web/banqi.js').MctsSessionWasm | null} */
let MctsSessionWasm = null;

/**
 * @returns {Promise<void>}
 */
export async function ensureAnqiWasm() {
  if (wasmReady) return wasmReady;
  wasmReady = (async () => {
    const base = new URL("../engines/banqi/web/banqi.js", import.meta.url);
    const wasmUrl = new URL("../engines/banqi/web/banqi_bg.wasm", import.meta.url);
    const mod = await import(/* @vite-ignore */ base.href);
    await mod.default(wasmUrl);
    BanqiGameWasm = mod.BanqiGameWasm;
    MctsSessionWasm = mod.MctsSessionWasm;
  })();
  return wasmReady;
}

export function cellIndex(row, col) {
  return row * COLS + col;
}

/** @param {number} code */
export function isCannonCode(code) {
  return code === 6 || code === 13;
}

/** @param {number} a @param {number} b cell index */
export function cellManhattan(a, b) {
  const ar = Math.floor(a / COLS);
  const ac = a % COLS;
  const br = Math.floor(b / COLS);
  const bc = b % COLS;
  return Math.abs(ar - br) + Math.abs(ac - bc);
}

/**
 * @param {number} from
 * @param {number} to
 * @returns {number[]|null} 同一直線上的中間格；不同線則 null
 */
export function cellsBetween(from, to) {
  if (from === to) return [];
  const fr = Math.floor(from / COLS);
  const fc = from % COLS;
  const tr = Math.floor(to / COLS);
  const tc = to % COLS;
  if (fr === tr) {
    const lo = Math.min(fc, tc);
    const hi = Math.max(fc, tc);
    const out = [];
    for (let c = lo + 1; c < hi; c++) out.push(fr * COLS + c);
    return out;
  }
  if (fc === tc) {
    const lo = Math.min(fr, tr);
    const hi = Math.max(fr, tr);
    const out = [];
    for (let r = lo + 1; r < hi; r++) out.push(r * COLS + fc);
    return out;
  }
  return null;
}

/**
 * 台灣暗棋：炮／包遠距離吃子須隔恰好一子（炮架）直線跳吃。
 * 鄰格移動（含走空格）與能否鄰格吃子由 WASM 階級規則決定。
 * @param {Int16Array|number[]} state
 * @param {number} from
 * @param {number} to
 * @returns {{ ok: boolean, screen?: number, pieceCount?: number }}
 */
export function cannonLeapInfo(state, from, to) {
  const between = cellsBetween(from, to);
  if (between === null || between.length === 0) return { ok: false, pieceCount: 0 };
  let screen = -1;
  let pieceCount = 0;
  for (const idx of between) {
    if (state[idx] !== EMPTY) {
      pieceCount++;
      screen = idx;
    }
  }
  if (pieceCount !== 1) return { ok: false, pieceCount };
  return { ok: true, screen, pieceCount: 1 };
}

export function cellRowCol(index) {
  return { row: Math.floor(index / COLS), col: index % COLS };
}

/**
 * @param {Int16Array|number[]} state
 * @param {number} action
 */
export function isTaiwanLegalAction(state, action) {
  const dec = decodeAction(action);
  if (dec.isFlip) return true;
  const code = state[dec.from];
  if (!isCannonCode(code)) return true;

  const dist = cellManhattan(dec.from, dec.to);
  if (dist === 1) return true;

  if (cellsBetween(dec.from, dec.to) === null) return false;

  const toCode = state[dec.to];
  if (!toCode || toCode === HIDDEN) return false;

  return cannonLeapInfo(state, dec.from, dec.to).ok;
}

/** 引擎 (r,c) → 直向顯示 (dr, dc) */
export function engineToDisplayPos(row, col) {
  return { dr: col, dc: ROWS - 1 - row };
}

/** 直向顯示 (dr, dc) → 引擎 index */
export function displayPosToEngineIndex(dr, dc) {
  const row = ROWS - 1 - dc;
  const col = dr;
  return cellIndex(row, col);
}

/**
 * @param {number} code
 * @returns {string}
 */
export function pieceLabel(code) {
  if (code === HIDDEN || code === EMPTY) return "";
  if (code >= 1 && code <= 7) return RED_LABELS[code];
  if (code >= 8 && code <= 14) return BLACK_LABELS[code - 7];
  return "?";
}

/**
 * @param {number} code
 * @returns {AnqiSide | null}
 */
export function pieceSide(code) {
  if (code >= 1 && code <= 7) return "red";
  if (code >= 8 && code <= 14) return "black";
  return null;
}

/**
 * banqi WASM 編碼（jacoblincool/banqi-minimax）：
 * - 翻牌：cell * 33（0, 33, 66, …）
 * - 走子／吃子：from * 32 + to（0≤from,to<32）
 */
export function flipAction(cell) {
  return cell * 33;
}

/**
 * @param {number} from 0-based cell
 * @param {number} to 0-based cell
 */
export function moveAction(from, to) {
  return from * 32 + to;
}

/**
 * @param {number} action
 */
export function decodeAction(action) {
  if (action % 33 === 0) {
    const cell = action / 33;
    return { from: cell, to: cell, isFlip: true };
  }
  return { from: Math.floor(action / 32), to: action % 32, isFlip: false };
}

/**
 * @param {Int16Array|number[]} state
 * @returns {Int16Array}
 */
export function cloneState(state) {
  return Int16Array.from(state);
}

/**
 * @param {Int16Array|number[]} state
 */
export function stateToJson(state) {
  return Array.from(state);
}

/**
 * @param {number[]} arr
 */
export function stateFromJson(arr) {
  return Int16Array.from(arr);
}

/**
 * @param {bigint|number} seed
 * @returns {Int16Array}
 */
export function createInitialState(seed) {
  const g = BanqiGameWasm.makeTest(BigInt(seed), 0);
  const st = g.state();
  g.free();
  return st;
}

/**
 * @param {Int16Array|number[]} state
 */
export function wrapGame(state) {
  return BanqiGameWasm.fromState(Int16Array.from(state));
}

/**
 * @param {Int16Array|number[]} state
 * @returns {number[]}
 */
function wasmLegalActions(state) {
  const g = wrapGame(state);
  const acts = Array.from(g.legalActions());
  g.free();
  return acts;
}

/**
 * 台灣暗棋合法走法（在 WASM 之上過濾炮／包鄰格與隔兩子以上）
 * @param {Int16Array|number[]} state
 * @returns {number[]}
 */
export function legalActions(state) {
  return wasmLegalActions(state).filter((a) => isTaiwanLegalAction(state, a));
}

/**
 * @param {Int16Array|number[]} state
 * @param {number} action
 * @param {bigint|number} seed
 */
export function applyAction(state, action, seed) {
  if (!isTaiwanLegalAction(state, action)) {
    throw new Error(`illegal Taiwan banqi action: ${action}`);
  }
  const g = wrapGame(state);
  const step = g.applyStep(action, BigInt(seed));
  const next = cloneState(step.state);
  const result = {
    state: next,
    done: step.done,
    draw: step.draw,
    winner: step.winner,
    reward: step.reward,
  };
  step.free();
  g.free();
  return result;
}

/**
 * @param {Int16Array|number[]} state
 * @returns {number}
 */
export function playerToMove(state) {
  return state[32];
}

/**
 * @param {Int16Array|number[]} state
 * @param {number} playerIdx
 * @returns {number} 0=black, 1=red, -1=未定
 */
export function playerAssignedColor(state, playerIdx) {
  return state[64 + playerIdx];
}

/**
 * @param {Int16Array|number[]} state
 * @returns {AnqiSide | null}
 */
export function turnColorSide(state) {
  const c = playerAssignedColor(state, playerToMove(state));
  if (c < 0) return null;
  return c === 1 ? "red" : "black";
}

/**
 * @param {Int16Array|number[]} state
 * @param {number} playerIdx
 * @returns {AnqiSide | null}
 */
export function playerSide(state, playerIdx) {
  const c = playerAssignedColor(state, playerIdx);
  if (c < 0) return null;
  return c === 1 ? "red" : "black";
}

/**
 * @param {Int16Array|number[]} state
 * @param {AnqiSide} side
 * @returns {number|null}
 */
export function sidePlayerIdx(state, side) {
  const want = side === "red" ? 1 : 0;
  if (state[64] === want) return 0;
  if (state[65] === want) return 1;
  return null;
}

/**
 * @param {Int16Array|number[]} state
 * @param {number} playerIdx
 */
export function isPlayerTurn(state, playerIdx) {
  return playerToMove(state) === playerIdx;
}

/**
 * @param {Int16Array|number[]} state
 * @param {number} fromCell
 * @returns {number[]}
 */
export function legalMovesFromCell(state, fromCell) {
  return legalActions(state).filter((a) => {
    const d = decodeAction(a);
    return !d.isFlip && d.from === fromCell;
  });
}

/**
 * @param {Int16Array|number[]} state
 * @returns {number[]}
 */
export function legalFlipCells(state) {
  return legalActions(state)
    .filter((a) => decodeAction(a).isFlip)
    .map((a) => decodeAction(a).from);
}

/**
 * @param {Int16Array|number[]} state
 * @param {number} depth
 * @param {string} evalMode
 * @param {number} [timeLimitMs]
 * @returns {Float32Array}
 */
export function minimaxScores(state, depth, evalMode, timeLimitMs) {
  const g = wrapGame(state);
  const scores = g.minimaxScores(
    depth,
    evalMode,
    timeLimitMs != null ? BigInt(timeLimitMs) : null,
    null,
  );
  g.free();
  return scores;
}

/**
 * @param {Int16Array|number[]} state
 * @param {number} simulations
 * @param {bigint|number} seed
 * @returns {number}
 */
export function mctsBestAction(state, simulations, seed) {
  const g = wrapGame(state);
  const variant = g.variant();
  const session = new MctsSessionWasm(
    Int16Array.from(state),
    variant,
    simulations,
    BigInt(seed),
    1.4,
    0.3,
    0.25,
    true,
    BigInt(8000),
    null,
  );
  const result = session.result(0, 1);
  const action = result.action;
  result.free();
  session.close();
  session.free();
  variant.free();
  g.free();
  return action;
}

/**
 * @param {Float32Array|number[]} scores
 * @param {number[]} legal
 */
export function pickBestAction(scores, legal) {
  let best = legal[0];
  let bestScore = -Infinity;
  for (const a of legal) {
    const s = scores[a] ?? -Infinity;
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best;
}

/**
 * @param {number[]} legal
 */
export function pickRandomAction(legal) {
  return legal[Math.floor(Math.random() * legal.length)];
}
