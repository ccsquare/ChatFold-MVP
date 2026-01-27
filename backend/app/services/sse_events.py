"""SSE events queue service using Redis.

This service provides a high-level interface for managing SSE event queues
in Redis, supporting the three-layer storage architecture where Redis serves
as the event streaming cache.

Architecture (Single DB + Key Prefix Pattern):
- 使用单一 db=0，符合 Redis Cluster 兼容性要求
- 通过 RedisKeyPrefix 生成规范化的 Key
- Key 格式: chatfold:task:events:{task_id}

Key Features:
- Event queue management for SSE streaming
- Efficient event retrieval with pagination
- TTL-based automatic cleanup
- Support for replaying events
- Redis Cluster compatible

Concurrency Safety:
- Uses Redis Pipeline for atomic multi-command operations
- Prevents race conditions in push + expire + trim operations
"""

import json
from typing import TYPE_CHECKING, Any

import redis

from app.components.nanocc.job import JobEvent
from app.db.redis_cache import get_redis_cache
from app.db.redis_db import RedisKeyPrefix
from app.utils import get_logger

if TYPE_CHECKING:
    from app.db.redis_cache import RedisCache

logger = get_logger(__name__)

# Default TTL for SSE events (24 hours)
SSE_EVENTS_TTL = 24 * 60 * 60

# Maximum events to keep per task
MAX_EVENTS_PER_TASK = 1000


