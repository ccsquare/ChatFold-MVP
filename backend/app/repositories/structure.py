"""Structure repository for database operations."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Structure
from app.repositories.base import BaseRepository
from app.settings import DEFAULT_PROJECT_ID, DEFAULT_USER_ID
from app.utils import generate_id, get_timestamp_ms


class StructureRepository(BaseRepository[Structure]):
    """Repository for Structure entity operations."""

    def __init__(self):
        super().__init__(Structure)

    def get_by_job(self, db: Session, job_id: str) -> list[Structure]:
        """Get structures for a job.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            List of structures
        """
        stmt = select(Structure).where(Structure.job_id == job_id).order_by(Structure.created_at.asc())
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_by_user_project(
        self,
        db: Session,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Structure]:
        """Get structures for a user's project.

        Args:
            db: Database session
            user_id: User ID
            project_id: Project ID
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            List of structures
        """
        stmt = (
            select(Structure)
            .where(
                Structure.user_id == user_id,
                Structure.project_id == project_id,
            )
            .order_by(Structure.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = db.execute(stmt)
        return list(result.scalars().all())

    def get_final_by_job(self, db: Session, job_id: str) -> Structure | None:
        """Get the final structure for a job.

        Args:
            db: Database session
            job_id: Job ID

        Returns:
            Final structure or None
        """
        stmt = select(Structure).where(
            Structure.job_id == job_id,
            Structure.is_final == True,  # noqa: E712
        )
        result = db.execute(stmt)
        return result.scalar_one_or_none()

    def create_structure(
        self,
        db: Session,
        job_id: str,
        label: str,
        filename: str,
        file_path: str,
        user_id: str = DEFAULT_USER_ID,
        project_id: str = DEFAULT_PROJECT_ID,
        plddt_score: int | None = None,
        is_final: bool = False,
    ) -> Structure:
        """Create a new structure record.

        Args:
            db: Database session
            job_id: Parent job ID
            label: Structure label (candidate-1, final, etc.)
            filename: PDB filename
            file_path: Full path to PDB file
            user_id: User ID
            project_id: Project ID
            plddt_score: Quality score (0-100)
            is_final: Whether this is the final structure

        Returns:
            Created structure
        """
        structure_data = {
            "id": generate_id("str"),
            "job_id": job_id,
            "user_id": user_id,
            "project_id": project_id,
            "label": label,
            "filename": filename,
            "file_path": file_path,
            "plddt_score": plddt_score,
            "is_final": is_final,
            "created_at": get_timestamp_ms(),
        }
        return self.create(db, structure_data)

    def mark_as_final(self, db: Session, structure_id: str) -> Structure | None:
        """Mark a structure as the final result.

        Args:
            db: Database session
            structure_id: Structure ID

        Returns:
            Updated structure or None if not found
        """
        structure = self.get_by_id(db, structure_id)
        if not structure:
            return None
        return self.update(db, structure, {"is_final": True})

    def update_plddt_score(
        self,
        db: Session,
        structure_id: str,
        plddt_score: int,
    ) -> Structure | None:
        """Update structure pLDDT score.

        Args:
            db: Database session
            structure_id: Structure ID
            plddt_score: Quality score (0-100)

        Returns:
            Updated structure or None if not found
        """
        structure = self.get_by_id(db, structure_id)
        if not structure:
            return None
        return self.update(db, structure, {"plddt_score": plddt_score})


# Singleton instance
structure_repository = StructureRepository()
