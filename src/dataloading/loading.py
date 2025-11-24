# src/dataloading/loading.py

import torch
from torch.utils.data import Dataset, DataLoader
import pandas as pd
import os
import cv2
import numpy as np

class DDSMDataset(Dataset):
    """
    Classe customizada para carregar dados do CBIS-DDSM.
    Adapta para o formato PyTorch/Customizado.
    """
    def __init__(self, img_dir, annotation_file, transform=None):
        """
        Inicializa o Dataset.
        :param img_dir: Caminho para o diretório de imagens.
        :param annotation_file: Caminho para o arquivo CSV/Metadata que será processado (se necessário).
        :param transform: Funções de PDI/Augmentation a serem aplicadas.
        """
        self.img_dir = img_dir
        # No fine-tuning do YOLO, a Ultralytics gerencia a leitura do .txt,
        # mas aqui usamos o metadado CSV principal como referência
        self.metadata = pd.read_csv(annotation_file)
        self.transform = transform
        
        # Simula a lista de arquivos de imagem (deve ser ajustado ao seu CSV)
        self.image_files = [f for f in os.listdir(img_dir) if f.endswith('.jpg')]

    def __len__(self):
        return len(self.image_files)

    def __getitem__(self, idx):
        # 1. Carregar Imagem
        img_path = os.path.join(self.img_dir, self.image_files[idx])
        image = cv2.imread(img_path)
        image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) # Converte para escala de cinza (mamografia)

        # Normaliza a imagem (0-1) - essencial para Redes Neurais
        image = image.astype(np.float32) / 255.0
        
        # 2. Carregar Anotações (bounding box + classe BI-RADS)
        # ESTA PARTE DEPENDE DO SEU SCRIPT DE PREPARAÇÃO (CSV -> TXT)
        # Para fins de demonstração, assumimos anotações simbólicas
        # Em um projeto real, você leria os .txt do YOLO aqui
        labels = np.array([0.5, 0.5, 0.2, 0.2, 0]) # Ex: [cx, cy, w, h, class_id]

        # 3. Aplicar Transformações/Augmentation
        if self.transform:
            # Em PyTorch, as transformações devem ser aplicadas à imagem
            image = self.transform(image)
        
        # Converte para Tensor PyTorch
        image = torch.from_numpy(image).unsqueeze(0) # Adiciona canal único (escala de cinza)
        
        return image, labels

# Exemplo de como usar em um script principal
def DDSMDataLoader(img_dir, annotation_file, batch_size, shuffle, transforms):
    dataset = DDSMDataset(img_dir, annotation_file, transform=transforms)
    return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle, num_workers=4)