/** 五子棋 AI 核心（主執行緒與 Worker 共用） */
import { wouldBlackForbidden } from "./gomoku-renju.js?v=gomoku-v5";

const SIZE = 15;
const CENTER = 7;
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** @type {Record<number, { depth: number, timeMs: number, radius: number }>} */
export const AI_LEVELS = {
  1: { depth: 2, timeMs: 450, radius: 1 },
  2: { depth: 3, timeMs: 1000, radius: 2 },
  3: { depth: 4, timeMs: 2000, radius: 2 },
  4: { depth: 5, timeMs: 3500, radius: 2 },
};

const SCORE = {
  WIN: 2_000_000,
  OPEN_FOUR: 120_000,
  CLOSED_FOUR: 12_000,
  OPEN_THREE: 8_000,
  CLOSED_THREE: 800,
  OPEN_TWO: 400,
  ONE: 40,
};

function hasFiveWin(cells, row, col, player) {
  return !!checkWin(cells, row, col, player);
}

function checkWin(cells, row, col, player) {
  for (const [dr, dc] of DIRS) {
    const line = [[row, col]];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (
        r >= 0 &&
        r < SIZE &&
        c >= 0 &&
        c < SIZE &&
        cells[r][c] === player
      ) {
        line.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 5) return true;
  }
  return false;
}

/**
 * @param {import('./gomoku-renju.js').Cell[][]} cells
 * @param {{
 *   aiId: string,
 *   blackId: string,
 *   whiteId: string,
 *   difficulty?: number,
 * }} opts
 * @returns {[number, number]|null}
 */
export function computeAiMove(cells, opts) {
  const { aiId, blackId, whiteId } = opts;
  const level = AI_LEVELS[opts.difficulty] || AI_LEVELS[2];
  const opponent = aiId === blackId ? whiteId : blackId;
  const deadline = Date.now() + level.timeMs;

  if (countStones(cells) === 0) return [CENTER, CENTER];

  const candidates = gatherCandidates(cells, level.radius);
  if (!candidates.length) return [CENTER, CENTER];

  /** @type {[number, number][]} */
  const legal = [];
  for (const [r, c] of candidates) {
    if (cells[r][c]) continue;
    if (isForbidden(cells, r, c, aiId, blackId, whiteId)) continue;
    legal.push([r, c]);
  }
  if (!legal.length) return null;

  let bestMove = legal[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const [r, c] of legal.sort(
    (a, b) => quickMoveScore(cells, b, aiId, opponent) - quickMoveScore(cells, a, aiId, opponent),
  )) {
    if (Date.now() > deadline) break;
    cells[r][c] = aiId;
    const win = hasFiveWin(cells, r, c, aiId);
    let score;
    if (win) {
      score = SCORE.WIN;
    } else if (level.depth <= 1) {
      score = evaluateBoard(cells, aiId, opponent);
    } else {
      score = -negamax(
        cells,
        level.depth - 1,
        -beta,
        -alpha,
        opponent,
        aiId,
        blackId,
        whiteId,
        deadline,
        level.radius,
      );
    }
    cells[r][c] = "";
    if (score > bestScore) {
      bestScore = score;
      bestMove = [r, c];
    }
    alpha = Math.max(alpha, score);
  }

  return bestMove;
}

function countStones(cells) {
  let n = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (cells[r][c]) n += 1;
    }
  }
  return n;
}

function gatherCandidates(cells, radius) {
  const set = new Set();
  if (countStones(cells) === 0) return [[CENTER, CENTER]];

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!cells[r][c]) continue;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
          if (cells[nr][nc]) continue;
          set.add(nr * SIZE + nc);
        }
      }
    }
  }

  if (!set.size) return [[CENTER, CENTER]];
  return [...set].map((code) => [Math.floor(code / SIZE), code % SIZE]);
}

function isForbidden(cells, r, c, player, blackId, whiteId) {
  if (player !== blackId) return false;
  return !!wouldBlackForbidden(cells, r, c, blackId, whiteId, hasFiveWin);
}

