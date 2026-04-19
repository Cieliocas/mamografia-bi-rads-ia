# Plano 02 — Reestruturação do Layout do Monorepo

> **Ordem de execução: DEPOIS do Plano 01.** Este é um move em massa de pastas + rename de módulo Go + atualização de launchers. Fazer sobre um go-core já refatorado reduz conflitos de merge e facilita validar que nada quebrou.

## Objetivo

Alinhar o layout do monorepo com o spec da ferramenta: `apps/` no nível raiz, `frontend/` separado do shell Wails, `data/` como diretório de runtime explícito.

## Estado atual

```
mamografia-bi-rads-ia/
├── desktop/
│   ├── apps/
│   │   ├── ui/                  # Wails shell + Angular aninhado
│   │   │   ├── main.go
│   │   │   ├── app.go
│   │   │   ├── wails.json
│   │   │   └── frontend/        # Angular dentro de ui/
│   │   ├── go-core/             # Módulo Go (mammo/desktop/go-core)
│   │   └── ai-engine/
│   ├── build/installer/
│   └── tools/
│       ├── run_desktop_dev.sh
│       └── create_macos_app.sh
```

## Estado alvo

```
mamografia-bi-rads-ia/
├── apps/
│   ├── desktop/                 # Wails shell (somente Go + config)
│   │   ├── main.go
│   │   ├── app.go               # Bindings Go → Angular
│   │   └── wails.json
│   ├── frontend/                # Angular 18 (topo de apps/)
│   │   ├── src/app/
│   │   │   ├── core/            # serviços globais (API, estado)
│   │   │   ├── features/        # viewer, annotations, study
│   │   │   └── shared/
│   │   ├── angular.json
│   │   └── package.json
│   ├── core/                    # Go Core (renomeado de go-core)
│   │   ├── cmd/server/main.go
│   │   ├── internal/...
│   │   └── go.mod               # module mammo/apps/core
│   └── ai-engine/
│       ├── app/main.py
│       ├── models/
│       └── requirements.txt
├── data/                        # Runtime local (gitignored)
│   ├── studies/{study_id}/images,annotations.json,metadata.json
│   ├── db/app.db
│   └── cache/
├── build/                       # Artefatos de build (gitignored)
├── docs/
├── relatorios/
├── projetos/
├── tools/                       # Movido de desktop/tools
│   ├── run_desktop_dev.sh
│   └── create_macos_app.sh
├── README.md
└── Mammo-Desktop-Dev.command
```

**Mudanças-chave:**
- `desktop/` deixa de existir como wrapper. `apps/` sobe para a raiz.
- `frontend/` sobe para `apps/` (não mais aninhado em `ui/`).
- `go-core` renomeia para `core` (alinha com spec).
- `ui/` renomeia para `desktop/` (clareza: é a shell do desktop, não a UI em si — a UI é Angular em `frontend/`).
- `tools/` sobe para raiz (não é exclusivo do desktop).
- `data/` explícita na raiz (gitignored) como runtime store.

## Passos (cada um é um commit mergeável)

### Passo 1 — Preparar novo layout sem deletar o antigo
- Criar `apps/` vazio no root via `.gitkeep` (opcional).
- Criar `tools/` vazio.
- Criar `data/.gitkeep` + atualizar `.gitignore` (`data/db/`, `data/cache/`, `data/studies/`).
- Critério: commit-safe, nada quebra.

### Passo 2 — Mover `apps/ai-engine` (menor blast radius)
- `git mv desktop/apps/ai-engine apps/ai-engine`.
- Nenhum caminho no sidecar depende da posição no repo (usa apenas `app/main.py` e `.venv` local).
- Atualizar apenas `run_desktop_dev.sh` (`AI_DIR`).
- **Teste:** script sobe sidecar normal.

### Passo 3 — Mover `tools/` para raiz
- `git mv desktop/tools/run_desktop_dev.sh tools/run_desktop_dev.sh`.
- `git mv desktop/tools/create_macos_app.sh tools/create_macos_app.sh`.
- Atualizar `ROOT_DIR` dentro do script (`"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"` — um nível a menos).
- Atualizar `Mammo-Desktop-Dev.command` para apontar para `tools/run_desktop_dev.sh`.
- Atualizar bundle `.app` externo (fora do repo — o user confirma manualmente depois).
- **Teste:** duplo clique no `.command` ainda abre o app.

