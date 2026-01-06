"""Tests for DataConsistencyService.

These tests verify the data consistency service that coordinates
MySQL, Redis, and FileSystem operations.
"""

import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.components.nanocc.job import EventType, JobEvent, StageType, StatusType
from app.db.models import Base, Job, Project, User
from app.repositories.job import JobRepository
from app.repositories.job_event import JobEventRepository
from app.repositories.learning_record import LearningRecordRepository
from app.repositories.structure import StructureRepository
from app.services.data_consistency import DataConsistencyService
from app.utils import generate_id, get_timestamp_ms


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
    )

    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def setup_data(db_session: Session):
    """Create default user, project, and job for tests."""
    # Create user
    user = User(
        id="user_default",
        name="Default User",
        email="default@example.com",
        plan="free",
        created_at=get_timestamp_ms(),
    )
    db_session.add(user)

    # Create project
    project = Project(
        id="project_default",
        user_id="user_default",
        name="Default Project",
        description="Test project",
        created_at=get_timestamp_ms(),
        updated_at=get_timestamp_ms(),
    )
    db_session.add(project)

    # Create job
    job = Job(
        id="job_test001",
        user_id="user_default",
        job_type="folding",
        status="queued",
        stage="QUEUED",
        sequence="MVLSPADKTNVKAAWG",
        created_at=get_timestamp_ms(),
    )
    db_session.add(job)
    db_session.commit()

    return {
        "user_id": "user_default",
        "project_id": "project_default",
        "job_id": "job_test001",
    }


@pytest.fixture
def mock_services():
    """Create mock Redis services."""
    job_state_svc = MagicMock()
    sse_events_svc = MagicMock()
    return job_state_svc, sse_events_svc


class TestDualWrite:
    """Test MySQL-Redis dual write operations."""

    def test_create_job_state_dual_write(self, db_session: Session, setup_data, mock_services):
        """Create job state updates both MySQL and Redis."""
        job_state_svc, sse_events_svc = mock_services

        service = DataConsistencyService(
            job_repo=JobRepository(),
            structure_repo=StructureRepository(),
            job_event_repo=JobEventRepository(),
            learning_record_repo=LearningRecordRepository(),
            job_state_svc=job_state_svc,
            sse_events_svc=sse_events_svc,
        )

        result = service.create_job_state(
            db_session,
            job_id=setup_data["job_id"],
            status=StatusType.running,
            stage=StageType.MSA,
            message="Starting MSA",
        )

        assert result is True

        # Verify MySQL was updated
        job = db_session.get(Job, setup_data["job_id"])
        assert job.status == "running"
        assert job.stage == "MSA"

        # Verify Redis was called
        job_state_svc.create_state.assert_called_once()

    def test_create_job_state_redis_failure_still_succeeds(self, db_session: Session, setup_data, mock_services):
        """MySQL success with Redis failure still returns True."""
        job_state_svc, sse_events_svc = mock_services
        job_state_svc.create_state.side_effect = Exception("Redis connection error")

        service = DataConsistencyService(
            job_repo=JobRepository(),
            structure_repo=StructureRepository(),
            job_event_repo=JobEventRepository(),
            learning_record_repo=LearningRecordRepository(),
            job_state_svc=job_state_svc,
            sse_events_svc=sse_events_svc,
        )

        result = service.create_job_state(
            db_session,
            job_id=setup_data["job_id"],
            status=StatusType.running,
            stage=StageType.MSA,
        )

        # Should still succeed because MySQL is source of truth
        assert result is True

        # Verify MySQL was updated despite Redis failure
        job = db_session.get(Job, setup_data["job_id"])
        assert job.status == "running"

    def test_complete_job_dual_write(self, db_session: Session, setup_data, mock_services):
        """Complete job updates MySQL and Redis, creates learning record."""
        job_state_svc, sse_events_svc = mock_services

        service = DataConsistencyService(
            job_repo=JobRepository(),
            structure_repo=StructureRepository(),
            job_event_repo=JobEventRepository(),
            learning_record_repo=LearningRecordRepository(),
            job_state_svc=job_state_svc,
            sse_events_svc=sse_events_svc,
        )

        result = service.complete_job(db_session, setup_data["job_id"])

        assert result is True

        # Verify MySQL
        job = db_session.get(Job, setup_data["job_id"])
        assert job.status == "complete"
        assert job.stage == "DONE"
        assert job.completed_at is not None

        # Verify Redis
        job_state_svc.mark_complete.assert_called_once()
        sse_events_svc.set_completion_ttl.assert_called_once()

        # Verify learning record was created
        from app.db.models import LearningRecord

        record = db_session.query(LearningRecord).filter_by(job_id=setup_data["job_id"]).first()
        assert record is not None
        assert record.input_sequence == "MVLSPADKTNVKAAWG"

    def test_fail_job_dual_write(self, db_session: Session, setup_data, mock_services):
        """Fail job updates both MySQL and Redis."""
        job_state_svc, sse_events_svc = mock_services

        service = DataConsistencyService(
            job_repo=JobRepository(),
            structure_repo=StructureRepository(),
            job_event_repo=JobEventRepository(),
            learning_record_repo=LearningRecordRepository(),
            job_state_svc=job_state_svc,
            sse_events_svc=sse_events_svc,
        )

        result = service.fail_job(db_session, setup_data["job_id"], "Test error")

        assert result is True

        # Verify MySQL
        job = db_session.get(Job, setup_data["job_id"])
        assert job.status == "failed"
        assert job.stage == "ERROR"

        # Verify Redis
        job_state_svc.mark_failed.assert_called_once_with(setup_data["job_id"], "Test error")


