# Mamografia BI-RADS IA (Desktop)

Aplicacao desktop local/offline para apoio a analise de mamografias.

## Stack Atual

- UI: Electron + Next.js (Nextron)
- Core Orquestrador: Go
- AI Engine (Sidecar): Python FastAPI

## Estrutura Principal

- `desktop/apps/ui`: interface desktop
- `desktop/apps/go-core`: orquestrador/proxy
- `desktop/apps/ai-engine`: inferencia
- `desktop/apps/ai-engine/models`: modelo final usado pela aplicacao

## Politica de Modelo no Repositorio

- O codigo de treinamento foi removido do GitHub.
- Este repositorio deve conter apenas o artefato final de inferencia:
  - `desktop/apps/ai-engine/models/unet_mammo_best.keras`

## Execucao (Desenvolvimento)

1. Build do Go Core:
```bash
cd desktop/apps/go-core
go mod tidy
go build -o bin/go-core ./cmd/orchestrator
```

2. Preparar sidecar Python:
```bash
cd ../ai-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Rodar UI desktop:
```bash
cd ../ui
npm install
npm run dev
```

## Referencias

- `desktop/README.md`
- `desktop/docs/ARCHITECTURE.md`
- `desktop/build/installer/README.md`
