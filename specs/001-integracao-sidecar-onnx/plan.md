# Plano 001 — Integração do sidecar de inferência ONNX

> Implementa `spec.md` desta pasta. Decisão de estratégia já tomada:
> **copiar o sidecar para `apps/ai-engine/` com atribuição de autoria**, em vez de
> submodule ou reimplementação.

---

## Tarefa zero — alinhar o repositório (obrigatória, antes de tudo)

A branch de trabalho `claude/interesting-khayyam-962c0b` está **72 commits atrás**
de `origin/main`, que já contém os planos P–AE, o release v0.1.0, CI/CD, os
decoders JPEG-Lossless/JPEG-LS puro-Go e o export COCO. Planejar ou codar sobre a
branch antiga é retrabalho garantido.

- [ ] **T0.1** `git fetch origin && git checkout -b feat/spec-001-sidecar-onnx origin/main`
      (arquivos não rastreados como `specs/` sobrevivem à troca de branch)
- [ ] **T0.2** Verificar se o único commit exclusivo da branch antiga
      (`a23cc3d4`, WW/WC automático — plano J1) já está contemplado no `main`;
      se não estiver, aplicar via `git cherry-pick`
- [ ] **T0.3** Confirmar que o app sobe a partir do `main`:
      `bash tools/run_desktop_dev.sh --rebuild-go`

## Fase 1 — Trazer o sidecar

- [ ] **T1.1** Clonar `github.com/micaiasdev/mammo-ai-sidecar` fora do repositório
- [ ] **T1.2** Substituir o conteúdo de `apps/ai-engine/` pela estrutura modular:
      `app/{main,config,schemas,security}.py`, `app/routers/`, `app/inference/`,
      `tools/`, `tests/`. O `app/main.py` monolítico atual é removido
- [ ] **T1.3** Preservar `apps/ai-engine/models/.gitkeep`; garantir que o
      `.gitignore` continua bloqueando `*.onnx`
- [ ] **T1.4** Mesclar `requirements.txt`: entra `onnxruntime`, `pydicom`,
      `opencv-python-headless`; **sai** `tensorflow` (não é mais usado em runtime —
      é o principal ganho de peso e tempo de boot)
- [ ] **T1.5** Recriar o venv: `python3 -m venv apps/ai-engine/.venv && .venv/bin/pip install -r requirements.txt`
- [ ] **T1.6** Registrar autoria: cabeçalho de atribuição em `apps/ai-engine/README.md`
      e nota no `README.md` da raiz creditando Micaías Carvalho Vieira e o repo de origem (P: regra 4)

## Fase 2 — Instalar os modelos

- [ ] **T2.1** Extrair de `~/Cielio/IC:IT/mammo.zip` para `apps/ai-engine/models/`:
      `classifier_hybrid.onnx` (119 MB) e `detector_yolo.onnx` (11 MB)
- [ ] **T2.2** Confirmar que `git status` **não** lista os `.onnx` (RNF-04)
- [ ] **T2.3** Registrar SHA-256 dos dois artefatos em `apps/ai-engine/models/CHECKSUMS.txt`
      (versionável, ~100 bytes) para rastreabilidade no relatório

## Fase 3 — Ligar ao Go Core

- [ ] **T3.1** Em `apps/core/internal/infrastructure/guardian/guardian.go`, adicionar
      `MODEL_BACKEND=cascade` ao ambiente do processo do sidecar (RF-08)
- [ ] **T3.2** Conferir que `ai_client/client.go` **não** precisa mudar: os tipos
      `sidecarFinding`/`sidecarResp` já espelham o schema do sidecar novo (CA-08)
- [ ] **T3.3** Revisar `inference_handler.go`: o campo `BBox` só é emitido quando
      `W > 0 || H > 0` — isso já suprime a caixa do achado `assessment`, mas é
      preciso garantir que `Kind` e `ID` sejam propagados para a UI distinguir o tipo
- [ ] **T3.4** Elevar o timeout de readiness do guardian se o carregamento dos
      119 MB do classificador atrasar o primeiro `/health` (a splash aguarda `/readyz`)

## Fase 4 — Verificação

- [ ] **T4.1** Sidecar isolado: `MODEL_BACKEND=cascade AI_SHARED_TOKEN=x python -m uvicorn app.main:app --port 8090`
      e `curl -H "X-Local-Token: x" -d '{"image_path":"..."}' localhost:8090/predict`
- [ ] **T4.2** Executar CA-01 a CA-08 do `spec.md`, registrando saída de cada um
- [ ] **T4.3** Medir latência de 10 inferências e anotar média/desvio — insumo direto
      da Spec 004

---

## Riscos identificados e tratamento

| # | Risco | Onde dói | Tratamento nesta spec |
|---|---|---|---|
| **R1** | `kind:"assessment"` é um tipo que a UI não conhece | Achado invisível ou caixa em (0,0) | Backend propaga `kind`; o tratamento visual é da Spec 002 |
| **R2** | Gate perde ~31% das malignas; sem caixa ≠ negativo | Risco clínico (P4) | Aviso na UI é requisito da Spec 002; aqui o backend preserva o `assessment` que carrega o `P` |
| **R3** | `birads` é heurístico derivado de `P` (P3) | Título do projeto promete suporte a BI-RADS | `notes` do sidecar já traz "BI-RADS heurístico (não validado)" — propagar íntegro até a UI |
| **R4** | Sidecar normaliza DICOM por min-max (casa com o treino); o viewer usa VOI LUT/janelamento (planos V/AD) | IA e radiologista "veem" imagens diferentes | Enviar sempre o caminho do `.dcm` **original** — já é o comportamento (`study.service.ts` manda `currentFilePath()`). **Nunca** enviar o PNG renderizado. Documentar a divergência no relatório |
| **R5** | O sidecar lê o frame 0; o viewer navega frames (`?frame=N`) | Caixas no frame errado em DICOM multi-frame | Nesta entrega: restringir a inferência ao frame 0 e sinalizar na UI quando `frameCount > 1` |
| **R6** | Detector fraco fora do domínio CMMD (mAP ≈ 0 no VinDr) | Limita alegação de generalização | Não é bug a corrigir: é o argumento central do relatório (ver Spec 005) |
| **R7** | 130 MB de `.onnx` fora do git | Distribuição do release | Fora do escopo do fechamento: dev roda local; empacotamento fica como trabalho futuro documentado |
| **R8** | 2–3 s de latência em CPU | UX de bloqueio | Spinner/estado de carregamento na Spec 002; a fila `queue.Queue` já existe no core |

## Arquivos afetados

```
apps/ai-engine/**                                       (substituição integral)
apps/ai-engine/requirements.txt                         (onnxruntime entra, tensorflow sai)
apps/ai-engine/models/CHECKSUMS.txt                     (novo)
apps/ai-engine/README.md                                (novo — atribuição)
apps/core/internal/infrastructure/guardian/guardian.go  (env MODEL_BACKEND)
apps/core/internal/adapters/http/inference_handler.go   (propagar kind/id)
README.md                                               (atribuição de autoria)
docs/ARCHITECTURE.md                                    (TensorFlow/Keras → ONNX Runtime)
CHANGELOG.md                                            (corrigir alegação de YOLOv8)
```
