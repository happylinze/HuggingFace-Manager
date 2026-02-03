from pydantic import BaseModel
from typing import List, Optional

class CacheRepoModel(BaseModel):
    repo_id: str
    repo_type: str
    size_on_disk: int
    size_formatted: str
    last_modified: str
    revisions_count: int
    repo_path: Optional[str] = None

class CacheResponse(BaseModel):
    repos: List[CacheRepoModel]
    total_size: int
    total_size_formatted: str
    root_path: str = ""

class DeleteCacheRequest(BaseModel):
    repo_id: str
    repo_type: str = "model"
