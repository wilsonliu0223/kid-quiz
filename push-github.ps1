# 第一次推到 GitHub（會提示輸入你的 GitHub 使用者名稱）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$user = Read-Host "請輸入 GitHub 使用者名稱（網址 github.com/【這段】）"
if (-not $user.Trim()) {
  Write-Host "已取消。"
  exit 1
}

git branch -M main 2>$null

$remote = git remote get-url origin 2>$null
$url = "https://github.com/$user/kid-quiz.git"
if ($LASTEXITCODE -eq 0) {
  git remote set-url origin $url
} else {
  git remote add origin $url
}

Write-Host ""
Write-Host "正在推送到 $url ..."
git push -u origin main

Write-Host ""
Write-Host "完成！請到 GitHub 倉庫："
Write-Host "  Settings -> Pages -> Branch: main, folder: / (root) -> Save"
Write-Host ""
Write-Host "約 1～2 分鐘後手機開："
Write-Host "  https://$user.github.io/kid-quiz/"
Write-Host ""
