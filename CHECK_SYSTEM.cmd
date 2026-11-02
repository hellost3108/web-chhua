@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo  CHUA LINH UNG ONLINE - Kiem tra he thong
echo ============================================================
echo.

echo [Node.js]
where node >nul 2>nul
if errorlevel 1 (
  echo   KHONG TIM THAY. Can cai Node.js 18+ ^(winget install OpenJS.NodeJS.LTS^)
) else (
  for /f "delims=" %%v in ('node -v') do echo   OK - %%v
)
echo.

echo [npm]
where npm >nul 2>nul
if errorlevel 1 (
  echo   KHONG TIM THAY ^(di kem Node.js - cai lai Node.js neu thieu^)
) else (
  for /f "delims=" %%v in ('npm -v') do echo   OK - %%v
)
echo.

echo [Git]
where git >nul 2>nul
if errorlevel 1 (
  echo   Khong tim thay ^(khong bat buoc de CHAY server, chi can khi can cap nhat source^)
) else (
  for /f "delims=" %%v in ('git --version') do echo   OK - %%v
)
echo.

echo [Python ^(cho ZeroTTS^)]
if exist ".venv\Scripts\python.exe" (
  for /f "delims=" %%v in ('".venv\Scripts\python.exe" --version') do echo   OK - venv: %%v
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo   Chua co .venv va khong tim thay Python he thong.
    echo   ZeroTTS se o trang thai "stopped" ^(cac tinh nang khac van hoat dong^).
    echo   Xem HUONG_DAN_CAI_DAT.md muc ZeroTTS neu muon bat giong doc.
  ) else (
    echo   Co Python he thong nhung CHUA co .venv rieng cho du an.
    echo   Xem HUONG_DAN_CAI_DAT.md muc ZeroTTS de tao .venv va cai "zerotts".
  )
)
echo.

echo [Thu muc du lieu / dependency]
if exist "node_modules" (echo   node_modules: CO) else (echo   node_modules: CHUA CO - chay "npm install")
if exist "data" (echo   data\: CO ^(du lieu Bang Vang Cong Duc^)) else (echo   data\: chua tao ^(se tu tao khi chay server lan dau^))
echo.

echo [Cong 3000]
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>nul
if errorlevel 1 (
  echo   TRONG - san sang de chay server.
) else (
  echo   DANG BI CHIEM boi tien trinh khac. Xem PID ben duoi:
  netstat -ano | findstr ":3000" | findstr "LISTENING"
  echo   -^> Dong tien trinh do, hoac chay server voi cong khac: set PORT=3001 ^&^& npm start
)
echo.

echo ============================================================
echo  Kiem tra hoan tat.
echo ============================================================
pause
