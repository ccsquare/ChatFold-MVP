"""Tests for Repository layer.

These tests use SQLite in-memory database for fast testing
without requiring a MySQL server.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Base, Project, User
from app.repositories.base import BaseRepository
from app.repositories.task import TaskRepository
from app.repositories.task_event import TaskEventRepository
from app.repositories.learning_record import LearningRecordRepository
from app.repositories.structure import StructureRepository
from app.repositories.user import UserRepository
from app.utils import get_timestamp_ms


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database for testing."""
    # Create SQLite engine (in-memory)
    engine = create_engine(
        "sqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
    )

    # Create all tables
    Base.metadata.create_all(bind=engine)

    # Create session
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


class TestBaseRepository:
    """Test BaseRepository CRUD operations."""

    def test_create_and_get(self, db_session: Session):
        """Create and retrieve entity."""
        repo = BaseRepository(User)

        user_data = {
            "id": "user_test001",
            "name": "Test User",
            "email": "test@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }

        # Create
        user = repo.create(db_session, user_data)
        assert user.id == "user_test001"
        assert user.name == "Test User"

        # Get by ID
        retrieved = repo.get_by_id(db_session, "user_test001")
        assert retrieved is not None
        assert retrieved.email == "test@example.com"

    def test_get_nonexistent(self, db_session: Session):
        """Get non-existent entity returns None."""
        repo = BaseRepository(User)
        result = repo.get_by_id(db_session, "nonexistent")
        assert result is None

    def test_update(self, db_session: Session):
        """Update entity."""
        repo = BaseRepository(User)

        # Create user
        user_data = {
            "id": "user_test002",
            "name": "Original Name",
            "email": "original@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        user = repo.create(db_session, user_data)

        # Update
        updated = repo.update(db_session, user, {"name": "Updated Name", "plan": "pro"})

        assert updated.name == "Updated Name"
        assert updated.plan == "pro"

    def test_delete(self, db_session: Session):
        """Delete entity."""
        repo = BaseRepository(User)

        # Create user
        user_data = {
            "id": "user_test003",
            "name": "To Delete",
            "email": "delete@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        repo.create(db_session, user_data)

        # Delete
        result = repo.delete(db_session, "user_test003")
        assert result is True

        # Verify deleted
        assert repo.get_by_id(db_session, "user_test003") is None

    def test_delete_nonexistent(self, db_session: Session):
        """Delete non-existent entity returns False."""
        repo = BaseRepository(User)
        result = repo.delete(db_session, "nonexistent")
        assert result is False

    def test_exists(self, db_session: Session):
        """Check entity existence."""
        repo = BaseRepository(User)

        assert repo.exists(db_session, "user_test004") is False

        # Create user
        user_data = {
            "id": "user_test004",
            "name": "Exists Test",
            "email": "exists@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        repo.create(db_session, user_data)

        assert repo.exists(db_session, "user_test004") is True

    def test_get_all(self, db_session: Session):
        """Get all entities with pagination."""
        repo = BaseRepository(User)

        # Create 5 users
        for i in range(5):
            user_data = {
                "id": f"user_list{i:03d}",
                "name": f"User {i}",
                "email": f"user{i}@example.com",
                "plan": "free",
                "created_at": get_timestamp_ms(),
            }
            repo.create(db_session, user_data)

        # Get all
        all_users = repo.get_all(db_session)
        assert len(all_users) == 5

        # Get with pagination
        page = repo.get_all(db_session, skip=2, limit=2)
        assert len(page) == 2


class TestUserRepository:
    """Test UserRepository specific methods."""

    def test_get_by_email(self, db_session: Session):
        """Get user by email."""
        repo = UserRepository()

        # Create user
        user = repo.create_user(db_session, "Test User", "unique@example.com")

        # Get by email
        found = repo.get_by_email(db_session, "unique@example.com")
        assert found is not None
        assert found.id == user.id

        # Non-existent email
        not_found = repo.get_by_email(db_session, "notfound@example.com")
        assert not_found is None

    def test_create_user(self, db_session: Session):
        """Create user with helper method."""
        repo = UserRepository()

        user = repo.create_user(db_session, "New User", "new@example.com", plan="pro")

        assert user.id.startswith("user_")
        assert user.name == "New User"
        assert user.email == "new@example.com"
        assert user.plan == "pro"
        assert user.created_at > 0


class TestTaskRepository:
    """Test TaskRepository specific methods."""

    @pytest.fixture
    def default_user(self, db_session: Session):
        """Create default user for task tests."""
        repo = BaseRepository(User)
        user_data = {
            "id": "user_default",
            "name": "Default User",
            "email": "default@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        return repo.create(db_session, user_data)

    def test_create_task(self, db_session: Session, default_user):
        """Create task with helper method."""
        repo = TaskRepository()

        task = repo.create_task(db_session, sequence="MVLSPADKTNVKAAWG")

        assert task.id.startswith("task_")
        assert task.user_id == "user_default"
        assert task.status == "queued"
        assert task.stage == "QUEUED"
        assert task.sequence == "MVLSPADKTNVKAAWG"
        assert task.created_at > 0

    def test_get_by_user(self, db_session: Session, default_user):
        """Get tasks by user."""
        repo = TaskRepository()

        # Create 3 tasks
        for _ in range(3):
            repo.create_task(db_session, sequence="MVLSPADKTNVKAAWG")

        tasks = repo.get_by_user(db_session)
        assert len(tasks) == 3

    def test_get_by_status(self, db_session: Session, default_user):
        """Get tasks by status."""
        repo = TaskRepository()

        # Create tasks with different statuses
        task1 = repo.create_task(db_session, sequence="SEQ1")
        task2 = repo.create_task(db_session, sequence="SEQ2")
        repo.update_status(db_session, task1.id, "running")
        repo.update_status(db_session, task2.id, "complete", "DONE")

        running = repo.get_by_status(db_session, "running")
        assert len(running) == 1
        assert running[0].id == task1.id

        complete = repo.get_by_status(db_session, "complete")
        assert len(complete) == 1
        assert complete[0].id == task2.id

    def test_update_status(self, db_session: Session, default_user):
        """Update task status."""
        repo = TaskRepository()

        task = repo.create_task(db_session, sequence="MVLSPADKTNVKAAWG")
        assert task.status == "queued"

        updated = repo.update_status(db_session, task.id, "running", "MODEL")
        assert updated.status == "running"
        assert updated.stage == "MODEL"

    def test_mark_complete(self, db_session: Session, default_user):
        """Mark task as complete."""
        repo = TaskRepository()

        task = repo.create_task(db_session, sequence="MVLSPADKTNVKAAWG")
        completed = repo.mark_complete(db_session, task.id)

        assert completed.status == "complete"
        assert completed.stage == "DONE"
        assert completed.completed_at is not None

    def test_mark_failed(self, db_session: Session, default_user):
        """Mark task as failed."""
        repo = TaskRepository()

        task = repo.create_task(db_session, sequence="MVLSPADKTNVKAAWG")
        failed = repo.mark_failed(db_session, task.id)

        assert failed.status == "failed"
        assert failed.stage == "ERROR"
        assert failed.completed_at is not None


class TestStructureRepository:
    """Test StructureRepository specific methods."""

    @pytest.fixture
    def setup_data(self, db_session: Session):
        """Create default user and task for structure tests."""
        # Create user
        user_repo = BaseRepository(User)
        user_data = {
            "id": "user_default",
            "name": "Default User",
            "email": "default@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        user_repo.create(db_session, user_data)

        # Create project (required for structure foreign key)
        project_data = {
            "id": "project_default",
            "user_id": "user_default",
            "name": "Default Project",
            "description": "Test project",
            "created_at": get_timestamp_ms(),
            "updated_at": get_timestamp_ms(),
        }
        db_session.add(Project(**project_data))
        db_session.commit()

        # Create task
        task_repo = TaskRepository()
        task = task_repo.create_task(db_session, sequence="MVLSPADKTNVKAAWG")

        return {"user_id": "user_default", "project_id": "project_default", "task_id": task.id}

    def test_create_structure(self, db_session: Session, setup_data):
        """Create structure record."""
        repo = StructureRepository()

        structure = repo.create_structure(
            db_session,
            task_id=setup_data["task_id"],
            label="candidate-1",
            filename="structure.pdb",
            file_path="/path/to/structure.pdb",
            plddt_score=85,
        )

        assert structure.id.startswith("str_")
        assert structure.task_id == setup_data["task_id"]
        assert structure.label == "candidate-1"
        assert structure.plddt_score == 85
        assert structure.is_final is False

    def test_get_by_task(self, db_session: Session, setup_data):
        """Get structures by task."""
        repo = StructureRepository()

        # Create 3 structures
        for i in range(3):
            repo.create_structure(
                db_session,
                task_id=setup_data["task_id"],
                label=f"candidate-{i + 1}",
                filename=f"structure{i + 1}.pdb",
                file_path=f"/path/to/structure{i + 1}.pdb",
            )

        structures = repo.get_by_task(db_session, setup_data["task_id"])
        assert len(structures) == 3

    def test_mark_as_final(self, db_session: Session, setup_data):
        """Mark structure as final."""
        repo = StructureRepository()

        structure = repo.create_structure(
            db_session,
            task_id=setup_data["task_id"],
            label="best",
            filename="best.pdb",
            file_path="/path/to/best.pdb",
        )

        assert structure.is_final is False

        marked = repo.mark_as_final(db_session, structure.id)
        assert marked.is_final is True

    def test_get_final_by_task(self, db_session: Session, setup_data):
        """Get final structure for task."""
        repo = StructureRepository()

        # Create structures
        repo.create_structure(
            db_session,
            task_id=setup_data["task_id"],
            label="candidate-1",
            filename="c1.pdb",
            file_path="/path/c1.pdb",
        )

        final_structure = repo.create_structure(
            db_session,
            task_id=setup_data["task_id"],
            label="final",
            filename="final.pdb",
            file_path="/path/final.pdb",
            is_final=True,
        )

        # Get final
        found = repo.get_final_by_task(db_session, setup_data["task_id"])
        assert found is not None
        assert found.id == final_structure.id
        assert found.is_final is True

    def test_update_plddt_score(self, db_session: Session, setup_data):
        """Update structure pLDDT score."""
        repo = StructureRepository()

        structure = repo.create_structure(
            db_session,
            task_id=setup_data["task_id"],
            label="test",
            filename="test.pdb",
            file_path="/path/test.pdb",
        )

        assert structure.plddt_score is None

        updated = repo.update_plddt_score(db_session, structure.id, 92)
        assert updated.plddt_score == 92


class TestTaskEventRepository:
    """Test TaskEventRepository specific methods."""

    @pytest.fixture
    def setup_data(self, db_session: Session):
        """Create default user and task for event tests."""
        # Create user
        user_repo = BaseRepository(User)
        user_data = {
            "id": "user_default",
            "name": "Default User",
            "email": "default@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        user_repo.create(db_session, user_data)

        # Create task
        task_repo = TaskRepository()
        task = task_repo.create_task(db_session, sequence="MVLSPADKTNVKAAWG")

        return {"user_id": "user_default", "task_id": task.id}

    def test_create_event(self, db_session: Session, setup_data):
        """Create task event record."""
        repo = TaskEventRepository()

        event = repo.create_event(
            db_session,
            task_id=setup_data["task_id"],
            event_type="THINKING_TEXT",
            stage="MODEL",
            status="running",
            progress=50,
            message="Processing structure...",
            block_index=1,
        )

        assert event.id.startswith("evt_")
        assert event.task_id == setup_data["task_id"]
        assert event.event_type == "THINKING_TEXT"
        assert event.stage == "MODEL"
        assert event.progress == 50
        assert event.block_index == 1

    def test_get_by_task(self, db_session: Session, setup_data):
        """Get events by task."""
        repo = TaskEventRepository()

        # Create 3 events
        for i in range(3):
            repo.create_event(
                db_session,
                task_id=setup_data["task_id"],
                event_type="THINKING_TEXT",
                stage="MODEL",
                status="running",
                progress=i * 30,
                message=f"Step {i + 1}",
            )

        events = repo.get_by_task(db_session, setup_data["task_id"])
        assert len(events) == 3

    def test_get_by_event_type(self, db_session: Session, setup_data):
        """Get events by type."""
        repo = TaskEventRepository()

        # Create events of different types
        repo.create_event(
            db_session,
            task_id=setup_data["task_id"],
            event_type="PROLOGUE",
            stage="QUEUED",
            status="running",
        )
        repo.create_event(
            db_session,
            task_id=setup_data["task_id"],
            event_type="THINKING_TEXT",
            stage="MODEL",
            status="running",
        )
        repo.create_event(
            db_session,
            task_id=setup_data["task_id"],
            event_type="THINKING_TEXT",
            stage="MODEL",
            status="running",
        )

        prologue_events = repo.get_by_event_type(db_session, setup_data["task_id"], "PROLOGUE")
        assert len(prologue_events) == 1

        thinking_events = repo.get_by_event_type(db_session, setup_data["task_id"], "THINKING_TEXT")
        assert len(thinking_events) == 2

    def test_count_thinking_blocks(self, db_session: Session, setup_data):
        """Count unique thinking blocks."""
        repo = TaskEventRepository()

        # Create events with block indices
        repo.create_event(
            db_session,
            task_id=setup_data["task_id"],
            event_type="THINKING_TEXT",
            stage="MODEL",
            status="running",
            block_index=1,
        )
        repo.create_event(
            db_session,
            task_id=setup_data["task_id"],
            event_type="THINKING_PDB",
            stage="MODEL",
            status="running",
            block_index=1,  # Same block
        )
        repo.create_event(
            db_session,
            task_id=setup_data["task_id"],
            event_type="THINKING_TEXT",
            stage="MODEL",
            status="running",
            block_index=2,  # Different block
        )

        count = repo.count_thinking_blocks(db_session, setup_data["task_id"])
        assert count == 2


class TestLearningRecordRepository:
    """Test LearningRecordRepository specific methods."""

    @pytest.fixture
    def setup_data(self, db_session: Session):
        """Create default user, project, and task for learning record tests."""
        # Create user
        user_repo = BaseRepository(User)
        user_data = {
            "id": "user_default",
            "name": "Default User",
            "email": "default@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        user_repo.create(db_session, user_data)

        # Create project
        project_data = {
            "id": "project_default",
            "user_id": "user_default",
            "name": "Default Project",
            "description": "Test project",
            "created_at": get_timestamp_ms(),
            "updated_at": get_timestamp_ms(),
        }
        db_session.add(Project(**project_data))
        db_session.commit()

        # Create task
        task_repo = TaskRepository()
        task = task_repo.create_task(db_session, sequence="MVLSPADKTNVKAAWG")

        return {"user_id": "user_default", "project_id": "project_default", "task_id": task.id}

    def test_create_record(self, db_session: Session, setup_data):
        """Create learning record."""
        repo = LearningRecordRepository()

        record = repo.create_record(
            db_session,
            task_id=setup_data["task_id"],
            input_sequence="MVLSPADKTNVKAAWG",
            thinking_block_count=3,
            structure_count=5,
            final_plddt=85,
        )

        assert record.id.startswith("lrn_")
        assert record.task_id == setup_data["task_id"]
        assert record.input_sequence == "MVLSPADKTNVKAAWG"
        assert record.thinking_block_count == 3
        assert record.structure_count == 5
        assert record.final_plddt == 85
        assert record.exported_at is None

    def test_get_by_task(self, db_session: Session, setup_data):
        """Get learning record by task."""
        repo = LearningRecordRepository()

        repo.create_record(
            db_session,
            task_id=setup_data["task_id"],
            input_sequence="MVLSPADKTNVKAAWG",
        )

        found = repo.get_by_task(db_session, setup_data["task_id"])
        assert found is not None
        assert found.task_id == setup_data["task_id"]

    def test_add_user_feedback(self, db_session: Session, setup_data):
        """Add user feedback to learning record."""
        repo = LearningRecordRepository()

        record = repo.create_record(
            db_session,
            task_id=setup_data["task_id"],
            input_sequence="MVLSPADKTNVKAAWG",
        )

        updated = repo.add_user_feedback(
            db_session,
            record_id=record.id,
            user_rating=5,
            user_feedback="Excellent prediction!",
        )

        assert updated.user_rating == 5
        assert updated.user_feedback == "Excellent prediction!"

    def test_get_unexported(self, db_session: Session, setup_data):
        """Get unexported learning records."""
        repo = LearningRecordRepository()
        task_repo = TaskRepository()

        # Create first record (unexported)
        repo.create_record(
            db_session,
            task_id=setup_data["task_id"],
            input_sequence="MVLSPADKTNVKAAWG",
        )

        # Create second task and record
        task2 = task_repo.create_task(db_session, sequence="GAWKVNTKDAPSLVM")
        record2 = repo.create_record(
            db_session,
            task_id=task2.id,
            input_sequence="GAWKVNTKDAPSLVM",
        )

        # Mark second as exported
        repo.mark_exported(db_session, [record2.id], "batch_001")

        unexported = repo.get_unexported(db_session)
        assert len(unexported) == 1
        assert unexported[0].task_id == setup_data["task_id"]

    def test_mark_exported(self, db_session: Session, setup_data):
        """Mark learning records as exported."""
        repo = LearningRecordRepository()

        record = repo.create_record(
            db_session,
            task_id=setup_data["task_id"],
            input_sequence="MVLSPADKTNVKAAWG",
        )

        assert record.exported_at is None
        assert record.export_batch_id is None

        count = repo.mark_exported(db_session, [record.id], "batch_test")
        assert count == 1

        # Refresh record
        updated = repo.get_by_id(db_session, record.id)
        assert updated.exported_at is not None
        assert updated.export_batch_id == "batch_test"
