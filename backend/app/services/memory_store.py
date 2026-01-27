"""In-memory store for application data.

Manages in-memory storage for:
- Conversations and their messages
- NanoCC tasks and their status
- Task-sequence mappings for SSE streams
- Structure cache (PDB data)
- Task cancellation state

Note: Data is lost on server restart. Future versions may replace
this with a persistent database backend.
"""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.components.nanocc.job import NanoCCJob
    from app.models.schemas import Conversation


class MemoryStore:
    """Thread-safe in-memory data store.

    Uses a reentrant lock (RLock) to ensure thread safety for all operations.
    Can be replaced with a database-backed implementation in production.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._conversations: dict[str, Any] = {}  # Conversation objects
        self._tasks: dict[str, Any] = {}  # NanoCCJob objects (aliased as Task)
        self._task_sequences: dict[str, str] = {}
        self._structure_cache: dict[str, str] = {}
        self._canceled_tasks: set[str] = set()  # Track canceled task IDs

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

    # Task operations
    def save_task(self, task: NanoCCJob) -> None:
        with self._lock:
            self._tasks[task.id] = task

    def get_task(self, task_id: str) -> NanoCCJob | None:
        with self._lock:
            return self._tasks.get(task_id)

    def list_tasks(self) -> list[NanoCCJob]:
        with self._lock:
            return sorted(list(self._tasks.values()), key=lambda j: j.createdAt, reverse=True)

    # Task sequence mapping (for SSE streams)
    def save_task_sequence(self, task_id: str, sequence: str) -> None:
        with self._lock:
            self._task_sequences[task_id] = sequence

    def get_task_sequence(self, task_id: str) -> str | None:
        with self._lock:
            return self._task_sequences.get(task_id)

    # Structure cache (PDB data)
    def cache_structure(self, structure_id: str, pdb_data: str) -> None:
        with self._lock:
            self._structure_cache[structure_id] = pdb_data

    def get_cached_structure(self, structure_id: str) -> str | None:
        with self._lock:
            return self._structure_cache.get(structure_id)

    # Task cancellation
    def cancel_task(self, task_id: str) -> bool:
        """Mark a task as canceled. Returns True if task exists."""
        with self._lock:
            if task_id in self._tasks:
                self._canceled_tasks.add(task_id)
                return True
            return False

    def is_task_canceled(self, task_id: str) -> bool:
        """Check if a task has been canceled."""
        with self._lock:
            return task_id in self._canceled_tasks

    def clear_all(self) -> None:
        """Clear all data (useful for testing)."""
        with self._lock:
            self._conversations.clear()
            self._tasks.clear()
            self._task_sequences.clear()
            self._structure_cache.clear()
            self._canceled_tasks.clear()


# Singleton instance
storage = MemoryStore()
