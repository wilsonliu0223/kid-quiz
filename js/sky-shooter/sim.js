import { shipOrDefault } from "./ships.js?v=sky-duo-v40";
import { asList } from "./state-util.js?v=sky-duo-v40";

export const COOP_BOSS_AT = 95;
/** 雙人合作每人命數 */
export const COOP_PLAYER_LIVES = 10;
/** 來賓畫面補幀步長（與房主 tick 一致，避免加速感） */
export const HOST_VISUAL_DT = 0.02;
/** 單人關卡1 同款：Boss HP、巡邏、三種彈幕 */
export const COOP_BOSS_HP = 240;
export const VERSUS_BOSS_HP = 200;
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

/** 單人關卡1 同款三區比例（天空／雲層／玩家） */
export const ZONE_RATIO = { top: 0.22, mid: 0.48, bot: 0.3 };
export const ZONE_MID_Y = ZONE_RATIO.top;
export const ZONE_BOT_Y = ZONE_RATIO.top + ZONE_RATIO.mid;
/** 合作模式：僅限下方戰鬥區（與單機相同，不可進中間敵區） */
export const COOP_Y_BAND = [
  ZONE_BOT_Y + 0.025,
  ZONE_BOT_Y + ZONE_RATIO.bot - 0.085,
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
    spawnCdSky: isCoop ? 0.85 : 0,
    spawnCdMid: isCoop ? 0.45 : 0,
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
  if (isCoop) {
    state.players.host.lives = COOP_PLAYER_LIVES;
    state.players.guest.lives = COOP_PLAYER_LIVES;
    state.enemies.push(
      {
        id: eid(),
        kind: "grunt",
        zone: "mid",
        x: 0.55,
        y: ZONE_MID_Y + 0.12,
        w: 0.05,
        h: 0.042,
        hp: 2,
        speed: 0.14,
        vx: -0.14,
        vy: 0,
        fireCd: 1.5,
        shield: 0.8,
      },
      {
        id: eid(),
        kind: "fast",
        zone: "mid",
        x: 0.72,
        y: ZONE_MID_Y + 0.2,
        w: 0.04,
        h: 0.035,
        hp: 1,
        speed: 0.2,
        vx: 0.2,
        vy: 0,
        fireCd: 1.2,
        shield: 0.8,
      },
    );
  } else {
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
  }
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

const LAG_COMP_MAX_MS = 620;
const LAG_COMP_EXTRAP = 1.35;
const COOP_GUEST_HIT_R = 0.031;

/** 房主模擬前設定遠端玩家延遲補償（不寫入 Firebase） */
export function setNetworkLagComp(state, lagBySlot) {
  if (!state) return;
  state._lagComp = lagBySlot;
}

export function clearNetworkLagComp(state) {
  if (state?._lagComp) delete state._lagComp;
}

/** 合作模式：把來賓位置推到補償後座標再跑物理 */
export function applyCoopLagCompPositions(state) {
  if (state?.mode !== "coop" || !state._lagComp) return;
  const pos = playerCombatPos(state, "guest");
  const p = state.players.guest;
  if (p && p.lives > 0) {
    p.x = pos.x;
    p.y = pos.y;
  }
}

/** 合作模式：遠端玩家用最新 input + 外插位置做碰撞／追蹤 */
function playerCombatPos(state, slot) {
  const p = state.players[slot];
  if (!p) return { x: 0.5, y: 0.5 };
  if (state.mode !== "coop") return { x: p.x, y: p.y };

  const lc = state._lagComp?.[slot];
  if (!lc) return { x: p.x, y: p.y };

  const ix = Number(lc.x);
  const iy = Number(lc.y);
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return { x: p.x, y: p.y };

  const t = Number(lc.t) || Date.now();
  const lagMs = Math.min(LAG_COMP_MAX_MS, Math.max(0, Date.now() - t));
  const vx = Number(lc.vx) || 0;
  const vy = Number(lc.vy) || 0;
  const extra = Number(lc.extraMs) || 0;
  const totalSec = (lagMs + extra) / 1000;
  return clampPointerInput(
    slot,
    "coop",
    ix + vx * totalSec * LAG_COMP_EXTRAP,
    iy + vy * totalSec * LAG_COMP_EXTRAP,
  );
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
    const bossY = ZONE_MID_Y + ZONE_RATIO.mid * 0.32;
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
      hp: VERSUS_BOSS_HP,
      maxHp: VERSUS_BOSS_HP,
      fireCd: 0.6,
      shield: 0,
    });
  }
  state.flash = 0.15;
}

