"""Pydantic schemas for authentication."""

from pydantic import BaseModel, EmailStr, Field


class SendCodeRequest(BaseModel):
    """Request to send verification code."""

    email: EmailStr


class SendCodeResponse(BaseModel):
    """Response after sending verification code."""

    message: str
    code: str | None = None  # Only in dev/test mode for auto-fill


class UserRegister(BaseModel):
    """User registration request."""

    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    verification_code: str = Field(..., min_length=6, max_length=6)


class UserLogin(BaseModel):
    """User login request."""

    email: EmailStr
    password: str


class Token(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """User data response."""

    id: str
    name: str
    username: str | None
    email: str
    plan: str
    onboarding_completed: bool
    created_at: int

    class Config:
        from_attributes = True
