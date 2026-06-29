export const NIRVANA_LEVEL = 6;

/** @type {Worker | null} */
let worker = null;
let ready = false;
let initPromise = null;
let requestSeq = 0;
/** @type {"full" | "lite" | ""} */
let engineMode = "";

/** @type {{ loading: boolean, progress: number, label: string, mode: string }} */
export const rapfiLoadState = { loading: false, progress: 0, label: "", mode: "" };

function localFallbackRoot() {
  const path = window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${window.location.origin}${path}engines/rapfi/fallback/`;
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./rapfi-engine-worker.js", import.meta.url));
  }
  return worker;
}

export function terminateRapfiEngine() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  ready = false;
  initPromise = null;
  engineMode = "";
  rapfiLoadState.loading = false;
  rapfiLoadState.progress = 0;
  rapfiLoadState.label = "";
  rapfiLoadState.mode = "";
}

export function ensureRapfiReady() {
  if (ready) return Promise.resolve();
  if (initPromise) return initPromise;

  rapfiLoadState.loading = true;
  rapfiLoadState.progress = 0;
  rapfiLoadState.label = "載入 Rapfi 完整引擎…";

  const w = getWorker();
  initPromise = new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type === "progress" && data.total > 0) {
        rapfiLoadState.progress = data.loaded / data.total;
        const mb = data.total > 5_000_000 ? "（完整 NNUE，約 40 MB）" : "";
        rapfiLoadState.label = `載入 Rapfi 引擎… ${Math.round(rapfiLoadState.progress * 100)}%${mb}`;
      } else if (data.type === "ready") {
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        ready = true;
        engineMode = data.mode === "full" ? "full" : "lite";
        rapfiLoadState.loading = false;
        rapfiLoadState.progress = 1;
        rapfiLoadState.mode = engineMode;
        rapfiLoadState.label = "";
        resolve();
      } else if (data.type === "result" && data.error) {
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        initPromise = null;
        rapfiLoadState.loading = false;
        reject(new Error(data.error));
      }
    };
    const onError = (err) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      initPromise = null;
      rapfiLoadState.loading = false;
      reject(err);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ type: "init", localFallbackUrl: localFallbackRoot() });
  });

  return initPromise;
}

/**
 * @param {object} opts
 * @param {{ row: number, col: number, player: string }[]} opts.moveHistory
 * @param {string} opts.blackPlayerId
 * @returns {Promise<[number, number] | null>}
 */
export async function requestRapfiMove(opts) {
  await ensureRapfiReady();
  const requestId = ++requestSeq;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type !== "result" || data.requestId !== requestId) return;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      if (data.error) reject(new Error(data.error));
      else resolve(data.move || null);
    };
    const onError = (err) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      reject(err);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({
      type: "think",
      requestId,
      moveHistory: opts.moveHistory,
      blackPlayerId: opts.blackPlayerId,
    });
  });
}
