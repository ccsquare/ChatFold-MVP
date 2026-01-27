"""Task state management service using Redis.

This service provides a high-level interface for managing task state in Redis,
supporting the three-layer storage architecture where Redis serves as the
runtime state cache.

Architecture (Single DB + Key Prefix Pattern):
- 使用单一 db=0，符合 Redis Cluster 兼容性要求
- 通过 RedisKeyPrefix 生成规范化的 Key
- Key 格式: chatfold:task:state:{task_id}, chatfold:task:meta:{task_id}

Key Features:
- Fast task state reads/writes via Redis hash
- Progress tracking and updates
- Status transitions
- Optional TTL for automatic cleanup
- Redis Cluster compatible
"""

from typing import TYPE_CHECKING, TypedDict

from app.components.nanocc.job import StageType, StatusType
from app.db.redis_cache import get_redis_cache
from app.db.redis_db import RedisKeyPrefix
from app.utils import get_logger, get_timestamp_ms

if TYPE_CHECKING:
    from app.db.redis_cache import RedisCache

logger = get_logger(__name__)

# Default TTL for task state (24 hours)
TASK_STATE_TTL = 24 * 60 * 60


class TaskStateDict(TypedDict):
    """Type definition for task state stored in Redis."""

    status: str
    stage: str
    progress: int
    message: str
    updated_at: int
    version: int  # Optimistic locking version number


