@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo  CHUA LINH UNG ONLINE - Khoi dong Server (Node.js)
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js trong PATH.
  echo Hay cai Node.js ^(khuyen nghi qua winget: winget install OpenJS.NodeJS.LTS^)
  echo roi mo lai Terminal/CMD moi va chay lai file nay.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [*] Chua thay thu muc node_modules, dang chay "npm install"...
  call npm install
  if errorlevel 1 (
    echo [LOI] npm install that bai. Xem log phia tren de biet nguyen nhan.
    pause
    exit /b 1
  )
)

if exist ".venv\Scripts\python.exe" (
  echo [OK] Da phat hien moi truong Python ZeroTTS ^(.venv^) - giong doc se duoc kich hoat.
) else (
  echo [!] Khong thay .venv - ZeroTTS se o trang thai "stopped", cac tinh nang khac van hoat dong binh thuong.
  echo     Xem HUONG_DAN_CAI_DAT.md muc ZeroTTS neu muon bat giong doc.
)

echo.
echo [*] Dang khoi dong server tai http://localhost:3000
echo [*] Dashboard Admin   : http://localhost:3000/admin
echo [*] OBS Browser Source: http://localhost:3000/?obs=1
echo [*] Nhan Ctrl+C de dung server an toan ^(se tu luu du lieu truoc khi thoat^).
echo.

call npm start

echo.
echo [*] Server da dung.
pause
