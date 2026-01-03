"""NanoCC-powered protein folding service.

This module integrates NanoCC AI (or Mock NanoCC) to provide intelligent
protein structure analysis with streaming Chain-of-Thought messages.

UI Integration (by EventType):
- PROLOGUE/ANNOTATION: Display in area 2 (opening section with key verification points)
- THINKING_TEXT: Display in area 3 (scrolling text, 2 visible lines, double-click to expand)
- THINKING_PDB: Display in area 3+4 as thinking block with structure card
- CONCLUSION: Display as final completion message

Thinking Block Grouping:
- THINKING events are grouped into blocks ending with THINKING_PDB
- Each block shows the latest message in area 4 (1 line, double-click to expand)
"""

import os
from collections.abc import AsyncGenerator
from pathlib import Path

from app.components.workspace.models import StructureArtifact
from app.utils import get_timestamp_ms
from app.components.nanocc.job import JobEvent, EventType, StageType, StatusType
from app.components.nanocc.mock import MockNanoCCClient

# Configuration
USE_MOCK_NANOCC = os.getenv("USE_MOCK_NANOCC", "true").lower() in ("true", "1", "yes")
MOCK_DELAY_MIN = float(os.getenv("MOCK_NANOCC_DELAY_MIN", "1.0"))
MOCK_DELAY_MAX = float(os.getenv("MOCK_NANOCC_DELAY_MAX", "5.0"))


def _read_pdb_file(pdb_path: str) -> str | None:
    """Read PDB/CIF file content if it exists.

    Args:
        pdb_path: Path to the PDB or CIF file

    Returns:
        File content as string, or None if file doesn't exist
    """
    path = Path(pdb_path)
    if path.exists():
        try:
            return path.read_text(encoding="utf-8")
        except Exception:
            return None
    return None


def _map_jsonl_type_to_event_type(jsonl_type: str, has_pdb: bool) -> EventType:
    """Map JSONL TYPE field to EventType enum.

    Args:
        jsonl_type: TYPE field from JSONL (PROLOGUE, ANNOTATION, THINKING, CONCLUSION)
        has_pdb: Whether the message has a pdb_file field

    Returns:
        Corresponding EventType
    """
    if jsonl_type == "PROLOGUE":
        return EventType.PROLOGUE
    elif jsonl_type == "ANNOTATION":
        return EventType.ANNOTATION
    elif jsonl_type == "THINKING":
        return EventType.THINKING_PDB if has_pdb else EventType.THINKING_TEXT
    elif jsonl_type == "CONCLUSION":
        return EventType.CONCLUSION
    else:
        # Default to THINKING_TEXT for unknown types
        return EventType.THINKING_TEXT


