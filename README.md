# Mamografia BI-RADS IA

Ferramenta de apoio à anotação e análise de mamografias com arquitetura desktop local/offline.

## Stack Atual (Desktop)

- UI Desktop: Electron + Next.js (Nextron) + Tailwind
- Core Orquestrador: Go (proxy principal, fila e health checks)
- AI Sidecar: Python FastAPI (inferência U-Net)
- Treinamento: TensorFlow/Keras em `src/ml` com Slurm (`scripts/train.slurm`)

## Estrutura Principal

- `desktop/`: monorepo da aplicação desktop (UI + Go Core + AI Sidecar + build/installer)
- `src/ml/`: pipeline de modelo e treinamento
- `scripts/`: scripts de cluster e empacotamento para treino
- `data/`: dataset local (não versionado)

## Execução da Aplicação Desktop (dev)

1. Terminal 1: Go Core
```bash
cd desktop/apps/go-core
go mod tidy
go build -o bin/go-core ./cmd/orchestrator
```

2. Terminal 2: AI Sidecar (para debug manual, opcional)
```bash
cd desktop/apps/ai-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8090
```

3. Terminal 3: UI Desktop
```bash
cd desktop/apps/ui
npm install
npm run dev
```

Observação:
- No fluxo normal do Electron, o Go sobe o sidecar automaticamente.
- Para detalhes de arquitetura e instalador, ver `desktop/README.md` e `desktop/docs/ARCHITECTURE.md`.

## Treinamento do Modelo (cluster)

O treino continua no fluxo de HPC/Slurm:

```bash
sbatch scripts/train.slurm
```

Guia completo: `CLUSTER_GUIDE.md`.

## Contexto Acadêmico

- Bolsista: Francielio Castro
- Orientador: Prof. Andre Castelo Branco Soares
- Instituicao: Universidade Federal do Piaui (UFPI)
- Laboratorio: NCAD / Cluster TechNE
