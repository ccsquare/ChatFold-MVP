"""NanoCC Integration Module.

This module provides integration with NanoCC AI service for protein folding
analysis with Chain-of-Thought (CoT) streaming.

Components:
- job.py: NanoCCJob, JobEvent, EventType and related data models
- client.py: NanoCC API client for real service communication
- folding.py: Folding service that orchestrates mock/real NanoCC
- mock.py: Mock NanoCC service (reads from JSONL files)
- legacy_mock.py: Legacy mock with hardcoded messages (USE_NANOCC=false)

Usage:
    from app.components.nanocc import NanoCCJob, generate_cot_events

    async for event in generate_cot_events(job_id, sequence):
        yield event
"""

from .job import (
    NanoCCJob,
    JobEvent,
    JobType,
    EventType,
    StageType,
    StatusType,
    CreateJobRequest,
    RegisterSequenceRequest,
)
from .folding import generate_cot_events, generate_mock_cot_events
from .legacy_mock import generate_step_events

__all__ = [
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
    "generate_step_events",  # Legacy mock
]
