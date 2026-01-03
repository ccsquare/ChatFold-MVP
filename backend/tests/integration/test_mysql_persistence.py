"""Integration tests for MySQL persistence.

Test cases for:
- Core table creation and schema
- CRUD operations across all entities
- Foreign key relationships
- Data persistence across service restarts (simulated)
"""

import time

import pytest
from sqlalchemy import text

from app.db.models import (
    Asset,
    Base,
    Conversation,
    Folder,
    Job,
    JobEvent,
    LearningRecord,
    Message,
    Project,
    Structure,
    User,
)
from app.db.mysql import check_connection, engine, get_db_session


def _make_id(prefix: str) -> str:
    """Generate a unique test ID."""
    return f"{prefix}_test_{int(time.time() * 1000)}"


@pytest.fixture(scope="module", autouse=True)
def check_mysql_available():
    """Skip tests if MySQL is not available."""
    if not check_connection():
        pytest.skip("MySQL is not available")


@pytest.fixture(scope="module")
def setup_tables():
    """Ensure tables exist before running tests."""
    Base.metadata.create_all(bind=engine)
    yield
    # Don't drop tables - leave them for other tests


class TestMySQLConnection:
    """Test MySQL connection and basic operations."""

    def test_connection_check(self):
        """Verify database connection works."""
        assert check_connection() is True

    def test_tables_exist(self, setup_tables):
        """Verify all core tables are created."""
        with get_db_session() as db:
            result = db.execute(text("SHOW TABLES"))
            tables = [row[0] for row in result.fetchall()]

            expected_tables = [
                "users",
                "projects",
                "folders",
                "assets",
                "conversations",
                "messages",
                "jobs",
                "job_events",
                "learning_records",
                "structures",
            ]

            for table in expected_tables:
                assert table in tables, f"Table {table} not found"


class TestUserPersistence:
    """Test User CRUD operations."""

    def test_create_user(self, setup_tables):
        """Create a user and verify persistence."""
        user_id = _make_id("user")
        now = int(time.time() * 1000)

        with get_db_session() as db:
            user = User(
                id=user_id,
                name="Test User",
                email=f"{user_id}@test.com",
                plan="free",
                created_at=now,
            )
            db.add(user)

        # Verify in a new session (simulates restart)
        with get_db_session() as db:
            user = db.query(User).filter(User.id == user_id).first()
            assert user is not None
            assert user.name == "Test User"
            assert user.email == f"{user_id}@test.com"
            assert user.plan == "free"

            # Cleanup
            db.delete(user)


class TestProjectPersistence:
    """Test Project CRUD operations."""

    def test_create_project_with_user(self, setup_tables):
        """Create a project with user foreign key."""
        user_id = _make_id("user")
        project_id = _make_id("project")
        now = int(time.time() * 1000)

        with get_db_session() as db:
            # Create user first
            user = User(
                id=user_id,
                name="Project Owner",
                email=f"{user_id}@test.com",
                created_at=now,
            )
            db.add(user)
            db.flush()

            # Create project
            project = Project(
                id=project_id,
                user_id=user_id,
                name="Test Project",
                description="A test project",
                created_at=now,
                updated_at=now,
            )
            db.add(project)

        # Verify relationships
        with get_db_session() as db:
            project = db.query(Project).filter(Project.id == project_id).first()
            assert project is not None
            assert project.user_id == user_id
            assert project.name == "Test Project"

            # Verify relationship loading
            assert project.user is not None
            assert project.user.name == "Project Owner"

            # Cleanup (cascade should delete project)
            user = db.query(User).filter(User.id == user_id).first()
            db.delete(user)


class TestFolderAssetPersistence:
    """Test Folder and Asset persistence with relationships."""

    def test_folder_with_assets(self, setup_tables):
        """Create folder with assets and verify cascade."""
        user_id = _make_id("user")
        project_id = _make_id("project")
        folder_id = _make_id("folder")
        asset_id = _make_id("asset")
        now = int(time.time() * 1000)

        with get_db_session() as db:
            # Setup hierarchy
            user = User(id=user_id, name="Asset Owner", email=f"{user_id}@test.com", created_at=now)
            db.add(user)
            db.flush()

            project = Project(
                id=project_id, user_id=user_id, name="Asset Project",
                created_at=now, updated_at=now
            )
            db.add(project)
            db.flush()

            folder = Folder(
                id=folder_id, project_id=project_id, name="Asset Folder",
                created_at=now, updated_at=now
            )
            db.add(folder)
            db.flush()

            asset = Asset(
                id=asset_id, folder_id=folder_id, name="test.fasta",
                type="fasta", file_path=f"/uploads/{folder_id}/{asset_id}.fasta",
                size=1024, uploaded_at=now
            )
            db.add(asset)

        # Verify
        with get_db_session() as db:
            folder = db.query(Folder).filter(Folder.id == folder_id).first()
            assert len(folder.assets) == 1
            assert folder.assets[0].name == "test.fasta"
            assert folder.assets[0].type == "fasta"

            # Cleanup
            user = db.query(User).filter(User.id == user_id).first()
            db.delete(user)


