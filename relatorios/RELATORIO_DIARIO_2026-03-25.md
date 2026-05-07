# RELATORIO DIARIO - 2026-03-25

## 1) Contexto do dia

Hoje o foco foi consolidar o aprendizado do treino `v8` (job `114`) e registrar, de forma clara, por que essa rodada nao deve continuar.
Tambem fechamos um plano tecnico objetivo para a proxima rodada (`v9`), priorizando estabilidade numerica e recuperacao da metrica Dice.
Este documento foi escrito para facilitar a leitura de quem esta iniciando em IA aplicada a mamografia.

## 2) O que foi feito (passo a passo)

1. Revisamos o resultado do ultimo job de treino (`114`) e a curva principal de validacao.
2. Comparamos a melhor metrica do `v8` com a melhor referencia recente (`v7`).
3. Identificamos o ponto de quebra: surgimento de `NaN` em loss e metricas a partir da epoca 3.
4. Mapeamos as causas tecnicas mais provaveis para instabilidade.
5. Definimos os ajustes da versao `v9` para reduzir risco de nova quebra.
6. Atualizamos o status consolidado do projeto com decisao de encerramento do `v8`.

## 3) Resultados (explicado para iniciante)

- Melhor metrica: `val_dice = 0.5537` (epoca 2) no `v8`.
- O que essa metrica significa: Dice mede o quanto a segmentacao prevista combina com a mascara real. Quanto mais perto de `1.0`, melhor.
- Comparacao com treino anterior: o `v7` chegou a `val_dice = 0.5664`, entao o `v8` ficou abaixo da melhor referencia recente.
- Leitura pratica: o `v8` teve um inicio razoavel, mas nao sustentou qualidade por instabilidade numerica.

## 4) Problemas encontrados

- Problema: `NaN` em `loss`, `dice` e `iou` durante o treino.
- Como apareceu no log: valores validos nas primeiras epocas e quebra para `NaN` a partir da epoca 3.
- Causa provavel: combinacao de taxa de aprendizado agressiva para esse cenario + sensibilidade de calculo em mixed precision + gradientes instaveis.

## 5) Correcao aplicada

- Ajuste realizado:
  - reduzir `learning rate` inicial para `5e-5`;
  - forcar calculo de losses/metricas sensiveis em `float32`;
  - adicionar `clipnorm` para limitar explosao de gradiente;
  - manter `val_dice_coef` como monitor principal.
- Arquivos alterados: nesta sessao, o ajuste foi aplicado na documentacao e no status consolidado (preparacao para `v9`).
- Por que esse ajuste ajuda: reduz risco de estouro numerico e melhora a chance de treino estavel por mais epocas.

## 6) Estado final do dia

- Job final analisado: `114`
- Status: `Encerrado para esta configuracao (v8); nao recomendado continuar`
- Melhor checkpoint do ciclo: referencia segue no `v7`
- Veredito (continuar/reiniciar): `Reiniciar com v9`

## 7) Plano para o proximo dia

1. Rodar treino `v9` com `lr=5e-5`, `clipnorm` e monitoramento reforcado.
2. Validar se nao ha `NaN` nas primeiras epocas (janela critica: epocas 1 a 5).
3. Comparar `val_dice` do `v9` com os marcos `v8 (0.5537)` e `v7 (0.5664)`.
