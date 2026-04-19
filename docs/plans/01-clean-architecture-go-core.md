# Plano 01 — Clean Architecture no Go Core

> **Ordem de execução: PRIMEIRO.** Esta refatoração é feita *dentro* do layout atual (`desktop/apps/go-core/`) e não mexe no caminho externo do módulo. Isso reduz blast radius: toda mudança de paths (Plano 02) deve vir depois.

## Objetivo

Quebrar o `cmd/orchestrator/main.go` monolítico (183 linhas, 7 responsabilidades) em camadas explícitas de domínio, aplicação, portas e adaptadores, alinhando o Go Core com o spec da ferramenta (persistência de estudos, findings, usuários, BI-RADS).

## Estado atual

```
desktop/apps/go-core/
├── cmd/
│   ├── orchestrator/main.go      # 183 linhas: setup, HTTP, guardian, fila, proxy, windowing
│   └── startup-monitor/main.go
├── internal/
│   ├── config/config.go          # Env vars + defaults
│   ├── guardian/guardian.go      # Supervisor do sidecar
│   ├── pdi/windowing.go          # Windowing 16-bit
│   └── queue/queue.go            # Fila in-memory
└── go.mod                        # module mammo/desktop/go-core
```

**Problemas:**
- `main.go` conhece HTTP framework + regras de negócio + processo externo.
- Handlers inline impossibilitam teste isolado.
- Sem modelo de domínio (Study, Finding, Annotation) — quando entrarem SQLite e BI-RADS, vão parar no handler.
- Sem dependência invertida: `guardian` e `queue` estão em `internal/` mas são implementações, não contratos.

## Estado alvo

```
desktop/apps/go-core/
├── cmd/
│   └── server/main.go                 # Composition root (~40 linhas: config → wiring → Run)
├── internal/
│   ├── domain/
│   │   ├── entity/
│   │   │   ├── study.go               # Study, Series
│   │   │   ├── finding.go             # Finding, BIRADS, AnnotationKind
│   │   │   ├── annotation.go          # BoundingBox, Polygon, Point
│   │   │   └── user.go                # Placeholder para autenticação futura
│   │   └── valueobject/
│   │       ├── birads.go              # BIRADSCategory (0-6, A-D)
│   │       └── laterality.go          # Left/Right + CC/MLO
│   ├── application/
│   │   └── usecase/
│   │       ├── open_study.go          # Lê DICOM, cria/hidrata Study
│   │       ├── run_inference.go       # Enfileira, proxy, retorna FindingCandidates
│   │       ├── save_annotations.go
│   │       ├── load_annotations.go
│   │       ├── export_dataset.go      # COCO/JSON/CSV/DICOM-SR
│   │       └── apply_windowing.go     # Move a lógica do pdi/ para use case
│   ├── ports/
│   │   ├── inbound/                   # Interfaces consumidas pelos adaptadores HTTP
│   │   │   └── study_service.go
│   │   └── outbound/                  # Interfaces consumidas pelos use cases
│   │       ├── study_repository.go
│   │       ├── annotation_repository.go
│   │       ├── ai_client.go
│   │       └── filesystem.go
│   ├── adapters/
│   │   ├── http/                      # Gin handlers, roteamento, middleware
│   │   │   ├── router.go
│   │   │   ├── health_handler.go
│   │   │   ├── study_handler.go
│   │   │   ├── inference_handler.go
│   │   │   └── pdi_handler.go
│   │   ├── sqlite/                    # Implementação de *Repository
│   │   │   ├── study_repository.go
│   │   │   └── migrations/
│   │   ├── filesystem/                # Leitura DICOM, dumps de anotação
│   │   │   └── dicom_reader.go
│   │   └── ai_client/                 # HTTP client do sidecar
│   │       └── client.go
│   └── infrastructure/
│       ├── config/config.go           # Permanece (env + defaults)
│       ├── guardian/guardian.go       # Permanece (processo externo é infra)
│       └── queue/queue.go             # Permanece; usada pelo use case run_inference
└── go.mod
```

## Passos (cada um é um commit mergeável)

### Passo 1 — Criar camada de domínio (puro Go, zero deps externas)
- Arquivos: `internal/domain/entity/*.go`, `internal/domain/valueobject/*.go`.
- Entidades mínimas: `Study`, `Series`, `Finding`, `Annotation` (union BoundingBox/Polygon/Point), `BIRADS` VO com validação `0–6, A–D`.
- Sem importar nada de `gin`, `sqlite`, `http`.
- **Testes unitários** para VOs (validação BI-RADS, `Laterality`).
- Critério: `go test ./internal/domain/...` passa. Binário antigo ainda compila.

### Passo 2 — Mover `pdi/` e `guardian/` e `queue/` para `infrastructure/`
- Pure move + ajuste de imports no `main.go` atual.
- Não mudar assinaturas.
- **Teste manual:** `bash desktop/tools/run_desktop_dev.sh --rebuild-go` sobe normalmente.

