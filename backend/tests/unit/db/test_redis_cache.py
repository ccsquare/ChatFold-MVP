#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Unit tests for Redis cache module

Tests cover:
- RedisCache basic operations (string, hash, list)
- Job state cache operations
- SSE events cache operations
- Singleton instance management
"""

import pytest
from app.db.redis_db import RedisDB
from app.db.redis_cache import RedisCache, get_job_state_cache, get_sse_events_cache


class TestRedisDB:
    """Test suite for RedisDB enum"""

    def test_redis_db_values(self):
        """Test that RedisDB enum has correct values"""
        assert RedisDB.JOB_STATE == 0
        assert RedisDB.SESSION_STORE == 1
        assert RedisDB.RATE_LIMITER == 2
        assert RedisDB.SSE_EVENTS == 3
        assert RedisDB.FILE_CACHE == 4
        assert RedisDB.STRUCTURE_CACHE == 5
        assert RedisDB.TEMP_DATA == 14
        assert RedisDB.TEST == 15

    def test_redis_db_descriptions(self):
        """Test that all RedisDB values have valid descriptions"""
        for db in RedisDB:
            assert isinstance(db.value, int)
            assert 0 <= db.value <= 15

    def test_get_description(self):
        """Test RedisDB.get_description method"""
        # Descriptions are in Chinese
        assert "状态" in RedisDB.get_description(RedisDB.JOB_STATE)
        assert "测试" in RedisDB.get_description(RedisDB.TEST)


class TestRedisCacheConnection:
    """Test Redis connection and basic operations"""

    @pytest.fixture
    def test_cache(self) -> RedisCache:
        """Create a test cache instance using TEST database"""
        return RedisCache(db=RedisDB.TEST)

    def test_ping(self, test_cache: RedisCache):
        """Test Redis connection via ping"""
        assert test_cache.ping() is True

    def test_string_operations(self, test_cache: RedisCache):
        """Test string set/get/delete operations"""
        key = "test:string_key"
        value = {"name": "test", "count": 42}

        # Set
        result = test_cache.set(key, value)
        assert result is True

        # Get
        result = test_cache.get(key)
        assert result == value

        # Delete
        deleted = test_cache.delete(key)
        assert deleted is True

        # Verify deleted
        result = test_cache.get(key)
        assert result is None

    def test_string_with_ttl(self, test_cache: RedisCache):
        """Test string set with TTL"""
        key = "test:ttl_key"
        value = "test_value"

        test_cache.set(key, value, expire_seconds=60)
        result = test_cache.get(key)
        assert result == value

        # Check TTL is set
        ttl = test_cache.ttl(key)
        assert ttl > 0
        assert ttl <= 60

        # Cleanup
        test_cache.delete(key)

    def test_hash_operations(self, test_cache: RedisCache):
        """Test hash set/get/getall operations"""
        key = "test:hash_key"
        mapping = {
            "field1": "value1",
            "field2": "value2",
            "count": 42,
        }

        # Set hash
        result = test_cache.hset(key, mapping)
        assert result is True

        # Get individual field
        result = test_cache.hget(key, "field1")
        assert result == "value1"

        # Get numeric field (should be deserialized)
        result = test_cache.hget(key, "count")
        assert result == 42

        # Get all fields
        all_fields = test_cache.hgetall(key)
        assert all_fields["field1"] == "value1"
        assert all_fields["field2"] == "value2"
        assert all_fields["count"] == 42

        # Cleanup
        test_cache.delete(key)

    def test_list_operations(self, test_cache: RedisCache):
        """Test list push/range operations"""
        key = "test:list_key"
        values = [{"id": 1}, {"id": 2}, {"id": 3}]

        # Left push (items will be in reverse order)
        for v in values:
            test_cache.lpush(key, v)

        # Get range (all items)
        result = test_cache.lrange(key, 0, -1)
        assert len(result) == 3
        # Verify reverse order (lpush adds to front)
        assert result[0] == {"id": 3}
        assert result[2] == {"id": 1}

        # Cleanup
        test_cache.delete(key)

    def test_list_rpush(self, test_cache: RedisCache):
        """Test list right push"""
        key = "test:list_rpush"
        values = [{"id": 1}, {"id": 2}, {"id": 3}]

        # Right push (items will be in original order)
        for v in values:
            test_cache.rpush(key, v)

        result = test_cache.lrange(key, 0, -1)
        assert result == values

        # Cleanup
        test_cache.delete(key)

    def test_exists(self, test_cache: RedisCache):
        """Test key exists check"""
        key = "test:exists_key"

        assert test_cache.exists(key) is False

        test_cache.set(key, "value")
        assert test_cache.exists(key) is True

        test_cache.delete(key)
        assert test_cache.exists(key) is False

    def test_expire(self, test_cache: RedisCache):
        """Test setting expiration on existing key"""
        key = "test:expire_key"
        test_cache.set(key, "value")

        result = test_cache.expire(key, 60)
        assert result is True

        ttl = test_cache.ttl(key)
        assert ttl > 0

        # Cleanup
        test_cache.delete(key)

    def test_llen(self, test_cache: RedisCache):
        """Test list length"""
        key = "test:llen_key"

        assert test_cache.llen(key) == 0

        test_cache.rpush(key, "a", "b", "c")
        assert test_cache.llen(key) == 3

        # Cleanup
        test_cache.delete(key)

    def test_ltrim(self, test_cache: RedisCache):
        """Test list trim"""
        key = "test:ltrim_key"
        test_cache.rpush(key, "a", "b", "c", "d", "e")

        # Keep only first 3 elements
        result = test_cache.ltrim(key, 0, 2)
        assert result is True
        assert test_cache.llen(key) == 3
        assert test_cache.lrange(key, 0, -1) == ["a", "b", "c"]

        # Cleanup
        test_cache.delete(key)


class TestJobStateCache:
    """Test job state cache operations"""

    @pytest.fixture
    def job_cache(self) -> RedisCache:
        """Get job state cache instance"""
        return get_job_state_cache()

    def test_singleton_instance(self):
        """Test that get_job_state_cache returns singleton"""
        cache1 = get_job_state_cache()
        cache2 = get_job_state_cache()
        assert cache1 is cache2

    def test_job_state_storage(
        self,
        job_cache: RedisCache,
        test_job_id: str,
        sample_job_state: dict,
    ):
        """Test storing and retrieving job state"""
        key = f"job:{test_job_id}:state"

        # Store job state as hash
        job_cache.hset(key, sample_job_state)

        # Retrieve and verify
        result = job_cache.hgetall(key)
        assert result["status"] == sample_job_state["status"]
        assert result["stage"] == sample_job_state["stage"]
        assert result["progress"] == sample_job_state["progress"]
        assert result["message"] == sample_job_state["message"]

        # Cleanup
        job_cache.delete(key)

    def test_job_state_update(
        self,
        job_cache: RedisCache,
        test_job_id: str,
    ):
        """Test updating individual job state fields"""
        key = f"job:{test_job_id}:state"

        # Initial state
        job_cache.hset(key, {"status": "queued", "progress": 0})

        # Update
        job_cache.hset(key, {"status": "running", "progress": 50})

        # Verify
        assert job_cache.hget(key, "status") == "running"
        assert job_cache.hget(key, "progress") == 50

        # Cleanup
        job_cache.delete(key)


class TestSSEEventsCache:
    """Test SSE events cache operations"""

    @pytest.fixture
    def events_cache(self) -> RedisCache:
        """Get SSE events cache instance"""
        return get_sse_events_cache()

    def test_singleton_instance(self):
        """Test that get_sse_events_cache returns singleton"""
        cache1 = get_sse_events_cache()
        cache2 = get_sse_events_cache()
        assert cache1 is cache2

    def test_different_instances(self):
        """Test that job and SSE caches are different instances"""
        job_cache = get_job_state_cache()
        events_cache = get_sse_events_cache()
        assert job_cache is not events_cache

    def test_sse_events_queue(
        self,
        events_cache: RedisCache,
        test_job_id: str,
    ):
        """Test SSE events queue operations"""
        key = f"job:{test_job_id}:events"

        events = [
            {"eventId": "evt_1", "stage": "MSA", "progress": 20},
            {"eventId": "evt_2", "stage": "MODEL", "progress": 45},
            {"eventId": "evt_3", "stage": "RELAX", "progress": 70},
        ]

        # Push events to queue
        for event in events:
            events_cache.rpush(key, event)

        # Get all events
        result = events_cache.lrange(key, 0, -1)
        assert result == events
        assert len(result) == 3

        # Cleanup
        events_cache.delete(key)

    def test_sse_events_partial_read(
        self,
        events_cache: RedisCache,
        test_job_id: str,
    ):
        """Test reading partial events from queue"""
        key = f"job:{test_job_id}:events"

        events = [
            {"eventId": "evt_1", "stage": "MSA"},
            {"eventId": "evt_2", "stage": "MODEL"},
            {"eventId": "evt_3", "stage": "RELAX"},
        ]

        # Push events
        for event in events:
            events_cache.rpush(key, event)

        # Read first 2 events
        result = events_cache.lrange(key, 0, 1)
        assert len(result) == 2
        assert result == events[:2]

        # Read from offset
        result = events_cache.lrange(key, 1, -1)
        assert len(result) == 2
        assert result == events[1:]

        # Cleanup
        events_cache.delete(key)


class TestRedisCacheEdgeCases:
    """Test edge cases and error handling"""

    @pytest.fixture
    def test_cache(self) -> RedisCache:
        """Create a test cache instance"""
        return RedisCache(db=RedisDB.TEST)

    def test_get_nonexistent_key(self, test_cache: RedisCache):
        """Test getting a key that doesn't exist"""
        result = test_cache.get("nonexistent:key")
        assert result is None

    def test_hget_nonexistent_field(self, test_cache: RedisCache):
        """Test getting a hash field that doesn't exist"""
        key = "test:hash_edge"
        test_cache.hset(key, {"field1": "value1"})

        result = test_cache.hget(key, "nonexistent_field")
        assert result is None

        # Cleanup
        test_cache.delete(key)

    def test_hgetall_nonexistent_key(self, test_cache: RedisCache):
        """Test hgetall on nonexistent key"""
        result = test_cache.hgetall("nonexistent:hash")
        assert result is None

    def test_lrange_empty_list(self, test_cache: RedisCache):
        """Test lrange on empty/nonexistent list"""
        result = test_cache.lrange("nonexistent:list", 0, -1)
        assert result == []

    def test_delete_nonexistent_key(self, test_cache: RedisCache):
        """Test deleting a key that doesn't exist"""
        result = test_cache.delete("nonexistent:key")
        assert result is False

    def test_complex_nested_data(self, test_cache: RedisCache):
        """Test storing and retrieving complex nested data"""
        key = "test:complex"
        value = {
            "job_id": "job_123",
            "structures": [
                {"id": 1, "plddt": 85.5, "label": "Candidate 1"},
                {"id": 2, "plddt": 90.2, "label": "Final"},
            ],
            "metadata": {
                "created_at": "2025-01-01T00:00:00Z",
                "settings": {"model": "boltz", "relax": True},
            },
        }

        test_cache.set(key, value)
        result = test_cache.get(key)

        assert result == value
        assert result["structures"][1]["plddt"] == 90.2
        assert result["metadata"]["settings"]["relax"] is True

        # Cleanup
        test_cache.delete(key)
