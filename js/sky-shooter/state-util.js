/** Firebase RTDB 常把陣列存成 {0:…,1:…}，讀回時需還原 */
export function asList(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") {
    return Object.keys(val)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => val[k]);
  }
  return [];
}

/** @param {object | null} state */
export function normalizeSkyState(state) {
  if (!state) return state;
  state.enemies = asList(state.enemies);
  state.bullets = asList(state.bullets);
  state.eBullets = asList(state.eBullets);
  state.pickups = asList(state.pickups);
  state.particles = asList(state.particles);
  state.missileTracks = asList(state.missileTracks);
  if (state.players) {
    for (const slot of ["host", "guest"]) {
      if (state.players[slot]) state.players[slot].slot = slot;
    }
  }
  return state;
}

export function isValidSkyState(state) {
  return !!(state && state.players && state.players.host && state.players.guest);
}
