import numpy as np
import tensorflow as tf
import cv2

# Parameters matching training
IMG_HEIGHT = 256
IMG_WIDTH = 256

class MammographyModel:
    def __init__(self, model_path='unet_mammo.h5'):
        self.model = None
        self.model_path = model_path
        self.load_model()

    def load_model(self):
        try:
            # Custom objects needed for loading model with custom metrics
            self.model = tf.keras.models.load_model(
                self.model_path, 
                compile=False # data loader / custom metrics might cause issues on load if not careful, safe to skip compile for inference
            )
            print(f"Model loaded from {self.model_path}")
        except Exception as e:
            print(f"Could not load model: {e}. Using dummy model for demonstration.")
            from unet import unet_model
            self.model = unet_model((IMG_HEIGHT, IMG_WIDTH, 1))

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
        
        pred_mask = self.model.predict(img_input)
        pred_mask = (pred_mask > 0.5).astype(np.uint8)[0, :, :, 0] # Threshold
        
        # Resize mask back to original size
        mask_resized = cv2.resize(pred_mask, (original_shape[1], original_shape[0]), interpolation=cv2.INTER_NEAREST)
        
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
