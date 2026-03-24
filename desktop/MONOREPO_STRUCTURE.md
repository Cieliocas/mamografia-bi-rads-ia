# Monorepo Structure

```text
desktop/
  apps/
    ui/                        # Nextron (Electron + Next.js)
      electron/main/
        background.ts          # Boots Go process and watches readiness
      renderer/
        components/
          TermsGate.tsx        # EULA gate with mandatory checkbox
          SplashScreen.tsx     # Animated startup splash
        pages/
          index.tsx            # Startup orchestration UI
      scripts/
        gpu-check.js           # NVIDIA/CUDA check + CPU fallback
      package.json
      nextron.config.js

    go-core/                   # Orchestrator / Guardian / Proxy
      cmd/orchestrator/main.go
      cmd/startup-monitor/main.go
      internal/
        config/config.go
        guardian/guardian.go
        pdi/windowing.go
        queue/queue.go
      go.mod

    ai-engine/                 # Python AI sidecar
      app/main.py              # FastAPI /health and /predict endpoints
      requirements.txt

  build/
    electron-builder.yml       # Windows NSIS + Linux DEB targets
    installer/
      installer.nsh            # NSIS custom hooks
      README.md               # Build/install flow for Air-gapped setup

  docker/
    dev.Dockerfile             # Go + Python 3.11 + CUDA + Node toolchain

  docs/
    ARCHITECTURE.md

  README.md
```
