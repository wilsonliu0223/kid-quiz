# 家裡練習 10 題（國語 · 英語）

手機網頁：讀 Google 試算表 → 隨機 10 題 → 國語手寫國字、英語拼字 → 自動或家長確認。

## 試算表格式（工作表名稱：`國語`）

| 課次 | 類型 | 國字或詞 | 注音 | 例句（選填） |
|------|------|----------|------|----------------|
| 我的相簿 | 生字 | 搖晃 | ㄧㄠˊ ㄏㄨㄤˋ | 他在演講時，屋子突然【搖晃】起來。 |

**例句欄**：用全形括號 `【】` 包住要考的字，測驗時該處只顯示注音，其餘維持國字。  
例：`這本【厚厚】的剪貼簿` → 畫面顯示「這本 **ㄏㄡˋ ㄏㄡˋ** 的剪貼簿」。

- `類型` 為 `生字` 的列才會出題（可在 `js/config.site.js` 的 `QUIZ_TYPES_ZH` 修改）。

## 試算表格式（工作表名稱：`英語`）

| 課次 | 類型 | 中文 | 提示 | 英文 |
|------|------|------|------|------|
| 第1課 | 單字 | 貓 | /kæt/ | cat |

- `類型` 為 `單字` 的列才會出題（`QUIZ_TYPES_EN`）。
- **看中拼英**：顯示中文與提示，輸入英文。
- **聽音拼字**：自動朗讀英文，輸入拼字（需裝置支援語音合成）。
- 若沒有「英語」工作表或讀取失敗，會使用內建示範題庫。

## 線上網址（GitHub Pages）

推送後約 1～2 分鐘可用：

`https://【你的GitHub帳號】.github.io/kid-quiz/`

試算表須設 **知道連結者可檢視**。設定檔為 `js/config.site.js`（推送前可改 PIN）。

## 本機設定（選用）

1. 編輯 `js/config.site.js` 或複製 `config.example.js` → 本機 `config.js`（已忽略不上傳）。
2. 擇一連接試算表：
   - **A. 公開讀取**：試算表「知道連結者可檢視」，把 ID 填入 `SPREADSHEET_ID`。
   - **B. Apps Script（較私密）**：將 `docs/google-apps-script.gs` 貼到試算表腳本並部署網頁，網址填入 `SHEETS_JSON_URL`。
3. 修改 `PARENT_PIN`（家長確認用，預設 `1234`）。

## 放上 GitHub

可以。建議：

1. **倉庫設為 Private（私人）**  
   內含家庭用設定；若一定要 Public，請勿提交 `js/config.js`（已列入 `.gitignore`）。

2. **第一次推送前**  
   - 確認 `js/config.example.js` 在倉庫裡  
   - 本機保留 `js/config.js`（自己填 ID、PIN）  
   - 克隆的人：複製 `config.example.js` → `config.js` 再填

3. **用 GitHub Pages 當網址（選用）**  
   - 推送後：Repo → **Settings** → **Pages** → Source 選 **main**、資料夾 **/ (root)**  
   - 網址會像：`https://你的帳號.github.io/kid-quiz/`  
   - 試算表仍須 **知道連結者可檢視**（瀏覽器才能讀題庫）  
   - 手機、平板用同一個網址即可，不必開 `start.bat`（但公司電腦關機後仍要能連網）

4. **推送指令範例**（在專案資料夾）：

```powershell
cd $env:USERPROFILE\Projects\kid-quiz
git add .
git commit -m "初始版本：國語測驗 PWA"
# 先在 GitHub 網站建立空 repo kid-quiz，再：
git remote add origin https://github.com/你的帳號/kid-quiz.git
git branch -M main
git push -u origin main
```

## 本機預覽

需用 HTTP 伺服器（ES module 無法直接雙擊開檔）：

```powershell
cd $env:USERPROFILE\Projects\kid-quiz
python -m http.server 8787
```

手機與電腦同一 Wi‑Fi 時，用手機瀏覽器開：`http://【電腦IP】:8787`

## 操作

- **首頁**：選小孩 A/B、課次 → 點「國語」或「英語」。
- **國語**：看注音 → 手寫 → 送出。
- **英語**：選「看中拼英」或「聽音拼字」→ 輸入英文 → 送出。
- 答對自動下一題；否則「待家長確認」（小孩無法自己給分）。
- **家長區**：長按首頁標題約 0.8 秒 → 輸入 PIN → 處理待確認（看手寫圖 → 算對/算錯）。

## 注意

- 手寫辨識使用瀏覽器載入 Tesseract（繁體），首次較慢，辨識率受字跡影響。
- 未設定試算表時使用內建示範題庫（我的相簿 12 字）。
