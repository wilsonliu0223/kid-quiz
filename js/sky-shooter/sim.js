import { shipOrDefault } from "./ships.js?v=sky-duo-v26";
import { asList } from "./state-util.js?v=sky-duo-v26";

export const COOP_BOSS_AT = 95;
/** 單人關卡1 同款：Boss HP、巡邏、三種彈幕 */
export const COOP_BOSS_HP = 120;
export const COOP_BOSS_HOMING_SEC = 3;
export const VERSUS_TIME = 180;
export const VERSUS_BOSS_AT = 95;
export const BOSS_KILL_BONUS = 15;
export const PVP_HIT_SCORE = 1;
/** 對戰互射：累積傷害，滿了才扣 1 命 */
export const PVP_MAX_HP = 100;
export const PVP_BULLET_DAMAGE = 11;
export const PVP_HIT_INVULN = 1.9;
export const PVP_LIFE_LOSS_INVULN = 1.35;
/** 對戰搶分：暫時雙方無敵（只搶分、不掉命） */
export const VERSUS_PLAYERS_INVINCIBLE = true;

/** 單機同款三區比例（上／中／下） */
export const ZONE_RATIO = { top: 0.38, mid: 0.34, bot: 0.28 };
/** 合作模式：僅限下方戰鬥區（與單機相同，不可進中間敵區） */
export const COOP_Y_BAND = [
  ZONE_RATIO.top + ZONE_RATIO.mid + 0.025,
  ZONE_RATIO.top + ZONE_RATIO.mid + ZONE_RATIO.bot - 0.085,
];
/** 對戰模式：來賓在畫面上方區（世界座標），與房主區上下對稱 */
export const VERSUS_GUEST_Y_BAND = [1 - COOP_Y_BAND[1], 1 - COOP_Y_BAND[0]];

const POWER_OFFSETS = [[0], [-0.02, 0.02], [-0.024, 0, 0.024], [-0.032, -0.016, 0, 0.016, 0.032]];

let nextEntityId = 1;
function eid() {
  return nextEntityId++;
}

/** @param {'coop' | 'versus'} mode @param {{ host: string, guest: string }} ships */
export function createInitialState(mode, ships) {
  nextEntityId = 1;
  const hostShip = shipOrDefault(ships.host);
  const guestShip = shipOrDefault(ships.guest);
  const isCoop = mode === "coop";

  const state = {
    mode,
    t: 0,
    phase: "play",
    endReason: "",
    winner: null,
    teamScore: 0,
    scores: { host: 0, guest: 0 },
    bossKillCredit: null,
    bossSpawned: false,
    spawnCd: 0.35,
    flash: 0,
    players: {
      host: makePlayer("host", hostShip, 0.35, isCoop ? 0.9 : 0.84),
      guest: makePlayer("guest", guestShip, 0.65, isCoop ? 0.9 : VERSUS_GUEST_Y_BAND[0] + 0.095),
    },
    enemies: [],
    bullets: [],
    eBullets: [],
    pickups: [],
    particles: [],
    missileTracks: [],
    bossOrbCd: 5,
  };
  state.enemies.push(
    {
      id: eid(),
      kind: "grunt",
      x: 0.55,
      y: 0.35,
      w: 0.05,
      h: 0.042,
      hp: 2,
      speed: 0.14,
      fireCd: 1.5,
      shield: 0,
    },
    {
      id: eid(),
      kind: "fast",
      x: 0.72,
      y: 0.42,
      w: 0.04,
      h: 0.035,
      hp: 1,
      speed: 0.2,
      fireCd: 1.2,
      shield: 0,
    },
  );
  return state;
}

function makePlayer(slot, ship, x, y) {
  return {
    slot,
    ship: ship.id,
    x,
    y,
    lives: ship.lives,
    invuln: 0,
    power: 0,
    weapon: "straight",
    hasSpread: false,
    hasLaser: false,
    missileT: 0,
    fireCd: 0,
    missileCd: 0,
    ultT: 0,
    energy: 0,
    pvpHp: 100,
  };
}

function otherSlot(slot) {
  return slot === "host" ? "guest" : "host";
}

/** @param {'host'|'guest'} slot @param {'coop'|'versus'} mode */
export function versusYBand(slot, mode) {
  if (mode !== "versus") return COOP_Y_BAND;
  return slot === "guest" ? VERSUS_GUEST_Y_BAND : COOP_Y_BAND;
}

