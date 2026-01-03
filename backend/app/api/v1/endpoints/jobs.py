"""Jobs API endpoint with SSE streaming.

This module provides REST endpoints for NanoCC job management:
- Create folding jobs
- List/get jobs
- Stream job progress via SSE
- Cancel running jobs
"""

import asyncio
import os
import random
import re

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.components.nanocc import (
    CreateJobRequest,
    NanoCCJob,
    RegisterSequenceRequest,
    StatusType,
    generate_cot_events,
    generate_step_events,
)
from app.services.memory_store import storage
from app.utils import (
    DEFAULT_SEQUENCE,
    SequenceValidationError,
    generate_id,
    get_timestamp_ms,
    validate_amino_acid_sequence,
)

# NanoCC feature flag - can be disabled via environment variable
USE_NANOCC = os.getenv("USE_NANOCC", "true").lower() in ("true", "1", "yes")

router = APIRouter(tags=["Jobs"])

# Job ID pattern
JOB_ID_PATTERN = re.compile(r"^job_[a-z0-9]+$")


@router.post("")
async def create_job(request: CreateJobRequest):
    """Create a new protein folding job."""
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

    storage.save_job(job)
    storage.save_job_sequence(job.id, sequence)

    return {"jobId": job.id, "job": job.model_dump()}


@router.get("")
async def list_jobs(jobId: str | None = Query(None)):
    """List jobs or get a specific job by ID."""
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
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")

    try:
        sequence = validate_amino_acid_sequence(request.sequence)
    except SequenceValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    storage.save_job_sequence(job_id, sequence)

    return {"ok": True}


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a running job."""
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = storage.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Check if job is still running
    if job.status not in [StatusType.queued, StatusType.running]:
        return {"ok": False, "message": "Job is not running", "status": job.status.value}

    # Mark as canceled
    success = storage.cancel_job(job_id)

    return {"ok": success, "jobId": job_id, "status": "canceled" if success else job.status.value}


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
    # Validate job_id format
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")

    # Get sequence from query params or stored data
    raw_sequence = sequence or storage.get_job_sequence(job_id)

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
        if enable_nanocc:
            # Use NanoCC-powered async generator
            async for event in generate_cot_events(job_id, final_sequence):
                # Check if job was canceled before each event
                if storage.is_job_canceled(job_id):
                    yield f'event: canceled\ndata: {{"jobId": "{job_id}", "message": "Job canceled by user"}}\n\n'
                    return

                # Format as SSE
                event_data = event.model_dump_json()
                yield f"event: step\ndata: {event_data}\n\n"
        else:
            # Use synchronous mock generator (legacy mode)
            for event in generate_step_events(job_id, final_sequence):
                # Check if job was canceled before each event
                if storage.is_job_canceled(job_id):
                    yield f'event: canceled\ndata: {{"jobId": "{job_id}", "message": "Job canceled by user"}}\n\n'
                    return

                # Format as SSE
                event_data = event.model_dump_json()
                yield f"event: step\ndata: {event_data}\n\n"

                # Simulate processing time, split into smaller chunks for faster cancellation detection
                for _ in range(5):
                    if storage.is_job_canceled(job_id):
                        yield f'event: canceled\ndata: {{"jobId": "{job_id}", "message": "Job canceled by user"}}\n\n'
                        return
                    await asyncio.sleep(0.1 + random.random() * 0.14)

        # Send done event only if not canceled
        if not storage.is_job_canceled(job_id):
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
