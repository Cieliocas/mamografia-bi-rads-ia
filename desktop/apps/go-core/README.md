# Go Core — Orquestrador e Guardian

Módulo central do AIdentify Desktop responsável por gerenciar o ciclo de vida do AI sidecar e expor a API local para a interface Angular.

## Responsabilidades

- **Guardian**: Inicia, monitora e reinicia automaticamente o sidecar Python em falhas
- **Proxy**: Encaminha requisições de inferência da UI para o AI sidecar (`/api/ai/*`)
- **Fila**: Gerencia tarefas de predição evitando sobrecarga do modelo
- **PDI**: Aplica operações de pré-processamento de imagem (windowing) localmente

## Stack

- Go 1.22+ com módulos
- [Gin](https://github.com/gin-gonic/gin) — HTTP framework
- SQLite para persistência local

## Estrutura

```
go-core/
├── cmd/orchestrator/main.go   # Ponto de entrada
├── internal/
│   ├── config/                # Variáveis de ambiente e configuração
│   ├── guardian/              # Gerenciamento do ciclo de vida do sidecar
│   ├── pdi/                   # Processamento de imagem local
│   └── queue/                 # Fila de tarefas de predição
└── bin/                       # Binário compilado (gitignore)
```

## Endpoints

| Endpoint | Método | Descrição |
|---|---|---|
| `/healthz` | GET | Health do Go Core |
| `/readyz` | GET | Prontidão geral (depende do sidecar) |
| `/startup/status` | GET | Status de bootstrap para splash screen |
| `/api/tasks/predict` | POST | Enfileira tarefa de predição |
| `/api/pdi/windowing` | POST | Windowing local de imagem |
| `/api/ai/*` | ANY | Proxy para AI sidecar |

## Build e execução

```bash
cd desktop/apps/go-core
go mod tidy
go build -o bin/go-core ./cmd/orchestrator
./bin/go-core
```

## Variáveis de Ambiente

| Variável | Default | Descrição |
|---|---|---|
| `GO_CORE_PORT` | `8088` | Porta do servidor |
| `AI_ENGINE_URL` | `http://127.0.0.1:8090` | URL do sidecar Python |
| `AI_SHARED_TOKEN` | `mammo-local-token` | Token de autenticação local |
| `SQLITE_PATH` | `~/.mammo-desktop/mammo.db` | Banco de dados local |
