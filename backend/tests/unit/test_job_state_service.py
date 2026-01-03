"""Tests for JobStateService.

Test cases from:
- TC-13.1: Job state Redis storage
- TC-14: Redis Cache unit tests
"""

import time

from app.components.nanocc.job import StageType, StatusType
from app.services.job_state import JobStateService


class TestJobStateServiceBasic:
    """TC-13.1: Job state Redis storage."""

    def test_create_state(self):
        """Create initial job state."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        result = service.create_state(job_id)

        assert result is True
        state = service.get_state(job_id)
        assert state is not None
        assert state["status"] == StatusType.queued.value
        assert state["stage"] == StageType.QUEUED.value
        assert state["progress"] == 0

        # Cleanup
        service.delete_state(job_id)

    def test_create_state_with_custom_values(self):
        """Create job state with custom initial values."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        result = service.create_state(
            job_id,
            status=StatusType.running,
            stage=StageType.MSA,
            message="Starting MSA",
        )

        assert result is True
        state = service.get_state(job_id)
        assert state["status"] == StatusType.running.value
        assert state["stage"] == StageType.MSA.value
        assert state["message"] == "Starting MSA"

        # Cleanup
        service.delete_state(job_id)

    def test_get_state_nonexistent(self):
        """Get state for non-existent job returns None."""
        service = JobStateService()

        state = service.get_state("nonexistent_job_id")

        assert state is None

    def test_set_state(self):
        """Set complete job state."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"
        service.create_state(job_id)

        result = service.set_state(
            job_id,
            status=StatusType.running,
            stage=StageType.MODEL,
            progress=50,
            message="Generating structure",
        )

        assert result is True
        state = service.get_state(job_id)
        assert state["status"] == StatusType.running.value
        assert state["stage"] == StageType.MODEL.value
        assert state["progress"] == 50
        assert state["message"] == "Generating structure"

        # Cleanup
        service.delete_state(job_id)

    def test_update_progress(self):
        """Update job progress."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"
        service.create_state(job_id)

        # Update progress only
        result = service.update_progress(job_id, 25)
        assert result is True
        state = service.get_state(job_id)
        assert state["progress"] == 25

        # Update progress with message
        result = service.update_progress(job_id, 50, "Halfway done")
        assert result is True
        state = service.get_state(job_id)
        assert state["progress"] == 50
        assert state["message"] == "Halfway done"

        # Cleanup
        service.delete_state(job_id)

    def test_update_progress_bounds(self):
        """Progress is clamped to 0-100."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"
        service.create_state(job_id)

        # Test upper bound
        service.update_progress(job_id, 150)
        state = service.get_state(job_id)
        assert state["progress"] == 100

        # Test lower bound
        service.update_progress(job_id, -10)
        state = service.get_state(job_id)
        assert state["progress"] == 0

        # Cleanup
        service.delete_state(job_id)

    def test_update_stage(self):
        """Update job stage."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"
        service.create_state(job_id)

        # Update stage only
        result = service.update_stage(job_id, StageType.MSA)
        assert result is True
        state = service.get_state(job_id)
        assert state["stage"] == StageType.MSA.value

        # Update stage with status and message
        result = service.update_stage(
            job_id,
            StageType.MODEL,
            status=StatusType.running,
            message="Building model",
        )
        assert result is True
        state = service.get_state(job_id)
        assert state["stage"] == StageType.MODEL.value
        assert state["status"] == StatusType.running.value
        assert state["message"] == "Building model"

        # Cleanup
        service.delete_state(job_id)


class TestJobStateServiceLifecycle:
    """Test job lifecycle state transitions."""

    def test_mark_complete(self):
        """Mark job as complete."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"
        service.create_state(job_id)

        result = service.mark_complete(job_id, "Job finished successfully")

        assert result is True
        state = service.get_state(job_id)
        assert state["status"] == StatusType.complete.value
        assert state["stage"] == StageType.DONE.value
        assert state["progress"] == 100
        assert state["message"] == "Job finished successfully"

        # Cleanup
        service.delete_state(job_id)

    def test_mark_failed(self):
        """Mark job as failed."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"
        service.create_state(job_id)

        result = service.mark_failed(job_id, "Sequence too long")

        assert result is True
        state = service.get_state(job_id)
        assert state["status"] == StatusType.failed.value
        assert state["stage"] == StageType.ERROR.value
        assert state["message"] == "Sequence too long"

        # Cleanup
        service.delete_state(job_id)

    def test_delete_state(self):
        """Delete job state."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"
        service.create_state(job_id)

        assert service.exists(job_id) is True

        result = service.delete_state(job_id)

        assert result is True
        assert service.exists(job_id) is False
        assert service.get_state(job_id) is None

    def test_exists(self):
        """Check if job state exists."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"

        assert service.exists(job_id) is False

        service.create_state(job_id)
        assert service.exists(job_id) is True

        service.delete_state(job_id)
        assert service.exists(job_id) is False


class TestJobStateServiceTimestamp:
    """Test timestamp tracking."""

    def test_updated_at_changes(self):
        """updated_at is updated on each change."""
        service = JobStateService()
        job_id = f"test_job_{int(time.time() * 1000)}"
        service.create_state(job_id)

        state1 = service.get_state(job_id)
        time.sleep(0.01)  # Small delay

        service.update_progress(job_id, 50)
        state2 = service.get_state(job_id)

        assert state2["updated_at"] > state1["updated_at"]

        # Cleanup
        service.delete_state(job_id)
