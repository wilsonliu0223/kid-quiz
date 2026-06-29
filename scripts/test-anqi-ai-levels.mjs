/**
 * 暗棋六階 AI 難度 smoke test
 * 執行：node scripts/test-anqi-ai-levels.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WASM_DIR = join(ROOT, "engines", "banqi", "web");

const AI_LEVEL_CONFIG = {
  1: { evalMode: "static", label: "入門" },
  2: { depth: 2, evalMode: "dynamic", label: "普通" },
  3: { depth: 3, evalMode: "dynamic", label: "高手" },
  4: { depth: 3, evalMode: "dynamic", timeLimitMs: 2500, label: "大師" },
  5: { depth: 4, evalMode: "dynamic", timeLimitMs: 6000, label: "宗師" },
  6: { mcts: 1200, evalMode: "dynamic", label: "涅槃" },
};

function decodeAction(action) {
  if (action % 33 === 0) {
    const cell = action / 33;
    return { from: cell, to: cell, isFlip: true };
  }
  return { from: Math.floor(action / 32), to: action % 32, isFlip: false };
}

function pickRandomAction(legal) {
  return legal[Math.floor(Math.random() * legal.length)];
}

function pickBestAction(scores, legal) {
  let best = legal[0];
  let bestScore = -Infinity;
  for (const a of legal) {
    const s = scores[a] ?? -Infinity;
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best;
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
    console.error("FAIL:", msg);
  }
}

const mod = await import(pathToFileURL(join(WASM_DIR, "banqi.js")).href);
await mod.default(readFileSync(join(WASM_DIR, "banqi_bg.wasm")));
const { BanqiGameWasm, MctsSessionWasm } = mod;

function wrapGame(state) {
  return BanqiGameWasm.fromState(Int16Array.from(state));
}

function isCannonCode(code) {
  return code === 6 || code === 13;
}
function cellsBetween(from, to) {
  const COLS = 8;
  const ROWS = 4;
  if (from === to) return [];
  const fr = Math.floor(from / COLS);
  const fc = from % COLS;
  const tr = Math.floor(to / COLS);
  const tc = to % COLS;
  if (fr === tr) {
    const lo = Math.min(fc, tc);
    const hi = Math.max(fc, tc);
    const out = [];
    for (let c = lo + 1; c < hi; c++) out.push(fr * COLS + c);
    return out;
  }
  if (fc === tc) {
    const lo = Math.min(fr, tr);
    const hi = Math.max(fr, tr);
    const out = [];
    for (let r = lo + 1; r < hi; r++) out.push(r * COLS + fc);
    return out;
  }
  return null;
}
function cannonLeapInfo(state, from, to) {
  const between = cellsBetween(from, to);
  if (between === null || between.length === 0) return { ok: false, pieceCount: 0 };
  let screen = -1;
  let pieceCount = 0;
  for (const idx of between) {
    if (state[idx] !== 0) {
      pieceCount++;
      screen = idx;
    }
  }
  if (pieceCount !== 1) return { ok: false, pieceCount };
  return { ok: true, screen, pieceCount: 1 };
}
function isTaiwanLegalAction(state, action) {
  const dec = decodeAction(action);
  if (dec.isFlip) return true;
  if (!isCannonCode(state[dec.from])) return true;
  const dist =
    Math.abs(Math.floor(dec.from / 8) - Math.floor(dec.to / 8)) +
    Math.abs((dec.from % 8) - (dec.to % 8));
  if (dist === 1) return true;
  if (cellsBetween(dec.from, dec.to) === null) return false;
  const toCode = state[dec.to];
  if (!toCode || toCode === 15) return false;
  return cannonLeapInfo(state, dec.from, dec.to).ok;
}

function legalActions(state) {
  const g = wrapGame(state);
  const acts = Array.from(g.legalActions());
  g.free();
  return acts.filter((a) => isTaiwanLegalAction(state, a));
}

function applyAction(state, action, seed) {
  const g = wrapGame(state);
  const step = g.applyStep(action, BigInt(seed));
  const next = Int16Array.from(step.state);
  const done = step.done;
  step.free();
  g.free();
  return { state: next, done };
}

function minimaxScores(state, depth, evalMode, timeLimitMs) {
  const g = wrapGame(state);
  const scores = g.minimaxScores(
    depth,
    evalMode,
    timeLimitMs != null ? BigInt(timeLimitMs) : null,
    null,
  );
  g.free();
  return scores;
}

function mctsBestAction(state, simulations, seed) {
  const g = wrapGame(state);
  const variant = g.variant();
  const session = new MctsSessionWasm(
    Int16Array.from(state),
    variant,
    simulations,
    BigInt(seed),
    1.4,
    0.3,
    0.25,
    true,
    BigInt(8000),
    null,
  );
  const result = session.result(0, 1);
  const action = result.action;
  result.free();
  session.close();
  session.free();
  variant.free();
  g.free();
  return action;
}

async function requestAiMove(state, level, seed) {
  const acts = legalActions(state);
  if (!acts.length) throw new Error("no legal actions");
  const cfg = AI_LEVEL_CONFIG[level];
  if (level === 1) return pickRandomAction(acts);
  if (cfg.mcts) {
    const raw = mctsBestAction(state, cfg.mcts, seed);
    if (acts.includes(raw)) return raw;
    const scores = minimaxScores(state, 2, cfg.evalMode, 1500);
    return pickBestAction(scores, acts);
  }
  const scores = minimaxScores(state, cfg.depth, cfg.evalMode, cfg.timeLimitMs);
  return pickBestAction(scores, acts);
}

/** 走幾步到有多種走法的局面 */
function sampleStates(count) {
  const states = [];
  for (let seed = 1; seed <= count; seed++) {
    const g = BanqiGameWasm.makeTest(BigInt(seed), 0);
    let state = g.state();
    g.free();
    for (let ply = 0; ply < 40; ply++) {
      const acts = legalActions(state);
      if (!acts.length) break;
      if (acts.length >= 3) {
        states.push({ state: Int16Array.from(state), seed, ply });
        break;
      }
      state = applyAction(state, acts[0], seed).state;
    }
  }
  return states;
}

