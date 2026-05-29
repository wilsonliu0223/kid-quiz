/** GitHub Pages 用設定（會提交到倉庫） */
export const CONFIG = {
  SPREADSHEET_ID: "1CIkz0vH-Dp3xj9K3OUvXO_mfaFwq2-qzEJbQcIyWvPg",
  SHEETS_JSON_URL: "",

  /** 成績寫入：同一試算表部署的 Apps Script 網址（見 docs/google-apps-script.gs） */
  SCORE_LOG_URL:
    "https://script.google.com/macros/s/AKfycbxo0gTXgN_WEaZjhfgPpvMMG5sONKYAkqJCkVN_JLoZ1iq_eBVmD7cwYXRlHPqn_bkRiw/exec",
  SHEET_ZH: "國語",
  SHEET_EN: "英語",
  QUIZ_TYPES: ["生字"],
  QUIZ_TYPES_ZH: ["生字"],
  QUIZ_TYPES_EN: ["單字"],

  /** 首頁預設「本次題數」（可被使用者改過的選擇覆蓋） */
  QUIZ_COUNT_DEFAULT: 10,
  PARENT_PIN: "1234",
  CHILD_NAMES: {
    A: "思妘",
    B: "思妤",
  },
  /** PaddleOCR.js 圖像辨識（首次載入模型較久） */
  OCR_ENABLED: true,
  OCR_STRICT: false,
  /** 辨識前裁切放大（建議保持 true） */
  OCR_PREPROCESS: true,
  /** 只保留標準答案內的字元（減少辨成別字） */
  OCR_USE_WHITELIST: true,
  /** 裁切後最短邊像素（愈大愈準、略慢） */
  OCR_MIN_SIDE: 280,
  /** 手寫筆畫粗細 */
  OCR_STROKE_WIDTH: 6,
  /** 同音易混時四選一；明顯寫錯則直接答錯並記入錯題本 */
  HOMOPHONE_PICKER: true,

  /** 筆畫手寫辨識（hanzilookup-js 開源，首次會下載字庫） */
  HANZI_STROKE_ENABLED: true,
};
