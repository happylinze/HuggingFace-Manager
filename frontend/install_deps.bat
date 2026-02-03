@echo off
echo ==========================================
echo      HFManager Dependency Installer
echo ==========================================
echo.
echo [1/3] Trying to activate Conda environment...

REM Try to activate 'base' environment using absolute path to conda.bat
call D:\Programs\conda\condabin\conda.bat activate base

echo.
echo [2/3] Checking for npm...
call npm --version
if %errorlevel% neq 0 (
    echo [WARNING] 'npm' command not found after activating 'base'.
    echo This means Node.js might be in another environment or not installed correctly.
    echo.
) else (
    echo [OK] npm found.
)

echo.
echo [3/3] Installing React specific packages...
echo Running: npm install react-markdown remark-gfm @tailwindcss/typography
echo.
call npm install react-markdown remark-gfm @tailwindcss/typography

if %errorlevel% neq 0 (
    echo.
    echo ==========================================
    echo [ERROR] Installation Failed!
    echo ==========================================
    echo Reason: The system still cannot find 'npm'.
    echo.
    echo SOLUTION:
    echo 1. Open Windows Start Menu.
    echo 2. Search for "Anaconda Prompt" and open it.
    echo 3. Type these commands:
    echo    cd %~dp0
    echo    npm install react-markdown remark-gfm @tailwindcss/typography
    echo.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo [SUCCESS] All dependencies installed!
echo ==========================================
echo You can now refresh the web page.
pause
