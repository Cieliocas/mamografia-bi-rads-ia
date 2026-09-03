"""Tests for the pluggable inference layer (registry + backends)."""
from __future__ import annotations

import numpy as np

from app.config import Settings
from app.inference.mock import MockBackend
from app.inference.registry import get_backend
from app.schemas import BBox, FindingItem


class TestMockBackend:
    def test_is_not_loaded(self):
        assert MockBackend().is_loaded is False

    def test_returns_two_findings(self):
        out = MockBackend().infer(np.zeros((120, 90), dtype=np.uint8))
        assert len(out) == 2
        assert all(isinstance(f, FindingItem) for f in out)

    def test_bbox_scales_with_image(self):
        out = MockBackend().infer(np.zeros((200, 100), dtype=np.uint8))
        # first mock finding bbox.x = w*0.3 = 30
        assert out[0].bbox.x == 30


class TestRegistry:
    def test_default_backend_is_mock(self):
        assert isinstance(get_backend(Settings(model_backend="mock")), MockBackend)

    def test_unknown_backend_is_mock(self):
        assert isinstance(get_backend(Settings(model_backend="does-not-exist")), MockBackend)

    def test_cascade_falls_back_to_mock_when_onnx_missing(self):
        s = Settings(model_backend="cascade",
                     classifier_onnx="/nonexistent/classifier.onnx",
                     detector_onnx="/nonexistent/detector.onnx")
        assert isinstance(get_backend(s), MockBackend)


class TestSchemas:
    def test_finding_round_trip(self):
        f = FindingItem(id="x", kind="mass", birads="4",
                        confidence=0.5, bbox=BBox(x=1, y=2, w=3, h=4))
        assert f.bbox.w == 3 and f.notes == ""
