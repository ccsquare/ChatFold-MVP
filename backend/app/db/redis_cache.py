"""
Redis-based distributed cache for multi-replica deployments

This module provides a Redis-backed cache implementation that solves
the multi-replica deployment issues with in-memory caching.

Benefits:
- Shared across all backend pods
- Auto-expiry with TTL
- High cache hit rate
- No data staleness issues

Usage:
    from app.db.redis_cache import RedisCache
    from app.db.redis_db import RedisDB

    # Create cache instance for specific database
    cache = RedisCache(db=RedisDB.JOB_STATE)

    # Basic operations
    cache.set("job:123:state", {"status": "running"}, expire_seconds=3600)
    data = cache.get("job:123:state")
    cache.delete("job:123:state")

    # Hash operations (for job state)
    cache.hset("job:123:state", {"status": "running", "progress": 50})
    state = cache.hgetall("job:123:state")

    # List operations (for SSE events)
    cache.lpush("job:123:events", {"eventId": "evt_1", "stage": "MSA"})
    events = cache.lrange("job:123:events", 0, -1)
"""

import json
import logging
from typing import Any, Optional

import redis

from app.settings import settings
from app.db.redis_db import RedisDB

logger = logging.getLogger(__name__)


class RedisCache:
    """
    Redis-based distributed cache

    Designed for multi-replica deployments where cache must be shared
    across all backend pods.

    Features:
    - Distributed: All pods share the same cache
    - TTL support: Auto-expiry with Redis SETEX
    - JSON serialization: Handles complex data structures
    - Connection pooling: Efficient Redis connections
    - Hash/List support: For job state and SSE events
    """

    def __init__(self, db: RedisDB):
        """
        Initialize Redis cache with specific database

        Args:
            db: RedisDB enum value specifying which database to use
        """
        self.db = db
        self._client: Optional[redis.Redis] = None
        self._db_description = RedisDB.get_description(db)

    @property
    def client(self) -> redis.Redis:
        """Lazy initialization of Redis client"""
        if self._client is None:
            redis_config = {
                "host": settings.redis_host,
                "port": settings.redis_port,
                "db": self.db.value,
                "socket_connect_timeout": settings.redis_socket_connect_timeout,
                "socket_timeout": settings.redis_socket_timeout,
                "decode_responses": True,  # Auto-decode bytes to str
            }
            if settings.redis_password:
                redis_config["password"] = settings.redis_password

            self._client = redis.Redis(**redis_config)
            logger.info(f"RedisCache initialized: DB {self.db.value} ({self._db_description})")

        return self._client

    # ==================== String Operations ====================

    def get(self, key: str) -> Optional[Any]:
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

    def set(self, key: str, value: Any, expire_seconds: Optional[int] = None) -> bool:
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

    def hget(self, key: str, field: str) -> Optional[Any]:
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

    def hgetall(self, key: str) -> Optional[dict[str, Any]]:
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
            logger.info(f"RedisCache closed: DB {self.db.value}")


# ==================== Singleton Instances ====================
# Pre-configured cache instances for common use cases

_job_state_cache: Optional[RedisCache] = None
_sse_events_cache: Optional[RedisCache] = None


def get_job_state_cache() -> RedisCache:
    """Get singleton cache instance for job state"""
    global _job_state_cache
    if _job_state_cache is None:
        _job_state_cache = RedisCache(db=RedisDB.JOB_STATE)
    return _job_state_cache


def get_sse_events_cache() -> RedisCache:
    """Get singleton cache instance for SSE events"""
    global _sse_events_cache
    if _sse_events_cache is None:
        _sse_events_cache = RedisCache(db=RedisDB.SSE_EVENTS)
    return _sse_events_cache
