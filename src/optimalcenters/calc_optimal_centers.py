import numpy as np

def get_center_of_mass(mask):
    """
    Calcula o centro de massa de uma máscara binária (segmentação).
    Útil se você tiver máscaras de segmentação do CBIS-DDSM.
    """
    if np.sum(mask) == 0:
        return None
    
    # Índices onde a máscara não é zero
    ys, xs = np.nonzero(mask)
    
    avg_y = np.mean(ys)
    avg_x = np.mean(xs)
    
    return int(avg_x), int(avg_y)

def get_center_from_bbox(bbox):
    """
    Calcula o centro a partir de um Bounding Box do YOLO.
    Formato bbox esperado: [x_min, y_min, x_max, y_max] ou [x, y, w, h]
    
    Retorna: (center_x, center_y)
    """
    # Assumindo formato [x_min, y_min, x_max, y_max]
    x1, y1, x2, y2 = bbox
    cx = int((x1 + x2) / 2)
    cy = int((y1 + y2) / 2)
    return cx, cy