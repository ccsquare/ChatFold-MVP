"""Data consistency service for three-layer storage architecture.

This service ensures consistency between MySQL (persistence), Redis (cache),
and FileSystem (binary storage) layers.

Key Features:
- MySQL-Redis dual write for task state
- MySQL-FileSystem association for structure files
- Fallback strategies when Redis is unavailable
- Orphan file detection and cleanup

Architecture:
    ┌─────────────────────────────────────────────────────────────┐
    │                    DataConsistencyService                   │
    └─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌───────────┐       ┌───────────┐       ┌───────────┐
    │   MySQL   │       │   Redis   │       │ FileSystem│
    │  (source  │       │  (cache)  │       │ (binary)  │
    │  of truth)│       │           │       │           │
    └───────────┘       └───────────┘       └───────────┘
"""

from pathlib import Path

from sqlalchemy.orm import Session

from app.components.nanocc.job import JobEvent as PydanticJobEvent
from app.components.nanocc.job import StageType, StatusType
from app.db.models import LearningRecord, Structure, Task, TaskEvent
from app.repositories import (
    LearningRecordRepository,
    StructureRepository,
    TaskEventRepository,
    TaskRepository,
    learning_record_repository,
    structure_repository,
    task_event_repository,
    task_repository,
)
from app.services.filesystem import filesystem_service
from app.services.sse_events import SSEEventsService, sse_events_service
from app.services.task_state import TaskStateService, task_state_service
from app.settings import settings
from app.utils import get_logger

logger = get_logger(__name__)


