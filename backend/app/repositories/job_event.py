"""JobEvent repository for database operations.

Handles persistence of SSE events from NanoCC job execution.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import JobEvent
from app.repositories.base import BaseRepository
from app.utils import generate_id, get_timestamp_ms


class JobEventRepository(BaseRepository[JobEvent]):
    """Repository for JobEvent entity operations."""

    def __init__(self):
        super().__init__(JobEvent)

    def get_by_job(
        self,
        db: Session,
        job_id: str,
        skip: int = 0,
        limit: int = 1000,
    ) -> list[JobEvent]:
        """Get all events for a job, ordered by creation time.

        Args:
            db: Database session
            job_id: Job ID
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            List of job events
        """
        stmt = (
            select(JobEvent)
            .where(JobEvent.job_id == job_id)
            .order_by(JobEvent.created_at.asc())
            .offset(skip)
            .limit(limit)
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_by_event_type(
        self,
        db: Session,
        job_id: str,
        event_type: str,
    ) -> list[JobEvent]:
        """Get events of a specific type for a job.

        Args:
            db: Database session
            job_id: Job ID
            event_type: Event type (PROLOGUE, THINKING_TEXT, etc.)

        Returns:
            List of job events
        """
        stmt = (
            select(JobEvent)
            .where(JobEvent.job_id == job_id, JobEvent.event_type == event_type)
            .order_by(JobEvent.created_at.asc())
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_thinking_blocks(self, db: Session, job_id: str) -> list[JobEvent]:
        """Get all thinking events (THINKING_TEXT and THINKING_PDB) for a job.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            List of thinking events
        """
        stmt = (
            select(JobEvent)
            .where(
                JobEvent.job_id == job_id,
                JobEvent.event_type.in_(["THINKING_TEXT", "THINKING_PDB"]),
            )
            .order_by(JobEvent.created_at.asc())
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def count_by_job(self, db: Session, job_id: str) -> int:
        """Count events for a job.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            Number of events
        """
        stmt = select(func.count()).select_from(JobEvent).where(JobEvent.job_id == job_id)
        result = db.execute(stmt)
        return result.scalar() or 0

    def count_thinking_blocks(self, db: Session, job_id: str) -> int:
        """Count unique thinking block indices for a job.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            Number of thinking blocks
        """
        stmt = (
            select(func.count(func.distinct(JobEvent.block_index)))
            .select_from(JobEvent)
            .where(
                JobEvent.job_id == job_id,
                JobEvent.block_index.isnot(None),
            )
        )
        result = db.execute(stmt)
        return result.scalar() or 0

    def create_event(
        self,
        db: Session,
        job_id: str,
        event_type: str,
        stage: str,
        status: str,
        progress: int = 0,
        message: str | None = None,
        block_index: int | None = None,
        structure_id: str | None = None,
    ) -> JobEvent:
        """Create a new job event record.

        Args:
            db: Database session
            job_id: Parent job ID
            event_type: Event type (PROLOGUE, THINKING_TEXT, etc.)
            stage: Job stage (MSA, MODEL, etc.)
            status: Job status (running, partial, etc.)
            progress: Progress percentage (0-100)
            message: Event message content
            block_index: Thinking block index for grouping
            structure_id: Associated structure ID (for THINKING_PDB)

        Returns:
            Created job event
        """
        event_data = {
            "id": generate_id("evt"),
            "job_id": job_id,
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

    def bulk_create(self, db: Session, events: list[dict]) -> list[JobEvent]:
        """Bulk create job events.

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
            db_event = JobEvent(**event)
            db.add(db_event)
            db_events.append(db_event)
        db.commit()
        for event in db_events:
            db.refresh(event)
        return db_events

    def delete_by_job(self, db: Session, job_id: str) -> int:
        """Delete all events for a job.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            Number of deleted events
        """
        events = self.get_by_job(db, job_id, limit=10000)
        count = len(events)
        for event in events:
            db.delete(event)
        db.commit()
        return count


# Singleton instance
job_event_repository = JobEventRepository()
