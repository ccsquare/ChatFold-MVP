"""TaskEvent repository for database operations.

Handles persistence of SSE events from NanoCC task execution.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import TaskEvent
from app.repositories.base import BaseRepository
from app.utils import generate_id, get_timestamp_ms


class TaskEventRepository(BaseRepository[TaskEvent]):
    """Repository for TaskEvent entity operations."""

    def __init__(self):
        super().__init__(TaskEvent)

    def get_by_task(
        self,
        db: Session,
        task_id: str,
        skip: int = 0,
        limit: int = 1000,
    ) -> list[TaskEvent]:
        """Get all events for a task, ordered by creation time.

        Args:
            db: Database session
            task_id: Task ID
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            List of task events
        """
        stmt = (
            select(TaskEvent)
            .where(TaskEvent.task_id == task_id)
            .order_by(TaskEvent.created_at.asc())
            .offset(skip)
            .limit(limit)
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_by_event_type(
        self,
        db: Session,
        task_id: str,
        event_type: str,
    ) -> list[TaskEvent]:
        """Get events of a specific type for a task.

        Args:
            db: Database session
            task_id: Task ID
            event_type: Event type (PROLOGUE, THINKING_TEXT, etc.)

        Returns:
            List of task events
        """
        stmt = (
            select(TaskEvent)
            .where(TaskEvent.task_id == task_id, TaskEvent.event_type == event_type)
            .order_by(TaskEvent.created_at.asc())
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_thinking_blocks(self, db: Session, task_id: str) -> list[TaskEvent]:
        """Get all thinking events (THINKING_TEXT and THINKING_PDB) for a task.

        Args:
            db: Database session
            task_id: Task ID

        Returns:
            List of thinking events
        """
        stmt = (
            select(TaskEvent)
            .where(
                TaskEvent.task_id == task_id,
                TaskEvent.event_type.in_(["THINKING_TEXT", "THINKING_PDB"]),
            )
            .order_by(TaskEvent.created_at.asc())
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def count_by_task(self, db: Session, task_id: str) -> int:
        """Count events for a task.

        Args:
            db: Database session
            task_id: Task ID

        Returns:
            Number of events
        """
        stmt = select(func.count()).select_from(TaskEvent).where(TaskEvent.task_id == task_id)
        result = db.execute(stmt)
        return result.scalar() or 0

    def count_thinking_blocks(self, db: Session, task_id: str) -> int:
        """Count unique thinking block indices for a task.

        Args:
            db: Database session
            task_id: Task ID

        Returns:
            Number of thinking blocks
        """
        stmt = (
            select(func.count(func.distinct(TaskEvent.block_index)))
            .select_from(TaskEvent)
            .where(
                TaskEvent.task_id == task_id,
                TaskEvent.block_index.isnot(None),
            )
        )
        result = db.execute(stmt)
        return result.scalar() or 0

    def create_event(
        self,
        db: Session,
        task_id: str,
        event_type: str,
        stage: str,
        status: str,
        progress: int = 0,
        message: str | None = None,
        block_index: int | None = None,
        structure_id: str | None = None,
    ) -> TaskEvent:
        """Create a new task event record.

        Args:
            db: Database session
            task_id: Parent task ID
            event_type: Event type (PROLOGUE, THINKING_TEXT, etc.)
            stage: Task stage (MSA, MODEL, etc.)
            status: Task status (running, partial, etc.)
            progress: Progress percentage (0-100)
            message: Event message content
            block_index: Thinking block index for grouping
            structure_id: Associated structure ID (for THINKING_PDB)

        Returns:
            Created task event
        """
        event_data = {
            "id": generate_id("evt"),
            "task_id": task_id,
            "event_type": event_type,
            "stage": stage,
            "status": status,
            "progress": progress,
            "message": message,
            "block_index": block_index,
            "structure_id": structure_id,
            "created_at": get_timestamp_ms(),
        }
        return self.create(db, event_data)

    def bulk_create(self, db: Session, events: list[dict]) -> list[TaskEvent]:
        """Bulk create task events.

        Args:
            db: Database session
            events: List of event data dicts

        Returns:
            List of created events
        """
        db_events = []
        for event in events:
            if "id" not in event:
                event["id"] = generate_id("evt")
            if "created_at" not in event:
                event["created_at"] = get_timestamp_ms()
            db_event = TaskEvent(**event)
            db.add(db_event)
            db_events.append(db_event)
        db.commit()
        for event in db_events:
            db.refresh(event)
        return db_events

    def delete_by_task(self, db: Session, task_id: str) -> int:
        """Delete all events for a task.

        Args:
            db: Database session
            task_id: Task ID

        Returns:
            Number of deleted events
        """
        events = self.get_by_task(db, task_id, limit=10000)
        count = len(events)
        for event in events:
            db.delete(event)
        db.commit()
        return count


# Singleton instance
task_event_repository = TaskEventRepository()
