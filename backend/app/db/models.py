"""SQLAlchemy ORM models for ChatFold.

This module defines the database schema for the ChatFold application.
Models follow the data model design from docs/developer/data_model.md.

Entity Hierarchy:
    User -> Project -> Folder <-> Conversation -> Message
                    -> Asset
    User -> Job -> Structure
"""

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all ORM models."""

    pass


class User(Base):
    """User account.

    MVP Note: Uses DEFAULT_USER_ID ("user_default") for all operations.
    """

    __tablename__ = "users"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    username = Column(String(255), nullable=True, unique=True)  # Added for auth
    email = Column(String(255), nullable=False, unique=True)
    hashed_password = Column(String(255), nullable=True)  # Added for auth
    plan = Column(Enum("free", "pro", name="user_plan"), default="free")
    onboarding_completed = Column(Boolean, default=False)  # Added for auth
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=True)  # Added for auth

    # Relationships
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_users_email", "email"),
        Index("idx_users_username", "username"),
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, name={self.name})>"


class Project(Base):
    """Project - top-level organization unit for users.

    MVP Note: Uses DEFAULT_PROJECT_ID ("project_default") for all operations.
    """

    __tablename__ = "projects"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)

    # Relationships
    user = relationship("User", back_populates="projects")
    folders = relationship("Folder", back_populates="project", cascade="all, delete-orphan")
    structures = relationship("Structure", back_populates="project", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (Index("idx_projects_user_id", "user_id"),)

    def __repr__(self) -> str:
        return f"<Project(id={self.id}, name={self.name})>"


class Folder(Base):
    """Folder - working directory containing inputs and outputs."""

    __tablename__ = "folders"

    id = Column(String(64), primary_key=True)
    project_id = Column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    is_expanded = Column(Boolean, default=True)
    job_id = Column(String(64), nullable=True)
    conversation_id = Column(String(64), nullable=True)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="folders")
    assets = relationship("Asset", back_populates="folder", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_folders_project_id", "project_id"),
        Index("idx_folders_conversation_id", "conversation_id"),
    )

    def __repr__(self) -> str:
        return f"<Folder(id={self.id}, name={self.name})>"


class Asset(Base):
    """Asset - user uploaded files (FASTA, PDB, etc.)."""

    __tablename__ = "assets"

    id = Column(String(64), primary_key=True)
    folder_id = Column(String(64), ForeignKey("folders.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(Enum("fasta", "pdb", "text", name="asset_type"), nullable=False)
    file_path = Column(String(512), nullable=False)
    size = Column(Integer, nullable=True)
    uploaded_at = Column(BigInteger, nullable=False)

    # Relationships
    folder = relationship("Folder", back_populates="assets")

    # Indexes
    __table_args__ = (Index("idx_assets_folder_id", "folder_id"),)

    def __repr__(self) -> str:
        return f"<Asset(id={self.id}, name={self.name})>"


class Conversation(Base):
    """Conversation - chat session associated with a folder."""

    __tablename__ = "conversations"

    id = Column(String(64), primary_key=True)
    folder_id = Column(String(64), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)

    # Relationships
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="conversation")

    # Indexes
    __table_args__ = (Index("idx_conversations_folder_id", "folder_id"),)

    def __repr__(self) -> str:
        return f"<Conversation(id={self.id}, title={self.title})>"


class Message(Base):
    """Message - single message in a conversation."""

    __tablename__ = "messages"

    id = Column(String(64), primary_key=True)
    conversation_id = Column(String(64), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum("user", "assistant", "system", name="message_role"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(BigInteger, nullable=False)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")

    # Indexes
    __table_args__ = (
        Index("idx_messages_conversation_id", "conversation_id"),
        Index("idx_messages_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Message(id={self.id}, role={self.role})>"


class Job(Base):
    """Job - protein folding task."""

    __tablename__ = "jobs"

    id = Column(String(64), primary_key=True)
    # MVP: user_id nullable until auth is implemented
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    conversation_id = Column(String(64), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True)
    job_type = Column(Enum("folding", "relaxation", name="job_type_enum"), default="folding", nullable=False)
    status = Column(
        Enum("queued", "running", "partial", "complete", "failed", "canceled", name="job_status"),
        default="queued",
        nullable=False,
    )
    stage = Column(String(32), default="QUEUED", nullable=False)
    sequence = Column(Text, nullable=False)
    file_path = Column(String(512), nullable=True)
    created_at = Column(BigInteger, nullable=False)
    completed_at = Column(BigInteger, nullable=True)

    # Relationships
    user = relationship("User", back_populates="jobs")
    conversation = relationship("Conversation", back_populates="jobs")
    structures = relationship("Structure", back_populates="job", cascade="all, delete-orphan")
    events = relationship("JobEvent", back_populates="job", cascade="all, delete-orphan")
    learning_record = relationship("LearningRecord", back_populates="job", uselist=False, cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_jobs_user_id", "user_id"),
        Index("idx_jobs_status", "status"),
        Index("idx_jobs_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Job(id={self.id}, status={self.status})>"


class JobEvent(Base):
    """JobEvent - persisted SSE event for NanoCC job execution.

    Used for:
    - Debugging and replay of job execution
    - Training data collection for model improvement
    - Analytics on job execution patterns

    Note: This ORM entity corresponds to the Pydantic JobEvent in nanocc/job.py.
    Use import alias to distinguish them when both are needed.
    """

    __tablename__ = "job_events"

    id = Column(String(64), primary_key=True)
    job_id = Column(String(64), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(
        Enum("PROLOGUE", "ANNOTATION", "THINKING_TEXT", "THINKING_PDB", "CONCLUSION", name="event_type_enum"),
        nullable=False,
    )
    stage = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False)
    progress = Column(Integer, nullable=False, default=0)
    message = Column(Text, nullable=True)
    block_index = Column(Integer, nullable=True)  # Thinking block grouping
    structure_id = Column(String(64), ForeignKey("structures.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(BigInteger, nullable=False)

    # Relationships
    job = relationship("Job", back_populates="events")
    structure = relationship("Structure")

    # Indexes
    __table_args__ = (
        Index("idx_job_events_job_id", "job_id"),
        Index("idx_job_events_created_at", "created_at"),
        Index("idx_job_events_event_type", "event_type"),
    )

    def __repr__(self) -> str:
        return f"<JobEvent(id={self.id}, job_id={self.job_id}, event_type={self.event_type})>"


class LearningRecord(Base):
    """LearningRecord - curated learning data from completed job.

    Aggregates job execution data for machine learning purposes:
    - Model fine-tuning (sequence → structure mapping)
    - Preference learning (user selection among candidates)
    - Quality assessment (pLDDT correlation with user satisfaction)

    Created automatically when a job completes successfully.
    User feedback is optional and added later via API.
    """

    __tablename__ = "learning_records"

    id = Column(String(64), primary_key=True)
    job_id = Column(String(64), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, unique=True)
    input_sequence = Column(Text, nullable=False)
    input_constraints = Column(Text, nullable=True)  # Optional constraints/annotations
    thinking_block_count = Column(Integer, default=0)
    structure_count = Column(Integer, default=0)
    final_structure_id = Column(String(64), ForeignKey("structures.id", ondelete="SET NULL"), nullable=True)
    final_plddt = Column(Integer, nullable=True)  # 0-100
    # User feedback (optional)
    user_selected_structure_id = Column(String(64), ForeignKey("structures.id", ondelete="SET NULL"), nullable=True)
    user_rating = Column(Integer, nullable=True)  # 1-5
    user_feedback = Column(Text, nullable=True)
    # Export tracking
    created_at = Column(BigInteger, nullable=False)
    exported_at = Column(BigInteger, nullable=True)
    export_batch_id = Column(String(64), nullable=True)

    # Relationships
    job = relationship("Job", back_populates="learning_record")
    final_structure = relationship("Structure", foreign_keys=[final_structure_id])
    user_selected_structure = relationship("Structure", foreign_keys=[user_selected_structure_id])

    # Indexes
    __table_args__ = (
        Index("idx_learning_records_job_id", "job_id"),
        Index("idx_learning_records_created_at", "created_at"),
        Index("idx_learning_records_exported_at", "exported_at"),
    )

    def __repr__(self) -> str:
        return f"<LearningRecord(id={self.id}, job_id={self.job_id})>"


class Structure(Base):
    """Structure - generated PDB structure from a job."""

    __tablename__ = "structures"

    id = Column(String(64), primary_key=True)
    job_id = Column(String(64), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(64), nullable=False)  # candidate-1, final, best, etc.
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    plddt_score = Column(Integer, nullable=True)  # 0-100
    is_final = Column(Boolean, default=False)
    created_at = Column(BigInteger, nullable=False)

    # Relationships
    job = relationship("Job", back_populates="structures")
    project = relationship("Project", back_populates="structures")

    # Indexes
    __table_args__ = (
        Index("idx_structures_job_id", "job_id"),
        Index("idx_structures_user_project", "user_id", "project_id"),
    )

    def __repr__(self) -> str:
        return f"<Structure(id={self.id}, label={self.label})>"
