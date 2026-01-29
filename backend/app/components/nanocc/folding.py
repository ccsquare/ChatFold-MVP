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
- PROLOGUE: Display in area 2 (opening section with key verification points)
- ANNOTATION_TEXT/ANNOTATION_PDB: Display within folding progress (summary + blocks)
- THINKING_TEXT: Display in area 3 (scrolling text, 2 visible lines, double-click to expand)
- THINKING_PDB: Display in area 3+4 as thinking block with structure card
- CONCLUSION: Display as final completion message

Storage:
- Structures are saved via StructureStorageService
- CHATFOLD_USE_MEMORY_STORE=false: saves to filesystem (default)
- CHATFOLD_USE_MEMORY_STORE=true: saves to memory only (legacy)
"""

import os
import time
from collections.abc import AsyncGenerator
from pathlib import Path

from app.components.nanocc.client import (
    NanoCCClient,
    NanoCCSchedulerClient,
    TOSConfig,
    build_folding_prompt,
    get_fs_root,
    task_id_to_session_id,
)
from app.components.nanocc.job import EventType, JobEvent, StageType, StatusType
from app.components.nanocc.mock import (
    MockNanoCCClient,
    MockNanoCCSchedulerClient,
)
from app.components.workspace.models import Structure
from app.services.session_store import TOS_BUCKET, SessionPaths, get_session_store
from app.services.structure_storage import structure_storage
from app.services.task_state import task_state_service
from app.settings import settings
from app.utils import get_timestamp_ms
from app.utils.logging import get_logger

logger = get_logger(__name__)

# SSE keepalive: when yielded by event generators, tasks.py emits an SSE comment line.
# SSE comment lines (starting with `:`) are ignored by EventSource but keep the
# connection alive through nginx/CDN idle timeouts.
SSE_HEARTBEAT_COMMENT = ":heartbeat\n\n"

# Configuration
USE_MOCK_NANOCC = os.getenv("USE_MOCK_NANOCC", "true").lower() in ("true", "1", "yes")
MOCK_DELAY_MIN = float(os.getenv("MOCK_NANOCC_DELAY_MIN", "1.0"))
MOCK_DELAY_MAX = float(os.getenv("MOCK_NANOCC_DELAY_MAX", "5.0"))


def _read_pdb_file_local(pdb_path: str) -> str | None:
    """Read PDB/CIF file content from local filesystem.

    Used by Mock NanoCC flow where pdb_file paths are relative to project root.

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


def _read_pdb_file_from_tos(session_id: str, pdb_path: str) -> str | None:
    """Download and read PDB/CIF file content from TOS.

    Used by Real NanoCC flow where pdb_file paths are relative to the output
    directory on TOS. NanoCC uploads PDB files to sessions/{session_id}/output/,
    and pdb_path is relative to that output directory.

    Args:
        session_id: The NanoCC session ID
        pdb_path: Path to the PDB or CIF file, relative to output directory

    Returns:
        File content as string, or None if download fails
    """
    try:
        store = get_session_store()
        tos_client = store._get_tos_client()

        # Build full TOS key: sessions/{session_id}/output/{pdb_path}
        # NanoCC uploads PDB files under the output/ prefix via _upload_pdb_to_tos_immediate()
        paths = SessionPaths(session_id)
        full_key = f"{paths.output}{pdb_path}"

        logger.info(f"Downloading PDB from TOS: tos://{TOS_BUCKET}/{full_key}")

        # Download as bytes and decode as UTF-8
        pdb_bytes = tos_client.download_bytes(full_key)
        pdb_data = pdb_bytes.decode("utf-8")

        logger.info(f"Downloaded PDB from TOS: {full_key} ({len(pdb_bytes)} bytes)")
        return pdb_data

    except Exception as e:
        logger.warning(f"Failed to download PDB file from TOS: session={session_id}, path={pdb_path}, error={e}")
        return None


