import logging
import os
import sys
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Optional

def setup_logging(log_dir: Path, log_level: str = "INFO"):
    """
    Setup application logging with file rotation and console output.
    """
    # Ensure log directory exists
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "app.log"

    # Create formatters
    file_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_formatter = logging.Formatter(
        '%(levelname)s: %(message)s'
    )

    # Root logger
    root_log = logging.getLogger()
    root_log.setLevel(getattr(logging, log_level.upper()))
    
    # Remove existing handlers to avoid duplicates
    root_log.handlers = []

    # File Handler (Daily Rotation, keep 7 days)
    file_handler = TimedRotatingFileHandler(
        filename=log_file,
        when="midnight",
        interval=1,
        backupCount=7,
        encoding="utf-8"
    )
    file_handler.setFormatter(file_formatter)
    root_log.addHandler(file_handler)

    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)
    root_log.addHandler(console_handler)

    logging.info(f"Logging initialized. Log file: {log_file}")

def get_log_file_path() -> Optional[Path]:
    """Get the current log file path."""
    handlers = logging.getLogger().handlers
    for h in handlers:
        if isinstance(h, TimedRotatingFileHandler):
            return Path(h.baseFilename)
    return None
