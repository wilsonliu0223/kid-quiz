import { CONFIG } from "./config.site.js";

const KEY_NAMES = "kid-quiz-child-names";

function defaultChildren() {
  const fromConfig = CONFIG.CHILD_NAMES || {};
  return [
    { id: "A", name: fromConfig.A || "思妘" },
    { id: "B", name: fromConfig.B || "思妤" },
  ];
}

function migrateStored(raw) {
  if (!raw) return defaultChildren();
  if (Array.isArray(raw.children)) {
    const list = raw.children
      .filter((c) => c && c.id && String(c.name || "").trim())
      .map((c) => ({ id: String(c.id), name: String(c.name).trim() }));
    return list.length ? list : defaultChildren();
  }
  if (raw.A || raw.B) {
    const list = [];
    for (const key of Object.keys(raw).sort()) {
      const name = String(raw[key] || "").trim();
      if (name) list.push({ id: key, name });
    }
    return list.length ? list : defaultChildren();
  }
  return defaultChildren();
}

export function getChildren() {
  try {
    const raw = localStorage.getItem(KEY_NAMES);
    if (!raw) return defaultChildren();
    return migrateStored(JSON.parse(raw));
  } catch {
    return defaultChildren();
  }
}

function persistChildren(children) {
  const list = children
    .map((c) => ({
      id: String(c.id || "").trim(),
      name: String(c.name || "").trim(),
    }))
    .filter((c) => c.id && c.name);
  const next = list.length ? list : defaultChildren();
  localStorage.setItem(KEY_NAMES, JSON.stringify({ children: next }));
  return next;
}

export function nextChildId(existingIds) {
  const ids = existingIds instanceof Set ? existingIds : new Set(existingIds);
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(65 + i);
    if (!ids.has(id)) return id;
  }
  return `c${Date.now()}`;
}

/**
 * @param {{ id?: string, name: string }[]} children
 */
export function setChildren(children) {
  const ids = new Set();
  const list = children.map((c, index) => {
    let id = String(c.id || "").trim();
    if (!id || ids.has(id)) id = nextChildId(ids);
    ids.add(id);
    const name = String(c.name || "").trim() || `小孩 ${index + 1}`;
    return { id, name };
  });
  return persistChildren(list);
}

/** @deprecated 相容舊呼叫 */
export function setChildNames(names) {
  return setChildren(
    Object.entries(names).map(([id, name]) => ({ id, name: String(name) }))
  );
}

export function getChildNames() {
  const map = {};
  for (const c of getChildren()) map[c.id] = c.name;
  return map;
}

export function getChildName(id) {
  return getChildNames()[id] || id;
}

export function getChildLabel(id) {
  return getChildName(id);
}

/** 除 active 以外的人，可作為對戰對象 */
export function getDuoOpponentCandidates(activeChildId) {
  return getChildren().filter((c) => c.id !== activeChildId);
}

/** @deprecated 請改用 duo-pick.js 的 getActiveDuoPlayerIds */
export function getDuoPlayerIds() {
  const kids = getChildren();
  if (kids.length < 2) return [];
  return [kids[0].id, kids[1].id];
}

export function duoScores(playerIds) {
  const scores = {};
  for (const id of playerIds) scores[id] = 0;
  return scores;
}

export function otherDuoPlayer(id, playerIds) {
  return playerIds.find((p) => p !== id) || playerIds[0];
}
