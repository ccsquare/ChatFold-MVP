"""Unified storage provider for workspace entities.

Automatically selects between in-memory storage (for local-dev)
and Redis storage (for multi-instance production).

Usage:
    from app.components.workspace.storage_provider import get_workspace_storage

    storage = get_workspace_storage()
    storage.save_folder(folder)
    folder = storage.get_folder(folder_id)
"""

import logging
from typing import Protocol

from app.components.workspace.models import Folder, Project, User
from app.settings import settings

logger = logging.getLogger(__name__)


class WorkspaceStorageProtocol(Protocol):
    """Protocol defining the workspace storage interface."""

    def save_folder(self, folder: Folder) -> bool | None: ...
    def get_folder(self, folder_id: str) -> Folder | None: ...
    def list_folders(self) -> list[Folder]: ...
    def delete_folder(self, folder_id: str) -> bool: ...
    def update_folder(self, folder_id: str, **updates) -> Folder | None: ...

    def save_user(self, user: User) -> bool | None: ...
    def get_user(self, user_id: str) -> User | None: ...
    def list_users(self) -> list[User]: ...

    def save_project(self, project: Project) -> bool | None: ...
    def get_project(self, project_id: str) -> Project | None: ...
    def list_projects(self, user_id: str | None = None) -> list[Project]: ...

    def clear_all(self) -> None: ...


class MemoryStorageAdapter:
    """Adapter to make WorkspaceStorage compatible with the protocol."""

    def __init__(self):
        from app.components.workspace.storage import workspace_storage
        self._storage = workspace_storage

    def save_folder(self, folder: Folder) -> bool:
        self._storage.save_folder(folder)
        return True

    def get_folder(self, folder_id: str) -> Folder | None:
        return self._storage.get_folder(folder_id)

    def list_folders(self) -> list[Folder]:
        return self._storage.list_folders()

    def delete_folder(self, folder_id: str) -> bool:
        return self._storage.delete_folder(folder_id)

    def update_folder(self, folder_id: str, **updates) -> Folder | None:
        return self._storage.update_folder(folder_id, **updates)

    def save_user(self, user: User) -> bool:
        self._storage.save_user(user)
        return True

    def get_user(self, user_id: str) -> User | None:
        return self._storage.get_user(user_id)

    def list_users(self) -> list[User]:
        return self._storage.list_users()

    def save_project(self, project: Project) -> bool:
        self._storage.save_project(project)
        return True

    def get_project(self, project_id: str) -> Project | None:
        return self._storage.get_project(project_id)

    def list_projects(self, user_id: str | None = None) -> list[Project]:
        return self._storage.list_projects(user_id)

    def clear_all(self) -> None:
        self._storage.clear_all()


# Singleton storage instance
_workspace_storage: WorkspaceStorageProtocol | None = None
_storage_type: str | None = None


def get_workspace_storage() -> WorkspaceStorageProtocol:
    """Get the appropriate workspace storage based on configuration.

    Returns:
        MemoryStorageAdapter for local-dev with use_memory_store=true
        WorkspaceRedisStorage for production (multi-instance)

    The storage type is determined by settings.use_memory_store:
        - True: Use in-memory storage (NOT safe for multi-instance)
        - False: Use Redis storage (safe for multi-instance)
    """
    global _workspace_storage, _storage_type

    if _workspace_storage is not None:
        return _workspace_storage

    if settings.use_memory_store:
        _storage_type = "memory"
        _workspace_storage = MemoryStorageAdapter()
        logger.info("WorkspaceStorage: Using in-memory storage (single instance only)")
    else:
        _storage_type = "redis"
        from app.components.workspace.redis_storage import get_workspace_redis_storage
        _workspace_storage = get_workspace_redis_storage()
        logger.info("WorkspaceStorage: Using Redis storage (multi-instance safe)")

    return _workspace_storage


def get_storage_type() -> str:
    """Get the current storage type ('memory' or 'redis')."""
    if _storage_type is None:
        get_workspace_storage()  # Initialize storage
    return _storage_type or "unknown"


def reset_workspace_storage() -> None:
    """Reset the storage singleton (for testing)."""
    global _workspace_storage, _storage_type
    _workspace_storage = None
    _storage_type = None
