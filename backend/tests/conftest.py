#!/usr/bin/env python
"""
pytest configuration file

This file contains shared fixtures for all tests.
"""

import os

import fakeredis
import pytest

# Test configuration
REDIS_HOST = os.getenv("CHATFOLD_REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("CHATFOLD_REDIS_PORT", "6379"))
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")


@pytest.fixture(scope="session")
def redis_host() -> str:
    """Redis host fixture"""
    return REDIS_HOST


@pytest.fixture(scope="session")
def redis_port() -> int:
    """Redis port fixture"""
    return REDIS_PORT


@pytest.fixture(scope="session")
def api_base_url() -> str:
    """API base URL fixture"""
    return API_BASE_URL


@pytest.fixture
def test_job_id() -> str:
    """Generate a test job ID"""
    import uuid

    return f"test_job_{uuid.uuid4().hex[:8]}"


# Alias for backward compatibility in tests
test_task_id = test_job_id


@pytest.fixture
def sample_job_state() -> dict:
    """Sample job state for testing"""
    return {
        "status": "running",
        "stage": "MODEL",
        "progress": 45,
        "message": "Running prediction...",
    }


# Alias for backward compatibility in tests
sample_task_state = sample_job_state


@pytest.fixture
def sample_sse_events() -> list:
    """Sample SSE events for testing"""
    return [
        '{"eventId":"evt_1","stage":"MSA","progress":20}',
        '{"eventId":"evt_2","stage":"MODEL","progress":45}',
        '{"eventId":"evt_3","stage":"RELAX","progress":70}',
    ]


@pytest.fixture
def fake_redis_client():
    """
    Create a fakeredis client for unit tests.

    This provides an in-memory Redis implementation that allows
    unit tests to run without a real Redis server.
    """
    server = fakeredis.FakeServer()
    client = fakeredis.FakeRedis(server=server, decode_responses=True)
    yield client
    client.close()
