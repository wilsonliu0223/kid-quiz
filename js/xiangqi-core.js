/** 中華民國象棋協會標準走法（紅先、九宮、河界、王不見王） */

export const ROWS = 10;
export const COLS = 9;

/** 台灣繁體棋子名（紅方大寫代碼、黑方小寫） */
export const PIECE_LABEL = {
  R: "俥",
  N: "傌",
  B: "相",
  A: "仕",
  K: "帥",
  C: "炮",
  P: "兵",
  r: "車",
  n: "馬",
  b: "象",
  a: "士",
  k: "將",
  c: "包",
  p: "卒",
};

const START_ROWS = [
  "rnbakabnr",
  ".........",
  ".c.....c.",
  "p.p.p.p.p",
  ".........",
  ".........",
  "P.P.P.P.P",
  ".C.....C.",
  ".........",
  "RNBAKABNR",
];

/** @typedef {"red" | "black"} XiangqiSide */
/** @typedef {{ from: [number, number], to: [number, number], capture?: string }} XiangqiMove */

export function createBoard() {
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = START_ROWS[r][c];
      if (ch !== ".") board[r][c] = ch;
    }
  }
  return board;
}

export function cloneBoard(board) {
  return board.map((row) => [...row]);
}

export function sideOfPiece(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "red" : "black";
}

export function opponent(side) {
  return side === "red" ? "black" : "red";
}

function inPalace(r, c, side) {
  if (c < 3 || c > 5) return false;
  return side === "red" ? r >= 7 && r <= 9 : r >= 0 && r <= 2;
}

function onBoard(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

export function findKing(board, side) {
  const king = side === "red" ? "K" : "k";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === king) return [r, c];
    }
  }
  return null;
}

export function kingsFace(board) {
  const black = findKing(board, "black");
  const red = findKing(board, "red");
  if (!black || !red || black[1] !== red[1]) return false;
  const col = black[1];
  const lo = Math.min(black[0], red[0]);
  const hi = Math.max(black[0], red[0]);
  for (let r = lo + 1; r < hi; r++) {
    if (board[r][col]) return false;
  }
  return true;
}

function addMove(moves, board, fromR, fromC, toR, toC, side) {
  if (!onBoard(toR, toC)) return;
  const target = board[toR][toC];
  if (target && sideOfPiece(target) === side) return;
  moves.push({
    from: [fromR, fromC],
    to: [toR, toC],
    capture: target || undefined,
  });
}

function genKingMoves(board, r, c, side, moves) {
  for (const [dr, dc] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    const nr = r + dr;
    const nc = c + dc;
    if (inPalace(nr, nc, side)) addMove(moves, board, r, c, nr, nc, side);
  }
}

function genAdvisorMoves(board, r, c, side, moves) {
  for (const [dr, dc] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const nr = r + dr;
    const nc = c + dc;
    if (inPalace(nr, nc, side)) addMove(moves, board, r, c, nr, nc, side);
  }
}

function genElephantMoves(board, r, c, side, moves) {
  const blocked = (br, bc) => !onBoard(br, bc) || board[br][bc];
  const steps = [
    [2, 2, 1, 1],
    [2, -2, 1, -1],
    [-2, 2, -1, 1],
    [-2, -2, -1, -1],
  ];
  for (const [dr, dc, er, ec] of steps) {
    const nr = r + dr;
    const nc = c + dc;
    if (side === "red" && nr < 5) continue;
    if (side === "black" && nr > 4) continue;
    if (blocked(r + er, c + ec)) continue;
    addMove(moves, board, r, c, nr, nc, side);
  }
}

function genHorseMoves(board, r, c, side, moves) {
  const legs = [
    [2, 1, 1, 0],
    [2, -1, 1, 0],
    [-2, 1, -1, 0],
    [-2, -1, -1, 0],
    [1, 2, 0, 1],
    [1, -2, 0, -1],
    [-1, 2, 0, 1],
    [-1, -2, 0, -1],
  ];
  for (const [dr, dc, lr, lc] of legs) {
    if (!onBoard(r + lr, c + lc) || board[r + lr][c + lc]) continue;
    addMove(moves, board, r, c, r + dr, c + dc, side);
  }
}

