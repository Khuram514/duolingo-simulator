@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found. Install Node.js 20 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

set "APP_PORT=3000"
if exist .env (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /i "%%A"=="PORT" set "APP_PORT=%%B"
  )
) else (
  echo.
  echo No .env file was found. ScoreForge will run in Demo Bank mode.
  echo To enable AI, copy .env.example to .env and add your OpenRouter key.
  echo.
)

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%APP_PORT%"
echo Starting ScoreForge 130+ at http://localhost:%APP_PORT%
node server.mjs
if errorlevel 1 (
  echo.
  echo ScoreForge stopped with an error. Review the message above.
  pause
)
endlocal
