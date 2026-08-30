# Spec 005 — Relatório final PIBITI e saneamento da documentação

| Campo | Valor |
|---|---|
| Prioridade | 🔴 Entregável do programa |
| Janela | D5–D6 (04–05/09) |
| Depende de | Specs 001–004 |
| Formato | Mesmo modelo do relatório parcial (`Relatorio_Parcial_PIBITI_Francielio.docx`) |

---

## 1. Contexto

| Item | Valor |
|---|---|
| Programa | PIBITI/CNPq — UFPI |
| Título do plano | Ferramenta de Anotação Semi-Automática de Achados Radiológicos em Mamografias com Suporte à Terminologia BI-RADS |
| Orientador | André Castelo Branco Soares |
| Orientando | Franciélio Evangelista dos Santos Castro |
| Período | set/2025 – ago/2026 |
| Parceria | Micaías Carvalho Vieira (IC) — desenvolvimento e treinamento dos modelos |

## 2. Correções narrativas obrigatórias

O relatório parcial descreve decisões que **mudaram** ao longo do segundo semestre.
O relatório final não pode repeti-las nem escondê-las: ele precisa narrar a
evolução com a justificativa técnica. Cada linha abaixo é uma correção obrigatória.

| Relatório parcial afirmava | Realidade final | Justificativa a registrar |
|---|---|---|
| UI em **Electron + Next.js (Nextron)** | **Wails v2 + Angular** | WebView nativa do SO em vez de Chromium embutido: binário ~8 MB e consumo de memória muito menor — decisivo para processar imagens médicas de alta resolução |
| Inferência por **U-Net** (segmentação) | **Cascata classificador + detector YOLO**, servida em **ONNX Runtime** | Mudança de tarefa: de segmentação para classificação de malignidade seguida de detecção de lesões. ONNX elimina TensorFlow do runtime |
| Métrica-alvo `val_dice_coef` (melhor: 0,5664, CBIS-DDSM) | mAP@50 / mAP@50-95 sobre TOMPEI-CMMD | Métrica de detecção, não de segmentação. A linha U-Net/CBIS-DDSM é registrada como etapa exploratória concluída |
| Próxima rodada de treino "v9" no cluster HPC | Descontinuada | Trabalho de modelagem consolidado no plano de trabalho do parceiro, com modelos já treinados e convertidos |

Além disso, três documentos do repositório contradizem o código e devem ser
corrigidos **antes** de o relatório citá-los:

- `docs/ARCHITECTURE.md` — diz "TensorFlow/Keras, inferência U-Net" e "Angular 18".
- `CHANGELOG.md` v0.1.0 — afirma integração com sidecar YOLOv8, o que só passa a
  ser verdade após a Spec 001.
- `relatorios/STATUS_ATUAL.md`, `ROADMAP_2026-04-29.md`, `NEXT_SESSION.md` —
  congelados em abril/maio, descrevem um estado morto.

## 3. Estrutura do relatório

Seguindo o modelo do parcial (Partes I, II e III):

**1. Introdução** — reaproveitar do parcial, atualizando o objetivo para refletir
a ferramenta efetivamente entregue e integrada.

**2. Revisão de literatura** — manter a base (BI-RADS/ACR, DICOM/NEMA, CBIS-DDSM,
métricas de sobreposição) e acrescentar: Shen et al. (2019) para o classificador,
CMMD/TOMPEI-CMMD via TCIA e Ultralytics YOLO para o detector, além de referência
sobre aprendizado contínuo com anotação humana no laço.

**3. Metodologia** — arquitetura final em três camadas (Wails+Angular / Go Core /
sidecar ONNX), divisão de trabalho entre os dois planos de IC, protocolo de
integração e o protocolo de avaliação da Spec 004.

**4. Resultados e discussão** — quatro blocos:

