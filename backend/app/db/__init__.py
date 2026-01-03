"""Database module for ChatFold backend.

This module provides database connectivity for both Redis (cache) and MySQL (persistence).

Components:
- Redis: Job state cache, SSE event queues
- MySQL: Persistent storage for users, projects, jobs, structures
"""

from app.db.models import (
    AssetModel,
    Base,
    ConversationModel,
    FolderModel,
    JobModel,
    MessageModel,
    ProjectModel,
    StructureModel,
    UserModel,
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
    get_job_state_cache,
    get_sse_events_cache,
)
from app.db.redis_db import RedisDB

__all__ = [
    # Redis
    "RedisDB",
    "RedisCache",
    "get_job_state_cache",
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
    "UserModel",
    "ProjectModel",
    "FolderModel",
    "AssetModel",
    "ConversationModel",
    "MessageModel",
    "JobModel",
    "StructureModel",
]
