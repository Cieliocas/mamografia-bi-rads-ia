"""AIdentify AI Sidecar — FastAPI server.

Endpoints
---------
GET  /health          liveness + model status
POST /predict         JSON body {"image_path": str}  → FindingResponse
POST /predict-upload  multipart UploadFile           → FindingResponse (dev/UI)
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Header, UploadFile
from pydantic import BaseModel

try:
    import tensorflow as tf  # type: ignore
except Exception:
    tf = None


# ── DTOs ─────────────────────────────────────────────────────────────────────

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


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Mammo AI Sidecar", version="0.2.0")
MODEL_PATH = os.getenv("MODEL_PATH", "./models/unet_mammo_best.keras")
MODEL = None
STARTED_AT = time.time()
SHARED_TOKEN = os.getenv("AI_SHARED_TOKEN", "mammo-local-token")
MODEL_ID = os.getenv("MODEL_ID", "unet-mammo-mock-v1")


def load_model() -> Optional[object]:
    if tf is None:
        return None
    if not os.path.exists(MODEL_PATH):
        return None
    return tf.keras.models.load_model(MODEL_PATH, compile=False)


@app.on_event("startup")
def startup_event() -> None:
    global MODEL
    MODEL = load_model()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "uptime_sec": int(time.time() - STARTED_AT),
        "model_loaded": MODEL is not None,
    }


def _run_inference(image: np.ndarray) -> list[FindingItem]:
    """Run model or return mock findings."""
    resized = cv2.resize(image, (256, 256)).astype(np.float32) / 255.0
    model_input = np.expand_dims(resized, axis=(0, -1))

    if MODEL is not None:
        pred = MODEL.predict(model_input, verbose=0)
        mask = (pred > 0.5).astype(np.uint8)[0, :, :, 0]
        ys, xs = np.where(mask > 0)
        if len(xs) == 0:
            return []
        x0, y0 = int(xs.min()), int(ys.min())
        x1, y1 = int(xs.max()), int(ys.max())
        return [FindingItem(
            id=str(uuid.uuid4()),
            kind="mass",
            birads="4A",
            confidence=0.72,
            bbox=BBox(x=x0, y=y0, w=x1 - x0, h=y1 - y0),
            notes="Detected by UNet model",
        )]

    # ── Mock: two synthetic findings for dev/testing ──────────────────────────
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


def _check_token(token: str | None) -> None:
    if token != SHARED_TOKEN:
        raise HTTPException(status_code=401, detail="invalid local token")


# ── POST /predict  (JSON — used by Go Core) ───────────────────────────────────

@app.post("/predict", response_model=FindingResponse)
def predict_json(
    body: PredictRequest,
    x_local_token: str | None = Header(default=None),
) -> FindingResponse:
    _check_token(x_local_token)
    started = time.time()

    # Load image from filesystem path.
    image = cv2.imread(body.image_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        # Path may not be a real DICOM in dev mode — return mock findings.
        image = np.zeros((512, 512), dtype=np.uint8)

    findings = _run_inference(image)
    return FindingResponse(
        task_id=f"task-{uuid.uuid4().hex[:8]}",
        model_id=MODEL_ID,
        findings=findings,
        elapsed_ms=int((time.time() - started) * 1000),
    )


# ── POST /predict-upload  (multipart — used by UI / manual tests) ─────────────

@app.post("/predict-upload", response_model=FindingResponse)
async def predict_upload(
    file: UploadFile = File(...),
    x_local_token: str | None = Header(default=None),
) -> FindingResponse:
    _check_token(x_local_token)
    started = time.time()

    payload = await file.read()
    image = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image payload")

    findings = _run_inference(image)
    return FindingResponse(
        task_id=f"task-{uuid.uuid4().hex[:8]}",
        model_id=MODEL_ID,
        findings=findings,
        elapsed_ms=int((time.time() - started) * 1000),
    )
