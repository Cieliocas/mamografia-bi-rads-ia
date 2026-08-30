"""Inference backend contract. New models (ONNX, Keras, …) just implement this."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np

from app.schemas import FindingItem


@runtime_checkable
class InferenceBackend(Protocol):
    """A backend turns a grayscale image into a list of findings."""

    #: Identifier reported in FindingResponse.model_id.
    model_id: str

    @property
    def is_loaded(self) -> bool:
        """True when real model weights are loaded (False for mock / missing artifacts)."""
        ...

    def infer(self, image: np.ndarray) -> list[FindingItem]:
        """Run inference on an HxW (grayscale) uint8 image."""
        ...
