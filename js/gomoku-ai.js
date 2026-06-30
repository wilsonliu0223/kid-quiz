/** 五子棋 AI 介面：入門～高手同步運算，大師走 Web Worker，宗師走 Rapfi 快板，涅槃走 Rapfi 滿血 WASM */
import { computeAiMove, AI_LEVELS, GRANDMASTER_LEVEL, findUrgentTacticalMove } from "./gomoku-ai-core.js?v=gomoku-v10";
import { pickOpeningMove } from "./gomoku-ai-threat.js?v=gomoku-v11";
import { OPENING_INSTANT_MAX_STONES, NIRVANA_OPENING_FAST_MAX_STONES, NIRVANA_FULL_LOAD_MIN_STONES } from "./gomoku-ai-timing.js?v=gomoku-v5";
import {
  NIRVANA_LEVEL,
  rapfiLoadState,
  requestRapfiMove,
  preloadNirvanaFullEngine,
  terminateRapfiEngine,
} from "./rapfi-engine.js";

export const AI_PLAYER_ID = "__ai__";
export const AI_WORKER_LEVEL = 4;
export { AI_LEVELS, GRANDMASTER_LEVEL, NIRVANA_LEVEL, rapfiLoadState, preloadNirvanaFullEngine };

/** @type {Worker | null} */
let aiWorker = null;
let aiRequestSeq = 0;

function cloneBoard(cells) {
  return cells.map((row) => [...row]);
}

function countStones(cells) {
  let n = 0;
  for (const row of cells) {
    for (const cell of row) {
      if (cell) n++;
    }
  }
  return n;
}

function getAiWorker() {
  if (aiWorker) return aiWorker;
  aiWorker = new Worker(new URL("./gomoku-ai-worker.js", import.meta.url), { type: "module" });
  return aiWorker;
}

/**
 * 同步求著（入門～高手）
 * @param {import('./gomoku-renju.js').Cell[][]} cells
 * @param {{ aiId: string, blackId: string, whiteId: string, difficulty?: number }} opts
 * @returns {[number, number]|null}
 */
export function findAiMove(cells, opts) {
  return computeAiMove(cloneBoard(cells), opts);
}

/**
 * 非同步求著；難度 4（大師）在 Worker，5（宗師）Rapfi 快板，6（涅槃）Rapfi 滿血
 * @param {import('./gomoku-renju.js').Cell[][]} cells
 * @param {{ aiId: string, blackId: string, whiteId: string, difficulty?: number }} opts
 * @returns {Promise<[number, number]|null>}
 */
export function requestAiMove(cells, opts) {
  const difficulty = opts.difficulty ?? 2;
  const board = cloneBoard(cells);

  if (difficulty >= GRANDMASTER_LEVEL) {
    const stones = countStones(board);
    const opponent = opts.aiId === opts.blackId ? opts.whiteId : opts.blackId;
    const isNirvana = difficulty >= NIRVANA_LEVEL;

    if (isNirvana && stones < NIRVANA_FULL_LOAD_MIN_STONES) {
      const opening = pickOpeningMove(board, opts.aiId, opponent, stones);
      if (opening) return Promise.resolve(opening);
      const tactical = findUrgentTacticalMove(board, opts);
      if (tactical) return Promise.resolve(tactical);
      const near = pickOpeningMove(board, opts.aiId, opponent, NIRVANA_OPENING_FAST_MAX_STONES);
      return Promise.resolve(near || [7, 6]);
    }

    if (!isNirvana && stones <= OPENING_INSTANT_MAX_STONES) {
      const opening = pickOpeningMove(board, opts.aiId, opponent, stones);
      if (opening) return Promise.resolve(opening);
    }

    const tactical = findUrgentTacticalMove(board, opts);
    if (tactical) return Promise.resolve(tactical);

    const tier = isNirvana ? "full" : "lite";
    return requestRapfiMove(
      {
        moveHistory: opts.moveHistory || [],
        blackPlayerId: opts.blackId,
        stoneCount: stones,
      },
      tier,
    );
  }

  if (difficulty < AI_WORKER_LEVEL) {
    return Promise.resolve(computeAiMove(board, opts));
  }

  if (typeof Worker === "undefined") {
    return Promise.resolve(computeAiMove(board, opts));
  }

  const requestId = ++aiRequestSeq;
  const worker = getAiWorker();

  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.data?.requestId !== requestId) return;
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (event.data?.error) {
        reject(new Error(event.data.error));
        return;
      }
      resolve(event.data?.move ?? null);
    };
    const onError = (err) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      reject(err);
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({
      requestId,
      payload: {
        cells: board,
        opts: {
          aiId: opts.aiId,
          blackId: opts.blackId,
          whiteId: opts.whiteId,
          difficulty,
        },
      },
    });
  });
}

export function terminateAiWorker() {
  terminateRapfiEngine();
  if (aiWorker) {
    aiWorker.terminate();
    aiWorker = null;
  }
}
