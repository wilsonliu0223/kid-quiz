# 推到 GitHub Pages（約 5 分鐘）

本機已 `git commit` 完成。你只需建立 GitHub 倉庫並推送一次。

## 1. 建立倉庫

1. 開啟 https://github.com/new  
2. Repository name：`kid-quiz`  
3. 選 **Public** 或 **Private**（Pages 兩者皆可）  
4. **不要**勾選 Add README  
5. 按 **Create repository**

## 2. 推送（把 `你的帳號` 換成 GitHub 使用者名稱）

在 PowerShell：

```powershell
cd $env:USERPROFILE\Projects\kid-quiz
git branch -M main
git remote add origin https://github.com/你的帳號/kid-quiz.git
git push -u origin main
```

（若已加過 origin，改為：`git remote set-url origin https://github.com/你的帳號/kid-quiz.git`）

## 3. 開啟 GitHub Pages

1. 倉庫頁 → **Settings** → 左側 **Pages**  
2. **Build and deployment** → Source：**Deploy from a branch**  
3. Branch：**main**、資料夾：**/ (root)** → **Save**  
4. 等 1～2 分鐘，上方會出現綠色網址：

   `https://你的帳號.github.io/kid-quiz/`

## 4. 手機使用

- 在家、在公司，只要有網路，用瀏覽器開上面網址  
- 可「加入主畫面」當 App  
- **不必**再開公司電腦的 `start.bat`

## 5. 試算表

Google 試算表須：**共用 → 知道連結的使用者 → 檢視者**

## 6. 改 PIN（建議）

公開倉庫時請編輯 `js/config.site.js` 的 `PARENT_PIN`，再：

```powershell
git add js/config.site.js
git commit -m "更新家長 PIN"
git push
```
