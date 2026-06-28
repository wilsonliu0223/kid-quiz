/** 五子棋威脅搜尋：必殺／必防、VCF、VCT（宗師級） */

const SIZE = 15;
const CENTER = 7;
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * @param {object} ctx
 * @param {(cells: (''|string)[][], r: number, c: number, player: string) => boolean} ctx.hasFiveWin
 * @param {(cells: (''|string)[][], r: number, c: number, player: string, blackId: string, whiteId: string) => boolean} ctx.isForbidden
 */
export function createThreatContext(ctx) {
  return ctx;
}

/**
 * @param {(''|string)[][]} cells
 * @param {string} player
 * @param {ReturnType<typeof createThreatContext>} ctx
 * @param {string} blackId
 * @param {string} whiteId
 * @returns {[number, number]|null}
 */
export function findImmediateWinMove(cells, player, ctx, blackId, whiteId) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (cells[r][c]) continue;
      if (ctx.isForbidden(cells, r, c, player, blackId, whiteId)) continue;
      cells[r][c] = player;
      const win = ctx.hasFiveWin(cells, r, c, player);
      cells[r][c] = "";
      if (win) return [r, c];
    }
  }
  return null;
}

/**
 * @param {(''|string)[][]} cells
 * @param {string} attacker
 * @param {string} defender
 * @param {ReturnType<typeof createThreatContext>} ctx
 * @param {string} blackId
 * @param {string} whiteId
 * @returns {[number, number]|null}
 */
export function findMustBlockMove(cells, attacker, defender, ctx, blackId, whiteId) {
  return findImmediateWinMove(cells, attacker, ctx, blackId, whiteId);
}

/**
 * @param {(''|string)[][]} cells
 * @param {number} radius
 * @returns {[number, number][]}
 */
export function gatherNearCells(cells, radius) {
  const set = new Set();
  let stones = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!cells[r][c]) continue;
      stones += 1;
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
  if (!stones) return [[CENTER, CENTER]];
  if (!set.size) return [[CENTER, CENTER]];
  return [...set].map((code) => [Math.floor(code / SIZE), code % SIZE]);
}

/**
 * @param {(''|string)[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {number} dr
 * @param {number} dc
 * @param {string} player
 */
function lineInfoAfterPlace(cells, r, c, dr, dc, player) {
  let count = 1;
  let openEnds = 0;

  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && cells[nr][nc] === player) {
    count += 1;
    nr += dr;
    nc += dc;
  }
  const fwdOpen = nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && cells[nr][nc] === "";
  if (fwdOpen) openEnds += 1;

  let br = r - dr;
  let bc = c - dc;
  while (br >= 0 && br < SIZE && bc >= 0 && bc < SIZE && cells[br][bc] === player) {
    count += 1;
    br -= dr;
    bc -= dc;
  }
  const backOpen = br >= 0 && br < SIZE && bc >= 0 && bc < SIZE && cells[br][bc] === "";
  if (backOpen) openEnds += 1;

  return { count, openEnds };
}

/**
 * @param {(''|string)[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {string} player
 */
function createsFourOrWin(cells, r, c, player) {
  cells[r][c] = player;
  let threat = false;
  for (const [dr, dc] of DIRS) {
    const { count, openEnds } = lineInfoAfterPlace(cells, r, c, dr, dc, player);
    if (count >= 5) threat = true;
    if (count === 4 && openEnds >= 1) threat = true;
  }
  cells[r][c] = "";
  return threat;
}

/**
 * @param {(''|string)[][]} cells
 * @param {string} player
 * @param {ReturnType<typeof createThreatContext>} ctx
 * @param {string} blackId
 * @param {string} whiteId
 * @param {number} [radius]
 * @returns {[number, number][]}
 */
export function getFourThreatMoves(cells, player, ctx, blackId, whiteId, radius = 3) {
  /** @type {[number, number][]} */
  const out = [];
  const seen = new Set();
  for (const [r, c] of gatherNearCells(cells, radius)) {
    if (cells[r][c]) continue;
    if (ctx.isForbidden(cells, r, c, player, blackId, whiteId)) continue;
    const code = r * SIZE + c;
    if (seen.has(code)) continue;
    cells[r][c] = player;
    const win = ctx.hasFiveWin(cells, r, c, player);
    const four = !win && createsFourOrWin(cells, r, c, player);
    cells[r][c] = "";
    if (win || four) {
      seen.add(code);
      out.push([r, c]);
    }
  }
  return out;
}

