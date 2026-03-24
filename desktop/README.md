# Monorepo Desktop (Nextron + Go + AI Sidecar)

Esta pasta contem a arquitetura desktop local/offline da aplicacao de mamografia BI-RADS.

## Layout

- `apps/ui`: Electron + Next.js (Nextron)
- `apps/go-core`: orquestrador/proxy principal em Go
- `apps/ai-engine`: sidecar em Python/FastAPI para inferencia
- `build`: configuracoes de instalador (electron-builder/NSIS)
- `docker`: ambiente de desenvolvimento com CUDA
- `docs`: notas de arquitetura

## Contrato de Execucao

1. Electron inicia o processo Go Core.
2. Go Core sobe e monitora o sidecar Python.
3. UI fala somente com Go Core (`127.0.0.1:8088`).
4. Go Core faz proxy para AI Engine (`127.0.0.1:8090`).
5. Se o AI Engine cair, o Go reinicia automaticamente.

## Como Rodar em Desenvolvimento

### 1) Build do Go Core (obrigatorio para UI)

```bash
cd apps/go-core
go mod tidy
go build -o bin/go-core ./cmd/orchestrator
```

### 2) Preparar sidecar Python (dependencias)

```bash
cd ../ai-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3) Rodar a UI (Nextron/Electron)

```bash
cd ../ui
npm install
npm run dev
```

## Debug do Sidecar Isolado (opcional)

```bash
cd apps/ai-engine
source .venv/bin/activate
MODEL_PATH=./models/unet_mammo_best.keras uvicorn app.main:app --host 127.0.0.1 --port 8090
```

## Referencias

- Estrutura: `MONOREPO_STRUCTURE.md`
- Arquitetura: `docs/ARCHITECTURE.md`
- Instalador: `build/installer/README.md`
