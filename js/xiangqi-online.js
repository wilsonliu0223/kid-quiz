import {
  applyMove,
  boardFromFen,
  boardToFen,
  createBoard,
  gameResult,
  getLegalMovesFrom,
  shouldFlipBoardForSide,
} from "./xiangqi-core.js";
import {
  ensureXiangqiBoardSvg,
  renderXiangqiBoardSvg,
  renderXiangqiStatusBar,
} from "./xiangqi-board-ui.js";
import { buildCheckAlert, getResolveCheckSquares } from "./xiangqi-check-ui.js";
import {
  registerOnlineGame,
  getOnlineContext,
  leaveOnlineRoom,
  rematchOnlineRoom,
} from "./online-duo.js";
import { startGameRoom, transactGameState } from "./room-service.js?v=room-v37";

/** @typedef {'host' | 'guest'} RoomSlot */

/** @type {object | null} */
let onlineGame = null;
/** @type {[number, number] | null} */
let selected = null;
/** @type {string | null} */
let celebratedWinKey = null;

const $ = (sel) => document.querySelector(sel);

/**
 * @param {string} roomId
 * @param {'host' | 'guest'} redSlot
 */
async function startXiangqiRoom(roomId, redSlot) {
  const blackSlot = redSlot === "host" ? "guest" : "host";
  await startGameRoom(roomId, {
    redPlayerId: redSlot,
    blackPlayerId: blackSlot,
    turn: "red",
    fen: boardToFen(createBoard()),
    lastMove: null,
    over: false,
    winner: null,
    winnerSide: null,
    endReason: "",
  });
}

function otherSlot(slot) {
  return slot === "host" ? "guest" : "host";
}

function slotName(slot) {
  if (!onlineGame) return slot === "host" ? "房主" : "來賓";
  return onlineGame.names[slot] || (slot === "host" ? "房主" : "來賓");
}

function sideName(side) {
  return side === "red" ? "紅方" : "黑方";
}

function slotForSide(side) {
  if (!onlineGame) return null;
  return side === "red" ? onlineGame.redPlayerId : onlineGame.blackPlayerId;
}

function sideForSlot(slot) {
  if (!onlineGame) return null;
  if (slot === onlineGame.redPlayerId) return "red";
  if (slot === onlineGame.blackPlayerId) return "black";
  return null;
}

