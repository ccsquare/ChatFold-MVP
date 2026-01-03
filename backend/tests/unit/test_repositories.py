"""Tests for Repository layer.

These tests use SQLite in-memory database for fast testing
without requiring a MySQL server.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Base, UserModel
from app.repositories.base import BaseRepository
from app.repositories.job import JobRepository
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
        repo = BaseRepository(UserModel)

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
        repo = BaseRepository(UserModel)
        result = repo.get_by_id(db_session, "nonexistent")
        assert result is None

    def test_update(self, db_session: Session):
        """Update entity."""
        repo = BaseRepository(UserModel)

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
        repo = BaseRepository(UserModel)

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
        repo = BaseRepository(UserModel)
        result = repo.delete(db_session, "nonexistent")
        assert result is False

    def test_exists(self, db_session: Session):
        """Check entity existence."""
        repo = BaseRepository(UserModel)

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
        repo = BaseRepository(UserModel)

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


class TestJobRepository:
    """Test JobRepository specific methods."""

    @pytest.fixture
    def default_user(self, db_session: Session):
        """Create default user for job tests."""
        repo = BaseRepository(UserModel)
        user_data = {
            "id": "user_default",
            "name": "Default User",
            "email": "default@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        return repo.create(db_session, user_data)

    def test_create_job(self, db_session: Session, default_user):
        """Create job with helper method."""
        repo = JobRepository()

        job = repo.create_job(db_session, sequence="MVLSPADKTNVKAAWG")

        assert job.id.startswith("job_")
        assert job.user_id == "user_default"
        assert job.status == "queued"
        assert job.stage == "QUEUED"
        assert job.sequence == "MVLSPADKTNVKAAWG"
        assert job.created_at > 0

    def test_get_by_user(self, db_session: Session, default_user):
        """Get jobs by user."""
        repo = JobRepository()

        # Create 3 jobs
        for _ in range(3):
            repo.create_job(db_session, sequence="MVLSPADKTNVKAAWG")

        jobs = repo.get_by_user(db_session)
        assert len(jobs) == 3

    def test_get_by_status(self, db_session: Session, default_user):
        """Get jobs by status."""
        repo = JobRepository()

        # Create jobs with different statuses
        job1 = repo.create_job(db_session, sequence="SEQ1")
        job2 = repo.create_job(db_session, sequence="SEQ2")
        repo.update_status(db_session, job1.id, "running")
        repo.update_status(db_session, job2.id, "complete", "DONE")

        running = repo.get_by_status(db_session, "running")
        assert len(running) == 1
        assert running[0].id == job1.id

        complete = repo.get_by_status(db_session, "complete")
        assert len(complete) == 1
        assert complete[0].id == job2.id

    def test_update_status(self, db_session: Session, default_user):
        """Update job status."""
        repo = JobRepository()

        job = repo.create_job(db_session, sequence="MVLSPADKTNVKAAWG")
        assert job.status == "queued"

        updated = repo.update_status(db_session, job.id, "running", "MODEL")
        assert updated.status == "running"
        assert updated.stage == "MODEL"

    def test_mark_complete(self, db_session: Session, default_user):
        """Mark job as complete."""
        repo = JobRepository()

        job = repo.create_job(db_session, sequence="MVLSPADKTNVKAAWG")
        completed = repo.mark_complete(db_session, job.id)

        assert completed.status == "complete"
        assert completed.stage == "DONE"
        assert completed.completed_at is not None

    def test_mark_failed(self, db_session: Session, default_user):
        """Mark job as failed."""
        repo = JobRepository()

        job = repo.create_job(db_session, sequence="MVLSPADKTNVKAAWG")
        failed = repo.mark_failed(db_session, job.id)

        assert failed.status == "failed"
        assert failed.stage == "ERROR"
        assert failed.completed_at is not None


class TestStructureRepository:
    """Test StructureRepository specific methods."""

    @pytest.fixture
    def setup_data(self, db_session: Session):
        """Create default user and job for structure tests."""
        # Create user
        user_repo = BaseRepository(UserModel)
        user_data = {
            "id": "user_default",
            "name": "Default User",
            "email": "default@example.com",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        user_repo.create(db_session, user_data)

        # Create project (required for structure foreign key)
        from app.db.models import ProjectModel

        project_data = {
            "id": "project_default",
            "user_id": "user_default",
            "name": "Default Project",
            "description": "Test project",
            "created_at": get_timestamp_ms(),
            "updated_at": get_timestamp_ms(),
        }
        db_session.add(ProjectModel(**project_data))
        db_session.commit()

        # Create job
        job_repo = JobRepository()
        job = job_repo.create_job(db_session, sequence="MVLSPADKTNVKAAWG")

        return {"user_id": "user_default", "project_id": "project_default", "job_id": job.id}

    def test_create_structure(self, db_session: Session, setup_data):
        """Create structure record."""
        repo = StructureRepository()

        structure = repo.create_structure(
            db_session,
            job_id=setup_data["job_id"],
            label="candidate-1",
            filename="structure.pdb",
            file_path="/path/to/structure.pdb",
            plddt_score=85,
        )

        assert structure.id.startswith("str_")
        assert structure.job_id == setup_data["job_id"]
        assert structure.label == "candidate-1"
        assert structure.plddt_score == 85
        assert structure.is_final is False

    def test_get_by_job(self, db_session: Session, setup_data):
        """Get structures by job."""
        repo = StructureRepository()

        # Create 3 structures
        for i in range(3):
            repo.create_structure(
                db_session,
                job_id=setup_data["job_id"],
                label=f"candidate-{i+1}",
                filename=f"structure{i+1}.pdb",
                file_path=f"/path/to/structure{i+1}.pdb",
            )

        structures = repo.get_by_job(db_session, setup_data["job_id"])
        assert len(structures) == 3

    def test_mark_as_final(self, db_session: Session, setup_data):
        """Mark structure as final."""
        repo = StructureRepository()

        structure = repo.create_structure(
            db_session,
            job_id=setup_data["job_id"],
            label="best",
            filename="best.pdb",
            file_path="/path/to/best.pdb",
        )

        assert structure.is_final is False

        marked = repo.mark_as_final(db_session, structure.id)
        assert marked.is_final is True

    def test_get_final_by_job(self, db_session: Session, setup_data):
        """Get final structure for job."""
        repo = StructureRepository()

        # Create structures
        repo.create_structure(
            db_session,
            job_id=setup_data["job_id"],
            label="candidate-1",
            filename="c1.pdb",
            file_path="/path/c1.pdb",
        )

        final_structure = repo.create_structure(
            db_session,
            job_id=setup_data["job_id"],
            label="final",
            filename="final.pdb",
            file_path="/path/final.pdb",
            is_final=True,
        )

        # Get final
        found = repo.get_final_by_job(db_session, setup_data["job_id"])
        assert found is not None
        assert found.id == final_structure.id
        assert found.is_final is True

    def test_update_plddt_score(self, db_session: Session, setup_data):
        """Update structure pLDDT score."""
        repo = StructureRepository()

        structure = repo.create_structure(
            db_session,
            job_id=setup_data["job_id"],
            label="test",
            filename="test.pdb",
            file_path="/path/test.pdb",
        )

        assert structure.plddt_score is None

        updated = repo.update_plddt_score(db_session, structure.id, 92)
        assert updated.plddt_score == 92
