from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from ...core.auth_manager import get_auth_manager
from ..dependencies import get_downloader
from huggingface_hub import HfApi

router = APIRouter(prefix="/spaces", tags=["SpaceOps"])

class SecretModel(BaseModel):
    key: str
    value: Optional[str] = None # Value is only for setting, not reading

class RuntimeResponse(BaseModel):
    stage: str
    hardware: Optional[Dict[str, Any]] = None

@router.get("/{repo_id:path}/secrets", response_model=List[str])
def get_secrets(repo_id: str):
    """
    List secret keys for a Space.
    Note: Values are not retrievable via API for security.
    """
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        api = HfApi()
        
        # This returns a list of Secret objects, but we only need keys
        secrets = api.get_space_secrets(repo_id=repo_id, token=token)
        return [s.key for s in secrets]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{repo_id:path}/secrets", response_model=Dict[str, bool])
def add_secret(repo_id: str, secret: SecretModel):
    """Add or update a secret."""
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        api = HfApi()
        
        if not secret.value:
            raise HTTPException(status_code=400, detail="Secret value required")
            
        api.add_space_secret(repo_id=repo_id, key=secret.key, value=secret.value, token=token)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{repo_id:path}/secrets/{key}", response_model=Dict[str, bool])
def delete_secret(repo_id: str, key: str):
    """Delete a secret."""
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        api = HfApi()
        
        api.delete_space_secret(repo_id=repo_id, key=key, token=token)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{repo_id:path}/runtime", response_model=RuntimeResponse)
def get_runtime(repo_id: str):
    """Get space runtime status."""
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        api = HfApi()
        
        runtime = api.get_space_runtime(repo_id=repo_id, token=token)
        return RuntimeResponse(
            stage=runtime.stage,
            hardware=runtime.hardware
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{repo_id:path}/restart", response_model=Dict[str, bool])
def restart_space(repo_id: str):
    """Restart the space."""
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        api = HfApi()
        
        api.restart_space(repo_id=repo_id, token=token)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{repo_id:path}/reboot", response_model=Dict[str, bool])
def factory_reboot(repo_id: str):
    """Factory reboot the space."""
    try:
        auth_mgr = get_auth_manager()
        token = auth_mgr.get_token()
        api = HfApi()
        
        api.restart_space(repo_id=repo_id, factory_reboot=True, token=token)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
