/** 複製為 config.js 並填入你的試算表 */
export const CONFIG = {
  /** Google 試算表 ID（網址 /d/ 與 /edit 之間那段） */
  SPREADSHEET_ID: "",

  /** 若已部署 Apps Script Web App，填完整網址（優先於 SPREADSHEET_ID） */
  SHEETS_JSON_URL: "",

  /** 國語工作表名稱 */
  SHEET_ZH: "國語",

  /** 只抽取「類型」欄為以下值的列 */
  QUIZ_TYPES: ["生字"],

  /** 家長 PIN（請改掉預設） */
  PARENT_PIN: "1234",

  CHILD_NAMES: {
    A: "思妘",
    B: "思妤",
  },

  /** 是否啟用手寫辨識（需載入 Tesseract，首次較慢） */
  OCR_ENABLED: true,

  /** 辨識與答案完全一致才算自動答對（建議保持 true） */
  OCR_STRICT: false,
};
