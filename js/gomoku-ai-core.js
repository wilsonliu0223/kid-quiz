/** 五子棋 AI 核心（主執行緒與 Worker 共用） */
import { wouldBlackForbidden } from "./gomoku-renju.js?v=gomoku-v8";
import {
  adaptiveBuiltinTimeMs,
  OPENING_INSTANT_MAX_STONES,
} from "./gomoku-ai-timing.js?v=gomoku-v5";
import {
  createThreatContext,
  findImmediateWinMove,
  findMustBlockMove,
  findThreatDefenseMove,
  getFourThreatMoves,
  getOpenThreeThreatMoves,
  findProactiveDefenseMove,
  pickOpeningMove,
  solveVcf,
  solveVct,
} from "./gomoku-ai-threat.js?v=gomoku-v9";

const SIZE = 15;
const CENTER = 7;
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** @type {Record<number, { depth: number, timeMs: number, radius: number, useThreats?: boolean, vcfDepth?: number, vctDepth?: number }>} */
export const AI_LEVELS = {
  1: { depth: 2, timeMs: 450, radius: 1 },
  2: { depth: 3, timeMs: 1000, radius: 2 },
  3: { depth: 4, timeMs: 2000, radius: 2 },
  4: { depth: 5, timeMs: 3500, radius: 2 },
  5: { depth: 10, timeMs: 20000, radius: 4, useThreats: true, vcfDepth: 32, vctDepth: 22 },
};

export const GRANDMASTER_LEVEL = 5;

const SCORE = {
  WIN: 2_000_000,
  OPEN_FOUR: 120_000,
  CLOSED_FOUR: 12_000,
  OPEN_THREE: 8_000,
  CLOSED_THREE: 800,
  OPEN_TWO: 400,
  ONE: 40,
};

/** @type {Map<string, { depth: number, score: number }>} */
let transpositionTable = new Map();

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

function isForbidden(cells, r, c, player, blackId, whiteId) {
  if (player !== blackId) return false;
  return !!wouldBlackForbidden(cells, r, c, blackId, whiteId, hasFiveWin);
}

const threatCtx = createThreatContext({
  hasFiveWin,
  isForbidden,
});

