"""Time utilities for ChatFold backend."""

import time


def get_timestamp_ms() -> int:
    """Get current timestamp in milliseconds."""
    return int(time.time() * 1000)
