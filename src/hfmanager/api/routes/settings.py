from fastapi import APIRouter, Depends, HTTPException
from ..dependencies import get_mirror_manager, get_downloader, get_auth_manager, get_cache_manager
from ..models.settings import SettingsResponse, UpdateSettingsRequest, MirrorModel
from ..models.download import ActionResponse
from ...core.mirror_manager import MirrorManager
from ...core.downloader import HFDownloader
from ...core.auth_manager import AuthManager
from ...core.cache_manager import CacheManager

router = APIRouter(prefix="/settings", tags=["Settings"])

@router.get("/", response_model=SettingsResponse)
async def get_settings(
    mirror_mgr: MirrorManager = Depends(get_mirror_manager),
    downloader: HFDownloader = Depends(get_downloader),
    auth_mgr: AuthManager = Depends(get_auth_manager),
    cache_mgr: CacheManager = Depends(get_cache_manager)
):
    """Get current application settings."""
    mirrors = mirror_mgr.MIRRORS
    current = mirror_mgr.get_current_mirror()
    
    # Get User Info if logged in
    user_info = None
    if auth_mgr.get_token():
        # IMPORTANT: Use cached info only to avoid blocking settings page load
        u = auth_mgr.get_user_info(allow_network=False)
        if u:
            from ..models.settings import UserInfoModel
            user_info = UserInfoModel(
                username=u.username,
                fullname=u.fullname,
                email=u.email,
                avatar_url=u.avatar_url,
                is_pro=u.is_pro
            )
    
    
    # Resolve actual cache path
    from huggingface_hub import constants
    resolved_cache = str(cache_mgr.cache_dir) if cache_mgr.cache_dir else str(constants.HF_HUB_CACHE)

    # Check auto-start status
    import os
    from pathlib import Path
    import platform
    is_auto_start = False
    if platform.system() == "Windows":
        try:
            startup_dir = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
            shortcut_path = startup_dir / "HFManager.bat"
            if shortcut_path.exists():
                is_auto_start = True
        except:
            pass

    return {
        "mirrors": [
            MirrorModel(
                key=k,
                name=m.name,
                url=m.url,
                description=m.description,
                region=m.region
            ) for k, m in mirrors.items()
        ],
        "current_mirror": current.key,
        "download_dir": str(downloader.config.get('download_dir', '')),
        "download_dir_history": downloader.config.get('download_dir_history', []),
        "max_concurrent_downloads": downloader.config.get('max_concurrent_downloads', 3),
        "default_search_limit": downloader.config.get('default_search_limit', 10),
        "use_hf_transfer": downloader.use_hf_transfer,
        "token_configured": auth_mgr.get_token() is not None,
        "hf_cache_dir": str(downloader.config.get('hf_cache_dir', '')),
        "resolved_hf_cache_dir": resolved_cache,
        "hf_cache_history": downloader.config.get('hf_cache_history', []),
        "proxy_url": downloader.config.get('proxy_url', ''),
        "check_update_on_start": downloader.config.get('check_update_on_start', True),
        "llama_cpp_path": downloader.config.get('llama_cpp_path', ''),
        "auto_start": is_auto_start,
        "auto_start": is_auto_start,
        "user_info": user_info,
        "download_method": downloader.config.get('download_method', 'PYTHON'),
        "aria2_cache_structure": downloader.config.get('aria2_cache_structure', True),
        "aria2_port": downloader.config.get('aria2_port', 6800),
        "python_max_workers": downloader.config.get('python_max_workers', 8),
        "aria2_max_connection_per_server": downloader.config.get('aria2_max_connection_per_server', 16),
        "aria2_split": downloader.config.get('aria2_split', 16),
        "aria2_check_certificate": downloader.config.get('aria2_check_certificate', False),
        "aria2_all_proxy": downloader.config.get('aria2_all_proxy', ''),
        "aria2_reuse_uri": downloader.config.get('aria2_reuse_uri', True),
        "show_search_history": downloader.config.get('show_search_history', True),
        "show_trending_tags": downloader.config.get('show_trending_tags', True),
        "show_trending_repos": downloader.config.get('show_trending_repos', True),
        "debug_mode": downloader.config.get('debug_mode', False),
        "app_data_dir": str(downloader.config.data_dir),
        "auto_resume_incomplete": downloader.config.get('auto_resume_incomplete', False),
        "language": downloader.config.get('language', 'en')
    }