- **4.1 A ferramenta entregue.** Release v0.1.0, ~184 commits, mais de 30 planos
  de evolução. Viewer DICOM com janelamento WW/WC, VOI LUT, multi-frame e grid de
  até 6 viewports; **decoders JPEG-Lossless (SOF3) e JPEG-LS (LOCO-I) escritos em
  Go puro, sem dependência de DCMTK** — contribuição técnica autônoma e não trivial;
  ferramentas de marcação (ROI, régua calibrada em mm, seta, pincel, lupa); notas
  de voz por achado; densidade ACR; comparação temporal com timeline BI-RADS;
  laudo PDF e HTML com imagem anotada; backup/restauração SQLite; CI/CD
  multiplataforma; instalador macOS e Windows.
- **4.2 Integração com os modelos.** A cascata, os dois artefatos ONNX, o contrato
  HTTP, o desenho da fronteira entre os dois planos de IC, e as métricas dos
  modelos **atribuídas ao parceiro**.
- **4.3 Avaliação da aplicação.** Os números da Spec 004, com as ressalvas
  obrigatórias daquela spec.
- **4.4 Captura de divergência para retreino.** A contribuição tecnológica:
  fundamentar com a evidência de escassez de dados do relatório do parceiro
  (augmentation ajuda todos os modelos; o modelo maior perde para os menores;
  só MLO, calcificação sub-representada), mostrar que a ferramenta grava o par
  (sugerido, corrigido) e exporta em COCO, e declarar o retreino como próximo passo.

**5. Conclusão** — objetivos cumpridos, limitações honestas, trabalhos futuros:
validação com radiologistas, retreino com o dado coletado, análise das divergências,
empacotamento dos modelos no instalador.

**6. Referências** — as do parcial mais as novas.

**Parte III** — demais atividades do período.

## 4. Requisitos

- **RF-01** Toda afirmação sobre o estado do software é verificável no repositório
  na data da entrega. Nada aspiracional descrito no presente.
- **RF-02** Autoria dos modelos atribuída a Micaías Carvalho Vieira em todas as
  menções; métricas dos modelos atribuídas ao conjunto de validação dele.
- **RF-03** Limitações declaradas explicitamente: gate com sensibilidade ≈ 0,69,
  BI-RADS heurístico, detector fraco fora do domínio CMMD, ausência de validação
  clínica, análise por imagem e não por mama.
- **RF-04** Figuras: arquitetura em três camadas, capturas do ciclo semiautomático
  (Spec 004, E-03), gráfico comparativo dos detectores (do relatório do parceiro,
  atribuído).
- **RF-05** Nenhuma imagem ou dado identificável de paciente (P1).

## 5. Critérios de aceite

- [ ] **CA-01** Relatório completo no modelo oficial, Partes I–III.
- [ ] **CA-02** Todas as correções narrativas da seção 2 aplicadas.
- [ ] **CA-03** `docs/ARCHITECTURE.md` e `CHANGELOG.md` corrigidos no repositório.
- [ ] **CA-04** `relatorios/` desatualizados arquivados ou marcados como históricos.
- [ ] **CA-05** Nenhuma alegação não verificável no código na data da entrega.
- [ ] **CA-06** Revisão de leitura pelo orientador antes do envio.

## 6. Tarefas de saneamento da documentação

- [ ] **T-01** `docs/ARCHITECTURE.md`: sidecar → FastAPI + ONNX Runtime (cascata
      classificador + YOLO); Angular 18 → 21; atualizar diagrama e política de modelos
- [ ] **T-02** `CHANGELOG.md`: corrigir a alegação de YOLOv8 na v0.1.0 e abrir a
      seção da versão que entrega a integração real
- [ ] **T-03** `README.md`: seção de créditos com a parceria e o repositório de origem
- [ ] **T-04** `relatorios/STATUS_ATUAL.md`: reescrever como estado real ou marcar
      como documento histórico congelado
- [ ] **T-05** Remover ou marcar como obsoletos `NEXT_SESSION.md` e
      `ROADMAP_2026-04-29.md`, cujo conteúdo já foi superado
- [ ] **T-06** `docs/plans/README.md`: apontar para `specs/` como metodologia vigente
