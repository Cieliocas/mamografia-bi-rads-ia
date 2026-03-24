# Relatório de Treinamento (24/03/2026)

## 1) Objetivo do dia (explicado de forma simples)
Hoje nosso foco foi fazer o treinamento da U-Net ficar **estável** e com **resultado melhor** para segmentação de achados em mamografia.

Em termos simples, queríamos:
- usar corretamente as 2 GPUs do cluster,
- evitar erros de execução no `sbatch`,
- melhorar a métrica mais importante para segmentação (Dice),
- salvar checkpoints de forma segura,
- e terminar o dia com um modelo realmente útil.

---

## 2) Resumo rápido do que conseguimos
- Rodamos vários testes (jobs 105 até 113) para ajustar o treinamento.
- Corrigimos problemas de configuração (GPU, argumentos, loss, checkpoints, etc.).
- Melhoramos bastante o comportamento do modelo.
- Melhor resultado do dia: **`val_dice_coef = 0.56645`** (run `v7`, epoch 3).

> Para este tipo de tarefa, **Dice** vale mais do que **accuracy**.

---

## 3) Explicação rápida dos termos (para iniciante)
- **Epoch**: uma “volta completa” do modelo por todo o conjunto de treino.
- **Loss**: erro do modelo. Quanto menor, melhor.
- **Validação (`val_*`)**: desempenho em dados que o modelo não viu no treino.
- **Dice (`val_dice_coef`)**: mede o quanto a segmentação prevista bate com a máscara real. É a métrica principal aqui.
- **IoU (`val_iou_coef`)**: também mede sobreposição (parecida com Dice).
- **Checkpoint**: “salvamento” do modelo durante treino, para retomar ou recuperar o melhor estado.
- **Early Stopping**: para o treino automaticamente quando não há melhora relevante.
- **ReduceLROnPlateau**: reduz a taxa de aprendizado quando o treino entra em platô.

---

## 4) Linha do tempo dos treinos de hoje

| Job | Run | O que aconteceu | Resultado |
|---|---|---|---|
| 105 | inicial | Configuração antiga | **Problema de GPU no TensorFlow** (1 réplica), cancelado |
| 106 | ajuste inicial | 2 GPUs e checkpoints | Rodou, mas validação piorou (Dice caiu ao longo das épocas) |
| 107 | `...v1` | fresh run, batch menor | Tendência ruim até epoch 5 |
| 108 | transição | Arquivos enviados para caminho errado no cluster | Execução não confiável para análise, cancelado |
| 109 | `...bcedice...v3` | BCE+Dice, LR baixo | Melhorou para faixa ~0.45 em Dice |
| 110 | `...wbce_dice...v4` | Weighted BCE + CLAHE + augmentation forte | Subiu para ~0.56 no melhor ponto inicial |
| 111 | transição | versão intermediária | Substituído por versão mais final |
| 112 | `...fp32out...v6` | mixed precision + saída final `float32` | Aceitável, Dice ficou em faixa boa |
| 113 | `...v7` | LR 1e-4 + augmentation suavizada | **Melhor run do dia** |

---

## 5) Melhor treino do dia (v7)
Run:
`cbis_ddsm_gpu2_wbce_dice_adapt_lr1e4_rot10_zoom010_20260324_v7`

Trecho principal (validação):
- Epoch 1: `val_dice = 0.5265`
- Epoch 2: `val_dice = 0.5585`
- Epoch 3: **`val_dice = 0.56645`** (melhor)
- Depois disso: oscilou perto desse valor, entrou em platô
- Early stopping encerrou no epoch 11 e restaurou o melhor estado (epoch 3)

### Interpretação simples
- O treino foi bom.
- O modelo aprendeu e atingiu um pico de qualidade na epoch 3.
- Depois ficou “andando de lado” (normal), então o early stopping fez o papel certo.

---

## 6) Sobre o `val_accuracy` “travado”
`val_accuracy` ficou perto de `0.4682` em várias épocas.

Isso **não** significa necessariamente que o modelo está ruim.
Para segmentação médica com muito fundo (classe majoritária), essa métrica pode enganar.

Decisão correta neste projeto:
- Priorizar **`val_dice_coef`** e **`val_iou_coef`**.

---

## 7) Principais melhorias aplicadas no código hoje

### Em `train.py`
- suporte completo aos argumentos usados no Slurm,
- losses para desbalanceamento (`weighted_bce`, `weighted_bce_dice`, `focal`, etc.),
- monitor dinâmico (`val_dice_coef` ou `val_loss`),
- mixed precision habilitada,
- seed reforçada com NumPy,
- erro explícito para loss desconhecida,
- checkpoint periódico com retenção (evita lotar disco).

### Em `data_loader.py`
- augmentation pareada imagem/máscara,
- CLAHE aplicado de fato,
- shuffle por epoch.

### Em `unet.py`
- camada final com `dtype="float32"` para estabilidade numérica com mixed precision.

### Em `train.slurm`
- parâmetros de treino mais completos,
- suporte a ajustes finos de augmentation,
- validação de 2 GPUs antes de treinar.

---

## 8) Arquivo de modelo recomendado no momento
Melhor checkpoint de hoje:

`/home/aluno_cielio/jobs/mamografia-bi-rads-ia/models/cbis_ddsm_gpu2_wbce_dice_adapt_lr1e4_rot10_zoom010_20260324_v7/checkpoints/best.keras`

---

## 9) Conclusão do dia
Hoje conseguimos sair de um cenário instável para um pipeline de treino **consistente e reproduzível**.

Resultado prático:
- temos um melhor checkpoint confiável,
- o processo de treino está organizado,
- e já existe base sólida para a próxima rodada de melhoria.

