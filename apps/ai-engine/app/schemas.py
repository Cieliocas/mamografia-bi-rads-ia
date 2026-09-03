"""Wire DTOs for the sidecar HTTP contract.

These field names/types are mirrored by the Go core adapter
(``apps/core/internal/adapters/ai_client/client.go``) — do not rename without
updating both sides.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class PredictRequest(BaseModel):
    image_path: str
    study_id: Optional[str] = None


class BBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class FindingItem(BaseModel):
    id: str
    kind: str
    birads: str
    confidence: float
    bbox: BBox
    notes: str = ""


class FindingResponse(BaseModel):
    task_id: str
    model_id: str
    findings: list[FindingItem]
    elapsed_ms: int
