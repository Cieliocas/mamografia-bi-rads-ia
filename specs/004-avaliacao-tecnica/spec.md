# Spec 004 — Avaliação técnica da aplicação integrada

| Campo | Valor |
|---|---|
| Prioridade | 🟡 Produz os "Resultados" do relatório final |
| Janela | D4 (03/09) |
| Depende de | Specs 001, 002, 003 |

---

## 1. Problema

O relatório final do PIBITI precisa de uma seção de **Resultados**, e a única
seção de resultados que este projeto pode sustentar honestamente é a do **uso da
aplicação como teste** — a validação com radiologistas fica declaradamente para
depois da entrega, sem aprovação ética nem tempo hábil no período.

Sem uma bateria estruturada, o relatório vira descrição de funcionalidades sem
números, o que é fraco para um programa de Desenvolvimento Tecnológico. Com ela,
existem medições reproduzíveis do sistema integrado ponta a ponta.

## 2. Objetivo

Executar uma bateria de teste documentada sobre a aplicação já integrada aos dois
modelos, produzindo métricas de engenharia e de comportamento da cascata que
sustentem a seção de Resultados.

## 3. Protocolo

### Conjunto de teste

- **RF-01** Selecionar **N ≥ 20** imagens de mamografia em DICOM, disponíveis
  localmente, cobrindo: casos com achado esperado, casos sem achado, ao menos um
  DICOM multi-frame e ao menos um com compressão (JPEG-Lossless ou JPEG-LS, para
  exercitar os decoders puro-Go dos planos W e AE).
- **RF-02** Registrar a origem e as características do conjunto. Nenhuma imagem
  identificável entra no relatório sem anonimização.

### Medições — desempenho do sistema

- **RF-03** Latência de inferência por imagem (média, desvio, mínimo, máximo).
- **RF-04** Tempo de abertura e renderização do DICOM até a primeira exibição.
- **RF-05** Consumo de memória residente do app com o sidecar carregado.
- **RF-06** Tamanho do binário distribuível e tempo de boot até `/readyz` pronto.

### Medições — comportamento da cascata

- **RF-07** Taxa de acionamento do gate: em que fração das N imagens
  `P(maligno) ≥ 0,11` e o detector foi de fato executado.
- **RF-08** Número médio de achados com caixa por imagem acionada.
- **RF-09** Distribuição de `confidence` e de `kind` (massa × calcificação).
- **RF-10** Contagem de casos que retornaram apenas `assessment` — a evidência
  direta e mensurável da limitação de sensibilidade do gate (P4).

### Medições — ciclo semiautomático

- **RF-11** Sobre as sugestões com caixa, registrar quantas foram **aceitas**,
  **editadas** e **rejeitadas** pelo operador (o próprio autor, declarado como
  avaliador não-especialista).
- **RF-12** Verificação funcional do registro de proveniência: exportar o conjunto
  e confirmar que aceites, edições e rejeições aparecem corretamente rotulados.

### Verificação de robustez

- **RF-13** Executar o roteiro de aceite das Specs 001–003 e registrar o resultado
  de cada critério.
- **RF-14** Registrar falhas, travamentos e comportamentos inesperados — inclusive
  os que não forem corrigidos, que viram limitações declaradas.

## 4. Entregáveis

- **E-01** `specs/004-avaliacao-tecnica/resultados.md` — protocolo executado,
  tabelas de medição e observações qualitativas.
- **E-02** Planilha ou CSV bruto das medições por imagem, para rastreabilidade.
- **E-03** Capturas de tela do ciclo completo: imagem aberta → inferência →
  sugestão desenhada → aceite → ROI editada → laudo. São as figuras do relatório.
- **E-04** Um export COCO de exemplo, com proveniência, anexado como evidência
  da Spec 003.

## 5. Critérios de aceite

- [ ] **CA-01** N ≥ 20 imagens processadas com a cascata real, sem mock.
- [ ] **CA-02** Todas as métricas RF-03 a RF-11 preenchidas em `resultados.md`.
- [ ] **CA-03** Ao menos 5 capturas de tela de qualidade publicável.
- [ ] **CA-04** Limitações observadas registradas com honestidade, incluindo as
      que não foram corrigidas.

## 6. Ressalvas obrigatórias no relato

Estas ressalvas acompanham qualquer número produzido aqui — omiti-las tornaria o
resultado enganoso:

1. O operador é o **desenvolvedor, não um radiologista**. As taxas de aceite e
   rejeição medem o comportamento do sistema, **não** acurácia clínica.
2. Não há *ground truth* clínico no conjunto de teste. Nenhuma métrica aqui é
   sensibilidade, especificidade ou acurácia diagnóstica.
3. As métricas de qualidade dos modelos (mAP@50 = 0,626 etc.) são do conjunto de
   validação do parceiro, **não** deste teste, e devem ser sempre atribuídas.
4. O detector tem desempenho ruim fora do domínio CMMD. Se o conjunto de teste for
   de outra origem, resultados fracos são **esperados** e devem ser interpretados
   como tal — não como falha de integração.
