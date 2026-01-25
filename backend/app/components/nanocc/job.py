"""NanoCC data models.

Defines the core entities for NanoCC job management:
- NanoCCJob: A job submitted to NanoCC service (folding, optimization, etc.)
- JobEvent: Progress event during job execution
- JobType: Type of NanoCC job (folding, relaxation, etc.)
"""

from enum import Enum

from pydantic import BaseModel, Field, field_validator

from app.components.workspace.models import Structure
from app.utils.fasta_parser import parse_fasta
from app.utils.sequence_validator import normalize_sequence, validate_amino_acid_sequence


class StageType(str, Enum):
    """Job execution stages."""

    QUEUED = "QUEUED"
    MSA = "MSA"
    MODEL = "MODEL"
    RELAX = "RELAX"
    QA = "QA"
    DONE = "DONE"
    ERROR = "ERROR"


class StatusType(str, Enum):
    """Job status."""

    queued = "queued"
    running = "running"
    partial = "partial"
    complete = "complete"
    failed = "failed"
    canceled = "canceled"


class JobType(str, Enum):
    """Type of NanoCC job."""

    folding = "folding"
    relaxation = "relaxation"
    # Future: docking, optimization, etc.


class EventType(str, Enum):
    """Type of SSE event from NanoCC.

    Defines how messages should be displayed in the frontend:
    - PROLOGUE: Opening message listing key verification points (displayed in area 2)
    - ANNOTATION: Additional notes/annotations (displayed in area 2)
    - THINKING_TEXT: Pure text thinking process (displayed in area 3, scrolling)
    - THINKING_PDB: Thinking with structure output (displayed in area 3+4 as thinking block)
    - CONCLUSION: Final conclusion message (displayed as completion message)
    """

    PROLOGUE = "PROLOGUE"
    ANNOTATION = "ANNOTATION"
    THINKING_TEXT = "THINKING_TEXT"
    THINKING_PDB = "THINKING_PDB"
    CONCLUSION = "CONCLUSION"


class JobEvent(BaseModel):
    """Progress event during job execution.

    Streamed via SSE to report job progress.

    Frontend display rules by eventType:
    - PROLOGUE/ANNOTATION: Display in area 2 (opening section)
    - THINKING_TEXT: Display in area 3 (scrolling, 2 visible lines, double-click to expand)
    - THINKING_PDB: Display in area 3+4 as thinking block with structure card
    - CONCLUSION: Display as final completion message
    """

    eventId: str
    jobId: str
    ts: int  # Unix timestamp in milliseconds
    eventType: EventType = EventType.THINKING_TEXT  # Default to THINKING_TEXT for backward compatibility
    stage: StageType
    status: StatusType
    progress: int = Field(..., ge=0, le=100)
    message: str
    blockIndex: int | None = None  # Thinking block index (for THINKING_TEXT/THINKING_PDB grouping)
    artifacts: list[Structure] | None = None


class NanoCCJob(BaseModel):
    """A job submitted to NanoCC service.

    Represents a unit of work processed by NanoCC, such as:
    - Protein structure prediction (folding)
    - Structure relaxation
    - Other computational jobs
    """

    id: str
    conversationId: str
    jobType: JobType = JobType.folding
    status: StatusType
    sequence: str
    createdAt: int
    completedAt: int | None = None
    steps: list[JobEvent] = Field(default_factory=list, serialization_alias="steps")
    structures: list[Structure] = Field(default_factory=list)


# Request models


class CreateJobRequest(BaseModel):
    """Request to create a new NanoCC job."""

    conversationId: str | None = None
    jobType: JobType = JobType.folding
    sequence: str | None = None
    fastaContent: str | None = None

    @field_validator("sequence", mode="before")
    @classmethod
    def normalize_sequence_field(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return normalize_sequence(v)

    def get_validated_sequence(self) -> str:
        """Get and validate the sequence from either direct input or FASTA."""
        seq = self.sequence

        if self.fastaContent:
            parsed = parse_fasta(self.fastaContent)
            if parsed is None:
                raise ValueError("Invalid FASTA format")
            seq = parsed["sequence"]

        if not seq:
            raise ValueError("Either sequence or fastaContent must be provided")

        return validate_amino_acid_sequence(seq)


class RegisterSequenceRequest(BaseModel):
    """Request to pre-register a sequence for streaming."""

    jobId: str
    sequence: str
