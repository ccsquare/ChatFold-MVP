"""Multi-instance simulation tests.

These tests simulate multi-instance deployment scenarios by:
1. Using separate MemoryStore instances (simulating different processes)
2. Sharing Redis (as would happen in production)
3. Testing cross-instance operations like job cancellation and sequence retrieval

Run with: uv run pytest tests/integration/test_multi_instance.py -v
"""

import asyncio

import pytest

from app.components.nanocc import StatusType, StageType
from app.db.redis_cache import RedisCache
from app.db.redis_db import RedisDB
from app.services.job_state import JobStateService
from app.services.memory_store import MemoryStore
from app.utils import generate_id


class TestMultiInstanceJobCancel:
    """Test job cancellation across simulated instances."""

    @pytest.fixture
    def instance1_memory(self):
        """Simulate Instance 1's local memory store."""
        return MemoryStore()

    @pytest.fixture
    def instance2_memory(self):
        """Simulate Instance 2's local memory store."""
        return MemoryStore()

    @pytest.fixture
    def shared_job_state(self, fake_redis_client):
        """Shared Redis-backed job state service (simulates shared Redis)."""
        cache = RedisCache(db=RedisDB.JOB_STATE, client=fake_redis_client)
        return JobStateService(cache=cache)

    def test_cancel_from_different_instance(
        self, instance1_memory, instance2_memory, shared_job_state
    ):
        """Test: Instance 2 cancels a job created on Instance 1.

        Scenario:
        1. Instance 1 creates a job and stores in its local memory
        2. Instance 2 receives cancel request (job not in its memory)
        3. Instance 2 marks job as canceled in Redis
        4. Instance 1 checks Redis and sees the cancellation
        """
        job_id = generate_id("job")
        sequence = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSR"

        # Instance 1: Create job (save to local memory + Redis)
        instance1_memory.save_job_sequence(job_id, sequence)
        shared_job_state.create_state(job_id)
        shared_job_state.save_job_meta(job_id, sequence=sequence)

        # Verify Instance 1 can see the job
        assert instance1_memory.get_job_sequence(job_id) == sequence
        assert shared_job_state.get_state(job_id) is not None

        # Instance 2: Cannot see job in local memory (different process)
        assert instance2_memory.get_job_sequence(job_id) is None

        # Instance 2: But CAN see job in Redis (shared)
        assert shared_job_state.job_exists(job_id)
        assert shared_job_state.get_job_sequence(job_id) == sequence

        # Instance 2: Cancel the job via Redis
        shared_job_state.mark_canceled(job_id)

        # Instance 1: Check cancellation status from Redis
        assert shared_job_state.is_canceled(job_id)

        # Verify the helper function logic
        def is_job_canceled(job_id: str, job_state_svc, memory_store) -> bool:
            """Simulate _is_job_canceled() from jobs.py."""
            if job_state_svc.is_canceled(job_id):
                return True
            return memory_store.is_job_canceled(job_id)

        # Instance 1 should see cancellation via Redis
        assert is_job_canceled(job_id, shared_job_state, instance1_memory)

    def test_sequence_retrieval_cross_instance(
        self, instance1_memory, instance2_memory, shared_job_state
    ):
        """Test: Instance 2 retrieves sequence registered on Instance 1.

        Scenario:
        1. Instance 1 receives sequence registration request
        2. Instance 1 saves to local memory AND Redis
        3. Instance 2 needs to start SSE stream for same job
        4. Instance 2 retrieves sequence from Redis (not in local memory)
        """
        job_id = generate_id("job")
        sequence = "MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH"

        # Instance 1: Register sequence (save to both local memory and Redis)
        instance1_memory.save_job_sequence(job_id, sequence)
        shared_job_state.save_job_meta(job_id, sequence=sequence)

        # Instance 2: Try to get sequence
        # Local memory: empty
        assert instance2_memory.get_job_sequence(job_id) is None

        # Redis: has the sequence
        redis_sequence = shared_job_state.get_job_sequence(job_id)
        assert redis_sequence == sequence

        # Simulate the fallback logic from stream_job endpoint
        def get_sequence(job_id: str, job_state_svc, memory_store) -> str | None:
            """Simulate sequence retrieval logic from jobs.py."""
            return (
                job_state_svc.get_job_sequence(job_id)
                or memory_store.get_job_sequence(job_id)
            )

        # Instance 2 can get sequence via Redis fallback
        assert get_sequence(job_id, shared_job_state, instance2_memory) == sequence


