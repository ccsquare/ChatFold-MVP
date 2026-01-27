"""Data models for ChatFold.

Workspace-related models are defined in the workspace module
and re-exported from schemas.py for backward compatibility.
"""

from app.models.schemas import (
    AddFolderInputRequest,
    Asset,
    CachePDBRequest,
    ChatMessage,
    Conversation,
    CreateConversationRequest,
    CreateFolderRequest,
    # Request models
    CreateJobRequest,
    CreateTaskRequest,
    Folder,
    Job,
    JobEvent,
    NanoCCJob,
    # Re-exported from workspace (for backward compatibility)
    Project,
    RegisterSequenceRequest,
    # Core models
    StageType,
    StatusType,
    StepEvent,
    Structure,
    Task,
    TaskEvent,
    User,
    UserPlan,
)

__all__ = [
    # Core models — Task terminology (primary)
    "Task",
    "TaskEvent",
    "CreateTaskRequest",
    # Core models
    "StageType",
    "StatusType",
    "StepEvent",
    "JobEvent",
    "ChatMessage",
    "Job",
    "NanoCCJob",
    "Conversation",
    # Request models
    "CreateJobRequest",
    "CreateConversationRequest",
    "CachePDBRequest",
    "RegisterSequenceRequest",
    # Workspace models (re-exported)
    "Project",
    "Folder",
    "Asset",
    "User",
    "UserPlan",
    "Structure",
    "CreateFolderRequest",
    "AddFolderInputRequest",
]
