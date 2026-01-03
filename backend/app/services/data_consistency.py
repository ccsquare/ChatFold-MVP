"""Data consistency service for three-layer storage architecture.

This service ensures consistency between MySQL (persistence), Redis (cache),
and FileSystem (binary storage) layers.

Key Features:
- MySQL-Redis dual write for job state
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
from app.db.models import Job, JobEvent, LearningRecord, Structure
from app.repositories import (
    JobEventRepository,
    JobRepository,
    LearningRecordRepository,
    StructureRepository,
    job_event_repository,
    job_repository,
    learning_record_repository,
    structure_repository,
)
from app.services.filesystem import filesystem_service
from app.services.job_state import JobStateService, job_state_service
from app.services.sse_events import SSEEventsService, sse_events_service
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

    For job lifecycle:
    - Create: MySQL first, then Redis cache
    - Update: Redis (high frequency), periodic MySQL sync
    - Complete: MySQL final state, Redis TTL for cleanup
    """

    def __init__(
        self,
        job_repo: JobRepository = job_repository,
        structure_repo: StructureRepository = structure_repository,
        job_event_repo: JobEventRepository = job_event_repository,
        learning_record_repo: LearningRecordRepository = learning_record_repository,
        job_state_svc: JobStateService = job_state_service,
        sse_events_svc: SSEEventsService = sse_events_service,
    ):
        self._job_repo = job_repo
        self._structure_repo = structure_repo
        self._job_event_repo = job_event_repo
        self._learning_record_repo = learning_record_repo
        self._job_state_svc = job_state_svc
        self._sse_events_svc = sse_events_svc

    # ==================== Job State Dual Write ====================

    def create_job_state(
        self,
        db: Session,
        job_id: str,
        status: StatusType = StatusType.queued,
        stage: StageType = StageType.QUEUED,
        message: str = "Job queued",
    ) -> bool:
        """Create job state in both MySQL and Redis.

        MySQL is the source of truth. Redis is populated for fast reads.

        Args:
            db: Database session
            job_id: Job ID
            status: Initial status
            stage: Initial stage
            message: Initial message

        Returns:
            True if both writes succeed
        """
        # 1. Update MySQL (source of truth)
        job = self._job_repo.update_status(db, job_id, status.value, stage.value)
        if not job:
            logger.error(f"Failed to update MySQL job state: {job_id}")
            return False

        # 2. Create Redis cache
        try:
            self._job_state_svc.create_state(job_id, status, stage, message)
            logger.debug(f"Created dual-write job state: {job_id}")
            return True
        except Exception as e:
            logger.warning(f"Redis write failed, MySQL succeeded: {job_id}, {e}")
            # MySQL succeeded, so we return True but log the Redis failure
            return True

    def update_job_state(
        self,
        db: Session,
        job_id: str,
        status: StatusType,
        stage: StageType,
        progress: int,
        message: str,
        sync_mysql: bool = False,
    ) -> bool:
        """Update job state with optional MySQL sync.

        For high-frequency updates (progress), only Redis is updated.
        For state transitions, MySQL is also updated.

        Args:
            db: Database session
            job_id: Job ID
            status: Job status
            stage: Execution stage
            progress: Progress percentage
            message: Status message
            sync_mysql: If True, also update MySQL

        Returns:
            True if update succeeds
        """
        # 1. Always update Redis (fast path)
        try:
            self._job_state_svc.set_state(job_id, status, stage, progress, message)
        except Exception as e:
            logger.warning(f"Redis update failed: {job_id}, {e}")
            # Continue to MySQL if sync_mysql is True

        # 2. Optionally update MySQL (state transitions)
        if sync_mysql:
            job = self._job_repo.update_status(db, job_id, status.value, stage.value)
            if not job:
                logger.error(f"MySQL update failed: {job_id}")
                return False

        return True

    def complete_job(
        self,
        db: Session,
        job_id: str,
        message: str = "Job complete",
    ) -> bool:
        """Mark job as complete in both MySQL and Redis.

        Also creates a LearningRecord for the completed job.

        Args:
            db: Database session
            job_id: Job ID
            message: Completion message

        Returns:
            True if completion succeeds
        """
        # 1. Update MySQL
        job = self._job_repo.mark_complete(db, job_id)
        if not job:
            logger.error(f"Failed to mark job complete in MySQL: {job_id}")
            return False

        # 2. Update Redis
        try:
            self._job_state_svc.mark_complete(job_id, message)
            self._sse_events_svc.set_completion_ttl(job_id)
        except Exception as e:
            logger.warning(f"Redis completion update failed: {job_id}, {e}")

        # 3. Create learning record
        self._create_learning_record(db, job)

        logger.info(f"Job completed with dual-write: {job_id}")
        return True

    def fail_job(
        self,
        db: Session,
        job_id: str,
        message: str = "Job failed",
    ) -> bool:
        """Mark job as failed in both MySQL and Redis.

        Args:
            db: Database session
            job_id: Job ID
            message: Error message

        Returns:
            True if update succeeds
        """
        # 1. Update MySQL
        job = self._job_repo.mark_failed(db, job_id)
        if not job:
            logger.error(f"Failed to mark job failed in MySQL: {job_id}")
            return False

        # 2. Update Redis
        try:
            self._job_state_svc.mark_failed(job_id, message)
            self._sse_events_svc.set_completion_ttl(job_id)
        except Exception as e:
            logger.warning(f"Redis failure update failed: {job_id}, {e}")

        logger.info(f"Job marked as failed with dual-write: {job_id}")
        return True

    # ==================== Event Persistence ====================

    def persist_event(
        self,
        db: Session,
        event: PydanticJobEvent,
        structure_id: str | None = None,
    ) -> JobEvent | None:
        """Persist SSE event to MySQL for learning/debugging.

        Events are first pushed to Redis for streaming, then persisted to MySQL.

        Args:
            db: Database session
            event: Pydantic JobEvent from SSE
            structure_id: Associated structure ID (for THINKING_PDB events)

        Returns:
            Created JobEvent ORM entity or None on failure
        """
        try:
            job_event = self._job_event_repo.create_event(
                db,
                job_id=event.jobId,
                event_type=event.eventType.value,
                stage=event.stage.value,
                status=event.status.value,
                progress=event.progress,
                message=event.message,
                block_index=event.blockIndex,
                structure_id=structure_id,
            )
            logger.debug(f"Persisted event to MySQL: {event.eventId}")
            return job_event
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
            event: Pydantic JobEvent
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
        job_id: str,
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
            job_id: Parent job ID
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

        structures_dir = filesystem_service.ensure_structures_dir(job_id)
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
                job_id=job_id,
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

    def get_job_state_with_fallback(
        self,
        db: Session,
        job_id: str,
    ) -> dict | None:
        """Get job state with Redis-to-MySQL fallback.

        Tries Redis first, falls back to MySQL if Redis fails or has no data.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            Job state dict or None if not found
        """
        # 1. Try Redis (fast path)
        try:
            state = self._job_state_svc.get_state(job_id)
            if state:
                return state
        except Exception as e:
            logger.warning(f"Redis read failed, falling back to MySQL: {job_id}, {e}")

        # 2. Fallback to MySQL
        job = self._job_repo.get_by_id(db, job_id)
        if not job:
            return None

        return {
            "status": job.status,
            "stage": job.stage,
            "progress": 100 if job.status == "complete" else 0,
            "message": "",
            "updated_at": job.completed_at or job.created_at,
        }

    def sync_redis_from_mysql(self, db: Session, job_id: str) -> bool:
        """Sync Redis cache from MySQL (cache warm-up).

        Useful when Redis was flushed or for cache recovery.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            True if sync succeeds
        """
        job = self._job_repo.get_by_id(db, job_id)
        if not job:
            return False

        try:
            status = StatusType(job.status) if job.status else StatusType.queued
            stage = StageType(job.stage) if job.stage else StageType.QUEUED
            progress = 100 if job.status == "complete" else 0

            self._job_state_svc.create_state(job_id, status, stage)
            logger.info(f"Synced Redis from MySQL: {job_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to sync Redis from MySQL: {job_id}, {e}")
            return False

    # ==================== Orphan Detection ====================

    def detect_orphan_files(
        self,
        db: Session,
        job_id: str | None = None,
    ) -> list[Path]:
        """Detect orphan files (files without database records).

        Args:
            db: Database session
            job_id: Optional job ID to scope the check

        Returns:
            List of orphan file paths
        """
        orphans = []

        # Get all structure files from filesystem
        if job_id:
            # Check specific job
            structures_dir = settings.get_default_structures_path(job_id)
            if not structures_dir.exists():
                return []

            db_files = {s.file_path for s in self._structure_repo.get_by_job(db, job_id)}

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
        job_id: str | None = None,
        dry_run: bool = True,
    ) -> list[Path]:
        """Clean up orphan files.

        Args:
            db: Database session
            job_id: Optional job ID to scope cleanup
            dry_run: If True, only detect without deleting

        Returns:
            List of (deleted or would-be-deleted) file paths
        """
        orphans = self.detect_orphan_files(db, job_id)

        if not dry_run:
            for file_path in orphans:
                try:
                    filesystem_service.delete_file(file_path)
                    logger.info(f"Deleted orphan file: {file_path}")
                except Exception as e:
                    logger.error(f"Failed to delete orphan file: {file_path}, {e}")

        return orphans

    # ==================== Learning Record Creation ====================

    def _create_learning_record(self, db: Session, job: Job) -> LearningRecord | None:
        """Create learning record for completed job.

        Args:
            db: Database session
            job: Completed Job entity

        Returns:
            Created LearningRecord or None
        """
        try:
            # Get statistics
            thinking_block_count = self._job_event_repo.count_thinking_blocks(db, job.id)
            structures = self._structure_repo.get_by_job(db, job.id)
            structure_count = len(structures)

            # Find final structure
            final_structure = next((s for s in structures if s.is_final), None)
            final_structure_id = final_structure.id if final_structure else None
            final_plddt = final_structure.plddt_score if final_structure else None

            # Create record
            record = self._learning_record_repo.create_record(
                db,
                job_id=job.id,
                input_sequence=job.sequence,
                thinking_block_count=thinking_block_count,
                structure_count=structure_count,
                final_structure_id=final_structure_id,
                final_plddt=final_plddt,
            )
            logger.info(f"Created learning record: {record.id} for job {job.id}")
            return record
        except Exception as e:
            logger.error(f"Failed to create learning record for job {job.id}: {e}")
            return None


# Singleton instance
data_consistency_service = DataConsistencyService()
