"""NanoCC API client for AI-powered protein folding analysis.

This module provides two client classes:
- NanoCCSchedulerClient: Manages instance allocation via the scheduler
- NanoCCClient: Handles session and message operations on allocated instances

API Flow:
1. SchedulerClient.allocate_instance(fs_root) -> instance_id, backend_url
2. SchedulerClient.health_check(instance_id) -> verify instance is ready
3. NanoCCClient(backend_url).create_session() -> session_id
4. NanoCCClient.send_message(session_id, content) -> SSE stream
5. SchedulerClient.release_instance(instance_id) -> cleanup

NanoCC API Reference:
- Scheduler: POST /api/v1/instances, DELETE /api/v1/instances/{id}
- Backend (via proxy): POST /sessions, POST /sessions/{sid}/messages (SSE)
- Proxy path: /_process_allocator/{instance_id}/{backend_path}
"""

import json
import logging
import os
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Literal

import httpx

logger = logging.getLogger(__name__)

# NanoCC Scheduler configuration
NANOCC_SCHEDULER_URL = os.getenv(
    "NANOCC_SCHEDULER_URL",
    "https://sd58janoglhtn7o3qa6r0.apigateway-cn-shanghai-inner.volceapi.com",
)
NANOCC_AUTH_TOKEN = os.getenv(
    "NANOCC_AUTH_TOKEN", "c02e6c1e-bdc5-4afa-a701-bcf34941f26a"
)
NANOCC_FS_ROOT = os.getenv("NANOCC_FS_ROOT", "/SPXvePFS/mewtool/sessions")

# Timeout configuration
NANOCC_ALLOCATE_TIMEOUT = float(os.getenv("NANOCC_ALLOCATE_TIMEOUT", "60"))
NANOCC_SESSION_TIMEOUT = float(os.getenv("NANOCC_SESSION_TIMEOUT", "30"))
NANOCC_MESSAGE_TIMEOUT = float(os.getenv("NANOCC_MESSAGE_TIMEOUT", "1800"))  # 30 min
NANOCC_DEFAULT_TIMEOUT = float(os.getenv("NANOCC_TIMEOUT", "120"))

# Legacy config for backward compatibility
NANOCC_BASE_URL = os.getenv("NANOCC_BASE_URL", "http://127.0.0.1:8001")


@dataclass
class NanoCCEvent:
    """Parsed NanoCC SSE event."""

    event_type: Literal[
        "text", "tool_use", "tool_result", "thinking", "cot_step", "done", "error"
    ]
    data: dict


@dataclass
class NanoCCSession:
    """NanoCC session information."""

    session_id: str
    created_at: str


@dataclass
class NanoCCInstance:
    """NanoCC instance information from scheduler."""

    instance_id: str
    address: str
    backend_url: str
    ref_count: int = 1
    reused: bool = False


@dataclass
class NanoCCContext:
    """Full context for a NanoCC interaction."""

    instance: NanoCCInstance
    session: NanoCCSession | None = None
    scheduler_client: "NanoCCSchedulerClient" = field(default=None, repr=False)
    backend_client: "NanoCCClient" = field(default=None, repr=False)


@dataclass
class TOSConfig:
    """TOS sync configuration for NanoCC.

    Matches the backend API schema:
    - bucket: TOS bucket name
    - state: Path prefix for state files (trajectory)
    - output: Path prefix for output files (PDB structures)
    - upload: Path prefix for uploaded files (user inputs)
    """

    bucket: str
    state: str | None = None
    output: str | None = None
    upload: str | None = None

    def to_dict(self) -> dict:
        """Convert to dict for API request."""
        result = {"bucket": self.bucket}
        if self.state:
            result["state"] = self.state
        if self.output:
            result["output"] = self.output
        if self.upload:
            result["upload"] = self.upload
        return result


