from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from typing import List
from ..dependencies import get_downloader
from ..models.download import DownloadTaskModel, DownloadQueueResponse, StartDownloadRequest, ActionResponse
from ...core.downloader import HFDownloader, DuplicateDownloadError

router = APIRouter(prefix="/downloads", tags=["Downloads"])

@router.get("/", response_model=DownloadQueueResponse)
async def get_queue(downloader: HFDownloader = Depends(get_downloader)):
    """Get the current download queue."""
    tasks = downloader.get_all_tasks()
    return {
        "tasks": [
            DownloadTaskModel(
                id=t.id,
                repo_id=t.repo_id,
                repo_type=t.repo_type,
                revision=t.revision,
                status=t.status.name,
                progress=t.progress,
                downloaded_size=t.downloaded_size,
                total_size=t.total_size,
                speed=t.speed,
                speed_formatted=t.speed_formatted or "0 B/s",
                current_file=t.current_file,
                # Fix: If result_path is empty OR incorrectly set to base download_dir, use resolved_local_dir
                result_path=(t.result_path if (t.result_path and t.result_path != downloader.config.get('download_dir')) else t.resolved_local_dir),
                total_files=getattr(t, 'total_files', 0),
                downloaded_files=getattr(t, 'downloaded_files', 0),
                include_patterns=t.include_patterns,
                exclude_patterns=t.exclude_patterns,
                error_message=t.error_message,
                pausable=t.pausable if hasattr(t, 'pausable') else True,
                use_hf_transfer=t.use_hf_transfer if hasattr(t, 'use_hf_transfer') else False
            ) for t in tasks
        ]
    }

@router.post("/", response_model=ActionResponse)
def start_download(req: StartDownloadRequest, downloader: HFDownloader = Depends(get_downloader)):
    """Add a new download task."""
    # Read download directory from user settings
    download_dir = downloader.config.get('download_dir', '').strip() or None
    
    try:
        task_id = downloader.queue_download(
            repo_id=req.repo_id,
            repo_type=req.repo_type,
            revision=req.revision,
            include_patterns=req.allow_patterns,
            exclude_patterns=req.ignore_patterns,
            local_dir=download_dir,
            duplicate_action=req.duplicate_action
        )
        if task_id:
            success = downloader.start_download(task_id)
            return {"success": success, "message": f"Task {task_id} started" if success else "Failed to start task"}
        return {"success": False, "message": "Failed to queue task"}
        
    except DuplicateDownloadError as e:
        return JSONResponse(
            status_code=409,
            content={
                "success": False,
                "error_code": "DUPLICATE_DOWNLOAD",
                "message": str(e),
                "path": e.path
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{task_id:path}/pause", response_model=ActionResponse)
def pause_download(task_id: str, downloader: HFDownloader = Depends(get_downloader)):
    """Pause a download task."""
    success = downloader.pause_download(task_id)
    return {"success": success, "message": "Paused" if success else "Failed to pause"}

@router.post("/{task_id:path}/resume", response_model=ActionResponse)
def resume_download(task_id: str, downloader: HFDownloader = Depends(get_downloader)):
    """Resume a download task."""
    success = downloader.resume_download(task_id)
    return {"success": success, "message": "Resumed" if success else "Failed to resume"}

@router.post("/{task_id:path}/cancel", response_model=ActionResponse)
def cancel_download(task_id: str, downloader: HFDownloader = Depends(get_downloader)):
    """Cancel a download task."""
    success = downloader.cancel_download(task_id)
    return {"success": success, "message": "Cancelled" if success else "Failed to cancel"}

@router.delete("/{task_id:path}", response_model=ActionResponse)
def remove_download(task_id: str, delete_files: bool = False, downloader: HFDownloader = Depends(get_downloader)):
    """Remove a download task from queue."""
    success = downloader.remove_task(task_id, delete_files=delete_files)
    return {"success": success, "message": "Removed" if success else "Failed to remove"}

@router.post("/open-folder", response_model=ActionResponse)
async def open_download_folder(downloader: HFDownloader = Depends(get_downloader)):
    """Open the configured download directory."""
    import platform
    import subprocess
    import os
    
    # Get configured dir or fallback to HF cache
    path = downloader.config.get('download_dir', '').strip()
    if not path:
        from huggingface_hub import constants
        path = str(constants.HF_HUB_CACHE)
    
    if not os.path.exists(path):
         try:
             os.makedirs(path, exist_ok=True)
         except Exception as e:
             return {"success": False, "message": f"Path does not exist and cannot be created: {str(e)}"}
             
    try:
        if platform.system() == "Windows":
            os.startfile(path)
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return {"success": True, "message": "Opened"}
    except Exception as e:
        return {"success": False, "message": str(e)}
