"""Tasks API endpoint with SSE streaming."""

import asyncio
import os
import random
import re

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.models.schemas import (
    CreateTaskRequest,
    RegisterSequenceRequest,
    StatusType,
    Task,
)
from app.services.memory_store import storage
from app.components.nanocc import generate_cot_events, generate_step_events
from app.utils import (
    generate_id,
    get_timestamp_ms,
    validate_amino_acid_sequence,
    SequenceValidationError,
    DEFAULT_SEQUENCE,
)

# NanoCC feature flag - can be disabled via environment variable
USE_NANOCC = os.getenv("USE_NANOCC", "true").lower() in ("true", "1", "yes")

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

    task = Task(
        id=generate_id("task"),
        conversationId=request.conversationId or generate_id("conv"),
        status=StatusType.queued,
        sequence=sequence,
        createdAt=get_timestamp_ms(),
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


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Cancel a running task."""
    if not TASK_ID_PATTERN.match(task_id):
        raise HTTPException(status_code=400, detail="Invalid task ID")

    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check if task is still running
    if task.status not in [StatusType.queued, StatusType.running]:
        return {"ok": False, "message": "Task is not running", "status": task.status.value}

    # Mark as canceled
    success = storage.cancel_task(task_id)

    return {"ok": success, "taskId": task_id, "status": "canceled" if success else task.status.value}


@router.get("/{task_id}/stream")
async def stream_task(
    task_id: str,
    sequence: str | None = Query(None),
    use_nanocc: bool | None = Query(None, alias="nanocc"),
):
    """Stream task progress events via Server-Sent Events (SSE).

    Args:
        task_id: The task identifier
        sequence: Optional amino acid sequence (if not pre-registered)
        use_nanocc: Override NanoCC usage (default: USE_NANOCC env var)
    """
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

    # Determine whether to use NanoCC
    enable_nanocc = use_nanocc if use_nanocc is not None else USE_NANOCC

    async def event_stream():
        """Generate SSE events for the folding task."""
        if enable_nanocc:
            # Use NanoCC-powered async generator
            async for event in generate_cot_events(task_id, final_sequence):
                # Check if task was canceled before each event
                if storage.is_task_canceled(task_id):
                    yield f'event: canceled\ndata: {{"taskId": "{task_id}", "message": "Task canceled by user"}}\n\n'
                    return

                # Format as SSE
                event_data = event.model_dump_json()
                yield f"event: step\ndata: {event_data}\n\n"
        else:
            # Use synchronous mock generator (legacy mode)
            for event in generate_step_events(task_id, final_sequence):
                # Check if task was canceled before each event
                if storage.is_task_canceled(task_id):
                    yield f'event: canceled\ndata: {{"taskId": "{task_id}", "message": "Task canceled by user"}}\n\n'
                    return

                # Format as SSE
                event_data = event.model_dump_json()
                yield f"event: step\ndata: {event_data}\n\n"

                # Simulate processing time, split into smaller chunks for faster cancellation detection
                for _ in range(5):
                    if storage.is_task_canceled(task_id):
                        yield f'event: canceled\ndata: {{"taskId": "{task_id}", "message": "Task canceled by user"}}\n\n'
                        return
                    await asyncio.sleep(0.1 + random.random() * 0.14)

        # Send done event only if not canceled
        if not storage.is_task_canceled(task_id):
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
