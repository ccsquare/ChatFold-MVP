"""NanoCC Integration Module.

This module provides integration with NanoCC AI service for protein folding
analysis with Chain-of-Thought (CoT) streaming.

Architecture:
- NanoCCSchedulerClient: Manages instance allocation via scheduler API
- NanoCCClient: Handles session/message operations on allocated instances
- MockNanoCCSchedulerClient: Mock scheduler for testing
- MockNanoCCClient: Mock client that reads from JSONL files

Components:
- job.py: NanoCCJob, JobEvent, EventType and related data models
- client.py: NanoCC API clients (Scheduler + Backend)
- folding.py: Folding service that orchestrates mock/real NanoCC
- mock.py: Mock NanoCC clients (mirrors real client interfaces)
- legacy_mock.py: Legacy mock with hardcoded messages (USE_NANOCC=false)

Usage:
    from app.components.nanocc import NanoCCJob, generate_cot_events

    # Using the high-level API (recommended)
    async for event in generate_cot_events(job_id, sequence):
        yield event

    # Using the low-level client API
    from app.components.nanocc import NanoCCSchedulerClient, NanoCCClient

    scheduler = NanoCCSchedulerClient()
    instance = await scheduler.allocate_instance(fs_root)
    client = NanoCCClient(base_url=instance.backend_url)
    session = await client.create_session()
    async for event in client.send_message(session.session_id, prompt):
        process(event)
"""

from app.components.nanocc.client import (
    NanoCCClient,
    NanoCCContext,
    NanoCCEvent,
    NanoCCInstance,
    NanoCCSchedulerClient,
    NanoCCSession,
    TOSConfig,
    build_folding_prompt,
    get_fs_root,
    job_id_to_session_id,
)
from app.components.nanocc.folding import (
    generate_cot_events,
    generate_mock_cot_events,
    generate_real_cot_events,
)
from app.components.nanocc.job import (
    CreateJobRequest,
    EventType,
    JobEvent,
    JobType,
    NanoCCJob,
    RegisterSequenceRequest,
    StageType,
    StatusType,
)
from app.components.nanocc.legacy_mock import generate_step_events
from app.components.nanocc.mock import (
    MockNanoCCClient,
    MockNanoCCSchedulerClient,
)

__all__ = [
    # Client classes
    "NanoCCSchedulerClient",
    "NanoCCClient",
    "NanoCCEvent",
    "NanoCCSession",
    "NanoCCInstance",
    "NanoCCContext",
    "TOSConfig",
    # Mock client classes
    "MockNanoCCSchedulerClient",
    "MockNanoCCClient",
    # Models
    "NanoCCJob",
    "JobEvent",
    "JobType",
    "EventType",
    "StageType",
    "StatusType",
    "CreateJobRequest",
    "RegisterSequenceRequest",
    # Services
    "generate_cot_events",
    "generate_mock_cot_events",
    "generate_real_cot_events",
    "generate_step_events",  # Legacy mock
    # Utils
    "build_folding_prompt",
    "get_fs_root",
    "job_id_to_session_id",
]
