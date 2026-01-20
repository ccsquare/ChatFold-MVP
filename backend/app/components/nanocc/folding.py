"""NanoCC-powered protein folding service.

This module integrates NanoCC AI (or Mock NanoCC) to provide intelligent
protein structure analysis with streaming Chain-of-Thought messages.

Architecture:
1. Scheduler allocates a NanoCC instance with fs_root
2. Client creates a session on the allocated instance
3. Client sends the folding prompt and streams SSE events
4. Events are converted to JobEvent objects for frontend
5. Scheduler releases the instance when done

UI Integration (by EventType):
- PROLOGUE/ANNOTATION: Display in area 2 (opening section with key verification points)
- THINKING_TEXT: Display in area 3 (scrolling text, 2 visible lines, double-click to expand)
- THINKING_PDB: Display in area 3+4 as thinking block with structure card
- CONCLUSION: Display as final completion message

Storage:
- Structures are saved via StructureStorageService
- CHATFOLD_USE_MEMORY_STORE=false: saves to filesystem (default)
- CHATFOLD_USE_MEMORY_STORE=true: saves to memory only (legacy)
"""

import logging
import os
from collections.abc import AsyncGenerator
from pathlib import Path

from app.components.nanocc.client import (
    NanoCCClient,
    NanoCCSchedulerClient,
    TOSConfig,
    build_folding_prompt,
    get_fs_root,
    job_id_to_session_id,
)
from app.services.session_store import SessionPaths, TOS_BUCKET
from app.components.nanocc.job import EventType, JobEvent, StageType, StatusType
from app.components.nanocc.mock import (
    MockNanoCCClient,
    MockNanoCCSchedulerClient,
)
from app.components.workspace.models import StructureArtifact
from app.services.job_state import job_state_service
from app.services.structure_storage import structure_storage
from app.settings import settings
from app.utils import get_timestamp_ms

logger = logging.getLogger(__name__)

# Configuration
USE_MOCK_NANOCC = os.getenv("USE_MOCK_NANOCC", "true").lower() in ("true", "1", "yes")
MOCK_DELAY_MIN = float(os.getenv("MOCK_NANOCC_DELAY_MIN", "1.0"))
MOCK_DELAY_MAX = float(os.getenv("MOCK_NANOCC_DELAY_MAX", "5.0"))



def _read_pdb_file(pdb_path: str) -> str | None:
    """Read PDB/CIF file content if it exists.

    Args:
        pdb_path: Path to the PDB or CIF file (can be relative to project root or absolute)

    Returns:
        File content as string, or None if file doesn't exist
    """
    path = Path(pdb_path)

    # If path is not absolute, resolve relative to project root
    if not path.is_absolute():
        path = settings.get_project_root() / pdb_path

    if path.exists():
        try:
            return path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed to read PDB file {path}: {e}")
            return None

    logger.warning(f"PDB file not found: {path} (original path: {pdb_path})")
    return None


def _map_event_type(event_type: str, data: dict) -> EventType:
    """Map NanoCC event type to JobEvent EventType.

    Args:
        event_type: The SSE event type (text, tool_use, tool_result, done)
        data: The event data

    Returns:
        Corresponding EventType enum value
    """
    if event_type == "text":
        msg_type = data.get("type", "THINKING")
        if msg_type == "PROLOGUE":
            return EventType.PROLOGUE
        elif msg_type == "ANNOTATION":
            return EventType.ANNOTATION
        elif msg_type == "CONCLUSION":
            return EventType.CONCLUSION
        else:
            return EventType.THINKING_TEXT
    elif event_type == "tool_result":
        # Tool result with PDB file
        if data.get("pdb_file"):
            return EventType.THINKING_PDB
        return EventType.THINKING_TEXT
    elif event_type == "thinking":
        return EventType.THINKING_TEXT
    else:
        return EventType.THINKING_TEXT


