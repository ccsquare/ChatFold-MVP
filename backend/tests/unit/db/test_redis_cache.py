#!/usr/bin/env python
"""
Unit tests for Redis cache module

Tests cover:
- RedisKeyPrefix key generation
- RedisCache basic operations (string, hash, list)
- Task state cache operations
- SSE events cache operations

NOTE: These tests use fakeredis to provide an in-memory Redis implementation,
allowing tests to run without a real Redis server. This follows industry
best practices for unit test isolation.

Architecture: Single DB + Key Prefix Pattern
- All tests use db=0 (Redis Cluster compatible)
- Key prefixes provide namespace isolation
"""

import pytest

from app.db.redis_cache import RedisCache
from app.db.redis_db import RedisDB, RedisKeyPrefix


class TestRedisKeyPrefix:
    """Test suite for RedisKeyPrefix enum and key generation"""

    def test_key_prefix_values(self):
        """Test that RedisKeyPrefix has correct prefix values"""
        assert RedisKeyPrefix.TASK_STATE.value == "chatfold:task:state"
        assert RedisKeyPrefix.TASK_META.value == "chatfold:task:meta"
        assert RedisKeyPrefix.TASK_EVENTS.value == "chatfold:task:events"
        assert RedisKeyPrefix.WORKSPACE_FOLDER.value == "chatfold:workspace:folder"
        assert RedisKeyPrefix.WORKSPACE_USER.value == "chatfold:workspace:user"
        assert RedisKeyPrefix.WORKSPACE_PROJECT.value == "chatfold:workspace:project"

    def test_task_state_key(self):
        """Test task state key generation"""
        key = RedisKeyPrefix.task_state_key("task_abc123")
        assert key == "chatfold:task:state:task_abc123"

    def test_task_meta_key(self):
        """Test task meta key generation"""
        key = RedisKeyPrefix.task_meta_key("task_abc123")
        assert key == "chatfold:task:meta:task_abc123"

    def test_task_events_key(self):
        """Test task events key generation"""
        key = RedisKeyPrefix.task_events_key("task_abc123")
        assert key == "chatfold:task:events:task_abc123"

    def test_folder_key(self):
        """Test folder key generation"""
        key = RedisKeyPrefix.folder_key("folder_xyz789")
        assert key == "chatfold:workspace:folder:folder_xyz789"

    def test_user_key(self):
        """Test user key generation"""
        key = RedisKeyPrefix.user_key("user_default")
        assert key == "chatfold:workspace:user:user_default"

    def test_index_keys(self):
        """Test index key generation"""
        assert RedisKeyPrefix.folder_index_key() == "chatfold:workspace:index:folders"
        assert RedisKeyPrefix.user_index_key() == "chatfold:workspace:index:users"
        assert RedisKeyPrefix.project_index_key() == "chatfold:workspace:index:projects"

    def test_list_all(self):
        """Test listing all key prefixes"""
        all_prefixes = RedisKeyPrefix.list_all()
        assert "TASK_STATE" in all_prefixes
        assert all_prefixes["TASK_STATE"]["prefix"] == "chatfold:task:state"


class TestRedisDB:
    """Test suite for RedisDB enum (deprecated, for backward compatibility)"""

    def test_redis_db_values_all_zero(self):
        """Test that all RedisDB values now map to 0 (single DB pattern)"""
        # All databases now use db=0 for Redis Cluster compatibility
        assert RedisDB.DEFAULT == 0
        assert RedisDB.TASK_STATE == 0
        assert RedisDB.SESSION_STORE == 0
        assert RedisDB.WORKSPACE == 0
        assert RedisDB.SSE_EVENTS == 0
        assert RedisDB.FILE_CACHE == 0
        assert RedisDB.STRUCTURE_CACHE == 0
        assert RedisDB.TEMP_DATA == 0
        assert RedisDB.TEST == 0

    def test_redis_db_deprecated_warning(self):
        """Test that RedisDB.get_description emits deprecation warning"""
        import warnings

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            RedisDB.get_description(RedisDB.TASK_STATE)
            assert len(w) == 1
            assert issubclass(w[0].category, DeprecationWarning)
            assert "deprecated" in str(w[0].message).lower()


