from .calc_optimal_centers import get_center_from_bbox

def process_detections(detections):
    """
    Processa uma lista de detecções do YOLO e extrai os centros ótimos.
    """
    centers = []
    for det in detections:
        # det.boxes.xyxy[0] retorna o bbox [x1, y1, x2, y2]
        # Adapte conforme a saída exata da sua inferência YOLO
        bbox = det.boxes.xyxy[0].cpu().numpy()
        center = get_center_from_bbox(bbox)
        centers.append(center)
    return centers