# Resultados — Avaliação técnica da aplicação integrada

**Data da execução:** 2026-08-30
**Ambiente:** macOS 25.5 (Apple Silicon, arm64) · Go 1.25.4 · Python 3.14.0 · onnxruntime 1.29.0
**Versão avaliada:** `feat/spec-001-sidecar-onnx` @ `98c0c526` (specs 001–003 concluídas)
**Dados brutos:** [`dados/medicoes.csv`](dados/medicoes.csv) · instrumento: [`dados/bateria.py`](dados/bateria.py)

---

## 1. Conjunto de teste — e sua limitação

| Tipo | N | Origem |
|---|---:|---|
| Mamografias reais (MG) | **4** | Exame clínico completo, Siemens Mammomat Inspiration, 2800×3518, 12 bits, MONOCHROME2, não comprimidas. Vistas RCC, LCC, RMLO, LMLO de uma paciente |
| Fixtures DICOM comprimidos | 2 | JPEG-LS 168×168 do repositório — exercitam o decoder puro-Go (planos W/AE) |
| **Total** | **6** | |

> **A spec pede N ≥ 20. Foram obtidas 4 mamografias, de um único exame e de um
> único caso — negativo.** Todos os números abaixo são válidos para o que medem,
> mas nenhum deles é estatística. Ver §6.

O laudo do exame conclui: *achados benignos*, *"Não se observam
nódulos, calcificações suspeitas ou distorções arquiteturais"*, **"Classificação
final ACR BI-RADS®: Categoria 2"**.

## 2. Desempenho do sistema

### 2.1 Latência ponta a ponta (RF-03, RF-04)

Cinco repetições por imagem, CPU, sem GPU.

| Imagem | Dimensões | Abrir + registrar | Renderizar preview | Inferência (média ± σ) |
|---|---:|---:|---:|---:|
| R-CC | 2800×3518 | 96 ms | 221 ms | 566 ± 47 ms |
| L-CC | 2800×3518 | 105 ms | 208 ms | 516 ± 2 ms |
| R-MLO | 2800×3518 | 91 ms | 245 ms | 523 ± 6 ms |
| L-MLO | 2800×3518 | 110 ms | 234 ms | 532 ± 11 ms |
| JPEG-LS a | 168×168 | 3 ms | 1 ms | 522 ± 5 ms |
| JPEG-LS b | 168×168 | 2 ms | 2 ms | 535 ± 3 ms |

**Mamografias reais:** abertura **100 ms**, render **227 ms**, inferência **534 ms**
(mín. 516, máx. 566).

Duas leituras:

- **O ciclo abrir → exibir → inferir fecha em menos de 1 s** numa imagem de
  9,8 megapixels. O RNF-01 da Spec 001 (≤ 5 s) é atendido com folga de 9×.
- **A latência de inferência independe do tamanho da imagem** (534 ms em 9,8 MP
  contra 528 ms em 0,03 MP). Era esperado: a cascata reamostra para dimensões
  fixas — 1152×896 no classificador, 1280×1280 no detector. O custo é do modelo,
  não da imagem.

### 2.2 Boot e distribuição (RF-06)

| Métrica | Valor |
|---|---|
| Boot até `/readyz` pronto (Go Core + sidecar + 124 MB de ONNX) | **0,81 s** |
| Binário do Go Core | 37 MB |
| Artefatos ONNX | 113 MB (classificador) + 11 MB (detector) |
| Ambiente Python do sidecar | 311 MB |

### 2.3 Memória residente (RF-05)

| Momento | Sidecar Python | Go Core |
|---|---:|---:|
| Após boot, 0 inferências | 346 MB | 12 MB |
| Após 1 inferência | 1026 MB | — |
| Após 5 inferências | 1617 MB | — |
| Após 10 inferências | 1617 MB | — |
| Após 20 inferências | 1551 MB | — |

**Não há vazamento.** A memória sobe na primeira inferência, estabiliza em torno
de 1,6 GB e não cresce depois — é a arena de trabalho que o ONNX Runtime aloca e
reaproveita. O Go Core permanece em 12 MB, coerente com a escolha de Wails sobre
Electron.

**É, ainda assim, uma restrição real de implantação:** ~1,6 GB em regime só para
o motor de inferência. Numa estação clínica modesta isso precisa ser previsto.

## 3. Comportamento da cascata (RF-07 a RF-10)

| Métrica | Resultado |
|---|---|
| Gate acionado (`P ≥ 0,11`) | **0 de 4** mamografias |
| Achados com caixa | **0** |
| Apenas `assessment` (nível-imagem) | **4 de 4** |
| `P(maligno)` | mín. 0,004 · máx. 0,034 · média 0,015 |
| BI-RADS heurístico atribuído | **2** nas quatro vistas |
| `model_id` | `cascade-hybrid-yolo11n-onnx` em todas |

### 3.1 Concordância com o laudo

**A IA classificou BI-RADS 2 nas quatro incidências; o radiologista concluiu ACR
BI-RADS 2.** Concordância completa neste exame.

Três ressalvas que precisam acompanhar esse enunciado sempre:

