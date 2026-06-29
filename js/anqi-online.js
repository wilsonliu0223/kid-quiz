import {
  applyAction,
  cloneState,
  createInitialState,
  decodeAction,
  ensureAnqiWasm,
  flipAction,
  legalActions,
  legalMovesFromCell,
  pieceSide,
  playerSide,
  playerToMove,
  sidePlayerIdx,
  stateFromJson,
  stateToJson,
  turnColorSide,
} from "./anqi-engine.js";
import {
  applyAnqiViewFlip,
  ensureAnqiBoardSvg,
  renderAnqiBoardSvg,
  renderAnqiStatusBar,
} from "./anqi-board-ui.js";
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
/** @type {number | null} */
let selected = null;
/** @type {string | null} */
let celebratedWinKey = null;

const $ = (sel) => document.querySelector(sel);

/**
 * @param {string} roomId
 * @param {RoomSlot} firstSlot
 */
async function startAnqiRoom(roomId, firstSlot) {
  await ensureAnqiWasm();
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  const state = createInitialState(seed);
  const secondSlot = firstSlot === "host" ? "guest" : "host";
  await startGameRoom(roomId, {
    seed,
    state: stateToJson(state),
    firstPlayerId: firstSlot,
    secondPlayerId: secondSlot,
    over: false,
    winnerPlayerId: null,
    draw: false,
    lastAction: null,
  });
}

function slotName(slot) {
  if (!onlineGame) return slot === "host" ? "房主" : "來賓";
  return onlineGame.names[slot] || (slot === "host" ? "房主" : "來賓");
}

function myPlayerIdx() {
  const ctx = getOnlineContext();
  if (!onlineGame || !ctx.slot) return null;
  return onlineGame.firstPlayerId === ctx.slot ? 0 : 1;
}

function isMyTurn() {
  const me = myPlayerIdx();
  return me != null && !onlineGame?.over && playerToMove(onlineGame.state) === me;
}

