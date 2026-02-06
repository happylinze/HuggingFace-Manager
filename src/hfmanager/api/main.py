from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import json
from typing import List, Set

# --- Network Fix: Bypass System Proxy if not configured ---
# Must run BEFORE other imports that might initialize clients
import os
from ..utils.config import get_config
try:
    config = get_config()
    proxy_url = config.get('proxy_url')
    if proxy_url:
        os.environ['HTTP_PROXY'] = proxy_url
        os.environ['HTTPS_PROXY'] = proxy_url
    else:
        os.environ['no_proxy'] = '*'
except Exception as e:
    print(f"Warning: Failed to set proxy config at startup: {e}")

# --- Critical: Initialize Mirror Manager BEFORE importing routes ---
# This ensures HF_ENDPOINT is set in os.environ BEFORE huggingface_hub is imported by routes.
# Otherwise huggingface_hub constants will lock to the default endpoint.
try:
    from ..core.mirror_manager import get_mirror_manager
    get_mirror_manager() # This applies the saved mirror to os.environ
except Exception as e:
    print(f"Warning: Failed to initialize mirror manager at startup: {e}")

from .routes import download, cache, search, settings, repository as repo_ops, git_ops, space_ops, sync_ops, system, auth, upload, plugins
from .dependencies import get_downloader, get_mirror_manager

app = FastAPI(
    title="HFManager API",
    description="Backend API for HFManager Desktop (Tauri Hybrid)",
    version="0.1.1"
)

# Enable CORS for Tauri frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(download.router, prefix="/api")
app.include_router(cache.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(repo_ops.router, prefix="/api")
app.include_router(git_ops.router, prefix="/api")
app.include_router(space_ops.router, prefix="/api")
app.include_router(sync_ops.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(upload.router, prefix="/api/upload")
app.include_router(plugins.router, prefix="/api")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        
        data = json.dumps(message)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(data)
            except Exception:
                self.active_connections.remove(connection)

manager = ConnectionManager()

# Setup bridge for downloader callbacks
def setup_progress_bridge():
    downloader = get_downloader()
    
    # Get the event loop of the main thread
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # If no loop is running (e.g. durante testing), we'll handle it
        return

    def progress_callback(task):
        message = {
            "type": "task_update",
            "data": {
                "id": task.id,
                "status": task.status.name,
                "progress": task.progress,
                "downloaded_size": task.downloaded_size,
                "total_size": task.total_size,
                "speed": task.speed,
                "speed_formatted": task.speed_formatted or "0 B/s",
                "current_file": task.current_file,
                "pausable": getattr(task, 'pausable', True),
                "use_hf_transfer": getattr(task, 'use_hf_transfer', False)
            }
        }
        asyncio.run_coroutine_threadsafe(manager.broadcast(message), loop)

    downloader.add_callback(progress_callback)

@app.on_event("startup")
async def startup_event():
    # Initialize Core Services
    setup_progress_bridge()
    get_mirror_manager() # Force load to apply mirror settings


@app.websocket("/ws/progress")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/")
async def root():
    return {"message": "HFManager API is running", "status": "online"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("hfmanager.api.main:app", host="127.0.0.1", port=8000, reload=True)
