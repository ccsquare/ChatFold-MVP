"""
Redis-based distributed cache for multi-replica deployments

This module provides a Redis-backed cache implementation that solves
the multi-replica deployment issues with in-memory caching.

Architecture (Single DB + Key Prefix Pattern):
- 所有数据使用 db=0，通过 Key 前缀实现业务隔离
- Redis Cluster 兼容 (Cluster 只支持 db=0)
- 事务支持: 同一 DB 内可执行完整 MULTI/EXEC 事务
- 统一连接池管理

Benefits:
- Shared across all backend pods
- Auto-expiry with TTL
- High cache hit rate
- No data staleness issues
- Redis Cluster compatible

Usage:
    from app.db.redis_cache import get_redis_cache
    from app.db.redis_db import RedisKeyPrefix

    # Get singleton cache instance (always db=0)
    cache = get_redis_cache()

    # Use key prefix helpers for proper namespacing
    key = RedisKeyPrefix.job_state_key("job_abc123")
    # Result: "chatfold:job:state:job_abc123"

    # Basic operations
    cache.set(key, {"status": "running"}, expire_seconds=3600)
    data = cache.get(key)
    cache.delete(key)

    # Hash operations (for job state)
    cache.hset(key, {"status": "running", "progress": 50})
    state = cache.hgetall(key)

    # List operations (for SSE events)
    events_key = RedisKeyPrefix.job_events_key("job_abc123")
    cache.lpush(events_key, {"eventId": "evt_1", "stage": "MSA"})
    events = cache.lrange(events_key, 0, -1)
"""

import json
import logging
from typing import Any

import redis

from app.db.redis_db import RedisDB
from app.settings import settings

logger = logging.getLogger(__name__)