function renderFirstPick(panel, snap, onPick) {
  const host = snap.players.host;
  const guest = snap.players.guest;
  [
    ["host", `${host?.name || "房主"} 先手`],
    ["guest", `${guest?.name || "來賓"} 先手`],
  ].forEach(([slot, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary btn-block";
    btn.textContent = label;
    btn.addEventListener("click", () => onPick(/** @type {RoomSlot} */ (slot)));
    panel.appendChild(btn);
  });
}

function redBlackNames() {
  if (!onlineGame) return { redName: "—", blackName: "—" };
  const rIdx = sidePlayerIdx(onlineGame.state, "red");
  const bIdx = sidePlayerIdx(onlineGame.state, "black");
  if (rIdx == null || bIdx == null) {
    return { redName: "紅方待定", blackName: "黑方待定" };
  }
  const rSlot = rIdx === 0 ? onlineGame.firstPlayerId : onlineGame.secondPlayerId;
  const bSlot = bIdx === 0 ? onlineGame.firstPlayerId : onlineGame.secondPlayerId;
  return { redName: slotName(rSlot), blackName: slotName(bSlot) };
}

function ensureOnlineBoardSvg() {
  return ensureAnqiBoardSvg($("#anqi-online-board"), onOnlineCellClick);
}

function computeTargets() {
  if (!onlineGame || onlineGame.over || !isMyTurn()) {
    return { targets: [], flipTargets: [] };
  }
  const acts = legalActions(onlineGame.state);
  const flipTargets = acts.filter((a) => decodeAction(a).isFlip).map((a) => decodeAction(a).from);
  if (selected == null) return { targets: [], flipTargets };
  const targets = legalMovesFromCell(onlineGame.state, selected).map((a) => decodeAction(a).to);
  return { targets, flipTargets };
}

function renderOnlineBoard() {
  const svg = ensureOnlineBoardSvg();
  if (!svg || !onlineGame) return;
  const me = myPlayerIdx();
  const myColor = me != null ? playerSide(onlineGame.state, me) : null;
  const { targets, flipTargets } = computeTargets();
  const flipped = myColor === "black";
  applyAnqiViewFlip(svg, flipped);
  renderAnqiBoardSvg(svg, {
    state: onlineGame.state,
    selected,
    targets,
    flipTargets: selected == null ? flipTargets : [],
    lastFrom: onlineGame.lastFrom,
    lastTo: onlineGame.lastTo,
    myPlayerIdx: me,
  });

  const { redName, blackName } = redBlackNames();
  const turn = turnColorSide(onlineGame.state);
  const turnIdx = playerToMove(onlineGame.state);
  const turnSlot = turnIdx === 0 ? onlineGame.firstPlayerId : onlineGame.secondPlayerId;
  renderAnqiStatusBar({
    leftCard: $("#anqi-online-side-red"),
    rightCard: $("#anqi-online-side-black"),
    banner: $("#anqi-online-turn-banner"),
    turnMain: $("#anqi-online-turn-main"),
    turnSub: $("#anqi-online-turn-sub"),
    redName,
    blackName,
    turn,
    turnPlayerName: slotName(turnSlot),
    over: onlineGame.over,
    overTitle: onlineGame.draw
      ? "和棋"
      : onlineGame.winnerPlayerId != null
        ? `${slotName(onlineGame.winnerPlayerId)} 獲勝！`
        : "對局結束",
  });

  const overlay = $("#anqi-online-win-overlay");
  if (onlineGame.over && !celebratedWinKey) {
    // win overlay handled in applyRemoteAnqi
  } else if (!onlineGame.over) {
    overlay?.setAttribute("hidden", "");
  }
}

function onOnlineCellClick(index) {
  if (!onlineGame || onlineGame.over || !isMyTurn()) return;
  const me = myPlayerIdx();
  if (me == null) return;
  const myColor = playerSide(onlineGame.state, me);
  const code = onlineGame.state[index];

  if (selected != null) {
    if (selected === index) {
      selected = null;
      renderOnlineBoard();
      return;
    }
    const hit = legalMovesFromCell(onlineGame.state, selected).find(
      (a) => decodeAction(a).to === index,
    );
    if (hit != null) {
      submitOnlineAction(hit);
      return;
    }
    if (myColor && code !== 0 && pieceSide(code) === myColor) {
      selected = index;
      renderOnlineBoard();
      return;
    }
  }

  const flips = legalActions(onlineGame.state).filter((a) => decodeAction(a).isFlip);
  const flip = flips.find((a) => decodeAction(a).from === index);
  if (flip != null) {
    submitOnlineAction(flip);
    return;
  }

  if (myColor && code !== 0 && pieceSide(code) === myColor) {
    if (legalMovesFromCell(onlineGame.state, index).length) {
      selected = index;
      renderOnlineBoard();
    }
  }
}

/**
 * @param {number} action
 */
async function submitOnlineAction(action) {
  const ctx = getOnlineContext();
  if (!ctx.roomId || !onlineGame) return;
  try {
    await transactGameState(ctx.roomId, (cur) => {
      if (!cur || cur.over) return;
      const state = stateFromJson(cur.state);
      const legal = legalActions(state);
      if (!legal.includes(action)) return;
      const result = applyAction(state, action, cur.seed);
      const dec = decodeAction(action);
      return {
        ...cur,
        state: stateToJson(result.state),
        over: result.done,
        draw: result.draw,
        winnerPlayerId:
          result.done && !result.draw
            ? result.winner === 0
              ? cur.firstPlayerId
              : cur.secondPlayerId
            : null,
        lastAction: action,
        lastFrom: dec.isFlip ? dec.from : dec.from,
        lastTo: dec.isFlip ? dec.from : dec.to,
      };
    });
    selected = null;
  } catch (e) {
    console.error(e);
  }
}

function applyRemoteAnqi(snap) {
  const gs = snap.state;
  if (!gs?.state) return;
  onlineGame = {
    state: stateFromJson(gs.state),
    seed: gs.seed,
    firstPlayerId: gs.firstPlayerId,
    secondPlayerId: gs.secondPlayerId,
    over: !!gs.over,
    draw: !!gs.draw,
    winnerPlayerId: gs.winnerPlayerId || null,
    names: {
      host: snap.players.host?.name || "房主",
      guest: snap.players.guest?.name || "來賓",
    },
    lastFrom: gs.lastFrom ?? null,
    lastTo: gs.lastTo ?? null,
  };
  selected = null;
  renderOnlineBoard();
  if (gs.over) {
    const ctx = getOnlineContext();
    const winKey = `${snap.roomId}:${gs.winnerPlayerId || "draw"}`;
    if (winKey !== celebratedWinKey) {
      celebratedWinKey = winKey;
      $("#anqi-online-win-overlay")?.removeAttribute("hidden");
      const title = $("#anqi-online-win-title");
      if (title) {
        title.textContent = gs.draw
          ? "和棋"
          : `${slotName(gs.winnerPlayerId)} 獲勝！`;
      }
    }
  }
}

function enterOnlinePlay(snap) {
  celebratedWinKey = null;
  selected = null;
  const svg = $("#anqi-online-board");
  if (svg) svg.replaceWith(svg.cloneNode(false));
  $("#anqi-online-win-overlay")?.setAttribute("hidden", "");
  getOnlineContext().deps?.showView("anqiOnlinePlay");
  applyRemoteAnqi(snap);
}

function bindAnqiOnlineOnly() {
  if (bindAnqiOnlineOnly.done) return;
  bindAnqiOnlineOnly.done = true;

  $("#btn-anqi-online-play-back")?.addEventListener("click", async () => {
    if (confirm("離開棋局？")) {
      await leaveOnlineRoom();
      onlineGame = null;
      selected = null;
      celebratedWinKey = null;
      getOnlineContext().deps?.showView("home");
    }
  });
  $("#btn-anqi-online-win-dismiss")?.addEventListener("click", () => {
    $("#anqi-online-win-overlay")?.setAttribute("hidden", "");
  });
  $("#btn-anqi-online-rematch")?.addEventListener("click", async () => {
    onlineGame = null;
    selected = null;
    celebratedWinKey = null;
    $("#anqi-online-win-overlay")?.setAttribute("hidden", "");
    await rematchOnlineRoom();
  });
  $("#btn-anqi-online-home")?.addEventListener("click", async () => {
    await leaveOnlineRoom();
    onlineGame = null;
    selected = null;
    celebratedWinKey = null;
    getOnlineContext().deps?.showView("home");
  });
}

registerOnlineGame("anqi", {
  startHint: "請選誰先手（翻棋定色）",
  renderStartButtons: renderFirstPick,
  startGame: startAnqiRoom,
  onPlaying(snapshot) {
    bindAnqiOnlineOnly();
    const onPlay = $("#view-anqi-online-play")?.classList.contains("view-active");
    if (!onPlay) enterOnlinePlay(snapshot);
    else applyRemoteAnqi(snapshot);
  },
});

export { applyRemoteAnqi };
