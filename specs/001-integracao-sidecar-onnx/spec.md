# Spec 001 — Integração do sidecar de inferência ONNX

| Campo | Valor |
|---|---|
| Prioridade | 🔴 Bloqueante — todas as demais specs dependem desta |
| Janela | D1 (31/08) |
| Autoria do artefato integrado | Micaías Carvalho Vieira — `github.com/micaiasdev/mammo-ai-sidecar` |

---

## 1. Problema

`apps/ai-engine/app/main.py` devolve **dois achados sintéticos fixos** (`mass`
BI-RADS 3 @ 61%, `calcification` BI-RADS 2 @ 88%) em toda inferência. O caminho de
código que carregaria um modelo real espera um `.keras` de U-Net que não existe no
repositório e cuja linha de treino foi abandonada.

Consequência: o botão "Rodar IA" da aplicação **nunca executou inferência real**.
O `CHANGELOG.md` v0.1.0 afirma existir integração com YOLOv8 — isso hoje é falso e
precisa ser corrigido ou tornado verdadeiro. Esta spec o torna verdadeiro.

## 2. Objetivo

Substituir o sidecar mock pela cascata ONNX real desenvolvida no plano de trabalho
de Micaías, de modo que o AIdentify execute inferência genuína, offline, sobre
arquivos DICOM, sem alterar o contrato HTTP já consumido pelo Go Core.

## 3. Contexto — o que está sendo integrado

Pipeline em cascata servido por ONNX Runtime (sem TensorFlow nem PyTorch em runtime):

1. **Classificador de malignidade (gate)** — `classifier_hybrid.onnx` (119 MB).
   Arquitetura e pesos de Shen et al. (2019), *Deep Learning to Improve Breast
   Cancer Detection on Screening Mammography*, Scientific Reports 9:12495 —
   patch-classifier VGG16 com topo residual, treinado no INbreast. Estima
   `P(maligno)` para a imagem inteira.
2. **Gate** — se `P ≥ GATE_THRESHOLD` (padrão 0,11), aciona o detector.
3. **Detector de lesão** — `detector_yolo.onnx` (11 MB). YOLOv11n (Ultralytics)
   treinado no TOMPEI-CMMD (anotações de segmentação sobre o CMMD — *The Chinese
   Mammography Database*, via TCIA), vistas MLO, classes massa e calcificação,
   com aumento de dados offline. NMS embutido no export.

Desempenho reportado pelo autor no conjunto de validação por paciente (260 imagens):

| Modelo | Condição | mAP@50 | mAP@50-95 | P | R |
|---|---|---:|---:|---:|---:|
| **YOLOv11n** | **com aumento** | **0,626** | **0,315** | 0,704 | 0,534 |
| YOLOv11n | base | 0,589 | 0,288 | 0,621 | 0,527 |
| YOLOv8n | com aumento | 0,624 | 0,300 | 0,666 | 0,578 |
| YOLOv8s | com aumento | 0,608 | 0,300 | 0,656 | 0,582 |
| YOLOv11m | referência de porte | 0,567 | 0,269 | — | — |

O contrato HTTP do sidecar já foi escrito **contra** o cliente Go deste repositório
(`apps/core/internal/adapters/ai_client/client.go`). Endpoints, nomes de campo e
resolução do token são idênticos aos atuais — a substituição não exige mudança
no Go Core.

## 4. Requisitos funcionais

- **RF-01** O sidecar expõe `GET /health`, `POST /predict` e `POST /predict-upload`
  com o mesmo schema `FindingResponse` já consumido pelo Go Core.
- **RF-02** `POST /predict` recebe `{image_path, study_id?}`, lê o arquivo do disco
  e aceita PNG, JPEG e **DICOM** (via pydicom).
- **RF-03** Todos os endpoints exceto `/health` exigem `X-Local-Token`; token
  ausente ou inválido devolve `401`.
- **RF-04** O token é resolvido na ordem: env `AI_SHARED_TOKEN` → arquivo
  `~/.mammo-desktop/.token` (escrito pelo Go Core) → string vazia.
- **RF-05** `MODEL_BACKEND=cascade` ativa a inferência real; ausência da variável
  ou ausência dos `.onnx` faz o serviço cair para `mock` automaticamente.
- **RF-06** Um terceiro tipo de achado, `kind: "assessment"`, representa avaliação
  nível-imagem sem localização — `bbox` zerada, `confidence` = `P(maligno)`.
- **RF-07** `model_id` identifica a cascata real (`cascade-hybrid-yolo11n-onnx`)
  e permite distinguir resultado real de mock a jusante.
- **RF-08** O Go Core sobe o sidecar com `MODEL_BACKEND=cascade` por padrão, sem
  intervenção manual do usuário.

## 5. Requisitos não funcionais

- **RNF-01** Latência aceitável: ≤ 5 s por imagem em CPU (o autor reporta 2–3 s).
- **RNF-02** Sem qualquer acesso de rede além de `127.0.0.1` (P1).
- **RNF-03** Degradação graciosa: sidecar ausente ou em falha não derruba o app —
  o comportamento de `ai_engine: down/disabled` já existente é preservado.
- **RNF-04** Os `.onnx` (130 MB somados) permanecem fora do controle de versão.

## 6. Critérios de aceite

- [ ] **CA-01** `GET /health` com os `.onnx` presentes devolve `model_loaded: true`.
- [ ] **CA-02** `POST /predict` sobre um DICOM real de mama com achado devolve pelo
      menos um `finding` com `bbox` de área não nula e `model_id` da cascata.
- [ ] **CA-03** `POST /predict` sobre um caso em que o gate fecha devolve
      exatamente um achado `kind: "assessment"` com `bbox` zerada.
- [ ] **CA-04** Requisição sem `X-Local-Token` devolve `401`.
- [ ] **CA-05** Com os `.onnx` removidos, o serviço sobe em modo mock sem erro e
      `model_loaded` é `false`.
- [ ] **CA-06** `go test ./...` em `apps/core` e `pytest` em `apps/ai-engine` passam.
- [ ] **CA-07** A inferência dispara pela UI do AIdentify (botão "Rodar IA") sem
      nenhum passo manual de terminal, com o app iniciado por `run_desktop_dev.sh`.
- [ ] **CA-08** Nenhuma alteração foi necessária em `ai_client/client.go` — ou, se
      foi, está justificada e o contrato continua espelhado nos dois lados (P5).

## 7. Fora de escopo

- Retreino, fine-tuning ou troca de arquitetura dos modelos.
- Conversão dos artefatos `.pb`/`.pt` para ONNX — já feita pelo autor
  (`tools/convert_classifier.py` reporta paridade TF↔ONNX = 0,0).
- Agregação CC+MLO por mama (a análise é por imagem).
- Ajuste do `GATE_THRESHOLD` com base em dados próprios.
