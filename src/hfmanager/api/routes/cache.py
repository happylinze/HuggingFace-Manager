from fastapi import APIRouter, Depends, HTTPException
from ..dependencies import get_cache_manager
from ..models.cache import CacheResponse, CacheRepoModel
from ..models.download import ActionResponse
from ...core.cache_manager import CacheManager
from ...utils.system import format_size
from typing import Optional

router = APIRouter(prefix="/cache", tags=["Cache"])

@router.get("/", response_model=CacheResponse)
def get_cache(refresh: bool = False, cache_mgr: CacheManager = Depends(get_cache_manager)):
    """Get all cached repositories."""
    try:
        # print("DEBUG: entering get_cache")
        repos = cache_mgr.get_repos_list(force_refresh=refresh)
        print(f"DEBUG: got {len(repos)} repos from manager")
        total_size = sum(r.size_on_disk for r in repos)
        
        from datetime import datetime
        from huggingface_hub import constants
        
        result = {
            "repos": [
                CacheRepoModel(
                    repo_id=r.repo_id,
                    repo_type=r.repo_type,
                    size_on_disk=r.size_on_disk,
                    size_formatted=r.size_formatted,
                    last_modified=r.last_modified.strftime('%Y-%m-%d %H:%M:%S') if r.last_modified else 'Unknown',
                    revisions_count=len(r.revisions),
                    repo_path=r.repo_path
                ) for r in repos
            ],
            "total_size": total_size,
            "total_size_formatted": format_size(total_size),
            "root_path": str(cache_mgr.cache_dir) if cache_mgr.cache_dir else str(constants.HF_HUB_CACHE)
        }
        print("DEBUG: successfully constructed response")
        return result
    except Exception as e:
        print(f"DEBUG: error in get_cache: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{repo_type}/{repo_id:path}", response_model=ActionResponse)
def delete_repo_cache(repo_type: str, repo_id: str, cache_mgr: CacheManager = Depends(get_cache_manager)):
    """Delete cache for a specific repository."""
    try:
        repos = cache_mgr.get_repos_list()
        target = next((r for r in repos if r.repo_id == repo_id and r.repo_type == repo_type), None)
        
        if not target:
            return {"success": False, "message": "Repository not found in cache"}
            
        hashes = [rev['commit_hash'] for rev in target.revisions]
        result = cache_mgr.delete_revisions(hashes)
        
        return {"success": result.get('success', False), "message": result.get('message', 'Deleted')}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{repo_type}/{repo_id:path}/readme")
def get_local_repo_readme(repo_type: str, repo_id: str, cache_mgr: CacheManager = Depends(get_cache_manager)):
    """Get README.md content from local cache."""
    content = cache_mgr.get_local_readme(repo_id, repo_type)
    if content is None:
        raise HTTPException(status_code=404, detail="README not found in local cache")
    return {"content": content}

@router.get("/{repo_type}/{repo_id:path}/tree")
def get_local_repo_tree(repo_type: str, repo_id: str, cache_mgr: CacheManager = Depends(get_cache_manager)):
    """Get file tree from local cache."""
    tree = cache_mgr.get_local_file_tree(repo_id, repo_type)
    total_size = sum(f['size'] for f in tree)
    return {"files": tree, "count": len(tree), "total_size": total_size}

from ..dependencies import get_downloader
from ...core.downloader import HFDownloader

@router.post("/{repo_type}/{repo_id:path}/verify", response_model=ActionResponse)
async def verify_repo_cache(
    repo_type: str, 
    repo_id: str, 
    downloader: HFDownloader = Depends(get_downloader)
):
    """Start verification task for a repository."""
    try:
        task = downloader.verify_download(repo_id, repo_type=repo_type)
        return {"success": True, "message": f"Verification started for {repo_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/clean-orphans", response_model=ActionResponse)
def clean_orphans(cache_mgr: CacheManager = Depends(get_cache_manager)):
    """Clean orphan files from cache."""
    try:
        # Note: clean_orphans is actually clean_old_versions in our implementation or similar
        # For now we use clean_old_versions
        result = cache_mgr.clean_old_versions()
        return {"success": result.get('success', False), "message": result.get('message', 'Cleaned')}
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.get("/incomplete-summary")
def get_incomplete_summary(
    repo_type: Optional[str] = None,
    cache_mgr: CacheManager = Depends(get_cache_manager)
):
    """Get summary of incomplete downloads."""
    try:
        items = cache_mgr.scan_incomplete_downloads(repo_type=repo_type)
        total_size = sum(i['size'] for i in items)
        return {
            "count": len(items),
            "total_size": total_size,
            "total_size_formatted": format_size(total_size),
            "items": items
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/clean-incomplete", response_model=ActionResponse)
def clean_incomplete(cache_mgr: CacheManager = Depends(get_cache_manager)):
    """Clean all incomplete downloads."""
    try:
        result = cache_mgr.delete_incomplete_downloads()
        return {
            "success": result.get('success', False), 
            "message": f"Successfully cleaned {result.get('count', 0)} fragments, freed {result.get('freed_size_formatted', '0 B')}"
        }
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.get("/analysis")
def get_cache_analysis(
    repo_type: Optional[str] = None,
    cache_mgr: CacheManager = Depends(get_cache_manager)
):
    """Get comprehensive cache analysis report."""
    try:
        return cache_mgr.get_analysis_report(repo_type=repo_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
