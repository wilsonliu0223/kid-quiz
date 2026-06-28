import { onValue, ref, update } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { ensureFirebase } from "./firebase-app.js";
import { asList } from "./sky-shooter/state-util.js";

const ENTITY_KINDS = ["enemies", "bullets", "eBullets", "pickups"];

/** @param {unknown} list */
function listToIdMap(list) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const e of asList(list)) {
    if (e && e.id != null) out[String(e.id)] = e;
  }
  return out;
}

/** @param {unknown} list */
function tracksToIdMap(list) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const t of asList(list)) {
    if (!t || t.targetId == null) continue;
    out[`${t.owner}_${t.targetId}`] = t;
  }
  return out;
}

/** @param {Record<string, object> | null | undefined} map */
function mapToList(map) {
  if (!map || typeof map !== "object") return [];
  return Object.values(map);
}

/** @param {object} state */
export function stateToSkyTree(state) {
  const meta = {
    mode: state.mode,
    t: state.t,
    phase: state.phase,
    teamScore: state.teamScore,
    scores: state.scores,
    bossSpawned: state.bossSpawned,
    flash: state.flash,
    endReason: state.endReason,
    winner: state.winner,
    bossKillCredit: state.bossKillCredit,
  };
  return {
    meta,
    players: {
      host: { ...state.players.host },
      guest: { ...state.players.guest },
    },
    enemies: listToIdMap(state.enemies),
    bullets: listToIdMap(state.bullets),
    eBullets: listToIdMap(state.eBullets),
    pickups: listToIdMap(state.pickups),
    missileTracks: tracksToIdMap(state.missileTracks),
  };
}

/** @param {object | null | undefined} sky */
export function skyTreeToState(sky) {
  if (!sky?.meta || !sky?.players?.host || !sky?.players?.guest) return null;
  return {
    ...sky.meta,
    players: sky.players,
    enemies: mapToList(sky.enemies),
    bullets: mapToList(sky.bullets),
    eBullets: mapToList(sky.eBullets),
    pickups: mapToList(sky.pickups),
    missileTracks: mapToList(sky.missileTracks),
    particles: [],
  };
}

/** @param {object | null | undefined} roomVal */
export function skyStateFromRoom(roomVal) {
  if (!roomVal) return null;
  if (roomVal.sky) return skyTreeToState(roomVal.sky);
  if (roomVal.state?.players?.host && roomVal.state?.players?.guest) return roomVal.state;
  return null;
}

function jsonEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {object} prevTree
 * @param {object} nextTree
 * @returns {Record<string, unknown>}
 */
export function buildSkyShardUpdates(prevTree, nextTree) {
  /** @type {Record<string, unknown>} */
  const u = {};
  for (const [k, v] of Object.entries(nextTree.meta)) {
    if (!jsonEq(prevTree.meta[k], v)) u[`sky/meta/${k}`] = v;
  }
  for (const slot of ["host", "guest"]) {
    if (!jsonEq(prevTree.players[slot], nextTree.players[slot])) {
      u[`sky/players/${slot}`] = nextTree.players[slot];
    }
  }
  for (const kind of ENTITY_KINDS) {
    diffIdMap(prevTree[kind], nextTree[kind], `sky/${kind}`, u);
  }
  diffIdMap(prevTree.missileTracks, nextTree.missileTracks, "sky/missileTracks", u);
  return u;
}

function diffIdMap(prev, next, prefix, u) {
  const p = prev || {};
  const n = next || {};
  for (const [id, ent] of Object.entries(n)) {
    if (!jsonEq(p[id], ent)) u[`${prefix}/${id}`] = ent;
  }
  for (const id of Object.keys(p)) {
    if (!(id in n)) u[`${prefix}/${id}`] = null;
  }
}

/** @param {string} roomId @param {object} state */
export async function writeFullSkyShard(roomId, state) {
  const { db } = await ensureFirebase();
  const tree = stateToSkyTree(state);
  await update(ref(db, `rooms/${roomId}`), {
    "meta/status": "playing",
    state: null,
    sky: tree,
  });
  return tree;
}

/** @param {string} roomId */
export async function clearSkyShard(roomId) {
  const { db } = await ensureFirebase();
  await update(ref(db, `rooms/${roomId}`), { state: null, sky: null });
}

/**
 * 分路監聽 sky 子樹，僅在變動區塊到達時組裝 state
 * @param {string} roomId
 * @param {(state: object) => void} onState
 */
export function subscribeSkyShard(roomId, onState) {
  let unsub = () => {};
  let rafPending = 0;

  /** @type {object} */
  const tree = {
    meta: {},
    players: { host: null, guest: null },
    enemies: {},
    bullets: {},
    eBullets: {},
    pickups: {},
    missileTracks: {},
  };

  const emit = () => {
    if (rafPending) return;
    rafPending = requestAnimationFrame(() => {
      rafPending = 0;
      const state = skyTreeToState(tree);
      if (state) onState(state);
    });
  };

  ensureFirebase().then(({ db }) => {
    const base = `rooms/${roomId}/sky`;
    const parts = [
      onValue(ref(db, `${base}/meta`), (snap) => {
        tree.meta = snap.val() || {};
        emit();
      }),
      onValue(ref(db, `${base}/players`), (snap) => {
        const p = snap.val() || {};
        tree.players = { host: p.host || null, guest: p.guest || null };
        emit();
      }),
      ...ENTITY_KINDS.map((kind) =>
        onValue(ref(db, `${base}/${kind}`), (snap) => {
          tree[kind] = snap.val() || {};
          emit();
        }),
      ),
      onValue(ref(db, `${base}/missileTracks`), (snap) => {
        tree.missileTracks = snap.val() || {};
        emit();
      }),
    ];
    unsub = () => {
      if (rafPending) cancelAnimationFrame(rafPending);
      for (const off of parts) off();
    };
  });

  return () => unsub();
}
