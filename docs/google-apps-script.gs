/**
 * 貼到「同一個」Google 試算表：擴充功能 → Apps Script
 *
 * 部署 → 新增部署作業 → 網頁應用程式
 *   執行身分：我
 *   存取權：任何人
 *
 * 產生的網址填到 js/config.site.js：
 *   SCORE_LOG_URL = "https://script.google.com/macros/s/...../exec"
 *
 * 第一次記錄成績會自動建立「成績」工作表。
 */
const SHEET_ZH = "國語";
const SHEET_SCORES = "成績";
const QUIZ_TYPES = ["生字"];

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  if (p.action === "logScore") {
    return appendScoreRow(p);
  }
  return loadZhJson();
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "logScore") {
      return appendScoreRow(data);
    }
    if (data.action === "handwritingVision") {
      return recognizeHandwritingVision(data);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
  return jsonOut({ ok: false, error: "unknown action" });
}

/**
 * Google Cloud Vision 手寫／文件 OCR（繁體）
 * 請在 Apps Script「專案設定 → 指令碼屬性」新增：
 *   VISION_API_KEY = 你的 API 金鑰
 * 並在 GCP 啟用 Cloud Vision API。每月約 1000 次 Document OCR 免費。
 */
function recognizeHandwritingVision(data) {
  const key = PropertiesService.getScriptProperties().getProperty("VISION_API_KEY");
  if (!key) {
    return jsonOut({
      ok: false,
      error: "未設定 VISION_API_KEY（Apps Script 指令碼屬性）",
    });
  }

  let b64 = String(data.imageBase64 || "");
  const marker = "base64,";
  const i = b64.indexOf(marker);
  if (i >= 0) b64 = b64.slice(i + marker.length);
  b64 = b64.replace(/\s/g, "");

  if (!b64) {
    return jsonOut({ ok: false, error: "empty image" });
  }

  const payload = {
    requests: [
      {
        image: { content: b64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
        imageContext: { languageHints: ["zh-TW", "zh-Hant"] },
      },
    ],
  };

  const url =
    "https://vision.googleapis.com/v1/images:annotate?key=" +
    encodeURIComponent(key);
  const resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(payload),
  });

  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code !== 200) {
    return jsonOut({ ok: false, error: "Vision HTTP " + code + ": " + body });
  }

  const json = JSON.parse(body);
  const first = json.responses && json.responses[0];
  if (!first) {
    return jsonOut({ ok: false, error: "empty Vision response" });
  }
  if (first.error && first.error.message) {
    return jsonOut({ ok: false, error: first.error.message });
  }

  let text = "";
  if (first.fullTextAnnotation && first.fullTextAnnotation.text) {
    text = String(first.fullTextAnnotation.text);
  } else if (first.textAnnotations && first.textAnnotations[0]) {
    text = String(first.textAnnotations[0].description || "");
  }

  text = text.replace(/\s/g, "").trim();
  return jsonOut({ ok: true, text: text });
}

function appendScoreRow(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SCORES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SCORES);
    sheet.appendRow([
      "時間",
      "小孩",
      "科目",
      "課次",
      "模式",
      "答對",
      "總題",
      "待確認",
    ]);
    sheet.setFrozenRows(1);
  }

  const tz = Session.getScriptTimeZone();
  let when = new Date();
  if (p.at) {
    const parsed = new Date(p.at);
    if (!isNaN(parsed.getTime())) when = parsed;
  }
  const timeStr = Utilities.formatDate(when, tz, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    timeStr,
    String(p.child || ""),
    String(p.subject || ""),
    String(p.lesson || "全部"),
    String(p.mode || ""),
    Number(p.correct) || 0,
    Number(p.total) || 0,
    Number(p.pending) || 0,
  ]);

  return jsonOut({ ok: true });
}

function loadZhJson() {
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
