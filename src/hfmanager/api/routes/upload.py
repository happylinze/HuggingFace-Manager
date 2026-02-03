from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import List, Optional
from hfmanager.core.uploader import HFUploader
from hfmanager.core.auth_manager import get_auth_manager
from starlette.concurrency import run_in_threadpool
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class ScanRequest(BaseModel):
    path: str

class CommitRequest(BaseModel):
    path: str
    repo_id: str
    repo_type: str = "model"
    files: List[str]
    commit_message: str
    revision: str = "main"
    create_pr: bool = False

@router.post("/scan")
async def scan_local_folder(req: ScanRequest):
    """
    Scan a local folder and return file list with size/lfs info.
    """
    try:
        # Check if auth available (not strictly needed for scan but good practice)
        token = get_auth_manager().get_token()
        uploader = HFUploader(token)
        
        # Run blocking scan in threadpool
        result = await run_in_threadpool(uploader.scan_directory, req.path)
        return result
    except Exception as e:
        logger.error(f"Scan failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/commit")
async def commit_files(req: CommitRequest, background_tasks: BackgroundTasks):
    """
    Execute upload. Ideally this should be a background task with progress tracking.
    For MVP, we wait or use simple background task without progress socket first?
    The Implementation Plan mentioned progress tracking. 
    Uploader code doesn't have WS hook yet.
    Let's execute it and return success for now, or await it if it's not too huge.
    
    Betting on 'await' for MVP reliability, even if it blocks connection for a bit.
    Actually, for large uploads, we MUST use background task or client will timeout.
    
    Status: We will await it for now to return immediate result, assuming user won't upload 50GB in one go without progress UI.
    WAIT: If we don't have progress UI, long headers will timeout.
    Let's run it in threadpool and return result.
    """
    try:
        token = get_auth_manager().get_token()
        if not token:
            raise HTTPException(status_code=401, detail="Please login first")
            
        uploader = HFUploader(token)
        
        logger.info(f"Received commit request for {req.repo_id}, {len(req.files)} files")
        
        # Run blocking upload
        result = await run_in_threadpool(
            uploader.upload_files,
            repo_id=req.repo_id,
            repo_type=req.repo_type,
            base_path=req.path,
            file_list=req.files,
            commit_message=req.commit_message,
            revision=req.revision,
            create_pr=req.create_pr
        )
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Commit failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
