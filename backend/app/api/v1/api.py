"""API v1 Router Aggregator.

Aggregates all v1 API endpoints into a single router.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import conversations, health, structures, tasks

api_router = APIRouter()

# Mount endpoint routers
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["Conversations"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
api_router.include_router(structures.router, prefix="/structures", tags=["Structures"])
