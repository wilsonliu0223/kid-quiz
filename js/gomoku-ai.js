/** 五子棋 AI 介面：入門～高手同步運算，大師走 Web Worker */
import { computeAiMove, AI_LEVELS } from "./gomoku-ai-core.js?v=gomoku-v5";

export const AI_PLAYER_ID = "__ai__";
export const AI_WORKER_LEVEL = 4;

/** @type {Worker | null} */
let aiWorker = null;
let aiRequestSeq = 0;

function cloneBoard(cells) {
  return cells.map((row) => [...row]);
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
 * 非同步求著；難度 4（大師）在 Worker 運算，其餘在主執行緒
 * @param {import('./gomoku-renju.js').Cell[][]} cells
 * @param {{ aiId: string, blackId: string, whiteId: string, difficulty?: number }} opts
 * @returns {Promise<[number, number]|null>}
 */
export function requestAiMove(cells, opts) {
  const difficulty = opts.difficulty ?? 2;
  const board = cloneBoard(cells);

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
  if (aiWorker) {
    aiWorker.terminate();
    aiWorker = null;
  }
}

export { AI_LEVELS };
