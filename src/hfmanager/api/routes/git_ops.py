from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict
from pydantic import BaseModel
from ...core.auth_manager import get_auth_manager
from ...core.mirror_manager import get_mirror_manager
from huggingface_hub import HfApi

router = APIRouter(prefix="/git", tags=["GitOps"])

class CommitModel(BaseModel):
    commit_id: str
    summary: str
    message: str
    authors: List[str]
    date: str
    parents: List[str]

class RefModel(BaseModel):
    name: str
    ref: str
    target_commit: str

@router.get("/{repo_type}/{repo_id:path}/commits", response_model=List[CommitModel])
def get_commits(
    repo_type: str, 
    repo_id: str, 
    revision: str = "main",
    limit: int = 20
):
    """
    Get commit history for a repository.
    """
    try:
        # Resolve auth
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        
        api = HfApi()
        
        # Determine correct repo_type for API
        # API expects: None for model, 'dataset', 'space'
        api_repo_type = repo_type if repo_type != 'model' else None
        
        commits = api.list_repo_commits(
            repo_id=repo_id,
            repo_type=api_repo_type,
            revision=revision,
            token=token,
        )
        
        # Limit results manually as list_repo_commits returns iterator/list
        # Note: recent hf_hub versions might support limit param in some calls, check doc?
        # Actually list_repo_commits returns a generator in newer versions, or list.
        # It doesn't have a limit param in signature usually.
        
        result = []
        for i, c in enumerate(commits):
            if i >= limit:
                break
                
            result.append(CommitModel(
                commit_id=c.commit_id,
                summary=c.title or "",
                message=c.message or "",
                authors=c.authors or [],
                date=str(c.created_at),
                parents=c.parent_ids or []
            ))
            
        return result
        
    except Exception as e:
        # If repo not found or auth error
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{repo_type}/{repo_id:path}/branches", response_model=List[RefModel])
def get_branches(repo_type: str, repo_id: str):
    """Get all branches."""
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        api = HfApi()
        
        api_repo_type = repo_type if repo_type != 'model' else None
        refs = api.list_repo_refs(repo_id=repo_id, repo_type=api_repo_type, token=token)
        
        return [
            RefModel(name=b.name, ref=b.ref, target_commit=b.target_commit)
            for b in refs.branches
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{repo_type}/{repo_id:path}/tags", response_model=List[RefModel])
def get_tags(repo_type: str, repo_id: str):
    """Get all tags."""
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        api = HfApi()
        
        api_repo_type = repo_type if repo_type != 'model' else None
        refs = api.list_repo_refs(repo_id=repo_id, repo_type=api_repo_type, token=token)
        
        return [
            RefModel(name=t.name, ref=t.ref, target_commit=t.target_commit)
            for t in refs.tags
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
