# src/dataloading/augmentations.py

import cv2
import numpy as np

def apply_clahe(image, clip_limit=2.0, tile_grid_size=(8, 8)):
    """
    Aplica a Equalização de Histograma Adaptativa Limitada por Contraste (CLAHE).
    É crucial para melhorar o contraste local em mamografias.
    :param image: Imagem em escala de cinza (NumPy array, 0-255).
    """
    # Converte para 8-bit (necessário para a função CLAHE do OpenCV)
    img_8bit = (image * 255).astype(np.uint8) 
    
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    clahe_img = clahe.apply(img_8bit)
    
    # Retorna ao formato original (float32, 0-1)
    return clahe_img.astype(np.float32) / 255.0

def random_horizontal_flip(image, labels):
    """ Aplica flip horizontal com chance de 50%. """
    if np.random.rand() < 0.5:
        # Flip da Imagem
        image = cv2.flip(image, 1)
        # Ajusta as coordenadas do bounding box (cx = 1 - cx)
        # Assumindo que labels está no formato YOLO [cx, cy, w, h, class_id]
        if labels.ndim > 1:
            labels[:, 0] = 1 - labels[:, 0]
        else:
            labels[0] = 1 - labels[0]
            
    return image, labels

def get_data_augmentations(use_clahe=True, flip=True):
    """
    Define a pipeline de transformações para o treinamento.
    """
    transforms = []
    
    if use_clahe:
        # CLAHE deve ser aplicado primeiro para maximizar o contraste
        transforms.append(lambda img, lbl: (apply_clahe(img), lbl))

    if flip:
        transforms.append(random_horizontal_flip)

    # Função que aplica todas as transformações em ordem
    def apply_transforms(image, labels):
        for transform in transforms:
            image, labels = transform(image, labels)
        return image, labels

    return apply_transforms