"""Integration tests for Redis multi-DB isolation.

Test cases for:
- DB 0 (JOB_STATE) and DB 3 (SSE_EVENTS) are isolated
- Data written to one DB is not visible in another
"""

import time

import pytest

from app.db.redis_cache import RedisCache, RedisDB


def _make_test_key() -> str:
    """Generate a unique test key."""
    return f"test_key_{int(time.time() * 1000)}"


class TestRedisMultiDBIsolation:
    """Test Redis multi-database isolation."""

    @pytest.fixture(autouse=True)
    def setup_caches(self):
        """Set up Redis caches for different DBs."""
        self.job_state_cache = RedisCache(RedisDB.JOB_STATE)
        self.sse_events_cache = RedisCache(RedisDB.SSE_EVENTS)
        yield
        # No cleanup needed - test keys will expire or be deleted

    def test_db_values_are_different(self):
        """Verify DB enum values are different."""
        assert RedisDB.JOB_STATE.value == 0
        assert RedisDB.SSE_EVENTS.value == 3
        assert RedisDB.JOB_STATE.value != RedisDB.SSE_EVENTS.value

    def test_string_isolation(self):
        """Data written to DB 0 is not visible in DB 3."""
        test_key = _make_test_key()
        test_value = "job_state_data"

        # Write to JOB_STATE (DB 0)
        self.job_state_cache.set(test_key, test_value, expire_seconds=60)

        # Verify it exists in DB 0
        assert self.job_state_cache.get(test_key) == test_value

        # Verify it does NOT exist in DB 3
        assert self.sse_events_cache.get(test_key) is None

        # Cleanup
        self.job_state_cache.delete(test_key)

    def test_hash_isolation(self):
        """Hash data is isolated between databases."""
        test_key = _make_test_key()
        # Values may be serialized/deserialized (integers become int)
        test_data = {"status": "running", "progress": 50}

        # Write hash to JOB_STATE (DB 0)
        self.job_state_cache.hset(test_key, test_data)
        self.job_state_cache.expire(test_key, 60)

        # Verify it exists in DB 0
        result = self.job_state_cache.hgetall(test_key)
        assert result is not None
        assert result.get("status") == "running"
        assert result.get("progress") == 50

        # Verify it does NOT exist in DB 3 (returns None or empty)
        result_db3 = self.sse_events_cache.hgetall(test_key)
        assert result_db3 is None or result_db3 == {}

        # Cleanup
        self.job_state_cache.delete(test_key)

    def test_list_isolation(self):
        """List data is isolated between databases."""
        test_key = _make_test_key()
        test_events = ["event1", "event2", "event3"]

        # Write list to SSE_EVENTS (DB 3)
        for event in test_events:
            self.sse_events_cache.rpush(test_key, event)
        self.sse_events_cache.expire(test_key, 60)

        # Verify it exists in DB 3
        result = self.sse_events_cache.lrange(test_key, 0, -1)
        assert result == test_events

        # Verify it does NOT exist in DB 0
        result_db0 = self.job_state_cache.lrange(test_key, 0, -1)
        assert result_db0 == []

        # Cleanup
        self.sse_events_cache.delete(test_key)

    def test_same_key_different_data(self):
        """Same key can have different data in different DBs."""
        test_key = _make_test_key()

        # Write different data to each DB
        self.job_state_cache.set(test_key, "db0_data", expire_seconds=60)
        self.sse_events_cache.set(test_key, "db3_data", expire_seconds=60)

        # Verify each DB has its own data
        assert self.job_state_cache.get(test_key) == "db0_data"
        assert self.sse_events_cache.get(test_key) == "db3_data"

        # Delete from one DB doesn't affect the other
        self.job_state_cache.delete(test_key)
        assert self.job_state_cache.get(test_key) is None
        assert self.sse_events_cache.get(test_key) == "db3_data"

        # Cleanup
        self.sse_events_cache.delete(test_key)

    def test_exists_isolation(self):
        """Exists check is isolated between databases."""
        test_key = _make_test_key()

        # Write to DB 0 only
        self.job_state_cache.set(test_key, "exists_test", expire_seconds=60)

        # Check exists
        assert self.job_state_cache.exists(test_key) is True
        assert self.sse_events_cache.exists(test_key) is False

        # Cleanup
        self.job_state_cache.delete(test_key)

    def test_job_state_uses_db0(self):
        """Verify job state service uses DB 0."""
        from app.services.job_state import job_state_service

        job_id = f"job_test_{int(time.time() * 1000)}"

        # Create job state
        job_state_service.create_state(job_id)

        # Check it exists using direct DB 0 cache
        key = f"job:{job_id}:state"
        result = self.job_state_cache.hgetall(key)
        assert result is not None
        assert result.get("status") == "queued"

        # Check it does NOT exist in DB 3 (returns None or empty)
        result_db3 = self.sse_events_cache.hgetall(key)
        assert result_db3 is None or result_db3 == {}

        # Cleanup
        job_state_service.delete_state(job_id)

    def test_sse_events_uses_db3(self):
        """Verify SSE events service uses DB 3."""
        from app.components.nanocc.job import EventType, JobEvent, StageType, StatusType
        from app.services.sse_events import sse_events_service
        from app.utils import get_timestamp_ms

        job_id = f"job_test_{int(time.time() * 1000)}"

        # Push an event
        event = JobEvent(
            eventId=f"evt_{job_id}_0001",
            jobId=job_id,
            ts=get_timestamp_ms(),
            eventType=EventType.THINKING_TEXT,
            stage=StageType.MODEL,
            status=StatusType.running,
            progress=50,
            message="Test event",
        )
        sse_events_service.push_event(event)

        # Check it exists using direct DB 3 cache
        key = f"job:{job_id}:events"
        result = self.sse_events_cache.lrange(key, 0, -1)
        assert len(result) == 1

        # Check it does NOT exist in DB 0
        result_db0 = self.job_state_cache.lrange(key, 0, -1)
        assert result_db0 == []

        # Cleanup
        sse_events_service.delete_events(job_id)
