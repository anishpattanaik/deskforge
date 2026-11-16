@echo off
rem DeskForge one-click launcher: double-click this file.
setlocal
cd /d "%~dp0"
set "VENV=%USERPROFILE%\.deskforge-venv"
set "PY=%VENV%\Scripts\python.exe"

if not exist "%PY%" (
  echo First run: creating the Python environment ^(takes a few minutes^)...
  python -m venv "%VENV%" || goto :fail
  "%PY%" -m pip install -r backend\requirements.txt || goto :fail
)

if not exist "frontend\dist\index.html" (
  echo First run: building the web app...
  pushd frontend
  call npm install || goto :fail
  call npm run build || goto :fail
  popd
)

if "%ANTHROPIC_API_KEY%"=="" call :ask_key

echo Starting DeskForge at http://localhost:8000   ^(close this window to stop it^)
echo The browser opens by itself once the server is ready ^(10-20 s^)...
rem Open the browser only when the server actually answers (CAD engine takes a while to load).
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest http://127.0.0.1:8000/api/health -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process 'http://localhost:8000'; break } catch { Start-Sleep -Seconds 1 } }"
"%PY%" -m uvicorn app.main:app --app-dir backend --port 8000
goto :eof

:ask_key
if exist "%USERPROFILE%\.deskforge-nokey" (
  echo Using the free local AI ^(Ollama^) - no API key set.
  goto :eof
)
echo.
echo  ------------------------------------------------------------------
echo   Optional: paste an Anthropic API key for the fastest, most accurate
echo   photo analysis ^(https://console.anthropic.com/settings/keys^).
echo.
echo   Or just press Enter to use the FREE local AI ^(Ollama^) instead.
echo   You won't be asked again. To add a key later:
echo     setx ANTHROPIC_API_KEY "sk-ant-..."
echo  ------------------------------------------------------------------
set "NEWKEY="
set /p "NEWKEY=API key (or Enter to skip): "
if "%NEWKEY%"=="" (
  type nul > "%USERPROFILE%\.deskforge-nokey"
  echo Using the free local AI ^(Ollama^).
  goto :eof
)
if /i not "%NEWKEY:~0,7%"=="sk-ant-" (
  echo That doesn't look like an Anthropic key ^(they start with sk-ant-^). Using the free local AI.
  goto :eof
)
rem Save it for this window AND for every future launch.
set "ANTHROPIC_API_KEY=%NEWKEY%"
setx ANTHROPIC_API_KEY "%NEWKEY%" >nul
set "NEWKEY="
echo Key saved - you won't be asked again. Live photo analysis is ON.
echo.
goto :eof

:fail
echo.
echo Setup failed - see the messages above.
pause