function renderRedPick(panel, snap, onPick) {
  const host = snap.players.host;
  const guest = snap.players.guest;
  [
    ["host", `${host?.name || "房主"} 執紅（先手）`],
    ["guest", `${guest?.name || "來賓"} 執紅（先手）`],
  ].forEach(([slot, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary btn-block";
    btn.textContent = label;
    btn.addEventListener("click", () => onPick(/** @type {RoomSlot} */ (slot)));
    panel.appendChild(btn);
  });
}

function legalTargets() {
  if (!onlineGame?.board || !selected) return [];
  const side = onlineGame.turn;
  const [sr, sc] = selected;
  return getLegalMovesFrom(onlineGame.board, side, sr, sc).map((m) => m.to);
}

function ensureOnlineBoardSvg() {
  const svg = $("#xiangqi-online-board");
  return ensureXiangqiBoardSvg(svg, onOnlinePointClick);
}

function renderOnlineBoard() {
  const svg = ensureOnlineBoardSvg();
  if (!svg || !onlineGame) return;
  const ctx = getOnlineContext();
  const mySide = sideForSlot(ctx.slot);
  const legal = new Set(legalTargets().map(([r, c]) => `${r},${c}`));
  const myTurn = !onlineGame.over && mySide === onlineGame.turn;
  const checkAlert = !onlineGame.over
    ? buildCheckAlert(onlineGame.board, onlineGame.turn, selected, {
        youLabel: myTurn ? "你" : sideName(onlineGame.turn),
      })
    : null;
  const resolveCheck = checkAlert
    ? getResolveCheckSquares(onlineGame.board, onlineGame.turn)
    : new Set();
  renderXiangqiBoardSvg(svg, {
    board: onlineGame.board,
    selected,
    lastMove: onlineGame.lastMove,
    legal,
    resolveCheck,
    kingInCheck: checkAlert?.kingPos || null,
    over: onlineGame.over,
    interactive: myTurn,
    flipped: onlineGame.viewFlipped,
  });

  if ($("#xiangqi-online-room-tag") && ctx.roomId) {
    $("#xiangqi-online-room-tag").textContent = `房間 ${ctx.roomId}`;
  }

  const curSlot = slotForSide(onlineGame.turn);
  let overTitle = "對局結束";
  if (onlineGame.over && onlineGame.winner) {
    overTitle = onlineGame.winner === ctx.slot ? "你獲勝！" : `${slotName(onlineGame.winner)} 獲勝`;
  } else if (onlineGame.over) {
    overTitle = "和棋";
  }

  renderXiangqiStatusBar({
    redCard: $("#xiangqi-online-side-red"),
    blackCard: $("#xiangqi-online-side-black"),
    banner: $("#xiangqi-online-turn-banner"),
    turnMain: $("#xiangqi-online-turn-main"),
    turnSub: $("#xiangqi-online-turn-sub"),
    redName: slotName(onlineGame.redPlayerId),
    blackName: slotName(onlineGame.blackPlayerId),
    turn: onlineGame.over ? null : onlineGame.turn,
    turnPlayerName: slotName(curSlot),
    over: onlineGame.over,
    overTitle,
    youHint: myTurn ? " · 輪到你" : "",
    inCheck: !!checkAlert,
    checkEl: $("#xiangqi-online-check-hint"),
    checkTitleEl: $("#xiangqi-online-check-title"),
    checkDetailEl: $("#xiangqi-online-check-detail"),
    checkTitle: checkAlert?.title || "",
    checkDetail: checkAlert?.detail || "",
  });
}

function showOnlineWinOverlay() {
  if (!onlineGame) return;
  const ctx = getOnlineContext();
  const title = $("#xiangqi-online-win-title");
  const detail = $("#xiangqi-online-win-detail");
  if (!title || !detail) return;
  if (!onlineGame.winner) {
    title.textContent = "和棋";
    detail.textContent = onlineGame.endReason || "";
  } else {
    const meWon = onlineGame.winner === ctx.slot;
    title.textContent = meWon ? "你贏了！" : `${slotName(onlineGame.winner)} 獲勝`;
    detail.textContent = `${sideName(onlineGame.winnerSide)} · ${onlineGame.endReason || "勝"}`;
  }
  $("#xiangqi-online-win-overlay")?.removeAttribute("hidden");
}

function applyRemoteXiangqi(snapshot) {
  const g = snapshot.state;
  if (!g) return;
  const board = g.fen ? boardFromFen(g.fen) : createBoard();
  const ctx = getOnlineContext();
  const mySide =
    ctx.slot === g.redPlayerId ? "red" : ctx.slot === g.blackPlayerId ? "black" : null;
  onlineGame = {
    board,
    redPlayerId: g.redPlayerId,
    blackPlayerId: g.blackPlayerId,
    turn: g.turn || "red",
    over: !!g.over,
    winner: g.winner || null,
    winnerSide: g.winnerSide || null,
    endReason: g.endReason || "",
    lastMove: g.lastMove?.to || g.lastMove || null,
    viewFlipped: shouldFlipBoardForSide(mySide),
    names: {
      host: snapshot.players.host?.name || "房主",
      guest: snapshot.players.guest?.name || "來賓",
    },
  };
  selected = null;
  renderOnlineBoard();
  if (g.over) {
    const winKey = `${snapshot.roomId}:${g.winner || "draw"}:${g.fen}`;
    if (winKey !== celebratedWinKey) {
      celebratedWinKey = winKey;
      showOnlineWinOverlay();
    }
  }
}

function enterOnlinePlay(snapshot) {
  getOnlineContext().deps?.showView("xiangqiOnlinePlay");
  celebratedWinKey = null;
  selected = null;
  const svg = $("#xiangqi-online-board");
  if (svg) {
    svg.replaceWith(svg.cloneNode(false));
  }
  $("#xiangqi-online-win-overlay")?.setAttribute("hidden", "");
  applyRemoteXiangqi(snapshot);
}

async function submitOnlineMove(fromR, fromC, toR, toC) {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !ctx.slot || !onlineGame || onlineGame.over) return;

  const slot = ctx.slot;
  const mySide = sideForSlot(slot);
  if (!mySide || mySide !== onlineGame.turn) return;

  const result = await transactGameState(ctx.roomId, (current) => {
    if (!current || current.over) return;
    const board = current.fen ? boardFromFen(current.fen) : createBoard();
    const turn = current.turn || "red";
    const redPlayerId = current.redPlayerId;
    const blackPlayerId = current.blackPlayerId;
    const curSlot = turn === "red" ? redPlayerId : blackPlayerId;
    if (curSlot !== slot) return;

    const moves = getLegalMovesFrom(board, turn, fromR, fromC);
    const move = moves.find((m) => m.to[0] === toR && m.to[1] === toC);
    if (!move) return;

    const nextBoard = applyMove(board, move);
    const nextTurn = turn === "red" ? "black" : "red";
    const terminal = gameResult(nextBoard, nextTurn);
    if (terminal) {
      return {
        ...current,
        fen: boardToFen(nextBoard),
        turn: nextTurn,
        lastMove: move,
        over: true,
        winner: terminal.winner === "red" ? redPlayerId : blackPlayerId,
        winnerSide: terminal.winner,
        endReason: terminal.reason,
      };
    }
    return {
      ...current,
      fen: boardToFen(nextBoard),
      turn: nextTurn,
      lastMove: move,
      over: false,
      winner: null,
      winnerSide: null,
      endReason: "",
    };
  });

  if (!result) {
    alert("這一步無法走（可能輪到對方或不符合規則）");
    selected = null;
    renderOnlineBoard();
    return;
  }
  selected = null;
}