const COOP_MID_KINDS = {
  grunt: { hp: 2, w: 0.05, h: 0.042, speed: 0.14, score: 1 },
  fast: { hp: 1, w: 0.04, h: 0.035, speed: 0.22, score: 2 },
  heavy: { hp: 4, w: 0.042, h: 0.035, speed: 0.12, score: 3 },
  tank: { hp: 5, w: 0.048, h: 0.038, speed: 0.1, score: 3 },
  drone: { hp: 2, w: 0.036, h: 0.028, speed: 0.18, score: 2 },
  bomber: { hp: 5, w: 0.042, h: 0.035, speed: 0.13, score: 4 },
  warden: { hp: 3, w: 0.038, h: 0.03, speed: 0.14, score: 4 },
};

function enemyCoopZone(e) {
  if (e.zone) return e.zone;
  if (e.kind === "striker") return "sky";
  return "mid";
}

function countCoopZoneEnemies(state, zone) {
  return state.enemies.filter((e) => e.kind !== "boss" && enemyCoopZone(e) === zone).length;
}

function hasCoopWarden(state) {
  return state.enemies.some((e) => e.kind === "warden");
}

function pickCoopMidKind(state) {
  if (state.t >= 25 && !hasCoopWarden(state) && Math.random() < 0.045) return "warden";
  const r = Math.random();
  if (state.t > 55 && r < 0.1) return "tank";
  if (r < 0.18) return "fast";
  if (r < 0.36) return "heavy";
  if (r < 0.48) return "tank";
  if (r < 0.6) return "drone";
  return "grunt";
}

function coopSkyGap(t) {
  if (t < 40) return 1.15;
  if (t < 90) return 0.9;
  return 0.7;
}

function coopMidGap(t) {
  if (t < 40) return 1.55;
  if (t < 90) return 1.05;
  return 0.8;
}

function coopMaxSky(t) {
  if (t < 40) return 4;
  if (t < 90) return 5;
  return 6;
}

function coopMaxMid(t) {
  if (t < 40) return 6;
  if (t < 90) return 8;
  return 10;
}

function spawnCoopStriker() {
  const side = Math.floor(Math.random() * 3);
  const spd = 0.17 + Math.random() * 0.04;
  const skyTop = 0.04;
  const skyBot = ZONE_MID_Y - 0.03;
  const base = {
    id: eid(),
    kind: "striker",
    zone: "sky",
    w: 0.028,
    h: 0.022,
    hp: 2,
    speed: spd,
    fireCd: 0.12 + Math.random() * 0.14,
    shield: 0.35 + Math.random() * 0.25,
  };
  if (side === 2) {
    return {
      ...base,
      x: 0.1 + Math.random() * 0.8,
      y: skyTop,
      vx: (Math.random() - 0.5) * 0.05,
      vy: spd * 0.55,
    };
  }
  if (side === 0) {
    return {
      ...base,
      x: -0.05,
      y: skyTop + Math.random() * Math.max(0.06, skyBot - skyTop),
      vx: spd,
      vy: 0,
    };
  }
  return {
    ...base,
    x: 1.05,
    y: skyTop + Math.random() * Math.max(0.06, skyBot - skyTop),
    vx: -spd,
    vy: 0,
  };
}