### Passo 3 — Definir portas outbound
- `internal/ports/outbound/study_repository.go` — interface `StudyRepository` com `Save`, `FindByID`, `List`.
- `internal/ports/outbound/annotation_repository.go` — `Save`, `LoadByStudyID`.
- `internal/ports/outbound/ai_client.go` — `Predict(ctx, imagePath) (Findings, error)`.
- `internal/ports/outbound/filesystem.go` — `ReadDICOM(path) (Pixels16, Metadata, error)`.
- Critério: interfaces declaradas, zero implementações ainda. Binário antigo continua funcional (rota paralela).

### Passo 4 — Use case `apply_windowing` como pilot
- Move a lógica de `pdi/windowing.go` para `application/usecase/apply_windowing.go`.
- Use case recebe input DTO, retorna output DTO (sem tipos de `gin`).
- Adapter HTTP `adapters/http/pdi_handler.go` passa a ser um cast simples.
- Rota `/api/pdi/windowing` agora usa o adapter.
- **Teste:** `curl -X POST` na rota, compara output byte-a-byte com commit anterior (regression test manual).

### Passo 5 — Adapter SQLite para `StudyRepository`
- Adiciona `github.com/mattn/go-sqlite3` ao `go.mod`.
- Cria schema em `adapters/sqlite/migrations/001_initial.sql` (tabelas `studies`, `series`, `findings`, `annotations`).
- Implementa `adapters/sqlite/study_repository.go`.
- Composition root abre DB em `cfg.SQLitePath`, roda migrations.
- **Teste:** `go test ./internal/adapters/sqlite/...` com SQLite em memória.

### Passo 6 — Use cases `open_study` + `save_annotations` + `load_annotations`
- Primeiro cliente real dos repositórios.
- Adapter `adapters/filesystem/dicom_reader.go` para ler metadados DICOM (stub inicial, só lê arquivo e retorna dimensões; parser real entra no Plano 03).
- Rotas HTTP novas: `POST /api/studies`, `GET /api/studies/:id`, `POST /api/studies/:id/annotations`, `GET /api/studies/:id/annotations`.

### Passo 7 — Use case `run_inference` consolidando proxy + fila
- `adapters/ai_client/client.go` encapsula HTTP + header `X-Local-Token`.
- Use case `run_inference` publica na `queue` + aguarda resposta via channel.
- Rota `/api/tasks/predict` passa a usar o use case.
- Rota `/api/ai/*` (proxy raw) pode permanecer como atalho, mas marcada como "legacy debug" em comentário.

### Passo 8 — Use case `export_dataset`
- Suporta JSON e CSV inicialmente (COCO/DICOM-SR marcados como TODO com interface já pronta).

### Passo 9 — Enxugar `cmd/server/main.go` como composition root
- Renomear `cmd/orchestrator/` → `cmd/server/` (alinha com spec).
- `main.go` final: `config.Load()` → abrir DB → montar repositórios → montar use cases → montar router → `Run`. ~40 linhas.
- Deletar `cmd/orchestrator/` após `run_desktop_dev.sh` apontar pro novo binário.

### Passo 10 — Atualizar `run_desktop_dev.sh`
- `go build -o bin/go-core ./cmd/server` (era `./cmd/orchestrator`).
- Atualizar [docs/RUNBOOK.md](../RUNBOOK.md) e [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Riscos

| Risco | Mitigação |
|---|---|
| Quebrar proxy `/api/ai/*` durante refactor | Manter rota paralela até o Passo 7; só então cortar |
| Migration SQLite corrompe DB existente | Passo 5 usa DB novo em `~/.mammo-desktop/mammo.db` (já é default) — nenhum dado de produção ainda |
| `cmd/startup-monitor/main.go` referencia símbolos antigos | Auditar no Passo 2; se não for usado, remover |
| Ciclo de import entre `application` e `adapters` | Regra: `adapters/` pode importar `application/` e `ports/`, nunca o inverso |

## Estimativa

- Passos 1–3: ~2h (puro domínio + moves)
- Passos 4–7: ~3–4h (use cases + SQLite + HTTP)
- Passos 8–10: ~1h (export + cleanup)
- **Total: ~6–7h** distribuídos em 10 commits pequenos.

## Critérios de aceitação

- [ ] `bash desktop/tools/run_desktop_dev.sh --rebuild-go` sobe sem erros.
- [ ] Todas as rotas antigas respondem idêntico a `main` (comparar `curl` antes/depois).
- [ ] Novas rotas `/api/studies/*` e `/api/studies/:id/annotations` gravam em SQLite e recuperam.
- [ ] `go test ./...` passa.
- [ ] `main.go` final ≤ 60 linhas, sem lógica de negócio.
- [ ] Nenhum import de `gin` ou `sqlite3` em `internal/domain/` ou `internal/application/`.
