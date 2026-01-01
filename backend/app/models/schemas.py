"""Pydantic models matching the frontend TypeScript types."""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class StageType(str, Enum):
    QUEUED = "QUEUED"
    MSA = "MSA"
    MODEL = "MODEL"
    RELAX = "RELAX"
    QA = "QA"
    DONE = "DONE"
    ERROR = "ERROR"


class StatusType(str, Enum):
    queued = "queued"
    running = "running"
    partial = "partial"
    complete = "complete"
    failed = "failed"
    canceled = "canceled"


class StructureArtifact(BaseModel):
    """Generated structure file model.

    Path is relative to the outputs root directory:
    - local-dev: {project}/chatfold-workspace/outputs/
    - production: /app/outputs/

    Example paths:
    - structures/{task_id}/candidate_1.pdb
    - structures/{task_id}/final.pdb
    """
    type: Literal["structure"] = "structure"
    structureId: str
    label: str  # 'candidate-1', 'candidate-2', ..., 'final'
    filename: str
    path: str | None = None  # Relative path from outputs root, e.g., "structures/{task_id}/candidate_1.pdb"
    pdbData: str | None = None  # Inline PDB content (for SSE streaming, optional)
    thumbnail: str | None = None
    createdAt: int | None = None  # Timestamp for timeline ordering
    cot: str | None = None  # Chain-of-thought reasoning for this structure optimization


class StepEvent(BaseModel):
    eventId: str
    taskId: str
    ts: int  # Unix timestamp in milliseconds
    stage: StageType
    status: StatusType
    progress: int = Field(..., ge=0, le=100)
    message: str
    artifacts: list[StructureArtifact] | None = None


class Asset(BaseModel):
    """File asset model for user uploads and generated files.

    Path is relative to the outputs root directory:
    - local-dev: {project}/chatfold-workspace/outputs/
    - production: /app/outputs/

    Example paths:
    - uploads/{folder_id}/{asset_id}.fasta
    - uploads/{folder_id}/{asset_id}.pdb
    """
    id: str
    name: str
    type: Literal["fasta", "pdb", "text"]
    path: str  # Relative path from outputs root, e.g., "uploads/{folder_id}/{asset_id}.fasta"
    size: int | None = None  # File size in bytes
    uploadedAt: int


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant", "tool"]
    content: str
    timestamp: int
    artifacts: list[StructureArtifact] | None = None


class Task(BaseModel):
    id: str
    conversationId: str
    status: StatusType
    sequence: str
    createdAt: int
    completedAt: int | None = None
    steps: list[StepEvent] = Field(default_factory=list)
    structures: list[StructureArtifact] = Field(default_factory=list)


class Conversation(BaseModel):
    id: str
    folderId: str | None = None  # 1:1 association with Folder
    title: str
    createdAt: int
    updatedAt: int
    messages: list[ChatMessage] = Field(default_factory=list)
    assets: list[Asset] = Field(default_factory=list)


class Folder(BaseModel):
    """Folder contains input sequences and output structures."""
    id: str
    projectId: str | None = None  # Parent project (MVP: project_default)
    name: str
    createdAt: int
    updatedAt: int
    isExpanded: bool = True
    inputs: list[Asset] = Field(default_factory=list)
    outputs: list[StructureArtifact] = Field(default_factory=list)
    taskId: str | None = None
    conversationId: str | None = None  # 1:1 association with Conversation


class UserPlan(str, Enum):
    free = "free"
    pro = "pro"


class User(BaseModel):
    """User model for multi-user support."""
    id: str
    name: str
    email: str
    plan: UserPlan = UserPlan.free
    createdAt: int | None = None


class Project(BaseModel):
    """Project model for organizing folders.

    MVP uses a single default project (project_default).
    Future: support multiple projects per user for better organization.
    """
    id: str
    userId: str  # Owner user ID
    name: str
    description: str | None = None
    createdAt: int
    updatedAt: int


# Request/Response models


class CreateTaskRequest(BaseModel):
    conversationId: str | None = None
    sequence: str | None = None
    fastaContent: str | None = None

    @field_validator("sequence", mode="before")
    @classmethod
    def normalize_sequence_field(cls, v: str | None) -> str | None:
        if v is None:
            return None
        from ..utils.sequence_validator import normalize_sequence

        return normalize_sequence(v)

    def get_validated_sequence(self) -> str:
        """Get and validate the sequence from either direct input or FASTA."""
        from ..utils.fasta_parser import parse_fasta
        from ..utils.sequence_validator import validate_amino_acid_sequence

        seq = self.sequence

        if self.fastaContent:
            parsed = parse_fasta(self.fastaContent)
            if parsed is None:
                raise ValueError("Invalid FASTA format")
            seq = parsed["sequence"]

        if not seq:
            raise ValueError("Either sequence or fastaContent must be provided")

        return validate_amino_acid_sequence(seq)


class CreateConversationRequest(BaseModel):
    title: str | None = "New Conversation"
    folderId: str | None = None  # Optional folder association


class CreateFolderRequest(BaseModel):
    name: str | None = None  # Auto-generate if not provided
    conversationId: str | None = None  # Optional conversation association


class AddFolderInputRequest(BaseModel):
    name: str
    type: Literal["fasta", "pdb", "text"]
    content: str


class CachePDBRequest(BaseModel):
    pdbData: str


class RegisterSequenceRequest(BaseModel):
    taskId: str
    sequence: str
