import { CONFIG } from "./config.site.js";
import { DEMO_ZH_ITEMS } from "./demo-data.js";

const COL = {
  lesson: ["課次"],
  type: ["類型"],
  word: ["國字或詞", "國字", "字詞"],
  zhuyin: ["注音"],
  sentence: ["例句", "句子", "課文例句"],
};

function pickCol(labels, headerRow) {
  const norm = (s) => String(s || "").trim();
  for (const label of labels) {
    const i = headerRow.findIndex((h) => norm(h) === label);
    if (i >= 0) return i;
  }
  return -1;
}

function rowToItem(cells, idx) {
  const lesson = cells[idx.lesson] ?? "";
  const type = cells[idx.type] ?? "";
  const word = String(cells[idx.word] ?? "").trim();
  const zhuyin = String(cells[idx.zhuyin] ?? "").trim();
  if (!word || !zhuyin) return null;
  const sentence = idx.sentence >= 0 ? String(cells[idx.sentence] ?? "").trim() : "";
  return { lesson, type, word, zhuyin, sentence };
}

function parseGviz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("試算表回應格式錯誤");
  const json = JSON.parse(text.slice(start, end + 1));
  const table = json.table;
  if (!table?.rows?.length) return [];

  const headerCells = table.cols?.map((c) => c.label) ?? [];
  const firstRow = table.rows[0]?.c?.map((c) => c?.v ?? "") ?? [];
  const headerRow =
    headerCells.length > 0 && headerCells.some(Boolean)
      ? headerCells
      : firstRow;

  const idx = {
    lesson: pickCol(COL.lesson, headerRow),
    type: pickCol(COL.type, headerRow),
    word: pickCol(COL.word, headerRow),
    zhuyin: pickCol(COL.zhuyin, headerRow),
    sentence: pickCol(COL.sentence, headerRow),
  };

  if (idx.word < 0 || idx.zhuyin < 0) {
    throw new Error("找不到欄位「國字或詞」或「注音」");
  }

  const dataRows = table.rows.slice(
    headerCells.length > 0 && headerCells.some(Boolean) ? 0 : 1
  );

  const items = [];
  for (const row of dataRows) {
    const cells = row.c?.map((c) => (c?.v != null ? String(c.v) : "")) ?? [];
    const item = rowToItem(cells, idx);
    if (item) items.push(item);
  }
  return items;
}

function filterItems(items) {
  const types = new Set(CONFIG.QUIZ_TYPES.map((t) => String(t).trim()));
  return items.filter((it) => {
    if (!types.size) return true;
    return types.has(String(it.type || "").trim());
  });
}

export async function loadZhItems() {
  if (CONFIG.SHEETS_JSON_URL) {
    const res = await fetch(CONFIG.SHEETS_JSON_URL);
    if (!res.ok) throw new Error(`無法讀取題庫 (${res.status})`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items ?? [];
    return filterItems(items);
  }

  const id = (CONFIG.SPREADSHEET_ID || "").trim();
  if (!id) {
    return filterItems([...DEMO_ZH_ITEMS]);
  }

  const sheet = encodeURIComponent(CONFIG.SHEET_ZH || "國語");
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${sheet}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`無法讀取試算表 (${res.status})`);
  const text = await res.text();
  return filterItems(parseGviz(text));
}

export function uniqueLessons(items) {
  const set = new Set(items.map((i) => i.lesson).filter(Boolean));
  return ["全部", ...[...set].sort()];
}

export function pickRandomQuestions(items, count = 10, lessonFilter = "全部") {
  let pool = items;
  if (lessonFilter && lessonFilter !== "全部") {
    pool = items.filter((i) => i.lesson === lessonFilter);
  }
  if (!pool.length) return [];

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  if (shuffled.length <= count) return shuffled;
  return shuffled.slice(0, count);
}
