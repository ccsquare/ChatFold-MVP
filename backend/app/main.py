"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router as api_v1_router
from app.services.filesystem import filesystem_service
from app.settings import settings
from app.utils.logging import setup_logging

# Initialize logging
logger = setup_logging("chatfold")

app = FastAPI(
    title="ChatFold API",
    description="Python backend for ChatFold protein folding workbench",
    version="0.1.0",
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


@app.on_event("startup")
async def startup_event():
    """Initialize services and log startup message."""
    # Initialize filesystem (creates directories)
    filesystem_service.initialize()

    logger.info("ChatFold API started successfully")


@app.get("/")
async def root():
    """Root endpoint with service info."""
    return {"status": "ok", "service": "ChatFold API", "version": "0.1.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=settings.debug)
