# Chat Skills do Projeto

Este diretorio organiza o trabalho em 3 conversas especializadas para reduzir contexto misturado e acelerar execucao.

## Skills/Conversas

1. [Cluster Trainer](./cluster-trainer.md)
2. [Desktop Builder](./desktop-builder.md)
3. [Daily Reporter](./daily-reporter.md)

## Regra de Ouro

Antes de iniciar qualquer conversa, leia e atualize:

- `relatorios/STATUS_ATUAL.md`

Esse arquivo e a "ponte" entre todas as skills.

## Fluxo Recomendado do Dia

1. Abrir `Cluster Trainer` para executar treino e checar logs.
2. Abrir `Desktop Builder` para evoluir app desktop.
3. Abrir `Daily Reporter` para documentar o que foi feito.

## Objetivo

Evitar perda de contexto, manter rastreabilidade e facilitar aprendizado continuo.

## Nota de Stack Atual

No fluxo desktop, considere como fonte de verdade a stack:

- UI desktop: Wails + Angular
- Core local: Go
- AI sidecar: FastAPI/Python
