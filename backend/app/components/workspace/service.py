"""Workspace business logic.

Provides service functions for:
- Folder management (CRUD, input handling)
- User management
- Project management (future)
"""

import logging
import time
import uuid
from datetime import datetime

from app.components.workspace.models import (
    AddFolderInputRequest,
    Asset,
    CreateFolderRequest,
    Folder,
    Project,
    User,
    UserPlan,
)
from app.components.workspace.storage_provider import get_workspace_storage

logger = logging.getLogger(__name__)

# ID generators


def generate_folder_id() -> str:
    """Generate a unique folder ID."""
    return f"folder_{uuid.uuid4().hex[:12]}"


def generate_asset_id() -> str:
    """Generate a unique asset ID."""
    return f"asset_{uuid.uuid4().hex[:12]}"


def generate_user_id() -> str:
    """Generate a unique user ID."""
    return f"user_{uuid.uuid4().hex[:12]}"


def generate_project_id() -> str:
    """Generate a unique project ID."""
    return f"project_{uuid.uuid4().hex[:12]}"


def generate_folder_name() -> str:
    """Generate a folder name based on current timestamp."""
    now = datetime.now()
    return now.strftime("%Y-%m-%d_%H%M")


# Default entities (MVP single-user mode)

DEFAULT_USER = User(
    id="user_default",
    name="user",
    email="user@simplex.com",
    plan=UserPlan.free,
    createdAt=int(time.time() * 1000),
)

DEFAULT_PROJECT = Project(
    id="project_default",
    userId=DEFAULT_USER.id,
    name="Default Project",
    description="Default project for MVP",
    createdAt=int(time.time() * 1000),
    updatedAt=int(time.time() * 1000),
)


def _ensure_defaults_initialized() -> None:
    """Ensure default user and project are initialized in storage.

    This is called lazily to avoid issues with module import order
    and to support both memory and Redis storage backends.
    """
    storage = get_workspace_storage()
    if storage.get_user(DEFAULT_USER.id) is None:
        storage.save_user(DEFAULT_USER)
        logger.info(f"Initialized default user: {DEFAULT_USER.id}")
    if storage.get_project(DEFAULT_PROJECT.id) is None:
        storage.save_project(DEFAULT_PROJECT)
        logger.info(f"Initialized default project: {DEFAULT_PROJECT.id}")


# Folder service functions


def create_folder(request: CreateFolderRequest) -> Folder:
    """Create a new folder.

    Args:
        request: Folder creation request with optional name and conversation ID

    Returns:
        The created folder
    """
    _ensure_defaults_initialized()

    now = int(time.time() * 1000)
    folder_id = generate_folder_id()

    folder = Folder(
        id=folder_id,
        projectId=DEFAULT_PROJECT.id,
        name=request.name or generate_folder_name(),
        createdAt=now,
        updatedAt=now,
        isExpanded=True,
        inputs=[],
        outputs=[],
        conversationId=request.conversationId,
    )

    get_workspace_storage().save_folder(folder)
    return folder


def get_folder(folder_id: str) -> Folder | None:
    """Get a folder by ID."""
    return get_workspace_storage().get_folder(folder_id)


def list_folders() -> list[Folder]:
    """List all folders, sorted by creation time (newest first)."""
    return get_workspace_storage().list_folders()


def delete_folder(folder_id: str) -> bool:
    """Delete a folder. Returns True if deleted, False if not found."""
    return get_workspace_storage().delete_folder(folder_id)


def update_folder(
    folder_id: str,
    name: str | None = None,
    isExpanded: bool | None = None,
) -> Folder | None:
    """Update a folder's properties.

    Args:
        folder_id: The folder ID
        name: New folder name (optional)
        isExpanded: New expanded state (optional)

    Returns:
        The updated folder or None if not found
    """
    storage = get_workspace_storage()
    folder = storage.get_folder(folder_id)
    if not folder:
        return None

    if name is not None:
        folder.name = name
    if isExpanded is not None:
        folder.isExpanded = isExpanded

    folder.updatedAt = int(time.time() * 1000)
    storage.save_folder(folder)
    return folder


def add_folder_input(folder_id: str, request: AddFolderInputRequest) -> Asset | None:
    """Add an input file to a folder.

    Args:
        folder_id: The folder ID
        request: Input file data

    Returns:
        The created asset or None if folder not found
    """
    storage = get_workspace_storage()
    folder = storage.get_folder(folder_id)
    if not folder:
        return None

    now = int(time.time() * 1000)
    asset_id = generate_asset_id()

    # Generate path for the asset
    ext_map = {"fasta": ".fasta", "pdb": ".pdb", "text": ".txt"}
    ext = ext_map.get(request.type, ".txt")
    path = f"uploads/{folder_id}/{asset_id}{ext}"

    asset = Asset(
        id=asset_id,
        name=request.name,
        type=request.type,
        path=path,
        size=len(request.content.encode("utf-8")),
        uploadedAt=now,
    )

    folder.inputs.append(asset)
    folder.updatedAt = now
    storage.save_folder(folder)

    return asset


def list_folder_inputs(folder_id: str) -> list[Asset] | None:
    """List all input files in a folder.

    Args:
        folder_id: The folder ID

    Returns:
        List of input assets or None if folder not found
    """
    folder = get_workspace_storage().get_folder(folder_id)
    if not folder:
        return None
    return folder.inputs


def link_folder_conversation(folder_id: str, conversation_id: str) -> Folder | None:
    """Link a folder to a conversation (1:1 association).

    Args:
        folder_id: The folder ID
        conversation_id: The conversation ID to link

    Returns:
        The updated folder or None if not found
    """
    storage = get_workspace_storage()
    folder = storage.get_folder(folder_id)
    if not folder:
        return None

    folder.conversationId = conversation_id
    folder.updatedAt = int(time.time() * 1000)
    storage.save_folder(folder)

    return folder


# User service functions


def get_current_user() -> User:
    """Get the current user.

    For MVP, returns the default user.
    In future, this will return the authenticated user.
    """
    _ensure_defaults_initialized()
    return DEFAULT_USER


def get_user(user_id: str) -> User | None:
    """Get a user by ID."""
    return get_workspace_storage().get_user(user_id)


def update_current_user(name: str | None = None, email: str | None = None) -> User:
    """Update the current user's profile.

    Args:
        name: New name (optional)
        email: New email (optional)

    Returns:
        The updated user
    """
    _ensure_defaults_initialized()
    storage = get_workspace_storage()

    # Get the current user from storage (may have been updated elsewhere)
    current = storage.get_user(DEFAULT_USER.id)
    if current is None:
        current = DEFAULT_USER

    if name is not None:
        current.name = name
    if email is not None:
        current.email = email

    storage.save_user(current)
    return current