class NanoCCSchedulerClient:
    """Client for NanoCC scheduler API.

    Handles instance allocation and lifecycle management.

    The scheduler manages NanoCC backend processes and provides:
    - Instance allocation with fs_root for workspace isolation
    - Reference counting for instance reuse (same fs_root)
    - Reverse proxy to backend via /_process_allocator/{id}/ path
    """

    def __init__(
        self,
        scheduler_url: str = NANOCC_SCHEDULER_URL,
        auth_token: str = NANOCC_AUTH_TOKEN,
        timeout: float = NANOCC_DEFAULT_TIMEOUT,
    ):
        self.scheduler_url = scheduler_url.rstrip("/")
        self.auth_token = auth_token
        self.timeout = timeout

    def _get_headers(self) -> dict:
        """Get request headers with auth token."""
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        return headers

    async def allocate_instance(
        self,
        fs_root: str,
        mounts: dict[str, str] | None = None,
        working_directory: str | None = None,
        environment: dict[str, str] | None = None,
    ) -> NanoCCInstance:
        """Allocate a NanoCC backend instance.

        Args:
            fs_root: The filesystem root path for the instance (vePFS path).
                     NanoCC will use this as the working directory for all operations.
                     Same fs_root will reuse existing instance (ref_count incremented).
            mounts: Optional additional mount points
            working_directory: Optional working directory override
            environment: Optional environment variables

        Returns:
            NanoCCInstance with instance_id and backend_url

        Raises:
            httpx.HTTPStatusError: If allocation fails
        """
        payload: dict = {"fs_root": fs_root}
        if mounts:
            payload["mounts"] = mounts
        if working_directory:
            payload["working_directory"] = working_directory
        if environment:
            payload["environment"] = environment

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.scheduler_url}/api/v1/instances",
                json=payload,
                headers=self._get_headers(),
                timeout=NANOCC_ALLOCATE_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()

            instance_id = data["instance_id"]
            # Build backend URL using scheduler proxy path
            backend_url = f"{self.scheduler_url}/_process_allocator/{instance_id}"

            logger.info(
                f"Allocated NanoCC instance: {instance_id} "
                f"(reused={data.get('reused', False)}, ref_count={data.get('ref_count', 1)})"
            )
            return NanoCCInstance(
                instance_id=instance_id,
                address=data.get("address", ""),
                backend_url=backend_url,
                ref_count=data.get("ref_count", 1),
                reused=data.get("reused", False),
            )

    async def health_check(self, instance: NanoCCInstance) -> dict:
        """Check if a NanoCC instance is healthy.

        Args:
            instance: The instance to check

        Returns:
            Health check response: {"status": "ok", "service": "NanoCC API"}

        Raises:
            httpx.HTTPStatusError: If health check fails
        """
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{instance.backend_url}/",
                headers=self._get_headers(),
                timeout=10.0,
            )
            resp.raise_for_status()
            return resp.json()

    async def release_instance(self, instance: NanoCCInstance) -> bool:
        """Release a NanoCC instance.

        Decrements the reference count. Instance is terminated when ref_count reaches 0.

        Args:
            instance: The instance to release

        Returns:
            True if released successfully, False if instance not found
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.delete(
                    f"{self.scheduler_url}/api/v1/instances/{instance.instance_id}",
                    headers=self._get_headers(),
                    timeout=10.0,
                )
                if resp.status_code == 404:
                    logger.warning(
                        f"Instance {instance.instance_id} not found during release"
                    )
                    return False
                resp.raise_for_status()
                data = resp.json()
                logger.info(
                    f"Released NanoCC instance: {instance.instance_id} "
                    f"(terminated={data.get('terminated', False)})"
                )
                return True
        except Exception as e:
            logger.warning(f"Failed to release instance {instance.instance_id}: {e}")
            return False

    async def get_instance(self, instance_id: str) -> dict | None:
        """Get instance information.

        Args:
            instance_id: The instance ID to query

        Returns:
            Instance info dict or None if not found
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.scheduler_url}/api/v1/instances/{instance_id}",
                    headers=self._get_headers(),
                    timeout=10.0,
                )
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(f"Failed to get instance {instance_id}: {e}")
            return None

    async def list_instances(self) -> list[dict]:
        """List all instances.

        Returns:
            List of instance info dicts
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.scheduler_url}/api/v1/instances",
                    headers=self._get_headers(),
                    timeout=10.0,
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("instances", [])
        except Exception as e:
            logger.warning(f"Failed to list instances: {e}")
            return []


class NanoCCClient:
    """Client for interacting with NanoCC backend API.

    This client handles session and message operations on an allocated instance.
    All requests are proxied through the scheduler via /_process_allocator/{id}/ path.

    Typical usage:
        scheduler = NanoCCSchedulerClient()
        instance = await scheduler.allocate_instance(fs_root)
        client = NanoCCClient(base_url=instance.backend_url, auth_token=scheduler.auth_token)
        session = await client.create_session()
        async for event in client.send_message(session.session_id, "Hello"):
            print(event)
        await client.delete_session(session.session_id)
        await scheduler.release_instance(instance)
    """

    def __init__(
        self,
        base_url: str = NANOCC_BASE_URL,
        auth_token: str = NANOCC_AUTH_TOKEN,
        timeout: float = NANOCC_DEFAULT_TIMEOUT,
    ):
        self.base_url = base_url.rstrip("/")
        self.auth_token = auth_token
        self.timeout = timeout
        self._session_id: str | None = None

    def _get_headers(self) -> dict:
        """Get request headers with auth token."""
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        return headers

    async def health_check(self) -> dict:
        """Check if NanoCC service is healthy.

        Returns:
            {"status": "ok", "service": "NanoCC API"}
        """
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/",
                headers=self._get_headers(),
                timeout=5.0,
            )
            resp.raise_for_status()
            return resp.json()

    async def create_session(
        self, working_directory: str | None = None
    ) -> NanoCCSession:
        """Create a new NanoCC session.

        Args:
            working_directory: Optional working directory for the session

        Returns:
            NanoCCSession with session_id and created_at
        """
        payload = {}
        if working_directory:
            payload["working_directory"] = working_directory

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/sessions",
                json=payload,
                headers=self._get_headers(),
                timeout=NANOCC_SESSION_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            self._session_id = data["session_id"]
            logger.info(f"Created NanoCC session: {self._session_id}")
            return NanoCCSession(
                session_id=data["session_id"],
                created_at=data["created_at"],
            )

    async def send_message(
        self,
        session_id: str,
        content: str,
        tos: TOSConfig | None = None,
        files: list[str] | None = None,
        timeout: float | None = None,
    ) -> AsyncGenerator[NanoCCEvent, None]:
        """Send a message and stream the response.

        Args:
            session_id: The session ID
            content: The message content (user query)
            tos: Optional TOS sync configuration for file storage
            files: Optional list of files to download from TOS before processing
            timeout: Optional timeout override (default: NANOCC_MESSAGE_TIMEOUT)

        Yields:
            NanoCCEvent objects parsed from SSE stream

        Event types:
            - text: Text output with content
            - tool_use: Tool invocation with name, input, id
            - tool_result: Tool result with tool_use_id, content, is_error
            - thinking: Internal thinking process
            - cot_step: Chain-of-thought step (narrator events)
            - done: Completion with token statistics
            - error: Error message
        """
        payload: dict = {"content": content}
        if tos:
            payload["tos"] = tos.to_dict()
        if files:
            payload["files"] = files

        request_timeout = timeout or NANOCC_MESSAGE_TIMEOUT
        stream_start_time = time.time()
        event_count = 0
        last_event_type = None

        logger.info(
            f"[NanoCC SSE] Connecting: session_id={session_id}, "
            f"timeout={request_timeout}s, has_tos={tos is not None}, files={files}"
        )

        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/sessions/{session_id}/messages",
                    json=payload,
                    headers=self._get_headers(),
                    timeout=httpx.Timeout(request_timeout, connect=30.0),
                ) as response:
                    response.raise_for_status()
                    logger.info(f"[NanoCC SSE] Connected: session_id={session_id}, status={response.status_code}")

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
                                event_count += 1
                                last_event_type = event_type
                                yield NanoCCEvent(event_type=event_type, data=data)
                            except json.JSONDecodeError as e:
                                logger.warning(
                                    f"Skipping invalid JSON in NanoCC SSE stream: "
                                    f"{line[:100]}... Error: {e}"
                                )
                                continue

        except httpx.TimeoutException as e:
            duration = time.time() - stream_start_time
            logger.error(
                f"[NanoCC SSE] Timeout: session_id={session_id}, "
                f"events_received={event_count}, duration={duration:.2f}s, error={e}"
            )
            raise
        except httpx.HTTPStatusError as e:
            duration = time.time() - stream_start_time
            logger.error(
                f"[NanoCC SSE] HTTP error: session_id={session_id}, "
                f"status={e.response.status_code}, events_received={event_count}, "
                f"duration={duration:.2f}s"
            )
            raise
        except Exception as e:
            duration = time.time() - stream_start_time
            logger.error(
                f"[NanoCC SSE] Error: session_id={session_id}, "
                f"events_received={event_count}, duration={duration:.2f}s, "
                f"error_type={type(e).__name__}, error={e}"
            )
            raise
        finally:
            duration = time.time() - stream_start_time
            logger.info(
                f"[NanoCC SSE] Disconnected: session_id={session_id}, "
                f"events_received={event_count}, last_event={last_event_type}, "
                f"duration={duration:.2f}s"
            )

    async def delete_session(self, session_id: str) -> bool:
        """Delete a NanoCC session.

        Args:
            session_id: The session ID to delete

        Returns:
            True if deleted successfully, False if not found
        """
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{self.base_url}/sessions/{session_id}",
                headers=self._get_headers(),
                timeout=10.0,
            )
            if resp.status_code == 404:
                logger.warning(f"Session {session_id} not found during delete")
                return False
            resp.raise_for_status()
            logger.info(f"Deleted NanoCC session: {session_id}")
            return resp.json().get("success", False)

    async def interrupt_session(self, session_id: str) -> dict:
        """Send interrupt signal to abort current response.

        Use this to cancel a long-running task.

        Args:
            session_id: The session ID to interrupt

        Returns:
            {"success": true, "message": "Interrupt signal sent"}

        Raises:
            httpx.HTTPStatusError: If session not found (404) or conflict (409)
        """
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/sessions/{session_id}/interrupt",
                headers=self._get_headers(),
                timeout=10.0,
            )
            resp.raise_for_status()
            logger.info(f"Sent interrupt to NanoCC session: {session_id}")
            return resp.json()

    async def get_completion_logs(self, session_id: str) -> list[dict]:
        """Get completion logs for a session.

        Contains the request body and final response for each message exchange.

        Args:
            session_id: The session ID

        Returns:
            List of completion log entries
        """
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/sessions/{session_id}/completion_logs",
                headers=self._get_headers(),
                timeout=10.0,
            )
            resp.raise_for_status()
            return resp.json().get("logs", [])


# Global client instances (for backward compatibility)
nanocc_scheduler = NanoCCSchedulerClient()
nanocc_client = NanoCCClient()


def build_folding_prompt(query: str, sequence: str) -> str:
    """Build prompt for NanoCC by combining user query with protein sequence.

    The user's natural language query is placed first, followed by the sequence
    in a fenced code block. This allows NanoCC to understand the user's intent
    (e.g. "fold this protein", "compare with PDB xxx") alongside the sequence data.

    Args:
        query: User's natural language instruction or question.
        sequence: Validated uppercase amino acid sequence (e.g. "MVLSPADKTN...").

    Returns:
        Formatted prompt string ready to send to NanoCC.

    Example:
        >>> build_folding_prompt("请分析这个蛋白质", "MVLSPADKTN")
        '请分析这个蛋白质\\n\\nsequence:\\n```\\nMVLSPADKTN\\n```'
    """
    return f"""{query}

sequence:
```
{sequence}
```"""


def task_id_to_session_id(task_id: str) -> str:
    """Convert task_id to NanoCC session_id format.

    Strips the ``task_`` prefix and prepends ``session_`` so that each
    ChatFold task maps to a unique NanoCC working directory.

    Args:
        task_id: Task identifier (format: task_xxx)

    Returns:
        Session identifier (format: session_xxx)
    """
    unique_part = task_id.replace("task_", "", 1) if task_id.startswith("task_") else task_id
    return f"session_{unique_part}"


def get_fs_root(session_id: str) -> str:
    """Get the filesystem root path for a NanoCC session.

    Args:
        session_id: The session identifier (format: session_xxx)

    Returns:
        vePFS path for the session's workspace: {NANOCC_FS_ROOT}/session_xxx
    """
    return f"{NANOCC_FS_ROOT}/{session_id}"
