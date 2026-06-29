import { boardToFen } from "./xiangqi-core.js";

export const NIRVANA_LEVEL = 6;

/** @type {Worker | null} */
let worker = null;
let ready = false;
let initPromise = null;
let requestSeq = 0;

/** @type {{ loading: boolean, progress: number, label: string }} */
export const pikafishLoadState = { loading: false, progress: 0, label: "" };

function enginesRoot() {
  const path = window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${window.location.origin}${path}engines/pikafish/`;
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./pikafish-engine-worker.js", import.meta.url));
  }
  return worker;
}

export function terminatePikafishEngine() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  ready = false;
  initPromise = null;
  pikafishLoadState.loading = false;
  pikafishLoadState.progress = 0;
  pikafishLoadState.label = "";
}

export function ensurePikafishReady() {
  if (ready) return Promise.resolve();
  if (initPromise) return initPromise;

  pikafishLoadState.loading = true;
  pikafishLoadState.progress = 0;
  pikafishLoadState.label = "載入 Pikafish 引擎…";

  const w = getWorker();
  initPromise = new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type === "progress" && data.total > 0) {
        pikafishLoadState.progress = data.loaded / data.total;
        pikafishLoadState.label = `載入 Pikafish 引擎… ${Math.round(pikafishLoadState.progress * 100)}%`;
      } else if (data.type === "ready") {
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        ready = true;
        pikafishLoadState.loading = false;
        pikafishLoadState.progress = 1;
        pikafishLoadState.label = "";
        resolve();
      } else if (data.type === "result" && data.error) {
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        initPromise = null;
        pikafishLoadState.loading = false;
        reject(new Error(data.error));
      }
    };
    const onError = (err) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      initPromise = null;
      pikafishLoadState.loading = false;
      reject(err);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ type: "init", baseUrl: enginesRoot() });
  });

  return initPromise;
}

function uciSquareToPoint(square) {
  const col = square.charCodeAt(0) - 97;
  const row = 9 - Number.parseInt(square[1], 10);
  return [row, col];
}

function parseUciMove(uci) {
  if (!uci || uci === "(none)" || uci.length < 4) return null;
  const from = uciSquareToPoint(uci.slice(0, 2));
  const to = uciSquareToPoint(uci.slice(2, 4));
  return { from, to };
}

/**
 * @param {object} opts
 * @param {string[][]} opts.board
 * @param {"red"|"black"} opts.turn
 * @returns {Promise<{ from: [number, number], to: [number, number] } | null>}
 */
export async function requestPikafishMove(opts) {
  await ensurePikafishReady();
  const fen = `${boardToFen(opts.board)} ${opts.turn === "red" ? "w" : "b"} - - 0 1`;
  const requestId = ++requestSeq;
  const w = getWorker();
  const uci = await new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type !== "result" || data.requestId !== requestId) return;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      if (data.error) reject(new Error(data.error));
      else resolve(data.uci || null);
    };
    const onError = (err) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      reject(err);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ type: "think", requestId, fen, depth: 16 });
  });
  const parsed = parseUciMove(uci);
  if (!parsed) return null;
  return { from: /** @type {[number, number]} */ (parsed.from), to: /** @type {[number, number]} */ (parsed.to) };
}