console.log("暗棋 AI 六階難度測試…\n");

const samples = sampleStates(12);
assert(samples.length >= 8, `取得測試局面數 ${samples.length}（至少 8）`);

for (let level = 1; level <= 6; level++) {
  const cfg = AI_LEVEL_CONFIG[level];
  console.log(`--- ${level}. ${cfg.label} ---`);

  for (const { state, seed, ply } of samples) {
    const t0 = performance.now();
    let action;
    try {
      action = await requestAiMove(state, level, seed);
    } catch (e) {
      assert(false, `L${level} seed=${seed} ply=${ply} 拋錯: ${e.message}`);
      continue;
    }
    const ms = performance.now() - t0;
    const acts = legalActions(state);
    assert(acts.includes(action), `L${level} 回傳非法 action=${action} seed=${seed}`);
    if (level === 6 && ms > 30000) {
      assert(false, `L6 超時 ${ms.toFixed(0)}ms seed=${seed}`);
    }
    if (level === 5 && ms > 15000) {
      assert(false, `L5 超時 ${ms.toFixed(0)}ms seed=${seed}`);
    }
  }

  // 計時：單一中等局面
  const bench = samples[3];
  const times = [];
  for (let i = 0; i < (level >= 4 ? 2 : 3); i++) {
    const t0 = performance.now();
    await requestAiMove(bench.state, level, bench.seed + i);
    times.push(performance.now() - t0);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`  平均耗時 ${avg.toFixed(0)}ms (${times.map((t) => t.toFixed(0)).join(", ")}ms)`);

  if (level === 1) {
    const acts = legalActions(bench.state);
    const picks = new Set();
    for (let i = 0; i < 40; i++) picks.add(pickRandomAction(acts));
    assert(picks.size >= 2 || acts.length < 2, "L1 隨機應有多樣走法");
  }

  if (level === 2) {
    const a = await requestAiMove(bench.state, 2, bench.seed);
    const scores = minimaxScores(bench.state, 2, "dynamic");
    const best = pickBestAction(scores, legalActions(bench.state));
    assert(a === best, "L2 應等於 depth-2 minimax 最佳著");
  }

  if (level === 3) {
    const a = await requestAiMove(bench.state, 3, bench.seed);
    const best = pickBestAction(
      minimaxScores(bench.state, 3, "dynamic"),
      legalActions(bench.state),
    );
    assert(a === best, "L3 應等於 depth-3 minimax 最佳著");
  }

  if (level === 6) {
    const a = await requestAiMove(bench.state, 6, bench.seed);
    const direct = mctsBestAction(bench.state, 1200, bench.seed);
    assert(a === direct, "L6 應等於 MCTS 1200 sims 結果");
  }

  console.log(`  ${cfg.label} OK\n`);
}

// 連續走完一小局（高階耗時較長，步數縮短）
for (let level = 1; level <= 6; level++) {
  const g = BanqiGameWasm.makeTest(BigInt(100 + level), 0);
  let state = g.state();
  g.free();
  let moves = 0;
  const seed = 100 + level;
  const maxPlies = level >= 4 ? 12 : 30;
  for (let ply = 0; ply < maxPlies; ply++) {
    const acts = legalActions(state);
    if (!acts.length) break;
    let action;
    try {
      action = await requestAiMove(state, level, seed + ply);
    } catch (e) {
      assert(false, `L${level} 整局測試 ply=${ply}: ${e.message}`);
      break;
    }
    const r = applyAction(state, action, seed);
    state = r.state;
    moves++;
    if (r.done) break;
  }
  assert(moves >= 1, `L${level} 整局至少走一步 (moves=${moves})`);
  console.log(`L${level} 模擬對局：共 ${moves} 步`);
}

console.log("\n--- 結果 ---");
console.log(`通過: ${passed}`);
console.log(`失敗: ${failed}`);
if (failures.length) {
  failures.forEach((f) => console.log(" -", f));
  process.exit(1);
}
console.log("\n六階 AI 皆可正常出招。");
