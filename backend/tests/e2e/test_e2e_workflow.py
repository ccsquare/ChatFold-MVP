"""End-to-End workflow tests for ChatFold.

This module provides comprehensive E2E tests covering the core user workflows:
1. Health check and service availability
2. User management
3. Folder lifecycle (create, update, delete)
4. Folder input management (FASTA, PDB files)
5. Conversation lifecycle
6. Folder-Conversation linking
7. Job creation and state management
8. Job SSE streaming simulation
9. Job cancellation
10. Structure storage and retrieval
11. Redis state consistency
12. Cross-component integration

Run these tests after any significant code changes to ensure core functionality.

Usage:
    # Run all E2E tests
    uv run pytest tests/e2e/test_e2e_workflow.py -v

    # Run specific test class
    uv run pytest tests/e2e/test_e2e_workflow.py::TestCompleteWorkflow -v

    # Run with coverage
    uv run pytest tests/e2e/test_e2e_workflow.py -v --cov=app

Requirements:
    - Redis server running (localhost:6379)
    - MySQL server running (for persistent mode)
    - Environment: CHATFOLD_USE_MEMORY_STORE=true for isolated testing
"""

import time
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.components.nanocc.job import EventType, JobEvent, StageType, StatusType
from app.db.redis_db import RedisKeyPrefix
from app.main import app
from app.services.job_state import job_state_service
from app.services.sse_events import sse_events_service
from app.utils import get_timestamp_ms


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Create test client with app context."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def unique_suffix() -> str:
    """Generate unique suffix for test isolation."""
    return f"{int(time.time() * 1000)}"


