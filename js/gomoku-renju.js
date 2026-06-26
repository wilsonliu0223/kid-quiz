/** 連珠（Renju）黑棋禁手：三三、四四、長連。白棋無禁手。 */

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * @param {(''|'A'|'B')[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {'A'|'B'} blackId
 * @param {'A'|'B'} whiteId
 */
function lineCodes(cells, r, c, dr, dc, blackId, whiteId) {
  const line = [];
  for (let i = -4; i <= 4; i++) {
    const nr = r + dr * i;
    const nc = c + dc * i;
    if (nr < 0 || nr >= cells.length || nc < 0 || nc >= cells[0].length) {
      line.push(2);
      continue;
    }
    const v = cells[nr][nc];
    if (v === blackId) line.push(1);
    else if (v === whiteId) line.push(2);
    else line.push(0);
  }
  return line;
}

function windowIncludesCenter(start, end) {
  return start <= 4 && end >= 4;
}

/** 此方向是否形成活三（落子點須在活三內） */
function hasOpenThreeOnLine(line) {
  for (let start = 0; start <= 4; start++) {
    const end = start + 4;
    if (!windowIncludesCenter(start, end)) continue;
    const left = start > 0 ? line[start - 1] : 2;
    const right = end < 8 ? line[end + 1] : 2;
    if (left !== 0 || right !== 0) continue;
    if (line.slice(start, end + 1).join("") === "01110") return true;
  }
  for (let start = 0; start <= 3; start++) {
    const end = start + 5;
    if (!windowIncludesCenter(start, end)) continue;
    const left = start > 0 ? line[start - 1] : 2;
    const right = end < 8 ? line[end + 1] : 2;
    if (left !== 0 || right !== 0) continue;
    const str = line.slice(start, end + 1).join("");
    if (str === "010110" || str === "011010") return true;
  }
  return false;
}

/** 此方向形成的「四」數量（活四、冲四） */
function countFoursOnLine(line) {
  let count = 0;

  for (let start = 0; start <= 3; start++) {
    const end = start + 5;
    if (!windowIncludesCenter(start, end)) continue;
    const left = start > 0 ? line[start - 1] : 2;
    const right = end < 8 ? line[end + 1] : 2;
    const str = line.slice(start, end + 1).join("");
    if (str === "011110" && left === 0 && right === 0) count++;
    else if (str === "211110" || str === "011112") count++;
    else if (str === "101110" || str === "011101") count++;
    else if (str === "110110" || str === "011011") count++;
  }

  for (let start = 0; start <= 2; start++) {
    const end = start + 6;
    if (!windowIncludesCenter(start, end)) continue;
    const left = start > 0 ? line[start - 1] : 2;
    const right = end < 8 ? line[end + 1] : 2;
    if (left !== 0 || right !== 0) continue;
    const str = line.slice(start, end + 1).join("");
    if (str === "0101110" || str === "0110110") count++;
  }

  return count;
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

/**
 * 已落黑子的禁手類型；五連優先時回傳 null。
 * @returns {null|'33'|'44'|'overline'}
 */
export function getBlackForbiddenType(cells, r, c, blackId, whiteId, hasFiveWin) {
  if (hasFiveWin) return null;

  if (hasOverline(cells, r, c, blackId)) return "overline";

  let openThreeDirs = 0;
  let fourCount = 0;

  for (const [dr, dc] of DIRS) {
    const line = lineCodes(cells, r, c, dr, dc, blackId, whiteId);
    if (hasOpenThreeOnLine(line)) openThreeDirs++;
    fourCount += countFoursOnLine(line);
  }

  if (openThreeDirs >= 2) return "33";
  if (fourCount >= 2) return "44";
  return null;
}

/**
 * @param {(''|'A'|'B')[][]} cells
 * @param {number} r
 * @param {number} c
 * @param {'A'|'B'} blackId
 * @param {'A'|'B'} whiteId
 * @param {(cells: (''|'A'|'B')[][], r: number, c: number, player: 'A'|'B') => boolean} hasFiveWin
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
