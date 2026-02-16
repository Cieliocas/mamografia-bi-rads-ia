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

echo "Starting job on $HOSTNAME"
echo "Date: $(date)"

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

# 5. Executar o script de treinamento
# python3 -u força o output sem buffer (útil para ver logs em tempo real)
python3 -u src/model/train.py

echo "Job finished at $(date)"