/** 螢幕觸控 → 世界座標（對戰來賓：螢幕 y 翻轉對應翻轉視角） */
export function pointerToWorld(slot, mode, screenX, screenY) {
  let y = Number(screenY);
  if (mode === "versus" && slot === "guest") y = 1 - y;
  return clampPointerInput(slot, mode, screenX, y);
}

/** @param {'host'|'guest'} slot @param {'coop'|'versus'} mode */
export function clampPointerInput(slot, mode, x, y) {
  const pad = 0.06;
  const cx = Math.max(pad, Math.min(1 - pad, Number(x)));
  let cy = Number(y);
  const band = versusYBand(slot, mode);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return { x: 0.5, y: band[1] - 0.04 };
  }
  cy = Math.max(band[0], Math.min(band[1], cy));
  return { x: cx, y: cy };
}

/** 每幀強制把玩家限制在戰鬥區內 */
export function clampPlayersToZone(state) {
  if (!state?.players) return;
  for (const slot of ["host", "guest"]) {
    const p = state.players[slot];
    if (!p || p.lives <= 0) continue;
    const c = clampPointerInput(slot, state.mode === "versus" ? "versus" : "coop", p.x, p.y);
    p.x = c.x;
    p.y = c.y;
  }
}

export function canPlayerControl(state, slot) {
  const p = state?.players?.[slot];
  if (!p || p.lives <= 0) return false;
  return state.phase === "play" || state.phase === "boss";
}

/** @param {object} state @param {'host'|'guest'} slot @param {{ x?: number, y?: number, weaponTap?: boolean }} input */
export function applyPlayerInput(state, slot, input) {
  const p = state.players[slot];
  if (!p || !canPlayerControl(state, slot)) return;
  const nx = Number(input.x);
  const ny = Number(input.y);
  if (Number.isFinite(nx) && Number.isFinite(ny)) {
    const c = clampPointerInput(slot, state.mode === "versus" ? "versus" : "coop", nx, ny);
    p.x = c.x;
    p.y = c.y;
  } else if (Number.isFinite(nx)) {
    p.x = clampPointerInput(slot, state.mode === "versus" ? "versus" : "coop", nx, p.y).x;
  } else if (Number.isFinite(ny)) {
    p.y = clampPointerInput(slot, state.mode === "versus" ? "versus" : "coop", p.x, ny).y;
  }
  if (input.weaponTap) cycleWeapon(p);
}

function cycleWeapon(p) {
  const list = ["straight"];
  if (p.hasSpread) list.push("spread");
  if (p.hasLaser) list.push("laser");
  if (list.length <= 1) return;
  const i = list.indexOf(p.weapon);
  p.weapon = list[i >= 0 ? (i + 1) % list.length : 0];
}

/** @param {object} state @param {number} dt */
export function stepSimulation(state, dt) {
  if (state.phase !== "play" && state.phase !== "boss") return state;
  state.enemies = asList(state.enemies);
  state.bullets = asList(state.bullets);
  state.eBullets = asList(state.eBullets);
  state.pickups = asList(state.pickups);
  state.particles = asList(state.particles);
  state.missileTracks = asList(state.missileTracks);
  state.t += dt;
  if (state.flash > 0) state.flash -= dt;

  const isCoop = state.mode === "coop";
  if (!isCoop && state.t >= VERSUS_TIME) {
    endVersus(state);
    return state;
  }

  if (!state.bossSpawned && state.t >= (isCoop ? COOP_BOSS_AT : VERSUS_BOSS_AT)) {
    spawnBoss(state);
  }

  updatePlayers(state, dt);
  updateMissileTracks(state, dt);
  if (isCoop && state.bossSpawned) updateCoopBossOrbs(state, dt);
  updateSpawns(state, dt);
  updateEnemies(state, dt);
  updateBullets(state, dt);
  updatePickups(state, dt);
  updateParticles(state, dt);

  clampPlayersToZone(state);

  if (state.mode === "versus" && VERSUS_PLAYERS_INVINCIBLE) {
    ensureVersusGodMode(state);
  }

  if (isCoop) {
    if (state.players.host.lives <= 0 && state.players.guest.lives <= 0) {
      state.phase = "end";
      state.endReason = "fail";
    }
  } else {
    checkVersusElimination(state);
  }

  if (state.phase === "boss" && !state.enemies.some((e) => e.kind === "boss")) {
    if (isCoop) {
      state.phase = "end";
      state.endReason = "win";
    }
  }

  return state;
}

