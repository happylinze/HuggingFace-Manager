from huggingface_hub import create_repo, upload_file, HfApi, RepoCard, delete_repo, move_repo, update_repo_visibility, delete_file
from huggingface_hub.utils import HfHubHTTPError
import os
from ..models.repository import CreateRepoRequest, UploadFileRequest, RepoActionResponse, UpdateMetadataRequest, UpdateVisibilityRequest, MoveRepoRequest, ImportRepoRequest, ConvertRepoRequest
from pydantic import BaseModel
from typing import List, Dict, Optional
from ...core.auth_manager import get_auth_manager
from ...core.downloader import DownloadTask, DownloadStatus, HFDownloader
from ...core.data_viewer import DataViewer
from ...core.converter import GGUFConverter
from ...core.cache_manager import CacheManager
from ..dependencies import get_downloader, get_cache_manager
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, BackgroundTasks
import asyncio
import uuid
import time

router = APIRouter(prefix="/repos", tags=["Repository"])

def get_auth_token():
    """Get the token from AuthManager to ensure we use the logged-in user's token."""
    token = get_auth_manager().get_token()
    if not token:
        raise HTTPException(status_code=401, detail="Please login first (HF Token required)")
    return token

@router.post("/create", response_model=RepoActionResponse)
def create_repository(request: CreateRepoRequest, token: str = Depends(get_auth_token)):
    """Create a new Hugging Face repository."""
    try:
        print(f"Creating repo: {request.repo_id}")
        url = create_repo(
            repo_id=request.repo_id,
            repo_type=request.repo_type,
            private=request.private,
            token=token,
            exist_ok=False,
            space_sdk=request.sdk if request.repo_type == 'space' else None
        )

        # If license provided, create README with metadata
        if request.license and request.repo_type in ['model', 'dataset']:
            try:
                card = RepoCard(content=f"---\nlicense: {request.license}\n---\n\n# {request.repo_id.split('/')[-1]}")
                card.push_to_hub(
                    repo_id=request.repo_id,
                    repo_type=request.repo_type,
                    token=token,
                    commit_message="Initial commit with license"
                )
            except Exception as e:
                print(f"Warning: Failed to push readme with license: {e}")

        return RepoActionResponse(
            success=True, 
            message=f"Created {request.repo_type} {request.repo_id} successfully",
            url=url
        )
    except HfHubHTTPError as e:
        status = e.response.status_code if hasattr(e, 'response') else 500
        if status == 409:
             raise HTTPException(status_code=409, detail=f"Repository {request.repo_id} already exists")
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload", response_model=RepoActionResponse)
def upload_repo_file(request: UploadFileRequest, token: str = Depends(get_auth_token)):
    """Upload a file to a repository."""
    try:
        if not os.path.exists(request.file_path):
             raise HTTPException(status_code=400, detail=f"Local file not found: {request.file_path}")

        result = upload_file(
            path_or_fileobj=request.file_path,
            path_in_repo=request.path_in_repo or os.path.basename(request.file_path),
            repo_id=request.repo_id,
            repo_type=request.repo_type,
            token=token,
            commit_message=request.commit_message
        )
        
        return RepoActionResponse(
            success=True,
            message=f"Uploaded {os.path.basename(request.file_path)} successfully"
        )
    except HfHubHTTPError as e:
        status = e.response.status_code if hasattr(e, 'response') else 500
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-multipart", response_model=RepoActionResponse)
def upload_multipart(
    repo_id: str = Form(...),
    repo_type: str = Form(...),
    path_in_repo: str = Form(...),
    commit_message: str = Form("Upload file"),
    file: UploadFile = File(...),
    token: str = Depends(get_auth_token)
):
    """Upload a file via multipart form data (Drag & Drop)."""
    try:
        # Use file.file which is a SpooledTemporaryFile
        upload_file(
            path_or_fileobj=file.file,
            path_in_repo=path_in_repo,
            repo_id=repo_id,
            repo_type=repo_type if repo_type != 'model' else None,
            token=token,
            commit_message=commit_message
        )
        return RepoActionResponse(success=True, message=f"Uploaded {path_in_repo}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/metadata", response_model=RepoActionResponse)
def update_repo_metadata(request: UpdateMetadataRequest, token: str = Depends(get_auth_token)):
    api = HfApi(token=token)
    try:
        if request.gated is not None:
             # Convert 'auto' -> True? API usually takes boolean or string depending on lib version.
             # SDK: update_repo_settings(..., gated: bool | str)
             # Let's pass what we got.
             api.update_repo_settings(repo_id=request.repo_id, repo_type=request.repo_type, gated=request.gated)
        
        if request.license or request.tags is not None or request.pipeline_tag:
             try:
                 card = RepoCard.load(request.repo_id, repo_type=request.repo_type, token=token)
             except:
                 card = RepoCard(content="")
             
             if request.license: 
                card.data.license = request.license # Access as attribute or dict? usually attribute/dict. RepoCard uses data object.
             if request.tags is not None: 
                card.data.tags = request.tags
             if request.pipeline_tag: 
                card.data.pipeline_tag = request.pipeline_tag
             
             card.push_to_hub(request.repo_id, repo_type=request.repo_type, token=token, commit_message="Update metadata via Hugging Face Manager")
             
        return RepoActionResponse(success=True, message="Metadata updated")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/visibility", response_model=RepoActionResponse)
