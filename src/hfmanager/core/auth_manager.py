"""
Authentication Manager - Handles Hugging Face login/logout.
Uses token-based authentication with a user-friendly GUI flow.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import webbrowser

from huggingface_hub import HfApi, login, logout, whoami
from huggingface_hub.utils import LocalTokenNotFoundError


@dataclass
class UserInfo:
    """Information about the logged-in user."""
    username: str
    fullname: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    is_pro: bool = False


class AuthManager:
    """
    Manages Hugging Face authentication.
    
    Provides methods for:
    - Checking login status
    - Logging in with token
    - Logging out
    - Getting user info
    """
    
    HF_TOKEN_URL = "https://huggingface.co/settings/tokens"
    
    def __init__(self):
        import os
        from ..utils.config import get_config
        self.config = get_config()
        endpoint = os.environ.get('HF_ENDPOINT')
        self.api = HfApi(endpoint=endpoint) if endpoint else HfApi()
        
        # Sync current system token with known accounts
        self._sync_current_user()

    def refresh_api(self):
        """Re-initialize API client (e.g. after mirror switch)."""
        import os
        endpoint = os.environ.get('HF_ENDPOINT')
        self.api = HfApi(endpoint=endpoint) if endpoint else HfApi()

    def _sync_current_user(self):
        """Check current system token and ensure it's in our accounts list."""
        try:
            if self.is_logged_in():
                # use network if available, but don't crash/hang if not
                try: 
                    user = self.get_user_info(allow_network=False)
                except:
                    user = None
                
                token = self.get_token()
                if user and token:
                    self._add_or_update_account(user, token)
        except:
            pass

    def _add_or_update_account(self, user: UserInfo, token: str):
        """Add or update an account in the config."""
        accounts = self.config.get('accounts', [])
        # Remove existing entry for this username
        accounts = [a for a in accounts if a['username'] != user.username]
        
        accounts.append({
            'username': user.username,
            'fullname': user.fullname,
            'email': user.email,
            'avatar_url': user.avatar_url,
            'is_pro': user.is_pro,
            'token': token
        })
        self.config.set('accounts', accounts)

    def get_known_accounts(self) -> list[dict]:
        """Get list of known accounts."""
        return self.config.get('accounts', [])

    def switch_account(self, username: str) -> tuple[bool, str]:
        """Switch to a different known account."""
        accounts = self.config.get('accounts', [])
        target = next((a for a in accounts if a['username'] == username), None)
        
        if not target:
            return False, "Account not found"
            
        return self.login_with_token(target['token'])

    def remove_account(self, username: str) -> tuple[bool, str]:
        """Remove an account."""
        accounts = self.config.get('accounts', [])
        target = next((a for a in accounts if a['username'] == username), None)

        if not target:
            return False, "Account not found"

        # Force logout if the account being removed is the currently active one
        # Use token comparison to ensure it works offline
        current_token = self.get_token()
        if current_token and target.get('token') == current_token:
            self.logout_user()

        accounts = [a for a in accounts if a['username'] != username]
        self.config.set('accounts', accounts)
        return True, "Account removed"

    def is_logged_in(self) -> bool:
        """Check if user is currently logged in."""
        try:
            from huggingface_hub import HfFolder
            if not HfFolder.get_token():
                return False
            
            # Simple check, we don't cache locally anymore except in config
            return True
        except LocalTokenNotFoundError:
            return False
        except Exception:
            return False
    
    def get_token(self) -> Optional[str]:
        """Get the current access token."""
        try:
            from huggingface_hub import HfFolder
            return HfFolder.get_token()
        except Exception:
            return None

    def get_user_info(self, allow_network: bool = True) -> Optional[UserInfo]:
        """
        Get information about the current logged-in user.
        
        Args:
            allow_network: If True, may make API calls to fetch latest info.
                          If False, returns only cached info (memory or config).
        """
        try:
            # 1. Try memory cache first
            if hasattr(self, '_user_cache') and self._user_cache:
                return self._user_cache

            # 2. Check token
            token = self.get_token()
            if not token:
                return None

            # 3. Try to find in known accounts (Offline fallback)
            # We always check this regardless of allow_network, as it's local
            accounts = self.get_known_accounts()
            known = next((a for a in accounts if a.get('token') == token), None)
            if known:
                self._user_cache = UserInfo(
                    username=known['username'],
                    fullname=known.get('fullname', known['username']),
                    email=known.get('email'),
                    avatar_url=known.get('avatar_url'),
                    is_pro=known.get('is_pro', False)
                )
                if not allow_network:
                    return self._user_cache

            # If network not allowed and we haven't returned yet, we can't do anything else
            if not allow_network:
                return self._user_cache # Returns whatever we found locally or None

            # 4. Fetch from API (Network call)
            # print("DEBUG: Fetching whoami from API...")
            info = self.api.whoami()
            
            avatar = info.get('avatarUrl')
            if avatar and avatar.startswith('/'):
                endpoint = self.api.endpoint
                if endpoint.endswith('/'): 
                     endpoint = endpoint[:-1]
                if not endpoint or 'huggingface.co' in endpoint:
                     endpoint = "https://huggingface.co"
                avatar = f"{endpoint}{avatar}"
            
            user = UserInfo(
                username=info.get('name', 'Unknown'),
                fullname=info.get('fullname', info.get('name', 'Unknown')),
                email=info.get('email'),
                avatar_url=avatar,
                is_pro=info.get('isPro', False)
            )
            
            # Cache it
            self._user_cache = user
            return user
        except Exception as e:
            # print(f"DEBUG: get_user_info error: {e}")
            return None
 
    def validate_token(self, token: str) -> dict:
        """Validate a token and return user info dict."""
        return self.api.whoami(token=token)
    
    def login_with_token(self, token: str) -> tuple[bool, str]:
        """Log in with a Hugging Face access token."""
        try:
            # Validate token by logging in
            login(token=token, add_to_git_credential=False)
            
            # Get user info and save it to accounts list
            self._user_cache = None # Force refresh
            user = self.get_user_info()
            if user:
                self._add_or_update_account(user, token)
                return True, f"登录成功！欢迎，{user.fullname}"
            else:
                return True, "登录成功！"
                
        except ValueError as e:
            return False, f"Token 无效: {str(e)}"
        except Exception as e:
            return False, f"登录失败: {str(e)}"
    
    def logout_user(self) -> tuple[bool, str]:
        """Log out the current user."""
        try:
            logout()
            self._user_cache = None
            return True, "已退出登录"
        except Exception as e:
            return False, f"退出失败: {str(e)}"


# Singleton instance
_auth_manager: Optional[AuthManager] = None


def get_auth_manager() -> AuthManager:
    """Get the singleton auth manager instance."""
    global _auth_manager
    if _auth_manager is None:
        _auth_manager = AuthManager()
    return _auth_manager