function endVersus(state) {
  state.phase = "end";
  const h = state.scores.host;
  const g = state.scores.guest;
  if (h > g) state.winner = "host";
  else if (g > h) state.winner = "guest";
  else state.winner = null;
  if (!state.endReason) state.endReason = "time";
}

function ensureVersusGodMode(state) {
  for (const slot of ["host", "guest"]) {
    const p = state.players[slot];
    if (!p) continue;
    const ship = shipOrDefault(p.ship);
    if (p.lives < ship.lives) p.lives = ship.lives;
    if (typeof p.pvpHp !== "number" || p.pvpHp < PVP_MAX_HP) p.pvpHp = PVP_MAX_HP;
  }
}

function checkVersusElimination(state) {
  if (VERSUS_PLAYERS_INVINCIBLE) return;
  const hDead = state.players.host.lives <= 0;
  const gDead = state.players.guest.lives <= 0;
  if (!hDead && !gDead) return;
  state.phase = "end";
  state.endReason = "elim";
  if (hDead && gDead) {
    const h = state.scores.host;
    const g = state.scores.guest;
    if (h > g) state.winner = "host";
    else if (g > h) state.winner = "guest";
    else state.winner = null;
  } else if (hDead) {
    state.winner = "guest";
  } else {
    state.winner = "host";
  }
}

function spawnBoss(state) {
  state.bossSpawned = true;
  state.phase = "boss";
  state.enemies = state.enemies.filter((e) => e.kind === "boss");
  if (state.mode === "coop") {
    state.bossOrbCd = 5;
    const bossY = ZONE_RATIO.top + ZONE_RATIO.mid * 0.32;
    state.enemies.push({
      id: eid(),
      kind: "boss",
      x: 0.38,
      y: bossY,
      w: 0.17,
      h: 0.07,
      hp: COOP_BOSS_HP,
      maxHp: COOP_BOSS_HP,
      speed: 0.042,
      fireCd: 0.5,
      shield: 0,
      spin: 0,
      bossDir: 1,
    });
  } else {
    state.enemies.push({
      id: eid(),
      kind: "boss",
      x: 0.5,
      y: 0.35,
      w: 0.12,
      h: 0.08,
      hp: 100,
      maxHp: 100,
      fireCd: 0.6,
      shield: 0,
    });
  }
  state.flash = 0.15;
}

/** 單人同款：依時間調整生成間隔與場上上限（雙人略多） */
function coopSpawnGap(t) {
  if (t < 40) return 2.2;
  if (t < 90) return 1.5;
  return 1.0;
}

function coopMaxGrunts(t) {
  if (t < 40) return 6;
  if (t < 90) return 8;
  return 10;
}

function updateCoopBossOrbs(state, dt) {
  if (!state.enemies.some((e) => e.kind === "boss")) return;
  state.bossOrbCd = (state.bossOrbCd ?? 5) - dt;
  if (state.bossOrbCd > 0 || state.pickups.length >= 2) return;
  state.bossOrbCd = 7;
  const boss = state.enemies.find((e) => e.kind === "boss");
  if (!boss) return;
  const types = ["power", "spread", "laser", "missile"];
  const type = types[Math.floor(Math.random() * types.length)];
  state.pickups.push({
    id: eid(),
    type,
    x: boss.x + (Math.random() - 0.5) * 0.12,
    y: boss.y + 0.025,
    vy: 0.05,
    life: 12,
  });
}

function pushEnemyBullet(state, x, y, vx, vy, r, extra = {}) {
  state.eBullets.push({
    id: eid(),
    x,
    y,
    vx,
    vy,
    r,
    ...extra,
  });
}

