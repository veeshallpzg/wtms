@echo off
title WTMS Installer Builder
color 0A

:: ── Require Administrator ────────────────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  Requesting administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%CD%\" && \"%~f0\"' -Verb RunAs -Wait"
    exit /b
)

echo.
echo  ============================================
echo   WTMS - Installer Builder  ^(Administrator^)
echo  ============================================
echo.

:: ── Node.js check ────────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found. Download from https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  Node.js %NODE_VER% detected.
echo.

:: ── Assets / Icon ────────────────────────────────────────────────────────────
if not exist "assets" mkdir assets

if not exist "assets\icon.ico" (
    if exist "assets\icon.png" (
        echo  [NOTE] No icon.ico found. Using icon.png.
        echo  For a proper Windows icon, convert assets\icon.png to assets\icon.ico
        echo  at https://icoconvert.com and re-run this build.
        echo.
    ) else (
        if exist "public\images\Logo_blue.png" (
            copy /y "public\images\Logo_blue.png" "assets\icon.png" >nul
            echo  [NOTE] Copied logo as icon.png. Replace with icon.ico for best results.
        )
    )
)

:: ── Install dependencies ──────────────────────────────────────────────────────
echo  [1/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo  [ERROR] npm install failed.
    pause & exit /b 1
)
echo  Done.
echo.

:: ── Build ─────────────────────────────────────────────────────────────────────
echo  [2/3] Building installer (this takes 1-3 minutes)...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Build failed. See output above.
    echo.
    echo  Common fixes:
    echo    - Make sure you are running as Administrator (this script does it automatically)
    echo    - Or enable Developer Mode: Settings ^> Privacy ^& Security ^> Developer Mode
    pause & exit /b 1
)

:: ── Done ──────────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo   SUCCESS! Installer is ready in dist\
echo  ============================================
echo.

if exist "dist\" (
    echo  [3/3] Opening dist folder...
    explorer dist
)

pause