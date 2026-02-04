from fastapi import APIRouter
from pydantic import BaseModel
import subprocess
import json

router = APIRouter(prefix="/system", tags=["System"])

from typing import Optional

class SelectFolderResponse(BaseModel):
    path: Optional[str]

@router.post("/select-folder", response_model=SelectFolderResponse)
async def select_folder():
    """Open a system folder selection dialog."""
    try:
        # Python script to run in a separate process
        py_script = """
import tkinter as tk
from tkinter import filedialog
import sys

def select():
    root = tk.Tk()
    root.withdraw()  # Hide main window
    root.attributes('-topmost', True)  # Make sure dialog is on top
    
    path = filedialog.askdirectory(title="选择下载目录")
    if path:
        print(path, end='')
    
    root.destroy()

if __name__ == "__main__":
    select()
"""
        
        # Run python script
        import sys
        
        # Use simple creation flags to avoid console window flashing if possible
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        
        result = subprocess.run(
            [sys.executable, "-c", py_script],
            capture_output=True,
            text=True,
            startupinfo=startupinfo,
            check=False
        )
        
        path = result.stdout.strip()
        # On Windows path might be printed with \r\n, strip it
        path = path.replace('\r', '').replace('\n', '')
        
        return {"path": path if path else None}
        
    except Exception as e:
        return {"path": path if path else None}
        
    except Exception as e:
        return {"path": None}

@router.post("/select-file", response_model=SelectFolderResponse)
async def select_file():
    """Open a system file selection dialog."""
    try:
        py_script = """
import tkinter as tk
from tkinter import filedialog
import sys

def select():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    
    path = filedialog.askopenfilename(title="选择文件")
    if path:
        print(path, end='')
    
    root.destroy()

if __name__ == "__main__":
    select()
"""
        import sys
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        
        result = subprocess.run(
            [sys.executable, "-c", py_script],
            capture_output=True,
            text=True,
            startupinfo=startupinfo,
            check=False
        )
        
        path = result.stdout.strip()
        path = path.replace('\r', '').replace('\n', '')
        
        return {"path": path if path else None}
        
    except Exception as e:
        return {"path": None}

class OpenPathRequest(BaseModel):
    path: str

@router.post("/open-path")
async def open_path(req: OpenPathRequest):
    """Open a file or directory in the system file explorer."""
    import os
    import platform
    try:
        path = req.path
        if not os.path.exists(path):
            return {"success": False, "message": "Path does not exist"}
            
        if platform.system() == "Windows":
            os.startfile(path)
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.get("/compatibility")
async def get_compatibility():
    """Get system compatibility status (Windows dev mode, long paths)."""
    from ...utils.system import get_system_compatibility
    return get_system_compatibility()


class ToggleStartupRequest(BaseModel):
    enable: bool

@router.post("/toggle-startup")
async def toggle_startup(req: ToggleStartupRequest):
    """Enable or disable auto-start on Windows."""
    import os
    import sys
    import platform
    from pathlib import Path
    
    if platform.system() != "Windows":
        return {"success": False, "message": "Auto-start is currently only supported on Windows"}
        
    try:
        startup_dir = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
        shortcut_path = startup_dir / "HFManager.bat"
        
        if req.enable:
            # Create a simple batch file to start the app
            # Determine command to run
            if getattr(sys, 'frozen', False):
                # Packaged exe
                target = f'"{sys.executable}"'
                cwd = Path(sys.executable).parent
            else:
                # Dev mode (python)
                # Assumes running from project root
                # current api/routes/system.py -> ... -> src
                # We need the root directory.
                # Assuming sys.executable is the python interpreter
                # And we need to find main.py. 
                # Simplest is to assume the current working dir is correct if we launch from there.
                # But Startup folder launch won't have correct CWD.
                # We need ABSOLUTE paths.
                
                # Try to find src/hfmanager/main.py relative to this file
                # this file: src/hfmanager/api/routes/system.py
                project_root = Path(__file__).parent.parent.parent.parent.parent.absolute()
                # Actually, simpler: we are running inside the process.
                # Let's assume project root is the CWD of the current process?
                # Best effort:
                cwd = Path.cwd() 
                main_script = cwd / "src" / "hfmanager" / "main.py"
                if not main_script.exists():
                     # Fallback logic if CWD is wrong
                     return {"success": False, "message": "Could not locate main.py for startup"}
                     
                target = f'"{sys.executable}" "{main_script}"'

            # Create BAT file (hidden console?)
            # To hide console, we usually use vbs wrapper or pythonw.
            # For now, simple BAT.
            content = f'@echo off\ncd /d "{cwd}"\nstart "" {target}'
            
            with open(shortcut_path, 'w', encoding='utf-8') as f:
                f.write(content)
                
            return {"success": True, "message": "Auto-start enabled"}
        else:
            if shortcut_path.exists():
                shortcut_path.unlink()
            return {"success": True, "message": "Auto-start disabled"}
            
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.get("/check-update")
async def check_update():
    """Check for application updates."""
    import httpx
    try:
        url = "https://api.github.com/repos/happylinze/HuggingFace-Manager/releases/latest"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            
        if resp.status_code == 200:
            data = resp.json()
            latest_version = data.get("tag_name", "0.0.0").lstrip("v")
            current_version = "0.1.0" # TODO: get from PACKAGE_VERSION or similar
            
            # Simple version compare
            has_update = latest_version > current_version
            
            return {
                "has_update": has_update,
                "current_version": current_version,
                "latest_version": latest_version,
                "release_notes": data.get("body", "No description available."),
                "download_url": data.get("html_url", "")
            }
    except Exception:
        pass
        
    return {
        "has_update": False,
        "current_version": "0.1.0",
        "latest_version": "0.1.0",
        "release_notes": "Could not check for updates."
    }

@router.post("/clean-logs")
async def clean_logs():
    """Clean application logs."""
    from ...utils.config import get_config
    import shutil
    try:
        config = get_config()
        log_dir = config.config_dir / 'logs'
        
        if log_dir.exists():
            # Delete all files in log dir
            for item in log_dir.iterdir():
                if item.is_file():
                    try:
                        item.unlink()
                    except:
                        pass
        return {"success": True, "message": "Logs cleaned successfully"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.post("/open-logs-folder")
async def open_logs_folder():
    """Open the application logs folder."""
    from ...utils.config import get_config
    import os
    import platform
    
    try:
        config = get_config()
        log_dir = config.config_dir / 'logs'
        
        if not log_dir.exists():
            log_dir.mkdir(parents=True, exist_ok=True)
            
        path = str(log_dir)
        
        if platform.system() == "Windows":
            os.startfile(path)
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
            
        return {"success": True, "message": "Opened logs folder"}
    except Exception as e:
        return {"success": True, "message": str(e)}

@router.post("/window/restore")
async def restore_window():
    """Restore the desktop window (if running in desktop mode)."""
    try:
        from ...core.desktop import get_desktop_instance
        manager = get_desktop_instance()
        if manager:
            manager.restore_window()
            return {"status": "success", "message": "Window restored"}
        return {"status": "ignored", "message": "Not in desktop mode"}
    except ImportError:
        return {"status": "error", "message": "Desktop module not found"}
