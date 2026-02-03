"""
Mirror Manager for Hugging Face endpoints.
Handles switching between official and mirror sites.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from ..utils.config import get_config


@dataclass
class MirrorInfo:
    """Information about a mirror endpoint."""
    key: str
    name: str
    url: str
    description: str
    region: str  # 'global', 'china', etc.
    

class MirrorManager:
    """
    Manager for Hugging Face mirror/endpoint switching.
    
    Allows seamless switching between official HuggingFace and mirror sites
    like hf-mirror for users in regions with limited access.
    """
    
    # Built-in mirror definitions
    MIRRORS: dict[str, MirrorInfo] = {
        'official': MirrorInfo(
            key='official',
            name='Official (HuggingFace)',
            url='https://huggingface.co',
            description='Official Hugging Face website',
            region='global'
        ),
        'hf-mirror': MirrorInfo(
            key='hf-mirror',
            name='HF-Mirror (中国镜像)',
            url='https://hf-mirror.com',
            description='Chinese mirror site, faster access in China',
            region='china'
        ),
    }
    
    # Environment variable used by huggingface_hub
    ENV_VAR = 'HF_ENDPOINT'
    
    def __init__(self):
        """Initialize the mirror manager."""
        self.config = get_config()
        self._load_custom_mirrors()
        
        # Apply current mirror to environment immediately
        current_key = self.config.get('mirror', 'official')
        if current_key in self.MIRRORS:
            self.switch_mirror(current_key)

        
    def _load_custom_mirrors(self):
        """Load custom mirrors from config."""
        try:
            custom_mirrors = self.config.get('custom_mirrors', [])
            for m in custom_mirrors:
                if isinstance(m, dict) and 'key' in m:
                    self.MIRRORS[m['key']] = MirrorInfo(
                        key=m['key'],
                        name=m.get('name', 'Custom Mirror'),
                        url=m.get('url', ''),
                        description=m.get('description', 'Custom defined mirror'),
                        region=m.get('region', 'custom')
                    )
        except Exception:
            pass # Ignore malformed config

    def _save_custom_mirrors(self):
        """Save custom mirrors to config."""
        custom = []
        for k, v in self.MIRRORS.items():
            if v.region == 'custom':
                custom.append({
                    'key': v.key,
                    'name': v.name,
                    'url': v.url,
                    'description': v.description,
                    'region': 'custom'
                })
        self.config.set('custom_mirrors', custom)
    
    def get_available_mirrors(self) -> list[MirrorInfo]:
        """
        Get list of all available mirrors.
        
        Returns:
            List of MirrorInfo objects.
        """
        return list(self.MIRRORS.values())
    
    def get_current_mirror(self) -> MirrorInfo:
        """
        Get the currently active mirror.
        
        Returns:
            MirrorInfo for the current endpoint.
        """
        # First check environment variable
        current_url = os.environ.get(self.ENV_VAR, '')
        
        # Find matching mirror
        for mirror in self.MIRRORS.values():
            if mirror.url == current_url:
                return mirror
        
        # Check saved config
        saved_key = self.config.get('mirror', 'official')
        # If saved key does not exist (e.g. was deleted custom mirror), fallback to official
        if saved_key in self.MIRRORS:
            return self.MIRRORS[saved_key]
        
        # Default to official
        return self.MIRRORS['official']
    
    def get_current_endpoint(self) -> str:
        """
        Get the current HF endpoint URL.
        
        Returns:
            URL string of current endpoint.
        """
        return os.environ.get(self.ENV_VAR, self.MIRRORS['official'].url)
    
    def switch_mirror(self, mirror_key: str) -> bool:
        """
        Switch to a different mirror.
        
        Args:
            mirror_key: Key of the mirror to switch to.
            
        Returns:
            True if switch was successful, False otherwise.
        """
        if mirror_key not in self.MIRRORS:
            return False
        
        mirror = self.MIRRORS[mirror_key]
        
        # Set environment variable
        os.environ[self.ENV_VAR] = mirror.url
        
        # Also set HF_HUB_OFFLINE to False to ensure downloads work
        os.environ['HF_HUB_OFFLINE'] = '0'
        
        # PROACTIVE FIX: Disable SSL verification for mirrors if not official
        # This resolves generic 'SSL: CERTIFICATE_VERIFY_FAILED' errors common with mirrors/proxies
        if mirror_key != 'official':
             os.environ['HF_HUB_DISABLE_SSL_VERIFY'] = '1'
             # Also helpful for requests directly
             os.environ['CURL_CA_BUNDLE'] = '' 
        else:
             if 'HF_HUB_DISABLE_SSL_VERIFY' in os.environ:
                 del os.environ['HF_HUB_DISABLE_SSL_VERIFY']
        
        # Persist to config
        self.config.set('mirror', mirror_key)
        
        return True
    
    def reset_to_official(self) -> None:
        """Reset to official HuggingFace endpoint."""
        self.switch_mirror('official')
    
    def add_custom_mirror(self, key: str, name: str, url: str, 
                          description: str = '', region: str = 'custom') -> bool:
        """
        Add a custom mirror endpoint.
        """
        if key in self.MIRRORS:
            return False
        
        self.MIRRORS[key] = MirrorInfo(
            key=key,
            name=name,
            url=url,
            description=description,
            region=region
        )
        self._save_custom_mirrors()
        return True

    def remove_custom_mirror(self, key: str) -> bool:
        """Remove a custom mirror."""
        if key in self.MIRRORS and self.MIRRORS[key].region == 'custom':
            del self.MIRRORS[key]
            self._save_custom_mirrors()
            
            # If deleted mirror was active, switch to official
            current = self.get_current_mirror()
            if current.key == key: # Actually current logic won't return deleted key, but just in case
                self.switch_mirror('official')
                
            return True
        return False
    
    def test_mirror_connection(self, mirror_key: str, timeout: float = 5.0) -> dict:
        """
        Test connection to a mirror.
        
        Args:
            mirror_key: Key of mirror to test.
            timeout: Connection timeout in seconds.
            
        Returns:
            Dictionary with 'success', 'latency_ms', 'error' keys.
        """
        import time
        import urllib.request
        import urllib.error
        
        if mirror_key not in self.MIRRORS:
            return {'success': False, 'error': 'Mirror not found'}
        
        mirror = self.MIRRORS[mirror_key]
        test_url = f"{mirror.url}/api/models"
        
        try:
            start_time = time.time()
            req = urllib.request.Request(test_url, method='HEAD')
            with urllib.request.urlopen(req, timeout=timeout) as response:
                latency = (time.time() - start_time) * 1000
                return {
                    'success': response.status == 200,
                    'latency_ms': round(latency, 2),
                    'status': response.status
                }
        except urllib.error.URLError as e:
            return {'success': False, 'error': str(e.reason)}
        except Exception as e:
            return {'success': False, 'error': str(e)}


# Global instance
_mirror_manager: Optional[MirrorManager] = None


def get_mirror_manager() -> MirrorManager:
    """Get global mirror manager instance."""
    global _mirror_manager
    if _mirror_manager is None:
        _mirror_manager = MirrorManager()
    return _mirror_manager