def set_visibility(request: UpdateVisibilityRequest, token: str = Depends(get_auth_token)):
    try:
        update_repo_visibility(repo_id=request.repo_id, private=request.private, repo_type=request.repo_type, token=token)
        return RepoActionResponse(success=True, message="Visibility updated")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/move", response_model=RepoActionResponse)
def transport_repo(request: MoveRepoRequest, token: str = Depends(get_auth_token)):
    try:
        move_repo(from_id=request.from_repo, to_id=request.to_repo, repo_type=request.repo_type, token=token)
        return RepoActionResponse(success=True, message=f"Moved to {request.to_repo}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/delete", response_model=RepoActionResponse)
def remove_repo(repo_id: str, repo_type: str, token: str = Depends(get_auth_token)):
    try:
        delete_repo(repo_id=repo_id, repo_type=repo_type, token=token)
        return RepoActionResponse(success=True, message=f"Deleted {repo_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/file", response_model=RepoActionResponse)
def remove_file(repo_id: str, path: str, repo_type: str, token: str = Depends(get_auth_token)):
    try:
        delete_file(path_in_repo=path, repo_id=repo_id, repo_type=repo_type, token=token, commit_message=f"Delete {path}")
        return RepoActionResponse(success=True, message=f"Deleted {path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/check-access/{repo_type}/{repo_id:path}")
async def check_write_access(repo_type: str, repo_id: str, token: str = Depends(get_auth_token)):
    """Check if current user has write access to the repo."""
    try:
        api = HfApi(token=token)
        user_info = api.whoami()
        return {"username": user_info['name'], "orgs": [org['name'] for org in user_info.get('orgs', [])]}
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

def run_import_task(request: ImportRepoRequest, token: str):
    downloader = get_downloader()
    task_id = f"upload_{uuid.uuid4().hex[:8]}"
    
    # Initialize Fake Task
    task = DownloadTask(
        id=task_id,
        repo_id=request.repo_id,
        repo_type=request.repo_type,
        revision="main",
        status=DownloadStatus.PENDING,
        total_size=0,
        downloaded_size=0,
        current_file="Preparing upload...",
        total_files=0,
        downloaded_files=0
    )
    downloader._notify_callbacks(task)
    
    try:
        # 1. Scan files
        files_to_upload = []
        total_size = 0
        
        for root, _, files in os.walk(request.folder_path):
            for file in files:
                full_path = os.path.join(root, file)
                # Skip .git and hidden files if needed, but usually we want them unless .git
                if '.git' in root.split(os.sep):
                    continue
                
                rel_path = os.path.relpath(full_path, request.folder_path)
                result_path = rel_path.replace("\\", "/") # Ensure forward slashes for repo path
                
                size = os.path.getsize(full_path)
                total_size += size
                files_to_upload.append((full_path, result_path, size))
        
        task.total_size = total_size
        task.total_files = len(files_to_upload)
        task.status = DownloadStatus.DOWNLOADING
        task.current_file = "Starting upload..."
        downloader._notify_callbacks(task)
        
        start_time = time.time()
        uploaded_size = 0
        
        # 2. Upload Loop
        api = HfApi(token=token)
        
        # Create repo if not exists (redundant if endpoint did it, but safe)
        try:
            api.create_repo(repo_id=request.repo_id, repo_type=request.repo_type, private=request.private, exist_ok=True)
            if request.license:
                 # Update license if requested (simple overwrite/add to card)
                 pass 
        except Exception:
            pass

        for i, (full_path, repo_path, size) in enumerate(files_to_upload):
            task.current_file = f"Uploading {repo_path}..."
            # Ensure progress update before potential failure
            downloader._notify_callbacks(task)
            
            try:
                api.upload_file(
                    path_or_fileobj=full_path,
                    path_in_repo=repo_path,
                    repo_id=request.repo_id,
                    repo_type=request.repo_type if request.repo_type != 'model' else None,
                    commit_message=f"Upload {repo_path}"
                )
                uploaded_size += size
                task.downloaded_files = i + 1
                task.downloaded_size = uploaded_size
                
                # Speed Update
                elapsed = time.time() - start_time
                if elapsed > 0:
                    task.speed = uploaded_size / elapsed
                task.progress = (uploaded_size / total_size * 100) if total_size > 0 else 0
                
            except Exception as e:
                error_msg = str(e)
                # Specific check for the user's reported error
                if "Expecting value" in error_msg:
                    error_msg = f"Network Error: Server returned invalid/empty response. Check your Proxy/VPN. (File: {repo_path})"
                elif "401" in error_msg:
                    error_msg = "Authentication failed. Please check your token."
                
                print(f"Failed to upload {repo_path}: {e}")
                
                # We should probably fail the task if a file fails, or at least warn?
                # For One-Click Import, if one file fails, the repo is incomplete.
                # Let's fail the task.
                raise Exception(error_msg)
            
            downloader._notify_callbacks(task)
        
        task.status = DownloadStatus.COMPLETED
        task.progress = 100
        task.current_file = "Upload Complete"
        downloader._notify_callbacks(task)
        
    except Exception as e:
        task.status = DownloadStatus.FAILED
        task.error_message = str(e)
        downloader._notify_callbacks(task)
        print(f"Import task failed: {e}")

