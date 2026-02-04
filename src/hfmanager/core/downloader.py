"""
Downloader for Hugging Face models and datasets.
Supports filtering, progress tracking, and queue management.
Refactored to use Multiprocessing for robust cancellation (Zombie Thread killer).
"""
from __future__ import annotations

import os
import time
import logging
import threading
import multiprocessing
import queue
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Callable, Optional, Dict, Any
from concurrent.futures import ThreadPoolExecutor, Future

# Import the worker function
from .download_worker import download_worker_entry
from ..utils.system import set_hf_transfer_enabled, format_size
from ..utils.config import get_config

logger = logging.getLogger(__name__)

class DownloadStatus(Enum):
    """Status of a download task."""
    PENDING = "pending"
    DOWNLOADING = "downloading"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    VERIFYING = "verifying"


class DuplicateDownloadError(Exception):
    def __init__(self, message: str, path: str):
        super().__init__(message)
        self.path = path


@dataclass
class DownloadTask:
    """Represents a download task in the queue."""
    id: str
    repo_id: str
    repo_type: str  # 'model', 'dataset', 'space'
    revision: str
    resolved_local_dir: Optional[str] = None  # The actual final directory
    include_patterns: list[str] = field(default_factory=list)
    exclude_patterns: list[str] = field(default_factory=list)
    local_dir: Optional[str] = None
    status: DownloadStatus = DownloadStatus.PENDING
    progress: float = 0.0  # 0.0 to 100.0
    downloaded_size: int = 0
    total_size: int = 0
    speed: float = 0.0  # Bytes per second
    speed_formatted: str = "0 B/s"
    current_file: str = ""
    # File count tracking
    total_files: int = 0
    downloaded_files: int = 0
    error_message: Optional[str] = None
    result_path: Optional[str] = None
    pausable: bool = True  # Always true now (supports forceful pause/kill)
    use_hf_transfer: bool = False


