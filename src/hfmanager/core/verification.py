import hashlib
import os
from dataclasses import dataclass
from typing import List, Dict, Optional
from pathlib import Path
from huggingface_hub import HfApi, scan_cache_dir
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

logger = logging.getLogger(__name__)

@dataclass
class VerificationResult:
    valid_files: List[str]
    corrupted_files: List[str]
    missing_files: List[str]
    total_files: int
    is_valid: bool

class Verifier:
    def __init__(self, api: Optional[HfApi] = None):
        self.api = api or HfApi()

    @staticmethod
    def calculate_sha256(file_path: Path, chunk_size: int = 1024*1024) -> str:
        """Calculate SHA256 hash of a file."""
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(chunk_size), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except IOError:
            return ""

    def verify_repo(
        self, 
        repo_id: str, 
        repo_type: str = "model", 
        revision: str = "main", 
        max_workers: int = 4,
        include_patterns: Optional[List[str]] = None,
        exclude_patterns: Optional[List[str]] = None,
        local_dir: Optional[Path] = None
    ) -> VerificationResult:
        """
        Verify the integrity of a cached repository by comparing local files with remote metadata.
        Respects include/exclude patterns to only verify downloaded files.
        """
        import fnmatch
        
        valid = []
        corrupted = []
        missing = []
        
        # 1. Fetch remote metadata
        try:
            repo_info = self.api.repo_info(repo_id, repo_type=repo_type if repo_type != "model" else None, revision=revision, files_metadata=True)
        except Exception as e:
            logger.error(f"Failed to fetch remote metadata: {e}")
            raise

        targets = {} # path -> expected_sha256
        for brother in repo_info.siblings:
            # Filter based on patterns
            filename = brother.rfilename
            
            # Check include patterns
            if include_patterns:
                included = any(fnmatch.fnmatch(filename, pat) for pat in include_patterns)
                if not included:
                    continue
            
            # Check exclude patterns
            if exclude_patterns:
                excluded = any(fnmatch.fnmatch(filename, pat) for pat in exclude_patterns)
                if excluded:
                    continue

            if brother.lfs and 'sha256' in brother.lfs:
                targets[filename] = brother.lfs['sha256']
        
        if not targets:
            # Nothing to verify (no LFS files matching patterns)
            return VerificationResult([], [], [], 0, True)

        # 2. Find local paths
        from huggingface_hub import try_to_load_from_cache
        
        files_to_check = {} # local_path -> expected_sha256
        
        for filename, expected_sha in targets.items():
            if local_dir:
                 # Direct check in local_dir
                 local_path = local_dir / filename
                 if local_path.exists():
                     files_to_check[local_path] = expected_sha
                 else:
                     missing.append(filename)
            else:
                # Use cache lookup
                try:
                    local_path = try_to_load_from_cache(repo_id, filename, revision=revision, repo_type=repo_type)
                    if local_path and os.path.exists(local_path):
                        files_to_check[local_path] = expected_sha
                    else:
                        missing.append(filename)
                except Exception:
                     missing.append(filename)

        # 3. Calculate hashes in parallel
        # Map path back to filename for reporting: path -> filename
        # Simplified mapping logic
        path_map = {}
        for fname, sha in targets.items():
            if local_dir:
                p = local_dir / fname
            else:
                 # Re-resolve for map (a bit redundant but safe)
                 p = try_to_load_from_cache(repo_id, fname, revision=revision, repo_type=repo_type)
            
            if p:
                path_map[str(p)] = fname
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_path = {executor.submit(self.calculate_sha256, path): path for path in files_to_check.keys()}
            
            for future in as_completed(future_to_path):
                path = future_to_path[future]
                filename = path_map.get(str(path), os.path.basename(path))
                expected_sha = files_to_check[path]
                
                try:
                    calculated_sha = future.result()
                    
                    if calculated_sha == expected_sha:
                        valid.append(filename)
                    else:
                        corrupted.append(filename)
                except Exception as e:
                    logger.error(f"Error verifying {filename}: {e}")
                    corrupted.append(filename)
                    
        return VerificationResult(
            valid_files=valid,
            corrupted_files=corrupted,
            missing_files=missing,
            total_files=len(targets),
            is_valid=(len(corrupted) == 0 and len(missing) == 0)
        )
