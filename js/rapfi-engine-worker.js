/** Rapfi WASM 引擎 Worker（Yixin 協定） */
const TURN_TIMEOUT_MS = 60000;
const MAX_DEPTH = 64;
const SAFETY_TIMEOUT_MS = TURN_TIMEOUT_MS + 5000;

let engine = null;
let engineDir = "";
/** @type {string} */
let dataFileUrl = "";
let engineMode = "lite";
/** @type {((move: [number, number] | null) => void) | null} */
let pendingResolve = null;

function locateFile(url) {
  if (/^rapfi.*\.data$/.test(url)) {
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
    onReceiveStderr: () => {},
    onExit: () => {},
    setStatus: postProgress,
  });
  engine.sendCommand("START 15");
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "init") {
      const wantFull = msg.mode === "full";
      if (wantFull) {
        if (!msg.fullEngineUrl || !msg.dataFileUrl || !simd128Supported()) {
          throw new Error("full engine unavailable");
        }
        await bootEngine(msg.fullEngineUrl, "rapfi-single-simd128.js", "full", msg.dataFileUrl);
      } else {
        if (!msg.localFallbackUrl) throw new Error("no fallback engine");
        await bootEngine(msg.localFallbackUrl, "rapfi-single.js", "lite", msg.localFallbackUrl + "rapfi.data");
      }
      self.postMessage({ type: "ready", mode: engineMode });
      return;
    }

    if (msg.type === "think") {
      if (!engine) {
        self.postMessage({ type: "result", requestId: msg.requestId, move: null, error: "engine not ready" });
        return;
      }
      const { moveHistory, blackPlayerId } = msg;
      let boardCmd = "YXBOARD";
      for (const m of moveHistory || []) {
        const side = m.player === blackPlayerId ? 1 : 2;
        boardCmd += ` ${m.col},${m.row},${side}`;
      }
      boardCmd += " DONE";

      engine.sendCommand("INFO RULE 4");
      engine.sendCommand("INFO THREAD_NUM 1");
      engine.sendCommand(`INFO MAX_DEPTH ${MAX_DEPTH}`);
      engine.sendCommand(`INFO TIMEOUT_TURN ${TURN_TIMEOUT_MS}`);
      engine.sendCommand(boardCmd);

      const move = await new Promise((resolve) => {
        pendingResolve = resolve;
        engine.sendCommand("YXNBEST 1");
        setTimeout(() => {
          if (pendingResolve) {
            pendingResolve(null);
            pendingResolve = null;
          }
        }, SAFETY_TIMEOUT_MS);
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
