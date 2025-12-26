"""Thread-safe in-memory storage service for conversations, tasks, and structures."""

import threading

from ..models.schemas import Conversation, Task


class InMemoryStorage:
    """Thread-safe in-memory storage for all application data.

    Uses a reentrant lock (RLock) to ensure thread safety for all operations.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._conversations: dict[str, Conversation] = {}
        self._tasks: dict[str, Task] = {}
        self._task_sequences: dict[str, str] = {}
        self._structure_cache: dict[str, str] = {}

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
    def save_task(self, task: Task) -> None:
        with self._lock:
            self._tasks[task.id] = task

    def get_task(self, task_id: str) -> Task | None:
        with self._lock:
            return self._tasks.get(task_id)

    def list_tasks(self) -> list[Task]:
        with self._lock:
            return sorted(list(self._tasks.values()), key=lambda t: t.createdAt, reverse=True)

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

    def clear_all(self) -> None:
        """Clear all data (useful for testing)."""
        with self._lock:
            self._conversations.clear()
            self._tasks.clear()
            self._task_sequences.clear()
            self._structure_cache.clear()


# Singleton instance
storage = InMemoryStorage()
