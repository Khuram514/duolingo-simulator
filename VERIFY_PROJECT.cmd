@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required.
  pause
  exit /b 1
)
call npm run verify
if errorlevel 1 goto :failed
echo.
echo All ScoreForge checks passed.
echo.
pause
exit /b 0
:failed
echo.
echo One or more checks failed. Review the output above.
echo.
pause
exit /b 1
