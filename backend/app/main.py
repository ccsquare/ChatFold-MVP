"""FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router as api_v1_router
from app.db.mysql import check_connection as check_db_connection
from app.db.mysql import close_db, init_db
from app.services.filesystem import filesystem_service
from app.settings import settings
from app.utils.logging import setup_logging

# Feature flag for MySQL (disabled by default for backward compatibility)
USE_MYSQL = os.getenv("USE_MYSQL", "false").lower() in ("true", "1", "yes")

# Initialize logging
logger = setup_logging("chatfold")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown events."""
    # Startup
    filesystem_service.initialize()

    if USE_MYSQL:
        if check_db_connection():
            init_db()
            logger.info("MySQL database initialized")
        else:
            logger.warning("MySQL connection failed - running without database persistence")

    logger.info("ChatFold API started successfully")

    yield

    # Shutdown
    if USE_MYSQL:
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
