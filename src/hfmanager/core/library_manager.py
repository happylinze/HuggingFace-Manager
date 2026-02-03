import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging
from .cache_manager import RepoInfo
from ..utils.config import get_config_dir
from ..utils.system import format_size

logger = logging.getLogger(__name__)

class ExternalLibraryManager:
    """
    Manages external (non-HF-cache) model and dataset libraries.
    """
    
    def __init__(self):
        self.config_dir = get_config_dir()
        self.library_file = self.config_dir / "library.json"
        self.paths: List[str] = self._load_library()

    def _load_library(self) -> List[str]:
        """Load registered paths from JSON."""
        if not self.library_file.exists():
            return []
        try:
            with open(self.library_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return [p for p in data if os.path.isdir(p)] # Filter invalid paths
        except Exception as e:
            logger.error(f"Failed to load library.json: {e}")
            return []

    def _save_library(self):
        """Save registered paths to JSON."""
        try:
            with open(self.library_file, 'w', encoding='utf-8') as f:
                json.dump(self.paths, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save library.json: {e}")

    def add_path(self, path: str) -> bool:
        """Register a new library path."""
        path = str(Path(path).resolve())
        if not os.path.exists(path):
            raise ValueError("Path does not exist")
        
        if path not in self.paths:
            self.paths.append(path)
            self._save_library()
            return True
        return False

    def remove_path(self, path: str) -> bool:
        """Remove a path from registry."""
        path = str(Path(path).resolve())
        if path in self.paths:
            self.paths.remove(path)
            self._save_library()
            return True
        return False

    def get_paths(self) -> List[str]:
        """Get all registered paths."""
        return self.paths

    def scan_library(self) -> List[RepoInfo]:
        """
        Scan all registered paths for models and datasets recursively.
        Returns a list of RepoInfo-like objects.
        """
        results = []
        seen_paths = set()

        def _recursive_scan(path: Path, current_depth: int, max_depth: int = 3):
            if current_depth > max_depth:
                return
            
            # Check if this folder is a repo
            repo = self._inspect_folder(path)
            if repo:
                if str(path) not in seen_paths:
                    results.append(repo)
                    seen_paths.add(str(path))
                # If we found a repo, we stop descending this branch (assume repos aren't nested)
                return

            # If not a repo, recurse into subdirectories
            try:
                for item in path.iterdir():
                    if item.is_dir() and not item.name.startswith('.'): # Skip hidden folders
                        _recursive_scan(item, current_depth + 1, max_depth)
            except Exception as e:
                logger.debug(f"Skipping access to {path}: {e}")

        for root_path_str in self.paths:
            root_path = Path(root_path_str)
            if not root_path.exists():
                continue
            
            try:
                _recursive_scan(root_path, 0)
            except Exception as e:
                logger.error(f"Error scanning {root_path}: {e}")

        return results

    def _inspect_folder(self, path: Path) -> Optional[RepoInfo]:
        """
        Check if a folder looks like a HF model/dataset and return metadata.
        """
        # Heuristics
        is_model = (path / "config.json").exists() or (path / "model_index.json").exists()
        is_dataset = (path / "dataset_info.json").exists()
        
        # GGUF detection (folder containing .gguf files)
        has_gguf = any(path.glob("*.gguf"))
        
        repo_type = None
        if is_dataset:
            repo_type = "dataset"
        elif is_model or has_gguf: # Treat GGUF folders as models
            repo_type = "model"
        
        if not repo_type:
            return None

        # Calculate size & file count (expensive?)
        # For now, quick walk
        total_size = 0
        file_count = 0
        last_modified = 0.0

        for p in path.rglob("*"):
            if p.is_file():
                try:
                    stat = p.stat()
                    total_size += stat.st_size
                    file_count += 1
                    if stat.st_mtime > last_modified:
                        last_modified = stat.st_mtime
                except:
                    pass

        # Parse ID from name or config
        # Use folder name as fallback ID
        repo_id = path.name
        
        # Try to read name_or_path from config.json for better ID?
        # Often local folders are named arbitarily. 
        # But for UI display, folder name is most accurate representation of "Model ID" in user's mind.
        # We can add a "source" tag if we find it.
        
        # Construct RepoInfo-compatible object
        # We use the same class but some fields might be dummy
        info = RepoInfo(
            repo_id=repo_id,
            repo_type=repo_type,
            repo_path=str(path),
            size_on_disk=total_size,
            size_formatted=format_size(total_size),
            nb_files=file_count,
            last_modified=datetime.fromtimestamp(last_modified),
            last_accessed=None, # Not tracking access
            revisions=[], # External repos are "flat", no revision history usually
            refs=[]
        )
        return info

# Singleton instance
_library_manager = None
def get_library_manager() -> ExternalLibraryManager:
    global _library_manager
    if _library_manager is None:
        _library_manager = ExternalLibraryManager()
    return _library_manager
