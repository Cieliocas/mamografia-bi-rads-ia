# Desktop Monorepo (Wails + Angular + Go + FastAPI)

Este diretorio contem a aplicacao desktop local/offline do projeto de mamografia BI-RADS.

## Layout

- `apps/ui`: shell desktop com Wails + frontend Angular
- `apps/go-core`: orquestrador local, guardian e proxy
- `apps/ai-engine`: sidecar Python/FastAPI para inferencia
- `build`: arquivos de empacotamento nativo (Wails)
- `tools`: scripts operacionais de execucao/dev

## Contrato de execucao atual

1. UI desktop inicia via Wails.
2. Go Core sobe e faz monitoramento do AI sidecar.
3. UI conversa com Go Core em loopback local.
4. Go Core faz proxy para o AI sidecar.
5. Se sidecar cair, o guardian tenta recuperar automaticamente.

## Como rodar em desenvolvimento

Comando recomendado (fluxo integrado):

```bash
cd /Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia
bash desktop/tools/run_desktop_dev.sh --rebuild-go
```

Esse script:
- compila o Go Core quando necessario
- prepara o venv do AI sidecar
- instala dependencias do frontend
- sobe Wails em modo dev

## Referencias

- Arquitetura: `desktop/docs/ARCHITECTURE.md`
- Script principal: `desktop/tools/run_desktop_dev.sh`
- UI: `desktop/apps/ui/README.md`
- Go Core: `desktop/apps/go-core/README.md`
