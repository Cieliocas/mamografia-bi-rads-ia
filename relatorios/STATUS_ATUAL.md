# Status Atual do Projeto

> Ponte entre as chat skills (Cluster Trainer, Desktop Builder, Daily Reporter).
> Atualize este arquivo sempre que o estado real mudar.

Ultima atualizacao: 2026-04-19

---

## Stack oficial

| Camada | Tecnologia |
|---|---|
| Desktop shell | Wails v2 + Go 1.22+ |
| Frontend | Angular 18 (standalone) + Tailwind |
| Core local | Go (orquestrador, guardian, proxy) em `desktop/apps/go-core` |
| AI sidecar | Python + FastAPI em `desktop/apps/ai-engine` |
| Modelo de inferencia | `desktop/apps/ai-engine/models/unet_mammo_best.keras` |

Pipelines de treino **nao** sao mais versionados neste repo (removidos em `0c7f4aad`). Apenas o artefato final de inferencia permanece.

---

## Entrypoint unico de desenvolvimento

```bash
cd /Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia
bash desktop/tools/run_desktop_dev.sh --rebuild-go
```

Sobe Go Core, AI sidecar e Wails + Angular no mesmo fluxo. Ha lock anti-duplicata em `/tmp/mammo-desktop-dev.lock`.

Atalho macOS: `Mammo-Desktop-Dev.command` (duplo clique).

---

## Ultimos marcos

- `a5ecd12b` (2026-04-14) — estabilizacao do boot Wails e refresh dos READMEs.
- `1b7fbcb1` — migracao completa para Wails + Angular 18.
- `b685e8c4` — launcher one-click para macOS.
- `54ca0bf3` — pipeline de treino organizado; relatorio 24/03/2026 publicado.
- `0c7f4aad` — remocao da stack de treino do repo (apenas inferencia permanece).

---

## Resultado de treino mais recente

Ver [relatorios/RELATORIO_TREINO_2026-03-24.md](RELATORIO_TREINO_2026-03-24.md).

- Melhor run: `cbis_ddsm_gpu2_wbce_dice_adapt_lr1e4_rot10_zoom010_20260324_v7`
- `val_dice_coef = 0.56645` (epoch 3)
- Checkpoint: `models/<run>/checkpoints/best.keras` (no cluster UFPI)

---

## Frentes abertas

### Desktop
- Validar integracao ponta a ponta (UI -> Go Core -> AI sidecar) com smoke test automatizado.
- Splash temporario deve fechar ao `ready` real; evitar janelas duplicadas.
- Binding Wails `OpenDICOMFile()` para seletor nativo.
- Integracao Cornerstone.js para DICOM real.
- Empacotamento release (`.dmg` macOS / `.exe` Windows) via `wails build`.

### IA / Treino
- Proxima rodada de treino para superar `val_dice = 0.566`.
- Promover melhor checkpoint para `desktop/apps/ai-engine/models/unet_mammo_best.keras` quando estavel.

### Documentacao
- Manter este arquivo como fonte de verdade entre skills.
- Relatorios diarios em `relatorios/RELATORIO_TREINO_YYYY-MM-DD.md`.

---

## Limpeza concluida em 2026-04-19

- Removidos artefatos Electron/Nextron residuais (`desktop/build/electron-builder.yml`, `installer.nsh`).
- `desktop/MONOREPO_STRUCTURE.md` reescrito para refletir o layout Wails + Angular real.
- Mencoes a "Nextron" em READMEs eliminadas (preservada apenas a comparacao "Wails vs Electron" como justificativa de stack).
- Removidos do repo os orfaos da migracao pre-monorepo: `src/ml/`, `scripts/`, `requirements_cluster.txt` (ja gitignored, mas ainda tracked).
- `.gitignore` consolidado: regras mortas sobre arquivos que nao existem mais foram removidas; `aidentify.app/` adicionado.
- Lixo local (fora do git): ~8.4 GB de `data/`, `venv/`, `venv_tf/`, `frontend/` e `.DS_Store` removidos do checkout principal.
- Documentacao consolidada em `docs/` (ARCHITECTURE, RUNBOOK, DESIGN_SYSTEM, CHAT_SKILLS). Removidos 9 READMEs fragmentados (`desktop/README.md`, `desktop/MONOREPO_STRUCTURE.md`, `desktop/docs/`, READMEs de `apps/*`, `build/installer/`, `docs/chat-skills/`).
