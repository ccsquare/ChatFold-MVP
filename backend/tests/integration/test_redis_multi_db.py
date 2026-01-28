"""Integration tests for Redis Key Prefix isolation.

Architecture: Single DB + Key Prefix Pattern
- All data uses db=0 (Redis Cluster compatible)
- Key prefixes provide namespace isolation
- Pattern: chatfold:{domain}:{type}:{id}

Test cases for:
- Key prefix isolation between different domains
- Task state and SSE events use correct prefixes
- Services correctly generate namespaced keys
"""

import time

import pytest

from app.db.redis_cache import RedisCache, get_redis_cache
from app.db.redis_db import RedisDB, RedisKeyPrefix


def _make_test_id() -> str:
    """Generate a unique test ID."""
    return f"test_{int(time.time() * 1000)}"


class TestRedisKeyPrefixArchitecture:
    """Test Redis single DB + key prefix architecture."""

    @pytest.fixture(autouse=True)
    def setup_cache(self):
        """Set up Redis cache (single instance for all operations)."""
        self.cache = get_redis_cache()
        yield
        # No cleanup needed - test keys will expire or be deleted

    def test_all_db_values_are_zero(self):
        """Verify all RedisDB enum values map to db=0 (Cluster compatible)."""
        assert RedisDB.DEFAULT.value == 0
        assert RedisDB.TASK_STATE.value == 0
        assert RedisDB.SSE_EVENTS.value == 0
        assert RedisDB.WORKSPACE.value == 0
        # All values should be 0 for Redis Cluster compatibility
        for db in RedisDB:
            assert db.value == 0, f"RedisDB.{db.name} should be 0, got {db.value}"

    def test_cache_uses_single_db(self):
        """Verify RedisCache uses db=0 regardless of constructor argument."""
        cache_with_old_enum = RedisCache(db=RedisDB.SSE_EVENTS)
        assert cache_with_old_enum.db == 0

        cache_with_default = RedisCache()
        assert cache_with_default.db == 0

    def test_key_prefix_format(self):
        """Verify key prefix format follows the pattern."""
        task_id = "task_abc123"
        folder_id = "folder_xyz789"

        # Task related keys
        assert RedisKeyPrefix.task_state_key(task_id) == "chatfold:task:state:task_abc123"
        assert RedisKeyPrefix.task_meta_key(task_id) == "chatfold:task:meta:task_abc123"
        assert RedisKeyPrefix.task_events_key(task_id) == "chatfold:task:events:task_abc123"

        # Workspace related keys
        assert RedisKeyPrefix.folder_key(folder_id) == "chatfold:workspace:folder:folder_xyz789"
        assert RedisKeyPrefix.folder_index_key() == "chatfold:workspace:index:folders"


class TestRedisKeyPrefixIsolation:
    """Test isolation via key prefixes instead of multiple DBs."""

    @pytest.fixture(autouse=True)
    def setup_cache(self):
        """Set up Redis cache."""
        self.cache = get_redis_cache()
        self.test_id = _make_test_id()
        yield
        # Cleanup test keys
        self.cache.delete(RedisKeyPrefix.task_state_key(self.test_id))
        self.cache.delete(RedisKeyPrefix.task_events_key(self.test_id))
        self.cache.delete(RedisKeyPrefix.folder_key(self.test_id))

    def test_task_state_isolation(self):
        """Task state and task events use different key prefixes."""
        # Write to task state prefix
        state_key = RedisKeyPrefix.task_state_key(self.test_id)
        self.cache.hset(state_key, {"status": "running", "progress": 50})
        self.cache.expire(state_key, 60)

        # Write to task events prefix
        events_key = RedisKeyPrefix.task_events_key(self.test_id)
        self.cache.rpush(events_key, {"eventId": "evt_1", "message": "test"})
        self.cache.expire(events_key, 60)

        # Verify data is isolated by prefix
        state_result = self.cache.hgetall(state_key)
        assert state_result is not None
        assert state_result.get("status") == "running"

        events_result = self.cache.lrange(events_key, 0, -1)
        assert len(events_result) == 1
        assert events_result[0]["eventId"] == "evt_1"

        # Verify keys don't cross-pollute
        # Trying to read state key as list should return empty
        assert self.cache.lrange(state_key, 0, -1) == []
        # Trying to read events key as hash should return None
        assert self.cache.hgetall(events_key) is None

    def test_workspace_isolation(self):
        """Workspace entities use different key prefixes."""
        folder_key = RedisKeyPrefix.folder_key(self.test_id)
        user_key = RedisKeyPrefix.user_key(self.test_id)

        # Write different data
        self.cache.set(folder_key, {"id": self.test_id, "name": "Test Folder"}, expire_seconds=60)
        self.cache.set(user_key, {"id": self.test_id, "name": "Test User"}, expire_seconds=60)

        # Verify isolation
        folder_data = self.cache.get(folder_key)
        user_data = self.cache.get(user_key)

        assert folder_data["name"] == "Test Folder"
        assert user_data["name"] == "Test User"

        # Cleanup
        self.cache.delete(folder_key)
        self.cache.delete(user_key)


