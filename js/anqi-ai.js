import {
  ensureAnqiWasm,
  legalActions,
  minimaxScores,
  mctsBestAction,
  pickBestAction,
  pickRandomAction,
  playerToMove,
} from "./anqi-engine.js";

export const AI_PLAYER_ID = "__anqi_ai__";

/** @typedef {1|2|3|4|5|6} AnqiAiLevel */

/**
 * @param {Int16Array|number[]} state
 * @param {AnqiAiLevel} level
 * @param {bigint|number} seed
 * @returns {Promise<number>}
 */
export async function requestAnqiAiMove(state, level, seed) {
  await ensureAnqiWasm();
  const acts = legalActions(state);
  if (!acts.length) throw new Error("no legal actions");

  if (level === 1) {
    return pickRandomAction(acts);
  }

  const cfg = AI_LEVEL_CONFIG[level] || AI_LEVEL_CONFIG[3];
  if (cfg.mcts) {
    const raw = mctsBestAction(state, cfg.mcts, seed);
    if (acts.includes(raw)) return raw;
    const scores = minimaxScores(state, 2, cfg.evalMode, 1500);
    return pickBestAction(scores, acts);
  }

  const scores = minimaxScores(state, cfg.depth, cfg.evalMode, cfg.timeLimitMs);
  return pickBestAction(scores, acts);
}

/** @type {Record<number, { depth?: number, evalMode: string, timeLimitMs?: number, mcts?: number, label: string }>} */
const AI_LEVEL_CONFIG = {
  1: { evalMode: "static", label: "入門" },
  2: { depth: 2, evalMode: "dynamic", label: "普通" },
  3: { depth: 3, evalMode: "dynamic", label: "高手" },
  4: { depth: 3, evalMode: "dynamic", timeLimitMs: 2500, label: "大師" },
  5: { depth: 4, evalMode: "dynamic", timeLimitMs: 6000, label: "宗師" },
  6: { mcts: 1200, evalMode: "dynamic", label: "涅槃" },
};

/**
 * @param {number} level
 */
export function anqiAiLevelLabel(level) {
  return AI_LEVEL_CONFIG[level]?.label || "";
}

export const ANQI_AI_LEVELS = Object.entries(AI_LEVEL_CONFIG).map(([level, cfg]) => ({
  level: Number(level),
  label: cfg.label,
}));
