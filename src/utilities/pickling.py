import pickle
import os

def save_pickle(obj, path):
    """
    Salva qualquer objeto Python (listas, dicionários, modelos) em um arquivo .pkl ou .p
    
    Args:
        obj: O objeto a ser salvo.
        path (str): Caminho de destino.
    """
    directory = os.path.dirname(path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
        
    with open(path, 'wb') as f:
        pickle.dump(obj, f)
    print(f"Objeto salvo em: {path}")

def load_pickle(path):
    """
    Carrega um objeto Python de um arquivo .pkl ou .p
    
    Args:
        path (str): Caminho do arquivo.
        
    Returns:
        O objeto carregado.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Arquivo pickle não encontrado: {path}")
        
    with open(path, 'rb') as f:
        obj = pickle.load(f)
    return obj