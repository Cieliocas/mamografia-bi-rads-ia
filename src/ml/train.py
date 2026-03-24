import argparse
import glob
import json
import os
import sys
import numpy as np
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


def dice_loss(y_true, y_pred):
    return 1.0 - dice_coef(y_true, y_pred)


def bce_dice_loss(y_true, y_pred):
    bce = tf.keras.losses.binary_crossentropy(y_true, y_pred)
    return bce + dice_loss(y_true, y_pred)


def weighted_bce_loss(pos_weight):
    pos_weight = tf.constant(pos_weight, dtype=tf.float32)

    def _loss(y_true, y_pred):
        y_pred = tf.clip_by_value(y_pred, 1e-7, 1.0 - 1e-7)
        loss = -(
            pos_weight * y_true * tf.math.log(y_pred)
            + (1.0 - y_true) * tf.math.log(1.0 - y_pred)
        )
        return tf.reduce_mean(loss)

    return _loss


def focal_loss(alpha=0.75, gamma=2.0):
    alpha = tf.constant(alpha, dtype=tf.float32)
    gamma = tf.constant(gamma, dtype=tf.float32)

    def _loss(y_true, y_pred):
        y_pred = tf.clip_by_value(y_pred, 1e-7, 1.0 - 1e-7)
        pt = tf.where(tf.equal(y_true, 1.0), y_pred, 1.0 - y_pred)
        alpha_t = tf.where(tf.equal(y_true, 1.0), alpha, 1.0 - alpha)
        loss = -alpha_t * tf.pow(1.0 - pt, gamma) * tf.math.log(pt)
        return tf.reduce_mean(loss)

    return _loss


def weighted_bce_dice_loss(pos_weight):
    wbce = weighted_bce_loss(pos_weight)

    def _loss(y_true, y_pred):
        return wbce(y_true, y_pred) + dice_loss(y_true, y_pred)

    return _loss


def focal_dice_loss(alpha=0.75, gamma=2.0):
    fl = focal_loss(alpha=alpha, gamma=gamma)

    def _loss(y_true, y_pred):
        return fl(y_true, y_pred) + dice_loss(y_true, y_pred)

    return _loss


def tversky_loss(alpha=0.7, beta=0.3, smooth=1.0):
    alpha = tf.constant(alpha, dtype=tf.float32)
    beta = tf.constant(beta, dtype=tf.float32)
    smooth = tf.constant(smooth, dtype=tf.float32)

    def _loss(y_true, y_pred):
        y_true_f = tf.keras.backend.flatten(y_true)
        y_pred_f = tf.keras.backend.flatten(y_pred)
        tp = tf.keras.backend.sum(y_true_f * y_pred_f)
        fp = tf.keras.backend.sum((1.0 - y_true_f) * y_pred_f)
        fn = tf.keras.backend.sum(y_true_f * (1.0 - y_pred_f))
        tversky = (tp + smooth) / (tp + alpha * fp + beta * fn + smooth)
        return 1.0 - tversky

    return _loss


def iou_coef(y_true, y_pred, smooth=1):
    y_true_f = tf.keras.backend.flatten(y_true)
    y_pred_f = tf.keras.backend.flatten(y_pred)
    intersection = tf.keras.backend.sum(y_true_f * y_pred_f)
    union = tf.keras.backend.sum(y_true_f) + tf.keras.backend.sum(y_pred_f) - intersection
    return (intersection + smooth) / (union + smooth)


class PeriodicModelCheckpoint(tf.keras.callbacks.Callback):
    def __init__(self, checkpoints_dir, interval=10, keep_last=5):
        super().__init__()
        self.checkpoints_dir = checkpoints_dir
        self.interval = int(interval)
        self.keep_last = int(keep_last)

    def on_epoch_end(self, epoch, logs=None):
        current_epoch = int(epoch) + 1
        if self.interval <= 0 or current_epoch % self.interval != 0:
            return

        filepath = os.path.join(self.checkpoints_dir, f"epoch_{current_epoch:03d}.keras")
        self.model.save(filepath)
        print(f"\nSaved periodic checkpoint: {filepath}")

        if self.keep_last > 0:
            checkpoints = sorted(glob.glob(os.path.join(self.checkpoints_dir, "epoch_*.keras")))
            to_remove = len(checkpoints) - self.keep_last
            for old_checkpoint in checkpoints[: max(0, to_remove)]:
                try:
                    os.remove(old_checkpoint)
                    print(f"Removed old periodic checkpoint: {old_checkpoint}")
                except OSError as exc:
                    print(f"Could not remove {old_checkpoint}: {exc}")


