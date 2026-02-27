#!/bin/bash
#SBATCH --job-name=mammo_unet_train  # Nome do job
#SBATCH --output=logs/output_%j.txt  # Arquivo de saída (%j = JobID)
#SBATCH --error=logs/error_%j.txt    # Arquivo de erro
#SBATCH --partition=gpu              # Partição (VERIFICAR NOME CORRETO NO CLUSTER)
#SBATCH --nodes=1                    # Número de nós
#SBATCH --ntasks=1                   # Número de tarefas
#SBATCH --gres=gpu:2                 # Solicitando 2 GPUs (L4)
#SBATCH --cpus-per-task=8            # CPUs por tarefa (ajustar conforme disponibilidade)
#SBATCH --mem=32G                    # Memória RAM total
#SBATCH --time=24:00:00              # Tempo máximo (24 horas)

set -euo pipefail

echo "Starting job on $HOSTNAME"
echo "Date: $(date)"
echo "SLURM_JOB_ID: ${SLURM_JOB_ID:-n/a}"

# 1. Carregar módulos (Ajustar versões conforme disponível no cluster)
# Exemplo: module load python/3.10 cuda/12.1 cudnn/8.9
module load python/3.9
module load cuda/12.1

# 2. Ativar ambiente virtual
# Assume que o venv foi criado na pasta do projeto
source venv/bin/activate

# 3. Verificar GPUs visíveis
echo "GPUs Available:"
nvidia-smi

# 4. Criar pasta de logs se não existir
mkdir -p logs

export TF_CPP_MIN_LOG_LEVEL=${TF_CPP_MIN_LOG_LEVEL:-2}
export TRAIN_RUN_NAME=${TRAIN_RUN_NAME:-cbis_ddsm_default}
export TRAIN_EPOCHS=${TRAIN_EPOCHS:-50}
export TRAIN_BATCH_PER_REPLICA=${TRAIN_BATCH_PER_REPLICA:-4}
export TRAIN_RESUME=${TRAIN_RESUME:-1}

echo "GPUS via CUDA_VISIBLE_DEVICES: ${CUDA_VISIBLE_DEVICES:-all}"
echo "Run name: ${TRAIN_RUN_NAME}"
echo "Epochs: ${TRAIN_EPOCHS}"
echo "Batch per replica: ${TRAIN_BATCH_PER_REPLICA}"
echo "Resume enabled: ${TRAIN_RESUME}"

RESUME_FLAG=""
if [ "${TRAIN_RESUME}" = "1" ]; then
  RESUME_FLAG="--resume"
fi

# 5. Executar treinamento robusto (checkpoint + resume + multi-GPU)
python3 -u src/ml/train.py \
  --run-name "${TRAIN_RUN_NAME}" \
  --epochs "${TRAIN_EPOCHS}" \
  --batch-size-per-replica "${TRAIN_BATCH_PER_REPLICA}" \
  ${RESUME_FLAG}

echo "Job finished at $(date)"
