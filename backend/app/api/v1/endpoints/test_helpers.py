"""Test helper endpoints (only available in development/test mode)"""

import json

from fastapi import APIRouter, HTTPException

from app.db.redis_cache import get_redis_cache
from app.settings import settings

router = APIRouter()


@router.get("/verification-code")
async def get_verification_code(email: str) -> dict:
    """
    Get verification code for an email (TEST ONLY)

    This endpoint should ONLY be available in development/test environments.
    In production, this would be a security vulnerability.

    Args:
        email: Email address to get verification code for

    Returns:
        Dictionary with the verification code

    Raises:
        HTTPException: If not in development mode or code not found
    """
    # Only allow in development/test mode
    if not settings.debug:
        raise HTTPException(status_code=404, detail="Endpoint not available in production")

    cache = get_redis_cache()
    # Use the same key format as verification_service
    code_key = f"chatfold:verification:code:{email}"
    code_data_str = cache.client.get(code_key)

    if code_data_str is None:
        raise HTTPException(status_code=404, detail=f"No verification code found for {email}")

    code_data = json.loads(code_data_str)

    return {"email": email, "code": code_data.get("code"), "expires_at": code_data.get("expires_at")}
