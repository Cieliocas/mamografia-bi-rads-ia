# specs/ — Desenvolvimento Orientado a Especificação (SDD)

Metodologia de trabalho do AIdentify a partir de 2026-08-30, adotada para o
fechamento do PIBITI. Substitui os planos ad-hoc de `relatorios/` e `docs/plans/`.

## Como funciona

Cada unidade entregável vive num diretório numerado com dois documentos:

| Arquivo | Responde | Regra |
|---|---|---|
| `spec.md` | **O quê** e **por quê** | Descreve problema, requisitos e critérios de aceite. Não decide implementação |
| `plan.md` | **Como** | Fases, tarefas verificáveis, riscos, arquivos afetados |

Acima de tudo está [`000-constitution.md`](000-constitution.md): sete princípios
invioláveis. Spec que conflita com a constituição está errada.

Fluxo: **constituição → especificar → planejar → executar → verificar**.
Nada é dado como pronto sem os critérios de aceite conferidos um a um.

Ao concluir, cada spec ganha um `verificacao.md` com o resultado de cada
critério de aceite, medições e ressalvas — é o insumo da Spec 004 e do relatório.

As specs 004 e 005 não têm `plan.md` separado: por serem protocolo de execução e
roteiro de escrita, o "como" já está no próprio `spec.md` (seções *Protocolo* e
*Tarefas de saneamento*).

## Specs do fechamento

| # | Spec | Entrega | Janela | Estado |
|---|---|---|---|---|
| 000 | [Constituição](000-constitution.md) | Princípios e escopo travado | — | ✅ vigente |
| 001 | [Integração do sidecar ONNX](001-integracao-sidecar-onnx/) | Inferência real substitui o mock | D1 · 31/08 | ✅ [verificada](001-integracao-sidecar-onnx/verificacao.md) |
| 002 | [Ciclo semiautomático](002-ciclo-semiautomatico/) | Sugestão desenhada + aceitar/editar/rejeitar | D2–D3 · 01–02/09 | ⬜ |
| 003 | [Proveniência e export](003-proveniencia-e-export/) | Origem da anotação gravada e exportável | D3–D4 · 02–03/09 | ⬜ |
| 004 | [Avaliação técnica](004-avaliacao-tecnica/) | Números e figuras do relatório | D4 · 03/09 | ⬜ |
| 005 | [Relatório final](005-relatorio-final/) | Entregável PIBITI + saneamento dos docs | D5–D6 · 04–05/09 | ⬜ |

**Caminho crítico:** 001 → 002 → 003 → 004 → 005. Nenhuma pode ser paralelizada
com a seguinte, porque cada uma consome o resultado da anterior.

## Estado do projeto em 2026-08-30

Levantamento que originou estas specs:

- `origin/main` está **72 commits à frente** da branch de trabalho
  `claude/interesting-khayyam-962c0b`. O `main` contém os planos P–AE, o release
  v0.1.0, CI/CD, os decoders JPEG-Lossless e JPEG-LS puro-Go e o export COCO.
  **Alinhar com `main` é a tarefa zero da Spec 001.**
- ~~O sidecar de IA nunca executou inferência real~~ — **resolvido na Spec 001**
  (30/08): cascata ONNX real, `model_loaded: true`, 844 ms/imagem em resolução
  clínica. Corrigido no caminho um defeito de resposta silenciosamente errada em
  DICOM comprimido.
- Os achados de IA são exibidos **como texto**, sem desenho sobre a imagem e sem
  ação possível. O ciclo semiautomático, que dá nome ao projeto, é a Spec 002.
- `entity.Annotation` **não tem proveniência**: uma anotação aceita da IA e uma
  desenhada do zero são indistinguíveis no banco. É a Spec 003.
- `docs/ARCHITECTURE.md`, `CHANGELOG.md` e todo o `relatorios/` contradizem o
  código. Saneamento na Spec 005.

## Fora de escopo, decidido

Validação clínica com radiologistas · retreino efetivo dos modelos · análise
estatística das divergências · RIS/PACS, DICOM SR, multi-tenant · fine-tuning ·
novas ferramentas de viewer. Detalhes e justificativas na constituição.

## Divisão de trabalho

| Frente | Responsável |
|---|---|
| Aplicação, integração, anotação, relatório PIBITI | Franciélio Evangelista dos Santos Castro |
| Modelos: treinamento, avaliação, conversão ONNX, sidecar de inferência | Micaías Carvalho Vieira |

Fronteira entre as duas frentes: o contrato HTTP `FindingResponse` — imutável sem
alinhamento bilateral (princípio P5).
