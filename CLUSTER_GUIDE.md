# Guia de Treinamento no Cluster (Slurm + NVIDIA L4)

Este guia detalha o processo passo-a-passo para treinar a IA de Mamografia no cluster.

## 1. Preparação (Na sua máquina local)

Antes de conectar ao cluster, certifique-se de ter os arquivos empacotados.

1.  **Gerar o pacote de código**:
    Abra o terminal na pasta do projeto e execute:
    ```bash
    ./scripts/pack_for_cluster.sh
    ```
    Isso criará o arquivo **`mammografia_code.zip`**.

2.  **Localizar os dados**:
    Certifique-se de saber onde está a pasta **`data/CBIS-DDSM-JPG`**.

---

## 2. Transferência de Arquivos

Você precisa enviar o código e os dados para o cluster. Supondo que seu usuário seja `usuario` e o cluster seja `cluster.techne.br`:

```bash
# 1. Enviar o código (rápido)
scp mammografia_code.zip usuario@cluster.techne.br:~/

# 2. Enviar o dataset (pode demorar)
# Recomendamos usar rsync para poder resumir se cair
rsync -avP data/CBIS-DDSM-JPG usuario@cluster.techne.br:~/data/
```

*Nota: Se a pasta `data` já existir lá (compartilhada via NFC), pule o passo 2.*

---

## 3. Configuração do Ambiente (No Cluster)

Acesse o cluster via SSH e prepare o ambiente. **Isso só precisa ser feito uma vez.**

```bash
ssh usuario@cluster.techne.br

# 1. Descompactar o código
unzip mammografia_code.zip -d projeto_mamografia
cd projeto_mamografia

# 2. Carregar módulos (Ajuste as versões conforme disponível no seu cluster)
module load python/3.10   # Ou 3.9+
module load cuda/12.1     # Necessário para tensorflow[and-cuda]

# 3. Criar ambiente virtual
python3 -m venv venv
source venv/bin/activate

# 4. Instalar dependências
pip install --upgrade pip
pip install -r requirements_cluster.txt
```

---

## 4. Executando o Treinamento

O treinamento é submetido como um "Job" para o gerenciador Slurm.

1.  **Verifique o script de submissão**:
    O arquivo `scripts/train.slurm` já está configurado. Verifique se a partição está correta:
    ```bash
    nano scripts/train.slurm
    # Procure por: #SBATCH --partition=gpu
    # Se o nome da fila for diferente (ex: 'long', 'nvidia'), altere aqui.
    ```

2.  **Submeter o Job**:
    ```bash
    sbatch scripts/train.slurm
    ```
    
    Você verá uma mensagem como: `Submitted batch job 123456`

### Controle por variáveis (sem editar o script)

Você pode ajustar o treinamento diretamente no `sbatch`:

```bash
sbatch \
  --gres=gpu:4 \
  --export=ALL,TRAIN_RUN_NAME=exp_gpu4_v1,TRAIN_EPOCHS=80,TRAIN_BATCH_PER_REPLICA=2,TRAIN_RESUME=1 \
  scripts/train.slurm
```

Parâmetros:
- `TRAIN_RUN_NAME`: nome da pasta da execução em `models/<run_name>/`.
- `TRAIN_EPOCHS`: total de épocas.
- `TRAIN_BATCH_PER_REPLICA`: batch por GPU.
- `TRAIN_RESUME=1`: retoma do último checkpoint automaticamente.

> Para retomar um treino interrompido, execute novamente o mesmo `TRAIN_RUN_NAME` com `TRAIN_RESUME=1`.

---

## 5. Monitoramento

Depois de submeter, você não precisa ficar conectado. O cluster vai rodar sozinho.

*   **Verificar se está rodando**:
    ```bash
    squeue -u $USER
    ```
    *   **ST (Status)**: `R` = Rodando, `PD` = Pendente (aguardando GPU livre).

*   **Acompanhar o progresso (Logs)**:
    O script cria uma pasta `logs/`. Para ver o treinamento em tempo real:
    ```bash
    # Substitua o número pelo seu JOB ID
    tail -f logs/output_123456.txt
    ```
    *(Pressione `Ctrl+C` para sair do monitoramento)*

*   **Verificar Erros**:
    Se algo der errado, olhe o arquivo de erro:
    ```bash
    cat logs/error_123456.txt
    ```

---

## 6. Pós-Treinamento (Usando o Modelo)

Após o término do treinamento (quando o status no `squeue` não mostrar mais o job), você deve trazer o modelo treinado de volta para sua máquina para usar na aplicação web.

### 1. Baixar o Modelo
No seu computador local (Mac), abra o terminal e execute:

```bash
# Cria a pasta local se não existir
mkdir -p models

# Exemplo: baixar o melhor checkpoint e o modelo final de um run específico
scp usuario@cluster.techne.br:~/projeto_mamografia/models/exp_gpu4_v1/checkpoints/best.keras ./models/unet_mammo_best.keras
scp usuario@cluster.techne.br:~/projeto_mamografia/models/exp_gpu4_v1/final.keras ./models/unet_mammo_final.keras
```

### 2. Testar na Aplicação
Com o arquivo `unet_mammo_best.keras` dentro da pasta `models/`, você pode rodar a interface visual:

```bash
# Instale as dependências locais se ainda não fez
pip install -r requirements.txt

# Inicie o servidor
python -m src.api.app
```

Acesse **http://localhost:5000** no navegador.
Agora você pode fazer upload de uma mamografia e ver a segmentação gerada pelo modelo que você treinou no cluster!
