"""API v1 Router Aggregator.

Aggregates all v1 API endpoints into a single router.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import conversations, folders, health, jobs, structures, users

api_router = APIRouter()

# Mount endpoint routers
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["Conversations"])
api_router.include_router(folders.router, prefix="/folders", tags=["Folders"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
api_router.include_router(structures.router, prefix="/structures", tags=["Structures"])
