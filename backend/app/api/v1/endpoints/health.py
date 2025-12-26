"""Health check API endpoint."""

from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