class TestHealthCheck:
    """Test service availability and health endpoints."""

    def test_health_endpoint(self, client: TestClient):
        """Verify health endpoint returns 200."""
        response = client.get("/api/v1/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    def test_root_redirect_or_info(self, client: TestClient):
        """Verify root endpoint is accessible."""
        response = client.get("/")

        # Root should return 200 with app info or redirect
        assert response.status_code in (200, 307)


class TestUserWorkflow:
    """Test user management workflow."""

    def test_get_current_user(self, client: TestClient):
        """Get current user (default user for MVP)."""
        response = client.get("/api/v1/users/me")

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["id"].startswith("user_")
        assert "name" in data
        assert "email" in data

    def test_update_current_user(self, client: TestClient):
        """Update current user profile."""
        response = client.patch(
            "/api/v1/users/me",
            params={"name": "E2E Test User"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "E2E Test User"

    def test_get_user_not_found(self, client: TestClient):
        """Get non-existent user returns 404."""
        response = client.get("/api/v1/users/user_nonexistent")

        assert response.status_code == 404


class TestFolderWorkflow:
    """Test complete folder lifecycle."""

    def test_folder_crud_workflow(self, client: TestClient, unique_suffix: str):
        """Test create -> read -> update -> delete flow."""
        folder_name = f"E2E Test Folder {unique_suffix}"

        # 1. Create folder
        create_response = client.post(
            "/api/v1/folders",
            json={"name": folder_name},
        )
        assert create_response.status_code == 200
        folder = create_response.json()
        folder_id = folder["id"]
        assert folder["name"] == folder_name
        assert folder_id.startswith("folder_")

        # 2. Read folder
        get_response = client.get(f"/api/v1/folders/{folder_id}")
        assert get_response.status_code == 200
        assert get_response.json()["id"] == folder_id

        # 3. List folders (should include our folder)
        list_response = client.get("/api/v1/folders")
        assert list_response.status_code == 200
        folder_ids = [f["id"] for f in list_response.json()]
        assert folder_id in folder_ids

        # 4. Update folder
        update_response = client.patch(
            f"/api/v1/folders/{folder_id}",
            params={"name": f"Updated {folder_name}"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["name"] == f"Updated {folder_name}"

        # 5. Delete folder
        delete_response = client.delete(f"/api/v1/folders/{folder_id}")
        assert delete_response.status_code == 200

        # 6. Verify deleted
        get_deleted = client.get(f"/api/v1/folders/{folder_id}")
        assert get_deleted.status_code == 404

    def test_folder_with_inputs(self, client: TestClient, unique_suffix: str):
        """Test folder with input file management."""
        # Create folder
        folder = client.post(
            "/api/v1/folders",
            json={"name": f"Input Test {unique_suffix}"},
        ).json()
        folder_id = folder["id"]

        try:
            # Add FASTA input
            fasta_response = client.post(
                f"/api/v1/folders/{folder_id}/inputs",
                json={
                    "name": "sequence.fasta",
                    "type": "fasta",
                    "content": ">test_protein\nMVLSPADKTNVKAAWGKVGAHAGEYGAE",
                },
            )
            assert fasta_response.status_code == 200
            fasta_asset = fasta_response.json()
            assert fasta_asset["type"] == "fasta"

            # Add PDB input
            pdb_content = """HEADER    TEST STRUCTURE
ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N
ATOM      2  CA  ALA A   1       1.458   0.000   0.000  1.00  0.00           C
END
"""
            pdb_response = client.post(
                f"/api/v1/folders/{folder_id}/inputs",
                json={
                    "name": "template.pdb",
                    "type": "pdb",
                    "content": pdb_content,
                },
            )
            assert pdb_response.status_code == 200
            assert pdb_response.json()["type"] == "pdb"

            # List inputs
            inputs_response = client.get(f"/api/v1/folders/{folder_id}/inputs")
            assert inputs_response.status_code == 200
            inputs = inputs_response.json()
            assert len(inputs) == 2
            input_names = [i["name"] for i in inputs]
            assert "sequence.fasta" in input_names
            assert "template.pdb" in input_names

        finally:
            # Cleanup
            client.delete(f"/api/v1/folders/{folder_id}")


class TestConversationWorkflow:
    """Test conversation lifecycle."""

    def test_conversation_crud_workflow(self, client: TestClient, unique_suffix: str):
        """Test create -> read -> list -> delete flow."""
        # 1. Create conversation
        create_response = client.post(
            "/api/v1/conversations",
            json={"title": f"E2E Conversation {unique_suffix}"},
        )
        assert create_response.status_code == 200
        data = create_response.json()
        conv_id = data["conversationId"]
        assert conv_id.startswith("conv_")

        try:
            # 2. Get conversation
            get_response = client.get(f"/api/v1/conversations/{conv_id}")
            assert get_response.status_code == 200
            assert get_response.json()["conversation"]["id"] == conv_id

            # 3. List conversations
            list_response = client.get("/api/v1/conversations")
            assert list_response.status_code == 200
            conv_ids = [c["id"] for c in list_response.json()["conversations"]]
            assert conv_id in conv_ids

        finally:
            # 4. Delete conversation
            delete_response = client.delete(f"/api/v1/conversations/{conv_id}")
            assert delete_response.status_code == 200

        # 5. Verify deleted
        get_deleted = client.get(f"/api/v1/conversations/{conv_id}")
        assert get_deleted.status_code == 404


class TestFolderConversationIntegration:
    """Test folder-conversation 1:1 linking."""

    def test_link_folder_conversation(self, client: TestClient, unique_suffix: str):
        """Test linking folder and conversation."""
        # Create folder
        folder = client.post(
            "/api/v1/folders",
            json={"name": f"Link Test {unique_suffix}"},
        ).json()
        folder_id = folder["id"]

        # Create conversation
        conv_data = client.post(
            "/api/v1/conversations",
            json={"title": f"Link Conv {unique_suffix}"},
        ).json()
        conv_id = conv_data["conversationId"]

        try:
            # Link them
            link_response = client.post(
                f"/api/v1/folders/{folder_id}/link-conversation",
                params={"conversation_id": conv_id},
            )
            assert link_response.status_code == 200
            assert link_response.json()["conversationId"] == conv_id

            # Verify link persists
            folder_data = client.get(f"/api/v1/folders/{folder_id}").json()
            assert folder_data["conversationId"] == conv_id

        finally:
            # Cleanup
            client.delete(f"/api/v1/folders/{folder_id}")
            client.delete(f"/api/v1/conversations/{conv_id}")

    def test_create_folder_with_conversation(self, client: TestClient, unique_suffix: str):
        """Test creating folder with pre-linked conversation."""
        # Create conversation first
        conv_data = client.post(
            "/api/v1/conversations",
            json={"title": f"Pre-link Conv {unique_suffix}"},
        ).json()
        conv_id = conv_data["conversationId"]

        try:
            # Create folder with conversation ID
            folder = client.post(
                "/api/v1/folders",
                json={
                    "name": f"Pre-linked Folder {unique_suffix}",
                    "conversationId": conv_id,
                },
            ).json()

            assert folder["conversationId"] == conv_id

            # Cleanup folder
            client.delete(f"/api/v1/folders/{folder['id']}")

        finally:
            client.delete(f"/api/v1/conversations/{conv_id}")


class TestJobWorkflow:
    """Test job creation and management."""

    def test_job_creation(self, client: TestClient):
        """Test creating a folding job."""
        response = client.post(
            "/api/v1/jobs",
            json={"sequence": "MVLSPADKTNVKAAWGKVGAHAGEYGAE"},
        )

        assert response.status_code == 200
        data = response.json()
        job_id = data["jobId"]
        assert job_id.startswith("job_")

        # Verify job in response
        assert "job" in data
        job = data["job"]
        assert job["id"] == job_id
        assert job["status"] == "queued"
        assert job["sequence"] == "MVLSPADKTNVKAAWGKVGAHAGEYGAE"

        # Cleanup Redis state
        job_state_service.delete_state(job_id)

    def test_job_creation_with_conversation(self, client: TestClient, unique_suffix: str):
        """Test creating job with conversation ID."""
        conv_id = f"conv_test{unique_suffix}"

        response = client.post(
            "/api/v1/jobs",
            json={
                "sequence": "MVLSPADKTNVKAAWG",
                "conversationId": conv_id,
            },
        )

        assert response.status_code == 200
        job = response.json()["job"]
        assert job["conversationId"] == conv_id

        # Cleanup
        job_state_service.delete_state(job["id"])

    def test_job_validation_errors(self, client: TestClient):
        """Test job creation with invalid sequences."""
        # Invalid characters
        response = client.post(
            "/api/v1/jobs",
            json={"sequence": "INVALID123!@#"},
        )
        assert response.status_code == 400

        # Too short sequence (less than 10 amino acids)
        response = client.post(
            "/api/v1/jobs",
            json={"sequence": "MVL"},
        )
        assert response.status_code == 400

    def test_list_jobs(self, client: TestClient):
        """Test listing jobs."""
        # Create a job
        create_response = client.post(
            "/api/v1/jobs",
            json={"sequence": "MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFL"},
        )
        job_id = create_response.json()["jobId"]

        try:
            # List all jobs
            list_response = client.get("/api/v1/jobs")
            assert list_response.status_code == 200
            assert "jobs" in list_response.json()

            # Get specific job
            get_response = client.get(f"/api/v1/jobs?jobId={job_id}")
            assert get_response.status_code == 200
            assert get_response.json()["job"]["id"] == job_id

        finally:
            job_state_service.delete_state(job_id)


class TestJobStateRedisIntegration:
    """Test job state management via Redis."""

    def test_job_state_creation(self, client: TestClient):
        """Test that job creation creates Redis state."""
        response = client.post(
            "/api/v1/jobs",
            json={"sequence": "MVLSPADKTNVKAAWG"},
        )

        job_id = response.json()["jobId"]

        try:
            # Verify Redis state exists
            state = job_state_service.get_state(job_id)
            assert state is not None
            assert state["status"] == StatusType.queued.value
            assert state["stage"] == StageType.QUEUED.value

            # Verify via API endpoint
            state_response = client.get(f"/api/v1/jobs/{job_id}/state")
            assert state_response.status_code == 200
            api_state = state_response.json()["state"]
            assert api_state["status"] == "queued"

        finally:
            job_state_service.delete_state(job_id)

    def test_job_state_updates(self, client: TestClient, unique_suffix: str):
        """Test job state updates via service."""
        job_id = f"job_e2e{unique_suffix}"

        # Create initial state
        job_state_service.create_state(
            job_id,
            status=StatusType.queued,
            stage=StageType.QUEUED,
            message="Waiting",
        )

        try:
            # Update to running
            job_state_service.set_state(
                job_id,
                status=StatusType.running,
                stage=StageType.MSA,
                progress=25,
                message="Building MSA",
            )

            # Verify update
            state = job_state_service.get_state(job_id)
            assert state["status"] == "running"
            assert state["stage"] == "MSA"
            assert state["progress"] == 25

            # Update progress
            job_state_service.update_progress(job_id, 50)
            state = job_state_service.get_state(job_id)
            assert state["progress"] == 50

        finally:
            job_state_service.delete_state(job_id)


class TestJobEventsWorkflow:
    """Test SSE events queue management."""

    def test_push_and_retrieve_events(self, client: TestClient, unique_suffix: str):
        """Test pushing events and retrieving them."""
        job_id = f"job_evt{unique_suffix}"

        try:
            # Push multiple events
            for i in range(5):
                event = JobEvent(
                    eventId=f"evt_{job_id}_{i + 1:04d}",
                    jobId=job_id,
                    ts=get_timestamp_ms(),
                    eventType=EventType.THINKING_TEXT,
                    stage=StageType.MODEL,
                    status=StatusType.running,
                    progress=i * 20,
                    message=f"Processing step {i + 1}",
                )
                sse_events_service.push_event(event)

            # Retrieve via API
            response = client.get(f"/api/v1/jobs/{job_id}/events")
            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 5
            assert data["total"] == 5
            assert len(data["events"]) == 5

            # Verify ordering
            assert data["events"][0]["eventId"] == f"evt_{job_id}_0001"
            assert data["events"][4]["eventId"] == f"evt_{job_id}_0005"

        finally:
            sse_events_service.delete_events(job_id)

    def test_events_pagination(self, client: TestClient, unique_suffix: str):
        """Test event retrieval with offset and limit."""
        job_id = f"job_page{unique_suffix}"

        try:
            # Push 10 events
            for i in range(10):
                event = JobEvent(
                    eventId=f"evt_{job_id}_{i + 1:04d}",
                    jobId=job_id,
                    ts=get_timestamp_ms(),
                    eventType=EventType.THINKING_TEXT,
                    stage=StageType.MODEL,
                    status=StatusType.running,
                    progress=i * 10,
                    message=f"Step {i + 1}",
                )
                sse_events_service.push_event(event)

            # Get with offset
            response = client.get(f"/api/v1/jobs/{job_id}/events?offset=3&limit=4")
            assert response.status_code == 200
            data = response.json()
            assert data["offset"] == 3
            assert data["count"] == 4
            assert data["total"] == 10
            assert data["events"][0]["eventId"] == f"evt_{job_id}_0004"

        finally:
            sse_events_service.delete_events(job_id)


class TestJobCancellation:
    """Test job cancellation workflow."""

    def test_cancel_job(self, client: TestClient):
        """Test canceling a running job."""
        # Create job
        create_response = client.post(
            "/api/v1/jobs",
            json={"sequence": "MVLSPADKTNVKAAWG"},
        )
        job_id = create_response.json()["jobId"]

        try:
            # Cancel job
            cancel_response = client.post(f"/api/v1/jobs/{job_id}/cancel")
            assert cancel_response.status_code == 200
            data = cancel_response.json()
            assert data["ok"] is True
            assert data["status"] == "canceled"

            # Verify canceled state
            state = job_state_service.get_state(job_id)
            assert state["status"] == "canceled"

        finally:
            job_state_service.delete_state(job_id)

    def test_cancel_invalid_job_id(self, client: TestClient):
        """Test canceling with invalid job ID."""
        response = client.post("/api/v1/jobs/invalid_format/cancel")
        assert response.status_code == 400
        assert "Invalid job ID" in response.json()["detail"]


class TestStructureWorkflow:
    """Test structure storage and retrieval."""

    def test_structure_generation_with_sequence(self, client: TestClient, unique_suffix: str):
        """Test structure generation from sequence."""
        structure_id = f"str_e2e_{unique_suffix}"

        # Get structure (will generate mock)
        response = client.get(
            f"/api/v1/structures/{structure_id}",
            params={"sequence": "MVLSPADKTNVKAAWG"},
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "chemical/x-pdb"
        content = response.content.decode()
        assert "ATOM" in content  # PDB format contains ATOM records

    def test_cache_and_retrieve_structure(self, client: TestClient, unique_suffix: str):
        """Test caching structure and retrieving it."""
        structure_id = f"str_cache_{unique_suffix}"
        pdb_data = """HEADER    E2E TEST
ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N
END
"""

        # Cache structure
        cache_response = client.post(
            f"/api/v1/structures/{structure_id}",
            json={"pdbData": pdb_data},
        )
        assert cache_response.status_code == 200
        assert cache_response.json()["ok"] is True

        # Retrieve cached structure
        get_response = client.get(f"/api/v1/structures/{structure_id}")
        assert get_response.status_code == 200
        assert "E2E TEST" in get_response.content.decode()

    def test_structure_info(self, client: TestClient, unique_suffix: str):
        """Test getting structure info."""
        structure_id = f"str_info_{unique_suffix}"

        # Cache a structure first
        client.post(
            f"/api/v1/structures/{structure_id}",
            json={"pdbData": "HEADER TEST\nEND\n"},
        )

        # Get info
        response = client.get(f"/api/v1/structures/{structure_id}/info")
        assert response.status_code == 200
        data = response.json()
        assert data["structureId"] == structure_id
        assert "inMemory" in data
        assert "storageMode" in data


class TestRedisKeyPrefixConsistency:
    """Test Redis key prefix usage across services."""

    def test_job_state_key_format(self, unique_suffix: str):
        """Verify job state uses correct key format."""
        job_id = f"job_key{unique_suffix}"

        # Create state
        job_state_service.create_state(
            job_id,
            status=StatusType.queued,
            stage=StageType.QUEUED,
            message="Test",
        )

        try:
            # Verify key format
            expected_key = RedisKeyPrefix.job_state_key(job_id)
            assert expected_key == f"chatfold:job:state:{job_id}"

            # Verify data exists at expected key
            from app.db.redis_cache import get_redis_cache

            cache = get_redis_cache()
            data = cache.hgetall(expected_key)
            assert data is not None
            assert data["status"] == "queued"

        finally:
            job_state_service.delete_state(job_id)

    def test_sse_events_key_format(self, unique_suffix: str):
        """Verify SSE events uses correct key format."""
        job_id = f"job_sse{unique_suffix}"

        # Push event
        event = JobEvent(
            eventId=f"evt_{job_id}_0001",
            jobId=job_id,
            ts=get_timestamp_ms(),
            eventType=EventType.THINKING_TEXT,
            stage=StageType.MSA,
            status=StatusType.running,
            progress=10,
            message="Test event",
        )
        sse_events_service.push_event(event)

        try:
            # Verify key format
            expected_key = RedisKeyPrefix.job_events_key(job_id)
            assert expected_key == f"chatfold:job:events:{job_id}"

            # Verify data exists
            events = sse_events_service.get_events(job_id, 0, -1)
            assert len(events) == 1
            assert events[0].eventId == f"evt_{job_id}_0001"

        finally:
            sse_events_service.delete_events(job_id)


class TestCompleteWorkflow:
    """Test complete end-to-end workflow simulating real user scenario."""

    def test_full_protein_folding_workflow(self, client: TestClient, unique_suffix: str):
        """Simulate complete user workflow from folder creation to job completion."""
        folder_id = None
        conv_id = None
        job_id = None

        try:
            # Step 1: Create folder for the project
            folder_response = client.post(
                "/api/v1/folders",
                json={"name": f"Hemoglobin Study {unique_suffix}"},
            )
            assert folder_response.status_code == 200
            folder = folder_response.json()
            folder_id = folder["id"]

            # Step 2: Add input FASTA file
            fasta_sequence = "MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH"
            input_response = client.post(
                f"/api/v1/folders/{folder_id}/inputs",
                json={
                    "name": "hemoglobin_alpha.fasta",
                    "type": "fasta",
                    "content": f">hemoglobin_alpha\n{fasta_sequence}",
                },
            )
            assert input_response.status_code == 200

            # Step 3: Create conversation for chat
            conv_response = client.post(
                "/api/v1/conversations",
                json={
                    "title": "Hemoglobin Folding Chat",
                    "folderId": folder_id,
                },
            )
            assert conv_response.status_code == 200
            conv_id = conv_response.json()["conversationId"]

            # Step 4: Link folder and conversation
            link_response = client.post(
                f"/api/v1/folders/{folder_id}/link-conversation",
                params={"conversation_id": conv_id},
            )
            assert link_response.status_code == 200

            # Step 5: Create folding job
            job_response = client.post(
                "/api/v1/jobs",
                json={
                    "sequence": fasta_sequence,
                    "conversationId": conv_id,
                },
            )
            assert job_response.status_code == 200
            job = job_response.json()["job"]
            job_id = job["id"]

            # Step 6: Verify job state in Redis
            state = job_state_service.get_state(job_id)
            assert state is not None
            assert state["status"] == "queued"

            # Step 7: Simulate job progress (what SSE stream would do)
            job_state_service.set_state(
                job_id,
                status=StatusType.running,
                stage=StageType.MSA,
                progress=25,
                message="Building multiple sequence alignment",
            )

            job_state_service.set_state(
                job_id,
                status=StatusType.running,
                stage=StageType.MODEL,
                progress=50,
                message="Running structure prediction",
            )

            job_state_service.set_state(
                job_id,
                status=StatusType.running,
                stage=StageType.RELAX,
                progress=75,
                message="Relaxing structure",
            )

            job_state_service.mark_complete(job_id, "Job completed successfully")

            # Step 8: Verify final state
            final_state = job_state_service.get_state(job_id)
            assert final_state["status"] == "complete"
            assert final_state["stage"] == "DONE"

            # Step 9: Get job state via API
            state_response = client.get(f"/api/v1/jobs/{job_id}/state")
            assert state_response.status_code == 200
            api_state = state_response.json()["state"]
            assert api_state["status"] == "complete"

            # Step 10: Verify folder still intact with conversation link
            folder_check = client.get(f"/api/v1/folders/{folder_id}")
            assert folder_check.status_code == 200
            assert folder_check.json()["conversationId"] == conv_id

        finally:
            # Cleanup
            if job_id:
                job_state_service.delete_state(job_id)
            if folder_id:
                client.delete(f"/api/v1/folders/{folder_id}")
            if conv_id:
                client.delete(f"/api/v1/conversations/{conv_id}")

    def test_multiple_jobs_isolation(self, client: TestClient, unique_suffix: str):
        """Test that multiple jobs maintain separate states."""
        job_ids = []

        try:
            # Create 3 jobs
            for i in range(3):
                response = client.post(
                    "/api/v1/jobs",
                    json={"sequence": f"MVLSPADKTNVKAAW{'G' * (i + 1)}"},
                )
                assert response.status_code == 200
                job_ids.append(response.json()["jobId"])

            # Update each with different progress
            for i, job_id in enumerate(job_ids):
                job_state_service.set_state(
                    job_id,
                    status=StatusType.running,
                    stage=StageType.MODEL,
                    progress=(i + 1) * 25,
                    message=f"Job {i + 1} processing",
                )

            # Verify isolation
            for i, job_id in enumerate(job_ids):
                state = job_state_service.get_state(job_id)
                assert state["progress"] == (i + 1) * 25
                assert f"Job {i + 1}" in state["message"]

        finally:
            for job_id in job_ids:
                job_state_service.delete_state(job_id)


class TestErrorHandling:
    """Test error handling and edge cases."""

    def test_invalid_job_id_format(self, client: TestClient):
        """Test various invalid job ID formats."""
        invalid_ids = [
            "invalid",
            "job-123",  # hyphen instead of underscore
            "JOB_123",  # uppercase
            "job_",  # empty suffix
            "job_ABC",  # uppercase in suffix
        ]

        for invalid_id in invalid_ids:
            response = client.get(f"/api/v1/jobs/{invalid_id}/state")
            assert response.status_code == 400, f"Expected 400 for {invalid_id}"

    def test_missing_required_fields(self, client: TestClient):
        """Test API responses for missing required fields."""
        # Empty job creation (should use default sequence)
        response = client.post("/api/v1/jobs", json={})
        # With no sequence, it should still work using default
        assert response.status_code in (200, 400)

    def test_concurrent_folder_operations(self, client: TestClient, unique_suffix: str):
        """Test rapid folder operations don't cause issues."""
        folder_ids = []

        try:
            # Rapidly create folders
            for i in range(5):
                response = client.post(
                    "/api/v1/folders",
                    json={"name": f"Concurrent {unique_suffix} {i}"},
                )
                assert response.status_code == 200
                folder_ids.append(response.json()["id"])

            # Rapidly update them
            for folder_id in folder_ids:
                response = client.patch(
                    f"/api/v1/folders/{folder_id}",
                    params={"name": f"Updated {folder_id}"},
                )
                assert response.status_code == 200

            # Verify all exist
            list_response = client.get("/api/v1/folders")
            assert list_response.status_code == 200
            all_ids = [f["id"] for f in list_response.json()]
            for folder_id in folder_ids:
                assert folder_id in all_ids

        finally:
            for folder_id in folder_ids:
                client.delete(f"/api/v1/folders/{folder_id}")


# Run summary when executed directly
if __name__ == "__main__":
    print("""
ChatFold E2E Test Suite
=======================

This test suite covers:
- Health check
- User management
- Folder CRUD and inputs
- Conversation lifecycle
- Folder-Conversation linking
- Job creation and state management
- SSE events workflow
- Job cancellation
- Structure storage
- Redis key prefix consistency
- Complete workflow simulation
- Error handling

Run with: uv run pytest tests/e2e/test_e2e_workflow.py -v
""")
