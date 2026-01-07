"""Jobs API endpoint with SSE streaming.

This module provides REST endpoints for NanoCC job management:
- Create folding jobs
- List/get jobs
- Stream job progress via SSE
- Cancel running jobs

Storage Integration:
- Redis: Job state cache and SSE event queues (always enabled)
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
    NanoCCJob,
    RegisterSequenceRequest,
    StageType,
    StatusType,
    generate_cot_events,
    generate_step_events,
)
from app.services.job_state import job_state_service
from app.services.memory_store import storage
from app.services.sse_events import sse_events_service
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

router = APIRouter(tags=["Jobs"])


def _is_job_canceled(job_id: str) -> bool:
    """Check if job has been canceled.

    Uses Redis only for multi-instance consistency.
    Memory store fallback is removed to prevent cross-instance issues.

    Args:
        job_id: Job ID to check

    Returns:
        True if job is canceled
    """
    # Redis only - shared across all instances
    return job_state_service.is_canceled(job_id)


# Job ID pattern
JOB_ID_PATTERN = re.compile(r"^job_[a-z0-9]+$")


def _save_job_to_mysql(job: NanoCCJob) -> bool:
    """Save job to MySQL database (if persistent mode enabled).

    Returns:
        True if saved successfully (or memory mode), False if failed
    """
    if settings.use_memory_store:
        return True

    from app.db.mysql import get_db_session
    from app.repositories import job_repository

    try:
        with get_db_session() as db:
            job_repository.create(
                db,
                {
                    "id": job.id,
                    "user_id": None,  # MVP: no user auth yet
                    "conversation_id": None,  # MVP: conversations in memory
                    "job_type": "folding",
                    "status": job.status.value,
                    "stage": "QUEUED",
                    "sequence": job.sequence,
                    "file_path": None,
                    "created_at": job.createdAt,
                    "completed_at": None,
                },
            )
            db.commit()  # Explicit commit for clarity
        return True
    except Exception as e:
        logger.error(f"Failed to save job to MySQL: {e}")
        return False


def _update_job_status_mysql(job_id: str, status: str, stage: str | None = None) -> bool:
    """Update job status in MySQL database (if persistent mode enabled).

    Returns:
        True if updated successfully (or memory mode), False if failed
    """
    if settings.use_memory_store:
        return True

    from app.db.mysql import get_db_session
    from app.repositories import job_repository

    try:
        with get_db_session() as db:
            job_repository.update_status(db, job_id, status, stage)
            db.commit()
        return True
    except Exception as e:
        logger.warning(f"Failed to update job status in MySQL: {e}")
        return False


@router.post("")
async def create_job(request: CreateJobRequest):
    """Create a new protein folding job.

    Storage order (MySQL-first for consistency):
    1. MySQL (source of truth) - fails fast if DB is unavailable
    2. Redis (cache layer) - for multi-instance state sharing
    3. Memory store (legacy fallback) - for backward compatibility
    """
    logger.info(
        f"POST /jobs: conversation_id={request.conversationId}, "
        f"sequence_len={len(request.sequence) if request.sequence else 0}"
    )
    try:
        sequence = request.get_validated_sequence()
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": "Validation failed", "details": [str(e)]}) from e

    job = NanoCCJob(
        id=generate_id("job"),
        conversationId=request.conversationId or generate_id("conv"),
        status=StatusType.queued,
        sequence=sequence,
        createdAt=get_timestamp_ms(),
        steps=[],
        structures=[],
    )

    # Step 1: Save to MySQL first (source of truth for persistent mode)
    if not _save_job_to_mysql(job):
        # MySQL failed in persistent mode - this is a critical error
        if not settings.use_memory_store:
            raise HTTPException(status_code=500, detail="Failed to create job: database error")

    # Step 2: Create job state and metadata in Redis (multi-instance support)
    # If this fails after MySQL success, cache can be rebuilt on read
    try:
        job_state_service.create_state(
            job.id,
            status=StatusType.queued,
            stage=StageType.QUEUED,
            message="Job created and queued for processing",
        )
        job_state_service.save_job_meta(
            job.id,
            sequence=sequence,
            conversation_id=job.conversationId,
        )
    except Exception as e:
        logger.warning(f"Redis cache update failed (job {job.id}): {e}")
        # Don't fail - MySQL has the data, Redis can be rebuilt

    # Step 3: Save to memory store (legacy fallback for backward compatibility)
    storage.save_job(job)
    storage.save_job_sequence(job.id, sequence)

    return {"jobId": job.id, "job": job.model_dump()}


@router.get("")
async def list_jobs(jobId: str | None = Query(None)):
    """List jobs or get a specific job by ID."""
    logger.info(f"GET /jobs: jobId={jobId}")
    if jobId:
        job = storage.get_job(jobId)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"job": job.model_dump()}

    jobs = storage.list_jobs()
    return {"jobs": [j.model_dump() for j in jobs]}


@router.post("/{job_id}/stream")
async def register_sequence(job_id: str, request: RegisterSequenceRequest):
    """Pre-register a sequence for streaming."""
    logger.info(f"POST /jobs/{job_id}/stream: sequence_len={len(request.sequence)}")
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")

    try:
        sequence = validate_amino_acid_sequence(request.sequence)
    except SequenceValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Save to Redis for multi-instance access
    job_state_service.save_job_meta(job_id, sequence=sequence)

    # Also save to memory store for backward compatibility
    storage.save_job_sequence(job_id, sequence)

    return {"ok": True}


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a running job.

    This endpoint marks the job as canceled in Redis, which is shared
    across all application instances. The SSE stream will detect this
    status and terminate gracefully.
    """
    logger.info(f"POST /jobs/{job_id}/cancel")
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")

    # Check job state in Redis (shared across instances)
    state = job_state_service.get_state(job_id)
    if not state:
        # Fallback to memory store for backward compatibility
        job = storage.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        current_status = job.status.value
    else:
        current_status = state.get("status", "unknown")

    # Check if job is still running
    if current_status not in [StatusType.queued.value, StatusType.running.value]:
        return {"ok": False, "message": "Job is not running", "status": current_status}

    # Mark as canceled in Redis (visible to all instances)
    success = job_state_service.mark_canceled(job_id)

    # Also mark in memory store for backward compatibility
    storage.cancel_job(job_id)

    # Update MySQL if enabled
    _update_job_status_mysql(job_id, "canceled", "ERROR")

    return {"ok": success, "jobId": job_id, "status": "canceled" if success else current_status}


