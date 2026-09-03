"""Prediction endpoints. The active inference backend lives on ``app.state.backend``."""
from __future__ import annotations

import time
import uuid

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.schemas import FindingResponse, PredictRequest
from app.security import require_token

router = APIRouter()


def _read_image(path: str) -> np.ndarray | None:
    """Load a grayscale uint8 image from a path. Falls back to DICOM (pydicom)
    when OpenCV can't decode it, so the UI can pass raw .dcm study files."""
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is not None:
        return img
    try:
        import pydicom

        ds = pydicom.dcmread(path)
        a = ds.pixel_array.astype("float32")
        if ds.get("PhotometricInterpretation", "") == "MONOCHROME1":
            a = a.max() - a                                   # de-invert
        a = (a - a.min()) / (a.max() - a.min() + 1e-8) * 255.0
        return a.astype("uint8")
    except Exception:
        return None


def _respond(request: Request, image: np.ndarray, started: float) -> FindingResponse:
    backend = request.app.state.backend
    findings = backend.infer(image)
    return FindingResponse(
        task_id=f"task-{uuid.uuid4().hex[:8]}",
        model_id=backend.model_id,
        findings=findings,
        elapsed_ms=int((time.time() - started) * 1000),
    )


@router.post("/predict", response_model=FindingResponse, dependencies=[Depends(require_token)])
def predict_json(body: PredictRequest, request: Request) -> FindingResponse:
    started = time.time()
    image = _read_image(body.image_path)
    if image is None:
        # AIdentify (spec 001): never infer on a placeholder frame with a real
        # model loaded. A blank frame yields a confident "benign" verdict on an
        # image nobody could read — a silent wrong answer. Fail loudly instead.
        # The blank-frame fallback stays for mock, which dev/CI rely on to
        # exercise the contract without any image on disk.
        if request.app.state.backend.is_loaded:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"could not decode image: {body.image_path}. "
                    "For compressed DICOM, install the pydicom decompression "
                    "plugins (pylibjpeg, pylibjpeg-libjpeg, pyjpegls)."
                ),
            )
        image = np.zeros((512, 512), dtype=np.uint8)
    return _respond(request, image, started)


@router.post("/predict-upload", response_model=FindingResponse, dependencies=[Depends(require_token)])
async def predict_upload(request: Request, file: UploadFile = File(...)) -> FindingResponse:
    started = time.time()
    payload = await file.read()
    image = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image payload")
    return _respond(request, image, started)
