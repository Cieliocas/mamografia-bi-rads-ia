# AI Sidecar — FastAPI + ONNX Runtime

Serviço local de inferência do AIdentify Desktop. Loopback (`127.0.0.1`),
autenticação por `X-Local-Token`, offline-first. Subido automaticamente pelo Go
Core (guardian) via `python -m uvicorn app.main:app`.

---

## Créditos e proveniência

> Os **modelos de IA e este sidecar de inferência** são autoria de
> **Micaías Carvalho Vieira**, desenvolvidos no âmbito do seu plano de iniciação
> científica, e integrados aqui a partir de
> [`micaiasdev/mammo-ai-sidecar`](https://github.com/micaiasdev/mammo-ai-sidecar).
>
> O AIdentify (aplicação desktop, anotação e integração) é o plano de trabalho
> PIBITI/CNPq de **Franciélio Evangelista dos Santos Castro**.
> Orientação: **André Castelo Branco Soares** — UFPI.

### Modificações locais em relação ao repositório de origem

| Arquivo | Mudança | Motivo |
|---|---|---|
| `app/routers/predict.py` | `/predict` responde **422** quando não decodifica a imagem **e** há modelo real carregado | Antes, o frame preto 512×512 de fallback fazia a cascata devolver um veredito "benigno" confiante sobre uma imagem que ninguém leu — resposta silenciosamente errada. O fallback permanece em modo mock, do qual dev e CI dependem |
| `requirements.txt` | `pylibjpeg`, `pylibjpeg-libjpeg`, `pyjpegls` | Sem esses plugins o pydicom não descomprime DICOM JPEG-LS / JPEG Lossless. O Go Core tem decoders próprios em Go puro (planos W/AE), mas o sidecar lê o `.dcm` original direto do disco e precisa dos seus |
| `tests/test_main.py` | Classe `TestUndecodableImageWithRealModel` | Trava de regressão para a mudança acima |

Mudanças a propor de volta ao repositório de origem.

---

## Backends de inferência (`MODEL_BACKEND`)

| Valor | Descrição |
|---|---|
| `cascade` | **Padrão em produção** (definido pelo Go Core). Classificador de malignidade → gate → detector YOLO, em ONNX Runtime. Cai para `mock` se os `.onnx` faltarem |
| `mock` | Dois achados sintéticos; `model_loaded=false`. Usado em CI e no desenvolvimento da UI sem os pesos |

Variáveis: `GATE_THRESHOLD` (0.11), `DET_CONF` (0.25), `DET_IMGSZ` (1280),
`CLASSIFIER_ONNX`, `DETECTOR_ONNX`, `AI_SHARED_TOKEN`, `MODEL_ID`.

## Instalar os modelos

Os `.onnx` (~124 MB) **não são versionados**. Coloque-os em `models/` e confira:

```bash
cd apps/ai-engine/models && shasum -a 256 -c CHECKSUMS.txt
```

## Rodar isolado

```bash
MODEL_BACKEND=cascade AI_SHARED_TOKEN=<token> .venv/bin/python -m uvicorn app.main:app --port 8090
```

Em uso normal não é preciso: o Go Core sobe o sidecar sozinho.

## Testes

```bash
.venv/bin/python -m pytest tests/ -v
```

Rodam em modo mock — não precisam dos `.onnx`.

---

> ⚠️ **Apoio, não diagnóstico.** Modelos de pesquisa, não validados clinicamente.
> O `birads` é heurístico (faixa derivada da probabilidade de malignidade), não um
> classificador BI-RADS validado. O gate tem sensibilidade ≈ 0,69 no CMMD —
> **ausência de caixa não significa ausência de lesão**. O detector é fraco fora
> do domínio CMMD.
