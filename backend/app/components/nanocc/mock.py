"""Mock NanoCC service for testing without real NanoCC backend.

This module provides mock implementations that mirror the real NanoCC API:
- MockNanoCCSchedulerClient: Simulates scheduler instance allocation
- MockNanoCCClient: Simulates session/message operations with JSONL data

The mock clients follow the same interface as the real clients in client.py,
allowing seamless switching between mock and real modes.
"""

import asyncio
import json
import logging
import os
import random
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.components.nanocc.client import (
    NanoCCEvent,
    NanoCCInstance,
    NanoCCSession,
    TOSConfig,
)

logger = logging.getLogger(__name__)

# Configuration
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
_DEFAULT_MOCK_DATA = _BACKEND_DIR / "tests" / "fixtures" / "Mocking_CoT.nanocc.sse.jsonl"
MOCK_DATA_PATH = os.getenv("MOCK_NANOCC_DATA_PATH", str(_DEFAULT_MOCK_DATA))
MOCK_DELAY_MIN = float(os.getenv("MOCK_NANOCC_DELAY_MIN", "1.0"))
MOCK_DELAY_MAX = float(os.getenv("MOCK_NANOCC_DELAY_MAX", "5.0"))
MOCK_DELAY_MODE = os.getenv("MOCK_NANOCC_DELAY_MODE", "random").lower()


@dataclass
class MockCoTMessage:
    """A single Chain-of-Thought message from the mock data."""

    type: str  # "PROLOGUE", "ANNOTATION", "THINKING", "CONCLUSION"
    state: str  # "MODEL" or "DONE"
    message: str
    pdb_file: str | None = None
    label: str | None = None
    timestamp: str | None = None


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
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                messages.append(
                    MockCoTMessage(
                        type=data.get("TYPE", "THINKING"),
                        state=data.get("STATE", "MODEL"),
                        message=data.get("MESSAGE", ""),
                        pdb_file=data.get("pdb_file"),
                        label=data.get("label"),
                        timestamp=data.get("timestamp"),
                    )
                )
            except json.JSONDecodeError as e:
                logger.warning(f"Skipping invalid JSON line in mock data: {line[:100]}... Error: {e}")
                continue

    return messages


