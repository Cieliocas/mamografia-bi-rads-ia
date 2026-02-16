import os
import numpy as np
import tensorflow as tf
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau
from sklearn.model_selection import train_test_split
from unet import unet_model
import cv2  # For image loading
import glob

# Data Loading Constants
IMG_HEIGHT = 256
IMG_WIDTH = 256
IMG_CHANNELS = 1

def dice_coef(y_true, y_pred, smooth=1):
    y_true_f = tf.keras.backend.flatten(y_true)
    y_pred_f = tf.keras.backend.flatten(y_pred)
    intersection = tf.keras.backend.sum(y_true_f * y_pred_f)
    return (2. * intersection + smooth) / (tf.keras.backend.sum(y_true_f) + tf.keras.backend.sum(y_pred_f) + smooth)

def iou_coef(y_true, y_pred, smooth=1):
    intersection = tf.keras.backend.sum(tf.keras.backend.abs(y_true * y_pred), axis=[1,2,3])
    union = tf.keras.backend.sum(y_true,[1,2,3]) + tf.keras.backend.sum(y_pred,[1,2,3]) - intersection
    iou = tf.keras.backend.mean((intersection + smooth) / (union + smooth), axis=0)
    return iou

def load_data(image_path, mask_path):
    """
    Placeholder function to load data. 
    Assumes images and masks are in separate directories with matching filenames.
    """
    images = []
    masks = []
    
    image_files = sorted(glob.glob(os.path.join(image_path, "*.png"))) # Adjust extension as needed
    mask_files = sorted(glob.glob(os.path.join(mask_path, "*.png"))) # Adjust extension as needed

    print(f"Found {len(image_files)} images and {len(mask_files)} masks.")

    for img_file, mask_file in zip(image_files, mask_files):
        img = cv2.imread(img_file, cv2.IMREAD_GRAYSCALE)
        mask = cv2.imread(mask_file, cv2.IMREAD_GRAYSCALE)
        
        if img is not None and mask is not None:
            img = cv2.resize(img, (IMG_WIDTH, IMG_HEIGHT))
            mask = cv2.resize(mask, (IMG_WIDTH, IMG_HEIGHT))
            
            img = img / 255.0  # Normalize
            mask = mask / 255.0 # Normalize (binary 0 or 1)
            mask[mask > 0.5] = 1
            mask[mask <= 0.5] = 0
            
            images.append(img)
            masks.append(mask)

    if not images:
        print("No data found. Generating dummy data for demonstration.")
        return generate_dummy_data()

    images = np.array(images).reshape(-1, IMG_HEIGHT, IMG_WIDTH, 1)
    masks = np.array(masks).reshape(-1, IMG_HEIGHT, IMG_WIDTH, 1)
    
    return images, masks

def generate_dummy_data(num_samples=10):
    images = np.random.rand(num_samples, IMG_HEIGHT, IMG_WIDTH, 1).astype(np.float32)
    masks = np.random.randint(0, 2, size=(num_samples, IMG_HEIGHT, IMG_WIDTH, 1)).astype(np.float32)
    return images, masks

def train():
    # Paths - Update these with actual data paths
    image_dir = "../../data/train/images" 
    mask_dir = "../../data/train/masks"

    # Load Data
    X, Y = load_data(image_dir, mask_dir)
    
    X_train, X_val, Y_train, Y_val = train_test_split(X, Y, test_size=0.1, random_state=42)
    
    print(f"Training with {X_train.shape[0]} samples, Validation with {X_val.shape[0]} samples")

    # Model
    model = unet_model(input_size=(IMG_HEIGHT, IMG_WIDTH, IMG_CHANNELS))
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy', dice_coef, iou_coef])
    
    # Callbacks
    checkpoint_path = "model_checkpoint.h5"
    callbacks = [
        ModelCheckpoint(checkpoint_path, verbose=1, save_best_only=True),
        EarlyStopping(patience=5, monitor='val_loss'),
        ReduceLROnPlateau(patience=3, factor=0.1, verbose=1)
    ]
    
    # Train
    history = model.fit(
        X_train, Y_train,
        validation_data=(X_val, Y_val),
        batch_size=16,
        epochs=50,
        callbacks=callbacks
    )
    
    model.save("unet_mammo.h5")
    print("Model saved as unet_mammo.h5")

if __name__ == "__main__":
    train()
