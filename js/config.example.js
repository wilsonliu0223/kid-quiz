/** 複製為 config.js 並填入你的試算表 */
export const CONFIG = {
  /** Google 試算表 ID（網址 /d/ 與 /edit 之間那段） */
  SPREADSHEET_ID: "",

  /** 若已部署 Apps Script Web App，填完整網址（優先於 SPREADSHEET_ID） */
  SHEETS_JSON_URL: "",

  /** 成績寫入（與試算表綁定的 Apps Script 部署 URL，見 docs/google-apps-script.gs） */
  SCORE_LOG_URL: "",

  /** 國語工作表名稱 */
  SHEET_ZH: "國語",

  /** 只抽取「類型」欄為以下值的列 */
  QUIZ_TYPES: ["生字"],

  QUIZ_COUNT_DEFAULT: 10,

  /** 家長 PIN（請改掉預設） */
  PARENT_PIN: "1234",

  CHILD_NAMES: {
    A: "思妘",
    B: "思妤",
  },

  /** 是否啟用手寫辨識（需載入 Tesseract，首次較慢） */
  OCR_ENABLED: true,

  /** 辨識與答案完全一致才算自動答對（false 時較寬鬆） */
  OCR_STRICT: false,

  OCR_PREPROCESS: true,
  OCR_USE_WHITELIST: true,
  OCR_MIN_SIDE: 280,
  OCR_STROKE_WIDTH: 6,
};