function bossAttackCoop(state, e) {
  e.spin = (e.spin || 0) + 0.4;
  const target = nearestPlayer(state, e);
  const roll = Math.random();
  if (roll < 0.35) {
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16 + e.spin;
      pushEnemyBullet(state, e.x, e.y, Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.012, {
        glow: true,
      });
    }
    return;
  }
  if (roll < 0.65) {
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i - 3.5) * 0.14;
      pushEnemyBullet(
        state,
        e.x - 0.04 + i * 0.01,
        e.y + 0.012,
        Math.cos(a) * 0.29,
        Math.sin(a) * 0.29,
        0.011,
        { glow: true },
      );
    }
    return;
  }
  if (!target) return;
  const ang = Math.atan2(target.y - e.y, target.x - e.x);
  for (let k = -1; k <= 1; k++) {
    const a = ang + k * 0.12;
    pushEnemyBullet(state, e.x, e.y + 0.01, Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.012, {
      glow: true,
      homing: k === 0 ? 0.15 : 0,
      homingT: k === 0 ? COOP_BOSS_HOMING_SEC : 0,
    });
  }
}

function updateCoopBoss(state, e, dt) {
  e.x += e.speed * dt * (e.bossDir || 1);
  if (e.x > 0.55) e.bossDir = -1;
  else if (e.x < 0.25) e.bossDir = 1;
  e.fireCd -= dt;
  if (e.fireCd > 0) return;
  e.fireCd = e.hp < COOP_BOSS_HP * 0.5 ? 0.38 : 0.52;
  bossAttackCoop(state, e);
}

function updateVersusBoss(state, e, dt) {
  e.x += Math.sin(state.t * 1.2) * 0.08 * dt;
  e.fireCd -= dt;
  if (e.fireCd <= 0) {
    e.fireCd = 0.55;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      pushEnemyBullet(state, e.x, e.y, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.01);
    }
  }
}

function updateSpawns(state, dt) {
  if (state.bossSpawned) return;
  state.spawnCd -= dt;
  const grunts = state.enemies.filter((e) => e.kind !== "boss").length;
  if (state.mode === "coop") {
    const max = coopMaxGrunts(state.t);
    if (state.spawnCd <= 0 && grunts < max) {
      state.spawnCd = coopSpawnGap(state.t);
      state.enemies.push(spawnCoopEnemy());
      if (grunts + 1 < max && Math.random() < 0.22) {
        state.enemies.push(spawnCoopEnemy());
      }
    }
    return;
  }
  const max = 5;
  if (state.spawnCd <= 0 && grunts < max) {
    state.spawnCd = 1.4;
    const fast = Math.random() < 0.28;
    state.enemies.push({
      id: eid(),
      kind: fast ? "fast" : "grunt",
      x: -0.05,
      y: 0.28 + Math.random() * 0.42,
      w: fast ? 0.04 : 0.05,
      h: fast ? 0.035 : 0.042,
      hp: fast ? 1 : 2,
      speed: fast ? 0.22 : 0.14,
      vx: fast ? 0.22 : 0.14,
      vy: 0,
      fireCd: 1.2 + Math.random(),
      shield: 0.8,
    });
  }
}

/** 合作模式：敵軍從左、右、上三邊進場 */
function spawnCoopEnemy() {
  const fast = Math.random() < 0.28;
  const speed = fast ? 0.22 : 0.14;
  const side = Math.floor(Math.random() * 3);
  const base = {
    id: eid(),
    kind: fast ? "fast" : "grunt",
    w: fast ? 0.04 : 0.05,
    h: fast ? 0.035 : 0.042,
    hp: fast ? 1 : 2,
    speed,
    fireCd: 1.2 + Math.random(),
    shield: 0.8,
  };
  if (side === 0) {
    return { ...base, x: -0.05, y: 0.15 + Math.random() * 0.55, vx: speed, vy: 0 };
  }
  if (side === 1) {
    return { ...base, x: 1.05, y: 0.15 + Math.random() * 0.55, vx: -speed, vy: 0 };
  }
  return {
    ...base,
    x: 0.08 + Math.random() * 0.84,
    y: -0.05,
    vx: (Math.random() - 0.5) * 0.05,
    vy: speed * 0.9,
  };
}

function updatePlayers(state, dt) {
  for (const slot of ["host", "guest"]) {
    const p = state.players[slot];
    if (!p || p.lives <= 0) continue;
    const ship = shipOrDefault(p.ship);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.missileT > 0) {
      p.missileT -= dt;
      if (p.weapon !== "laser") {
        p.missileCd -= dt;
        if (p.missileCd <= 0) {
          p.missileCd = 1.4;
          spawnHomingBullet(state, p);
        }
      }
    }

    p.fireCd -= dt;
    if (p.fireCd <= 0 && p.weapon !== "laser") {
      p.fireCd = p.weapon === "spread" ? 0.16 : 0.1;
      firePlayerBullets(state, p, ship);
    }

    if (p.weapon === "laser") {
      fireLaser(state, p, ship, dt);
    }
  }
}

