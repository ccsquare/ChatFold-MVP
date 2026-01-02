"""Pydantic models matching the frontend TypeScript types.

Workspace-related models (Project, Folder, Asset, User) are defined in
the workspace module and re-exported here for backward compatibility.

NanoCC-related models (NanoCCJob, JobEvent, etc.) are defined in
the nanocc module and re-exported here for backward compatibility.
"""

from typing import Literal

from pydantic import BaseModel, Field

# Re-export workspace models for backward compatibility
from app.components.workspace.models import (
    Project,
    Folder,
    Asset,
    User,
    UserPlan,
    StructureArtifact,
    CreateFolderRequest,
    AddFolderInputRequest,
)

# Re-export nanocc models for backward compatibility
from app.components.nanocc.job import (
    NanoCCJob,
    JobEvent,
    JobType,
    StageType,
    StatusType,
    CreateJobRequest,
    RegisterSequenceRequest,
)

# Aliases
Job = NanoCCJob  # Primary alias
StepEvent = JobEvent  # Legacy alias


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant", "tool"]
    content: str
    timestamp: int
    artifacts: list[StructureArtifact] | None = None


class Conversation(BaseModel):
    id: str
    folderId: str | None = None  # 1:1 association with Folder
    title: str
    createdAt: int
    updatedAt: int
    messages: list[ChatMessage] = Field(default_factory=list)
    assets: list[Asset] = Field(default_factory=list)


# Request/Response models

class CreateConversationRequest(BaseModel):
    title: str | None = "New Conversation"
    folderId: str | None = None  # Optional folder association


class CachePDBRequest(BaseModel):
    pdbData: str
