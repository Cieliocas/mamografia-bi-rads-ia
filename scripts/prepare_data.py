import pandas as pd
import os
import cv2
import numpy as np
from tqdm import tqdm
import shutil

# ================= CONFIGURAÇÃO =================
BASE_PATH = "./data/CBIS-DDSM-JPG"
CSV_DIR = os.path.join(BASE_PATH, "csv")
IMG_DIR = os.path.join(BASE_PATH, "jpeg")

OUTPUT_DIR = "./data/yolo_dataset"
IMAGES_OUT = os.path.join(OUTPUT_DIR, "images")
LABELS_OUT = os.path.join(OUTPUT_DIR, "labels")

CLASS_MAP = {
    'Calcification': 0,
    'Mass': 1
}
# ================================================

# Dicionário global para indexar as pastas UID
# Ex: { "1.3.6.1.4...": "./data/.../jpeg/1.3.6.1.4..." }
DIR_INDEX = {}

def index_directories(base_dir):
    """
    Varre a pasta de imagens UMA VEZ e cria um mapa de onde está cada pasta UID.
    Isso é crucial porque o dataset tem pastas com nomes complexos.
    """
    print("Indexando diretórios de imagens... (Isso pode levar alguns segundos)")
    global DIR_INDEX
    for root, dirs, files in os.walk(base_dir):
        for d in dirs:
            # Mapeia o nome da pasta para o caminho completo dela
            DIR_INDEX[d] = os.path.join(root, d)
    print(f"Indexação concluída! {len(DIR_INDEX)} pastas encontradas.")

def create_dirs():
    for path in [IMAGES_OUT, LABELS_OUT]:
        os.makedirs(os.path.join(path, 'train'), exist_ok=True)
        os.makedirs(os.path.join(path, 'test'), exist_ok=True)

def get_bbox_from_mask(mask_path):
    if not os.path.exists(mask_path):
        return None
    
    mask = cv2.imread(mask_path, 0)
    if mask is None: return None

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours: return None
    
    c = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(c)
    height, width = mask.shape
    return (x, y, w, h), (width, height)

def convert_to_yolo(bbox, img_dims):
    x, y, w, h = bbox
    img_w, img_h = img_dims
    center_x = (x + w / 2) / img_w
    center_y = (y + h / 2) / img_h
    norm_w = w / img_w
    norm_h = h / img_h
    return f"{center_x:.6f} {center_y:.6f} {norm_w:.6f} {norm_h:.6f}"

def find_file_smart(partial_path):
    """
    Usa o índice para encontrar o arquivo rapidamente, baseado na pasta UID
    que geralmente está no meio do caminho do CSV.
    """
    if pd.isna(partial_path): return None
    
    # Normaliza separadores (Windows/Linux)
    parts = partial_path.replace('\\', '/').split('/')
    
    # Tenta encontrar alguma parte do caminho que seja uma pasta conhecida no nosso índice
    # Geralmente o UID gigante é uma das pastas
    folder_path = None
    for part in parts:
        if part in DIR_INDEX:
            folder_path = DIR_INDEX[part]
            break
    
    if folder_path:
        # Se achamos a pasta, procuramos o arquivo dentro dela (ou subpastas dela)
        filename = parts[-1] # O nome do arquivo final (ex: 1-240.jpg)
        
        # Tentativa 1: Arquivo direto na pasta UID
        candidate = os.path.join(folder_path, filename)
        if os.path.exists(candidate):
            return candidate
            
        # Tentativa 2: O arquivo pode estar em uma subpasta dentro do UID
        for root, _, files in os.walk(folder_path):
            if filename in files:
                return os.path.join(root, filename)
                
    return None

def process_csv(csv_file, subset_name, abnomaly_type):
    print(f"Processando {abnomaly_type} - {subset_name}...")
    df = pd.read_csv(csv_file)
    class_id = CLASS_MAP[abnomaly_type]
    
    # Contadores para relatório
    found = 0
    missing = 0
    
    for _, row in tqdm(df.iterrows(), total=df.shape[0]):
        img_path_csv = row.get('image file path')
        mask_path_csv = row.get('ROI mask file path')
        
        # Busca inteligente usando o índice
        img_real_path = find_file_smart(img_path_csv)
        mask_real_path = find_file_smart(mask_path_csv)
        
        if not img_real_path or not mask_real_path:
            missing += 1
            continue
            
        # Calcular Bounding Box
        bbox_data = get_bbox_from_mask(mask_real_path)
        if not bbox_data:
            missing += 1
            continue
            
        bbox, (img_w, img_h) = bbox_data
        
        # Preparar dados para salvar
        yolo_line = f"{class_id} {convert_to_yolo(bbox, (img_w, img_h))}\n"
        
        # Criar nome único para o arquivo de destino
        # Usa o UID da pasta pai para garantir unicidade
        folder_uid = os.path.basename(os.path.dirname(img_real_path))
        base_filename = os.path.splitext(os.path.basename(img_real_path))[0]
        unique_name = f"{abnomaly_type}_{folder_uid}_{base_filename}"
        
        # Salvar Imagem
        dst_img = os.path.join(IMAGES_OUT, subset_name, unique_name + ".jpg")
        shutil.copy(img_real_path, dst_img)
        
        # Salvar Label
        dst_txt = os.path.join(LABELS_OUT, subset_name, unique_name + ".txt")
        with open(dst_txt, 'w') as f:
            f.write(yolo_line)
            
        found += 1
        
    print(f"  -> Encontrados: {found} | Perdidos/Erro: {missing}")

def main():
    create_dirs()
    index_directories(IMG_DIR) # Indexa antes de começar
    
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
            print(f"AVISO: Arquivo CSV não encontrado: {full_csv_path}")

if __name__ == "__main__":
    main()