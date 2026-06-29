import {
  applyMove,
  gameResult,
  getLegalMoves,
  isInCheck,
  opponent,
  pieceValue,
  ROWS,
  COLS,
} from "./xiangqi-core.js";

export const GRANDMASTER_LEVEL = 5;
export const MASTER_WORKER_LEVEL = 4;

const MATERIAL = {
  r: 980,
  n: 420,
  c: 460,
  b: 210,
  a: 210,
  p: 105,
  k: 50000,
};

/** 紅方視角：越靠前（row 小）分數越高 */
const PAWN_RED = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [6, 8, 10, 14, 16, 14, 10, 8, 6],
  [12, 16, 20, 26, 30, 26, 20, 16, 12],
  [18, 22, 28, 34, 40, 34, 28, 22, 18],
  [24, 30, 36, 42, 48, 42, 36, 30, 24],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const HORSE = [
  [0, 2, 4, 4, 4, 4, 4, 2, 0],
  [2, 6, 8, 10, 10, 10, 8, 6, 2],
  [4, 8, 12, 14, 14, 14, 12, 8, 4],
  [4, 10, 14, 16, 18, 16, 14, 10, 4],
  [4, 10, 14, 18, 20, 18, 14, 10, 4],
  [4, 10, 14, 18, 20, 18, 14, 10, 4],
  [4, 10, 14, 16, 18, 16, 14, 10, 4],
  [2, 6, 8, 10, 10, 10, 8, 6, 2],
  [0, 2, 4, 4, 4, 4, 4, 2, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const CANNON = [
  [0, 0, 2, 4, 4, 4, 2, 0, 0],
  [0, 2, 4, 6, 8, 6, 4, 2, 0],
  [2, 4, 8, 10, 12, 10, 8, 4, 2],
  [2, 6, 10, 12, 14, 12, 10, 6, 2],
  [4, 8, 12, 14, 16, 14, 12, 8, 4],
  [4, 8, 12, 14, 16, 14, 12, 8, 4],
  [2, 6, 10, 12, 14, 12, 10, 6, 2],
  [2, 4, 8, 10, 12, 10, 8, 4, 2],
  [0, 2, 4, 6, 8, 6, 4, 2, 0],
  [0, 0, 2, 4, 4, 4, 2, 0, 0],
];

function mirrorRow(r) {
  return ROWS - 1 - r;
}

function pstBonus(piece, r, c, aiSide) {
  const side = piece === piece.toUpperCase() ? "red" : "black";
  const row = side === "red" ? r : mirrorRow(r);
  const type = piece.toLowerCase();
  if (type === "p") return PAWN_RED[row]?.[c] || 0;
  if (type === "n") return HORSE[row]?.[c] || 0;
  if (type === "c") return CANNON[row]?.[c] || 0;
  return 0;
}

function mobility(board, side) {
  return getLegalMoves(board, side).length;
}

function evalBoard(board, aiSide) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      const side = p === p.toUpperCase() ? "red" : "black";
      const sign = side === aiSide ? 1 : -1;
      const mat = MATERIAL[p.toLowerCase()] || 0;
      const pst = pstBonus(p, r, c, aiSide);
      score += sign * (mat + pst);
    }
  }
  const myMob = mobility(board, aiSide);
  const oppMob = mobility(board, opponent(aiSide));
  score += (myMob - oppMob) * 3;
  if (isInCheck(board, opponent(aiSide))) score += 28;
  if (isInCheck(board, aiSide)) score -= 48;
  return score;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function moveScore(board, move, side) {
  let s = 0;
  if (move.capture) {
    const victim = pieceValue(move.capture) * 10;
    const [fr, fc] = move.from;
    const attacker = board[fr][fc];
    const attVal = attacker ? pieceValue(attacker) : 1;
    s += victim * 10 - attVal;
  }
  const next = applyMove(board, move);
  if (isInCheck(next, opponent(side))) s += 50;
  return s;
}

function orderMoves(board, moves, side) {
  return [...moves].sort((a, b) => moveScore(board, b, side) - moveScore(board, a, side));
}

function terminalScore(terminal, aiSide, depth) {
  if (!terminal.winner) return 0;
  return terminal.winner === aiSide ? 200000 - depth : -200000 + depth;
}

