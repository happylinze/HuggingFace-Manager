"""
Cache Manager for Hugging Face downloads.
Provides scanning, visualization data, and cleanup functionality.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from huggingface_hub import scan_cache_dir, HFCacheInfo
from huggingface_hub.utils import HFCacheInfo as HFCacheInfoType

from ..utils.system import format_size


@dataclass
class RepoInfo:
    """Structured information about a cached repository."""
    repo_id: str
    repo_type: str  # 'model', 'dataset', 'space'
    size_on_disk: int
    size_formatted: str
    nb_files: int
    revisions: list[dict]
    last_accessed: Optional[datetime]
    last_modified: Optional[datetime]
    refs: list[str]  # branches/tags pointing to this repo
    repo_path: str = ""  # Absolute path to repo in cache
    
    @property
    def is_model(self) -> bool:
        return self.repo_type == 'model'
    
    @property
    def is_dataset(self) -> bool:
        return self.repo_type == 'dataset'


@dataclass 
class CacheSummary:
    """Summary statistics for the entire cache."""
    total_size: int
    total_size_formatted: str
    total_repos: int
    total_revisions: int
    models_count: int
    datasets_count: int
    spaces_count: int
    warnings: list[str]  # Corrupted entries, etc.


class CacheManager:
    """
    Manager for Hugging Face cache operations.
    
    Wraps huggingface_hub's cache utilities with a more user-friendly API.
    """
    
    def __init__(self, cache_dir: Optional[Path] = None):
        """
        Initialize the cache manager.
        """
        self.cache_dir = cache_dir
        self._cache_info: Optional[HFCacheInfoType] = None
        self._cached_repos: list[RepoInfo] = []
        self._last_scan_time = 0
        self._scanning = False
        import threading
        self._lock = threading.Lock()
        
        from ..utils.config import get_config
        self.config = get_config()
        self.index_path = self.config.data_dir / 'cache_index.json'
        
        # Legacy Migration: Move from APPDATA/HFManager/cache_index.json -> APPDATA/HFManager/data/cache_index.json
        old_index_path = self.config.config_dir / 'cache_index.json'
        if old_index_path.exists() and not self.index_path.exists():
             try:
                 print(f"DEBUG: Migrating cache index to {self.index_path}")
                 import shutil
                 shutil.move(str(old_index_path), str(self.index_path))
             except Exception as e:
                 print(f"Migration error: {e}")

        # Try to load index immediately
        self._load_index()
        
        # Start an initial scan in background
        threading.Thread(target=self._background_scan, daemon=True).start()

    def force_refresh_path(self, new_path: str):
        """Force update cache path and clear cached info."""
        import threading
        if new_path:
            self.cache_dir = Path(new_path)
            self._cache_info = None
            self._cached_repos = [] # Clear memory cache
            threading.Thread(target=self._background_scan, daemon=True).start()
        else:
            self.cache_dir = None
            self._cache_info = None
            self._cached_repos = [] # Clear memory cache
            threading.Thread(target=self._background_scan, daemon=True).start()

    def _serialize_repo(self, repo: RepoInfo) -> dict:
        """Convert RepoInfo to dict for JSON serialization."""
        return {
            'repo_id': repo.repo_id,
            'repo_type': repo.repo_type,
            'size_on_disk': repo.size_on_disk,
            'size_formatted': repo.size_formatted,
            'nb_files': repo.nb_files,
            'last_accessed': repo.last_accessed.timestamp() if repo.last_accessed else None,
            'last_modified': repo.last_modified.timestamp() if repo.last_modified else None,
            'refs': repo.refs,
            'repo_path': repo.repo_path,
            'revisions': repo.revisions
        }

    def _deserialize_repo(self, data: dict) -> RepoInfo:
        """Convert dict to RepoInfo."""
        revisions = []
        for rev in data.get('revisions', []):
            rev_copy = rev.copy()
            if rev_copy.get('last_modified'):
                if isinstance(rev_copy['last_modified'], (int, float)):
                    rev_copy['last_modified'] = datetime.fromtimestamp(rev_copy['last_modified'])
            revisions.append(rev_copy)

        return RepoInfo(
            repo_id=data['repo_id'],
            repo_type=data['repo_type'],
            size_on_disk=data['size_on_disk'],
            size_formatted=data['size_formatted'],
            nb_files=data['nb_files'],
            revisions=revisions,
            last_accessed=datetime.fromtimestamp(data['last_accessed']) if data.get('last_accessed') else None,
            last_modified=datetime.fromtimestamp(data['last_modified']) if data.get('last_modified') else None,
            refs=data.get('refs', []),
            repo_path=data.get('repo_path', "")
        )

    def _save_index(self):
        """Save cached repos to JSON file."""
        import json
        try:
            data_to_save = []
            for repo in self._cached_repos:
                repo_dict = self._serialize_repo(repo)
                serialized_revs = []
                for rev in repo.revisions:
                    rev_dict = rev.copy()
                    if isinstance(rev_dict.get('last_modified'), datetime):
                        rev_dict['last_modified'] = rev_dict['last_modified'].timestamp()
                    serialized_revs.append(rev_dict)
                repo_dict['revisions'] = serialized_revs
                data_to_save.append(repo_dict)

            with open(self.index_path, 'w', encoding='utf-8') as f:
                json.dump(data_to_save, f)
        except Exception as e:
            print(f"Error saving cache index: {e}")

    def _load_index(self):
        """Load cached repos from JSON file."""
        import json
        if not self.index_path.exists():
            return
            
        try:
            with open(self.index_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    return # Empty file
                data = json.loads(content)
            
            loaded_repos = []
            for item in data:
                try:
                    loaded_repos.append(self._deserialize_repo(item))
                except Exception:
                    continue
            
            with self._lock:
                self._cached_repos = loaded_repos
            print(f"DEBUG: Loaded {len(loaded_repos)} repos from persistent index")
        except json.JSONDecodeError as e:
            print(f"Error loading cache index (corrupted JSON): {e}")
            # Corrupted file, rename it to .bak and start fresh
            try:
                backup_path = self.index_path.with_suffix('.json.bak')
                if backup_path.exists():
                    backup_path.unlink()
                self.index_path.rename(backup_path)
                print(f"Corrupted index backed up to {backup_path}")
            except Exception:
                pass
        except Exception as e:
            print(f"Error loading cache index: {e}")

    def _process_scan_info(self, cache_info: HFCacheInfoType) -> list[RepoInfo]:
        """Convert HFCacheInfo to list of RepoInfo."""
        repos = []
        for repo in cache_info.repos:
            revisions = []
            for rev in repo.revisions:
                revisions.append({
                    'commit_hash': rev.commit_hash,
                    'size_on_disk': rev.size_on_disk,
                    'size_formatted': format_size(rev.size_on_disk),
                    'nb_files': len(rev.files),
                    'last_modified': datetime.fromtimestamp(rev.last_modified) if rev.last_modified else None,
                    'refs': list(rev.refs) if rev.refs else [],
                })
            
            repos.append(RepoInfo(
                repo_id=repo.repo_id,
                repo_type=repo.repo_type,
                size_on_disk=repo.size_on_disk,
                size_formatted=format_size(repo.size_on_disk),
                nb_files=sum(len(r.files) for r in repo.revisions),
                revisions=revisions,
                last_accessed=datetime.fromtimestamp(repo.last_accessed) if repo.last_accessed else None,
                last_modified=datetime.fromtimestamp(repo.last_modified) if repo.last_modified else None,
                refs=list(repo.refs) if repo.refs else [],
                repo_path=str(repo.repo_path)
            ))
        
        repos.sort(key=lambda r: r.size_on_disk, reverse=True)
        return repos

    def _background_scan(self):
        """Run scan in background thread."""
        import time
        with self._lock:
            if self._scanning: return
            self._scanning = True
            
        try:
            # Check config for cache_dir override if not provided
            target_dir = self.cache_dir
            if not target_dir:
                from ..utils.config import get_config
                conf_dir = get_config().get('hf_cache_dir')
                if conf_dir:
                    target_dir = Path(conf_dir)
            
            # This is the slow blocking call
            # print("DEBUG: Starting background cache scan...")
            info = scan_cache_dir(target_dir)
            
            # Process info into RepoInfo objects immediately for cache
            new_cached_repos = self._process_scan_info(info)
            
            with self._lock:
                self._cache_info = info
                self._cached_repos = new_cached_repos
                self._last_scan_time = time.time()
                # print(f"DEBUG: Cache scan complete. Found {len(info.repos)} repos.")

            # Save to disk
            self._save_index()
                
        except Exception as e:
            print(f"Error scanning cache: {e}")
        finally:
            with self._lock:
                self._scanning = False
                
    def scan(self, force_refresh: bool = False) -> HFCacheInfoType:
        """
        Get cache info. Returns cached version immediately if available.
        Triggers background refresh if needed.
        """
        import time
        import threading
        
        # If we have data and not forced, return it
        if self._cache_info and not force_refresh:
            # Maybe trigger refresh if too old (e.g. > 1 minute), but strictly non-blocking
            if time.time() - self._last_scan_time > 60 and not self._scanning:
                 threading.Thread(target=self._background_scan, daemon=True).start()
            return self._cache_info
            
        # If we don't have data, we MUST wait (first load)
        # Or if force_refresh is True, we wait.
        if force_refresh or self._cache_info is None:
            # If already scanning, wait for it
            if self._scanning:
                while self._scanning:
                    time.sleep(0.1)
                return self._cache_info
            else:
                self._background_scan()
                return self._cache_info
        
        return self._cache_info

    def force_refresh_path(self, new_path: str):
        """Force update cache path and clear cached info."""
        import threading
        if new_path:
            self.cache_dir = Path(new_path)
            self._cache_info = None
            threading.Thread(target=self._background_scan, daemon=True).start()
        else:
            self.cache_dir = None
            self._cache_info = None
            threading.Thread(target=self._background_scan, daemon=True).start()

    def get_summary(self, repo_type: Optional[str] = None) -> CacheSummary:
        """
        Get a summary of the cache.
        
        Args:
            repo_type: Optional filter by type ('model', 'dataset', 'space').
            
        Returns:
            CacheSummary with statistics.
        """
        cache_info = self.scan()
        
        models_count = 0
        datasets_count = 0
        spaces_count = 0
        total_revisions = 0
        total_size = 0
        total_repos = 0
        
        for repo in cache_info.repos:
            if repo_type and repo.repo_type != repo_type:
                continue
                
            total_size += repo.size_on_disk
            total_repos += 1
            total_revisions += len(repo.revisions)
            if repo.repo_type == 'model':
                models_count += 1
            elif repo.repo_type == 'dataset':
                datasets_count += 1
            elif repo.repo_type == 'space':
                spaces_count += 1
        
        # Collect warnings from corrupted entries
        warnings = []
        for warning in cache_info.warnings:
            warnings.append(str(warning))
        
        return CacheSummary(
            total_size=total_size,
            total_size_formatted=format_size(total_size),
            total_repos=total_repos,
            total_revisions=total_revisions,
            models_count=models_count,
            datasets_count=datasets_count,
            spaces_count=spaces_count,
            warnings=warnings
        )
    
    def get_repos_list(self, force_refresh: bool = False) -> list[RepoInfo]:
        """
        Get a list of all cached repositories with details.
        
        Args:
            force_refresh: Whether to force a rescan of the cache directory.

        Returns:
            List of RepoInfo objects.
        """
        # Optimized: Return in-memory cache if available (loaded from disk or previous scan)
        with self._lock:
            if self._cached_repos and not force_refresh:
                return list(self._cached_repos)
        
        # Fallback: Trigger scan if no data at all
        cache_info = self.scan(force_refresh=force_refresh)
        
        # If scan() returned efficiently (e.g. was already scanning), 
        # we might still need to process it if _cached_repos is empty.
        # But _background_scan updates _cached_repos, so we should check again.
        with self._lock:
            if self._cached_repos:
                return list(self._cached_repos)
                
        # If still empty (e.g. first run, scan finished but found nothing, or strictly synchronous scan called)
        # We manually process it strictly if we have to, but _background_scan should have handled it.
        # Let's just process whatever we have in cache_info
        return self._process_scan_info(cache_info)
    
    def delete_revisions(self, revision_hashes: list[str]) -> dict:
        """
        Delete specific revisions from the cache.
        
        Args:
            revision_hashes: List of commit hashes to delete.
            
        Returns:
            Dictionary with deletion results.
        """
        cache_info = self.scan(force_refresh=True)
        
        # Create deletion strategy
        delete_strategy = cache_info.delete_revisions(*revision_hashes)
        
        result = {
            'freed_size': delete_strategy.expected_freed_size,
            'freed_size_formatted': format_size(delete_strategy.expected_freed_size),
            'blobs_to_delete': len(delete_strategy.blobs),
            'refs_to_delete': len(delete_strategy.refs),
            'repos_to_delete': len(delete_strategy.repos),
            'snapshots_to_delete': len(delete_strategy.snapshots),
            'success': True,
            'message': 'Cache deletion successful'
        }
        
        # Execute deletion
        delete_strategy.execute()
        
        # Force refresh cache info after deletion
        self._cache_info = None
        
        return result
    
    def delete_repo(self, repo_id: str, repo_type: str = 'model') -> dict:
        """
        Delete all revisions of a repository.
        
        Args:
            repo_id: Repository ID to delete.
            repo_type: Type of repository ('model', 'dataset', 'space').
            
        Returns:
            Dictionary with deletion results.
        """
        cache_info = self.scan(force_refresh=True)
        
        # Find all revisions for this repo
        revision_hashes = []
        for repo in cache_info.repos:
            if repo.repo_id == repo_id and repo.repo_type == repo_type:
                for rev in repo.revisions:
                    revision_hashes.append(rev.commit_hash)
                break
        
        if not revision_hashes:
            return {
                'error': f'Repository {repo_id} not found in cache',
                'freed_size': 0
            }
        
        return self.delete_revisions(revision_hashes)

    def get_repo_details(self, repo_id: str, repo_type: str) -> Optional[RepoInfo]:
        """Find a specific repo in cache and return its info."""
        repos = self.get_repos_list()
        return next((r for r in repos if r.repo_id == repo_id and r.repo_type == repo_type), None)

    def get_local_readme(self, repo_id: str, repo_type: str) -> Optional[str]:
        """Try to find and read README.md from local cache."""
        # Refresh scan to get most recent data
        cache_info = self.scan()
        repo = next((r for r in cache_info.repos if r.repo_id == repo_id and r.repo_type == repo_type), None)
        
        if not repo or not repo.revisions:
            return None
            
        # Try snapshots in order (prefer main if available)
        revisions = list(repo.revisions)
        # Sort by last_modified
        revisions.sort(key=lambda r: r.last_modified, reverse=True)

        for rev in revisions:
            # Check if README.md exists in this revision
            for file in rev.files:
                if file.file_name == "README.md":
                    readme_path = file.file_path
                    if readme_path.exists():
                        try:
                            content = readme_path.read_text(encoding='utf-8')
                            # Strip YAML frontmatter if present
                            import re
                            if content.startswith('---'):
                                match = re.match(r'^---\n(.*?)\n---\n?', content, re.DOTALL)
                                if match:
                                    content = content[match.end():]
                            return content
                        except Exception:
                            continue
        return None

    def get_local_file_tree(self, repo_id: str, repo_type: str) -> list[dict]:
        """Get hierarchical file tree from local cache using scanned data."""
        cache_info = self.scan()
        repo = next((r for r in cache_info.repos if r.repo_id == repo_id and r.repo_type == repo_type), None)
        
        if not repo or not repo.revisions:
            return []
            
        # Use latest revision
        revisions = sorted(repo.revisions, key=lambda r: r.last_modified, reverse=True)
        latest_rev = revisions[0]
        
        result = []
        for file in latest_rev.files:
            # name can be nested path
            name = file.file_name
            result.append({
                "path": name.replace("\\", "/"),
                "size": file.size_on_disk,
                "lfs": True,
                "type": "file"
            })
        
        # Sort by path
        result.sort(key=lambda x: x['path'])
        return result
    
    def get_chart_data(self, repo_type: Optional[str] = None) -> list[dict]:
        """
        Get data formatted for chart visualization.
        
        Args:
            repo_type: Optional filter by type.
            
        Returns:
            List of dictionaries with 'name', 'size', 'percentage' for charting.
        """
        repos = self.get_repos_list()
        
        if repo_type:
            repos = [r for r in repos if r.repo_type == repo_type]
            
        total_size = sum(r.size_on_disk for r in repos)
        
        if total_size == 0:
            return []
        
        chart_data = []
        for repo in repos[:10]:  # Top 10 for chart
            chart_data.append({
                'name': repo.repo_id,
                'size': repo.size_on_disk,
                'size_formatted': repo.size_formatted,
                'percentage': (repo.size_on_disk / total_size) * 100
            })
        
        # Add "Others" if more than 10 repos
        if len(repos) > 10:
            others_size = sum(r.size_on_disk for r in repos[10:])
            chart_data.append({
                'name': 'Others',
                'size': others_size,
                'size_formatted': format_size(others_size),
                'percentage': (others_size / total_size) * 100
            })
        
        return chart_data
    
    def get_old_revisions(self, repo_type: Optional[str] = None) -> list[dict]:
        """
        Get all old revisions (not the latest) for cleanup preview.
        
        Args:
            repo_type: Optional filter by type.
            
        Returns:
            List of dictionaries with revision info to be deleted.
        """
        cache_info = self.scan(force_refresh=False)
        old_revisions = []
        
        for repo in cache_info.repos:
            if repo_type and repo.repo_type != repo_type:
                continue
                
            if len(repo.revisions) <= 1:
                continue
            
            # Sort revisions by last_modified (newest first)
            sorted_revs = sorted(
                repo.revisions,
                key=lambda r: r.last_modified if r.last_modified else 0,
                reverse=True
            )
            
            # Skip the first one (newest), mark others as old
            for rev in sorted_revs[1:]:
                old_revisions.append({
                    'repo_id': repo.repo_id,
                    'repo_type': repo.repo_type,
                    'commit_hash': rev.commit_hash,
                    'size_on_disk': rev.size_on_disk,
                    'size_formatted': format_size(rev.size_on_disk),
                    'last_modified': rev.last_modified,
                    'refs': list(rev.refs) if rev.refs else []
                })
        
        return old_revisions
    
    def clean_old_versions(self) -> dict:
        """
        Clean all old versions, keeping only the latest for each repo.
        
        Returns:
            Dictionary with cleanup results.
        """
        old_revisions = self.get_old_revisions()
        
        if not old_revisions:
            return {
                'success': True,
                'freed_size': 0,
                'freed_size_formatted': '0 B',
                'revisions_deleted': 0,
                'message': '没有需要清理的旧版本'
            }
        
        # Collect hashes to delete
        revision_hashes = [r['commit_hash'] for r in old_revisions]
        total_size = sum(r['size_on_disk'] for r in old_revisions)
        
        # Execute deletion
        result = self.delete_revisions(revision_hashes)
        result['revisions_deleted'] = len(revision_hashes)
        result['success'] = True
        
        return result

    def scan_incomplete_downloads(self, repo_type: Optional[str] = None) -> list[dict]:
        """Scan for .incomplete files in the cache directory."""
        if not self.cache_dir:
            self.scan() # Ensure cache_dir is set
        
        if not self.cache_dir:
             return []

        incomplete_files = []
        
        # Determine subdirectories to scan if repo_type is provided
        # HF cache structure is usually: cache_dir/models--author--repo_name/...
        # or cache_dir/datasets--author--repo_name/...
        prefix = ""
        if repo_type == 'model':
            prefix = "models--"
        elif repo_type == 'dataset':
            prefix = "datasets--"
        elif repo_type == 'space':
            prefix = "spaces--"

        # Recursive search for .incomplete files
        for path in self.cache_dir.rglob("*.incomplete"):
            if repo_type and prefix and prefix not in path.as_posix():
                continue
                
            if path.is_file():
                try:
                    stat = path.stat()
                    incomplete_files.append({
                        "path": str(path),
                        "name": path.name,
                        "size": stat.st_size,
                        "size_formatted": format_size(stat.st_size),
                        "last_modified_ts": stat.st_mtime
                    })
                except OSError:
                    continue
        
        return incomplete_files

    def delete_incomplete_downloads(self) -> dict:
        """Delete all .incomplete files."""
        items = self.scan_incomplete_downloads()
        deleted_count = 0
        freed_size = 0
        
        for item in items:
            try:
                Path(item['path']).unlink()
                deleted_count += 1
                freed_size += item['size']
            except OSError as e:
                print(f"Error deleting {item['path']}: {e}")
        
        return {
            "success": True,
            "count": deleted_count,
            "freed_size": freed_size,
            "freed_size_formatted": format_size(freed_size)
        }

    def get_analysis_report(self, repo_type: Optional[str] = None) -> dict:
        """
        Generate a comprehensive analysis report for Cache Doctor.
        """
        # 1. Basic Scan
        summary = self.get_summary(repo_type=repo_type)
        
        # 2. Storage Breakdown (Top Repos)
        chart_data = self.get_chart_data(repo_type=repo_type)
        
        # 3. Reclaimable: Incomplete Downloads
        incomplete_items = self.scan_incomplete_downloads(repo_type=repo_type)
        incomplete_size = sum(i['size'] for i in incomplete_items)
        
        # 4. Reclaimable: Old Revisions (Orphans)
        old_revisions = self.get_old_revisions(repo_type=repo_type)
        old_rev_size = sum(r['size_on_disk'] for r in old_revisions)
        
        return {
            "summary": {
                "total_size": summary.total_size,
                "total_size_formatted": summary.total_size_formatted,
                "models_count": summary.models_count,
                "datasets_count": summary.datasets_count,
                "spaces_count": summary.spaces_count,
            },
            "chart_data": chart_data,
            "reclaimable": {
                "incomplete": {
                    "count": len(incomplete_items),
                    "size": incomplete_size,
                    "size_formatted": format_size(incomplete_size)
                },
                "old_revisions": {
                    "count": len(old_revisions),
                    "size": old_rev_size,
                    "size_formatted": format_size(old_rev_size)
                },
                "total_size": incomplete_size + old_rev_size,
                "total_size_formatted": format_size(incomplete_size + old_rev_size)
            }
        }
    def get_model_path(self, repo_id: str, revision: str) -> Optional[str]:
        """Resolve repo_id and revision to absolute local path."""
        with self._lock:
            for repo in self._cached_repos:
                if repo.repo_id == repo_id and repo.repo_type == 'model':
                    for rev in repo.revisions:
                        # Check commit hash (usually full hash, but maybe partial? strict equality safest)
                        if rev.get('commit_hash') == revision:
                            return rev.get('snapshot_path')
                        # Check refs (branches/tags)
                        if revision in rev.get('refs', []):
                            return rev.get('snapshot_path')
        return None
