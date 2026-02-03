from pydantic import BaseModel
from typing import List, Optional

class MirrorModel(BaseModel):
    key: str
    name: str
    url: str
    description: str
    region: str

class UserInfoModel(BaseModel):
    username: str
    fullname: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    is_pro: bool = False

class SettingsResponse(BaseModel):
    mirrors: List[MirrorModel]
    current_mirror: str
    download_dir: str
    download_dir_history: List[str] = []
    max_concurrent_downloads: int
    default_search_limit: int
    use_hf_transfer: bool
    token_configured: bool
    hf_cache_dir: str
    resolved_hf_cache_dir: str
    hf_cache_history: List[str] = []
    proxy_url: Optional[str] = ""
    check_update_on_start: bool = True
    auto_start: bool = False
    llama_cpp_path: Optional[str] = ""
    user_info: Optional[UserInfoModel] = None
    download_method: str = "PYTHON"
    aria2_cache_structure: bool = True
    aria2_port: int = 6800
    python_max_workers: int = 8
    aria2_max_connection_per_server: int = 16
    aria2_split: int = 16
    aria2_check_certificate: bool = False
    aria2_all_proxy: Optional[str] = ""
    aria2_reuse_uri: bool = True
    
    # Home Page Settings
    show_search_history: bool = True
    show_trending_tags: bool = True
    show_trending_repos: bool = True
    debug_mode: bool = False
    app_data_dir: Optional[str] = ""

class UpdateSettingsRequest(BaseModel):
    download_dir: Optional[str] = None
    use_hf_transfer: Optional[bool] = None
    max_concurrent_downloads: Optional[int] = None
    default_search_limit: Optional[int] = None
    mirror_key: Optional[str] = None
    hf_cache_dir: Optional[str] = None
    proxy_url: Optional[str] = None
    check_update_on_start: Optional[bool] = None
    llama_cpp_path: Optional[str] = None
    download_method: Optional[str] = None
    aria2_cache_structure: Optional[bool] = None
    aria2_port: Optional[int] = None
    python_max_workers: Optional[int] = None
    aria2_max_connection_per_server: Optional[int] = None
    aria2_split: Optional[int] = None
    aria2_check_certificate: Optional[bool] = None
    aria2_all_proxy: Optional[str] = None
    aria2_reuse_uri: Optional[bool] = None
    show_search_history: Optional[bool] = None
    show_trending_tags: Optional[bool] = None
    show_trending_repos: Optional[bool] = None
    debug_mode: Optional[bool] = None

class ValidateTokenRequest(BaseModel):
    token: str

class AddMirrorRequest(BaseModel):
    name: str
    url: str
    description: Optional[str] = None