class TestConversationMessagePersistence:
    """Test Conversation and Message persistence."""

    def test_conversation_with_messages(self, setup_tables):
        """Create conversation with messages."""
        conv_id = _make_id("conv")
        msg1_id = _make_id("msg1")
        msg2_id = _make_id("msg2")
        now = int(time.time() * 1000)

        with get_db_session() as db:
            # Conversation without folder (folder_id=None is allowed)
            conv = Conversation(
                id=conv_id, folder_id=None, title="Test Conversation",
                created_at=now, updated_at=now
            )
            db.add(conv)
            db.flush()

            # Add messages
            msg1 = Message(
                id=msg1_id, conversation_id=conv_id, role="user",
                content="Hello", created_at=now
            )
            msg2 = Message(
                id=msg2_id, conversation_id=conv_id, role="assistant",
                content="Hi there!", created_at=now + 1
            )
            db.add_all([msg1, msg2])

        # Verify
        with get_db_session() as db:
            conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
            assert len(conv.messages) == 2

            # Verify order by checking content
            roles = [m.role for m in conv.messages]
            assert "user" in roles
            assert "assistant" in roles

            # Cleanup
            db.delete(conv)


class TestJobStructurePersistence:
    """Test Job and Structure persistence with relationships."""

    def test_job_with_structures(self, setup_tables):
        """Create job with structures."""
        user_id = _make_id("user")
        project_id = _make_id("project")
        job_id = _make_id("job")
        struct_id = _make_id("struct")
        now = int(time.time() * 1000)

        with get_db_session() as db:
            # Setup
            user = User(id=user_id, name="Job Owner", email=f"{user_id}@test.com", created_at=now)
            db.add(user)
            db.flush()

            project = Project(
                id=project_id, user_id=user_id, name="Job Project",
                created_at=now, updated_at=now
            )
            db.add(project)
            db.flush()

            job = Job(
                id=job_id, user_id=user_id, job_type="folding",
                status="complete", stage="DONE",
                sequence="MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH",
                created_at=now, completed_at=now + 60000
            )
            db.add(job)
            db.flush()

            structure = Structure(
                id=struct_id, job_id=job_id, user_id=user_id, project_id=project_id,
                label="candidate-1", filename="candidate_1.pdb",
                file_path=f"/structures/{job_id}/candidate_1.pdb",
                plddt_score=85, is_final=False, created_at=now
            )
            db.add(structure)

        # Verify
        with get_db_session() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            assert job.status == "complete"
            assert len(job.structures) == 1
            assert job.structures[0].label == "candidate-1"
            assert job.structures[0].plddt_score == 85

            # Cleanup
            user = db.query(User).filter(User.id == user_id).first()
            db.delete(user)


class TestJobEventPersistence:
    """Test JobEvent persistence."""

    def test_persist_job_events(self, setup_tables):
        """Create job events for debugging/training."""
        user_id = _make_id("user")
        job_id = _make_id("job")
        event_id = _make_id("evt")
        now = int(time.time() * 1000)

        with get_db_session() as db:
            user = User(id=user_id, name="Event Owner", email=f"{user_id}@test.com", created_at=now)
            db.add(user)
            db.flush()

            job = Job(
                id=job_id, user_id=user_id, job_type="folding",
                status="running", stage="MODEL",
                sequence="MVLSPADKTNVKAAWG", created_at=now
            )
            db.add(job)
            db.flush()

            event = JobEvent(
                id=event_id, job_id=job_id, event_type="THINKING_TEXT",
                stage="MODEL", status="running", progress=50,
                message="Generating structure predictions...",
                block_index=1, created_at=now
            )
            db.add(event)

        # Verify
        with get_db_session() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            assert len(job.events) == 1
            assert job.events[0].event_type == "THINKING_TEXT"
            assert job.events[0].block_index == 1

            # Cleanup
            user = db.query(User).filter(User.id == user_id).first()
            db.delete(user)


