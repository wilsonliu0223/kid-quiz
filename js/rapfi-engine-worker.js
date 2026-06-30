/** Rapfi WASM 引擎 Worker（Yixin 協定） */
const MAX_TURN_TIMEOUT_MS = 60000;
const MAX_DEPTH_CAP = 64;

/** @param {number} stoneCount */
function searchLimits(stoneCount) {
  if (stoneCount <= 1) return { timeout: 1000, depth: 8 };
  if (stoneCount <= 4) return { timeout: 3000, depth: 14 };
  if (stoneCount <= 8) return { timeout: 8000, depth: 22 };
  if (stoneCount <= 16) return { timeout: 20000, depth: 40 };
  return { timeout: MAX_TURN_TIMEOUT_MS, depth: MAX_DEPTH_CAP };
}

let engine = null;
let engineDir = "";
/** @type {string} */
let dataFileUrl = "";
let engineMode = "lite";
/** @type {((move: [number, number] | null) => void) | null} */
let pendingResolve = null;

function locateFile(url) {
  if (/^rapfi.*\.data$/i.test(url)) {
    return dataFileUrl || engineDir + "rapfi.data";
  }
  return engineDir + url;
}

function simd128Supported() {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
        253, 98, 11,
      ]),
    );
  } catch {
    return false;
  }
}

function onStdout(line) {
  const trimmed = String(line || "").trim();
  if (!pendingResolve) return;
  if (/^\d+,\d+$/.test(trimmed)) {
    const [x, y] = trimmed.split(",").map(Number);
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve([y, x]);
  }
}

function postProgress(status) {
  const match = String(status || "").match(/\((\d+)\/(\d+)\)/);
  if (match) {
    self.postMessage({
      type: "progress",
      loaded: Number(match[1]),
      total: Number(match[2]),
    });
  } else if (/Downloading data/i.test(String(status || ""))) {
    self.postMessage({ type: "progress", loaded: 0, total: 40306406 });
  } else if (status === "Running..." || status === "") {
    self.postMessage({ type: "progress", loaded: 1, total: 1 });
  }
}

async function bootEngine(baseUrl, scriptName, mode, nnueDataUrl) {
  engineDir = baseUrl;
  dataFileUrl = nnueDataUrl;
  engineMode = mode;
  importScripts(baseUrl + scriptName);
  engine = await Rapfi({
    locateFile,
    onReceiveStdout: onStdout,
    onReceiveStderr: (line) => {
      console.error("[rapfi]", line);
    },
    onExit: () => {},
    setStatus: postProgress,
  });
  engine.sendCommand("START 15");
}

function fullScriptCandidates() {
  const list = [];
  if (simd128Supported()) list.push("rapfi-single-simd128.js");
  list.push("rapfi-single.js");
  return list;
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "init") {
      const wantFull = msg.mode === "full";
      if (wantFull) {
        if (!msg.fullEngineUrl || !msg.dataFileUrl) {
          throw new Error("full engine urls missing");
        }
        const scripts = msg.script ? [msg.script] : fullScriptCandidates();
        let lastErr = null;
        for (const scriptName of scripts) {
          try {
            await bootEngine(msg.fullEngineUrl, scriptName, "full", msg.dataFileUrl);
            self.postMessage({ type: "ready", mode: engineMode, script: scriptName });
            return;
          } catch (err) {
            lastErr = err;
            engine = null;
            engineDir = "";
            dataFileUrl = "";
          }
        }
        throw lastErr || new Error("full engine init failed");
      }

      if (!msg.localFallbackUrl) throw new Error("no fallback engine");
      await bootEngine(msg.localFallbackUrl, "rapfi-single.js", "lite", msg.localFallbackUrl + "rapfi.data");
      self.postMessage({ type: "ready", mode: engineMode, script: "fallback" });
      return;
    }

    if (msg.type === "think") {
      if (!engine) {
        self.postMessage({ type: "result", requestId: msg.requestId, move: null, error: "engine not ready" });
        return;
      }
      const { moveHistory, blackPlayerId, stoneCount = 0 } = msg;
      const stones =
        stoneCount > 0
          ? stoneCount
          : (moveHistory || []).length;
      const { timeout: turnTimeoutMs, depth: maxDepth } = searchLimits(stones);
      const safetyTimeoutMs = turnTimeoutMs + 5000;

      let boardCmd = "YXBOARD";
      for (const m of moveHistory || []) {
        const side = m.player === blackPlayerId ? 1 : 2;
        boardCmd += ` ${m.col},${m.row},${side}`;
      }
      boardCmd += " DONE";

      engine.sendCommand("INFO RULE 4");
      engine.sendCommand("INFO THREAD_NUM 1");
      engine.sendCommand(`INFO MAX_DEPTH ${maxDepth}`);
      engine.sendCommand(`INFO TIMEOUT_TURN ${turnTimeoutMs}`);
      engine.sendCommand(boardCmd);

      const move = await new Promise((resolve) => {
        pendingResolve = resolve;
        engine.sendCommand("YXNBEST 1");
        setTimeout(() => {
          if (pendingResolve) {
            pendingResolve(null);
            pendingResolve = null;
          }
        }, safetyTimeoutMs);
      });

      self.postMessage({ type: "result", requestId: msg.requestId, move, mode: engineMode });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (msg.type === "init") {
      self.postMessage({ type: "initFailed", error: message });
      return;
    }
    self.postMessage({
      type: "result",
      requestId: msg.requestId,
      move: null,
      error: message,
    });
  }
};
