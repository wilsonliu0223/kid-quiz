# Firebase 設定教學（兩台手機五子棋連線）

本教學說明如何用 **Google 帳號** 在 Firebase 建立免費專案，讓 kid-quiz 的「兩台手機」五子棋可以透過房間碼連線對戰。

> **重要區分**
>
> - **家長設定 Firebase**：需要登入 **Google 帳號**（建議用你平常管理 GitHub 的那個）。
> - **小孩玩遊戲**：**不需要**登入 Google，App 會在背景用 Firebase「匿名登入」連線。

預估費用：家庭休閒用量在 Firebase **Spark（免費）** 方案內，通常 **$0**。

---

## 事前準備

1. 可上網的電腦（Windows / Mac 皆可）
2. 一個 **Google 帳號**（Gmail）
3. 本專案已 clone 或可在 GitHub 編輯：`kid-quiz`
4. 網站部署在 GitHub Pages：`https://wilsonliu0223.github.io/kid-quiz/`

---

## 第一步：用 Google 帳號登入 Firebase

1. 開啟瀏覽器，前往 [Firebase 主控台](https://console.firebase.google.com/)
2. 若尚未登入，畫面會要求 **Sign in with Google**
3. 選擇你要用來管理此專案的 Google 帳號並登入
4. 第一次使用可能會問是否同意 Firebase 服務條款，按 **同意 / Accept**

---

## 第二步：建立 Firebase 專案

1. 在主控台首頁按 **建立專案**（或 **Add project**）
2. **專案名稱**：例如 `kid-quiz-online`（可自訂，僅供辨識）
3. 若詢問是否啟用 Google Analytics：
   - 可選 **不啟用**（此功能不需要 Analytics）
4. 按 **建立專案**，等待約 10～30 秒
5. 完成後按 **繼續** 進入專案總覽

請記下畫面上顯示的 **專案 ID**（例如 `kid-quiz-online-a1b2c`），稍後會用到。

---

## 第三步：建立 Realtime Database（即時資料庫）

兩台手機同步棋局，資料存在 **Realtime Database**。

1. 左側選單點 **Build** → **Realtime Database**
2. 按 **建立資料庫**（Create Database）
3. **位置**：選離台灣較近的區域（例如 `asia-southeast1` 新加坡，或 `us-central1` 亦可）
4. **安全性規則**：第一次會問要用哪種模式
   - 先選 **以測試模式啟動**（方便稍後改成我們提供的規則）
5. 按 **啟用**

建立完成後，頁面上方會顯示資料庫網址，格式類似：

```text
https://kid-quiz-online-a1b2c-default-rtdb.asia-southeast1.firebasedatabase.app
```

這就是 **`databaseURL`**，請複製保存。

---

## 第四步：啟用「匿名登入」（Anonymous Authentication）

App 不會要求小孩輸入 Google 帳密，而是用 Firebase 的 **匿名登入** 取得一組臨時 UID。

1. 左側選單 **Build** → **Authentication**
2. 若第一次進入，按 **開始使用**（Get started）
3. 上方分頁選 **Sign-in method**（登入方式）
4. 在清單中找到 **匿名**（Anonymous）
5. 點進去 → 將 **啟用** 打開 → **儲存**

---

## 第五步：註冊 Web App 並取得設定物件

1. 回到專案總覽（點左上角專案名稱旁的齒輪 → **專案設定** Project settings）
2. 捲到 **您的應用程式**（Your apps）
3. 若還沒有 Web App，點 **`</>`**（Web）圖示新增
4. **應用程式暱稱**：例如 `kid-quiz-web`
5. **Firebase Hosting** 可不必勾選（我們用 GitHub Pages）
6. 按 **註冊應用程式**
7. 畫面會顯示一段 `firebaseConfig`，類似：

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "kid-quiz-online-a1b2c.firebaseapp.com",
  databaseURL: "https://kid-quiz-online-a1b2c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kid-quiz-online-a1b2c",
  storageBucket: "kid-quiz-online-a1b2c.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456",
};
```

8. 把這些值複製下來（**apiKey 可公開在靜態網站**，真正安全靠資料庫規則；仍建議不要外流到無關專案）

---

## 第六步：貼到 `js/config.site.js`

在本機或 GitHub 編輯器開啟：

`js/config.site.js`

找到 `FIREBASE` 區塊，填入剛才的值（字串保留雙引號）：

```javascript
FIREBASE: {
  apiKey: "AIza...",
  authDomain: "kid-quiz-online-a1b2c.firebaseapp.com",
  databaseURL: "https://kid-quiz-online-a1b2c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kid-quiz-online-a1b2c",
  storageBucket: "kid-quiz-online-a1b2c.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456",
},
```

儲存後 **commit 並 push 到 `main`**，等 GitHub Actions 部署完成（約 1～2 分鐘）。

---

## 第七步：設定資料庫安全規則

測試模式規則過幾天會過期，請改成專案內的規則檔。

1. Firebase 主控台 → **Realtime Database** → 分頁 **規則**（Rules）
2. 開啟本專案檔案 `firebase-database.rules.json`，內容為：

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

3. 把上述 JSON **整段貼上** Firebase 規則編輯器（覆蓋舊內容）
4. 按 **發布**（Publish）

含義簡述：

- 只有已登入（含匿名）的使用者能讀寫 `rooms` 下的房間資料
- 未登入的訪客無法存取

---

## 第八步：在網站上測試

1. 開啟 https://wilsonliu0223.github.io/kid-quiz/
2. 強制重新整理：**Ctrl + Shift + R**（清除快取）
3. 首頁選「誰在練習」→ 雙人對戰 → **五子棋**
4. 選 **兩台手機（房間碼連線）**
   - 若仍顯示「尚未設定 Firebase」，代表 `config.site.js` 尚未部署或欄位有空值
5. **手機 A**：建立房間 → 記下 4 碼房間碼
6. **手機 B**：加入房間 → 輸入相同房間碼
7. 雙方按 **我準備好了** → 房主選誰執黑 → 開始下棋

可在 Firebase 主控台 → Realtime Database → **資料** 分頁，即時看到 `rooms/1234` 等節點。

---

## 常見問題

### 按「兩台手機」仍說未設定 Firebase

- 確認 `config.site.js` 的 `FIREBASE` 七個欄位都已填、沒有多餘逗號錯誤
- 確認已 push 到 `main` 且 GitHub Pages 已更新
- 瀏覽器 **Ctrl+Shift+R** 強制重新整理

### 建立房間失敗 / 權限被拒（PERMISSION_DENIED）

- 確認 **匿名登入** 已啟用（第四步）
- 確認 **資料庫規則** 已發布（第七步）
- 開啟瀏覽器開發者工具（F12）→ Console 查看錯誤訊息

### 房間碼找不到

- 房間約 **1 小時** 後過期，請重新建立
- 確認兩台裝置輸入的 4 碼完全相同

### 需要授權網域嗎？

Firebase Auth 預設允許 `localhost` 與你註冊時的網域。若使用自訂網域，到 **Authentication** → **Settings** → **Authorized domains** 加入該網域。

GitHub Pages 網域 `wilsonliu0223.github.io` 一般可直接使用。

### 小孩要登入 Google 嗎？

**不用。** 只有家長在 Firebase 主控台設定時需要 Google 帳號。

---

## 費用與用量

- Firebase **Spark 免費方案** 對家庭五子棋連線通常足夠
- 可在 [Firebase 用量與帳單](https://console.firebase.google.com/project/_/usage) 查看
- 若將來用量變大，主控台會寄信通知；可再評估是否升級

---

## 相關程式檔案

| 檔案 | 說明 |
|------|------|
| `js/config.site.js` | `FIREBASE` 設定（你要填寫的） |
| `js/firebase-app.js` | 初始化與匿名登入 |
| `js/room-service.js` | 建房、加入、等候室 |
| `js/gomoku-online.js` | 線上五子棋同步 |
| `firebase-database.rules.json` | 資料庫規則範本 |

---

## 完成檢查清單

- [ ] 用 Google 帳號建立 Firebase 專案
- [ ] 建立 Realtime Database
- [ ] 啟用 Anonymous 匿名登入
- [ ] 註冊 Web App，複製 `firebaseConfig`
- [ ] 貼到 `js/config.site.js` 並 push
- [ ] 發布 `firebase-database.rules.json` 規則
- [ ] 兩台手機實測建房、加入、下棋

完成後即可讓孩子用房間碼在不同手機上對戰五子棋。