### Passo 4 — Renomear módulo Go: `go-core` → `core`
- `git mv desktop/apps/go-core apps/core`.
- Editar `apps/core/go.mod`: `module mammo/apps/core`.
- `sed` em todos os `.go` de `apps/core/`: `mammo/desktop/go-core` → `mammo/apps/core`.
- `go build ./...` para validar.
- Atualizar `run_desktop_dev.sh` (`GO_DIR`, binário em `apps/core/bin/core`).
- Atualizar `.gitignore` (era `desktop/apps/go-core/bin/` → `apps/core/bin/`).
- **Teste:** binário sobe.

### Passo 5 — Separar `frontend/` do shell Wails
- `git mv desktop/apps/ui/frontend apps/frontend`.
- `git mv desktop/apps/ui apps/desktop`.
- Editar `apps/desktop/wails.json`:
  - `frontend:install` e `frontend:build` passam a rodar em `../frontend` (usar flag `-C` do npm ou ajustar `wailsjsdir`).
  - `wailsjsdir`: `../frontend/src/app`.
- Confirmar que `wails dev` encontra o Angular no novo path.
- **Teste:** janela do app abre e renderiza.

### Passo 6 — Reorganizar `frontend/src/app` por feature
- Criar `src/app/core/`, `src/app/features/`, `src/app/shared/`.
- `app.ts` é enorme hoje (~900 linhas) — dividir:
  - `features/viewer/viewer.component.ts`
  - `features/annotations/findings-panel.component.ts`
  - `features/study/study-loader.component.ts`
  - `core/services/api.service.ts`, `core/services/study-state.service.ts`
  - `shared/` — diretivas/pipes reutilizáveis.
- **Trabalho grande** — pode ser um plano 03 separado. Para este plano, apenas criar as pastas vazias e mover arquivos óbvios (sem reescrever Angular).
- **Teste:** `ng build` e `wails dev` ainda compilam.

### Passo 7 — Atualizar documentação e launchers
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — reescrever seção "Monorepo".
- [docs/RUNBOOK.md](../RUNBOOK.md) — atualizar paths em todas as seções.
- [README.md](../../README.md) — revisar links.
- [relatorios/STATUS_ATUAL.md](../../relatorios/STATUS_ATUAL.md) — adicionar entrada.

### Passo 8 — Deletar `desktop/` vazio
- Após validar que tudo move, `rmdir desktop` + commit.

## Arquivos afetados (alto impacto)

| Arquivo | Tipo de mudança |
|---|---|
| `apps/core/go.mod` | module rename |
| `apps/core/**/*.go` | import path rewrite |
| `apps/desktop/wails.json` | frontend paths |
| `apps/desktop/main.go` + `app.go` | imports se referenciam core |
| `tools/run_desktop_dev.sh` | `ROOT_DIR`, `GO_DIR`, `AI_DIR`, `UI_DIR` |
| `Mammo-Desktop-Dev.command` | path para script |
| `.gitignore` | paths de bin |
| `docs/*.md` | todos os exemplos de path |

## Riscos

| Risco | Mitigação |
|---|---|
| Wails não encontra frontend após separação | Testar Passo 5 isolado antes de seguir; rollback via `git mv` reverso |
| Launcher externo `.app` fora do repo quebra | Documentar no `STATUS_ATUAL`; usuário reabre o `.app` (ele chama o `.command` que está versionado e atualizado) |
| Imports quebrados no rename do módulo Go | Rodar `go build ./...` após cada sed; fallback = `goimports -w` |
| Working tree de alguém pendente | Executar em branch dedicada, comunicar merge |
| Ciclo de `git mv` deixar arquivos órfãos | `git status` entre cada passo |

## Estimativa

- Passo 1: 10min
- Passo 2: 15min
- Passo 3: 30min
- Passo 4: 1h (rename + imports + teste)
- Passo 5: 1h (Wails config é o nó crítico)
- Passo 6: ~30min (só criar pastas e mover — refactor Angular fica pro Plano 03)
- Passos 7–8: 30min
- **Total: ~3–4h** em 8 commits atômicos.

## Critérios de aceitação

- [ ] `desktop/` não existe mais no repo.
- [ ] `apps/{desktop,frontend,core,ai-engine}/` existem e compilam.
- [ ] `bash tools/run_desktop_dev.sh --rebuild-go` sobe o app e a janela abre.
- [ ] `wails build` dentro de `apps/desktop/` gera `.app` válido.
- [ ] `go test ./...` em `apps/core/` passa.
- [ ] Nenhum path hardcoded em docs aponta para `desktop/apps/...`.

## Fora de escopo (planos futuros)

- Refactor interno de `app.ts` Angular (muito grande para este plano) → **Plano 03 — UI Feature-Sliced**.
- Implementação real de parser DICOM 16-bit → **Plano 04 — DICOM Pipeline**.
- Empacotamento release (`.dmg` / `.exe`) → **Plano 05 — Release Pipeline**.
