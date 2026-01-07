"""NanoCC API client for AI-powered protein folding analysis."""

import json
import logging
import os
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Literal

import httpx

logger = logging.getLogger(__name__)

# NanoCC API configuration
NANOCC_BASE_URL = os.getenv("NANOCC_BASE_URL", "http://127.0.0.1:8001")
NANOCC_TIMEOUT = float(os.getenv("NANOCC_TIMEOUT", "120"))


@dataclass
class NanoCCEvent:
    """Parsed NanoCC SSE event."""

    event_type: Literal["text", "tool_use", "tool_result", "done", "error"]
    data: dict


@dataclass
class NanoCCSession:
    """NanoCC session information."""

    session_id: str
    created_at: str


class NanoCCClient:
    """Client for interacting with NanoCC API."""

    def __init__(self, base_url: str = NANOCC_BASE_URL, timeout: float = NANOCC_TIMEOUT):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._session_id: str | None = None

    async def health_check(self) -> dict:
        """Check if NanoCC service is healthy."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.base_url}/", timeout=5.0)
            resp.raise_for_status()
            return resp.json()

    async def create_session(self, working_directory: str | None = None) -> NanoCCSession:
        """Create a new NanoCC session."""
        payload = {}
        if working_directory:
            payload["working_directory"] = working_directory

        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{self.base_url}/sessions", json=payload, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            self._session_id = data["session_id"]
            return NanoCCSession(session_id=data["session_id"], created_at=data["created_at"])

    async def send_message(self, session_id: str, content: str) -> AsyncGenerator[NanoCCEvent, None]:
        """Send a message and stream the response."""
        async with (
            httpx.AsyncClient() as client,
            client.stream(
                "POST",
                f"{self.base_url}/sessions/{session_id}/messages",
                json={"content": content},
                timeout=self.timeout,
            ) as response,
        ):
            response.raise_for_status()

            event_type = ""
            async for line in response.aiter_lines():
                line = line.strip()
                if not line:
                    continue

                if line.startswith("event:"):
                    event_type = line[6:].strip()
                elif line.startswith("data:"):
                    try:
                        data = json.loads(line[5:])
                        yield NanoCCEvent(event_type=event_type, data=data)
                    except json.JSONDecodeError as e:
                        logger.warning(f"Skipping invalid JSON in NanoCC SSE stream: {line[:100]}... Error: {e}")
                        continue

    async def delete_session(self, session_id: str) -> bool:
        """Delete a NanoCC session."""
        async with httpx.AsyncClient() as client:
            resp = await client.delete(f"{self.base_url}/sessions/{session_id}", timeout=10.0)
            if resp.status_code == 404:
                return False
            resp.raise_for_status()
            return resp.json().get("success", False)

    async def get_completion_logs(self, session_id: str) -> list[dict]:
        """Get completion logs for a session."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.base_url}/sessions/{session_id}/completion_logs", timeout=10.0)
            resp.raise_for_status()
            return resp.json().get("logs", [])


# Global client instance
nanocc_client = NanoCCClient()


def build_folding_prompt(sequence: str, job_id: str) -> str:
    """Build a prompt for NanoCC to analyze and fold a protein sequence.

    Args:
        sequence: The amino acid sequence to analyze
        job_id: The job ID for tracking

    Returns:
        A formatted prompt string for NanoCC
    """
    return f"""You are a protein structure prediction assistant. Analyze the following protein sequence and provide insights about its structure prediction.

**Sequence** (Job ID: {job_id}):
```
{sequence}
```

**Sequence Length**: {len(sequence)} amino acids

Please analyze this sequence and provide:
1. Initial assessment of the sequence (hydrophobicity, potential secondary structures)
2. Key structural features you expect to find
3. Any notable patterns or motifs
4. Predicted fold type and confidence

Keep your response concise and scientifically accurate. Focus on the most important structural insights."""
