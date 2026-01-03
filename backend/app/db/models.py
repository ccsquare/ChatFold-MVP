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


class UserModel(Base):
    """User account model.

    MVP Note: Uses DEFAULT_USER_ID ("user_default") for all operations.
    """

    __tablename__ = "users"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    plan = Column(Enum("free", "pro", name="user_plan"), default="free")
    created_at = Column(BigInteger, nullable=False)

    # Relationships
    projects = relationship("ProjectModel", back_populates="user", cascade="all, delete-orphan")
    jobs = relationship("JobModel", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, name={self.name})>"


class ProjectModel(Base):
    """Project model - top-level organization unit for users.

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
    user = relationship("UserModel", back_populates="projects")
    folders = relationship("FolderModel", back_populates="project", cascade="all, delete-orphan")
    structures = relationship(
        "StructureModel", back_populates="project", cascade="all, delete-orphan"
    )

    # Indexes
    __table_args__ = (Index("idx_projects_user_id", "user_id"),)

    def __repr__(self) -> str:
        return f"<Project(id={self.id}, name={self.name})>"


class FolderModel(Base):
    """Folder model - working directory containing inputs and outputs."""

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
    project = relationship("ProjectModel", back_populates="folders")
    assets = relationship("AssetModel", back_populates="folder", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_folders_project_id", "project_id"),
        Index("idx_folders_conversation_id", "conversation_id"),
    )

    def __repr__(self) -> str:
        return f"<Folder(id={self.id}, name={self.name})>"


class AssetModel(Base):
    """Asset model - user uploaded files (FASTA, PDB, etc.)."""

    __tablename__ = "assets"

    id = Column(String(64), primary_key=True)
    folder_id = Column(String(64), ForeignKey("folders.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(Enum("fasta", "pdb", "text", name="asset_type"), nullable=False)
    file_path = Column(String(512), nullable=False)
    size = Column(Integer, nullable=True)
    uploaded_at = Column(BigInteger, nullable=False)

    # Relationships
    folder = relationship("FolderModel", back_populates="assets")

    # Indexes
    __table_args__ = (Index("idx_assets_folder_id", "folder_id"),)

    def __repr__(self) -> str:
        return f"<Asset(id={self.id}, name={self.name})>"


class ConversationModel(Base):
    """Conversation model - chat session associated with a folder."""

    __tablename__ = "conversations"

    id = Column(String(64), primary_key=True)
    folder_id = Column(String(64), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)

    # Relationships
    messages = relationship(
        "MessageModel", back_populates="conversation", cascade="all, delete-orphan"
    )
    jobs = relationship("JobModel", back_populates="conversation")

    # Indexes
    __table_args__ = (Index("idx_conversations_folder_id", "folder_id"),)

    def __repr__(self) -> str:
        return f"<Conversation(id={self.id}, title={self.title})>"


class MessageModel(Base):
    """Message model - single message in a conversation."""

    __tablename__ = "messages"

    id = Column(String(64), primary_key=True)
    conversation_id = Column(
        String(64), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role = Column(Enum("user", "assistant", "system", name="message_role"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(BigInteger, nullable=False)

    # Relationships
    conversation = relationship("ConversationModel", back_populates="messages")

    # Indexes
    __table_args__ = (
        Index("idx_messages_conversation_id", "conversation_id"),
        Index("idx_messages_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Message(id={self.id}, role={self.role})>"


class JobModel(Base):
    """Job model - protein folding task."""

    __tablename__ = "jobs"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    conversation_id = Column(
        String(64), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    job_type = Column(
        Enum("folding", "relaxation", name="job_type_enum"), default="folding", nullable=False
    )
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
    user = relationship("UserModel", back_populates="jobs")
    conversation = relationship("ConversationModel", back_populates="jobs")
    structures = relationship("StructureModel", back_populates="job", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_jobs_user_id", "user_id"),
        Index("idx_jobs_status", "status"),
        Index("idx_jobs_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Job(id={self.id}, status={self.status})>"


class StructureModel(Base):
    """Structure model - generated PDB structure from a job."""

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
    job = relationship("JobModel", back_populates="structures")
    project = relationship("ProjectModel", back_populates="structures")

    # Indexes
    __table_args__ = (
        Index("idx_structures_job_id", "job_id"),
        Index("idx_structures_user_project", "user_id", "project_id"),
    )

    def __repr__(self) -> str:
        return f"<Structure(id={self.id}, label={self.label})>"