async def generate_real_cot_events(
    job_id: str,
    sequence: str,
    files: list[str] | None = None,
) -> AsyncGenerator[JobEvent, None]:
    """Generate folding job events from real NanoCC API.

    This function:
    1. Allocates a NanoCC instance via scheduler
    2. Creates a session on the instance
    3. Sends the folding prompt with TOS config and files
    4. Streams SSE events and converts to JobEvent
    5. Releases the instance when done

    Args:
        job_id: The job identifier
        sequence: The amino acid sequence
        files: List of filenames to download from TOS upload directory.
               These files should already be uploaded to tos://bucket/sessions/{session_id}/upload/

    Yields:
        JobEvent objects with CoT messages and structure artifacts
    """
    event_num = 0
    structure_count = 0
    block_index = 0
    instance = None
    session = None

    # Initialize clients
    scheduler = NanoCCSchedulerClient()
    session_id = job_id_to_session_id(job_id)
    fs_root = get_fs_root(session_id)

    try:
        # Stage 1: QUEUED - allocating instance
        event_num += 1
        yield JobEvent(
            eventId=f"evt_{job_id}_{event_num:04d}",
            jobId=job_id,
            ts=get_timestamp_ms(),
            eventType=EventType.THINKING_TEXT,
            stage=StageType.QUEUED,
            status=StatusType.running,
            progress=0,
            message="Allocating NanoCC instance...",
            blockIndex=None,
            artifacts=None,
        )

        # Allocate instance
        instance = await scheduler.allocate_instance(fs_root)
        logger.info(f"Allocated instance {instance.instance_id} for job {job_id}")

        # Health check
        await scheduler.health_check(instance)

        # Create backend client with allocated instance URL
        backend = NanoCCClient(
            base_url=instance.backend_url,
            auth_token=scheduler.auth_token,
        )

        # Create session with working_directory
        session = await backend.create_session(working_directory=fs_root)
        logger.info(f"Created session {session.session_id} for job {job_id}")

        # Save NanoCC session info for interrupt support
        job_state_service.save_nanocc_session(
            job_id=job_id,
            instance_id=instance.instance_id,
            session_id=session.session_id,
            backend_url=instance.backend_url,
        )

        event_num += 1
        yield JobEvent(
            eventId=f"evt_{job_id}_{event_num:04d}",
            jobId=job_id,
            ts=get_timestamp_ms(),
            eventType=EventType.THINKING_TEXT,
            stage=StageType.MODEL,
            status=StatusType.running,
            progress=5,
            message="Session created, starting analysis...",
            blockIndex=None,
            artifacts=None,
        )

        # Build and send prompt
        prompt = build_folding_prompt(sequence, job_id)

        # Build TOS config for file sync
        paths = SessionPaths(session_id)
        tos_config = TOSConfig(
            bucket=TOS_BUCKET,
            upload=paths.upload.rstrip("/"),  # sessions/{session_id}/upload
            state=paths.state.rstrip("/"),    # sessions/{session_id}/state
            output=paths.output.rstrip("/"),  # sessions/{session_id}/output
        )

        # Stream events from NanoCC
        async for event in backend.send_message(
            session.session_id,
            prompt,
            tos=tos_config,
            files=files,
        ):
            event_type = event.event_type
            data = event.data

            if event_type == "text":
                content = data.get("content", "")
                state = data.get("state", "MODEL")

                # Determine stage and status
                if state == "DONE":
                    stage = StageType.DONE
                    status = StatusType.complete
                    progress = 100
                else:
                    stage = StageType.MODEL
                    status = StatusType.running
                    progress = min(95, 10 + block_index * 10)

                nanocc_event_type = _map_event_type(event_type, data)

                current_block_index = None
                if nanocc_event_type in (EventType.THINKING_TEXT, EventType.THINKING_PDB):
                    current_block_index = block_index

                event_num += 1
                yield JobEvent(
                    eventId=f"evt_{job_id}_{event_num:04d}",
                    jobId=job_id,
                    ts=get_timestamp_ms(),
                    eventType=nanocc_event_type,
                    stage=stage,
                    status=status,
                    progress=progress,
                    message=content.strip() if content else "",
                    blockIndex=current_block_index,
                    artifacts=None,
                )

            elif event_type == "tool_result":
                pdb_path = data.get("pdb_file")
                label = data.get("label", "structure")
                message_content = data.get("message", "")

                if pdb_path:
                    structure_count += 1
                    structure_id = f"str_{job_id}_{structure_count}"

                    # Read PDB content
                    pdb_data = _read_pdb_file(pdb_path)

                    if pdb_data:
                        filename_ext = Path(pdb_path).suffix or ".cif"
                        filename = f"{label}{filename_ext}"

                        # Save structure
                        structure_storage.save_structure(
                            structure_id=structure_id,
                            pdb_data=pdb_data,
                            job_id=job_id,
                            filename=filename,
                        )

                        event_num += 1
                        yield JobEvent(
                            eventId=f"evt_{job_id}_{event_num:04d}",
                            jobId=job_id,
                            ts=get_timestamp_ms(),
                            eventType=EventType.THINKING_PDB,
                            stage=StageType.MODEL,
                            status=StatusType.running,
                            progress=min(95, 10 + block_index * 10),
                            message=message_content.strip() if message_content else f"Generated structure: {label}",
                            blockIndex=block_index,
                            artifacts=[
                                StructureArtifact(
                                    type="structure",
                                    structureId=structure_id,
                                    label=label,
                                    filename=filename,
                                    pdbData=pdb_data,
                                    createdAt=get_timestamp_ms(),
                                    cot=message_content.strip() if message_content else f"Structure prediction: {label}",
                                )
                            ],
                        )

                        block_index += 1

            elif event_type == "done":
                # Final done event handled after loop
                break

        # Cleanup session
        if session:
            await backend.delete_session(session.session_id)

    except Exception as e:
        logger.error(f"Error in real NanoCC flow for job {job_id}: {e}")
        event_num += 1
        yield JobEvent(
            eventId=f"evt_{job_id}_{event_num:04d}",
            jobId=job_id,
            ts=get_timestamp_ms(),
            eventType=EventType.CONCLUSION,
            stage=StageType.ERROR,
            status=StatusType.failed,
            progress=0,
            message=f"Error: {str(e)}",
            blockIndex=None,
            artifacts=None,
        )

    finally:
        # Clean up NanoCC session info from Redis
        job_state_service.delete_nanocc_session(job_id)

        # Release instance
        if instance:
            await scheduler.release_instance(instance)
            logger.info(f"Released instance {instance.instance_id} for job {job_id}")


