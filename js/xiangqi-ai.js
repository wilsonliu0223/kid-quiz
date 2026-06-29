import {
  applyMove,
  cloneBoard,
  gameResult,
  getLegalMoves,
  isInCheck,
  opponent,
  pieceValue,
} from "./xiangqi-core.js";

export const AI_PLAYER_ID = "__xiangqi_ai__";

const MATERIAL = {
  r: 900,
  n: 400,
  c: 450,
  b: 200,
  a: 200,
  p: 100,
  k: 20000,
};

function evalBoard(board, aiSide) {
  let score = 0;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const p = board[r][c];
      if (!p) continue;
      const v = MATERIAL[p.toLowerCase()] || 0;
      const side = p === p.toUpperCase() ? "red" : "black";
      score += side === aiSide ? v : -v;
    }
  }
  return score;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function minimax(board, side, depth, aiSide, alpha, beta) {
  const terminal = gameResult(board, side);
  if (terminal) {
    if (!terminal.winner) return 0;
    return terminal.winner === aiSide ? 100000 - depth : -100000 + depth;
  }
  if (depth <= 0) return evalBoard(board, aiSide);

  const moves = getLegalMoves(board, side);
  if (side === aiSide) {
    let best = -Infinity;
    for (const m of moves) {
      const next = applyMove(board, m);
      best = Math.max(best, minimax(next, opponent(side), depth - 1, aiSide, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    const next = applyMove(board, m);
    best = Math.min(best, minimax(next, opponent(side), depth - 1, aiSide, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

/**
 * @param {object} opts
 * @param {string[][]} opts.board
 * @param {"red"|"black"} opts.turn
 * @param {"red"|"black"} opts.aiSide
 * @param {number} opts.level
 */
export function chooseAiMove(opts) {
  const { board, turn, aiSide, level } = opts;
  if (turn !== aiSide) return null;
  const moves = getLegalMoves(board, turn);
  if (!moves.length) return null;

  if (level <= 1) {
    const safe = moves.filter((m) => {
      const next = applyMove(board, m);
      return !isInCheck(next, aiSide);
    });
    return pickRandom(safe.length ? safe : moves);
  }

  if (level === 2) {
    const scored = moves.map((m) => {
      let s = (m.capture ? pieceValue(m.capture) * 10 : 0) + Math.random() * 0.4;
      const next = applyMove(board, m);
      if (isInCheck(next, opponent(aiSide))) s += 3;
      return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored[0].m;
  }

  const depth = level >= 4 ? 3 : 2;
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const next = applyMove(board, m);
    const score = minimax(next, opponent(turn), depth - 1, aiSide, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return bestMove;
}
