# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for HuggingFace-Manager
"""

import os
import sys
from pathlib import Path

# Get the absolute path to the project root
# SPECPATH is the directory containing the spec file (which is the project root)
project_root = Path(SPECPATH)
src_dir = project_root / 'src'
frontend_dist = project_root / 'frontend' / 'dist'

# Verify paths
if not src_dir.exists():
    raise Exception(f"Source directory not found: {src_dir}")
if not frontend_dist.exists():
    raise Exception(f"Frontend dist not found: {frontend_dist}. Please run 'npm run build' in frontend/ first.")

a = Analysis(
    [str(src_dir / 'hfmanager' / 'main.py')],
    pathex=[str(src_dir)],
    binaries=[],
    datas=[
        # Include the frontend dist folder
        (str(frontend_dist), 'frontend/dist'),
    ],
    hiddenimports=[
        # Uvicorn internals
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # FastAPI and Starlette
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.staticfiles',
        'starlette.responses',
        # HuggingFace Hub
        'huggingface_hub',
        'huggingface_hub.hf_api',
        'huggingface_hub.utils',
        # Other dependencies
        'httpx',
        'anyio',
        'anyio._backends._asyncio',
        'email.mime.multipart',
        'email.mime.text',
        # PyWebView for native window
        'webview',
    ] + ([
        'webview.platforms.edgechromium',
        'clr_loader',
        'pythonnet',
    ] if os.name == 'nt' else []),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'scipy',
        'PIL',
        'cv2',
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='HFManager',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Hide console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(project_root / 'assets' / 'icon.ico'),  # Custom logo
)
