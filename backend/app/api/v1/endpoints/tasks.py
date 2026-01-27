"""Tasks API endpoint with SSE streaming.

This module provides REST endpoints for NanoCC task management:
- Create folding tasks
- List/get tasks
- Stream task progress via SSE
- Cancel running tasks

Storage Integration:
- Redis: Task state cache and SSE event queues (always enabled)
- MySQL + Filesystem: Persistent storage (default, use_memory_store=false)
- Memory: In-memory only mode (use_memory_store=true)

Concurrency Safety:
- MySQL writes are performed first (source of truth)
- Redis is updated after MySQL (cache layer)
- If Redis fails after MySQL success, cache can be rebuilt on read
"""

import asyncio
import logging
import os
import random
import re

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.components.nanocc import (
    CreateJobRequest,
    NanoCCClient,
    NanoCCJob,
    RegisterSequenceRequest,
    StageType,
    StatusType,
    generate_cot_events,
    generate_step_events,
)
from app.db.mysql import get_db_session
from app.repositories import task_repository
from app.services.memory_store import storage
from app.services.sse_events import sse_events_service
from app.services.task_state import task_state_service
from app.settings import settings
from app.utils import (
    DEFAULT_SEQUENCE,
    SequenceValidationError,
    generate_id,
    get_timestamp_ms,
    validate_amino_acid_sequence,
)

logger = logging.getLogger(__name__)

# Feature flags
USE_NANOCC = os.getenv("USE_NANOCC", "true").lower() in ("true", "1", "yes")

router = APIRouter(tags=["Tasks"])


def _is_task_canceled(task_id: str) -> bool:
    """Check if task has been canceled.

    Uses Redis only for multi-instance consistency.
    Memory store fallback is removed to prevent cross-instance issues.

    Args:
        task_id: Task ID to check

    Returns:
        True if task is canceled
    """
    # Redis only - shared across all instances
    return task_state_service.is_canceled(task_id)


# Task ID pattern
TASK_ID_PATTERN = re.compile(r"^task_[a-z0-9]+$")


def _save_task_to_mysql(task: NanoCCJob) -> bool:
    """Save task to MySQL database (if persistent mode enabled).

    Returns:
        True if saved successfully (or memory mode), False if failed
    """
    if settings.use_memory_store:
        return True

    try:
        with get_db_session() as db:
            task_repository.create(
                db,
                {
                    "id": task.id,
                    "user_id": None,  # MVP: no user auth yet
                    "conversation_id": None,  # MVP: conversations in memory
                    "task_type": "folding",
                    "status": task.status.value,
                    "stage": "QUEUED",
                    "sequence": task.sequence,
                    "file_path": None,
                    "created_at": task.createdAt,
                    "completed_at": None,
                },
            )
            db.commit()  # Explicit commit for clarity
        return True
    except Exception as e:
        logger.error(f"Failed to save task to MySQL: {e}")
        return False


def _update_task_status_mysql(task_id: str, status: str, stage: str | None = None) -> bool:
    """Update task status in MySQL database (if persistent mode enabled).

    Returns:
        True if updated successfully (or memory mode), False if failed
    """
    if settings.use_memory_store:
        return True

    try:
        with get_db_session() as db:
            task_repository.update_status(db, task_id, status, stage)
            db.commit()
        return True
    except Exception as e:
        logger.warning(f"Failed to update task status in MySQL: {e}")
        return False


@router.post("")
async def create_task(request: CreateJobRequest):
    """Create a new protein folding task.

    Storage order (MySQL-first for consistency):
    1. MySQL (source of truth) - fails fast if DB is unavailable
    2. Redis (cache layer) - for multi-instance state sharing
    3. Memory store (legacy fallback) - for backward compatibility
    """
    logger.info(
        f"POST /tasks: conversation_id={request.conversationId}, "
        f"sequence_len={len(request.sequence) if request.sequence else 0}"
    )
    try:
        sequence = request.get_validated_sequence()
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": "Validation failed", "details": [str(e)]}) from e

    task = NanoCCJob(
        id=generate_id("task"),
        conversationId=request.conversationId or generate_id("conv"),
        status=StatusType.queued,
        sequence=sequence,
        createdAt=get_timestamp_ms(),
        steps=[],
        structures=[],
    )

    # Step 1: Save to MySQL first (source of truth for persistent mode)
    if not _save_task_to_mysql(task):
        # MySQL failed in persistent mode - this is a critical error
        if not settings.use_memory_store:
            raise HTTPException(status_code=500, detail="Failed to create task: database error")

    # Step 2: Create task state and metadata in Redis (multi-instance support)
    # If this fails after MySQL success, cache can be rebuilt on read
    try:
        task_state_service.create_state(
            task.id,
            status=StatusType.queued,
            stage=StageType.QUEUED,
            message="Task created and queued for processing",
        )
        task_state_service.save_task_meta(
            task.id,
            sequence=sequence,
            conversation_id=task.conversationId,
        )
    except Exception as e:
        logger.warning(f"Redis cache update failed (task {task.id}): {e}")
        # Don't fail - MySQL has the data, Redis can be rebuilt

    # Step 3: Save to memory store (legacy fallback for backward compatibility)
    storage.save_task(task)
    storage.save_task_sequence(task.id, sequence)

    return {"taskId": task.id, "task": task.model_dump()}


