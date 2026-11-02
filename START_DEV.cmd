@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo  CHUA LINH UNG ONLINE - Che do PHAT TRIEN (auto-reload)
echo ============================================================
echo.
echo [*] Server se TU DONG KHOI DONG LAI moi khi ban sua file server.js
echo     ^(dung "node --watch", khong can cai them cong cu nao^).
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js trong PATH. Chay START_NODEJS.cmd de xem huong dan cai dat.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [*] Chua thay node_modules, dang chay "npm install"...
  call npm install
)

echo [*] Dang khoi dong: http://localhost:3000  ^(Ctrl+C de dung^)
echo.
call npm run dev

pause
