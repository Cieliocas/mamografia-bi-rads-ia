import pickle
import os

def save_pickle(obj, path):
    """Salva um objeto Python (ex: dicionário, modelo) em arquivo."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        pickle.dump(obj, f)

def load_pickle(path):
    """Carrega um objeto Python de um arquivo."""
    with open(path, 'rb') as f:
        return pickle.load(f)