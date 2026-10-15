"""FastAPI dependencies for session validation and rate limiting."""

import re
from typing import Optional
from fastapi import Header, HTTPException, Request, status

from ..config import get_settings
from ..utils.rate_limiter import RateLimiter

settings = get_settings()

upload_limiter = RateLimiter(
    hourly_limit_per_ip=settings.uploads_per_hour,
    daily_limit=settings.daily_uploads,
    scope_name="upload",
)

ask_limiter = RateLimiter(
    hourly_limit_per_ip=settings.questions_per_hour,
    daily_limit=settings.daily_questions,
    scope_name="question",
)

SESSION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9-]{8,64}$")


def get_client_ip(request: Request) -> str:
    """Extracts client IP, respecting proxy forwarding."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


async def require_session(x_session_id: Optional[str] = Header(default=None)) -> str:
    """Validates presence and format of the x-session-id header."""
    clean_id = (x_session_id or "").strip()
    if not clean_id or not SESSION_ID_PATTERN.match(clean_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing session. Refresh the page and try again.",
        )
    return clean_id


async def check_upload_limits(request: Request):
    """Checks rate limits for file uploads."""
    ip = get_client_ip(request)
    allowed, msg = await upload_limiter.check(ip)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg)


async def check_ask_limits(request: Request):
    """Checks rate limits for asking questions."""
    ip = get_client_ip(request)
    allowed, msg = await ask_limiter.check(ip)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg)
