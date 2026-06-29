import { createBoard, applyMove } from "./xiangqi-core.js";

const DEFAULT_STEP_MS = 520;

/** @typedef {{ from: [number, number], to: [number, number] }} XiangqiReplayMove */

/** @type {{ timer: ReturnType<typeof setTimeout> | null } | null} */
let activeReplay = null;

export function isXiangqiReplayRunning() {
  return !!activeReplay;
}

export function stopXiangqiReplay() {
  if (activeReplay?.timer) clearTimeout(activeReplay.timer);
  activeReplay = null;
}

/**
 * @param {object} opts
 * @param {XiangqiReplayMove[]} opts.moves
 * @param {[number, number] | null} [opts.lastMove]
 * @param {(frame: { board: string[][], index: number, total: number, lastMove: [number, number] | null }) => void} opts.onStep
 * @param {(text: string) => void} [opts.onStatus]
 * @param {(result: { board: string[][], lastMove: [number, number] | null }) => void} [opts.onDone]
 * @param {number} [opts.stepMs]
 */
export function startXiangqiReplay(opts) {
  stopXiangqiReplay();
  const { moves, lastMove = null, onStep, onStatus, onDone, stepMs = DEFAULT_STEP_MS } = opts;
  if (!moves?.length) return;

  let board = createBoard();
  let index = 0;

  const tick = () => {
    if (!activeReplay) return;
    if (index >= moves.length) {
      stopXiangqiReplay();
      onDone?.({
        board: board.map((row) => [...row]),
        lastMove,
      });
      return;
    }

    const move = moves[index];
    board = applyMove(board, move);
    index += 1;
    onStep?.({
      board: board.map((row) => [...row]),
      index,
      total: moves.length,
      lastMove: move.to,
    });
    onStatus?.(`重播棋局 ${index}/${moves.length}`);
    activeReplay.timer = setTimeout(tick, stepMs);
  };

  activeReplay = { timer: null };
  onStep?.({ board: createBoard(), index: 0, total: moves.length, lastMove: null });
  onStatus?.(`重播棋局 0/${moves.length}`);
  activeReplay.timer = setTimeout(tick, Math.max(120, stepMs * 0.35));
}
