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
    type: Literal["structure"] = "structure"
    structureId: str
    label: str  # 'candidate-1', 'candidate-2', ..., 'final'
    filename: str
    pdbData: str | None = None
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
    id: str
    name: str
    type: Literal["fasta", "pdb", "text"]
    content: str
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
    title: str
    createdAt: int
    updatedAt: int
    messages: list[ChatMessage] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
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


class CachePDBRequest(BaseModel):
    pdbData: str


class RegisterSequenceRequest(BaseModel):
    taskId: str
    sequence: str
