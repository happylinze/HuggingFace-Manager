
import os
import time
import threading
import logging
import multiprocessing
import queue
from pathlib import Path
from typing import Optional, List, Dict, Any






# Configure logging for the worker process
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def _format_size(size: int) -> str:
    # Simple formatter to avoid circular imports if possible, or duplicate logic
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} PB"

def download_worker_entry(
    task_id: str,
    repo_id: str,
    repo_type: str,
    revision: str,
    include_patterns: List[str],
    exclude_patterns: List[str],
    local_dir: str,
    use_hf_transfer: bool,
    progress_queue: multiprocessing.Queue,
    endpoint: Optional[str] = None,
    token: Optional[str] = None,
    max_workers: Optional[int] = None,
    proxy_url: Optional[str] = None
):
    """
    Entry point for the download worker process.
    """
    try:
        # Re-enable hf_transfer environment variable in this process
        if use_hf_transfer:
            os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
        else:
            os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)
            
        if endpoint:
            os.environ["HF_ENDPOINT"] = endpoint

        # Smart Proxy Logic: If using hf-mirror, force direct connection
        # This fixes issues where system proxy (e.g. from Clash) is left on but dead, or slow for domestic mirror
        if (endpoint and "hf-mirror.com" in endpoint) or (os.environ.get("HF_ENDPOINT") and "hf-mirror.com" in os.environ.get("HF_ENDPOINT")):
            logger.info(f"Detected hf-mirror, forcing DIRECT connection (Bypassing Proxy settings)")
            # 1. Ignore configured proxy
            proxy_url = None
            # 2. Clear System Proxy Env Vars to prevent auto-detection
            os.environ.pop("HTTP_PROXY", None)
            os.environ.pop("HTTPS_PROXY", None)
            os.environ.pop("ALL_PROXY", None)

        if proxy_url:
            os.environ["HTTP_PROXY"] = proxy_url
            os.environ["HTTPS_PROXY"] = proxy_url
            os.environ["ALL_PROXY"] = proxy_url
            logger.info(f"Proxy Configured in Worker: {proxy_url}")
        else:
            logger.info("No Proxy Configured in Worker (Direct Connection)")

        logger.info(f"Connecting to Endpoint: {os.environ.get('HF_ENDPOINT', 'Default')}")

        # Increase default timeout for large files / slow connections
        os.environ["HF_HUB_DOWNLOAD_TIMEOUT"] = "300" 

        logger.info(f"Worker process started for {repo_id} (PID: {os.getpid()})")
        
        # Prepare patterns
        allow_patterns = include_patterns if include_patterns else None
        ignore_patterns = exclude_patterns if exclude_patterns else None
        
        # Determine subdir logic (same as original)
        download_path = Path(local_dir)
        # Assuming local_dir passed is already the ROOT download dir, we append repo structure
        # But wait, in previous code:
        # repo_subdir = f"{prefix}--{task.repo_id.replace('/', '--')}"
        # download_dir = str(Path(download_dir) / repo_subdir)
        # I should probably pass the FINAL download_dir to this worker to keep it simple.
        # Checking caller... caller should resolve the path.
        
        
        # --- CRITICAL: PATCH TQDM BEFORE IMPORTING HUGGINGFACE_HUB ---
        # TQDM Wrapper class definition tailored for IPC
        from tqdm.auto import tqdm as std_tqdm
        
        # We need to capture closure variables carefully or use class attributes
        class IPCDownloadProgress(std_tqdm):
            _total_bytes_monitor = 0 # Helper to track total bytes across bars if needed
            
            def __init__(self_tqdm, *args, **kwargs):
                # Suppress output
                kwargs['file'] = open(os.devnull, 'w')
                
                # Filter args
                kwargs.pop('name', None)
                
                super().__init__(*args, **kwargs)
                
                self_tqdm._start_time = time.time()
                self_tqdm._last_notify = 0
                
                unit = kwargs.get('unit')
                self_tqdm._is_byte_bar = (unit == 'B')
                
                # Send file start event
                desc = kwargs.get('desc')
                if self_tqdm._is_byte_bar and isinstance(desc, str):
                    progress_queue.put({
                        'type': 'file_start',
                        'task_id': task_id,
                        'filename': desc
                    })

                # Initial progress
                initial = kwargs.get('initial', 0)
                total = kwargs.get('total')
                
                logger.info(f"IPC TQDM Init: unit={unit}, scalar={not self_tqdm._is_byte_bar}, desc={kwargs.get('desc')}, total={total}")
                
                if self_tqdm._is_byte_bar and total:
                    progress_queue.put({
                        'type': 'total_update',
                        'task_id': task_id,
                        'total': total
                    })

                if initial > 0:
                     progress_queue.put({
                        'type': 'progress',
                        'task_id': task_id,
                        'inc': initial,
                        'is_byte': self_tqdm._is_byte_bar
                    })

            def set_description(self_tqdm, desc=None, refresh=True):
                if getattr(self_tqdm, '_is_byte_bar', False) and isinstance(desc, str):
                     progress_queue.put({
                        'type': 'file_start',
                        'task_id': task_id,
                        'filename': desc
                    })
                super().set_description(desc, refresh)

            def update(self_tqdm, n=1):
                super().update(n)
                try:
                    progress_queue.put({
                            'type': 'progress',
                            'task_id': task_id,
                            'inc': n,
                            'is_byte': getattr(self_tqdm, '_is_byte_bar', False)
                    })
                except Exception as e:
                    logger.error(f"IPC Queue Put Failed: {e}")

        # Save originals
        import sys
        import tqdm
        import tqdm.auto
        import tqdm.std
        
        orig_tqdm = tqdm.tqdm
        orig_auto_tqdm = tqdm.auto.tqdm
        orig_std_tqdm = tqdm.std.tqdm
        
        # Aggressive Patch BEFORE importing huggingface_hub modules that might cache tqdm
        tqdm.tqdm = IPCDownloadProgress
        tqdm.auto.tqdm = IPCDownloadProgress
        tqdm.std.tqdm = IPCDownloadProgress
        sys.modules['tqdm'].tqdm = IPCDownloadProgress
        sys.modules['tqdm.auto'].tqdm = IPCDownloadProgress
        sys.modules['tqdm.std'].tqdm = IPCDownloadProgress

        # Now import huggingface_hub modules
        import huggingface_hub.utils
        import huggingface_hub.file_download
        from huggingface_hub import snapshot_download

        orig_utils_tqdm = huggingface_hub.utils.tqdm
        orig_file_tqdm = getattr(huggingface_hub.file_download, 'tqdm', None)
        
        huggingface_hub.utils.tqdm = IPCDownloadProgress
        if hasattr(huggingface_hub.file_download, 'tqdm'):
            huggingface_hub.file_download.tqdm = IPCDownloadProgress
            
        try:
            # Import HfApi here (or ensure patched first? API doesn't use tqdm usually)
            from huggingface_hub import HfApi
            api = HfApi(endpoint=endpoint)
            
            total_size = 0
            file_count = 0
            
            repo_info = api.repo_info(
                repo_id=repo_id,
                repo_type=repo_type if repo_type != 'model' else None,
                revision=revision,
                files_metadata=True
            )
            
            import fnmatch
            for f in repo_info.siblings:
                if not f.size: continue
                # Pattern matching
                if allow_patterns:
                    if not any(fnmatch.fnmatch(f.rfilename, p) for p in allow_patterns): continue
                if ignore_patterns:
                    if any(fnmatch.fnmatch(f.rfilename, p) for p in ignore_patterns): continue
                total_size += f.size
                file_count += 1
            
            # Send initial size info
            progress_queue.put({
                'type': 'meta',
                'task_id': task_id,
                'total_size': total_size,
                'total_files': file_count
            })
            
        except Exception as e:
            logger.warning(f"Failed to fetch repo info: {e}")



        # --- Folder Monitor for HF Transfer / Backup Progress ---
        stop_monitor = threading.Event()
        
        def folder_monitor_loop():
             last_size = 0
             while not stop_monitor.is_set():
                 try:
                     current_size = 0
                     target_path = Path(download_path)
                     if target_path.exists():
                         for p in target_path.rglob('*'):
                             if p.is_file():
                                 # For hf_transfer, we mostly care about raw disk usage change.
                                 # Include EVERYTHING to be safe and see progress.
                                 if p.name == '.DS_Store': continue
                                 
                                 try:
                                     current_size += p.stat().st_size
                                 except OSError:
                                     # File might be locked or vanished
                                     pass
                     
                     # Force update if size changed, OR if we need to keep speed alive?
                     # Downloader only updates speed if size > last_size.
                     # But if size is constant (stalled), speed should drop to 0. 
                     # The downloader handles speed decay if no updates come?
                     # No, downloader calculates speed on EVENT.
                     # Ideally we should send update even if size is same? No, that would be 0 speed.
                     
                     if current_size != last_size:
                         # Send 'monitor_update'
                         progress_queue.put({
                            'type': 'monitor_update',
                            'task_id': task_id,
                            'downloaded_size': current_size
                         })
                         last_size = current_size
                 except Exception:
                     pass
                 time.sleep(0.5)
        
        monitor_thread = threading.Thread(target=folder_monitor_loop, daemon=True)
        if use_hf_transfer:
             logger.info("Starting folder monitor for HF Transfer")
             monitor_thread.start()

        # Start Download
        try:
            def attempt_download(is_accelerated: bool):
                return snapshot_download(
                    repo_id=repo_id,
                    repo_type=repo_type if repo_type != 'model' else None,
                    revision=revision,
                    local_dir=download_path,
                    resume_download=True,
                    token=token,
                    allow_patterns=allow_patterns,
                    ignore_patterns=ignore_patterns,
                    max_workers=max_workers \
                        if (max_workers is not None and not is_accelerated) else None,
                    tqdm_class=IPCDownloadProgress,
                    endpoint=endpoint
                )

            try:
                result_path = attempt_download(use_hf_transfer)
            except Exception as e:
                # Catch HF Transfer Error and Fallback
                # If we were using HF transfer, ANY error suggests we should try the robust standard way.
                # The user sees "An error occurred..." from HF Hub, but we catch the exception here.
                if use_hf_transfer:
                    logger.warning(f"HF Transfer mode caught exception: {e}. disabling acceleration and retrying...")
                    
                    # Notify UI of fallback (Optional, using error type but handled)
                    # We won't send an error status because we are recovering immediately.
                    
                    # Disable HF Transfer for this process
                    os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)
                    
                    # Retry without acceleration
                    result_path = attempt_download(False)
                else:
                    # If we weren't using HF transfer, or we already retried, then fail for real.
                    raise e
            progress_queue.put({
                'type': 'download_done',
                'task_id': task_id,
                'result_path': result_path
            })
            
            # --- Verification Phase ---
            progress_queue.put({
                'type': 'status_change',
                'task_id': task_id,
                'status': 'verifying'
            })
            
            
            from .verification import Verifier
            verifier = Verifier(api)
            # Use Verifier
            verification_result = verifier.verify_repo(
                repo_id=repo_id,
                repo_type=repo_type if repo_type != 'model' else repo_type,
                revision=revision,
                include_patterns=include_patterns,
                exclude_patterns=exclude_patterns,
                local_dir=download_path
            )
            
            if verification_result.is_valid:
                 progress_queue.put({
                    'type': 'completed',
                    'task_id': task_id,
                    'result_path': str(result_path)
                })
            else:
                # Format error message
                errors = []
                if verification_result.corrupted_files:
                    errors.append(f"{len(verification_result.corrupted_files)} files corrupted")
                if verification_result.missing_files:
                    errors.append(f"{len(verification_result.missing_files)} files missing")
                
                msg = f"Verification failed: {', '.join(errors)}"
                progress_queue.put({
                    'type': 'verification_failed',
                    'task_id': task_id,
                    'message': msg
                })
            
        except Exception as e:
            # Capture error
            progress_queue.put({
                'type': 'error',
                'task_id': task_id,
                'message': str(e)
            })
            raise e
        finally:
            stop_monitor.set()
            if use_hf_transfer:
                 monitor_thread.join(timeout=1)
            
            # Restore
            tqdm.tqdm = orig_tqdm
            tqdm.auto.tqdm = orig_auto_tqdm
            tqdm.std.tqdm = orig_std_tqdm
            huggingface_hub.utils.tqdm = orig_utils_tqdm
            if orig_file_tqdm:
                huggingface_hub.file_download.tqdm = orig_file_tqdm

    except Exception as e:
        logger.error(f"Worker process failed: {e}")
        progress_queue.put({
            'type': 'error',
            'task_id': task_id,
            'message': str(e)
        })
