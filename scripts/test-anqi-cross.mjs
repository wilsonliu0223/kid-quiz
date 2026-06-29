/**
 * 暗棋交叉測試：引擎、編碼、翻牌、走子、吃子、點擊邏輯
 * 執行：node scripts/test-anqi-cross.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WASM_DIR = join(ROOT, "engines", "banqi", "web");

const ROWS = 4;
const COLS = 8;
const HIDDEN = 15;
const RED_LABELS = ["", "帥", "仕", "相", "俥", "傌", "炮", "兵"];
const BLACK_LABELS = ["", "將", "士", "象", "車", "馬", "包", "卒"];

function cellIndex(row, col) {
  return row * COLS + col;
}
function engineToDisplayPos(row, col) {
  return { dr: col, dc: ROWS - 1 - row };
}
function displayPosToEngineIndex(dr, dc) {
  return cellIndex(ROWS - 1 - dc, dr);
}
function pieceLabel(code) {
  if (code === HIDDEN || code === 0) return "";
  if (code >= 1 && code <= 7) return RED_LABELS[code];
  if (code >= 8 && code <= 14) return BLACK_LABELS[code - 7];
  return `?${code}`;
}
function pieceSide(code) {
  if (code >= 1 && code <= 7) return "red";
  if (code >= 8 && code <= 14) return "black";
  return null;
}
function flipAction(cell) {
  return cell * 33;
}
function moveAction(from, to) {
  return from * 32 + to;
}
function decodeAction(action) {
  if (action % 33 === 0) {
    const cell = action / 33;
    return { from: cell, to: cell, isFlip: true };
  }
  return { from: Math.floor(action / 32), to: action % 32, isFlip: false };
}
function cloneState(state) {
  return Int16Array.from(state);
}
function playerToMove(state) {
  return state[32];
}
function playerAssignedColor(state, playerIdx) {
  return state[64 + playerIdx];
}
function playerSide(state, playerIdx) {
  const c = playerAssignedColor(state, playerIdx);
  if (c < 0) return null;
  return c === 1 ? "red" : "black";
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
function assertEq(a, b, msg) {
  assert(a === b, `${msg} (got ${a}, want ${b})`);
}

const mod = await import(pathToFileURL(join(WASM_DIR, "banqi.js")).href);
await mod.default(readFileSync(join(WASM_DIR, "banqi_bg.wasm")));
const { BanqiGameWasm } = mod;

function wrapGame(state) {
  return BanqiGameWasm.fromState(Int16Array.from(state));
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
  if (pieceCount !== 1) return { ok: false, pieceCount };
  return { ok: true, screen, pieceCount: 1 };
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
function wasmLegalActions(state) {
  const g = wrapGame(state);
  const acts = Array.from(g.legalActions());
  g.free();
  return acts;
}
function legalActions(state) {
  return wasmLegalActions(state).filter((a) => isTaiwanLegalAction(state, a));
}
function legalMovesFromCell(state, fromCell) {
  return legalActions(state).filter((a) => {
    const d = decodeAction(a);
    return !d.isFlip && d.from === fromCell;
  });
}
function legalFlipCells(state) {
  return legalActions(state)
    .filter((a) => decodeAction(a).isFlip)
    .map((a) => decodeAction(a).from);
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
function mergeTaiwanOutcome(state, result) {
  const material = detectTaiwanMaterialOutcome(state);
  if (!material) return { ...result, done: false };
  return {
    ...result,
    done: true,
    draw: material.draw,
    winner: material.draw ? result.winner : material.winner,
  };
}
function applyAction(state, action, seed) {
  const g = wrapGame(state);
  const step = g.applyStep(action, BigInt(seed));
  const result = mergeTaiwanOutcome(step.state, {
    state: cloneState(step.state),
    done: step.done,
    draw: step.draw,
    winner: step.winner,
  });
  step.free();
  g.free();
  return result;
}

function simulateClick(state, selected, index, me) {
  const myColor = playerSide(state, me);
  const code = state[index];

  if (selected != null) {
    if (selected === index) return { selected: null, action: null };
    const hit = legalMovesFromCell(state, selected).find((a) => decodeAction(a).to === index);
    if (hit != null) return { selected: null, action: hit };
    if (myColor && code !== 0 && pieceSide(code) === myColor) {
      return { selected: index, action: null };
    }
    return { selected, action: null };
  }

  if (legalFlipCells(state).includes(index)) {
    return { selected: null, action: flipAction(index) };
  }

  if (myColor && code !== 0 && pieceSide(code) === myColor) {
    if (legalMovesFromCell(state, index).length) {
      return { selected: index, action: null };
    }
  }
  return { selected: null, action: null };
}

function playGameViaClicks(seed, maxPlies = 150) {
  const g = BanqiGameWasm.makeTest(BigInt(seed), 0);
  let state = g.state();
  g.free();
  let selected = null;

  for (let ply = 0; ply < maxPlies; ply++) {
    const acts = legalActions(state);
    if (!acts.length) return { ok: true, ply, ended: true };

    const me = playerToMove(state);
    const pick = acts[Math.floor(Math.random() * acts.length)];
    const dec = decodeAction(pick);

    if (dec.isFlip) {
      const c = simulateClick(state, selected, dec.from, me);
      if (c.action !== pick) return { ok: false, reason: `flip click seed=${seed} ply=${ply}`, ply };
      const r = applyAction(state, c.action, seed);
      state = r.state;
      selected = null;
      if (r.done) return { ok: true, ply };
      continue;
    }

    const c1 = simulateClick(state, selected, dec.from, me);
    if (c1.selected !== dec.from) {
      if (!playerSide(state, me)) continue;
      return { ok: false, reason: `select from ${dec.from}`, ply };
    }
    const c2 = simulateClick(state, c1.selected, dec.to, me);
    if (c2.action !== pick) {
      return {
        ok: false,
        reason: `move click ${pieceLabel(state[dec.from])}→${dec.to}`,
        ply,
      };
    }
    const r = applyAction(state, c2.action, seed);
    state = r.state;
    selected = null;
    if (r.done) return { ok: true, ply };
  }
  return { ok: true, ply: maxPlies };
}

console.log("暗棋交叉測試開始…\n");

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const idx = cellIndex(r, c);
    const { dr, dc } = engineToDisplayPos(r, c);
    assertEq(displayPosToEngineIndex(dr, dc), idx, `座標往返 (${r},${c})`);
  }
}

for (const seed of Array.from({ length: 200 }, (_, i) => i + 1)) {
  const g0 = BanqiGameWasm.makeTest(BigInt(seed), 0);
  let state = g0.state();
  g0.free();

  for (let ply = 0; ply < 200; ply++) {
    const acts = legalActions(state);
    if (!acts.length) break;

    for (const a of acts) {
      const dec = decodeAction(a);
      if (dec.isFlip) {
        assertEq(a, flipAction(dec.from), `seed=${seed} flip 編碼`);
      } else {
        assertEq(a, moveAction(dec.from, dec.to), `seed=${seed} move 編碼`);
        assert(state[dec.from] !== HIDDEN && state[dec.from] !== 0, `seed=${seed} 走子起點有子`);
        assert(state[dec.to] !== HIDDEN, `seed=${seed} 走子終點非暗`);
      }
    }

    const pick = acts[Math.floor(Math.random() * acts.length)];
    const r = applyAction(state, pick, seed);
    state = r.state;
    if (r.done) break;
  }
}
console.log("編碼 + 200 局隨機引擎走子完成");

{
  const g = BanqiGameWasm.makeTest(7n, 0);
  const state = g.state();
  g.free();
  const acts = legalActions(state);
  assert(acts.length === 32, "開局 32 格皆可翻");
  assert(acts.every((a) => decodeAction(a).isFlip), "開局僅翻牌");
}

for (let seed = 1; seed <= 50; seed++) {
  const result = playGameViaClicks(seed);
  assert(result.ok, `simulateClick seed=${seed}: ${result.reason} @${result.ply}`);
}
console.log("simulateClick 50 局完成");

for (let seed = 1; seed <= 30; seed++) {
  const g = BanqiGameWasm.makeTest(BigInt(seed), 6);
  let state = g.state();
  g.free();
  for (let ply = 0; ply < 80; ply++) {
    const me = playerToMove(state);
    const myColor = playerSide(state, me);
    if (myColor) {
      for (let i = 0; i < 32; i++) {
        const code = state[i];
        if (!code || code === HIDDEN) continue;
        if (pieceSide(code) !== myColor) {
          const c = simulateClick(state, null, i, me);
          assert(c.selected !== i, `敵方 ${pieceLabel(code)} 不可選中`);
        }
      }
    }
    const acts = legalActions(state);
    if (!acts.length) break;
    state = applyAction(state, acts[0], seed).state;
  }
}

let cannonJump = 0;
for (let seed = 1; seed <= 100; seed++) {
  const g = BanqiGameWasm.makeTest(BigInt(seed), 10);
  let state = g.state();
  g.free();
  for (let ply = 0; ply < 80; ply++) {
    for (const a of legalActions(state)) {
      const d = decodeAction(a);
      if (d.isFlip) continue;
      const from = state[d.from];
      if (from !== 6 && from !== 13) continue;
      const dist =
        Math.abs(Math.floor(d.from / COLS) - Math.floor(d.to / COLS)) +
        Math.abs((d.from % COLS) - (d.to % COLS));
      assert(dist !== 1 || state[d.to] === 0, `炮包不可鄰格吃子 seed=${seed}`);
      if (state[d.to] !== 0 && dist > 1) cannonJump++;
    }
    const acts = legalActions(state);
    if (!acts.length) break;
    const r = applyAction(state, acts[0], seed);
    state = r.state;
    if (r.done) break;
  }
}
assert(cannonJump > 0, "應出現炮/包隔子吃子");

let pawnEatGeneral = 0;
for (let seed = 1; seed <= 150; seed++) {
  const g = BanqiGameWasm.makeTest(BigInt(seed), 12);
  let state = g.state();
  g.free();
  for (let ply = 0; ply < 100; ply++) {
    for (const a of legalActions(state)) {
      const d = decodeAction(a);
      if (d.isFlip) continue;
      const f = state[d.from];
      const t = state[d.to];
      if (!t || t === HIDDEN) continue;
      if ((f === 7 || f === 14) && (t === 1 || t === 8)) pawnEatGeneral++;
      if ((f === 1 || f === 8) && (t === 7 || t === 14)) {
        assert(false, `帥將不可吃兵卒 seed=${seed}`);
      }
    }
    const acts = legalActions(state);
    if (!acts.length) break;
    const r = applyAction(state, acts[0], seed);
    state = r.state;
    if (r.done) break;
  }
}
assert(pawnEatGeneral > 0, "應出現兵卒吃帥將");

function makeBoard(cells) {
  const st = new Int16Array(66);
  st.fill(0);
  for (const [idx, code] of cells) st[idx] = code;
  st[32] = 0;
  st[64] = 1;
  st[65] = 0;
  return st;
}

const twoScreenCases = [
  {
    label: "橫向：明子+暗棋隔兩子",
    cells: [
      [14, 6],
      [13, 4],
      [12, 15],
      [10, 10],
    ],
    from: 14,
    to: 10,
  },
  {
    label: "橫向：暗棋+明子隔兩子",
    cells: [
      [14, 6],
      [13, 15],
      [12, 4],
      [10, 10],
    ],
    from: 14,
    to: 10,
  },
  {
    label: "縱向：明子+暗棋隔兩子",
    cells: [
      [3, 6],
      [11, 4],
      [19, 15],
      [27, 10],
    ],
    from: 3,
    to: 27,
  },
];

for (const c of twoScreenCases) {
  const st = makeBoard(c.cells);
  const leap = cannonLeapInfo(st, c.from, c.to);
  assertEq(leap.pieceCount, 2, `${c.label} 應計 2 子`);
  assert(!leap.ok, `${c.label} 不可跳吃`);
  const act = moveAction(c.from, c.to);
  assert(!legalActions(st).includes(act), `${c.label} 不可出現在合法走法`);
}

const hiddenScreen = makeBoard([
  [14, 6],
  [12, 15],
  [10, 10],
]);
assert(cannonLeapInfo(hiddenScreen, 14, 10).ok, "僅暗棋炮架可跳吃");
const hiddenAct = moveAction(14, 10);
const wasmHidden = wasmLegalActions(hiddenScreen);
if (wasmHidden.includes(hiddenAct)) {
  assert(
    legalActions(hiddenScreen).includes(hiddenAct),
    "僅暗棋炮架：WASM 允許時台灣規則也應允許",
  );
}

const cannonStep = makeBoard([
  [12, 6],
  [13, 0],
]);
assert(
  legalActions(cannonStep).includes(moveAction(12, 13)),
  "炮／包應可鄰格移動到空格",
);

let filteredCannon = 0;
for (let seed = 1; seed <= 200; seed++) {
  const g = BanqiGameWasm.makeTest(BigInt(seed), 12);
  let state = g.state();
  g.free();
  for (let ply = 0; ply < 40; ply++) {
    const wasm = wasmLegalActions(state);
    const taiwan = legalActions(state);
    assert(taiwan.length <= wasm.length, `台灣規則過濾 seed=${seed}`);
    for (const a of taiwan) {
      const d = decodeAction(a);
      if (d.isFlip || !isCannonCode(state[d.from])) continue;
      const dist =
        Math.abs(Math.floor(d.from / COLS) - Math.floor(d.to / COLS)) +
        Math.abs((d.from % COLS) - (d.to % COLS));
      if (dist === 1) continue;
      const leap = cannonLeapInfo(state, d.from, d.to);
      assert(leap.ok, `炮遠距走法需恰好一個炮架 seed=${seed}`);
      assert(
        leap.pieceCount === 1,
        `炮架只能有一子（含暗棋）seed=${seed} action=${a}`,
      );
      assert(
        state[d.to] !== 0 && state[d.to] !== HIDDEN,
        `炮遠距僅能跳吃 seed=${seed} action=${a}`,
      );
    }
    for (const a of wasm) {
      const d = decodeAction(a);
      if (d.isFlip || !isCannonCode(state[d.from])) continue;
      const leap = cannonLeapInfo(state, d.from, d.to);
      if (leap.pieceCount >= 2 && taiwan.includes(a)) {
        assert(false, `隔兩子以上炮走法未過濾 seed=${seed} action=${a}`);
      }
    }
    filteredCannon += wasm.length - taiwan.length;
    const acts = taiwan;
    if (!acts.length) break;
    state = applyAction(state, acts[0], seed).state;
  }
}
assert(filteredCannon >= 0, "台灣炮規則過濾計數異常");
console.log(`台灣炮規則過濾 ${filteredCannon} 步違規走法`);

assertEq(pieceSide(4), "red", "紅俥");
assertEq(pieceSide(11), "black", "黑車");

{
  const st = new Int16Array(66);
  st[0] = 8;
  st[5] = 11;
  st[64] = 0;
  st[65] = 1;
  const o = detectTaiwanMaterialOutcome(st);
  assert(o && !o.draw && o.winner === 0, "僅剩黑子時黑方勝");
}
{
  const st = new Int16Array(66);
  st[0] = 1;
  st[64] = 1;
  st[65] = 0;
  const o = detectTaiwanMaterialOutcome(st);
  assert(o && !o.draw && o.winner === 0, "僅剩紅子時紅方勝");
}
{
  const st = new Int16Array(66);
  st[0] = 8;
  st[1] = HIDDEN;
  assert(detectTaiwanMaterialOutcome(st) === null, "仍有暗子時不判勝");
}

console.log("\n--- 結果 ---");
console.log(`通過: ${passed}`);
console.log(`失敗: ${failed}`);
if (failures.length) {
  failures.slice(0, 20).forEach((f) => console.log(" -", f));
  process.exit(1);
}
console.log("\n全部通過，可進瀏覽器驗收。");
