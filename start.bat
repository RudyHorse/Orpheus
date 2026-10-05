@echo off
chcp 65001 >nul
title MP3 to Text - App Launcher

echo ========================================
echo  Starting MP3 to Text App
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM ---- Backend virtual environment ----
if not exist "backend\venv\Scripts\python.exe" (
    echo [ERROR] Backend virtual environment not found.
    echo Please run:
    echo    cd backend
    echo    py -3.12 -m venv venv
    echo    venv\Scripts\activate
    echo    pip install -r requirements.txt
    pause
    exit /b 1
)

REM ---- Ensure required backend packages are installed ----
echo [0/3] Checking backend dependencies...
backend\venv\Scripts\python.exe -c "import accelerate" >nul 2>&1
if errorlevel 1 (
    echo   accelerate missing, installing requirements...
    backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install backend dependencies.
        pause
        exit /b 1
    )
)

REM ---- Frontend dependencies ----
if not exist "frontend\node_modules" (
    echo   Installing frontend dependencies...
    pushd "frontend"
    call npm install
    popd
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b 1
    )
)

REM ---- Start Backend ----
echo [1/3] Starting Backend server...
start "Backend" /D "%SCRIPT_DIR%backend" cmd /k "venv\Scripts\python.exe main.py"

REM Wait for backend to start
timeout /t 3 /nobreak >nul

REM ---- Start Frontend ----
echo [2/3] Starting Frontend server...
start "Frontend" /D "%SCRIPT_DIR%frontend" cmd /k "npm run dev"

echo.
echo ========================================
echo  App is starting...
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to open the app in your browser...
pause >nul

start http://localhost:5173