function boardKey(cells, player) {
  let key = player;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      key += cells[r][c] ? `|${cells[r][c]}` : "|.";
    }
  }
  return key;
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
  const stones = countStones(cells);

  if (stones === 0) return [CENTER, CENTER];

  const opening = pickOpeningMove(cells, aiId, opponent, stones);
  if (opening && stones <= OPENING_INSTANT_MAX_STONES) return opening;

  const timeMs = adaptiveBuiltinTimeMs(level.timeMs, stones);
  const searchDeadline = Date.now() + timeMs;
  const tacticalDeadline =
    Date.now() + (level.useThreats ? Math.min(6000, timeMs * 0.3) : timeMs);

  if (level.useThreats) {
    transpositionTable = new Map();

    const win = findImmediateWinMove(cells, aiId, threatCtx, blackId, whiteId);
    if (win) return win;

    const block = findMustBlockMove(cells, opponent, aiId, threatCtx, blackId, whiteId);
    if (block) return block;

    const proactive = findProactiveDefenseMove(cells, aiId, opponent, threatCtx, blackId, whiteId);
    if (proactive) return proactive;

    const vct = solveVct(
      cells,
      aiId,
      opponent,
      threatCtx,
      blackId,
      whiteId,
      level.vctDepth ?? 22,
      tacticalDeadline,
    );
    if (vct) return vct;

    const vcf = solveVcf(
      cells,
      aiId,
      opponent,
      threatCtx,
      blackId,
      whiteId,
      level.vcfDepth ?? 32,
      tacticalDeadline,
    );
    if (vcf) return vcf;

    const defense = findThreatDefenseMove(
      cells,
      aiId,
      opponent,
      threatCtx,
      blackId,
      whiteId,
      level.vctDepth ?? 22,
      tacticalDeadline,
    );
    if (defense) return defense;
  }

  const candidates = gatherCandidates(cells, level.radius, level.useThreats ? aiId : null, blackId, whiteId);
  if (!candidates.length) return [CENTER, CENTER];

  /** @type {[number, number][]} */
  const legal = [];
  for (const [r, c] of candidates) {
    if (cells[r][c]) continue;
    if (isForbidden(cells, r, c, aiId, blackId, whiteId)) continue;
    legal.push([r, c]);
  }
  if (!legal.length) return null;

  const sorted = legal.sort(
    (a, b) => quickMoveScore(cells, b, aiId, opponent) - quickMoveScore(cells, a, aiId, opponent),
  );

  if (level.useThreats) {
    let bestMove = sorted[0];
    const minDepth = 5;
    for (let depth = minDepth; depth <= level.depth; depth += 1) {
      if (Date.now() > searchDeadline) break;
      let bestScore = -Infinity;
      let alpha = -Infinity;
      const beta = Infinity;
      let depthBest = bestMove;

      for (const [r, c] of sorted) {
        if (Date.now() > searchDeadline) break;
        cells[r][c] = aiId;
        const win = hasFiveWin(cells, r, c, aiId);
        let score;
        if (win) {
          score = SCORE.WIN;
        } else if (depth <= 1) {
          score = evaluateBoard(cells, aiId, opponent);
        } else {
          score = -negamax(
            cells,
            depth - 1,
            -beta,
            -alpha,
            opponent,
            aiId,
            blackId,
            whiteId,
            searchDeadline,
            level.radius,
            true,
          );
        }
        cells[r][c] = "";
        if (score > bestScore) {
          bestScore = score;
          depthBest = [r, c];
        }
        alpha = Math.max(alpha, score);
      }
      bestMove = depthBest;
    }
    return bestMove;
  }

  let bestMove = sorted[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const [r, c] of sorted) {
    if (Date.now() > searchDeadline) break;
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
        searchDeadline,
        level.radius,
        false,
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

/**
 * 宗師／涅槃走 Rapfi 前的同步戰術層（必勝、必防、搶先防禦）
 * @param {import('./gomoku-renju.js').Cell[][]} cells
 * @param {{ aiId: string, blackId: string, whiteId: string }} opts
 * @returns {[number, number]|null}
 */
export function findUrgentTacticalMove(cells, opts) {
  const { aiId, blackId, whiteId } = opts;
  const opponent = aiId === blackId ? whiteId : blackId;

  const win = findImmediateWinMove(cells, aiId, threatCtx, blackId, whiteId);
  if (win) return win;

  const block = findMustBlockMove(cells, opponent, aiId, threatCtx, blackId, whiteId);
  if (block) return block;

  return findProactiveDefenseMove(cells, aiId, opponent, threatCtx, blackId, whiteId);
}

/**
 * 涅槃滿血：僅必勝／必防才跳過 Rapfi，其餘交給引擎深度搜尋
 */
export function findNirvanaTacticalMove(cells, opts) {
  const { aiId, blackId, whiteId } = opts;
  const opponent = aiId === blackId ? whiteId : blackId;

  const win = findImmediateWinMove(cells, aiId, threatCtx, blackId, whiteId);
  if (win) return win;

  return findMustBlockMove(cells, opponent, aiId, threatCtx, blackId, whiteId);
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

function gatherCandidates(cells, radius, threatPlayer, blackId, whiteId) {
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

  if (threatPlayer && blackId && whiteId) {
    for (const [r, c] of getFourThreatMoves(cells, threatPlayer, threatCtx, blackId, whiteId, radius)) {
      set.add(r * SIZE + c);
    }
    const opponent = threatPlayer === blackId ? whiteId : blackId;
    for (const [r, c] of getFourThreatMoves(cells, opponent, threatCtx, blackId, whiteId, radius)) {
      set.add(r * SIZE + c);
    }
    for (const [r, c] of getOpenThreeThreatMoves(cells, threatPlayer, threatCtx, blackId, whiteId, radius)) {
      set.add(r * SIZE + c);
    }
    for (const [r, c] of getOpenThreeThreatMoves(cells, opponent, threatCtx, blackId, whiteId, radius)) {
      set.add(r * SIZE + c);
    }
  }

  if (!set.size) return [[CENTER, CENTER]];
  return [...set].map((code) => [Math.floor(code / SIZE), code % SIZE]);
}

function quickMoveScore(cells, [r, c], me, opp) {
  cells[r][c] = me;
  const atk = evaluateBoard(cells, me, opp);
  cells[r][c] = "";
  cells[r][c] = opp;
  const def = evaluateBoard(cells, opp, me);
  cells[r][c] = "";
  return atk + def * 1.18;
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
  threatPrune,
) {
  if (Date.now() > deadline) {
    return evaluateBoard(cells, player, opponent);
  }

  const key = boardKey(cells, player);
  const cached = transpositionTable.get(key);
  if (cached && cached.depth >= depth) {
    return cached.score;
  }

  if (depth <= 0) {
    const score = evaluateBoard(cells, player, opponent);
    transpositionTable.set(key, { depth, score });
    return score;
  }

  let candidates = gatherCandidates(cells, radius, threatPrune ? player : null, blackId, whiteId);
  if (threatPrune && depth <= 3) {
    const threats = getFourThreatMoves(cells, player, threatCtx, blackId, whiteId, radius);
    const blocks = getFourThreatMoves(cells, opponent, threatCtx, blackId, whiteId, radius);
    const urgent = new Set([...threats, ...blocks].map(([r, c]) => r * SIZE + c));
    if (urgent.size) {
      candidates = candidates.filter(([r, c]) => urgent.has(r * SIZE + c));
      if (!candidates.length) {
        candidates = gatherCandidates(cells, radius, player, blackId, whiteId);
      }
    }
  }

  candidates.sort(
    (a, b) => quickMoveScore(cells, b, player, opponent) - quickMoveScore(cells, a, player, opponent),
  );
  if (threatPrune && candidates.length > 24) {
    candidates = candidates.slice(0, 24);
  }

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
        threatPrune,
      );
    }
    cells[r][c] = "";

    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }

  const result = best === -Infinity ? evaluateBoard(cells, player, opponent) : best;
  transpositionTable.set(key, { depth, score: result });
  return result;
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
        score -= linePatternScore(cells, r, c, dr, dc, opp) * 1.08;
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
