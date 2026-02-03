import os
import logging
from pathlib import Path
from typing import List, Dict, Optional, Any
from huggingface_hub import HfApi, CommitOperationAdd
import mimetypes

logger = logging.getLogger(__name__)

class HFUploader:
    """
    Core service for scanning local files and performing uploads (commits) to Hugging Face.
    """
    def __init__(self, token: Optional[str] = None):
        self.api = HfApi(token=token)

    def scan_directory(self, path: str) -> Dict[str, Any]:
        """
        Scan a local directory and return a flat list of files with metadata.
        Analyzes file sizes to suggest LFS usage.
        """
        path = Path(path).resolve()
        if not path.exists() or not path.is_dir():
             raise ValueError(f"Path does not exist or is not a directory: {path}")

        files = []
        total_size = 0
        lfs_candidates = []
        
        # Hardcoded LFS extensions for safety
        lfs_extensions = {".bin", ".pt", ".safetensors", ".msgpack", ".h5", ".gguf", ".onnx", ".tflite", ".model", ".pb"}
        
        for root, dirs, filenames in os.walk(path):
            # Skip hidden directories like .git
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            
            for name in filenames:
                # Skip hidden files
                if name.startswith('.'): continue
                
                full_path = Path(root) / name
                rel_path = full_path.relative_to(path).as_posix()
                
                try:
                    size = full_path.stat().st_size
                    total_size += size
                    
                    is_lfs = False
                    # Heuristic 1: Extension
                    if full_path.suffix.lower() in lfs_extensions:
                        is_lfs = True
                    # Heuristic 2: Size > 10MB (Safe threshold for suggestion)
                    elif size > 10 * 1024 * 1024:
                        is_lfs = True
                        
                    file_info = {
                        "path": rel_path,
                        "size": size,
                        "lfs": is_lfs
                    }
                    files.append(file_info)
                    
                    if is_lfs:
                        lfs_candidates.append(rel_path)
                        
                except Exception as e:
                    logger.warning(f"Failed to access file {rel_path}: {e}")

        return {
            "root_path": str(path),
            "files": files,
            "total_files": len(files),
            "total_size": total_size,
            "lfs_files": lfs_candidates
        }

    async def upload_files(
        self, 
        repo_id: str, 
        repo_type: str, 
        base_path: str,
        file_list: List[str], # List of relative paths to upload
        commit_message: str,
        revision: str = "main",
        create_pr: bool = False
    ) -> Dict[str, Any]:
        """
        Execute the upload using upload_folder for better robustness and skipping existing files.
        """
        base_path = Path(base_path).resolve()
        
        # Verify all files exist
        for rel_path in file_list:
            full_path = base_path / rel_path
            if not full_path.exists():
                logger.warning(f"File not found during upload prep: {full_path}")
                # We can choose to abort or skip. Aborting strictly is safer for data integrity.
                raise ValueError(f"File missing: {rel_path}")

        logger.info(f"Starting upload to {repo_id}: {len(file_list)} files via upload_folder.")
        
        try:
            # We use upload_folder with allow_patterns to upload only selected files.
            # This method handles:
            # 1. Hashing and skipping identical files (Resumability)
            # 2. LFS handling automatically
            # 3. Parallel uploads (if configured in HfApi, usually defaults to thread pool)
            
            future_info = self.api.upload_folder(
                folder_path=str(base_path),
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                commit_message=commit_message,
                commit_description=f"Uploaded {len(file_list)} files via HFManager",
                create_pr=create_pr,
                allow_patterns=file_list,  # Critical: Only upload selected files
                multi_commits=False,      # Attempt single commit if possible, or True if we want to allow splitting large commits
                # multi_commits=True is generally safer for huge uploads but might generate multiple commits.
                # Let's default to default behavior (False usually, or auto). 
                # Actually upload_folder default is multi_commits=False but it auto-chunks LFS?
                # Let's enforce single commit atomicity if possible for now unless it's huge.
            )
            
            # upload_folder returns the CommitInfo object directly (or a Future if async, but here it's sync blocking)
            # self.api is sync HfApi.
            
            return {
                "success": True,
                "commit_hash": future_info.oid if hasattr(future_info, 'oid') else str(future_info),
                "url": future_info.commit_url if hasattr(future_info, 'commit_url') else ""
            }
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            raise e
