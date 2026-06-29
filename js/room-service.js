import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { ensureFirebase } from "./firebase-app.js";
import { boardToFen, createBoard } from "./xiangqi-core.js";

const KEY_ONLINE_SESSION = "kid-quiz-online-session";
const ROOM_TTL_MS = 60 * 60 * 1000;

/** @typedef {'host' | 'guest'} RoomSlot */

/**
 * @typedef {object} OnlineSession
 * @property {string} roomId
 * @property {RoomSlot} slot
 */

/**
 * @typedef {object} RoomPlayer
 * @property {string} uid
 * @property {string} name
 * @property {string} childId
 * @property {boolean} ready
 * @property {string} [ship]
 */

/**
 * @typedef {object} RoomSnapshot
 * @property {string} roomId
 * @property {{ game: string, config?: object, createdAt: number, expiresAt: number, status: string }} meta
 * @property {{ host: RoomPlayer | null, guest: RoomPlayer | null }} players
 * @property {object | null} state
 * @property {object | null} [gomoku]
 */

function snapshotFromVal(roomId, val) {
  return {
    roomId,
    meta: val.meta,
    players: val.players || { host: null, guest: null },
    state: val.state ?? val.gomoku ?? null,
    gomoku: val.gomoku || null,
  };
}

/** Firebase 常把陣列存成 {0:…, 1:…}，讀回時需還原 */
export function asFirebaseList(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") {
    return Object.keys(val)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => /** @type {Record<string, unknown>} */ (val)[k]);
  }
  return [];
}

