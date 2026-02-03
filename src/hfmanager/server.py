import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import asyncio
import json
import logging
import os
import sys
import socket
import webbrowser
from pathlib import Path

from .api.routes import search, download, cache, settings, system, auth, plugins
from .api.dependencies import get_downloader
from .core.mirror_manager import get_mirror_manager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hfmanager-server")

app = FastAPI(
    title="HFManager API",
    description="Backend API for Hugging Face model and dataset management",
    version="0.1.0"
)

# Initialize mirror settings on startup
@app.on_event("startup")
async def startup_event():
    """Initialize system settings on server startup."""
    try:
        mirror_manager = get_mirror_manager()
        current_mirror = mirror_manager.get_current_mirror()
        # Apply the saved mirror setting to environment
        if current_mirror.key != 'official':
            mirror_manager.switch_mirror(current_mirror.key)
            logger.info(f"Applied mirror configuration: {current_mirror.name} ({current_mirror.url})")
        else:
            logger.info("Using official HuggingFace endpoint")
    except Exception as e:
        logger.error(f"Failed to initialize mirror settings: {e}")

# CORS configuration for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the actual origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route mounting
app.include_router(search.router, prefix="/api")
app.include_router(download.router, prefix="/api")
app.include_router(cache.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(plugins.router, prefix="/api")  # Added plugins router

# Lazy import to avoid circular dependencies if any (though route imports are usually fine)
from .api.routes import repository, repo_ops, git_ops, space_ops, sync_ops, upload
app.include_router(repository.router, prefix="/api")
app.include_router(repo_ops.router, prefix="/api")
app.include_router(git_ops.router, prefix="/api")
app.include_router(space_ops.router, prefix="/api")
app.include_router(sync_ops.router, prefix="/api")
app.include_router(upload.router, prefix="/api/upload")


def get_static_dir() -> Path:
    """Get the path to static files (frontend/dist).
    
    Handles both development and PyInstaller bundled scenarios.
    """
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller bundle
        base_path = Path(sys._MEIPASS)
        static_path = base_path / "frontend" / "dist"
    else:
        # Running in development
        # Go up from src/hfmanager to project root
        base_path = Path(__file__).parent.parent.parent
        static_path = base_path / "frontend" / "dist"
    
    return static_path


# Check if static files exist and mount them
static_dir = get_static_dir()
if static_dir.exists():
    # Mount static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="static_assets")
    
    # Serve index.html for the root and all non-API routes (SPA fallback)
    @app.get("/")
    async def serve_root():
        return FileResponse(static_dir / "index.html")
    
    @app.get("/{path:path}")
    async def serve_spa(path: str):
        """Serve static files or fall back to index.html for SPA routing."""
        # Check if it's an API route (should not reach here, but just in case)
        if path.startswith("api/") or path.startswith("ws/"):
            return {"error": "Not found"}
        
        # Check if the file exists
        file_path = static_dir / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        # Fall back to index.html for SPA routing
        return FileResponse(static_dir / "index.html")
    
    logger.info(f"Serving static files from: {static_dir}")
else:
    # Development mode without built frontend
    @app.get("/")
    async def root():
        return {"message": "HFManager API is running", "docs": "/docs"}
    
    logger.warning(f"Static files not found at {static_dir}. Running in API-only mode.")


# WebSocket for progress updates
@app.websocket("/ws/progress")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    downloader = get_downloader()
    
    # Queue for task updates
    queue = asyncio.Queue()
    
    # Capture the main event loop
    loop = asyncio.get_running_loop()
    
    # Callback to push updates into the queue
    def on_task_update(task):
        # We need to run this in the event loop thread
        try:
            loop.call_soon_threadsafe(queue.put_nowait, task)
        except Exception as e:
            logger.error(f"Error in task update callback: {e}")

    # Register callback
    downloader.add_callback(on_task_update)
    
    try:
        while True:
            # Wait for an update from the queue
            task = await queue.get()
            
            # Send task status via WebSocket
            await websocket.send_json({
                "type": "task_update",
                "data": {
                    "id": task.id,
                    "repo_id": task.repo_id,
                    "repo_type": task.repo_type,
                    "status": task.status.value,
                    "progress": task.progress,
                    "speed_formatted": task.speed_formatted,
                    "current_file": task.current_file,
                    "downloaded_size": task.downloaded_size,
                    "total_size": task.total_size,
                    "total_files": getattr(task, 'total_files', 0),
                    "downloaded_files": getattr(task, 'downloaded_files', 0),
                    "include_patterns": task.include_patterns,
                    "error_message": task.error_message
                }
            })
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # Removal of callback is not strictly implemented in HFDownloader yet, 
        # but in a production app we should handle this.
        pass


def find_free_port(start_port: int = 8000, max_attempts: int = 100) -> int:
    """Find a free port starting from start_port."""
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"Could not find a free port in range {start_port}-{start_port + max_attempts}")


def start(dev_mode: bool = False, open_browser: bool = True, port: int = None, use_webview: bool = None):
    """Start the FastAPI server.
    
    Args:
        dev_mode: If True, enable hot reload (for development)
        open_browser: If True, automatically open the browser
        port: Specific port to use, or None to auto-select
        use_webview: If True, use pywebview for native window. None = auto-detect (True when frozen)
    """
    if port is None:
        port = find_free_port(8000)
    
    # Auto-detect: use webview when running as packaged exe
    if use_webview is None:
        use_webview = getattr(sys, 'frozen', False) and static_dir.exists()
    
    logger.info(f"Starting HFManager on port {port}")
    
    if use_webview:
        # Use pywebview for native window
        start_with_webview(port)
    else:
        # Development mode or browser mode
        if open_browser and static_dir.exists():
            def open_browser_delayed():
                import time
                time.sleep(1.5)
                webbrowser.open(f"http://127.0.0.1:{port}")
            
            import threading
            threading.Thread(target=open_browser_delayed, daemon=True).start()
        
        if dev_mode:
            uvicorn.run("hfmanager.server:app", host="127.0.0.1", port=port, reload=True)
        else:
            uvicorn.run(app, host="127.0.0.1", port=port, log_config=None)


def start_with_webview(port: int):
    """Start the server with a native webview window."""
    import threading
    
    # Start uvicorn in a background thread
    def run_server():
        uvicorn.run(app, host="127.0.0.1", port=port, log_config=None)
    
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    # Wait a bit for server to start
    import time
    time.sleep(1.0)
    
    # Create native window with pywebview
    try:
        import webview
        window = webview.create_window(
            title="HuggingFace Manager",
            url=f"http://127.0.0.1:{port}",
            width=1400,
            height=900,
            resizable=True,
            min_size=(800, 600)
        )
        webview.start()
    except ImportError:
        logger.warning("pywebview not installed, falling back to browser")
        webbrowser.open(f"http://127.0.0.1:{port}")
        # Keep the server running
        server_thread.join()


if __name__ == "__main__":
    start(dev_mode=False)
