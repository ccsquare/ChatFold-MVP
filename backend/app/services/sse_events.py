"""SSE events queue service using Redis.

This service provides a high-level interface for managing SSE event queues
in Redis, supporting the three-layer storage architecture where Redis serves
as the event streaming cache.

Key Features:
- Event queue management for SSE streaming
- Efficient event retrieval with pagination
- TTL-based automatic cleanup
- Support for replaying events
"""

import json
from typing import Any

from app.components.nanocc.job import JobEvent
from app.db.redis_cache import get_sse_events_cache
from app.utils import get_logger

logger = get_logger(__name__)

# Default TTL for SSE events (24 hours)
SSE_EVENTS_TTL = 24 * 60 * 60

# Maximum events to keep per job
MAX_EVENTS_PER_JOB = 1000


class SSEEventsService:
    """SSE events queue service using Redis.

    This service manages SSE event queues in Redis, providing:
    - Event publishing for job progress updates
    - Event retrieval for SSE streaming (with replay support)
    - Automatic cleanup via TTL

    Events are stored as Redis lists with the following characteristics:
    - Events are appended (rpush) for chronological order
    - Clients can retrieve events from any offset (replay)
    - TTL is refreshed on each push
    """

    def __init__(self):
        self._cache = get_sse_events_cache()

    def _key(self, job_id: str) -> str:
        """Generate Redis key for job events queue."""
        return f"job:{job_id}:events"

    def push_event(self, event: JobEvent, ttl: int = SSE_EVENTS_TTL) -> int:
        """Push an event to the job's event queue.

        Args:
            event: JobEvent to push
            ttl: TTL in seconds (refreshed on each push)

        Returns:
            Total number of events in the queue after push
        """
        key = self._key(event.jobId)

        # Serialize event to JSON
        data = event.model_dump_json()
        count = self._cache.rpush(key, data)

        # Refresh TTL
        self._cache.expire(key, ttl)

        # Trim to max events if needed
        if count > MAX_EVENTS_PER_JOB:
            self._cache.ltrim(key, -MAX_EVENTS_PER_JOB, -1)
            count = MAX_EVENTS_PER_JOB

        logger.debug(f"Pushed event to queue: {event.jobId}, eventId={event.eventId}")
        return count

    def push_event_dict(
        self,
        job_id: str,
        event_data: dict[str, Any],
        ttl: int = SSE_EVENTS_TTL,
    ) -> int:
        """Push a raw event dict to the job's event queue.

        Useful when you don't have a JobEvent object but need to push events.

        Args:
            job_id: Job ID
            event_data: Event data dict
            ttl: TTL in seconds

        Returns:
            Total number of events in the queue
        """
        key = self._key(job_id)

        # Push event
        count = self._cache.rpush(key, event_data)

        # Refresh TTL
        self._cache.expire(key, ttl)

        # Trim if needed
        if count > MAX_EVENTS_PER_JOB:
            self._cache.ltrim(key, -MAX_EVENTS_PER_JOB, -1)
            count = MAX_EVENTS_PER_JOB

        logger.debug(f"Pushed raw event to queue: {job_id}")
        return count

    def get_events(
        self,
        job_id: str,
        start: int = 0,
        end: int = -1,
    ) -> list[JobEvent]:
        """Get events from the queue.

        Args:
            job_id: Job ID
            start: Start index (0-based, inclusive)
            end: End index (inclusive, -1 for last element)

        Returns:
            List of JobEvent objects
        """
        key = self._key(job_id)
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
        job_id: str,
        start: int = 0,
        end: int = -1,
    ) -> list[dict[str, Any]]:
        """Get raw event dicts from the queue.

        Args:
            job_id: Job ID
            start: Start index
            end: End index

        Returns:
            List of raw event dicts
        """
        key = self._key(job_id)
        return self._cache.lrange(key, start, end)

    def get_events_from_offset(self, job_id: str, offset: int) -> list[JobEvent]:
        """Get events starting from an offset.

        Useful for SSE replay - client specifies last received event index.

        Args:
            job_id: Job ID
            offset: Start from this index (events before this are skipped)

        Returns:
            List of JobEvent objects from offset to end
        """
        return self.get_events(job_id, start=offset, end=-1)

    def get_events_count(self, job_id: str) -> int:
        """Get the number of events in the queue.

        Args:
            job_id: Job ID

        Returns:
            Number of events
        """
        return self._cache.llen(self._key(job_id))

    def get_latest_event(self, job_id: str) -> JobEvent | None:
        """Get the latest (most recent) event.

        Args:
            job_id: Job ID

        Returns:
            Latest JobEvent or None if queue is empty
        """
        events = self.get_events(job_id, start=-1, end=-1)
        return events[0] if events else None

    def delete_events(self, job_id: str) -> bool:
        """Delete all events for a job.

        Args:
            job_id: Job ID

        Returns:
            True if deleted
        """
        result = self._cache.delete(self._key(job_id))
        if result:
            logger.info(f"Deleted event queue: {job_id}")
        return result

    def exists(self, job_id: str) -> bool:
        """Check if event queue exists.

        Args:
            job_id: Job ID

        Returns:
            True if queue exists
        """
        return self._cache.exists(self._key(job_id))

    def refresh_ttl(self, job_id: str, ttl: int = SSE_EVENTS_TTL) -> bool:
        """Refresh TTL for event queue.

        Args:
            job_id: Job ID
            ttl: New TTL in seconds

        Returns:
            True if successful
        """
        return self._cache.expire(self._key(job_id), ttl)

    def set_completion_ttl(self, job_id: str, ttl: int = SSE_EVENTS_TTL) -> bool:
        """Set shorter TTL after job completion.

        Call this when job completes to allow clients time to retrieve
        final events before cleanup.

        Args:
            job_id: Job ID
            ttl: TTL in seconds (default: 24 hours)

        Returns:
            True if successful
        """
        result = self._cache.expire(self._key(job_id), ttl)
        if result:
            logger.info(f"Set completion TTL for event queue: {job_id}, ttl={ttl}s")
        return result


# Singleton instance
sse_events_service = SSEEventsService()
