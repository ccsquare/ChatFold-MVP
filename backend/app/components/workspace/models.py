"""Workspace data models.

Defines the core entities for workspace organization:
- Project: Top-level container for folders
- Folder: Contains input sequences and output structures
- Asset: File asset (FASTA, PDB, etc.)
- User: User with subscription plan
"""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class UserPlan(str, Enum):
    """User subscription plan."""

    free = "free"
    pro = "pro"


class User(BaseModel):
    """User model for multi-user support."""

    id: str
    name: str
    email: str
    plan: UserPlan = UserPlan.free
    createdAt: int | None = None


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
    path: str  # Relative path from outputs root
    size: int | None = None  # File size in bytes
    uploadedAt: int


class Structure(BaseModel):
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
    path: str | None = None
    pdbData: str | None = None  # Inline PDB content (for SSE streaming)
    thumbnail: str | None = None
    createdAt: int | None = None
    cot: str | None = None  # Chain-of-thought reasoning


class Folder(BaseModel):
    """Folder contains input sequences and output structures.

    Each folder has a 1:1 association with a conversation.
    """

    id: str
    projectId: str | None = None  # Parent project (MVP: project_default)
    name: str
    createdAt: int
    updatedAt: int
    isExpanded: bool = True
    inputs: list[Asset] = Field(default_factory=list)
    outputs: list[Structure] = Field(default_factory=list)
    taskId: str | None = None
    conversationId: str | None = None  # 1:1 association with Conversation


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


# Request models


class CreateFolderRequest(BaseModel):
    """Request to create a new folder."""

    name: str | None = None  # Auto-generate if not provided
    conversationId: str | None = None  # Optional conversation association


class AddFolderInputRequest(BaseModel):
    """Request to add an input file to a folder."""

    name: str
    type: Literal["fasta", "pdb", "text"]
    content: str
