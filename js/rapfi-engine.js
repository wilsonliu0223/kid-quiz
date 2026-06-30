import { CONFIG } from "./config.site.js";

import { adaptiveRapfiLimits } from "./gomoku-ai-timing.js?v=gomoku-v4";

export const NIRVANA_LEVEL = 6;

const WORKER_URL = new URL("./rapfi-engine-worker.js?v=9", import.meta.url);

/** @type {Worker | null} */
let worker = null;
let ready = false;
let initPromise = null;
let requestSeq = 0;
/** @type {"full" | "lite" | ""} */
let engineMode = "";
/** @type {"lite" | "full" | null} */
let loadedTier = null;
/** @type {"lite" | "full" | null} */
let initTargetTier = null;

/** @type {{ loading: boolean, progress: number, label: string, mode: string, failReason: string }} */
export const rapfiLoadState = { loading: false, progress: 0, label: "", mode: "", failReason: "" };

function siteRoot() {
  const path = window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${window.location.origin}${path}`;
}

function fullEngineRoot() {
  return `${siteRoot()}engines/rapfi/full/`;
}

function fullDataUrl() {
  const custom = String(CONFIG.RAPFI_NNUE_DATA_URL || "").trim();
  if (custom) return custom;
  return `${fullEngineRoot()}rapfi.data`;
}

function localFallbackRoot() {
  return `${siteRoot()}engines/rapfi/fallback/`;
}

function spawnWorker() {
  if (worker) worker.terminate();
  worker = new Worker(WORKER_URL);
  return worker;
}

export function terminateRapfiEngine() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  ready = false;
  initPromise = null;
  initTargetTier = null;
  loadedTier = null;
  engineMode = "";
  rapfiLoadState.loading = false;
  rapfiLoadState.progress = 0;
  rapfiLoadState.label = "";
  rapfiLoadState.mode = "";
  rapfiLoadState.failReason = "";
}

function tierSatisfied(requested) {
  if (!ready || !loadedTier) return false;
  if (requested === "lite") return loadedTier === "lite" || loadedTier === "full";
  return loadedTier === "full";
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
        rapfiLoadState.failReason = "";
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
      w.postMessage({
        type: "init",
        mode: "full",
        fullEngineUrl: fullEngineRoot(),
        dataFileUrl: fullDataUrl(),
      });
    } else {
      w.postMessage({ type: "init", mode: "lite", localFallbackUrl: localFallbackRoot() });
    }
  });
}

/**
 * @param {"lite" | "full"} [tier]
 * - lite：宗師快板，只載入精簡 Rapfi（約 95 KB）
 * - full：涅槃滿血，先試完整 NNUE，失敗再退回快板
 */
export function ensureRapfiReady(tier = "full") {
  if (tierSatisfied(tier)) return Promise.resolve();
  if (initPromise && initTargetTier === tier) return initPromise;

  if (ready || initPromise) {
    terminateRapfiEngine();
  }

  initTargetTier = tier;
  rapfiLoadState.loading = true;
  rapfiLoadState.progress = 0;
  rapfiLoadState.label = tier === "lite" ? "載入 Rapfi 快板引擎…" : "載入 Rapfi 完整引擎…";
  rapfiLoadState.failReason = "";

  initPromise = (async () => {
    spawnWorker();
    if (tier === "lite") {
      await bindWorkerInit(worker, "lite");
      loadedTier = "lite";
    } else {
      try {
        await bindWorkerInit(worker, "full");
        loadedTier = "full";
      } catch (fullErr) {
        const reason = fullErr instanceof Error ? fullErr.message : String(fullErr);
        console.warn("Rapfi full engine failed, using lite fallback", fullErr);
        rapfiLoadState.failReason = reason;
        spawnWorker();
        rapfiLoadState.label = "完整版載入失敗，改用快板引擎…";
        rapfiLoadState.progress = 0;
        await bindWorkerInit(worker, "lite");
        loadedTier = "lite";
      }
    }
    ready = true;
    rapfiLoadState.loading = false;
    rapfiLoadState.progress = 1;
    rapfiLoadState.label = "";
    initTargetTier = null;
  })().catch((err) => {
    initPromise = null;
    initTargetTier = null;
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
/**
 * @param {object} opts
 * @param {"lite" | "full"} [tier]
 */
export async function requestRapfiMove(opts, tier = "full") {
  await ensureRapfiReady(tier);
  const requestId = ++requestSeq;
  const w = worker;
  if (!w) throw new Error("Rapfi worker missing");
  const stoneCount = opts.stoneCount ?? (opts.moveHistory?.length || 0);
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
      stoneCount,
      ...adaptiveRapfiLimits(stoneCount, tier),
    });
  });
}
