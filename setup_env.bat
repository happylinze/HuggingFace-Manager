@echo off
echo ==========================================
echo   HFManager Open-Source Setup Script
echo ==========================================

echo.
echo 1. Creating Python Virtual Environment (venv)...
python -m venv venv
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create venv. Make sure Python is installed.
    pause
    exit /b %errorlevel%
)

echo.
echo 2. Installing Backend Dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    pause
    exit /b %errorlevel%
)

echo.
echo 3. Installing Frontend Dependencies...
cd frontend
npm install
if %errorlevel% neq 0 (
    echo [WARNING] npm install failed. Make sure Node.js is installed.
)
cd ..

echo.
echo ==========================================
echo   Setup Complete! Use start_dev.bat to run.
echo ==========================================
pause
