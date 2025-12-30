"""Conversations API endpoint."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import Conversation, CreateConversationRequest
from app.services.storage import storage
from app.utils import generate_id, get_timestamp_ms

router = APIRouter(tags=["Conversations"])


@router.post("")
async def create_conversation(request: CreateConversationRequest = None):
    """Create a new conversation.

    Args:
        request: Optional request with title and folderId

    Returns:
        The created conversation with its ID
    """
    if request is None:
        request = CreateConversationRequest()

    now = get_timestamp_ms()
    conversation = Conversation(
        id=generate_id("conv"),
        folderId=request.folderId,  # 1:1 association with Folder
        title=request.title or "New Conversation",
        createdAt=now,
        updatedAt=now,
        messages=[],
        assets=[],
    )

    storage.save_conversation(conversation)

    return {"conversationId": conversation.id, "conversation": conversation.model_dump()}


@router.get("")
async def list_conversations():
    """List all conversations sorted by updatedAt (newest first)."""
    conversations = storage.list_conversations()
    return {"conversations": [c.model_dump() for c in conversations]}


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get a specific conversation by ID."""
    conversation = storage.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {"conversation": conversation.model_dump()}


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation."""
    deleted = storage.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {"ok": True}
