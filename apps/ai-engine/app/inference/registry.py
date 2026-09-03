"""Backend selection. MODEL_BACKEND picks the implementation; falls back to mock
whenever the requested backend cannot load (missing ONNX, missing TF, …) so the
sidecar and its tests always stay functional."""
from __future__ import annotations

import logging
import os

from app.config import Settings
from app.inference.base import InferenceBackend
from app.inference.mock import MockBackend

log = logging.getLogger("ai.inference")


def _cascade_reason(settings: Settings) -> str:
    """Explica, em português e sem jargão, por que a cascata não carregou.

    Uma interface que diz apenas "modo simulado" deixa quem vai demonstrar sem
    saber o que fazer. O motivo concreto é o que transforma o alerta em ação.
    """
    faltando = [
        nome for nome, caminho in (
            ("classificador", settings.classifier_onnx),
            ("detector", settings.detector_onnx),
        ) if not os.path.exists(caminho)
    ]
    if faltando:
        return f"Modelo não encontrado: {' e '.join(faltando)}."
    try:
        import onnxruntime  # noqa: F401
    except Exception:
        return "onnxruntime não está instalado no ambiente do serviço."
    return "Os modelos existem, mas não puderam ser carregados."


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
            return MockBackend(reason=_cascade_reason(settings))
        except Exception as exc:  # noqa: BLE001 — never let a bad model kill the sidecar
            log.warning("cascade backend failed to init (%s) — using mock", exc)
            return MockBackend(reason=f"Falha ao iniciar a cascata: {exc}")

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
        return MockBackend(reason="Modelo U-Net não carregado.")

    return MockBackend(reason="MODEL_BACKEND não está definido como 'cascade'.")
