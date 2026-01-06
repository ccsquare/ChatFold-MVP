"""Redis client factory for different deployment modes.

This module provides a factory function to create Redis clients based on
the deployment mode (fake Redis for development, real Redis for production).
"""

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import redis

from app.settings import settings

logger = logging.getLogger(__name__)


def create_redis_client(db: int = 0) -> "redis.Redis":
    """Create Redis client based on settings.

    Args:
        db: Database index (default: 0)

    Returns:
        Redis client (either fakeredis or real redis)
    """
    if settings.redis_type == "fake":
        # Use FakeRedis for local development (no Docker required)
        try:
            import fakeredis

            client = fakeredis.FakeRedis(
                db=db,
                decode_responses=True,
            )
            logger.info(f"Using FakeRedis (in-memory): db={db}")
            return client
        except ImportError:
            logger.warning("fakeredis not installed, falling back to real Redis. Install with: uv add fakeredis")
            # Fall through to real Redis

    # Use real Redis (Docker or remote server)
    import redis

    redis_config = {
        "host": settings.redis_host,
        "port": settings.redis_port,
        "db": db,
        "socket_connect_timeout": settings.redis_socket_connect_timeout,
        "socket_timeout": settings.redis_socket_timeout,
        "decode_responses": True,
    }
    if settings.redis_password:
        redis_config["password"] = settings.redis_password

    client = redis.Redis(**redis_config)
    logger.info(f"Using real Redis: {settings.redis_host}:{settings.redis_port}, db={db}")
    return client
