from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from ..dependencies import get_auth_manager
from ...core.auth_manager import AuthManager
from ..models.download import ActionResponse

router = APIRouter(prefix="/auth", tags=["Auth"])

class LoginRequest(BaseModel):
    token: str

class SwitchAccountRequest(BaseModel):
    username: str

@router.post("/login", response_model=ActionResponse)
async def login(req: LoginRequest, auth_mgr: AuthManager = Depends(get_auth_manager)):
    """Login with HF Token."""
    success, message = auth_mgr.login_with_token(req.token)
    return {"success": success, "message": message}

@router.post("/logout", response_model=ActionResponse)
async def logout(auth_mgr: AuthManager = Depends(get_auth_manager)):
    """Logout from HF."""
    success, message = auth_mgr.logout_user()
    return {"success": success, "message": message}
@router.get("/user")
async def get_user_info(auth_mgr: AuthManager = Depends(get_auth_manager)):
    """Get current user info."""
    user = auth_mgr.get_user_info()
    if not user:
        return {"username": None}
    
    return {
        "username": user.username,
        "fullname": user.fullname,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "is_pro": user.is_pro
    }

@router.get("/accounts")
async def get_accounts(auth_mgr: AuthManager = Depends(get_auth_manager)):
    """Get list of saved accounts."""
    return {"accounts": auth_mgr.get_known_accounts()}

@router.post("/switch", response_model=ActionResponse)
async def switch_account(req: SwitchAccountRequest, auth_mgr: AuthManager = Depends(get_auth_manager)):
    """Switch to another saved account."""
    success, message = auth_mgr.switch_account(req.username)
    return {"success": success, "message": message}

@router.delete("/accounts/{username}", response_model=ActionResponse)
async def remove_account(username: str, auth_mgr: AuthManager = Depends(get_auth_manager)):
    """Remove a saved account."""
    success, message = auth_mgr.remove_account(username)
    return {"success": success, "message": message}
