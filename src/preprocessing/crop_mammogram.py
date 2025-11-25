import cv2
import numpy as np

def crop_breast_region(image, threshold=10):
    """
    Corta a imagem para conter apenas a região da mama, removendo o fundo preto excessivo.
    
    Args:
        image (numpy array): Imagem de entrada (escala de cinza).
        threshold (int): Limiar para considerar o que é fundo (preto) e o que é tecido.
    
    Returns:
        cropped_image (numpy array): A imagem cortada focada na mama.
    """
    # Se a imagem vier colorida, converte para cinza
    if len(image.shape) == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 1. Binarização: Cria uma máscara onde o tecido é branco (255) e o fundo é preto (0)
    _, mask = cv2.threshold(image, threshold, 255, cv2.THRESH_BINARY)

    # 2. Encontrar Contornos: Acha a borda da mama
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return image # Se não achou nada, retorna a original

    # 3. Achar o maior contorno (assume-se que a mama é o maior objeto na imagem)
    max_contour = max(contours, key=cv2.contourArea)

    # 4. Obter o retângulo delimitador (Bounding Box) desse contorno
    x, y, w, h = cv2.boundingRect(max_contour)

    # 5. Cortar a imagem original usando essas coordenadas
    cropped_image = image[y:y+h, x:x+w]

    return cropped_image