import os
import time
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Header
from pydantic import BaseModel

try:
    import tensorflow as tf
except Exception:  # pragma: no cover
    tf = None


class PredictResponse(BaseModel):
    classification: str
    mask_shape: list[int]
    elapsed_ms: int


app = FastAPI(title="Mammo AI Sidecar", version="0.1.0")
MODEL_PATH = os.getenv("MODEL_PATH", "./models/unet_mammo_best.keras")
MODEL = None
STARTED_AT = time.time()
SHARED_TOKEN = os.getenv("AI_SHARED_TOKEN", "mammo-local-token")


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


@app.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    x_local_token: str | None = Header(default=None),
) -> PredictResponse:
    if x_local_token != SHARED_TOKEN:
        raise HTTPException(status_code=401, detail="invalid local token")
    started = time.time()
    payload = await file.read()
    image = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image payload")

    resized = cv2.resize(image, (256, 256)).astype(np.float32) / 255.0
    model_input = np.expand_dims(resized, axis=(0, -1))

    if MODEL is not None:
        pred = MODEL.predict(model_input, verbose=0)
        mask = (pred > 0.5).astype(np.uint8)[0, :, :, 0]
        cls = "BI-RADS from model"
    else:
        mask = np.zeros((256, 256), dtype=np.uint8)
        cv2.circle(mask, (128, 128), 48, 1, -1)
        cls = "BI-RADS mock (model not loaded)"

    elapsed_ms = int((time.time() - started) * 1000)
    return PredictResponse(classification=cls, mask_shape=list(mask.shape), elapsed_ms=elapsed_ms)
