/** @typedef {'swift' | 'heavy'} ShipId */

/** @type {Record<ShipId, { id: ShipId, name: string, tag: string, color: string, accent: string, speed: number, dmgBonus: number, spreadExtra: number, laserWidth: number, lives: number, dodgeInvuln: number, armorChance: number }>} */
export const SHIPS = {
  swift: {
    id: "swift",
    name: "藍鷹",
    tag: "疾風",
    color: "#5eb8ff",
    accent: "#a8e4ff",
    speed: 1.2,
    dmgBonus: 0,
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
    dmgBonus: 1,
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
