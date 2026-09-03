# Verificação — Spec 003

**Data:** 2026-08-30 · **Branch:** `feat/spec-001-sidecar-onnx`

---

## Critérios de aceite

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| CA-01 | Aceitar + salvar → `ai_accepted` com `model_id` e `ai_bbox` iguais à sugestão | ✅ | `humana=(734,867,175,165)` · `ia=(734,867,175,165)` |
| CA-02 | Aceitar, mover e salvar → `ai_edited` com as duas geometrias distintas | ✅ | `humana=(800,900,200,150)` · `ia=(734,867,175,165)` |
| CA-03 | Rejeitar + salvar → `ai_rejected` | ✅ | `humana=(0,0,0,0)` · `ia=(1200,400,60,55)` |
| CA-04 | ROI do zero → `manual`, sem campos de IA | ✅ | `source=manual`, `ai_bbox` ausente |
| CA-05 | Banco anterior à migração abre sem erro; antigas viram `manual` | ✅ | Verificado no **banco real** (cópia): 40 estudos, 11 anotações, todas `manual` |
| CA-06 | `GET /api/export?format=coco` com proveniência | ✅ | 3 `annotations` + 1 `ai_rejected`, dimensões 2800×3518 lidas do DICOM |
| CA-07 | `go test ./...` passa | ✅ | 5 pacotes ok, incluindo 5 testes novos de proveniência |

Frontend: **46 testes** (41 antes + 5 de `geometryDiffers`).

## Decisão de projeto: rejeição não é rótulo

Uma sugestão rejeitada **não entra em `annotations` do COCO**. Seria um rótulo
falso — dizer ao treino que existe lesão onde o radiologista disse que não há
envenena exatamente o modelo que o dado deveria melhorar.

Mas descartá-la também seria perda: um falso positivo rotulado vale tanto quanto
uma correção. Então ela sai numa chave própria, `ai_rejected`, com a caixa do
modelo e nenhuma geometria humana. Consumidores de COCO ignoram chaves
desconhecidas; um pipeline que saiba usar *hard negatives* encontra o dado lá.

```jsonc
{
  "annotations": [
    { "id": 2, "bbox": [734,867,175,165], "source": "ai_accepted",
      "ai_bbox": [734,867,175,165] },
    { "id": 3, "bbox": [800,900,200,150], "source": "ai_edited",
      "ai_bbox": [734,867,175,165] }   // ← a correção: onde o modelo errou
  ],
  "ai_rejected": [
    { "image_id": 1, "bbox": [1200,400,60,55], "ai_kind": "calc",
      "ai_confidence": 0.28 }          // ← falso positivo rotulado
  ]
}
```

## Como `ai_accepted` vira `ai_edited`

A distinção é feita no cliente, no momento de salvar, comparando a geometria
atual da ROI com `ai_bbox` (`geometryDiffers`, tolerância 0,5 px para absorver
o ruído do arredondamento centro↔canto). Aceitar e mover produz `ai_edited`
sem o usuário declarar nada.

## Persistência da rejeição

Rejeitar emite `annotationsChanged$`, o mesmo sinal que o autosave escuta —
a rejeição é gravada 1,5 s depois, sem depender de o usuário clicar em Salvar.
Sem isso ela morreria na troca de imagem, que é quando o viewport é limpo.

Na releitura do estudo, linhas `ai_rejected` são **filtradas** antes de virarem
ROI: são anotações para retreino, não marcações; voltariam à tela como retângulos
de área zero.

## Defeito encontrado e corrigido

O CSV emitia a string literal `<nil>` nas células dos campos `omitempty` ausentes
(linhas `manual`, que não têm dados de IA). Todo consumidor teria de tratar
`"<nil>"` como caso especial. Agora sai célula vazia.

```
antes:  ...,manual,<nil>,<nil>,<nil>,<nil>,0,0,0,0
depois: ...,manual,,,,,0,0,0,0
```

## Fora de escopo (decisão registrada da spec)

Cálculo de IoU entre `ai_bbox` e a geometria corrigida · painel ou gráfico de
divergências · estatística de taxa de aceite/rejeição · empacotamento de lote de
retreino. A infraestrutura de captura está pronta para todos eles.

## Atenção — LGPD

O export carrega `patient_id`, que vem do **PatientID do DICOM** (identificador
real do paciente no serviço de origem). Um export enviado a terceiros — inclusive
para retreino — precisa de pseudonimização dessa coluna. Constituição P1;
tratamento no relatório final é a Spec 005 RF-05.
