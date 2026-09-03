"""ONNX cascade backend.

Stage 1 — INbreast-Hybrid classifier (``classifier_hybrid.onnx``) → P(malignant).
Stage 2 — CMMD YOLO detector (``detector_yolo.onnx``, NMS baked in) → mass/calc boxes,
run only when the gate opens (P ≥ gate_threshold).

Everything runs on onnxruntime (CPU) — no TensorFlow / torch in the sidecar. Artifacts
are produced offline by tools/convert_classifier.py and tools/convert_detector.py.

NOTE (clinical honesty): these are research models. BI-RADS here is a *heuristic*
mapping of the malignancy probability, NOT a validated BI-RADS classifier; the detector
is CMMD-domain (weak out-of-distribution). Support tool, not diagnosis.
"""
from __future__ import annotations

import logging
import os
import uuid

import cv2
import numpy as np

try:
    import onnxruntime as ort
except Exception:  # pragma: no cover - onnxruntime is a runtime dep
    ort = None

from app.config import Settings
from app.schemas import BBox, FindingItem

log = logging.getLogger("ai.inference.cascade")

CLS_H, CLS_W = 1152, 896      # classifier input (H, W)
CLS_MEAN = 52.18              # preprocessing: pixel*1.0 - mean
DET_PAD = 114                 # ultralytics letterbox pad value
DET_NAMES = {0: "mass", 1: "calc"}


def _birads_from_prob(p: float) -> str:
    """Heuristic (NOT validated) BI-RADS band from malignancy probability."""
    if p < 0.10:
        return "2"
    if p < 0.50:
        return "3"
    if p < 0.85:
        return "4"
    return "5"


def _letterbox(img: np.ndarray, new: int) -> tuple[np.ndarray, float, int, int]:
    """Resize (keep aspect) + pad to new×new, ultralytics-style. Returns (canvas, r, left, top)."""
    h, w = img.shape[:2]
    r = min(new / h, new / w)
    nh, nw = int(round(h * r)), int(round(w * r))
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((new, new), DET_PAD, dtype=img.dtype)
    top, left = (new - nh) // 2, (new - nw) // 2
    canvas[top:top + nh, left:left + nw] = resized
    return canvas, r, left, top


class CascadeBackend:
    model_id = "cascade-hybrid-yolo11n-onnx"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._clf = self._det = None
        self._clf_in = self._clf_out = self._det_in = None
        if ort is None:
            log.warning("onnxruntime unavailable — cascade cannot load")
            return
        prov = ["CPUExecutionProvider"]
        if os.path.exists(settings.classifier_onnx):
            self._clf = ort.InferenceSession(settings.classifier_onnx, providers=prov)
            self._clf_in = self._clf.get_inputs()[0].name
            self._clf_out = self._clf.get_outputs()[0].name
        else:
            log.warning("classifier ONNX missing: %s", settings.classifier_onnx)
        if os.path.exists(settings.detector_onnx):
            self._det = ort.InferenceSession(settings.detector_onnx, providers=prov)
            self._det_in = self._det.get_inputs()[0].name
        else:
            log.warning("detector ONNX missing: %s", settings.detector_onnx)

    @property
    def is_loaded(self) -> bool:
        return self._clf is not None and self._det is not None

    # ── stages ────────────────────────────────────────────────────────────────
    def _malignancy(self, image: np.ndarray) -> float:
        x = cv2.resize(image, (CLS_W, CLS_H)).astype(np.float32) - CLS_MEAN
        x = np.stack([x, x, x], axis=-1)[None, ...]           # (1, H, W, 3)
        y = self._clf.run([self._clf_out], {self._clf_in: x})[0]
        return float(np.asarray(y)[0, 1])                     # P(malignant)

    def _detect(self, image: np.ndarray) -> list[tuple[int, float, float, float, float, float]]:
        lb, r, left, top = _letterbox(image, self.settings.det_imgsz)
        x = (lb.astype(np.float32) / 255.0)
        x = np.stack([x, x, x], axis=0)[None, ...]            # (1, 3, S, S)
        out = np.asarray(self._det.run(None, {self._det_in: x})[0])[0]  # (300, 6)
        boxes = []
        for x1, y1, x2, y2, score, cls in out:
            if float(score) < self.settings.det_conf:
                continue
            boxes.append((int(cls), float(score),
                          (x1 - left) / r, (y1 - top) / r,
                          (x2 - left) / r, (y2 - top) / r))    # back to image coords
        return boxes

    # ── entrypoint ────────────────────────────────────────────────────────────
    def infer(self, image: np.ndarray) -> list[FindingItem]:
        prob = self._malignancy(image)
        birads = _birads_from_prob(prob)
        base_note = f"malignancy P={prob:.3f}; BI-RADS heurístico (não validado)"
        h, w = image.shape[:2]

        if prob < self.settings.gate_threshold:
            return [FindingItem(id=str(uuid.uuid4()), kind="assessment", birads=birads,
                                confidence=round(prob, 3), bbox=BBox(x=0, y=0, w=0, h=0),  # image-level: no box to draw
                                notes=base_note + " — gate fechado (sem detecção)")]

        boxes = self._detect(image)
        if not boxes:
            return [FindingItem(id=str(uuid.uuid4()), kind="assessment", birads=birads,
                                confidence=round(prob, 3), bbox=BBox(x=0, y=0, w=0, h=0),  # image-level: no box to draw
                                notes=base_note + " — suspeito, detector sem caixa")]

        return [
            FindingItem(id=str(uuid.uuid4()), kind=DET_NAMES.get(cls, str(cls)),
                        birads=birads, confidence=round(score, 3),
                        bbox=BBox(x=x1, y=y1, w=x2 - x1, h=y2 - y1), notes=base_note)
            for cls, score, x1, y1, x2, y2 in boxes
        ]
