"""User API endpoints.

Provides user management for future multi-user support.
Currently uses a default user for MVP.
"""

import time
import uuid

from fastapi import APIRouter, HTTPException

from app.models.schemas import User, UserPlan

router = APIRouter()

# Default user for MVP (single-user mode)
DEFAULT_USER = User(
    id="user_default",
    name="user",
    email="user@simplex.com",
    plan=UserPlan.free,
    createdAt=int(time.time() * 1000),
)

# In-memory storage (for MVP, replace with database later)
users_db: dict[str, User] = {DEFAULT_USER.id: DEFAULT_USER}


def generate_user_id() -> str:
    """Generate a unique user ID."""
    return f"user_{uuid.uuid4().hex[:12]}"


@router.get("/me", response_model=User)
async def get_current_user() -> User:
    """Get the current user.

    For MVP, returns the default user.
    In future, this will return the authenticated user.

    Returns:
        The current user
    """
    return DEFAULT_USER


@router.get("/{user_id}", response_model=User)
async def get_user(user_id: str) -> User:
    """Get a specific user by ID.

    Args:
        user_id: The user ID

    Returns:
        The user

    Raises:
        HTTPException: If user not found
    """
    user = users_db.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/me", response_model=User)
async def update_current_user(name: str | None = None, email: str | None = None) -> User:
    """Update the current user's profile.

    Args:
        name: New name (optional)
        email: New email (optional)

    Returns:
        The updated user
    """
    if name is not None:
        DEFAULT_USER.name = name
    if email is not None:
        DEFAULT_USER.email = email

    return DEFAULT_USER
