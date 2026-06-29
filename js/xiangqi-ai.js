/** 象棋 AI：入門～高手同步運算，大師／宗師走 Web Worker */
import {
  computeXiangqiAiMove,
  GRANDMASTER_LEVEL,
  MASTER_WORKER_LEVEL,
} from "./xiangqi-ai-core.js";

export const AI_PLAYER_ID = "__xiangqi_ai__";
export { GRANDMASTER_LEVEL, MASTER_WORKER_LEVEL };

/** @type {Worker | null} */
let aiWorker = null;
let aiRequestSeq = 0;

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function getAiWorker() {
  if (aiWorker) return aiWorker;
  aiWorker = new Worker(new URL("./xiangqi-ai-worker.js", import.meta.url), { type: "module" });
  return aiWorker;
}

/**
 * @param {object} opts
 * @param {string[][]} opts.board
 * @param {"red"|"black"} opts.turn
 * @param {"red"|"black"} opts.aiSide
 * @param {number} opts.level
 */
export function chooseAiMove(opts) {
  return computeXiangqiAiMove({
    board: cloneBoard(opts.board),
    turn: opts.turn,
    aiSide: opts.aiSide,
    level: opts.level,
  });
}

/**
 * @param {object} opts
 * @param {string[][]} opts.board
 * @param {"red"|"black"} opts.turn
 * @param {"red"|"black"} opts.aiSide
 * @param {number} opts.level
 * @returns {Promise<import('./xiangqi-core.js').XiangqiMove | null>}
 */
export function requestXiangqiAiMove(opts) {
  const level = opts.level ?? 2;
  const payload = {
    board: cloneBoard(opts.board),
    turn: opts.turn,
    aiSide: opts.aiSide,
    level,
  };

  if (level < MASTER_WORKER_LEVEL) {
    return Promise.resolve(computeXiangqiAiMove(payload));
  }

  if (typeof Worker === "undefined") {
    return Promise.resolve(computeXiangqiAiMove(payload));
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
    worker.postMessage({ requestId, payload });
  });
}

export function terminateXiangqiAiWorker() {
  if (aiWorker) {
    aiWorker.terminate();
    aiWorker = null;
  }
}
