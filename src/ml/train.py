import os
import tensorflow as tf
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau
from unet import unet_model
from data_loader import CBISDDSMDataGenerator

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
    y_true_f = tf.keras.backend.flatten(y_true)
    y_pred_f = tf.keras.backend.flatten(y_pred)
    intersection = tf.keras.backend.sum(y_true_f * y_pred_f)
    union = tf.keras.backend.sum(y_true_f) + tf.keras.backend.sum(y_pred_f) - intersection
    return (intersection + smooth) / (union + smooth)

def train():
    # Paths (Absolute paths preferred to avoid CWD issues)
    # Assuming script is run from project root, but let's be robust
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../'))
    csv_dir = os.path.join(base_dir, "data/CBIS-DDSM-JPG/csv")
    jpeg_dir = os.path.join(base_dir, "data/CBIS-DDSM-JPG/jpeg")
    
    print(f"CSV Dir: {csv_dir}")
    print(f"JPEG Dir: {jpeg_dir}")

    # Generators
    batch_size = 8
    
    print("Initializing Training Generator...")
    train_gen = CBISDDSMDataGenerator(
        csv_dir=csv_dir,
        jpeg_dir=jpeg_dir,
        batch_size=batch_size,
        subset='train',
        shuffle=True
    )
    
    print("Initializing Validation Generator (using test set)...")
    val_gen = CBISDDSMDataGenerator(
        csv_dir=csv_dir,
        jpeg_dir=jpeg_dir,
        batch_size=batch_size,
        subset='test',
        shuffle=False
    )
    
    print(f"Training samples: {len(train_gen) * batch_size}")
    print(f"Validation samples: {len(val_gen) * batch_size}")

    # Multi-GPU Strategy
    strategy = tf.distribute.MirroredStrategy()
    print(f"Number of devices: {strategy.num_replicas_in_sync}")

    # Scale batch size by number of GPUs
    # Note: The generator batch size is fixed at instantiation, 
    # so we might want to adjust it before creating generators if we want per-replica scaling.
    # For now, let's keep it simple, but wrapping the model is the key.

    with strategy.scope():
        # Model
        model = unet_model(input_size=(IMG_HEIGHT, IMG_WIDTH, IMG_CHANNELS))
        model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy', dice_coef, iou_coef])
    
    # Callbacks
    checkpoint_path = os.path.join(base_dir, "models/unet_mammo_best.keras")
    # Also save simple h5 for compatibility if needed, but keras format is preferred in TF 2.x
    
    callbacks = [
        ModelCheckpoint(checkpoint_path, verbose=1, save_best_only=True, monitor='val_loss'),
        EarlyStopping(patience=5, monitor='val_loss', restore_best_weights=True),
        ReduceLROnPlateau(patience=2, factor=0.1, verbose=1, monitor='val_loss')
    ]
    
    # Train
    print("Starting training...")
    history = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=50,
        callbacks=callbacks
    )
    
    final_model_path = os.path.join(base_dir, "models/unet_mammo_final.keras")
    model.save(final_model_path)
    print(f"Model saved as {final_model_path}")

if __name__ == "__main__":
    train()
