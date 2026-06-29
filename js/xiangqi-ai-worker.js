/** 象棋 AI Web Worker（大師／宗師背景運算） */
import { computeXiangqiAiMove } from "./xiangqi-ai-core.js";

self.onmessage = (event) => {
  const { requestId, payload } = event.data || {};
  try {
    const move = computeXiangqiAiMove(payload);
    self.postMessage({ requestId, move });
  } catch (err) {
    self.postMessage({
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
