from pydantic import BaseModel
from typing import List, Optional

class SearchResultModel(BaseModel):
    id: str
    name: Optional[str] = None
    author: Optional[str] = None
    last_modified: Optional[str] = None
    downloads: Optional[int] = 0
    likes: Optional[int] = 0
    tags: List[str] = []
    repo_type: str = "model"
    avatar_url: Optional[str] = None # model, dataset, space

class SearchResponse(BaseModel):
    results: List[SearchResultModel]

class TrendingReposResponse(BaseModel):
    results: List[SearchResultModel]

class RepoFileModel(BaseModel):
    path: str
    type: str
    size: int
    size_formatted: str

class RepoFilesResponse(BaseModel):
    repo_id: str
    files: List[RepoFileModel]

class ReadmeResponse(BaseModel):
    content: str
    
class ModelInfoResponse(BaseModel):
    id: str
    sha: Optional[str] = None
    lastModified: Optional[str] = None
    tags: List[str] = []
    pipeline_tag: Optional[str] = None
    library_name: Optional[str] = None
    likes: int = 0
    downloads: int = 0
    private: bool = False
    gated: Optional[str] = None
    
class FileNode(BaseModel):
    path: str
    size: int
    lfs: Optional[bool] = False

class RepoTreeResponse(BaseModel):
    files: List[FileNode]
    count: int
    total_size: int

class TrendingResponse(BaseModel):
    tags: List[str]

class TrendingTag(BaseModel):
    tag: str
    count: int
    label: Optional[str] = None

class TrendingTagsResponse(BaseModel):
    tags: List[TrendingTag]
