"""Multi-instance simulation tests.

These tests simulate multi-instance deployment scenarios by:
1. Using separate MemoryStore instances (simulating different processes)
2. Sharing Redis (as would happen in production)
3. Testing cross-instance operations like task cancellation and sequence retrieval

Run with: uv run pytest tests/integration/test_multi_instance.py -v
"""

import asyncio

import pytest

from app.components.nanocc import StatusType
from app.db.redis_cache import RedisCache
from app.db.redis_db import RedisDB
from app.services.task_state import TaskStateService
from app.services.memory_store import MemoryStore
from app.utils import generate_id


class TestMultiInstanceTaskCancel:
    """Test task cancellation across simulated instances."""

    @pytest.fixture
    def instance1_memory(self):
        """Simulate Instance 1's local memory store."""
        return MemoryStore()

    @pytest.fixture
    def instance2_memory(self):
        """Simulate Instance 2's local memory store."""
        return MemoryStore()

    @pytest.fixture
    def shared_task_state(self, fake_redis_client):
        """Shared Redis-backed task state service (simulates shared Redis)."""
        cache = RedisCache(db=RedisDB.JOB_STATE, client=fake_redis_client)
        return TaskStateService(cache=cache)

    def test_cancel_from_different_instance(self, instance1_memory, instance2_memory, shared_task_state):
        """Test: Instance 2 cancels a task created on Instance 1.

        Scenario:
        1. Instance 1 creates a task and stores in its local memory
        2. Instance 2 receives cancel request (task not in its memory)
        3. Instance 2 marks task as canceled in Redis
        4. Instance 1 checks Redis and sees the cancellation
        """
        task_id = generate_id("task")
        sequence = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSR"

        # Instance 1: Create task (save to local memory + Redis)
        instance1_memory.save_task_sequence(task_id, sequence)
        shared_task_state.create_state(task_id)
        shared_task_state.save_job_meta(task_id, sequence=sequence)

        # Verify Instance 1 can see the task
        assert instance1_memory.get_task_sequence(task_id) == sequence
        assert shared_task_state.get_state(task_id) is not None

        # Instance 2: Cannot see task in local memory (different process)
        assert instance2_memory.get_task_sequence(task_id) is None

        # Instance 2: But CAN see task in Redis (shared)
        assert shared_task_state.job_exists(task_id)
        assert shared_task_state.get_job_sequence(task_id) == sequence

        # Instance 2: Cancel the task via Redis
        shared_task_state.mark_canceled(task_id)

        # Instance 1: Check cancellation status from Redis
        assert shared_task_state.is_canceled(task_id)

        # Verify the helper function logic
        def is_task_canceled(task_id: str, task_state_svc, memory_store) -> bool:
            """Simulate _is_task_canceled() from tasks.py."""
            if task_state_svc.is_canceled(task_id):
                return True
            return memory_store.is_task_canceled(task_id)

        # Instance 1 should see cancellation via Redis
        assert is_task_canceled(task_id, shared_task_state, instance1_memory)

    def test_sequence_retrieval_cross_instance(self, instance1_memory, instance2_memory, shared_task_state):
        """Test: Instance 2 retrieves sequence registered on Instance 1.

        Scenario:
        1. Instance 1 receives sequence registration request
        2. Instance 1 saves to local memory AND Redis
        3. Instance 2 needs to start SSE stream for same task
        4. Instance 2 retrieves sequence from Redis (not in local memory)
        """
        task_id = generate_id("task")
        sequence = "MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH"

        # Instance 1: Register sequence (save to both local memory and Redis)
        instance1_memory.save_task_sequence(task_id, sequence)
        shared_task_state.save_job_meta(task_id, sequence=sequence)

        # Instance 2: Try to get sequence
        # Local memory: empty
        assert instance2_memory.get_task_sequence(task_id) is None

        # Redis: has the sequence
        redis_sequence = shared_task_state.get_job_sequence(task_id)
        assert redis_sequence == sequence

        # Simulate the fallback logic from stream_task endpoint
        def get_sequence(task_id: str, task_state_svc, memory_store) -> str | None:
            """Simulate sequence retrieval logic from tasks.py."""
            return task_state_svc.get_job_sequence(task_id) or memory_store.get_task_sequence(task_id)

        # Instance 2 can get sequence via Redis fallback
        assert get_sequence(task_id, shared_task_state, instance2_memory) == sequence


