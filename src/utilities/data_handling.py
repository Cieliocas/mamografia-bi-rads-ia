import pandas as pd
import os

def load_csv_data(csv_path):
    """
    Carrega um CSV do CBIS-DDSM e limpa os nomes das colunas.
    Remove espaços extras que costumam vir nos CSVs originais.
    
    Args:
        csv_path (str): Caminho do arquivo CSV.
        
    Returns:
        pd.DataFrame: Dataframe pandas limpo.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV não encontrado: {csv_path}")
        
    df = pd.read_csv(csv_path)
    
    # Remove espaços em branco do início e fim dos nomes das colunas
    # Ex: ' image file path ' vira 'image file path'
    df.columns = [col.strip() for col in df.columns]
    
    return df

def filter_dataframe(df, column, value):
    """
    Filtra o dataframe por um valor específico em uma coluna.
    Ex: Filtrar apenas pathology='MALIGNANT'.
    """
    if column not in df.columns:
        print(f"Aviso: Coluna '{column}' não encontrada no DataFrame.")
        return df
        
    return df[df[column] == value]