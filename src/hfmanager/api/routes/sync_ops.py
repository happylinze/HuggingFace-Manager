from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from pathlib import Path
import os
from ...core.auth_manager import get_auth_manager
from ...core.cache_manager import CacheManager
from ...core.downloader import HFDownloader
from ..dependencies import get_cache_manager, get_downloader
from huggingface_hub import HfApi, snapshot_download, upload_folder
from huggingface_hub.utils import RepositoryNotFoundError

router = APIRouter(prefix="/sync", tags=["SyncOps"])

class SyncStatusResponse(BaseModel):
    is_workspace: bool  # True if it's a writable workspace (not symlinked cache)
    sync_status: str    # "synced", "ahead", "behind", "conflict", "unknown"
    local_commit: Optional[str] = None
    remote_commit: Optional[str] = None
    changed_files: List[str] = []

class SyncRequest(BaseModel):
    repo_id: str
    repo_type: str = "model"
    local_path: str
    commit_message: Optional[str] = None
    force: bool = False

@router.post("/status", response_model=SyncStatusResponse)
def get_sync_status(request: SyncRequest):
    """
    Check sync status of a local folder against remote repo.
    """
    try:
        path = Path(request.local_path)
        if not path.exists():
             return SyncStatusResponse(is_workspace=False, sync_status="unknown")
        
        # Determine status
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        api = HfApi()
        
        # Get remote info
        try:
            repo_info = api.repo_info(
                repo_id=request.repo_id, 
                repo_type=request.repo_type if request.repo_type != "model" else None,
                token=token
            )
            remote_sha = repo_info.sha
        except Exception:
            return SyncStatusResponse(is_workspace=True, sync_status="unknown")

        local_sha = None
        refs_path = path / ".huggingface" / "refs" / "main"
        if refs_path.exists():
            local_sha = refs_path.read_text().strip()
        
        status = "unknown"
        if local_sha:
            if local_sha == remote_sha:
                status = "synced"
            else:
                status = "conflict" # If they differ, we call it conflict/out_of_sync
        else:
            # Check if directory is empty
            if any(path.iterdir()):
                status = "out_of_sync" # Has files but no .huggingface meta
            else:
                status = "synced" # Empty is technically in sync with a new repo or we haven't cloned yet
        
        return SyncStatusResponse(
            is_workspace=True,
            sync_status=status,
            local_commit=local_sha,
            remote_commit=remote_sha
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pull")
def pull_repo(request: SyncRequest):
    """
    Pull changes from remote to local (Download/Update).
    """
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        
        # If force, we might want to clear local first? 
        # But snapshot_download is efficient.
        path = snapshot_download(
            repo_id=request.repo_id,
            repo_type=request.repo_type if request.repo_type != "model" else None,
            local_dir=request.local_path,
            local_dir_use_symlinks=False,
            token=token,
            resume_download=True
        )
        
        return {"success": True, "path": path}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

@router.post("/push")
def push_repo(request: SyncRequest):
    """
    Push changes from local to remote (Upload).
    """
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        
        # upload_folder is destructive by default (matches local to remote)
        commit_info = upload_folder(
            folder_path=request.local_path,
            repo_id=request.repo_id,
            repo_type=request.repo_type if request.repo_type != "model" else None,
            commit_message=request.commit_message or "Update from HFManager",
            token=token,
            delete_patterns="*" if request.force else None # If force, delete remote files not in local
        )
        
        return {
            "success": True, 
            "commit_url": commit_info.commit_url,
            "oid": commit_info.oid
        }
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

