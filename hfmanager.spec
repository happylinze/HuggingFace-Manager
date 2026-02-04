# -*- mode: python ; coding: utf-8 -*-
import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# --- Configuration ---
# Detect OS
is_win = sys.platform.startswith('win')
is_mac = sys.platform.startswith('darwin')

# Define hidden imports (dependencies that PyInstaller might miss)
hidden_imports = [
    'uvicorn',
    'fastapi',
    'python_multipart',
    'pystray', 
    'PIL', 
    'psutil',
    'pywebview',
    'hfmanager.core.desktop', # Explicitly include our new module
    'engineio.async_drivers.asgi', # Common issue with socketio/engineio
]

if is_win:
    hidden_imports.append('pywebview.platforms.winforms')

# Collect data files (assets)
datas = [
    ('frontend/dist', 'frontend/dist'),    # Frontend Build
    ('assets', 'assets'),                  # Icons
    ('src/hfmanager/resources', 'hfmanager/resources'), # Aria2 binary placeholder
]

# --- Analysis ---
a = Analysis(
    ['src/hfmanager/main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# --- EXE (Single File or Folder) ---
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='HFManager',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False, # HIDE CONSOLE WINDOW (True for debug)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico' if is_win else 'assets/icon.png',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='HFManager',
)
