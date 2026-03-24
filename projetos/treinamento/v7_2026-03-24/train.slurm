#!/bin/bash
#SBATCH --job-name=mammo_unet_train  # Nome do job
#SBATCH --output=logs/output_%j.txt  # Arquivo de saída (%j = JobID)
#SBATCH --error=logs/error_%j.txt    # Arquivo de erro
#SBATCH --partition=gpu              # Partição definida para execução
#SBATCH --nodelist=gpunode01         # Nó alvo
#SBATCH --nodes=1                    # Número de nós
#SBATCH --ntasks=1                   # Número de tarefas
#SBATCH --gres=gpu:2                 # Solicitando 2 GPUs
#SBATCH --cpus-per-task=8            # CPUs por tarefa (ajustar conforme disponibilidade)
#SBATCH --mem=32G                    # Memória RAM total
#SBATCH --time=24:00:00              # Tempo máximo (24 horas)

set -euo pipefail

echo "Starting job on $HOSTNAME"
echo "Date: $(date)"
echo "SLURM_JOB_ID: ${SLURM_JOB_ID:-n/a}"

# 1. Carregar módulos (quando disponíveis no cluster)
if command -v module >/dev/null 2>&1; then
  module load python/3.9
  module load cuda/12.1
else
  echo "module command not found; using default system environment"
fi

# 2. Ativar ambiente virtual
# Assume que o venv foi criado na pasta do projeto
source venv/bin/activate

# 2.1 Expor bibliotecas CUDA instaladas via pip (tensorflow[and-cuda])
if [ -n "${VIRTUAL_ENV:-}" ]; then
  NVIDIA_LIBS=$(python3 - <<'PY'
import site
import glob
import os

paths = []
for base in site.getsitepackages():
    paths.extend(glob.glob(os.path.join(base, "nvidia", "*", "lib")))
print(":".join(paths))
PY
)
  if [ -n "${NVIDIA_LIBS}" ]; then
    export LD_LIBRARY_PATH="${NVIDIA_LIBS}:${LD_LIBRARY_PATH:-}"
  fi
fi

# 3. Verificar GPUs visíveis
echo "GPUs Available:"
nvidia-smi

# 4. Criar pasta de logs se não existir
mkdir -p logs

export TF_CPP_MIN_LOG_LEVEL=${TF_CPP_MIN_LOG_LEVEL:-2}
export TRAIN_RUN_NAME=${TRAIN_RUN_NAME:-cbis_ddsm_default}
export TRAIN_EPOCHS=${TRAIN_EPOCHS:-50}
export TRAIN_BATCH_PER_REPLICA=${TRAIN_BATCH_PER_REPLICA:-4}
export TRAIN_LEARNING_RATE=${TRAIN_LEARNING_RATE:-1e-4}
export TRAIN_POS_WEIGHT=${TRAIN_POS_WEIGHT:-4.0}
export TRAIN_FOCAL_ALPHA=${TRAIN_FOCAL_ALPHA:-0.75}
export TRAIN_FOCAL_GAMMA=${TRAIN_FOCAL_GAMMA:-2.0}
export TRAIN_LOSS=${TRAIN_LOSS:-weighted_bce_dice}
export TRAIN_MONITOR_METRIC=${TRAIN_MONITOR_METRIC:-val_dice_coef}
export TRAIN_PATIENCE=${TRAIN_PATIENCE:-8}
export TRAIN_LR_PATIENCE=${TRAIN_LR_PATIENCE:-3}
export TRAIN_EPOCH_CKPT_INTERVAL=${TRAIN_EPOCH_CKPT_INTERVAL:-10}
export TRAIN_KEEP_EPOCH_CKPTS=${TRAIN_KEEP_EPOCH_CKPTS:-5}
export TRAIN_ROTATION_RANGE=${TRAIN_ROTATION_RANGE:-20.0}
export TRAIN_ZOOM_RANGE=${TRAIN_ZOOM_RANGE:-0.15}
export TRAIN_BRIGHTNESS_MIN=${TRAIN_BRIGHTNESS_MIN:-0.9}
export TRAIN_BRIGHTNESS_MAX=${TRAIN_BRIGHTNESS_MAX:-1.1}
export TRAIN_HFLIP_PROB=${TRAIN_HFLIP_PROB:-0.5}
export TRAIN_VFLIP_PROB=${TRAIN_VFLIP_PROB:-0.1}
export TRAIN_AUGMENTATION=${TRAIN_AUGMENTATION:-1}
export TRAIN_CLAHE=${TRAIN_CLAHE:-1}
export TRAIN_SHUFFLE_TRAIN=${TRAIN_SHUFFLE_TRAIN:-1}
export TRAIN_RESUME=${TRAIN_RESUME:-1}

