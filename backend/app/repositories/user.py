"""User repository for database operations."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import UserModel
from app.repositories.base import BaseRepository
from app.settings import DEFAULT_USER_ID
from app.utils import generate_id, get_timestamp_ms


class UserRepository(BaseRepository[UserModel]):
    """Repository for User entity operations."""

    def __init__(self):
        super().__init__(UserModel)

    def get_by_email(self, db: Session, email: str) -> UserModel | None:
        """Get user by email.

        Args:
            db: Database session
            email: User email

        Returns:
            User or None if not found
        """
        stmt = select(UserModel).where(UserModel.email == email)
        result = db.execute(stmt)
        return result.scalar_one_or_none()

    def get_or_create_default(self, db: Session) -> UserModel:
        """Get or create the default user (for MVP).

        Args:
            db: Database session

        Returns:
            Default user
        """
        user = self.get_by_id(db, DEFAULT_USER_ID)
        if user:
            return user

        # Create default user
        user_data = {
            "id": DEFAULT_USER_ID,
            "name": "Default User",
            "email": "user@chatfold.ai",
            "plan": "free",
            "created_at": get_timestamp_ms(),
        }
        return self.create(db, user_data)

    def create_user(
        self,
        db: Session,
        name: str,
        email: str,
        plan: str = "free",
    ) -> UserModel:
        """Create a new user.

        Args:
            db: Database session
            name: User name
            email: User email
            plan: Subscription plan (free/pro)

        Returns:
            Created user
        """
        user_data = {
            "id": generate_id("user"),
            "name": name,
            "email": email,
            "plan": plan,
            "created_at": get_timestamp_ms(),
        }
        return self.create(db, user_data)


# Singleton instance
user_repository = UserRepository()
