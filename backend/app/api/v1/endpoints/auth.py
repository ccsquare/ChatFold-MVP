"""Authentication API endpoints."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.mysql import get_db
from app.db.redis_cache import get_redis_cache
from app.models.auth_schemas import (
    SendCodeRequest,
    SendCodeResponse,
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.repositories.user import user_repository
from app.services.auth_service import (
    create_access_token,
    get_password_hash,
    get_user_from_cache,
    verify_password,
    verify_token,
)
from app.services.email_service import send_verification_code
from app.services.verification_service import verification_service
from app.settings import settings
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


# Optional security for endpoints that can work with or without auth
optional_security = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_security)],
    db: Session = Depends(get_db),
) -> User | None:
    """Get current user if authenticated, None otherwise.

    Use this for endpoints that work both authenticated and unauthenticated.
    """
    if not credentials:
        return None

    token = credentials.credentials
    user_id = verify_token(token)
    if not user_id:
        return None

    return get_user_from_cache(db, user_id)


async def get_current_user_from_token_param(
    token: str | None = None,
    db: Session = Depends(get_db),
) -> User | None:
    """Get current user from token query parameter.

    Use this for SSE endpoints where EventSource can't send headers.
    The token is passed as a query parameter instead.
    """
    if not token:
        return None

    user_id = verify_token(token)
    if not user_id:
        return None

    return get_user_from_cache(db, user_id)


@router.post("/send-verification-code", response_model=SendCodeResponse)
async def send_code(request: Request, body: SendCodeRequest):
    """Send verification code to email."""
    logger.info(f"POST /auth/send-verification-code: email={body.email}")
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
    return SendCodeResponse(message="Verification code sent to your email", code=code if settings.debug else None)


@router.post("/register", response_model=UserResponse)
async def register(body: UserRegister, db: Session = Depends(get_db)):
    """Register a new user."""
    logger.info(f"POST /auth/register: email={body.email}, username={body.username}")
    # Verify verification code
    success, message = verification_service.verify_code(body.email, body.verification_code)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    # Check email uniqueness
    existing_user = user_repository.get_by_email(db, body.email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    # Check username uniqueness
    existing_username = user_repository.get_by_username(db, body.username)
    if existing_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")

    # Hash password
    hashed_password = get_password_hash(body.password)

    # Create user object
    now = get_timestamp_ms()
    user_id = generate_id("user")

    # Create user in MySQL
    user = User(
        id=user_id,
        name=body.username,
        username=body.username,
        email=body.email,
        hashed_password=hashed_password,
        plan="free",
        onboarding_completed=False,
        created_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Write to Redis cache for faster subsequent access
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
    cache.set(f"chatfold:user:{user_id}", user_data, expire_seconds=900)  # 15 min cache

    logger.info(f"New user registered: {body.email}")

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
async def login(body: UserLogin, db: Session = Depends(get_db)):
    """Login user and return JWT token."""
    logger.info(f"POST /auth/login: email={body.email}")

    # Query user from MySQL
    user = user_repository.get_by_email(db, body.email)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(body.password, user.hashed_password or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Write to Redis cache for faster subsequent access
    cache = get_redis_cache()
    user_data = {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "email": user.email,
        "hashed_password": user.hashed_password,
        "plan": user.plan,
        "onboarding_completed": user.onboarding_completed,
        "created_at": user.created_at,
    }
    cache.set(f"chatfold:user:{user.id}", user_data, expire_seconds=900)  # 15 min cache

    # Create access token
    access_token = create_access_token(data={"sub": user.id})

    logger.info(f"User logged in: {body.email}")

    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    logger.info(f"GET /auth/me: user_id={current_user.id}")
    return UserResponse(
        id=current_user.id,
        name=current_user.name,
        username=current_user.username,
        email=current_user.email,
        plan=current_user.plan,
        onboarding_completed=current_user.onboarding_completed,
        created_at=current_user.created_at,
    )
