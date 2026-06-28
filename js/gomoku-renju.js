/** 連珠（Renju）黑棋禁手：三三、四四、長連。白棋無禁手。 */

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** @typedef {''|string} Cell */

/**
 * @param {Cell[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {string} blackId
 * @param {string} whiteId
 * @param {Set<number>} [invalid]
 */
function boardCode(cells, r, c, blackId, whiteId, invalid) {
  const size = cells.length;
  if (r < 0 || r >= size || c < 0 || c >= size) return 2;
  if (invalid?.has(r * size + c)) return 3;
  const v = cells[r][c];
  if (v === blackId) return 1;
  if (v === whiteId) return 2;
  return 0;
}

/**
 * @param {Cell[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {number} dr
 * @param {number} dc
 * @param {string} blackId
 * @param {string} whiteId
 * @param {number[]} pattern
 * @param {number[]} alignments
 * @param {Set<number>} [invalid]
 */
function countAlignedPattern(
  cells,
  r,
  c,
  dr,
  dc,
  blackId,
  whiteId,
  pattern,
  alignments,
  invalid
) {
  let count = 0;

  for (const offIdx of alignments) {
    const rel = scaleOffsets(THREE_OFFSETS[offIdx], dr, dc);

    const [headR, headC] = [r + rel[0][0], c + rel[0][1]];
    if (boardCode(cells, headR, headC, blackId, whiteId, invalid) !== pattern[0]) continue;

    let ok = true;
    for (let i = 1; i <= 6; i++) {
      const code = boardCode(cells, r + rel[i][0], c + rel[i][1], blackId, whiteId, invalid);
      if (code !== pattern[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const [tailR, tailC] = [r + rel[7][0], c + rel[7][1]];
    if (boardCode(cells, tailR, tailC, blackId, whiteId, invalid) !== pattern[7]) continue;
    count++;
  }

  return count;
}

/**
 * @param {Cell[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {number} dr
 * @param {number} dc
 * @param {string} blackId
 * @param {string} whiteId
 * @param {number[]} pattern
 * @param {number[]} alignments
 * @param {Set<number>} [invalid]
 */
function countAlignedFourPattern(
  cells,
  r,
  c,
  dr,
  dc,
  blackId,
  whiteId,
  pattern,
  alignments,
  invalid
) {
  let count = 0;

  for (const offIdx of alignments) {
    const rel = scaleOffsets(FOUR_OFFSETS[offIdx], dr, dc);

    const [headR, headC] = [r + rel[0][0], c + rel[0][1]];
    if (boardCode(cells, headR, headC, blackId, whiteId, invalid) !== pattern[0]) continue;

    let ok = true;
    for (let i = 1; i <= 5; i++) {
      const code = boardCode(cells, r + rel[i][0], c + rel[i][1], blackId, whiteId, invalid);
      if (code !== pattern[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const [tailR, tailC] = [r + rel[6][0], c + rel[6][1]];
    if (boardCode(cells, tailR, tailC, blackId, whiteId, invalid) !== pattern[6]) continue;
    count++;
  }

  return count;
}

const THREE_OFFSETS = [
  [
    [0, -2],
    [0, -1],
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
  ],
  [
    [0, -3],
    [0, -2],
    [0, -1],
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
  ],
  [
    [0, -4],
    [0, -3],
    [0, -2],
    [0, -1],
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  [
    [0, -5],
    [0, -4],
    [0, -3],
    [0, -2],
    [0, -1],
    [0, 0],
    [0, 1],
    [0, 2],
  ],
];

const THREE_PATTERNS = [
  [0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 0, 1, 0, 0],
  [0, 0, 1, 0, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 0, 0],
];

const THREE_CENTER_IDX = [
  [0, 1, 2],
  [0, 1, 3],
  [0, 2, 3],
  [1, 2, 3],
];

const FOUR_OFFSETS = [
  [
    [0, -1],
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
  ],
  [
    [0, -2],
    [0, -1],
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
  ],
  [
    [0, -3],
    [0, -2],
    [0, -1],
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  [
    [0, -4],
    [0, -3],
    [0, -2],
    [0, -1],
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  [
    [0, -5],
    [0, -4],
    [0, -3],
    [0, -2],
    [0, -1],
    [0, 0],
    [0, 1],
  ],
];

const FOUR_PATTERNS = [
  [0, 1, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 0, 1, 0],
  [0, 1, 1, 0, 1, 1, 0],
  [0, 1, 0, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 0],
];

const FOUR_CENTER_IDX = [
  [0, 1, 2, 3],
  [0, 1, 2, 4],
  [0, 1, 3, 4],
  [0, 2, 3, 4],
  [1, 2, 3, 4],
];

function scaleOffsets(offsets, dr, dc) {
  return offsets.map(([, t]) => [t * dr, t * dc]);
}

/**
 * @param {Cell[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {string} blackId
 * @param {string} whiteId
 * @param {Set<number>} [invalid]
 */
function countOpenThrees(cells, r, c, blackId, whiteId, invalid) {
  let total = 0;

  for (const [dr, dc] of DIRS) {
    const val = [];
    for (let p = 0; p < 4; p++) {
      val.push(
        countAlignedPattern(
          cells,
          r,
          c,
          dr,
          dc,
          blackId,
          whiteId,
          THREE_PATTERNS[p],
          THREE_CENTER_IDX[p],
          invalid
        )
      );
    }
    total += val[1] + val[2] + Math.floor((val[0] + val[3] + 1) / 2);
  }

  return total;
}

/**
 * @param {Cell[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {string} blackId
 * @param {string} whiteId
 * @param {Set<number>} [invalid]
 */
function countFours(cells, r, c, blackId, whiteId, invalid) {
  let total = 0;

  for (const [dr, dc] of DIRS) {
    const val = [];
    for (let p = 0; p < 5; p++) {
      val.push(
        countAlignedFourPattern(
          cells,
          r,
          c,
          dr,
          dc,
          blackId,
          whiteId,
          FOUR_PATTERNS[p],
          FOUR_CENTER_IDX[p],
          invalid
        )
      );
    }
    total += val[1] + val[2] + val[3] + Math.floor((val[0] + val[4] + 1) / 2);
  }

  return total;
}

function hasOverline(cells, r, c, blackId) {
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let nr = r + dr * sign;
      let nc = c + dc * sign;
      while (
        nr >= 0 &&
        nr < cells.length &&
        nc >= 0 &&
        nc < cells[0].length &&
        cells[nr][nc] === blackId
      ) {
        count++;
        nr += dr * sign;
        nc += dc * sign;
      }
    }
    if (count >= 6) return true;
  }
  return false;
}

const NEIGHBOR_OFFSETS = [
  [0, -1], [0, -2], [0, -3], [0, -4],
  [0, 1], [0, 2], [0, 3], [0, 4],
  [-1, 0], [-2, 0], [-3, 0], [-4, 0],
  [1, 0], [2, 0], [3, 0], [4, 0],
  [-1, -1], [-2, -2], [-3, -3], [-4, -4],
  [1, 1], [2, 2], [3, 3], [4, 4],
  [-1, 1], [-2, 2], [-3, 3], [-4, 4],
  [1, -1], [2, -2], [3, -3], [4, -4],
];

/**
 * 簡化禁手檢查（用於標記活三延伸不可用的鄰點，參考 renju-ai rule.cpp）
 * @param {Cell[][]} cells 已含落子黑子
 */
function isSimpleBlackForbidden(cells, r, c, blackId, whiteId) {
  const size = cells.length;
  if (r < 0 || r >= size || c < 0 || c >= size || cells[r][c]) return true;

  cells[r][c] = blackId;
  const three = countOpenThrees(cells, r, c, blackId, whiteId);
  const four = countFours(cells, r, c, blackId, whiteId);
  cells[r][c] = "";

  return three >= 2 || four >= 2;
}

/**
 * 活三／四計數時標記「補子後會成禁手」的鄰點，排除假活三（活四點不可同時成五或禁手）
 * @param {Cell[][]} cells 已含落子黑子
 */
function countBlackThreeFour(cells, r, c, blackId, whiteId) {
  const size = cells.length;
  const invalid = new Set();

  for (const [dr, dc] of NEIGHBOR_OFFSETS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
    if (cells[nr][nc]) continue;

    const forbidden = isSimpleBlackForbidden(cells, nr, nc, blackId, whiteId);

    if (forbidden) invalid.add(nr * size + nc);
  }

  return {
    three: countOpenThrees(cells, r, c, blackId, whiteId, invalid),
    four: countFours(cells, r, c, blackId, whiteId, invalid),
  };
}

/**
 * 已落黑子的禁手類型；五連優先時回傳 null。
 * @returns {null|'33'|'44'|'overline'}
 */
export function getBlackForbiddenType(cells, r, c, blackId, whiteId, hasFiveWin) {
  if (hasFiveWin) return null;
  if (hasOverline(cells, r, c, blackId)) return "overline";

  const { three, four } = countBlackThreeFour(cells, r, c, blackId, whiteId);
  if (three >= 2) return "33";
  if (four >= 2) return "44";
  return null;
}

/**
 * @param {Cell[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {string} blackId
 * @param {string} whiteId
 * @param {(cells: Cell[][], r: number, c: number, player: string) => boolean} hasFiveWin
 */
export function wouldBlackForbidden(cells, r, c, blackId, whiteId, hasFiveWin) {
  if (cells[r][c]) return null;
  const next = cells.map((row) => [...row]);
  next[r][c] = blackId;
  const wins = hasFiveWin(next, r, c, blackId);
  return getBlackForbiddenType(next, r, c, blackId, whiteId, wins);
}

export function forbiddenLabel(type) {
  if (type === "33") return "三三禁手（同時兩個活三）";
  if (type === "44") return "四四禁手（同時兩個四）";
  if (type === "overline") return "長連禁手（六子以上）";
  return "";
}
