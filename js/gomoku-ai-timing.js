/** 五子棋 AI 思考時間：依盤面棋子數縮短（入門～涅槃共用） */

/** 棋子數 ≤ 此值時走開局庫，不啟動深度搜尋 */
export const OPENING_INSTANT_MAX_STONES = 1;

/**
 * 內建 AI（入門～大師）單步思考上限
 * @param {number} baseTimeMs 難度設定的基準時間
 * @param {number} stoneCount 盤面棋子數
 */
export function adaptiveBuiltinTimeMs(baseTimeMs, stoneCount) {
  if (stoneCount <= 1) return Math.min(baseTimeMs, 120);
  if (stoneCount <= 4) return Math.min(baseTimeMs, Math.round(baseTimeMs * 0.35));
  if (stoneCount <= 8) return Math.min(baseTimeMs, Math.round(baseTimeMs * 0.6));
  if (stoneCount <= 16) return Math.min(baseTimeMs, Math.round(baseTimeMs * 0.85));
  return baseTimeMs;
}

/**
 * Rapfi（宗師快板／涅槃滿血）單步 TIMEOUT_TURN 與 MAX_DEPTH
 * @param {number} stoneCount
 * @param {"lite" | "full"} [tier]
 * @returns {{ timeout: number, depth: number }}
 */
export function adaptiveRapfiLimits(stoneCount, tier = "full") {
  if (tier === "full") {
    // 涅槃滿血：維持每步 60 秒／深度 64（僅開局庫未命中時的極短後備）
    if (stoneCount <= 1) return { timeout: 1000, depth: 8 };
    return { timeout: 60000, depth: 64 };
  }
  if (stoneCount <= 1) return { timeout: 1000, depth: 8 };
  if (stoneCount <= 4) return { timeout: 6000, depth: 20 };
  if (stoneCount <= 8) return { timeout: 18000, depth: 30 };
  if (stoneCount <= 16) return { timeout: 45000, depth: 52 };
  return { timeout: 60000, depth: 64 };
}
