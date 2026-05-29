import { CONFIG } from "./config.site.js";
import { DEMO_ZH_ITEMS } from "./demo-data.js";
import { DEMO_EN_ITEMS } from "./demo-en.js";

const COL_ZH = {
  lesson: ["課次"],
  type: ["類型"],
  word: ["國字或詞", "國字", "字詞"],
  zhuyin: ["注音"],
  sentence: ["例句", "句子", "課文例句"],
};

const COL_EN = {
  lesson: ["課次"],
  type: ["類型"],
  chinese: ["中文", "中文提示", "意思"],
  hint: ["提示", "音標", "拼音", "KK"],
  english: ["英文", "英語", "答案", "單字"],
};

function pickCol(labels, headerRow) {
  const norm = (s) => String(s || "").trim();
  for (const label of labels) {
    const i = headerRow.findIndex((h) => norm(h) === label);
    if (i >= 0) return i;
  }
  return -1;
}

function parseGvizRaw(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("試算表回應格式錯誤");
  return JSON.parse(text.slice(start, end + 1));
}

function getHeaderAndRows(table) {
  const headerCells = table.cols?.map((c) => c.label) ?? [];
  const firstRow = table.rows[0]?.c?.map((c) => c?.v ?? "") ?? [];
  const headerRow =
    headerCells.length > 0 && headerCells.some(Boolean) ? headerCells : firstRow;
  const dataRows = table.rows.slice(
    headerCells.length > 0 && headerCells.some(Boolean) ? 0 : 1
  );
  return { headerRow, dataRows };
}

function rowCells(row) {
  return row.c?.map((c) => (c?.v != null ? String(c.v) : "")) ?? [];
}

function rowToZhItem(cells, idx) {
  const word = String(cells[idx.word] ?? "").trim();
  const zhuyin = String(cells[idx.zhuyin] ?? "").trim();
  if (!word || !zhuyin) return null;
  return {
    lesson: cells[idx.lesson] ?? "",
    type: cells[idx.type] ?? "",
    word,
    zhuyin,
    sentence: idx.sentence >= 0 ? String(cells[idx.sentence] ?? "").trim() : "",
  };
}

function rowToEnItem(cells, idx) {
  const english = String(cells[idx.english] ?? "").trim();
  const chinese = String(cells[idx.chinese] ?? "").trim();
  if (!english || !chinese) return null;
  return {
    lesson: cells[idx.lesson] ?? "",
    type: cells[idx.type] ?? "",
    chinese,
    hint: idx.hint >= 0 ? String(cells[idx.hint] ?? "").trim() : "",
    english,
  };
}

function filterByTypes(items, types) {
  const set = new Set(types.map((t) => String(t).trim()));
  return items.filter((it) => {
    if (!set.size) return true;
    return set.has(String(it.type || "").trim());
  });
}

async function fetchSheetRows(sheetName) {
  const id = (CONFIG.SPREADSHEET_ID || "").trim();
  if (!id) return null;
  const sheet = encodeURIComponent(sheetName);
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${sheet}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`無法讀取工作表「${sheetName}」(${res.status})`);
  const json = parseGvizRaw(await res.text());
  return json.table;
}

export async function loadZhItems() {
  const types = CONFIG.QUIZ_TYPES_ZH || CONFIG.QUIZ_TYPES || ["生字"];

  if (CONFIG.SHEETS_JSON_URL) {
    const res = await fetch(CONFIG.SHEETS_JSON_URL);
    if (!res.ok) throw new Error(`無法讀取題庫 (${res.status})`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.zhItems ?? data.items ?? [];
    return filterByTypes(items, types);
  }

  const table = await fetchSheetRows(CONFIG.SHEET_ZH || "國語");
  if (!table?.rows?.length) return filterByTypes([...DEMO_ZH_ITEMS], types);

  const { headerRow, dataRows } = getHeaderAndRows(table);
  const idx = {
    lesson: pickCol(COL_ZH.lesson, headerRow),
    type: pickCol(COL_ZH.type, headerRow),
    word: pickCol(COL_ZH.word, headerRow),
    zhuyin: pickCol(COL_ZH.zhuyin, headerRow),
    sentence: pickCol(COL_ZH.sentence, headerRow),
  };
  if (idx.word < 0 || idx.zhuyin < 0) {
    throw new Error("國語：找不到「國字或詞」或「注音」欄");
  }

  const items = [];
  for (const row of dataRows) {
    const item = rowToZhItem(rowCells(row), idx);
    if (item) items.push(item);
  }
  return filterByTypes(items.length ? items : [...DEMO_ZH_ITEMS], types);
}

export async function loadEnItems() {
  const types = CONFIG.QUIZ_TYPES_EN || ["單字"];

  if (CONFIG.SHEETS_JSON_URL) {
    const res = await fetch(CONFIG.SHEETS_JSON_URL);
    if (!res.ok) throw new Error(`無法讀取題庫 (${res.status})`);
    const data = await res.json();
    const items = data.enItems ?? [];
    return filterByTypes(items, types);
  }

  try {
    const table = await fetchSheetRows(CONFIG.SHEET_EN || "英語");
    if (!table?.rows?.length) return filterByTypes([...DEMO_EN_ITEMS], types);

    const { headerRow, dataRows } = getHeaderAndRows(table);
    const idx = {
      lesson: pickCol(COL_EN.lesson, headerRow),
      type: pickCol(COL_EN.type, headerRow),
      chinese: pickCol(COL_EN.chinese, headerRow),
      hint: pickCol(COL_EN.hint, headerRow),
      english: pickCol(COL_EN.english, headerRow),
    };
    if (idx.english < 0 || idx.chinese < 0) {
      return filterByTypes([...DEMO_EN_ITEMS], types);
    }

    const items = [];
    for (const row of dataRows) {
      const item = rowToEnItem(rowCells(row), idx);
      if (item) items.push(item);
    }
    return filterByTypes(items.length ? items : [...DEMO_EN_ITEMS], types);
  } catch (e) {
    console.warn("英語工作表讀取失敗，使用示範題庫", e);
    return filterByTypes([...DEMO_EN_ITEMS], types);
  }
}

export function uniqueLessons(items) {
  const set = new Set(items.map((i) => i.lesson).filter(Boolean));
  return ["全部", ...[...set].sort()];
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @param {number} count 目標題數；0 或 ≥ 題庫數 → 該範圍內全部題目隨機一輪（不重複）
 */
export function pickRandomQuestions(items, count = 10, lessonFilter = "全部") {
  let pool = items;
  if (lessonFilter && lessonFilter !== "全部") {
    pool = items.filter((i) => i.lesson === lessonFilter);
  }
  if (!pool.length) return [];

  const shuffled = shuffleArray([...pool]);
  const wantAll = !count || count <= 0 || count >= pool.length;
  const n = wantAll ? pool.length : count;
  return shuffled.slice(0, n);
}
