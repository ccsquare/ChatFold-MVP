"""Task repository for database operations."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Task
from app.repositories.base import BaseRepository
from app.settings import DEFAULT_USER_ID
from app.utils import generate_id, get_timestamp_ms


class TaskRepository(BaseRepository[Task]):
    """Repository for Task entity operations."""

    def __init__(self):
        super().__init__(Task)

    def get_by_user(
        self,
        db: Session,
        user_id: str = DEFAULT_USER_ID,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Task]:
        """Get tasks for a user.

        Args:
            db: Database session
            user_id: User ID
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            List of tasks
        """
        stmt = select(Task).where(Task.user_id == user_id).order_by(Task.created_at.desc()).offset(skip).limit(limit)
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_by_status(
        self,
        db: Session,
        status: str,
        user_id: str = DEFAULT_USER_ID,
    ) -> list[Task]:
        """Get tasks by status.

        Args:
            db: Database session
            status: Task status (queued, running, complete, etc.)
            user_id: User ID

        Returns:
            List of tasks with the given status
        """
        stmt = select(Task).where(Task.user_id == user_id, Task.status == status).order_by(Task.created_at.desc())
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_by_conversation(self, db: Session, conversation_id: str) -> list[Task]:
        """Get tasks for a conversation.

        Args:
            db: Database session
            conversation_id: Conversation ID

        Returns:
            List of tasks
        """
        stmt = select(Task).where(Task.conversation_id == conversation_id).order_by(Task.created_at.desc())
        result = db.execute(stmt)
        return list(result.scalars().all())

    def create_task(
        self,
        db: Session,
        sequence: str,
        user_id: str = DEFAULT_USER_ID,
        conversation_id: str | None = None,
        task_type: str = "folding",
    ) -> Task:
        """Create a new folding task.

        Args:
            db: Database session
            sequence: Amino acid sequence
            user_id: User ID
            conversation_id: Associated conversation ID
            task_type: Type of task (folding/relaxation)

        Returns:
            Created task
        """
        task_data = {
            "id": generate_id("task"),
            "user_id": user_id,
            "conversation_id": conversation_id,
            "task_type": task_type,
            "status": "queued",
            "stage": "QUEUED",
            "sequence": sequence,
            "file_path": None,
            "created_at": get_timestamp_ms(),
            "completed_at": None,
        }
        return self.create(db, task_data)

    def update_status(
        self,
        db: Session,
        task_id: str,
        status: str,
        stage: str | None = None,
    ) -> Task | None:
        """Update task status.

        Args:
            db: Database session
            task_id: Task ID
            status: New status
            stage: New stage (optional)

        Returns:
            Updated task or None if not found
        """
        task = self.get_by_id(db, task_id)
        if not task:
            return None

        updates = {"status": status}
        if stage:
            updates["stage"] = stage

        # Set completed_at for terminal states
        if status in ("complete", "failed", "canceled"):
            updates["completed_at"] = get_timestamp_ms()

        return self.update(db, task, updates)

    def mark_complete(self, db: Session, task_id: str) -> Task | None:
        """Mark task as complete.

        Args:
            db: Database session
            task_id: Task ID

        Returns:
            Updated task or None if not found
        """
        return self.update_status(db, task_id, status="complete", stage="DONE")

    def mark_failed(self, db: Session, task_id: str) -> Task | None:
        """Mark task as failed.

        Args:
            db: Database session
            task_id: Task ID

        Returns:
            Updated task or None if not found
        """
        return self.update_status(db, task_id, status="failed", stage="ERROR")

    def set_file_path(self, db: Session, task_id: str, file_path: str) -> Task | None:
        """Set task file path.

        Args:
            db: Database session
            task_id: Task ID
            file_path: Path to task output directory

        Returns:
            Updated task or None if not found
        """
        task = self.get_by_id(db, task_id)
        if not task:
            return None
        return self.update(db, task, {"file_path": file_path})


# Singleton instance
task_repository = TaskRepository()
