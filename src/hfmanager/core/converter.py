import os
import subprocess
import logging
import threading
import sys
import uuid
import time
from typing import Optional
from .downloader import HFDownloader, DownloadTask, DownloadStatus
from .plugin_manager import PluginManager

logger = logging.getLogger(__name__)

class GGUFConverter:
    def __init__(self, downloader: HFDownloader, plugin_manager: PluginManager):
        self.downloader = downloader
        self.plugin_manager = plugin_manager

    def get_tool_path(self, tool_name: str = "llama-quantize.exe") -> Optional[str]:
        status = self.plugin_manager.get_plugin_status("llama_cpp")
        if status["status"] != "installed":
            return None
        
        path = os.path.join(status["path"], tool_name)
        if os.path.exists(path):
            return path
        return None

    def run_conversion(self, repo_id: str, input_path: str, output_path: str, quantization: str = "Q8_0"):
        """
        Runs the conversion using llama-quantize (pure quantization) in background.
        """
        # Detection logic:
        # If input is already .gguf, use llama-quantize (Fast, no deps)
        # If input is .bin/.safetensors, we MIGHT need python script (not implemented fully in MVP Phase 3)
        
        is_gguf_input = input_path.lower().endswith('.gguf')
        
        if is_gguf_input:
            tool_path = self.get_tool_path("llama-quantize.exe")
            if not tool_path:
                 raise ValueError("llama-quantize tool not found. Please install the plugin.")
            
            cmd = [
                tool_path,
                input_path,
                output_path,
                quantization.upper() # llama-quantize expects uppercase
            ]
        else:
             # Fallback or Error for now
             # Ideally we would check for convert-hf-to-gguf.py but that's complex
             raise ValueError("Direct conversion from SafeTensors/Bin is not supported in Lightweight mode yet. Please input a GGUF file (fp16/fp32).")

        task_id = f"convert_{uuid.uuid4().hex[:8]}"
        task = DownloadTask(
            id=task_id,
            repo_id=repo_id,
            repo_type="model",
            revision="conversion",
            status=DownloadStatus.PENDING,
            total_size=0,
            downloaded_size=0,
            current_file=f"Queuing GGUF quantization ({quantization})...",
            total_files=1,
            downloaded_files=0
        )
        self.downloader._notify_callbacks(task)

        def _run():
            try:
                task.status = DownloadStatus.DOWNLOADING
                task.current_file = f"Quantizing to {quantization}..."
                self.downloader._notify_callbacks(task)

                logger.info(f"Running quantization: {' '.join(cmd)}")
                
                # Create startup info to hide console window on Windows
                startupinfo = None
                if os.name == 'nt':
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    encoding='utf-8',
                    startupinfo=startupinfo,
                    errors='replace'
                )

                # Monitor output
                last_update = 0
                output_buffer = []
                
                while True:
                    line = process.stdout.readline()
                    if not line and process.poll() is not None:
                        break
                    
                    if line:
                        line = line.strip()
                        output_buffer.append(line)
                        if len(output_buffer) > 20: output_buffer.pop(0) # Keep last 20 lines?
                        
                        # llama.cpp output example: "main: quantization shape = 2 2 1 1"
                        # It doesn't output percentage easily on one line.
                        # We just show the log.
                        
                        if time.time() - last_update > 0.1:
                            # task.current_file is used as the "Status Message" in UI
                            # Show last log line
                            msg = line if len(line) < 60 else line[:57] + "..."
                            task.current_file = f"[{quantization}] {msg}"
                            self.downloader._notify_callbacks(task)
                            last_update = time.time()

                if process.returncode == 0:
                    task.status = DownloadStatus.COMPLETED
                    task.progress = 100
                    task.current_file = f"Quantization Success: {os.path.basename(output_path)}"
                    if os.path.exists(output_path):
                         task.total_size = os.path.getsize(output_path)
                         task.downloaded_size = task.total_size
                else:
                    task.status = DownloadStatus.FAILED
                    task.error_message = f"Tool exited with code {process.returncode}"
                    task.current_file = "Quantization Failed"

            except Exception as e:
                logger.exception("Conversion failed")
                task.status = DownloadStatus.FAILED
                task.error_message = str(e)
            
            finally:
                self.downloader._notify_callbacks(task)

        threading.Thread(target=_run, daemon=True).start()
        return task_id