class RedisCache:
    """
    Redis-based distributed cache (Single DB + Key Prefix Pattern)

    Designed for multi-replica deployments where cache must be shared
    across all backend pods.

    Architecture:
    - 使用单一 db=0，通过 Key 前缀实现业务隔离
    - 符合 Redis Cluster 兼容性要求 (Cluster 只支持 db=0)
    - 同一 DB 内支持完整 MULTI/EXEC 事务

    Features:
    - Distributed: All pods share the same cache
    - TTL support: Auto-expiry with Redis SETEX
    - JSON serialization: Handles complex data structures
    - Connection pooling: Efficient Redis connections via shared pool
    - Hash/List support: For job state and SSE events
    - Redis Cluster compatible: Single DB design
    """

    # 默认使用 db=0，符合 Redis Cluster 要求
    DEFAULT_DB = 0

    def __init__(self, db: RedisDB | int = 0, client: redis.Redis | None = None):
        """
        Initialize Redis cache

        Args:
            db: Database index (default: 0 for Redis Cluster compatibility).
                Accepts RedisDB enum for backward compatibility, but all values
                map to db=0 in the new architecture.
            client: Optional pre-configured Redis client (for testing with fakeredis)
        """
        # 新架构: 所有 DB 都使用 db=0
        if isinstance(db, RedisDB):
            self.db = self.DEFAULT_DB  # RedisDB 现在都映射到 0
            self._db_enum = db
        else:
            self.db = db if db == 0 else self.DEFAULT_DB
            self._db_enum = None

        self._client: redis.Redis | None = client

    @property
    def client(self) -> redis.Redis:
        """Lazy initialization of Redis client with shared connection pool"""
        if self._client is None:
            redis_config = {
                "host": settings.redis_host,
                "port": settings.redis_port,
                "db": self.db,  # Always 0 for Redis Cluster compatibility
                "socket_connect_timeout": settings.redis_socket_connect_timeout,
                "socket_timeout": settings.redis_socket_timeout,
                "decode_responses": True,  # Auto-decode bytes to str
            }
            if settings.redis_password:
                redis_config["password"] = settings.redis_password

            self._client = redis.Redis(**redis_config)
            logger.info(f"RedisCache initialized: db={self.db} (single DB + key prefix pattern)")

        return self._client

    # ==================== String Operations ====================

    def get(self, key: str) -> Any | None:
        """
        Get cached value

        Args:
            key: Cache key

        Returns:
            Cached value (deserialized from JSON), or None if not found or expired
        """
        try:
            data = self.client.get(key)
            if data:
                return json.loads(data)
            logger.debug(f"Cache miss: {key}")
            return None
        except redis.RedisError as e:
            logger.error(f"Redis get error for key {key}: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error for key {key}: {e}")
            return None

    def set(self, key: str, value: Any, expire_seconds: int | None = None) -> bool:
        """
        Set cached value with optional TTL

        Args:
            key: Cache key
            value: Value to cache (will be JSON serialized)
            expire_seconds: TTL in seconds (None for no expiry)

        Returns:
            True if successful, False otherwise
        """
        try:
            serialized = json.dumps(value, default=str)

            if expire_seconds:
                result = self.client.setex(key, expire_seconds, serialized)
            else:
                result = self.client.set(key, serialized)

            logger.debug(f"Cache set: {key}" + (f", expires in {expire_seconds}s" if expire_seconds else ""))
            return bool(result)
        except redis.RedisError as e:
            logger.error(f"Redis set error for key {key}: {e}")
            return False
        except (TypeError, ValueError) as e:
            logger.error(f"Serialization error for key {key}: {e}")
            return False

    def delete(self, key: str) -> bool:
        """
        Delete cached value

        Args:
            key: Cache key to delete

        Returns:
            True if key was deleted, False if key didn't exist or error occurred
        """
        try:
            result = self.client.delete(key)
            if result:
                logger.debug(f"Cache deleted: {key}")
            return bool(result)
        except redis.RedisError as e:
            logger.error(f"Redis delete error for key {key}: {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists in cache"""
        try:
            return bool(self.client.exists(key))
        except redis.RedisError as e:
            logger.error(f"Redis exists error for key {key}: {e}")
            return False

    def ttl(self, key: str) -> int:
        """
        Get remaining TTL for a key

        Returns:
            TTL in seconds, -1 if key has no expiry, -2 if key doesn't exist
        """
        try:
            return self.client.ttl(key)
        except redis.RedisError as e:
            logger.error(f"Redis TTL error for key {key}: {e}")
            return -2

    def expire(self, key: str, seconds: int) -> bool:
        """Set expiry on an existing key"""
        try:
            return bool(self.client.expire(key, seconds))
        except redis.RedisError as e:
            logger.error(f"Redis expire error for key {key}: {e}")
            return False

    # ==================== Hash Operations (for Job State) ====================

    def hset(self, key: str, mapping: dict[str, Any]) -> bool:
        """
        Set multiple hash fields

        Args:
            key: Hash key
            mapping: Dict of field -> value pairs

        Returns:
            True if successful
        """
        try:
            # Serialize values to JSON strings
            serialized = {k: json.dumps(v, default=str) if not isinstance(v, str) else v
                          for k, v in mapping.items()}
            self.client.hset(key, mapping=serialized)
            logger.debug(f"Hash set: {key}, fields: {list(mapping.keys())}")
            return True
        except redis.RedisError as e:
            logger.error(f"Redis hset error for key {key}: {e}")
            return False

    def hget(self, key: str, field: str) -> Any | None:
        """Get a single hash field value"""
        try:
            data = self.client.hget(key, field)
            if data:
                try:
                    return json.loads(data)
                except json.JSONDecodeError:
                    return data  # Return as string if not JSON
            return None
        except redis.RedisError as e:
            logger.error(f"Redis hget error for key {key}, field {field}: {e}")
            return None

    def hgetall(self, key: str) -> dict[str, Any] | None:
        """
        Get all hash fields

        Returns:
            Dict of field -> value pairs, or None if error
        """
        try:
            data = self.client.hgetall(key)
            if not data:
                return None

            # Try to deserialize JSON values
            result = {}
            for k, v in data.items():
                try:
                    result[k] = json.loads(v)
                except json.JSONDecodeError:
                    result[k] = v
            return result
        except redis.RedisError as e:
            logger.error(f"Redis hgetall error for key {key}: {e}")
            return None

    def hdel(self, key: str, *fields: str) -> int:
        """Delete hash fields"""
        try:
            return self.client.hdel(key, *fields)
        except redis.RedisError as e:
            logger.error(f"Redis hdel error for key {key}: {e}")
            return 0

    # ==================== List Operations (for SSE Events) ====================

    def lpush(self, key: str, *values: Any) -> int:
        """
        Push values to the left of a list (newest first)

        Args:
            key: List key
            values: Values to push (will be JSON serialized)

        Returns:
            Length of list after push
        """
        try:
            serialized = [json.dumps(v, default=str) for v in values]
            result = self.client.lpush(key, *serialized)
            logger.debug(f"List lpush: {key}, count: {len(values)}")
            return result
        except redis.RedisError as e:
            logger.error(f"Redis lpush error for key {key}: {e}")
            return 0

    def rpush(self, key: str, *values: Any) -> int:
        """Push values to the right of a list (oldest first)"""
        try:
            serialized = [json.dumps(v, default=str) for v in values]
            result = self.client.rpush(key, *serialized)
            logger.debug(f"List rpush: {key}, count: {len(values)}")
            return result
        except redis.RedisError as e:
            logger.error(f"Redis rpush error for key {key}: {e}")
            return 0

    def lrange(self, key: str, start: int, stop: int) -> list[Any]:
        """
        Get a range of list elements

        Args:
            key: List key
            start: Start index (0-based, inclusive)
            stop: Stop index (inclusive, -1 for last element)

        Returns:
            List of values
        """
        try:
            data = self.client.lrange(key, start, stop)
            result = []
            for item in data:
                try:
                    result.append(json.loads(item))
                except json.JSONDecodeError:
                    result.append(item)
            return result
        except redis.RedisError as e:
            logger.error(f"Redis lrange error for key {key}: {e}")
            return []

    def llen(self, key: str) -> int:
        """Get list length"""
        try:
            return self.client.llen(key)
        except redis.RedisError as e:
            logger.error(f"Redis llen error for key {key}: {e}")
            return 0

    def ltrim(self, key: str, start: int, stop: int) -> bool:
        """Trim list to specified range"""
        try:
            self.client.ltrim(key, start, stop)
            return True
        except redis.RedisError as e:
            logger.error(f"Redis ltrim error for key {key}: {e}")
            return False

    # ==================== Utility Methods ====================

    def ping(self) -> bool:
        """Check Redis connection"""
        try:
            return self.client.ping()
        except redis.RedisError as e:
            logger.error(f"Redis ping failed: {e}")
            return False

    def flush_db(self) -> bool:
        """
        Flush current database (USE WITH CAUTION)

        Only use in tests or development
        """
        try:
            self.client.flushdb()
            logger.warning(f"Redis DB {self.db.value} flushed!")
            return True
        except redis.RedisError as e:
            logger.error(f"Redis flushdb error: {e}")
            return False

    def close(self) -> None:
        """Close Redis connection"""
        if self._client:
            self._client.close()
            self._client = None
            logger.info(f"RedisCache closed: db={self.db}")


# ==================== Singleton Instance ====================
# Single cache instance for all operations (Single DB + Key Prefix Pattern)

_redis_cache: RedisCache | None = None


def get_redis_cache() -> RedisCache:
    """Get singleton Redis cache instance (db=0).

    This is the primary way to access Redis in the new architecture.
    Use RedisKeyPrefix helpers to generate properly namespaced keys.

    Example:
        cache = get_redis_cache()
        key = RedisKeyPrefix.job_state_key("job_abc123")
        cache.hset(key, {"status": "running"})
    """
    global _redis_cache
    if _redis_cache is None:
        _redis_cache = RedisCache()
    return _redis_cache


# ==================== Backward Compatibility ====================
# These functions are deprecated but maintained for gradual migration

_job_state_cache: RedisCache | None = None
_sse_events_cache: RedisCache | None = None


def get_job_state_cache() -> RedisCache:
    """Get cache instance for job state.

    DEPRECATED: Use get_redis_cache() with RedisKeyPrefix.job_state_key() instead.

    This function now returns the same shared cache instance (db=0).
    The old multi-DB pattern has been replaced with single DB + key prefix.
    """
    global _job_state_cache
    if _job_state_cache is None:
        _job_state_cache = RedisCache(db=RedisDB.JOB_STATE)
    return _job_state_cache


def get_sse_events_cache() -> RedisCache:
    """Get cache instance for SSE events.

    DEPRECATED: Use get_redis_cache() with RedisKeyPrefix.job_events_key() instead.

    This function now returns the same shared cache instance (db=0).
    The old multi-DB pattern has been replaced with single DB + key prefix.
    """
    global _sse_events_cache
    if _sse_events_cache is None:
        _sse_events_cache = RedisCache(db=RedisDB.SSE_EVENTS)
    return _sse_events_cache
