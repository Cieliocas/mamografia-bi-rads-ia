import numpy as np

def get_center_from_bbox(bbox):
    """
    Calcula o centro (x, y) a partir de um Bounding Box.
    
    Args:
        bbox (list ou np.array): Coordenadas [x_min, y_min, x_max, y_max].
        
    Returns:
        tuple: (center_x, center_y) como inteiros.
    """
    # Garante que estamos lidando com floats ou ints
    x1, y1, x2, y2 = map(float, bbox)
    
    cx = int((x1 + x2) / 2)
    cy = int((y1 + y2) / 2)
    
    return cx, cy

def get_center_of_mass(mask):
    """
    Calcula o centro de massa de uma máscara binária (segmentação).
    Útil se você estiver usando o dataset com máscaras de segmentação no futuro.
    
    Args:
        mask (numpy array): Imagem binária (0 fundo, 255 objeto).
        
    Returns:
        tuple: (center_x, center_y) ou None se a máscara estiver vazia.
    """
    if np.sum(mask) == 0:
        return None
    
    # Encontra os índices onde a máscara não é zero
    # y_indices, x_indices
    y_idxs, x_idxs = np.nonzero(mask)
    
    avg_y = np.mean(y_idxs)
    avg_x = np.mean(x_idxs)
    
    return int(avg_x), int(avg_y)