async def generate_mock_cot_events(
    job_id: str,
    sequence: str,
    files: list[str] | None = None,
    delay_min: float = MOCK_DELAY_MIN,
    delay_max: float = MOCK_DELAY_MAX,
) -> AsyncGenerator[JobEvent, None]:
    """Generate folding job events from Mock NanoCC.

    This function follows the same flow as generate_real_cot_events but uses
    mock clients that read from JSONL files instead of making real API calls.

    Args:
        job_id: The job identifier
        sequence: The amino acid sequence
        files: List of filenames (ignored in mock mode, but kept for API consistency)
        delay_min: Minimum delay in seconds between messages
        delay_max: Maximum delay in seconds between messages

    Yields:
        JobEvent objects with CoT messages and structure artifacts
    """
    event_num = 0
    structure_count = 0
    block_index = 0

    # Initialize mock clients
    scheduler = MockNanoCCSchedulerClient()
    session_id = job_id_to_session_id(job_id)
    fs_root = get_fs_root(session_id)

    # Stage 1: QUEUED - allocating instance
    event_num += 1
    yield JobEvent(
        eventId=f"evt_{job_id}_{event_num:04d}",
        jobId=job_id,
        ts=get_timestamp_ms(),
        eventType=EventType.THINKING_TEXT,
        stage=StageType.QUEUED,
        status=StatusType.running,
        progress=0,
        message="Allocating NanoCC instance...",
        blockIndex=None,
        artifacts=None,
    )

    # Allocate mock instance
    instance = await scheduler.allocate_instance(fs_root)

    # Health check
    await scheduler.health_check(instance)

    # Create mock backend client
    backend = MockNanoCCClient(
        base_url=instance.backend_url,
        delay_min=delay_min,
        delay_max=delay_max,
    )

    # Create session with working_directory
    session = await backend.create_session(working_directory=fs_root)

    event_num += 1
    yield JobEvent(
        eventId=f"evt_{job_id}_{event_num:04d}",
        jobId=job_id,
        ts=get_timestamp_ms(),
        eventType=EventType.THINKING_TEXT,
        stage=StageType.MODEL,
        status=StatusType.running,
        progress=5,
        message="Session created, starting analysis...",
        blockIndex=None,
        artifacts=None,
    )

    # Build prompt
    prompt = build_folding_prompt(sequence, job_id)

    # Build TOS config (ignored in mock mode, but kept for consistency)
    paths = SessionPaths(session_id)
    tos_config = TOSConfig(
        bucket=TOS_BUCKET,
        upload=paths.upload.rstrip("/"),
        state=paths.state.rstrip("/"),
        output=paths.output.rstrip("/"),
    )

    # Stream events from mock NanoCC
    async for event in backend.send_message(
        session.session_id,
        prompt,
        tos_config=tos_config.to_dict(),
        files=files,
    ):
        event_type = event.event_type
        data = event.data

        if event_type == "text":
            content = data.get("content", "")
            state = data.get("state", "MODEL")

            if state == "DONE":
                stage = StageType.DONE
                status = StatusType.complete
                progress = 100
            else:
                stage = StageType.MODEL
                status = StatusType.running
                progress = min(95, 10 + block_index * 10)

            nanocc_event_type = _map_event_type(event_type, data)

            current_block_index = None
            if nanocc_event_type in (EventType.THINKING_TEXT, EventType.THINKING_PDB):
                current_block_index = block_index

            event_num += 1
            yield JobEvent(
                eventId=f"evt_{job_id}_{event_num:04d}",
                jobId=job_id,
                ts=get_timestamp_ms(),
                eventType=nanocc_event_type,
                stage=stage,
                status=status,
                progress=progress,
                message=content.strip() if content else "",
                blockIndex=current_block_index,
                artifacts=None,
            )

        elif event_type == "tool_result":
            pdb_path = data.get("pdb_file")
            label = data.get("label", "structure")
            message_content = data.get("message", "")

            if pdb_path:
                structure_count += 1
                structure_id = f"str_{job_id}_{structure_count}"

                pdb_data = _read_pdb_file(pdb_path)

                if pdb_data:
                    filename_ext = Path(pdb_path).suffix or ".cif"
                    filename = f"{label}{filename_ext}"

                    structure_storage.save_structure(
                        structure_id=structure_id,
                        pdb_data=pdb_data,
                        job_id=job_id,
                        filename=filename,
                    )

                    event_num += 1
                    yield JobEvent(
                        eventId=f"evt_{job_id}_{event_num:04d}",
                        jobId=job_id,
                        ts=get_timestamp_ms(),
                        eventType=EventType.THINKING_PDB,
                        stage=StageType.MODEL,
                        status=StatusType.running,
                        progress=min(95, 10 + block_index * 10),
                        message=message_content.strip() if message_content else f"Generated structure: {label}",
                        blockIndex=block_index,
                        artifacts=[
                            StructureArtifact(
                                type="structure",
                                structureId=structure_id,
                                label=label,
                                filename=filename,
                                pdbData=pdb_data,
                                createdAt=get_timestamp_ms(),
                                cot=message_content.strip() if message_content else f"Structure prediction: {label}",
                            )
                        ],
                    )

                    block_index += 1

        elif event_type == "done":
            break

    # Cleanup
    await backend.delete_session(session.session_id)
    await scheduler.release_instance(instance)


