"""NanoCC-powered protein folding service.

This module integrates NanoCC AI (or Mock NanoCC) to provide intelligent
protein structure analysis with streaming Chain-of-Thought messages.

UI Integration:
- Position 1 (Sidebar status): Shows MESSAGE field, updated with each new message (overwrite mode)
- Position 2 (Structure list): Shows candidate structures when pdb_file is present
"""

import os
from collections.abc import AsyncGenerator
from pathlib import Path

from ..models.schemas import (
    StageType,
    StatusType,
    StepEvent,
    StructureArtifact,
)
from ..utils import get_timestamp_ms
from .mock_nanocc import MockNanoCCClient

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


async def generate_mock_cot_events(
    task_id: str,
    sequence: str,
    delay_min: float = MOCK_DELAY_MIN,
    delay_max: float = MOCK_DELAY_MAX,
) -> AsyncGenerator[StepEvent, None]:
    """Generate folding step events from Mock NanoCC CoT messages.

    This function streams Chain-of-Thought messages from the mock JSONL file,
    converting them to StepEvent objects with proper stage tracking.

    Logic:
    - Each JSONL line has STATE, MESSAGE, and optionally pdb_file/label
    - MESSAGE is displayed at Position 1 (overwrite mode)
    - If pdb_file exists, create a StructureArtifact for Position 2

    Args:
        task_id: The task identifier
        sequence: The amino acid sequence (for reference)
        delay_min: Minimum delay in seconds between messages
        delay_max: Maximum delay in seconds between messages

    Yields:
        StepEvent objects with CoT messages and structure artifacts
    """
    event_num = 0
    structure_count = 0

    # Initialize mock client
    mock_client = MockNanoCCClient(
        delay_min=delay_min,
        delay_max=delay_max,
    )

    # Stage 1: QUEUED
    event_num += 1
    yield StepEvent(
        eventId=f"evt_{task_id}_{event_num:04d}",
        taskId=task_id,
        ts=get_timestamp_ms(),
        stage=StageType.QUEUED,
        status=StatusType.running,
        progress=0,
        message="Task queued for processing",
        artifacts=None,
    )

    # Create mock session
    session = await mock_client.create_session()

    # Track total messages for progress calculation
    total_messages = len(mock_client._load_messages())
    current_msg_idx = 0

    # Pending structure data (from tool_result event)
    pending_pdb_path: str | None = None
    pending_label: str | None = None

    # Stream mock CoT messages
    async for event in mock_client.send_message(session["session_id"], f"Analyze sequence: {sequence[:50]}..."):
        event_type = event.get("event_type")
        data = event.get("data", {})

        if event_type == "text":
            current_msg_idx += 1
            content = data.get("content", "")
            state = data.get("state", "MODEL")

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

            # Check if we have a pending structure from the previous iteration
            # This handles the case where tool_result comes after text
            artifacts = None

            event_num += 1
            yield StepEvent(
                eventId=f"evt_{task_id}_{event_num:04d}",
                taskId=task_id,
                ts=get_timestamp_ms(),
                stage=stage,
                status=status,
                progress=progress,
                message=content.strip(),  # Position 1: MESSAGE field (overwrite mode)
                artifacts=artifacts,
            )

        elif event_type == "tool_result":
            # Structure artifact from PDB file
            # This comes immediately after the text event for the same message
            pdb_path = data.get("pdb_file")
            label = data.get("label", "structure")
            message_content = data.get("message", "")  # Get MESSAGE for Position 2

            if pdb_path:
                structure_count += 1
                structure_id = f"str_{task_id}_{structure_count}"

                # Read PDB content from file
                pdb_data = _read_pdb_file(pdb_path)

                if pdb_data:
                    # Determine filename extension based on actual file
                    filename_ext = Path(pdb_path).suffix or ".cif"
                    filename = f"{label}{filename_ext}"

                    event_num += 1
                    progress = min(95, 10 + int((current_msg_idx / total_messages) * 85))

                    # Position 2: Structure artifact as candidate
                    # Use MESSAGE content as cot for display
                    yield StepEvent(
                        eventId=f"evt_{task_id}_{event_num:04d}",
                        taskId=task_id,
                        ts=get_timestamp_ms(),
                        stage=StageType.MODEL,
                        status=StatusType.running,
                        progress=progress,
                        message=message_content.strip() if message_content else f"Generated structure: {label}",
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

        elif event_type == "done":
            # Final done event
            break

    # Clean up session
    await mock_client.delete_session(session["session_id"])


async def generate_nanocc_step_events(
    task_id: str,
    sequence: str,
    use_nanocc: bool = True,
) -> AsyncGenerator[StepEvent, None]:
    """Generate folding step events with NanoCC/Mock integration.

    This is the main entry point that routes to either:
    - Mock NanoCC (reads from JSONL file with random delays)
    - Real NanoCC (future implementation)

    Args:
        task_id: The task identifier
        sequence: The amino acid sequence
        use_nanocc: Whether to use NanoCC/Mock for AI analysis

    Yields:
        StepEvent objects with progress updates and structure artifacts
    """
    if USE_MOCK_NANOCC:
        # Use mock CoT messages from JSONL file
        async for event in generate_mock_cot_events(task_id, sequence):
            yield event
    else:
        # Future: Real NanoCC integration
        # For now, fall back to mock
        async for event in generate_mock_cot_events(task_id, sequence):
            yield event