class TestMultiInstanceConcurrentOperations:
    """Test concurrent operations from multiple instances."""

    @pytest.fixture
    def shared_job_state(self, fake_redis_client):
        """Shared Redis-backed job state service."""
        cache = RedisCache(db=RedisDB.JOB_STATE, client=fake_redis_client)
        return JobStateService(cache=cache)

    @pytest.mark.asyncio
    async def test_concurrent_state_updates(self, shared_job_state):
        """Test concurrent state updates from multiple 'instances'.

        Simulates multiple instances updating the same job's progress.
        Redis HSET is atomic, so last write wins (acceptable for progress).
        """
        job_id = generate_id("job")
        shared_job_state.create_state(job_id)

        async def update_progress(instance_id: int, progress: int):
            """Simulate an instance updating progress."""
            await asyncio.sleep(0.01 * (instance_id % 3))  # Simulate network jitter
            shared_job_state.update_progress(job_id, progress, f"Instance {instance_id}")
            return progress

        # Simulate 5 instances updating progress concurrently
        tasks = [
            update_progress(i, i * 20)
            for i in range(1, 6)
        ]
        results = await asyncio.gather(*tasks)

        # All updates should complete
        assert len(results) == 5

        # Final state should reflect one of the updates
        state = shared_job_state.get_state(job_id)
        assert state is not None
        assert state["progress"] in [20, 40, 60, 80, 100]

    @pytest.mark.asyncio
    async def test_concurrent_job_creation(self, shared_job_state):
        """Test concurrent job creation from multiple instances.

        Each job should get a unique ID (ULID guarantees this).
        """
        async def create_job(instance_id: int):
            """Simulate job creation from an instance."""
            job_id = generate_id("job")
            shared_job_state.create_state(job_id)
            shared_job_state.save_job_meta(
                job_id,
                sequence=f"SEQUENCE{instance_id}",
                conversation_id=f"conv_{instance_id}",
            )
            return job_id

        # Create 10 jobs concurrently
        tasks = [create_job(i) for i in range(10)]
        job_ids = await asyncio.gather(*tasks)

        # All IDs should be unique
        assert len(set(job_ids)) == 10

        # All jobs should exist in Redis
        for job_id in job_ids:
            assert shared_job_state.job_exists(job_id)

    @pytest.mark.asyncio
    async def test_cancel_during_progress_update(self, shared_job_state):
        """Test cancel request arriving during progress updates.

        Scenario: SSE stream is updating progress, cancel arrives mid-stream.
        """
        job_id = generate_id("job")
        shared_job_state.create_state(job_id)

        cancel_detected = False

        async def simulate_sse_stream():
            """Simulate SSE stream with cancel checks."""
            nonlocal cancel_detected
            for progress in range(0, 101, 10):
                # Check cancel before each event (as in real code)
                if shared_job_state.is_canceled(job_id):
                    cancel_detected = True
                    return "canceled"

                shared_job_state.update_progress(job_id, progress)
                await asyncio.sleep(0.02)

            return "completed"

        async def send_cancel_after_delay():
            """Simulate cancel request from another instance."""
            await asyncio.sleep(0.05)  # Cancel after a few progress updates
            shared_job_state.mark_canceled(job_id)

        # Run stream and cancel concurrently
        stream_task = asyncio.create_task(simulate_sse_stream())
        cancel_task = asyncio.create_task(send_cancel_after_delay())

        result, _ = await asyncio.gather(stream_task, cancel_task)

        # Stream should have detected cancellation
        assert result == "canceled"
        assert cancel_detected
        assert shared_job_state.is_canceled(job_id)


class TestMultiInstanceWithRealRedis:
    """Tests that require real Redis connection.

    These tests verify actual Redis behavior in multi-instance scenarios.
    Skip if Redis is not available.
    """

    @pytest.fixture
    def real_job_state(self):
        """Use real Redis connection."""
        from app.db.redis_cache import get_job_state_cache
        cache = get_job_state_cache()
        # Test connection
        try:
            cache.ping()
        except Exception:
            pytest.skip("Redis not available")
        return JobStateService(cache=cache)

    def test_real_redis_cancel_visibility(self, real_job_state):
        """Test that cancel is immediately visible via real Redis."""
        job_id = generate_id("job")

        try:
            # Create job
            real_job_state.create_state(job_id)
            assert not real_job_state.is_canceled(job_id)

            # Cancel job
            real_job_state.mark_canceled(job_id)

            # Should be immediately visible
            assert real_job_state.is_canceled(job_id)

            # State should reflect cancellation
            state = real_job_state.get_state(job_id)
            assert state["status"] == StatusType.canceled.value

        finally:
            # Cleanup
            real_job_state.delete_state(job_id)

    def test_real_redis_metadata_persistence(self, real_job_state):
        """Test job metadata persists in real Redis."""
        job_id = generate_id("job")
        sequence = "TESTSEQUENCE"
        conv_id = "conv_test123"

        try:
            # Save metadata
            real_job_state.save_job_meta(job_id, sequence=sequence, conversation_id=conv_id)

            # Retrieve and verify
            meta = real_job_state.get_job_meta(job_id)
            assert meta is not None
            assert meta["sequence"] == sequence
            assert meta["conversation_id"] == conv_id

            # Convenience method
            assert real_job_state.get_job_sequence(job_id) == sequence

        finally:
            # Cleanup
            real_job_state.delete_job_meta(job_id)
