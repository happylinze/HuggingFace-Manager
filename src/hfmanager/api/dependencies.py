from typing import Optional
from ..core.downloader import HFDownloader, SingleFileDownloader, get_single_file_downloader
from ..core.cache_manager import CacheManager
from ..core.mirror_manager import MirrorManager, get_mirror_manager
from ..core.auth_manager import AuthManager
from ..core.metadata_parser import MetadataParser, get_metadata_parser

# Manual singleton management for those that don't have it in core
_downloader: Optional[HFDownloader] = None
_cache_manager: Optional[CacheManager] = None
_auth_manager: Optional[AuthManager] = None

def get_downloader() -> HFDownloader:
    """Get global downloader instance."""
    global _downloader
    if _downloader is None:
        _downloader = HFDownloader()
    return _downloader

def get_cache_manager() -> CacheManager:
    """Get global cache manager instance."""
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = CacheManager()
    return _cache_manager

def get_auth_manager() -> AuthManager:
    """Get global auth manager instance."""
    global _auth_manager
    if _auth_manager is None:
        _auth_manager = AuthManager()
    return _auth_manager

# Re-exporting existing ones
from ..core.mirror_manager import get_mirror_manager
from ..core.downloader import get_single_file_downloader

# Plugin Manager
from ..core.plugin_manager import PluginManager
from ..utils.config import get_config_dir

_plugin_manager: Optional[PluginManager] = None

def get_plugin_manager() -> PluginManager:
    """Get global plugin manager instance."""
    global _plugin_manager
    if _plugin_manager is None:
        _plugin_manager = PluginManager(get_config_dir())
    return _plugin_manager
