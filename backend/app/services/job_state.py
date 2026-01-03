"""Job state management service using Redis.

This service provides a high-level interface for managing job state in Redis,
supporting the three-layer storage architecture where Redis serves as the
runtime state cache.

Key Features:
- Fast job state reads/writes via Redis hash
- Progress tracking and updates
- Status transitions
- Optional TTL for automatic cleanup
"""

from typing import TYPE_CHECKING, TypedDict

from app.components.nanocc.job import StageType, StatusType
from app.db.redis_cache import get_job_state_cache
from app.utils import get_logger, get_timestamp_ms

if TYPE_CHECKING:
    from app.db.redis_cache import RedisCache

logger = get_logger(__name__)

# Default TTL for job state (24 hours)
JOB_STATE_TTL = 24 * 60 * 60


class JobStateDict(TypedDict):
    """Type definition for job state stored in Redis."""

    status: str
    stage: str
    progress: int
    message: str
    updated_at: int


class JobStateService:
    """Job state management service using Redis.

    This service manages job execution state in Redis, providing:
    - Fast state reads for SSE streaming
    - Progress updates during job execution
    - Status transition tracking

    State is stored as a Redis hash with the following fields:
    - status: Current job status (queued, running, complete, etc.)
    - stage: Current execution stage (QUEUED, MSA, MODEL, etc.)
    - progress: Progress percentage (0-100)
    - message: Latest status message
    - updated_at: Last update timestamp (ms)
    """

    def __init__(self, cache: "RedisCache | None" = None):
        """Initialize job state service.

        Args:
            cache: Optional RedisCache instance for dependency injection (testing).
                   If not provided, uses the default singleton cache.
        """
        self._cache = cache if cache is not None else get_job_state_cache()

    def _key(self, job_id: str) -> str:
        """Generate Redis key for job state."""
        return f"job:{job_id}:state"

    def create_state(
        self,
        job_id: str,
        status: StatusType = StatusType.queued,
        stage: StageType = StageType.QUEUED,
        message: str = "Job queued",
        ttl: int | None = JOB_STATE_TTL,
    ) -> bool:
        """Create initial job state.

        Args:
            job_id: Job ID
            status: Initial status (default: queued)
            stage: Initial stage (default: QUEUED)
            message: Initial message
            ttl: TTL in seconds (default: 24 hours, None for no expiry)

        Returns:
            True if successful
        """
        key = self._key(job_id)
        state = {
            "status": status.value,
            "stage": stage.value,
            "progress": "0",
            "message": message,
            "updated_at": str(get_timestamp_ms()),
        }

        result = self._cache.hset(key, state)

        if result and ttl:
            self._cache.expire(key, ttl)

        logger.info(f"Created job state: {job_id}, status={status.value}")
        return result

    def get_state(self, job_id: str) -> JobStateDict | None:
        """Get current job state.

        Args:
            job_id: Job ID

        Returns:
            Job state dict or None if not found
        """
        data = self._cache.hgetall(self._key(job_id))
        if not data:
            return None

        return {
            "status": data.get("status", StatusType.queued.value),
            "stage": data.get("stage", StageType.QUEUED.value),
            "progress": int(data.get("progress", 0)),
            "message": data.get("message", ""),
            "updated_at": int(data.get("updated_at", 0)),
        }

    def set_state(
        self,
        job_id: str,
        status: StatusType,
        stage: StageType,
        progress: int,
        message: str,
    ) -> bool:
        """Set complete job state.

        Args:
            job_id: Job ID
            status: Job status
            stage: Execution stage
            progress: Progress percentage (0-100)
            message: Status message

        Returns:
            True if successful
        """
        state = {
            "status": status.value,
            "stage": stage.value,
            "progress": str(min(100, max(0, progress))),
            "message": message,
            "updated_at": str(get_timestamp_ms()),
        }

        result = self._cache.hset(self._key(job_id), state)
        logger.debug(
            f"Updated job state: {job_id}, status={status.value}, "
            f"stage={stage.value}, progress={progress}"
        )
        return result

    def update_progress(
        self,
        job_id: str,
        progress: int,
        message: str | None = None,
    ) -> bool:
        """Update job progress.

        Args:
            job_id: Job ID
            progress: Progress percentage (0-100)
            message: Optional status message update

        Returns:
            True if successful
        """
        updates = {
            "progress": str(min(100, max(0, progress))),
            "updated_at": str(get_timestamp_ms()),
        }

        if message is not None:
            updates["message"] = message

        result = self._cache.hset(self._key(job_id), updates)
        logger.debug(f"Updated job progress: {job_id}, progress={progress}")
        return result

    def update_stage(
        self,
        job_id: str,
        stage: StageType,
        status: StatusType | None = None,
        message: str | None = None,
    ) -> bool:
        """Update job stage.

        Args:
            job_id: Job ID
            stage: New execution stage
            status: Optional status update
            message: Optional message update

        Returns:
            True if successful
        """
        updates: dict[str, str] = {
            "stage": stage.value,
            "updated_at": str(get_timestamp_ms()),
        }

        if status is not None:
            updates["status"] = status.value
        if message is not None:
            updates["message"] = message

        result = self._cache.hset(self._key(job_id), updates)
        logger.debug(f"Updated job stage: {job_id}, stage={stage.value}")
        return result

    def mark_complete(self, job_id: str, message: str = "Job complete") -> bool:
        """Mark job as complete.

        Args:
            job_id: Job ID
            message: Completion message

        Returns:
            True if successful
        """
        return self.set_state(
            job_id,
            status=StatusType.complete,
            stage=StageType.DONE,
            progress=100,
            message=message,
        )

    def mark_failed(self, job_id: str, message: str = "Job failed") -> bool:
        """Mark job as failed.

        Args:
            job_id: Job ID
            message: Error message

        Returns:
            True if successful
        """
        updates = {
            "status": StatusType.failed.value,
            "stage": StageType.ERROR.value,
            "message": message,
            "updated_at": str(get_timestamp_ms()),
        }
        result = self._cache.hset(self._key(job_id), updates)
        logger.warning(f"Job marked as failed: {job_id}, message={message}")
        return result

    def delete_state(self, job_id: str) -> bool:
        """Delete job state.

        Args:
            job_id: Job ID

        Returns:
            True if deleted
        """
        result = self._cache.delete(self._key(job_id))
        if result:
            logger.info(f"Deleted job state: {job_id}")
        return result

    def exists(self, job_id: str) -> bool:
        """Check if job state exists.

        Args:
            job_id: Job ID

        Returns:
            True if exists
        """
        return self._cache.exists(self._key(job_id))

    def refresh_ttl(self, job_id: str, ttl: int = JOB_STATE_TTL) -> bool:
        """Refresh TTL for job state.

        Args:
            job_id: Job ID
            ttl: New TTL in seconds

        Returns:
            True if successful
        """
        return self._cache.expire(self._key(job_id), ttl)


# Singleton instance
job_state_service = JobStateService()
