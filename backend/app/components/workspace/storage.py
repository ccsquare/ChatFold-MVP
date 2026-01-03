"""Thread-safe in-memory storage for workspace entities.

Provides storage for:
- Folders (with inputs and outputs)
- Users
- Projects (future)
"""

import threading

from app.components.workspace.models import Folder, User, Project


class WorkspaceStorage:
    """Thread-safe in-memory storage for workspace data.

    Uses a reentrant lock (RLock) to ensure thread safety for all operations.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._folders: dict[str, Folder] = {}
        self._users: dict[str, User] = {}
        self._projects: dict[str, Project] = {}

    # Folder operations
    def save_folder(self, folder: Folder) -> None:
        """Save or update a folder."""
        with self._lock:
            self._folders[folder.id] = folder

    def get_folder(self, folder_id: str) -> Folder | None:
        """Get a folder by ID."""
        with self._lock:
            return self._folders.get(folder_id)

    def list_folders(self) -> list[Folder]:
        """List all folders, sorted by creation time (newest first)."""
        with self._lock:
            return sorted(
                list(self._folders.values()),
                key=lambda f: f.createdAt,
                reverse=True,
            )

    def delete_folder(self, folder_id: str) -> bool:
        """Delete a folder. Returns True if deleted, False if not found."""
        with self._lock:
            if folder_id in self._folders:
                del self._folders[folder_id]
                return True
            return False

    def update_folder(self, folder_id: str, **updates) -> Folder | None:
        """Update folder fields. Returns updated folder or None if not found."""
        with self._lock:
            folder = self._folders.get(folder_id)
            if folder:
                for key, value in updates.items():
                    if hasattr(folder, key) and value is not None:
                        setattr(folder, key, value)
            return folder

    # User operations
    def save_user(self, user: User) -> None:
        """Save or update a user."""
        with self._lock:
            self._users[user.id] = user

    def get_user(self, user_id: str) -> User | None:
        """Get a user by ID."""
        with self._lock:
            return self._users.get(user_id)

    def list_users(self) -> list[User]:
        """List all users."""
        with self._lock:
            return list(self._users.values())

    # Project operations
    def save_project(self, project: Project) -> None:
        """Save or update a project."""
        with self._lock:
            self._projects[project.id] = project

    def get_project(self, project_id: str) -> Project | None:
        """Get a project by ID."""
        with self._lock:
            return self._projects.get(project_id)

    def list_projects(self, user_id: str | None = None) -> list[Project]:
        """List all projects, optionally filtered by user ID."""
        with self._lock:
            projects = list(self._projects.values())
            if user_id:
                projects = [p for p in projects if p.userId == user_id]
            return sorted(projects, key=lambda p: p.createdAt, reverse=True)

    # Utility
    def clear_all(self) -> None:
        """Clear all data (useful for testing)."""
        with self._lock:
            self._folders.clear()
            self._users.clear()
            self._projects.clear()


# Singleton instance
workspace_storage = WorkspaceStorage()
