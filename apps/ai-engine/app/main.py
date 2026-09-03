"""AIdentify AI Sidecar — FastAPI composition root.

Assembles the app from ``app.config`` / ``app.routers`` / ``app.inference``.
Launched by the Go core as ``python -m uvicorn app.main:app`` — this module must
keep exposing ``app``. Kept thin on purpose; logic lives in the sub-modules.

Endpoints
---------
GET  /health          liveness + model status
POST /predict         JSON {"image_path": str}  → FindingResponse
POST /predict-upload  multipart UploadFile       → FindingResponse (dev/UI)
"""
from __future__ import annotations

import time

from fastapi import FastAPI

# _load_token is re-exported for backwards-compat and the test-suite.
from app.config import _load_token, get_settings  # noqa: F401
from app.inference.registry import get_backend
from app.routers import health, predict

__all__ = ["app", "build_app", "_load_token"]


def build_app() -> FastAPI:
    """Build a fresh app instance (env is read here, so re-import re-configures)."""
    settings = get_settings()
    app = FastAPI(title="Mammo AI Sidecar", version="0.3.0")
    app.state.settings = settings
    app.state.started_at = time.time()
    app.state.backend = get_backend(settings)
    app.include_router(health.router)
    app.include_router(predict.router)
    return app


app = build_app()