function genRookMoves(board, r, c, side, moves) {
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  for (const [dr, dc] of dirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (onBoard(nr, nc)) {
      const target = board[nr][nc];
      if (!target) {
        moves.push({ from: [r, c], to: [nr, nc] });
      } else {
        if (sideOfPiece(target) !== side) {
          moves.push({ from: [r, c], to: [nr, nc], capture: target });
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
}

function genCannonMoves(board, r, c, side, moves) {
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  for (const [dr, dc] of dirs) {
    let nr = r + dr;
    let nc = c + dc;
    let jumped = false;
    while (onBoard(nr, nc)) {
      const target = board[nr][nc];
      if (!jumped) {
        if (!target) {
          moves.push({ from: [r, c], to: [nr, nc] });
        } else {
          jumped = true;
        }
      } else if (target) {
        if (sideOfPiece(target) !== side) {
          moves.push({ from: [r, c], to: [nr, nc], capture: target });
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
}

function genPawnMoves(board, r, c, side, moves) {
  const forward = side === "red" ? -1 : 1;
  const crossed = side === "red" ? r <= 4 : r >= 5;
  addMove(moves, board, r, c, r + forward, c, side);
  if (crossed) {
    addMove(moves, board, r, c, r, c - 1, side);
    addMove(moves, board, r, c, r, c + 1, side);
  }
}

function genPieceMoves(board, r, c, moves) {
  const piece = board[r][c];
  if (!piece) return;
  const side = sideOfPiece(piece);
  const type = piece.toLowerCase();
  if (type === "k") genKingMoves(board, r, c, side, moves);
  else if (type === "a") genAdvisorMoves(board, r, c, side, moves);
  else if (type === "b") genElephantMoves(board, r, c, side, moves);
  else if (type === "n") genHorseMoves(board, r, c, side, moves);
  else if (type === "r") genRookMoves(board, r, c, side, moves);
  else if (type === "c") genCannonMoves(board, r, c, side, moves);
  else if (type === "p") genPawnMoves(board, r, c, side, moves);
}

export function applyMove(board, move) {
  const next = cloneBoard(board);
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  next[tr][tc] = next[fr][fc];
  next[fr][fc] = "";
  return next;
}

function isLegalAfter(board, move, side) {
  const next = applyMove(board, move);
  if (kingsFace(next)) return false;
  if (isInCheck(next, side)) return false;
  return true;
}

export function isInCheck(board, side) {
  const king = findKing(board, side);
  if (!king) return true;
  const opp = opponent(side);
  const pseudo = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || sideOfPiece(p) !== opp) continue;
      const before = pseudo.length;
      genPieceMoves(board, r, c, pseudo);
      for (let i = before; i < pseudo.length; i++) {
        const m = pseudo[i];
        if (m.to[0] === king[0] && m.to[1] === king[1]) return true;
      }
      pseudo.length = before;
    }
  }
  return false;
}

/** @returns {XiangqiMove[]} */
export function getLegalMoves(board, side) {
  const moves = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || sideOfPiece(p) !== side) continue;
      const before = moves.length;
      genPieceMoves(board, r, c, moves);
      for (let i = moves.length - 1; i >= before; i--) {
        if (!isLegalAfter(board, moves[i], side)) moves.splice(i, 1);
      }
    }
  }
  return moves;
}

/** @returns {XiangqiMove[]} */
export function getLegalMovesFrom(board, side, fromR, fromC) {
  const piece = board[fromR]?.[fromC];
  if (!piece || sideOfPiece(piece) !== side) return [];
  const moves = [];
  genPieceMoves(board, fromR, fromC, moves);
  return moves.filter((m) => isLegalAfter(board, m, side));
}

/**
 * @returns {{ winner: XiangqiSide | null, reason: string } | null}
 */
export function gameResult(board, sideToMove) {
  const legal = getLegalMoves(board, sideToMove);
  const inCheck = isInCheck(board, sideToMove);
  if (legal.length > 0) return null;
  if (inCheck) {
    return { winner: opponent(sideToMove), reason: "將死" };
  }
  return { winner: opponent(sideToMove), reason: "困斃" };
}

export function boardToFen(board) {
  return board.map((row) => row.map((p) => p || ".").join("")).join("/");
}

export function boardFromFen(fen) {
  const board = createBoard();
  const rows = String(fen || "").split("/");
  for (let r = 0; r < ROWS && r < rows.length; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (ch === ".") {
        c += 1;
      } else if (c < COLS) {
        board[r][c] = ch;
        c += 1;
      }
    }
  }
  return board;
}

export function pieceValue(piece) {
  if (!piece) return 0;
  const map = { r: 9, n: 4, c: 4.5, b: 2, a: 2, p: 1, k: 0 };
  return map[piece.toLowerCase()] || 0;
}

/** 玩家執黑時翻轉棋盤，讓己方棋子顯示在下方 */
export function shouldFlipBoardForSide(side) {
  return side === "black";
}

/** 交叉點座標（9 欄 × 10 行）對應棋盤區域百分比 */
export function intersectionPercent(r, c) {
  return {
    left: (c / (COLS - 1)) * 100,
    top: (r / (ROWS - 1)) * 100,
  };
}

/** @param {HTMLElement} el */
export function placePointAtIntersection(el, r, c) {
  const { left, top } = intersectionPercent(r, c);
  el.style.left = `${left}%`;
  el.style.top = `${top}%`;
}
