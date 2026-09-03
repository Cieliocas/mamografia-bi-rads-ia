# Spec 002 — Ciclo de anotação semiautomática

| Campo | Valor |
|---|---|
| Prioridade | 🔴 Núcleo da proposta do PIBITI |
| Janela | D2–D3 (01–02/09) |
| Depende de | Spec 001 |

---

## 1. Problema

O plano de trabalho aprovado se chama *"Ferramenta de Anotação **Semi-Automática**
de Achados Radiológicos em Mamografias com Suporte à Terminologia BI-RADS"*.

Hoje, em `apps/frontend/src/app/features/annotations/findings-panel.component.html`
(linhas 80–101), os achados da IA são renderizados como **uma lista de texto**:
tipo, BI-RADS, confiança e nota. Não existe:

- desenho da caixa da IA sobre a imagem;
- qualquer ação sobre o achado sugerido;
- caminho de sugestão → ROI editável.

Ou seja: a aplicação é hoje um anotador **manual** competente com um painel de IA
**decorativo**. O ciclo *sugerir → validar → corrigir* — que é a definição de
"semiautomático" e a razão de existir do projeto — não está implementado.

Esta spec entrega esse ciclo. É o item que transforma a entrega numa ferramenta
que corresponde ao próprio título.

## 2. Objetivo

Fechar o laço entre inferência e anotação: o radiologista vê a sugestão da IA
sobre a imagem, e a aceita, corrige ou rejeita com um gesto — produzindo em
qualquer dos três casos uma anotação de verdade validada.

## 3. Requisitos funcionais

### Visualização da sugestão

- **RF-01** Achados com `bbox` de área não nula são desenhados no `overlayCanvas`
  do viewport ativo, na posição correta, respeitando zoom, pan e escala de exibição.
- **RF-02** A sugestão da IA é **visualmente distinta** de uma ROI do radiologista —
  contorno tracejado, para que ninguém confunda sugestão com marcação validada (P3).
- **RF-03** Cada caixa exibe rótulo com `kind` e confiança em porcentagem.
- **RF-04** Achados `kind: "assessment"` (sem localização) são exibidos como
  **faixa nível-imagem** no painel, com a probabilidade — e **nunca** como retângulo.
- **RF-05** As caixas são limpas ao trocar de imagem ou de estudo.

### Ações do radiologista

- **RF-06** **Aceitar** — converte a sugestão em ROI editável do viewport, com
  `kind` e `birads` da IA pré-preenchidos, pronta para ajuste fino e para gravação.
- **RF-07** **Editar** — aceita e imediatamente seleciona a ROI para ajuste de
  geometria e de campos clínicos, preservando o registro da geometria original.
- **RF-08** **Rejeitar** — descarta a sugestão da tela, registrando a rejeição.
- **RF-09** As três ações estão disponíveis por achado, no painel de achados de IA.

### Comunicação de limitações (obrigatória — P2, P3, P4)

- **RF-10** Enquanto houver achados de IA na tela, a interface exibe de forma
  permanente e não descartável: *"Sugestão de IA — apoio, não diagnóstico.
  Modelos de pesquisa não validados clinicamente."*
- **RF-11** Quando o resultado contiver apenas `assessment` (gate fechado), a UI
  informa explicitamente que **a ausência de caixa não significa ausência de lesão**.
- **RF-12** O BI-RADS sugerido pela IA é rotulado como *estimado* e recebe peso
  visual menor que o BI-RADS preenchido pelo radiologista.
- **RF-13** Em DICOM multi-frame, a UI sinaliza que a inferência foi executada
  sobre o primeiro frame (limitação R5 da Spec 001).

### Estado e feedback

- **RF-14** Durante a inferência (2–3 s em CPU) o botão fica em estado de carregamento
  e a UI permanece responsiva.
- **RF-15** Falha de inferência produz toast de erro legível, sem travar o app —
  o serviço de toast já existe (`core/services/toast.service.ts`).

## 4. Critérios de aceite

- [ ] **CA-01** Rodar IA sobre um DICOM com achado desenha a(s) caixa(s) sobre a
      lesão; conferido visualmente em pelo menos **3 DICOMs distintos**.
- [ ] **CA-02** Zoom e pan mantêm a caixa ancorada à lesão (sem deriva).
- [ ] **CA-03** "Aceitar" cria uma ROI selecionável, editável e persistível pelo
      botão Salvar já existente.
- [ ] **CA-04** "Rejeitar" remove a caixa da tela sem criar ROI.
- [ ] **CA-05** Caso com gate fechado exibe faixa de avaliação nível-imagem com a
      probabilidade e **nenhum** retângulo.
- [ ] **CA-06** Os avisos de RF-10 e RF-11 aparecem e não podem ser dispensados.
- [ ] **CA-07** Trocar de imagem limpa as sugestões da tela.
- [ ] **CA-08** `ng build` compila sem erro e sem novos warnings de tipo.

## 5. Fora de escopo

- Aceitar todos os achados de uma vez.
- Ajuste interativo do limiar do gate pela interface.
- Sobreposição de máscara de segmentação (os modelos entregam caixas, não máscaras).
- Comparação lado a lado entre sugestão e anotação salva.
