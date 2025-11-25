from .calc_optimal_centers import get_center_from_bbox

def process_batch_detections(results):
    """
    Processa os resultados brutos do YOLOv8 e extrai os centros de todas as detecções.
    
    Args:
        results (list): Lista de objetos 'Results' retornada pelo modelo YOLO.
        
    Returns:
        list: Lista de dicionários contendo {'path': str, 'centers': [(x,y), ...]}.
    """
    batch_centers = []

    for result in results:
        img_path = result.path
        boxes = result.boxes
        
        img_centers = []
        
        # Itera sobre cada caixa detectada na imagem
        for box in boxes:
            # xyxy: box format [x1, y1, x2, y2]
            coords = box.xyxy[0].cpu().numpy()
            center = get_center_from_bbox(coords)
            img_centers.append(center)
            
        batch_centers.append({
            'path': img_path,
            'centers': img_centers
        })
        
    return batch_centers