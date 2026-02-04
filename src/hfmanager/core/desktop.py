"""
Desktop Manager for Hugging Face Manager.
Handles:
1. Single Instance Locking
2. System Tray (pystray)
3. Native Window (pywebview)
4. Background Server Management
"""
import os
import sys
import json
import time
import socket
import logging
import threading
import requests
import signal
import psutil
from pathlib import Path
from typing import Optional, Dict

try:
    import webview
    import pystray
    from PIL import Image
except ImportError:
    # Fallback/Mock for dev environment if libs missing (though user should have them)
    webview = None
    pystray = None
    Image = None

logger = logging.getLogger("hfmanager-desktop")

class DesktopManager:
    APP_NAME = "HuggingFaceManager"
    LOCK_FILE_NAME = "app.lock"
    
    def __init__(self, app_instance, host="127.0.0.1", port=8000):
        self.app = app_instance # FastAPI app
        self.host = host
        self.port = port
        self.window = None
        self.tray_icon = None
        self.lock_file = self._get_lock_file_path()
        self.server_thread = None
        self.tray_thread = None
        self.should_exit = False

    def _get_lock_file_path(self) -> Path:
        """Get path to lock file in APPDATA."""
        if os.name == 'nt':
            app_data = os.getenv('APPDATA')
        else:
            app_data = os.path.expanduser("~/.config")
            
        base_dir = Path(app_data) / self.APP_NAME
        base_dir.mkdir(parents=True, exist_ok=True)
        return base_dir / self.LOCK_FILE_NAME

    def _is_process_running(self, pid: int) -> bool:
        """Check if a process with valid PID is running."""
        try:
            return psutil.pid_exists(pid)
        except:
            return False

    def check_single_instance(self) -> bool:
        """
        Check if another instance is running.
        If yes, notify it to restore window and return False (should exit).
        If no, create lock and return True.
        """
        if self.lock_file.exists():
            try:
                with open(self.lock_file, 'r') as f:
                    data = json.load(f)
                    pid = data.get('pid')
                    port = data.get('port')
                    
                if self._is_process_running(pid):
                    logger.info(f"Found existing instance (PID {pid})")
                    # Try to notify it
                    try:
                        requests.post(f"http://127.0.0.1:{port}/api/system/window/restore", timeout=1)
                        logger.info("Notified existing instance to restore window.")
                        return False # Exit
                    except Exception as e:
                        logger.warning(f"Failed to contact existing instance: {e}. Assuming zombie.")
                        # Proceed to overwrite lock
                else:
                    logger.info("Found stale lock file (Process dead). Cleaning up.")
            except Exception as e:
                logger.warning(f"Error reading lock file: {e}")
        
        # Create Lock
        self._create_lock()
        return True

    def _create_lock(self):
        """Write current PID and Port to lock file."""
        try:
            data = {"pid": os.getpid(), "port": self.port}
            with open(self.lock_file, 'w') as f:
                json.dump(data, f)
            # Register cleanup
            import atexit
            atexit.register(self._remove_lock)
        except Exception as e:
            logger.error(f"Failed to create lock file: {e}")

    def _remove_lock(self):
        """Remove lock file on exit."""
        try:
            if self.lock_file.exists():
                # Verify it's OUR lock before deleting (prevent race condition if possible)
                with open(self.lock_file, 'r') as f:
                    data = json.load(f)
                if data.get('pid') == os.getpid():
                    os.remove(self.lock_file)
        except:
            pass

    def run(self):
        """Main entry point to run the desktop app."""
        if not webview or not pystray:
            logger.error("Required desktop libraries (pywebview, pystray) not found.")
            return

        # 1. Start Server in Background
        import uvicorn
        def run_server():
            # Disable Uvicorn default signal handling to prevent it from killing main thread
            config = uvicorn.Config(self.app, host=self.host, port=self.port, log_config=None)
            server = uvicorn.Server(config)
            # Override signal handlers? Uvicorn does this automatically.
            # We run it in thread, so it shouldn't capture Ctrl+C from main thread easily?
            server.run()

        self.server_thread = threading.Thread(target=run_server, daemon=True)
        self.server_thread.start()
        
        # Wait for server
        time.sleep(1.0) # Grace period

        # 2. Start System Tray in Background
        self.tray_thread = threading.Thread(target=self._run_tray, daemon=True)
        self.tray_thread.start()

        # 3. Start Window (Main Thread)
        self._run_window()

    def _get_tray_menu(self, lang="en"):
        """Get Menu based on language."""
        # Handle variants like zh_CN, zh_TW
        is_zh = lang.startswith('zh') if lang else False
        
        if is_zh:
             return (
                pystray.MenuItem("打开主界面 (Open)", self.restore_window, default=True),
                pystray.MenuItem("重启应用 (Restart)", self.restart_app),
                pystray.MenuItem("退出 (Exit)", self.quit_app)
            )
        else:
            return (
                pystray.MenuItem("Open Main Window", self.restore_window, default=True),
                pystray.MenuItem("Restart Application", self.restart_app),
                pystray.MenuItem("Exit", self.quit_app)
            )

    def set_language(self, lang: str):
        """Update Tray Language."""
        if not self.tray_icon:
            logger.warning("Tray icon not initialized, cannot set language.")
            return
            
        logger.info(f"Updating Tray Language to {lang}")
        try:
            # Update Menu
            self.tray_icon.menu = pystray.Menu(*self._get_tray_menu(lang))
            # On some platforms/versions, we might need to tell pystray to refresh?
            # Actually pystray is quite implicit about this.
        except Exception as e:
            logger.error(f"Failed to update tray menu: {e}")

    def _run_tray(self):
        """Run System Tray icon."""
        try:
            # Locate Icon
            icon_path = self._get_icon_path()
            if not icon_path or not icon_path.exists():
                logger.warning("Tray icon not found.")
                # We can still run without icon on some platforms, but pystray usually needs it
                return

            image = Image.open(icon_path)
            
            # Get initial language
            from ..utils.config import get_config
            lang = get_config().get('language', 'en')
            logger.info(f"Starting Tray Icon with language: {lang}")

            menu = self._get_tray_menu(lang)
            self.tray_icon = pystray.Icon("hfmanager", image, "Hugging Face Manager", menu)
            self.tray_icon.run()
        except Exception as e:
            logger.error(f"Tray Error: {e}", exc_info=True)

    def restart_app(self, *args):
        """Restart the application. *args for pystray callback compatibility."""
        logger.info("Restarting application...")
        
        # Cleanup first
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except:
                pass
        
        if self.window:
             try:
                self.window.destroy()
             except:
                pass
             
        # Remove lock explicitly just in case atexit doesn't fire on exec
        self._remove_lock()

        # Restart
        import subprocess
        try:
            cmd = [sys.executable] + sys.argv[1:]
            subprocess.Popen(cmd)
            os._exit(0) # Cleaner exit for GUI apps sometimes than sys.exit
        except Exception as e:
            logger.error(f"Failed to restart: {e}")
            sys.exit(1)

    def _get_icon_path(self) -> Path:
        """Resolve icon path."""
        # Check assets/icon.png
        # Handle PyInstaller
        if getattr(sys, 'frozen', False):
            base_path = Path(sys._MEIPASS)
        else:
            base_path = Path(__file__).parent.parent.parent.parent # Root
            
        potential_paths = [
            base_path / "assets" / "icon.png",
            base_path / "assets" / "icon.ico",
            Path("assets/icon.png"), # Relative to CWD
        ]
        
        for p in potential_paths:
            if p.exists():
                return p
        return None

    def _run_window(self):
        """Start pywebview window."""
        self.window = webview.create_window(
            title="Hugging Face Manager",
            url=f"http://{self.host}:{self.port}",
            width=1400,
            height=900,
            resizable=True,
            min_size=(800, 600)
        )
        
        # Intercept closing event
        self.window.events.closing += self._on_closing
        
        # Start (Blocking)
        webview.start(debug=False)

    def _on_closing(self):
        """
        Handle window closing event.
        Returns False to prevent closing (minimize to tray), True to allow.
        """
        if self.should_exit:
            return True
            
        # Minimize to tray
        self.window.hide()
        return False

    def restore_window(self, *args):
        """Restore and focus the window. *args for pystray callback compatibility."""
        if self.window:
            try:
                # pywebview methods should be called from main thread or are thread-safe 
                # depending on the GUI loop. For WinForms/EdgeChromium, usually thread-safe.
                self.window.restore()
                self.window.show()
                self.window.focus()
            except Exception as e:
                logger.error(f"Failed to restore window: {e}")
            
    def set_window_theme(self, is_dark: bool):
        """Set Windows Title Bar Theme (Dark/Light)."""
        if os.name != 'nt' or not self.window:
            return

        try:
            import ctypes
            from ctypes import c_int, byref
            
            # Constants
            DWMWA_USE_IMMERSIVE_DARK_MODE = 20
            
            # Search logic for HWND
            target_hwnd = 0
            
            def find_window_callback(h, ctx):
                length = ctypes.windll.user32.GetWindowTextLengthW(h)
                buff = ctypes.create_unicode_buffer(length + 1)
                ctypes.windll.user32.GetWindowTextW(h, buff, length + 1)
                if "Hugging Face Manager" in buff.value:
                    ctx.append(h)
                return True
                
            EnumWindows = ctypes.windll.user32.EnumWindows
            EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.py_object)
            
            handles = []
            EnumWindows(EnumWindowsProc(find_window_callback), handles)
            
            if handles:
                # Pick the one that belongs to our PID
                my_pid = os.getpid()
                for h in handles:
                    pid = ctypes.c_ulong()
                    ctypes.windll.user32.GetWindowThreadProcessId(h, byref(pid))
                    if pid.value == my_pid:
                        target_hwnd = h
                        break
            
            if target_hwnd:
                value = c_int(1 if is_dark else 0)
                ctypes.windll.dwmapi.DwmSetWindowAttribute(
                    target_hwnd, 
                    DWMWA_USE_IMMERSIVE_DARK_MODE, 
                    byref(value), 
                    ctypes.sizeof(value)
                )
                # Force redraw
                ctypes.windll.user32.SetWindowPos(target_hwnd, 0, 0, 0, 0, 0, 0x0027) 
                logger.info(f"Set Window Theme to {'Dark' if is_dark else 'Light'}")
            else:
                logger.warning("Could not find window handle to set theme.")
                
        except Exception as e:
            logger.error(f"Failed to set window theme: {e}")

    def quit_app(self, *args):
        """Exit the application completely. *args for pystray callback compatibility."""
        self.should_exit = True
        logger.info("Quitting application...")
        
        # Stop Tray
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except:
                pass
            
        # Destroy Window
        if self.window:
            try:
                self.window.destroy()
            except:
                pass
            
        # Harder kill for Aria2: use taskkill/pkill as fallback
        try:
            import subprocess
            if os.name == 'nt':
                # CREATE_NO_WINDOW = 0x08000000
                subprocess.run(['taskkill', '/F', '/IM', 'aria2c.exe', '/T'], 
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             creationflags=0x08000000)
            else:
                subprocess.run(['pkill', '-f', 'aria2c'], 
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            pass

        os._exit(0)

# Global Instance
desktop_instance: Optional[DesktopManager] = None

def get_desktop_instance():
    return desktop_instance