def parse_args():
    parser = argparse.ArgumentParser(description="Treino U-Net para mamografia (CBIS-DDSM)")
    parser.add_argument("--csv-dir", default=os.path.join(ROOT_DIR, "data/CBIS-DDSM-JPG/csv"))
    parser.add_argument("--jpeg-dir", default=os.path.join(ROOT_DIR, "data/CBIS-DDSM-JPG/jpeg"))
    parser.add_argument("--output-dir", default=os.path.join(ROOT_DIR, "models"))
    parser.add_argument("--run-name", default="default_run")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size-per-replica", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--pos-weight", type=float, default=4.0)
    parser.add_argument("--focal-alpha", type=float, default=0.75)
    parser.add_argument("--focal-gamma", type=float, default=2.0)
    parser.add_argument(
        "--loss",
        default="weighted_bce_dice",
        choices=[
            "bce",
            "bce_dice",
            "weighted_bce",
            "weighted_bce_dice",
            "focal",
            "focal_dice",
            "focal_tversky",
        ],
        help="Função de loss para segmentação",
    )
    parser.add_argument(
        "--monitor-metric",
        default="val_dice_coef",
        choices=["val_dice_coef", "val_loss"],
        help="Métrica monitorada para checkpoint/early stop/LR scheduler",
    )
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--lr-patience", type=int, default=3)
    parser.add_argument("--epoch-checkpoint-interval", type=int, default=10)
    parser.add_argument("--keep-epoch-checkpoints", type=int, default=5)
    parser.add_argument("--rotation-range", type=float, default=20.0)
    parser.add_argument("--zoom-range", type=float, default=0.15)
    parser.add_argument("--brightness-min", type=float, default=0.9)
    parser.add_argument("--brightness-max", type=float, default=1.1)
    parser.add_argument("--hflip-prob", type=float, default=0.5)
    parser.add_argument("--vflip-prob", type=float, default=0.1)
    parser.add_argument("--augmentation", dest="augmentation", action="store_true")
    parser.add_argument("--no-augmentation", dest="augmentation", action="store_false")
    parser.set_defaults(augmentation=True)
    parser.add_argument("--clahe", dest="clahe", action="store_true")
    parser.add_argument("--no-clahe", dest="clahe", action="store_false")
    parser.set_defaults(clahe=True)
    parser.add_argument("--shuffle-train", dest="shuffle_train", action="store_true")
    parser.add_argument("--no-shuffle-train", dest="shuffle_train", action="store_false")
    parser.set_defaults(shuffle_train=True)
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
        "learning_rate": args.learning_rate,
        "pos_weight": args.pos_weight,
        "focal_alpha": args.focal_alpha,
        "focal_gamma": args.focal_gamma,
        "loss": args.loss,
        "monitor_metric": args.monitor_metric,
        "augmentation": args.augmentation,
        "clahe": args.clahe,
        "shuffle_train": args.shuffle_train,
        "rotation_range": args.rotation_range,
        "zoom_range": args.zoom_range,
        "brightness_range": [args.brightness_min, args.brightness_max],
        "hflip_prob": args.hflip_prob,
        "vflip_prob": args.vflip_prob,
        "epoch_checkpoint_interval": args.epoch_checkpoint_interval,
        "keep_epoch_checkpoints": args.keep_epoch_checkpoints,
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
    np.random.seed(args.seed)
    configure_gpus()

    tf.keras.mixed_precision.set_global_policy("mixed_float16")
    strategy = tf.distribute.MirroredStrategy()
    num_replicas = strategy.num_replicas_in_sync
    global_batch_size = args.batch_size_per_replica * num_replicas

    print(f"Training strategy: MirroredStrategy ({num_replicas} replicas)")
    print(f"CSV dir: {args.csv_dir}")
    print(f"JPEG dir: {args.jpeg_dir}")
    print(f"Global batch size: {global_batch_size}")
    print(f"Loss: {args.loss}")
    print(f"Monitor metric: {args.monitor_metric}")
    print(f"Train shuffle: {args.shuffle_train}")
    print(f"Augmentation: {args.augmentation}")
    print(f"CLAHE: {args.clahe}")
    print(f"Periodic checkpoint interval: {args.epoch_checkpoint_interval}")
    print(f"Keep periodic checkpoints: {args.keep_epoch_checkpoints}")

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
        shuffle=args.shuffle_train,
        augment=args.augmentation,
        apply_clahe=args.clahe,
        rotation_range=args.rotation_range,
        zoom_range=args.zoom_range,
        brightness_range=(args.brightness_min, args.brightness_max),
        hflip_prob=args.hflip_prob,
        vflip_prob=args.vflip_prob,
        seed=args.seed,
    )
    val_gen = CBISDDSMDataGenerator(
        csv_dir=args.csv_dir,
        jpeg_dir=args.jpeg_dir,
        batch_size=global_batch_size,
        subset="test",
        shuffle=False,
        augment=False,
        apply_clahe=args.clahe,
        seed=args.seed,
    )
    print(f"Training samples: {len(train_gen) * global_batch_size}")
    print(f"Validation samples: {len(val_gen) * global_batch_size}")

    with strategy.scope():
        model = unet_model(input_size=(IMG_HEIGHT, IMG_WIDTH, IMG_CHANNELS))
        optimizer = tf.keras.optimizers.Adam(learning_rate=args.learning_rate)
        if args.loss == "bce_dice":
            selected_loss = bce_dice_loss
        elif args.loss == "weighted_bce":
            selected_loss = weighted_bce_loss(args.pos_weight)
        elif args.loss == "weighted_bce_dice":
            selected_loss = weighted_bce_dice_loss(args.pos_weight)
        elif args.loss == "focal":
            selected_loss = focal_loss(alpha=args.focal_alpha, gamma=args.focal_gamma)
        elif args.loss == "focal_dice":
            selected_loss = focal_dice_loss(alpha=args.focal_alpha, gamma=args.focal_gamma)
        elif args.loss == "focal_tversky":
            _fl = focal_loss(alpha=args.focal_alpha, gamma=args.focal_gamma)
            _tl = tversky_loss(alpha=0.7)
            selected_loss = lambda y, p: _fl(y, p) + _tl(y, p)
        elif args.loss == "bce":
            selected_loss = "binary_crossentropy"
        else:
            raise ValueError(f"Loss desconhecida: {args.loss}")
        model.compile(
            optimizer=optimizer,
            loss=selected_loss,
            metrics=["accuracy", dice_coef, iou_coef],
        )

    latest_weights_path = os.path.join(checkpoints_dir, "latest.weights.h5")
    if args.resume and os.path.exists(latest_weights_path):
        print(f"Resuming weights from {latest_weights_path}")
        model.load_weights(latest_weights_path)

    monitor_mode = "min" if args.monitor_metric == "val_loss" else "max"

    callbacks = [
        # Nota: ao retomar com --resume, o estado recuperado por BackupAndRestore
        # pode não ser exatamente o mesmo "melhor epoch" restaurado por
        # EarlyStopping(restore_best_weights=True). Sempre conferir o best.keras.
        BackupAndRestore(backup_dir=backup_dir),
        ModelCheckpoint(
            filepath=os.path.join(checkpoints_dir, "best.keras"),
            monitor=args.monitor_metric,
            mode=monitor_mode,
            save_best_only=True,
            verbose=1,
        ),
        ModelCheckpoint(
            filepath=latest_weights_path,
            save_weights_only=True,
            save_best_only=False,
            verbose=1,
        ),
        PeriodicModelCheckpoint(
            checkpoints_dir=checkpoints_dir,
            interval=args.epoch_checkpoint_interval,
            keep_last=args.keep_epoch_checkpoints,
        ),
        CSVLogger(os.path.join(run_dir, "history.csv"), append=args.resume),
        EarlyStopping(
            monitor=args.monitor_metric,
            patience=args.patience,
            restore_best_weights=True,
            mode=monitor_mode,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor=args.monitor_metric,
            patience=args.lr_patience,
            factor=0.2,
            min_lr=1e-7,
            mode=monitor_mode,
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