function quiescence(board, side, aiSide, alpha, beta, depth) {
  const stand = evalBoard(board, aiSide);
  if (depth <= 0) return stand;

  if (side === aiSide) {
    let best = stand;
    if (best >= beta) return best;
    alpha = Math.max(alpha, best);
    const moves = orderMoves(
      board,
      getLegalMoves(board, side).filter((m) => m.capture || isInCheck(applyMove(board, m), opponent(side))),
      side,
    );
    for (const m of moves) {
      const next = applyMove(board, m);
      const s = quiescence(next, opponent(side), aiSide, alpha, beta, depth - 1);
      best = Math.max(best, s);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = stand;
  if (best <= alpha) return best;
  beta = Math.min(beta, best);
  const moves = orderMoves(
    board,
    getLegalMoves(board, side).filter((m) => m.capture || isInCheck(applyMove(board, m), opponent(side))),
    side,
  );
  for (const m of moves) {
    const next = applyMove(board, m);
    const s = quiescence(next, opponent(side), aiSide, alpha, beta, depth - 1);
    best = Math.min(best, s);
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function minimax(board, side, depth, aiSide, alpha, beta, quiesceDepth) {
  const terminal = gameResult(board, side);
  if (terminal) return terminalScore(terminal, aiSide, depth);
  if (depth <= 0) return quiescence(board, side, aiSide, alpha, beta, quiesceDepth);

  const moves = orderMoves(board, getLegalMoves(board, side), side);
  if (side === aiSide) {
    let best = -Infinity;
    for (const m of moves) {
      const next = applyMove(board, m);
      const s = minimax(next, opponent(side), depth - 1, aiSide, alpha, beta, quiesceDepth);
      best = Math.max(best, s);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    const next = applyMove(board, m);
    const s = minimax(next, opponent(side), depth - 1, aiSide, alpha, beta, quiesceDepth);
    best = Math.min(best, s);
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function searchBestMove(board, turn, aiSide, depth, quiesceDepth) {
  const moves = orderMoves(board, getLegalMoves(board, turn), turn);
  let bestMove = moves[0] || null;
  let bestScore = -Infinity;
  for (const m of moves) {
    const next = applyMove(board, m);
    const score = minimax(next, opponent(turn), depth - 1, aiSide, -Infinity, Infinity, quiesceDepth);
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return bestMove;
}

function iterativeBestMove(board, turn, aiSide, maxDepth, quiesceDepth, timeMs) {
  const deadline = Date.now() + timeMs;
  let bestMove = searchBestMove(board, turn, aiSide, 2, quiesceDepth);
  for (let d = 3; d <= maxDepth; d++) {
    if (Date.now() >= deadline) break;
    const m = searchBestMove(board, turn, aiSide, d, quiesceDepth);
    if (m) bestMove = m;
  }
  return bestMove;
}

/**
 * @param {object} opts
 * @param {string[][]} opts.board
 * @param {"red"|"black"} opts.turn
 * @param {"red"|"black"} opts.aiSide
 * @param {number} opts.level
 */
export function computeXiangqiAiMove(opts) {
  const { board, turn, aiSide, level } = opts;
  if (turn !== aiSide) return null;
  const moves = getLegalMoves(board, turn);
  if (!moves.length) return null;

  if (level <= 1) {
    const safe = moves.filter((m) => !isInCheck(applyMove(board, m), aiSide));
    return pickRandom(safe.length ? safe : moves);
  }

  if (level === 2) {
    const scored = moves.map((m) => {
      let s = (m.capture ? pieceValue(m.capture) * 10 : 0) + Math.random() * 0.35;
      const next = applyMove(board, m);
      if (isInCheck(next, opponent(aiSide))) s += 4;
      if (isInCheck(next, aiSide)) s -= 12;
      return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored[0].m;
  }

  if (level === 3) {
    return searchBestMove(board, turn, aiSide, 2, 1);
  }

  if (level === 4) {
    return searchBestMove(board, turn, aiSide, 3, 3);
  }

  return iterativeBestMove(board, turn, aiSide, 6, 4, 4800);
}
