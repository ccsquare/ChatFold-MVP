"""Tests for JobStateService.

Test cases from:
- TC-13.1: Job state Redis storage
- TC-14: Redis Cache unit tests

NOTE: These tests use fakeredis to provide an in-memory Redis implementation,
allowing tests to run without a real Redis server.
"""

import time

import pytest

from app.components.nanocc.job import StageType, StatusType
from app.db.redis_cache import RedisCache
from app.db.redis_db import RedisDB
from app.services.job_state import JobStateService


@pytest.fixture
def job_cache(fake_redis_client) -> RedisCache:
    """Create a RedisCache instance with fakeredis for job state."""
    return RedisCache(db=RedisDB.JOB_STATE, client=fake_redis_client)


@pytest.fixture
def job_service(job_cache: RedisCache) -> JobStateService:
    """Create a JobStateService with fakeredis."""
    return JobStateService(cache=job_cache)


class TestJobStateServiceBasic:
    """TC-13.1: Job state Redis storage."""

    def test_create_state(self, job_service: JobStateService):
        """Create initial job state."""
        job_id = "test_job_001"

        result = job_service.create_state(job_id)

        assert result is True
        state = job_service.get_state(job_id)
        assert state is not None
        assert state["status"] == StatusType.queued.value
        assert state["stage"] == StageType.QUEUED.value
        assert state["progress"] == 0

    def test_create_state_with_custom_values(self, job_service: JobStateService):
        """Create job state with custom initial values."""
        job_id = "test_job_002"

        result = job_service.create_state(
            job_id,
            status=StatusType.running,
            stage=StageType.MSA,
            message="Starting MSA",
        )

        assert result is True
        state = job_service.get_state(job_id)
        assert state["status"] == StatusType.running.value
        assert state["stage"] == StageType.MSA.value
        assert state["message"] == "Starting MSA"

    def test_get_state_nonexistent(self, job_service: JobStateService):
        """Get state for non-existent job returns None."""
        state = job_service.get_state("nonexistent_job_id")

        assert state is None

    def test_set_state(self, job_service: JobStateService):
        """Set complete job state."""
        job_id = "test_job_003"
        job_service.create_state(job_id)

        result = job_service.set_state(
            job_id,
            status=StatusType.running,
            stage=StageType.MODEL,
            progress=50,
            message="Generating structure",
        )

        assert result is True
        state = job_service.get_state(job_id)
        assert state["status"] == StatusType.running.value
        assert state["stage"] == StageType.MODEL.value
        assert state["progress"] == 50
        assert state["message"] == "Generating structure"

    def test_update_progress(self, job_service: JobStateService):
        """Update job progress."""
        job_id = "test_job_004"
        job_service.create_state(job_id)

        # Update progress only
        result = job_service.update_progress(job_id, 25)
        assert result is True
        state = job_service.get_state(job_id)
        assert state["progress"] == 25

        # Update progress with message
        result = job_service.update_progress(job_id, 50, "Halfway done")
        assert result is True
        state = job_service.get_state(job_id)
        assert state["progress"] == 50
        assert state["message"] == "Halfway done"

    def test_update_progress_bounds(self, job_service: JobStateService):
        """Progress is clamped to 0-100."""
        job_id = "test_job_005"
        job_service.create_state(job_id)

        # Test upper bound
        job_service.update_progress(job_id, 150)
        state = job_service.get_state(job_id)
        assert state["progress"] == 100

        # Test lower bound
        job_service.update_progress(job_id, -10)
        state = job_service.get_state(job_id)
        assert state["progress"] == 0

    def test_update_stage(self, job_service: JobStateService):
        """Update job stage."""
        job_id = "test_job_006"
        job_service.create_state(job_id)

        # Update stage only
        result = job_service.update_stage(job_id, StageType.MSA)
        assert result is True
        state = job_service.get_state(job_id)
        assert state["stage"] == StageType.MSA.value

        # Update stage with status and message
        result = job_service.update_stage(
            job_id,
            StageType.MODEL,
            status=StatusType.running,
            message="Building model",
        )
        assert result is True
        state = job_service.get_state(job_id)
        assert state["stage"] == StageType.MODEL.value
        assert state["status"] == StatusType.running.value
        assert state["message"] == "Building model"


class TestJobStateServiceLifecycle:
    """Test job lifecycle state transitions."""

    def test_mark_complete(self, job_service: JobStateService):
        """Mark job as complete."""
        job_id = "test_job_007"
        job_service.create_state(job_id)

        result = job_service.mark_complete(job_id, "Job finished successfully")

        assert result is True
        state = job_service.get_state(job_id)
        assert state["status"] == StatusType.complete.value
        assert state["stage"] == StageType.DONE.value
        assert state["progress"] == 100
        assert state["message"] == "Job finished successfully"

    def test_mark_failed(self, job_service: JobStateService):
        """Mark job as failed."""
        job_id = "test_job_008"
        job_service.create_state(job_id)

        result = job_service.mark_failed(job_id, "Sequence too long")

        assert result is True
        state = job_service.get_state(job_id)
        assert state["status"] == StatusType.failed.value
        assert state["stage"] == StageType.ERROR.value
        assert state["message"] == "Sequence too long"

    def test_delete_state(self, job_service: JobStateService):
        """Delete job state."""
        job_id = "test_job_009"
        job_service.create_state(job_id)

        assert job_service.exists(job_id) is True

        result = job_service.delete_state(job_id)

        assert result is True
        assert job_service.exists(job_id) is False
        assert job_service.get_state(job_id) is None

    def test_exists(self, job_service: JobStateService):
        """Check if job state exists."""
        job_id = "test_job_010"

        assert job_service.exists(job_id) is False

        job_service.create_state(job_id)
        assert job_service.exists(job_id) is True

        job_service.delete_state(job_id)
        assert job_service.exists(job_id) is False


class TestJobStateServiceTimestamp:
    """Test timestamp tracking."""

    def test_updated_at_changes(self, job_service: JobStateService):
        """updated_at is updated on each change."""
        job_id = "test_job_011"
        job_service.create_state(job_id)

        state1 = job_service.get_state(job_id)
        time.sleep(0.01)  # Small delay

        job_service.update_progress(job_id, 50)
        state2 = job_service.get_state(job_id)

        assert state2["updated_at"] > state1["updated_at"]
