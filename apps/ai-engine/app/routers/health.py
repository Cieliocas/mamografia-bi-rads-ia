"""Liveness + model status."""
from __future__ import annotations

import time

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
def health(request: Request) -> dict:
    st = request.app.state
    return {
        "status": "ok",
        "uptime_sec": int(time.time() - st.started_at),
        "model_loaded": bool(st.backend.is_loaded),
    }