async def generate_cot_events(
    job_id: str,
    sequence: str,
    files: list[str] | None = None,
) -> AsyncGenerator[JobEvent, None]:
    """Generate folding job events with NanoCC/Mock integration.

    This is the main entry point that routes to either:
    - Mock NanoCC (USE_MOCK_NANOCC=true): reads from JSONL file with random delays
    - Real NanoCC (USE_MOCK_NANOCC=false): calls actual NanoCC scheduler and API

    Both modes follow the same flow:
    1. Allocate instance (scheduler)
    2. Health check
    3. Create session
    4. Send message with TOS config and files
    5. Stream events
    6. Release instance

    Args:
        job_id: The job identifier
        sequence: The amino acid sequence
        files: List of filenames to download from TOS upload directory.
               Files should be pre-uploaded to tos://bucket/sessions/{session_id}/upload/

    Yields:
        JobEvent objects with progress updates and structure artifacts
    """
    if USE_MOCK_NANOCC:
        logger.info(f"Using Mock NanoCC for job {job_id}")
        async for event in generate_mock_cot_events(job_id, sequence, files=files):
            yield event
    else:
        logger.info(f"Using Real NanoCC for job {job_id}")
        async for event in generate_real_cot_events(job_id, sequence, files=files):
            yield event


# Alias for backward compatibility
generate_nanocc_job_events = generate_cot_events
