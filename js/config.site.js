/** GitHub Pages 用設定（會提交到倉庫） */
export const CONFIG = {
  SPREADSHEET_ID: "1CIkz0vH-Dp3xj9K3OUvXO_mfaFwq2-qzEJbQcIyWvPg",
  SHEETS_JSON_URL: "",

  /** 成績寫入：同一試算表部署的 Apps Script 網址（見 docs/google-apps-script.gs） */
  SCORE_LOG_URL:
    "https://script.google.com/macros/s/AKfycbxN6aEpUGLWHY8WaoxWWIqFHqMwDa0RyAmuf_xldWR1/exec",
  SHEET_ZH: "國語",
  SHEET_EN: "英語",
  QUIZ_TYPES: ["生字"],
  QUIZ_TYPES_ZH: ["生字"],
  QUIZ_TYPES_EN: ["單字"],
  PARENT_PIN: "1234",
  CHILD_NAMES: {
    A: "思妘",
    B: "思妤",
  },
  OCR_ENABLED: true,
  OCR_STRICT: false,
};
