/**
 * 貼到 Google 試算表：擴充功能 → Apps Script
 * 部署：部署 → 新增部署作業 → 網頁應用程式
 *   執行身分：我
 *   存取權：任何人
 * 將產生的網址貼到 js/config.js 的 SHEETS_JSON_URL
 */
const SHEET_ZH = "國語";
const QUIZ_TYPES = ["生字"];

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ZH);
  if (!sheet) {
    return jsonOut({ error: "找不到工作表：" + SHEET_ZH });
  }
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return jsonOut({ items: [] });
  }
  const header = values[0].map(String);
  const idx = {
    lesson: colIndex(header, ["課次"]),
    type: colIndex(header, ["類型"]),
    word: colIndex(header, ["國字或詞", "國字", "字詞"]),
    zhuyin: colIndex(header, ["注音"]),
    sentence: colIndex(header, ["例句", "句子", "課文例句"]),
  };
  if (idx.word < 0 || idx.zhuyin < 0) {
    return jsonOut({ error: "缺少欄位：國字或詞、注音" });
  }
  const typeSet = new Set(QUIZ_TYPES);
  const items = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const type = String(row[idx.type] || "").trim();
    if (typeSet.size && !typeSet.has(type)) continue;
    const word = String(row[idx.word] || "").trim();
    const zhuyin = String(row[idx.zhuyin] || "").trim();
    if (!word || !zhuyin) continue;
    items.push({
      lesson: String(row[idx.lesson] || "").trim(),
      type,
      word,
      zhuyin,
      sentence: idx.sentence >= 0 ? String(row[idx.sentence] || "").trim() : "",
    });
  }
  return jsonOut({ items });
}

function colIndex(header, names) {
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i]).trim();
    if (names.indexOf(h) >= 0) return i;
  }
  return -1;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
