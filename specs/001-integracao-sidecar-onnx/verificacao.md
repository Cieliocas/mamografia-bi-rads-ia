# Verificação — Spec 001

**Data:** 2026-08-30 · **Branch:** `feat/spec-001-sidecar-onnx` (a partir de `origin/main` @ `0574d24e`)
**Ambiente:** macOS arm64 (Apple Silicon), Go 1.25.4, Python 3.14.0, onnxruntime 1.29.0

---

## Critérios de aceite

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| CA-01 | `/health` com `.onnx` → `model_loaded: true` | ✅ | `{"status":"ok","model_loaded":true}` |
| CA-02 | `/predict` devolve achado com `bbox` de área não nula | ✅ | `kind=mass conf=0.640 bbox=(734,867,175,165)` pelo pipeline completo |
| CA-03 | Gate fechado → um único `assessment` sem caixa | ✅ | `kind=assessment birads=2 conf=0.016`, `bbox` omitida pelo handler |
| CA-04 | Sem `X-Local-Token` → `401` | ✅ | sem token → 401; token errado → 401; correto → 200 |
| CA-05 | Sem os `.onnx` → cai para mock sem erro | ✅ | `model_loaded=false`, `model_id=unet-mammo-mock-v1` |
| CA-06 | `go test ./...` e `pytest` passam | ✅ | Go: 5 pacotes ok · Python: **24 passed** |
| CA-07 | Inferência dispara pela UI, sem terminal | ✅ | `POST /api/tasks/predict → 202` após clique em "Rodar IA" |
| CA-08 | `ai_client.go` sem mudança de contrato | ✅ | Cast direto de `kind`; só a mensagem de erro melhorou |

Extra: `ng build --configuration production` compilou sem erro (493 kB inicial).

## Medições

Latência da cascata completa (classificador + detector), CPU, n=10:

| Cenário | Média | Desvio | Mín | Máx |
|---|---:|---:|---:|---:|
| Imagem em resolução clínica (3328×4096) | **844 ms** | 121 | 696 | 1124 |
| Fixture pequeno, gate fechado (só classificador) | 523 ms | 25 | 499 | 573 |
| Fixture pequeno, cascata completa | 658 ms | 49 | 606 | 761 |

- **RNF-01 (≤ 5 s): atendido com folga.** O autor reportava 2–3 s/imagem; a
  diferença é hardware (Apple Silicon).
- **Boot até `model_loaded: true`: 0,45 s.** O ONNX Runtime mapeia os pesos sob
  demanda — **T3.4 dispensado**, nenhum timeout de readiness precisou subir.

## Defeito encontrado e corrigido (fora dos riscos R1–R8 previstos)

**Resposta silenciosamente errada em DICOM comprimido.**

O pydicom não descomprime JPEG-LS nem JPEG Lossless sem plugin, e o
`_read_image` do sidecar engolia a exceção e devolvia um frame preto 512×512.
A cascata então rodava sobre pixels pretos e respondia com confiança:

```
antes:  jpegls_lossless.dcm → P=0.009  ("benigno", sobre frame preto)
depois: jpegls_lossless.dcm → P=0.016  (pixels reais)
```

Grave porque o Go Core **tem** decoders JPEG-LS e JPEG Lossless em Go puro
(planos W e AE) e abre esses arquivos sem problema — a UI mostraria a imagem
corretamente enquanto a IA opinava sobre um retângulo preto. Nada na resposta
indicava a falha.

Correção em duas partes:

1. `pylibjpeg`, `pylibjpeg-libjpeg` e `pyjpegls` entram no runtime do sidecar.
2. `/predict` responde **422** quando não decodifica **e** há modelo real
   carregado. O frame de fallback permanece só em modo mock, do qual dev e CI
   dependem. Coberto por `TestUndecodableImageWithRealModel`.

## Ressalvas honestas sobre esta verificação

1. **Não há mamografia real na máquina.** CA-02 foi verificado com um alvo
   sintético (elipse de fundo + massa circular difusa) — o detector localizou a
   estrutura corretamente (desenhada em (820,950) r=70; devolvida a caixa
   (734,867)–(909,1032)), o que prova o **caminho** da caixa, não acurácia clínica.
2. Os fixtures DICOM do repositório são imagens de teste PT 168×168, não
   mamografias. O gate fechar neles não significa nada clinicamente.
