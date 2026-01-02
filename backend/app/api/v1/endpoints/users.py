"""User API endpoints.

Provides user management for future multi-user support.
Currently uses a default user for MVP.

This endpoint layer delegates to the workspace module for business logic.
"""

from fastapi import APIRouter, HTTPException

from app.workspace import (
    User,
    get_current_user,
    get_user,
    update_current_user,
)

router = APIRouter()


@router.get("/me", response_model=User)
async def get_current_user_endpoint() -> User:
    """Get the current user.

    For MVP, returns the default user.
    In future, this will return the authenticated user.

    Returns:
        The current user
    """
    return get_current_user()


@router.get("/{user_id}", response_model=User)
async def get_user_endpoint(user_id: str) -> User:
    """Get a specific user by ID.

    Args:
        user_id: The user ID

    Returns:
        The user

    Raises:
        HTTPException: If user not found
    """
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/me", response_model=User)
async def update_current_user_endpoint(
    name: str | None = None,
    email: str | None = None,
) -> User:
    """Update the current user's profile.

    Args:
        name: New name (optional)
        email: New email (optional)

    Returns:
        The updated user
    """
    return update_current_user(name=name, email=email)