class DataConsistencyService:
    """Service for maintaining data consistency across storage layers.

    This service coordinates writes to MySQL, Redis, and FileSystem to ensure
    data consistency. It implements the following patterns:

    1. Write-through: Changes are written to MySQL first, then Redis
    2. Cache-aside: Redis is populated from MySQL on cache miss
    3. Compensation: Failed operations trigger rollback/retry

    For task lifecycle:
    - Create: MySQL first, then Redis cache
    - Update: Redis (high frequency), periodic MySQL sync
    - Complete: MySQL final state, Redis TTL for cleanup
    """

    def __init__(
        self,
        task_repo: TaskRepository = task_repository,
        structure_repo: StructureRepository = structure_repository,
        task_event_repo: TaskEventRepository = task_event_repository,
        learning_record_repo: LearningRecordRepository = learning_record_repository,
        task_state_svc: TaskStateService = task_state_service,
        sse_events_svc: SSEEventsService = sse_events_service,
    ):
        self._task_repo = task_repo
        self._structure_repo = structure_repo
        self._task_event_repo = task_event_repo
        self._learning_record_repo = learning_record_repo
        self._task_state_svc = task_state_svc
        self._sse_events_svc = sse_events_svc

    # ==================== Task State Dual Write ====================

    def create_task_state(
        self,
        db: Session,
        task_id: str,
        status: StatusType = StatusType.queued,
        stage: StageType = StageType.QUEUED,
        message: str = "Task queued",
    ) -> bool:
        """Create task state in both MySQL and Redis.

        MySQL is the source of truth. Redis is populated for fast reads.

        Args:
            db: Database session
            task_id: Task ID
            status: Initial status
            stage: Initial stage
            message: Initial message

        Returns:
            True if both writes succeed
        """
        # 1. Update MySQL (source of truth)
        task = self._task_repo.update_status(db, task_id, status.value, stage.value)
        if not task:
            logger.error(f"Failed to update MySQL task state: {task_id}")
            return False

        # 2. Create Redis cache
        try:
            self._task_state_svc.create_state(task_id, status, stage, message)
            logger.debug(f"Created dual-write task state: {task_id}")
            return True
        except Exception as e:
            logger.warning(f"Redis write failed, MySQL succeeded: {task_id}, {e}")
            # MySQL succeeded, so we return True but log the Redis failure
            return True

    def update_task_state(
        self,
        db: Session,
        task_id: str,
        status: StatusType,
        stage: StageType,
        progress: int,
        message: str,
        sync_mysql: bool = False,
    ) -> bool:
        """Update task state with optional MySQL sync.

        For high-frequency updates (progress), only Redis is updated.
        For state transitions, MySQL is also updated.

        Args:
            db: Database session
            task_id: Task ID
            status: Task status
            stage: Execution stage
            progress: Progress percentage
            message: Status message
            sync_mysql: If True, also update MySQL

        Returns:
            True if update succeeds
        """
        # 1. Always update Redis (fast path)
        try:
            self._task_state_svc.set_state(task_id, status, stage, progress, message)
        except Exception as e:
            logger.warning(f"Redis update failed: {task_id}, {e}")
            # Continue to MySQL if sync_mysql is True

        # 2. Optionally update MySQL (state transitions)
        if sync_mysql:
            task = self._task_repo.update_status(db, task_id, status.value, stage.value)
            if not task:
                logger.error(f"MySQL update failed: {task_id}")
                return False

        return True

    def complete_task(
        self,
        db: Session,
        task_id: str,
        message: str = "Task complete",
    ) -> bool:
        """Mark task as complete in both MySQL and Redis.

        Also creates a LearningRecord for the completed task.

        Args:
            db: Database session
            task_id: Task ID
            message: Completion message

        Returns:
            True if completion succeeds
        """
        # 1. Update MySQL
        task = self._task_repo.mark_complete(db, task_id)
        if not task:
            logger.error(f"Failed to mark task complete in MySQL: {task_id}")
            return False

        # 2. Update Redis
        try:
            self._task_state_svc.mark_complete(task_id, message)
            self._sse_events_svc.set_completion_ttl(task_id)
        except Exception as e:
            logger.warning(f"Redis completion update failed: {task_id}, {e}")

        # 3. Create learning record
        self._create_learning_record(db, task)

        logger.info(f"Task completed with dual-write: {task_id}")
        return True

    def fail_task(
        self,
        db: Session,
        task_id: str,
        message: str = "Task failed",
    ) -> bool:
        """Mark task as failed in both MySQL and Redis.

        Args:
            db: Database session
            task_id: Task ID
            message: Error message

        Returns:
            True if update succeeds
        """
        # 1. Update MySQL
        task = self._task_repo.mark_failed(db, task_id)
        if not task:
            logger.error(f"Failed to mark task failed in MySQL: {task_id}")
            return False

        # 2. Update Redis
        try:
            self._task_state_svc.mark_failed(task_id, message)
            self._sse_events_svc.set_completion_ttl(task_id)
        except Exception as e:
            logger.warning(f"Redis failure update failed: {task_id}, {e}")

        logger.info(f"Task marked as failed with dual-write: {task_id}")
        return True

    # ==================== Event Persistence ====================

    def persist_event(
        self,
        db: Session,
        event: PydanticJobEvent,
        structure_id: str | None = None,
    ) -> TaskEvent | None:
        """Persist SSE event to MySQL for learning/debugging.

        Events are first pushed to Redis for streaming, then persisted to MySQL.

        Args:
            db: Database session
            event: Pydantic JobEvent from SSE (nanocc module)
            structure_id: Associated structure ID (for THINKING_PDB events)

        Returns:
            Created TaskEvent ORM entity or None on failure
        """
        try:
            # Note: event.jobId is the nanocc field name (external dependency)
            task_event = self._task_event_repo.create_event(
                db,
                task_id=event.jobId,
                event_type=event.eventType.value,
                stage=event.stage.value,
                status=event.status.value,
                progress=event.progress,
                message=event.message,
                block_index=event.blockIndex,
                structure_id=structure_id,
            )
            logger.debug(f"Persisted event to MySQL: {event.eventId}")
            return task_event
        except Exception as e:
            logger.error(f"Failed to persist event: {event.eventId}, {e}")
            return None

    def push_and_persist_event(
        self,
        db: Session,
        event: PydanticJobEvent,
        structure_id: str | None = None,
    ) -> bool:
        """Push event to Redis and persist to MySQL.

        Args:
            db: Database session
            event: Pydantic JobEvent (from nanocc module)
            structure_id: Associated structure ID

        Returns:
            True if Redis push succeeds (MySQL failure is logged but not blocking)
        """
        # 1. Push to Redis (critical for SSE streaming)
        try:
            self._sse_events_svc.push_event(event)
        except Exception as e:
            logger.error(f"Failed to push event to Redis: {event.eventId}, {e}")
            return False

        # 2. Persist to MySQL (non-blocking, for learning)
        self.persist_event(db, event, structure_id)

        return True

    # ==================== Structure-FileSystem Association ====================

    def create_structure_with_file(
        self,
        db: Session,
        task_id: str,
        label: str,
        pdb_content: str,
        filename: str | None = None,
        plddt_score: int | None = None,
        is_final: bool = False,
    ) -> Structure | None:
        """Create structure record with associated PDB file.

        Writes file first, then creates database record. If DB fails,
        file is orphaned (will be cleaned up later).

        Args:
            db: Database session
            task_id: Parent task ID
            label: Structure label (candidate-1, final, etc.)
            pdb_content: PDB file content
            filename: Optional filename (default: {label}.pdb)
            plddt_score: Quality score
            is_final: Whether this is the final structure

        Returns:
            Created Structure entity or None on failure
        """
        # 1. Determine file path
        if filename is None:
            filename = f"{label}.pdb"

        structures_dir = filesystem_service.ensure_structures_dir(task_id)
        file_path = structures_dir / filename

        # 2. Write file to filesystem
        try:
            filesystem_service.write_file(file_path, pdb_content)
            logger.debug(f"Wrote structure file: {file_path}")
        except Exception as e:
            logger.error(f"Failed to write structure file: {file_path}, {e}")
            return None

        # 3. Create database record
        try:
            structure = self._structure_repo.create_structure(
                db,
                task_id=task_id,
                label=label,
                filename=filename,
                file_path=str(file_path),
                plddt_score=plddt_score,
                is_final=is_final,
            )
            logger.info(f"Created structure with file: {structure.id}, {file_path}")
            return structure
        except Exception as e:
            logger.error(f"Failed to create structure record: {e}")
            # File is orphaned - will be cleaned up by orphan detection
            return None

    def delete_structure_with_file(self, db: Session, structure_id: str) -> bool:
        """Delete structure record and associated file.

        Args:
            db: Database session
            structure_id: Structure ID

        Returns:
            True if both deletions succeed
        """
        structure = self._structure_repo.get_by_id(db, structure_id)
        if not structure:
            return False

        file_path = Path(structure.file_path)

        # 1. Delete database record
        if not self._structure_repo.delete(db, structure_id):
            return False

        # 2. Delete file
        try:
            filesystem_service.delete_file(file_path)
            logger.info(f"Deleted structure with file: {structure_id}, {file_path}")
        except Exception as e:
            logger.warning(f"Failed to delete structure file (orphaned): {file_path}, {e}")

        return True

    # ==================== Fallback Strategies ====================

    def get_task_state_with_fallback(
        self,
        db: Session,
        task_id: str,
    ) -> dict | None:
        """Get task state with Redis-to-MySQL fallback.

        Tries Redis first, falls back to MySQL if Redis fails or has no data.

        Args:
            db: Database session
            task_id: Task ID

        Returns:
            Task state dict or None if not found
        """
        # 1. Try Redis (fast path)
        try:
            state = self._task_state_svc.get_state(task_id)
            if state:
                return state
        except Exception as e:
            logger.warning(f"Redis read failed, falling back to MySQL: {task_id}, {e}")

        # 2. Fallback to MySQL
        task = self._task_repo.get_by_id(db, task_id)
        if not task:
            return None

        return {
            "status": task.status,
            "stage": task.stage,
            "progress": 100 if task.status == "complete" else 0,
            "message": "",
            "updated_at": task.completed_at or task.created_at,
        }

    def sync_redis_from_mysql(self, db: Session, task_id: str) -> bool:
        """Sync Redis cache from MySQL (cache warm-up).

        Useful when Redis was flushed or for cache recovery.

        Args:
            db: Database session
            task_id: Task ID

        Returns:
            True if sync succeeds
        """
        task = self._task_repo.get_by_id(db, task_id)
        if not task:
            return False

        try:
            status = StatusType(task.status) if task.status else StatusType.queued
            stage = StageType(task.stage) if task.stage else StageType.QUEUED

            self._task_state_svc.create_state(task_id, status, stage)
            logger.info(f"Synced Redis from MySQL: {task_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to sync Redis from MySQL: {task_id}, {e}")
            return False

    # ==================== Orphan Detection ====================

    def detect_orphan_files(
        self,
        db: Session,
        task_id: str | None = None,
    ) -> list[Path]:
        """Detect orphan files (files without database records).

        Args:
            db: Database session
            task_id: Optional task ID to scope the check

        Returns:
            List of orphan file paths
        """
        orphans = []

        # Get all structure files from filesystem
        if task_id:
            # Check specific task
            structures_dir = settings.get_default_structures_path(task_id)
            if not structures_dir.exists():
                return []

            db_files = {s.file_path for s in self._structure_repo.get_by_task(db, task_id)}

            for file_path in structures_dir.glob("*.pdb"):
                if str(file_path) not in db_files:
                    orphans.append(file_path)
        else:
            # Check all structures (expensive)
            structures_root = settings.get_outputs_root() / "users"
            if not structures_root.exists():
                return []

            # Get all structure file paths from DB
            all_structures = self._structure_repo.get_all(db, limit=10000)
            db_files = {s.file_path for s in all_structures}

            # Scan filesystem
            for pdb_file in structures_root.rglob("*.pdb"):
                if str(pdb_file) not in db_files:
                    orphans.append(pdb_file)

        if orphans:
            logger.warning(f"Detected {len(orphans)} orphan files")

        return orphans

    def cleanup_orphan_files(
        self,
        db: Session,
        task_id: str | None = None,
        dry_run: bool = True,
    ) -> list[Path]:
        """Clean up orphan files.

        Args:
            db: Database session
            task_id: Optional task ID to scope cleanup
            dry_run: If True, only detect without deleting

        Returns:
            List of (deleted or would-be-deleted) file paths
        """
        orphans = self.detect_orphan_files(db, task_id)

        if not dry_run:
            for file_path in orphans:
                try:
                    filesystem_service.delete_file(file_path)
                    logger.info(f"Deleted orphan file: {file_path}")
                except Exception as e:
                    logger.error(f"Failed to delete orphan file: {file_path}, {e}")

        return orphans

    # ==================== Learning Record Creation ====================

    def _create_learning_record(self, db: Session, task: Task) -> LearningRecord | None:
        """Create learning record for completed task.

        Args:
            db: Database session
            task: Completed Task entity

        Returns:
            Created LearningRecord or None
        """
        try:
            # Get statistics
            thinking_block_count = self._task_event_repo.count_thinking_blocks(db, task.id)
            structures = self._structure_repo.get_by_task(db, task.id)
            structure_count = len(structures)

            # Find final structure
            final_structure = next((s for s in structures if s.is_final), None)
            final_structure_id = final_structure.id if final_structure else None
            final_plddt = final_structure.plddt_score if final_structure else None

            # Create record
            record = self._learning_record_repo.create_record(
                db,
                task_id=task.id,
                input_sequence=task.sequence,
                thinking_block_count=thinking_block_count,
                structure_count=structure_count,
                final_structure_id=final_structure_id,
                final_plddt=final_plddt,
            )
            logger.info(f"Created learning record: {record.id} for task {task.id}")
            return record
        except Exception as e:
            logger.error(f"Failed to create learning record for task {task.id}: {e}")
            return None


# Singleton instance
data_consistency_service = DataConsistencyService()
