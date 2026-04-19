# Chat Skills do Projeto

O trabalho é dividido em 3 conversas especializadas para reduzir contexto misturado e acelerar execução.

## Skills

1. **Cluster Trainer** — treino no cluster UFPI, SLURM, monitoramento de jobs.
2. **Desktop Builder** — evolução da UI + Go Core + AI Engine.
3. **Daily Reporter** — relatórios diários em linguagem acessível.

## Regra de Ouro

Antes de iniciar qualquer conversa, leia e atualize:

- [`relatorios/STATUS_ATUAL.md`](../relatorios/STATUS_ATUAL.md)

Esse arquivo é a ponte entre todas as skills.

## Fluxo recomendado do dia

1. **Cluster Trainer** — executar treino e checar logs.
2. **Desktop Builder** — evoluir o app desktop.
3. **Daily Reporter** — documentar o que foi feito em `relatorios/RELATORIO_TREINO_YYYY-MM-DD.md`.

## Stack canônica (fonte de verdade)

- UI desktop: Wails + Angular
- Core local: Go
- AI sidecar: FastAPI/Python

Ver [ARCHITECTURE.md](ARCHITECTURE.md) para detalhes.
