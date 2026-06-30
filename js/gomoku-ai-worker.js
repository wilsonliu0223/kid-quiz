/** 五子棋 AI Web Worker（大師背景運算） */
import { computeAiMove } from "./gomoku-ai-core.js?v=gomoku-v9";

self.onmessage = (event) => {
  const { requestId, payload } = event.data || {};
  try {
    const cells = payload?.cells;
    const opts = payload?.opts;
    const move = computeAiMove(cells, opts);
    self.postMessage({ requestId, move });
  } catch (err) {
    self.postMessage({ requestId, error: err?.message || String(err) });
  }
};