/**
 * @param {(''|string)[][]} cells
 * @param {string} attacker
 * @param {number} attackR
 * @param {number} attackC
 */
function getWinningPointsAfterThreat(cells, attacker, attackR, attackC) {
  /** @type {[number, number][]} */
  const points = [];
  const seen = new Set();
  for (const [dr, dc] of DIRS) {
    const { count, openEnds } = lineInfoAfterPlace(cells, attackR, attackC, dr, dc, attacker);
    if (count < 4) continue;
    if (count >= 5) continue;
    if (openEnds === 0) continue;

    for (const sign of [-1, 1]) {
      let r = attackR + dr * sign;
      let c = attackC + dc * sign;
      let stones = 1;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[r][c] === attacker) {
        stones += 1;
        r += dr * sign;
        c += dc * sign;
      }
      if (stones === 4 && r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[r][c] === "") {
        const code = r * SIZE + c;
        if (!seen.has(code)) {
          seen.add(code);
          points.push([r, c]);
        }
      }
    }
  }
  return points;
}

/**
 * @param {(''|string)[][]} cells
 * @param {string} attacker
 * @param {string} defender
 * @param {number} attackR
 * @param {number} attackC
 * @param {ReturnType<typeof createThreatContext>} ctx
 * @param {string} blackId
 * @param {string} whiteId
 */
function getVcfBlockMoves(cells, attacker, defender, attackR, attackC, ctx, blackId, whiteId) {
  const winPts = getWinningPointsAfterThreat(cells, attacker, attackR, attackC);
  /** @type {[number, number][]} */
  const blocks = [];
  const seen = new Set();
  for (const [r, c] of winPts) {
    if (cells[r][c]) continue;
    const code = r * SIZE + c;
    if (seen.has(code)) continue;
    if (ctx.isForbidden(cells, r, c, defender, blackId, whiteId)) continue;
    seen.add(code);
    blocks.push([r, c]);
  }
  return blocks;
}

/**
 * @param {(''|string)[][]} cells
 * @param {string} attacker
 * @param {string} defender
 * @param {ReturnType<typeof createThreatContext>} ctx
 * @param {string} blackId
 * @param {string} whiteId
 * @param {number} maxDepth
 * @param {number} deadline
 * @returns {[number, number]|null}
 */
export function solveVcf(cells, attacker, defender, ctx, blackId, whiteId, maxDepth, deadline) {
  if (maxDepth <= 0 || Date.now() > deadline) return null;

  const threats = getFourThreatMoves(cells, attacker, ctx, blackId, whiteId, 3);
  for (const [ar, ac] of threats) {
    if (Date.now() > deadline) return null;
    cells[ar][ac] = attacker;
    if (ctx.hasFiveWin(cells, ar, ac, attacker)) {
      cells[ar][ac] = "";
      return [ar, ac];
    }

    const blocks = getVcfBlockMoves(cells, attacker, defender, ar, ac, ctx, blackId, whiteId);
    if (!blocks.length) {
      cells[ar][ac] = "";
      return [ar, ac];
    }

    let winsAll = true;
    for (const [br, bc] of blocks) {
      if (Date.now() > deadline) {
        winsAll = false;
        break;
      }
      cells[br][bc] = defender;
      const cont = solveVcf(cells, attacker, defender, ctx, blackId, whiteId, maxDepth - 1, deadline);
      cells[br][bc] = "";
      if (!cont) {
        winsAll = false;
        break;
      }
    }
    cells[ar][ac] = "";
    if (winsAll) return [ar, ac];
  }
  return null;
}

/**
 * @param {(''|string)[][]} cells
 * @param {string} attacker
 * @param {string} defender
 * @param {number} attackR
 * @param {number} attackC
 * @param {ReturnType<typeof createThreatContext>} ctx
 * @param {string} blackId
 * @param {string} whiteId
 */
function getVctResponses(cells, attacker, defender, attackR, attackC, ctx, blackId, whiteId) {
  const blocks = getVcfBlockMoves(cells, attacker, defender, attackR, attackC, ctx, blackId, whiteId);
  const counters = getFourThreatMoves(cells, defender, ctx, blackId, whiteId, 3);
  const seen = new Set();
  /** @type {[number, number][]} */
  const out = [];
  for (const [r, c] of [...blocks, ...counters]) {
    const code = r * SIZE + c;
    if (seen.has(code)) continue;
    if (cells[r][c]) continue;
    if (ctx.isForbidden(cells, r, c, defender, blackId, whiteId)) continue;
    seen.add(code);
    out.push([r, c]);
  }
  return out;
}

