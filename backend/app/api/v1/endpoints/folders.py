"""Folder API endpoints.

Manages folders that contain input sequences and output structures.
Each folder has a 1:1 association with a conversation.

This endpoint layer delegates to the workspace module for business logic.
"""

from fastapi import APIRouter, HTTPException

from app.components.workspace import (
    AddFolderInputRequest,
    Asset,
    CreateFolderRequest,
    Folder,
    add_folder_input,
    create_folder,
    delete_folder,
    get_folder,
    link_folder_conversation,
    list_folder_inputs,
    list_folders,
    update_folder,
)

router = APIRouter()


@router.post("", response_model=Folder)
async def create_folder_endpoint(request: CreateFolderRequest) -> Folder:
    """Create a new folder.

    Args:
        request: Folder creation request with optional name and conversation ID

    Returns:
        The created folder
    """
    return create_folder(request)


@router.get("", response_model=list[Folder])
async def list_folders_endpoint() -> list[Folder]:
    """List all folders.

    Returns:
        List of all folders, sorted by creation time (newest first)
    """
    return list_folders()


@router.get("/{folder_id}", response_model=Folder)
async def get_folder_endpoint(folder_id: str) -> Folder:
    """Get a specific folder by ID.

    Args:
        folder_id: The folder ID

    Returns:
        The folder

    Raises:
        HTTPException: If folder not found
    """
    folder = get_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


@router.delete("/{folder_id}")
async def delete_folder_endpoint(folder_id: str) -> dict:
    """Delete a folder.

    Args:
        folder_id: The folder ID

    Returns:
        Success message

    Raises:
        HTTPException: If folder not found
    """
    if not delete_folder(folder_id):
        raise HTTPException(status_code=404, detail="Folder not found")

    return {"message": "Folder deleted", "id": folder_id}


@router.patch("/{folder_id}", response_model=Folder)
async def update_folder_endpoint(
    folder_id: str,
    name: str | None = None,
    isExpanded: bool | None = None,
) -> Folder:
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
    folder = update_folder(folder_id, name=name, isExpanded=isExpanded)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


@router.post("/{folder_id}/inputs", response_model=Asset)
async def add_folder_input_endpoint(
    folder_id: str,
    request: AddFolderInputRequest,
) -> Asset:
    """Add an input file to a folder.

    Args:
        folder_id: The folder ID
        request: Input file data

    Returns:
        The created asset

    Raises:
        HTTPException: If folder not found
    """
    asset = add_folder_input(folder_id, request)
    if not asset:
        raise HTTPException(status_code=404, detail="Folder not found")
    return asset


@router.get("/{folder_id}/inputs", response_model=list[Asset])
async def list_folder_inputs_endpoint(folder_id: str) -> list[Asset]:
    """List all input files in a folder.

    Args:
        folder_id: The folder ID

    Returns:
        List of input assets

    Raises:
        HTTPException: If folder not found
    """
    inputs = list_folder_inputs(folder_id)
    if inputs is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    return inputs


@router.post("/{folder_id}/link-conversation")
async def link_conversation_endpoint(folder_id: str, conversation_id: str) -> Folder:
    """Link a folder to a conversation (1:1 association).

    Args:
        folder_id: The folder ID
        conversation_id: The conversation ID to link

    Returns:
        The updated folder

    Raises:
        HTTPException: If folder not found
    """
    folder = link_folder_conversation(folder_id, conversation_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder
