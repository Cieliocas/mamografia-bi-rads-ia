"""Mock backend: two synthetic findings. Default when no real model is present."""
from __future__ import annotations

import uuid

import numpy as np

from app.schemas import BBox, FindingItem


class MockBackend:
    """Deterministic-shape mock used in dev/CI (model_loaded stays False)."""

    model_id = "unet-mammo-mock-v1"
    is_loaded = False

    def infer(self, image: np.ndarray) -> list[FindingItem]:
        h, w = image.shape[:2]
        return [
            FindingItem(
                id=str(uuid.uuid4()),
                kind="mass",
                birads="3",
                confidence=0.61,
                bbox=BBox(x=w * 0.3, y=h * 0.3, w=w * 0.15, h=h * 0.15),
                notes="Mock — model not loaded",
            ),
            FindingItem(
                id=str(uuid.uuid4()),
                kind="calcification",
                birads="2",
                confidence=0.88,
                bbox=BBox(x=w * 0.6, y=h * 0.5, w=w * 0.08, h=h * 0.08),
                notes="Mock — model not loaded",
            ),
        ]
