"""Tests for Jobs API Redis integration.

Test cases for:
- Job state creation in Redis when creating job
- Job state/events endpoints
"""

import time

from fastapi.testclient import TestClient

from app.components.nanocc.job import StageType, StatusType
from app.main import app
from app.services.job_state import job_state_service
from app.services.sse_events import sse_events_service

client = TestClient(app)


def _make_job_id() -> str:
    """Generate a valid job ID for testing."""
    # Format: job_<alphanumeric> (no underscores after job_)
    return f"job_test{int(time.time() * 1000)}"


class TestJobCreationRedisIntegration:
    """Test job creation creates Redis state."""

    def test_create_job_creates_redis_state(self):
        """Creating a job should create corresponding Redis state."""
        response = client.post(
            "/api/v1/jobs",
            json={"sequence": "MVLSPADKTNVKAAWG"},
        )

        assert response.status_code == 200
        data = response.json()
        job_id = data["jobId"]

        # Check Redis state was created
        state = job_state_service.get_state(job_id)
        assert state is not None
        assert state["status"] == StatusType.queued.value
        assert state["stage"] == StageType.QUEUED.value

        # Cleanup
        job_state_service.delete_state(job_id)


class TestJobStateEndpoint:
    """Test GET /jobs/{job_id}/state endpoint."""

    def test_get_job_state_success(self):
        """Get job state returns Redis state."""
        job_id = _make_job_id()

        # Create state in Redis
        job_state_service.create_state(
            job_id,
            status=StatusType.running,
            stage=StageType.MODEL,
            message="Processing",
        )
        job_state_service.update_progress(job_id, 50)

        response = client.get(f"/api/v1/jobs/{job_id}/state")

        assert response.status_code == 200
        data = response.json()
        assert data["jobId"] == job_id
        assert data["state"]["status"] == "running"
        assert data["state"]["stage"] == "MODEL"
        assert data["state"]["progress"] == 50

        # Cleanup
        job_state_service.delete_state(job_id)

    def test_get_job_state_not_found(self):
        """Get non-existent job state returns 404."""
        response = client.get("/api/v1/jobs/job_nonexistent/state")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_job_state_invalid_id(self):
        """Get job state with invalid ID returns 400."""
        response = client.get("/api/v1/jobs/invalid_id/state")

        assert response.status_code == 400
        assert "Invalid job ID" in response.json()["detail"]


class TestJobEventsEndpoint:
    """Test GET /jobs/{job_id}/events endpoint."""

    def test_get_job_events_success(self):
        """Get job events returns events from Redis."""
        from app.components.nanocc.job import EventType, JobEvent
        from app.utils import get_timestamp_ms

        job_id = _make_job_id()

        # Push some events
        for i in range(5):
            event = JobEvent(
                eventId=f"evt_{job_id}_{i + 1:04d}",
                jobId=job_id,
                ts=get_timestamp_ms(),
                eventType=EventType.THINKING_TEXT,
                stage=StageType.MODEL,
                status=StatusType.running,
                progress=i * 20,
                message=f"Step {i + 1}",
            )
            sse_events_service.push_event(event)

        response = client.get(f"/api/v1/jobs/{job_id}/events")

        assert response.status_code == 200
        data = response.json()
        assert data["jobId"] == job_id
        assert data["count"] == 5
        assert data["total"] == 5
        assert len(data["events"]) == 5
        assert data["events"][0]["eventId"] == f"evt_{job_id}_0001"

        # Cleanup
        sse_events_service.delete_events(job_id)

    def test_get_job_events_with_offset(self):
        """Get events with offset for replay."""
        from app.components.nanocc.job import EventType, JobEvent
        from app.utils import get_timestamp_ms

        job_id = _make_job_id()

        # Push 10 events
        for i in range(10):
            event = JobEvent(
                eventId=f"evt_{job_id}_{i + 1:04d}",
                jobId=job_id,
                ts=get_timestamp_ms(),
                eventType=EventType.THINKING_TEXT,
                stage=StageType.MODEL,
                status=StatusType.running,
                progress=i * 10,
                message=f"Step {i + 1}",
            )
            sse_events_service.push_event(event)

        # Get events from offset 5
        response = client.get(f"/api/v1/jobs/{job_id}/events?offset=5&limit=3")

        assert response.status_code == 200
        data = response.json()
        assert data["offset"] == 5
        assert data["count"] == 3
        assert data["total"] == 10
        assert data["events"][0]["eventId"] == f"evt_{job_id}_0006"

        # Cleanup
        sse_events_service.delete_events(job_id)

    def test_get_job_events_empty(self):
        """Get events for non-existent job returns empty list."""
        response = client.get("/api/v1/jobs/job_nonexistent/events")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["events"] == []

    def test_get_job_events_invalid_id(self):
        """Get events with invalid ID returns 400."""
        response = client.get("/api/v1/jobs/invalid_id/events")

        assert response.status_code == 400
        assert "Invalid job ID" in response.json()["detail"]
