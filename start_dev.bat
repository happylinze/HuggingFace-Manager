@echo off
echo Starting HFManager Development Environment...

set PYTHONPATH=%CD%\src

:: Start Backend in a new window
echo Starting Backend...
start "HFManager Backend" cmd /k "venv\Scripts\python.exe -m uvicorn hfmanager.api.main:app --host 127.0.0.1 --port 8000 --reload"

:: Start Frontend
echo Starting Frontend...
cd frontend
npm run dev

pause