3. CA-02 exigiu `GATE_THRESHOLD=0.0 DET_CONF=0.01` para forçar o detector.
   **A configuração padrão foi restaurada** ao final.
4. Latência em resolução clínica usou imagem sintética de ruído, não uma
   mamografia — o custo de decodificação de um DICOM real pode ser maior.

**Conjunto de teste real com N ≥ 20 mamografias é pré-requisito da Spec 004.**

## Estado ao final

- Sidecar em `cascade` por padrão, subido pelo guardian sem intervenção.
- Pesos instalados em `apps/ai-engine/models/`, fora do git, com `CHECKSUMS.txt`.
- `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `README.md` e `apps/ai-engine/README.md`
  refletem a realidade do código (constituição, regra 2).
- TensorFlow deixou de ser dependência de runtime.

---

## Adendo — 30/08, primeiras mamografias reais

Chegou um exame real (export de CD, Siemens Mammomat Inspiration): **4 incidências
MG de 3518×2800, 12 bits, MONOCHROME2, Explicit VR Little Endian (não comprimidas)**
— RCC, LCC, RMLO e LMLO de uma paciente.

### Concordância com o laudo

| Incidência | `kind` | P(maligno) | BI-RADS da IA |
|---|---|---:|---|
| R-CC | assessment | 0,010 | 2 |
| L-CC | assessment | 0,034 | 2 |
| R-MLO | assessment | 0,004 | 2 |
| L-MLO | assessment | 0,012 | 2 |

O laudo do radiologista conclui: *achados benignos*, *sem nódulos, calcificações
suspeitas ou distorções arquiteturais*,
**"Classificação final ACR BI-RADS® : Categoria 2"**.

**A IA classificou BI-RADS 2 nas quatro incidências — concordância com o laudo.**

Ressalvas que precisam acompanhar este número em qualquer uso:

1. **n = 1 paciente, 4 imagens.** Não é evidência estatística de nada.
2. **É um caso negativo.** Concordar num exame benigno **não testa sensibilidade**,
   que é justamente a fraqueza do gate (≈ 0,69 no CMMD). O gate fechar aqui é o
   caso fácil; o caso difícil — malignidade que o gate não sinaliza — não foi
   exercitado por falta de exame positivo.
3. A faixa BI-RADS coincide por construção: `P < 0,10 → "2"` no mapeamento
   heurístico. Não é um classificador BI-RADS.

### Latência em mamografia real

3518×2800, cascata completa, n=5: **0,54–0,75 s** (0,54 · 0,54 · 0,55 · 0,66 · 0,75).
Confirma o RNF-01 com dado real, não sintético.

### Correção derivada: DICOM sem extensão não aparecia no app

O exame real expôs um defeito de usabilidade que os fixtures escondiam. O listador
filtrava por extensão (`.dcm/.png/.jpg/.jpeg`), e export de CD e dump de PACS
nomeiam imagens como `<incidência>`, **sem extensão nenhuma** — os quatro arquivos
eram invisíveis no painel.

Renomear os arquivos seria a correção errada: mutila dado clínico original e quebra
o índice `DICOMDIR`, que referencia os nomes. A correção certa é detectar pelo
magic `DICM` no offset 128, como manda o PS3.10.

- `fs_handler.go` passa a expor `is_image`, por extensão ou por magic.
- `DICOMDIR` é excluído explicitamente: carrega o mesmo magic, mas é índice, não imagem.
- `.dicom` entrou no allowlist de extensões, que não o continha.
- O `imageExts` do Go era código morto (quem filtrava era o frontend) — agora é usado.
- Coberto por `TestFsListDetectsExtensionlessDICOM`.

Verificado na API ao vivo: `<incidência>`–`<incidência>` → `is_image: true`;
`VERSION`, `LOCKFILE`, `DICOMDIR` → `false`.

> **Pendente:** confirmação pela UI ficou de fora — o painel de arquivos não tem
> navegação para diretório-pai (só histórico), e o preview em navegador não acessa
> o seletor nativo de pasta. No app Wails real o caminho é "Abrir pasta".

### Dados sensíveis

O exame é de **paciente real e identificável** (iniciais no diretório, laudo em PDF
com dados pessoais). Fica **fora do repositório** e fora de qualquer figura do
relatório sem anonimização — pixels e cabeçalhos DICOM (nome, ID, data de
nascimento, instituição). Ver constituição P1 e Spec 005 RF-05.