@router.get("/{job_id}/stream")
async def stream_job(
    job_id: str,
    sequence: str | None = Query(None),
    use_nanocc: bool | None = Query(None, alias="nanocc"),
):
    """Stream job progress events via Server-Sent Events (SSE).

    Args:
        job_id: The job identifier
        sequence: Optional amino acid sequence (if not pre-registered)
        use_nanocc: Override NanoCC usage (default: USE_NANOCC env var)
    """
    logger.info(
        f"GET /jobs/{job_id}/stream: sequence_len={len(sequence) if sequence else 'None'}, "
        f"nanocc={use_nanocc}"
    )
    # Validate job_id format
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")

    # Get sequence from query params or Redis (multi-instance) or memory store (fallback)
    raw_sequence = sequence or job_state_service.get_job_sequence(job_id) or storage.get_job_sequence(job_id)

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
        """Generate SSE events for the folding job."""
        # Update job state to running in Redis
        job_state_service.set_state(
            job_id,
            status=StatusType.running,
            stage=StageType.QUEUED,
            progress=0,
            message="Starting job processing",
        )

        if enable_nanocc:
            # Use NanoCC-powered async generator
            async for event in generate_cot_events(job_id, final_sequence):
                # Check if job was canceled before each event (Redis + memory)
                if _is_job_canceled(job_id):
                    job_state_service.mark_canceled(job_id, "Job canceled by user")
                    _update_job_status_mysql(job_id, "canceled", "ERROR")
                    yield f'event: canceled\ndata: {{"jobId": "{job_id}", "message": "Job canceled by user"}}\n\n'
                    return

                # Push event to Redis queue for replay support
                sse_events_service.push_event(event)

                # Update job state in Redis
                job_state_service.set_state(
                    job_id,
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
            for event in generate_step_events(job_id, final_sequence):
                # Check if job was canceled before each event (Redis + memory)
                if _is_job_canceled(job_id):
                    job_state_service.mark_canceled(job_id, "Job canceled by user")
                    _update_job_status_mysql(job_id, "canceled", "ERROR")
                    yield f'event: canceled\ndata: {{"jobId": "{job_id}", "message": "Job canceled by user"}}\n\n'
                    return

                # Push event to Redis queue for replay support
                sse_events_service.push_event(event)

                # Update job state in Redis
                job_state_service.set_state(
                    job_id,
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
                    if _is_job_canceled(job_id):
                        job_state_service.mark_canceled(job_id, "Job canceled by user")
                        _update_job_status_mysql(job_id, "canceled", "ERROR")
                        yield f'event: canceled\ndata: {{"jobId": "{job_id}", "message": "Job canceled by user"}}\n\n'
                        return
                    await asyncio.sleep(0.1 + random.random() * 0.14)

        # Send done event only if not canceled
        if not _is_job_canceled(job_id):
            job_state_service.mark_complete(job_id, "Job completed successfully")
            sse_events_service.set_completion_ttl(job_id)
            _update_job_status_mysql(job_id, "complete", "DONE")
            yield f'event: done\ndata: {{"jobId": "{job_id}"}}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.get("/{job_id}/state")
async def get_job_state(job_id: str):
    """Get current job state from Redis.

    This endpoint provides fast access to job status without
    requiring a database query.
    """
    logger.info(f"GET /jobs/{job_id}/state")
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")

    state = job_state_service.get_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job state not found")

    return {"jobId": job_id, "state": state}


@router.get("/{job_id}/events")
async def get_job_events(
    job_id: str,
    offset: int = Query(0, ge=0, description="Start from this event index"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum events to return"),
):
    """Get job events from Redis for replay.

    This endpoint allows clients to retrieve missed events when
    reconnecting to an SSE stream.

    Args:
        job_id: The job identifier
        offset: Start from this event index (0-based)
        limit: Maximum number of events to return
    """
    logger.info(f"GET /jobs/{job_id}/events: offset={offset}, limit={limit}")
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")

    # Get events from offset
    events = sse_events_service.get_events(job_id, start=offset, end=offset + limit - 1)

    return {
        "jobId": job_id,
        "offset": offset,
        "count": len(events),
        "total": sse_events_service.get_events_count(job_id),
        "events": [e.model_dump() for e in events],
    }