function quickMoveScore(cells, [r, c], me, opp) {
  cells[r][c] = me;
  const atk = evaluateBoard(cells, me, opp);
  cells[r][c] = "";
  cells[r][c] = opp;
  const def = evaluateBoard(cells, opp, me);
  cells[r][c] = "";
  return atk + def * 1.08;
}

function negamax(
  cells,
  depth,
  alpha,
  beta,
  player,
  opponent,
  blackId,
  whiteId,
  deadline,
  radius,
) {
  if (Date.now() > deadline || depth <= 0) {
    return evaluateBoard(cells, player, opponent);
  }

  const candidates = gatherCandidates(cells, radius);
  let best = -Infinity;

  for (const [r, c] of candidates) {
    if (cells[r][c]) continue;
    if (isForbidden(cells, r, c, player, blackId, whiteId)) continue;

    cells[r][c] = player;
    let score;
    if (hasFiveWin(cells, r, c, player)) {
      score = SCORE.WIN;
    } else {
      score = -negamax(
        cells,
        depth - 1,
        -beta,
        -alpha,
        opponent,
        player,
        blackId,
        whiteId,
        deadline,
        radius,
      );
    }
    cells[r][c] = "";

    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }

  return best === -Infinity ? evaluateBoard(cells, player, opponent) : best;
}

function evaluateBoard(cells, me, opp) {
  let score = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (cells[r][c] !== me) continue;
      for (const [dr, dc] of DIRS) {
        score += linePatternScore(cells, r, c, dr, dc, me);
      }
    }
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (cells[r][c] !== opp) continue;
      for (const [dr, dc] of DIRS) {
        score -= linePatternScore(cells, r, c, dr, dc, opp) * 1.05;
      }
    }
  }
  score -= (Math.abs(rCenter(cells, me) - CENTER) + Math.abs(cCenter(cells, me) - CENTER)) * 2;
  return score;
}

function rCenter(cells, player) {
  let sum = 0;
  let n = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (cells[r][c] === player) {
        sum += r;
        n += 1;
      }
    }
  }
  return n ? sum / n : CENTER;
}

function cCenter(cells, player) {
  let sum = 0;
  let n = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (cells[r][c] === player) {
        sum += c;
        n += 1;
      }
    }
  }
  return n ? sum / n : CENTER;
}

function linePatternScore(cells, r, c, dr, dc, player) {
  const prevR = r - dr;
  const prevC = c - dc;
  if (
    prevR >= 0 &&
    prevR < SIZE &&
    prevC >= 0 &&
    prevC < SIZE &&
    cells[prevR][prevC] === player
  ) {
    return 0;
  }

  let count = 1;
  let openEnds = 0;

  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && cells[nr][nc] === player) {
    count += 1;
    nr += dr;
    nc += dc;
  }
  if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && cells[nr][nc] === "") openEnds += 1;
  else if (!(nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE)) openEnds -= 2;

  const backR = r - dr;
  const backC = c - dc;
  if (backR >= 0 && backR < SIZE && backC >= 0 && backC < SIZE && cells[backR][backC] === "") {
    openEnds += 1;
  } else if (!(backR < 0 || backR >= SIZE || backC < 0 || backC >= SIZE)) {
    openEnds -= 2;
  }

  openEnds = Math.max(0, Math.min(2, openEnds));

  if (count >= 5) return SCORE.WIN;
  if (count === 4) return openEnds === 2 ? SCORE.OPEN_FOUR : openEnds === 1 ? SCORE.CLOSED_FOUR : 0;
  if (count === 3) return openEnds === 2 ? SCORE.OPEN_THREE : openEnds === 1 ? SCORE.CLOSED_THREE : 0;
  if (count === 2) return openEnds >= 1 ? SCORE.OPEN_TWO : SCORE.ONE;
  return SCORE.ONE;
}
