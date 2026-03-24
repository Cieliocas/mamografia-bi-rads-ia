import os
import numpy as np
import cv2

try:
    import tensorflow as tf
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("TensorFlow not available. Model will not be loaded.")

# Parameters matching training
IMG_HEIGHT = 256
IMG_WIDTH = 256

class MammographyModel:
    def __init__(self, model_path='models/unet_mammo_best.keras'):
        self.model = None
        self.model_path = model_path
        self.is_dummy = False
        if TF_AVAILABLE:
            self.load_model()
        else:
            print("TensorFlow not available, model will not be loaded.")
            self.is_dummy = True

    def load_model(self):
        if not TF_AVAILABLE:
            return
        
        if os.path.exists(self.model_path):
            try:
                # Custom objects needed for loading model with custom metrics
                self.model = tf.keras.models.load_model(
                    self.model_path, 
                    compile=False 
                )
                print(f"Model loaded from {self.model_path}")
            except Exception as e:
                print(f"Error loading model from {self.model_path}: {e}. Prediction will use dummy data.")
                self.is_dummy = True
        else:
            print(f"Model file not found at {self.model_path}. Prediction will use dummy data.")
            self.is_dummy = True

    def preprocess(self, image_path):
        """
        Reads image, resizes, handles grayscale/color, and normalizes.
        """
        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"Could not read image at {image_path}")
        
        original_shape = img.shape
        img_resized = cv2.resize(img, (IMG_WIDTH, IMG_HEIGHT))
        img_normalized = img_resized / 255.0
        img_input = np.expand_dims(img_normalized, axis=(0, -1)) # Add batch and channel dims
        
        return img_input, original_shape

    def predict(self, image_path):
        """
        Returns:
            mask: Binary mask resized to original image shape
            bi_rads: Estimated BI-RADS category
        """
        img_input, original_shape = self.preprocess(image_path)
        
        if self.is_dummy:
            # Generate a synthetic mask (a white circle in the center)
            pred_mask = np.zeros((IMG_HEIGHT, IMG_WIDTH), dtype=np.uint8)
            cv2.circle(pred_mask, (IMG_WIDTH//2, IMG_HEIGHT//2), IMG_WIDTH//4, 1, -1)
            bi_rads = "BI-RADS 0: Mock Data (Testing)"
            print("Generating dummy mask for UI testing...")
        else:
            pred_mask = self.model.predict(img_input)
            pred_mask = (pred_mask > 0.5).astype(np.uint8)[0, :, :, 0] # Threshold
            bi_rads = "Unknown" # Will be estimated below if not overwritten

        # Resize mask back to original size
        mask_resized = cv2.resize(pred_mask, (original_shape[1], original_shape[0]), interpolation=cv2.INTER_NEAREST)
        
        if not self.is_dummy:
             bi_rads = self.estimate_bi_rads(mask_resized)
        
        return mask_resized, bi_rads

    def estimate_bi_rads(self, mask):
        """
        Simple heuristic to estimate BI-RADS based on lesion area.
        In a real scenario, this would be a separate classification model.
        """
        area = np.sum(mask)
        total_pixels = mask.shape[0] * mask.shape[1]
        ratio = area / total_pixels
        
        if ratio == 0:
            return "BI-RADS 1: Negative"
        elif ratio < 0.01:
            return "BI-RADS 2: Benign"
        elif ratio < 0.05:
            return "BI-RADS 3: Probably Benign"
        elif ratio < 0.10:
            return "BI-RADS 4: Suspicious"
        else:
            return "BI-RADS 5: Highly Suspicious"

if __name__ == "__main__":
    # Test
    import sys
    if len(sys.argv) > 1:
        predictor = MammographyModel()
        mask, advice = predictor.predict(sys.argv[1])
        print(f"Prediction complete. Classification: {advice}")
