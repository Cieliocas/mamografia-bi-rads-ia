import cv2
import os
import numpy as np

def read_image(path, grayscale=False, target_size=None):
    """
    Lê uma imagem do disco de forma segura.
    
    Args:
        path (str): Caminho absoluto ou relativo da imagem.
        grayscale (bool): Se True, converte para escala de cinza.
        target_size (tuple): Se definido (largura, altura), redimensiona a imagem.
        
    Returns:
        numpy array: A imagem carregada.
    
    Raises:
        FileNotFoundError: Se o arquivo não existir.
        ValueError: Se o OpenCV não conseguir decodificar.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Erro: Imagem não encontrada em '{path}'")
    
    # Define flags de leitura
    flags = cv2.IMREAD_GRAYSCALE if grayscale else cv2.IMREAD_COLOR
    
    img = cv2.imread(path, flags)
    
    if img is None:
        raise ValueError(f"Erro: Falha ao decodificar o arquivo de imagem '{path}'.")
        
    # Redimensionamento opcional
    if target_size is not None:
        img = cv2.resize(img, target_size)
        
    return img