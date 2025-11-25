import cv2
import os

def save_image(img, path, create_dir=True):
    """Salva uma imagem, criando o diretório se necessário."""
    if create_dir:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    
    success = cv2.imwrite(path, img)
    if not success:
        print(f"Erro ao salvar imagem em: {path}")