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

function siteRoot() {
  const path = window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${window.location.origin}${path}`;
}

function fullEngineRoot() {
  return `${siteRoot()}engines/rapfi/full/`;
}

function localFallbackRoot() {
  return `${siteRoot()}engines/rapfi/fallback/`;
}

function spawnWorker() {
  if (worker) worker.terminate();
  worker = new Worker(new URL("./rapfi-engine-worker.js", import.meta.url));
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

function bindWorkerInit(w, mode) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type === "progress" && data.total > 0) {
        rapfiLoadState.progress = data.loaded / data.total;
        const big = data.total > 5_000_000;
        rapfiLoadState.label = big
          ? `載入完整 NNUE… ${Math.round(rapfiLoadState.progress * 100)}%（約 40 MB，請稍候）`
          : `載入 Rapfi 引擎… ${Math.round(rapfiLoadState.progress * 100)}%`;
      } else if (data.type === "ready") {
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        engineMode = data.mode === "full" ? "full" : "lite";
        rapfiLoadState.mode = engineMode;
        resolve(engineMode);
      } else if (data.type === "initFailed") {
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        reject(new Error(data.error || "init failed"));
      }
    };
    const onError = (err) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      reject(err);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);

    if (mode === "full") {
      w.postMessage({ type: "init", mode: "full", fullEngineUrl: fullEngineRoot() });
    } else {
      w.postMessage({ type: "init", mode: "lite", localFallbackUrl: localFallbackRoot() });
    }
  });
}

export function ensureRapfiReady() {
  if (ready) return Promise.resolve();
  if (initPromise) return initPromise;

  rapfiLoadState.loading = true;
  rapfiLoadState.progress = 0;
  rapfiLoadState.label = "載入 Rapfi 完整引擎…";

  initPromise = (async () => {
    const w = spawnWorker();
    try {
      await bindWorkerInit(w, "full");
    } catch (fullErr) {
      console.warn("Rapfi full engine failed, using lite fallback", fullErr);
      spawnWorker();
      rapfiLoadState.label = "完整版載入失敗，改用精簡引擎…";
      rapfiLoadState.progress = 0;
      await bindWorkerInit(worker, "lite");
    }
    ready = true;
    rapfiLoadState.loading = false;
    rapfiLoadState.progress = 1;
    rapfiLoadState.label = "";
  })().catch((err) => {
    initPromise = null;
    rapfiLoadState.loading = false;
    throw err;
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
  const w = worker;
  if (!w) throw new Error("Rapfi worker missing");
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
