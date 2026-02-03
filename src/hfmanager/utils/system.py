import sys
import os
import ctypes
import platform

def is_windows() -> bool:
    return sys.platform == "win32"

def is_admin() -> bool:
    """Check if the current process has admin privileges."""
    try:
        if is_windows():
            return ctypes.windll.shell32.IsUserAnAdmin() != 0
        else:
            return os.getuid() == 0
    except AttributeError:
        return False

def check_windows_developer_mode() -> bool:
    """
    Check if Windows Developer Mode is enabled.
    This allows creating symlinks without admin privileges.
    """
    if not is_windows():
        return True
    
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock",
            0,
            winreg.KEY_READ
        )
        # 1 = Developer Mode, 0 = Off
        value, _ = winreg.QueryValueEx(key, "AllowDevelopmentWithoutDevLicense")
        winreg.CloseKey(key)
        return value == 1
    except Exception:
        return False

def check_long_paths_enabled() -> bool:
    """
    Check if Windows Long Paths support is enabled in registry.
    """
    if not is_windows():
        return True
    
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\FileSystem",
            0,
            winreg.KEY_READ
        )
        value, _ = winreg.QueryValueEx(key, "LongPathsEnabled")
        winreg.CloseKey(key)
        return value == 1
    except Exception:
        return False

def get_system_compatibility() -> dict:
    """
    Get a summary of system compatibility issues.
    """
    return {
        "os": platform.system(),
        "is_windows": is_windows(),
        "is_admin": is_admin(),
        "dev_mode_enabled": check_windows_developer_mode(),
        "long_paths_enabled": check_long_paths_enabled(),
        "platform_node": platform.node(),
    }

def format_size(bytes: int) -> str:
    """Helper to format byte sizes into human readable strings."""
    if bytes == 0: return '0 B'
    k = 1024
    sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    import math
    i = int(math.floor(math.log(bytes) / math.log(k)))
    return f"{bytes / math.pow(k, i):.2f} {sizes[i]}"

def set_hf_transfer_enabled(enabled: bool):
    """Enable or disable HF Transfer (acceleration) via environment variable."""
    if enabled:
        os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
    else:
        if "HF_HUB_ENABLE_HF_TRANSFER" in os.environ:
            del os.environ["HF_HUB_ENABLE_HF_TRANSFER"]
