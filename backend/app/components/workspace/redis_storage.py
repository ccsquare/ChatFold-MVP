"""Redis-backed storage for workspace entities.

Provides distributed storage for multi-instance deployments:
- Folders (with inputs and outputs)
- Users
- Projects

Architecture (Single DB + Key Prefix Pattern):
- 使用单一 db=0，符合 Redis Cluster 兼容性要求
- 通过 RedisKeyPrefix 生成规范化的 Key
- Key 格式: chatfold:workspace:folder:{id}, chatfold:workspace:user:{id}

This replaces the in-memory WorkspaceStorage for production environments
where multiple backend instances need to share state.
"""

import logging
from typing import TypeVar

from pydantic import BaseModel

from app.components.workspace.models import Folder, Project, User
from app.db.redis_cache import RedisCache, get_redis_cache
from app.db.redis_db import RedisKeyPrefix

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# TTL for workspace data (7 days - can be adjusted)
WORKSPACE_TTL = 7 * 24 * 60 * 60


class WorkspaceRedisStorage:
    """Redis-backed storage for workspace data.

    Designed for multi-instance deployments where all pods share the same Redis.
    Uses Redis Hash for efficient field-level operations.
    """

    def __init__(self, cache: RedisCache | None = None):
        """Initialize with optional cache instance (for testing)."""
        self._cache = cache

    @property
    def cache(self) -> RedisCache:
        """Lazy initialization of Redis cache."""
        if self._cache is None:
            self._cache = get_redis_cache()
        return self._cache

    def _folder_key(self, folder_id: str) -> str:
        """Generate Redis key for folder using RedisKeyPrefix."""
        return RedisKeyPrefix.folder_key(folder_id)

    def _user_key(self, user_id: str) -> str:
        """Generate Redis key for user using RedisKeyPrefix."""
        return RedisKeyPrefix.user_key(user_id)

    def _project_key(self, project_id: str) -> str:
        """Generate Redis key for project using RedisKeyPrefix."""
        return RedisKeyPrefix.project_key(project_id)

    # ==================== Folder Operations ====================

    def save_folder(self, folder: Folder) -> bool:
        """Save or update a folder."""
        key = self._folder_key(folder.id)
        data = folder.model_dump(mode="json")
        success = self.cache.set(key, data, expire_seconds=WORKSPACE_TTL)
        if success:
            # Add to folder index for listing
            self.cache.client.sadd(RedisKeyPrefix.folder_index_key(), folder.id)
            logger.debug(f"Saved folder: {folder.id}")
        return success

    def get_folder(self, folder_id: str) -> Folder | None:
        """Get a folder by ID."""
        key = self._folder_key(folder_id)
        data = self.cache.get(key)
        if data:
            return Folder(**data)
        return None

    def list_folders(self) -> list[Folder]:
        """List all folders, sorted by creation time (newest first)."""
        folder_ids = self.cache.client.smembers(RedisKeyPrefix.folder_index_key())
        folders = []
        for folder_id in folder_ids:
            folder = self.get_folder(folder_id)
            if folder:
                folders.append(folder)
            else:
                # Clean up stale index entry
                self.cache.client.srem(RedisKeyPrefix.folder_index_key(), folder_id)
        return sorted(folders, key=lambda f: f.createdAt, reverse=True)

    def delete_folder(self, folder_id: str) -> bool:
        """Delete a folder. Returns True if deleted, False if not found."""
        key = self._folder_key(folder_id)
        deleted = self.cache.delete(key)
        if deleted:
            self.cache.client.srem(RedisKeyPrefix.folder_index_key(), folder_id)
            logger.debug(f"Deleted folder: {folder_id}")
        return deleted

    def update_folder(self, folder_id: str, **updates) -> Folder | None:
        """Update folder fields. Returns updated folder or None if not found."""
        folder = self.get_folder(folder_id)
        if folder:
            for key, value in updates.items():
                if hasattr(folder, key) and value is not None:
                    setattr(folder, key, value)
            self.save_folder(folder)
        return folder

    # ==================== User Operations ====================

    def save_user(self, user: User) -> bool:
        """Save or update a user."""
        key = self._user_key(user.id)
        data = user.model_dump(mode="json")
        success = self.cache.set(key, data, expire_seconds=WORKSPACE_TTL)
        if success:
            self.cache.client.sadd(RedisKeyPrefix.user_index_key(), user.id)
            logger.debug(f"Saved user: {user.id}")
        return success

    def get_user(self, user_id: str) -> User | None:
        """Get a user by ID."""
        key = self._user_key(user_id)
        data = self.cache.get(key)
        if data:
            return User(**data)
        return None

    def list_users(self) -> list[User]:
        """List all users."""
        user_ids = self.cache.client.smembers(RedisKeyPrefix.user_index_key())
        users = []
        for user_id in user_ids:
            user = self.get_user(user_id)
            if user:
                users.append(user)
            else:
                self.cache.client.srem(RedisKeyPrefix.user_index_key(), user_id)
        return users

    # ==================== Project Operations ====================

    def save_project(self, project: Project) -> bool:
        """Save or update a project."""
        key = self._project_key(project.id)
        data = project.model_dump(mode="json")
        success = self.cache.set(key, data, expire_seconds=WORKSPACE_TTL)
        if success:
            self.cache.client.sadd(RedisKeyPrefix.project_index_key(), project.id)
            logger.debug(f"Saved project: {project.id}")
        return success

    def get_project(self, project_id: str) -> Project | None:
        """Get a project by ID."""
        key = self._project_key(project_id)
        data = self.cache.get(key)
        if data:
            return Project(**data)
        return None

    def list_projects(self, user_id: str | None = None) -> list[Project]:
        """List all projects, optionally filtered by user ID."""
        project_ids = self.cache.client.smembers(RedisKeyPrefix.project_index_key())
        projects = []
        for project_id in project_ids:
            project = self.get_project(project_id)
            if project:
                if user_id is None or project.userId == user_id:
                    projects.append(project)
            else:
                self.cache.client.srem(RedisKeyPrefix.project_index_key(), project_id)
        return sorted(projects, key=lambda p: p.createdAt, reverse=True)

    # ==================== Utility ====================

    def clear_all(self) -> None:
        """Clear all workspace data (useful for testing)."""
        # Clear all indexes using RedisKeyPrefix
        index_keys = [
            RedisKeyPrefix.folder_index_key(),
            RedisKeyPrefix.user_index_key(),
            RedisKeyPrefix.project_index_key(),
        ]
        for index_key in index_keys:
            ids = self.cache.client.smembers(index_key)
            for item_id in ids:
                # Determine which type based on index key
                if "folders" in index_key:
                    self.cache.delete(RedisKeyPrefix.folder_key(item_id))
                elif "users" in index_key:
                    self.cache.delete(RedisKeyPrefix.user_key(item_id))
                elif "projects" in index_key:
                    self.cache.delete(RedisKeyPrefix.project_key(item_id))
            self.cache.client.delete(index_key)
        logger.warning("Cleared all workspace data from Redis")


# Singleton instance (lazy initialized)
_workspace_redis_storage: WorkspaceRedisStorage | None = None


def get_workspace_redis_storage() -> WorkspaceRedisStorage:
    """Get singleton instance of WorkspaceRedisStorage."""
    global _workspace_redis_storage
    if _workspace_redis_storage is None:
        _workspace_redis_storage = WorkspaceRedisStorage()
    return _workspace_redis_storage
