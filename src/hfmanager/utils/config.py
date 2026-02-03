"""
Configuration management for HFManager.
Handles persistent settings like mirror selection, download paths, etc.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional


class Config:
    """Application configuration manager with persistent storage."""
    
    # Default configuration values
    DEFAULTS = {
        'mirror': 'hf-mirror',
        'use_hf_transfer': False,
        'download_dir': '',  # Empty means use HF default cache
        'max_concurrent_downloads': 3,
        'default_search_limit': 10,
        'theme': 'dark',
        'show_hidden_files': False,
        'auto_clean_incomplete': False,
        'hf_cache_dir': '',  # Empty means use System default
        'hf_cache_history': [],  # List of historical cache paths
        'download_dir_history': [], # List of historical download paths
        'proxy_url': '',  # HTTP Proxy URL (http://user:pass@host:port)
        'check_update_on_start': True,
        'auto_start': False,
        'accounts': [],  # List of {username, token, avatar, fullname, email, is_pro}
        'download_method': 'PYTHON', # 'PYTHON' (Method A) or 'ARIA2' (Method B)
        'python_max_workers': 8, # Max threads for Python mode (per repo)
        'aria2_cache_structure': True, # True=HF Cache (blobs+symlink), False=Direct Folder
        'aria2_port': 6810,
        'aria2_max_connection_per_server': 16,
        'aria2_split': 16, 
        'aria2_min_split_size': '1M',
        'aria2_check_certificate': False, # Default False for stability in CN
        'aria2_all_proxy': '', # Specific proxy for Aria2 (overrides system)
        'aria2_reuse_uri': True, # Keep connections alive
        
        # Home Page Visibility Defaults
        'show_search_history': True,
        'show_trending_tags': True,
        'show_trending_repos': True,
        'debug_mode': False,
    }
    
    def __init__(self, config_dir: Optional[Path] = None):
        """
        Initialize configuration manager.
        
        Args:
            config_dir: Optional custom config directory. 
                       If None, uses platform-specific default.
        """
        if config_dir is None:
            # Use platform-specific config directory
            if os.name == 'nt':  # Windows
                config_dir = Path(os.environ.get('APPDATA', '~')) / 'HFManager'
            else:  # macOS/Linux
                config_dir = Path.home() / '.config' / 'hfmanager'
        
        self.config_dir = Path(config_dir).expanduser()
        self.config_file = self.config_dir / 'config.json'
        # Data directory for dynamic storage (queues, indexes)
        self.data_dir = self.config_dir / 'data'
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        self._config: dict[str, Any] = {}
        self._load()
    
    def _load(self) -> None:
        """Load configuration from file."""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    self._config = json.load(f)
            except (json.JSONDecodeError, IOError):
                self._config = {}
        
        # Merge with defaults
        for key, value in self.DEFAULTS.items():
            if key not in self._config:
                self._config[key] = value
    
    def _save(self) -> None:
        """Save configuration to file."""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(self._config, f, indent=2, ensure_ascii=False)
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get a configuration value."""
        return self._config.get(key, default if default is not None else self.DEFAULTS.get(key))
    
    def set(self, key: str, value: Any) -> None:
        """Set a configuration value and persist it."""
        self._config[key] = value
        self._save()
    
    def get_all(self) -> dict[str, Any]:
        """Get all configuration values."""
        return self._config.copy()
    
    def reset(self) -> None:
        """Reset all configuration to defaults."""
        self._config = self.DEFAULTS.copy()
        self._save()


# Global config instance
_config: Optional[Config] = None


def get_config() -> Config:
    """Get global configuration instance."""
    global _config
    if _config is None:
        _config = Config()
    return _config


def get_config_dir() -> str:
    """Get configuration directory path."""
    return str(get_config().config_dir)
