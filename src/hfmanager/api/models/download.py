from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class DownloadTaskModel(BaseModel):
    id: str
    repo_id: str
    repo_type: str
    revision: str
    status: str
    progress: float
    downloaded_size: int
    total_size: int
    speed: float
    speed_formatted: str
    current_file: Optional[str] = None
    result_path: Optional[str] = None
    total_files: Optional[int] = 0
    downloaded_files: Optional[int] = 0
    include_patterns: Optional[List[str]] = None
    exclude_patterns: Optional[List[str]] = None
    error_message: Optional[str] = None
    pausable: Optional[bool] = True
    use_hf_transfer: Optional[bool] = False
    created_at: Optional[str] = None

class DownloadQueueResponse(BaseModel):
    tasks: List[DownloadTaskModel]

class StartDownloadRequest(BaseModel):
    repo_id: str
    repo_type: str = "model"
    revision: str = "main"
    allow_patterns: Optional[List[str]] = None
    ignore_patterns: Optional[List[str]] = None
    duplicate_action: str = "check"  # check, overwrite, rename

class ActionResponse(BaseModel):
    success: bool
    message: Optional[str] = None
