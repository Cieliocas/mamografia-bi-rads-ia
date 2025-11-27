import pandas as pd
import os
import cv2
import numpy as np
from tqdm import tqdm
import shutil

# ================= CONFIGURAÇÃO DE CAMINHOS =================
# Caminho absoluto
PROJECT_ROOT = "/Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia"

BASE_PATH = os.path.join(PROJECT_ROOT, "data/CBIS-DDSM-JPG")
CSV_DIR = os.path.join(BASE_PATH, "csv")
IMG_DIR = os.path.join(BASE_PATH, "jpeg")

OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data/yolo_dataset")
IMAGES_OUT = os.path.join(OUTPUT_DIR, "images")
LABELS_OUT = os.path.join(OUTPUT_DIR, "labels")

CLASS_MAP = {
    'Calcification': 0,
    'Mass': 1
}
# ============================================================

DIR_INDEX = {}

def index_directories(base_dir):
    """
    Mapeia APENAS os nomes das pastas para seus caminhos completos.
    O segredo é achar a pasta UID (1.3.6...), o resto a gente navega.
    """
    print(f"Indexando pastas em: {base_dir} ...")
    global DIR_INDEX
    for root, dirs, files in os.walk(base_dir):
        for d in dirs:
            DIR_INDEX[d] = os.path.join(root, d)
    print(f"Indexação concluída! {len(DIR_INDEX)} pastas mapeadas.")

def create_dirs():
    for path in [IMAGES_OUT, LABELS_OUT]:
        os.makedirs(os.path.join(path, 'train'), exist_ok=True)
        os.makedirs(os.path.join(path, 'test'), exist_ok=True)

def get_bbox_from_mask(mask_path):
    if not os.path.exists(mask_path): return None
    try:
        mask = cv2.imread(mask_path, 0)
    except: return None
    if mask is None: return None

    # Threshold para garantir que é binário (preto e branco)
    _, thresh = cv2.threshold(mask, 10, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours: return None
    
    c = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(c)
    height, width = mask.shape
    return (x, y, w, h), (width, height)

def convert_to_yolo(bbox, img_dims):
    x, y, w, h = bbox
    img_w, img_h = img_dims
    if img_w == 0 or img_h == 0: return None
    center_x = (x + w / 2) / img_w
    center_y = (y + h / 2) / img_h
    norm_w = w / img_w
    norm_h = h / img_h
    return f"{center_x:.6f} {center_y:.6f} {norm_w:.6f} {norm_h:.6f}"

def find_image_deep(partial_path):
    """
    A função "Sabujo":
    1. Quebra o caminho do CSV.
    2. Procura se alguma parte é uma pasta conhecida (o UID).
    3. Se achar a pasta, MERGULHA nela recursivamente até achar o primeiro JPG.
    """
    if pd.isna(partial_path): return None
    
    parts = partial_path.replace('\\', '/').strip().split('/')
    
    folder_path = None
    # Procura o UID no nosso índice
    for part in parts:
        if part in DIR_INDEX:
            folder_path = DIR_INDEX[part]
            break
    
    if folder_path:
        # Achamos a pasta pai (1.3.6...). Agora vamos caçar o JPG lá dentro.
        # Não confiamos no nome do arquivo do CSV, pegamos o que tiver lá.
        for root, _, files in os.walk(folder_path):
            for f in files:
                if f.lower().endswith('.jpg'):
                    return os.path.join(root, f)
                
    return None

def process_csv(csv_file, subset_name, abnomaly_type):
    print(f"--- Processando {abnomaly_type} ({subset_name}) ---")
    df = pd.read_csv(csv_file)
    class_id = CLASS_MAP[abnomaly_type]
    
    found = 0
    missing = 0
    
    for _, row in tqdm(df.iterrows(), total=df.shape[0]):
        img_path_csv = row.get('image file path')
        mask_path_csv = row.get('ROI mask file path')
        
        # Busca Profunda
        img_real_path = find_image_deep(img_path_csv)
        mask_real_path = find_image_deep(mask_path_csv)
        
        if not img_real_path or not mask_real_path:
            missing += 1
            continue
            
        # Calcular Bbox da Máscara
        bbox_data = get_bbox_from_mask(mask_real_path)
        if not bbox_data:
            missing += 1
            continue
            
        bbox, (img_w, img_h) = bbox_data
        yolo_coords = convert_to_yolo(bbox, (img_w, img_h))
        
        if not yolo_coords: continue

        # Salvar
        yolo_line = f"{class_id} {yolo_coords}\n"
        
        # Usa o UID da pasta para garantir nome único
        # (Pega o nome da pasta 3 níveis acima do arquivo, que é o UID no seu print)
        try:
            path_parts = img_real_path.split(os.sep)
            # Tenta pegar algo único do caminho
            folder_uid = path_parts[-4] if len(path_parts) > 4 else path_parts[-2]
        except:
            folder_uid = "unknown"

        base_name = os.path.splitext(os.path.basename(img_real_path))[0]
        unique_name = f"{abnomaly_type}_{subset_name}_{folder_uid}_{base_name}"
        
        # Limpar caracteres ruins do nome do arquivo
        unique_name = unique_name.replace('.', '_').replace(' ', '')

        dst_img = os.path.join(IMAGES_OUT, subset_name, unique_name + ".jpg")
        dst_txt = os.path.join(LABELS_OUT, subset_name, unique_name + ".txt")
        
        shutil.copy(img_real_path, dst_img)
        with open(dst_txt, 'w') as f:
            f.write(yolo_line)
            
        found += 1
        
    print(f"  -> Sucesso: {found} | Não encontrados/Erro: {missing}")

def main():
    if not os.path.exists(BASE_PATH):
        print(f"ERRO: Pasta base não encontrada: {BASE_PATH}")
        return

    create_dirs()
    index_directories(IMG_DIR) 
    
    # Verifica nomes exatos dos seus CSVs (conforme seu 'ls' anterior)
    tasks = [
        ("mass_case_description_train_set.csv", "train", "Mass"),
        ("mass_case_description_test_set.csv", "test", "Mass"),
        ("calc_case_description_train_set.csv", "train", "Calcification"),
        ("calc_case_description_test_set.csv", "test", "Calcification"),
    ]
    
    for csv_name, subset, anomaly in tasks:
        full_csv_path = os.path.join(CSV_DIR, csv_name)
        if os.path.exists(full_csv_path):
            process_csv(full_csv_path, subset, anomaly)
        else:
            print(f"AVISO: Arquivo CSV não encontrado: {csv_name}")

if __name__ == "__main__":
    main()