function firePlayerBullets(state, p, ship) {
  const dir = p.slot === "guest" && state.mode === "versus" ? 1 : -1;
  const offsets = POWER_OFFSETS[p.power] || [0];
  const spreads =
    p.weapon === "spread"
      ? [-0.12, 0, 0.12, ...(ship.spreadExtra ? [-0.22, 0.22] : [])]
      : [0];
  for (const off of offsets) {
    for (const ang of spreads) {
      state.bullets.push({
        id: eid(),
        owner: p.slot,
        x: p.x + off,
        y: p.y + dir * 0.03,
        vx: ang * 0.35,
        vy: dir * 0.65,
        r: 0.012,
        dmg: 1 + ship.dmgBonus,
        pvp: state.mode === "versus",
      });
    }
  }
}

function spawnHomingBullet(state, p) {
  const dir = p.slot === "guest" && state.mode === "versus" ? 1 : -1;
  state.bullets.push({
    id: eid(),
    owner: p.slot,
    x: p.x,
    y: p.y + dir * 0.02,
    vx: (Math.random() - 0.5) * 0.05,
    vy: dir * 0.55,
    r: 0.014,
    dmg: 2,
    homing: true,
    pvp: false,
  });
}

function fireLaser(state, p, ship, dt) {
  const down = p.slot === "guest" && state.mode === "versus";
  const half = (0.04 + p.power * 0.012) * ship.laserWidth;
  const dps = (4 + p.power) * dt * 8;
  for (const e of state.enemies) {
    if (e.shield > 0) continue;
    if (Math.abs(e.x - p.x) < half + e.w && (down ? e.y > p.y : e.y < p.y)) {
      damageEnemy(state, e, dps, p.slot);
    }
  }
  if (state.mode === "versus") {
    const opp = state.players[otherSlot(p.slot)];
    if (opp && opp.lives > 0 && Math.abs(opp.x - p.x) < half + 0.04) {
      const inBeam = down ? opp.y > p.y : opp.y < p.y;
      if (inBeam && opp.invuln <= 0) {
        p.pvpLaserCd = (p.pvpLaserCd || 0) - dt;
        if (p.pvpLaserCd <= 0) {
          p.pvpLaserCd = 0.5;
          applyPvpChip(state, opp.slot, p.slot, 7);
        }
      }
    }
  }
  if (p.missileT > 0) syncMissileTracks(state, p);
}

function syncMissileTracks(state, p) {
  const targets = state.enemies.filter((e) => e.shield <= 0);
  const existing = new Set(
    state.missileTracks.filter((t) => t.owner === p.slot).map((t) => t.targetId),
  );
  for (const e of targets) {
    if (!existing.has(e.id)) {
      state.missileTracks.push({ owner: p.slot, targetId: e.id, pulse: Math.random() * 6 });
    }
  }
  state.missileTracks = state.missileTracks.filter((t) => {
    if (t.owner !== p.slot) return true;
    return state.enemies.some((e) => e.id === t.targetId);
  });
}

function updateMissileTracks(state, dt) {
  for (const t of state.missileTracks) {
    const p = state.players[t.owner];
    const e = state.enemies.find((en) => en.id === t.targetId);
    if (!p || !e || e.shield > 0) continue;
    t.pulse = (t.pulse || 0) + dt * 14;
    const dps = e.kind === "boss" ? 0.35 : e.kind === "fast" ? 0.014 : 0.028;
    damageEnemy(state, e, dps * dt * 60, t.owner);
  }
  state.missileTracks = state.missileTracks.filter((t) =>
    state.enemies.some((e) => e.id === t.targetId),
  );
}

