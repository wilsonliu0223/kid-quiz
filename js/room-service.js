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
 */

/**
 * @typedef {object} RoomSnapshot
 * @property {string} roomId
 * @property {{ game: string, createdAt: number, expiresAt: number, status: string }} meta
 * @property {{ host: RoomPlayer | null, guest: RoomPlayer | null }} players
 * @property {object | null} gomoku
 */

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
 */
export async function createRoom(game, name, childId) {
  const { uid } = await ensureFirebase();

  for (let attempt = 0; attempt < 12; attempt++) {
    const roomId = randomRoomId();
    const r = await roomRef(roomId);
    const snap = await get(r);
    if (snap.exists()) continue;

    const now = Date.now();
    const payload = {
      meta: {
        game,
        createdAt: now,
        expiresAt: now + ROOM_TTL_MS,
        status: "lobby",
      },
      players: {
        host: { uid, name, childId, ready: false },
        guest: null,
      },
      gomoku: null,
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

/** 房主清除殘留來賓（對方沒進等候室、或測試卡「房間已滿」時用） */
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
    gomoku: null,
    "meta/status": "lobby",
  });
}

/**
 * @param {string} roomId
 * @param {'host' | 'guest'} blackSlot
 */
export async function startGomokuRoom(roomId, blackSlot) {
  const r = await roomRef(roomId);
  const whiteSlot = blackSlot === "host" ? "guest" : "host";
  const gomoku = {
    blackPlayerId: blackSlot,
    whitePlayerId: whiteSlot,
    currentPlayerId: blackSlot,
    cells: ".".repeat(225),
    lastMove: null,
    over: false,
    winner: null,
    winLine: null,
  };
  await update(r, {
    "meta/status": "playing",
    gomoku,
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
  const val = snap.val();
  return {
    roomId,
    meta: val.meta,
    players: val.players || { host: null, guest: null },
    gomoku: val.gomoku || null,
  };
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
      const val = snap.val();
      cb({
        roomId,
        meta: val.meta,
        players: val.players || { host: null, guest: null },
        gomoku: val.gomoku || null,
      });
    });
  });
  return () => unsubscribe();
}

export async function leaveRoom(roomId, slot) {
  const r = await roomRef(roomId);
  if (slot === "host") {
    await remove(r);
  } else {
    await update(r, { "players/guest": null, gomoku: null, "meta/status": "lobby" });
  }
  setOnlineSession(null);
}

/**
 * @param {string} roomId
 * @param {RoomSlot} slot
 * @param {(current: object | null) => object | null | undefined} mutator
 */
export async function transactGomoku(roomId, mutator) {
  const { db } = await ensureFirebase();
  const gRef = ref(db, `rooms/${roomId}/gomoku`);
  const result = await runTransaction(gRef, mutator);
  return result.committed ? result.snapshot.val() : null;
}
