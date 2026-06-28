/** @typedef {'swift' | 'heavy'} ShipId */

/** @type {Record<ShipId, { id: ShipId, name: string, tag: string, color: string, accent: string, speed: number, fireMult: number, spreadExtra: number, laserWidth: number, lives: number, dodgeInvuln: number, armorChance: number }>} */
export const SHIPS = {
  swift: {
    id: "swift",
    name: "藍鷹",
    tag: "疾風",
    color: "#5eb8ff",
    accent: "#a8e4ff",
    speed: 1.2,
    fireMult: 1,
    spreadExtra: 1,
    laserWidth: 1,
    lives: 3,
    dodgeInvuln: 0.3,
    armorChance: 0,
  },
  heavy: {
    id: "heavy",
    name: "赤焰",
    tag: "重裝",
    color: "#ff6040",
    accent: "#ffb830",
    speed: 1,
    fireMult: 1.2,
    spreadExtra: 0,
    laserWidth: 1.15,
    lives: 3,
    dodgeInvuln: 0,
    armorChance: 0.3,
  },
};

export const SHIP_IDS = /** @type {ShipId[]} */ (["swift", "heavy"]);

export function shipOrDefault(id) {
  return SHIPS[id] || SHIPS.swift;
}

/** 等候室選機卡片：小飛機圖 + 底色 */
export function shipLobbyCardHtml(id) {
  const s = SHIPS[id];
  const art =
    id === "swift"
      ? `<svg class="sky-ship-card-art-svg" viewBox="0 0 80 88" aria-hidden="true">
          <ellipse cx="40" cy="72" rx="26" ry="6" fill="rgba(74,166,255,0.2)"/>
          <path fill="#7aa8d0" d="M18 52 L32 46 L48 46 L62 52 L48 56 L32 56 Z"/>
          <path fill="#5eb8ff" d="M40 18 C44 32 45 48 43 58 L40 64 L37 58 C35 48 36 32 40 18 Z"/>
          <path fill="#2a5080" d="M37 38 h6 v14 h-6 Z"/>
          <ellipse cx="40" cy="30" rx="5" ry="7" fill="#e8f4ff"/>
          <ellipse cx="33" cy="60" rx="4" ry="7" fill="#4da6ff" opacity="0.9"/>
          <ellipse cx="47" cy="60" rx="4" ry="7" fill="#4da6ff" opacity="0.9"/>
          <path fill="#fff" opacity="0.85" d="M38 62 L40 70 L42 62 Z"/>
        </svg>`
      : `<svg class="sky-ship-card-art-svg" viewBox="0 0 80 88" aria-hidden="true">
          <ellipse cx="40" cy="72" rx="28" ry="7" fill="rgba(255,96,64,0.22)"/>
          <path fill="#d87858" d="M14 54 L30 47 L50 47 L66 54 L50 58 L30 58 Z"/>
          <path fill="#ff6040" d="M40 16 C46 30 47 50 44 60 L40 66 L36 60 C33 50 34 30 40 16 Z"/>
          <path fill="#802020" d="M36 36 h8 v16 h-8 Z"/>
          <ellipse cx="40" cy="28" rx="5.5" ry="8" fill="#ffe8d8"/>
          <ellipse cx="31" cy="62" rx="5" ry="8" fill="#ff8040" opacity="0.95"/>
          <ellipse cx="49" cy="62" rx="5" ry="8" fill="#ff8040" opacity="0.95"/>
          <path fill="#ffb830" d="M38 64 L40 74 L42 64 Z"/>
        </svg>`;

  const stat =
    id === "heavy" ? `火力×${s.fireMult}` : `速度×${s.speed}`;
  return `<strong>${s.name}</strong><span>${s.tag}</span><small>${stat} · ${s.lives}命</small><span class="sky-ship-card-art">${art}</span>`;
}
