/**
 * 暗棋台灣判勝測試：吃光對方明子且棋盤無暗子
 * 執行：node scripts/test-anqi-win.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WASM_DIR = join(ROOT, "engines", "banqi", "web");
const COLS = 8;
const HIDDEN = 15;

const mod = await import(pathToFileURL(join(WASM_DIR, "banqi.js")).href);
await mod.default(readFileSync(join(WASM_DIR, "banqi_bg.wasm")));
const { BanqiGameWasm } = mod;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

function cloneState(state) {
  return Int16Array.from(state);
}
function wrapGame(state) {
  return BanqiGameWasm.fromState(Int16Array.from(state));
}
function decodeAction(action) {
  if (action % 33 === 0) return { from: action / 33, to: action / 33, isFlip: true };
  return { from: Math.floor(action / 32), to: action % 32, isFlip: false };
}
function isCannonCode(code) {
  return code === 6 || code === 13;
}
function cellsBetween(from, to) {
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
  if (between === null || between.length === 0) return { ok: false };
  let screen = -1;
  let pieceCount = 0;
  for (const idx of between) {
    if (state[idx] !== 0) {
      pieceCount++;
      screen = idx;
    }
  }
  if (pieceCount !== 1) return { ok: false };
  return { ok: true, screen };
}
function isTaiwanLegalAction(state, action) {
  const dec = decodeAction(action);
  if (dec.isFlip) return true;
  if (!isCannonCode(state[dec.from])) return true;
  const dist =
    Math.abs(Math.floor(dec.from / COLS) - Math.floor(dec.to / COLS)) +
    Math.abs((dec.from % COLS) - (dec.to % COLS));
  if (dist === 1) return true;
  if (cellsBetween(dec.from, dec.to) === null) return false;
  const toCode = state[dec.to];
  if (!toCode || toCode === HIDDEN) return false;
  return cannonLeapInfo(state, dec.from, dec.to).ok;
}
function legalActions(state) {
  const g = wrapGame(state);
  const acts = Array.from(g.legalActions()).filter((a) => isTaiwanLegalAction(state, a));
  g.free();
  return acts;
}
function sidePlayerIdx(state, side) {
  const want = side === "red" ? 1 : 0;
  if (state[64] === want) return 0;
  if (state[65] === want) return 1;
  return null;
}
function detectTaiwanMaterialOutcome(state) {
  let hasRed = false;
  let hasBlack = false;
  let hasHidden = false;
  for (let i = 0; i < 32; i++) {
    const c = state[i];
    if (c === HIDDEN) hasHidden = true;
    else if (c >= 1 && c <= 7) hasRed = true;
    else if (c >= 8 && c <= 14) hasBlack = true;
  }
  if (hasHidden) return null;
  if (!hasRed && !hasBlack) return { draw: true };
  if (!hasRed && hasBlack) {
    const w = sidePlayerIdx(state, "black");
    if (w != null) return { draw: false, winner: w };
    if (state[64] === 0) return { draw: false, winner: 0 };
    if (state[65] === 0) return { draw: false, winner: 1 };
    return null;
  }
  if (hasRed && !hasBlack) {
    const w = sidePlayerIdx(state, "red");
    if (w != null) return { draw: false, winner: w };
    if (state[64] === 1) return { draw: false, winner: 0 };
    if (state[65] === 1) return { draw: false, winner: 1 };
    return null;
  }
  return null;
}
function applyAction(state, action, seed) {
  const g = wrapGame(state);
  const step = g.applyStep(action, BigInt(seed));
  const next = cloneState(step.state);
  const wasmResult = {
    state: next,
    done: step.done,
    draw: step.draw,
    winner: step.winner,
  };
  step.free();
  g.free();
  const material = detectTaiwanMaterialOutcome(next);
  if (!material) return { ...wasmResult, done: false };
  return {
    ...wasmResult,
    done: true,
    draw: material.draw,
    winner: material.draw ? wasmResult.winner : material.winner,
  };
}
function countBoard(st) {
  let r = 0;
  let b = 0;
  let h = 0;
  for (let i = 0; i < 32; i++) {
    const c = st[i];
    if (c === HIDDEN) h++;
    else if (c >= 1 && c <= 7) r++;
    else if (c >= 8 && c <= 14) b++;
  }
  return { r, b, h };
}

console.log("暗棋判勝測試開始…\n");

// 1. 合成局面
{
  const st = new Int16Array(66);
  st[0] = 8;
  st[5] = 11;
  st[64] = 0;
  st[65] = 1;
  const o = detectTaiwanMaterialOutcome(st);
  assert(o && !o.draw && o.winner === 0, "僅剩黑子 → 黑方玩家 0 勝");
}
{
  const st = new Int16Array(66);
  st[0] = 1;
  st[3] = 4;
  st[64] = 1;
  st[65] = 0;
  const o = detectTaiwanMaterialOutcome(st);
  assert(o && !o.draw && o.winner === 0, "僅剩紅子 → 紅方玩家 0 勝");
}
{
  const st = new Int16Array(66);
  st[0] = 8;
  st[1] = HIDDEN;
  assert(detectTaiwanMaterialOutcome(st) === null, "仍有暗子 → 不判勝");
}
{
  const st = new Int16Array(66);
  st[0] = 8;
  st[1] = 1;
  assert(detectTaiwanMaterialOutcome(st) === null, "紅黑皆有明子 → 不判勝");
}

// 2. 模擬對局：積極吃子直到一方全滅或無法繼續
let winDetected = 0;
let winMissed = 0;
for (let seed = 1; seed <= 120; seed++) {
  const g = BanqiGameWasm.makeTest(BigInt(seed), 0);
  let state = g.state();
  g.free();
  for (let ply = 0; ply < 3000; ply++) {
    const c = countBoard(state);
    if (c.h === 0 && (c.r === 0 || c.b === 0)) {
      const o = detectTaiwanMaterialOutcome(state);
      assert(o != null, `seed=${seed} 一方全滅應可判勝 board=${JSON.stringify(c)}`);
      if (o) winDetected++;
      break;
    }
    const acts = legalActions(state);
    if (!acts.length) break;
    let pick = acts[0];
    for (const a of acts) {
      if (a % 33 === 0) continue;
      const to = a % 32;
      if (state[to] !== 0 && state[to] !== HIDDEN) {
        pick = a;
        break;
      }
    }
    const before = countBoard(state);
    const r = applyAction(state, pick, seed);
    state = r.state;
    const after = countBoard(state);
    if (after.h === 0 && (after.r === 0 || after.b === 0)) {
      assert(r.done, `seed=${seed} ply=${ply} 吃光後 applyAction 應 done=true`);
      assert(!r.draw, `seed=${seed} 吃光對方不應和棋`);
      if (!r.done) winMissed++;
      else winDetected++;
      break;
    }
  }
}
console.log(`模擬對局判勝觸發 ${winDetected} 次，漏判 ${winMissed} 次`);

// 3. 確認 WASM 本身不會 done（需靠台灣補判）
{
  const g = BanqiGameWasm.makeTest(99n, 0);
  let state = g.state();
  let wasmDone = 0;
  for (let i = 0; i < 500; i++) {
    const acts = Array.from(g.legalActions());
    if (!acts.length) break;
    const step = g.applyStep(acts[0], 99n);
    if (step.done) wasmDone++;
    state = step.state;
    step.free();
  }
  g.free();
  assert(wasmDone === 0, "WASM 標準對局不應自行 done（由台灣規則補判）");
}

console.log("\n--- 結果 ---");
console.log(`通過: ${passed}`);
console.log(`失敗: ${failed}`);
if (failed) process.exit(1);
console.log("\n判勝邏輯驗證通過。");
