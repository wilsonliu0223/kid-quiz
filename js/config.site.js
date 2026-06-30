/** GitHub Pages 用設定（會提交到倉庫） */
export const CONFIG = {
  /** 首頁標題旁小字版本（每次推送更新請遞增，例：34.0 → 34.1） */
  APP_VERSION: "39.24",

  /**
   * 涅槃 Rapfi 完整 NNUE 權重（約 40 MB）公開下載網址。
   * 留空則用站內 engines/rapfi/full/rapfi.data（與 GitHub Pages 同源）。
   * 若改放 Firebase Storage 等雲端，貼上 https://... 公開連結即可。
   */
  RAPFI_NNUE_DATA_URL: "",
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
  /** 雙字以上用白名單；單字另見 OCR_WHITELIST_SINGLE_CHAR */
  OCR_USE_WHITELIST: true,
  /** false：單字不刪 OCR 結果（「要」等較不易被洗成空白） */
  OCR_WHITELIST_SINGLE_CHAR: false,
  /** 裁切後最短邊像素（愈大愈準、略慢） */
  OCR_MIN_SIDE: 280,
  OCR_LENIENT_MIN_SIDE: 340,
  /** 手寫阿拉伯數字（九九乘法） */
  OCR_NUMERIC_MIN_SIDE: 400,
  OCR_NUMERIC_SINGLE_MIN_SIDE: 480,
  OCR_NUMERIC_CROP_PADDING: 0.28,
  /** 手寫筆畫粗細 */
  OCR_STROKE_WIDTH: 6,
  /** 同音易混時四選一；明顯寫錯則直接答錯並記入錯題本 */
  HOMOPHONE_PICKER: true,

  /** 筆畫手寫辨識（hanzilookup-js 開源，首次會下載字庫） */
  HANZI_STROKE_ENABLED: true,
  /** 筆畫候選前幾名內有標準答案即算寫對（減少 OCR 誤判） */
  STROKE_TRUST_TOP_N: 8,
  /** 特別容易誤判的單字（可再加） */
  STROKE_EXTRA_LENIENT_CHARS: ["要", "在"],
  STROKE_EXTRA_LENIENT_TOP_N: 12,

  /** 答錯複寫：HanziWriter 疊在手寫格底層（opacity 約 0.32） */
  STROKE_ORDER_ENABLED: true,
  STROKE_ORDER_DELAY: 500,

  /**
   * Firebase 兩台手機對戰（見 docs/firebase-setup.md）
   * 未填寫時「兩台手機」會顯示設定教學。
   */
  FIREBASE: {
    apiKey: "AIzaSyCt1caYzi7PDeTXEvcES6Sct9q6Lffs2Kk",
    authDomain: "kid-quiz-online.firebaseapp.com",
    databaseURL:
      "https://kid-quiz-online-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "kid-quiz-online",
    storageBucket: "kid-quiz-online.firebasestorage.app",
    messagingSenderId: "677976319036",
    appId: "1:677976319036:web:f8f9b0bef1dc877b5acf39",
  },
};
