"""Pydantic models matching the frontend TypeScript types.

Workspace-related models (Project, Folder, Asset, User) are defined in
the workspace module and re-exported here for backward compatibility.
"""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Re-export workspace models for backward compatibility
from app.workspace.models import (
    Project,
    Folder,
    Asset,
    User,
    UserPlan,
    StructureArtifact,
    CreateFolderRequest,
    AddFolderInputRequest,
)


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


class StepEvent(BaseModel):
    eventId: str
    taskId: str
    ts: int  # Unix timestamp in milliseconds
    stage: StageType
    status: StatusType
    progress: int = Field(..., ge=0, le=100)
    message: str
    artifacts: list[StructureArtifact] | None = None


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


class CachePDBRequest(BaseModel):
    pdbData: str


class RegisterSequenceRequest(BaseModel):
    taskId: str
    sequence: str