echo "GPUS via CUDA_VISIBLE_DEVICES: ${CUDA_VISIBLE_DEVICES:-all}"
echo "Run name: ${TRAIN_RUN_NAME}"
echo "Epochs: ${TRAIN_EPOCHS}"
echo "Batch per replica: ${TRAIN_BATCH_PER_REPLICA}"
echo "Learning rate: ${TRAIN_LEARNING_RATE}"
echo "Pos weight: ${TRAIN_POS_WEIGHT}"
echo "Focal alpha: ${TRAIN_FOCAL_ALPHA}"
echo "Focal gamma: ${TRAIN_FOCAL_GAMMA}"
echo "Loss: ${TRAIN_LOSS}"
echo "Monitor metric: ${TRAIN_MONITOR_METRIC}"
echo "EarlyStopping patience: ${TRAIN_PATIENCE}"
echo "ReduceLROnPlateau patience: ${TRAIN_LR_PATIENCE}"
echo "Epoch checkpoint interval: ${TRAIN_EPOCH_CKPT_INTERVAL}"
echo "Keep epoch checkpoints: ${TRAIN_KEEP_EPOCH_CKPTS}"
echo "Rotation range: ${TRAIN_ROTATION_RANGE}"
echo "Zoom range: ${TRAIN_ZOOM_RANGE}"
echo "Brightness min/max: ${TRAIN_BRIGHTNESS_MIN}/${TRAIN_BRIGHTNESS_MAX}"
echo "HFlip prob: ${TRAIN_HFLIP_PROB}"
echo "VFlip prob: ${TRAIN_VFLIP_PROB}"
echo "Augmentation: ${TRAIN_AUGMENTATION}"
echo "CLAHE: ${TRAIN_CLAHE}"
echo "Train shuffle: ${TRAIN_SHUFFLE_TRAIN}"
echo "Resume enabled: ${TRAIN_RESUME}"

# 4.1 Validar se o TensorFlow realmente enxergou 2 GPUs
python3 - <<'PY'
import sys
import tensorflow as tf

gpus = tf.config.list_physical_devices("GPU")
print(f"TensorFlow GPU devices detected before training: {len(gpus)}")
for gpu in gpus:
    print(f" - {gpu}")

if len(gpus) < 2:
    print("ERROR: TensorFlow did not detect 2 GPUs. Aborting training.")
    sys.exit(2)
PY

RESUME_FLAG=""
if [ "${TRAIN_RESUME}" = "1" ]; then
  RESUME_FLAG="--resume"
fi

AUGMENTATION_FLAG="--no-augmentation"
if [ "${TRAIN_AUGMENTATION}" = "1" ]; then
  AUGMENTATION_FLAG="--augmentation"
fi

CLAHE_FLAG="--no-clahe"
if [ "${TRAIN_CLAHE}" = "1" ]; then
  CLAHE_FLAG="--clahe"
fi

SHUFFLE_FLAG="--no-shuffle-train"
if [ "${TRAIN_SHUFFLE_TRAIN}" = "1" ]; then
  SHUFFLE_FLAG="--shuffle-train"
fi

# 5. Executar treinamento robusto (checkpoint + resume + multi-GPU)
python3 -u src/ml/train.py \
  --run-name "${TRAIN_RUN_NAME}" \
  --epochs "${TRAIN_EPOCHS}" \
  --batch-size-per-replica "${TRAIN_BATCH_PER_REPLICA}" \
  --learning-rate "${TRAIN_LEARNING_RATE}" \
  --pos-weight "${TRAIN_POS_WEIGHT}" \
  --focal-alpha "${TRAIN_FOCAL_ALPHA}" \
  --focal-gamma "${TRAIN_FOCAL_GAMMA}" \
  --loss "${TRAIN_LOSS}" \
  --monitor-metric "${TRAIN_MONITOR_METRIC}" \
  --patience "${TRAIN_PATIENCE}" \
  --lr-patience "${TRAIN_LR_PATIENCE}" \
  --epoch-checkpoint-interval "${TRAIN_EPOCH_CKPT_INTERVAL}" \
  --keep-epoch-checkpoints "${TRAIN_KEEP_EPOCH_CKPTS}" \
  --rotation-range "${TRAIN_ROTATION_RANGE}" \
  --zoom-range "${TRAIN_ZOOM_RANGE}" \
  --brightness-min "${TRAIN_BRIGHTNESS_MIN}" \
  --brightness-max "${TRAIN_BRIGHTNESS_MAX}" \
  --hflip-prob "${TRAIN_HFLIP_PROB}" \
  --vflip-prob "${TRAIN_VFLIP_PROB}" \
  ${AUGMENTATION_FLAG} \
  ${CLAHE_FLAG} \
  ${SHUFFLE_FLAG} \
  ${RESUME_FLAG}

echo "Job finished at $(date)"