@router.put("/", response_model=ActionResponse)
async def update_settings(
    req: UpdateSettingsRequest,
    mirror_mgr: MirrorManager = Depends(get_mirror_manager),
    downloader: HFDownloader = Depends(get_downloader),
    cache_mgr: CacheManager = Depends(get_cache_manager),
    auth_mgr: AuthManager = Depends(get_auth_manager)
):
    """Update settings."""
    try:
        should_refresh_api = False
        
        if req.mirror_key:
            mirror_mgr.switch_mirror(req.mirror_key)
            should_refresh_api = True
            
        if req.download_dir:
            old_dl_dir = downloader.config.get('download_dir', '')
            if old_dl_dir and old_dl_dir != req.download_dir:
                 # Add old to history if not exists
                history = downloader.config.get('download_dir_history', [])
                if old_dl_dir not in history:
                    history.append(old_dl_dir)
                    downloader.config.set('download_dir_history', history)
            downloader.config.set('download_dir', req.download_dir)

        if req.max_concurrent_downloads is not None:
             downloader.resize_pool(req.max_concurrent_downloads)
             
        if req.default_search_limit is not None:
             downloader.config.set('default_search_limit', req.default_search_limit)
        
        if req.check_update_on_start is not None:
            downloader.config.set('check_update_on_start', req.check_update_on_start)
        
        if req.proxy_url is not None:
            downloader.config.set('proxy_url', req.proxy_url)
            downloader.config.apply_env_proxy()
            should_refresh_api = True
            
        if req.hf_cache_dir is not None:  # Allow empty string
            old_dir = downloader.config.get('hf_cache_dir', '')
            if old_dir and old_dir != req.hf_cache_dir:
                # Add old to history if not exists
                history = downloader.config.get('hf_cache_history', [])
                if old_dir not in history:
                    history.append(old_dir)
                    downloader.config.set('hf_cache_history', history)
            
            downloader.config.set('hf_cache_dir', req.hf_cache_dir)
            import os
            if req.hf_cache_dir:
                os.environ["HF_HOME"] = req.hf_cache_dir
                os.environ["HF_HOME"] = req.hf_cache_dir
                os.environ["HF_HUB_CACHE"] = req.hf_cache_dir
            
            # Force cache manager to recognize new path
            cache_mgr.force_refresh_path(req.hf_cache_dir)
            
        if req.use_hf_transfer is not None:
            downloader.use_hf_transfer = req.use_hf_transfer
            downloader.config.set('use_hf_transfer', req.use_hf_transfer)  # Persist setting
            import os
            os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1" if req.use_hf_transfer else "0"
            should_refresh_api = True # Should refresh to pick up new transfer setting if affects client init
        
        if req.llama_cpp_path is not None:
            downloader.config.set('llama_cpp_path', req.llama_cpp_path)

        if req.download_method is not None:
             downloader.config.set('download_method', req.download_method)
             
        if req.aria2_cache_structure is not None:
             downloader.config.set('aria2_cache_structure', req.aria2_cache_structure)
             
        if req.aria2_port is not None:
             downloader.config.set('aria2_port', req.aria2_port)
        
        if req.python_max_workers is not None:
             downloader.config.set('python_max_workers', req.python_max_workers)
             
        if req.show_search_history is not None:
            downloader.config.set('show_search_history', req.show_search_history)
            
        if req.show_trending_tags is not None:
            downloader.config.set('show_trending_tags', req.show_trending_tags)
            
        if req.show_trending_repos is not None:
            downloader.config.set('show_trending_repos', req.show_trending_repos)
            
        if req.debug_mode is not None:
            downloader.config.set('debug_mode', req.debug_mode)
            
        if req.auto_resume_incomplete is not None:
            downloader.config.set('auto_resume_incomplete', req.auto_resume_incomplete)
            
        if req.language is not None:
             downloader.config.set('language', req.language)
             from ...utils.logger import logger as root_logger
             root_logger.info(f"API: Changing language to {req.language}")
             # Update Tray if running
             from ...core.desktop import get_desktop_instance
             desktop = get_desktop_instance()
             if desktop:
                 desktop.set_language(req.language)
             else:
                 root_logger.warning("API: Desktop instance not found, tray not updated.")
        
        # Apply Aria2 dynamic settings if changed
        aria2_updates = {}
        if req.aria2_max_connection_per_server is not None:
             downloader.config.set('aria2_max_connection_per_server', req.aria2_max_connection_per_server)
             aria2_updates['max-connection-per-server'] = str(req.aria2_max_connection_per_server)
             
        if req.aria2_split is not None:
             downloader.config.set('aria2_split', req.aria2_split)
             aria2_updates['split'] = str(req.aria2_split)
             
        if req.aria2_check_certificate is not None:
             downloader.config.set('aria2_check_certificate', req.aria2_check_certificate)
             aria2_updates['check-certificate'] = 'true' if req.aria2_check_certificate else 'false'
             
        if req.aria2_all_proxy is not None:
             downloader.config.set('aria2_all_proxy', req.aria2_all_proxy)
             aria2_updates['all-proxy'] = req.aria2_all_proxy
             
        if req.aria2_reuse_uri is not None:
             downloader.config.set('aria2_reuse_uri', req.aria2_reuse_uri)
             aria2_updates['reuse-uri'] = 'true' if req.aria2_reuse_uri else 'false'
        
        if aria2_updates and hasattr(downloader, 'aria2'):
            try:
                downloader.aria2.update_options(aria2_updates)
            except:
                pass # Aria2 might not be running yet
        
        if should_refresh_api:
             downloader.refresh_api()
             auth_mgr.refresh_api()
            
        return {"success": True, "message": "Settings updated"}
    except Exception as e:
        return {"success": False, "message": str(e)}

