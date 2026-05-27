"""Testes unitários / integração para o sidecar AIdentify AI.

Execução:
    cd apps/ai-engine
    pip install fastapi httpx pytest pytest-asyncio
    pytest tests/ -v
"""
from __future__ import annotations

import os
import importlib
import textwrap
import types
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fresh_app(token: str = "test-token", monkeypatch=None, env: dict | None = None):
    """Re-import main.py with a clean environment so module-level code re-runs."""
    env_vars = {"AI_SHARED_TOKEN": token, **(env or {})}
    # Patch cv2 and numpy so CI environments without OpenCV still work.
    import sys
    if "app.main" in sys.modules:
        del sys.modules["app.main"]

    with patch.dict(os.environ, env_vars, clear=False):
        from app import main as m
    return m.app, m


# ---------------------------------------------------------------------------
# _load_token
# ---------------------------------------------------------------------------

class TestLoadToken:
    def test_env_var_takes_priority(self, tmp_path, monkeypatch):
        """Env var is returned as-is, even if file exists."""
        token_file = tmp_path / ".token"
        token_file.write_text("file-token")
        monkeypatch.setenv("AI_SHARED_TOKEN", "env-token")
        # Import fresh copy so module-level _load_token() is exercised.
        import sys
        sys.modules.pop("app.main", None)
        with patch.dict(os.environ, {"AI_SHARED_TOKEN": "env-token"}):
            from app.main import _load_token
        assert _load_token() == "env-token"

    def test_file_fallback(self, tmp_path, monkeypatch):
        """Falls back to file when env var is absent."""
        # _load_token reads ~/.mammo-desktop/.token — recreate that structure.
        token_dir = tmp_path / ".mammo-desktop"
        token_dir.mkdir()
        token_file = token_dir / ".token"
        token_file.write_text("file-secret\n")
        monkeypatch.delenv("AI_SHARED_TOKEN", raising=False)

        import sys
        sys.modules.pop("app.main", None)
        with patch.dict(os.environ, {}, clear=False):
            from app.main import _load_token

        # expanduser("~") → tmp_path so the full path resolves correctly.
        with patch("os.path.expanduser", return_value=str(tmp_path)):
            result = _load_token()
        assert result == "file-secret"

    def test_missing_file_returns_empty(self, tmp_path, monkeypatch):
        """Returns empty string when both env and file are absent."""
        monkeypatch.delenv("AI_SHARED_TOKEN", raising=False)

        import sys
        sys.modules.pop("app.main", None)
        with patch.dict(os.environ, {}, clear=False):
            from app.main import _load_token

        with patch("os.path.expanduser", return_value=str(tmp_path / "nonexistent")):
            result = _load_token()
        assert result == ""


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    """TestClient with AI_SHARED_TOKEN=test-token."""
    os.environ["AI_SHARED_TOKEN"] = "test-token"
    import sys
    sys.modules.pop("app.main", None)
    from app.main import app
    return TestClient(app)


TOKEN = "test-token"
HEADERS = {"x-local-token": TOKEN}


class TestHealth:
    def test_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_has_status_ok(self, client):
        data = client.get("/health").json()
        assert data["status"] == "ok"

    def test_has_uptime_sec(self, client):
        data = client.get("/health").json()
        assert isinstance(data["uptime_sec"], int)
        assert data["uptime_sec"] >= 0

    def test_has_model_loaded_field(self, client):
        data = client.get("/health").json()
        assert "model_loaded" in data
        # In CI (no real model), model_loaded is False.
        assert isinstance(data["model_loaded"], bool)


class TestPredictJson:
    def test_rejects_invalid_token(self, client):
        resp = client.post(
            "/predict",
            json={"image_path": "/dev/null"},
            headers={"x-local-token": "wrong"},
        )
        assert resp.status_code == 401

    def test_rejects_missing_token(self, client):
        resp = client.post("/predict", json={"image_path": "/dev/null"})
        assert resp.status_code == 401

    def test_returns_finding_response_shape(self, client):
        resp = client.post(
            "/predict",
            json={"image_path": "/nonexistent/path.png"},
            headers=HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "task_id" in data
        assert "model_id" in data
        assert isinstance(data["findings"], list)
        assert isinstance(data["elapsed_ms"], int)

    def test_mock_findings_when_no_model(self, client):
        """With no real model, mock returns 2 findings."""
        resp = client.post(
            "/predict",
            json={"image_path": "/nonexistent/path.png"},
            headers=HEADERS,
        )
        data = resp.json()
        # When MODEL is None, _run_inference returns 2 mock items.
        assert len(data["findings"]) == 2

    def test_finding_fields(self, client):
        resp = client.post(
            "/predict",
            json={"image_path": "/nonexistent/path.png"},
            headers=HEADERS,
        )
        f = resp.json()["findings"][0]
        for field in ("id", "kind", "birads", "confidence", "bbox"):
            assert field in f, f"missing field: {field}"
        bbox = f["bbox"]
        for coord in ("x", "y", "w", "h"):
            assert coord in bbox


class TestPredictUpload:
    def test_rejects_invalid_token(self, client):
        import io
        resp = client.post(
            "/predict-upload",
            files={"file": ("x.png", io.BytesIO(b""), "image/png")},
            headers={"x-local-token": "bad"},
        )
        assert resp.status_code == 401

    def test_invalid_image_payload_returns_400(self, client):
        import io
        resp = client.post(
            "/predict-upload",
            files={"file": ("x.bin", io.BytesIO(b"not-an-image"), "application/octet-stream")},
            headers=HEADERS,
        )
        assert resp.status_code == 400

    def test_valid_png_returns_findings(self, client):
        """Send a minimal 1×1 grayscale PNG; expect valid FindingResponse."""
        import io
        import struct
        import zlib

        # Construct a minimal valid 1x1 grayscale PNG.
        def _png_1x1():
            def chunk(tag: bytes, data: bytes) -> bytes:
                c = struct.pack(">I", len(data)) + tag + data
                return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

            signature = b"\x89PNG\r\n\x1a\n"
            ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0))
            idat_data = zlib.compress(b"\x00\x00")  # filter byte + 1 gray pixel
            idat = chunk(b"IDAT", idat_data)
            iend = chunk(b"IEND", b"")
            return signature + ihdr + idat + iend

        png = _png_1x1()
        resp = client.post(
            "/predict-upload",
            files={"file": ("img.png", io.BytesIO(png), "image/png")},
            headers=HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "findings" in data
