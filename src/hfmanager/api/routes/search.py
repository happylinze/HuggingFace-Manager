from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from huggingface_hub import HfApi, hf_hub_download, utils
import concurrent.futures
import requests
import urllib3
import datetime

# Disable insecure request warnings for proxy compatibility
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from ..dependencies import get_downloader, get_metadata_parser
from ..models.search import (
    SearchResponse, SearchResultModel, RepoFilesResponse, RepoFileModel,
    ReadmeResponse, ModelInfoResponse, RepoTreeResponse, FileNode,
    TrendingResponse, TrendingReposResponse
)
from ...core.downloader import HFDownloader
from ...core.metadata_parser import MetadataParser
from ...utils.system import format_size
from collections import Counter

router = APIRouter(prefix="/search", tags=["Search"])

# Lazy cache for trending tags
_TRENDING_CACHE: Optional[List[str]] = None

from ...core.auth_manager import get_auth_manager

def _parse_iso8601(dt_str: str) -> datetime.datetime:
    """Robust ISO 8601 parser for Python 3.8+ without dateutil."""
    import datetime
    # Remove 'Z', replace with +00:00
    if dt_str.endswith('Z'):
        dt_str = dt_str[:-1] + '+00:00'
    # Handle fractional seconds (e.g. .123) which fromisoformat might struggle with in old Python
    if '.' in dt_str:
        base, frac = dt_str.split('.')
        # Keep only up to 6 digits for microseconds and handle timezone
        if '+' in frac:
            f, tz = frac.split('+', 1)
            dt_str = f"{base}.{f[:6]}+{tz}"
        elif '-' in frac:
            f, tz = frac.split('-', 1)
            dt_str = f"{base}.{f[:6]}-{tz}"
        else:
            dt_str = f"{base}.{frac[:6]}"
            
    try:
        return datetime.datetime.fromisoformat(dt_str)
    except ValueError:
        # Fallback for very complex strings
        try:
            # Try to strip anything after + or - for a simple parse
            simple_date = dt_str.split('+')[0].split('-')[0].strip()
            return datetime.datetime.strptime(simple_date, "%Y-%m-%dT%H:%M:%S")
        except:
            return datetime.datetime.now(datetime.timezone.utc)

@router.get("/trending", response_model=TrendingResponse)
def get_trending(downloader: HFDownloader = Depends(get_downloader)):
    """Get trending tags based on top downloads (Cached on startup)."""
    global _TRENDING_CACHE
    
    if _TRENDING_CACHE is not None:
        return {"tags": _TRENDING_CACHE}
        
    try:
        token = get_auth_manager().get_token()
        # Fetch top 200 models to analyze trends
        results = downloader.api.list_models(
            limit=200,
            sort="downloads",
            direction=-1,
            expand=["pipeline_tag", "lastModified"],
            token=token
        )
        
        # Filter statistics to last 7 days as requested
        import datetime
        
        now = datetime.datetime.now(datetime.timezone.utc)
        cutoff = now - datetime.timedelta(days=7)
        
        # Count pipeline tags from recently updated/active popular models
        tags = []
        for model in results:
            # Check if model was updated in last 7 days
            if hasattr(model, 'lastModified') and model.lastModified:
                # Handle datetime or string format
                if isinstance(model.lastModified, str):
                    mod_time = _parse_iso8601(model.lastModified)
                else:
                    mod_time = model.lastModified
                
                # Normalize timezones for comparison
                if mod_time.tzinfo is None:
                    mod_time = mod_time.replace(tzinfo=datetime.timezone.utc)
                elif mod_time.tzinfo != datetime.timezone.utc:
                    # Basic normalization to UTC for comparison
                    mod_time = mod_time.astimezone(datetime.timezone.utc)
                    
                if mod_time < cutoff:
                    continue
            
            if hasattr(model, 'pipeline_tag') and model.pipeline_tag:
                tags.append(model.pipeline_tag)
                
        # Get top 8 most common tags
        most_common = [tag for tag, count in Counter(tags).most_common(8)]
        
        if not most_common:
            # Fallback if strict filtering returns nothing, relax to top results without date filter
            tags = [m.pipeline_tag for m in results if hasattr(m, 'pipeline_tag') and m.pipeline_tag]
            most_common = [tag for tag, count in Counter(tags).most_common(8)]

        if not most_common:
             # Ultimate fallback
            most_common = ["text-generation", "image-classification", "text-classification", 
                          "token-classification", "automatic-speech-recognition", "object-detection"]
            
        _TRENDING_CACHE = most_common
        return {"tags": _TRENDING_CACHE}
        
    except Exception as e:
        print(f"Error fetching trending tags: {e}")
        # Return fallback on error
        return {"tags": ["text-generation", "text-to-image", "conversational"]}

