"""Base repository class with common CRUD operations.

Provides generic CRUD operations that can be inherited by specific repositories.
"""

from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """Base repository with common CRUD operations."""

    def __init__(self, model: type[ModelType]):
        """Initialize repository with model class.

        Args:
            model: SQLAlchemy model class
        """
        self.model = model

    def get_by_id(self, db: Session, id: str) -> ModelType | None:
        """Get entity by ID.

        Args:
            db: Database session
            id: Entity ID

        Returns:
            Entity or None if not found
        """
        return db.get(self.model, id)

    def get_all(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 100,
    ) -> list[ModelType]:
        """Get all entities with pagination.

        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            List of entities
        """
        stmt = select(self.model).offset(skip).limit(limit)
        result = db.execute(stmt)
        return list(result.scalars().all())

    def create(self, db: Session, obj_in: dict[str, Any]) -> ModelType:
        """Create a new entity.

        Args:
            db: Database session
            obj_in: Entity data as dict

        Returns:
            Created entity
        """
        db_obj = self.model(**obj_in)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self,
        db: Session,
        db_obj: ModelType,
        obj_in: dict[str, Any],
    ) -> ModelType:
        """Update an existing entity.

        Args:
            db: Database session
            db_obj: Existing entity
            obj_in: Updated data as dict

        Returns:
            Updated entity
        """
        for field, value in obj_in.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def delete(self, db: Session, id: str) -> bool:
        """Delete an entity by ID.

        Args:
            db: Database session
            id: Entity ID

        Returns:
            True if deleted, False if not found
        """
        obj = db.get(self.model, id)
        if obj:
            db.delete(obj)
            db.commit()
            return True
        return False

    def exists(self, db: Session, id: str) -> bool:
        """Check if entity exists.

        Args:
            db: Database session
            id: Entity ID

        Returns:
            True if exists
        """
        return db.get(self.model, id) is not None
