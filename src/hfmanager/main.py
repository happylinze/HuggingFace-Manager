"""
HFManager - Main Entry Point (Web Mode)
"""
import uvicorn
import os
import sys

# Ensure the src directory is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Initialize Logging
try:
    from hfmanager.utils.config import get_config
    from hfmanager.utils.logger import setup_logging
    import logging
    
    config = get_config()
    log_dir = config.config_dir / 'logs'
    setup_logging(log_dir)
    logger = logging.getLogger("hfmanager-init")
except ImportError:
    import logging
    logging.basicConfig()
    logger = logging.getLogger("hfmanager-init")
    print("Warning: Failed to setup advanced logging")

# --- CRITICAL: Initialize Environment BEFORE importing huggingface_hub ---
# This ensures that all HF libraries pick up the correct mirror endpoint
try:
    from hfmanager.core.mirror_manager import get_mirror_manager
    from hfmanager.utils.config import get_config
    
    # 1. Apply Mirror
    manager = get_mirror_manager()
    mirror = manager.get_current_mirror()
    if mirror.key != 'official':
        logger.info(f"[Pre-init] Applying Mirror Configuration -> {mirror.name} ({mirror.url})")
        manager.switch_mirror(mirror.key)
    else:
        logger.info("[Pre-init] Using Official Endpoint")
        
    # 2. Apply Proxy
    config = get_config()
    proxy_url = config.get('proxy_url')
    if proxy_url:
        logger.info(f"[Pre-init] Applying Proxy Configuration -> {proxy_url}")
        os.environ['HTTP_PROXY'] = proxy_url
        os.environ['HTTPS_PROXY'] = proxy_url
        os.environ['ALL_PROXY'] = proxy_url
except Exception as e:
    logger.warning(f"Failed to apply mirror settings early: {e}")
# -----------------------------------------------------------------------

from hfmanager.server import app

import argparse

def main():
    """Application entry point for both Web/API mode and CLI mode."""
    parser = argparse.ArgumentParser(
        prog="hfmanager",
        description="Hugging Face Manager - Total Management Workstation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m hfmanager server --port 8000
  python -m hfmanager search "mistral-7b"
  python -m hfmanager download TheBloke/Llama-2-7B-Chat-GGUF --include "*.q4_k_m.gguf"
  python -m hfmanager cache
"""
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # --- SERVER command ---
    server_parser = subparsers.add_parser("server", help="Start the Web UI & API server (Default)")
    server_parser.add_argument("--host", default=os.environ.get("HF_HOST", "127.0.0.1"), help="Host to bind (default: 127.0.0.1)")
    server_parser.add_argument("--port", type=int, default=int(os.environ.get("HF_PORT", "8000")), help="Port to bind (default: 8000)")
    server_parser.add_argument("--web", action="store_true", help="Force run in Web Browser mode (Disable Desktop Window)")

    # --- SEARCH command ---
    search_parser = subparsers.add_parser("search", help="Search Hugging Face from terminal")
    search_parser.add_argument("query", help="Search keyword")
    search_parser.add_argument("--type", choices=["model", "dataset"], default="model", help="Repository type")
    search_parser.add_argument("--limit", type=int, default=10, help="Max results")

    # --- DOWNLOAD command ---
    download_parser = subparsers.add_parser("download", help="Directly download a repository")
    download_parser.add_argument("repo_id", help="Repository ID (e.g. meta-llama/Llama-2-7b)")
    download_parser.add_argument("--type", choices=["model", "dataset"], default="model", help="Repository type")
    download_parser.add_argument("--include", nargs="+", help="Patterns to include (e.g. *.gguf)")
    download_parser.add_argument("--exclude", nargs="+", help="Patterns to exclude")
    download_parser.add_argument("--revision", default="main", help="Branch/Tag/Commit")

    # --- CACHE command ---
    cache_parser = subparsers.add_parser("cache", help="Manage local Hugging Face cache")
    cache_parser.add_argument("--list", action="store_true", help="List all cached repositories")

    # Parse arguments
    args = parser.parse_args()

    # Default to 'server' if no command provided
    if not args.command:
        # Check if any unknown args were passed that might look like server flags
        # But for now, just run server with default args (webview enabled unless failed)
        run_app(host="127.0.0.1", port=8000, web_mode=False)
        return

    if args.command == "server":
        run_app(args.host, args.port, args.web)
    
    elif args.command == "search":
        from hfmanager.core.cli_handler import run_search
        run_search(args.query, args.type, args.limit)
    
    elif args.command == "download":
        from hfmanager.core.cli_handler import run_download
        run_download(args.repo_id, args.type, args.include, args.exclude, args.revision)
    
    elif args.command == "cache":
        from hfmanager.core.cli_handler import run_cache, list_cache_repos
        if args.list:
            list_cache_repos()
        else:
            run_cache()

def run_app(host, port, web_mode=False):
    """Start the application (Desktop or Web mode)."""
    from hfmanager.server import start, find_free_port, static_dir, app
    
    # Use dynamic port if the specified port is not available
    try:
        actual_port = find_free_port(port)
        if actual_port != port:
            logger.info(f"Port {port} is in use, using port {actual_port} instead")
    except RuntimeError as e:
        logger.error(str(e))
        return

    # Determine mode
    force_web = web_mode
    is_frozen = getattr(sys, 'frozen', False)
    
    # Check if desktop libs are available
    has_desktop_libs = False
    try:
        import webview
        import pystray
        has_desktop_libs = True
    except ImportError:
        pass

    # Logic:
    # If --web passed: WEB MODE
    # If Libs missing: WEB MODE (Fallback)
    # Else: DESKTOP MODE
    
    if force_web or not has_desktop_libs:
        logger.info(f"Starting in Web Mode on http://{host}:{actual_port}")
        start(dev_mode=False, open_browser=True, port=actual_port, use_webview=False)
    else:
        logger.info(f"Starting in Desktop Mode on http://{host}:{actual_port}")
        try:
            from hfmanager.core.desktop import DesktopManager, desktop_instance
            import hfmanager.core.desktop as desktop_module
            
            # Initialize Manager
            manager = DesktopManager(app, host, actual_port)
            
            # Set global instance for API access
            desktop_module.desktop_instance = manager
            
            # Check Single Instance Lock
            if not manager.check_single_instance():
                logger.info("Instance already running. Signal sent. Exiting.")
                return

            # Run (Blocks Main Thread)
            manager.run()
            
        except Exception as e:
            logger.error(f"Failed to start Desktop Mode: {e}. Fallback to Web.")
            start(dev_mode=False, open_browser=True, port=actual_port, use_webview=False)

if __name__ == "__main__":
    main()
