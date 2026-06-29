import {
  findKing,
  getLegalMoves,
  getLegalMovesFrom,
  isInCheck,
  sideOfPiece,
} from "./xiangqi-core.js";

/** @typedef {{ title: string, detail: string, kingPos: [number, number] | null }} XiangqiCheckAlert */

/**
 * @param {string[][]} board
 * @param {"red"|"black"} side
 * @returns {Set<string>}
 */
export function getResolveCheckSquares(board, side) {
  const squares = new Set();
  if (!isInCheck(board, side)) return squares;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < (board[r]?.length || 0); c++) {
      const piece = board[r][c];
      if (!piece || sideOfPiece(piece) !== side) continue;
      if (getLegalMovesFrom(board, side, r, c).length > 0) {
        squares.add(`${r},${c}`);
      }
    }
  }
  return squares;
}

/**
 * @param {string[][]} board
 * @param {"red"|"black"} side
 * @param {[number, number] | null} [selected]
 * @param {{ youLabel?: string }} [opts]
 * @returns {XiangqiCheckAlert | null}
 */
export function buildCheckAlert(board, side, selected = null, opts = {}) {
  if (!isInCheck(board, side)) return null;

  const kingLabel = side === "red" ? "帥" : "將";
  const youLabel = opts.youLabel || "你";
  const legalCount = getLegalMoves(board, side).length;
  const kingPos = findKing(board, side);

  let title = `${youLabel}被將軍了！${kingLabel}有危險 ✕`;
  let detail = "快解將！再被將可能就輸了";

  if (legalCount <= 2) {
    title = `危急！${kingLabel}快被將死了 ✕`;
    detail = "只剩極少數解將方式，請立刻應手";
  } else if (legalCount <= 5) {
    detail = "局面很危險，請優先保護將帥";
  }

  if (selected) {
    const [sr, sc] = selected;
    if (getLegalMovesFrom(board, side, sr, sc).length === 0) {
      detail = "這隻棋無法解將，請改選棋盤上橘色圈標示的棋子";
    }
  }

  return { title, detail, kingPos };
}
