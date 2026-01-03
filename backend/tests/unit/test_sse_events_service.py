"""Tests for SSEEventsService.

Test cases from:
- TC-13.2: SSE events Redis queue
- TC-14: Redis Cache unit tests

NOTE: These tests use fakeredis to provide an in-memory Redis implementation,
allowing tests to run without a real Redis server.
"""

import pytest

from app.components.nanocc.job import EventType, JobEvent, StageType, StatusType
from app.db.redis_cache import RedisCache
from app.db.redis_db import RedisDB
from app.services.sse_events import SSEEventsService
from app.utils import get_timestamp_ms


@pytest.fixture
def sse_cache(fake_redis_client) -> RedisCache:
    """Create a RedisCache instance with fakeredis for SSE events."""
    return RedisCache(db=RedisDB.SSE_EVENTS, client=fake_redis_client)


@pytest.fixture
def sse_service(sse_cache: RedisCache) -> SSEEventsService:
    """Create an SSEEventsService with fakeredis."""
    return SSEEventsService(cache=sse_cache)


def create_test_event(
    job_id: str,
    event_num: int,
    stage: StageType = StageType.QUEUED,
    status: StatusType = StatusType.running,
    progress: int = 0,
    message: str = "Test message",
) -> JobEvent:
    """Create a test JobEvent."""
    return JobEvent(
        eventId=f"evt_{job_id}_{event_num:04d}",
        jobId=job_id,
        ts=get_timestamp_ms(),
        eventType=EventType.THINKING_TEXT,
        stage=stage,
        status=status,
        progress=progress,
        message=message,
    )


class TestSSEEventsServiceBasic:
    """TC-13.2: SSE events Redis queue."""

    def test_push_event(self, sse_service: SSEEventsService):
        """Push event to queue."""
        job_id = "test_job_001"
        event = create_test_event(job_id, 1)

        count = sse_service.push_event(event)

        assert count == 1
        assert sse_service.exists(job_id) is True

    def test_push_multiple_events(self, sse_service: SSEEventsService):
        """Push multiple events maintains order."""
        job_id = "test_job_002"

        for i in range(5):
            event = create_test_event(job_id, i + 1, progress=i * 20)
            sse_service.push_event(event)

        count = sse_service.get_events_count(job_id)
        assert count == 5

        events = sse_service.get_events(job_id)
        assert len(events) == 5
        # Events should be in chronological order (oldest first)
        assert events[0].eventId == f"evt_{job_id}_0001"
        assert events[4].eventId == f"evt_{job_id}_0005"

    def test_get_events(self, sse_service: SSEEventsService):
        """Get all events from queue."""
        job_id = "test_job_003"

        for i in range(3):
            event = create_test_event(job_id, i + 1, message=f"Message {i + 1}")
            sse_service.push_event(event)

        events = sse_service.get_events(job_id)

        assert len(events) == 3
        assert all(isinstance(e, JobEvent) for e in events)
        assert events[0].message == "Message 1"
        assert events[2].message == "Message 3"

    def test_get_events_empty(self, sse_service: SSEEventsService):
        """Get events from empty queue returns empty list."""
        events = sse_service.get_events("nonexistent_job_id")

        assert events == []

    def test_get_events_range(self, sse_service: SSEEventsService):
        """Get subset of events using range."""
        job_id = "test_job_004"

        for i in range(10):
            event = create_test_event(job_id, i + 1)
            sse_service.push_event(event)

        # Get first 3 events
        events = sse_service.get_events(job_id, start=0, end=2)
        assert len(events) == 3
        assert events[0].eventId == f"evt_{job_id}_0001"

        # Get last 3 events
        events = sse_service.get_events(job_id, start=-3, end=-1)
        assert len(events) == 3
        assert events[2].eventId == f"evt_{job_id}_0010"


class TestSSEEventsServiceReplay:
    """Test event replay functionality."""

    def test_get_events_from_offset(self, sse_service: SSEEventsService):
        """Get events starting from offset (replay)."""
        job_id = "test_job_005"

        for i in range(10):
            event = create_test_event(job_id, i + 1)
            sse_service.push_event(event)

        # Simulate client has received first 5 events, wants events from offset 5
        events = sse_service.get_events_from_offset(job_id, offset=5)

        assert len(events) == 5
        assert events[0].eventId == f"evt_{job_id}_0006"
        assert events[4].eventId == f"evt_{job_id}_0010"

    def test_get_latest_event(self, sse_service: SSEEventsService):
        """Get the most recent event."""
        job_id = "test_job_006"

        for i in range(5):
            event = create_test_event(job_id, i + 1, progress=i * 25)
            sse_service.push_event(event)

        latest = sse_service.get_latest_event(job_id)

        assert latest is not None
        assert latest.eventId == f"evt_{job_id}_0005"
        assert latest.progress == 100

    def test_get_latest_event_empty(self, sse_service: SSEEventsService):
        """Get latest event from empty queue returns None."""
        latest = sse_service.get_latest_event("nonexistent_job_id")

        assert latest is None


class TestSSEEventsServiceLifecycle:
    """Test event queue lifecycle."""

    def test_delete_events(self, sse_service: SSEEventsService):
        """Delete event queue."""
        job_id = "test_job_007"

        event = create_test_event(job_id, 1)
        sse_service.push_event(event)
        assert sse_service.exists(job_id) is True

        result = sse_service.delete_events(job_id)

        assert result is True
        assert sse_service.exists(job_id) is False
        assert sse_service.get_events_count(job_id) == 0

    def test_exists(self, sse_service: SSEEventsService):
        """Check if event queue exists."""
        job_id = "test_job_008"

        assert sse_service.exists(job_id) is False

        event = create_test_event(job_id, 1)
        sse_service.push_event(event)
        assert sse_service.exists(job_id) is True

        sse_service.delete_events(job_id)
        assert sse_service.exists(job_id) is False


class TestSSEEventsServiceCount:
    """Test event counting."""

    def test_get_events_count(self, sse_service: SSEEventsService):
        """Get count of events in queue."""
        job_id = "test_job_009"

        assert sse_service.get_events_count(job_id) == 0

        for i in range(7):
            event = create_test_event(job_id, i + 1)
            sse_service.push_event(event)

        assert sse_service.get_events_count(job_id) == 7


class TestSSEEventsServiceRaw:
    """Test raw dict operations."""

    def test_push_event_dict(self, sse_service: SSEEventsService):
        """Push raw event dict."""
        job_id = "test_job_010"

        event_data = {
            "eventId": "evt_raw_001",
            "jobId": job_id,
            "ts": get_timestamp_ms(),
            "eventType": "THINKING_TEXT",
            "stage": "QUEUED",
            "status": "running",
            "progress": 0,
            "message": "Raw event",
        }

        count = sse_service.push_event_dict(job_id, event_data)

        assert count == 1
        events = sse_service.get_events(job_id)
        assert len(events) == 1
        assert events[0].eventId == "evt_raw_001"

    def test_get_events_raw(self, sse_service: SSEEventsService):
        """Get raw event data from queue."""
        job_id = "test_job_011"

        event = create_test_event(job_id, 1)
        sse_service.push_event(event)

        raw_events = sse_service.get_events_raw(job_id)

        assert len(raw_events) == 1
        # Raw events are JSON strings or dicts depending on how they were stored
        # The important thing is that the data is retrievable
        raw = raw_events[0]
        if isinstance(raw, str):
            import json

            data = json.loads(raw)
        else:
            data = raw
        assert data["eventId"] == f"evt_{job_id}_0001"
