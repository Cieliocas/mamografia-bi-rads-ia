# Prompt para Nova Conversa — AIdentify (mamografia-bi-rads-ia)
**Última atualização:** 2026-04-29

---

## Contexto geral

Projeto desktop de IA para mamografia BI-RADS. Stack:
- **Shell desktop**: Wails v2 + Go (`apps/desktop/`)
- **Frontend**: Angular 21 standalone (`apps/frontend/`)
- **Go Core** (API/backend): Go Clean Architecture (`apps/core/`)
- **AI Engine**: Python FastAPI sidecar (`apps/ai-engine/`)
- **Branch de trabalho**: `claude/interesting-khayyam-962c0b`
- **PR aberto**: https://github.com/Cieliocas/mamografia-bi-rads-ia/pull/4 (29 commits, todos os 6 planos completos)
- **Repo**: https://github.com/Cieliocas/mamografia-bi-rads-ia

---

## Todos os 6 Planos concluídos ✅

**Plan 01** — Go Clean Architecture: domain/entity (Study, Finding, Annotation), ports, use cases, adapters (SQLite, HTTP, AI Client), infrastructure (Guardian, Queue, PDI)

**Plan 02** — Monorepo: `apps/desktop/`, `apps/frontend/`, `apps/core/`, `apps/ai-engine/`, `tools/run_desktop_dev.sh`

**Plan 03** — Feature-Sliced Angular: `ViewerStateService`, `StudyService`, `ViewerComponent`, `FindingsPanelComponent`, `app.ts`

**Plan 04** — Go ↔ Angular integration:
- `ApiService` (`apps/frontend/src/app/core/services/api.service.ts`) — cliente HTTP para todos os endpoints
- Signals: `backendOnline`, `currentStudyId`, `latestFindings`, `backendStudies`
- Wails native `OpenFileDialog()` em `apps/desktop/app.go` + bindings JS
- History tab com `GET /api/studies`, restore annotations via `GET /api/studies/{id}/annotations`
- Status bar dinâmica com indicador Go Core online/offline

**Plan 05** — AI Sidecar Python:
- `POST /predict` aceita JSON `{"image_path": str}` → `FindingResponse{task_id, model_id, findings[], elapsed_ms}`
- Mock: 2 findings sintéticos (mass BI-RADS 3 @ 61%, calcification BI-RADS 2 @ 88%)
- `resolvePython()` no Guardian: prefere `.venv/bin/python`, resolve fork/exec macOS
- `outbound.RichFinding` com BIRADS, confidence, BBox
- `/readyz` retorna `{"status":"ready"}` com sidecar online

**Plan 06** — Export & Relatório:
- `GET /api/export?format=json|csv` — download de estudos + anotações
- `GET /api/export/report/:id` — HTML report clínico com auto-print → PDF
- Modal de exportação no FindingsPanel (JSON, CSV, Relatório PDF)

---

## Issues conhecidos

1. **Wails dev mode** não funciona: `unable to start frontend DevWatcher: fork/exec /usr/local/bin/npm: no such file or directory` — Wails procura `apps/desktop/frontend/` que não existe. Workaround: build manual Angular + `python3 -m http.server`.
2. **Sidecar Python** — sem modelo real; retorna mock findings. Precisa de modelo ONNX real.
3. **DICOMReader** — provavelmente stub; não parseia `.dcm` real ainda.

---

## Próximos passos prioritários

1. 🔴 **Merge PR #4 → main** (o utilizador faz no GitHub: https://github.com/Cieliocas/mamografia-bi-rads-ia/pull/4)
2. 🔴 **Fix Wails dev mode** — corrigir `wails.json` / symlink para `apps/frontend/`
3. 🟡 **DICOM real** — integrar `go-dicom` + extracção de pixels 16-bit + WW/WC do header
4. 🟡 **Modelo ONNX** — integrar `onnxruntime` no sidecar Python com modelo pré-treinado
5. 🟡 **CI/CD** — GitHub Actions: `go test`, `ng build`, pytest, Wails build `.app`
6. 🟢 **Testes** — Go httptest, Angular Jest, pytest para sidecar
7. 🟢 **UX** — spinner/skeleton, toast notifications, progress bar real
8. 🟢 **Build de distribuição** — `wails build` → `.app` macOS

---

## Comandos úteis

```bash
# Frontend
cd apps/frontend && npm run build
# ou dev:
cd apps/frontend && npx ng serve --port 4200

# Go Core
cd apps/core && go build -o bin/core ./cmd/server
./bin/core  # inicia em 127.0.0.1:8088

# Python sidecar
cd apps/ai-engine && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8090 --no-access-log

# Testar pipeline completo
curl http://127.0.0.1:8088/healthz
curl http://127.0.0.1:8088/readyz
curl -X POST http://127.0.0.1:8088/api/tasks/predict \
  -H "Content-Type: application/json" \
  -d '{"image_path":"/tmp/test.jpg"}'

# Git
git checkout claude/interesting-khayyam-962c0b
git log --oneline -5
git push origin claude/interesting-khayyam-962c0b
```

---

## Ficheiros chave para ler no início da sessão

```
apps/frontend/src/app/core/services/api.service.ts
apps/frontend/src/app/core/services/study.service.ts
apps/frontend/src/app/features/annotations/findings-panel.component.ts
apps/frontend/src/app/features/viewer/viewer.component.ts
apps/core/cmd/server/main.go
apps/core/internal/adapters/http/router.go
apps/core/internal/adapters/http/export_handler.go
apps/ai-engine/app/main.py
relatorios/ROADMAP_2026-04-29.md
```

---

## Detalhes técnicos importantes

- `//go:embed all:dist` em `apps/desktop/main.go` — Angular build deve ir para `apps/desktop/dist/`
- `outbound.RichFinding` é o wrapper de transporte entre sidecar Python e domínio Go
- Todos os métodos de `ViewerStateService` que alteram estado visual aceitam `drawFn: (i: number) => void`
- `go-sqlite3 v1.14.42` requer CGO/gcc
- `AI_ENGINE_PYTHON` env var para apontar para Python customizado
- Token de autenticação sidecar: `AI_SHARED_TOKEN` (default: `"mammo-local-token"`)
- Wails binding nativo: `window['go']['main']['App']['OpenFileDialog']()`

---

## Prompt pronto para copiar na próxima sessão

```
Vamos continuar o desenvolvimento do projeto AIdentify (mamografia-bi-rads-ia).

Contexto: projeto desktop de IA para mamografia BI-RADS com Wails v2 + Go + Angular 21 + Python FastAPI.
Todos os 6 planos de arquitetura foram implementados e estão no PR #4:
https://github.com/Cieliocas/mamografia-bi-rads-ia/pull/4

Lê o ficheiro NEXT_SESSION.md na raiz do projeto para o contexto completo.
O roadmap detalhado está em relatorios/ROADMAP_2026-04-29.md.

Próximos passos prioritários:
1. Fix Wails dev mode (wails.json aponta para frontend/ local que não existe)
2. Integrar go-dicom para leitura real de ficheiros .dcm
3. Integrar modelo ONNX real no sidecar Python (apps/ai-engine/)
4. Configurar CI/CD com GitHub Actions

Por onde começamos?
```