from typing import List, Optional, Dict

def _fetch_avatar(author: str, hf_endpoint: str) -> Optional[str]:
    """Fetch avatar URL for a single author."""
    if not author or author.lower() in ["none", "unknown"]:
        return None
    
    try:
        # Try User API first
        url = f"{hf_endpoint}/api/users/{author}/overview"
        response = requests.get(url, timeout=2, verify=False)
        
        if response.status_code == 404:
            # Fallback to Organization API
            url = f"{hf_endpoint}/api/organizations/{author}/overview"
            response = requests.get(url, timeout=2, verify=False)
            
        if response.status_code == 200:
            data = response.json()
            return data.get("avatarUrl")
    except Exception:
        pass
    return None

def _fetch_avatars_concurrently(authors: List[str], hf_endpoint: str) -> Dict[str, str]:
    """Fetch avatars for multiple authors in parallel."""
    unique_authors = list(set([a for a in authors if a]))
    results = {}
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_author = {
            executor.submit(_fetch_avatar, author, hf_endpoint): author 
            for author in unique_authors
        }
        for future in concurrent.futures.as_completed(future_to_author):
            author = future_to_author[future]
            try:
                avatar_url = future.result()
                if avatar_url:
                    results[author] = avatar_url
            except Exception:
                pass
                
    return results

@router.get("/trending/repos", response_model=TrendingReposResponse)
def get_trending_repos(type: str = "model", limit: int = 10, downloader: HFDownloader = Depends(get_downloader)):
    """Get trending repositories by type."""
    try:
        from ...core.auth_manager import get_auth_manager
        token = get_auth_manager().get_token()
        
        repo_type_map = {"model": "model", "dataset": "dataset", "space": "space"}
        hf_type = repo_type_map.get(type, "model")
        essential_fields = ["author", "downloads", "lastModified", "likes", "private", "tags", "trendingScore"]
        
        print(f"DEBUG: Fetching trending {hf_type}s using trendingScore (limit={limit})...")
        
        results = []
        # Try trendingScore first (Homepage Trending)
        try:
            if hf_type == "model":
                results = list(downloader.api.list_models(sort="trendingScore", direction=-1, limit=limit, token=token, expand=essential_fields))
            elif hf_type == "dataset":
                results = list(downloader.api.list_datasets(sort="trendingScore", direction=-1, limit=limit, token=token, expand=essential_fields))
            elif hf_type == "space":
                results = list(downloader.api.list_spaces(sort="trendingScore", direction=-1, limit=limit, token=token, expand=essential_fields))
                if not results:
                    results = list(downloader.api.list_spaces(sort="likes", direction=-1, limit=limit, token=token, expand=essential_fields))
                if not results:
                    results = list(downloader.api.list_spaces(sort="lastModified", direction=-1, limit=limit, token=token, expand=essential_fields))
        except Exception as te:
            print(f"DEBUG: trendingScore sort failed for {hf_type}: {te}")
            results = []

        # Fallback to downloads/likes if trendingScore is empty
        if not results:
            print(f"DEBUG: trendingScore empty, falling back to downloads sort for {hf_type}...")
            if hf_type == "model":
                results = list(downloader.api.list_models(sort="downloads", direction=-1, limit=limit, token=token, expand=essential_fields))
            elif hf_type == "dataset":
                results = list(downloader.api.list_datasets(sort="downloads", direction=-1, limit=limit, token=token, expand=essential_fields))
            elif hf_type == "space":
                results = list(downloader.api.list_spaces(sort="likes", direction=-1, limit=limit, token=token, expand=essential_fields))
            
        print(f"DEBUG: Found {len(results)} {hf_type}s")
        
        # Extract authors for avatar fetching
        authors = []
        clean_results = []
        
        for r in results:
            # Safely get attributes using getattr or dict access if it's a dict (from API fallback)
             # Handle both object and dict (requests fallback might return dicts if we changed implementation, 
             # but here we use hf_hub objects mostly. Just to be safe)
            obj_id = getattr(r, 'id', str(r)) if not isinstance(r, str) else r
            author = obj_id.split('/')[0] if '/' in obj_id else None
            
            if author:
                authors.append(author)
                
            clean_results.append({
                "obj": r,
                "author": author,
                "id": obj_id
            })
            
        # Parallel fetch avatars
        # Use mirror endpoint if configured? actually downloader.api.endpoint gives the endpoint
        hf_endpoint = downloader.api.endpoint or "https://huggingface.co"
        # If using mirror in config, explicit override might be safer
        # config = Config() ... but we rely on requests connecting to the same place
        
        # Check if we are using mirror
        from ...utils.config import get_config
        config = get_config()
        if config.get('mirror') == 'hf-mirror':
             hf_endpoint = "https://hf-mirror.com"
             
        avatar_map = _fetch_avatars_concurrently(authors, hf_endpoint)

        return {
            "results": [
                SearchResultModel(
                    id=item["id"],
                    name=item["id"].split('/')[-1] if '/' in item["id"] else item["id"],
                    author=item["author"],
                    last_modified=getattr(item["obj"], 'lastModified').isoformat() if hasattr(item["obj"], 'lastModified') and getattr(item["obj"], 'lastModified') else None,
                    downloads=getattr(item["obj"], 'downloads', 0) or 0,
                    likes=getattr(item["obj"], 'likes', 0) or 0,
                    tags=getattr(item["obj"], 'tags', []),
                    repo_type=type,
                    avatar_url=avatar_map.get(item["author"])
                ) for item in clean_results
            ]
        }
    except Exception as e:
        print(f"Error fetching trending repos ({type}): {e}")
        return {"results": []}