1. **n = 1 paciente, 4 imagens.** Não é evidência estatística de concordância.
2. **É um caso negativo.** Concordar num exame benigno **não testa sensibilidade**,
   que é a fraqueza conhecida do gate (≈ 0,69 no CMMD). O gate fechar aqui é o
   caso fácil; o caso difícil — malignidade que o classificador não sinaliza —
   não foi exercitado por não haver exame positivo disponível.
3. **A faixa BI-RADS coincide por construção:** o mapeamento heurístico é
   `P < 0,10 → "2"`. Não é um classificador BI-RADS.

### 3.2 O detector permanece silencioso mesmo forçado

Com o gate aberto (`GATE_THRESHOLD=0,0`) e o limiar de detecção reduzido a
`DET_CONF=0,005`, o detector **continuou sem emitir nenhuma caixa** nas quatro
imagens.

Isso é o comportamento desejável num exame normal — o modelo não inventou
achados. Mas implica que, **com este conjunto, nada sobre a qualidade de detecção
pode ser afirmado**, em nenhuma direção.

## 4. Ciclo semiautomático e proveniência (RF-11, RF-12)

**RF-11 não é mensurável neste conjunto.** Taxas de aceite, edição e rejeição
exigem sugestões com região, e a cascata não produziu nenhuma. O ciclo foi
verificado funcionalmente na Spec 002 usando o backend `mock` sobre a mamografia
real exibida — ver [`002-ciclo-semiautomatico/verificacao.md`](../002-ciclo-semiautomatico/verificacao.md).

**RF-12 verificado.** As quatro origens gravam e exportam corretamente. Exemplo
pseudonimizado em [`dados/exemplo_export_coco.json`](dados/exemplo_export_coco.json):

| `source` | Geometria humana | `ai_bbox` |
|---|---|---|
| `manual` | (980, 1420, 260, 240) | — |
| `ai_accepted` | (734, 867, 175, 165) | (734, 867, 175, 165) |
| `ai_edited` | (812, 905, 210, 158) | **(734, 867, 175, 165)** |
| `ai_rejected` | — | (1200, 400, 60, 55) |

A linha `ai_edited` é a que carrega informação nova: a diferença entre as duas
geometrias é a correção do radiologista sobre o modelo. As rejeições saem fora de
`annotations`, em `ai_rejected`, para não virarem rótulo falso.

## 5. Robustez (RF-13, RF-14)

| Suíte | Resultado |
|---|---|
| `go test ./...` | 5 pacotes ok |
| `pytest` (sidecar) | 24 testes |
| `ng test` (frontend) | 46 testes |
| `ng build --configuration production` | limpo, 493 kB inicial |
| Critérios de aceite das Specs 001–003 | 23 de 23 verificados |

### Defeitos encontrados durante a avaliação

| Defeito | Estado |
|---|---|
| DICOM comprimido produzia veredito confiante sobre frame preto | Corrigido (Spec 001) |
| DICOM sem extensão invisível no navegador de arquivos | Corrigido (Spec 001, adendo) |
| CSV emitia a string literal `<nil>` em células vazias | Corrigido (Spec 003) |
| COCO serializava `"annotations": null` em export vazio | Corrigido nesta avaliação |
| `ON CONFLICT` do `Save` não atualiza `study_id` — uma anotação não migra entre estudos | **Aberto.** Sem efeito prático: ids são UUID por estudo. Registrado |
| Painel de arquivos não navega para o diretório-pai | **Aberto.** Contornável pelo seletor nativo |

## 6. Ressalvas obrigatórias

Estas acompanham qualquer número deste documento. Omiti-las tornaria o relato
enganoso.

1. **O operador é o desenvolvedor, não um radiologista.** As medições descrevem o
   comportamento do sistema, **não** acurácia clínica.
2. **Não há validação clínica.** Nenhuma métrica aqui é sensibilidade,
   especificidade ou acurácia diagnóstica.
3. **As métricas de qualidade dos modelos** (mAP@50 = 0,626; mAP@50-95 = 0,315)
   são do conjunto de validação de **Micaías Carvalho Vieira**, sobre TOMPEI-CMMD,
   e não deste teste. Devem ser sempre atribuídas.
4. **O detector é fraco fora do domínio CMMD.** Este exame é de outro equipamento
   e outra população; desempenho fraco seria esperado e não indicaria falha de
   integração.
5. **A divergência de normalização permanece:** o sidecar normaliza o DICOM por
   min-max, casando com o treino; o viewer exibe com VOI LUT e janelamento. A IA
   e o radiologista analisam representações diferentes da mesma imagem.
6. **CA-01 da spec não foi atendido** (N ≥ 20). Este documento reporta N = 4
   mamografias reais.

## 7. O que falta para fechar a avaliação

| Item | Necessário |
|---|---|
| N ≥ 20 imagens | 16 mamografias adicionais |
| **Ao menos um exame com achado positivo** | Sem ele, a única coisa demonstrável do detector é que ele fica quieto quando deve — metade do sistema |
| Taxas de aceite/edição/rejeição (RF-11) | Depende do item acima |
| Latência com GPU | Fora de escopo (o app é CPU-only por design offline) |

O protocolo é reexecutável: `python3 dados/bateria.py saida.csv` com o Go Core no ar.