class TestServiceKeyPrefixUsage:
    """Test that services correctly use key prefixes."""

    @pytest.fixture(autouse=True)
    def setup_cache(self):
        """Set up Redis cache."""
        self.cache = get_redis_cache()
        yield

    def test_task_state_service_uses_correct_prefix(self):
        """Verify task state service uses chatfold:task:state prefix."""
        from app.services.task_state import task_state_service

        task_id = f"task_{_make_test_id()}"

        # Create task state
        task_state_service.create_state(task_id)

        # Verify it uses the correct key prefix
        expected_key = RedisKeyPrefix.task_state_key(task_id)
        result = self.cache.hgetall(expected_key)

        assert result is not None
        assert result.get("status") == "queued"

        # Cleanup
        task_state_service.delete_state(task_id)

    def test_sse_events_service_uses_correct_prefix(self):
        """Verify SSE events service uses chatfold:task:events prefix."""
        from app.components.nanocc.job import EventType, JobEvent, StageType, StatusType
        from app.services.sse_events import sse_events_service
        from app.utils import get_timestamp_ms

        task_id = f"task_{_make_test_id()}"

        # Push an event
        event = JobEvent(
            eventId=f"evt_{task_id}_0001",
            taskId=task_id,
            ts=get_timestamp_ms(),
            eventType=EventType.THINKING_TEXT,
            stage=StageType.MODEL,
            status=StatusType.running,
            progress=50,
            message="Test event",
        )
        sse_events_service.push_event(event)

        # Verify it uses the correct key prefix
        expected_key = RedisKeyPrefix.task_events_key(task_id)
        result = self.cache.lrange(expected_key, 0, -1)

        assert len(result) == 1

        # Cleanup
        sse_events_service.delete_events(task_id)

    def test_task_meta_uses_correct_prefix(self):
        """Verify task meta uses chatfold:task:meta prefix."""
        from app.services.task_state import task_state_service

        task_id = f"task_{_make_test_id()}"
        sequence = "MKTVRQERLKSIVRILERSKEPVSGAQLAEELSVSRQVIVQDIAYLRSLGYNIVATPRGYVLAGG"

        # Save task meta
        task_state_service.save_job_meta(task_id, sequence=sequence)

        # Verify it uses the correct key prefix
        expected_key = RedisKeyPrefix.task_meta_key(task_id)
        result = self.cache.hgetall(expected_key)

        assert result is not None
        assert result.get("sequence") == sequence

        # Cleanup
        task_state_service.delete_job_meta(task_id)


class TestRedisClusterCompatibility:
    """Test Redis Cluster compatibility features."""

    def test_single_db_requirement(self):
        """Verify all operations use db=0 for Cluster compatibility."""
        cache = get_redis_cache()
        assert cache.db == 0, "Redis cache must use db=0 for Cluster compatibility"

    def test_key_prefixes_enable_cluster_sharding(self):
        """Verify key prefix pattern enables proper Cluster sharding.

        In Redis Cluster, keys are sharded based on their hash slot.
        By using consistent prefixes (chatfold:...), we enable predictable
        key distribution across cluster nodes.
        """
        # All ChatFold keys start with the same prefix
        keys = [
            RedisKeyPrefix.task_state_key("task_1"),
            RedisKeyPrefix.task_events_key("task_1"),
            RedisKeyPrefix.folder_key("folder_1"),
        ]

        for key in keys:
            assert key.startswith("chatfold:"), f"Key {key} should start with 'chatfold:'"
