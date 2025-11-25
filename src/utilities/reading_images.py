import cv2
import os

def read_image(path, grayscale=True):
    """Lê uma imagem garantindo que ela exista."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"Imagem não encontrada: {path}")
    
    flags = cv2.IMREAD_GRAYSCALE if grayscale else cv2.IMREAD_COLOR
    img = cv2.imread(path, flags)
    
    if img is None:
        raise ValueError(f"Falha ao decodificar imagem: {path}")
    return img