class TestLearningRecordPersistence:
    """Test LearningRecord persistence for ML training."""

    def test_learning_record_creation(self, setup_tables):
        """Create learning record when job completes."""
        user_id = _make_id("user")
        project_id = _make_id("project")
        job_id = _make_id("job")
        struct_id = _make_id("struct")
        record_id = _make_id("lr")
        now = int(time.time() * 1000)

        with get_db_session() as db:
            # Setup complete job with structure
            user = User(id=user_id, name="ML Owner", email=f"{user_id}@test.com", created_at=now)
            db.add(user)
            db.flush()

            project = Project(
                id=project_id, user_id=user_id, name="ML Project",
                created_at=now, updated_at=now
            )
            db.add(project)
            db.flush()

            job = Job(
                id=job_id, user_id=user_id, job_type="folding",
                status="complete", stage="DONE",
                sequence="MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH",
                created_at=now, completed_at=now + 60000
            )
            db.add(job)
            db.flush()

            structure = Structure(
                id=struct_id, job_id=job_id, user_id=user_id, project_id=project_id,
                label="final", filename="final.pdb",
                file_path=f"/structures/{job_id}/final.pdb",
                plddt_score=92, is_final=True, created_at=now
            )
            db.add(structure)
            db.flush()

            # Create learning record
            record = LearningRecord(
                id=record_id, job_id=job_id,
                input_sequence="MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH",
                thinking_block_count=5,
                structure_count=3,
                final_structure_id=struct_id,
                final_plddt=92,
                created_at=now
            )
            db.add(record)

        # Verify
        with get_db_session() as db:
            record = db.query(LearningRecord).filter(LearningRecord.id == record_id).first()
            assert record is not None
            assert record.thinking_block_count == 5
            assert record.structure_count == 3
            assert record.final_plddt == 92
            assert record.final_structure is not None
            assert record.final_structure.label == "final"

            # Verify export tracking fields
            assert record.exported_at is None
            assert record.export_batch_id is None

            # Cleanup
            user = db.query(User).filter(User.id == user_id).first()
            db.delete(user)


class TestForeignKeyRelationships:
    """Test foreign key constraints and cascades."""

    def test_cascade_delete_user(self, setup_tables):
        """Deleting user cascades to projects, jobs, etc."""
        user_id = _make_id("user")
        project_id = _make_id("project")
        job_id = _make_id("job")
        now = int(time.time() * 1000)

        with get_db_session() as db:
            user = User(id=user_id, name="Cascade Test", email=f"{user_id}@test.com", created_at=now)
            db.add(user)
            db.flush()

            project = Project(
                id=project_id, user_id=user_id, name="Will Cascade",
                created_at=now, updated_at=now
            )
            db.add(project)
            db.flush()

            job = Job(
                id=job_id, user_id=user_id, job_type="folding",
                status="queued", stage="QUEUED",
                sequence="MVLSPADKTNVKAAWG", created_at=now
            )
            db.add(job)

        # Delete user
        with get_db_session() as db:
            user = db.query(User).filter(User.id == user_id).first()
            db.delete(user)

        # Verify cascade
        with get_db_session() as db:
            assert db.query(Project).filter(Project.id == project_id).first() is None
            assert db.query(Job).filter(Job.id == job_id).first() is None

    def test_folder_conversation_link(self, setup_tables):
        """Test 1:1 link between Folder and Conversation."""
        user_id = _make_id("user")
        project_id = _make_id("project")
        folder_id = _make_id("folder")
        conv_id = _make_id("conv")
        now = int(time.time() * 1000)

        with get_db_session() as db:
            user = User(id=user_id, name="Link Test", email=f"{user_id}@test.com", created_at=now)
            db.add(user)
            db.flush()

            project = Project(
                id=project_id, user_id=user_id, name="Link Project",
                created_at=now, updated_at=now
            )
            db.add(project)
            db.flush()

            # Create folder first without conversation_id
            folder = Folder(
                id=folder_id, project_id=project_id, name="Linked Folder",
                conversation_id=None, created_at=now, updated_at=now
            )
            db.add(folder)
            db.flush()

            # Create conversation with folder_id
            conv = Conversation(
                id=conv_id, folder_id=folder_id, title="Linked Conversation",
                created_at=now, updated_at=now
            )
            db.add(conv)
            db.flush()

            # Update folder with conversation_id
            folder.conversation_id = conv_id

        # Verify link
        with get_db_session() as db:
            folder = db.query(Folder).filter(Folder.id == folder_id).first()
            conv = db.query(Conversation).filter(Conversation.id == conv_id).first()

            assert folder.conversation_id == conv_id
            assert conv.folder_id == folder_id

            # Cleanup
            user = db.query(User).filter(User.id == user_id).first()
            db.delete(user)
            db.delete(conv)


class TestDataPersistenceAcrossRestart:
    """Test that data persists across session boundaries (simulating restart)."""

    def test_data_survives_session_close(self, setup_tables):
        """Data written in one session is available in another."""
        user_id = _make_id("user")
        now = int(time.time() * 1000)

        # Write in one session
        with get_db_session() as db:
            user = User(
                id=user_id,
                name="Persistence Test",
                email=f"{user_id}@test.com",
                plan="pro",
                created_at=now,
            )
            db.add(user)

        # Read in a completely new session
        with get_db_session() as db:
            user = db.query(User).filter(User.id == user_id).first()
            assert user is not None
            assert user.name == "Persistence Test"
            assert user.plan == "pro"

            # Cleanup
            db.delete(user)