class TaskStateService:
    """Task state management service using Redis.

    This service manages task execution state in Redis, providing:
    - Fast state reads for SSE streaming
    - Progress updates during task execution
    - Status transition tracking

    State is stored as a Redis hash with the following fields:
    - status: Current task status (queued, running, complete, etc.)
    - stage: Current execution stage (QUEUED, MSA, MODEL, etc.)
    - progress: Progress percentage (0-100)
    - message: Latest status message
    - updated_at: Last update timestamp (ms)
    """

    def __init__(self, cache: "RedisCache | None" = None):
        """Initialize task state service.

        Args:
            cache: Optional RedisCache instance for dependency injection (testing).
                   If not provided, uses the default singleton cache.
        """
        self._cache = cache if cache is not None else get_redis_cache()

    def _key(self, task_id: str) -> str:
        """Generate Redis key for task state using RedisKeyPrefix."""
        return RedisKeyPrefix.task_state_key(task_id)

    def create_state(
        self,
        task_id: str,
        status: StatusType = StatusType.queued,
        stage: StageType = StageType.QUEUED,
        message: str = "Task queued",
        ttl: int | None = TASK_STATE_TTL,
    ) -> bool:
        """Create initial task state.

        Args:
            task_id: Task ID
            status: Initial status (default: queued)
            stage: Initial stage (default: QUEUED)
            message: Initial message
            ttl: TTL in seconds (default: 24 hours, None for no expiry)

        Returns:
            True if successful
        """
        key = self._key(task_id)
        state = {
            "status": status.value,
            "stage": stage.value,
            "progress": "0",
            "message": message,
            "updated_at": str(get_timestamp_ms()),
            "version": "1",  # Initial version for optimistic locking
        }

        result = self._cache.hset(key, state)

        if result and ttl:
            self._cache.expire(key, ttl)

        logger.info(f"Created task state: {task_id}, status={status.value}")
        return result

    def get_state(self, task_id: str) -> TaskStateDict | None:
        """Get current task state.

        Args:
            task_id: Task ID

        Returns:
            Task state dict or None if not found
        """
        data = self._cache.hgetall(self._key(task_id))
        if not data:
            return None

        return {
            "status": data.get("status", StatusType.queued.value),
            "stage": data.get("stage", StageType.QUEUED.value),
            "progress": int(data.get("progress", 0)),
            "message": data.get("message", ""),
            "updated_at": int(data.get("updated_at", 0)),
            "version": int(data.get("version", 1)),
        }

    def set_state(
        self,
        task_id: str,
        status: StatusType,
        stage: StageType,
        progress: int,
        message: str,
    ) -> bool:
        """Set complete task state.

        Args:
            task_id: Task ID
            status: Task status
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

        result = self._cache.hset(self._key(task_id), state)
        logger.debug(f"Updated task state: {task_id}, status={status.value}, stage={stage.value}, progress={progress}")
        return result

    def update_progress(
        self,
        task_id: str,
        progress: int,
        message: str | None = None,
    ) -> bool:
        """Update task progress.

        Args:
            task_id: Task ID
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

        result = self._cache.hset(self._key(task_id), updates)
        logger.debug(f"Updated task progress: {task_id}, progress={progress}")
        return result

    def update_stage(
        self,
        task_id: str,
        stage: StageType,
        status: StatusType | None = None,
        message: str | None = None,
    ) -> bool:
        """Update task stage.

        Args:
            task_id: Task ID
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

        result = self._cache.hset(self._key(task_id), updates)
        logger.debug(f"Updated task stage: {task_id}, stage={stage.value}")
        return result

    def mark_complete(self, task_id: str, message: str = "Task complete") -> bool:
        """Mark task as complete.

        Args:
            task_id: Task ID
            message: Completion message

        Returns:
            True if successful
        """
        return self.set_state(
            task_id,
            status=StatusType.complete,
            stage=StageType.DONE,
            progress=100,
            message=message,
        )

    def mark_failed(self, task_id: str, message: str = "Task failed") -> bool:
        """Mark task as failed.

        Args:
            task_id: Task ID
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
        result = self._cache.hset(self._key(task_id), updates)
        logger.warning(f"Task marked as failed: {task_id}, message={message}")
        return result

    def mark_canceled(self, task_id: str, message: str = "Task canceled by user") -> bool:
        """Mark task as canceled.

        This method stores the canceled status in Redis, making it visible
        across all application instances in a multi-instance deployment.

        Args:
            task_id: Task ID
            message: Cancellation message

        Returns:
            True if successful
        """
        updates = {
            "status": StatusType.canceled.value,
            "message": message,
            "updated_at": str(get_timestamp_ms()),
        }
        result = self._cache.hset(self._key(task_id), updates)
        logger.info(f"Task marked as canceled: {task_id}")
        return result

    def is_canceled(self, task_id: str) -> bool:
        """Check if task has been canceled.

        This method checks Redis for the canceled status, which is shared
        across all application instances.

        Args:
            task_id: Task ID

        Returns:
            True if task is canceled
        """
        state = self.get_state(task_id)
        if state is None:
            return False
        return state.get("status") == StatusType.canceled.value

    def delete_state(self, task_id: str) -> bool:
        """Delete task state.

        Args:
            task_id: Task ID

        Returns:
            True if deleted
        """
        result = self._cache.delete(self._key(task_id))
        if result:
            logger.info(f"Deleted task state: {task_id}")
        return result

    def exists(self, task_id: str) -> bool:
        """Check if task state exists.

        Args:
            task_id: Task ID

        Returns:
            True if exists
        """
        return self._cache.exists(self._key(task_id))

    def refresh_ttl(self, task_id: str, ttl: int = TASK_STATE_TTL) -> bool:
        """Refresh TTL for task state.

        Args:
            task_id: Task ID
            ttl: New TTL in seconds

        Returns:
            True if successful
        """
        return self._cache.expire(self._key(task_id), ttl)

    # ==================== Optimistic Locking Support ====================

    def set_state_with_version(
        self,
        task_id: str,
        expected_version: int,
        status: StatusType | None = None,
        stage: StageType | None = None,
        progress: int | None = None,
        message: str | None = None,
    ) -> tuple[bool, int]:
        """Update task state with optimistic locking.

        Uses Redis WATCH/MULTI/EXEC to ensure atomic update with version check.
        If the current version doesn't match expected_version, the update fails.

        Args:
            task_id: Task ID
            expected_version: Expected current version number
            status: Optional new status
            stage: Optional new stage
            progress: Optional new progress (0-100)
            message: Optional new message

        Returns:
            Tuple of (success: bool, new_version: int)
            - (True, new_version) if update succeeded
            - (False, current_version) if version mismatch (another instance updated)
            - (False, 0) if task state doesn't exist
        """
        import redis

        key = self._key(task_id)
        client = self._cache.client

        try:
            # Use pipeline with WATCH for optimistic locking
            with client.pipeline() as pipe:
                while True:
                    try:
                        # Watch the key for changes
                        pipe.watch(key)

                        # Get current state (need to use client directly after watch)
                        current = client.hgetall(key)
                        if not current:
                            pipe.unwatch()
                            return (False, 0)

                        # Decode bytes to str if needed (redis-py returns bytes)
                        def decode_val(v: bytes | str) -> str:
                            return v.decode() if isinstance(v, bytes) else v

                        current_version = int(decode_val(current.get(b"version", current.get("version", b"1"))))

                        # Version mismatch - another instance updated
                        if current_version != expected_version:
                            pipe.unwatch()
                            logger.debug(
                                f"Version mismatch for task {task_id}: "
                                f"expected={expected_version}, current={current_version}"
                            )
                            return (False, current_version)

                        # Build updates
                        new_version = current_version + 1
                        updates: dict[str, str] = {
                            "version": str(new_version),
                            "updated_at": str(get_timestamp_ms()),
                        }
                        if status is not None:
                            updates["status"] = status.value
                        if stage is not None:
                            updates["stage"] = stage.value
                        if progress is not None:
                            updates["progress"] = str(min(100, max(0, progress)))
                        if message is not None:
                            updates["message"] = message

                        # Execute atomic update
                        pipe.multi()
                        pipe.hset(key, mapping=updates)
                        pipe.execute()

                        logger.debug(
                            f"Updated task state with version: {task_id}, version={expected_version}->{new_version}"
                        )
                        return (True, new_version)

                    except redis.WatchError:
                        # Key was modified by another client, retry
                        logger.debug(f"WatchError for task {task_id}, retrying optimistic lock")
                        continue

        except redis.RedisError as e:
            logger.error(f"Redis error in set_state_with_version: {e}")
            return (False, 0)

    def get_version(self, task_id: str) -> int:
        """Get current version number for task state.

        Args:
            task_id: Task ID

        Returns:
            Current version number, or 0 if not found
        """
        version = self._cache.client.hget(self._key(task_id), "version")
        if version is None:
            return 0
        return int(version)

    # ==================== Task Metadata (Multi-instance support) ====================

    def _meta_key(self, task_id: str) -> str:
        """Generate Redis key for task metadata using RedisKeyPrefix."""
        return RedisKeyPrefix.task_meta_key(task_id)

    def save_task_meta(
        self,
        task_id: str,
        sequence: str,
        conversation_id: str | None = None,
        ttl: int | None = TASK_STATE_TTL,
    ) -> bool:
        """Save task metadata to Redis for multi-instance access.

        This stores essential task information that needs to be accessible
        across all application instances.

        Args:
            task_id: Task ID
            sequence: Amino acid sequence
            conversation_id: Optional conversation ID
            ttl: TTL in seconds (default: 24 hours)

        Returns:
            True if successful
        """
        key = self._meta_key(task_id)
        meta = {
            "sequence": sequence,
            "conversation_id": conversation_id or "",
            "created_at": str(get_timestamp_ms()),
        }

        result = self._cache.hset(key, meta)

        if result and ttl:
            self._cache.expire(key, ttl)

        logger.debug(f"Saved task metadata: {task_id}")
        return result

    def get_task_meta(self, task_id: str) -> dict | None:
        """Get task metadata from Redis.

        Args:
            task_id: Task ID

        Returns:
            Task metadata dict or None if not found
        """
        data = self._cache.hgetall(self._meta_key(task_id))
        if not data:
            return None

        return {
            "sequence": data.get("sequence", ""),
            "conversation_id": data.get("conversation_id") or None,
            "created_at": int(data.get("created_at", 0)),
        }

    def get_task_sequence(self, task_id: str) -> str | None:
        """Get task sequence from Redis.

        Convenience method for retrieving just the sequence.

        Args:
            task_id: Task ID

        Returns:
            Amino acid sequence or None if not found
        """
        meta = self.get_task_meta(task_id)
        if meta:
            return meta.get("sequence") or None
        return None

    def delete_task_meta(self, task_id: str) -> bool:
        """Delete task metadata from Redis.

        Args:
            task_id: Task ID

        Returns:
            True if deleted
        """
        result = self._cache.delete(self._meta_key(task_id))
        if result:
            logger.debug(f"Deleted task metadata: {task_id}")
        return result

    def task_exists(self, task_id: str) -> bool:
        """Check if task exists in Redis (has state or metadata).

        Args:
            task_id: Task ID

        Returns:
            True if task exists
        """
        return self.exists(task_id) or self._cache.exists(self._meta_key(task_id))

    # ==================== NanoCC Session Tracking ====================
    # Note: These methods keep `job_id` parameter name for backward compatibility
    # with the nanocc external module which calls them directly.

    def _nanocc_key(self, job_id: str) -> str:
        """Generate Redis key for NanoCC session info."""
        return f"chatfold:task:nanocc:{job_id}"

    def save_nanocc_session(
        self,
        job_id: str,
        instance_id: str,
        session_id: str,
        backend_url: str,
        ttl: int | None = TASK_STATE_TTL,
    ) -> bool:
        """Save NanoCC session info for later interrupt.

        This stores the NanoCC instance and session IDs so that the cancel
        endpoint can call interrupt_session when user cancels a task.

        Args:
            job_id: Job ID (nanocc external identifier)
            instance_id: NanoCC instance ID from scheduler
            session_id: NanoCC session ID from backend
            backend_url: NanoCC backend URL (via scheduler proxy)
            ttl: TTL in seconds (default: 24 hours)

        Returns:
            True if successful
        """
        key = self._nanocc_key(job_id)
        data = {
            "instance_id": instance_id,
            "session_id": session_id,
            "backend_url": backend_url,
            "created_at": str(get_timestamp_ms()),
        }

        result = self._cache.hset(key, data)

        if result and ttl:
            self._cache.expire(key, ttl)

        logger.debug(f"Saved NanoCC session: task={job_id}, session={session_id}")
        return result

    def get_nanocc_session(self, job_id: str) -> dict | None:
        """Get NanoCC session info for a task.

        Args:
            job_id: Job ID (nanocc external identifier)

        Returns:
            Dict with instance_id, session_id, backend_url or None if not found
        """
        data = self._cache.hgetall(self._nanocc_key(job_id))
        if not data:
            return None

        return {
            "instance_id": data.get("instance_id", ""),
            "session_id": data.get("session_id", ""),
            "backend_url": data.get("backend_url", ""),
            "created_at": int(data.get("created_at", 0)),
        }

    def delete_nanocc_session(self, job_id: str) -> bool:
        """Delete NanoCC session info.

        Called when task completes or is canceled.

        Args:
            job_id: Job ID (nanocc external identifier)

        Returns:
            True if deleted
        """
        result = self._cache.delete(self._nanocc_key(job_id))
        if result:
            logger.debug(f"Deleted NanoCC session info: {job_id}")
        return result

    # ==================== Backward Compatibility ====================
    # These methods maintain the old `job_` naming for callers that haven't
    # been updated yet. They delegate to the renamed methods.

    def save_job_meta(
        self,
        job_id: str,
        sequence: str,
        conversation_id: str | None = None,
        ttl: int | None = TASK_STATE_TTL,
    ) -> bool:
        """Backward-compatible alias for save_task_meta."""
        return self.save_task_meta(job_id, sequence, conversation_id, ttl)

    def get_job_meta(self, job_id: str) -> dict | None:
        """Backward-compatible alias for get_task_meta."""
        return self.get_task_meta(job_id)

    def get_job_sequence(self, job_id: str) -> str | None:
        """Backward-compatible alias for get_task_sequence."""
        return self.get_task_sequence(job_id)

    def delete_job_meta(self, job_id: str) -> bool:
        """Backward-compatible alias for delete_task_meta."""
        return self.delete_task_meta(job_id)

    def job_exists(self, job_id: str) -> bool:
        """Backward-compatible alias for task_exists."""
        return self.task_exists(job_id)

    # ==================== Orphan Cleanup ====================

    def cleanup_orphan_metadata(
        self,
        max_age_hours: int = 48,
        batch_size: int = 100,
    ) -> tuple[int, int]:
        """Clean up orphan task metadata entries.

        Orphan metadata entries are those where:
        - The task state no longer exists (task completed/cleaned up)
        - The metadata is older than max_age_hours

        This helps prevent slow memory growth from accumulated metadata
        of completed tasks.

        Args:
            max_age_hours: Maximum age in hours for orphan metadata
            batch_size: Number of keys to scan per iteration

        Returns:
            Tuple of (scanned_count, deleted_count)
        """

        client = self._cache.client
        meta_prefix = "chatfold:task:meta:*"
        state_prefix = "chatfold:task:state:"
        max_age_ms = max_age_hours * 60 * 60 * 1000
        current_time_ms = get_timestamp_ms()

        scanned = 0
        deleted = 0
        cursor = 0

        try:
            while True:
                # Scan for metadata keys
                cursor, keys = client.scan(
                    cursor=cursor,
                    match=meta_prefix,
                    count=batch_size,
                )

                for key in keys:
                    scanned += 1
                    # Decode key if bytes
                    key_str = key.decode() if isinstance(key, bytes) else key

                    # Extract task_id from key
                    # Format: chatfold:task:meta:{task_id}
                    task_id = key_str.replace("chatfold:task:meta:", "")

                    # Check if corresponding state exists
                    state_key = f"{state_prefix}{task_id}"
                    if client.exists(state_key):
                        continue  # Task still active, skip

                    # Check metadata age
                    meta = client.hgetall(key)
                    if not meta:
                        continue

                    # Get created_at from metadata
                    created_at_raw = meta.get(b"created_at", meta.get("created_at"))
                    if created_at_raw:
                        created_at = int(
                            created_at_raw.decode() if isinstance(created_at_raw, bytes) else created_at_raw
                        )
                        age_ms = current_time_ms - created_at

                        if age_ms > max_age_ms:
                            # Delete orphan metadata
                            client.delete(key)
                            deleted += 1
                            logger.debug(f"Deleted orphan metadata: {task_id}, age={age_ms / 3600000:.1f}h")

                # Exit when scan complete
                if cursor == 0:
                    break

            if deleted > 0:
                logger.info(f"Orphan cleanup complete: scanned={scanned}, deleted={deleted}")

            return (scanned, deleted)

        except Exception as e:
            logger.error(f"Error during orphan cleanup: {e}")
            return (scanned, deleted)

    def cleanup_stale_task_states(
        self,
        max_age_hours: int = 72,
        terminal_only: bool = True,
        batch_size: int = 100,
    ) -> tuple[int, int]:
        """Clean up stale task state entries.

        Removes task states that:
        - Are older than max_age_hours
        - Are in terminal states (complete, failed, canceled) if terminal_only=True

        Args:
            max_age_hours: Maximum age in hours
            terminal_only: Only delete terminal states (safer)
            batch_size: Number of keys to scan per iteration

        Returns:
            Tuple of (scanned_count, deleted_count)
        """
        client = self._cache.client
        state_prefix = "chatfold:task:state:*"
        max_age_ms = max_age_hours * 60 * 60 * 1000
        current_time_ms = get_timestamp_ms()

        terminal_statuses = {
            StatusType.complete.value,
            StatusType.failed.value,
            StatusType.canceled.value,
        }

        scanned = 0
        deleted = 0
        cursor = 0

        try:
            while True:
                cursor, keys = client.scan(
                    cursor=cursor,
                    match=state_prefix,
                    count=batch_size,
                )

                for key in keys:
                    scanned += 1
                    state = client.hgetall(key)
                    if not state:
                        continue

                    # Check status if terminal_only
                    if terminal_only:
                        status_raw = state.get(b"status", state.get("status"))
                        if status_raw:
                            status = status_raw.decode() if isinstance(status_raw, bytes) else status_raw
                            if status not in terminal_statuses:
                                continue  # Skip non-terminal tasks

                    # Check age
                    updated_at_raw = state.get(b"updated_at", state.get("updated_at"))
                    if updated_at_raw:
                        updated_at = int(
                            updated_at_raw.decode() if isinstance(updated_at_raw, bytes) else updated_at_raw
                        )
                        age_ms = current_time_ms - updated_at

                        if age_ms > max_age_ms:
                            # Extract task_id and delete both state and metadata
                            key_str = key.decode() if isinstance(key, bytes) else key
                            task_id = key_str.replace("chatfold:task:state:", "")

                            # Delete state
                            client.delete(key)
                            # Also delete metadata if exists
                            meta_key = f"chatfold:task:meta:{task_id}"
                            client.delete(meta_key)

                            deleted += 1
                            logger.debug(f"Deleted stale task: {task_id}, age={age_ms / 3600000:.1f}h")

                if cursor == 0:
                    break

            if deleted > 0:
                logger.info(f"Stale task cleanup complete: scanned={scanned}, deleted={deleted}")

            return (scanned, deleted)

        except Exception as e:
            logger.error(f"Error during stale task cleanup: {e}")
            return (scanned, deleted)

    # Backward-compatible alias
    cleanup_stale_job_states = cleanup_stale_task_states


# Singleton instance
task_state_service = TaskStateService()
