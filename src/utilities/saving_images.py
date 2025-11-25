import cv2
import os

def save_image(img, path, quality=95):
    """
    Salva uma imagem no disco, criando o diretório pai se não existir.
    
    Args:
        img (numpy array): Imagem a ser salva.
        path (str): Caminho completo de destino (ex: data/output/img.jpg).
        quality (int): Qualidade da compressão JPG (0-100).
        
    Returns:
        bool: True se salvou com sucesso, False caso contrário.
    """
    # Cria diretórios necessários (ex: se path é 'a/b/c.jpg', cria 'a/b')
    directory = os.path.dirname(path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
    
    # Configura parâmetros de qualidade para JPG
    params = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    
    try:
        success = cv2.imwrite(path, img, params)
        if not success:
            print(f"Aviso: cv2.imwrite retornou False para '{path}'")
        return success
    except Exception as e:
        print(f"Erro ao salvar imagem em '{path}': {e}")
        return False