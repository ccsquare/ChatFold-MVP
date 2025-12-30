"""Folder API endpoints.

Manages folders that contain input sequences and output structures.
Each folder has a 1:1 association with a conversation.
"""

import time
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    Asset,
    Folder,
    CreateFolderRequest,
    AddFolderInputRequest,
)

router = APIRouter()

# In-memory storage (for MVP, replace with database later)
folders_db: dict[str, Folder] = {}


def generate_folder_id() -> str:
    """Generate a unique folder ID."""
    return f"folder_{uuid.uuid4().hex[:12]}"


def generate_asset_id() -> str:
    """Generate a unique asset ID."""
    return f"asset_{uuid.uuid4().hex[:12]}"


def generate_folder_name() -> str:
    """Generate a folder name based on current timestamp."""
    now = datetime.now()
    return now.strftime("%Y-%m-%d_%H%M")


@router.post("", response_model=Folder)
async def create_folder(request: CreateFolderRequest) -> Folder:
    """Create a new folder.

    Args:
        request: Folder creation request with optional name and conversation ID

    Returns:
        The created folder
    """
    now = int(time.time() * 1000)
    folder_id = generate_folder_id()

    folder = Folder(
        id=folder_id,
        name=request.name or generate_folder_name(),
        createdAt=now,
        updatedAt=now,
        isExpanded=True,
        inputs=[],
        outputs=[],
        conversationId=request.conversationId,
    )

    folders_db[folder_id] = folder
    return folder


@router.get("", response_model=list[Folder])
async def list_folders() -> list[Folder]:
    """List all folders.

    Returns:
        List of all folders, sorted by creation time (newest first)
    """
    return sorted(folders_db.values(), key=lambda f: f.createdAt, reverse=True)


@router.get("/{folder_id}", response_model=Folder)
async def get_folder(folder_id: str) -> Folder:
    """Get a specific folder by ID.

    Args:
        folder_id: The folder ID

    Returns:
        The folder

    Raises:
        HTTPException: If folder not found
    """
    folder = folders_db.get(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


@router.delete("/{folder_id}")
async def delete_folder(folder_id: str) -> dict:
    """Delete a folder.

    Args:
        folder_id: The folder ID

    Returns:
        Success message

    Raises:
        HTTPException: If folder not found
    """
    if folder_id not in folders_db:
        raise HTTPException(status_code=404, detail="Folder not found")

    del folders_db[folder_id]
    return {"message": "Folder deleted", "id": folder_id}


@router.patch("/{folder_id}", response_model=Folder)
async def update_folder(folder_id: str, name: str | None = None, isExpanded: bool | None = None) -> Folder:
    """Update a folder's properties.

    Args:
        folder_id: The folder ID
        name: New folder name (optional)
        isExpanded: New expanded state (optional)

    Returns:
        The updated folder

    Raises:
        HTTPException: If folder not found
    """
    folder = folders_db.get(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if name is not None:
        folder.name = name
    if isExpanded is not None:
        folder.isExpanded = isExpanded

    folder.updatedAt = int(time.time() * 1000)
    return folder


@router.post("/{folder_id}/inputs", response_model=Asset)
async def add_folder_input(folder_id: str, request: AddFolderInputRequest) -> Asset:
    """Add an input file to a folder.

    Args:
        folder_id: The folder ID
        request: Input file data

    Returns:
        The created asset

    Raises:
        HTTPException: If folder not found
    """
    folder = folders_db.get(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    now = int(time.time() * 1000)
    asset = Asset(
        id=generate_asset_id(),
        name=request.name,
        type=request.type,
        content=request.content,
        uploadedAt=now,
    )

    folder.inputs.append(asset)
    folder.updatedAt = now

    return asset


@router.get("/{folder_id}/inputs", response_model=list[Asset])
async def list_folder_inputs(folder_id: str) -> list[Asset]:
    """List all input files in a folder.

    Args:
        folder_id: The folder ID

    Returns:
        List of input assets

    Raises:
        HTTPException: If folder not found
    """
    folder = folders_db.get(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    return folder.inputs


@router.post("/{folder_id}/link-conversation")
async def link_conversation(folder_id: str, conversation_id: str) -> Folder:
    """Link a folder to a conversation (1:1 association).

    Args:
        folder_id: The folder ID
        conversation_id: The conversation ID to link

    Returns:
        The updated folder

    Raises:
        HTTPException: If folder not found
    """
    folder = folders_db.get(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder.conversationId = conversation_id
    folder.updatedAt = int(time.time() * 1000)

    return folder
