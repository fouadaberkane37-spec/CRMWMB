@echo off
echo ===============================
echo   Self-Hosted CRM - Starting
echo ===============================

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://python.org
    pause
    exit /b 1
)

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Backend setup
echo.
echo [1/4] Setting up backend...
cd backend
if not exist venv (
    python -m venv venv
)
call venv\Scripts\activate
pip install -r requirements.txt -q
echo Backend ready.

:: Start backend in background
echo [2/4] Starting backend (port 8000)...
start "CRM Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && python -m uvicorn main:app --reload --port 8000"

:: Frontend setup
echo.
echo [3/4] Setting up frontend...
cd ..\frontend
if not exist node_modules (
    echo Installing frontend dependencies (first run only)...
    npm install
)
echo Frontend ready.

:: Start frontend
echo [4/4] Starting frontend (port 5173)...
echo.
echo ===============================
echo   CRM is starting!
echo   Open: http://localhost:5173
echo   Login: admin / admin123
echo ===============================
echo.
start "CRM Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Open browser after a short delay
timeout /t 4 /nobreak >nul
start http://localhost:5173
