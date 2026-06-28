const BOARD_SIZE = 15;
const DEFAULT_STEP_MS = 520;

/** @typedef {{ row: number, col: number, player: string }} GomokuReplayMove */

/** @type {{ timer: ReturnType<typeof setTimeout> | null } | null} */
let activeReplay = null;

export function isGomokuReplayRunning() {
  return !!activeReplay;
}

export function stopGomokuReplay() {
  if (activeReplay?.timer) clearTimeout(activeReplay.timer);
  activeReplay = null;
}

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ""),
  );
}

/**
 * @param {object} opts
 * @param {GomokuReplayMove[]} opts.moves
 * @param {Set<number> | null} [opts.winLine]
 * @param {[number, number] | null} [opts.lastMove]
 * @param {(frame: { cells: (''|string)[][], index: number, total: number, lastMove: [number, number] | null }) => void} opts.onStep
 * @param {(text: string) => void} [opts.onStatus]
 * @param {(result: { cells: (''|string)[][], winLine: Set<number> | null, lastMove: [number, number] | null }) => void} [opts.onDone]
 * @param {number} [opts.stepMs]
 */
export function startGomokuReplay(opts) {
  stopGomokuReplay();
  const { moves, winLine = null, lastMove = null, onStep, onStatus, onDone, stepMs = DEFAULT_STEP_MS } =
    opts;
  if (!moves?.length) return;

  const cells = emptyBoard();
  let index = 0;

  const tick = () => {
    if (!activeReplay) return;
    if (index >= moves.length) {
      stopGomokuReplay();
      onDone?.({
        cells: cells.map((row) => [...row]),
        winLine,
        lastMove,
      });
      return;
    }

    const move = moves[index];
    cells[move.row][move.col] = move.player;
    index += 1;
    onStep?.({
      cells: cells.map((row) => [...row]),
      index,
      total: moves.length,
      lastMove: [move.row, move.col],
    });
    onStatus?.(`重播棋局 ${index}/${moves.length}`);
    activeReplay.timer = setTimeout(tick, stepMs);
  };

  activeReplay = { timer: null };
  onStep?.({ cells: emptyBoard(), index: 0, total: moves.length, lastMove: null });
  onStatus?.(`重播棋局 0/${moves.length}`);
  activeReplay.timer = setTimeout(tick, Math.max(120, stepMs * 0.35));
}
