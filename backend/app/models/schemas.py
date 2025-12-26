"""Pydantic models matching the frontend TypeScript types."""

from enum import Enum
from typing import Literal, Optional

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


class StructureMetrics(BaseModel):
    plddtAvg: float = Field(..., ge=0, le=100, description="pLDDT confidence score (0-100)")
    paeAvg: float = Field(..., ge=0, le=30, description="Predicted alignment error (0-30)")
    constraint: float = Field(..., ge=0, le=100, description="Constraint satisfaction (0-100)")


class StructureArtifact(BaseModel):
    type: Literal["structure"] = "structure"
    structureId: str
    label: str  # 'candidate-1', 'candidate-2', ..., 'final'
    filename: str
    metrics: StructureMetrics
    pdbData: Optional[str] = None
    thumbnail: Optional[str] = None
    createdAt: Optional[int] = None  # Timestamp for timeline ordering


class StepEvent(BaseModel):
    eventId: str
    taskId: str
    ts: int  # Unix timestamp in milliseconds
    stage: StageType
    status: StatusType
    progress: int = Field(..., ge=0, le=100)
    message: str
    artifacts: Optional[list[StructureArtifact]] = None


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
    artifacts: Optional[list[StructureArtifact]] = None


class Task(BaseModel):
    id: str
    conversationId: str
    status: StatusType
    sequence: str
    createdAt: int
    completedAt: Optional[int] = None
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
    conversationId: Optional[str] = None
    sequence: Optional[str] = None
    fastaContent: Optional[str] = None

    @field_validator("sequence", mode="before")
    @classmethod
    def normalize_sequence_field(cls, v: Optional[str]) -> Optional[str]:
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
    title: Optional[str] = "New Conversation"


class CachePDBRequest(BaseModel):
    pdbData: str


class RegisterSequenceRequest(BaseModel):
    taskId: str
    sequence: str
