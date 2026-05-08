# Versionamento de Treinos (Cluster)

Este diretorio guarda snapshots dos arquivos usados em cada rodada de treino.

## Padrao recomendado

Crie uma pasta por versao/data:

```text
projetos/treinamento/
  v7_2026-03-24/
    train.py
    train.slurm
  v8_2026-03-25/
    train.py
    train.slurm
```

## Objetivo

- Rastrear exatamente qual codigo gerou cada resultado
- Facilitar reproducao e auditoria
- Apoiar anexos no GitHub Projects

## Boa pratica

Ao fechar uma run relevante:

1. copiar `src/ml/train.py` para a pasta da versao
2. copiar `scripts/train.slurm` para a pasta da versao
3. atualizar o relatorio diario em `relatorios/`
4. atualizar `relatorios/STATUS_ATUAL.md`
