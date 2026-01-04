"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router as api_v1_router
from app.db.mysql import check_connection as check_db_connection
from app.db.mysql import close_db, init_db
from app.services.filesystem import filesystem_service
from app.settings import settings
from app.utils.logging import setup_logging

# Initialize logging
logger = setup_logging("chatfold")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown events."""
    # Startup
    filesystem_service.initialize()

    # CRITICAL WARNING: Memory store is not safe for multi-instance deployment
    if settings.use_memory_store and settings.environment != "local-dev":
        logger.warning(
            "⚠️  CRITICAL: use_memory_store=true is NOT recommended for non-local environments! "
            "Each instance has its own memory - data will be lost across instances. "
            "Set CHATFOLD_USE_MEMORY_STORE=false for multi-instance deployment."
        )

    # Initialize MySQL when not in memory-only mode
    if not settings.use_memory_store:
        if check_db_connection():
            init_db()
            logger.info("MySQL database initialized")
        else:
            logger.warning("MySQL connection failed - running without database persistence")

    storage_mode = "memory" if settings.use_memory_store else "persistent"
    instance_info = f", instance: {settings.instance_id}" if settings.instance_id != "default" else ""
    logger.info(f"ChatFold API started successfully (storage: {storage_mode}{instance_info})")

    yield

    # Shutdown
    if not settings.use_memory_store:
        close_db()
        logger.info("MySQL connections closed")


app = FastAPI(
    title="ChatFold API",
    description="Python backend for ChatFold protein folding workbench",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API v1 router
app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint with service info."""
    return {"status": "ok", "service": "ChatFold API", "version": "0.1.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=settings.debug)
