"""Liveness + model status."""
from __future__ import annotations

import time

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
def health(request: Request) -> dict:
    st = request.app.state
    body = {
        "status": "ok",
        "uptime_sec": int(time.time() - st.started_at),
        "model_loaded": bool(st.backend.is_loaded),
        "model_id": getattr(st.backend, "model_id", ""),
    }
    # Sem modelo real, dizer POR QUE: a interface precisa instruir quem opera,
    # não apenas informar que está em modo simulado.
    if not st.backend.is_loaded:
        body["reason"] = getattr(st.backend, "reason", "Nenhum modelo carregado.")
    return body
