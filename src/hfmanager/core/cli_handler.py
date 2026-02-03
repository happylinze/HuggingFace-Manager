CLI Handler for Hugging Face Manager.
Provides logic for terminal-based search, download, and cache management.
"""
import sys
import os
import argparse
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor

from huggingface_hub import HfApi, snapshot_download
from .downloader import HFDownloader
from .cache_manager import CacheManager
from ..utils.system import format_size
from ..utils.config import get_config

def run_search(query: str, repo_type: str = "model", limit: int = 10):
    """Search HF and print results to terminal."""
    print(f"\n🔍 Searching for '{query}' in {repo_type}s...")
    
    api = HfApi()
    try:
        if repo_type == "model":
            results = api.list_models(search=query, limit=limit, sort="downloads", direction=-1)
        elif repo_type == "dataset":
            results = api.list_datasets(search=query, limit=limit, sort="downloads", direction=-1)
        else:
            print(f"❌ Unsupported repo type: {repo_type}")
            return

        results_list = list(results)
        if not results_list:
            print("❓ No results found.")
            return

        print(f"{'ID':<60} | {'DLs':<10} | {'Likes':<10}")
        print("-" * 85)
        for r in results_list:
            downloads = getattr(r, 'downloads', 0)
            likes = getattr(r, 'likes', 0)
            print(f"{r.id:<60} | {downloads:<10} | {likes:<10}")
        print("-" * 85)
    except Exception as e:
        print(f"❌ Error during search: {e}")

def run_download(repo_id: str, repo_type: str = "model", include: Optional[List[str]] = None, exclude: Optional[List[str]] = None, revision: str = "main"):
    """Download a repository with a progress bar."""
    print(f"\n📥 Starting download for {repo_id}...")
    
    # Check if we should use hf-transfer
    config = get_config()
    use_hf_transfer = config.get('use_hf_transfer', False)
    if use_hf_transfer:
        os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
        print("🚀 HF Transfer enabled for faster downloads.")

    # Get cache dir
    cache_dir = config.get('hf_cache_dir')
    local_dir = config.get('download_dir')
    
    try:
        # We use snapshot_download directly for CLI as it has built-in tqdm progress
        path = snapshot_download(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            allow_patterns=include,
            ignore_patterns=exclude,
            cache_dir=cache_dir,
            local_dir=local_dir,
            local_dir_use_symlinks=False, # Standard Antigravity behavior
            resume_download=True
        )
        print(f"\n✅ Download complete! Files saved to: {path}")
    except Exception as e:
        print(f"\n❌ Download failed: {e}")

def run_cache():
    """Display cache summary in terminal."""
    print("\n📦 Hugging Face Manager Cache Summary")
    
    manager = CacheManager()
    summary = manager.get_summary()
    
    print("-" * 40)
    print(f"{'Total Size:':<20} {summary.total_size_formatted}")
    print(f"{'Total Repos:':<20} {summary.total_repos}")
    print(f"{'Models:':<20} {summary.models_count}")
    print(f"{'Datasets:':<20} {summary.datasets_count}")
    print(f"{'Spaces:':<20} {summary.spaces_count}")
    print("-" * 40)
    
    if summary.warnings:
        print("\n⚠️ Warnings:")
        for w in summary.warnings:
            print(f"  - {w}")
    
    print("\nUse 'python -m hfmanager cache --list' to see all repos.")

def list_cache_repos():
    """List all cached repositories."""
    manager = CacheManager()
    repos = manager.get_repos_list()
    
    print(f"\n{'ID':<60} | {'Type':<10} | {'Size':<10}")
    print("-" * 85)
    for r in repos:
        print(f"{r.repo_id:<60} | {r.repo_type:<10} | {r.size_formatted:<10}")
    print("-" * 85)