function updateEnemies(state, dt) {
  for (const e of state.enemies) {
    if (e.shield > 0) e.shield -= dt;
    if (e.kind === "boss") {
      if (state.mode === "coop") updateCoopBoss(state, e, dt);
      else updateVersusBoss(state, e, dt);
    } else {
      const vx = typeof e.vx === "number" ? e.vx : e.speed;
      const vy = typeof e.vy === "number" ? e.vy : 0;
      e.x += vx * dt;
      e.y += vy * dt;
      e.fireCd -= dt;
      const onField = e.x > 0.06 && e.x < 0.94 && e.y > 0.06 && e.y < 0.94;
      if (e.fireCd <= 0 && e.shield <= 0 && onField) {
        e.fireCd = 1.1 + Math.random() * 0.8;
        const target = nearestPlayer(state, e);
        if (target) {
          const ang = Math.atan2(target.y - e.y, target.x - e.x);
          state.eBullets.push({
            id: eid(),
            x: e.x,
            y: e.y,
            vx: Math.cos(ang) * 0.25,
            vy: Math.sin(ang) * 0.25,
            r: 0.009,
          });
        }
      }
      if (state.mode === "coop") {
        if (e.x > 1.08 || e.x < -0.08 || e.y > 1.05) {
          e._gone = true;
          state.teamScore = Math.max(0, state.teamScore - 1);
        }
      } else if (e.x > 1.08) {
        e._gone = true;
      }
    }
  }
  state.enemies = state.enemies.filter((e) => !e._gone && e.hp > 0);
}

