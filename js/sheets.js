import { CONFIG } from "./config.site.js";
import { DEMO_ZH_ITEMS } from "./demo-data.js";
import { DEMO_EN_ITEMS } from "./demo-en.js";
import { enLessonFilterAliases, normalizeEnLesson } from "./exam-books.js";

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
      dataRows: rows.filter((r) => {
        const cells = rowCells(r);
        const t = cellNorm(cells[1]);
        const english = cellNorm(cells[4]);
        return english && (t === "單字" || t === "生字" || t === "");
      }),
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

function lessonFromHeaderLabel(label) {
  const parts = cellNorm(label).split(/\s+/).filter(Boolean);
  const i = parts[0] === "課次" ? 1 : 0;
  const book = parts[i];
  const unit = parts[i + 1];
  if (book && unit) return normalizeEnLesson(`${book} ${unit}`);
  return normalizeEnLesson(book || "TJ3 Unit21考試");
}

/** 第 1 列標題貼到同一格時，從欄位標題救回前面幾個單字 */
function recoverEnItemsFromBrokenColLabels(table) {
  const cols = table.cols || [];
  if (cols.length < 5) return [];

  const labels = cols.map((c) => cellNorm(c.label));
  const broken = labels.some((h) => h.split(/\s+/).length > 3);
  if (!broken) return [];

  const splitField = (text, skipFirst) => {
    const parts = cellNorm(text).split(/\s+/).filter(Boolean);
    return skipFirst && parts[0]?.length <= 4 ? parts.slice(1) : parts;
  };

  const chinese = splitField(labels[2], true);
  const english = splitField(labels[4], true);
  const hintsRaw = splitField(labels[3], labels[3]?.startsWith("提示"));
  const lesson = lessonFromHeaderLabel(labels[0]);

  const n = Math.min(chinese.length, english.length);
  const items = [];
  for (let i = 0; i < n; i++) {
    if (!chinese[i] || !english[i]) continue;
    items.push({
      lesson: normalizeEnLesson(lesson),
      type: "單字",
      chinese: chinese[i],
      hint: hintsRaw[i] || english[i],
      english: english[i],
    });
  }
  return items;
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

function enRowChineseAndHint(cells, idx, english) {
  let chinese = String(cells[idx.chinese] ?? "").trim();
  const hint = idx.hint >= 0 ? String(cells[idx.hint] ?? "").trim() : "";
  if (chinese) return { chinese, hint };

  const numPrefix = hint.match(/^(\d+)\s*[\/／]/);
  if (numPrefix) return { chinese: numPrefix[1], hint };

  const fromHint = hint
    .replace(/^\d+\s*/, "")
    .replace(/^\/(.+)\/$/, "$1")
    .trim();
  return { chinese: fromHint || english, hint };
}

function rowToEnItem(cells, idx) {
  const english = String(cells[idx.english] ?? "").trim();
  if (!english) return null;
  const { chinese, hint } = enRowChineseAndHint(cells, idx, english);
  if (!chinese) return null;
  return {
    lesson: normalizeEnLesson(cells[idx.lesson] ?? ""),
    type: cells[idx.type] ?? "",
    chinese,
    hint,
    english,
  };
}

function enItemDedupeKey(item) {
  return [
    normalizeEnLesson(item.lesson),
    String(item.chinese ?? "").trim(),
    String(item.english ?? "").trim(),
  ]
    .join("\t")
    .toLowerCase();
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
    const items = (data.enItems ?? []).map((item) =>
      item
        ? {
            ...item,
            lesson: normalizeEnLesson(item.lesson),
          }
        : item,
    );
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
    const addItem = (item) => {
      if (!item) return;
      const key = enItemDedupeKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        ...item,
        lesson: normalizeEnLesson(item.lesson),
      });
    };

    for (const row of recoverEnItemsFromBrokenColLabels(table)) {
      addItem(row);
    }
    for (const row of dataRows) {
      addItem(rowToEnItem(rowCells(row), idx));
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
    const aliases = enLessonFilterAliases(lessonFilter);
    pool =
      aliases.length > 1
        ? items.filter((i) => aliases.includes(i.lesson))
        : items.filter((i) => i.lesson === lessonFilter);
  }
  if (!pool.length) return [];

  const shuffled = shuffleArray([...pool]);
  const wantAll = !count || count <= 0 || count >= pool.length;
  const n = wantAll ? pool.length : count;
  return shuffled.slice(0, n);
}