class SSEEventsService:
    """SSE events queue service using Redis.

    This service manages SSE event queues in Redis, providing:
    - Event publishing for task progress updates
    - Event retrieval for SSE streaming (with replay support)
    - Automatic cleanup via TTL

    Events are stored as Redis lists with the following characteristics:
    - Events are appended (rpush) for chronological order
    - Clients can retrieve events from any offset (replay)
    - TTL is refreshed on each push
    """

    def __init__(self, cache: "RedisCache | None" = None):
        """Initialize SSE events service.

        Args:
            cache: Optional RedisCache instance for dependency injection (testing).
                   If not provided, uses the default singleton cache.
        """
        self._cache = cache if cache is not None else get_redis_cache()

    def _key(self, task_id: str) -> str:
        """Generate Redis key for task events queue using RedisKeyPrefix."""
        return RedisKeyPrefix.task_events_key(task_id)

    def push_event(self, event: JobEvent, ttl: int = SSE_EVENTS_TTL) -> int:
        """Push an event to the task's event queue.

        Uses Redis Pipeline for atomic operations to ensure:
        - Event is pushed
        - TTL is set/refreshed
        - Queue is trimmed if needed
        All happen atomically, preventing race conditions in multi-instance deployment.

        Args:
            event: JobEvent to push (from nanocc module)
            ttl: TTL in seconds (refreshed on each push)

        Returns:
            Total number of events in the queue after push
        """
        # Note: event.jobId is the nanocc field name (external dependency)
        key = self._key(event.jobId)
        data = event.model_dump_json()

        try:
            # Use pipeline for atomic operations
            pipe = self._cache.client.pipeline()
            pipe.rpush(key, data)
            pipe.expire(key, ttl)
            pipe.llen(key)
            results = pipe.execute()

            # Results: [rpush_result, expire_result, llen_result]
            count = results[2] if len(results) > 2 else results[0]

            # Trim if needed (separate operation, but trimming is idempotent)
            if count > MAX_EVENTS_PER_TASK:
                self._cache.ltrim(key, -MAX_EVENTS_PER_TASK, -1)
                count = MAX_EVENTS_PER_TASK

            logger.debug(f"Pushed event to queue: {event.jobId}, eventId={event.eventId}")
            return count

        except redis.RedisError as e:
            logger.error(f"Failed to push event to queue {event.jobId}: {e}")
            # Fallback to non-pipeline approach
            count = self._cache.rpush(key, data)
            self._cache.expire(key, ttl)
            return count

    def push_event_dict(
        self,
        task_id: str,
        event_data: dict[str, Any],
        ttl: int = SSE_EVENTS_TTL,
    ) -> int:
        """Push a raw event dict to the task's event queue.

        Uses Redis Pipeline for atomic operations.

        Args:
            task_id: Task ID
            event_data: Event data dict
            ttl: TTL in seconds

        Returns:
            Total number of events in the queue
        """
        key = self._key(task_id)

        try:
            # Use pipeline for atomic operations
            pipe = self._cache.client.pipeline()
            pipe.rpush(key, json.dumps(event_data))
            pipe.expire(key, ttl)
            pipe.llen(key)
            results = pipe.execute()

            count = results[2] if len(results) > 2 else results[0]

            # Trim if needed
            if count > MAX_EVENTS_PER_TASK:
                self._cache.ltrim(key, -MAX_EVENTS_PER_TASK, -1)
                count = MAX_EVENTS_PER_TASK

            logger.debug(f"Pushed raw event to queue: {task_id}")
            return count

        except redis.RedisError as e:
            logger.error(f"Failed to push raw event to queue {task_id}: {e}")
            # Fallback
            count = self._cache.rpush(key, event_data)
            self._cache.expire(key, ttl)
            return count

    def get_events(
        self,
        task_id: str,
        start: int = 0,
        end: int = -1,
    ) -> list[JobEvent]:
        """Get events from the queue.

        Args:
            task_id: Task ID
            start: Start index (0-based, inclusive)
            end: End index (inclusive, -1 for last element)

        Returns:
            List of JobEvent objects (from nanocc module)
        """
        key = self._key(task_id)
        raw_events = self._cache.lrange(key, start, end)

        events = []
        for raw in raw_events:
            try:
                if isinstance(raw, str):
                    data = json.loads(raw)
                else:
                    data = raw
                events.append(JobEvent(**data))
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"Failed to parse event: {e}")
                continue

        return events

    def get_events_raw(
        self,
        task_id: str,
        start: int = 0,
        end: int = -1,
    ) -> list[dict[str, Any]]:
        """Get raw event dicts from the queue.

        Args:
            task_id: Task ID
            start: Start index
            end: End index

        Returns:
            List of raw event dicts
        """
        key = self._key(task_id)
        return self._cache.lrange(key, start, end)

    def get_events_from_offset(self, task_id: str, offset: int) -> list[JobEvent]:
        """Get events starting from an offset.

        Useful for SSE replay - client specifies last received event index.

        Args:
            task_id: Task ID
            offset: Start from this index (events before this are skipped)

        Returns:
            List of JobEvent objects from offset to end
        """
        return self.get_events(task_id, start=offset, end=-1)

    def get_events_count(self, task_id: str) -> int:
        """Get the number of events in the queue.

        Args:
            task_id: Task ID

        Returns:
            Number of events
        """
        return self._cache.llen(self._key(task_id))

    def get_latest_event(self, task_id: str) -> JobEvent | None:
        """Get the latest (most recent) event.

        Args:
            task_id: Task ID

        Returns:
            Latest JobEvent or None if queue is empty
        """
        events = self.get_events(task_id, start=-1, end=-1)
        return events[0] if events else None

    def delete_events(self, task_id: str) -> bool:
        """Delete all events for a task.

        Args:
            task_id: Task ID

        Returns:
            True if deleted
        """
        result = self._cache.delete(self._key(task_id))
        if result:
            logger.info(f"Deleted event queue: {task_id}")
        return result

    def exists(self, task_id: str) -> bool:
        """Check if event queue exists.

        Args:
            task_id: Task ID

        Returns:
            True if queue exists
        """
        return self._cache.exists(self._key(task_id))

    def refresh_ttl(self, task_id: str, ttl: int = SSE_EVENTS_TTL) -> bool:
        """Refresh TTL for event queue.

        Args:
            task_id: Task ID
            ttl: New TTL in seconds

        Returns:
            True if successful
        """
        return self._cache.expire(self._key(task_id), ttl)

    def set_completion_ttl(self, task_id: str, ttl: int = SSE_EVENTS_TTL) -> bool:
        """Set shorter TTL after task completion.

        Call this when task completes to allow clients time to retrieve
        final events before cleanup.

        Args:
            task_id: Task ID
            ttl: TTL in seconds (default: 24 hours)

        Returns:
            True if successful
        """
        result = self._cache.expire(self._key(task_id), ttl)
        if result:
            logger.info(f"Set completion TTL for event queue: {task_id}, ttl={ttl}s")
        return result


# Singleton instance
sse_events_service = SSEEventsService()
