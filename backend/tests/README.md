# ChatFold Backend Tests

This directory contains the test suite for ChatFold backend.

## Directory Structure

```
tests/
├── conftest.py          # Shared fixtures and configuration
├── README.md            # This file
├── unit/                # Unit tests
│   └── db/              # Database/cache tests
│       └── test_redis_cache.py
└── integration/         # Integration tests (future)
```

## Setup

### Install Test Dependencies

```bash
cd backend
uv sync --all-extras
```

### Prerequisites

Ensure Redis is running:

```bash
# Start infrastructure
./scripts/local-dev/start.sh

# Verify Redis
docker ps | grep chatfold-redis
```

### Configuration

Tests use environment variables for configuration:

```bash
# Optional: override default values
export CHATFOLD_REDIS_HOST="127.0.0.1"
export CHATFOLD_REDIS_PORT="6379"
export API_BASE_URL="http://127.0.0.1:8000"
```

## Running Tests

### Run All Tests

```bash
cd backend
uv run pytest
```

### Run with Verbose Output

```bash
uv run pytest -v
```

### Run Specific Test File

```bash
uv run pytest tests/unit/db/test_redis_cache.py
```

### Run Specific Test Class

```bash
uv run pytest tests/unit/db/test_redis_cache.py::TestRedisCacheConnection
```

### Run Specific Test

```bash
uv run pytest tests/unit/db/test_redis_cache.py::TestRedisCacheConnection::test_ping
```

### Run with Output Shown

```bash
uv run pytest -s
```

### Run with Coverage

```bash
uv run pytest --cov=app --cov-report=html
```

## Test Categories

### Unit Tests (`tests/unit/`)

Fast, isolated tests that don't require external services (except Redis for cache tests).

- **db/test_redis_cache.py**: Redis cache operations
  - `TestRedisDB`: RedisDB enum values
  - `TestRedisCacheConnection`: Basic Redis operations (string, hash, list)
  - `TestTaskStateCache`: Task state storage operations
  - `TestSSEEventsCache`: SSE events queue operations

### Integration Tests (`tests/integration/`)

Tests that require running services (API server, external services).

*To be added*

## Test Fixtures

### Shared Fixtures (`conftest.py`)

| Fixture | Scope | Description |
|---------|-------|-------------|
| `redis_host` | session | Redis host address |
| `redis_port` | session | Redis port number |
| `api_base_url` | session | API base URL |
| `test_task_id` | function | Generated test task ID |
| `sample_task_state` | function | Sample task state dict |
| `sample_sse_events` | function | Sample SSE events list |

## Writing Tests

### Test Naming Convention

- Test files: `test_<module>.py`
- Test classes: `Test<Feature>`
- Test methods: `test_<behavior>`

### Example Test

```python
import pytest
from app.db.redis_cache import RedisCache, get_task_state_cache


class TestTaskStateCache:
    """Test task state cache operations"""

    @pytest.fixture
    def task_cache(self) -> RedisCache:
        """Get task state cache instance"""
        return get_task_state_cache()

    def test_task_state_storage(
        self,
        task_cache: RedisCache,
        test_task_id: str,
        sample_task_state: dict,
    ):
        """Test storing and retrieving task state"""
        key = f"task:{test_task_id}:state"

        # Store
        task_cache.hset(key, mapping=sample_task_state)

        # Retrieve and verify
        result = task_cache.hgetall(key)
        assert result["status"] == sample_task_state["status"]

        # Cleanup
        task_cache.delete(key)
```

## Troubleshooting

### Redis Connection Failed

```
redis.exceptions.ConnectionError: Error connecting to 127.0.0.1:6379
```

**Solution**: Start Redis container:
```bash
./scripts/local-dev/start.sh
```

### Module Not Found

```
ModuleNotFoundError: No module named 'app'
```

**Solution**: Run tests from backend directory:
```bash
cd backend
uv run pytest
```

### Import Error for pytest

```
ModuleNotFoundError: No module named 'pytest'
```

**Solution**: Install dev dependencies:
```bash
uv sync --all-extras
```

---

**Last Updated**: 2025-01-01
