@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo.
python serve-dev.py
if errorlevel 1 (
  echo.
  echo  改用 py 啟動...
  py serve-dev.py
)
if errorlevel 1 (
  echo.
  echo  找不到 Python。請安裝 Python 3 後再執行 start.bat
  echo  或手動: py serve-dev.py
)
pause