async def generate_mock_cot_events(
    job_id: str,
    sequence: str,
    delay_min: float = MOCK_DELAY_MIN,
    delay_max: float = MOCK_DELAY_MAX,
) -> AsyncGenerator[JobEvent, None]:
    """Generate folding job events from Mock NanoCC CoT messages.

    This function streams Chain-of-Thought messages from the mock JSONL file,
    converting them to JobEvent objects with proper EventType and block grouping.

    EventType Mapping:
    - PROLOGUE -> EventType.PROLOGUE (display in area 2)
    - ANNOTATION -> EventType.ANNOTATION (display in area 2)
    - THINKING (no pdb) -> EventType.THINKING_TEXT (display in area 3)
    - THINKING (with pdb) -> EventType.THINKING_PDB (display in area 3+4 as block)
    - CONCLUSION -> EventType.CONCLUSION (completion message)

    Block Grouping:
    - THINKING events are grouped into blocks
    - Each THINKING_PDB ends a block and increments blockIndex

    Args:
        job_id: The job identifier
        sequence: The amino acid sequence (for reference)
        delay_min: Minimum delay in seconds between messages
        delay_max: Maximum delay in seconds between messages

    Yields:
        JobEvent objects with CoT messages, EventType, and structure artifacts
    """
    event_num = 0
    structure_count = 0
    block_index = 0  # Current thinking block index

    # Initialize mock client
    mock_client = MockNanoCCClient(
        delay_min=delay_min,
        delay_max=delay_max,
    )

    # Stage 1: QUEUED
    event_num += 1
    yield JobEvent(
        eventId=f"evt_{job_id}_{event_num:04d}",
        jobId=job_id,
        ts=get_timestamp_ms(),
        eventType=EventType.THINKING_TEXT,  # QUEUED is a special case
        stage=StageType.QUEUED,
        status=StatusType.running,
        progress=0,
        message="Job queued for processing",
        blockIndex=None,
        artifacts=None,
    )

    # Create mock session
    session = await mock_client.create_session()

    # Track total messages for progress calculation
    total_messages = len(mock_client._load_messages())
    current_msg_idx = 0

    # Stream mock CoT messages
    async for event in mock_client.send_message(session["session_id"], f"Analyze sequence: {sequence[:50]}..."):
        event_type = event.get("event_type")
        data = event.get("data", {})

        if event_type == "text":
            current_msg_idx += 1
            content = data.get("content", "")
            state = data.get("state", "MODEL")
            jsonl_type = data.get("type", "THINKING")  # TYPE field from JSONL

            # Map state to stage
            if state == "DONE":
                stage = StageType.DONE
                status = StatusType.complete
                progress = 100
            else:
                stage = StageType.MODEL
                status = StatusType.running
                # Calculate progress: 10% to 95% based on message index
                progress = min(95, 10 + int((current_msg_idx / total_messages) * 85))

            # Determine EventType (no pdb_file in text event)
            nanocc_event_type = _map_jsonl_type_to_event_type(jsonl_type, has_pdb=False)

            # Determine blockIndex for THINKING types
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
                message=content.strip(),
                blockIndex=current_block_index,
                artifacts=None,
            )

        elif event_type == "tool_result":
            # Structure artifact from PDB file (THINKING_PDB)
            pdb_path = data.get("pdb_file")
            label = data.get("label", "structure")
            message_content = data.get("message", "")

            if pdb_path:
                structure_count += 1
                structure_id = f"str_{job_id}_{structure_count}"

                # Read PDB content from file
                pdb_data = _read_pdb_file(pdb_path)

                if pdb_data:
                    # Determine filename extension based on actual file
                    filename_ext = Path(pdb_path).suffix or ".cif"
                    filename = f"{label}{filename_ext}"

                    event_num += 1
                    progress = min(95, 10 + int((current_msg_idx / total_messages) * 85))

                    # THINKING_PDB: ends current block
                    yield JobEvent(
                        eventId=f"evt_{job_id}_{event_num:04d}",
                        jobId=job_id,
                        ts=get_timestamp_ms(),
                        eventType=EventType.THINKING_PDB,
                        stage=StageType.MODEL,
                        status=StatusType.running,
                        progress=progress,
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

                    # Increment block index after THINKING_PDB
                    block_index += 1

        elif event_type == "done":
            # Final done event
            break

    # Clean up session
    await mock_client.delete_session(session["session_id"])


async def generate_cot_events(
    job_id: str,
    sequence: str,
) -> AsyncGenerator[JobEvent, None]:
    """Generate folding job events with NanoCC/Mock integration.

    This is the main entry point that routes to either:
    - Mock NanoCC (reads from JSONL file with random delays)
    - Real NanoCC (future implementation)

    Args:
        job_id: The job identifier
        sequence: The amino acid sequence

    Yields:
        JobEvent objects with progress updates and structure artifacts
    """
    if USE_MOCK_NANOCC:
        # Use mock CoT messages from JSONL file
        async for event in generate_mock_cot_events(job_id, sequence):
            yield event
    else:
        # Future: Real NanoCC integration
        # For now, fall back to mock
        async for event in generate_mock_cot_events(job_id, sequence):
            yield event


# Alias for backward compatibility
generate_nanocc_job_events = generate_cot_events
