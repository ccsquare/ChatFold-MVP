"""Authentication service for JWT token management and password hashing."""

import logging
from datetime import datetime, timedelta

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.redis_cache import get_redis_cache

logger = logging.getLogger(__name__)

# JWT Configuration
SECRET_KEY = "your-secret-key-change-in-production"  # TODO: Move to settings
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create JWT access token.

    Args:
        data: Payload data to encode (must include 'sub' claim with user ID)
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> str | None:
    """Verify JWT token and return user ID.

    Args:
        token: JWT token string

    Returns:
        User ID if token is valid, None otherwise
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        return user_id
    except JWTError as e:
        logger.warning(f"JWT verification failed: {e}")
        return None


def get_password_hash(password: str) -> str:
    """Hash password using bcrypt.

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash.

    Args:
        plain_password: Plain text password
        hashed_password: Bcrypt hashed password

    Returns:
        True if password matches, False otherwise
    """
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """Authenticate user by email and password.

    Args:
        db: Database session
        email: User email
        password: Plain text password

    Returns:
        User object if authentication successful, None otherwise
    """
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not user.hashed_password:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def get_user_from_cache(db: Session, user_id: str) -> User | None:
    """Get user from Redis cache or database.

    Args:
        db: Database session
        user_id: User ID

    Returns:
        User object if found, None otherwise
    """
    # Try Redis cache first
    cache_key = f"chatfold:user:{user_id}"
    cache = get_redis_cache()

    try:
        cached_user = cache.get(cache_key)
        if cached_user:
            # Deserialize user data
            user = User()
            user.id = cached_user.get("id")
            user.name = cached_user.get("name")
            user.username = cached_user.get("username")
            user.email = cached_user.get("email")
            user.plan = cached_user.get("plan")
            user.onboarding_completed = cached_user.get("onboarding_completed", False)
            user.created_at = cached_user.get("created_at")
            user.updated_at = cached_user.get("updated_at")
            return user
    except Exception as e:
        logger.warning(f"Redis cache get error: {e}, falling back to database")

    # Fallback to database
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        # Cache user data for 15 minutes
        try:
            user_data = {
                "id": user.id,
                "name": user.name,
                "username": user.username,
                "email": user.email,
                "plan": user.plan,
                "onboarding_completed": user.onboarding_completed,
                "created_at": user.created_at,
                "updated_at": user.updated_at,
            }
            cache.set(cache_key, user_data, expire_seconds=900)  # 15 minutes
        except Exception as e:
            logger.warning(f"Redis cache set error: {e}")

    return user
