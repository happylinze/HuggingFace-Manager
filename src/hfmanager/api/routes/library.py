from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict
from pydantic import BaseModel
from ...core.library_manager import get_library_manager

router = APIRouter(prefix="/library", tags=["ExternalLibrary"])

class PathRequest(BaseModel):
    path: str

@router.get("/paths", response_model=List[str])
def get_library_paths():
    """Get all registered external library paths."""
    return get_library_manager().get_paths()

@router.post("/paths", response_model=List[str])
def add_library_path(request: PathRequest):
    """Add a new external library path."""
    try:
        success = get_library_manager().add_path(request.path)
        if not success:
            raise HTTPException(status_code=400, detail="Path already exists or invalid")
        return get_library_manager().get_paths()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/paths", response_model=List[str])
def remove_library_path(request: PathRequest):
    """Remove a path from external library registry."""
    try:
        get_library_manager().remove_path(request.path)
        return get_library_manager().get_paths()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from ..models.cache import CacheRepoModel

@router.get("/scan", response_model=List[CacheRepoModel])
def scan_library():
    """Scan all external registered paths for models/datasets."""
    try:
        repos = get_library_manager().scan_library()
        return [
            CacheRepoModel(
                repo_id=r.repo_id,
                repo_type=r.repo_type,
                size_on_disk=r.size_on_disk,
                size_formatted=r.size_formatted,
                last_modified=r.last_modified.strftime('%Y-%m-%d %H:%M:%S') if r.last_modified else 'Unknown',
                revisions_count=len(r.revisions),
                repo_path=r.repo_path
            ) for r in repos
        ]
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