@router.get("")
async def list_tasks(taskId: str | None = Query(None)):
    """List tasks or get a specific task by ID."""
    logger.info(f"GET /tasks: taskId={taskId}")
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
    logger.info(f"POST /tasks/{task_id}/stream: sequence_len={len(request.sequence)}")
    if not TASK_ID_PATTERN.match(task_id):
        raise HTTPException(status_code=400, detail="Invalid task ID")

    try:
        sequence = validate_amino_acid_sequence(request.sequence)
    except SequenceValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Save to Redis for multi-instance access
    task_state_service.save_task_meta(task_id, sequence=sequence)

    # Also save to memory store for backward compatibility
    storage.save_task_sequence(task_id, sequence)

    return {"ok": True}


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Cancel a running task.

    This endpoint:
    1. Sends interrupt signal to NanoCC if session is active
    2. Marks the task as canceled in Redis (shared across all instances)
    3. Updates memory store and MySQL for backward compatibility

    The SSE stream will detect the canceled status and terminate gracefully.
    """
    logger.info(f"POST /tasks/{task_id}/cancel")
    if not TASK_ID_PATTERN.match(task_id):
        raise HTTPException(status_code=400, detail="Invalid task ID")

    # Check task state in Redis (shared across instances)
    state = task_state_service.get_state(task_id)
    if not state:
        # Fallback to memory store for backward compatibility
        task = storage.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        current_status = task.status.value
    else:
        current_status = state.get("status", "unknown")

    # Check if task is still running
    if current_status not in [StatusType.queued.value, StatusType.running.value]:
        return {"ok": False, "message": "Task is not running", "status": current_status}

    # Try to interrupt NanoCC session if one exists
    nanocc_interrupted = False
    nanocc_session = task_state_service.get_nanocc_session(task_id)
    if nanocc_session and nanocc_session.get("session_id"):
        try:
            client = NanoCCClient(
                base_url=nanocc_session["backend_url"],
            )
            await client.interrupt_session(nanocc_session["session_id"])
            nanocc_interrupted = True
            logger.info(
                f"Interrupted NanoCC session {nanocc_session['session_id']} for task {task_id}"
            )
        except Exception as e:
            # Log but don't fail - the task may have already finished
            logger.warning(
                f"Failed to interrupt NanoCC session for task {task_id}: {e}"
            )

    # Mark as canceled in Redis (visible to all instances)
    success = task_state_service.mark_canceled(task_id)

    # Also mark in memory store for backward compatibility
    storage.cancel_task(task_id)

    # Update MySQL if enabled
    _update_task_status_mysql(task_id, "canceled", "ERROR")

    return {
        "ok": success,
        "taskId": task_id,
        "status": "canceled" if success else current_status,
        "nanoccInterrupted": nanocc_interrupted,
    }


@router.get("/{task_id}/stream")
async def stream_task(
    task_id: str,
    sequence: str | None = Query(None),
    files: str | None = Query(None, description="Comma-separated list of filenames in TOS upload directory"),
    use_nanocc: bool | None = Query(None, alias="nanocc"),
):
    """Stream task progress events via Server-Sent Events (SSE).

    Args:
        task_id: The task identifier
        sequence: Optional amino acid sequence (if not pre-registered)
        files: Comma-separated list of filenames to download from TOS.
               Files should be pre-uploaded to tos://bucket/sessions/{session_id}/upload/
        use_nanocc: Override NanoCC usage (default: USE_NANOCC env var)
    """
    # Parse files parameter
    file_list: list[str] | None = None
    if files:
        file_list = [f.strip() for f in files.split(",") if f.strip()]

    logger.info(
        f"GET /tasks/{task_id}/stream: sequence_len={len(sequence) if sequence else 'None'}, "
        f"files={file_list}, nanocc={use_nanocc}"
    )
    # Validate task_id format
    if not TASK_ID_PATTERN.match(task_id):
        raise HTTPException(status_code=400, detail="Invalid task ID")

    # Get sequence from query params or Redis (multi-instance) or memory store (fallback)
    raw_sequence = sequence or task_state_service.get_task_sequence(task_id) or storage.get_task_sequence(task_id)

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
        # Update task state to running in Redis
        task_state_service.set_state(
            task_id,
            status=StatusType.running,
            stage=StageType.QUEUED,
            progress=0,
            message="Starting task processing",
        )

        if enable_nanocc:
            # Use NanoCC-powered async generator
            async for event in generate_cot_events(task_id, final_sequence, files=file_list):
                # Check if task was canceled before each event (Redis + memory)
                if _is_task_canceled(task_id):
                    task_state_service.mark_canceled(task_id, "Task canceled by user")
                    _update_task_status_mysql(task_id, "canceled", "ERROR")
                    yield f'event: canceled\ndata: {{"taskId": "{task_id}", "message": "Task canceled by user"}}\n\n'
                    return

                # Push event to Redis queue for replay support
                sse_events_service.push_event(event)

                # Update task state in Redis
                task_state_service.set_state(
                    task_id,
                    status=event.status,
                    stage=event.stage,
                    progress=event.progress,
                    message=event.message,
                )

                # Format as SSE
                event_data = event.model_dump_json()
                yield f"event: step\ndata: {event_data}\n\n"
        else:
            # Use synchronous mock generator (legacy mode)
            for event in generate_step_events(task_id, final_sequence):
                # Check if task was canceled before each event (Redis + memory)
                if _is_task_canceled(task_id):
                    task_state_service.mark_canceled(task_id, "Task canceled by user")
                    _update_task_status_mysql(task_id, "canceled", "ERROR")
                    yield f'event: canceled\ndata: {{"taskId": "{task_id}", "message": "Task canceled by user"}}\n\n'
                    return

                # Push event to Redis queue for replay support
                sse_events_service.push_event(event)

                # Update task state in Redis
                task_state_service.set_state(
                    task_id,
                    status=event.status,
                    stage=event.stage,
                    progress=event.progress,
                    message=event.message,
                )

                # Format as SSE
                event_data = event.model_dump_json()
                yield f"event: step\ndata: {event_data}\n\n"

                # Simulate processing time, split into smaller chunks for faster cancellation detection
                for _ in range(5):
                    if _is_task_canceled(task_id):
                        task_state_service.mark_canceled(task_id, "Task canceled by user")
                        _update_task_status_mysql(task_id, "canceled", "ERROR")
                        yield f'event: canceled\ndata: {{"taskId": "{task_id}", "message": "Task canceled by user"}}\n\n'
                        return
                    await asyncio.sleep(0.1 + random.random() * 0.14)

        # Send done event only if not canceled
        if not _is_task_canceled(task_id):
            task_state_service.mark_complete(task_id, "Task completed successfully")
            sse_events_service.set_completion_ttl(task_id)
            _update_task_status_mysql(task_id, "complete", "DONE")
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


@router.get("/{task_id}/state")
async def get_task_state(task_id: str):
    """Get current task state from Redis.

    This endpoint provides fast access to task status without
    requiring a database query.
    """
    logger.info(f"GET /tasks/{task_id}/state")
    if not TASK_ID_PATTERN.match(task_id):
        raise HTTPException(status_code=400, detail="Invalid task ID")

    state = task_state_service.get_state(task_id)
    if not state:
        raise HTTPException(status_code=404, detail="Task state not found")

    return {"taskId": task_id, "state": state}


@router.get("/{task_id}/events")
async def get_task_events(
    task_id: str,
    offset: int = Query(0, ge=0, description="Start from this event index"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum events to return"),
):
    """Get task events from Redis for replay.

    This endpoint allows clients to retrieve missed events when
    reconnecting to an SSE stream.

    Args:
        task_id: The task identifier
        offset: Start from this event index (0-based)
        limit: Maximum number of events to return
    """
    logger.info(f"GET /tasks/{task_id}/events: offset={offset}, limit={limit}")
    if not TASK_ID_PATTERN.match(task_id):
        raise HTTPException(status_code=400, detail="Invalid task ID")

    # Get events from offset
    events = sse_events_service.get_events(task_id, start=offset, end=offset + limit - 1)

    return {
        "taskId": task_id,
        "offset": offset,
        "count": len(events),
        "total": sse_events_service.get_events_count(task_id),
        "events": [e.model_dump() for e in events],
    }
