@echo off
echo ==========================================
echo   HFManager Local Build Script
echo ==========================================

echo.
echo 1. Building Frontend...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed!
    pause
    exit /b %errorlevel%
)
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo 2. Building Backend (PyInstaller)...
call venv\Scripts\activate.bat
pyinstaller build.spec --noconfirm --clean
if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller build failed!
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo   Build Complete!
echo   Executable is in: dist\HuggingFace-Manager.exe
echo ==========================================
pause
