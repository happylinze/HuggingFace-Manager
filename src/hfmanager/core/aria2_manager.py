import os
import subprocess
import time
import json
import logging
import threading
import sys
from pathlib import Path
from typing import Optional, Dict, List, Any
import requests
from ..utils.config import get_config

logger = logging.getLogger(__name__)

class Aria2Service:
    """
    Manages the local Aria2c process and provides a JSON-RPC client.
    """
    def __init__(self, port: int = 6810, token: str = "hfmanager_secret"):
        self.port = port
        self.secret = token
        self.rpc_url = f"http://127.0.0.1:{port}/jsonrpc"
        self._process: Optional[subprocess.Popen] = None
        self._cleanup_zombie_processes()
        self._ensure_process_running()

    def _cleanup_zombie_processes(self):
        """Clean up any existing aria2c processes to avoid port conflicts."""
        if os.name == 'nt':
            try:
                # Use taskkill to kill all aria2c.exe processes
                subprocess.run(['taskkill', '/F', '/IM', 'aria2c.exe', '/T'], 
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             creationflags=0x08000000)
                logger.info("Cleaned up existing aria2c.exe processes")
                time.sleep(0.5) # Give OS time to release ports
            except Exception as e:
                logger.warning(f"Failed to cleanup aria2c processes: {e}")
        else:
            try:
                # Use pkill on Linux/Mac
                subprocess.run(['pkill', '-f', 'aria2c'], 
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                logger.info("Cleaned up existing aria2c processes")
                time.sleep(0.5)
            except Exception:
                pass

    def _get_binary_path(self) -> Path:
        """Locate aria2c binary."""
        binary_name = "aria2c.exe" if os.name == 'nt' else "aria2c"
        
        # 1. Handle Frozen Environment (PyInstaller)
        if getattr(sys, 'frozen', False):
            # Handle Frozen Environment (PyInstaller)
            if hasattr(sys, '_MEIPASS'):
                 # Onefile mode
                 base_path = Path(sys._MEIPASS)
            else:
                 # Onedir mode (folder)
                 base_path = Path(sys.executable).parent
            
            bin_path = base_path / "hfmanager" / "resources" / "bin" / binary_name
            if bin_path.exists():
                logger.info(f"Found bundled aria2 at: {bin_path}")
                return bin_path
            else:
                logger.warning(f"Bundled aria2 NOT found at: {bin_path}")
                
        # 2. Check resources/bin relative to this file (Dev Mode)
        current_dir = Path(__file__).parent.parent 
        bin_path = current_dir / "resources" / "bin" / binary_name
        if bin_path.exists():
            return bin_path
        
        # Fallback to system path or root
        import shutil
        sys_path = shutil.which("aria2c")
        if sys_path:
            return Path(sys_path)
            
        return Path(binary_name) # Hope it's in CWD

    def _ensure_process_running(self):
        """Start aria2c daemon if not running."""
        if self._process and self._process.poll() is None:
            return
            
        # Check if port is already taken (maybe external aria2 running)
        try:
            requests.get(self.rpc_url, timeout=0.5, proxies={"http": None, "https": None})
            logger.info(f"Aria2 already running on port {self.port}")
            return
        except:
            pass # Port likely free
            
        binary = self._get_binary_path()
        if not binary.exists():
            logger.error(f"Aria2 binary not found at {binary}")
            return

        # Load dynamic config
        config = get_config()
        max_conn = str(config.get('aria2_max_connection_per_server', 16))
        split = str(config.get('aria2_split', 16))
        min_split = str(config.get('aria2_min_split_size', '1M'))
        check_cert = 'true' if config.get('aria2_check_certificate', False) else 'false'
        proxy = config.get('aria2_all_proxy', '')

        # Auto-detect System Proxy (e.g. Clash/VPN) if not explicitly set
        if not proxy:
            try:
                from urllib.request import getproxies
                sys_proxies = getproxies()
                # Prioritize 'all' > 'https' > 'http'
                if 'all' in sys_proxies: 
                    proxy = sys_proxies['all']
                    logger.info(f"Aria2: Auto-detected System Proxy (all): {proxy}")
                elif 'https' in sys_proxies and 'https://' in self.rpc_url: # Not strict, just heuristics
                    proxy = sys_proxies['https']
                    logger.info(f"Aria2: Auto-detected System Proxy (https): {proxy}")
                elif 'http' in sys_proxies:
                    proxy = sys_proxies['http']
                    logger.info(f"Aria2: Auto-detected System Proxy (http): {proxy}")
            except Exception as e:
                logger.warning(f"Failed to detect system proxy: {e}")
        
        cmd = [
            str(binary),
            "--enable-rpc=true",
            f"--rpc-listen-port={self.port}",
            f"--rpc-secret={self.secret}",
            "--rpc-allow-origin-all=true",
            "--rpc-listen-all=false", # Localhost only
            f"--max-connection-per-server={max_conn}",
            f"--split={split}",
            f"--min-split-size={min_split}",
            "--daemon=false", # We manage the process
            "--no-conf",
            "--console-log-level=warn",
            f"--check-certificate={check_cert}",
            f"--reuse-uri={'true' if config.get('aria2_reuse_uri', True) else 'false'}",
            "--connect-timeout=60", # Robust timeout
            "--timeout=60",
            "--max-tries=20",       # More retries
            "--retry-wait=3"        # Wait between retries
        ]
        
        if proxy:
            cmd.append(f"--all-proxy={proxy}")
        
        try:
            # CREATE_NO_WINDOW = 0x08000000
            creationflags = 0x08000000 if os.name == 'nt' else 0
            
            self._process = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                creationflags=creationflags,
                text=True
            )
            
            # Robust Wait Loop: Check if process stays alive and port becomes active
            max_retries = 20 # 2 seconds total (0.1s interval)
            startup_success = False
            
            for _ in range(max_retries):
                # 1. Check if process died
                if self._process.poll() is not None:
                    _, stderr = self._process.communicate()
                    logger.error(f"Aria2 exited immediately with code {self._process.returncode}")
                    logger.error(f"STDERR: {stderr}")
                    self._process = None
                    return # Startup failed
                
                # 2. Check if port is listening (Health Check)
                try:
                    requests.get(self.rpc_url, timeout=0.1, proxies={"http": None, "https": None})
                    startup_success = True
                    break
                except:
                    time.sleep(0.1)
            
            if startup_success:
                logger.info(f"Started Aria2 process with PID {self._process.pid} on port {self.port}")
            else:
                logger.warning(f"Aria2 process started (PID {self._process.pid}) but port {self.port} not ready.")
                
        except Exception as e:
            logger.error(f"Failed to start Aria2: {e}")

    def call(self, method: str, params: List[Any]) -> Any:
        """Execute JSON-RPC call."""
        payload = {
            "jsonrpc": "2.0",
            "id": "hfmanager",
            "method": f"aria2.{method}",
            "params": [f"token:{self.secret}"] + params
        }
        
        try:
            # Force direct connection to localhost, ignore system proxies/VPNs
            resp = requests.post(
                self.rpc_url, 
                json=payload, 
                timeout=10, 
                proxies={"http": None, "https": None}
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise Exception(f"Aria2 RPC Error: {data['error']}")
            return data["result"]
        except requests.exceptions.ConnectionError:
            # Maybe crashed? Restart
            logger.warning("Aria2 connection failed, restarting...")
            self._ensure_process_running()
            raise

    def multicall(self, calls: List[Dict[str, Any]]) -> List[Any]:
        """Execute multiple JSON-RPC calls in one request using system.multicall."""
        formatted_calls = []
        for c in calls:
            method = c["method"]
            params = [f"token:{self.secret}"] + c.get("params", [])
            formatted_calls.append({"methodName": f"aria2.{method}", "params": params})
            
        payload = {
            "jsonrpc": "2.0",
            "id": "hfmanager_multi",
            "method": "system.multicall",
            "params": [formatted_calls]
        }
        
        try:
            resp = requests.post(
                self.rpc_url, 
                json=payload, 
                timeout=20, # Higher timeout for batch
                proxies={"http": None, "https": None}
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise Exception(f"Aria2 Multicall Error: {data['error']}")
            
            # system.multicall returns a list of results, each wrapped in a list
            results = []
            for item in data.get("result", []):
                # If error, result will be a dict with 'code' and 'message'
                results.append(item[0] if isinstance(item, list) and len(item) > 0 else item)
            return results
        except Exception as e:
            logger.error(f"Aria2 Multicall Failed: {e}")
            raise

    def add_uri(self, 
                uris: List[str], 
                save_dir: str, 
                filename: str = None, 
                headers: Dict[str, str] = None,
                turbo: bool = True) -> str:
        """
        Add a download task.
        
        Args:
            uris: List of URLs (mirrors).
            save_dir: Destination directory.
            filename: Output filename (optional).
            headers: HTTP Headers (e.g. Authorization).
            turbo: If True, uses max connections (split=16). If False, single connection (split=1).
        """
        config = get_config()
        max_conn = str(config.get('aria2_max_connection_per_server', 16))
        split = str(config.get('aria2_split', 16))
        min_split = str(config.get('aria2_min_split_size', '1M'))

        options = {
            "dir": str(save_dir),
            "max-connection-per-server": max_conn if turbo else "1",
            "split": split if turbo else "1",
            "min-split-size": min_split
        }
        
        if filename:
            options["out"] = filename
            
        if headers:
            header_list = [f"{k}: {v}" for k, v in headers.items()]
            options["header"] = header_list
            
        return self.call("addUri", [uris, options])

    def pause(self, gid: str):
        return self.call("pause", [gid])
        
    def unpause(self, gid: str):
        return self.call("unpause", [gid])
        
    def remove(self, gid: str):
        return self.call("remove", [gid])
        
    def get_status(self, gid: str):
        return self.call("tellStatus", [gid])
        
    def update_options(self, options: Dict[str, str]):
        """Update global options via RPC."""
        try:
            return self.call("changeGlobalOption", [options])
        except Exception as e:
            logger.warning(f"Failed to update Aria2 global options: {e}")
            return False

    def shutdown(self):
        """Gracefully shutdown then forcefully kill if needed."""
        if self._process:
            try:
                # 1. Try internal shutdown via RPC if possible (future)
                # 2. Terminate
                self._process.terminate()
                self._process.wait(timeout=3)
            except Exception:
                try:
                    self._process.kill()
                except:
                    pass
            self._process = None
        
        # Cleanup again just to be safe
        self._cleanup_zombie_processes()