function spawnCoopMidEnemy(state) {
  const kind = pickCoopMidKind(state);
  const stat = COOP_MID_KINDS[kind];
  const speed = stat.speed + (Math.random() - 0.5) * 0.02;
  const side = Math.floor(Math.random() * 3);
  const midTop = ZONE_MID_Y + 0.02;
  const midBot = ZONE_BOT_Y - 0.02;
  const shield = kind === "warden" ? 3 : side === 2 ? 0.5 : 1;
  const base = {
    id: eid(),
    kind,
    zone: "mid",
    w: stat.w,
    h: stat.h,
    hp: stat.hp,
    speed,
    fireCd:
      kind === "fast"
        ? 1.4 + Math.random() * 0.8
        : kind === "warden"
          ? 1.3 + Math.random() * 0.7
          : 1.1 + Math.random() * 0.9,
    shield,
  };
  if (side === 2) {
    return {
      ...base,
      x: 0.1 + Math.random() * 0.8,
      y: midTop,
      vx: speed * 0.35 * (Math.random() < 0.5 ? 1 : -1),
      vy: speed * 0.45,
    };
  }
  if (side === 0) {
    return {
      ...base,
      x: -0.05,
      y: midTop + 0.04 + Math.random() * Math.max(0.08, midBot - midTop - 0.08),
      vx: speed,
      vy: 0,
    };
  }
  return {
    ...base,
    x: 1.05,
    y: midTop + 0.04 + Math.random() * Math.max(0.08, midBot - midTop - 0.08),
    vx: -speed,
    vy: 0,
  };
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
    state.spawnCdSky = (state.spawnCdSky ?? 0.85) - dt;
    state.spawnCdMid = (state.spawnCdMid ?? 0.45) - dt;
    const skyN = countCoopZoneEnemies(state, "sky");
    const midN = countCoopZoneEnemies(state, "mid");
    const maxSky = coopMaxSky(state.t);
    const maxMid = coopMaxMid(state.t);

    if (state.spawnCdSky <= 0 && skyN < maxSky) {
      state.spawnCdSky = coopSkyGap(state.t);
      state.enemies.push(spawnCoopStriker());
      if (skyN + 1 < maxSky && Math.random() < 0.2) {
        state.enemies.push(spawnCoopStriker());
      }
    }

    if (state.spawnCdMid <= 0 && midN < maxMid) {
      state.spawnCdMid = coopMidGap(state.t);
      state.enemies.push(spawnCoopMidEnemy(state));
      if (midN + 1 < maxMid && Math.random() < 0.24) {
        state.enemies.push(spawnCoopMidEnemy(state));
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

function fireCoopEnemy(state, e, target) {
  const ang = Math.atan2(target.y - e.y, target.x - e.x);
  if (e.kind === "striker") {
    for (let k = -1; k <= 1; k++) {
      const a = ang + k * 0.1;
      pushEnemyBullet(state, e.x, e.y + 0.008, Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.008);
    }
    e.fireCd = 0.18 + Math.random() * 0.14;
    return;
  }
  if (e.kind === "warden") {
    for (let k = -1; k <= 1; k++) {
      const a = ang + k * 0.14;
      pushEnemyBullet(state, e.x, e.y + 0.01, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.009);
    }
    e.fireCd = 1.1 + Math.random() * 0.65;
    return;
  }
  if (e.kind === "heavy" || e.kind === "bomber") {
    for (let k = -1; k <= 1; k++) {
      const a = ang + k * 0.12;
      pushEnemyBullet(state, e.x, e.y + 0.01, Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.009);
    }
    e.fireCd = 1.2 + Math.random() * 0.8;
    return;
  }
  pushEnemyBullet(state, e.x, e.y, Math.cos(ang) * 0.25, Math.sin(ang) * 0.25, 0.009);
  e.fireCd = 1.1 + Math.random() * 0.8;
}

function updateSinglePlayer(state, slot, dt) {
  const p = state.players[slot];
  if (!p || p.lives <= 0) return;
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

function updatePlayers(state, dt) {
  for (const slot of ["host", "guest"]) {
    updateSinglePlayer(state, slot, dt);
  }
}

/** 來賓本地：僅推進爆炸粒子（權威快照在 reconcile 更新） */
export function tickGuestParticles(state, dt) {
  if (!state?.particles?.length) return;
  const cap = Math.min(0.033, Math.max(0, dt));
  for (const p of state.particles) {
    p.life -= cap;
    p.x += p.vx * cap;
    p.y += p.vy * cap;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  if (state.particles.length > 80) state.particles.length = 80;
}

/** 來賓本地：僅更新自己的射擊／導彈（視覺即時，權威仍在房主） */
export function tickGuestLocalCombat(state, slot, dt) {
  if (!canPlayerControl(state, slot)) return;
  updateSinglePlayer(state, slot, dt);
}

/** 來賓本地：推進敵彈／敵機／自機子彈位置（僅補幀間隔，勿外插網路延遲） */
export function advanceGuestVisualEntities(state, dt) {
  const cap = Math.min(HOST_VISUAL_DT, Math.max(0, dt));
  if (cap <= 0) return;
  for (const eb of state.eBullets) {
    eb.x += eb.vx * cap;
    eb.y += eb.vy * cap;
  }
  for (const b of state.bullets) {
    b.x += b.vx * cap;
    b.y += b.vy * cap;
  }
  for (const e of state.enemies) {
    const vx = typeof e.vx === "number" ? e.vx : -(e.speed || 0);
    const vy = typeof e.vy === "number" ? e.vy : 0;
    e.x += vx * cap;
    e.y += vy * cap;
  }
  state.bullets = state.bullets.filter(
    (b) => b.x > -0.05 && b.x < 1.05 && b.y > -0.05 && b.y < 1.05,
  );
  state.eBullets = state.eBullets.filter(
    (eb) => eb.x > -0.05 && eb.x < 1.05 && eb.y > -0.05 && eb.y < 1.05,
  );
}

function copyEntityList(list) {
  return asList(list).map((item) => ({ ...item }));
}

function lerpEntityAxis(a, b, t) {
  return a + (b - a) * t;
}

function lerpEntityList(listA, listB, t) {
  const mapA = new Map();
  for (const e of asList(listA)) mapA.set(e.id, e);
  const out = [];
  for (const eb of asList(listB)) {
    const ea = mapA.get(eb.id);
    if (ea && t > 0 && t < 1) {
      out.push({ ...eb, x: lerpEntityAxis(ea.x, eb.x, t), y: lerpEntityAxis(ea.y, eb.y, t) });
    } else {
      out.push({ ...eb });
    }
  }
  return out;
}

/** 來賓插值緩衝：記錄房主快照（僅畫面用） */
export function createGuestInterpSnap(state, at = Date.now()) {
  return {
    at,
    players: {
      host: { x: state.players.host.x, y: state.players.host.y },
      guest: { x: state.players.guest.x, y: state.players.guest.y },
    },
    enemies: copyEntityList(state.enemies),
    bullets: copyEntityList(state.bullets),
    eBullets: copyEntityList(state.eBullets),
    pickups: copyEntityList(state.pickups),
    missileTracks: copyEntityList(state.missileTracks),
  };
}

/** 在兩張快照間取樣；renderAt 落後現在，不外插超過最新快照 */
export function pickGuestInterpPair(buffer, renderDelayMs) {
  if (!buffer?.length) return null;
  const newest = buffer[buffer.length - 1].at;
  const oldest = buffer[0].at;
  const span = newest - oldest;
  const delay =
    span < renderDelayMs * 0.6 ? Math.max(32, Math.min(renderDelayMs, span * 0.45)) : renderDelayMs;
  const renderAt = Date.now() - delay;
  if (buffer.length === 1) return { a: buffer[0], b: buffer[0], t: 0 };

  let idx = 0;
  while (idx < buffer.length - 2 && buffer[idx + 1].at <= renderAt) idx += 1;

  const a = buffer[idx];
  const b = buffer[Math.min(idx + 1, buffer.length - 1)];
  if (!a || !b || b.at <= a.at) return { a, b: a, t: 0 };
  if (renderAt <= a.at) return { a, b: a, t: 0 };
  if (renderAt >= b.at) return { a: b, b, t: 0 };

  const t = (renderAt - a.at) / (b.at - a.at);
  return { a, b, t: Math.max(0, Math.min(1, t)) };
}

/** 將插值結果寫入影子狀態（不動自己的飛機，由本地輸入覆寫） */
export function applyGuestInterpVisual(shadow, pair, mySlot) {
  if (!shadow || !pair) return shadow;
  const { a, b, t } = pair;
  const other = mySlot === "host" ? "guest" : "host";

  shadow.enemies = lerpEntityList(a.enemies, b.enemies, t);
  shadow.bullets = lerpEntityList(a.bullets, b.bullets, t);
  shadow.eBullets = lerpEntityList(a.eBullets, b.eBullets, t);
  shadow.pickups = lerpEntityList(a.pickups, b.pickups, t);
  shadow.missileTracks = lerpEntityList(a.missileTracks, b.missileTracks, t);
  // 爆炸粒子生命短、無穩定 id，插值會產生拖影殘留

  const op = shadow.players?.[other];
  if (op && a.players[other] && b.players[other]) {
    op.x = lerpEntityAxis(a.players[other].x, b.players[other].x, t);
    op.y = lerpEntityAxis(a.players[other].y, b.players[other].y, t);
  }

  return shadow;
}

/** 來賓影子狀態：合併房主權威資料，保留本地預測位置 */
export function reconcileGuestShadowState(shadow, auth, mySlot) {
  if (!shadow || !auth) return shadow;
  const savedX = shadow.players[mySlot]?.x;
  const savedY = shadow.players[mySlot]?.y;

  shadow.mode = auth.mode;
  shadow.t = auth.t;
  shadow.phase = auth.phase;
  shadow.teamScore = auth.teamScore;
  shadow.bossSpawned = auth.bossSpawned;
  shadow.flash = auth.flash;
  shadow.endReason = auth.endReason;

  for (const slot of ["host", "guest"]) {
    const ap = auth.players[slot];
    const sp = shadow.players[slot];
    if (!ap || !sp) continue;
    sp.lives = ap.lives;
    sp.invuln = ap.invuln;
    sp.weapon = ap.weapon;
    sp.power = ap.power;
    sp.missileT = ap.missileT;
    sp.hasSpread = ap.hasSpread;
    sp.hasLaser = ap.hasLaser;
    sp.ship = ap.ship;
    if (slot !== mySlot) {
      sp.x = ap.x;
      sp.y = ap.y;
    }
  }

  shadow.enemies = copyEntityList(auth.enemies);
  shadow.bullets = copyEntityList(auth.bullets);
  shadow.eBullets = copyEntityList(auth.eBullets);
  shadow.pickups = copyEntityList(auth.pickups);
  shadow.particles = copyEntityList(auth.particles);
  shadow.missileTracks = copyEntityList(auth.missileTracks);

  const ap = auth.players[mySlot];
  const sp = shadow.players[mySlot];
  if (ap && sp) {
    if (ap.lives <= 0 || auth.phase === "end") {
      sp.x = ap.x;
      sp.y = ap.y;
    } else if (savedX != null && savedY != null) {
      const dist = Math.hypot(savedX - ap.x, savedY - ap.y);
      if (dist > 0.14) {
        sp.x = ap.x;
        sp.y = ap.y;
      } else {
        sp.x = savedX;
        sp.y = savedY;
      }
    }
  }

  return shadow;
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
        dmg: ship.fireMult,
        pvp: state.mode === "versus",
      });
    }
  }
}

function spawnHomingBullet(state, p) {
  const ship = shipOrDefault(p.ship);
  const dir = p.slot === "guest" && state.mode === "versus" ? 1 : -1;
  state.bullets.push({
    id: eid(),
    owner: p.slot,
    x: p.x,
    y: p.y + dir * 0.02,
    vx: (Math.random() - 0.5) * 0.05,
    vy: dir * 0.55,
    r: 0.014,
    dmg: 2 * ship.fireMult,
    homing: true,
    pvp: false,
  });
}

function fireLaser(state, p, ship, dt) {
  const down = p.slot === "guest" && state.mode === "versus";
  const half = (0.04 + p.power * 0.012) * ship.laserWidth;
  const dps = (4 + p.power) * dt * 8 * ship.fireMult;
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
        const target = nearestPlayer(state, e);
        if (target) {
          if (state.mode === "coop") fireCoopEnemy(state, e, target);
          else {
            e.fireCd = 1.1 + Math.random() * 0.8;
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
      }
      if (state.mode === "coop") {
        const zone = enemyCoopZone(e);
        if (e.x > 1.08 || e.x < -0.08) {
          e._gone = true;
          state.teamScore = Math.max(0, state.teamScore - 1);
        } else if (zone === "sky" && e.y > ZONE_MID_Y + 0.02) {
          e._gone = true;
        } else if (zone === "mid" && e.y > ZONE_BOT_Y + 0.04) {
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
  let bestPos = null;
  let bestD = Infinity;
  for (const slot of ["host", "guest"]) {
    const p = state.players[slot];
    if (p.lives <= 0) continue;
    const pos = playerCombatPos(state, slot);
    const d = (pos.x - e.x) ** 2 + (pos.y - e.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
      bestPos = pos;
    }
  }
  if (!best || !bestPos) return null;
  return { player: best, x: bestPos.x, y: bestPos.y };
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
      const pos = playerCombatPos(state, slot);
      const hitR = state.mode === "coop" && slot === "guest" ? COOP_GUEST_HIT_R : 0.038;
      if (hitCircle(eb.x, eb.y, eb.r, pos.x, pos.y, hitR)) {
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
  const pts =
    state.mode === "coop"
      ? COOP_MID_KINDS[kind]?.score ?? (kind === "striker" ? 2 : kind === "fast" ? 2 : 1)
      : kind === "fast"
        ? 2
        : 1;
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
      id: eid(),
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
