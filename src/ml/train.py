import argparse
import json
import os
import sys
import tensorflow as tf
from tensorflow.keras.callbacks import (
    ModelCheckpoint,
    EarlyStopping,
    ReduceLROnPlateau,
    CSVLogger,
    BackupAndRestore,
)

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from src.ml.unet import unet_model
from src.ml.data_loader import CBISDDSMDataGenerator

IMG_HEIGHT = 256
IMG_WIDTH = 256
IMG_CHANNELS = 1


def dice_coef(y_true, y_pred, smooth=1):
    y_true_f = tf.keras.backend.flatten(y_true)
    y_pred_f = tf.keras.backend.flatten(y_pred)
    intersection = tf.keras.backend.sum(y_true_f * y_pred_f)
    return (2.0 * intersection + smooth) / (
        tf.keras.backend.sum(y_true_f) + tf.keras.backend.sum(y_pred_f) + smooth
    )


def iou_coef(y_true, y_pred, smooth=1):
    y_true_f = tf.keras.backend.flatten(y_true)
    y_pred_f = tf.keras.backend.flatten(y_pred)
    intersection = tf.keras.backend.sum(y_true_f * y_pred_f)
    union = tf.keras.backend.sum(y_true_f) + tf.keras.backend.sum(y_pred_f) - intersection
    return (intersection + smooth) / (union + smooth)


def parse_args():
    parser = argparse.ArgumentParser(description="Treino U-Net para mamografia (CBIS-DDSM)")
    parser.add_argument("--csv-dir", default=os.path.join(ROOT_DIR, "data/CBIS-DDSM-JPG/csv"))
    parser.add_argument("--jpeg-dir", default=os.path.join(ROOT_DIR, "data/CBIS-DDSM-JPG/jpeg"))
    parser.add_argument("--output-dir", default=os.path.join(ROOT_DIR, "models"))
    parser.add_argument("--run-name", default="default_run")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size-per-replica", type=int, default=4)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--lr-patience", type=int, default=3)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


def configure_gpus():
    gpus = tf.config.list_physical_devices("GPU")
    print(f"Visible GPUs: {len(gpus)}")
    for gpu in gpus:
        try:
            tf.config.experimental.set_memory_growth(gpu, True)
        except Exception as exc:
            print(f"Could not set memory growth for {gpu}: {exc}")
    return gpus


def save_run_metadata(run_dir, args, num_replicas):
    os.makedirs(run_dir, exist_ok=True)
    metadata_path = os.path.join(run_dir, "run_metadata.json")
    payload = {
        "run_name": args.run_name,
        "epochs": args.epochs,
        "batch_size_per_replica": args.batch_size_per_replica,
        "global_batch_size": args.batch_size_per_replica * num_replicas,
        "num_replicas": num_replicas,
        "csv_dir": args.csv_dir,
        "jpeg_dir": args.jpeg_dir,
        "resume": args.resume,
    }
    with open(metadata_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=True)
    print(f"Run metadata saved at {metadata_path}")


def train():
    args = parse_args()
    tf.keras.utils.set_random_seed(args.seed)
    configure_gpus()

    strategy = tf.distribute.MirroredStrategy()
    num_replicas = strategy.num_replicas_in_sync
    global_batch_size = args.batch_size_per_replica * num_replicas

    print(f"Training strategy: MirroredStrategy ({num_replicas} replicas)")
    print(f"CSV dir: {args.csv_dir}")
    print(f"JPEG dir: {args.jpeg_dir}")
    print(f"Global batch size: {global_batch_size}")

    run_dir = os.path.join(args.output_dir, args.run_name)
    checkpoints_dir = os.path.join(run_dir, "checkpoints")
    backup_dir = os.path.join(run_dir, "backup_state")
    os.makedirs(checkpoints_dir, exist_ok=True)
    os.makedirs(run_dir, exist_ok=True)
    save_run_metadata(run_dir, args, num_replicas)

    train_gen = CBISDDSMDataGenerator(
        csv_dir=args.csv_dir,
        jpeg_dir=args.jpeg_dir,
        batch_size=global_batch_size,
        subset="train",
        shuffle=True,
    )
    val_gen = CBISDDSMDataGenerator(
        csv_dir=args.csv_dir,
        jpeg_dir=args.jpeg_dir,
        batch_size=global_batch_size,
        subset="test",
        shuffle=False,
    )
    print(f"Training samples: {len(train_gen) * global_batch_size}")
    print(f"Validation samples: {len(val_gen) * global_batch_size}")

    with strategy.scope():
        model = unet_model(input_size=(IMG_HEIGHT, IMG_WIDTH, IMG_CHANNELS))
        model.compile(
            optimizer="adam",
            loss="binary_crossentropy",
            metrics=["accuracy", dice_coef, iou_coef],
        )

    latest_weights_path = os.path.join(checkpoints_dir, "latest.weights.h5")
    if args.resume and os.path.exists(latest_weights_path):
        print(f"Resuming weights from {latest_weights_path}")
        model.load_weights(latest_weights_path)

    callbacks = [
        BackupAndRestore(backup_dir=backup_dir),
        ModelCheckpoint(
            filepath=os.path.join(checkpoints_dir, "best.keras"),
            monitor="val_loss",
            mode="min",
            save_best_only=True,
            verbose=1,
        ),
        ModelCheckpoint(
            filepath=latest_weights_path,
            save_weights_only=True,
            save_best_only=False,
            verbose=1,
        ),
        ModelCheckpoint(
            filepath=os.path.join(checkpoints_dir, "epoch_{epoch:03d}.keras"),
            save_best_only=False,
            verbose=0,
        ),
        CSVLogger(os.path.join(run_dir, "history.csv"), append=args.resume),
        EarlyStopping(
            monitor="val_loss",
            patience=args.patience,
            restore_best_weights=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            patience=args.lr_patience,
            factor=0.2,
            min_lr=1e-7,
            verbose=1,
        ),
    ]

    print("Starting training...")
    model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=args.epochs,
        callbacks=callbacks,
    )

    final_model_path = os.path.join(run_dir, "final.keras")
    model.save(final_model_path)
    print(f"Final model saved to {final_model_path}")
    print(f"Best checkpoint path: {os.path.join(checkpoints_dir, 'best.keras')}")


if __name__ == "__main__":
    train()