function onOnlinePointClick(r, c) {
  if (!onlineGame || onlineGame.over) return;
  const ctx = getOnlineContext();
  const mySide = sideForSlot(ctx.slot);
  if (!mySide || mySide !== onlineGame.turn) return;

  const piece = onlineGame.board[r][c];
  if (selected) {
    const [sr, sc] = selected;
    if (sr === r && sc === c) {
      selected = null;
      renderOnlineBoard();
      return;
    }
    submitOnlineMove(sr, sc, r, c);
    return;
  }

  if (piece && sideOfPiece(piece) === onlineGame.turn) {
    selected = [r, c];
    renderOnlineBoard();
  }
}

function bindXiangqiOnlineOnly() {
  if (bindXiangqiOnlineOnly.done) return;
  bindXiangqiOnlineOnly.done = true;

  $("#btn-xiangqi-online-play-back")?.addEventListener("click", async () => {
    if (confirm("離開棋局？")) {
      await leaveOnlineRoom();
      onlineGame = null;
      selected = null;
      celebratedWinKey = null;
      getOnlineContext().deps?.showView("home");
    }
  });
  $("#btn-xiangqi-online-win-dismiss")?.addEventListener("click", () => {
    $("#xiangqi-online-win-overlay")?.setAttribute("hidden", "");
  });
  $("#btn-xiangqi-online-win-rematch")?.addEventListener("click", async () => {
    onlineGame = null;
    selected = null;
    celebratedWinKey = null;
    $("#xiangqi-online-win-overlay")?.setAttribute("hidden", "");
    await rematchOnlineRoom();
  });
  $("#btn-xiangqi-online-win-home")?.addEventListener("click", async () => {
    await leaveOnlineRoom();
    onlineGame = null;
    selected = null;
    celebratedWinKey = null;
    getOnlineContext().deps?.showView("home");
  });
}

registerOnlineGame("xiangqi", {
  startHint: "請選誰執紅（紅先）",
  renderStartButtons: renderRedPick,
  startGame: (roomId, slot) => startXiangqiRoom(roomId, slot),
  onPlaying(snapshot) {
    bindXiangqiOnlineOnly();
    const onPlay = $("#view-xiangqi-online-play")?.classList.contains("view-active");
    if (!onPlay) enterOnlinePlay(snapshot);
    else applyRemoteXiangqi(snapshot);
  },
});
