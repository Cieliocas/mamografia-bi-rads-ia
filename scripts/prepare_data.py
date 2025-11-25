import pandas as pd
import os
import cv2
import numpy as np
from tqdm import tqdm
import shutil

# ================= CONFIGURAÇÃO DE CAMINHOS =================
# Caminho raiz absoluto do seu projeto
PROJECT_ROOT = "/Users/francieliocastro/Developer/ICIT/mamografia-bi-rads-ia"

# Onde estão os dados originais (CSV e JPEG)
BASE_PATH = os.path.join(PROJECT_ROOT, "data/CBIS-DDSM-JPG")
CSV_DIR = os.path.join(BASE_PATH, "csv")
IMG_DIR = os.path.join(BASE_PATH, "jpeg")

# Onde salvar os dados processados para o YOLO
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data/yolo_dataset")
IMAGES_OUT = os.path.join(OUTPUT_DIR, "images")
LABELS_OUT = os.path.join(OUTPUT_DIR, "labels")

CLASS_MAP = {
    'Calcification': 0,
    'Mass': 1
}
# ============================================================

# Dicionário global para indexar as pastas UID
DIR_INDEX = {}

def index_directories(base_dir):
    """
    Varre a pasta de imagens UMA VEZ e cria um mapa de onde está cada pasta UID.
    Isso resolve o problema das pastas com nomes gigantes e aleatórios.
    """
    print(f"Indexando diretórios em: {base_dir} ...")
    global DIR_INDEX
    for root, dirs, files in os.walk(base_dir):
        for d in dirs:
            # Mapeia o nome da pasta (UID) para o caminho completo dela
            DIR_INDEX[d] = os.path.join(root, d)
    print(f"Indexação concluída! {len(DIR_INDEX)} pastas encontradas.")

def create_dirs():
    """Cria as pastas de destino se não existirem."""
    for path in [IMAGES_OUT, LABELS_OUT]:
        os.makedirs(os.path.join(path, 'train'), exist_ok=True)
        os.makedirs(os.path.join(path, 'test'), exist_ok=True)

def get_bbox_from_mask(mask_path):
    """Calcula o Bounding Box a partir da imagem de máscara."""
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
    """Converte bbox (pixels) para formato YOLO normalizado (0-1)."""
    x, y, w, h = bbox
    img_w, img_h = img_dims
    
    # Evita divisão por zero
    if img_w == 0 or img_h == 0: return None

    center_x = (x + w / 2) / img_w
    center_y = (y + h / 2) / img_h
    norm_w = w / img_w
    norm_h = h / img_h
    return f"{center_x:.6f} {center_y:.6f} {norm_w:.6f} {norm_h:.6f}"

def find_file_smart(partial_path):
    """
    Encontra o arquivo real usando o índice de diretórios, ignorando
    a estrutura confusa de pastas do dataset original.
    """
    if pd.isna(partial_path): return None
    
    # Normaliza separadores para evitar problemas entre Windows/Mac/Linux
    parts = partial_path.replace('\\', '/').split('/')
    
    folder_path = None
    # Procura se alguma parte do caminho é uma das pastas UID que indexamos
    for part in parts:
        if part in DIR_INDEX:
            folder_path = DIR_INDEX[part]
            break
    
    if folder_path:
        filename = parts[-1] # O nome do arquivo (ex: 1-240.jpg)
        
        # Tenta achar o arquivo direto na pasta
        candidate = os.path.join(folder_path, filename)
        if os.path.exists(candidate):
            return candidate
            
        # Se não estiver direto, procura nas subpastas do UID
        for root, _, files in os.walk(folder_path):
            if filename in files:
                return os.path.join(root, filename)
                
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
        
        # 1. Achar os arquivos reais
        img_real_path = find_file_smart(img_path_csv)
        mask_real_path = find_file_smart(mask_path_csv)
        
        if not img_real_path or not mask_real_path:
            missing += 1
            continue
            
        # 2. Calcular Bbox
        bbox_data = get_bbox_from_mask(mask_real_path)
        if not bbox_data:
            missing += 1
            continue
            
        bbox, (img_w, img_h) = bbox_data
        yolo_coords = convert_to_yolo(bbox, (img_w, img_h))
        
        if not yolo_coords:
            missing += 1
            continue

        # 3. Preparar linha do .txt
        yolo_line = f"{class_id} {yolo_coords}\n"
        
        # 4. Gerar nomes únicos para evitar sobrescrita
        folder_uid = os.path.basename(os.path.dirname(img_real_path))
        base_filename = os.path.splitext(os.path.basename(img_real_path))[0]
        unique_name = f"{abnomaly_type}_{subset_name}_{folder_uid}_{base_filename}"
        
        # 5. Copiar Imagem
        dst_img = os.path.join(IMAGES_OUT, subset_name, unique_name + ".jpg")
        shutil.copy(img_real_path, dst_img)
        
        # 6. Criar arquivo TXT
        dst_txt = os.path.join(LABELS_OUT, subset_name, unique_name + ".txt")
        with open(dst_txt, 'w') as f:
            f.write(yolo_line)
            
        found += 1
        
    print(f"Concluído: {found} processados com sucesso. {missing} erros/não encontrados.")

def main():
    # Verifica se a pasta base existe antes de começar
    if not os.path.exists(BASE_PATH):
        print(f"ERRO CRÍTICO: A pasta de dados não existe em: {BASE_PATH}")
        print("Verifique se você criou a pasta 'data/CBIS-DDSM-JPG' e colocou os arquivos lá.")
        return

    create_dirs()
    index_directories(IMG_DIR) 
    
    # Lista de tarefas (Nome do CSV, Pasta de Destino, Tipo)
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