def _map_cot_step_event_type(state: str, has_pdb: bool) -> EventType:
    """Map NanoCC cot_step state to JobEvent EventType.

    Mapping rule:
    - STATE=prologue -> PROLOGUE
    - STATE=annotation + pdb_file -> ANNOTATION_PDB
    - STATE=annotation + no pdb_file -> ANNOTATION_TEXT
    - STATE=conclusion -> CONCLUSION
    - STATE=thinking + pdb_file -> THINKING_PDB
    - STATE=thinking + no pdb_file -> THINKING_TEXT
    """
    normalized = state.strip().lower()
    if normalized == "prologue":
        return EventType.PROLOGUE
    if normalized == "annotation":
        return EventType.ANNOTATION_PDB if has_pdb else EventType.ANNOTATION_TEXT
    if normalized == "conclusion":
        return EventType.CONCLUSION
    if normalized == "thinking" and has_pdb:
        return EventType.THINKING_PDB
    return EventType.THINKING_TEXT


def _is_pdb_event(event_type: EventType) -> bool:
    return event_type in (EventType.THINKING_PDB, EventType.ANNOTATION_PDB)


def _is_text_event(event_type: EventType) -> bool:
    return event_type in (
        EventType.THINKING_TEXT,
        EventType.ANNOTATION_TEXT,
        EventType.ANNOTATION,
    )


def _fallback_text_type(event_type: EventType) -> EventType:
    if event_type == EventType.ANNOTATION_PDB:
        return EventType.ANNOTATION_TEXT
    return EventType.THINKING_TEXT


