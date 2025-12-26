"""Unified logging configuration for ChatFold backend.

Provides consistent logging with both console and file output.
Log files are written to /app/logs/ directory with rotation support.
"""

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import settings

# Default log format
LOG_FORMAT = "[%(asctime)s.%(msecs)03d][%(levelname)s][%(filename)s:%(lineno)d]: %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def _ensure_app_logger_configured():
    """
    Ensure the app parent logger is configured with console handler.
    This is called automatically on module import.
    """
    app_logger = logging.getLogger("app")

    # Check if app logger already has our formatted console handler
    has_formatted_handler = any(
        isinstance(h, logging.StreamHandler)
        and h.formatter
        and "%(asctime)s" in (h.formatter._fmt if hasattr(h.formatter, "_fmt") else "")
        for h in app_logger.handlers
    )

    if not has_formatted_handler:
        # Remove any existing handlers
        app_logger.handlers.clear()

        # Console handler with formatted output
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT))
        app_logger.addHandler(console_handler)

        # Set log level based on debug mode
        if settings.debug:
            app_logger.setLevel(logging.DEBUG)
            logging.getLogger().setLevel(logging.DEBUG)
        else:
            app_logger.setLevel(logging.INFO)

        # Prevent propagation to root logger
        app_logger.propagate = False

        print(f"App parent logger configured (level: {logging.getLevelName(app_logger.level)})")


def setup_logging(log_name: str = "chatfold") -> logging.Logger:
    """
    Setup logging configuration with console and file output.

    Log file path pattern: /app/logs/{log_name}.log
    In local development (no /app/logs), falls back to ./logs/{log_name}.log

    Args:
        log_name: The name of the log file (without .log extension).
                 Default: "chatfold"

    Returns:
        Configured logger instance
    """
    # Always ensure app parent logger is configured first
    _ensure_app_logger_configured()

    # Determine log directory
    log_dir = _get_logs_root()

    # Configure component-specific file handler
    logger_name = f"app.{log_name}"
    logger = logging.getLogger(logger_name)

    if log_dir:
        os.makedirs(log_dir, exist_ok=True)

        log_file_path = os.path.join(log_dir, f"{log_name}.log")

        # Add file handler to app parent logger
        app_logger = logging.getLogger("app")
        if not any(isinstance(h, RotatingFileHandler) and h.baseFilename == log_file_path for h in app_logger.handlers):
            app_file_handler = RotatingFileHandler(
                log_file_path,
                maxBytes=settings.log_max_bytes,
                backupCount=settings.log_backup_count,
                encoding="utf-8",
            )
            app_file_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT))
            app_logger.addHandler(app_file_handler)
            print(f"App parent logger file handler added: {log_file_path}")

        # Component logger just propagates to parent
        logger.propagate = True
        print(f"Component logger '{logger_name}' configured (propagates to app parent)")

    return logger


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance for a module.

    Args:
        name: Logger name, typically __name__ of the calling module

    Returns:
        Logger instance
    """
    # Ensure app logger is configured
    _ensure_app_logger_configured()

    # Convert module name to app.* namespace if needed
    if not name.startswith("app."):
        name = f"app.{name}"

    return logging.getLogger(name)


def _get_logs_root() -> Path | None:
    """
    Get the logs root directory.

    Returns /app/logs if it exists (production), otherwise ./logs (development).
    Returns None if neither can be created.
    """
    # Production path
    prod_logs = Path("/app/logs")
    if prod_logs.exists() or _can_create_dir(prod_logs):
        return prod_logs

    # Development fallback - relative to backend directory
    dev_logs = Path(__file__).parent.parent.parent / "logs"
    if _can_create_dir(dev_logs):
        return dev_logs

    return None


def _can_create_dir(path: Path) -> bool:
    """Check if a directory can be created."""
    try:
        path.mkdir(parents=True, exist_ok=True)
        return True
    except (OSError, PermissionError):
        return False


# Configure app parent logger on module import
_ensure_app_logger_configured()
