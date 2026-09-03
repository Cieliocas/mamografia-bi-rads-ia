"""Central, env-driven configuration for the AI sidecar (no extra dependencies).

Kept intentionally dependency-free (plain ``os.getenv``) so the sidecar stays light.
``_load_token`` preserves the exact resolution order used by the Go core.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _load_token() -> str:
    """Shared secret between Go Core and this sidecar.

    Resolution order (mirrors go-core config):
    1. ``AI_SHARED_TOKEN`` env var (CI / Docker / explicit override).
    2. Token file at ``~/.mammo-desktop/.token`` (written by go-core on first run).
    3. Empty string — auth rejects everything until the file exists.
    """
    if t := os.getenv("AI_SHARED_TOKEN", ""):
        return t
    token_file = os.path.join(os.path.expanduser("~"), ".mammo-desktop", ".token")
    try:
        return open(token_file).read().strip()
    except OSError:
        return ""


@dataclass
class Settings:
    """Runtime settings, read fresh from the environment (never cached globally)."""

    shared_token: str = field(default_factory=_load_token)
    model_backend: str = field(default_factory=lambda: os.getenv("MODEL_BACKEND", "mock").lower())
    model_id: str = field(default_factory=lambda: os.getenv("MODEL_ID", "unet-mammo-mock-v1"))

    # Cascade (ONNX) backend
    classifier_onnx: str = field(default_factory=lambda: os.getenv("CLASSIFIER_ONNX", "./models/classifier_hybrid.onnx"))
    detector_onnx: str = field(default_factory=lambda: os.getenv("DETECTOR_ONNX", "./models/detector_yolo.onnx"))
    gate_threshold: float = field(default_factory=lambda: float(os.getenv("GATE_THRESHOLD", "0.11")))
    det_conf: float = field(default_factory=lambda: float(os.getenv("DET_CONF", "0.25")))
    det_imgsz: int = field(default_factory=lambda: int(os.getenv("DET_IMGSZ", "1280")))

    # Legacy Keras U-Net (optional backend)
    model_path: str = field(default_factory=lambda: os.getenv("MODEL_PATH", "./models/unet_mammo_best.keras"))


def get_settings() -> Settings:
    """Build a fresh Settings snapshot from the current environment."""
    return Settings()
