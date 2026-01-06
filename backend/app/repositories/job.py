"""Job repository for database operations."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Job
from app.repositories.base import BaseRepository
from app.settings import DEFAULT_USER_ID
from app.utils import generate_id, get_timestamp_ms


class JobRepository(BaseRepository[Job]):
    """Repository for Job entity operations."""

    def __init__(self):
        super().__init__(Job)

    def get_by_user(
        self,
        db: Session,
        user_id: str = DEFAULT_USER_ID,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Job]:
        """Get jobs for a user.

        Args:
            db: Database session
            user_id: User ID
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            List of jobs
        """
        stmt = select(Job).where(Job.user_id == user_id).order_by(Job.created_at.desc()).offset(skip).limit(limit)
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_by_status(
        self,
        db: Session,
        status: str,
        user_id: str = DEFAULT_USER_ID,
    ) -> list[Job]:
        """Get jobs by status.

        Args:
            db: Database session
            status: Job status (queued, running, complete, etc.)
            user_id: User ID

        Returns:
            List of jobs with the given status
        """
        stmt = select(Job).where(Job.user_id == user_id, Job.status == status).order_by(Job.created_at.desc())
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_by_conversation(self, db: Session, conversation_id: str) -> list[Job]:
        """Get jobs for a conversation.

        Args:
            db: Database session
            conversation_id: Conversation ID

        Returns:
            List of jobs
        """
        stmt = select(Job).where(Job.conversation_id == conversation_id).order_by(Job.created_at.desc())
        result = db.execute(stmt)
        return list(result.scalars().all())

    def create_job(
        self,
        db: Session,
        sequence: str,
        user_id: str = DEFAULT_USER_ID,
        conversation_id: str | None = None,
        job_type: str = "folding",
    ) -> Job:
        """Create a new folding job.

        Args:
            db: Database session
            sequence: Amino acid sequence
            user_id: User ID
            conversation_id: Associated conversation ID
            job_type: Type of job (folding/relaxation)

        Returns:
            Created job
        """
        job_data = {
            "id": generate_id("job"),
            "user_id": user_id,
            "conversation_id": conversation_id,
            "job_type": job_type,
            "status": "queued",
            "stage": "QUEUED",
            "sequence": sequence,
            "file_path": None,
            "created_at": get_timestamp_ms(),
            "completed_at": None,
        }
        return self.create(db, job_data)

    def update_status(
        self,
        db: Session,
        job_id: str,
        status: str,
        stage: str | None = None,
    ) -> Job | None:
        """Update job status.

        Args:
            db: Database session
            job_id: Job ID
            status: New status
            stage: New stage (optional)

        Returns:
            Updated job or None if not found
        """
        job = self.get_by_id(db, job_id)
        if not job:
            return None

        updates = {"status": status}
        if stage:
            updates["stage"] = stage

        # Set completed_at for terminal states
        if status in ("complete", "failed", "canceled"):
            updates["completed_at"] = get_timestamp_ms()

        return self.update(db, job, updates)

    def mark_complete(self, db: Session, job_id: str) -> Job | None:
        """Mark job as complete.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            Updated job or None if not found
        """
        return self.update_status(db, job_id, status="complete", stage="DONE")

    def mark_failed(self, db: Session, job_id: str) -> Job | None:
        """Mark job as failed.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            Updated job or None if not found
        """
        return self.update_status(db, job_id, status="failed", stage="ERROR")

    def set_file_path(self, db: Session, job_id: str, file_path: str) -> Job | None:
        """Set job file path.

        Args:
            db: Database session
            job_id: Job ID
            file_path: Path to job output directory

        Returns:
            Updated job or None if not found
        """
        job = self.get_by_id(db, job_id)
        if not job:
            return None
        return self.update(db, job, {"file_path": file_path})


# Singleton instance
job_repository = JobRepository()
