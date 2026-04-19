# Monorepo Structure

```text
desktop/
  apps/
    ui/                        # Wails shell (Go) + Angular 18 frontend
      main.go                  # Entry point do Wails
      app.go                   # Bindings Go -> Angular
      wails.json               # Config do Wails CLI
      frontend/                # Angular 18 (Standalone Components, Tailwind)
        src/app/               # Componentes, viewer, painel de findings
      build/                   # Artefatos nativos gerados por `wails build`

    go-core/                   # Orquestrador / Guardian / Proxy
      cmd/orchestrator/main.go
      internal/
        config/config.go
        guardian/guardian.go
        queue/queue.go
      go.mod

    ai-engine/                 # Python AI sidecar (FastAPI)
      app/main.py              # /health e /predict
      models/                  # unet_mammo_best.keras (artefato de inferencia)
      requirements.txt

  build/
    installer/
      README.md                # Fluxo de empacotamento Wails

  docs/
    ARCHITECTURE.md

  tools/
    run_desktop_dev.sh         # Entrypoint unico de dev (UI + Go + AI)
    create_macos_app.sh        # Builder do aidentify.app (macOS)

  README.md
```
