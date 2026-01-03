"""In-memory store for application data.

Manages in-memory storage for:
- Conversations and their messages
- NanoCC jobs and their status
- Job-sequence mappings for SSE streams
- Structure cache (PDB data)
- Job cancellation state

Note: Data is lost on server restart. Future versions may replace
this with a persistent database backend.
"""

import threading

from app.components.nanocc import NanoCCJob
from app.models.schemas import Conversation


class MemoryStore:
    """Thread-safe in-memory data store.

    Uses a reentrant lock (RLock) to ensure thread safety for all operations.
    Can be replaced with a database-backed implementation in production.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._conversations: dict[str, Conversation] = {}
        self._jobs: dict[str, NanoCCJob] = {}
        self._job_sequences: dict[str, str] = {}
        self._structure_cache: dict[str, str] = {}
        self._canceled_jobs: set[str] = set()  # Track canceled job IDs

    # Conversation operations
    def save_conversation(self, conversation: Conversation) -> None:
        with self._lock:
            self._conversations[conversation.id] = conversation

    def get_conversation(self, conversation_id: str) -> Conversation | None:
        with self._lock:
            return self._conversations.get(conversation_id)

    def list_conversations(self) -> list[Conversation]:
        with self._lock:
            return sorted(list(self._conversations.values()), key=lambda c: c.updatedAt, reverse=True)

    def delete_conversation(self, conversation_id: str) -> bool:
        with self._lock:
            if conversation_id in self._conversations:
                del self._conversations[conversation_id]
                return True
            return False

    # Job operations
    def save_job(self, job: NanoCCJob) -> None:
        with self._lock:
            self._jobs[job.id] = job

    def get_job(self, job_id: str) -> NanoCCJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> list[NanoCCJob]:
        with self._lock:
            return sorted(list(self._jobs.values()), key=lambda j: j.createdAt, reverse=True)

    # Job sequence mapping (for SSE streams)
    def save_job_sequence(self, job_id: str, sequence: str) -> None:
        with self._lock:
            self._job_sequences[job_id] = sequence

    def get_job_sequence(self, job_id: str) -> str | None:
        with self._lock:
            return self._job_sequences.get(job_id)

    # Structure cache (PDB data)
    def cache_structure(self, structure_id: str, pdb_data: str) -> None:
        with self._lock:
            self._structure_cache[structure_id] = pdb_data

    def get_cached_structure(self, structure_id: str) -> str | None:
        with self._lock:
            return self._structure_cache.get(structure_id)

    # Job cancellation
    def cancel_job(self, job_id: str) -> bool:
        """Mark a job as canceled. Returns True if job exists."""
        with self._lock:
            if job_id in self._jobs:
                self._canceled_jobs.add(job_id)
                return True
            return False

    def is_job_canceled(self, job_id: str) -> bool:
        """Check if a job has been canceled."""
        with self._lock:
            return job_id in self._canceled_jobs

    def clear_all(self) -> None:
        """Clear all data (useful for testing)."""
        with self._lock:
            self._conversations.clear()
            self._jobs.clear()
            self._job_sequences.clear()
            self._structure_cache.clear()
            self._canceled_jobs.clear()


# Singleton instance
storage = MemoryStore()
