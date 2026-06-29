/** Rapfi WASM 引擎 Worker（Yixin 協定） */
let engine = null;
let engineDir = "";
/** @type {((move: [number, number] | null) => void) | null} */
let pendingResolve = null;

function locateFile(url) {
  if (/^rapfi.*\.data$/.test(url)) url = "rapfi.data";
  return engineDir + url;
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

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "init") {
      engineDir = msg.baseUrl || "";
      importScripts(engineDir + "rapfi-single.js");
      engine = await Rapfi({
        locateFile,
        onReceiveStdout: onStdout,
        onReceiveStderr: () => {},
        onExit: () => {},
        setStatus: (status) => {
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
        },
      });
      engine.sendCommand("START 15");
      self.postMessage({ type: "ready" });
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
      engine.sendCommand("INFO MAX_DEPTH 24");
      engine.sendCommand("INFO TIMEOUT_TURN 20000");
      engine.sendCommand(boardCmd);

      const move = await new Promise((resolve) => {
        pendingResolve = resolve;
        engine.sendCommand("YXNBEST 1");
        setTimeout(() => {
          if (pendingResolve) {
            pendingResolve(null);
            pendingResolve = null;
          }
        }, 22000);
      });

      self.postMessage({ type: "result", requestId: msg.requestId, move });
    }
  } catch (err) {
    self.postMessage({
      type: "result",
      requestId: msg.requestId,
      move: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
