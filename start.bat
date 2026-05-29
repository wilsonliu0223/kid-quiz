@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo  Kid Quiz - local server
echo  Open in browser:  http://localhost:8787
echo  On phone (same WiFi):  http://YOUR_PC_IP:8787
echo.
echo  Press Ctrl+C to stop.
echo.
python -m http.server 8787
if errorlevel 1 (
  echo.
  echo  Python not found. Try: py -m http.server 8787
  py -m http.server 8787
)
pause