/**
 * @param {(''|string)[][]} cells
 * @param {string} attacker
 * @param {string} defender
 * @param {ReturnType<typeof createThreatContext>} ctx
 * @param {string} blackId
 * @param {string} whiteId
 * @param {number} maxDepth
 * @param {number} deadline
 * @returns {[number, number]|null}
 */
export function solveVct(cells, attacker, defender, ctx, blackId, whiteId, maxDepth, deadline) {
  if (maxDepth <= 0 || Date.now() > deadline) return null;

  const threats = getFourThreatMoves(cells, attacker, ctx, blackId, whiteId, 3);
  for (const [ar, ac] of threats) {
    if (Date.now() > deadline) return null;
    cells[ar][ac] = attacker;
    if (ctx.hasFiveWin(cells, ar, ac, attacker)) {
      cells[ar][ac] = "";
      return [ar, ac];
    }

    const responses = getVctResponses(cells, attacker, defender, ar, ac, ctx, blackId, whiteId);
    if (!responses.length) {
      cells[ar][ac] = "";
      return [ar, ac];
    }

    let winsAll = true;
    for (const [dr, dc] of responses) {
      if (Date.now() > deadline) {
        winsAll = false;
        break;
      }
      cells[dr][dc] = defender;
      let attackerContinues = false;
      if (ctx.hasFiveWin(cells, dr, dc, defender)) {
        attackerContinues = false;
      } else {
        const counter = solveVct(cells, defender, attacker, ctx, blackId, whiteId, maxDepth - 1, deadline);
        if (counter) {
          attackerContinues = false;
        } else {
          const vcf = solveVcf(cells, attacker, defender, ctx, blackId, whiteId, maxDepth - 1, deadline);
          attackerContinues = !!vcf;
        }
      }
      cells[dr][dc] = "";
      if (!attackerContinues) {
        winsAll = false;
        break;
      }
    }
    cells[ar][ac] = "";
    if (winsAll) return [ar, ac];
  }
  return null;
}

/**
 * 找一手破壞對手 VCF/VCT 的棋
 * @param {(''|string)[][]} cells
 * @param {string} me
 * @param {string} opp
 * @param {ReturnType<typeof createThreatContext>} ctx
 * @param {string} blackId
 * @param {string} whiteId
 * @param {number} maxDepth
 * @param {number} deadline
 * @returns {[number, number]|null}
 */
export function findThreatDefenseMove(cells, me, opp, ctx, blackId, whiteId, maxDepth, deadline) {
  const oppVct = solveVct(cells, opp, me, ctx, blackId, whiteId, maxDepth, deadline);
  if (!oppVct) return null;

  const candidates = gatherNearCells(cells, 3);
  let best = null;
  let bestScore = -Infinity;

  for (const [r, c] of candidates) {
    if (Date.now() > deadline) break;
    if (cells[r][c]) continue;
    if (ctx.isForbidden(cells, r, c, me, blackId, whiteId)) continue;
    cells[r][c] = me;
    const still = solveVct(cells, opp, me, ctx, blackId, whiteId, Math.max(8, maxDepth - 2), deadline);
    let score = still ? -1000 : 1000;
    if (!still) {
      const myVcf = solveVcf(cells, me, opp, ctx, blackId, whiteId, 6, deadline);
      if (myVcf) score += 200;
    }
    cells[r][c] = "";
    if (score > bestScore) {
      bestScore = score;
      best = [r, c];
    }
  }
  return best;
}

/** 簡易開局庫（前三手） */
const OPENING_REPLIES = [
  [6, 7],
  [7, 6],
  [8, 7],
  [7, 8],
  [6, 6],
  [8, 8],
  [6, 8],
  [8, 6],
];

/**
 * @param {(''|string)[][]} cells
 * @param {string} aiId
 * @param {string} opponent
 * @param {number} stoneCount
 * @returns {[number, number]|null}
 */
export function pickOpeningMove(cells, aiId, opponent, stoneCount) {
  if (stoneCount === 0) return [CENTER, CENTER];
  if (stoneCount === 1) {
    for (const [r, c] of OPENING_REPLIES) {
      if (!cells[r][c]) return [r, c];
    }
  }
  if (stoneCount === 2) {
    for (const [r, c] of OPENING_REPLIES) {
      if (cells[r][c]) continue;
      let near = false;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
          if (cells[nr][nc]) near = true;
        }
      }
      if (near) return [r, c];
    }
  }
  return null;
}
