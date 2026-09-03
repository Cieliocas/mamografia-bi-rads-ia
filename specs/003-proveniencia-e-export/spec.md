# Spec 003 — Proveniência da anotação e exportação para retreino

| Campo | Valor |
|---|---|
| Prioridade | 🟡 Contribuição tecnológica do projeto |
| Janela | D3–D4 (02–03/09) |
| Depende de | Spec 002 |
| Escopo decidido | Gravar e exportar proveniência. **Sem** análise estatística das divergências |

---

## 1. Problema e fundamentação

O relatório de treinamento do detector conclui, com evidência empírica, que o
gargalo não é capacidade de modelo — é **falta de dado anotado**:

1. O aumento de dados offline — que apenas expande e varia o mesmo conjunto
   pequeno — melhorou **todos** os modelos de forma consistente (≈ +0,035 mAP@50).
   Modelos que ganham só com mais variação dos mesmos dados estão famintos por dados.
2. O modelo **maior** (YOLOv11m, mAP@50 0,567) teve desempenho **pior** que os
   menores (YOLOv11n 0,626) — assinatura clássica de overfitting em conjunto pequeno.
3. O conjunto tem apenas vistas MLO, 1047 imagens de treino, 1645 caixas, com
   calcificação sub-representada (570 caixas).

A conclusão do parceiro é que a alavanca mais promissora é **mais dado anotado**.
A conclusão deste projeto é o complemento exato disso: **a ferramenta é a máquina
de produzir esse dado** — e o dado mais valioso que ela pode produzir não é a
anotação isolada, e sim a **divergência** entre o que o modelo detectou e o que o
radiologista de fato marcou como verdade. Correções e falsos positivos são
justamente os exemplos que mais informam um retreino.

Hoje isso é impossível de capturar: `entity.Annotation`
(`apps/core/internal/domain/entity/annotation.go`) **não tem nenhum campo de
origem**, e o `annotation_repository.go` grava `finding_id = ""` fixo. Uma
anotação aceita da IA e uma desenhada do zero são indistinguíveis no banco.

## 2. Objetivo

Fazer com que toda anotação persistida carregue sua proveniência, e que o conjunto
resultante — incluindo a geometria original sugerida pela IA antes da correção
humana — seja exportável em formato consumível por um pipeline de treino.

## 3. Requisitos funcionais

### Proveniência (P6)

- **RF-01** Toda anotação registra `source`: `manual` | `ai_accepted` | `ai_edited`.
- **RF-02** Anotação originada de IA registra `model_id`, `ai_confidence`,
  `ai_kind` e `ai_birads` conforme devolvidos pelo sidecar.
- **RF-03** Anotação originada de IA registra a **geometria original** sugerida
  (`ai_bbox`) — preservada mesmo depois de o radiologista mover ou redimensionar
  a ROI. É este par (sugerido, corrigido) que constitui a divergência.
- **RF-04** Sugestões **rejeitadas** são persistidas como registro próprio, com
  `source: ai_rejected` e sem geometria humana — são os falsos positivos, dado de
  treino tão relevante quanto os aceites.
- **RF-05** Anotações existentes, criadas antes desta mudança, permanecem válidas
  e assumem `source: manual` (migração retrocompatível).

### Exportação

- **RF-06** O export COCO já existente (`ExportCOCO` em
  `application/usecase/export_dataset.go`, plano AC) passa a incluir os campos de
  proveniência em cada anotação.
- **RF-07** Os formatos JSON e CSV também incluem os campos de proveniência.
- **RF-08** A exportação continua sendo uma ação local e explícita do usuário —
  nenhum dado é enviado a lugar nenhum (P1).

## 4. Critérios de aceite

- [ ] **CA-01** Aceitar uma sugestão de IA e salvar produz uma linha com
      `source = 'ai_accepted'`, `model_id` preenchido e `ai_bbox` igual à sugestão.
- [ ] **CA-02** Aceitar, **mover a ROI** e salvar produz `source = 'ai_edited'`
      com `ai_bbox` preservando a geometria **original** e a geometria humana
      refletindo a posição corrigida — as duas distintas na mesma linha.
- [ ] **CA-03** Rejeitar uma sugestão e salvar produz linha com `source = 'ai_rejected'`.
- [ ] **CA-04** Desenhar uma ROI do zero produz `source = 'manual'` sem campos de IA.
- [ ] **CA-05** Abrir um banco criado antes da migração não gera erro; anotações
      antigas aparecem como `manual`.
- [ ] **CA-06** `GET /api/export?format=coco` devolve JSON válido contendo os campos
      de proveniência.
- [ ] **CA-07** `go test ./...` passa, incluindo os testes de repositório existentes.

## 5. Fora de escopo (decisão explícita)

- Cálculo de IoU entre `ai_bbox` e a geometria corrigida.
- Painel, gráfico ou relatório de divergências na interface.
- Qualquer estatística agregada de taxa de aceite/rejeição.
- Empacotamento de "lote de retreino" ou envio ao parceiro.

Estes itens ficam declarados no relatório final como trabalho futuro imediato —
a infraestrutura de captura estará pronta para eles.