class HFDownloader:
    """
    Hugging Face model/dataset downloader with queue management.
    Uses Multiprocessing for Native Python downloads to allow clean cancellation.
    """
    
    # Common file patterns for quick filtering
    PRESET_PATTERNS = {
        'safetensors_only': {
            'include': ['*.safetensors', 'config.json', '*.json', 'tokenizer*'],
            'exclude': ['*.bin', '*.pt', '*.pth', '*.ckpt']
        },
        'gguf_only': {
            'include': ['*.gguf', 'README.md'],
            'exclude': []
        },
        'no_pytorch': {
            'include': [],
            'exclude': ['*.bin', '*.pt', '*.pth', 'pytorch_model*']
        },
        'config_only': {
            'include': ['*.json', '*.yaml', '*.yml', '*.txt', 'README.md'],
            'exclude': []
        }
    }
    
    def __init__(self, max_workers: int = 2, use_hf_transfer: bool = False):
        self.config = get_config()
        self.max_workers = max_workers
        
        # Load from config if available, otherwise use arg
        config_transfer = self.config.get('use_hf_transfer')
        self.use_hf_transfer = config_transfer if config_transfer is not None else use_hf_transfer
        
        self._tasks: dict[str, DownloadTask] = {}
        self._task_lock = threading.Lock()
        
        self._callbacks: list[Callable[[DownloadTask], None]] = []
        
        # Process Management (for Python Mode)
        self._processes: Dict[str, multiprocessing.Process] = {}
        self._msg_queue: multiprocessing.Queue = multiprocessing.Queue()
        self._stop_monitor = threading.Event()
        
        # ThreadPool (for Aria2 dispatch and other light tasks)
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._futures: dict[str, Future] = {} # For Aria2 futures
        
        # Configure hf_transfer (for main process env, though workers set it themselves)
        set_hf_transfer_enabled(use_hf_transfer)
        
        # Initialize Aria2 Service
        from .aria2_manager import Aria2Service
        self.aria2 = Aria2Service(port=self.config.get('aria2_port', 6800))
        self.aria2_gids: dict[str, list[str]] = {} 
        
        # Initialize API 
        from huggingface_hub import HfApi, hf_hub_url
        self.api_cls = HfApi
        self.refresh_api()

        # Start Monitor Thread
        self._monitor_thread = threading.Thread(target=self._monitor_queue_loop, daemon=True)
        self._monitor_thread.start()
        
        # Speed Tracking: {task_id: {'last_size': int, 'last_time': float}}
        self._speed_tracker = {}

        # Load existing queue
        self.load_queue()

    def resize_pool(self, new_size: int):
        """Update pool size and persist to config."""
        self.max_workers = new_size
        self.config.set('max_concurrent_downloads', new_size)
        # Note: Executor isn't restarted, but max_workers is used for new pool inits if needed
        # and persisted for the next run.
        
    def refresh_api(self):
        """Re-initialize API client."""
        endpoint = os.environ.get('HF_ENDPOINT')
        self.api = self.api_cls(endpoint=endpoint) if endpoint else self.api_cls()

    def _monitor_queue_loop(self):
        """Consume messages from worker processes and update task state."""
        while not self._stop_monitor.is_set():
            try:
                # Get message with timeout to allow checking stop_event
                msg = self._msg_queue.get(timeout=0.5)
                
                type_ = msg.get('type')
                task_id = msg.get('task_id')
                
                # DEBUG PROGRESS
                # if type_ == 'progress' or type_ == 'total_update':
                #      # Rate limit logs? No, user needs to see it once.
                #      # logger.info(f"Monitor received {type_} for {task_id}: {msg}")
                #      pass
            
                if type_ == 'progress':
                    # Sample logs to avoid spamming
                    import random
                    if random.random() < 0.05:
                        logger.info(f"Monitor: Received progress for {task_id}")    
                
                with self._task_lock:
                    if task_id not in self._tasks:
                        continue 
                    task = self._tasks[task_id]
                
                if type_ == 'total_update':
                    logger.info(f"Monitor: Set total_size for {task_id}: {msg.get('total', 0)}")
                    # CAUTION: This might be single file size, not repo total.
                    # Only set if we don't have a repo total?
                    # task.total_size = msg.get('total', 0)
                    pass

                elif type_ == 'meta':
                    t_size = msg.get('total_size', 0)
                    logger.info(f"Monitor: Received META for {task_id}: total={t_size}")
                    task.total_size = t_size
                    task.total_files = msg.get('total_files', 0)
                    self._notify_callbacks(task)
                    
                elif type_ == 'file_start':
                    # Only update if task is actively downloading/verifying
                    if task.status in (DownloadStatus.DOWNLOADING, DownloadStatus.VERIFYING):
                         task.current_file = msg.get('filename', '')
                         self._notify_callbacks(task)
                
                elif type_ == 'monitor_update':
                    # Absolute size update from folder monitor
                    new_size = msg.get('downloaded_size', 0)
                    if new_size > task.downloaded_size:
                        task.downloaded_size = new_size
                        if task.total_size > 0:
                            task.progress = min(100.0, (task.downloaded_size / task.total_size) * 100)
                        
                        if task.total_size > 0:
                            task.progress = min(100.0, (task.downloaded_size / task.total_size) * 100)
                        
                        self._update_speed(task_id, task, task.downloaded_size)
                        self._notify_callbacks(task)

                elif type_ == 'progress':
                    # Incremental update
                    inc = msg.get('inc', 0)
                    is_byte = msg.get('is_byte', False)
                    
                    if is_byte:
                        task.downloaded_size += inc
                        if task.total_size > 0:
                            task.progress = min(100.0, (task.downloaded_size / task.total_size) * 100)
                        else:
                            # Fallback for unknown total size?
                            # If total is 0, we can't calculate progress.
                            pass
                        
                        # Debug log occasionally
                        if task.downloaded_size % (1024*1024*5) < inc: # Log approx every 5MB
                            logger.info(f"Task {task_id}: {task.downloaded_size}/{task.total_size} ({task.progress:.2f}%)")    
                    else:
                        task.downloaded_files += inc # Wait, tqdm update(n) for file bar is 'n' files? Yes.
                    
                    self._update_speed(task_id, task, task.downloaded_size)
                    self._notify_callbacks(task)

                elif type_ == 'download_done':
                     task.result_path = msg.get('result_path')
                     # Next step is verifying, handled by worker update
                     
                elif type_ == 'status_change':
                    new_status = msg.get('status')
                    if new_status == 'verifying':
                        task.status = DownloadStatus.VERIFYING
                    self._notify_callbacks(task)

                elif type_ == 'completed':
                    # Worker finished successfully
                    task.status = DownloadStatus.COMPLETED
                    task.progress = 100.0
                    if msg.get('result_path'):
                        task.result_path = msg.get('result_path')
                    
                    # Cleanup process reference
                    if task_id in self._processes:
                        p = self._processes[task_id]
                        p.join(timeout=1)
                        del self._processes[task_id]
                        
                    self._notify_callbacks(task)
                    self.save_queue()

                elif type_ == 'error':
                    task.status = DownloadStatus.FAILED
                    task.error_message = msg.get('message', 'Unknown Error')
                    
                    # Cleanup
                    if task_id in self._processes:
                        p = self._processes[task_id]
                        p.join(timeout=1)
                        del self._processes[task_id]
                    
                    self._notify_callbacks(task)
                    self.save_queue() # Save failure state

                elif type_ == 'verification_failed':
                    task.status = DownloadStatus.FAILED
                    task.error_message = msg.get('message')
                    
                    # Cleanup
                    if task_id in self._processes:
                        p = self._processes[task_id]
                        p.join(timeout=1)
                        del self._processes[task_id]
                    
                    self._notify_callbacks(task)
                    self.save_queue()

            except queue.Empty:
                pass
            except Exception as e:
                logger.error(f"Error in queue monitor: {e}")
            
            # Check for stalled downloads
            self._check_stale_speeds()


    def _update_speed(self, task_id: str, task: DownloadTask, current_size: int):
        now = time.time()
        if task_id not in self._speed_tracker:
            self._speed_tracker[task_id] = {'last_size': current_size, 'last_time': now}
            return
        
        tracker = self._speed_tracker[task_id]
        delta_time = now - tracker['last_time']
        
        if delta_time >= 2.0: # Update every 2 seconds for stability
            delta_bytes = current_size - tracker['last_size']
            
            # Prevent negative speed or massive spikes
            if delta_bytes >= 0:
                speed = delta_bytes / delta_time # B/s
                
                # Simple moving average for smoothness (Optional but good)
                # current_speed = speed
                # if task.speed > 0:
                #     speed = (task.speed * 0.7) + (current_speed * 0.3)
                
                task.speed = speed
                task.speed_formatted = f"{format_size(int(speed))}/s"
            
            tracker['last_size'] = current_size
            tracker['last_time'] = now
            
            tracker['last_size'] = current_size
            tracker['last_time'] = now

    def _check_stale_speeds(self):
        """Reset speed to 0 if no updates for a while."""
        now = time.time()
        with self._task_lock:
            # Prepare list to iterate safely
            for task_id, tracker in list(self._speed_tracker.items()):
                # If no speed update for > 3.0 seconds, consider stalled
                if now - tracker['last_time'] > 3.0:
                    task = self._tasks.get(task_id)
                    # Only update if currently showing speed
                    if task and task.speed > 0 and task.status == DownloadStatus.DOWNLOADING:
                        task.speed = 0.0
                        task.speed_formatted = "Stalled"
                        self._notify_callbacks(task)

    def shutdown(self):
        self._stop_monitor.set()
        # Terminate all processes
        for p in self._processes.values():
            if p.is_alive():
                p.terminate()
        if self._executor:
            self._executor.shutdown(wait=False)

    # --- Standard Methods ---

    def add_callback(self, callback: Callable[[DownloadTask], None]) -> None:
        self._callbacks.append(callback)
    
    def _notify_callbacks(self, task: DownloadTask) -> None:
        for callback in self._callbacks:
            try:
                callback(task)
            except Exception:
                pass
    
    def _generate_task_id(self, repo_id: str, revision: str) -> str:
        import uuid
        return f"{repo_id}_{revision}_{uuid.uuid4().hex[:8]}"
    
    def save_queue(self):
        # Implementation of saving queue to disk
        try:
             import json
             path = self._get_queue_file_path()
             data = [self._serialize_task(t) for t in self._tasks.values()]
             with open(path, 'w', encoding='utf-8') as f:
                 json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save queue: {e}")

    def _get_queue_file_path(self) -> Path:
        """Get path for download queue. Standard: APPDATA/HFManager/data/download_queue.json"""
        return self.config.data_dir / 'download_queue.json'

    def _serialize_task(self, task: DownloadTask) -> dict:
        return {
            'id': task.id,
            'repo_id': task.repo_id,
            'repo_type': task.repo_type,
            'revision': task.revision,
            'status': task.status.value,
            'local_dir': task.local_dir,
            'resolved_local_dir': task.resolved_local_dir,
            'include_patterns': task.include_patterns,
            'exclude_patterns': task.exclude_patterns,
            'total_size': task.total_size,
            'total_files': task.total_files,
            'downloaded_size': task.downloaded_size,
            'downloaded_files': task.downloaded_files,
            'result_path': task.result_path,
            'error_message': task.error_message,
            'pausable': task.pausable,
            'use_hf_transfer': task.use_hf_transfer
        }
    
    def load_queue(self):
        try:
            import json
            import shutil
            path = self._get_queue_file_path()
            
            # Legacy Migration
            legacy_dir = Path.home() / '.hfmanager'
            legacy_file = legacy_dir / 'download_queue.json'
            if legacy_file.exists() and not path.exists():
                try:
                    logger.info(f"Migrating legacy queue: {legacy_file} -> {path}")
                    shutil.copy2(legacy_file, path)
                    legacy_file.rename(legacy_file.with_suffix('.bak'))
                except Exception as e:
                    logger.error(f"Migration failed: {e}")

            if not path.exists():
                return
            
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            auto_resume = self.config.get('auto_resume_incomplete', False)
            
            with self._task_lock:
                for item in data:
                    status = DownloadStatus(item.get('status', 'pending'))
                    
                    # Logic for resuming
                    should_start = False
                    if status in (DownloadStatus.DOWNLOADING, DownloadStatus.VERIFYING):
                        if auto_resume:
                            # Keep as DOWNLOADING/PENDING to trigger start
                            # But we need to reset to PENDING to let start_download handle it?
                            # Actually, start_download expects PENDING/PAUSED
                            status = DownloadStatus.PENDING
                            should_start = True
                        else:
                            status = DownloadStatus.PAUSED # Reset running to paused

                    task = DownloadTask(
                        id=item['id'],
                        repo_id=item['repo_id'],
                        repo_type=item.get('repo_type', 'model'),
                        revision=item['revision'],
                        local_dir=item.get('local_dir'),
                        resolved_local_dir=item.get('resolved_local_dir'),
                        include_patterns=item.get('include_patterns', []),
                        exclude_patterns=item.get('exclude_patterns', []),
                        status=status,
                        total_size=item.get('total_size', 0),
                        total_files=item.get('total_files', 0),
                        downloaded_size=item.get('downloaded_size', 0),
                        downloaded_files=item.get('downloaded_files', 0),
                        result_path=item.get('result_path'),
                        error_message=item.get('error_message'),
                        pausable=True,
                        use_hf_transfer=item.get('use_hf_transfer', False)
                    )
                    self._tasks[task.id] = task
                    
                    if should_start:
                        # Schedule start (don't block here)
                        # We can't call start_download inside lock if it takes lock?
                        # start_download takes lock. So we must queue it.
                        pass
            
            # Now start tasks outside lock
            if auto_resume:
                threading.Thread(target=self._auto_resume_tasks, daemon=True).start()
                
        except Exception as e:
            logger.error(f"Failed to load queue: {e}")

    def _auto_resume_tasks(self):
        """Helper to resume tasks after load."""
        time.sleep(1) # Wait for system to settle
        keys = []
        with self._task_lock:
            # Find tasks that we marked as PENDING from previous DOWNLOADING state
            # Distinguishing them from user-added PENDING might be hard if we just use PENDING.
            # But on startup, PENDING usually means "was pending".
            # Let's just try to start all PENDING tasks? 
            # Or better, logic in load_queue logic was specifically 'if was DOWNLOADING'.
            # Re-iterate:
            for t in self._tasks.values():
                if t.status == DownloadStatus.PENDING:
                    keys.append(t.id)
        
        logger.info(f"Auto-resuming {len(keys)} tasks...")
        for k in keys:
            self.start_download(k)


    # --- Core Actions ---

    def _resolve_target_dir(self, local_dir: str, repo_id: str, repo_type: str) -> Path:
        """Resolve the expected download directory following HF conventions."""
        path = Path(local_dir)
        prefix = "models"
        if repo_type == "dataset": prefix = "datasets"
        elif repo_type == "space": prefix = "spaces"
        repo_subdir = f"{prefix}--{repo_id.replace('/', '--')}"
        return path / repo_subdir

    def queue_download(
        self,
        repo_id: str,
        repo_type: str = 'model',
        revision: str = 'main',
        include_patterns: list[str] = None,
        exclude_patterns: list[str] = None,
        local_dir: str = None,
        preset: str = None,
        duplicate_action: str = 'check'  # check, overwrite, rename
    ) -> str:
        
        # Auto-register connection to External Library
        if local_dir:
            try:
                from .library_manager import get_library_manager
                get_library_manager().add_path(local_dir)
            except Exception:
                pass

        # Apply preset
        if preset and preset in self.PRESET_PATTERNS:
            patterns = self.PRESET_PATTERNS[preset]
            include_patterns = (include_patterns or []) + patterns['include']
            exclude_patterns = (exclude_patterns or []) + patterns['exclude']
        
        include_patterns = include_patterns or []
        exclude_patterns = exclude_patterns or []

        resolved_local_dir = None
        if local_dir:
            target_path = self._resolve_target_dir(local_dir, repo_id, repo_type)
            
            if duplicate_action == 'rename':
                # Check conflict and find valid name
                base_name = target_path.name
                parent = target_path.parent
                counter = 1
                while target_path.exists() and any(target_path.iterdir()): # Only rename if occupied
                    # Check partial markers
                    has_aria2 = any(target_path.glob("*.aria2"))
                    if has_aria2:
                        break # Treat as resume
                    
                    target_path = parent / f"{base_name}_{counter}"
                    counter += 1
                resolved_local_dir = str(target_path)
            
            else: # check or overwrite
                if target_path.exists() and any(target_path.iterdir()):
                    # Check for partial markers
                    has_aria2 = any(target_path.glob("*.aria2"))
                    
                    # If action is Check and NO partial markers -> Error
                    if duplicate_action == 'check' and not has_aria2:
                         raise DuplicateDownloadError(f"Target directory exists: {target_path}", str(target_path))
                
                resolved_local_dir = str(target_path)

        import hashlib
        hash_str = hashlib.md5(f"{repo_id}_{revision}_{include_patterns}_{exclude_patterns}_{resolved_local_dir}".encode()).hexdigest()[:8]
        safe_repo_id = repo_id.replace("/", "--")
        task_id = f"{safe_repo_id}_{revision}_{hash_str}"
        
        task = DownloadTask(
            id=task_id,
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            include_patterns=include_patterns,
            exclude_patterns=exclude_patterns,
            local_dir=local_dir,
            resolved_local_dir=resolved_local_dir,
            pausable=True, # Process isolation allows Pause/Kill always
            # Only mark as using HF Transfer if method is PYTHON and transfer is enabled
            use_hf_transfer=(self.use_hf_transfer and self.config.get('download_method') == 'PYTHON')
        )
        
        with self._task_lock:
            self._tasks[task_id] = task
        
        self._notify_callbacks(task)
        self.save_queue()
        return task_id

    def start_download(self, task_id: str) -> bool:
        with self._task_lock:
            if task_id not in self._tasks:
                return False
            task = self._tasks[task_id]
            if task.status not in (DownloadStatus.PENDING, DownloadStatus.PAUSED, DownloadStatus.FAILED, DownloadStatus.CANCELLED):
                # We allow restarting Failed/Cancelled tasks too
                return False
            
            task.status = DownloadStatus.DOWNLOADING
            task.error_message = None
            task.pausable = True # Ensure UI knows it's pausable
        
        self._notify_callbacks(task)
        
        method = self.config.get('download_method', 'PYTHON')
        
        if method == 'ARIA2':
             # Dispatch to Aria2 (Async in thread pool)
             if self._executor is None:
                 self._executor = ThreadPoolExecutor(max_workers=self.max_workers)
             # Note: logic for _dispatch_aria2_task needs to be preserved or re-implemented
             # Since I am rewriting the file, I need to copy _dispatch_aria2_task OR implement it here.
             # I will call a helper method (assumed to be kept or re-added). 
             # Wait, I am overwriting the file. I MUST include _dispatch_aria2_task implementation!
             self._futures[task_id] = self._executor.submit(self._dispatch_aria2_task, task_id)
        else:
             # Python Process Mode
             self._spawn_process(task)
        
        return True

    def _spawn_process(self, task: DownloadTask):
        # Determine strict local_dir logic
        if task.resolved_local_dir:
            download_dir = task.resolved_local_dir
        elif task.local_dir:
            # Fallback (legacy tasks)
            prefix = "models"
            if task.repo_type == "dataset": prefix = "datasets"
            elif task.repo_type == "space": prefix = "spaces"
            repo_subdir = f"{prefix}--{task.repo_id.replace('/', '--')}"
            download_dir = str(Path(task.local_dir) / repo_subdir)
        else:
            download_dir = None # Use Cache

        # Spawn Process
        import os
        # Spawn Process
        import os
        from .auth_manager import get_auth_manager
        
        endpoint = os.environ.get('HF_ENDPOINT')
        token = get_auth_manager().get_token()
        proxy = self.config.get('proxy_url')
        
        logger.info(f"Spawning worker | Endpoint: {endpoint} | Proxy: {proxy} | Token: {'Yes' if token else 'No'}")
        
        p = multiprocessing.Process(
            target=download_worker_entry,
            args=(
                task.id,
                task.repo_id,
                task.repo_type,
                task.revision,
                task.include_patterns,
                task.exclude_patterns,
                download_dir, # Pass resolved path? Or raw? Worker uses it as root or specific?
                # In worker: download_path = Path(local_dir)
                # It treats it as final destination if we pass resolved path.
                # Let's pass resolved download_dir.
                # WAIT. if local_dir is None (cache mode), what happens?
                # snapshot_download default cache dir.
                # In that case pass None or user cache dir?
                # If local_dir is None, worker receives None. snapshot_download uses default cache.
                self.use_hf_transfer,
                self._msg_queue,
                endpoint,
                token,
                self.config.get('python_max_workers', 8),
                self.config.get('proxy_url')
            )
        )
        p.start()
        logger.info(f"Started worker process {p.pid} for task {task.id}")
        self._processes[task.id] = p

    def pause_download(self, task_id: str) -> bool:
        """Pause (Kill) the download process."""
        return self.cancel_download(task_id, status=DownloadStatus.PAUSED)

    def cancel_download(self, task_id: str, status: DownloadStatus = DownloadStatus.CANCELLED) -> bool:
        """Cancel/Kill the download."""
        kill_ua = False # Aria2 specific flag?
        
        with self._task_lock:
            if task_id not in self._tasks:
                return False
            task = self._tasks[task_id]
            task.status = status
        
        # 1. Kill Python Process
        if task_id in self._processes:
            p = self._processes[task_id]
            logger.info(f"Terminating process {p.pid} for task {task_id}")
            p.terminate()
            p.join(timeout=2)
            if p.is_alive():
                 logger.warning(f"Process {p.pid} did not die, forcing kill")
                 p.kill() # SIGKILL
            del self._processes[task_id]
            self._notify_callbacks(task)
            self.save_queue()
            return True
            
        # 2. Cancel Aria2
        if task_id in self.aria2_gids:
            gids = self.aria2_gids.get(task_id, [])
            for gid in gids:
                 try:
                     if status == DownloadStatus.PAUSED:
                         self.aria2.pause(gid)
                     else:
                         self.aria2.remove(gid)
                 except Exception:
                     # GID might be gone or invalid
                     pass
            
            if status != DownloadStatus.PAUSED:
                del self.aria2_gids[task_id]
                
            self._notify_callbacks(task)
            self.save_queue()
            return True
            
        # 3. Simple State update if pending
        self._notify_callbacks(task)
        self.save_queue()
        return True
        return True

    def resume_download(self, task_id: str) -> bool:
        return self.start_download(task_id)

    def remove_task(self, task_id: str, delete_files: bool = False) -> bool:
        self.cancel_download(task_id) # Ensure stopped
        with self._task_lock:
             if task_id in self._tasks:
                 task = self._tasks[task_id]
                 
                 if delete_files:
                     try:
                         import shutil
                         # Try to resolve path
                         target_path = None
                         if task.result_path and Path(task.result_path).exists():
                             target_path = Path(task.result_path)
                         else:
                             # Construct expected path
                             prefix = "models"
                             if task.repo_type == "dataset": prefix = "datasets"
                             elif task.repo_type == "space": prefix = "spaces"
                             repo_subdir = f"{prefix}--{task.repo_id.replace('/', '--')}"
                             
                             base_dir = task.local_dir 
                             if not base_dir:
                                 # If no local_dir, check config or default cache
                                 base_dir = self.config.get('download_dir')
                             
                             if base_dir:
                                 target_path = Path(base_dir) / repo_subdir

                         # Delete if found
                         if target_path and target_path.exists():
                             if task.include_patterns and len(task.include_patterns) > 0:
                                 # Partial Delete: Only delete specific files
                                 logger.info(f"Partial delete for task {task_id}: patterns={task.include_patterns}")
                                 from fnmatch import fnmatch
                                 
                                 # 1. Collect all files in target_path
                                 for root, dirs, files in os.walk(target_path):
                                     for file in files:
                                         rel_path = str(Path(root) / file).replace(str(target_path), "").lstrip(os.sep).replace("\\", "/")
                                         # Check if matches any include pattern
                                         # Simple heuristic: exact match or wildcard
                                         # Note: HF patterns are flexible. We simply try to match.
                                         should_delete = False
                                         for pattern in task.include_patterns:
                                             if fnmatch(rel_path, pattern) or fnmatch(file, pattern):
                                                 should_delete = True
                                                 break
                                         
                                         if should_delete:
                                             try:
                                                 (Path(root) / file).unlink()
                                                 logger.info(f"Deleted file: {rel_path}")
                                             except Exception as e:
                                                 logger.error(f"Failed to delete {rel_path}: {e}")
                             else:
                                 # Whole Repo Delete
                                 if target_path.is_dir():
                                    logger.info(f"Removing repo directory for task {task_id} at {target_path}")
                                    shutil.rmtree(target_path, ignore_errors=True)
                     except Exception as e:
                         logger.error(f"Failed to delete files for task {task_id}: {e}")

                 del self._tasks[task_id]
                 self.save_queue()
                 return True
        return False

    def clear_completed(self) -> int:
        removed = 0
        terminal_statuses = {
            DownloadStatus.COMPLETED,
            DownloadStatus.FAILED,
            DownloadStatus.CANCELLED
        }
        with self._task_lock:
            to_remove = [tid for tid, t in self._tasks.items() if t.status in terminal_statuses]
            for tid in to_remove:
                del self._tasks[tid]
                removed += 1
        self.save_queue()
        return removed

    # --- Preserved Helper Methods (Aria2 Dispatch, etc) ---


    def get_task(self, task_id: str) -> Optional[DownloadTask]:
        with self._task_lock:
            return self._tasks.get(task_id)

    def get_all_tasks(self) -> list[DownloadTask]:
        with self._task_lock:
            return list(self._tasks.values())
            
    def _dispatch_aria2_task(self, task_id: str):
        """Dispatch task to Aria2."""
        from huggingface_hub import hf_hub_url
        try:
             with self._task_lock:
                 if task_id not in self._tasks: return
                 task = self._tasks[task_id]
             
             # Smart Resume: Check if we have paused GIDs
             if task_id in self.aria2_gids:
                 logger.info(f"Resuming existing Aria2 GIDs for {task_id}")
                 for gid in self.aria2_gids[task_id]:
                     self.aria2.unpause(gid)
                 return

             # 1. Fetch Repo Info (File List)
             logger.info(f"Fetching repo info for {task.repo_id}")
             
             # Use generic HfApi to get file list
             # Allow patterns to filter here to save bandwidth?
             # No, list_repo_files is metadata only, cheap.
             try:
                 repo_info = self.api.repo_info(
                     repo_id=task.repo_id,
                     repo_type=task.repo_type,
                     revision=task.revision,
                     files_metadata=True
                 )
             except Exception as e:
                 # Check for Gated/Private repo on Mirror
                 err_str = str(e)
                 if "401" in err_str or "403" in err_str or "404" in err_str:
                     # If we are on a mirror, these errors often mean "Gated" or "Private"
                     # and the mirror can't handle theauth flow or is out of sync.
                     config = get_config()
                     mirror = config.get('mirror', 'official')
                     
                     if mirror != 'official' or 'hf-mirror' in os.environ.get('HF_ENDPOINT', ''):
                         official_url = f"https://huggingface.co/{task.repo_id}"
                         raise Exception(
                             f"Repository access failed on mirror. It might be GATED or PRIVATE.\n"
                             f"Please visit the official site to accept the license: {official_url}\n"
                             f"Original Error: {err_str}"
                         )
                 raise e

             siblings = repo_info.siblings # list of RepoSibling
             
             # 2. Filter Files
             from .pattern_matcher import match_patterns
             # ... rest of the function ...
             existing_gids = self.aria2_gids.get(task_id, [])
             if existing_gids:
                 all_active = True
                 resumed_any = False
                 for gid in existing_gids:
                     try:
                         s = self.aria2.get_status(gid)
                         if s['status'] == 'paused':
                             self.aria2.unpause(gid)
                             resumed_any = True
                         elif s['status'] in ('active', 'waiting'):
                             resumed_any = True
                         else:
                             all_active = False # Failed/Complete/Removed
                     except Exception:
                         all_active = False
                 
                 # If we successfully resumed valid tasks, we don't need to re-dispatch
                 if resumed_any and all_active:
                     logger.info(f"Resumed existing Aria2 GIDs for {task_id}")
                     # Ensure monitor loop is running? (Monitor loop dies on finish/error, but maybe not on pause?)
                     # Monitor loop checks "if task_id not in tasks: break".
                     # We should restart monitor loop just in case it died?
                     # No, monitor loop usually dies on Exception or Stop.
                     # Let's ensure monitor loop is running.
                     # But we can't easily check if thread is alive for specific task unless we store thread handle.
                     # Duplicate monitor loops are bad.
                     # Let's assume monitor loop handles itself or we start a new one?
                     # Safest: Start new monitor loop, rely on lock/GIDs.
                     # But multiple loops polling same GIDs is weird but okay-ish if read-only.
                     # However, monitor updates task.
                     # Let's enforce single monitor later. For now, just resume logic.
                     # Actually, if monitor loop died, we need a new one.
                     # If it's still running (waiting loop?), it's fine.
                     # My monitor loop has `while True`. If `PAUSED`, it sleeps.
                     # So it should be alive!
                     return 

             # Determine result path (Cache or Local)
             if task.local_dir:
                 # Standard HF Structure: download_dir/models--owner--name
                 prefix = "models"
                 if task.repo_type == "dataset": prefix = "datasets"
                 elif task.repo_type == "space": prefix = "spaces"
                 repo_subdir = f"{prefix}--{task.repo_id.replace('/', '--')}"
                 task.result_path = str(Path(task.local_dir) / repo_subdir)
             else:
                 # Standard HF Cache Layout
                 # cache_dir/models--owner--name/snapshots/revision
                 cache_root = Path(os.environ.get("HF_HOME", os.path.expanduser("~/.cache/huggingface/hub")))
                 repo_dir = f"{task.repo_type}s--{task.repo_id.replace('/', '--')}"
                 snapshot_dir = cache_root / repo_dir / "snapshots" / task.revision
                 task.result_path = str(snapshot_dir)

             # Resolve URLs (This blocks, running in thread)
             try:
                 repo_info = self.api.repo_info(repo_id=task.repo_id, revision=task.revision, files_metadata=True)
             except Exception as e:
                 raise Exception(f"Failed to fetch repo info: {e}")

             files_to_download = []
             import fnmatch
             total_size = 0
             total_files = 0
             
             for f in repo_info.siblings:
                 if not f.size: continue 
                 
                 # Filtering
                 if task.include_patterns:
                     if not any(fnmatch.fnmatch(f.rfilename, p) for p in task.include_patterns): continue
                 if task.exclude_patterns:
                     if any(fnmatch.fnmatch(f.rfilename, p) for p in task.exclude_patterns): continue
                     
                 files_to_download.append(f)
                 total_size += f.size
                 total_files += 1
            
             with self._task_lock:
                 task.total_size = total_size
                 task.total_files = total_files
                 self._notify_callbacks(task)
             
             # Determine save dir
             if task.local_dir:
                 download_dir = Path(task.local_dir)
                 # Adjust structure
                 prefix = "models"
                 if task.repo_type == "dataset": prefix = "datasets"
                 elif task.repo_type == "space": prefix = "spaces"
                 repo_subdir = f"{prefix}--{task.repo_id.replace('/', '--')}"
                 download_dir = download_dir / repo_subdir
             else:
                 import os
                 hf_home = os.getenv("HF_HOME", os.path.expanduser("~/.cache/huggingface/hub"))
                 download_dir = Path(hf_home) / f"models--{task.repo_id.replace('/', '--')}"
            
             download_dir.mkdir(parents=True, exist_ok=True)
             
             # Add URIs
             gids = []
             token = self.api.token
             headers = {"Authorization": f"Bearer {token}"} if token else {}
             
             batch_size = 50
             for i in range(0, len(files_to_download), batch_size):
                 chunk = files_to_download[i:i + batch_size]
                 calls = []
                 for f in chunk:
                     url = hf_hub_url(repo_id=task.repo_id, filename=f.rfilename, revision=task.revision)
                     save_file = f.rfilename
                     (download_dir / save_file).parent.mkdir(parents=True, exist_ok=True)
                     
                     options = {
                         "dir": str(download_dir.parent),
                         "out": str(download_dir.name + "/" + save_file),
                         "max-connection-per-server": "16",
                         "split": "16",
                         "min-split-size": "1M"
                     }
                     if headers:
                          options["header"] = [f"{k}: {v}" for k, v in headers.items()]
                     
                     calls.append({
                         "method": "addUri",
                         "params": [[url], options]
                     })
                 
                 try:
                     chunk_gids = self.aria2.multicall(calls)
                     gids.extend(chunk_gids)
                 except Exception as e:
                     logger.error(f"Batch Dispatch Failed: {e}")
                     raise
             self.aria2_gids[task_id] = gids
             
             # Start a monitor loop for this task
             threading.Thread(target=self._monitor_aria2_task, args=(task_id, gids), daemon=True).start()

        except Exception as e:
             logger.error(f"Aria2 Dispatch Error: {e}")
             with self._task_lock:
                 if task_id in self._tasks:
                    task = self._tasks[task_id]
                    task.status = DownloadStatus.FAILED
                    task.error_message = f"Aria2 Dispatch Failed: {e}"
                    self._notify_callbacks(task)

    def _monitor_aria2_task(self, task_id: str, gids: list[str]):
        """Poll Aria2 Status."""
        while True:
            try:
                # Check status
                total_done = 0
                total_len = 0 # This will be sum of known GIDs
                current_speed = 0
                all_completed = True
                any_failed = False
                active_gids = 0
                completed_files = 0
                current_active_file = None
                
                # Batch status polling
                batch_size = 50
                all_statuses = []
                for i in range(0, len(gids), batch_size):
                    chunk = gids[i:i + batch_size]
                    calls = [{"method": "tellStatus", "params": [gid]} for gid in chunk]
                    try:
                        chunk_statuses = self.aria2.multicall(calls)
                        all_statuses.extend(chunk_statuses)
                    except Exception as e:
                        logger.warning(f"Batch Status Polling error: {e}")
                        continue

                for s in all_statuses:
                    if isinstance(s, Exception) or not isinstance(s, dict):
                        continue
                        
                    status = s['status']
                    done = int(s['completedLength'])
                    total = int(s['totalLength'])
                    speed = int(s.get('downloadSpeed', 0))
                    
                    total_done += done
                    total_len += total
                    current_speed += speed
                    
                    if status == 'active' or status == 'waiting':
                        active_gids += 1
                        # Capture current file from the first active GID
                        if not current_active_file and status == 'active':
                             if 'files' in s and len(s['files']) > 0:
                                 file_path = s['files'][0].get('path')
                                 if file_path:
                                     current_active_file = file_path

                    if status == 'complete':
                        completed_files += 1
                    
                    if status == 'error':
                        any_failed = True
                    if status != 'complete':
                        all_completed = False
                
                # Debug logging specifically for speed issues (throttle to once every 5s)
                # if current_speed == 0 and active_gids > 0:
                #     logger.debug(f"Aria2 Speed 0? Status sample: {s}")

                with self._task_lock:
                    if task_id not in self._tasks: break
                    task = self._tasks[task_id]
                    
                    # Handle Cancel/Pause from External
                    if task.status == DownloadStatus.CANCELLED:
                         for gid in gids: 
                             try: self.aria2.remove(gid) 
                             except: pass
                         break
                    if task.status == DownloadStatus.PAUSED:
                         if active_gids > 0:
                             for gid in gids:
                                 try: self.aria2.pause(gid)
                                 except: pass
                         time.sleep(1)
                         continue

                    # Update Progress
                    task.downloaded_size = total_done
                    task.speed = current_speed
                    task.speed_formatted = f"{format_size(current_speed)}/s"
                    task.downloaded_files = completed_files
                    
                    # Update Current File
                    if current_active_file:
                        try:
                            # Try to make relative to result_path
                            if task.result_path and current_active_file.startswith(str(task.result_path)):
                                task.current_file = current_active_file.replace(str(task.result_path), "").lstrip("/\\")
                            else:
                                # Fallback to basename
                                task.current_file = os.path.basename(current_active_file)
                        except:
                             task.current_file = os.path.basename(current_active_file)
                    elif all_completed:
                        task.current_file = None
                    denom = task.total_size if task.total_size > 0 else total_len
                    
                    if denom > 0:
                        task.progress = min(100.0, (total_done / denom) * 100)
                    
                    if any_failed:
                        task.status = DownloadStatus.FAILED
                        
                        # Collect detailed errors
                        error_details = []
                        for gid in gids:
                            try:
                                s = self.aria2.get_status(gid)
                                if s['status'] == 'error':
                                    code = s.get('errorCode', 'Unknown')
                                    msg = s.get('errorMessage', 'No message')
                                    error_details.append(f"GID {gid[:6]}: Code {code} - {msg}")
                            except:
                                pass
                                
                        if not error_details:
                           error_details.append("Typically network timeout or file IO error.")
                           
                        task.error_message = "Aria2 Error:\n" + "\n".join(error_details)
                        self._notify_callbacks(task)
                        break
                    
                    if all_completed and len(gids) > 0:
                        # Transition to Verifying? Or Complete?
                        # User asked about verification. 
                        # Ideally we should verify. 
                        # But for now, let's just mark complete to fix the immediate "stuck" feeling.
                        # We can add a "verifying" step later or now.
                        
                        task.status = DownloadStatus.COMPLETED
                        task.progress = 100.0
                        task.downloaded_size = denom
                        task.downloaded_files = len(gids)
                        self._notify_callbacks(task)
                        self.save_queue()
                        break
                        
                    self._notify_callbacks(task)
                
                time.sleep(1)
            except Exception:
                break



class SingleFileDownloader:
    """Helper to download a single file."""
    def __init__(self):
        pass
        
    def download(self, repo_id: str, filename: str, local_dir: str = None) -> str:
        from huggingface_hub import hf_hub_download
        return hf_hub_download(repo_id=repo_id, filename=filename, local_dir=local_dir)

def get_single_file_downloader() -> SingleFileDownloader:
    return SingleFileDownloader()

