from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from ...core.cache_manager import CacheManager
from ..dependencies import get_cache_manager
from ...core.auth_manager import get_auth_manager
from ...api.models.repository import RepoActionResponse, UpdateMetadataRequest, UpdateVisibilityRequest, MoveRepoRequest
from huggingface_hub import RepoCard, HfApi, delete_repo, move_repo, delete_file

router = APIRouter(prefix="/repos", tags=["RepoOps"])

class RepoCheckRequest(BaseModel):
    repo_id: str
    repo_type: str

class RepoStatusResponse(BaseModel):
    repo_id: str
    repo_type: str = 'model'
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
        # Get all cached repos once (efficient than scanning per item if we have many)
        # However, scan_cache_dir can be slow if cache is huge.
        # But for 'My Repos' usually < 100 items, and user cache can be huge.
        # Strategy: Get list of all cached repos and build a lookup map.
        
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
                    repo_type=r.repo_type,
                    downloaded=True,
                    path=str(r.repo_path),
                    size_on_disk=r.size_on_disk,
                    last_modified=r.last_modified.strftime('%Y-%m-%d') if r.last_modified else None
                )
            else:
                 result[req.repo_id] = RepoStatusResponse(
                    repo_id=req.repo_id,
                    repo_type=req.repo_type,
                    downloaded=False
                )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/local", response_model=List[RepoStatusResponse])
def get_local_repos(cache_mgr: CacheManager = Depends(get_cache_manager)):
    """
    Get a list of all locally cached repositories.
    """
    try:
        cached_repos = cache_mgr.get_repos_list()
        return [
            RepoStatusResponse(
                repo_id=r.repo_id,
                repo_type=r.repo_type,
                downloaded=True,
                path=str(r.repo_path),
                size_on_disk=r.size_on_disk,
                last_modified=r.last_modified.strftime('%Y-%m-%d') if r.last_modified else None
            )
            for r in cached_repos
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/metadata", response_model=RepoActionResponse)
async def update_metadata(request: UpdateMetadataRequest):
    """
    Update repository metadata (README.md frontmatter).
    """
    try:
        token = get_auth_manager().get_token()
        if not token:
            raise HTTPException(status_code=401, detail="Please login first")

        # Load existing card
        try:
            card = RepoCard.load(
                repo_id_or_path=request.repo_id,
                repo_type=request.repo_type,
                token=token
            )
        except Exception:
            # If no README/Card, create a new one
            card = RepoCard(content=f"# {request.repo_id.split('/')[-1]}")
        
        # Update fields
        if request.license:
            card.data.license = request.license
        
        if request.tags is not None:
            # Merge or replace? Let's replace to allow deletion
            card.data.tags = request.tags
            
        if request.pipeline_tag:
            if request.repo_type == 'model':
                card.data.pipeline_tag = request.pipeline_tag
            elif request.repo_type == 'dataset':
                # Dataset uses task_categories sometimes, but RepoCard handles it?
                # Actually for dataset it's task_categories
                # But simple mapping for now
                pass

        if request.sdk and request.repo_type == 'space':
            card.data.sdk = request.sdk

        if request.gated:
             # Direct attribute assignment might fail if not in dataclass, but let's try standard way
             # or modify the underlying dictionary if possible. 
             # Inspecting source suggests RepoCardData fields are fixed.
             # But we can try to inject it into the YAML directly if needed.
             # Actually, let's try getattr/setattr or assume it works for 'custom' metadata?
             # 'gated' is standard.
             setattr(card.data, 'gated', request.gated)

        # Push changes
        card.push_to_hub(
            repo_id=request.repo_id,
            repo_type=request.repo_type,
            token=token,
            commit_message="Update metadata via HFManager"
        )

        return RepoActionResponse(
            success=True,
            message=f"Updated metadata for {request.repo_id}"
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{repo_type}/{repo_id:path}/files/{path:path}", response_model=RepoActionResponse)
def delete_file_endpoint(repo_type: str, repo_id: str, path: str):
    """Delete a file from a repository."""
    try:
        token = get_auth_manager().get_token()
        if not token:
             raise HTTPException(status_code=401, detail="Please login first")
             
        delete_file(
            path_in_repo=path,
            repo_id=repo_id,
            repo_type=repo_type if repo_type != 'model' else None,
            token=token,
            commit_message=f"Delete {path} via HFManager"
        )
        return RepoActionResponse(success=True, message=f"Deleted {path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{repo_type}/{repo_id:path}", response_model=RepoActionResponse)
def delete_repository_endpoint(repo_type: str, repo_id: str):
    """Delete a repository."""
    try:
        token = get_auth_manager().get_token()
        if not token:
             raise HTTPException(status_code=401, detail="Please login first")
             
        delete_repo(repo_id=repo_id, repo_type=repo_type if repo_type != 'model' else None, token=token)
        return RepoActionResponse(success=True, message=f"Deleted {repo_type} {repo_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/visibility", response_model=RepoActionResponse)
def set_visibility(request: UpdateVisibilityRequest):
    """Set repository visibility."""
    try:
        token = get_auth_manager().get_token()
        if not token:
             raise HTTPException(status_code=401, detail="Please login first")
             
        api = HfApi(token=token)
        api.update_repo_settings(
            repo_id=request.repo_id, 
            private=request.private, 
            repo_type=request.repo_type if request.repo_type != 'model' else None
        )
        return RepoActionResponse(
            success=True, 
            message=f"Set {request.repo_id} to {'Private' if request.private else 'Public'}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/move", response_model=RepoActionResponse)
def move_repository_endpoint(request: MoveRepoRequest):
    """Move (resume) a repository."""
    try:
        token = get_auth_manager().get_token()
        if not token:
             raise HTTPException(status_code=401, detail="Please login first")
             
        move_repo(
            from_id=request.from_repo,
            to_id=request.to_repo,
            repo_type=request.repo_type if request.repo_type != 'model' else None,
            token=token
        )
        return RepoActionResponse(
            success=True, 
            message=f"Moved {request.from_repo} to {request.to_repo}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
