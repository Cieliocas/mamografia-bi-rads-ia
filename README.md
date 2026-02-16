# Mamografia BI-RADS AI

## Ferramenta de Anotação Semiautomática de Achados Radiológicos em Exames de Mamografia

<div align="center">

![Project Badge](https://img.shields.io/badge/CNPq-Inicia%C3%A7%C3%A3o%20Tecnol%C3%B3gica-blue)
![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento-green)
![Python](https://img.shields.io/badge/Python-3.9%2B-yellow)
![TensorFlow](https://img.shields.io/badge/TensorFlow-2.x-orange)

</div>

### Sobre o Projeto

Este projeto de **Iniciação Tecnológica (CNPq)** visa desenvolver uma solução inteligente para auxiliar radiologistas na identificação e classificação de achados em mamografias. A ferramenta atua como um "assistente virtual" ou uma "IDE para Radiologistas", permitindo a visualização de exames DICOM, a segmentação automática de lesões (massas e calcificações) e a sugestão de classificação **BI-RADS**.

O objetivo não é substituir o médico, mas fornecer uma segunda opinião em tempo real e agilizar o processo de laudo através de uma interface de **anotação semiautomática**, onde o especialista valida as sugestões da Inteligência Artificial.

**Bolsista:** Francielio Castro  
**Orientador:** Prof. André Castelo Branco Soares  
**Instituição:** Universidade Federal do Piauí (UFPI)  
**Laboratório:** Laboratório de Redes / Núcleo de Computação de Alto Desempenho (NCAD) - Cluster TechNE

---

### 🛠 Tecnologias Utilizadas

O projeto integra técnicas avançadas de Visão Computacional e Engenharia de Software:

*   **TensorFlow / Keras**: Framework de Deep Learning utilizado para construir e treinar a rede neural **U-Net**. A U-Net foi escolhida por sua excelência em tarefas de segmentação biomédica, permitindo delinear com precisão as áreas suspeitas na mamografia.
*   **OpenCV & Pydicom**: Bibliotecas essenciais para o pré-processamento de imagens médicas. O `pydicom` permite a leitura nativa de arquivos DICOM (padrão da indústria), enquanto o `opencv` realiza ajustes de contraste, redimensionamento e normalização.
*   **Flask (Python)**: Backend robusto que expõe o modelo de IA como uma API. Ele gerencia o fluxo de dados entre o armazenamento, o modelo de inferência e a interface do usuário.
*   **React / Next.js / Tailwind CSS**: Interface frontend moderna e responsiva, projetada para proporcionar uma experiência de usuário fluida (DX/UX) semelhante a uma IDE, com ferramentas de zoom, ajuste de janela e overlay de máscaras de segmentação. Utiliza **Radix UI** para acessibilidade.
*   **Slurm & NVIDIA GPUs**: Ambiente de treinamento de alta performance. Utilizamos clusters computacionais (Techne) com GPUs **NVIDIA L4** para treinar o modelo no dataset completo **CBIS-DDSM**, garantindo robustez e precisão.

---

### 📂 Estrutura do Projeto

*   **`src/model/`**: Contém a arquitetura da U-Net, scripts de treinamento (`train.py`) com suporte a múltiplas GPUs (`MirroredStrategy`) e o pipeline de inferência.
*   **`src/web_app/`**: Código do servidor Flask e da interface web.
*   **`data/`**: Scripts de manipulação do dataset CBIS-DDSM (imagens e máscaras de segmentação).
*   **`scripts/`**: Utilitários para automação, incluindo scripts de submissão de job para o cluster (`train.slurm`) e empacotamento (`pack_for_cluster.sh`).

### 🚀 Como Executar

#### Treinamento (Cluster/Linux)
O projeto está configurado para execução em ambientes HPC com Slurm.
```bash
sbatch scripts/train.slurm
```

#### Inferência Local (Full Stack)
Para rodar a aplicação completa (Backend + Frontend):

**1. Backend (API)**
```bash
python src/web_app/app.py
```

**2. Frontend (React)**
```bash
cd src/web_app/radiology-annotation-tool
npm run dev
```
Acesse: `http://localhost:3000`

---

> *Este projeto é financiado pelo CNPq e desenvolvido com o apoio da infraestrutura do NCAD/UFPI.*
