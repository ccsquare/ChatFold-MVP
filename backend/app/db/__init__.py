"""Database module for ChatFold backend.

This module provides database connectivity for both Redis (cache) and MySQL (persistence).

Components:
- Redis: Task state cache, SSE event queues
- MySQL: Persistent storage for users, projects, tasks, structures
"""

from app.db.models import (
    Asset,
    Base,
    Conversation,
    Folder,
    LearningRecord,
    Message,
    Project,
    Structure,
    Task,
    TaskEvent,
    User,
)
from app.db.mysql import (
    SessionLocal,
    check_connection,
    close_db,
    engine,
    get_db,
    get_db_session,
    init_db,
)
from app.db.redis_cache import (
    RedisCache,
    get_task_state_cache,
    get_sse_events_cache,
)
from app.db.redis_db import RedisDB

__all__ = [
    # Redis
    "RedisDB",
    "RedisCache",
    "get_task_state_cache",
    "get_sse_events_cache",
    # MySQL - Connection
    "engine",
    "SessionLocal",
    "get_db",
    "get_db_session",
    "init_db",
    "close_db",
    "check_connection",
    # MySQL - Models
    "Base",
    "User",
    "Project",
    "Folder",
    "Asset",
    "Conversation",
    "Message",
    "Task",
    "TaskEvent",
    "LearningRecord",
    "Structure",
]
