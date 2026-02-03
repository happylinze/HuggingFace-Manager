from pydantic import BaseModel
from typing import Optional, Literal, List

class CreateRepoRequest(BaseModel):
    repo_id: str
    repo_type: Literal['model', 'dataset', 'space'] = 'model'
    private: bool = True
    sdk: Optional[str] = None  # Only for spaces: 'gradio', 'streamlit', 'docker'
    license: Optional[str] = None

class UploadFileRequest(BaseModel):
    repo_id: str
    repo_type: Literal['model', 'dataset', 'space'] = 'model'
    file_path: str  # Local path to file
    path_in_repo: Optional[str] = None
    commit_message: Optional[str] = None

class RepoActionResponse(BaseModel):
    success: bool = True
    message: str
    url: Optional[str] = None

class UpdateMetadataRequest(BaseModel):
    repo_id: str
    repo_type: Literal['model', 'dataset', 'space'] = 'model'
    license: Optional[str] = None
    tags: Optional[List[str]] = None
    pipeline_tag: Optional[str] = None
    sdk: Optional[str] = None
    gated: Optional[str] = None  # 'auto' or 'manual'

class UpdateVisibilityRequest(BaseModel):
    repo_id: str
    repo_type: Literal['model', 'dataset', 'space'] = 'model'
    private: bool

class MoveRepoRequest(BaseModel):
    from_repo: str
    to_repo: str
    repo_type: Literal['model', 'dataset', 'space'] = 'model'

class ImportRepoRequest(BaseModel):
    repo_id: str
    repo_type: Literal['model', 'dataset', 'space'] = 'model'
    folder_path: str
    private: bool = True
    license: Optional[str] = None

class ConvertRepoRequest(BaseModel):
    repo_id: str
    revision: str = "main"
    quantization: str = "q8_0"
    output_dir: Optional[str] = None