function nearestPlayer(state, e) {
  let best = null;
  let bestD = Infinity;
  for (const slot of ["host", "guest"]) {
    const p = state.players[slot];
    if (p.lives <= 0) continue;
    const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function updateBullets(state, dt) {
  for (const b of state.bullets) {
    if (b.homing) {
      let best = null;
      let bestD = Infinity;
      for (const e of state.enemies) {
        if (e.shield > 0) continue;
        const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) {
        const ang = Math.atan2(best.y - b.y, best.x - b.x);
        const sp = 0.55;
        b.vx += (Math.cos(ang) * sp - b.vx) * 3 * dt;
        b.vy += (Math.sin(ang) * sp - b.vy) * 3 * dt;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  for (const b of state.bullets) {
    if (b._gone) continue;
    for (const e of state.enemies) {
      if (e.shield > 0) continue;
      if (hitRect(b.x, b.y, b.r, e.x, e.y, e.w, e.h)) {
        b._gone = true;
        damageEnemy(state, e, b.dmg, b.owner);
        break;
      }
    }
    if (b._gone) continue;
    if (b.pvp) {
      const target = otherSlot(b.owner);
      const p = state.players[target];
      if (p && p.lives > 0 && hitCircle(b.x, b.y, b.r, p.x, p.y, 0.04)) {
        b._gone = true;
        applyPvpChip(state, target, b.owner, PVP_BULLET_DAMAGE);
      }
    }
  }
  state.bullets = state.bullets.filter(
    (b) => !b._gone && b.x > -0.05 && b.x < 1.05 && b.y > -0.05 && b.y < 1.05,
  );

  for (const eb of state.eBullets) {
    if (eb.homing > 0 && eb.homingT > 0) {
      eb.homingT -= dt;
      const target = nearestPlayer(state, eb);
      if (target) {
        const ang = Math.atan2(target.y - eb.y, target.x - eb.x);
        const cur = Math.atan2(eb.vy, eb.vx);
        let diff = ang - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const sp = Math.hypot(eb.vx, eb.vy);
        const na = cur + diff * eb.homing;
        eb.vx = Math.cos(na) * sp;
        eb.vy = Math.sin(na) * sp;
      }
    }
    eb.x += eb.vx * dt;
    eb.y += eb.vy * dt;
    for (const slot of ["host", "guest"]) {
      const p = state.players[slot];
      if (p.invuln > 0 || p.lives <= 0) continue;
      if (hitCircle(eb.x, eb.y, eb.r, p.x, p.y, 0.038)) {
        eb._gone = true;
        hurtPlayer(state, slot);
        break;
      }
    }
  }
  state.eBullets = state.eBullets.filter(
    (eb) => !eb._gone && eb.x > -0.05 && eb.x < 1.05 && eb.y > -0.05 && eb.y < 1.05,
  );
}

function applyPvpChip(state, targetSlot, attackerSlot, amount) {
  const p = state.players[targetSlot];
  if (!p || p.lives <= 0 || p.invuln > 0) return false;

  p.invuln = PVP_HIT_INVULN;
  scoreHit(state, attackerSlot, PVP_HIT_SCORE);
  burst(state, p.x, p.y, "#c8a0ff", 6);

  if (state.mode === "versus" && VERSUS_PLAYERS_INVINCIBLE) return true;

  const hp = typeof p.pvpHp === "number" ? p.pvpHp : PVP_MAX_HP;
  p.pvpHp = hp - amount;

  if (p.pvpHp <= 0) {
    const ship = shipOrDefault(p.ship);
    p.lives -= 1;
    p.pvpHp = PVP_MAX_HP;
    p.power = Math.max(0, p.power - 1);
    p.missileT = 0;
    p.invuln = PVP_LIFE_LOSS_INVULN + ship.dodgeInvuln;
    burst(state, p.x, p.y, "#4da6ff", 10);
  }
  return true;
}

function damageEnemy(state, e, dmg, attacker) {
  e.hp -= dmg;
  if (e.hp > 0) return;
  const kind = e.kind;
  if (kind === "boss") {
    state.bossKillCredit = attacker;
    scoreHit(state, attacker, BOSS_KILL_BONUS);
    burst(state, e.x, e.y, "#ffd54a", 16);
    state.enemies = state.enemies.filter((en) => en.id !== e.id);
    if (state.mode === "versus") {
      endVersus(state);
      state.endReason = "boss";
      state.winner =
        state.scores.host === state.scores.guest
          ? attacker
          : state.scores.host > state.scores.guest
            ? "host"
            : "guest";
    }
    return;
  }
  const pts = kind === "fast" ? 2 : 1;
  scoreHit(state, attacker, pts);
  burst(state, e.x, e.y, "#80e8ff", 8);
  maybeDrop(state, e.x, e.y);
  state.enemies = state.enemies.filter((en) => en.id !== e.id);
}

function scoreHit(state, slot, pts) {
  if (state.mode === "coop") state.teamScore += pts;
  else state.scores[slot] = (state.scores[slot] || 0) + pts;
}

function maybeDrop(state, x, y) {
  const r = Math.random();
  let type = null;
  if (r < 0.22) type = "power";
  else if (r < 0.36) type = "spread";
  else if (r < 0.48) type = "laser";
  else if (r < 0.58) type = "missile";
  if (!type) return;
  state.pickups.push({
    id: eid(),
    type,
    x,
    y,
    vy: 0.06,
    life: 10,
  });
}

function updatePickups(state, dt) {
  for (const o of state.pickups) {
    o.life -= dt;
    o.y += o.vy * dt;
    for (const slot of ["host", "guest"]) {
      const p = state.players[slot];
      if (hitCircle(o.x, o.y, 0.02, p.x, p.y, 0.045)) {
        o._gone = true;
        collectPickup(state, p, o.type);
      }
    }
  }
  state.pickups = state.pickups.filter((o) => !o._gone && o.life > 0 && o.y < 0.98);
}

function collectPickup(state, p, type) {
  if (type === "power") p.power = Math.min(3, p.power + 1);
  else if (type === "spread") {
    p.hasSpread = true;
    p.weapon = "spread";
  } else if (type === "laser") {
    p.hasLaser = true;
    p.weapon = "laser";
  } else if (type === "missile") {
    p.missileT = Math.max(p.missileT, 5);
  }
  burst(state, p.x, p.y, "#ffb830", 6);
}

function hurtPlayer(state, slot) {
  if (state.mode === "versus" && VERSUS_PLAYERS_INVINCIBLE) return;
  const p = state.players[slot];
  const ship = shipOrDefault(p.ship);
  if (p.invuln > 0) return;
  if (Math.random() < ship.armorChance && p.power > 0) {
    p.power -= 1;
    p.invuln = 0.5;
    return;
  }
  p.lives -= 1;
  p.power = Math.max(0, p.power - 1);
  p.missileT = 0;
  p.invuln = 1.1 + ship.dodgeInvuln;
  burst(state, p.x, p.y, "#4da6ff", 10);
}

function updateParticles(state, dt) {
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  if (state.particles.length > 100) state.particles.length = 100;
}

function burst(state, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const sp = 0.15 + Math.random() * 0.25;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.25,
      color,
    });
  }
}

function hitCircle(x1, y1, r1, x2, y2, r2) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2 < (r1 + r2) ** 2;
}

function hitRect(px, py, pr, ex, ey, ew, eh) {
  return (
    px + pr > ex - ew * 0.5 &&
    px - pr < ex + ew * 0.5 &&
    py + pr > ey - eh * 0.5 &&
    py - pr < ey + eh * 0.5
  );
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
