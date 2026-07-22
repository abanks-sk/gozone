@echo off
echo ============================================================
echo  GoZone — host build (downloads Maven, compiles all JARs)
echo ============================================================
powershell -ExecutionPolicy Bypass -File "%~dp0build-local.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo  BUILD FAILED — see error above.
    pause
    exit /b 1
)
echo.
echo  Done. Now run:  docker compose up --build
pause
