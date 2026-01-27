"""ID generation utilities.

Uses ULID (Universally Unique Lexicographically Sortable Identifier) for ID generation.

ULID advantages:
- Lexicographically sortable (time-ordered)
- 128-bit compatible with UUID
- Case insensitive, URL safe
- Monotonic sort order within same millisecond
- 26 characters (vs UUID's 36)

Format: {prefix}_{ulid}
Example: task_01HGW2N7EHJD5P5M8R3KV4X5Y6

References:
- https://github.com/ulid/spec
- https://github.com/mdomke/python-ulid
"""

from ulid import ULID


def generate_id(prefix: str = "") -> str:
    """Generate a unique ID with optional prefix.

    Uses ULID for time-ordered, globally unique identifiers.

    Args:
        prefix: Optional prefix for the ID (e.g., "user", "task", "proj")

    Returns:
        A unique ID string in format "{prefix}_{ulid}" or just "{ulid}"

    Examples:
        >>> generate_id("user")
        'user_01HGW2N7EHJD5P5M8R3KV4X5Y6'
        >>> generate_id("task")
        'task_01HGW2N7EHJD5P5M8R3KV4X5Y7'
        >>> generate_id()
        '01HGW2N7EHJD5P5M8R3KV4X5Y8'
    """
    ulid_str = str(ULID()).lower()

    if prefix:
        return f"{prefix}_{ulid_str}"
    return ulid_str


def generate_user_id() -> str:
    """Generate a user ID."""
    return generate_id("user")


def generate_project_id() -> str:
    """Generate a project ID."""
    return generate_id("proj")


def generate_folder_id() -> str:
    """Generate a folder ID."""
    return generate_id("folder")


def generate_conversation_id() -> str:
    """Generate a conversation ID."""
    return generate_id("conv")


def generate_task_id() -> str:
    """Generate a task ID."""
    return generate_id("task")


def generate_structure_id() -> str:
    """Generate a structure ID."""
    return generate_id("struct")


def generate_asset_id() -> str:
    """Generate an asset ID."""
    return generate_id("asset")


def generate_event_id() -> str:
    """Generate an event ID."""
    return generate_id("evt")
