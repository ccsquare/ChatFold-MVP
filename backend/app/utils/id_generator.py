"""ID generation utilities."""

import random
import string
import time


def generate_id(prefix: str = "") -> str:
    """Generate a unique ID with optional prefix.

    Format: {prefix}_{timestamp_base36}{random_6chars}
    Example: job_m1a2b3c4d5e6
    """
    timestamp = int(time.time() * 1000)
    timestamp_b36 = _to_base36(timestamp)
    random_part = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))

    if prefix:
        return f"{prefix}_{timestamp_b36}{random_part}"
    return f"{timestamp_b36}{random_part}"


def _to_base36(num: int) -> str:
    """Convert integer to base36 string."""
    chars = string.digits + string.ascii_lowercase
    if num == 0:
        return "0"

    result = []
    while num:
        result.append(chars[num % 36])
        num //= 36

    return "".join(reversed(result))
