import os
import glob
import numpy as np
import pandas as pd
import tensorflow as tf
import cv2

class CBISDDSMDataGenerator(tf.keras.utils.Sequence):
    def __init__(
        self,
        csv_dir,
        jpeg_dir,
        batch_size=8,
        img_size=(256, 256),
        subset="train",
        shuffle=True,
        augment=False,
        apply_clahe=False,
        rotation_range=20.0,
        zoom_range=0.15,
        brightness_range=(0.9, 1.1),
        hflip_prob=0.5,
        vflip_prob=0.1,
        seed=None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.csv_dir = csv_dir
        self.jpeg_dir = jpeg_dir
        self.batch_size = batch_size
        self.img_size = img_size
        self.subset = subset
        self.shuffle = shuffle
        self.augment = augment and subset == "train"
        self.apply_clahe = apply_clahe
        self.rotation_range = float(rotation_range)
        self.zoom_range = float(zoom_range)
        self.brightness_range = brightness_range
        self.hflip_prob = float(hflip_prob)
        self.vflip_prob = float(vflip_prob)
        self.rng = np.random.default_rng(seed)

        # Load metadata
        self.data_df = self._load_metadata()
        self.indices = np.arange(len(self.data_df), dtype=np.int32)

        if self.shuffle:
            self.rng.shuffle(self.indices)

    def _load_metadata(self):
        """Loads and merges mass/calc extraction metadata."""
        dfs = []

        # Mapping for subsets
        if self.subset == "train":
            files = [
                "mass_case_description_train_set.csv",
                "calc_case_description_train_set.csv",
            ]
        elif self.subset == "test":
            files = [
                "mass_case_description_test_set.csv",
                "calc_case_description_test_set.csv",
            ]
        else:
            raise ValueError(f"Unknown subset: {self.subset}")

        for f in files:
            path = os.path.join(self.csv_dir, f)
            if os.path.exists(path):
                df = pd.read_csv(path)
                dfs.append(df)

        if not dfs:
            raise ValueError("No CSV files found!")

        full_df = pd.concat(dfs, ignore_index=True)

        valid_rows = []
        for idx, row in full_df.iterrows():
            img_path_raw = row["image file path"]
            mask_path_raw = row["ROI mask file path"]

            img_uid = img_path_raw.split("/")[-2]
            mask_uid = mask_path_raw.split("/")[-2]

            img_real_path = self._find_file(img_uid)
            mask_real_path = self._find_file(mask_uid)

            if img_real_path and mask_real_path:
                valid_rows.append({
                    "image_path": img_real_path,
                    "mask_path": mask_real_path,
                    "pathology": row["pathology"],
                    "assessment": row["assessment"],
                })

            if idx % 100 == 0:
                print(f"Processed {idx}/{len(full_df)} rows...", end="\r")

        print(f"Loaded {len(valid_rows)} valid pairs for subset {self.subset}")
        return pd.DataFrame(valid_rows)

    def _find_file(self, uid):
        """Finds the first .jpg file in the directory usually named by UID."""
        search_path = os.path.join(self.jpeg_dir, uid, "*.jpg")
        files = glob.glob(search_path)
        if files:
            return files[0]
        return None

    def _read_grayscale(self, path):
        return cv2.imread(path, cv2.IMREAD_GRAYSCALE)

    def _apply_clahe_filter(self, image):
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        return clahe.apply(image)

    def _apply_augmentation(self, image, mask):
        h, w = image.shape[:2]
        angle = self.rng.uniform(-self.rotation_range, self.rotation_range)
        scale = self.rng.uniform(1.0 - self.zoom_range, 1.0 + self.zoom_range)
        matrix = cv2.getRotationMatrix2D((w * 0.5, h * 0.5), angle, scale)

        image = cv2.warpAffine(
            image,
            matrix,
            (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REFLECT_101,
        )
        mask = cv2.warpAffine(
            mask,
            matrix,
            (w, h),
            flags=cv2.INTER_NEAREST,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0,
        )

        if self.rng.random() < self.hflip_prob:
            image = cv2.flip(image, 1)
            mask = cv2.flip(mask, 1)

        if self.rng.random() < self.vflip_prob:
            image = cv2.flip(image, 0)
            mask = cv2.flip(mask, 0)

        brightness_factor = self.rng.uniform(
            float(self.brightness_range[0]), float(self.brightness_range[1])
        )
        image = np.clip(image.astype(np.float32) * brightness_factor, 0, 255).astype(np.uint8)
        return image, mask

    def _prepare_image(self, image):
        image = cv2.resize(image, self.img_size, interpolation=cv2.INTER_LINEAR)
        image = image.astype(np.float32) / 255.0
        return np.expand_dims(image, axis=-1)

    def _prepare_mask(self, mask):
        mask = cv2.resize(mask, self.img_size, interpolation=cv2.INTER_NEAREST)
        mask = (mask > 127).astype(np.float32)
        return np.expand_dims(mask, axis=-1)

    def __len__(self):
        return int(np.floor(len(self.data_df) / self.batch_size))

    def __getitem__(self, index):
        indices = self.indices[index * self.batch_size:(index + 1) * self.batch_size]
        batch_rows = self.data_df.iloc[indices]

        X = np.empty((self.batch_size, *self.img_size, 1), dtype=np.float32)
        y = np.empty((self.batch_size, *self.img_size, 1), dtype=np.float32)

        for i, (_, row) in enumerate(batch_rows.iterrows()):
            img = self._read_grayscale(row["image_path"])
            mask = self._read_grayscale(row["mask_path"])

            if img is None or mask is None:
                X[i,] = np.zeros((*self.img_size, 1), dtype=np.float32)
                y[i,] = np.zeros((*self.img_size, 1), dtype=np.float32)
                continue

            if mask.shape != img.shape:
                mask = cv2.resize(mask, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)

            if self.augment:
                img, mask = self._apply_augmentation(img, mask)

            if self.apply_clahe:
                img = self._apply_clahe_filter(img)

            X[i,] = self._prepare_image(img)
            y[i,] = self._prepare_mask(mask)

        return X, y

    def on_epoch_end(self):
        if self.shuffle:
            self.rng.shuffle(self.indices)
