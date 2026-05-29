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

function cellNorm(s) {
  return String(s ?? "").trim();
}

function pickCol(labels, headerRow) {
  for (const label of labels) {
    const i = headerRow.findIndex((h) => {
      const t = cellNorm(h);
      return t === label || t.split(/\s+/)[0] === label;
    });
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

function rowLooksLikeEnData(cells) {
  if (!cells || cells.length < 5) return false;
  const t = cellNorm(cells[1]);
  return (t === "單字" || t === "生字") && cellNorm(cells[2]) && cellNorm(cells[4]);
}

function rowLooksLikeZhData(cells) {
  if (!cells || cells.length < 4) return false;
  const t = cellNorm(cells[1]);
  return (t === "生字" || t === "單字") && cellNorm(cells[2]) && cellNorm(cells[3]);
}

function getHeaderAndRows(table) {
  const rows = table.rows || [];
  if (!rows.length) return { headerRow: [], dataRows: [] };

  const first = rowCells(rows[0]);
  if (cellNorm(first[0]) === "課次" && cellNorm(first[1]) === "類型") {
    return { headerRow: first, dataRows: rows.slice(1) };
  }

  if (rowLooksLikeEnData(first) || rowLooksLikeZhData(first)) {
    return {
      headerRow: ["課次", "類型", "中文", "提示", "英文"],
      dataRows: rows,
    };
  }

  const headerCells = table.cols?.map((c) => String(c.label ?? "")) ?? [];
  const headerIsBroken = headerCells.some((h) => cellNorm(h).split(/\s+/).length > 3);
  if (headerIsBroken && rows.some((r) => rowLooksLikeEnData(rowCells(r)))) {
    return {
      headerRow: ["課次", "類型", "中文", "提示", "英文"],
      dataRows: rows.filter((r) => rowLooksLikeEnData(rowCells(r))),
    };
  }

  const headerRow =
    headerCells.length > 0 && headerCells.some(Boolean) ? headerCells : first;
  const dataRows =
    cellNorm(first[0]) === "課次" ? rows.slice(1) : rows;
  return { headerRow, dataRows };
}

function resolveZhColIdx(headerRow, dataRows) {
  const idx = {
    lesson: pickCol(COL_ZH.lesson, headerRow),
    type: pickCol(COL_ZH.type, headerRow),
    word: pickCol(COL_ZH.word, headerRow),
    zhuyin: pickCol(COL_ZH.zhuyin, headerRow),
    sentence: pickCol(COL_ZH.sentence, headerRow),
  };
  if (idx.word >= 0 && idx.zhuyin >= 0) return idx;

  const sample = dataRows[0] ? rowCells(dataRows[0]) : [];
  if (rowLooksLikeZhData(sample) || (cellNorm(sample[1]) === "生字" && sample.length >= 4)) {
    return {
      lesson: 0,
      type: 1,
      word: 2,
      zhuyin: 3,
      sentence: sample.length > 4 ? 4 : -1,
    };
  }
  return idx;
}

function resolveEnColIdx(headerRow, dataRows) {
  const idx = {
    lesson: pickCol(COL_EN.lesson, headerRow),
    type: pickCol(COL_EN.type, headerRow),
    chinese: pickCol(COL_EN.chinese, headerRow),
    hint: pickCol(COL_EN.hint, headerRow),
    english: pickCol(COL_EN.english, headerRow),
  };
  if (idx.chinese >= 0 && idx.english >= 0) return idx;

  const sample = dataRows[0] ? rowCells(dataRows[0]) : [];
  if (rowLooksLikeEnData(sample)) {
    return { lesson: 0, type: 1, chinese: 2, hint: 3, english: 4 };
  }
  return idx;
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
  const idx = resolveZhColIdx(headerRow, dataRows);
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
    const idx = resolveEnColIdx(headerRow, dataRows);
    if (idx.english < 0 || idx.chinese < 0) {
      console.warn("英語欄位無法辨識，使用示範題庫");
      return filterByTypes([...DEMO_EN_ITEMS], types);
    }

    const items = [];
    const seen = new Set();
    for (const row of dataRows) {
      const item = rowToEnItem(rowCells(row), idx);
      if (!item) continue;
      const key = item.english.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    if (!items.length) {
      console.warn("英語工作表無有效列，使用示範題庫");
      return filterByTypes([...DEMO_EN_ITEMS], types);
    }
    return filterByTypes(items, types);
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
