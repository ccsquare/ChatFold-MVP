"""Tests for SSEEventsService.

Test cases from:
- TC-13.2: SSE events Redis queue
- TC-14: Redis Cache unit tests
"""

import time

from app.components.nanocc.job import EventType, JobEvent, StageType, StatusType
from app.services.sse_events import SSEEventsService
from app.utils import get_timestamp_ms


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

    def test_push_event(self):
        """Push event to queue."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"
        event = create_test_event(job_id, 1)

        count = service.push_event(event)

        assert count == 1
        assert service.exists(job_id) is True

        # Cleanup
        service.delete_events(job_id)

    def test_push_multiple_events(self):
        """Push multiple events maintains order."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        for i in range(5):
            event = create_test_event(job_id, i + 1, progress=i * 20)
            service.push_event(event)

        count = service.get_events_count(job_id)
        assert count == 5

        events = service.get_events(job_id)
        assert len(events) == 5
        # Events should be in chronological order (oldest first)
        assert events[0].eventId == f"evt_{job_id}_0001"
        assert events[4].eventId == f"evt_{job_id}_0005"

        # Cleanup
        service.delete_events(job_id)

    def test_get_events(self):
        """Get all events from queue."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        for i in range(3):
            event = create_test_event(job_id, i + 1, message=f"Message {i + 1}")
            service.push_event(event)

        events = service.get_events(job_id)

        assert len(events) == 3
        assert all(isinstance(e, JobEvent) for e in events)
        assert events[0].message == "Message 1"
        assert events[2].message == "Message 3"

        # Cleanup
        service.delete_events(job_id)

    def test_get_events_empty(self):
        """Get events from empty queue returns empty list."""
        service = SSEEventsService()

        events = service.get_events("nonexistent_job_id")

        assert events == []

    def test_get_events_range(self):
        """Get subset of events using range."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        for i in range(10):
            event = create_test_event(job_id, i + 1)
            service.push_event(event)

        # Get first 3 events
        events = service.get_events(job_id, start=0, end=2)
        assert len(events) == 3
        assert events[0].eventId == f"evt_{job_id}_0001"

        # Get last 3 events
        events = service.get_events(job_id, start=-3, end=-1)
        assert len(events) == 3
        assert events[2].eventId == f"evt_{job_id}_0010"

        # Cleanup
        service.delete_events(job_id)


class TestSSEEventsServiceReplay:
    """Test event replay functionality."""

    def test_get_events_from_offset(self):
        """Get events starting from offset (replay)."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        for i in range(10):
            event = create_test_event(job_id, i + 1)
            service.push_event(event)

        # Simulate client has received first 5 events, wants events from offset 5
        events = service.get_events_from_offset(job_id, offset=5)

        assert len(events) == 5
        assert events[0].eventId == f"evt_{job_id}_0006"
        assert events[4].eventId == f"evt_{job_id}_0010"

        # Cleanup
        service.delete_events(job_id)

    def test_get_latest_event(self):
        """Get the most recent event."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        for i in range(5):
            event = create_test_event(job_id, i + 1, progress=i * 25)
            service.push_event(event)

        latest = service.get_latest_event(job_id)

        assert latest is not None
        assert latest.eventId == f"evt_{job_id}_0005"
        assert latest.progress == 100

        # Cleanup
        service.delete_events(job_id)

    def test_get_latest_event_empty(self):
        """Get latest event from empty queue returns None."""
        service = SSEEventsService()

        latest = service.get_latest_event("nonexistent_job_id")

        assert latest is None


class TestSSEEventsServiceLifecycle:
    """Test event queue lifecycle."""

    def test_delete_events(self):
        """Delete event queue."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        event = create_test_event(job_id, 1)
        service.push_event(event)
        assert service.exists(job_id) is True

        result = service.delete_events(job_id)

        assert result is True
        assert service.exists(job_id) is False
        assert service.get_events_count(job_id) == 0

    def test_exists(self):
        """Check if event queue exists."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        assert service.exists(job_id) is False

        event = create_test_event(job_id, 1)
        service.push_event(event)
        assert service.exists(job_id) is True

        service.delete_events(job_id)
        assert service.exists(job_id) is False


class TestSSEEventsServiceCount:
    """Test event counting."""

    def test_get_events_count(self):
        """Get count of events in queue."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        assert service.get_events_count(job_id) == 0

        for i in range(7):
            event = create_test_event(job_id, i + 1)
            service.push_event(event)

        assert service.get_events_count(job_id) == 7

        # Cleanup
        service.delete_events(job_id)


class TestSSEEventsServiceRaw:
    """Test raw dict operations."""

    def test_push_event_dict(self):
        """Push raw event dict."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

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

        count = service.push_event_dict(job_id, event_data)

        assert count == 1
        events = service.get_events(job_id)
        assert len(events) == 1
        assert events[0].eventId == "evt_raw_001"

        # Cleanup
        service.delete_events(job_id)

    def test_get_events_raw(self):
        """Get raw event data from queue."""
        service = SSEEventsService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        event = create_test_event(job_id, 1)
        service.push_event(event)

        raw_events = service.get_events_raw(job_id)

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

        # Cleanup
        service.delete_events(job_id)
