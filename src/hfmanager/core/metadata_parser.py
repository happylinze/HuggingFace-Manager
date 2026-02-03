"""
Metadata Parser for Hugging Face models and datasets.
Fetches and parses model/dataset information including README, model card, etc.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from huggingface_hub import HfApi, ModelCard, DatasetCard
from huggingface_hub.utils import EntryNotFoundError, RepositoryNotFoundError
import markdown


@dataclass
class ModelMetadata:
    """Parsed metadata for a model."""
    repo_id: str
    repo_type: str
    author: str
    model_name: str
    
    # Basic info
    downloads: int
    likes: int
    tags: list[str]
    pipeline_tag: Optional[str]
    library_name: Optional[str]
    
    # License
    license: Optional[str]
    
    # Model card
    readme_md: Optional[str]
    readme_html: Optional[str]
    
    # Size info
    files_count: int
    total_size: Optional[int]
    
    # Additional
    base_model: Optional[str]
    datasets: list[str]
    languages: list[str]
    
    # Status
    private: bool
    gated: bool
    
    @property
    def size_formatted(self) -> str:
        if not self.total_size:
            return "未知"
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if self.total_size < 1024:
                return f"{self.total_size:.1f} {unit}"
            self.total_size /= 1024
        return f"{self.total_size:.1f} PB"


class MetadataParser:
    """
    Parser for Hugging Face model/dataset metadata.
    
    Fetches information from the HF API and parses model cards.
    """
    
    def __init__(self):
        self.api = HfApi()
        self._md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc'])
        
    def _ensure_api_endpoint(self):
        """Ensure HfApi uses current HF_ENDPOINT from env."""
        import os
        current = os.environ.get('HF_ENDPOINT')
        if current and self.api.endpoint != current:
            self.api.endpoint = current
    
    def get_model_metadata(self, repo_id: str) -> ModelMetadata:
        """
        Fetch and parse metadata for a model.
        
        Args:
            repo_id: Repository ID (e.g., 'meta-llama/Llama-2-7b-hf')
            
        Returns:
            ModelMetadata object with parsed information.
            
        Raises:
            RepositoryNotFoundError: If the repository doesn't exist.
        """
        try:
            self._ensure_api_endpoint()
            # Get model info from API
            model_info = self.api.model_info(repo_id, files_metadata=True)
            
            # Parse author and model name
            parts = repo_id.split('/')
            author = parts[0] if len(parts) > 1 else ""
            model_name = parts[-1]
            
            # Get files info
            files_count = len(model_info.siblings) if model_info.siblings else 0
            total_size = sum(
                f.size for f in (model_info.siblings or []) 
                if f.size is not None
            )
            
            # Get README content
            readme_md = None
            readme_html = None
            try:
                card = ModelCard.load(repo_id)
                readme_md = card.text
                if readme_md:
                    self._md.reset()
                    readme_html = self._md.convert(readme_md)
            except Exception:
                pass
            
            # Extract tags
            tags = list(model_info.tags) if model_info.tags else []
            
            # Extract base model from tags or card data
            base_model = None
            datasets = []
            languages = []
            
            for tag in tags:
                if tag.startswith('base_model:'):
                    base_model = tag.split(':', 1)[1]
                elif tag.startswith('dataset:'):
                    datasets.append(tag.split(':', 1)[1])
                elif tag.startswith('language:'):
                    languages.append(tag.split(':', 1)[1])
            
            return ModelMetadata(
                repo_id=repo_id,
                repo_type='model',
                author=author,
                model_name=model_name,
                downloads=model_info.downloads or 0,
                likes=model_info.likes or 0,
                tags=tags,
                pipeline_tag=model_info.pipeline_tag,
                library_name=model_info.library_name,
                license=model_info.card_data.license if model_info.card_data else None,
                readme_md=readme_md,
                readme_html=readme_html,
                files_count=files_count,
                total_size=total_size,
                base_model=base_model,
                datasets=datasets,
                languages=languages,
                private=model_info.private or False,
                gated=model_info.gated if hasattr(model_info, 'gated') else False
            )
            
        except RepositoryNotFoundError:
            raise
        except Exception as e:
            raise RuntimeError(f"Failed to fetch model metadata: {e}")
    
    def get_dataset_metadata(self, repo_id: str) -> ModelMetadata:
        """
        Fetch and parse metadata for a dataset.
        """
        try:
            self._ensure_api_endpoint()
            dataset_info = self.api.dataset_info(repo_id, files_metadata=True)
            
            parts = repo_id.split('/')
            author = parts[0] if len(parts) > 1 else ""
            dataset_name = parts[-1]
            
            files_count = len(dataset_info.siblings) if dataset_info.siblings else 0
            total_size = sum(
                f.size for f in (dataset_info.siblings or [])
                if f.size is not None
            )
            
            readme_md = None
            readme_html = None
            try:
                card = DatasetCard.load(repo_id)
                readme_md = card.text
                if readme_md:
                    self._md.reset()
                    readme_html = self._md.convert(readme_md)
            except Exception:
                pass
            
            tags = list(dataset_info.tags) if dataset_info.tags else []
            
            return ModelMetadata(
                repo_id=repo_id,
                repo_type='dataset',
                author=author,
                model_name=dataset_name,
                downloads=dataset_info.downloads or 0,
                likes=dataset_info.likes or 0,
                tags=tags,
                pipeline_tag=None,
                library_name=None,
                license=dataset_info.card_data.license if dataset_info.card_data else None,
                readme_md=readme_md,
                readme_html=readme_html,
                files_count=files_count,
                total_size=total_size,
                base_model=None,
                datasets=[],
                languages=[],
                private=dataset_info.private or False,
                gated=dataset_info.gated if hasattr(dataset_info, 'gated') else False
            )
            
        except RepositoryNotFoundError:
            raise
        except Exception as e:
            raise RuntimeError(f"Failed to fetch dataset metadata: {e}")
    
    def get_file_list(self, repo_id: str, repo_type: str = 'model', 
                      revision: str = 'main') -> list[dict]:
        """
        Get list of files in a repository with sizes.
        """
        try:
            self._ensure_api_endpoint()
            if repo_type == 'model':
                info = self.api.model_info(repo_id, revision=revision, files_metadata=True)
            else:
                info = self.api.dataset_info(repo_id, revision=revision, files_metadata=True)
            
            files = []
            for f in (info.siblings or []):
                size_str = ""
                if f.size:
                    size = f.size
                    for unit in ['B', 'KB', 'MB', 'GB']:
                        if size < 1024:
                            size_str = f"{size:.1f} {unit}"
                            break
                        size /= 1024
                    else:
                        size_str = f"{size:.1f} TB"
                
                files.append({
                    'path': f.rfilename,
                    'size': f.size or 0,
                    'size_formatted': size_str,
                    'lfs': f.lfs is not None if hasattr(f, 'lfs') else False
                })
            
            # Sort by size descending
            files.sort(key=lambda x: x['size'], reverse=True)
            return files
            
        except Exception as e:
            print(f"Error fetching file list for {repo_id}@{revision}: {e}")
            return []
            
    def get_repo_refs(self, repo_id: str, repo_type: str = 'model') -> dict:
        """
        Get list of branches and tags for a repository.
        """
        try:
            self._ensure_api_endpoint()
            refs = self.api.list_repo_refs(repo_id, repo_type=repo_type)
            
            return {
                'branches': [b.name for b in refs.branches],
                'tags': [t.name for t in refs.tags]
            }
        except Exception as e:
            # Fallback for Gated models if token is invalid or other errors
            # Return at least main
            return {'branches': ['main'], 'tags': []}


# Global instance
_parser: Optional[MetadataParser] = None


def get_metadata_parser() -> MetadataParser:
    """Get global metadata parser instance."""
    global _parser
    if _parser is None:
        _parser = MetadataParser()
    return _parser
