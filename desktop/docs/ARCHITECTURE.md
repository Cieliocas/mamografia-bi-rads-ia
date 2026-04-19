# Architecture Notes (Healthcare + AI Desktop)

## Why this split
- Go handles deterministic IO, queueing, local storage and CPU-bound PDI.
- Python sidecar isolates ML runtime complexity and framework dependencies.
- Wails wraps the Angular UI as a native desktop app using the OS WebView (WebKit/WebView2), avoiding a bundled Chromium.

## Security / LGPD baseline
- Local-only communication (`127.0.0.1`).
- Shared token header (`X-Local-Token`) between Go and AI sidecar.
- No outbound network dependency at runtime (offline-compatible packaging).
- SQLite kept local; no PHI leaves workstation by default.

## Scalability strategy
- Goroutine workers in Go for prefetch/windowing pipeline.
- Sidecar can be swapped to ONNX Runtime/TensorRT without touching UI layer.
- API seam (`/api/ai/*`) allows future migration from HTTP to Unix sockets/gRPC.
