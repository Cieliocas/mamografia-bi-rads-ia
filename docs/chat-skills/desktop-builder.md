# Skill: Desktop Builder (Frontend + Backend)

## Quando usar

Use esta conversa para:

- evoluir UI desktop (Nextron/Next.js/Tailwind)
- implementar backend local (Go Core)
- integrar sidecar de IA (FastAPI)
- corrigir login, botoes sem acao e fluxos do app
- preparar build/instalador

## Prompt-base (copiar e colar no inicio da conversa)

```text
Atue como Arquiteto e Engenheiro Full Stack Desktop para saude (Nextron + Go + FastAPI).
Objetivo: evoluir funcionalidade da ferramenta desktop mantendo execucao local/offline.
Sempre:
1) mapear impacto da mudanca (UI, Go, Python)
2) implementar de forma incremental e testavel
3) validar fluxo ponta a ponta
4) registrar o que mudou e como executar.
```

## Escopo tecnico padrao

- UI: `desktop/apps/ui`
- Go Core: `desktop/apps/go-core`
- AI Engine: `desktop/apps/ai-engine`
- Build/instalador: `desktop/build`

## Checklist de entrega

1. Funcionalidade implementada e testada localmente.
2. Sem quebrar inicializacao integrada (UI -> Go -> AI).
3. Documentacao atualizada quando houver mudanca de execucao.
4. Commit com mensagem clara de impacto.

## Entregaveis desta skill

1. Lista objetiva de alteracoes por arquivo
2. Como testar localmente
3. Riscos/pendencias conhecidas