from ..models.settings import ValidateTokenRequest

@router.post("/validate-token")
def validate_token(
    req: ValidateTokenRequest,
    auth_mgr: AuthManager = Depends(get_auth_manager)
):
    """Validate a HF token."""
    try:
        user_info = auth_mgr.validate_token(req.token)
        return {
            "valid": True, 
            "username": user_info.get("name"), 
            "fullname": user_info.get("fullname"),
            "email": user_info.get("email")
        }
    except Exception as e:
        return {"valid": False, "message": str(e)}

from ..models.settings import AddMirrorRequest

@router.post("/mirrors", response_model=ActionResponse)
async def add_mirror(
    req: AddMirrorRequest,
    mirror_mgr: MirrorManager = Depends(get_mirror_manager)
):
    """Add a custom mirror."""
    import uuid
    # Validate URL
    if not req.url.startswith('http'):
        return {"success": False, "message": "Invalid URL: Must start with http/https"}
        
    key = f"custom_{uuid.uuid4().hex[:8]}"
    success = mirror_mgr.add_custom_mirror(
        key=key,
        name=req.name,
        url=req.url.rstrip('/'), # Normalize URL
        description=req.description or "User defined mirror"
    )
    if success:
        return {"success": True, "message": "Mirror added successfully"}
    return {"success": False, "message": "Failed to add mirror"}

@router.delete("/mirrors/{key}", response_model=ActionResponse)
async def remove_mirror(
    key: str,
    mirror_mgr: MirrorManager = Depends(get_mirror_manager)
):
    """Remove a custom mirror."""
    success = mirror_mgr.remove_custom_mirror(key)
    if success:
        return {"success": True, "message": "Mirror removed"}
    return {"success": False, "message": "Cannot remove built-in mirrors or mirror not found"}

@router.post("/delete-history", response_model=ActionResponse)
async def delete_history(
    path: str,
    type: str = 'cache', # 'cache' or 'download'
    downloader: HFDownloader = Depends(get_downloader)
):
    """Remove a path from history."""
    try:
        config_key = 'hf_cache_history' if type == 'cache' else 'download_dir_history'
        history = downloader.config.get(config_key, [])
        
        if path in history:
            history.remove(path)
            downloader.config.set(config_key, history)
            return {"success": True, "message": "History item removed"}
        return {"success": False, "message": "Item not found in history"}
    except Exception as e:
        return {"success": False, "message": str(e)}
@router.post("/reset-downloads", response_model=ActionResponse)
async def reset_download_settings(
    downloader: HFDownloader = Depends(get_downloader)
):
    """Reset performance-related download settings to defaults."""
    try:
        from ...utils.config import Config
        defaults = Config.DEFAULTS
        
        # Keys to reset
        keys_to_reset = [
            'use_hf_transfer',
            'max_concurrent_downloads',
            'python_max_workers',
            'aria2_max_connection_per_server',
            'aria2_split',
            'aria2_check_certificate',
            'aria2_all_proxy',
            'aria2_reuse_uri'
        ]
        
        aria2_updates = {}
        for key in keys_to_reset:
            val = defaults.get(key)
            downloader.config.set(key, val)
            
            # Prepare Aria2 RPC updates if needed
            if key == 'aria2_max_connection_per_server':
                aria2_updates['max-connection-per-server'] = str(val)
            elif key == 'aria2_split':
                aria2_updates['split'] = str(val)
            elif key == 'aria2_check_certificate':
                aria2_updates['check-certificate'] = 'true' if val else 'false'
            elif key == 'aria2_all_proxy':
                aria2_updates['all-proxy'] = val or ""
            elif key == 'aria2_reuse_uri':
                aria2_updates['reuse-uri'] = 'true' if val else 'false'
        
        # Sync simple fields to downloader instance
        downloader.use_hf_transfer = defaults.get('use_hf_transfer', False)
        downloader.max_workers = defaults.get('max_concurrent_downloads', 3)
        
        # Update Aria2 via RPC if running
        if aria2_updates and hasattr(downloader, 'aria2'):
            try:
                downloader.aria2.update_options(aria2_updates)
            except:
                pass
                
        return {"success": True, "message": "Download settings reset to defaults"}
    except Exception as e:
        return {"success": False, "message": str(e)}
