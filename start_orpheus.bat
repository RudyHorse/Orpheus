@echo off
chcp 65001 >nul
title Orpheus - MP3 to Text

echo ========================================
echo  Starting Orpheus - MP3 to Text
echo ========================================
echo.

REM Get the directory where the script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Check if virtual environment exists
if not exist "backend\venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment not found.
    echo Please run: backend\venv\Scripts\activate.bat
    echo And: pip install -r backend\requirements.txt
    pause
    exit /b 1
)

REM Start Backend
echo [1/2] Starting Backend server...
start "Orpheus Backend" cmd /k "cd /d "%SCRIPT_DIR%backend" && venv\Scripts\python.exe main.py"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start Frontend
echo [2/2] Starting Frontend server...
start "Orpheus Frontend" cmd /k "cd /d "%SCRIPT_DIR%frontend" && npm run dev"

echo.
echo ========================================
echo  Orpheus is starting...
echo  Backend: http://localhost:8000
echo  Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to open browser...
pause >nul

start http://localhost:5173