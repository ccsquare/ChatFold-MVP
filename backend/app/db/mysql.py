"""MySQL database connection and session management.

This module provides SQLAlchemy database connection, session management,
and async context managers for database operations.

Usage:
    from app.db.mysql import get_db, engine

    async def my_endpoint(db: Session = Depends(get_db)):
        # Use db session
        result = db.execute(select(UserModel))
"""

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.settings import settings
from app.utils import get_logger

logger = get_logger(__name__)


def _build_database_url() -> str:
    """Build MySQL connection URL from settings.

    Returns:
        MySQL connection URL in SQLAlchemy format
    """
    if settings.database_url:
        # Use explicit database URL if provided
        url = settings.database_url
        # Convert mysql:// to mysql+pymysql:// if needed
        if url.startswith("mysql://"):
            url = url.replace("mysql://", "mysql+pymysql://", 1)
        return url

    # Build URL from individual components (for local development)
    # Default values for local development using Docker
    host = getattr(settings, "mysql_host", "localhost")
    port = getattr(settings, "mysql_port", 3306)
    user = getattr(settings, "mysql_user", "chatfold")
    password = getattr(settings, "mysql_password", "chatfold_dev")
    database = getattr(settings, "mysql_database", "chatfold")

    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"


# Create engine with connection pool
_database_url = _build_database_url()

engine: Engine = create_engine(
    _database_url,
    pool_size=settings.mysql_pool_size,
    max_overflow=settings.mysql_max_overflow,
    pool_pre_ping=settings.mysql_pool_pre_ping,
    pool_recycle=3600,  # Recycle connections after 1 hour
    echo=settings.debug and settings.environment == "local-dev",  # Log SQL in debug mode
)


# Set connection timeout
@event.listens_for(engine, "connect")
def set_connection_timeout(dbapi_connection, connection_record):
    """Set connection timeout for MySQL."""
    cursor = dbapi_connection.cursor()
    cursor.execute("SET SESSION wait_timeout = 28800")  # 8 hours
    cursor.close()


# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    """Get database session for dependency injection.

    Yields:
        Database session

    Example:
        @app.get("/users")
        async def list_users(db: Session = Depends(get_db)):
            return db.query(UserModel).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Get database session as context manager.

    Usage:
        with get_db_session() as db:
            db.execute(select(UserModel))
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def check_connection() -> bool:
    """Check if database connection is working.

    Returns:
        True if connection is successful, False otherwise
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            return True
    except Exception as e:
        logger.error(f"Database connection check failed: {e}")
        return False


def init_db() -> None:
    """Initialize database (create tables if not exist).

    This function should be called during application startup.
    """
    from app.db.models import Base

    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


def close_db() -> None:
    """Close database connections.

    This function should be called during application shutdown.
    """
    engine.dispose()
    logger.info("Database connections closed")