async def generate_real_cot_events(
    task_id: str,
    sequence: str,
    query: str,
    files: list[str] | None = None,
) -> AsyncGenerator[JobEvent | str, None]:
    """Generate folding task events from real NanoCC API.

    This function:
    1. Allocates a NanoCC instance via scheduler
    2. Creates a session on the instance
    3. Sends the folding prompt with TOS config and files
    4. Streams SSE events and converts to JobEvent
    5. Releases the instance when done

    Args:
        task_id: The task identifier
        sequence: The amino acid sequence
        query: User's natural language instruction (combined with sequence to form
               the final NanoCC prompt via build_folding_prompt)
        files: List of filenames to download from TOS upload directory.
               These files should already be uploaded to tos://bucket/sessions/{session_id}/upload/

    Yields:
        JobEvent objects with CoT messages and structure artifacts
    """
    flow_start_time = time.time()

    event_num = 0
    structure_count = 0
    block_index = 0
    prev_was_pdb = False
    instance = None
    session = None
    received_done = False  # Track if NanoCC sent 'done' event
    final_status = "unknown"

    logger.info(f"[NanoCC Flow] Started: task_id={task_id}, sequence_len={len(sequence)}, has_files={files is not None}")

    # Initialize clients
    scheduler = NanoCCSchedulerClient()
    session_id = task_id_to_session_id(task_id)
    fs_root = get_fs_root(session_id)

    try:
        # Stage 1: QUEUED - allocating instance
        event_num += 1
        yield JobEvent(
            eventId=f"evt_{task_id}_{event_num:04d}",
            taskId=task_id,
            ts=get_timestamp_ms(),
            eventType=EventType.THINKING_TEXT,
            stage=StageType.QUEUED,
            status=StatusType.running,
            progress=0,
            message="Thinking...",
            blockIndex=None,
            artifacts=None,
        )

        # Allocate instance
        instance = await scheduler.allocate_instance(fs_root)
        logger.info(f"Allocated instance {instance.instance_id} for task {task_id}")

        # Health check
        await scheduler.health_check(instance)

        # Create backend client with allocated instance URL
        backend = NanoCCClient(
            base_url=instance.backend_url,
            auth_token=scheduler.auth_token,
        )

        # Create session with working_directory
        session = await backend.create_session(working_directory=fs_root)
        logger.info(f"Created session {session.session_id} for task {task_id}")
        logger.info(f"NanoCC working_directory (trajectory): {fs_root}")

        # Save NanoCC session info for interrupt support
        task_state_service.save_nanocc_session(
            task_id=task_id,
            instance_id=instance.instance_id,
            session_id=session.session_id,
            backend_url=instance.backend_url,
        )

        # Build and send prompt
        prompt = build_folding_prompt(query, sequence)

        # Build TOS config for file sync
        paths = SessionPaths(session_id)
        tos_config = TOSConfig(
            bucket=TOS_BUCKET,
            upload=paths.upload.rstrip("/"),  # sessions/{session_id}/upload
            state=paths.state.rstrip("/"),  # sessions/{session_id}/state
            output=paths.output.rstrip("/"),  # sessions/{session_id}/output
        )
        logger.info(
            f"NanoCC TOS config for task {task_id}: "
            f"bucket={TOS_BUCKET}, "
            f"upload=tos://{TOS_BUCKET}/{tos_config.upload}, "
            f"state=tos://{TOS_BUCKET}/{tos_config.state}, "
            f"output=tos://{TOS_BUCKET}/{tos_config.output}"
        )
        if files:
            logger.info(f"NanoCC input files for task {task_id}: {files}")

        # Stream events from NanoCC
        async for event in backend.send_message(
            session.session_id,
            prompt,
            tos=tos_config,
            files=files,
        ):
            event_type = event.event_type
            data = event.data

            # Debug: Log received SSE event
            logger.debug(f"[NanoCC Event] type={event_type}, data={data}")

            if event_type == "cot_step":
                state = data.get("STATE", "thinking")
                message = data.get("MESSAGE", "")
                pdb_path = data.get("pdb_file")
                label = data.get("label", "structure")

                has_pdb = bool(pdb_path)
                nanocc_event_type = _map_cot_step_event_type(state, has_pdb)
                logger.info(
                    f"[NanoCC cot_step] state={state}, label={label}, "
                    f"has_pdb={has_pdb}, pdb_path={pdb_path}, "
                    f"mapped_type={nanocc_event_type.value}"
                )

                # Default stage/status
                if nanocc_event_type == EventType.CONCLUSION:
                    stage = StageType.DONE
                    status = StatusType.complete
                    progress = 100
                else:
                    stage = StageType.MODEL
                    status = StatusType.running
                    progress = min(95, 10 + block_index * 10)

                artifacts = None
                current_block_index = None

                if _is_pdb_event(nanocc_event_type) and pdb_path:
                    structure_count += 1
                    structure_id = f"str_{task_id}_{structure_count}"
                    pdb_data = _read_pdb_file_from_tos(session_id, pdb_path)

                    # Use current block index for this event
                    current_block_index = block_index

                    if pdb_data:
                        filename_ext = Path(pdb_path).suffix or ".cif"
                        filename = f"{label}{filename_ext}"

                        structure_storage.save_structure(
                            structure_id=structure_id,
                            pdb_data=pdb_data,
                            task_id=task_id,
                            filename=filename,
                        )

                        artifacts = [
                            Structure(
                                type="structure",
                                structureId=structure_id,
                                label=label,
                                filename=filename,
                                pdbData=pdb_data,
                                createdAt=get_timestamp_ms(),
                                cot=message.strip() if message else f"Structure prediction: {label}",
                            )
                        ]
                    else:
                        # File read failed - emit as text but still close block
                        nanocc_event_type = _fallback_text_type(nanocc_event_type)
                        logger.warning(
                            f"PDB file read failed for task {task_id}, pdb_path={pdb_path}, falling back to text event"
                        )

                    # Always close block when pdb_file was set (NanoCC intended a structure here)
                    block_index += 1
                    prev_was_pdb = True

                elif _is_text_event(nanocc_event_type):
                    if prev_was_pdb:
                        prev_was_pdb = False
                    current_block_index = block_index

                event_num += 1
                yield JobEvent(
                    eventId=f"evt_{task_id}_{event_num:04d}",
                    taskId=task_id,
                    ts=get_timestamp_ms(),
                    eventType=nanocc_event_type,
                    stage=stage,
                    status=status,
                    progress=progress,
                    message=message.strip() if message else "",
                    blockIndex=current_block_index,
                    artifacts=artifacts,
                )

            elif event_type == "heartbeat":
                yield SSE_HEARTBEAT_COMMENT

            elif event_type == "error":
                logger.warning(f"NanoCC SSE error for task {task_id}: {data}")

            elif event_type == "done":
                # Mark that we received a proper 'done' event
                received_done = True
                final_status = "done"
                logger.info(f"[NanoCC Flow] Received done event: task_id={task_id}, events={event_num}, structures={structure_count}")
                break

        # Check if NanoCC stream ended unexpectedly (without 'done' event)
        if not received_done:
            final_status = "stream_ended_without_done"
            logger.warning(f"[NanoCC Flow] Stream ended without done: task_id={task_id}, events={event_num}")
            event_num += 1
            yield JobEvent(
                eventId=f"evt_{task_id}_{event_num:04d}",
                taskId=task_id,
                ts=get_timestamp_ms(),
                eventType=EventType.CONCLUSION,
                stage=StageType.ERROR,
                status=StatusType.failed,
                progress=0,
                message="The connection to the server was lost. The task may still be running on the server.",
                blockIndex=None,
                artifacts=None,
            )

        # Cleanup session
        if session:
            await backend.delete_session(session.session_id)

    except Exception as e:
        final_status = f"error: {type(e).__name__}"
        logger.error(f"[NanoCC Flow] Error: task_id={task_id}, error_type={type(e).__name__}, error={e}")
        event_num += 1
        yield JobEvent(
            eventId=f"evt_{task_id}_{event_num:04d}",
            taskId=task_id,
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
        duration = time.time() - flow_start_time
        logger.info(
            f"[NanoCC Flow] Ended: task_id={task_id}, status={final_status}, "
            f"events={event_num}, structures={structure_count}, duration={duration:.2f}s"
        )

        # Clean up NanoCC session info from Redis
        task_state_service.delete_nanocc_session(task_id)

        # Release instance
        if instance:
            await scheduler.release_instance(instance)
            logger.info(f"[NanoCC Flow] Released instance: task_id={task_id}, instance_id={instance.instance_id}")


async def generate_mock_cot_events(
    task_id: str,
    sequence: str,
    query: str,
    files: list[str] | None = None,
    delay_min: float = MOCK_DELAY_MIN,
    delay_max: float = MOCK_DELAY_MAX,
) -> AsyncGenerator[JobEvent | str, None]:
    """Generate folding task events from Mock NanoCC.

    This function follows the same flow as generate_real_cot_events but uses
    mock clients that read from JSONL files instead of making real API calls.

    Args:
        task_id: The task identifier
        sequence: The amino acid sequence
        query: User's natural language instruction
        files: List of filenames (ignored in mock mode, but kept for API consistency)
        delay_min: Minimum delay in seconds between messages
        delay_max: Maximum delay in seconds between messages

    Yields:
        JobEvent objects with CoT messages and structure artifacts
    """
    event_num = 0
    structure_count = 0
    block_index = 0
    prev_was_pdb = False

    # Initialize mock clients
    scheduler = MockNanoCCSchedulerClient()
    session_id = task_id_to_session_id(task_id)
    fs_root = get_fs_root(session_id)

    # Stage 1: QUEUED - allocating instance
    event_num += 1
    yield JobEvent(
        eventId=f"evt_{task_id}_{event_num:04d}",
        taskId=task_id,
        ts=get_timestamp_ms(),
        eventType=EventType.THINKING_TEXT,
        stage=StageType.QUEUED,
        status=StatusType.running,
        progress=0,
        message="Thinking...",
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

    # Build prompt
    prompt = build_folding_prompt(query, sequence)

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
        tos=tos_config,
        files=files,
    ):
        event_type = event.event_type
        data = event.data

        # Debug: Log received SSE event
        logger.debug(f"[NanoCC Mock Event] type={event_type}, data={data}")

        if event_type == "cot_step":
            state = data.get("STATE", "thinking")
            message = data.get("MESSAGE", "")
            pdb_path = data.get("pdb_file")
            label = data.get("label", "structure")

            has_pdb = bool(pdb_path)
            nanocc_event_type = _map_cot_step_event_type(state, has_pdb)

            if nanocc_event_type == EventType.CONCLUSION:
                stage = StageType.DONE
                status = StatusType.complete
                progress = 100
            else:
                stage = StageType.MODEL
                status = StatusType.running
                progress = min(95, 10 + block_index * 10)

            artifacts = None
            current_block_index = None

            if _is_pdb_event(nanocc_event_type) and pdb_path:
                structure_count += 1
                structure_id = f"str_{task_id}_{structure_count}"

                # Read PDB content from local filesystem
                # pdb_path is relative to project root (test fixtures)
                pdb_data = _read_pdb_file_local(pdb_path)

                # Use current block index for this event
                current_block_index = block_index

                if pdb_data:
                    filename_ext = Path(pdb_path).suffix or ".cif"
                    filename = f"{label}{filename_ext}"

                    structure_storage.save_structure(
                        structure_id=structure_id,
                        pdb_data=pdb_data,
                        task_id=task_id,
                        filename=filename,
                    )

                    artifacts = [
                        Structure(
                            type="structure",
                            structureId=structure_id,
                            label=label,
                            filename=filename,
                            pdbData=pdb_data,
                            createdAt=get_timestamp_ms(),
                            cot=message.strip() if message else f"Structure prediction: {label}",
                        )
                    ]
                else:
                    # File read failed - emit as text but still close block
                    nanocc_event_type = _fallback_text_type(nanocc_event_type)
                    logger.warning(
                        f"Mock PDB file read failed for task {task_id}, pdb_path={pdb_path}, falling back to text event"
                    )

                # Always close block when pdb_file was set (NanoCC intended a structure here)
                block_index += 1
                prev_was_pdb = True

            elif _is_text_event(nanocc_event_type):
                if prev_was_pdb:
                    prev_was_pdb = False
                current_block_index = block_index

            event_num += 1
            yield JobEvent(
                eventId=f"evt_{task_id}_{event_num:04d}",
                taskId=task_id,
                ts=get_timestamp_ms(),
                eventType=nanocc_event_type,
                stage=stage,
                status=status,
                progress=progress,
                message=message.strip() if message else "",
                blockIndex=current_block_index,
                artifacts=artifacts,
            )

        elif event_type == "heartbeat":
            yield SSE_HEARTBEAT_COMMENT

        elif event_type == "error":
            logger.warning(f"Mock NanoCC SSE error for task {task_id}: {data}")

        elif event_type == "done":
            break

    # Cleanup
    await backend.delete_session(session.session_id)
    await scheduler.release_instance(instance)


async def generate_cot_events(
    task_id: str,
    sequence: str,
    query: str,
    files: list[str] | None = None,
) -> AsyncGenerator[JobEvent | str, None]:
    """Generate folding task events with NanoCC/Mock integration.

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
        task_id: The task identifier
        sequence: The amino acid sequence
        query: User's natural language instruction (combined with sequence to form
               the final NanoCC prompt via build_folding_prompt)
        files: List of filenames to download from TOS upload directory.
               Files should be pre-uploaded to tos://bucket/sessions/{session_id}/upload/

    Yields:
        JobEvent objects with progress updates and structure artifacts
    """
    if USE_MOCK_NANOCC:
        logger.info(f"Using Mock NanoCC for task {task_id}")
        async for event in generate_mock_cot_events(task_id, sequence, query, files=files):
            yield event
    else:
        logger.info(f"Using Real NanoCC for task {task_id}")
        async for event in generate_real_cot_events(task_id, sequence, query, files=files):
            yield event


# Alias for backward compatibility
generate_nanocc_job_events = generate_cot_events
