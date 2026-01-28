"""Structure storage service with dual mode support.

Supports two storage modes controlled by USE_MEMORY_STORE:
- Memory mode (use_memory_store=true): Stores in-memory, lost on restart
- Filesystem mode (use_memory_store=false): Stores on disk, persistent

Directory Structure (filesystem mode):
{outputs}/users/{user_id}/projects/{project_id}/structures/{task_id}/
    ├── fast-folding.cif
    ├── general-folding-first.cif
    ├── general-folding-cycle-1.cif
    ├── general-folding-cycle-2.cif
    └── general-folding-cycle-3.cif
"""

import threading
from pathlib import Path

from app.settings import DEFAULT_PROJECT_ID, DEFAULT_USER_ID, settings
from app.utils import get_logger

logger = get_logger(__name__)


class StructureStorageService:
    """Unified structure storage service supporting memory and filesystem modes.

    Thread-safe implementation using RLock for all operations.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._memory_cache: dict[str, str] = {}  # structure_id -> pdb_data
        self._use_memory = settings.use_memory_store
        logger.info(f"StructureStorageService initialized: use_memory={self._use_memory}")

    @property
    def use_memory_mode(self) -> bool:
        """Check if using memory storage mode."""
        return self._use_memory

    def _get_structure_dir(
        self,
        task_id: str,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
    ) -> Path:
        """Get the directory path for structure files.

        Args:
            task_id: The task identifier
            user_id: User ID (defaults to DEFAULT_USER_ID)
            project_id: Project ID (defaults to DEFAULT_PROJECT_ID)

        Returns:
            Path to the structures directory
        """
        return settings.get_structures_path(user_id, project_id, task_id)

    def _ensure_structure_dir(
        self,
        task_id: str,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
    ) -> Path:
        """Ensure structure directory exists and return path.

        Args:
            task_id: The task identifier
            user_id: User ID (defaults to DEFAULT_USER_ID)
            project_id: Project ID (defaults to DEFAULT_PROJECT_ID)

        Returns:
            Path to the structures directory
        """
        path = self._get_structure_dir(task_id, user_id, project_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_structure(
        self,
        structure_id: str,
        pdb_data: str,
        task_id: str | None = None,
        filename: str | None = None,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
    ) -> str | None:
        """Save structure data.

        In memory mode: stores in memory cache
        In filesystem mode: writes to file and caches in memory

        Args:
            structure_id: Unique structure identifier
            pdb_data: PDB/CIF file content
            task_id: Task ID for filesystem path (required in filesystem mode)
            filename: Filename for filesystem storage (e.g., "fast-folding.cif")
            user_id: User ID for path
            project_id: Project ID for path

        Returns:
            File path (filesystem mode) or structure_id (memory mode), None on error
        """
        with self._lock:
            # Always cache in memory for fast access
            self._memory_cache[structure_id] = pdb_data

            if self._use_memory:
                logger.debug(f"Saved structure to memory: {structure_id}")
                return structure_id

            # Filesystem mode: write to disk
            if not task_id:
                logger.warning(f"task_id required for filesystem storage: {structure_id}")
                return structure_id  # Fall back to memory-only

            if not filename:
                filename = f"{structure_id}.cif"

            try:
                structure_dir = self._ensure_structure_dir(task_id, user_id, project_id)
                file_path = structure_dir / filename
                file_path.write_text(pdb_data, encoding="utf-8")
                logger.info(f"Saved structure to filesystem: {file_path}")
                return str(file_path)
            except Exception as e:
                logger.error(f"Failed to save structure to filesystem: {e}")
                return structure_id  # Fall back to memory

    def get_structure(
        self,
        structure_id: str,
        task_id: str | None = None,
        filename: str | None = None,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
    ) -> str | None:
        """Get structure data.

        Checks memory cache first, then filesystem if in filesystem mode.

        Args:
            structure_id: Unique structure identifier
            task_id: Task ID for filesystem path
            filename: Filename for filesystem lookup
            user_id: User ID for path
            project_id: Project ID for path

        Returns:
            PDB/CIF content or None if not found
        """
        with self._lock:
            # Check memory cache first
            if structure_id in self._memory_cache:
                logger.debug(f"Found structure in memory: {structure_id}")
                return self._memory_cache[structure_id]

            if self._use_memory:
                return None

            # Filesystem mode: try to read from disk
            if not task_id:
                return None

            if not filename:
                filename = f"{structure_id}.cif"

            try:
                structure_dir = self._get_structure_dir(task_id, user_id, project_id)
                file_path = structure_dir / filename
                if file_path.exists():
                    content = file_path.read_text(encoding="utf-8")
                    # Cache in memory for future access
                    self._memory_cache[structure_id] = content
                    logger.debug(f"Loaded structure from filesystem: {file_path}")
                    return content
            except Exception as e:
                logger.error(f"Failed to read structure from filesystem: {e}")

            return None

    def get_structure_by_path(self, file_path: str) -> str | None:
        """Get structure data by file path.

        Args:
            file_path: Absolute path to the structure file

        Returns:
            PDB/CIF content or None if not found
        """
        with self._lock:
            path = Path(file_path)
            if not path.exists():
                return None

            try:
                content = path.read_text(encoding="utf-8")
                # Cache using filename as key
                self._memory_cache[path.name] = content
                return content
            except Exception as e:
                logger.error(f"Failed to read structure from path: {e}")
                return None

    def list_structures(
        self,
        task_id: str,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
        pattern: str = "*.cif",
    ) -> list[Path]:
        """List structure files for a job.

        Args:
            task_id: The task identifier
            user_id: User ID for path
            project_id: Project ID for path
            pattern: Glob pattern for file matching

        Returns:
            List of file paths
        """
        with self._lock:
            structure_dir = self._get_structure_dir(task_id, user_id, project_id)
            if not structure_dir.exists():
                return []
            return list(structure_dir.glob(pattern))

    def delete_structure(
        self,
        structure_id: str,
        task_id: str | None = None,
        filename: str | None = None,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
    ) -> bool:
        """Delete structure data.

        Args:
            structure_id: Unique structure identifier
            task_id: Task ID for filesystem path
            filename: Filename for filesystem deletion
            user_id: User ID for path
            project_id: Project ID for path

        Returns:
            True if deleted, False otherwise
        """
        with self._lock:
            deleted = False

            # Remove from memory cache
            if structure_id in self._memory_cache:
                del self._memory_cache[structure_id]
                deleted = True

            if self._use_memory:
                return deleted

            # Filesystem mode: delete from disk
            if task_id:
                if not filename:
                    filename = f"{structure_id}.cif"

                try:
                    structure_dir = self._get_structure_dir(task_id, user_id, project_id)
                    file_path = structure_dir / filename
                    if file_path.exists():
                        file_path.unlink()
                        logger.info(f"Deleted structure file: {file_path}")
                        deleted = True
                except Exception as e:
                    logger.error(f"Failed to delete structure file: {e}")

            return deleted

    def clear_memory_cache(self) -> int:
        """Clear the memory cache.

        Returns:
            Number of entries cleared
        """
        with self._lock:
            count = len(self._memory_cache)
            self._memory_cache.clear()
            logger.info(f"Cleared {count} structures from memory cache")
            return count


# Singleton instance
structure_storage = StructureStorageService()
