"""Mock NanoCC service for testing without real NanoCC backend.

This module provides a mock implementation that reads CoT messages from
a JSONL file and streams them with configurable random delays to simulate
realistic generation behavior.
"""

import json
import os
import random
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from pathlib import Path

import asyncio

# Configuration
MOCK_DATA_PATH = os.getenv(
    "MOCK_NANOCC_DATA_PATH",
    "/SPXvePFS/users/ccheng/projects/ChatFold-MVP/chatfold-workspace/Mocking_CoT.nanocc.jsonl"
)
MOCK_DELAY_MIN = float(os.getenv("MOCK_NANOCC_DELAY_MIN", "1.0"))
MOCK_DELAY_MAX = float(os.getenv("MOCK_NANOCC_DELAY_MAX", "5.0"))


@dataclass
class MockCoTMessage:
    """A single Chain-of-Thought message from the mock data."""
    state: str  # "MODEL" or "DONE"
    message: str
    pdb_file: str | None = None
    label: str | None = None


def load_mock_messages(file_path: str | None = None) -> list[MockCoTMessage]:
    """Load mock CoT messages from JSONL file.

    Args:
        file_path: Path to the JSONL file. Uses MOCK_DATA_PATH if not provided.

    Returns:
        List of MockCoTMessage objects
    """
    path = Path(file_path or MOCK_DATA_PATH)

    if not path.exists():
        raise FileNotFoundError(f"Mock data file not found: {path}")

    messages = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                messages.append(MockCoTMessage(
                    state=data.get("STATE", "MODEL"),
                    message=data.get("MESSAGE", ""),
                    pdb_file=data.get("pdb_file"),
                    label=data.get("label"),
                ))
            except json.JSONDecodeError:
                continue

    return messages


async def stream_mock_messages(
    messages: list[MockCoTMessage] | None = None,
    delay_min: float = MOCK_DELAY_MIN,
    delay_max: float = MOCK_DELAY_MAX,
) -> AsyncGenerator[MockCoTMessage, None]:
    """Stream mock messages with random delays.

    Args:
        messages: List of messages to stream. Loads from file if not provided.
        delay_min: Minimum delay in seconds between messages.
        delay_max: Maximum delay in seconds between messages.

    Yields:
        MockCoTMessage objects with random delays between them.
    """
    if messages is None:
        messages = load_mock_messages()

    for msg in messages:
        # Random delay to simulate generation
        delay = random.uniform(delay_min, delay_max)
        await asyncio.sleep(delay)
        yield msg


class MockNanoCCClient:
    """Mock NanoCC client that streams pre-defined CoT messages.

    This client mimics the NanoCCClient interface but uses local mock data
    instead of making real API calls.
    """

    def __init__(
        self,
        data_path: str | None = None,
        delay_min: float = MOCK_DELAY_MIN,
        delay_max: float = MOCK_DELAY_MAX,
    ):
        self.data_path = data_path or MOCK_DATA_PATH
        self.delay_min = delay_min
        self.delay_max = delay_max
        self._messages: list[MockCoTMessage] | None = None
        self._session_counter = 0

    def _load_messages(self) -> list[MockCoTMessage]:
        """Load and cache messages from file."""
        if self._messages is None:
            self._messages = load_mock_messages(self.data_path)
        return self._messages

    async def health_check(self) -> dict:
        """Mock health check - always returns OK."""
        return {"status": "ok", "service": "Mock NanoCC"}

    async def create_session(self, working_directory: str | None = None) -> dict:
        """Create a mock session."""
        self._session_counter += 1
        session_id = f"mock_session_{self._session_counter}"
        return {
            "session_id": session_id,
            "created_at": "2025-01-01T00:00:00Z",
            "mock": True,
        }

    async def send_message(
        self,
        session_id: str,
        content: str,
    ) -> AsyncGenerator[dict, None]:
        """Stream mock CoT messages as SSE-like events.

        Yields events in the same format as real NanoCC:
        - event_type: "text" for content messages
        - event_type: "tool_result" for structure artifacts
        - event_type: "done" when complete
        """
        messages = self._load_messages()

        for msg in messages:
            # Random delay to simulate generation
            delay = random.uniform(self.delay_min, self.delay_max)
            await asyncio.sleep(delay)

            # Yield text content
            yield {
                "event_type": "text",
                "data": {
                    "content": msg.message,
                    "state": msg.state,
                }
            }

            # If there's a PDB file, yield it as a tool result
            if msg.pdb_file:
                yield {
                    "event_type": "tool_result",
                    "data": {
                        "pdb_file": msg.pdb_file,
                        "label": msg.label or "structure",
                        "message": msg.message,  # Include MESSAGE for Position 2 display
                    }
                }

        # Signal completion
        yield {
            "event_type": "done",
            "data": {
                "input_tokens": 0,
                "output_tokens": len(messages) * 100,  # Mock token count
            }
        }

    async def delete_session(self, session_id: str) -> bool:
        """Mock session deletion - always succeeds."""
        return True


# Global mock client instance
mock_nanocc_client = MockNanoCCClient()
