"""Tests for TaskStateService.

Test cases from:
- TC-13.1: Task state Redis storage
- TC-14: Redis Cache unit tests

NOTE: These tests use fakeredis to provide an in-memory Redis implementation,
allowing tests to run without a real Redis server.
"""

import time

import pytest

from app.components.nanocc.job import StageType, StatusType
from app.db.redis_cache import RedisCache
from app.db.redis_db import RedisDB
from app.services.task_state import TaskStateService


@pytest.fixture
def task_cache(fake_redis_client) -> RedisCache:
    """Create a RedisCache instance with fakeredis for task state."""
    return RedisCache(db=RedisDB.TASK_STATE, client=fake_redis_client)


@pytest.fixture
def task_service(task_cache: RedisCache) -> TaskStateService:
    """Create a TaskStateService with fakeredis."""
    return TaskStateService(cache=task_cache)


class TestTaskStateServiceBasic:
    """TC-13.1: Task state Redis storage."""

    def test_create_state(self, task_service: TaskStateService):
        """Create initial task state."""
        task_id = "test_task_001"

        result = task_service.create_state(task_id)

        assert result is True
        state = task_service.get_state(task_id)
        assert state is not None
        assert state["status"] == StatusType.queued.value
        assert state["stage"] == StageType.QUEUED.value
        assert state["progress"] == 0

    def test_create_state_with_custom_values(self, task_service: TaskStateService):
        """Create task state with custom initial values."""
        task_id = "test_task_002"

        result = task_service.create_state(
            task_id,
            status=StatusType.running,
            stage=StageType.MSA,
            message="Starting MSA",
        )

        assert result is True
        state = task_service.get_state(task_id)
        assert state["status"] == StatusType.running.value
        assert state["stage"] == StageType.MSA.value
        assert state["message"] == "Starting MSA"

    def test_get_state_nonexistent(self, task_service: TaskStateService):
        """Get state for non-existent task returns None."""
        state = task_service.get_state("nonexistent_task_id")

        assert state is None

    def test_set_state(self, task_service: TaskStateService):
        """Set complete task state."""
        task_id = "test_task_003"
        task_service.create_state(task_id)

        result = task_service.set_state(
            task_id,
            status=StatusType.running,
            stage=StageType.MODEL,
            progress=50,
            message="Generating structure",
        )

        assert result is True
        state = task_service.get_state(task_id)
        assert state["status"] == StatusType.running.value
        assert state["stage"] == StageType.MODEL.value
        assert state["progress"] == 50
        assert state["message"] == "Generating structure"

    def test_update_progress(self, task_service: TaskStateService):
        """Update task progress."""
        task_id = "test_task_004"
        task_service.create_state(task_id)

        # Update progress only
        result = task_service.update_progress(task_id, 25)
        assert result is True
        state = task_service.get_state(task_id)
        assert state["progress"] == 25

        # Update progress with message
        result = task_service.update_progress(task_id, 50, "Halfway done")
        assert result is True
        state = task_service.get_state(task_id)
        assert state["progress"] == 50
        assert state["message"] == "Halfway done"

    def test_update_progress_bounds(self, task_service: TaskStateService):
        """Progress is clamped to 0-100."""
        task_id = "test_task_005"
        task_service.create_state(task_id)

        # Test upper bound
        task_service.update_progress(task_id, 150)
        state = task_service.get_state(task_id)
        assert state["progress"] == 100

        # Test lower bound
        task_service.update_progress(task_id, -10)
        state = task_service.get_state(task_id)
        assert state["progress"] == 0

    def test_update_stage(self, task_service: TaskStateService):
        """Update task stage."""
        task_id = "test_task_006"
        task_service.create_state(task_id)

        # Update stage only
        result = task_service.update_stage(task_id, StageType.MSA)
        assert result is True
        state = task_service.get_state(task_id)
        assert state["stage"] == StageType.MSA.value

        # Update stage with status and message
        result = task_service.update_stage(
            task_id,
            StageType.MODEL,
            status=StatusType.running,
            message="Building model",
        )
        assert result is True
        state = task_service.get_state(task_id)
        assert state["stage"] == StageType.MODEL.value
        assert state["status"] == StatusType.running.value
        assert state["message"] == "Building model"


class TestTaskStateServiceLifecycle:
    """Test task lifecycle state transitions."""

    def test_mark_complete(self, task_service: TaskStateService):
        """Mark task as complete."""
        task_id = "test_task_007"
        task_service.create_state(task_id)

        result = task_service.mark_complete(task_id, "Task finished successfully")

        assert result is True
        state = task_service.get_state(task_id)
        assert state["status"] == StatusType.complete.value
        assert state["stage"] == StageType.DONE.value
        assert state["progress"] == 100
        assert state["message"] == "Task finished successfully"

    def test_mark_failed(self, task_service: TaskStateService):
        """Mark task as failed."""
        task_id = "test_task_008"
        task_service.create_state(task_id)

        result = task_service.mark_failed(task_id, "Sequence too long")

        assert result is True
        state = task_service.get_state(task_id)
        assert state["status"] == StatusType.failed.value
        assert state["stage"] == StageType.ERROR.value
        assert state["message"] == "Sequence too long"

    def test_delete_state(self, task_service: TaskStateService):
        """Delete task state."""
        task_id = "test_task_009"
        task_service.create_state(task_id)

        assert task_service.exists(task_id) is True

        result = task_service.delete_state(task_id)

        assert result is True
        assert task_service.exists(task_id) is False
        assert task_service.get_state(task_id) is None

    def test_exists(self, task_service: TaskStateService):
        """Check if task state exists."""
        task_id = "test_task_010"

        assert task_service.exists(task_id) is False

        task_service.create_state(task_id)
        assert task_service.exists(task_id) is True

        task_service.delete_state(task_id)
        assert task_service.exists(task_id) is False


class TestTaskStateServiceTimestamp:
    """Test timestamp tracking."""

    def test_updated_at_changes(self, task_service: TaskStateService):
        """updated_at is updated on each change."""
        task_id = "test_task_011"
        task_service.create_state(task_id)

        state1 = task_service.get_state(task_id)
        time.sleep(0.01)  # Small delay

        task_service.update_progress(task_id, 50)
        state2 = task_service.get_state(task_id)

        assert state2["updated_at"] > state1["updated_at"]
