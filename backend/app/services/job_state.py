"""Backward compatibility shim for nanocc imports.

The nanocc external module imports from this path:
    from app.services.job_state import job_state_service

This shim re-exports from the renamed task_state module.
"""

from app.services.task_state import (
    TASK_STATE_TTL as JOB_STATE_TTL,
)
from app.services.task_state import (
    TaskStateDict as JobStateDict,
)
from app.services.task_state import (
    TaskStateService as JobStateService,
)
from app.services.task_state import (
    task_state_service as job_state_service,
)

__all__ = [
    "JobStateService",
    "job_state_service",
    "JobStateDict",
    "JOB_STATE_TTL",
]
