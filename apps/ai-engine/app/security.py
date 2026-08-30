"""Shared-token auth for the loopback sidecar (X-Local-Token header)."""
from __future__ import annotations

from fastapi import Header, HTTPException

from app.config import get_settings


def require_token(x_local_token: str | None = Header(default=None)) -> None:
    """FastAPI dependency: reject requests whose token != the shared secret."""
    if x_local_token != get_settings().shared_token:
        raise HTTPException(status_code=401, detail="invalid local token")