class TestMultiInstanceConcurrentOperations:
    """Test concurrent operations from multiple instances."""

    @pytest.fixture
    def shared_task_state(self, fake_redis_client):
        """Shared Redis-backed task state service."""
        cache = RedisCache(db=RedisDB.JOB_STATE, client=fake_redis_client)
        return TaskStateService(cache=cache)

    @pytest.mark.asyncio
    async def test_concurrent_state_updates(self, shared_task_state):
        """Test concurrent state updates from multiple 'instances'.

        Simulates multiple instances updating the same task's progress.
        Redis HSET is atomic, so last write wins (acceptable for progress).
        """
        task_id = generate_id("task")
        shared_task_state.create_state(task_id)

        async def update_progress(instance_id: int, progress: int):
            """Simulate an instance updating progress."""
            await asyncio.sleep(0.01 * (instance_id % 3))  # Simulate network jitter
            shared_task_state.update_progress(task_id, progress, f"Instance {instance_id}")
            return progress

        # Simulate 5 instances updating progress concurrently
        tasks = [update_progress(i, i * 20) for i in range(1, 6)]
        results = await asyncio.gather(*tasks)

        # All updates should complete
        assert len(results) == 5

        # Final state should reflect one of the updates
        state = shared_task_state.get_state(task_id)
        assert state is not None
        assert state["progress"] in [20, 40, 60, 80, 100]

    @pytest.mark.asyncio
    async def test_concurrent_task_creation(self, shared_task_state):
        """Test concurrent task creation from multiple instances.

        Each task should get a unique ID (ULID guarantees this).
        """

        async def create_task(instance_id: int):
            """Simulate task creation from an instance."""
            task_id = generate_id("task")
            shared_task_state.create_state(task_id)
            shared_task_state.save_job_meta(
                task_id,
                sequence=f"SEQUENCE{instance_id}",
                conversation_id=f"conv_{instance_id}",
            )
            return task_id

        # Create 10 tasks concurrently
        tasks = [create_task(i) for i in range(10)]
        task_ids = await asyncio.gather(*tasks)

        # All IDs should be unique
        assert len(set(task_ids)) == 10

        # All tasks should exist in Redis
        for task_id in task_ids:
            assert shared_task_state.job_exists(task_id)

    @pytest.mark.asyncio
    async def test_cancel_during_progress_update(self, shared_task_state):
        """Test cancel request arriving during progress updates.

        Scenario: SSE stream is updating progress, cancel arrives mid-stream.
        """
        task_id = generate_id("task")
        shared_task_state.create_state(task_id)

        cancel_detected = False

        async def simulate_sse_stream():
            """Simulate SSE stream with cancel checks."""
            nonlocal cancel_detected
            for progress in range(0, 101, 10):
                # Check cancel before each event (as in real code)
                if shared_task_state.is_canceled(task_id):
                    cancel_detected = True
                    return "canceled"

                shared_task_state.update_progress(task_id, progress)
                await asyncio.sleep(0.02)

            return "completed"

        async def send_cancel_after_delay():
            """Simulate cancel request from another instance."""
            await asyncio.sleep(0.05)  # Cancel after a few progress updates
            shared_task_state.mark_canceled(task_id)

        # Run stream and cancel concurrently
        stream_task = asyncio.create_task(simulate_sse_stream())
        cancel_task = asyncio.create_task(send_cancel_after_delay())

        result, _ = await asyncio.gather(stream_task, cancel_task)

        # Stream should have detected cancellation
        assert result == "canceled"
        assert cancel_detected
        assert shared_task_state.is_canceled(task_id)


class TestMultiInstanceWithRealRedis:
    """Tests that require real Redis connection.

    These tests verify actual Redis behavior in multi-instance scenarios.
    Skip if Redis is not available.
    """

    @pytest.fixture
    def real_task_state(self):
        """Use real Redis connection."""
        from app.db.redis_cache import get_redis_cache

        cache = get_redis_cache()
        # Test connection
        try:
            cache.ping()
        except Exception:
            pytest.skip("Redis not available")
        return TaskStateService(cache=cache)

    def test_real_redis_cancel_visibility(self, real_task_state):
        """Test that cancel is immediately visible via real Redis."""
        task_id = generate_id("task")

        try:
            # Create task
            real_task_state.create_state(task_id)
            assert not real_task_state.is_canceled(task_id)

            # Cancel task
            real_task_state.mark_canceled(task_id)

            # Should be immediately visible
            assert real_task_state.is_canceled(task_id)

            # State should reflect cancellation
            state = real_task_state.get_state(task_id)
            assert state["status"] == StatusType.canceled.value

        finally:
            # Cleanup
            real_task_state.delete_state(task_id)

    def test_real_redis_metadata_persistence(self, real_task_state):
        """Test task metadata persists in real Redis."""
        task_id = generate_id("task")
        sequence = "TESTSEQUENCE"
        conv_id = "conv_test123"

        try:
            # Save metadata
            real_task_state.save_job_meta(task_id, sequence=sequence, conversation_id=conv_id)

            # Retrieve and verify
            meta = real_task_state.get_job_meta(task_id)
            assert meta is not None
            assert meta["sequence"] == sequence
            assert meta["conversation_id"] == conv_id

            # Convenience method
            assert real_task_state.get_job_sequence(task_id) == sequence

        finally:
            # Cleanup
            real_task_state.delete_job_meta(task_id)
