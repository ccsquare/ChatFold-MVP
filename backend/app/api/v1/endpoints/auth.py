"""Authentication API endpoints."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.mysql import get_db
from app.models.auth_schemas import (
    SendCodeRequest,
    SendCodeResponse,
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.auth_service import (
    create_access_token,
    get_password_hash,
    get_user_from_cache,
    verify_token,
)
from app.services.email_service import send_verification_code
from app.services.verification_service import verification_service
from app.utils.id_generator import generate_id
from app.utils.time_utils import get_timestamp_ms

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()


def get_client_ip(request: Request) -> str:
    """Get client IP address from request."""
    # Check for proxy headers first
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # Fallback to direct client
    if request.client:
        return request.client.host

    return "unknown"


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Session = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT token."""
    token = credentials.credentials

    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = get_user_from_cache(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


@router.post("/send-verification-code", response_model=SendCodeResponse)
async def send_code(request: Request, body: SendCodeRequest):
    """Send verification code to email."""
    email = body.email
    client_ip = get_client_ip(request)

    # Note: Email uniqueness check will be performed during registration

    # Generate and send code
    success, result = verification_service.send_code(email, client_ip)

    if not success:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=result)

    # Send email
    code = result
    email_sent = send_verification_code(email, code)

    if not email_sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email. Please try again later",
        )

    # In debug/test mode, return the code for auto-fill
    from app.settings import settings

    return SendCodeResponse(
        message="Verification code sent to your email", code=code if settings.debug else None
    )


@router.post("/register", response_model=UserResponse)
async def register(body: UserRegister):
    """Register a new user."""
    # Verify verification code
    success, message = verification_service.verify_code(body.email, body.verification_code)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    # Note: In memory store mode, we skip DB persistence
    # Email and username uniqueness will be enforced when DB is available

    # Hash password
    hashed_password = get_password_hash(body.password)

    # Create user object
    now = get_timestamp_ms()
    user_id = generate_id("user")

    # Store user in Redis cache for authentication in memory mode
    from app.db.redis_cache import get_redis_cache

    cache = get_redis_cache()
    user_data = {
        "id": user_id,
        "name": body.username,
        "username": body.username,
        "email": body.email,
        "hashed_password": hashed_password,
        "plan": "free",
        "onboarding_completed": False,
        "created_at": now,
    }
    # Store by email for login lookup
    cache.set(f"chatfold:user:email:{body.email}", user_data, expire_seconds=86400)  # 24 hours
    # Store by user_id for token verification
    cache.set(f"chatfold:user:{user_id}", user_data, expire_seconds=86400)  # 24 hours

    logger.info(f"New user registered (memory mode): {body.email}")

    return UserResponse(
        id=user_id,
        name=body.username,
        username=body.username,
        email=body.email,
        plan="free",
        onboarding_completed=False,
        created_at=now,
    )


@router.post("/login", response_model=Token)
async def login(body: UserLogin):
    """Login user and return JWT token."""
    from app.db.redis_cache import get_redis_cache
    from app.services.auth_service import verify_password

    # In memory mode, check Redis cache for user
    cache = get_redis_cache()
    user_data = cache.get(f"chatfold:user:email:{body.email}")

    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(body.password, user_data.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create access token
    access_token = create_access_token(data={"sub": user_data["id"]})

    logger.info(f"User logged in (memory mode): {body.email}")

    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return UserResponse(
        id=current_user.id,
        name=current_user.name,
        username=current_user.username,
        email=current_user.email,
        plan=current_user.plan,
        onboarding_completed=current_user.onboarding_completed,
        created_at=current_user.created_at,
    )
