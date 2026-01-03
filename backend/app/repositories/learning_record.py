"""LearningRecord repository for database operations.

Handles aggregated learning data from completed NanoCC jobs.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import LearningRecord
from app.repositories.base import BaseRepository
from app.utils import generate_id, get_timestamp_ms


class LearningRecordRepository(BaseRepository[LearningRecord]):
    """Repository for LearningRecord entity operations."""

    def __init__(self):
        super().__init__(LearningRecord)

    def get_by_job(self, db: Session, job_id: str) -> LearningRecord | None:
        """Get learning record for a job.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            Learning record or None if not found
        """
        stmt = select(LearningRecord).where(LearningRecord.job_id == job_id)
        result = db.execute(stmt)
        return result.scalar_one_or_none()

    def get_unexported(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LearningRecord]:
        """Get learning records that haven't been exported.

        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            List of unexported learning records
        """
        stmt = (
            select(LearningRecord)
            .where(LearningRecord.exported_at.is_(None))
            .order_by(LearningRecord.created_at.asc())
            .offset(skip)
            .limit(limit)
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_with_feedback(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LearningRecord]:
        """Get learning records with user feedback.

        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            List of learning records with user feedback
        """
        stmt = (
            select(LearningRecord)
            .where(
                (LearningRecord.user_rating.isnot(None))
                | (LearningRecord.user_selected_structure_id.isnot(None))
            )
            .order_by(LearningRecord.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_by_export_batch(
        self,
        db: Session,
        export_batch_id: str,
    ) -> list[LearningRecord]:
        """Get learning records from a specific export batch.

        Args:
            db: Database session
            export_batch_id: Export batch ID

        Returns:
            List of learning records from the batch
        """
        stmt = (
            select(LearningRecord)
            .where(LearningRecord.export_batch_id == export_batch_id)
            .order_by(LearningRecord.created_at.asc())
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def count_unexported(self, db: Session) -> int:
        """Count unexported learning records.

        Args:
            db: Database session

        Returns:
            Number of unexported records
        """
        stmt = (
            select(func.count())
            .select_from(LearningRecord)
            .where(LearningRecord.exported_at.is_(None))
        )
        result = db.execute(stmt)
        return result.scalar() or 0

    def create_record(
        self,
        db: Session,
        job_id: str,
        input_sequence: str,
        thinking_block_count: int = 0,
        structure_count: int = 0,
        input_constraints: str | None = None,
        final_structure_id: str | None = None,
        final_plddt: int | None = None,
    ) -> LearningRecord:
        """Create a new learning record from completed job.

        Args:
            db: Database session
            job_id: Parent job ID
            input_sequence: Input amino acid sequence
            thinking_block_count: Number of thinking blocks generated
            structure_count: Number of structures generated
            input_constraints: Optional constraints/annotations
            final_structure_id: ID of the final structure
            final_plddt: pLDDT score of the final structure

        Returns:
            Created learning record
        """
        record_data = {
            "id": generate_id("lrn"),
            "job_id": job_id,
            "input_sequence": input_sequence,
            "input_constraints": input_constraints,
            "thinking_block_count": thinking_block_count,
            "structure_count": structure_count,
            "final_structure_id": final_structure_id,
            "final_plddt": final_plddt,
            "created_at": get_timestamp_ms(),
        }
        return self.create(db, record_data)

    def add_user_feedback(
        self,
        db: Session,
        record_id: str,
        user_rating: int | None = None,
        user_feedback: str | None = None,
        user_selected_structure_id: str | None = None,
    ) -> LearningRecord | None:
        """Add user feedback to a learning record.

        Args:
            db: Database session
            record_id: Learning record ID
            user_rating: User satisfaction rating (1-5)
            user_feedback: Free-form feedback text
            user_selected_structure_id: User's preferred structure ID

        Returns:
            Updated learning record or None if not found
        """
        record = self.get_by_id(db, record_id)
        if not record:
            return None

        updates = {}
        if user_rating is not None:
            updates["user_rating"] = user_rating
        if user_feedback is not None:
            updates["user_feedback"] = user_feedback
        if user_selected_structure_id is not None:
            updates["user_selected_structure_id"] = user_selected_structure_id

        if updates:
            return self.update(db, record, updates)
        return record

    def mark_exported(
        self,
        db: Session,
        record_ids: list[str],
        export_batch_id: str,
    ) -> int:
        """Mark learning records as exported.

        Args:
            db: Database session
            record_ids: List of record IDs to mark
            export_batch_id: ID of the export batch

        Returns:
            Number of records marked
        """
        count = 0
        exported_at = get_timestamp_ms()
        for record_id in record_ids:
            record = self.get_by_id(db, record_id)
            if record:
                self.update(
                    db,
                    record,
                    {
                        "exported_at": exported_at,
                        "export_batch_id": export_batch_id,
                    },
                )
                count += 1
        return count


# Singleton instance
learning_record_repository = LearningRecordRepository()
