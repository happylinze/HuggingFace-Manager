
import os
import requests
import zipfile
import shutil
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class PluginManager:
    def __init__(self, config_dir: str):
        self.plugins_dir = os.path.join(config_dir, "plugins")
        if not os.path.exists(self.plugins_dir):
            os.makedirs(self.plugins_dir)
            
        # Hardcoded definitions for now
        self.PLUGINS = {
            "llama_cpp": {
                "name": "llama.cpp Quantization Tools",
                "description": "Lightweight tools to convert and quantize models to GGUF format.",
                "url": "https://github.com/ggerganov/llama.cpp/releases/download/b3561/llama-b3561-bin-win-avx2-x64.zip",
                # "mirror_url": "https://mirror.ghproxy.com/https://github.com/ggerganov/llama.cpp/releases/download/b3561/llama-b3561-bin-win-avx2-x64.zip",
                "executables": ["llama-quantize.exe", "llama-gguf-split.exe"],
                "version": "b3561"
            }
        }

    def get_plugin_status(self, plugin_id: str) -> Dict[str, Any]:
        """Check if a plugin is installed and valid."""
        if plugin_id not in self.PLUGINS:
             return {"status": "unknown"}
             
        plugin_path = os.path.join(self.plugins_dir, plugin_id)
        if not os.path.exists(plugin_path):
             return {"status": "missing", "path": None}
             
        # Check specific executables
        definition = self.PLUGINS[plugin_id]
        for exe in definition["executables"]:
            if not os.path.exists(os.path.join(plugin_path, exe)):
                 return {"status": "broken", "path": plugin_path}
                 
        return {"status": "installed", "path": plugin_path, "version": definition["version"]}

    def install_plugin(self, plugin_id: str, use_mirror: bool = True) -> str:
        """Download and install a plugin."""
        if plugin_id not in self.PLUGINS:
            raise ValueError(f"Unknown plugin: {plugin_id}")
            
        definition = self.PLUGINS[plugin_id]
        url = definition["url"]
        
        # Try Mirror first, then Direct
        urls_to_try = []
        if use_mirror:
            urls_to_try.append(f"https://mirror.ghproxy.com/{url}")
        urls_to_try.append(url)
        
        last_exception = None
        
        for download_url in urls_to_try:
            target_dir = os.path.join(self.plugins_dir, plugin_id)
            os.makedirs(target_dir, exist_ok=True)
            zip_path = os.path.join(target_dir, "package.zip")
            
            try:
                logger.info(f"Attempting download from {download_url}...")
                # Connect timeout 10s, Read timeout 60s
                response = requests.get(download_url, stream=True, timeout=(10, 60))
                response.raise_for_status()
                
                with open(zip_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                
                logger.info(f"Download complete. Size: {os.path.getsize(zip_path)} bytes. Extracting...")
                
                # Verify zip
                if not zipfile.is_zipfile(zip_path):
                    raise ValueError("Downloaded file is not a valid zip archive")

                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(target_dir)
                    
                # Cleanup
                os.remove(zip_path)
                
                logger.info(f"Plugin {plugin_id} installed successfully to {target_dir}")
                return target_dir
                
            except Exception as e:
                logger.warning(f"Failed to download from {download_url}: {e}")
                last_exception = e
                # Cleanup partial
                if os.path.exists(zip_path):
                    os.remove(zip_path)
                continue
        
        if last_exception:
            raise last_exception
        else:
            raise Exception("Installation failed (unknown error)")

    def uninstall_plugin(self, plugin_id: str) -> None:
        """Uninstall a plugin by removing its directory."""
        if plugin_id not in self.PLUGINS:
            raise ValueError(f"Unknown plugin: {plugin_id}")
            
        plugin_path = os.path.join(self.plugins_dir, plugin_id)
        if not os.path.exists(plugin_path):
             logger.warning(f"Plugin {plugin_id} not found at {plugin_path}")
             return # Already gone
             
        try:
            shutil.rmtree(plugin_path)
            logger.info(f"Plugin {plugin_id} uninstalled successfully")
        except Exception as e:
            logger.error(f"Failed to uninstall plugin {plugin_id}: {e}")
            raise Exception(f"Failed to uninstall {plugin_id}: {str(e)}")

# Valid quantizations for llama.cpp
QUANTIZATION_TYPES = [
    "Q4_K_M", "Q5_K_M", "Q8_0", "Q2_K", "Q3_K_M", "Q6_K", "F16"
]
