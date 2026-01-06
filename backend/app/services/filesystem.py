"""FileSystem service for managing directory structure and file operations.

This service handles:
- Directory initialization on application startup
- User/project/folder directory management
- File read/write operations for uploads, structures, and job artifacts

Concurrency Safety:
- Atomic writes use temp file + rename pattern to prevent partial writes
- Safe for multi-instance deployments with shared filesystem
"""

import os
import tempfile
from pathlib import Path

from app.settings import DEFAULT_PROJECT_ID, DEFAULT_USER_ID, settings
from app.utils import get_logger

logger = get_logger(__name__)


class FileSystemService:
    """File system service for managing directories and files.

    Responsibilities:
    - Initialize directory structure on startup
    - Ensure directories exist before file operations
    - Read/write files with proper error handling

    Directory Structure (MVP):
    {outputs}/
    ├── users/
    │   └── user_default/
    │       ├── projects/
    │       │   └── project_default/
    │       │       ├── uploads/{folder_id}/
    │       │       │   └── {files}
    │       │       └── structures/{job_id}/
    │       │           └── {pdb_files}
    │       └── jobs/{job_id}/
    │           └── {artifacts}
    └── shared/
        ├── templates/
        └── cache/
    """

    def __init__(self):
        self._initialized = False

    def initialize(self) -> None:
        """Initialize directory structure on application startup.

        Creates the base directory structure including:
        - Outputs root
        - Logs root
        - Default user and project directories
        - Shared directories (templates, cache)

        This method is idempotent and can be called multiple times.
        """
        if self._initialized:
            logger.debug("FileSystem already initialized, skipping")
            return

        # Directories to create on startup
        dirs_to_create = [
            # Base directories
            settings.get_outputs_root(),
            settings.get_logs_root(),
            # MVP default user/project directories
            settings.get_user_path(DEFAULT_USER_ID),
            settings.get_project_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID),
            settings.get_project_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID) / "uploads",
            settings.get_project_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID) / "structures",
            settings.get_project_path(DEFAULT_USER_ID, DEFAULT_PROJECT_ID) / "folders",
            settings.get_user_path(DEFAULT_USER_ID) / "jobs",
            # Shared directories
            settings.get_outputs_root() / "shared" / "templates",
            settings.get_outputs_root() / "shared" / "cache",
        ]

        for dir_path in dirs_to_create:
            dir_path.mkdir(parents=True, exist_ok=True)
            logger.debug(f"Ensured directory exists: {dir_path}")

        self._initialized = True
        logger.info(f"FileSystem initialized: outputs={settings.get_outputs_root()}, logs={settings.get_logs_root()}")

    @property
    def is_initialized(self) -> bool:
        """Check if the filesystem has been initialized."""
        return self._initialized

    # ==================== Directory Management ====================

    def ensure_user_dir(self, user_id: str) -> Path:
        """Ensure user directory exists and return path."""
        path = settings.get_user_path(user_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def ensure_project_dir(self, user_id: str, project_id: str) -> Path:
        """Ensure project directory exists and return path."""
        path = settings.get_project_path(user_id, project_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def ensure_folder_dir(self, user_id: str, project_id: str, folder_id: str) -> Path:
        """Ensure folder directory exists and return path."""
        path = settings.get_folder_path(user_id, project_id, folder_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def ensure_upload_dir(
        self,
        folder_id: str,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
    ) -> Path:
        """Ensure upload directory exists and return path.

        Args:
            folder_id: The folder ID for uploads
            user_id: User ID (defaults to DEFAULT_USER_ID for MVP)
            project_id: Project ID (defaults to DEFAULT_PROJECT_ID for MVP)

        Returns:
            Path to the upload directory
        """
        path = settings.get_uploads_path(user_id, project_id, folder_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def ensure_structures_dir(
        self,
        job_id: str,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
    ) -> Path:
        """Ensure structure files directory exists and return path.

        Args:
            job_id: The job ID for structure files
            user_id: User ID (defaults to DEFAULT_USER_ID for MVP)
            project_id: Project ID (defaults to DEFAULT_PROJECT_ID for MVP)

        Returns:
            Path to the structures directory
        """
        path = settings.get_structures_path(user_id, project_id, job_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def ensure_job_dir(self, job_id: str, user_id: str = DEFAULT_USER_ID) -> Path:
        """Ensure job artifacts directory exists and return path.

        Args:
            job_id: The job ID
            user_id: User ID (defaults to DEFAULT_USER_ID for MVP)

        Returns:
            Path to the job directory
        """
        path = settings.get_jobs_path(user_id, job_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    # ==================== File Operations ====================

    def write_file(
        self,
        path: Path,
        content: str | bytes,
        encoding: str = "utf-8",
        atomic: bool = True,
    ) -> int:
        """Write content to a file.

        Creates parent directories if they don't exist.
        Uses atomic write by default to prevent partial writes in concurrent scenarios.

        Args:
            path: Path to the file
            content: Content to write (string or bytes)
            encoding: Encoding for string content (default: utf-8)
            atomic: Use atomic write (temp file + rename). Default True.

        Returns:
            File size in bytes
        """
        path.parent.mkdir(parents=True, exist_ok=True)

        if atomic:
            return self._write_file_atomic(path, content, encoding)
        else:
            # Direct write (legacy, not recommended for shared filesystems)
            if isinstance(content, str):
                path.write_text(content, encoding=encoding)
            else:
                path.write_bytes(content)

            size = path.stat().st_size
            logger.debug(f"Wrote file: {path} ({size} bytes)")
            return size

    def _write_file_atomic(
        self,
        path: Path,
        content: str | bytes,
        encoding: str = "utf-8",
    ) -> int:
        """Write content atomically using temp file + rename.

        This prevents partial writes when:
        - Multiple processes write to the same file
        - Process crashes during write
        - Filesystem runs out of space during write

        The rename operation is atomic on POSIX systems when source and
        destination are on the same filesystem.

        Args:
            path: Path to the file
            content: Content to write (string or bytes)
            encoding: Encoding for string content

        Returns:
            File size in bytes
        """
        dir_path = path.parent

        # Create temp file in same directory (ensures same filesystem for atomic rename)
        fd = None
        tmp_path = None

        try:
            fd, tmp_path_str = tempfile.mkstemp(
                dir=dir_path,
                suffix=".tmp",
                prefix=f".{path.name}.",
            )
            tmp_path = Path(tmp_path_str)

            # Write content to temp file
            if isinstance(content, str):
                os.write(fd, content.encode(encoding))
            else:
                os.write(fd, content)

            os.close(fd)
            fd = None  # Mark as closed

            # Atomic rename (overwrites existing file)
            tmp_path.rename(path)

            size = path.stat().st_size
            logger.debug(f"Wrote file atomically: {path} ({size} bytes)")
            return size

        except Exception as e:
            # Clean up temp file on failure
            if fd is not None:
                try:
                    os.close(fd)
                except OSError:
                    pass
            if tmp_path and tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass
            logger.error(f"Atomic write failed for {path}: {e}")
            raise

    def read_file(
        self,
        path: Path,
        encoding: str = "utf-8",
    ) -> str | None:
        """Read file content as string.

        Args:
            path: Path to the file
            encoding: Encoding for reading (default: utf-8)

        Returns:
            File content as string, or None if file doesn't exist
        """
        if not path.exists():
            logger.debug(f"File not found: {path}")
            return None

        content = path.read_text(encoding=encoding)
        logger.debug(f"Read file: {path} ({len(content)} chars)")
        return content

    def read_file_bytes(self, path: Path) -> bytes | None:
        """Read file content as bytes.

        Args:
            path: Path to the file

        Returns:
            File content as bytes, or None if file doesn't exist
        """
        if not path.exists():
            logger.debug(f"File not found: {path}")
            return None

        content = path.read_bytes()
        logger.debug(f"Read file: {path} ({len(content)} bytes)")
        return content

    def delete_file(self, path: Path) -> bool:
        """Delete a file.

        Args:
            path: Path to the file

        Returns:
            True if file was deleted, False if it didn't exist
        """
        if path.exists():
            path.unlink()
            logger.debug(f"Deleted file: {path}")
            return True
        logger.debug(f"File not found for deletion: {path}")
        return False

    def file_exists(self, path: Path) -> bool:
        """Check if a file exists.

        Args:
            path: Path to check

        Returns:
            True if file exists, False otherwise
        """
        return path.exists() and path.is_file()

    def list_files(self, directory: Path, pattern: str = "*") -> list[Path]:
        """List files in a directory matching a pattern.

        Args:
            directory: Directory to list files from
            pattern: Glob pattern (default: "*" for all files)

        Returns:
            List of file paths
        """
        if not directory.exists():
            return []
        return list(directory.glob(pattern))


# Singleton instance
filesystem_service = FileSystemService()