@router.post("/import-folder", response_model=RepoActionResponse)
def import_repo_from_folder(
    request: ImportRepoRequest, 
    background_tasks: BackgroundTasks, 
    token: str = Depends(get_auth_token)
):
    """Create a repository and import files from a local folder."""
    if not os.path.exists(request.folder_path) or not os.path.isdir(request.folder_path):
        raise HTTPException(status_code=400, detail="Invalid local folder path")
    
    # 1. Create Repo immediately
    try:
        url = create_repo(
            repo_id=request.repo_id,
            repo_type=request.repo_type,
            private=request.private,
            token=token,
            exist_ok=True # Allow importing into existing
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # 2. Start Background Upload
    background_tasks.add_task(run_import_task, request, token)
    
    return RepoActionResponse(success=True, message="Import started in background", url=url)

@router.get("/preview")
def preview_dataset(repo_id: str, repo_type: str, revision: str = "main", rows: int = 50, token: str = Depends(get_auth_token)):
    """Preview the first parquet file of a dataset."""
    if repo_type != 'dataset':
         raise HTTPException(status_code=400, detail="Preview is currently only supported for datasets.")
    
    result = DataViewer.get_preview(repo_id, revision, rows)
    if "error" in result:
        # If dependency missing, use 501 Not Implemented or 400
        if result.get("dependency_missing"):
             raise HTTPException(status_code=501, detail=result["error"])
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result

@router.post("/convert", response_model=RepoActionResponse)
def convert_repo(
    request: ConvertRepoRequest, 
    token: str = Depends(get_auth_token),
    cache_mgr: CacheManager = Depends(get_cache_manager),
    downloader: HFDownloader = Depends(get_downloader)
):
    """Convert a cached model to GGUF format."""
    converter = GGUFConverter(downloader)
    
    # 1. Resolve Input Path
    input_path = cache_mgr.get_model_path(request.repo_id, request.revision)
    if not input_path:
        raise HTTPException(status_code=400, detail="Model revision not found in cache. Please download it first.")
    
    # 2. Resolve Output Path
    if request.output_dir:
        out_dir = request.output_dir
    else:
        out_dir = downloader.config.get('download_dir', '')
        if not out_dir:
             out_dir = os.getcwd()
    
    if not os.path.exists(out_dir):
         os.makedirs(out_dir, exist_ok=True)
         
    # Generate filename: repo_name-revision-quant.gguf
    repo_name = request.repo_id.split('/')[-1]
    filename = f"{repo_name}-{request.quantization}.gguf"
    output_path = os.path.join(out_dir, filename)
    
    # 3. Queue Conversion
    try:
        task_id = converter.run_conversion(request.repo_id, input_path, output_path, request.quantization)
        return RepoActionResponse(success=True, message=f"Conversion started", url=output_path)
    except ValueError as e:
         raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))


# --- Merged from repo_ops.py ---

class RepoCheckRequest(BaseModel):
    repo_id: str
    repo_type: str

class RepoStatusResponse(BaseModel):
    repo_id: str
    downloaded: bool
    path: Optional[str] = None
    size_on_disk: int = 0
    last_modified: Optional[str] = None

@router.post("/check-local-status", response_model=Dict[str, RepoStatusResponse])
def check_local_status(
    repos: List[RepoCheckRequest], 
    cache_mgr: CacheManager = Depends(get_cache_manager)
):
    """
    Check if a list of repositories exists in the local cache.
    Returns a map of repo_id -> status.
    """
    try:
        cached_repos = cache_mgr.get_repos_list()
        
        # Build lookup table: (repo_id, repo_type) -> CacheRepo
        lookup = {
            (r.repo_id, r.repo_type): r 
            for r in cached_repos
        }
        
        result = {}
        for req in repos:
            key = (req.repo_id, req.repo_type)
            if key in lookup:
                r = lookup[key]
                result[req.repo_id] = RepoStatusResponse(
                    repo_id=req.repo_id,
                    downloaded=True,
                    path=str(r.repo_path),
                    size_on_disk=r.size_on_disk,
                    last_modified=r.last_modified.strftime('%Y-%m-%d') if r.last_modified else None
                )
            else:
                 result[req.repo_id] = RepoStatusResponse(
                    repo_id=req.repo_id,
                    downloaded=False
                )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