class TestRedisCacheWithFakeRedis:
    """Test Redis cache operations using fakeredis"""

    @pytest.fixture
    def test_cache(self, fake_redis_client) -> RedisCache:
        """Create a test cache instance using fakeredis"""
        return RedisCache(db=RedisDB.TEST, client=fake_redis_client)

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

    def test_list_rpush(self, test_cache: RedisCache):
        """Test list right push"""
        key = "test:list_rpush"
        values = [{"id": 1}, {"id": 2}, {"id": 3}]

        # Right push (items will be in original order)
        for v in values:
            test_cache.rpush(key, v)

        result = test_cache.lrange(key, 0, -1)
        assert result == values

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

    def test_llen(self, test_cache: RedisCache):
        """Test list length"""
        key = "test:llen_key"

        assert test_cache.llen(key) == 0

        test_cache.rpush(key, "a", "b", "c")
        assert test_cache.llen(key) == 3

    def test_ltrim(self, test_cache: RedisCache):
        """Test list trim"""
        key = "test:ltrim_key"
        test_cache.rpush(key, "a", "b", "c", "d", "e")

        # Keep only first 3 elements
        result = test_cache.ltrim(key, 0, 2)
        assert result is True
        assert test_cache.llen(key) == 3
        assert test_cache.lrange(key, 0, -1) == ["a", "b", "c"]


class TestTaskStateCacheWithFakeRedis:
    """Test task state cache operations using fakeredis"""

    @pytest.fixture
    def task_cache(self, fake_redis_client) -> RedisCache:
        """Get task state cache instance with fakeredis"""
        return RedisCache(db=RedisDB.TASK_STATE, client=fake_redis_client)

    def test_task_state_storage(
        self,
        task_cache: RedisCache,
        test_task_id: str,
        sample_task_state: dict,
    ):
        """Test storing and retrieving task state"""
        key = f"task:{test_task_id}:state"

        # Store task state as hash
        task_cache.hset(key, sample_task_state)

        # Retrieve and verify
        result = task_cache.hgetall(key)
        assert result["status"] == sample_task_state["status"]
        assert result["stage"] == sample_task_state["stage"]
        assert result["progress"] == sample_task_state["progress"]
        assert result["message"] == sample_task_state["message"]

    def test_task_state_update(
        self,
        task_cache: RedisCache,
        test_task_id: str,
    ):
        """Test updating individual task state fields"""
        key = f"task:{test_task_id}:state"

        # Initial state
        task_cache.hset(key, {"status": "queued", "progress": 0})

        # Update
        task_cache.hset(key, {"status": "running", "progress": 50})

        # Verify
        assert task_cache.hget(key, "status") == "running"
        assert task_cache.hget(key, "progress") == 50


class TestSSEEventsCacheWithFakeRedis:
    """Test SSE events cache operations using fakeredis"""

    @pytest.fixture
    def events_cache(self, fake_redis_client) -> RedisCache:
        """Get SSE events cache instance with fakeredis"""
        return RedisCache(db=RedisDB.SSE_EVENTS, client=fake_redis_client)

    def test_sse_events_queue(
        self,
        events_cache: RedisCache,
        test_task_id: str,
    ):
        """Test SSE events queue operations"""
        key = f"task:{test_task_id}:events"

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

    def test_sse_events_partial_read(
        self,
        events_cache: RedisCache,
        test_task_id: str,
    ):
        """Test reading partial events from queue"""
        key = f"task:{test_task_id}:events"

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


class TestRedisCacheEdgeCases:
    """Test edge cases and error handling"""

    @pytest.fixture
    def test_cache(self, fake_redis_client) -> RedisCache:
        """Create a test cache instance with fakeredis"""
        return RedisCache(db=RedisDB.TEST, client=fake_redis_client)

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
            "task_id": "task_123",
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
