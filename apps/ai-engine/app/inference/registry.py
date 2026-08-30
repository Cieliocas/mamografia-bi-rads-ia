"""Backend selection. MODEL_BACKEND picks the implementation; falls back to mock
whenever the requested backend cannot load (missing ONNX, missing TF, …) so the
sidecar and its tests always stay functional."""
from __future__ import annotations

import logging

from app.config import Settings
from app.inference.base import InferenceBackend
from app.inference.mock import MockBackend

log = logging.getLogger("ai.inference")


def get_backend(settings: Settings) -> InferenceBackend:
    name = settings.model_backend

    if name == "cascade":
        try:
            from app.inference.cascade import CascadeBackend

            backend = CascadeBackend(settings)
            if backend.is_loaded:
                log.info("inference backend: cascade (%s)", backend.model_id)
                return backend
            log.warning("cascade backend requested but ONNX not loaded — using mock")
        except Exception as exc:  # noqa: BLE001 — never let a bad model kill the sidecar
            log.warning("cascade backend failed to init (%s) — using mock", exc)
        return MockBackend()

    if name == "unet":
        try:
            from app.inference.unet import UNetBackend

            backend = UNetBackend(settings)
            if backend.is_loaded:
                log.info("inference backend: unet")
                return backend
            log.warning("unet backend requested but model not loaded — using mock")
        except Exception as exc:  # noqa: BLE001
            log.warning("unet backend failed to init (%s) — using mock", exc)
        return MockBackend()

    return MockBackend()
