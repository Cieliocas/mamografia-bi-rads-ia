# Runbook — AIdentify Desktop

## Pré-requisitos

| Dependência | Versão mínima |
|---|---|
| Go | 1.22+ |
| Wails CLI | v2.12+ |
| Node.js | 20+ |
| npm | 10+ |
| Python | 3.11+ |

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

## Execução em desenvolvimento (recomendado)

Entrypoint único — sobe Go Core, AI sidecar e UI Wails+Angular com hot-reload:

```bash
cd /Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia
bash tools/run_desktop_dev.sh --rebuild-go
```

Flags:
- `--rebuild-go` — recompila o binário do go-core
- `--install-ui-deps` — força `npm install`
- `--install-ai-deps` — força reinstalar deps Python

O script tem **lock anti-duplicata** em `/tmp/mammo-desktop-dev.lock`. Se uma instância travar, remova `/tmp/mammo-desktop-dev.lock/` manualmente.

### Atalho macOS (duplo clique)

Use `Mammo-Desktop-Dev.command` na raiz ou o bundle `Mammo BI-RADS Desktop Dev.app`.

### Portas expostas em dev

| Porta | Serviço |
|---|---|
| `:34115` | Wails dev server (bindings Go disponíveis no browser) |
| `:4200` | Angular dev server (sem bindings Go) |
| `:8088` | Go Core |
| `:8090` | AI Sidecar |

## Execução por componente (debug isolado)

```bash
# AI sidecar
cd apps/ai-engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Go core
cd apps/core
go mod tidy && go build -o bin/core ./cmd/server
./bin/core

# UI (dev Wails puro)
cd apps/desktop
wails dev
```

## Variáveis de ambiente do Go Core

| Variável | Default | Descrição |
|---|---|---|
| `GO_CORE_PORT` | `8088` | Porta HTTP |
| `AI_ENGINE_URL` | `http://127.0.0.1:8090` | URL do sidecar |
| `AI_SHARED_TOKEN` | *(gerado automaticamente)* | Token `X-Local-Token` — se não definido, gerado em `~/.mammo-desktop/.token` |
| `SQLITE_PATH` | `~/.mammo-desktop/mammo.db` | Banco local |
| `AI_ENGINE_PYTHON` | (auto) | Python do sidecar |

## Build de produção

```bash
# Binário nativo Wails (.app no macOS, .exe no Windows)
cd apps/desktop
wails build

# Bundle .app macOS customizado
bash tools/create_macos_app.sh
```

Saída: `apps/desktop/build/bin/`.

## Troubleshooting

**Erro `background.js` ou `apps/ui/app/background.js`** — resquício de launcher antigo (Nextron/Electron). Confira se o atalho/`.app` que você clicou aponta para `tools/run_desktop_dev.sh`.

**Lock preso** — `rm -rf /tmp/mammo-desktop-dev.lock` e tente de novo.

**Splash não fecha** — verifique se Go Core responde `/readyz` e se o sidecar responde `/health`. Veja logs do próprio `wails dev` no terminal.

**Porta ocupada** — mate processos residuais: `lsof -ti:8088,8090,4200,34115 | xargs kill -9`.

**Modelo ausente** — garanta `apps/ai-engine/models/unet_mammo_best.keras` existe. Sem ele o sidecar sobe mas `/predict` falha.

## Smoke test manual

1. App abre sem janela duplicada.
2. `curl http://127.0.0.1:8088/healthz` → `200`.
3. `curl http://127.0.0.1:8090/health` → `200` com `model_loaded: true`.
4. Carregar imagem no viewer e ver dimensões no painel Analysis.
5. Ferramenta Marker coloca ponto; ferramenta Ruler mede distância.
