# Plano 002 — Ciclo de anotação semiautomática

> Implementa `spec.md` desta pasta.

---

## Ponto de atenção — conversão de geometria

Os dois lados usam convenções diferentes e a conversão precisa estar num único lugar:

| Origem | Convenção |
|---|---|
| `FindingResponse.bbox` do sidecar | canto superior-esquerdo + dimensões: `{x, y, w, h}`, em **pixels da imagem-fonte** |
| `ROI` do frontend (`shared/models/types.ts`) | centro + raios: `{x, y, rx, ry, shape}` |

Conversão de aceite:

```
shape = 'rect'
x  = bbox.x + bbox.w / 2
y  = bbox.y + bbox.h / 2
rx = bbox.w / 2
ry = bbox.h / 2
```

O preview do DICOM é renderizado em **resolução nativa** (o `preview_handler.go`
não redimensiona), então os pixels da bbox mapeiam 1:1 no `imgCanvas`. A escala de
exibição já é tratada pelo mesmo caminho que desenha as ROIs — reutilizar essa
transformação, **não** escrever uma nova.

## Fase 1 — Modelo de dados no frontend

- [ ] **T1.1** Em `shared/models/types.ts`, criar `AiFinding` com
      `id, kind, birads, confidence, bbox?, notes` e um estado local
      `status: 'pending' | 'accepted' | 'rejected'`
- [ ] **T1.2** Adicionar `aiFindings` ao estado do viewport (`VP`) para que as
      sugestões pertençam ao viewport e sejam limpas junto com a imagem (RF-05)
- [ ] **T1.3** Em `study.service.ts`, `runInference()` passa a popular o viewport
      ativo além do sinal `latestFindings`

## Fase 2 — Renderização (RF-01 a RF-05)

- [ ] **T2.1** Em `viewer.component.ts`, estender a rotina de desenho do
      `overlayCanvas` com um passo que desenha as sugestões pendentes
- [ ] **T2.2** Estilo distinto: contorno **tracejado** (`setLineDash`), cor derivada
      de `kind`, rótulo `kind · NN%` acima da caixa (RF-02, RF-03)
- [ ] **T2.3** Filtrar achados sem geometria (`w === 0 && h === 0`) do desenho —
      são `assessment` e vão para o painel (RF-04)
- [ ] **T2.4** Redesenhar em zoom, pan e troca de viewport (CA-02)

## Fase 3 — Ações (RF-06 a RF-09)

- [ ] **T3.1** Em `findings-panel.component.html`, substituir o bloco estático das
      linhas 80–101 por cartões com três botões: Aceitar · Editar · Rejeitar
- [ ] **T3.2** `acceptFinding(f)` — converte para ROI pela fórmula acima, pré-preenche
      `birads` e `label` a partir de `kind`, empurra para `state.rois` do viewport
      ativo e marca a sugestão como `accepted`
- [ ] **T3.3** `editFinding(f)` — chama `acceptFinding` e em seguida seleciona a ROI
      criada (`selectedROIId`), levando o usuário direto ao ajuste
- [ ] **T3.4** `rejectFinding(f)` — marca `rejected` e remove do desenho
- [ ] **T3.5** Empilhar a operação no undo/redo por viewport, que já existe

## Fase 4 — Avisos obrigatórios (RF-10 a RF-13)

- [ ] **T4.1** Faixa persistente no topo do painel de achados enquanto houver
      sugestões: *"Sugestão de IA — apoio, não diagnóstico. Modelos de pesquisa
      não validados clinicamente."* — sem botão de fechar (P2)
- [ ] **T4.2** Quando a resposta contiver apenas `assessment`: renderizar a
      probabilidade e o texto *"A ausência de caixa não indica ausência de lesão."* (P4)
- [ ] **T4.3** Sufixo *"(estimado)"* no BI-RADS de IA, em peso visual menor que o
      BI-RADS clínico (P3)
- [ ] **T4.4** Quando `frameCount > 1`, nota de que a inferência usou o frame 1
- [ ] **T4.5** Propagar `notes` do sidecar íntegro — ele já traz
      `"malignancy P=…; BI-RADS heurístico (não validado)"`

## Fase 5 — Estado e robustez

- [ ] **T5.1** Sinal `inferenceRunning`; botão em estado de carregamento (RF-14)
- [ ] **T5.2** Toast de erro no `catchError` já existente do `api.service.ts` —
      hoje a falha é engolida silenciosamente por `of(null)` (RF-15)
- [ ] **T5.3** Executar CA-01 a CA-08 com captura de tela de cada um (as capturas
      alimentam a Spec 005)

## Arquivos afetados

```
apps/frontend/src/app/shared/models/types.ts                          (AiFinding, VP.aiFindings)
apps/frontend/src/app/core/services/study.service.ts                  (runInference, estado)
apps/frontend/src/app/core/services/api.service.ts                    (erro visível)
apps/frontend/src/app/features/viewer/viewer.component.ts             (desenho do overlay)
apps/frontend/src/app/features/annotations/findings-panel.component.* (cartões + ações + avisos)
```