@router.get("/", response_model=SearchResponse)
def search_repos(q: str, repo_type: str = "model", sort: Optional[str] = None, limit: Optional[int] = None, 
                       downloader: HFDownloader = Depends(get_downloader)):
    """Search for repositories on Hugging Face."""
    try:
        # Use configured default if limit is not provided
        if limit is None:
            limit = downloader.config.get('default_search_limit', 10)
            
        token = get_auth_manager().get_token()
        print(f"DEBUG: Search query: '{q}', type: {repo_type}, limit: {limit}, token: {'***' if token else 'None'}")
        
        # Parse query for special filters like 'author:'
        author_filter = None
        search_query = q
        
        if q.startswith("author:"):
            author_filter = q.split("author:")[1].strip()
            search_query = None # Clear search query if we are filtering by author

        # Default to sort by downloads if searching by keyword and no sort specified
        # This improves relevance (e.g. searching 'bert' shows 'bert-base-uncased' first)
        # And benchmark shows it's faster (~0.5s)
        if search_query and not sort:
            sort = "downloads"
            
        print(f"DEBUG: author_filter={author_filter}, search_query={search_query}, sort={sort}, token={'***' if token else 'None'}")
        
        # Blocking call run in threadpool by FastAPI
        # Only fetch essential fields for fast search response
        essential_fields = ["author", "downloads", "lastModified", "likes", "private", "tags"]
        
        if repo_type == "model":
            results = downloader.api.list_models(
                search=search_query, 
                author=author_filter,
                limit=limit, 
                sort=sort, 
                direction=-1,
                expand=essential_fields,  # Only fetch what we need
                token=token
            )
        elif repo_type == "dataset":
            results = downloader.api.list_datasets(
                search=search_query, 
                author=author_filter,
                limit=limit, 
                sort=sort, 
                direction=-1,
                expand=essential_fields,  # Only fetch what we need
                token=token
            )
        elif repo_type == "space":
            results = downloader.api.list_spaces(
                search=search_query, 
                author=author_filter,
                limit=limit, 
                sort=sort, 
                direction=-1,
                expand=essential_fields,  # Only fetch what we need
                token=token
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid repo_type")
        
        # Convert iterator to list to debug count
        results_list = list(results)
        print(f"DEBUG: Found {len(results_list)} results")

        return {
            "results": [
                SearchResultModel(
                    id=r.id,
                    name=r.id.split('/')[-1] if '/' in r.id else r.id,
                    author=r.id.split('/')[0] if '/' in r.id else None,
                    last_modified=r.lastModified.isoformat() if hasattr(r, 'lastModified') and r.lastModified else None,
                    downloads=getattr(r, 'downloads', 0),
                    likes=getattr(r, 'likes', 0),
                    tags=getattr(r, 'tags', []),
                    private=getattr(r, 'private', False),
                    repo_type=repo_type
                ) for r in results_list
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/readme/{repo_id:path}", response_model=ReadmeResponse)
def get_readme(repo_id: str, repo_type: str = "model"):
    """Get the README.md content of a repository."""
    try:
        path = hf_hub_download(repo_id=repo_id, filename="README.md", repo_type=repo_type)
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        return {"content": content}
    except utils.EntryNotFoundError:
        return {"content": "# No README found"}
    except Exception as e:
        return {"content": f"> **Error fetching README**: {str(e)}"}

@router.get("/content/{repo_id:path}", response_model=ReadmeResponse)
def get_file_content(repo_id: str, path: str, repo_type: str = "model", revision: str = "main"):
    """Get the text content of a file in a repository."""
    import os
    try:
        # Avoid downloading very large files for preview
        # Limit to 1MB
        local_path = hf_hub_download(repo_id=repo_id, filename=path, repo_type=repo_type, revision=revision)
        file_size = os.path.getsize(local_path)
        if file_size > 1024 * 1024:
            return {"content": f"> **File too large for preview** ({format_size(file_size)}). Please download it to view locally."}
            
        with open(local_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        return {"content": content}
    except utils.EntryNotFoundError:
        return {"content": "> **File not found in repository**"}
    except Exception as e:
        return {"content": f"> **Error fetching file content**: {str(e)}"}


@router.get("/info/{repo_id:path}", response_model=ModelInfoResponse)
def get_info(repo_id: str, repo_type: str = "model", downloader: HFDownloader = Depends(get_downloader)):
    """Get detailed metadata of a repository."""
    try:
        token = get_auth_manager().get_token()
        if repo_type == "model":
            info = downloader.api.model_info(repo_id, token=token)
        elif repo_type == "dataset":
            info = downloader.api.dataset_info(repo_id, token=token)
        else:
            raise HTTPException(status_code=400, detail="Invalid repo_type")
            
        return {
            "id": info.id,
            "sha": info.sha,
            "lastModified": str(info.lastModified),
            "tags": info.tags,
            "pipeline_tag": getattr(info, 'pipeline_tag', None),
            "library_name": getattr(info, 'library_name', None),
            "likes": getattr(info, 'likes', 0),
            "downloads": getattr(info, 'downloads', 0),
            "private": getattr(info, 'private', False),
            "gated": str(getattr(info, 'gated', '')) if getattr(info, 'gated', False) else None
        }
    except Exception as e:
         raise HTTPException(status_code=404, detail=str(e))

@router.get("/tree/{repo_id:path}", response_model=RepoTreeResponse)
async def get_tree(
    repo_id: str, 
    repo_type: str = "model",
    revision: str = "main",
    metadata_parser: MetadataParser = Depends(get_metadata_parser)
):
    """Get file tree from a repository."""
    try:
        files = metadata_parser.get_file_list(repo_id, repo_type=repo_type, revision=revision)
        
        tree_files = []
        total_size = 0
        for f in files:
            size = f.get('size', 0)
            total_size += size
            tree_files.append(FileNode(
                path=f['path'],
                size=size,
                lfs=f.get('lfs', False)
            ))
            
        return {
            "files": tree_files,
            "count": len(tree_files),
            "total_size": total_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/refs/{repo_id:path}", response_model=dict)
def get_refs(
    repo_id: str, 
    type: str = "model",
    metadata_parser: MetadataParser = Depends(get_metadata_parser)
):
    """Get branches and tags."""
    return metadata_parser.get_repo_refs(repo_id, repo_type=type)
