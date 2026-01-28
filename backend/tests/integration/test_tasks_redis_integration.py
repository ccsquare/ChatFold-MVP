"""Tests for Tasks API Redis integration.

Test cases for:
- Task state creation in Redis when creating task
- Task state/events endpoints
"""

import time

from fastapi.testclient import TestClient

from app.components.nanocc.job import StageType, StatusType
from app.main import app
from app.services.task_state import task_state_service
from app.services.sse_events import sse_events_service

client = TestClient(app)


def _make_task_id() -> str:
    """Generate a valid task ID for testing."""
    # Format: task_<alphanumeric> (no underscores after task_)
    return f"task_test{int(time.time() * 1000)}"


class TestTaskCreationRedisIntegration:
    """Test task creation creates Redis state."""

    def test_create_task_creates_redis_state(self):
        """Creating a task should create corresponding Redis state."""
        response = client.post(
            "/api/v1/tasks",
            json={"sequence": "MVLSPADKTNVKAAWG"},
        )

        assert response.status_code == 200
        data = response.json()
        task_id = data["taskId"]

        # Check Redis state was created
        state = task_state_service.get_state(task_id)
        assert state is not None
        assert state["status"] == StatusType.queued.value
        assert state["stage"] == StageType.QUEUED.value

        # Cleanup
        task_state_service.delete_state(task_id)


class TestTaskStateEndpoint:
    """Test GET /tasks/{task_id}/state endpoint."""

    def test_get_task_state_success(self):
        """Get task state returns Redis state."""
        task_id = _make_task_id()

        # Create state in Redis
        task_state_service.create_state(
            task_id,
            status=StatusType.running,
            stage=StageType.MODEL,
            message="Processing",
        )
        task_state_service.update_progress(task_id, 50)

        response = client.get(f"/api/v1/tasks/{task_id}/state")

        assert response.status_code == 200
        data = response.json()
        assert data["taskId"] == task_id
        assert data["state"]["status"] == "running"
        assert data["state"]["stage"] == "MODEL"
        assert data["state"]["progress"] == 50

        # Cleanup
        task_state_service.delete_state(task_id)

    def test_get_task_state_not_found(self):
        """Get non-existent task state returns 404."""
        response = client.get("/api/v1/tasks/task_nonexistent/state")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_task_state_invalid_id(self):
        """Get task state with invalid ID returns 400."""
        response = client.get("/api/v1/tasks/invalid_id/state")

        assert response.status_code == 400
        assert "Invalid task ID" in response.json()["detail"]


class TestTaskEventsEndpoint:
    """Test GET /tasks/{task_id}/events endpoint."""

    def test_get_task_events_success(self):
        """Get task events returns events from Redis."""
        from app.components.nanocc.job import EventType, JobEvent
        from app.utils import get_timestamp_ms

        task_id = _make_task_id()

        # Push some events
        for i in range(5):
            event = JobEvent(
                eventId=f"evt_{task_id}_{i + 1:04d}",
                taskId=task_id,
                ts=get_timestamp_ms(),
                eventType=EventType.THINKING_TEXT,
                stage=StageType.MODEL,
                status=StatusType.running,
                progress=i * 20,
                message=f"Step {i + 1}",
            )
            sse_events_service.push_event(event)

        response = client.get(f"/api/v1/tasks/{task_id}/events")

        assert response.status_code == 200
        data = response.json()
        assert data["taskId"] == task_id
        assert data["count"] == 5
        assert data["total"] == 5
        assert len(data["events"]) == 5
        assert data["events"][0]["eventId"] == f"evt_{task_id}_0001"

        # Cleanup
        sse_events_service.delete_events(task_id)

    def test_get_task_events_with_offset(self):
        """Get events with offset for replay."""
        from app.components.nanocc.job import EventType, JobEvent
        from app.utils import get_timestamp_ms

        task_id = _make_task_id()

        # Push 10 events
        for i in range(10):
            event = JobEvent(
                eventId=f"evt_{task_id}_{i + 1:04d}",
                taskId=task_id,
                ts=get_timestamp_ms(),
                eventType=EventType.THINKING_TEXT,
                stage=StageType.MODEL,
                status=StatusType.running,
                progress=i * 10,
                message=f"Step {i + 1}",
            )
            sse_events_service.push_event(event)

        # Get events from offset 5
        response = client.get(f"/api/v1/tasks/{task_id}/events?offset=5&limit=3")

        assert response.status_code == 200
        data = response.json()
        assert data["offset"] == 5
        assert data["count"] == 3
        assert data["total"] == 10
        assert data["events"][0]["eventId"] == f"evt_{task_id}_0006"

        # Cleanup
        sse_events_service.delete_events(task_id)

    def test_get_task_events_empty(self):
        """Get events for non-existent task returns empty list."""
        response = client.get("/api/v1/tasks/task_nonexistent/events")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["events"] == []

    def test_get_task_events_invalid_id(self):
        """Get events with invalid ID returns 400."""
        response = client.get("/api/v1/tasks/invalid_id/events")

        assert response.status_code == 400
        assert "Invalid task ID" in response.json()["detail"]