async def stream_mock_messages(
    messages: list[MockCoTMessage] | None = None,
    delay_min: float = MOCK_DELAY_MIN,
    delay_max: float = MOCK_DELAY_MAX,
    delay_mode: str = MOCK_DELAY_MODE,
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

    prev_ts = None
    for msg in messages:
        delay = random.uniform(delay_min, delay_max)
        if delay_mode == "real" and msg.timestamp:
            try:
                current_ts = datetime.fromisoformat(msg.timestamp)
                if prev_ts is not None:
                    delay = max(0.0, (current_ts - prev_ts).total_seconds())
                prev_ts = current_ts
            except ValueError:
                pass
        await asyncio.sleep(delay)
        yield msg


class MockNanoCCSchedulerClient:
    """Mock NanoCC scheduler client.

    Simulates the scheduler API for instance allocation without making
    real network calls. Mirrors the NanoCCSchedulerClient interface.
    """

    def __init__(
        self,
        scheduler_url: str = "http://mock-scheduler:8080",
        auth_token: str = "",
        timeout: float = 120.0,
    ):
        self.scheduler_url = scheduler_url.rstrip("/")
        self.auth_token = auth_token
        self.timeout = timeout
        self._instances: dict[str, NanoCCInstance] = {}
        self._instance_counter = 0

    async def allocate_instance(self, fs_root: str) -> NanoCCInstance:
        """Allocate a mock NanoCC backend instance.

        Args:
            fs_root: The filesystem root path for the instance

        Returns:
            NanoCCInstance with mock instance_id and backend_url
        """
        self._instance_counter += 1
        instance_id = f"mock-instance-{uuid.uuid4().hex[:12]}"
        backend_url = f"{self.scheduler_url}/_process_allocator/{instance_id}"

        instance = NanoCCInstance(
            instance_id=instance_id,
            address=f"mock-backend:8080/_process_allocator/{instance_id}",
            backend_url=backend_url,
            ref_count=1,
            reused=False,
        )

        self._instances[instance_id] = instance
        logger.info(f"Mock: Allocated instance {instance_id} with fs_root={fs_root}")

        # Simulate allocation delay
        await asyncio.sleep(0.1)

        return instance

    async def health_check(self, instance: NanoCCInstance) -> dict:
        """Check if a mock instance is healthy.

        Args:
            instance: The instance to check

        Returns:
            Mock health check response
        """
        await asyncio.sleep(0.05)  # Simulate network delay
        return {"status": "ok", "service": "Mock NanoCC API"}

    async def release_instance(self, instance: NanoCCInstance) -> bool:
        """Release a mock NanoCC instance.

        Args:
            instance: The instance to release

        Returns:
            True if released successfully
        """
        if instance.instance_id in self._instances:
            del self._instances[instance.instance_id]
            logger.info(f"Mock: Released instance {instance.instance_id}")
            return True
        return False


class MockNanoCCClient:
    """Mock NanoCC client that streams pre-defined CoT messages.

    This client mimics the NanoCCClient interface but uses local mock data
    instead of making real API calls. Follows the same API contract as
    the real NanoCCClient for seamless switching.
    """

    def __init__(
        self,
        base_url: str = "http://mock-nanocc:8001",
        auth_token: str = "",
        timeout: float = 120.0,
        data_path: str | None = None,
        delay_min: float = MOCK_DELAY_MIN,
        delay_max: float = MOCK_DELAY_MAX,
        delay_mode: str = MOCK_DELAY_MODE,
    ):
        self.base_url = base_url.rstrip("/")
        self.auth_token = auth_token
        self.timeout = timeout
        self.data_path = data_path or MOCK_DATA_PATH
        self.delay_min = delay_min
        self.delay_max = delay_max
        self.delay_mode = delay_mode
        self._messages: list[MockCoTMessage] | None = None
        self._sessions: dict[str, dict] = {}
        self._session_counter = 0

    def _load_messages(self) -> list[MockCoTMessage]:
        """Load and cache messages from file."""
        if self._messages is None:
            self._messages = load_mock_messages(self.data_path)
        return self._messages

    async def health_check(self) -> dict:
        """Mock health check - always returns OK."""
        await asyncio.sleep(0.05)
        return {"status": "ok", "service": "Mock NanoCC API"}

    async def create_session(self, working_directory: str | None = None) -> NanoCCSession:
        """Create a mock session.

        Args:
            working_directory: Optional working directory (ignored in mock)

        Returns:
            NanoCCSession with mock session_id
        """
        self._session_counter += 1
        session_id = f"mock-session-{uuid.uuid4().hex[:12]}"
        created_at = datetime.now(timezone.utc).isoformat()

        self._sessions[session_id] = {
            "session_id": session_id,
            "created_at": created_at,
            "working_directory": working_directory,
        }

        logger.info(f"Mock: Created session {session_id}")
        await asyncio.sleep(0.05)

        return NanoCCSession(session_id=session_id, created_at=created_at)

    async def send_message(
        self,
        session_id: str,
        content: str,
        tos: TOSConfig | None = None,
        files: list[str] | None = None,
        timeout: float | None = None,
    ) -> AsyncGenerator[NanoCCEvent, None]:
        """Stream mock CoT messages as SSE-like events.

        Follows the same event format as NanoCC cot_step streaming:
        - event_type: "cot_step" with STATE/MESSAGE/pdb_file/label
        - event_type: "done" when complete

        Args:
            session_id: The session ID
            content: The message content (used for logging)
            tos: Optional TOS sync configuration (ignored in mock)
            files: Optional files list (ignored in mock)
            timeout: Optional timeout override (ignored in mock)

        Yields:
            NanoCCEvent objects matching real NanoCC format
        """
        messages = self._load_messages()
        logger.info(f"Mock: Sending message to session {session_id}, content length: {len(content)}")

        prev_ts = None
        for msg in messages:
            # Delay to simulate generation
            delay = random.uniform(self.delay_min, self.delay_max)
            if self.delay_mode == "real" and msg.timestamp:
                try:
                    current_ts = datetime.fromisoformat(msg.timestamp)
                    if prev_ts is not None:
                        delay = max(0.0, (current_ts - prev_ts).total_seconds())
                    prev_ts = current_ts
                except ValueError:
                    pass
            await asyncio.sleep(delay)

            # Yield normalized cot_step message
            yield NanoCCEvent(
                event_type="cot_step",
                data={
                    "STATE": msg.type.lower(),  # prologue|annotation|thinking|conclusion
                    "MESSAGE": msg.message,
                    "pdb_file": msg.pdb_file,
                    "label": msg.label,
                    "timestamp": msg.timestamp,
                },
            )

        # Signal completion with stats (matching real NanoCC done event)
        yield NanoCCEvent(
            event_type="done",
            data={
                "context_tokens": len(messages) * 500,
                "context_limit": 200000,
                "context_formatted": f"{len(messages) * 0.5:.1f}k / 200k ({len(messages) * 0.25:.0f}%)",
                "request_prompt_tokens": len(content.split()) * 2,
                "request_completion_tokens": len(messages) * 100,
                "tokens_formatted": f"In: {len(content.split()) * 2} | Out: {len(messages) * 100}",
                "session_prompt_tokens": len(content.split()) * 2,
                "session_completion_tokens": len(messages) * 100,
                "session_tokens_formatted": f"In: {len(content.split()) * 2} | Out: {len(messages) * 100}",
                "time_formatted": f"{len(messages) * 2.5:.1f}s",
                "total_cost_usd": None,
                "duration_ms": len(messages) * 2500,
            },
        )

    async def delete_session(self, session_id: str) -> bool:
        """Mock session deletion.

        Args:
            session_id: The session ID to delete

        Returns:
            True if deleted, False if not found
        """
        if session_id in self._sessions:
            del self._sessions[session_id]
            logger.info(f"Mock: Deleted session {session_id}")
            return True
        return False

    async def get_completion_logs(self, session_id: str) -> list[dict]:
        """Get mock completion logs.

        Args:
            session_id: The session ID

        Returns:
            Empty list (mock has no completion logs)
        """
        return []


# Global mock client instances
mock_nanocc_scheduler = MockNanoCCSchedulerClient()
mock_nanocc_client = MockNanoCCClient()
