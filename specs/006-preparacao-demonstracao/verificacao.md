# Verificação — Spec 006

**Data:** 2026-09-02 · **Branch:** `feat/spec-001-sidecar-onnx`

---

## Critérios de aceite

| # | Critério | Resultado |
|---|---|---|
| CA-01 | Modo simulado declarado de forma inequívoca em ≥ 2 pontos | ✅ **cinco** pontos: barra de estado, indicador do painel, duas faixas e as próprias caixas hachuradas com rótulo "SIMULADO" |
| CA-02 | `/readyz` distingue serviço no ar de modelo carregado | ✅ `ai_engine` × `ai_model` (`real` \| `simulated` \| `none`), com `ai_model_reason` |
| CA-03 | Demonstração roda do início ao fim, sem terminal, com modelos reais | ✅ `tools/run_demo.sh` abre o `.app` empacotado com `ai_model: real` |
| CA-04 | Navegar do exame até a raiz do `$HOME` só pela interface | ✅ sete cliques; botão desabilita ao chegar no `$HOME` |
| CA-05 | Export pseudonimizado não contém o PatientID do DICOM | ✅ `<PatientID>` → `P-xxxxxxxxxxxx`; zero ocorrências nos três formatos |
| CA-06 | Suítes passam e build limpo | ✅ Go 5 pacotes · sidecar 24 · frontend 50 · `ng build` limpo |
| CA-07 | Build de release gerado e aberto para teste | ✅ `AIdentify.app`, arm64, 48 MB |

## Diagnóstico por cenário (RF-01)

| Cenário | `ai_model` | Motivo exibido |
|---|---|---|
| tudo presente | `real` | — |
| detector ausente | `simulated` | Modelo não encontrado: detector. |
| ambos ausentes | `simulated` | Modelo não encontrado: classificador e detector. |
| backend em mock | `simulated` | MODEL_BACKEND não está definido como 'cascade'. |
| sidecar fora do ar | `none` | Serviço de IA não respondeu. |

## O `.app` empacotado — o que ele é e o que não é

Confirmado experimentalmente: aberto sozinho, o `AIdentify.app` sobe o Go Core e
a interface, mas **sem IA** (`ai_engine: down`, `ai_model: none`). Ele não
empacota o serviço Python, a venv nem os 124 MB de modelos.

A aplicação se comporta corretamente nessa condição — não exibe nenhum achado,
muito menos sintético. Mas não serve para demonstrar inferência.

`tools/run_demo.sh` resolve para a demonstração desta semana: abre o mesmo `.app`
apontando o serviço de inferência para o repositório, e **recusa abrir** se a
verificação prévia falhar. Verificado: `ai_model: real`.

> Distribuição autocontida — Python embutido e modelos no bundle, passando de
> 500 MB — permanece trabalho futuro declarado. Enquanto isso, a ferramenta é
> demonstrável, mas não entregável a um serviço de radiologia.

## Pendências que permanecem

| Item | Situação |
|---|---|
| Distribuição autocontida | Trabalho futuro; `run_demo.sh` cobre a demonstração |
| JPEG-LS multi-componente entrelaçado | Não implementado; mamografia é monocromática |
| Validação clínica | Fora de escopo do PIBITI; primeira conversa com profissional é justamente esta demonstração |

## Histórico do Git

As figuras derivadas do exame foram removidas do histórico em 2026-09-02, com
autorização do orientando: `filter-branch` sobre `origin/main..HEAD`, seguido de
remoção do backup, expiração do reflog e `gc --prune=now`. Os dois blobs deixaram
de existir no repositório, verificado por `git cat-file -e`. O `main` não foi
tocado. A branch pode ser publicada.
