"""Tasks API endpoint with SSE streaming."""

import asyncio
import random
import re
import time

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.models.schemas import (
    CreateTaskRequest,
    RegisterSequenceRequest,
    StatusType,
    Task,
)
from app.services.mock_folding import generate_step_events
from app.services.storage import storage
from app.utils.id_generator import generate_id
from app.utils.sequence_validator import (
    DEFAULT_SEQUENCE,
    SequenceValidationError,
    validate_amino_acid_sequence,
)

router = APIRouter(tags=["Tasks"])

# Task ID pattern
TASK_ID_PATTERN = re.compile(r"^task_[a-z0-9]+$")


@router.post("")
async def create_task(request: CreateTaskRequest):
    """Create a new protein folding task."""
    try:
        sequence = request.get_validated_sequence()
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": "Validation failed", "details": [str(e)]}) from e

    now = int(time.time() * 1000)
    task = Task(
        id=generate_id("task"),
        conversationId=request.conversationId or generate_id("conv"),
        status=StatusType.queued,
        sequence=sequence,
        createdAt=now,
        steps=[],
        structures=[],
    )

    storage.save_task(task)
    storage.save_task_sequence(task.id, sequence)

    return {"taskId": task.id, "task": task.model_dump()}


@router.get("")
async def list_tasks(taskId: str | None = Query(None)):
    """List tasks or get a specific task by ID."""
    if taskId:
        task = storage.get_task(taskId)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"task": task.model_dump()}

    tasks = storage.list_tasks()
    return {"tasks": [t.model_dump() for t in tasks]}


@router.post("/{task_id}/stream")
async def register_sequence(task_id: str, request: RegisterSequenceRequest):
    """Pre-register a sequence for streaming."""
    if not TASK_ID_PATTERN.match(task_id):
        raise HTTPException(status_code=400, detail="Invalid task ID")

    try:
        sequence = validate_amino_acid_sequence(request.sequence)
    except SequenceValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    storage.save_task_sequence(task_id, sequence)

    return {"ok": True}


@router.get("/{task_id}/stream")
async def stream_task(task_id: str, sequence: str | None = Query(None)):
    """Stream task progress events via Server-Sent Events (SSE)."""
    # Validate taskId format
    if not TASK_ID_PATTERN.match(task_id):
        raise HTTPException(status_code=400, detail="Invalid task ID")

    # Get sequence from query params or stored data
    raw_sequence = sequence or storage.get_task_sequence(task_id)

    if raw_sequence:
        try:
            final_sequence = validate_amino_acid_sequence(raw_sequence)
        except SequenceValidationError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    else:
        # Use default test sequence
        final_sequence = DEFAULT_SEQUENCE

    async def event_stream():
        """Generate SSE events for the folding task."""
        for event in generate_step_events(task_id, final_sequence):
            # Format as SSE
            event_data = event.model_dump_json()
            yield f"event: step\ndata: {event_data}\n\n"

            # Simulate processing time (500-1200ms between events)
            delay = 0.5 + random.random() * 0.7
            await asyncio.sleep(delay)

        # Send done event
        yield f'event: done\ndata: {{"taskId": "{task_id}"}}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