/** @returns {OnlineSession | null} */
export function getOnlineSession() {
  try {
    const raw = sessionStorage.getItem(KEY_ONLINE_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** @param {OnlineSession | null} session */
export function setOnlineSession(session) {
  if (!session) {
    sessionStorage.removeItem(KEY_ONLINE_SESSION);
    return;
  }
  sessionStorage.setItem(KEY_ONLINE_SESSION, JSON.stringify(session));
}

function randomRoomId() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function roomRef(roomId) {
  const { db } = await ensureFirebase();
  return ref(db, `rooms/${roomId}`);
}

/**
 * @param {string} game
 * @param {string} name
 * @param {string} childId
 * @param {object} [config]
 */
export async function createRoom(game, name, childId, config = null) {
  const { uid } = await ensureFirebase();

  for (let attempt = 0; attempt < 12; attempt++) {
    const roomId = randomRoomId();
    const r = await roomRef(roomId);
    const snap = await get(r);
    if (snap.exists()) continue;

    const now = Date.now();
    /** @type {Record<string, unknown>} */
    const meta = {
      game,
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
      status: "lobby",
    };
    if (config) meta.config = config;

    const payload = {
      meta,
      players: {
        host: { uid, name, childId, ready: false },
        guest: null,
      },
      state: null,
    };

    await set(r, payload);
    try {
      const { db } = await ensureFirebase();
      await onDisconnect(ref(db, `rooms/${roomId}`)).remove();
    } catch (disconnectErr) {
      console.warn("onDisconnect host cleanup 未設定", disconnectErr);
    }
    setOnlineSession({ roomId, slot: "host" });
    return roomId;
  }

  throw new Error("ROOM_CREATE_FAILED");
}

/**
 * @param {string} roomId
 * @param {string} name
 * @param {string} childId
 */
export async function joinRoom(roomId, name, childId) {
  const code = String(roomId || "").trim();
  if (!/^\d{4}$/.test(code)) {
    const err = new Error("ROOM_ID_INVALID");
    err.code = "ROOM_ID_INVALID";
    throw err;
  }

  const { uid } = await ensureFirebase();
  const r = await roomRef(code);
  const snap = await get(r);
  if (!snap.exists()) {
    const err = new Error("ROOM_NOT_FOUND");
    err.code = "ROOM_NOT_FOUND";
    throw err;
  }

  const data = snap.val();
  if (data.meta?.expiresAt && data.meta.expiresAt < Date.now()) {
    const err = new Error("ROOM_EXPIRED");
    err.code = "ROOM_EXPIRED";
    throw err;
  }
  if (data.players?.host?.uid === uid) {
    setOnlineSession({ roomId: code, slot: "host" });
    return code;
  }
  if (data.players?.guest) {
    if (data.players.guest.uid === uid) {
      setOnlineSession({ roomId: code, slot: "guest" });
      return code;
    }
    const err = new Error("ROOM_FULL");
    err.code = "ROOM_FULL";
    throw err;
  }

  const guest = { uid, name, childId, ready: false };
  const { db } = await ensureFirebase();
  await update(r, { "players/guest": guest });
  try {
    await onDisconnect(ref(db, `rooms/${code}/players/guest`)).remove();
  } catch (disconnectErr) {
    console.warn("onDisconnect guest cleanup 未設定", disconnectErr);
  }
  setOnlineSession({ roomId: code, slot: "guest" });
  return code;
}

/** @param {string} roomId @param {RoomSlot} slot @param {boolean} ready */
export async function setPlayerReady(roomId, slot, ready) {
  const r = await roomRef(roomId);
  await update(r, { [`players/${slot}/ready`]: !!ready });
}

/** 房主清除殘留來賓 */
export async function clearGuestSlot(roomId) {
  const { uid } = await ensureFirebase();
  const snap = await getRoomSnapshot(roomId);
  if (!snap?.players?.host || snap.players.host.uid !== uid) {
    const err = new Error("NOT_HOST");
    err.code = "NOT_HOST";
    throw err;
  }
  const r = await roomRef(roomId);
  await update(r, {
    "players/guest": null,
    state: null,
    sky: null,
    "meta/status": "lobby",
  });
}

/** 對局結束後回到同一房間的等候室（不需重建房間） */
export async function returnRoomToLobby(roomId) {
  const r = await roomRef(roomId);
  const snap = await get(r);
  if (!snap.exists()) {
    const err = new Error("ROOM_NOT_FOUND");
    err.code = "ROOM_NOT_FOUND";
    throw err;
  }
  const data = snap.val();
  /** @type {Record<string, unknown>} */
  const updates = {
    state: null,
    sky: null,
    inputs: null,
    "meta/status": "lobby",
    "meta/expiresAt": Date.now() + ROOM_TTL_MS,
  };
  if (data.players?.host) {
    updates["players/host/ready"] = false;
    updates["players/host/ship"] = null;
  }
  if (data.players?.guest) {
    updates["players/guest/ready"] = false;
    updates["players/guest/ship"] = null;
  }
  await update(r, updates);
}

/** @param {string} roomId @param {object} state */
export async function startGameRoom(roomId, state) {
  const r = await roomRef(roomId);
  await update(r, {
    "meta/status": "playing",
    state,
  });
}

/**
 * @param {string} roomId
 * @param {'host' | 'guest'} blackSlot
 */
export async function startGomokuRoom(roomId, blackSlot) {
  const whiteSlot = blackSlot === "host" ? "guest" : "host";
  await startGameRoom(roomId, {
    blackPlayerId: blackSlot,
    whitePlayerId: whiteSlot,
    currentPlayerId: blackSlot,
    cells: ".".repeat(225),
    lastMove: null,
    over: false,
    winner: null,
    winLine: null,
  });
}

/**
 * @param {string} roomId
 * @param {'host' | 'guest'} redSlot
 */
export async function startXiangqiRoom(roomId, redSlot) {
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

/**
 * @param {string} roomId
 * @returns {Promise<RoomSnapshot | null>}
 */
export async function getRoomSnapshot(roomId) {
  const r = await roomRef(roomId);
  const snap = await get(r);
  if (!snap.exists()) return null;
  return snapshotFromVal(roomId, snap.val());
}

/**
 * @param {string} roomId
 * @param {(snap: RoomSnapshot | null) => void} cb
 * @returns {() => void}
 */
export function subscribeRoom(roomId, cb) {
  let unsubscribe = () => {};
  ensureFirebase().then(({ db }) => {
    const r = ref(db, `rooms/${roomId}`);
    unsubscribe = onValue(r, (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(snapshotFromVal(roomId, snap.val()));
    });
  });
  return () => unsubscribe();
}

export async function leaveRoom(roomId, slot) {
  const r = await roomRef(roomId);
  if (slot === "host") {
    await remove(r);
  } else {
    await update(r, { "players/guest": null, state: null, "meta/status": "lobby" });
  }
  setOnlineSession(null);
}

/**
 * @param {string} roomId
 * @param {(current: object | null) => object | null | undefined} mutator
 */
export async function transactGameState(roomId, mutator) {
  const { db } = await ensureFirebase();
  const gRef = ref(db, `rooms/${roomId}/state`);
  const result = await runTransaction(gRef, mutator);
  return result.committed ? result.snapshot.val() : null;
}

/** @deprecated 使用 transactGameState */
export async function transactGomoku(roomId, mutator) {
  return transactGameState(roomId, mutator);
}