class TestFallbackStrategy:
    """Test Redis-to-MySQL fallback strategies."""

    def test_get_job_state_from_redis(self, db_session: Session, setup_data, mock_services):
        """Get job state from Redis when available."""
        job_state_svc, sse_events_svc = mock_services
        job_state_svc.get_state.return_value = {
            "status": "running",
            "stage": "MODEL",
            "progress": 50,
            "message": "Processing",
            "updated_at": get_timestamp_ms(),
        }

        service = DataConsistencyService(
            job_repo=JobRepository(),
            structure_repo=StructureRepository(),
            job_event_repo=JobEventRepository(),
            learning_record_repo=LearningRecordRepository(),
            job_state_svc=job_state_svc,
            sse_events_svc=sse_events_svc,
        )

        state = service.get_job_state_with_fallback(db_session, setup_data["job_id"])

        assert state is not None
        assert state["status"] == "running"
        assert state["progress"] == 50

    def test_get_job_state_fallback_to_mysql(self, db_session: Session, setup_data, mock_services):
        """Fall back to MySQL when Redis returns None."""
        job_state_svc, sse_events_svc = mock_services
        job_state_svc.get_state.return_value = None

        service = DataConsistencyService(
            job_repo=JobRepository(),
            structure_repo=StructureRepository(),
            job_event_repo=JobEventRepository(),
            learning_record_repo=LearningRecordRepository(),
            job_state_svc=job_state_svc,
            sse_events_svc=sse_events_svc,
        )

        state = service.get_job_state_with_fallback(db_session, setup_data["job_id"])

        assert state is not None
        assert state["status"] == "queued"  # From MySQL

    def test_get_job_state_fallback_on_redis_error(self, db_session: Session, setup_data, mock_services):
        """Fall back to MySQL when Redis throws an error."""
        job_state_svc, sse_events_svc = mock_services
        job_state_svc.get_state.side_effect = Exception("Redis connection error")

        service = DataConsistencyService(
            job_repo=JobRepository(),
            structure_repo=StructureRepository(),
            job_event_repo=JobEventRepository(),
            learning_record_repo=LearningRecordRepository(),
            job_state_svc=job_state_svc,
            sse_events_svc=sse_events_svc,
        )

        state = service.get_job_state_with_fallback(db_session, setup_data["job_id"])

        assert state is not None
        assert state["status"] == "queued"  # From MySQL


class TestStructureFileAssociation:
    """Test MySQL-FileSystem association for structures."""

    def test_create_structure_with_file(self, db_session: Session, setup_data, mock_services):
        """Create structure record and associated file."""
        job_state_svc, sse_events_svc = mock_services

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("app.services.data_consistency.filesystem_service") as mock_fs:
                mock_fs.ensure_structures_dir.return_value = Path(tmpdir)
                mock_fs.write_file.return_value = 100

                service = DataConsistencyService(
                    job_repo=JobRepository(),
                    structure_repo=StructureRepository(),
                    job_event_repo=JobEventRepository(),
                    learning_record_repo=LearningRecordRepository(),
                    job_state_svc=job_state_svc,
                    sse_events_svc=sse_events_svc,
                )

                structure = service.create_structure_with_file(
                    db_session,
                    job_id=setup_data["job_id"],
                    label="candidate-1",
                    pdb_content="ATOM 1 N ALA A 1 0.0 0.0 0.0",
                    plddt_score=85,
                )

                assert structure is not None
                assert structure.label == "candidate-1"
                assert structure.plddt_score == 85
                assert "candidate-1.pdb" in structure.file_path

                # Verify file write was called
                mock_fs.write_file.assert_called_once()


class TestEventPersistence:
    """Test SSE event persistence to MySQL."""

    def test_persist_event(self, db_session: Session, setup_data, mock_services):
        """Persist SSE event to MySQL."""
        job_state_svc, sse_events_svc = mock_services

        service = DataConsistencyService(
            job_repo=JobRepository(),
            structure_repo=StructureRepository(),
            job_event_repo=JobEventRepository(),
            learning_record_repo=LearningRecordRepository(),
            job_state_svc=job_state_svc,
            sse_events_svc=sse_events_svc,
        )

        event = JobEvent(
            eventId=generate_id("evt"),
            jobId=setup_data["job_id"],
            ts=get_timestamp_ms(),
            eventType=EventType.THINKING_TEXT,
            stage=StageType.MODEL,
            status=StatusType.running,
            progress=50,
            message="Processing structure...",
            blockIndex=1,
        )

        job_event = service.persist_event(db_session, event)

        assert job_event is not None
        assert job_event.job_id == setup_data["job_id"]
        assert job_event.event_type == "THINKING_TEXT"
        assert job_event.block_index == 1

    def test_push_and_persist_event(self, db_session: Session, setup_data, mock_services):
        """Push event to Redis and persist to MySQL."""
        job_state_svc, sse_events_svc = mock_services

        service = DataConsistencyService(
            job_repo=JobRepository(),
            structure_repo=StructureRepository(),
            job_event_repo=JobEventRepository(),
            learning_record_repo=LearningRecordRepository(),
            job_state_svc=job_state_svc,
            sse_events_svc=sse_events_svc,
        )

        event = JobEvent(
            eventId=generate_id("evt"),
            jobId=setup_data["job_id"],
            ts=get_timestamp_ms(),
            eventType=EventType.THINKING_PDB,
            stage=StageType.MODEL,
            status=StatusType.partial,
            progress=75,
            message="Structure generated",
        )

        result = service.push_and_persist_event(db_session, event)

        assert result is True

        # Verify Redis push was called
        sse_events_svc.push_event.assert_called_once_with(event)

        # Verify MySQL persistence
        from app.db.models import JobEvent as JobEventModel

        db_event = db_session.query(JobEventModel).filter_by(job_id=setup_data["job_id"]).first()
        assert db_event is not None
