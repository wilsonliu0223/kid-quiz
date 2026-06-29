/** Pikafish WASM 引擎 Worker（UCI） */
let engine = null;
let engineDir = "";
/** @type {((uci: string | null) => void) | null} */
let pendingResolve = null;

function locateFile(file) {
  if (file === "pikafish.data") return engineDir + "pikafish.data";
  return engineDir + file;
}

function onStdout(output) {
  const match = String(output || "").match(/bestmove\s(\S+)/);
  if (!match || !pendingResolve) return;
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve(match[1]);
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "init") {
      engineDir = msg.baseUrl || "";
      importScripts(engineDir + "pikafish.js");
      engine = await Pikafish({
        locateFile,
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
      await engine.ready;
      engine.read_stdout = onStdout;
      engine.send_command("uci");
      engine.send_command("setoption name Threads value 1");
      self.postMessage({ type: "ready" });
      return;
    }

    if (msg.type === "think") {
      if (!engine) {
        self.postMessage({ type: "result", requestId: msg.requestId, uci: null, error: "engine not ready" });
        return;
      }
      const { fen, depth = 16 } = msg;
      const uci = await new Promise((resolve) => {
        pendingResolve = resolve;
        engine.send_command(`position fen ${fen}`);
        engine.send_command(`go depth ${depth}`);
        setTimeout(() => {
          if (pendingResolve) {
            pendingResolve(null);
            pendingResolve = null;
          }
        }, 28000);
      });
      self.postMessage({ type: "result", requestId: msg.requestId, uci });
    }
  } catch (err) {
    self.postMessage({
      type: "result",
      requestId: msg.requestId,
      uci: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
